/**
 * Reading images out of Base64 text and putting them back into it.
 *
 * `parseImageInput` accepts a data URL (`data:image/png;base64,...`, also the
 * percent-encoded form SVG often uses) or bare Base64, copes with whitespace,
 * the URL-safe alphabet and missing padding, and says what it fixed. The type
 * of the image is then decided from its first bytes, not from the label the
 * data URL carries, because that label is often missing or wrong. Nothing here
 * touches the DOM, so it runs in Node.
 */

// ── Image types ───────────────────────────────────────────────────────────────

export type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'svg' | 'bmp' | 'ico' | 'avif';

export interface ImageTypeInfo {
  kind: ImageKind;
  label: string;
  mime: string;
  /** Without the dot. */
  extension: string;
}

export const IMAGE_TYPES: Readonly<Record<ImageKind, ImageTypeInfo>> = {
  png: { kind: 'png', label: 'PNG', mime: 'image/png', extension: 'png' },
  jpeg: { kind: 'jpeg', label: 'JPEG', mime: 'image/jpeg', extension: 'jpg' },
  gif: { kind: 'gif', label: 'GIF', mime: 'image/gif', extension: 'gif' },
  webp: { kind: 'webp', label: 'WebP', mime: 'image/webp', extension: 'webp' },
  svg: { kind: 'svg', label: 'SVG', mime: 'image/svg+xml', extension: 'svg' },
  bmp: { kind: 'bmp', label: 'BMP', mime: 'image/bmp', extension: 'bmp' },
  ico: { kind: 'ico', label: 'ICO', mime: 'image/vnd.microsoft.icon', extension: 'ico' },
  avif: { kind: 'avif', label: 'AVIF', mime: 'image/avif', extension: 'avif' },
};

/** Other names the same type goes by in data URLs. */
const MIME_ALIASES: Readonly<Record<string, string>> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-icon': 'image/vnd.microsoft.icon',
  'image/x-ms-bmp': 'image/bmp',
  'image/x-png': 'image/png',
};

/** Lowercase `type/subtype` without parameters, with the common aliases mapped to one name. */
export function normalizeMime(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  return MIME_ALIASES[base] ?? base;
}

function hasBytes(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

const SVG_START =
  /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>/]/i;

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 4096)).replace(/^﻿/, '');
  return SVG_START.test(head);
}

function isAvif(bytes: Uint8Array): boolean {
  if (!hasBytes(bytes, ascii('ftyp'), 4) || bytes.length < 12) return false;
  const brand = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (brand(8) === 'avif' || brand(8) === 'avis') return true;
  const size = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  const end = Math.min(size >>> 0, bytes.length);
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    if (brand(offset) === 'avif' || brand(offset) === 'avis') return true;
  }
  return false;
}

/** What image the bytes are, judged by the file signature alone, or null. */
export function detectImageType(bytes: Uint8Array): ImageTypeInfo | null {
  if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return IMAGE_TYPES.png;
  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) return IMAGE_TYPES.jpeg;
  if (hasBytes(bytes, ascii('GIF87a')) || hasBytes(bytes, ascii('GIF89a'))) return IMAGE_TYPES.gif;
  if (hasBytes(bytes, ascii('RIFF')) && hasBytes(bytes, ascii('WEBP'), 8)) return IMAGE_TYPES.webp;
  if (isAvif(bytes)) return IMAGE_TYPES.avif;
  // A BMP file header: "BM", a size, then two reserved fields that are zero.
  if (hasBytes(bytes, ascii('BM')) && bytes.length >= 26 && hasBytes(bytes, [0, 0, 0, 0], 6)) {
    return IMAGE_TYPES.bmp;
  }
  // An icon directory: reserved 0, type 1, then the number of images.
  if (hasBytes(bytes, [0, 0, 1, 0]) && bytes.length >= 22 && (bytes[4] | (bytes[5] << 8)) >= 1) {
    return IMAGE_TYPES.ico;
  }
  if (looksLikeSvg(bytes)) return IMAGE_TYPES.svg;
  return null;
}

// ── Base64 ────────────────────────────────────────────────────────────────────

export type DecodeResult =
  | { ok: true; bytes: Uint8Array; notes: string[] }
  | { ok: false; error: string };

/** Size above which pasted text is refused instead of decoded. */
const MAX_INPUT_CHARS = 40_000_000;

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Decodes Base64 text. Whitespace is ignored, the URL-safe alphabet (`-` and
 * `_`) is accepted, and missing or wrong padding is repaired; each repair is
 * listed in `notes`. Anything else is an error that names the character and
 * where it is (counting without whitespace).
 */
export function decodeBase64(text: string): DecodeResult {
  if (text.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: 'The input is too large to decode here (over 40 million characters).',
    };
  }
  const notes: string[] = [];
  const compact = text.replace(/\s+/g, '');
  if (compact.length !== text.length) notes.push('Whitespace and line breaks were ignored.');
  if (compact === '') return { ok: false, error: 'There is nothing to decode.' };

  const padStart = compact.indexOf('=');
  const body = padStart === -1 ? compact : compact.slice(0, padStart);
  const padding = padStart === -1 ? '' : compact.slice(padStart);

  const invalid = /[^A-Za-z0-9+/_-]/.exec(body);
  if (invalid) {
    return {
      ok: false,
      error: `"${invalid[0]}" is not a Base64 character (position ${invalid.index + 1}).`,
    };
  }
  if (padding !== '' && !/^={1,2}$/.test(padding)) {
    return {
      ok: false,
      error: /[^=]/.test(padding)
        ? '"=" may only appear at the end of Base64 text.'
        : 'Base64 can end with at most two "=" characters.',
    };
  }

  const standard = /[+/]/.test(body);
  const urlSafe = /[-_]/.test(body);
  if (standard && urlSafe) {
    return {
      ok: false,
      error: 'The text mixes the standard alphabet (+ /) with the URL-safe one (- _).',
    };
  }
  if (urlSafe) notes.push('Converted from the URL-safe alphabet.');

  if (body.length % 4 === 1) {
    return {
      ok: false,
      error: `The length is not valid Base64: ${body.length} characters leaves a single character over. Some of the data is probably missing.`,
    };
  }

  const wanted = (4 - (body.length % 4)) % 4;
  if (padding.length !== wanted) {
    notes.push(
      padding === '' ? 'Missing "=" padding was added.' : 'The "=" padding was corrected.'
    );
  }

  const canonical = body.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(wanted);
  try {
    return { ok: true, bytes: binaryToBytes(atob(canonical)), notes };
  } catch {
    return { ok: false, error: 'This is not valid Base64.' };
  }
}

/** Standard Base64 with padding. */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function buildDataUrl(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`;
}

// ── Parsing pasted text ───────────────────────────────────────────────────────

export type InputSource = 'data-url' | 'base64';

export type ParsedInput =
  | {
      ok: true;
      bytes: Uint8Array;
      declaredMime: string | null;
      source: InputSource;
      notes: string[];
    }
  | { ok: false; error: string };

/** One layer of wrapping removed: quotes, `<img src="...">` or `url(...)`. Null when there is none. */
function peel(text: string): string | null {
  const quoted = /^(["'])([\s\S]*)\1$/.exec(text);
  if (quoted) return quoted[2].trim();
  if (text.includes('<')) {
    const src = /\bsrc\s*=\s*(["'])([\s\S]*?)\1/i.exec(text);
    if (src) return src[2].trim();
  }
  const url = /\burl\(\s*(["']?)([\s\S]*?)\1\s*\)/i.exec(text);
  return url ? url[2].trim() : null;
}

/** Strips the wrapping a data URL is often copied with. */
function unwrap(text: string): { text: string; unwrapped: boolean } {
  let current = text.trim();
  let unwrapped = false;
  for (let layer = 0; layer < 4 && !/^data:/i.test(current); layer++) {
    const inner = peel(current);
    if (inner === null) break;
    current = inner;
    unwrapped = true;
  }
  return { text: current, unwrapped };
}

/** Decodes `%XX` escapes to bytes; other characters are taken as UTF-8. */
function percentDecode(text: string): Uint8Array | null {
  const out: number[] = [];
  const encoder = new TextEncoder();
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '%') {
      const hex = text.slice(i + 1, i + 3);
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return null;
      out.push(parseInt(hex, 16));
      i += 2;
    } else {
      const codePoint = text.codePointAt(i)!;
      const char = String.fromCodePoint(codePoint);
      out.push(...encoder.encode(char));
      if (codePoint > 0xffff) i++;
    }
  }
  return Uint8Array.from(out);
}

/**
 * Reads what the user pasted: a data URL or bare Base64. The result carries
 * the bytes, the MIME type the data URL claimed (if any) and a note for each
 * repair that was needed.
 */
export function parseImageInput(text: string): ParsedInput {
  if (text.trim() === '') return { ok: false, error: 'There is nothing to decode.' };
  if (text.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: 'The input is too large to decode here (over 40 million characters).',
    };
  }

  const { text: candidate, unwrapped } = unwrap(text);
  const notes: string[] = unwrapped ? ['The data URL was taken out of the surrounding text.'] : [];

  if (/^data:/i.test(candidate)) {
    const comma = candidate.indexOf(',');
    if (comma === -1) {
      return { ok: false, error: 'A data URL needs a comma between its header and its data.' };
    }
    const header = candidate.slice(5, comma);
    const payload = candidate.slice(comma + 1);
    const parts = header.split(';').map((part) => part.trim());
    const isBase64 = parts.slice(1).some((part) => part.toLowerCase() === 'base64');
    const declared = parts[0].includes('/') ? parts[0].toLowerCase() : null;

    if (isBase64) {
      // Browsers percent-decode a data URL before they read the Base64, so "%3D" stands for "=".
      const decoded = decodeBase64(
        payload.replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) =>
          String.fromCharCode(parseInt(hex, 16))
        )
      );
      if (!decoded.ok) return decoded;
      return {
        ok: true,
        bytes: decoded.bytes,
        declaredMime: declared,
        source: 'data-url',
        notes: [...notes, ...decoded.notes],
      };
    }

    if (payload === '') return { ok: false, error: 'The data URL has no data after the comma.' };
    const bytes = percentDecode(payload);
    if (!bytes)
      return { ok: false, error: 'The data URL contains an invalid percent escape (%XX).' };
    return {
      ok: true,
      bytes,
      declaredMime: declared,
      source: 'data-url',
      notes: [
        ...notes,
        'The data URL is not Base64; its percent-encoded text was decoded instead.',
      ],
    };
  }

  const decoded = decodeBase64(candidate);
  if (!decoded.ok) return decoded;
  return {
    ok: true,
    bytes: decoded.bytes,
    declaredMime: null,
    source: 'base64',
    notes: [...notes, ...decoded.notes],
  };
}

// ── Analysis ──────────────────────────────────────────────────────────────────

export interface ImageAnalysis {
  /** The type found from the bytes, or null when they are not a supported image. */
  type: ImageTypeInfo | null;
  /** The MIME type the data URL claimed, as written, or null. */
  declaredMime: string | null;
  /** The declared type is set and is not the real one. */
  mismatch: boolean;
}

export function analyzeImage(bytes: Uint8Array, declaredMime: string | null): ImageAnalysis {
  const type = detectImageType(bytes);
  const mismatch =
    type !== null && declaredMime !== null && normalizeMime(declaredMime) !== type.mime;
  return { type, declaredMime, mismatch };
}

/** "89 50 4e 47", for showing what unrecognised data starts with. */
export function hexPreview(bytes: Uint8Array, count = 8): string {
  return Array.from(bytes.subarray(0, count), (byte) => byte.toString(16).padStart(2, '0')).join(
    ' '
  );
}

/** `decoded-image.png` for the download. */
export function downloadFileName(type: ImageTypeInfo): string {
  return `decoded-image.${type.extension}`;
}

/** The type to put in a data URL for these bytes: what they really are, else the file's own label. */
export function dataUrlMimeFor(bytes: Uint8Array, fileMime: string): string {
  const detected = detectImageType(bytes);
  if (detected) return detected.mime;
  return fileMime !== '' ? fileMime : 'application/octet-stream';
}
