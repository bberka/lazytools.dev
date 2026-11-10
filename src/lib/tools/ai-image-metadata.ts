/**
 * Image half of the AI Metadata Cleaner: finds the provenance and generation
 * metadata inside a JPEG, PNG or WebP file and cuts it out at the byte level.
 *
 * Nothing is decoded or re-encoded. The file is walked segment by segment
 * (JPEG), chunk by chunk (PNG) or RIFF chunk by RIFF chunk (WebP), the blocks
 * that carry metadata are left out, and every other byte is copied as it was,
 * so the pixels, the colour profile and everything needed to decode stay.
 *
 * Input that is not a well-formed file of one of the three formats, or that is
 * cut short, is never changed: the result hands the same bytes back with a
 * message. After cutting, the output is scanned again and must report nothing.
 *
 * Pure functions, no DOM: they run in Node as well as in the browser.
 */

export type ImageFormat = 'jpeg' | 'png' | 'webp';

export const IMAGE_MIME_TYPES: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export type FindingCategory =
  | 'Content Credentials (C2PA)'
  | 'Generation prompt/parameters'
  | 'EXIF'
  | 'XMP'
  | 'IPTC / Photoshop'
  | 'Comment'
  | 'Text metadata';

export interface MetadataFinding {
  category: FindingCategory;
  /** Where it sits, for example `JPEG APP1` or `PNG tEXt "parameters"`. */
  location: string;
  /** Size of the block in the file, header included. */
  size: number;
  /** Recognised AI and provenance markers found inside the block. */
  signals: string[];
  /** The start of the text, for text blocks. */
  preview?: string;
}

export interface ImageScan {
  format: ImageFormat | null;
  findings: MetadataFinding[];
  /** Every distinct signal across the findings. */
  signals: string[];
  /** Blocks that were deliberately left alone, for example the colour profile. */
  kept: string[];
  warnings: string[];
  /** Set when the bytes are not a complete, well-formed file. */
  error?: string;
}

export interface StripResult {
  format: ImageFormat | null;
  /** The cleaned file, or the input itself when nothing was removed or the input is damaged. */
  bytes: Uint8Array;
  changed: boolean;
  removed: MetadataFinding[];
  signals: string[];
  kept: string[];
  warnings: string[];
  originalSize: number;
  cleanedSize: number;
  /** The cleaned bytes were scanned again and reported nothing. */
  verified: boolean;
  message: string;
}

// Signals

const SIGNAL_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/compositeWithTrainedAlgorithmicMedia/i, 'DigitalSourceType: compositeWithTrainedAlgorithmicMedia'],
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
];

// PNG text keywords that the common generators write their prompt and settings under.
const GENERATION_KEYWORDS = new Set([
  'parameters',
  'prompt',
  'workflow',
  'sd-metadata',
  'dream',
  'invokeai_metadata',
  'invokeai_graph',
  'generation_data',
]);

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');

/** The bytes as text to search. UTF-16 text (EXIF UserComment) is also searched with its zero bytes dropped. */
function searchable(bytes: Uint8Array): string {
  const text = latin1.decode(bytes);
  return text.includes('\0') ? `${text}\n${text.replace(/\0/g, '')}` : text;
}

function findSignals(haystack: string): string[] {
  const found: string[] = [];
  for (const [pattern, label] of SIGNAL_PATTERNS) {
    if (!pattern.test(haystack)) continue;
    // The DigitalSourceType patterns overlap; the first, most specific one wins.
    if (label.startsWith('DigitalSourceType') && found.some((item) => item.startsWith('DigitalSourceType'))) continue;
    found.push(label);
  }
  return found;
}

function preview(text: string): string {
  const flat = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}

// Parsing

interface Removal {
  start: number;
  end: number;
  finding: MetadataFinding;
  /** The WebP header flag that announces this block. */
  webpFlag?: number;
}

interface Parsed {
  format: ImageFormat;
  removals: Removal[];
  kept: string[];
  warnings: string[];
}

class ImageParseError extends Error {}

const truncated = () => new ImageParseError('The file is cut short or damaged, so it was left unchanged.');

const ascii = (bytes: Uint8Array, start: number, length: number): string => {
  let text = '';
  for (let index = start; index < start + length && index < bytes.length; index++) {
    text += String.fromCharCode(bytes[index]);
  }
  return text;
};

const startsWithText = (bytes: Uint8Array, text: string): boolean => ascii(bytes, 0, text.length) === text;

function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === 'PNG' &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  return null;
}

/** The EXIF Orientation value (1 to 8) inside a TIFF block, with or without the "Exif\0\0" prefix. */
function exifOrientation(payload: Uint8Array): number | null {
  const tiff = startsWithText(payload, 'Exif\0\0') ? payload.subarray(6) : payload;
  if (tiff.length < 8) return null;
  const littleEndian = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!littleEndian && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return null;

  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const directory = view.getUint32(4, littleEndian);
  if (directory + 2 > tiff.length) return null;
  const count = view.getUint16(directory, littleEndian);
  for (let index = 0; index < count; index++) {
    const entry = directory + 2 + index * 12;
    if (entry + 12 > tiff.length) return null;
    if (view.getUint16(entry, littleEndian) === 0x0112) return view.getUint16(entry + 8, littleEndian);
  }
  return null;
}

function exifFinding(payload: Uint8Array, location: string, size: number, warnings: string[]): MetadataFinding {
  const haystack = searchable(payload);
  const signals = findSignals(haystack);
  const generated = signals.includes('Stable Diffusion parameters');
  const orientation = exifOrientation(payload);
  if (orientation !== null && orientation >= 2 && orientation <= 8) {
    const note = `The EXIF block holds an Orientation tag (${orientation}). Without it the picture may show rotated or mirrored.`;
    if (!warnings.includes(note)) warnings.push(note);
  }
  return {
    category: generated ? 'Generation prompt/parameters' : 'EXIF',
    location,
    size,
    signals,
  };
}

const ICC_LABEL = 'ICC colour profile';

function addKept(parsed: Parsed, label: string): void {
  if (!parsed.kept.includes(label)) parsed.kept.push(label);
}

// JPEG

const XMP_JPEG_PREFIXES = ['http://ns.adobe.com/xap/1.0/\0', 'http://ns.adobe.com/xmp/extension/\0'];

function isJumbf(payload: Uint8Array): boolean {
  return ascii(payload, 0, 2) === 'JP' && ascii(payload, 0, 24).includes('jumb');
}

/** Index of the next marker after entropy-coded scan data. */
function skipScanData(bytes: Uint8Array, from: number): number {
  let index = from;
  while (index < bytes.length) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    const next = bytes[index + 1];
    if (next === undefined) break;
    // Stuffed zero, restart marker or fill byte: still scan data.
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) index += 2;
    else if (next === 0xff) index += 1;
    else return index;
  }
  throw truncated();
}

function parseJpeg(bytes: Uint8Array): Parsed {
  const parsed: Parsed = { format: 'jpeg', removals: [], kept: [], warnings: [] };
  if (bytes.length < 4) throw truncated();

  let position = 2;
  for (;;) {
    if (position >= bytes.length) throw truncated();
    if (bytes[position] !== 0xff) throw new ImageParseError('Unexpected data between JPEG segments, so the file was left unchanged.');
    while (bytes[position + 1] === 0xff) position += 1;
    const marker = bytes[position + 1];
    if (marker === undefined) throw truncated();

    if (marker === 0xd9) return parsed;
    if (marker === 0x00) throw new ImageParseError('Invalid JPEG marker, so the file was left unchanged.');
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      position += 2;
      continue;
    }

    if (position + 4 > bytes.length) throw truncated();
    const length = (bytes[position + 2] << 8) | bytes[position + 3];
    const end = position + 2 + length;
    if (length < 2 || end > bytes.length) throw truncated();
    const payload = bytes.subarray(position + 4, end);
    const size = end - position;
    let finding: MetadataFinding | null = null;

    if (marker === 0xe1) {
      if (startsWithText(payload, 'Exif\0\0')) {
        finding = exifFinding(payload, 'JPEG APP1 (EXIF)', size, parsed.warnings);
      } else if (XMP_JPEG_PREFIXES.some((prefix) => startsWithText(payload, prefix))) {
        const text = latin1.decode(payload);
        finding = { category: 'XMP', location: 'JPEG APP1 (XMP)', size, signals: findSignals(text) };
      }
    } else if (marker === 0xeb && isJumbf(payload)) {
      finding = {
        category: 'Content Credentials (C2PA)',
        location: 'JPEG APP11 (JUMBF)',
        size,
        signals: [...new Set(['C2PA', ...findSignals(searchable(payload))])],
      };
    } else if (marker === 0xed && startsWithText(payload, 'Photoshop 3.0\0')) {
      finding = {
        category: 'IPTC / Photoshop',
        location: 'JPEG APP13 (Photoshop)',
        size,
        signals: findSignals(searchable(payload)),
      };
    } else if (marker === 0xfe) {
      const text = latin1.decode(payload);
      finding = { category: 'Comment', location: 'JPEG COM', size, signals: findSignals(text), preview: preview(text) };
    } else if (marker === 0xe2 && startsWithText(payload, 'ICC_PROFILE\0')) {
      addKept(parsed, ICC_LABEL);
    }

    if (finding) parsed.removals.push({ start: position, end, finding });
    position = end;
    if (marker === 0xda) position = skipScanData(bytes, position);
  }
}

// PNG

const PNG_REMOVABLE = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'caBX']);

function pngTextFinding(type: string, payload: Uint8Array, size: number): MetadataFinding {
  const nul = payload.indexOf(0);
  const keyword = latin1.decode(payload.subarray(0, nul < 0 ? payload.length : nul));
  const location = `PNG ${type} "${keyword}"`;
  let text = '';

  if (type === 'tEXt' && nul >= 0) {
    text = latin1.decode(payload.subarray(nul + 1));
  } else if (type === 'iTXt' && nul >= 0 && payload[nul + 1] === 0) {
    // Not compressed: flag, method, language tag, translated keyword, then the text.
    const languageEnd = payload.indexOf(0, nul + 3);
    const translatedEnd = languageEnd < 0 ? -1 : payload.indexOf(0, languageEnd + 1);
    if (translatedEnd >= 0) text = utf8.decode(payload.subarray(translatedEnd + 1));
  }

  const signals = findSignals(`${keyword}\n${text}`);
  const lowerKeyword = keyword.toLowerCase();

  let category: FindingCategory = 'Text metadata';
  if (lowerKeyword === 'xml:com.adobe.xmp') category = 'XMP';
  else if (GENERATION_KEYWORDS.has(lowerKeyword) || signals.length > 0) category = 'Generation prompt/parameters';

  return { category, location, size, signals, preview: text ? preview(text) : undefined };
}

function parsePng(bytes: Uint8Array): Parsed {
  const parsed: Parsed = { format: 'png', removals: [], kept: [], warnings: [] };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let position = 8;
  let first = true;

  while (position < bytes.length) {
    if (position + 12 > bytes.length) throw truncated();
    const length = view.getUint32(position);
    const type = ascii(bytes, position + 4, 4);
    const end = position + 12 + length;
    if (end > bytes.length) throw truncated();
    if (first && type !== 'IHDR') throw new ImageParseError('The PNG does not start with an IHDR chunk, so it was left unchanged.');
    first = false;

    const payload = bytes.subarray(position + 8, position + 8 + length);
    const size = end - position;

    if (type === 'iCCP') {
      addKept(parsed, ICC_LABEL);
    } else if (PNG_REMOVABLE.has(type)) {
      let finding: MetadataFinding;
      if (type === 'caBX') {
        finding = {
          category: 'Content Credentials (C2PA)',
          location: 'PNG caBX',
          size,
          signals: [...new Set(['C2PA', ...findSignals(searchable(payload))])],
        };
      } else if (type === 'eXIf') {
        finding = exifFinding(payload, 'PNG eXIf', size, parsed.warnings);
      } else {
        finding = pngTextFinding(type, payload, size);
      }
      parsed.removals.push({ start: position, end, finding });
    }

    position = end;
    if (type === 'IEND') return parsed;
  }

  throw truncated();
}

// WebP

const WEBP_FLAG_EXIF = 0x08;
const WEBP_FLAG_XMP = 0x04;

function parseWebp(bytes: Uint8Array): Parsed {
  const parsed: Parsed = { format: 'webp', removals: [], kept: [], warnings: [] };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffEnd = view.getUint32(4, true) + 8;
  if (riffEnd > bytes.length || riffEnd < 12) throw truncated();

  let position = 12;
  while (position < riffEnd) {
    if (position + 8 > riffEnd) throw truncated();
    const type = ascii(bytes, position, 4);
    const length = view.getUint32(position + 4, true);
    const dataEnd = position + 8 + length;
    if (dataEnd > riffEnd) throw truncated();
    // Chunks are padded to an even size.
    const end = Math.min(dataEnd + (length & 1), riffEnd);
    const payload = bytes.subarray(position + 8, dataEnd);
    const size = end - position;

    if (type === 'ICCP') {
      addKept(parsed, ICC_LABEL);
    } else if (type === 'EXIF') {
      parsed.removals.push({
        start: position,
        end,
        finding: exifFinding(payload, 'WebP EXIF chunk', size, parsed.warnings),
        webpFlag: WEBP_FLAG_EXIF,
      });
    } else if (type === 'XMP ') {
      parsed.removals.push({
        start: position,
        end,
        finding: { category: 'XMP', location: 'WebP XMP chunk', size, signals: findSignals(latin1.decode(payload)) },
        webpFlag: WEBP_FLAG_XMP,
      });
    } else if (type === 'C2PA') {
      parsed.removals.push({
        start: position,
        end,
        finding: {
          category: 'Content Credentials (C2PA)',
          location: 'WebP C2PA chunk',
          size,
          signals: [...new Set(['C2PA', ...findSignals(searchable(payload))])],
        },
      });
    }
    position = end;
  }

  return parsed;
}

function parse(bytes: Uint8Array): Parsed {
  const format = detectImageFormat(bytes);
  if (format === 'jpeg') return parseJpeg(bytes);
  if (format === 'png') return parsePng(bytes);
  if (format === 'webp') return parseWebp(bytes);
  throw new ImageParseError('Not a JPEG, PNG or WebP file, so it was left unchanged.');
}

function parseSafely(bytes: Uint8Array): Parsed | ImageParseError {
  try {
    return parse(bytes);
  } catch (error) {
    // Every read is bounds-checked; anything else is a net under a crafted file.
    return error instanceof ImageParseError ? error : new ImageParseError('The file could not be read, so it was left unchanged.');
  }
}

const distinct = (items: readonly string[]): string[] => [...new Set(items)];

// Public API

/** Lists the metadata that would be removed. Never throws. */
export function scanImageMetadata(bytes: Uint8Array): ImageScan {
  const format = detectImageFormat(bytes);
  const parsed = parseSafely(bytes);
  if (parsed instanceof ImageParseError) {
    return { format, findings: [], signals: [], kept: [], warnings: [], error: parsed.message };
  }
  const findings = parsed.removals.map((removal) => removal.finding);
  return {
    format,
    findings,
    signals: distinct(findings.flatMap((finding) => finding.signals)),
    kept: parsed.kept,
    warnings: parsed.warnings,
  };
}

function unchanged(bytes: Uint8Array, format: ImageFormat | null, message: string, verified: boolean, extra: Partial<StripResult> = {}): StripResult {
  return {
    format,
    bytes,
    changed: false,
    removed: [],
    signals: [],
    kept: [],
    warnings: [],
    originalSize: bytes.length,
    cleanedSize: bytes.length,
    verified,
    message,
    ...extra,
  };
}

/**
 * Cuts the metadata out of a JPEG, PNG or WebP file without touching a pixel,
 * then scans the result again. Never throws: a file that is damaged, of
 * another type, or not clean after cutting is returned unchanged with a message.
 */
export function stripImageMetadata(bytes: Uint8Array): StripResult {
  const format = detectImageFormat(bytes);
  const parsed = parseSafely(bytes);
  if (parsed instanceof ImageParseError) return unchanged(bytes, format, parsed.message, false);

  const { removals } = parsed;
  const findings = removals.map((removal) => removal.finding);
  const signals = distinct(findings.flatMap((finding) => finding.signals));
  const details = { kept: parsed.kept, warnings: parsed.warnings };

  if (removals.length === 0) {
    return unchanged(bytes, parsed.format, 'No AI or provenance metadata found. The file was left unchanged.', true, details);
  }

  const removedBytes = removals.reduce((sum, removal) => sum + (removal.end - removal.start), 0);
  const output = new Uint8Array(bytes.length - removedBytes);
  let read = 0;
  let write = 0;
  for (const removal of removals) {
    output.set(bytes.subarray(read, removal.start), write);
    write += removal.start - read;
    read = removal.end;
  }
  output.set(bytes.subarray(read), write);

  if (parsed.format === 'webp') {
    new DataView(output.buffer).setUint32(4, output.length - 8, true);
    // The VP8X header lists which metadata chunks follow. It comes first, so its offset did not move.
    if (ascii(output, 12, 4) === 'VP8X') {
      const flags = removals.reduce((mask, removal) => mask | (removal.webpFlag ?? 0), 0);
      output[20] &= ~flags;
    }
  }

  const rescan = parseSafely(output);
  if (rescan instanceof ImageParseError || rescan.removals.length > 0) {
    return unchanged(bytes, parsed.format, 'The cleaned file did not pass the re-scan, so the original was left unchanged.', false, details);
  }

  return {
    format: parsed.format,
    bytes: output,
    changed: true,
    removed: findings,
    signals,
    ...details,
    originalSize: bytes.length,
    cleanedSize: output.length,
    verified: true,
    message: `Removed ${findings.length} metadata ${findings.length === 1 ? 'block' : 'blocks'}.`,
  };
}
