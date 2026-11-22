/**
 * Audio half of the metadata cleaner: MP3, FLAC and WAV, the formats the
 * speech and music generators hand out.
 *
 * Nothing is decoded or re-encoded. MP3 tags are cut off the front and the
 * back, FLAC metadata blocks and WAV chunks are left out, and every audio byte
 * is copied as it was, so the sound stays identical.
 *
 * Pure functions, no DOM: they run in Node as well as in the browser.
 */

import {
  MetadataParseError,
  ascii,
  findSignals,
  latin1Text,
  preview,
  removalIndex,
  searchable,
  startsWithText,
  utf8Text,
  type MetadataFinding,
  type ParsedMedia,
  type Removal,
} from './metadata-core';

export type AudioFormat = 'mp3' | 'flac' | 'wav';

const truncated = () =>
  new MetadataParseError('The file is cut short or damaged, so it was left unchanged.');

const readU32BE = (bytes: Uint8Array, at: number): number =>
  ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
const readU32LE = (bytes: Uint8Array, at: number): number =>
  (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
const readU24BE = (bytes: Uint8Array, at: number): number =>
  (bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2];

const isMpegSync = (bytes: Uint8Array, at: number): boolean =>
  bytes[at] === 0xff && (bytes[at + 1] & 0xe0) === 0xe0;

// MPEG audio frames

/** Bitrates in kbit/s, indexed by the four header bits, for each layer and version. */
const BITRATES_V1: Record<number, readonly number[]> = {
  1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
};
const BITRATES_V2: Record<number, readonly number[]> = {
  1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
/** Sample rates by version bits: 3 is MPEG-1, 2 is MPEG-2, 0 is MPEG-2.5. */
const SAMPLE_RATES: Record<number, readonly number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

/**
 * The length of the MPEG audio frame whose header starts at `at`, or 0 when
 * there is no valid header there. Nothing is decoded: the header fields and the
 * frame length are enough to know a whole frame fits.
 */
function mpegFrameLength(bytes: Uint8Array, at: number): number {
  if (at + 4 > bytes.length || !isMpegSync(bytes, at)) return 0;
  const version = (bytes[at + 1] >> 3) & 0x03;
  const layer = (bytes[at + 1] >> 1) & 0x03;
  const bitrateIndex = (bytes[at + 2] >> 4) & 0x0f;
  const sampleRateIndex = (bytes[at + 2] >> 2) & 0x03;
  const padding = (bytes[at + 2] >> 1) & 0x01;
  // A reserved version, layer 0, a free or bad bitrate and a reserved rate are all invalid.
  if (version === 1 || layer === 0) return 0;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return 0;

  const bitrate = (version === 3 ? BITRATES_V1 : BITRATES_V2)[layer][bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[version][sampleRateIndex];
  if (layer === 1) return Math.floor((12 * bitrate) / sampleRate + padding) * 4;
  const samplesPerFrame = layer === 3 && version !== 3 ? 576 : 1152;
  return Math.floor(((samplesPerFrame / 8) * bitrate) / sampleRate) + padding;
}

// ID3v2

interface Id3Tag {
  /** The whole tag, header, body and footer. */
  total: number;
  major: number;
  flags: number;
  /** Body size from the header, footer not included. */
  size: number;
}

/** An ID3v2 tag at `at`, or null when there is none or the header does not add up. */
function readId3v2(bytes: Uint8Array, at: number): Id3Tag | null {
  if (at + 10 > bytes.length) return null;
  if (ascii(bytes, at, 3) !== 'ID3') return null;
  const major = bytes[at + 3];
  if (major < 2 || major > 4) return null;
  const flags = bytes[at + 5];
  // The four size bytes are syncsafe: their top bit is always clear.
  if ((bytes[at + 6] | bytes[at + 7] | bytes[at + 8] | bytes[at + 9]) & 0x80) return null;
  const size = (bytes[at + 6] << 21) | (bytes[at + 7] << 14) | (bytes[at + 8] << 7) | bytes[at + 9];
  // A v2.4 footer is not counted in the size.
  const footer = major === 4 && (flags & 0x10) !== 0 ? 10 : 0;
  const total = 10 + size + footer;
  if (at + total > bytes.length) return null;
  return { total, major, flags, size };
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const decoder = new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be');
  let start = 0;
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) start = 2;
  else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) start = 2;
  return decoder.decode(bytes.subarray(start));
}

/** The readable text of a text, comment or lyrics frame, decoded by its encoding selector. */
function decodeFrameText(body: Uint8Array): string {
  if (body.length === 0) return '';
  const encoding = body[0];
  const rest = body.subarray(1);
  if (encoding === 0) return latin1Text(rest);
  if (encoding === 2) return decodeUtf16(rest, false);
  // Selector 1 is UTF-16 with a byte order mark, which decides the order. Writers that skip the mark mean little endian.
  if (encoding === 1) {
    const bigEndian = rest.length >= 2 && rest[0] === 0xfe && rest[1] === 0xff;
    return decodeUtf16(rest, !bigEndian);
  }
  return utf8Text(rest);
}

interface Id3Frames {
  ids: string[];
  /** The text of the first readable frame, for the preview. */
  text: string;
  signals: string[];
}

function readId3Frames(payload: Uint8Array, major: number): Id3Frames {
  const ids: string[] = [];
  let text = '';
  const headerSize = major === 2 ? 6 : 10;
  let position = 0;

  while (position + headerSize <= payload.length) {
    if (payload[position] === 0) break;
    const id = ascii(payload, position, major === 2 ? 3 : 4);
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    const size =
      major === 2
        ? readU24BE(payload, position + 3)
        : major === 4
          ? ((payload[position + 4] << 21) |
              (payload[position + 5] << 14) |
              (payload[position + 6] << 7) |
              payload[position + 7]) >>>
            0
          : readU32BE(payload, position + 4);
    const body = position + headerSize;
    if (body + size > payload.length) break;
    ids.push(id);
    if (text === '' && /^(T|COMM|USLT|WXXX)/.test(id)) {
      text = decodeFrameText(payload.subarray(body, body + size))
        .replace(/\0/g, ' ')
        .trim();
    }
    position = body + size;
  }

  return { ids, text, signals: findSignals(searchable(payload)) };
}

function id3Finding(bytes: Uint8Array, tag: Id3Tag, at: number): MetadataFinding {
  const footer = tag.total - tag.size - 10;
  const payload = bytes.subarray(at + 10, at + tag.total - footer);
  const frames = readId3Frames(payload, tag.major);
  const listed = frames.ids.slice(0, 6).join(', ');
  const more = frames.ids.length > 6 ? ', …' : '';
  return {
    category: 'Audio tags',
    location: `ID3v2.${tag.major} tag${frames.ids.length > 0 ? ` (${listed}${more})` : ''}`,
    size: tag.total,
    signals: frames.signals,
    preview: frames.text ? preview(frames.text) : undefined,
  };
}

// MP3 trailers

interface Trailer {
  /** Bytes at the end of the file. */
  total: number;
  finding: MetadataFinding;
}

function readTrailer(bytes: Uint8Array, floor: number, end: number): Trailer | null {
  const available = end - floor;

  if (available >= 128 && ascii(bytes, end - 128, 3) === 'TAG') {
    const payload = bytes.subarray(end - 128, end);
    return {
      total: 128,
      finding: {
        category: 'Audio tags',
        location: 'ID3v1 tag',
        size: 128,
        signals: findSignals(searchable(payload)),
        preview: preview(latin1Text(payload.subarray(3))),
      },
    };
  }

  if (available >= 32 && ascii(bytes, end - 32, 8) === 'APETAGEX') {
    const size = readU32LE(bytes, end - 32 + 12);
    const flags = readU32LE(bytes, end - 32 + 20);
    // Bit 31 says a tag header sits in front of the items, outside the counted size.
    const total = size + (flags & 0x80000000 ? 32 : 0);
    if (size < 32 || total > available) return null;
    const payload = bytes.subarray(end - total, end);
    return {
      total,
      finding: {
        category: 'Audio tags',
        location: 'APEv2 tag',
        size: total,
        signals: findSignals(searchable(payload)),
      },
    };
  }

  if (available >= 15 && ascii(bytes, end - 9, 9) === 'LYRICS200') {
    const digits = ascii(bytes, end - 15, 6);
    if (!/^\d{6}$/.test(digits)) return null;
    const total = 15 + Number(digits);
    if (total > available || ascii(bytes, end - total, 11) !== 'LYRICSBEGIN') return null;
    return {
      total,
      finding: {
        category: 'Audio tags',
        location: 'Lyrics3 v2 tag',
        size: total,
        signals: findSignals(searchable(bytes.subarray(end - total, end))),
      },
    };
  }

  return null;
}

// Formats

/** Where the FLAC stream starts, allowing for an ID3v2 tag in front of it. */
function flacStart(bytes: Uint8Array): number | null {
  if (startsWithText(bytes, 'fLaC')) return 0;
  const id3 = readId3v2(bytes, 0);
  if (id3 && ascii(bytes, id3.total, 4) === 'fLaC') return id3.total;
  return null;
}

export function detectAudioFormat(bytes: Uint8Array): AudioFormat | null {
  if (flacStart(bytes) !== null) return 'flac';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE')
    return 'wav';
  if (readId3v2(bytes, 0) || isMpegSync(bytes, 0)) return 'mp3';
  return null;
}

export function parseAudio(bytes: Uint8Array): ParsedMedia {
  if (flacStart(bytes) !== null) return parseFlac(bytes);
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF') return parseWav(bytes);
  return parseMp3(bytes);
}

// MP3

function parseMp3(bytes: Uint8Array): ParsedMedia {
  const removals: Removal[] = [];
  let position = 0;

  for (;;) {
    const tag = readId3v2(bytes, position);
    if (!tag) break;
    removals.push({
      start: position,
      end: position + tag.total,
      finding: id3Finding(bytes, tag, position),
    });
    position += tag.total;
  }

  let end = bytes.length;
  for (;;) {
    const trailer = readTrailer(bytes, position, end);
    if (!trailer) break;
    removals.push({ start: end - trailer.total, end, finding: trailer.finding });
    end -= trailer.total;
  }

  const audio = bytes.subarray(position, end);
  if (audio.length === 0)
    throw new MetadataParseError('The file holds no audio frames, so it was left unchanged.');
  const frameLength = mpegFrameLength(bytes, position);
  if (frameLength === 0)
    throw new MetadataParseError(
      'No MPEG audio frame follows the tags, so this is not an MP3 and it was left unchanged.'
    );
  if (position + frameLength > end)
    throw new MetadataParseError(
      'The MPEG audio frame after the tags is cut short, so the file was left unchanged.'
    );

  // The trailers are found from the end backwards; the cutter needs them in file order.
  removals.sort((a, b) => a.start - b.start);
  return {
    format: 'mp3',
    removals,
    kept: ['MPEG audio frames'],
    warnings: [],
  };
}

// FLAC

interface FlacBlock {
  start: number;
  end: number;
  type: number;
  last: boolean;
}

const FLAC_BLOCK_NAMES: Record<number, string> = {
  0: 'STREAMINFO',
  1: 'padding',
  2: 'application data',
  3: 'SEEKTABLE',
  4: 'Vorbis comment',
  5: 'CUESHEET',
  6: 'picture',
};

/** The vendor string and the first tags of a Vorbis comment block. */
function vorbisPreview(payload: Uint8Array): string | undefined {
  if (payload.length < 8) return undefined;
  const vendorLength = readU32LE(payload, 0);
  if (vendorLength > payload.length - 4) return undefined;
  // Vorbis comments are UTF-8, vendor and fields alike.
  const vendor = utf8Text(payload.subarray(4, 4 + vendorLength));
  let at = 4 + vendorLength + 4;
  const count = readU32LE(payload, 4 + vendorLength);
  const comments: string[] = [];
  for (let index = 0; index < Math.min(count, 8) && at + 4 <= payload.length; index++) {
    const length = readU32LE(payload, at);
    at += 4;
    if (at + length > payload.length) break;
    comments.push(utf8Text(payload.subarray(at, at + length)));
    at += length;
  }
  const text = [`vendor ${vendor}`, ...comments].join('; ');
  return text ? preview(text) : undefined;
}

function flacFinding(block: FlacBlock, payload: Uint8Array): MetadataFinding {
  const kind = FLAC_BLOCK_NAMES[block.type] ?? `type ${block.type}`;
  return {
    category: 'Audio tags',
    location: `FLAC ${kind} block`,
    size: block.end - block.start,
    signals: findSignals(searchable(payload)),
    preview: block.type === 4 ? vorbisPreview(payload) : undefined,
  };
}

function parseFlac(bytes: Uint8Array): ParsedMedia {
  const removals: Removal[] = [];
  const kept: string[] = [];
  const retained: FlacBlock[] = [];

  const id3 = readId3v2(bytes, 0);
  let position = 0;
  if (id3) {
    removals.push({ start: 0, end: id3.total, finding: id3Finding(bytes, id3, 0) });
    position = id3.total;
  }

  if (ascii(bytes, position, 4) !== 'fLaC')
    throw new MetadataParseError('This is not a FLAC file, so it was left unchanged.');
  position += 4;

  const blocks: FlacBlock[] = [];
  for (;;) {
    if (position + 4 > bytes.length) throw truncated();
    const header = bytes[position];
    const length = readU24BE(bytes, position + 1);
    const end = position + 4 + length;
    if (end > bytes.length) throw truncated();
    const block = { start: position, end, type: header & 0x7f, last: (header & 0x80) !== 0 };
    blocks.push(block);
    position = end;
    if (block.last) break;
  }

  if (blocks[0]?.type !== 0)
    throw new MetadataParseError(
      'The FLAC file does not start with its STREAMINFO block, so it was left unchanged.'
    );
  if (position >= bytes.length)
    throw new MetadataParseError('The FLAC file holds no audio frames, so it was left unchanged.');

  for (const block of blocks) {
    const payload = bytes.subarray(block.start + 4, block.end);
    // A Vorbis comment or a picture is always metadata; an application block only when it names a generator.
    const removable =
      block.type === 4 ||
      block.type === 6 ||
      (block.type === 2 && findSignals(searchable(payload)).length > 0);
    if (removable)
      removals.push({ start: block.start, end: block.end, finding: flacFinding(block, payload) });
    else {
      const name = FLAC_BLOCK_NAMES[block.type] ?? `type ${block.type}`;
      if (!kept.includes(name)) kept.push(name);
      retained.push(block);
    }
  }

  return {
    format: 'flac',
    removals,
    kept,
    warnings: [],
    finalise: (output) => moveLastFlacBlockFlag(output, retained, removals),
  };
}

/**
 * Moves the last-metadata-block flag onto the new final metadata block after
 * blocks were cut, which is what tells a decoder where the audio frames start.
 * The blocks are the ones the parse kept, so the audio is never read as a
 * metadata header.
 */
function moveLastFlacBlockFlag(
  output: Uint8Array,
  retained: readonly FlacBlock[],
  removals: readonly Removal[]
): boolean {
  if (retained.length === 0) return false;
  const index = removalIndex(removals);
  for (const block of retained) {
    const header = block.start - index.shift(block.start);
    if (header < 0 || header >= output.length) return false;
    output[header] &= 0x7f;
  }
  const last = retained[retained.length - 1].start;
  output[last - index.shift(last)] |= 0x80;
  return true;
}

// WAV

const WAV_REMOVABLE = new Set(['id3 ', 'ID3 ', 'bext', 'iXML', 'axml', 'xmp ', '_PMX']);

const WAV_NAMES: Record<string, string> = {
  'id3 ': 'ID3 chunk',
  'ID3 ': 'ID3 chunk',
  bext: 'bext chunk (broadcast metadata)',
  iXML: 'iXML chunk',
  axml: 'axml chunk (XMP)',
  'xmp ': 'XMP chunk',
  _PMX: 'Adobe XMP chunk',
};

function parseWav(bytes: Uint8Array): ParsedMedia {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE')
    throw new MetadataParseError(
      'This is not a RIFF/WAVE file, so it was left unchanged. RF64 is not supported.'
    );

  const removals: Removal[] = [];
  const kept: string[] = [];
  let position = 12;
  let sawFormat = false;
  let sawData = false;

  while (position + 8 <= bytes.length) {
    const type = ascii(bytes, position, 4);
    const length = readU32LE(bytes, position + 4);
    const payloadStart = position + 8;
    let payloadEnd = payloadStart + length;
    if (payloadEnd > bytes.length) {
      // 0 and 0xFFFFFFFF are the sizes a writer uses when the length is not known yet.
      const unknownLength = length === 0 || length === 0xffffffff;
      if (!unknownLength) throw truncated();
      payloadEnd = bytes.length;
    }

    if (type === 'ds64')
      throw new MetadataParseError(
        'The file uses 64-bit RF64 sizes, which this tool does not rewrite, so it was left unchanged.'
      );

    // A LIST chunk is only tags when its list type says so: `INFO` is tags, `wavl` is audio.
    const listType = type === 'LIST' ? ascii(bytes, payloadStart, 4) : '';
    const removable = type === 'LIST' ? listType === 'INFO' : WAV_REMOVABLE.has(type);

    if (removable) {
      const payload = bytes.subarray(payloadStart, payloadEnd);
      const xmp = type === 'axml' || type === 'xmp ' || type === '_PMX';
      const end = Math.min(payloadEnd + (length & 1), bytes.length);
      removals.push({
        start: position,
        end,
        finding: {
          category: xmp ? 'XMP' : 'Audio tags',
          location: `WAV ${type === 'LIST' ? 'LIST chunk (INFO tags)' : (WAV_NAMES[type] ?? `${type} chunk`)}`,
          size: end - position,
          signals: findSignals(searchable(payload)),
          preview: type === 'LIST' ? preview(latin1Text(payload)) : undefined,
        },
      });
    } else {
      if (type === 'fmt ') sawFormat = true;
      if (type === 'data') sawData = true;
      // A wave list carries the samples in alternating data chunks instead of a top-level one.
      if (type === 'LIST' && listType === 'wavl') sawData = true;
      const label = type === 'LIST' ? 'LIST chunk' : `${type.trim()} chunk`;
      if (!kept.includes(label)) kept.push(label);
    }

    position = payloadEnd + (length & 1);
    if (payloadEnd === bytes.length) break;
  }

  if (!sawFormat || !sawData)
    throw new MetadataParseError(
      'The WAV file has no format or audio chunk, so it was left unchanged.'
    );

  return { format: 'wav', removals, kept, warnings: [], finalise: finaliseWav };
}

/** Rewrites the RIFF size after chunks were cut. */
function finaliseWav(output: Uint8Array): boolean {
  if (output.length < 8) return false;
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  view.setUint32(4, output.length - 8, true);
  return true;
}
