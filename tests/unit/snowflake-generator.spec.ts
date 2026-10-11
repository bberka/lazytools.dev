import { test, expect } from '@playwright/test';
import {
  SNOWFLAKE_PRESETS,
  clampFieldValue,
  decodeSnowflake,
  formatEpochLabel,
  generateSnowflakeIds,
  layoutProblem,
  maxFieldValue,
  relativeTimeLabel,
  snowflakeIdsToCsv,
  totalBits,
  type SnowflakeLayout,
  type SnowflakePresetId,
} from '@/lib/tools/snowflake-generator';

const twitter = SNOWFLAKE_PRESETS.twitter.layout;
const discord = SNOWFLAKE_PRESETS.discord.layout;
const instagram = SNOWFLAKE_PRESETS.instagram.layout;
const presetIds = Object.keys(SNOWFLAKE_PRESETS) as SnowflakePresetId[];

/** Unwraps a result that is expected to succeed. */
function valueOf<T>(result: { ok: true; value: T } | { ok: false; error: string } | null): T {
  if (!result || !result.ok) throw new Error(result ? result.error : 'no result');
  return result.value;
}

function errorOf(result: { ok: true } | { ok: false; error: string } | null): string {
  if (!result || result.ok) throw new Error('expected an error');
  return result.error;
}

test.describe('layoutProblem', () => {
  test('accepts every preset, including the 64-bit Instagram layout', () => {
    for (const id of presetIds) {
      expect(layoutProblem(SNOWFLAKE_PRESETS[id].layout), id).toBeNull();
    }
    expect(totalBits(twitter)).toBe(63);
    expect(totalBits(instagram)).toBe(64);
  });

  test('rejects widths that do not fill 63 or 64 bits', () => {
    expect(layoutProblem({ ...twitter, sequenceBits: 11 })).toContain('Current sum: 62 bits');
    expect(layoutProblem({ ...twitter, sequenceBits: 14 })).toContain('Current sum: 65 bits');
  });

  test('rejects widths that are not whole numbers in range', () => {
    expect(layoutProblem({ ...twitter, workerBits: 1.5 })).toBe('Node B bits must be a whole number from 0 to 64.');
    expect(layoutProblem({ ...twitter, datacenterBits: -1 })).toBe('Node A bits must be a whole number from 0 to 64.');
    expect(layoutProblem({ ...twitter, timestampBits: 99999999 })).toBe(
      'Timestamp bits must be a whole number from 0 to 64.'
    );
    expect(layoutProblem({ ...twitter, sequenceBits: Number.NaN })).toContain('Sequence bits');
  });

  test('needs a timestamp field and a whole-number epoch', () => {
    const noTimestamp: SnowflakeLayout = { ...twitter, timestampBits: 0, sequenceBits: 53 };
    expect(layoutProblem(noTimestamp)).toBe('The timestamp needs at least 1 bit.');
    expect(layoutProblem({ ...twitter, epoch: 1.5 })).toBe('The epoch must be a whole number of milliseconds.');
    expect(layoutProblem({ ...twitter, epoch: Number.NaN })).toBe('The epoch must be a whole number of milliseconds.');
  });
});

test.describe('field helpers', () => {
  test('maxFieldValue is the largest value a field holds', () => {
    expect(maxFieldValue(0)).toBe(0);
    expect(maxFieldValue(5)).toBe(31);
    expect(maxFieldValue(12)).toBe(4095);
    expect(maxFieldValue(-3)).toBe(0);
  });

  test('clampFieldValue gives a whole number inside the field', () => {
    expect(clampFieldValue(7, 5)).toBe(7);
    expect(clampFieldValue(99, 5)).toBe(31);
    expect(clampFieldValue(-4, 5)).toBe(0);
    expect(clampFieldValue(1.9, 5)).toBe(1);
    expect(clampFieldValue(Number.NaN, 5)).toBe(0);
    expect(clampFieldValue(3, 0)).toBe(0);
  });

  test('formatEpochLabel shows the real epoch of each preset in UTC', () => {
    expect(formatEpochLabel(twitter.epoch)).toBe('2010-11-04 01:42:54.657 UTC');
    expect(formatEpochLabel(discord.epoch)).toBe('2015-01-01 00:00:00.000 UTC');
    expect(formatEpochLabel(instagram.epoch)).toBe('2011-08-24 21:07:01.721 UTC');
    expect(formatEpochLabel(SNOWFLAKE_PRESETS.custom.layout.epoch)).toBe('2024-01-01 00:00:00.000 UTC');
    expect(formatEpochLabel(Number.NaN)).toBe('Invalid epoch');
  });
});

test.describe('generateSnowflakeIds', () => {
  test('packs the fields in order', () => {
    const [first] = valueOf(generateSnowflakeIds(twitter, { time: twitter.epoch + 1, count: 1 }));
    expect(first.id).toBe(String(1n << 22n));

    const [full] = valueOf(
      generateSnowflakeIds(twitter, {
        time: twitter.epoch + 1,
        count: 1,
        datacenterId: 11,
        workerId: 26,
        startSequence: 5,
      })
    );
    expect(full.id).toBe(String((1n << 22n) | (11n << 17n) | (26n << 12n) | 5n));
    expect(full).toMatchObject({ datacenterId: 11, workerId: 26, processId: 0, sequence: 5 });
    expect(full.timestamp).toBe(twitter.epoch + 1);
    expect(full.utcDate).toBe('Thu, 04 Nov 2010 01:42:54 GMT');
  });

  test('reproduces a real Discord ID', () => {
    const [item] = valueOf(
      generateSnowflakeIds(discord, { time: 1462015105796, count: 1, workerId: 1, processId: 0, startSequence: 7 })
    );
    expect(item.id).toBe('175928847299117063');
  });

  test('every preset round-trips through decode', () => {
    for (const id of presetIds) {
      const layout = SNOWFLAKE_PRESETS[id].layout;
      const time = Date.UTC(2026, 0, 15, 12, 30, 0, 123);
      const [item] = valueOf(
        generateSnowflakeIds(layout, {
          time,
          count: 1,
          datacenterId: clampFieldValue(9, layout.datacenterBits),
          workerId: clampFieldValue(17, layout.workerBits),
          processId: clampFieldValue(3, layout.processBits),
          startSequence: 42,
        })
      );
      const decoded = valueOf(decodeSnowflake(item.id, layout));
      expect(decoded.timestamp, id).toBe(time);
      expect(decoded.offset, id).toBe(time - layout.epoch);
      expect(decoded.datacenterId, id).toBe(item.datacenterId);
      expect(decoded.workerId, id).toBe(item.workerId);
      expect(decoded.processId, id).toBe(item.processId);
      expect(decoded.sequence, id).toBe(42);
    }
  });

  test('the Instagram preset generates IDs instead of being rejected', () => {
    const result = generateSnowflakeIds(instagram, { time: Date.UTC(2026, 9, 11), count: 3, datacenterId: 5 });
    expect(result.ok).toBe(true);
    expect(valueOf(result)).toHaveLength(3);
  });

  test('a sequence that wraps moves to the next millisecond, so IDs keep increasing', () => {
    const time = twitter.epoch + 1000;
    const ids = valueOf(generateSnowflakeIds(twitter, { time, count: 4, startSequence: 4094 }));

    expect(ids.map((item) => item.sequence)).toEqual([4094, 4095, 0, 1]);
    expect(ids.map((item) => item.timestamp)).toEqual([time, time, time + 1, time + 1]);
    for (let i = 1; i < ids.length; i++) {
      expect(BigInt(ids[i].id) > BigInt(ids[i - 1].id), `id ${i} after id ${i - 1}`).toBe(true);
    }
  });

  test('a batch larger than the sequence field never repeats an ID', () => {
    const small: SnowflakeLayout = { ...twitter, datacenterBits: 11, sequenceBits: 6 };
    const ids = valueOf(generateSnowflakeIds(small, { time: small.epoch + 5, count: 100, startSequence: 60 }));

    expect(new Set(ids.map((item) => item.id)).size).toBe(100);
    for (let i = 1; i < ids.length; i++) {
      expect(BigInt(ids[i].id) > BigInt(ids[i - 1].id)).toBe(true);
    }
  });

  test('brings node and sequence values into range as whole numbers', () => {
    const [item] = valueOf(
      generateSnowflakeIds(twitter, {
        time: twitter.epoch + 1,
        count: 1,
        datacenterId: 1.5,
        workerId: 99,
        processId: 7,
        startSequence: -3,
      })
    );
    expect(item).toMatchObject({ datacenterId: 1, workerId: 31, processId: 0, sequence: 0 });
  });

  test('refuses a timestamp before the epoch instead of making a negative ID', () => {
    const error = errorOf(generateSnowflakeIds(twitter, { time: twitter.epoch - 1, count: 1 }));
    expect(error).toContain('before the epoch');
    expect(error).toContain('2010-11-04 01:42:54.657 UTC');
  });

  test('refuses a timestamp that does not fit the timestamp field', () => {
    const narrow: SnowflakeLayout = {
      epoch: 1704067200000,
      timestampBits: 20,
      datacenterBits: 20,
      workerBits: 3,
      processBits: 0,
      sequenceBits: 20,
    };
    const lastStorable = narrow.epoch + 2 ** 20 - 1;

    expect(generateSnowflakeIds(narrow, { time: lastStorable, count: 1 }).ok).toBe(true);
    expect(errorOf(generateSnowflakeIds(narrow, { time: lastStorable + 1, count: 1 }))).toContain(
      'does not fit in 20 bits'
    );
    // The last ID of a batch must fit too, once the sequence has rolled over.
    expect(
      errorOf(generateSnowflakeIds(narrow, { time: lastStorable, count: 2, startSequence: 2 ** 20 - 1 }))
    ).toContain('does not fit in 20 bits');
  });

  test('refuses an unusable request or layout', () => {
    expect(errorOf(generateSnowflakeIds(twitter, { time: Number.NaN, count: 1 }))).toBe('Enter a valid timestamp.');
    expect(errorOf(generateSnowflakeIds(twitter, { time: twitter.epoch + 1, count: 0 }))).toContain('count');
    expect(errorOf(generateSnowflakeIds(twitter, { time: twitter.epoch + 1, count: 2.5 }))).toContain('count');
    expect(errorOf(generateSnowflakeIds({ ...twitter, sequenceBits: 11 }, { time: twitter.epoch + 1, count: 1 }))).toContain(
      'Current sum: 62 bits'
    );
  });
});

test.describe('decodeSnowflake', () => {
  test('returns null for blank input', () => {
    expect(decodeSnowflake('', twitter)).toBeNull();
    expect(decodeSnowflake('   \n', twitter)).toBeNull();
  });

  test('decodes a real Twitter ID', () => {
    const decoded = valueOf(decodeSnowflake(' 1541815603606036480 ', twitter));
    expect(decoded.timestamp).toBe(1656432460105);
    expect(decoded.offset).toBe(1656432460105 - twitter.epoch);
    expect(decoded).toMatchObject({ datacenterId: 11, workerId: 26, processId: 0, sequence: 0 });
    expect(decoded.binary).toBe('0001010101100101101000010001111101100010000101111010000000000000');
  });

  test('decodes a real Discord ID', () => {
    const decoded = valueOf(decodeSnowflake('175928847299117063', discord));
    expect(decoded.timestamp).toBe(1462015105796);
    expect(decoded).toMatchObject({ datacenterId: 0, workerId: 1, processId: 0, sequence: 7 });
  });

  test('decodes Instagram IDs against the published epoch', () => {
    // (offset << 23) | (shard << 10) | sequence, as in Instagram's next_id function.
    const id = (1000n << 23n) | (5n << 10n) | 3n;
    const decoded = valueOf(decodeSnowflake(id.toString(), instagram));
    expect(decoded.timestamp).toBe(1314220021721 + 1000);
    expect(decoded).toMatchObject({ datacenterId: 5, sequence: 3 });
  });

  test('segments cover all 64 bits in field order', () => {
    const decoded = valueOf(decodeSnowflake('1541815603606036480', twitter));
    expect(decoded.segments.map((segment) => [segment.field, segment.bits.length])).toEqual([
      ['sign', 1],
      ['timestamp', 41],
      ['datacenter', 5],
      ['worker', 5],
      ['sequence', 12],
    ]);
    expect(decoded.segments.map((segment) => segment.bits).join('')).toBe(decoded.binary);
    expect(parseInt(decoded.segments[2].bits, 2)).toBe(11);
    expect(parseInt(decoded.segments[3].bits, 2)).toBe(26);
  });

  test('a 64-bit layout has no sign segment and still lines up with the fields', () => {
    const id = (1n << 63n) | (5n << 10n) | 3n;
    const decoded = valueOf(decodeSnowflake(id.toString(), instagram));

    expect(decoded.segments.map((segment) => [segment.field, segment.bits.length])).toEqual([
      ['timestamp', 41],
      ['datacenter', 13],
      ['sequence', 10],
    ]);
    expect(decoded.segments.map((segment) => segment.bits).join('')).toBe(decoded.binary);
    expect(decoded.binary).toHaveLength(64);
    expect(parseInt(decoded.segments[1].bits, 2)).toBe(decoded.datacenterId);
    expect(parseInt(decoded.segments[2].bits, 2)).toBe(decoded.sequence);
  });

  test('accepts the whole unsigned 64-bit range and nothing outside it', () => {
    const max = (1n << 64n) - 1n;
    expect(valueOf(decodeSnowflake(max.toString(), twitter)).binary).toBe('1'.repeat(64));
    expect(valueOf(decodeSnowflake('0', twitter)).binary).toBe('0'.repeat(64));

    const message = 'Invalid Snowflake ID format. Ensure it is a valid 64-bit unsigned integer.';
    expect(errorOf(decodeSnowflake((max + 1n).toString(), twitter))).toBe(message);
    expect(errorOf(decodeSnowflake('-5', twitter))).toBe(message);
    expect(errorOf(decodeSnowflake('12.5', twitter))).toBe(message);
    expect(errorOf(decodeSnowflake('abc', twitter))).toBe(message);
    expect(errorOf(decodeSnowflake('12 34', twitter))).toBe(message);
  });

  test('reports an unusable layout instead of decoding against it', () => {
    expect(errorOf(decodeSnowflake('1541815603606036480', { ...twitter, timestampBits: 30 }))).toContain(
      'Current sum: 52 bits'
    );
    expect(errorOf(decodeSnowflake('1541815603606036480', { ...twitter, timestampBits: 9999999 }))).toBe(
      'Timestamp bits must be a whole number from 0 to 64.'
    );
    expect(errorOf(decodeSnowflake('1541815603606036480', { ...twitter, epoch: 0.5 }))).toBe(
      'The epoch must be a whole number of milliseconds.'
    );
  });
});

test.describe('relativeTimeLabel', () => {
  const now = Date.UTC(2026, 0, 1);
  const second = 1000;
  const day = 86_400 * second;

  test('uses the largest whole unit', () => {
    expect(relativeTimeLabel(now - 5 * second, now)).toBe('just now / 5s ago');
    expect(relativeTimeLabel(now - 90 * second, now)).toBe('1m ago');
    expect(relativeTimeLabel(now - 3 * 3600 * second, now)).toBe('3h ago');
    expect(relativeTimeLabel(now - 40 * day, now)).toBe('40d ago');
    expect(relativeTimeLabel(now - 800 * day, now)).toBe('2y ago');
  });

  test('says when the time is still to come', () => {
    expect(relativeTimeLabel(now + 10 * 60 * second, now)).toBe('10m in the future');
  });
});

test.describe('snowflakeIdsToCsv', () => {
  test('quotes the date, whose comma would otherwise add a column', () => {
    const ids = valueOf(generateSnowflakeIds(twitter, { time: twitter.epoch + 1, count: 2, datacenterId: 3 }));
    const lines = snowflakeIdsToCsv(ids).split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('ID,Timestamp_MS,UTC_Date,Node_A_ID,Node_B_ID,Node_C_ID,Sequence');
    expect(lines[1]).toBe(`${ids[0].id},${twitter.epoch + 1},"Thu, 04 Nov 2010 01:42:54 GMT",3,0,0,0`);
    expect(lines[2]).toBe(`${ids[1].id},${twitter.epoch + 1},"Thu, 04 Nov 2010 01:42:54 GMT",3,0,0,1`);
  });

  test('is only the header for an empty list', () => {
    expect(snowflakeIdsToCsv([])).toBe('ID,Timestamp_MS,UTC_Date,Node_A_ID,Node_B_ID,Node_C_ID,Sequence');
  });
});
