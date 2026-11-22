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
  /** The value it holds in the original file. */
  value: number;
  width: 4 | 8;
}

export interface ParsedMedia {
  format: string;
  removals: Removal[];
  kept: string[];
  warnings: string[];
  /** Fix-ups the container needs once the removals are cut, for example a rewritten length field. */
  finalise?: (output: Uint8Array) => void;
}

/** Thrown by a format parser for input it will not touch. The message is shown to the user. */
export class MetadataParseError extends Error {}

// Signals

const SIGNAL_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /compositeWithTrainedAlgorithmicMedia/i,
    'DigitalSourceType: compositeWithTrainedAlgorithmicMedia',
  ],
  [/trainedAlgorithmicMedia/i, 'DigitalSourceType: trainedAlgorithmicMedia'],
  [/algorithmicMedia/i, 'DigitalSourceType: algorithmicMedia'],
  [/c2pa/i, 'C2PA'],
  [/contentauth|contentcredentials/i, 'Content Authenticity'],
  [/midjourney/i, 'Midjourney'],
  [/dall[-_ ]?e/i, 'DALL-E'],
  [/openai/i, 'OpenAI'],
  [/stable[-_ ]?diffusion/i, 'Stable Diffusion'],
  [/\bsdxl\b/i, 'SDXL'],
  [/comfy-?ui/i, 'ComfyUI'],
  [/firefly/i, 'Adobe Firefly'],
  [/invoke-?ai/i, 'InvokeAI'],
  [/novel-?ai/i, 'NovelAI'],
  [/synthid/i, 'SynthID'],
  [/\bSteps: \d+, Sampler: /, 'Stable Diffusion parameters'],
  [/\bsuno\b/i, 'Suno'],
  [/\budio\b/i, 'Udio'],
  [/elevenlabs/i, 'ElevenLabs'],
  [/google (?:veo|imagen|gemini)/i, 'Google Veo / Imagen'],
  [/©xyz/, 'GPS location (©xyz)'],
];

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');

/** The bytes as text to search. UTF-16 text (EXIF UserComment, ID3) is also searched with its zero bytes dropped. */
export function searchable(bytes: Uint8Array): string {
  const text = latin1.decode(bytes);
  return text.includes('\0') ? `${text}\n${text.replace(/\0/g, '')}` : text;
}

export function findSignals(haystack: string): string[] {
  const found: string[] = [];
  for (const [pattern, label] of SIGNAL_PATTERNS) {
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

/** How many bytes the removals take out of everything that sits at or after `offset`. */
export function removedBytesBefore(offset: number, removals: readonly Removal[]): number {
  let total = 0;
  for (const removal of removals) if (removal.end <= offset) total += removal.end - removal.start;
  return total;
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
 * Moves the absolute offsets a container stores for its own media data, so a
 * file whose blocks were cut still plays: the field itself slides forward by
 * what was removed in front of it, and the offset it holds shrinks by what was
 * removed in front of the data it points at.
 */
export function applyOffsetPatches(
  output: Uint8Array,
  removals: readonly Removal[],
  patches: readonly OffsetPatch[]
): void {
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  for (const patch of patches) {
    const at = patch.at - removedBytesBefore(patch.at, removals);
    const value = patch.value - removedBytesBefore(patch.value, removals);
    if (at < 0 || at + patch.width > output.length || value < 0) continue;
    if (patch.width === 4) view.setUint32(at, value);
    else view.setBigUint64(at, BigInt(value));
  }
}
