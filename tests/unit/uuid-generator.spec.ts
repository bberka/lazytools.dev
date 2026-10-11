import { test, expect } from '@playwright/test';
import { generateIds, uuidV4, type IdSource } from '@/lib/tools/uuid-generator';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A source whose clock stands still and whose random bytes all have one value. */
function fixedSource(now: number, byte: number): IdSource {
  return { now: () => now, randomBytes: (length) => new Uint8Array(length).fill(byte) };
}

const isSorted = (values: string[]) => values.every((value, i) => i === 0 || values[i - 1] < value);

test.describe('uuidV4', () => {
  test('sets the version and variant fields whatever the random bytes are', () => {
    expect(uuidV4(fixedSource(0, 0x00))).toBe('00000000-0000-4000-8000-000000000000');
    expect(uuidV4(fixedSource(0, 0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  test('does not write into the bytes it was given', () => {
    const shared = new Uint8Array(16).fill(0xff);
    uuidV4({ randomBytes: () => shared });
    expect(Array.from(shared)).toEqual(new Array(16).fill(0xff));
  });

  test('uses the secure source by default', () => {
    const ids = Array.from({ length: 50 }, () => uuidV4());
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(50);
  });
});

test.describe('generateIds', () => {
  test('makes as many IDs as asked', () => {
    for (const type of ['v4', 'v7', 'snowflake'] as const) {
      expect(generateIds(type, 1), type).toHaveLength(1);
      expect(generateIds(type, 20), type).toHaveLength(20);
    }
  });

  test('gives nothing for a count that is not a positive whole number', () => {
    expect(generateIds('v4', 0)).toEqual([]);
    expect(generateIds('v7', -3)).toEqual([]);
    expect(generateIds('snowflake', 2.5)).toEqual([]);
    expect(generateIds('v4', Number.NaN)).toEqual([]);
  });

  test('v4 IDs are valid and distinct', () => {
    const ids = generateIds('v4', 20);
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(20);
  });

  test('v7 carries the RFC 9562 variant bits whatever the random bytes are', () => {
    // With all-zero random bytes the fourth group must still start with 8, not 0.
    for (const byte of [0x00, 0x3f, 0x7f, 0xff]) {
      for (const id of generateIds('v7', 5, fixedSource(1_700_000_000_000, byte))) {
        expect(id, `random byte ${byte}`).toMatch(UUID_V7);
      }
    }
    for (const id of generateIds('v7', 20)) expect(id).toMatch(UUID_V7);
  });

  test('v7 starts with the 48-bit millisecond timestamp', () => {
    const [id] = generateIds('v7', 1, fixedSource(0x0123456789ab, 0x00));
    expect(id).toBe('01234567-89ab-7000-8000-000000000000');

    const [recent] = generateIds('v7', 1, { now: () => 1_700_000_000_000 });
    expect(parseInt(recent.replace(/-/g, '').slice(0, 12), 16)).toBe(1_700_000_000_000);
  });

  test('a v7 batch made in one millisecond sorts in the order it was made', () => {
    const ids = generateIds('v7', 20, { now: () => 1_700_000_000_000 });
    expect(new Set(ids).size).toBe(20);
    expect(isSorted(ids)).toBe(true);
    expect([...ids].sort()).toEqual(ids);
  });

  test('v7 moves to the next millisecond when its counter runs out', () => {
    // 0xff bytes seed the counter at its highest start, 2047, so it passes 4095 after 2049 IDs.
    const ids = generateIds('v7', 3000, fixedSource(1_700_000_000_000, 0xff));
    const millis = (id: string) => parseInt(id.replace(/-/g, '').slice(0, 12), 16);

    expect(millis(ids[0])).toBe(1_700_000_000_000);
    expect(millis(ids[2048])).toBe(1_700_000_000_000);
    expect(millis(ids[2049])).toBe(1_700_000_000_001);
    expect(new Set(ids).size).toBe(3000);
    expect(isSorted(ids)).toBe(true);
  });

  test('Snowflake IDs in a batch are distinct and increasing even with identical random bytes', () => {
    const now = Date.UTC(2026, 9, 11);
    for (const byte of [0x00, 0x55, 0xff]) {
      const ids = generateIds('snowflake', 20, fixedSource(now, byte)).map(BigInt);
      expect(new Set(ids).size, `random byte ${byte}`).toBe(20);
      for (let i = 1; i < ids.length; i++) expect(ids[i] > ids[i - 1]).toBe(true);
    }
  });

  test('Snowflake IDs count milliseconds from 2022-01-01 in the top 41 bits', () => {
    const now = Date.UTC(2026, 9, 11, 8, 0, 0, 250);
    const [id] = generateIds('snowflake', 1, fixedSource(now, 0x00)).map(BigInt);

    expect(Number(id >> 22n) + 1640995200000).toBe(now);
    expect(id & ((1n << 22n) - 1n)).toBe(0n);

    const [filled] = generateIds('snowflake', 1, fixedSource(now, 0xff)).map(BigInt);
    expect(Number((filled >> 17n) & 31n)).toBe(31);
    expect(Number((filled >> 12n) & 31n)).toBe(31);
    expect(Number(filled & 4095n)).toBe(4095);
  });

  test('Snowflake generation fails loudly when the clock is before its epoch', () => {
    expect(() => generateIds('snowflake', 1, fixedSource(Date.UTC(2020, 0, 1), 0))).toThrow(/before the epoch/);
  });
});
