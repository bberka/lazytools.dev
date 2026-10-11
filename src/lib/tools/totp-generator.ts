/**
 * Time-based one-time passwords (RFC 6238) on top of HOTP (RFC 4226).
 *
 * Plain functions, no React and no DOM. HMAC comes from WebCrypto through
 * `globalThis.crypto`, which exists in browsers and in Node. Every function
 * that depends on the time takes it as an argument, so nothing here reads the
 * clock.
 *
 * The functions a tool page calls (`decodeBase32`, `computeTotpWindow`,
 * `buildOtpauthUri`) return `{ ok: false, error }` for bad input instead of
 * throwing. `hotp` and `totp` are the low-level primitives and reject on
 * invalid arguments.
 */

export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';
export type TotpDigits = 6 | 8;

export interface TotpOptions {
  algorithm: TotpAlgorithm;
  digits: TotpDigits;
  /** Length of one time step in seconds. */
  period: number;
}

export interface Failure {
  ok: false;
  error: string;
}

export const TOTP_ALGORITHMS: readonly TotpAlgorithm[] = ['SHA-1', 'SHA-256', 'SHA-512'];
export const TOTP_DIGITS: readonly TotpDigits[] = [6, 8];
export const TOTP_PERIODS: readonly number[] = [30, 60];

export const DEFAULT_TOTP_OPTIONS: TotpOptions = { algorithm: 'SHA-1', digits: 6, period: 30 };

/** RFC 4226 section 4 requires shared secrets of at least 128 bits. */
export const MIN_SECRET_BITS = 128;

const DEFAULT_SECRET_BYTES = 20;
const DEFAULT_LABEL = 'Account';

// --- Base32 (RFC 4648) ------------------------------------------------------

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** "=" characters a complete 8-character group needs after N leftover characters. */
const BASE32_PADDING: Record<number, number> = { 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 };

export type Base32Result = { ok: true; bytes: Uint8Array<ArrayBuffer> } | Failure;

/**
 * Decodes a Base32 secret the way people paste it: any case, with spaces,
 * line breaks or hyphens between groups, and optional "=" padding at the end.
 * Padding that is present must be the right length. Unused bits after the last
 * full byte are ignored.
 */
export function decodeBase32(input: string): Base32Result {
  const compact = input.replace(/[\s-]+/g, '');
  if (compact === '') {
    return { ok: false, error: 'Enter a Base32 secret.' };
  }

  const parts = /^([^=]*)(=*)$/.exec(compact);
  if (!parts) {
    return { ok: false, error: 'Padding "=" is only allowed at the end of a Base32 secret.' };
  }
  const [, data, padding] = parts;
  if (data === '') {
    return { ok: false, error: 'Enter a Base32 secret.' };
  }

  // Test the original text, not the upper-cased copy: 'ß' upper-cases to 'SS'.
  const invalid = /[^A-Za-z2-7]/u.exec(data);
  if (invalid) {
    return {
      ok: false,
      error: `"${invalid[0]}" is not a Base32 character. Base32 uses the letters A-Z and the digits 2-7.`,
    };
  }

  const expectedPadding = BASE32_PADDING[data.length % 8];
  if (expectedPadding === undefined) {
    return {
      ok: false,
      error: `${data.length} ${data.length === 1 ? 'character is' : 'characters are'} not a valid Base32 length. Check for missing or extra characters.`,
    };
  }
  if (padding !== '' && padding.length !== expectedPadding) {
    return {
      ok: false,
      error: `Wrong Base32 padding: ${data.length} characters need ${expectedPadding} "=" at the end (or none).`,
    };
  }

  const bytes = new Uint8Array(Math.floor((data.length * 5) / 8));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of data.toUpperCase()) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes[index] = (buffer >>> bits) & 0xff;
      index += 1;
      buffer &= (1 << bits) - 1;
    }
  }

  return { ok: true, bytes };
}

/** Encodes bytes as upper-case Base32, without padding unless `padded` is set. */
export function encodeBase32(bytes: Uint8Array, { padded = false }: { padded?: boolean } = {}): string {
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  if (padded && output.length % 8 !== 0) {
    output += '='.repeat(8 - (output.length % 8));
  }
  return output;
}

/** A random Base32 secret from the browser's cryptographic random source. */
export function generateSecret(byteLength = DEFAULT_SECRET_BYTES): string {
  if (!Number.isInteger(byteLength) || byteLength < 1) {
    throw new RangeError('Secret length must be a positive whole number of bytes.');
  }
  return encodeBase32(globalThis.crypto.getRandomValues(new Uint8Array(byteLength)));
}

// --- HOTP and TOTP ----------------------------------------------------------

/**
 * HOTP (RFC 4226): HMAC the 8-byte big-endian counter with the key, then
 * apply dynamic truncation and reduce to `digits` digits.
 */
export async function hotp(
  key: Uint8Array<ArrayBuffer>,
  counter: number,
  { algorithm, digits }: Pick<TotpOptions, 'algorithm' | 'digits'>
): Promise<string> {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new RangeError('The counter must be a non-negative whole number.');
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto is not available here. Use a current browser over HTTPS.');
  }

  const message = new DataView(new ArrayBuffer(8));
  message.setUint32(0, Math.floor(counter / 2 ** 32));
  message.setUint32(4, counter % 2 ** 32);

  const cryptoKey = await subtle.importKey('raw', key, { name: 'HMAC', hash: algorithm }, false, ['sign']);
  const mac = new Uint8Array(await subtle.sign('HMAC', cryptoKey, message));

  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];

  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Number of whole periods between the Unix epoch and `timeMs`. */
export function totpCounter(timeMs: number, period: number): number {
  return Math.floor(Math.floor(timeMs / 1000) / period);
}

/** Seconds until the current code changes: `period` at the start of a window, 1 at the end. */
export function secondsRemaining(timeMs: number, period: number): number {
  const elapsed = ((Math.floor(timeMs / 1000) % period) + period) % period;
  return period - elapsed;
}

/** TOTP (RFC 6238) for the moment `timeMs` (milliseconds since the Unix epoch). */
export function totp(key: Uint8Array<ArrayBuffer>, timeMs: number, options: TotpOptions): Promise<string> {
  return hotp(key, totpCounter(timeMs, options.period), options);
}

function describeOptionsProblem({ algorithm, digits, period }: TotpOptions): string | null {
  if (!TOTP_ALGORITHMS.includes(algorithm)) {
    return `Unsupported algorithm "${String(algorithm)}". Use SHA-1, SHA-256 or SHA-512.`;
  }
  if (!TOTP_DIGITS.includes(digits)) {
    return `Unsupported code length "${String(digits)}". Use 6 or 8 digits.`;
  }
  if (!Number.isInteger(period) || period < 1) {
    return 'The period must be a whole number of seconds, at least 1.';
  }
  return null;
}

export type TotpWindowResult =
  | {
      ok: true;
      /** The code for the window before this one, or null in the very first window. */
      previous: string | null;
      current: string;
      next: string;
      /** The time-step counter of the current window. */
      counter: number;
      /** Seconds until `current` is replaced by `next`. */
      secondsRemaining: number;
      /** Size of the decoded secret in bits. */
      secretBits: number;
    }
  | Failure;

/**
 * The previous, current and next codes around `timeMs` for a Base32 secret as
 * typed or pasted by a person.
 */
export async function computeTotpWindow(
  secret: string,
  options: TotpOptions,
  timeMs: number
): Promise<TotpWindowResult> {
  const decoded = decodeBase32(secret);
  if (!decoded.ok) return decoded;

  const problem = describeOptionsProblem(options);
  if (problem) return { ok: false, error: problem };

  if (!Number.isFinite(timeMs) || timeMs < 0) {
    return { ok: false, error: 'The time must be a moment on or after 1 January 1970.' };
  }

  const counter = totpCounter(timeMs, options.period);
  try {
    const [previous, current, next] = await Promise.all([
      counter > 0 ? hotp(decoded.bytes, counter - 1, options) : Promise.resolve(null),
      hotp(decoded.bytes, counter, options),
      hotp(decoded.bytes, counter + 1, options),
    ]);
    return {
      ok: true,
      previous,
      current,
      next,
      counter,
      secondsRemaining: secondsRemaining(timeMs, options.period),
      secretBits: decoded.bytes.length * 8,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not calculate the code.',
    };
  }
}

// --- otpauth:// link --------------------------------------------------------

export interface OtpauthInput extends TotpOptions {
  secret: string;
  issuer?: string;
  account?: string;
}

export type OtpauthResult = { ok: true; uri: string } | Failure;

/** Colons separate issuer from account in the label, so they cannot appear inside either. */
function cleanLabelPart(value: string | undefined): string {
  return (value ?? '').replace(/[:\s]+/g, ' ').trim();
}

/**
 * Builds the `otpauth://totp/...` link authenticator apps import (Google's Key
 * URI Format). The secret is written as upper-case Base32 without padding.
 * Without an issuer or account the label reads "Account".
 */
export function buildOtpauthUri(input: OtpauthInput): OtpauthResult {
  const decoded = decodeBase32(input.secret);
  if (!decoded.ok) return decoded;

  const problem = describeOptionsProblem(input);
  if (problem) return { ok: false, error: problem };

  const issuer = cleanLabelPart(input.issuer);
  const account = cleanLabelPart(input.account);
  const secret = input.secret.replace(/[\s-]+/g, '').replace(/=+$/, '').toUpperCase();

  const label =
    issuer && account
      ? `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
      : encodeURIComponent(account || issuer || DEFAULT_LABEL);

  const params = [`secret=${secret}`];
  if (issuer) params.push(`issuer=${encodeURIComponent(issuer)}`);
  params.push(
    `algorithm=${input.algorithm.replace('-', '')}`,
    `digits=${input.digits}`,
    `period=${input.period}`
  );

  return { ok: true, uri: `otpauth://totp/${label}?${params.join('&')}` };
}

// --- Display ----------------------------------------------------------------

/** Splits a code for reading aloud or typing: "123 456" or "1234 5678". */
export function formatCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}
