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
  removalIndex,
  searchable,
  type MetadataFinding,
  type OffsetPatch,
  type ParsedMedia,
  type Removal,
  type RemovalIndex,
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

/** Top-level boxes a legacy QuickTime movie can start with when it has no `ftyp`. */
const LEGACY_FIRST_BOXES = new Set(['moov', 'mdat', 'free', 'wide', 'skip', 'pnot']);

export function detectVideoFormat(bytes: Uint8Array): VideoFormat | null {
  if (isoImageBrand(bytes)) return null;
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (brand === 'qt  ') return 'mov';
    if (brand === 'M4A ' || brand === 'M4B ' || brand === 'M4P ') return 'm4a';
    return 'mp4';
  }
  // QuickTime movies written before the file type box existed open with a movie or media box.
  return startsWithLegacyMovieBox(bytes) ? 'mov' : null;
}

/**
 * Whether the file opens with a well-formed top-level movie box. The size field
 * has to add up and the type has to be one a movie starts with, so a few bytes
 * that happen to spell `moov` are not enough.
 */
function startsWithLegacyMovieBox(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  try {
    const box = readBox(bytes, 0, bytes.length);
    return box.end - box.start >= 8 && LEGACY_FIRST_BOXES.has(box.type);
  } catch {
    return false;
  }
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
  /** Where the length field sits. Width 0 means the box runs to the end of the file. */
  sizeAt: number;
  sizeWidth: 4 | 8 | 0;
}

function readBox(bytes: Uint8Array, at: number, limit: number): Box {
  if (at + 8 > limit) throw truncated();
  let size = readU32BE(bytes, at);
  const type = ascii(bytes, at + 4, 4);
  let payloadStart = at + 8;
  let sizeAt = at;
  let sizeWidth: 4 | 8 | 0 = 4;
  if (size === 1) {
    // The real length follows the type, in 64 bits.
    if (at + 16 > limit) throw truncated();
    size = readU64BE(bytes, at + 8);
    payloadStart = at + 16;
    sizeAt = at + 8;
    sizeWidth = 8;
  } else if (size === 0) {
    // The box runs to the end of the file.
    size = limit - at;
    sizeWidth = 0;
  }
  if (size < payloadStart - at || at + size > limit) throw truncated();
  return { start: at, end: at + size, type, payloadStart, sizeAt, sizeWidth };
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
  warnings: string[];
  /** Set when a box with its own offset table we do not rewrite is found. */
  indexed: string[];
  /** Start of the `moof` being walked, and the base its track runs measure from. */
  moofStart: number;
  trafBase: number;
}

function enterContainer(walk: Walk, box: Box): void {
  walk.containers.push({
    at: box.sizeAt,
    start: box.start,
    end: box.end,
    width: box.sizeWidth,
  });
}

function keep(walk: Walk, label: string): void {
  if (!walk.kept.includes(label)) walk.kept.push(label);
}

/**
 * Leaves a `uuid` box of a kind we do not know where it is. A marker inside it
 * is reported, because the cleaner cannot tell whether the box is metadata.
 */
function keepUnknownUuid(walk: Walk, box: Box, bytes: Uint8Array): void {
  keep(walk, 'unknown uuid box');
  const signals = findSignals(searchable(bytes.subarray(box.payloadStart, box.end)));
  if (signals.length > 0)
    walk.warnings.push(
      `An unknown uuid box was left in place, and it mentions ${signals.join(', ')}.`
    );
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

  // Only a JUMBF container, recognised by its signature or by one of the two
  // payload UUIDs, is a metadata box we know how to cut. An unknown vendor box
  // that merely mentions a marker stays where it is.
  if (uuid === C2PA_UUID || ascii(payload, 0, 4) === 'jumb') {
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
  return null;
}

/** The chunk offset tables and fragment base offsets that point into the file. */
function recordOffsets(block: Box, bytes: Uint8Array, walk: Walk): void {
  const width = block.type === 'co64' ? 8 : 4;
  if (block.payloadStart + 8 > block.end) throw truncated();
  const tableStart = block.payloadStart + 8;
  const count = readU32BE(bytes, block.payloadStart + 4);
  if (tableStart + count * width > block.end) throw truncated();
  for (let index = 0; index < count; index++) {
    const at = tableStart + index * width;
    const target = width === 4 ? readU32BE(bytes, at) : readU64BE(bytes, at);
    walk.offsets.push({ at, target, width: width as 4 | 8 });
  }
  keep(walk, 'sample tables');
}

/** The random access index of a fragmented file stores absolute fragment offsets too. */
function recordRandomAccess(block: Box, bytes: Uint8Array, walk: Walk): void {
  if (block.payloadStart + 16 > block.end) throw truncated();
  const width = bytes[block.payloadStart] === 1 ? 8 : 4;
  // The low six bits of this field give the byte width of the three trail fields each entry may carry.
  const sizes = readU32BE(bytes, block.payloadStart + 8);
  const extra = ((sizes >> 4) & 3) + ((sizes >> 2) & 3) + (sizes & 3);
  const count = readU32BE(bytes, block.payloadStart + 12);
  const entrySize = width * 2 + extra;
  const tableStart = block.payloadStart + 16;
  if (tableStart + count * entrySize > block.end) {
    // A table whose size does not add up is not one we can follow.
    walk.indexed.push('tfra');
    return;
  }
  for (let index = 0; index < count; index++) {
    const at = tableStart + index * entrySize + width;
    const target = width === 4 ? readU32BE(bytes, at) : readU64BE(bytes, at);
    walk.offsets.push({ at, target, width: width as 4 | 8 });
  }
  keep(walk, 'random access index');
}

/** Where a track fragment measures its sample offsets from: an explicit offset, or the start of the moof. */
function fragmentBase(block: Box, bytes: Uint8Array, walk: Walk): number {
  const flags = readU32BE(bytes, block.payloadStart) & 0xffffff;
  if (flags & 0x000001 && block.payloadStart + 16 <= block.end) {
    const at = block.payloadStart + 8;
    const target = readU64BE(bytes, at);
    walk.offsets.push({ at, target, width: 8 });
    return target;
  }
  return walk.moofStart;
}

/**
 * Records the sample offset of a track run. With `default-base-is-moof` it is a
 * distance from the start of the fragment, so it only needs the two ends moved:
 * the fragment start and the sample it points at.
 */
function recordRunOffsets(block: Box, bytes: Uint8Array, walk: Walk): void {
  const flags = readU32BE(bytes, block.payloadStart) & 0xffffff;
  if (!(flags & 0x000001) || block.payloadStart + 12 > block.end) return;
  const base = walk.trafBase >= 0 ? walk.trafBase : walk.moofStart;
  if (base < 0) return;
  const at = block.payloadStart + 8;
  const offset = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(at);
  const target = base + offset;
  if (target < 0) {
    walk.indexed.push('trun');
    return;
  }
  walk.offsets.push({ at, target, base, width: 4 });
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
      else keepUnknownUuid(walk, box, bytes);
    } else if (box.type === 'stco' || box.type === 'co64') {
      recordOffsets(box, bytes, walk);
    } else if (box.type === 'tfra') {
      recordRandomAccess(box, bytes, walk);
    } else if (box.type === 'tfhd') {
      walk.trafBase = fragmentBase(box, bytes, walk);
    } else if (box.type === 'trun') {
      recordRunOffsets(box, bytes, walk);
    } else if (box.type === 'saio' || box.type === 'saiz') {
      // Auxiliary information for encrypted tracks; its offsets are tied to the data in ways we do not rewrite.
      walk.indexed.push(box.type);
    } else if (box.type === 'sidx') {
      walk.indexed.push(box.type);
    } else if (box.type === 'traf') {
      enterContainer(walk, box);
      const parentBase = walk.trafBase;
      // -1 means "not stated yet"; the fragment header states it, and the moof start is the default.
      walk.trafBase = -1;
      walkBoxes(bytes, box, boxPath, walk);
      walk.trafBase = parentBase;
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
  tfra: 'random access index',
  trun: 'sample offset it cannot follow',
};

export function parseVideo(bytes: Uint8Array): ParsedMedia {
  const format = detectVideoFormat(bytes);
  if (!format)
    throw new MetadataParseError('This is not an MP4, MOV or M4A file, so it was left unchanged.');

  const walk: Walk = {
    removals: [],
    offsets: [],
    containers: [],
    kept: [],
    warnings: [],
    indexed: [],
    moofStart: -1,
    trafBase: -1,
  };
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
      else keepUnknownUuid(walk, box, bytes);
    } else if (box.type === 'sidx') {
      walk.indexed.push(box.type);
    } else if (box.type === 'mfra') {
      enterContainer(walk, box);
      walkBoxes(bytes, box, 'mfra', walk);
    } else if (box.type === 'moof') {
      walk.moofStart = box.start;
      walk.trafBase = -1;
      enterContainer(walk, box);
      walkBoxes(bytes, box, 'moof', walk);
      walk.moofStart = -1;
      walk.trafBase = -1;
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
    warnings: walk.warnings,
    finalise: (output) => {
      const index = removalIndex(walk.removals);
      return (
        applyOffsetPatches(output, index, walk.offsets) &&
        applyContainerSizes(output, index, walk.containers)
      );
    },
  };
}

/** Shortens the length fields of the containers the removed boxes were cut out of. */
function applyContainerSizes(
  output: Uint8Array,
  index: RemovalIndex,
  containers: readonly { at: number; start: number; end: number; width: 4 | 8 | 0 }[]
): boolean {
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  for (const container of containers) {
    if (container.width === 0) continue;
    // Only the removals inside the box count; its own header is not part of the payload.
    const inside = index.within(container.start + 8, container.end);
    if (inside === 0) continue;
    const at = container.at - index.shift(container.at);
    if (at < 0 || at + container.width > output.length) return false;
    if (container.width === 4) view.setUint32(at, view.getUint32(at) - inside);
    else view.setBigUint64(at, view.getBigUint64(at) - BigInt(inside));
  }
  return true;
}
