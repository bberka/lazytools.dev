/**
 * The pieces every metadata cleaner in this folder shares: the shape of one
 * finding, the table of provenance and generation markers, the byte helpers
 * that read and cut a file, and the error each format parser throws.
 *
 * The cleaners work on the container, never on the pixels or the audio: they
 * find the blocks that carry metadata, leave them out, and copy every other
 * byte as it was.
 *
 * Pure functions, no DOM: they run in Node as well as in the browser.
 */

export type FindingCategory =
  | 'Content Credentials (C2PA)'
  | 'Generation prompt/parameters'
  | 'EXIF'
  | 'XMP'
  | 'IPTC / Photoshop'
  | 'Comment'
  | 'Text metadata'
  | 'Video metadata'
  | 'Audio tags';

export interface MetadataFinding {
  category: FindingCategory;
  /** Where it sits, for example `JPEG APP1` or `MP4 moov.udta`. */
  location: string;
  /** Size of the block in the file, header included. */
  size: number;
  /** Recognised AI and provenance markers found inside the block. */
  signals: string[];
  /** The start of the text, for text blocks. */
  preview?: string;
}

export interface Removal {
  start: number;
  end: number;
  finding: MetadataFinding;
}

/** An absolute file offset stored inside a box that has to follow the bytes it points at. */
export interface OffsetPatch {
  /** Where the field sits in the original file. */
  at: number;
  /** The absolute position the field points at in the original file. */
  target: number;
  /** For a relative offset, the position it is measured from. */
  base?: number;
  width: 4 | 8;
}

export interface ParsedMedia {
  format: string;
  removals: Removal[];
  kept: string[];
  warnings: string[];
  /**
   * Fix-ups the container needs once the removals are cut, for example a
   * rewritten length field. Returns false when it cannot be done safely, and
   * the cleaner then hands the original file back.
   */
  finalise?: (output: Uint8Array) => boolean;
}

/** Thrown by a format parser for input it will not touch. The message is shown to the user. */
export class MetadataParseError extends Error {}

// Signals

const SIGNAL_PATTERNS: ReadonlyArray<readonly [RegExp, string, boolean]> = [
  [
    /compositeWithTrainedAlgorithmicMedia/i,
    'DigitalSourceType: compositeWithTrainedAlgorithmicMedia',
    false,
  ],
  [/trainedAlgorithmicMedia/i, 'DigitalSourceType: trainedAlgorithmicMedia', false],
  [/algorithmicMedia/i, 'DigitalSourceType: algorithmicMedia', false],
  [/c2pa/i, 'C2PA', false],
  [/contentauth|contentcredentials/i, 'Content Authenticity', false],
  [/midjourney/i, 'Midjourney', false],
  [/dall[-_ ]?e/i, 'DALL-E', false],
  [/openai/i, 'OpenAI', false],
  [/stable[-_ ]?diffusion/i, 'Stable Diffusion', false],
  [/\bsdxl\b/i, 'SDXL', false],
  [/comfy-?ui/i, 'ComfyUI', false],
  [/firefly/i, 'Adobe Firefly', false],
  [/invoke-?ai/i, 'InvokeAI', false],
  [/novel-?ai/i, 'NovelAI', false],
  [/synthid/i, 'SynthID', false],
  [/\bSteps: \d+, Sampler: /, 'Stable Diffusion parameters', false],
  // Audio and video generators, plus the QuickTime GPS atom. The image matcher
  // never knew these, and a PNG caption mentioning one of them is not a
  // generation prompt, so only the media paths search for them.
  [/\bsuno\b/i, 'Suno', true],
  [/\budio\b/i, 'Udio', true],
  [/elevenlabs/i, 'ElevenLabs', true],
  [/google (?:veo|imagen|gemini)/i, 'Google Veo / Imagen', true],
  [/©xyz/, 'GPS location (©xyz)', true],
];

/** Which marker set to search for: the image one, or the image one plus the audio and video additions. */
export type SignalScope = 'image' | 'media';

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');

/** The bytes as text to search. UTF-16 text (EXIF UserComment, ID3) is also searched with its zero bytes dropped. */
export function searchable(bytes: Uint8Array): string {
  const text = latin1.decode(bytes);
  return text.includes('\0') ? `${text}\n${text.replace(/\0/g, '')}` : text;
}

export function findSignals(haystack: string, scope: SignalScope = 'media'): string[] {
  const found: string[] = [];
  for (const [pattern, label, mediaOnly] of SIGNAL_PATTERNS) {
    if (mediaOnly && scope === 'image') continue;
    if (!pattern.test(haystack)) continue;
    // The DigitalSourceType patterns overlap; the first, most specific one wins.
    if (
      label.startsWith('DigitalSourceType') &&
      found.some((item) => item.startsWith('DigitalSourceType'))
    )
      continue;
    found.push(label);
  }
  return found;
}

/** The marker set the image cleaner has always used, without the audio and video additions. */
export const findImageSignals = (haystack: string): string[] => findSignals(haystack, 'image');

export function preview(text: string): string {
  // oxlint-disable-next-line no-control-regex -- control characters are what is collapsed to spaces
  const flat = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}

export const distinct = (items: readonly string[]): string[] => [...new Set(items)];

export const ascii = (bytes: Uint8Array, start: number, length: number): string => {
  let text = '';
  for (let index = start; index < start + length && index < bytes.length; index++) {
    text += String.fromCharCode(bytes[index]);
  }
  return text;
};

export const startsWithText = (bytes: Uint8Array, text: string): boolean =>
  ascii(bytes, 0, text.length) === text;

/** Decodes UTF-8 text, falling back to the bytes read one by one when they are not valid UTF-8. */
export const utf8Text = (bytes: Uint8Array): string => utf8.decode(bytes);
export const latin1Text = (bytes: Uint8Array): string => latin1.decode(bytes);

// Cutting

/**
 * Where every removal sits, computed once: a file with thousands of removable
 * boxes and a chunk table of the same size would otherwise rescan the removal
 * list for every single offset.
 */
export interface RemovalIndex {
  /** How many bytes the removals take out of everything that sits at or after `offset`. */
  shift(offset: number): number;
  /** How many bytes the removals take out of the range `start` to `end`. */
  within(start: number, end: number): number;
}

/** `removals` must be sorted by start and must not overlap. */
export function removalIndex(removals: readonly Removal[]): RemovalIndex {
  // Sorted and non-overlapping, so the ends and the running totals both ascend.
  const ends = removals.map((removal) => removal.end);
  const starts = removals.map((removal) => removal.start);
  const before: number[] = [0];
  for (const removal of removals)
    before.push(before[before.length - 1] + (removal.end - removal.start));

  /** Index of the first removal whose value is >= `offset`. */
  const firstAtLeast = (values: readonly number[], offset: number): number => {
    let low = 0;
    let high = values.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (values[middle] < offset) low = middle + 1;
      else high = middle;
    }
    return low;
  };

  return {
    shift: (offset) => before[firstAtLeast(ends, offset + 1)],
    within: (start, end) => {
      let total = 0;
      for (let index = firstAtLeast(starts, start); index < removals.length; index++) {
        if (removals[index].end > end) break;
        total += removals[index].end - removals[index].start;
      }
      return total;
    },
  };
}

/** The file without the removals, which must be sorted and must not overlap. */
export function cutRemovals(bytes: Uint8Array, removals: readonly Removal[]): Uint8Array {
  const removed = removals.reduce((sum, removal) => sum + (removal.end - removal.start), 0);
  const output = new Uint8Array(bytes.length - removed);
  let read = 0;
  let write = 0;
  for (const removal of removals) {
    output.set(bytes.subarray(read, removal.start), write);
    write += removal.start - read;
    read = removal.end;
  }
  output.set(bytes.subarray(read), write);
  return output;
}

/**
 * Moves the offsets a container stores for its own media data, so a file whose
 * blocks were cut still plays: the field itself slides forward by what was
 * removed in front of it, and the offset it holds shrinks by what was removed
 * in front of the data it points at. An absolute offset is a position in the
 * file; a relative one is a distance from `base`, which is often the start of
 * the enclosing fragment.
 */
export function applyOffsetPatches(
  output: Uint8Array,
  index: RemovalIndex,
  patches: readonly OffsetPatch[]
): boolean {
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  for (const patch of patches) {
    const at = patch.at - index.shift(patch.at);
    const relativeBase = patch.base === undefined ? 0 : patch.base - index.shift(patch.base);
    const value = patch.target - index.shift(patch.target) - relativeBase;
    // An absolute offset is a position, so it cannot be negative; a relative one is a distance.
    if (at < 0 || at + patch.width > output.length) return false;
    if (patch.base === undefined && value < 0) return false;
    if (patch.width === 8) view.setBigInt64(at, BigInt(value));
    else if (patch.base === undefined) view.setUint32(at, value);
    else view.setInt32(at, value);
  }
  return true;
}
