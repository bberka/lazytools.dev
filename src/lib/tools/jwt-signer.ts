// JWT creation and checking for HS256, HS384 and HS512 (RFC 7515 / 7518 / 7519).
//
// Pure functions: no React, no DOM, no storage. HMAC comes from WebCrypto via
// `globalThis.crypto`, which exists in browsers and in Node. Anything that can
// fail on user input returns a result value instead of throwing, and anything
// that depends on the time takes an injectable clock.

export const JWT_ALGORITHMS = ['HS256', 'HS384', 'HS512'] as const;
export type JwtAlgorithm = (typeof JWT_ALGORITHMS)[number];

export type SecretEncoding = 'utf8' | 'base64';

/** Milliseconds since the epoch, like `Date.now`. */
export type Clock = () => number;

/** Returns `length` random bytes, like `crypto.getRandomValues`. */
export type RandomBytes = (length: number) => Uint8Array;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

type Bytes = Uint8Array<ArrayBuffer>;

const HASH_NAMES: Record<JwtAlgorithm, 'SHA-256' | 'SHA-384' | 'SHA-512'> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
};

const NO_WEBCRYPTO = 'WebCrypto is not available here. Open this page over HTTPS or on localhost.';
const NOT_AN_OBJECT = 'Must be a JSON object, like {"key": "value"}.';

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail<T = never>(error: string): Result<T> {
  return { ok: false, error };
}

/** Narrows a string (for example a menu value) to a supported algorithm. */
export function isJwtAlgorithm(value: string): value is JwtAlgorithm {
  return (JWT_ALGORITHMS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Base64 and Base64URL
// ---------------------------------------------------------------------------

const STANDARD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** ASCII lookup tables: sextet value per character code, -1 when not allowed. */
function buildDecodeTable(characters: string, extra: Record<string, number>): Int8Array {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < characters.length; i++) table[characters.charCodeAt(i)] = i;
  for (const [char, value] of Object.entries(extra)) table[char.charCodeAt(0)] = value;
  return table;
}

const URL_ONLY_TABLE = buildDecodeTable(URL_ALPHABET, {});
const EITHER_TABLE = buildDecodeTable(URL_ALPHABET, { '+': 62, '/': 63 });

function encodeBase64(bytes: Uint8Array, alphabet: string, pad: boolean): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const triple = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += alphabet[(triple >> 18) & 63] + alphabet[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : pad ? '=' : '';
    out += i + 2 < bytes.length ? alphabet[triple & 63] : pad ? '=' : '';
  }
  return out;
}

/**
 * Decodes Base64 text. Rejects characters outside the table, a length that
 * cannot come from whole bytes, misplaced padding, and non-zero spare bits
 * (a different string that would decode to the same bytes).
 */
function decodeBase64(text: string, table: Int8Array, allowPadding: boolean): Bytes | null {
  let end = text.length;
  if (allowPadding) {
    while (end > 0 && text[end - 1] === '=') end--;
    const padding = text.length - end;
    if (padding > 2 || (padding > 0 && text.length % 4 !== 0)) return null;
  }
  if (end % 4 === 1) return null;

  const out = new Uint8Array((end * 3) >> 2);
  let accumulator = 0;
  let bits = 0;
  let written = 0;
  for (let i = 0; i < end; i++) {
    const code = text.charCodeAt(i);
    const sextet = code < 128 ? table[code] : -1;
    if (sextet < 0) return null;
    accumulator = (accumulator << 6) | sextet;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[written++] = (accumulator >> bits) & 0xff;
      accumulator &= (1 << bits) - 1;
    }
  }
  return accumulator === 0 ? out : null;
}

/** Standard Base64 with padding. */
export function base64Encode(bytes: Uint8Array): string {
  return encodeBase64(bytes, STANDARD_ALPHABET, true);
}

/** Base64URL without padding, as RFC 7515 section 2 requires. */
export function base64UrlEncode(bytes: Uint8Array): string {
  return encodeBase64(bytes, URL_ALPHABET, false);
}

/** Base64URL of the UTF-8 bytes of `text`. */
export function base64UrlEncodeText(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text));
}

/**
 * Strict Base64URL decoding for token segments: URL-safe alphabet only and no
 * padding. Returns null for anything else.
 */
export function base64UrlDecode(text: string): Bytes | null {
  return decodeBase64(text, URL_ONLY_TABLE, false);
}

/** Strict Base64URL decoding followed by UTF-8 decoding. Null when either fails. */
export function base64UrlDecodeText(text: string): string | null {
  const bytes = base64UrlDecode(text);
  if (!bytes) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Lenient Base64 decoding for pasted secrets: either alphabet, padding
 * optional, whitespace ignored. Returns null when the text is not Base64.
 */
export function base64Decode(text: string): Bytes | null {
  return decodeBase64(text.replace(/\s+/g, ''), EITHER_TABLE, true);
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

/** Parses `text` and requires the result to be a JSON object (not an array or scalar). */
export function parseJsonObject(text: string): Result<Record<string, unknown>> {
  if (!text.trim()) return fail('Enter a JSON object.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return fail(`Invalid JSON: ${error instanceof Error ? error.message : 'could not be parsed'}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(NOT_AN_OBJECT);
  }
  return ok(value as Record<string, unknown>);
}

/**
 * Removes the whitespace between JSON tokens and leaves strings alone. It works
 * on the text, not on a parsed value, so key order, duplicate keys and numbers
 * too large for a double come through exactly as written. Expects valid JSON.
 */
export function minifyJson(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
      out += char;
    } else if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') {
      out += char;
    }
  }
  return out;
}

/**
 * Sets one member of a JSON object document and returns it pretty-printed.
 * An existing member keeps its position; a new one goes last.
 */
export function setJsonMember(text: string, key: string, value: unknown): Result<string> {
  const parsed = parseJsonObject(text);
  if (!parsed.ok) return parsed;
  return ok(JSON.stringify({ ...parsed.value, [key]: value }, null, 2));
}

/** Null when the header is a JSON object whose `alg` is the selected algorithm, else the problem. */
export function validateHeader(text: string, algorithm: JwtAlgorithm): string | null {
  const parsed = parseJsonObject(text);
  if (!parsed.ok) return parsed.error;
  const alg = parsed.value.alg;
  if (alg === undefined) {
    return `The header needs "alg": "${algorithm}" to match the selected algorithm.`;
  }
  if (alg !== algorithm) {
    return `The header says alg ${JSON.stringify(alg)} but ${algorithm} is selected. Change the algorithm menu or the header.`;
  }
  return null;
}

/** Null when the payload is a JSON object, else the problem. */
export function validatePayload(text: string): string | null {
  const parsed = parseJsonObject(text);
  return parsed.ok ? null : parsed.error;
}

// ---------------------------------------------------------------------------
// Time and claim helpers
// ---------------------------------------------------------------------------

/** Preset lifetimes for the exp helper, shortest first. */
export const EXPIRY_PRESETS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: '1 minute', seconds: 60 },
  { label: '5 minutes', seconds: 300 },
  { label: '15 minutes', seconds: 900 },
  { label: '1 hour', seconds: 3600 },
  { label: '24 hours', seconds: 86400 },
  { label: '7 days', seconds: 604800 },
  { label: '30 days', seconds: 2592000 },
  { label: '1 year', seconds: 31536000 },
];

/** The current time as whole seconds since the epoch (a JWT NumericDate). */
export function unixSeconds(clock: Clock = Date.now): number {
  return Math.floor(clock() / 1000);
}

/** ISO 8601 UTC text for a NumericDate, or null when it is not a representable date. */
function isoFromSeconds(seconds: number): string | null {
  const milliseconds = seconds * 1000;
  if (!Number.isFinite(milliseconds) || Math.abs(milliseconds) > 8.64e15) return null;
  return new Date(milliseconds).toISOString();
}

/** The numeric iat, nbf and exp claims of a payload as UTC dates, in that order. */
export function describeTimeClaims(
  payload: Record<string, unknown>
): Array<{ claim: 'iat' | 'nbf' | 'exp'; iso: string }> {
  const described: Array<{ claim: 'iat' | 'nbf' | 'exp'; iso: string }> = [];
  for (const claim of ['iat', 'nbf', 'exp'] as const) {
    const value = payload[claim];
    if (typeof value !== 'number') continue;
    const iso = isoFromSeconds(value);
    if (iso) described.push({ claim, iso });
  }
  return described;
}

/** A span of time in words, using the two largest non-zero units: "2 hours 30 minutes". */
export function humanizeDuration(seconds: number): string {
  const total = Math.floor(Math.abs(seconds));
  const units: Array<[string, number]> = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  const parts: string[] = [];
  let remaining = total;
  for (const [name, size] of units) {
    const count = Math.floor(remaining / size);
    remaining -= count * size;
    if (parts.length === 0 && count === 0) continue;
    if (count > 0) parts.push(`${count} ${name}${count === 1 ? '' : 's'}`);
    if (parts.length === 2 || (parts.length === 1 && count === 0)) break;
  }
  return parts.length > 0 ? parts.join(' ') : '0 seconds';
}

function defaultRandomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

/** A random version 4 UUID, suitable for a `jti` claim. */
export function generateJti(randomBytes: RandomBytes = defaultRandomBytes): string {
  const bytes = Uint8Array.from(randomBytes(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Secrets and HMAC
// ---------------------------------------------------------------------------

/** The smallest key RFC 7518 section 3.2 allows: the size of the hash output. */
export function minimumSecretBytes(algorithm: JwtAlgorithm): number {
  return { HS256: 32, HS384: 48, HS512: 64 }[algorithm];
}

/** A random Base64 secret of the minimum size for `algorithm`. */
export function generateRandomSecret(
  algorithm: JwtAlgorithm,
  randomBytes: RandomBytes = defaultRandomBytes
): string {
  return base64Encode(randomBytes(minimumSecretBytes(algorithm)));
}

/** Turns the secret field into key bytes. UTF-8 text is used exactly as typed, spaces included. */
export function decodeSecret(secret: string, encoding: SecretEncoding): Result<Bytes> {
  if (encoding === 'utf8') {
    return secret === '' ? fail('Enter a secret.') : ok(new TextEncoder().encode(secret));
  }
  if (secret.trim() === '') return fail('Enter a secret.');
  const bytes = base64Decode(secret);
  return bytes ? ok(bytes) : fail('The secret is not valid Base64.');
}

async function importHmacKey(
  algorithm: JwtAlgorithm,
  key: Bytes,
  usage: 'sign' | 'verify'
): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error(NO_WEBCRYPTO);
  return subtle.importKey('raw', key, { name: 'HMAC', hash: HASH_NAMES[algorithm] }, false, [usage]);
}

/** HMAC of `data` with `key`, using the hash behind the JWT algorithm. Rejects if WebCrypto fails. */
export async function hmac(algorithm: JwtAlgorithm, key: Bytes, data: Bytes): Promise<Bytes> {
  const cryptoKey = await importHmacKey(algorithm, key, 'sign');
  return new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', cryptoKey, data));
}

async function hmacMatches(
  algorithm: JwtAlgorithm,
  key: Bytes,
  signature: Bytes,
  data: Bytes
): Promise<boolean> {
  const cryptoKey = await importHmacKey(algorithm, key, 'verify');
  // subtle.verify compares in constant time.
  return globalThis.crypto.subtle.verify('HMAC', cryptoKey, signature, data);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : NO_WEBCRYPTO;
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

export interface SignOptions {
  /** Header JSON text. Its `alg` must equal `algorithm`. */
  header: string;
  /** Payload (claims) JSON text. */
  payload: string;
  secret: string;
  secretEncoding: SecretEncoding;
  algorithm: JwtAlgorithm;
  /** Strip the whitespace between JSON tokens before encoding. Default true; false encodes the text verbatim. */
  minify?: boolean;
  /** Time source for the claim warnings. Defaults to `Date.now`. */
  clock?: Clock;
}

export interface JwtParts {
  header: string;
  payload: string;
  signature: string;
}

export type SignField = 'header' | 'payload' | 'secret' | 'crypto';

export type SignResult =
  | { ok: true; token: string; parts: JwtParts; warnings: string[] }
  | { ok: false; field: SignField; error: string };

function claimWarnings(payload: Record<string, unknown>, nowSeconds: number): string[] {
  const warnings: string[] = [];
  for (const claim of ['iat', 'nbf', 'exp'] as const) {
    const value = payload[claim];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      warnings.push(`"${claim}" should be a number of seconds since 1970 (a NumericDate).`);
    } else if (value > 1e11) {
      warnings.push(`"${claim}" looks like milliseconds. JWT times are in seconds since 1970.`);
    } else if (claim === 'exp' && value <= nowSeconds) {
      warnings.push('"exp" is in the past, so verifiers will reject this token as expired.');
    } else if (claim === 'nbf' && value > nowSeconds) {
      warnings.push('"nbf" is in the future, so verifiers will reject this token until then.');
    }
  }
  return warnings;
}

function secretWarnings(keyLength: number, algorithm: JwtAlgorithm): string[] {
  const minimum = minimumSecretBytes(algorithm);
  if (keyLength >= minimum) return [];
  return [
    `The secret is ${keyLength} byte${keyLength === 1 ? '' : 's'}. RFC 7518 requires at least ${minimum} bytes for ${algorithm}.`,
  ];
}

/**
 * Builds and signs a JWT. Problems with the inputs come back as `ok: false`
 * with the field to blame; the header is checked first, then the payload, then
 * the secret. Warnings do not stop a token from being made.
 */
export async function signJwt(options: SignOptions): Promise<SignResult> {
  const { algorithm, clock = Date.now } = options;

  const headerError = validateHeader(options.header, algorithm);
  if (headerError) return { ok: false, field: 'header', error: headerError };

  const payload = parseJsonObject(options.payload);
  if (!payload.ok) return { ok: false, field: 'payload', error: payload.error };

  const key = decodeSecret(options.secret, options.secretEncoding);
  if (!key.ok) return { ok: false, field: 'secret', error: key.error };

  const minify = options.minify ?? true;
  const headerPart = base64UrlEncodeText(minify ? minifyJson(options.header) : options.header);
  const payloadPart = base64UrlEncodeText(minify ? minifyJson(options.payload) : options.payload);

  let signature: Bytes;
  try {
    signature = await hmac(algorithm, key.value, new TextEncoder().encode(`${headerPart}.${payloadPart}`));
  } catch (error) {
    return { ok: false, field: 'crypto', error: errorMessage(error) };
  }

  const parts: JwtParts = {
    header: headerPart,
    payload: payloadPart,
    signature: base64UrlEncode(signature),
  };
  return {
    ok: true,
    token: `${parts.header}.${parts.payload}.${parts.signature}`,
    parts,
    warnings: [
      ...claimWarnings(payload.value, unixSeconds(clock)),
      ...secretWarnings(key.value.length, algorithm),
    ],
  };
}

// ---------------------------------------------------------------------------
// Verifying
// ---------------------------------------------------------------------------

export type VerifyStatus =
  | 'valid'
  | 'invalid-signature'
  | 'malformed'
  | 'expired'
  | 'not-yet-valid'
  | 'unsupported-algorithm'
  | 'invalid-secret'
  | 'crypto-error';

export interface VerifyOptions {
  token: string;
  secret: string;
  secretEncoding: SecretEncoding;
  /** Time source for exp and nbf. Defaults to `Date.now`. */
  clock?: Clock;
}

export interface VerifyResult {
  status: VerifyStatus;
  message: string;
  /** The HS algorithm named by the token header, when it is one this tool supports. */
  algorithm?: JwtAlgorithm;
}

function verdict(status: VerifyStatus, message: string, algorithm?: JwtAlgorithm): VerifyResult {
  return algorithm ? { status, message, algorithm } : { status, message };
}

function describeInstant(seconds: number): string {
  const iso = isoFromSeconds(seconds);
  return iso ? ` (${iso})` : '';
}

function isNumericDate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Decodes one segment into a JSON object, or explains what is wrong with it. */
function decodeJsonSegment(segment: string, name: string): Result<Record<string, unknown>> {
  const bytes = base64UrlDecode(segment);
  if (!bytes) return fail(`The ${name} is not valid Base64URL.`);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail(`The ${name} is not valid UTF-8 text.`);
  }
  const parsed = parseJsonObject(text);
  return parsed.ok ? parsed : fail(`The ${name} is not a valid JSON object: ${parsed.error}`);
}

/**
 * Checks a token against a secret. The algorithm is taken from the token
 * header, and only HS256, HS384 and HS512 are accepted (never "none"). The
 * order is: structure, algorithm, secret, signature, then nbf and exp, so a
 * token with a bad signature is never described by its claims.
 *
 * exp follows RFC 7519: the token is expired once the time reaches exp. nbf
 * is valid from its own second onwards. No leeway is applied.
 */
export async function verifyJwt(options: VerifyOptions): Promise<VerifyResult> {
  const { clock = Date.now } = options;

  const token = options.token.trim().replace(/^bearer\s+/i, '');
  if (!token) return verdict('malformed', 'Paste a token to verify.');

  const segments = token.split('.');
  if (segments.length !== 3) {
    return verdict(
      'malformed',
      `A JWT has 3 parts separated by dots, but this has ${segments.length}.`
    );
  }
  const [headerSegment, payloadSegment, signatureSegment] = segments;

  const header = decodeJsonSegment(headerSegment, 'header');
  if (!header.ok) return verdict('malformed', header.error);
  const payload = decodeJsonSegment(payloadSegment, 'payload');
  if (!payload.ok) return verdict('malformed', payload.error);
  const signature = base64UrlDecode(signatureSegment);
  if (!signature) return verdict('malformed', 'The signature is not valid Base64URL.');

  const alg = header.value.alg;
  if (typeof alg !== 'string') return verdict('malformed', 'The header has no "alg" text value.');
  if (!isJwtAlgorithm(alg)) {
    return verdict(
      'unsupported-algorithm',
      `The algorithm "${alg}" is not supported here. This tool checks HS256, HS384 and HS512 only.`
    );
  }

  const key = decodeSecret(options.secret, options.secretEncoding);
  if (!key.ok) return verdict('invalid-secret', key.error, alg);

  let matches: boolean;
  try {
    matches = await hmacMatches(
      alg,
      key.value,
      signature,
      new TextEncoder().encode(`${headerSegment}.${payloadSegment}`)
    );
  } catch (error) {
    return verdict('crypto-error', errorMessage(error), alg);
  }
  if (!matches) {
    return verdict(
      'invalid-signature',
      'The signature does not match this token and secret. Check the secret, its encoding, and that the token is unchanged.',
      alg
    );
  }

  const { nbf, exp } = payload.value;
  for (const [claim, value] of [['nbf', nbf], ['exp', exp]] as const) {
    if (value !== undefined && !isNumericDate(value)) {
      return verdict(
        'malformed',
        `The signature is valid, but "${claim}" is not a number of seconds since 1970 (a NumericDate).`,
        alg
      );
    }
  }

  const now = clock() / 1000;
  if (isNumericDate(nbf) && now < nbf) {
    return verdict(
      'not-yet-valid',
      `The signature is valid, but the token is not valid yet. Its "nbf" time is ${humanizeDuration(nbf - now)} away${describeInstant(nbf)}.`,
      alg
    );
  }
  if (isNumericDate(exp) && now >= exp) {
    return verdict(
      'expired',
      `The signature is valid, but the token expired ${humanizeDuration(now - exp)} ago${describeInstant(exp)}.`,
      alg
    );
  }

  const expiry = isNumericDate(exp) ? ` It expires in ${humanizeDuration(exp - now)}.` : '';
  return verdict('valid', `The signature is valid (${alg}).${expiry}`, alg);
}
