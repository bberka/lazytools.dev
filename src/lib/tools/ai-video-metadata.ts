/**
 * Video half of the metadata cleaner: MP4, MOV and M4A, the ISO base media
 * file format the video and music generators export.
 *
 * Nothing is decoded or re-encoded. The metadata boxes (`udta`, `meta`, the
 * C2PA and XMP `uuid` boxes) are left out, the sample tables that point at the
 * media data are moved with it, and every other byte is copied as it was.
 *
 * Pure functions, no DOM: they run in Node as well as in the browser.
 */

import {
  MetadataParseError,
  applyOffsetPatches,
  ascii,
  distinct,
  findSignals,
  preview,
  removedBytesBefore,
  searchable,
  type MetadataFinding,
  type OffsetPatch,
  type ParsedMedia,
  type Removal,
} from './metadata-core';

export type VideoFormat = 'mp4' | 'mov' | 'm4a';

const truncated = () =>
  new MetadataParseError('The file is cut short or damaged, so it was left unchanged.');

const readU32BE = (bytes: Uint8Array, at: number): number =>
  ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

const readU64BE = (bytes: Uint8Array, at: number): number =>
  readU32BE(bytes, at) * 0x100000000 + readU32BE(bytes, at + 4);

const hexAt = (bytes: Uint8Array, at: number, length: number): string => {
  let text = '';
  for (let index = at; index < at + length; index++) {
    text += (bytes[index] ?? 0).toString(16).padStart(2, '0');
  }
  return text;
};

// JUMBF in a `uuid` box: the C2PA manifest and the Adobe XMP packet.
const C2PA_UUID = 'd8fec3d61b0e483c92975828877ec481';
const XMP_UUID = 'be7acfcb97a942e89c71999491e3afac';

/** Brands that are ISO base media files but not video or audio containers. */
const IMAGE_BRANDS = new Set(['avif', 'avis', 'heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);

export function detectVideoFormat(bytes: Uint8Array): VideoFormat | null {
  if (isoImageBrand(bytes)) return null;
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== 'ftyp') return null;
  const brand = ascii(bytes, 8, 4);
  if (brand === 'qt  ') return 'mov';
  if (brand === 'M4A ' || brand === 'M4B ' || brand === 'M4P ') return 'm4a';
  return 'mp4';
}

/** The brand of an ISO base media file that holds an image rather than video or audio. */
export function isoImageBrand(bytes: Uint8Array): string | null {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== 'ftyp') return null;
  const brand = ascii(bytes, 8, 4);
  return IMAGE_BRANDS.has(brand) ? brand : null;
}

interface Box {
  start: number;
  end: number;
  type: string;
  /** First byte after the box header. */
  payloadStart: number;
  /** Width of the length field, or 0 when the box runs to the end of the file. */
  sizeWidth: 4 | 8 | 0;
}

function readBox(bytes: Uint8Array, at: number, limit: number): Box {
  if (at + 8 > limit) throw truncated();
  let size = readU32BE(bytes, at);
  const type = ascii(bytes, at + 4, 4);
  let payloadStart = at + 8;
  let sizeWidth: 4 | 8 | 0 = 4;
  if (size === 1) {
    if (at + 16 > limit) throw truncated();
    size = readU64BE(bytes, at + 8);
    payloadStart = at + 16;
    sizeWidth = 8;
  } else if (size === 0) {
    // The box runs to the end of the file.
    size = limit - at;
    sizeWidth = 0;
  }
  if (size < payloadStart - at || at + size > limit) throw truncated();
  return { start: at, end: at + size, type, payloadStart, sizeWidth };
}

/** Boxes whose children carry metadata or sample tables worth walking through. */
const CONTAINERS = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'moof',
  'traf',
  'mvex',
  'edts',
]);

interface Walk {
  removals: Removal[];
  offsets: OffsetPatch[];
  /** Length fields of the boxes the removals sit in, which have to shrink with them. */
  containers: { at: number; start: number; end: number; width: 4 | 8 | 0 }[];
  kept: string[];
  /** Set when a box with its own absolute offset table is found. */
  indexed: string[];
}

function enterContainer(walk: Walk, box: Box): void {
  walk.containers.push({
    at: box.start,
    start: box.start,
    end: box.end,
    width: box.sizeWidth,
  });
}

function keep(walk: Walk, label: string): void {
  if (!walk.kept.includes(label)) walk.kept.push(label);
}

/** Records a `udta`, `meta` or `XMP_` box as a removal, labelled with where it sits. */
function removeUserData(walk: Walk, box: Box, bytes: Uint8Array, path: string): void {
  walk.removals.push({
    start: box.start,
    end: box.end,
    finding: userDataFinding(
      box,
      `${box.type === 'udta' ? 'user data' : 'metadata'} box (${path})`,
      bytes.subarray(box.payloadStart, box.end)
    ),
  });
}

function userDataFinding(box: Box, location: string, payload: Uint8Array): MetadataFinding {
  const text = searchable(payload);
  return {
    category: 'Video metadata',
    location,
    size: box.end - box.start,
    signals: findSignals(text),
    preview: readablePreview(text),
  };
}

/** The start of a text block, when the block is mostly text rather than cover art or a manifest. */
function readablePreview(text: string): string | undefined {
  const sample = text.slice(0, 2048);
  let printable = 0;
  for (const char of sample) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code !== 0x7f) || code === 0x09 || code === 0x0a || code === 0x0d)
      printable += 1;
  }
  return printable / Math.max(sample.length, 1) >= 0.9 ? preview(text) : undefined;
}

function uuidFinding(box: Box, bytes: Uint8Array): MetadataFinding | null {
  if (box.end - box.payloadStart < 16) return null;
  const uuid = hexAt(bytes, box.payloadStart, 16);
  const payload = bytes.subarray(box.payloadStart + 16, box.end);
  const size = box.end - box.start;
  const text = searchable(payload);
  const signals = findSignals(text);

  if (uuid === C2PA_UUID || ascii(payload, 0, 4) === 'jumb' || /jumbf|c2pa/i.test(text)) {
    return {
      category: 'Content Credentials (C2PA)',
      location: 'uuid box (C2PA manifest)',
      size,
      signals: distinct(['C2PA', ...signals]),
    };
  }
  if (uuid === XMP_UUID) {
    return { category: 'XMP', location: 'uuid box (XMP)', size, signals };
  }
  if (signals.length > 0) {
    return { category: 'Video metadata', location: 'uuid box', size, signals };
  }
  return null;
}

/** The chunk offset tables and fragment base offsets that point into the file. */
function recordOffsets(block: Box, bytes: Uint8Array, walk: Walk): void {
  const width = block.type === 'co64' ? 8 : 4;
  if (block.payloadStart + 8 > block.end) throw truncated();
  const tableStart = block.payloadStart + 8;
  if (tableStart > block.end) throw truncated();
  const count = readU32BE(bytes, block.payloadStart + 4);
  if (tableStart + count * width > block.end) throw truncated();
  for (let index = 0; index < count; index++) {
    const at = tableStart + index * width;
    const value = width === 4 ? readU32BE(bytes, at) : readU64BE(bytes, at);
    walk.offsets.push({ at, value, width: width as 4 | 8 });
  }
  keep(walk, 'sample tables');
}

function walkBoxes(bytes: Uint8Array, parent: Box, path: string, walk: Walk): void {
  let position = parent.payloadStart;
  while (position + 8 <= parent.end) {
    const box = readBox(bytes, position, parent.end);
    const boxPath = `${path}.${box.type}`;

    if (box.type === 'udta' || box.type === 'meta' || box.type === 'XMP_') {
      removeUserData(walk, box, bytes, boxPath);
    } else if (box.type === 'uuid') {
      const finding = uuidFinding(box, bytes);
      if (finding) walk.removals.push({ start: box.start, end: box.end, finding });
      else keep(walk, 'unknown uuid box');
    } else if (box.type === 'stco' || box.type === 'co64') {
      recordOffsets(box, bytes, walk);
    } else if (box.type === 'saio' || box.type === 'saiz') {
      // Auxiliary information for encrypted tracks; its offsets are tied to the data in ways we do not rewrite.
      walk.indexed.push(box.type);
    } else if (box.type === 'tfhd') {
      // A fragment header may carry an absolute base data offset.
      const flags = readU32BE(bytes, box.payloadStart) & 0xffffff;
      if (flags & 0x000001 && box.payloadStart + 16 <= box.end) {
        const at = box.payloadStart + 8;
        walk.offsets.push({ at, value: readU64BE(bytes, at), width: 8 });
      }
    } else if (box.type === 'sidx') {
      walk.indexed.push(box.type);
    } else if (CONTAINERS.has(box.type)) {
      enterContainer(walk, box);
      walkBoxes(bytes, box, boxPath, walk);
    } else if (box.type === 'mdat') {
      keep(walk, 'media data');
    }
    position = box.end;
  }
  if (position !== parent.end) throw truncated();
}

const INDEX_NAMES: Record<string, string> = {
  sidx: 'segment index',
  saio: 'auxiliary information offset table',
  saiz: 'auxiliary information size table',
};

export function parseVideo(bytes: Uint8Array): ParsedMedia {
  const format = detectVideoFormat(bytes);
  if (!format)
    throw new MetadataParseError('This is not an MP4, MOV or M4A file, so it was left unchanged.');

  const walk: Walk = { removals: [], offsets: [], containers: [], kept: [], indexed: [] };
  let position = 0;
  let sawMoov = false;
  let sawMdat = false;

  while (position < bytes.length) {
    const box = readBox(bytes, position, bytes.length);
    if (box.type === 'moov') {
      sawMoov = true;
      enterContainer(walk, box);
      walkBoxes(bytes, box, 'moov', walk);
    } else if (box.type === 'mdat') {
      sawMdat = true;
      keep(walk, 'media data');
    } else if (box.type === 'meta' || box.type === 'XMP_' || box.type === 'udta') {
      removeUserData(walk, box, bytes, box.type);
    } else if (box.type === 'uuid') {
      const finding = uuidFinding(box, bytes);
      if (finding) walk.removals.push({ start: box.start, end: box.end, finding });
    } else if (box.type === 'sidx') {
      walk.indexed.push(box.type);
    } else if (box.type === 'mfra') {
      enterContainer(walk, box);
      walkBoxes(bytes, box, 'mfra', walk);
    } else if (box.type === 'moof') {
      enterContainer(walk, box);
      walkBoxes(bytes, box, 'moof', walk);
    } else if (box.type === 'ftyp') {
      keep(walk, 'file type');
    }
    position = box.end;
  }

  if (!sawMoov)
    throw new MetadataParseError('The MP4 has no movie header, so it was left unchanged.');
  if (!sawMdat)
    throw new MetadataParseError('The MP4 has no media data, so it was left unchanged.');

  if (walk.indexed.length > 0)
    throw new MetadataParseError(
      `The file carries a ${INDEX_NAMES[walk.indexed[0]] ?? walk.indexed[0]} that points at the media data by absolute offset, which this tool does not rewrite, so it was left unchanged.`
    );

  walk.removals.sort((a, b) => a.start - b.start);
  return {
    format,
    removals: walk.removals,
    kept: walk.kept,
    warnings: [],
    finalise: (output) => {
      if (walk.offsets.length > 0) applyOffsetPatches(output, walk.removals, walk.offsets);
      applyContainerSizes(output, walk.containers, walk.removals);
    },
  };
}

/** Shortens the length fields of the containers the removed boxes were cut out of. */
function applyContainerSizes(
  output: Uint8Array,
  containers: readonly { at: number; start: number; end: number; width: 4 | 8 | 0 }[],
  removals: readonly Removal[]
): void {
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  for (const container of containers) {
    if (container.width === 0) continue;
    let inside = 0;
    for (const removal of removals) {
      if (removal.start >= container.start && removal.end <= container.end)
        inside += removal.end - removal.start;
    }
    if (inside === 0) continue;
    const at = container.at - removedBytesBefore(container.at, removals);
    if (container.width === 4) {
      if (at + 4 > output.length) continue;
      view.setUint32(at, view.getUint32(at) - inside);
    } else {
      if (at + 8 > output.length) continue;
      view.setBigUint64(at, view.getBigUint64(at) - BigInt(inside));
    }
  }
}
