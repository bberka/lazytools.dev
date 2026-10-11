/**
 * ULID generation and decoding.
 *
 * A ULID is 128 bits written as 26 Crockford Base32 characters: a 48-bit
 * millisecond Unix timestamp (10 characters) followed by 80 bits of
 * randomness (16 characters). Because the timestamp comes first, ULIDs sort
 * by creation time as plain strings. The first character carries only three
 * significant bits, so it never goes above "7", which is also what caps the
 * timestamp at 2^48 - 1 ms (the year 10889).
 *
 * Randomness and the clock are arguments, so tests inject both. Every
 * function that can fail on user input returns a result object with a
 * readable message instead of throwing.
 */

export type UlidResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Source of random bytes. The default is `crypto.getRandomValues`. */
export type RandomBytes = (length: number) => Uint8Array;

export interface GenerateOptions {
  /** How many ULIDs, 1 to MAX_COUNT. */
  count: number;
  /**
   * Within one millisecond the random part counts up by one instead of being
   * drawn again, so ULIDs from one batch always sort in creation order.
   */
  monotonic?: boolean;
  /** Fixed timestamp in Unix milliseconds. Default: the clock, read once per ULID. */
  timestamp?: number;
  /** Write the letters in lower case. Default: upper case. */
  lowercase?: boolean;
}

export interface GenerateDeps {
  now?: () => number;
  randomBytes?: RandomBytes;
}

export interface DecodedUlid {
  /** The ULID in its canonical upper-case form. */
  ulid: string;
  /** Unix milliseconds. */
  timestamp: number;
  /** The timestamp as an ISO 8601 string in UTC. */
  iso: string;
  /** The 80-bit random part as 20 lower-case hex digits. */
  randomHex: string;
}

export const ULID_LENGTH = 26;
export const MAX_COUNT = 1000;
/** Largest value the 48-bit timestamp field can hold, in milliseconds. */
export const MAX_TIMESTAMP = 2 ** 48 - 1;

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;
const RANDOM_BYTE_COUNT = 10;
const RANDOM_BITS = 80n;
const MAX_RANDOM = (1n << RANDOM_BITS) - 1n;

/** Decoding accepts both cases. Looked up per character so no case-folding surprises. */
const CHAR_VALUES = new Map<string, number>();
for (let i = 0; i < ALPHABET.length; i++) {
  CHAR_VALUES.set(ALPHABET[i], i);
  CHAR_VALUES.set(ALPHABET[i].toLowerCase(), i);
}

const UUID_HYPHENATED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_COMPACT = /^[0-9a-f]{32}$/i;
const ULID_SHAPE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;

function ok<T>(value: T): UlidResult<T> {
  return { ok: true, value };
}

function fail<T = never>(error: string): UlidResult<T> {
  return { ok: false, error };
}

// ── Base 32 ───────────────────────────────────────────────────────────────────

/** `value` as exactly `length` Crockford characters, most significant first. */
function encodeBase32(value: bigint, length: number): string {
  const chars: string[] = [];
  let rest = value;
  for (let i = 0; i < length; i++) {
    chars.push(ALPHABET[Number(rest & 31n)]);
    rest >>= 5n;
  }
  return chars.reverse().join('');
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

// ── Timestamp ─────────────────────────────────────────────────────────────────

function timestampProblem(ms: number): string | null {
  if (Number.isNaN(ms)) return 'The timestamp must be a number of milliseconds.';
  if (ms < 0) return 'The timestamp cannot be negative.';
  if (ms > MAX_TIMESTAMP) {
    return `The timestamp is beyond the 48-bit maximum of ${MAX_TIMESTAMP} ms (the year 10889).`;
  }
  if (!Number.isInteger(ms)) return 'The timestamp must be a whole number of milliseconds.';
  return null;
}

/** The 10-character timestamp part: `encodeTime(1469918176385)` is `01ARYZ6S41`. */
export function encodeTime(ms: number): UlidResult<string> {
  const problem = timestampProblem(ms);
  if (problem) return fail(problem);
  return ok(encodeBase32(BigInt(ms), TIME_LENGTH));
}

/**
 * Reads a timestamp typed by a person: Unix milliseconds (`1469918176385`) or
 * a date string such as `2016-07-30T22:36:16.385Z`. A date without a time
 * zone is read as local time, as `Date.parse` does.
 */
export function parseTimestampInput(text: string): UlidResult<number> {
  const trimmed = text.trim();
  if (!trimmed) return fail('Enter Unix milliseconds or an ISO 8601 date.');

  const ms = /^-?\d+$/.test(trimmed) ? Number(trimmed) : Date.parse(trimmed);
  if (Number.isNaN(ms)) return fail('That is not Unix milliseconds or a date this tool can read.');

  const problem = timestampProblem(ms);
  return problem ? fail(problem) : ok(ms);
}

// ── Generating ────────────────────────────────────────────────────────────────

function countProblem(count: number): string | null {
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    return `Enter a whole number from 1 to ${MAX_COUNT}.`;
  }
  return null;
}

/** Reads the "how many" field: a whole number from 1 to MAX_COUNT. */
export function parseCount(text: string): UlidResult<number> {
  const trimmed = text.trim();
  const count = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  const problem = countProblem(count);
  return problem ? fail(problem) : ok(count);
}

function secureRandomBytes(): RandomBytes | null {
  const webCrypto = globalThis.crypto;
  if (!webCrypto || typeof webCrypto.getRandomValues !== 'function') return null;
  return (length) => webCrypto.getRandomValues(new Uint8Array(length));
}

const OVERFLOW_MESSAGE =
  'Monotonic overflow: the 80-bit random part is already at its maximum for this millisecond, ' +
  'so the next ULID cannot sort after the previous one.';

/**
 * Makes `count` ULIDs. Without `timestamp` the clock is read once per ULID.
 *
 * In monotonic mode a ULID whose time is not after the previous one reuses
 * the previous time and takes its random part plus one, so the batch is
 * strictly increasing even if the clock stands still or steps back. If that
 * increment would overflow 80 bits the whole call fails, as the ULID spec asks.
 */
export function generateUlids(
  options: GenerateOptions,
  deps: GenerateDeps = {}
): UlidResult<string[]> {
  const { count, monotonic = false, timestamp, lowercase = false } = options;

  const badCount = countProblem(count);
  if (badCount) return fail(badCount);
  if (timestamp !== undefined) {
    const badTimestamp = timestampProblem(timestamp);
    if (badTimestamp) return fail(badTimestamp);
  }

  const randomBytes = deps.randomBytes ?? secureRandomBytes();
  if (!randomBytes) {
    return fail('This browser cannot provide secure random numbers (crypto.getRandomValues is missing).');
  }
  const now = deps.now ?? Date.now;

  const ulids: string[] = [];
  let previous: { time: number; random: bigint } | null = null;

  for (let i = 0; i < count; i++) {
    let time = timestamp ?? now();
    let random: bigint;

    if (monotonic && previous && time <= previous.time) {
      if (previous.random === MAX_RANDOM) return fail(OVERFLOW_MESSAGE);
      time = previous.time;
      random = previous.random + 1n;
    } else {
      random = bytesToBigInt(randomBytes(RANDOM_BYTE_COUNT));
    }

    const timePart = encodeTime(time);
    if (!timePart.ok) return timePart;

    previous = { time, random };
    const ulid = timePart.value + encodeBase32(random, RANDOM_LENGTH);
    ulids.push(lowercase ? ulid.toLowerCase() : ulid);
  }

  return ok(ulids);
}

// ── Decoding ──────────────────────────────────────────────────────────────────

/** Validates `text` as a ULID and returns its 128-bit value and canonical spelling. */
function parseUlid(text: string): UlidResult<{ ulid: string; value: bigint }> {
  const trimmed = text.trim();

  if (UUID_HYPHENATED.test(trimmed) || UUID_COMPACT.test(trimmed)) {
    return fail('This looks like a UUID, not a ULID. Use the converter to turn it into a ULID.');
  }

  const digits: number[] = [];
  for (let i = 0; i < trimmed.length; i++) {
    const digit = CHAR_VALUES.get(trimmed[i]);
    if (digit === undefined) {
      return fail(
        `Invalid character "${trimmed[i]}" at position ${i + 1}. ` +
          'ULIDs use Crockford Base32: digits and letters except I, L, O and U.'
      );
    }
    digits.push(digit);
  }

  if (trimmed.length !== ULID_LENGTH) {
    return fail(`A ULID has exactly ${ULID_LENGTH} characters; this input has ${trimmed.length}.`);
  }
  if (digits[0] > 7) {
    return fail(
      `The timestamp is beyond the 48-bit maximum: the first character must be 0 to 7, not "${trimmed[0]}".`
    );
  }

  return ok({
    ulid: digits.map((digit) => ALPHABET[digit]).join(''),
    value: digits.reduce((total, digit) => (total << 5n) | BigInt(digit), 0n),
  });
}

/** Splits a ULID into its timestamp and random part. */
export function decodeUlid(text: string): UlidResult<DecodedUlid> {
  const parsed = parseUlid(text);
  if (!parsed.ok) return parsed;

  const { ulid, value } = parsed.value;
  const timestamp = Number(value >> RANDOM_BITS);
  return ok({
    ulid,
    timestamp,
    iso: new Date(timestamp).toISOString(),
    randomHex: (value & MAX_RANDOM).toString(16).padStart(RANDOM_BYTE_COUNT * 2, '0'),
  });
}

const RELATIVE_UNITS: ReadonlyArray<readonly [string, number]> = [
  ['year', 31_557_600],
  ['month', 2_629_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

/**
 * Says how far `timestamp` is from `now`, in the largest whole unit:
 * "3 days ago", "in 2 hours", "just now" (within five seconds).
 */
export function formatRelativeTime(timestamp: number, now: number): string {
  const seconds = Math.floor(Math.abs(now - timestamp) / 1000);
  if (seconds < 5) return 'just now';

  const [unit, size] = RELATIVE_UNITS.find(([, unitSeconds]) => seconds >= unitSeconds)!;
  const amount = Math.floor(seconds / size);
  const label = `${amount} ${unit}${amount === 1 ? '' : 's'}`;
  return timestamp > now ? `in ${label}` : `${label} ago`;
}

// ── UUID layout ───────────────────────────────────────────────────────────────

/**
 * Writes a ULID in UUID layout: the same 128 bits as 32 hex digits grouped
 * 8-4-4-4-12. The bytes are not rearranged and no version or variant bits are
 * set, so the result sorts the same way the ULID does but is not an RFC 9562
 * UUID of any version.
 */
export function ulidToUuid(text: string): UlidResult<string> {
  const parsed = parseUlid(text);
  if (!parsed.ok) return parsed;

  const hex = parsed.value.value.toString(16).padStart(32, '0');
  return ok(
    [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
  );
}

/**
 * The reverse of `ulidToUuid`: the 128 bits of a UUID written as 26 upper-case
 * ULID characters. Accepts the hyphenated and the 32-digit forms, with or
 * without braces or a `urn:uuid:` prefix. Every UUID fits: its first byte
 * never needs more than the three bits that the first ULID character holds.
 */
export function uuidToUlid(text: string): UlidResult<string> {
  const trimmed = text
    .trim()
    .replace(/^urn:uuid:/i, '')
    .replace(/^\{(.*)\}$/, '$1');

  if (!UUID_HYPHENATED.test(trimmed) && !UUID_COMPACT.test(trimmed)) {
    if (ULID_SHAPE.test(trimmed)) {
      return fail('This looks like a ULID, not a UUID. Paste it in the ULID box instead.');
    }
    return fail('A UUID has 32 hex digits, usually written 8-4-4-4-12 with hyphens.');
  }

  return ok(encodeBase32(BigInt(`0x${trimmed.replace(/-/g, '')}`), ULID_LENGTH));
}
