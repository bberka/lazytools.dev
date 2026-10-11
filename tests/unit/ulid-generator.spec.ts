import { test, expect } from '@playwright/test';
import {
  MAX_COUNT,
  MAX_TIMESTAMP,
  decodeUlid,
  encodeTime,
  formatRelativeTime,
  generateUlids,
  parseCount,
  parseTimestampInput,
  ulidToUuid,
  uuidToUlid,
  type RandomBytes,
  type UlidResult,
} from '@/lib/tools/ulid-generator';

// Worked figures. The ULID spec's README gives encodeTime(1469918176385) as
// "01ARYZ6S41", and 01ARZ3NDEKTSV4RRFFQ69G5FAV is the example ULID in the
// spec. Its timestamp, random hex and UUID form were worked out separately
// with Python integer arithmetic over the Crockford alphabet, not with this
// module.
const SPEC_TIME = 1469918176385;
const SPEC_TIME_PART = '01ARYZ6S41';
const SPEC_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const SPEC_ULID_TIMESTAMP = 1469922850259;
const SPEC_ULID_ISO = '2016-07-30T23:54:10.259Z';
const SPEC_ULID_RANDOM_HEX = 'd6764c61efb99302bd5b';
const SPEC_ULID_UUID = '01563e3a-b5d3-d676-4c61-efb99302bd5b';

const MAX_ULID = '7ZZZZZZZZZZZZZZZZZZZZZZZZZ';
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

/** The value of an ok result; fails the test on an error result. */
function valueOf<T>(result: UlidResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
  return result.value;
}

function errorOf<T>(result: UlidResult<T>): string {
  if (result.ok) throw new Error('expected an error result');
  return result.error;
}

function bytesFromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** A random source that always returns the same 10 bytes. */
function constantBytes(hex: string): RandomBytes {
  return () => bytesFromHex(hex);
}

/** A random source that returns the listed byte strings in turn. */
function sequenceBytes(...hexes: string[]): RandomBytes {
  let next = 0;
  return () => bytesFromHex(hexes[next++]);
}

const ZERO_RANDOM = '00000000000000000000';
const MAX_RANDOM_HEX = 'ffffffffffffffffffff';

test.describe('encodeTime', () => {
  test('matches the ULID spec example', () => {
    expect(valueOf(encodeTime(SPEC_TIME))).toBe(SPEC_TIME_PART);
  });

  test('encodes the smallest and the largest 48-bit values', () => {
    expect(valueOf(encodeTime(0))).toBe('0000000000');
    expect(valueOf(encodeTime(MAX_TIMESTAMP))).toBe('7ZZZZZZZZZ');
    expect(MAX_TIMESTAMP).toBe(281474976710655);
  });

  test('rejects timestamps beyond 48 bits', () => {
    expect(errorOf(encodeTime(MAX_TIMESTAMP + 1))).toContain('48-bit maximum');
    expect(errorOf(encodeTime(Number.MAX_SAFE_INTEGER))).toContain('48-bit maximum');
    expect(errorOf(encodeTime(Number.POSITIVE_INFINITY))).toContain('48-bit maximum');
  });

  test('rejects negative, fractional and non-numeric timestamps', () => {
    expect(errorOf(encodeTime(-1))).toContain('negative');
    expect(errorOf(encodeTime(1.5))).toContain('whole number');
    expect(errorOf(encodeTime(Number.NaN))).toContain('number');
  });
});

test.describe('generateUlids', () => {
  test('builds a ULID from a timestamp and injected randomness', () => {
    const ulids = valueOf(
      generateUlids(
        { count: 1, timestamp: SPEC_ULID_TIMESTAMP },
        { randomBytes: constantBytes(SPEC_ULID_RANDOM_HEX) }
      )
    );
    expect(ulids).toEqual([SPEC_ULID]);
  });

  test('puts the spec timestamp example in front of the random part', () => {
    const [ulid] = valueOf(
      generateUlids({ count: 1, timestamp: SPEC_TIME }, { randomBytes: constantBytes(ZERO_RANDOM) })
    );
    expect(ulid).toBe(`${SPEC_TIME_PART}0000000000000000`);
  });

  test('reads the injected clock', () => {
    const [ulid] = valueOf(
      generateUlids({ count: 1 }, { now: () => SPEC_TIME, randomBytes: constantBytes(ZERO_RANDOM) })
    );
    expect(ulid.slice(0, 10)).toBe(SPEC_TIME_PART);
  });

  test('writes lower case on request and the result still decodes', () => {
    const [ulid] = valueOf(
      generateUlids(
        { count: 1, timestamp: SPEC_ULID_TIMESTAMP, lowercase: true },
        { randomBytes: constantBytes(SPEC_ULID_RANDOM_HEX) }
      )
    );
    expect(ulid).toBe(SPEC_ULID.toLowerCase());
    expect(valueOf(decodeUlid(ulid)).ulid).toBe(SPEC_ULID);
  });

  test('draws fresh randomness for every ULID when not monotonic', () => {
    const ulids = valueOf(
      generateUlids(
        { count: 3, timestamp: SPEC_TIME },
        { randomBytes: sequenceBytes('00000000000000000009', ZERO_RANDOM, MAX_RANDOM_HEX) }
      )
    );
    expect(ulids.map((u) => u.slice(10))).toEqual([
      '0000000000000009',
      '0000000000000000',
      'ZZZZZZZZZZZZZZZZ',
    ]);
  });

  test('counts up inside one millisecond in monotonic mode', () => {
    const calls: number[] = [];
    const ulids = valueOf(
      generateUlids(
        { count: 3, monotonic: true, timestamp: SPEC_TIME },
        {
          randomBytes: (length) => {
            calls.push(length);
            return bytesFromHex(ZERO_RANDOM);
          },
        }
      )
    );
    expect(ulids.map((u) => u.slice(10))).toEqual([
      '0000000000000000',
      '0000000000000001',
      '0000000000000002',
    ]);
    expect(new Set(ulids.map((u) => u.slice(0, 10)))).toEqual(new Set([SPEC_TIME_PART]));
    // Only the first ULID needs randomness.
    expect(calls).toEqual([10]);
  });

  test('carries across Base32 digits and across bytes when incrementing', () => {
    // 0x1f is "Z" in the last digit; adding one carries into the next digit.
    const [first, second] = valueOf(
      generateUlids(
        { count: 2, monotonic: true, timestamp: 0 },
        { randomBytes: constantBytes('0000000000000000001f') }
      )
    );
    expect(first.slice(10)).toBe('000000000000000Z');
    expect(second.slice(10)).toBe('0000000000000010');

    // 0x00ff to 0x0100 carries from the last byte into the one before it.
    const [low, high] = valueOf(
      generateUlids(
        { count: 2, monotonic: true, timestamp: 0 },
        { randomBytes: constantBytes('000000000000000000ff') }
      )
    );
    expect(low.slice(10)).toBe('000000000000007Z');
    expect(high.slice(10)).toBe('0000000000000080');
  });

  test('a later millisecond starts again from fresh randomness', () => {
    const clock = [100, 100, 101, 101];
    const ulids = valueOf(
      generateUlids(
        { count: 4, monotonic: true },
        {
          now: () => clock.shift()!,
          randomBytes: sequenceBytes('00000000000000000005', '00000000000000000040'),
        }
      )
    );
    expect(ulids.map((u) => [u.slice(0, 10), u.slice(10)])).toEqual([
      [valueOf(encodeTime(100)), '0000000000000005'],
      [valueOf(encodeTime(100)), '0000000000000006'],
      [valueOf(encodeTime(101)), '0000000000000020'],
      [valueOf(encodeTime(101)), '0000000000000021'],
    ]);
  });

  test('stays increasing when the clock steps back', () => {
    const clock = [500, 400, 400];
    const ulids = valueOf(
      generateUlids(
        { count: 3, monotonic: true },
        { now: () => clock.shift()!, randomBytes: constantBytes(ZERO_RANDOM) }
      )
    );
    expect(ulids.map((u) => u.slice(0, 10))).toEqual(Array(3).fill(valueOf(encodeTime(500))));
    expect([...ulids].sort()).toEqual(ulids);
    expect(new Set(ulids).size).toBe(3);
  });

  test('fails with an overflow error when the random part cannot be incremented', () => {
    const result = generateUlids(
      { count: 2, monotonic: true, timestamp: SPEC_TIME },
      { randomBytes: constantBytes(MAX_RANDOM_HEX) }
    );
    expect(errorOf(result)).toContain('overflow');
  });

  test('a maximal random part is fine when nothing has to be incremented', () => {
    const single = generateUlids(
      { count: 1, monotonic: true, timestamp: SPEC_TIME },
      { randomBytes: constantBytes(MAX_RANDOM_HEX) }
    );
    expect(valueOf(single)[0].slice(10)).toBe('ZZZZZZZZZZZZZZZZ');

    // Without monotonic mode the same randomness repeats without trouble.
    const repeated = generateUlids(
      { count: 2, timestamp: SPEC_TIME },
      { randomBytes: constantBytes(MAX_RANDOM_HEX) }
    );
    expect(valueOf(repeated)).toHaveLength(2);
  });

  test('the largest timestamp gives the largest ULID', () => {
    const [ulid] = valueOf(
      generateUlids({ count: 1, timestamp: MAX_TIMESTAMP }, { randomBytes: constantBytes(MAX_RANDOM_HEX) })
    );
    expect(ulid).toBe(MAX_ULID);
  });

  test('rejects a timestamp beyond 48 bits or a bad clock reading', () => {
    expect(
      errorOf(generateUlids({ count: 1, timestamp: MAX_TIMESTAMP + 1 }, { randomBytes: constantBytes(ZERO_RANDOM) }))
    ).toContain('48-bit maximum');
    expect(
      errorOf(generateUlids({ count: 1, timestamp: -5 }, { randomBytes: constantBytes(ZERO_RANDOM) }))
    ).toContain('negative');
    expect(
      errorOf(
        generateUlids({ count: 1 }, { now: () => MAX_TIMESTAMP + 1, randomBytes: constantBytes(ZERO_RANDOM) })
      )
    ).toContain('48-bit maximum');
  });

  test('rejects a count outside 1 to 1000', () => {
    for (const count of [0, -3, 1001, 2.5, Number.NaN]) {
      expect(errorOf(generateUlids({ count }, { randomBytes: constantBytes(ZERO_RANDOM) }))).toContain(
        `1 to ${MAX_COUNT}`
      );
    }
    expect(valueOf(generateUlids({ count: MAX_COUNT }, { randomBytes: constantBytes(ZERO_RANDOM) }))).toHaveLength(
      MAX_COUNT
    );
  });

  test('works with the real clock and secure randomness', () => {
    const before = Date.now();
    const ulids = valueOf(generateUlids({ count: 200 }));
    const after = Date.now();

    expect(ulids).toHaveLength(200);
    expect(new Set(ulids).size).toBe(200);
    for (const ulid of ulids) {
      expect(ulid).toMatch(ULID_PATTERN);
      const { timestamp } = valueOf(decodeUlid(ulid));
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    }
  });

  test('real monotonic batches are strictly increasing', () => {
    const ulids = valueOf(generateUlids({ count: MAX_COUNT, monotonic: true }));
    expect(new Set(ulids).size).toBe(MAX_COUNT);
    expect([...ulids].sort()).toEqual(ulids);
  });
});

test.describe('decodeUlid', () => {
  test('decodes the ULID from the spec', () => {
    expect(valueOf(decodeUlid(SPEC_ULID))).toEqual({
      ulid: SPEC_ULID,
      timestamp: SPEC_ULID_TIMESTAMP,
      iso: SPEC_ULID_ISO,
      randomHex: SPEC_ULID_RANDOM_HEX,
    });
  });

  test('decodes the spec timestamp example', () => {
    const decoded = valueOf(decodeUlid(`${SPEC_TIME_PART}0000000000000000`));
    expect(decoded.timestamp).toBe(SPEC_TIME);
    expect(decoded.iso).toBe('2016-07-30T22:36:16.385Z');
    expect(decoded.randomHex).toBe(ZERO_RANDOM);
  });

  test('is case-insensitive, trims, and returns the canonical upper-case form', () => {
    const decoded = valueOf(decodeUlid(`  ${SPEC_ULID.toLowerCase()}\n`));
    expect(decoded.ulid).toBe(SPEC_ULID);
    expect(decoded.timestamp).toBe(SPEC_ULID_TIMESTAMP);
  });

  test('accepts the largest valid ULID', () => {
    const decoded = valueOf(decodeUlid(MAX_ULID));
    expect(decoded.timestamp).toBe(MAX_TIMESTAMP);
    expect(decoded.iso).toBe('+010889-08-02T05:31:50.655Z');
    expect(decoded.randomHex).toBe(MAX_RANDOM_HEX);
  });

  test('accepts the all-zero ULID', () => {
    const decoded = valueOf(decodeUlid('0'.repeat(26)));
    expect(decoded.timestamp).toBe(0);
    expect(decoded.iso).toBe('1970-01-01T00:00:00.000Z');
    expect(decoded.randomHex).toBe(ZERO_RANDOM);
  });

  test('round-trips what generateUlids produces', () => {
    const timestamp = 1700000000123;
    const random = '0123456789abcdef0123';
    const [ulid] = valueOf(
      generateUlids({ count: 1, timestamp }, { randomBytes: constantBytes(random) })
    );
    const decoded = valueOf(decodeUlid(ulid));
    expect(decoded.timestamp).toBe(timestamp);
    expect(decoded.randomHex).toBe(random);
    expect(decoded.ulid).toBe(ulid);
    expect(decoded.iso).toBe(new Date(timestamp).toISOString());
  });

  test('round-trips many real ULIDs through decode, UUID and back', () => {
    for (const ulid of valueOf(generateUlids({ count: 100 }))) {
      const uuid = valueOf(ulidToUuid(ulid));
      expect(valueOf(uuidToUlid(uuid))).toBe(ulid);
    }
  });

  test('rejects the letters I, L, O and U and names the character and position', () => {
    for (const bad of ['I', 'L', 'O', 'U']) {
      const input = `01ARZ3NDEK${bad}SV4RRFFQ69G5FAV`;
      const message = errorOf(decodeUlid(input));
      expect(message).toContain(`"${bad}"`);
      expect(message).toContain('position 11');
      // Lower case is no way round it.
      expect(decodeUlid(input.toLowerCase()).ok).toBe(false);
    }
  });

  test('rejects other invalid characters', () => {
    expect(errorOf(decodeUlid('01ARZ3NDEK-SV4RRFFQ69G5FAV'))).toContain('"-"');
    expect(errorOf(decodeUlid('01ARZ3NDEK SV4RRFFQ69G5FAV'))).toContain('position 11');
    expect(errorOf(decodeUlid('01ARZ3NDEKTSV4RRFFQ69G5FA!'))).toContain('"!"');
  });

  test('rejects a case-folding trick that would otherwise spell a valid letter pair', () => {
    // "ﬆ" upper-cases to "ST", which is a substring of the alphabet.
    expect(decodeUlid('01ARZ3NDEKﬆV4RRFFQ69G5FAV').ok).toBe(false);
  });

  test('rejects the wrong length and says how long the input is', () => {
    expect(errorOf(decodeUlid(''))).toContain('this input has 0');
    expect(errorOf(decodeUlid('01ARZ3NDEK'))).toContain('26 characters; this input has 10');
    expect(errorOf(decodeUlid(`${SPEC_ULID}0`))).toContain('this input has 27');
  });

  test('rejects timestamps beyond the 48-bit maximum', () => {
    for (const first of ['8', '9', 'A', 'Z']) {
      const message = errorOf(decodeUlid(`${first}${'0'.repeat(25)}`));
      expect(message).toContain('48-bit maximum');
      expect(message).toContain(`"${first}"`);
    }
    // One past the largest timestamp, spelled out: 2^48 is 8 followed by nine zeros.
    expect(errorOf(decodeUlid(`8000000000${'0'.repeat(16)}`))).toContain('48-bit maximum');
  });

  test('points a pasted UUID at the converter', () => {
    expect(errorOf(decodeUlid(SPEC_ULID_UUID))).toContain('UUID');
    expect(errorOf(decodeUlid(SPEC_ULID_UUID.replace(/-/g, '')))).toContain('UUID');
  });
});

test.describe('ULID and UUID layout', () => {
  test('converts the spec ULID to its UUID form and back', () => {
    expect(valueOf(ulidToUuid(SPEC_ULID))).toBe(SPEC_ULID_UUID);
    expect(valueOf(uuidToUlid(SPEC_ULID_UUID))).toBe(SPEC_ULID);
  });

  test('puts the 48-bit timestamp in the first six bytes', () => {
    // 1469922850259 is 0x01563e3ab5d3.
    expect(valueOf(ulidToUuid(SPEC_ULID)).replace(/-/g, '').slice(0, 12)).toBe('01563e3ab5d3');
  });

  test('converts the extremes', () => {
    expect(valueOf(ulidToUuid('0'.repeat(26)))).toBe('00000000-0000-0000-0000-000000000000');
    expect(valueOf(ulidToUuid(MAX_ULID))).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(valueOf(uuidToUlid('00000000-0000-0000-0000-000000000000'))).toBe('0'.repeat(26));
    expect(valueOf(uuidToUlid('ffffffff-ffff-ffff-ffff-ffffffffffff'))).toBe(MAX_ULID);
  });

  test('converts an ordinary random UUID', () => {
    // Worked out with Python integer arithmetic.
    expect(valueOf(uuidToUlid('123e4567-e89b-12d3-a456-426614174000'))).toBe('0J7S2PFT4V2B9T8NJ2CRA1EG00');
    expect(valueOf(ulidToUuid('0J7S2PFT4V2B9T8NJ2CRA1EG00'))).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  test('accepts upper case, no hyphens, braces and a urn prefix', () => {
    const upper = SPEC_ULID_UUID.toUpperCase();
    expect(valueOf(uuidToUlid(upper))).toBe(SPEC_ULID);
    expect(valueOf(uuidToUlid(SPEC_ULID_UUID.replace(/-/g, '')))).toBe(SPEC_ULID);
    expect(valueOf(uuidToUlid(`{${SPEC_ULID_UUID}}`))).toBe(SPEC_ULID);
    expect(valueOf(uuidToUlid(`urn:uuid:${SPEC_ULID_UUID}`))).toBe(SPEC_ULID);
    expect(valueOf(uuidToUlid(`  ${SPEC_ULID_UUID}  `))).toBe(SPEC_ULID);
  });

  test('accepts a lower-case ULID for the UUID direction', () => {
    expect(valueOf(ulidToUuid(SPEC_ULID.toLowerCase()))).toBe(SPEC_ULID_UUID);
  });

  test('rejects things that are not UUIDs', () => {
    expect(errorOf(uuidToUlid(''))).toContain('32 hex digits');
    expect(errorOf(uuidToUlid('123e4567-e89b-12d3-a456'))).toContain('32 hex digits');
    expect(errorOf(uuidToUlid('123e4567-e89b-12d3-a456-42661417400g'))).toContain('32 hex digits');
    expect(errorOf(uuidToUlid('123e4567e89b-12d3-a456-426614174000'))).toContain('32 hex digits');
  });

  test('points a pasted ULID at the ULID box', () => {
    expect(errorOf(uuidToUlid(SPEC_ULID))).toContain('ULID');
  });

  test('rejects invalid ULIDs in the UUID direction too', () => {
    expect(errorOf(ulidToUuid('01ARZ3NDEKUSV4RRFFQ69G5FAV'))).toContain('"U"');
    expect(errorOf(ulidToUuid('80000000000000000000000000'))).toContain('48-bit maximum');
    expect(errorOf(ulidToUuid('01ARZ'))).toContain('26 characters');
  });
});

test.describe('parseTimestampInput', () => {
  test('reads Unix milliseconds', () => {
    expect(valueOf(parseTimestampInput('1469918176385'))).toBe(SPEC_TIME);
    expect(valueOf(parseTimestampInput('  0  '))).toBe(0);
    expect(valueOf(parseTimestampInput(String(MAX_TIMESTAMP)))).toBe(MAX_TIMESTAMP);
  });

  test('reads ISO 8601 dates', () => {
    expect(valueOf(parseTimestampInput('2016-07-30T22:36:16.385Z'))).toBe(SPEC_TIME);
    expect(valueOf(parseTimestampInput('2016-07-30T22:36:16.385+00:00'))).toBe(SPEC_TIME);
    expect(valueOf(parseTimestampInput('1970-01-01T00:00:01Z'))).toBe(1000);
  });

  test('rejects empty, unreadable, negative and too-large input', () => {
    expect(errorOf(parseTimestampInput('   '))).toContain('Enter');
    expect(errorOf(parseTimestampInput('next tuesday-ish'))).toContain('not Unix milliseconds');
    expect(errorOf(parseTimestampInput('-5'))).toContain('negative');
    expect(errorOf(parseTimestampInput(String(MAX_TIMESTAMP + 1)))).toContain('48-bit maximum');
    expect(errorOf(parseTimestampInput('9'.repeat(400)))).toContain('48-bit maximum');
    expect(errorOf(parseTimestampInput('+012000-01-01T00:00:00Z'))).toContain('48-bit maximum');
  });
});

test.describe('parseCount', () => {
  test('accepts whole numbers from 1 to 1000', () => {
    expect(valueOf(parseCount('1'))).toBe(1);
    expect(valueOf(parseCount(' 250 '))).toBe(250);
    expect(valueOf(parseCount('1000'))).toBe(1000);
  });

  test('rejects everything else', () => {
    for (const text of ['', '0', '1001', '-1', '2.5', '1e2', 'ten']) {
      expect(errorOf(parseCount(text))).toContain('1 to 1000');
    }
  });
});

test.describe('formatRelativeTime', () => {
  const now = 1_700_000_000_000;

  test('says "just now" within five seconds either way', () => {
    expect(formatRelativeTime(now, now)).toBe('just now');
    expect(formatRelativeTime(now - 4_999, now)).toBe('just now');
    expect(formatRelativeTime(now + 4_999, now)).toBe('just now');
  });

  test('uses the largest whole unit, in the past', () => {
    expect(formatRelativeTime(now - 5_000, now)).toBe('5 seconds ago');
    expect(formatRelativeTime(now - 60_000, now)).toBe('1 minute ago');
    expect(formatRelativeTime(now - 90 * 60_000, now)).toBe('1 hour ago');
    expect(formatRelativeTime(now - 3 * 86_400_000, now)).toBe('3 days ago');
    expect(formatRelativeTime(now - 30 * 86_400_000, now)).toBe('30 days ago');
    expect(formatRelativeTime(now - 45 * 86_400_000, now)).toBe('1 month ago');
    expect(formatRelativeTime(now - 400 * 86_400_000, now)).toBe('1 year ago');
    expect(formatRelativeTime(now - 3 * 366 * 86_400_000, now)).toBe('3 years ago');
  });

  test('looks ahead for timestamps in the future', () => {
    expect(formatRelativeTime(now + 2 * 3_600_000, now)).toBe('in 2 hours');
    expect(formatRelativeTime(now + 61_000, now)).toBe('in 1 minute');
    expect(formatRelativeTime(now + 3 * 366 * 86_400_000, now)).toBe('in 3 years');
  });
});
