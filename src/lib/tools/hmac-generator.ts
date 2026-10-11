// HMAC generator logic. Plain functions only: no React, no DOM, so it runs in
// the browser and in Node. WebCrypto comes from `globalThis.crypto`.

export const HMAC_ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;
export type HmacAlgorithm = (typeof HMAC_ALGORITHMS)[number];

export const KEY_ENCODINGS = ['utf8', 'hex', 'base64'] as const;
export type KeyEncoding = (typeof KEY_ENCODINGS)[number];

export const SIGNATURE_ENCODINGS = ['hex', 'base64', 'base64url'] as const;
export type SignatureEncoding = (typeof SIGNATURE_ENCODINGS)[number];

/** Bytes backed by a plain ArrayBuffer, which is what WebCrypto accepts. */
export type Bytes = Uint8Array<ArrayBuffer>;

interface Failure {
  ok: false;
  error: string;
}

export type Decoded = { ok: true; bytes: Bytes } | Failure;

export interface HmacRequest {
  /** Message text, signed as UTF-8. */
  message: string;
  /** Secret key as typed by the user, in `keyEncoding`. */
  key: string;
  keyEncoding: KeyEncoding;
  algorithm: HmacAlgorithm;
}

export type HmacResult = { ok: true; digest: Bytes; keyBytes: number } | Failure;

export type VerifyResult =
  | { status: 'empty' }
  | { status: 'match'; encoding: SignatureEncoding }
  | { status: 'mismatch'; encoding: SignatureEncoding; detail?: string }
  | { status: 'invalid'; error: string };

const DIGEST_BYTES: Record<HmacAlgorithm, number> = {
  'SHA-1': 20,
  'SHA-256': 32,
  'SHA-384': 48,
  'SHA-512': 64,
};

/** Size in bytes of the HMAC produced by `algorithm`. */
export function digestLength(algorithm: HmacAlgorithm): number {
  return DIGEST_BYTES[algorithm];
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

const BASE64_STANDARD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_URL_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const stripWhitespace = (text: string) => text.replace(/\s+/g, '');

function parseHex(input: string): Decoded {
  const text = stripWhitespace(input);
  const stray = /[^0-9a-fA-F]/.exec(text);
  if (stray) return { ok: false, error: `Invalid hex: "${stray[0]}" is not a hex digit.` };
  if (text.length % 2 !== 0) {
    return {
      ok: false,
      error: `Invalid hex: ${text.length} digits is odd, each byte needs two.`,
    };
  }
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  }
  return { ok: true, bytes };
}

/**
 * Decodes Base64 in either alphabet, padded or not. With `strict`, the unused
 * bits of the last character must be zero, so only the canonical encoding of a
 * byte string is accepted.
 */
function parseBase64(input: string, strict: boolean): Decoded {
  const text = stripWhitespace(input);
  const body = text.replace(/=+$/, '');
  const padding = text.length - body.length;

  if (padding > 2) {
    return { ok: false, error: 'Invalid Base64: too much padding, at most two "=" are allowed.' };
  }
  if (padding > 0 && text.length % 4 !== 0) {
    return { ok: false, error: 'Invalid Base64: the padding does not fit the length.' };
  }
  const stray = /[^A-Za-z0-9+/_-]/.exec(body);
  if (stray) return { ok: false, error: `Invalid Base64: "${stray[0]}" is not a Base64 character.` };
  if (/[+/]/.test(body) && /[-_]/.test(body)) {
    return {
      ok: false,
      error: 'Invalid Base64: mixes the standard (+ /) and URL-safe (- _) alphabets.',
    };
  }
  if (body.length % 4 === 1) {
    return { ok: false, error: `Invalid Base64: ${body.length} characters is not a valid length.` };
  }

  const bytes = new Uint8Array(Math.floor((body.length * 6) / 8));
  let accumulator = 0;
  let bits = 0;
  let written = 0;
  for (const char of body) {
    const standard = char === '-' ? '+' : char === '_' ? '/' : char;
    accumulator = (accumulator << 6) | BASE64_STANDARD.indexOf(standard);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[written++] = (accumulator >> bits) & 0xff;
      accumulator &= (1 << bits) - 1;
    }
  }
  if (strict && accumulator !== 0) {
    return {
      ok: false,
      error: 'Invalid Base64: the last character carries stray bits, so this is not a canonical encoding.',
    };
  }
  return { ok: true, bytes };
}

/**
 * Turns the key text into bytes. UTF-8 keeps the text as typed. Hex ignores
 * whitespace and a leading `0x`. Base64 ignores whitespace and accepts the
 * standard and URL-safe alphabets, with or without padding. An empty key is
 * valid and decodes to zero bytes.
 */
export function decodeKey(text: string, encoding: KeyEncoding): Decoded {
  switch (encoding) {
    case 'utf8':
      return { ok: true, bytes: new TextEncoder().encode(text) };
    case 'hex':
      return parseHex(stripWhitespace(text).replace(/^0x/i, ''));
    case 'base64':
      return parseBase64(text, false);
  }
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

function toBase64(bytes: Uint8Array, urlSafe: boolean): string {
  const alphabet = urlSafe ? BASE64_URL_SAFE : BASE64_STANDARD;
  const pad = urlSafe ? '' : '=';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += alphabet[(chunk >> 18) & 63] + alphabet[(chunk >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(chunk >> 6) & 63] : pad;
    out += i + 2 < bytes.length ? alphabet[chunk & 63] : pad;
  }
  return out;
}

/**
 * Formats a digest. Hex is lower case unless `uppercase` is set. Base64 is
 * standard and padded; Base64URL uses `-` and `_` and has no padding.
 */
export function encodeDigest(digest: Uint8Array, encoding: SignatureEncoding, uppercase = false): string {
  if (encoding === 'hex') {
    const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return uppercase ? hex.toUpperCase() : hex;
  }
  return toBase64(digest, encoding === 'base64url');
}

// ---------------------------------------------------------------------------
// HMAC
// ---------------------------------------------------------------------------

/**
 * HMAC of raw bytes. Throws if WebCrypto is unavailable (for example on an
 * insecure origin); `computeHmac` turns that into an error result.
 */
export async function hmacDigest(algorithm: HmacAlgorithm, key: Bytes, data: Bytes): Promise<Bytes> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto is not available here. Open the tool over HTTPS or localhost.');

  // HMAC zero-pads a short key up to the block size, so an empty key is the
  // same as a single zero byte. WebCrypto itself rejects zero-length keys.
  const keyData = key.length === 0 ? new Uint8Array(1) : key;
  const cryptoKey = await subtle.importKey('raw', keyData, { name: 'HMAC', hash: algorithm }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', cryptoKey, data));
}

/**
 * HMAC of a UTF-8 message under a key given as UTF-8, hex or Base64 text.
 * Never throws: bad keys and WebCrypto failures come back as `{ ok: false }`.
 */
export async function computeHmac(request: HmacRequest): Promise<HmacResult> {
  const key = decodeKey(request.key, request.keyEncoding);
  if (!key.ok) return key;
  try {
    const data = new TextEncoder().encode(request.message);
    const digest = await hmacDigest(request.algorithm, key.bytes, data);
    return { ok: true, digest, keyBytes: key.bytes.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not compute the HMAC.' };
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Compares two byte strings without stopping at the first difference. The loop
 * length depends only on the inputs' lengths, never on where they differ. (In
 * JavaScript this is best effort; it is still the right habit for MACs.)
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return difference === 0;
}

/**
 * Checks an expected signature, pasted as hex, Base64 or Base64URL, against a
 * computed digest. The encoding is detected from the text and its length: the
 * hex form and the Base64 form of one digest never have the same length, so
 * the right reading is the one that decodes to the digest's size. Text with
 * neither `-`/`_` nor `+`/`/` is reported as Base64 (both alphabets agree).
 */
export function verifySignature(digest: Uint8Array, expected: string): VerifyResult {
  const text = stripWhitespace(expected);
  if (text === '') return { status: 'empty' };

  const candidates: { encoding: SignatureEncoding; bytes: Bytes }[] = [];
  const hex = parseHex(text);
  if (hex.ok) candidates.push({ encoding: 'hex', bytes: hex.bytes });
  const base64 = parseBase64(text, true);
  if (base64.ok) {
    candidates.push({ encoding: /[-_]/.test(text) ? 'base64url' : 'base64', bytes: base64.bytes });
  }

  if (candidates.length === 0) {
    return { status: 'invalid', error: 'Not valid hex, Base64 or Base64URL.' };
  }

  const sameSize = candidates.find((candidate) => candidate.bytes.length === digest.length);
  if (!sameSize) {
    const [first] = candidates;
    return {
      status: 'mismatch',
      encoding: first.encoding,
      detail: `Decoded to ${first.bytes.length} bytes, but this HMAC is ${digest.length} bytes.`,
    };
  }
  return timingSafeEqual(sameSize.bytes, digest)
    ? { status: 'match', encoding: sameSize.encoding }
    : { status: 'mismatch', encoding: sameSize.encoding };
}
