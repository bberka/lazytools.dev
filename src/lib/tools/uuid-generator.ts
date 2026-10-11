/**
 * ID generation for the UUID Generator: random UUID v4, time-ordered UUID v7
 * (both RFC 9562) and a Snowflake-style 64-bit ID.
 *
 * The clock and the random bytes are arguments, so tests inject both. The
 * defaults are `Date.now` and `crypto.getRandomValues`, which unlike
 * `crypto.randomUUID` also exists on pages that are not served over HTTPS.
 */

import { generateSnowflakeIds, type SnowflakeLayout } from './snowflake-generator';

export type IdType = 'v4' | 'v7' | 'snowflake';

/** Source of random bytes. The default is `crypto.getRandomValues`. */
export type RandomBytes = (length: number) => Uint8Array;

export interface IdSource {
  /** The clock, in Unix milliseconds. Default `Date.now`. */
  now?: () => number;
  randomBytes?: RandomBytes;
}

/** Largest value the 48-bit timestamp of a UUID v7 holds, in milliseconds. */
const MAX_UUID_TIME = 2 ** 48 - 1;
/** Values of the 12-bit `rand_a` field of a UUID v7. */
const RAND_A_SIZE = 4096;

/** Epoch 2022-01-01 UTC, then 41 timestamp, 5 worker, 5 process and 12 sequence bits. */
const SIMPLE_SNOWFLAKE: SnowflakeLayout = {
  epoch: 1640995200000,
  timestampBits: 41,
  datacenterBits: 0,
  workerBits: 5,
  processBits: 5,
  sequenceBits: 12,
};

function secureRandomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 32 hex digits in the 8-4-4-4-12 layout. */
function hyphenate(hex: string): string {
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

/** Stamps the RFC 9562 variant (binary 10) on the byte that starts the fourth group. */
function withVariant(byte: number): number {
  return (byte & 0x3f) | 0x80;
}

/** One random UUID v4: 122 random bits plus the version and variant fields. */
export function uuidV4(source: IdSource = {}): string {
  const bytes = Uint8Array.from((source.randomBytes ?? secureRandomBytes)(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = withVariant(bytes[8]);
  return hyphenate(toHex(bytes));
}

/**
 * A batch of UUID v7 values that sort in the order they were made. The clock
 * is read once; the 12-bit `rand_a` field then serves as a counter that
 * starts at a random value in its lower half and goes up by one per UUID
 * (RFC 9562 section 6.2, method 1). If it ever runs out, the timestamp moves
 * on by a millisecond instead of repeating.
 */
function uuidV7Batch(count: number, source: IdSource): string[] {
  const randomBytes = source.randomBytes ?? secureRandomBytes;
  const base = Math.floor((source.now ?? Date.now)());
  const [high, low] = randomBytes(2);
  const seed = ((high << 8) | low) & 0x7ff;

  return Array.from({ length: count }, (_, index) => {
    const counter = seed + index;
    const time = Math.min(MAX_UUID_TIME, Math.max(0, base + Math.floor(counter / RAND_A_SIZE)));
    const randA = counter % RAND_A_SIZE;
    const tail = Uint8Array.from(randomBytes(8));
    tail[0] = withVariant(tail[0]);

    return hyphenate(
      time.toString(16).padStart(12, '0') + '7' + randA.toString(16).padStart(3, '0') + toHex(tail)
    );
  });
}

/**
 * A batch of Snowflake IDs from one random worker and process, with the
 * sequence counting up from a random start, so no two IDs in it are equal.
 */
function snowflakeBatch(count: number, source: IdSource): string[] {
  const [workerByte, processByte, high, low] = (source.randomBytes ?? secureRandomBytes)(4);
  const result = generateSnowflakeIds(SIMPLE_SNOWFLAKE, {
    time: (source.now ?? Date.now)(),
    count,
    workerId: workerByte & 31,
    processId: processByte & 31,
    startSequence: ((high << 8) | low) & 4095,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value.map((item) => item.id);
}

/**
 * Makes `count` IDs of one type; a count that is not a positive whole number
 * gives an empty list. Throws with a readable message only when the clock
 * cannot be used, which for Snowflake IDs means a date before 2022.
 */
export function generateIds(type: IdType, count: number, source: IdSource = {}): string[] {
  if (!Number.isInteger(count) || count < 1) return [];

  switch (type) {
    case 'v4':
      return Array.from({ length: count }, () => uuidV4(source));
    case 'v7':
      return uuidV7Batch(count, source);
    case 'snowflake':
      return snowflakeBatch(count, source);
  }
}
