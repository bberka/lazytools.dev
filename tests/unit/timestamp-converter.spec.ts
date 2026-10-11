import { test, expect } from '@playwright/test';
import {
  changeUnit,
  createConverterState,
  describeInstant,
  editDateTime,
  editTimestamp,
  formatRelativeTime,
  formatTimestamp,
  fromLocalDateTime,
  parseTimestamp,
  showInstant,
  toLocalDateTime,
} from '@/lib/tools/timestamp-converter';

// These tests run in whatever time zone the machine is set to. Expected local
// values are built with the Date constructor and getters, which use the same
// zone, so nothing here depends on which zone that is.
const pad = (value: number) => String(value).padStart(2, '0');
const localFields = (ms: number) => {
  const date = new Date(ms);
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
  };
};

const blank = createConverterState();
const blankMs = createConverterState('milliseconds');

test.describe('parseTimestamp', () => {
  test('reads seconds and milliseconds', () => {
    expect(parseTimestamp('1640995200', 'seconds')).toEqual({ kind: 'instant', ms: 1640995200000 });
    expect(parseTimestamp('1640995200000', 'milliseconds')).toEqual({
      kind: 'instant',
      ms: 1640995200000,
    });
    expect(parseTimestamp('0', 'seconds')).toEqual({ kind: 'instant', ms: 0 });
  });

  test('reads negative timestamps', () => {
    expect(parseTimestamp('-1', 'seconds')).toEqual({ kind: 'instant', ms: -1000 });
    expect(parseTimestamp('-86400000', 'milliseconds')).toEqual({ kind: 'instant', ms: -86400000 });
  });

  test('keeps the decimal part of seconds to the millisecond', () => {
    expect(parseTimestamp('1640995200.5', 'seconds')).toEqual({ kind: 'instant', ms: 1640995200500 });
    expect(parseTimestamp('1640995200.123', 'seconds')).toEqual({
      kind: 'instant',
      ms: 1640995200123,
    });
    expect(parseTimestamp('1.', 'seconds')).toEqual({ kind: 'instant', ms: 1000 });
    expect(parseTimestamp('.5', 'seconds')).toEqual({ kind: 'instant', ms: 500 });
  });

  test('drops the decimal part of milliseconds', () => {
    expect(parseTimestamp('1500.9', 'milliseconds')).toEqual({ kind: 'instant', ms: 1500 });
  });

  test('never returns negative zero', () => {
    const parsed = parseTimestamp('-0', 'seconds');
    expect(parsed.kind === 'instant' && Object.is(parsed.ms, 0)).toBe(true);
    const truncated = parseTimestamp('-0.4', 'milliseconds');
    expect(truncated.kind === 'instant' && Object.is(truncated.ms, 0)).toBe(true);
  });

  test('treats blank text and a lone sign or point as nothing typed yet', () => {
    for (const text of ['', '   ', '-', '.', '-.']) {
      expect(parseTimestamp(text, 'seconds'), JSON.stringify(text)).toEqual({ kind: 'empty' });
    }
  });

  // parseFloat read these as 12, 1.2 and 2022.
  test('rejects text that is not one number', () => {
    for (const text of ['12-34', '1.2.3', '2022-01-01', '--5', '5-', '1e3', 'abc', '1 2']) {
      expect(parseTimestamp(text, 'seconds').kind, text).toBe('invalid');
    }
  });

  test('rejects timestamps beyond what a Date can hold', () => {
    expect(parseTimestamp('8640000000000', 'seconds')).toEqual({ kind: 'instant', ms: 8.64e15 });
    expect(parseTimestamp('8640000000001', 'seconds').kind).toBe('invalid');
    expect(parseTimestamp('-8640000000001', 'seconds').kind).toBe('invalid');
    expect(parseTimestamp('8640000000000001', 'milliseconds').kind).toBe('invalid');
    expect(parseTimestamp('9'.repeat(400), 'milliseconds').kind).toBe('invalid');
  });
});

test.describe('formatTimestamp', () => {
  test('writes the moment in the unit, rounding seconds down', () => {
    expect(formatTimestamp(1640995215123, 'milliseconds')).toBe('1640995215123');
    expect(formatTimestamp(1640995215123, 'seconds')).toBe('1640995215');
    expect(formatTimestamp(-1500, 'seconds')).toBe('-2');
    expect(formatTimestamp(0, 'seconds')).toBe('0');
  });
});

test.describe('local date and time', () => {
  test('toLocalDateTime gives the wall-clock fields of a moment', () => {
    const ms = Date.UTC(2024, 5, 15, 12, 34, 56, 789);
    expect(toLocalDateTime(ms)).toEqual(localFields(ms));
  });

  test('fromLocalDateTime agrees with the Date constructor', () => {
    expect(fromLocalDateTime({ date: '2024-03-05', hour: '07', minute: '09' })).toBe(
      new Date(2024, 2, 5, 7, 9).getTime()
    );
    expect(fromLocalDateTime({ date: '1999-12-31', hour: '23', minute: '59' })).toBe(
      new Date(1999, 11, 31, 23, 59).getTime()
    );
    expect(fromLocalDateTime({ date: '2024-02-29', hour: '00', minute: '00' })).toBe(
      new Date(2024, 1, 29).getTime()
    );
  });

  test('the two round-trip to the start of the minute', () => {
    const ms = Date.UTC(2024, 5, 15, 12, 34, 56, 789);
    expect(fromLocalDateTime(toLocalDateTime(ms)!)).toBe(ms - 56_789);
  });

  // `${d.getFullYear()}` gave "999-06-15", which the masked date field turned
  // into a different date.
  test('pads years below 1000 and reads them back', () => {
    const early = new Date(2000, 5, 15, 12);
    early.setFullYear(999);
    expect(toLocalDateTime(early.getTime())).toEqual({
      date: '0999-06-15',
      hour: '12',
      minute: '00',
    });
    expect(fromLocalDateTime({ date: '0999-06-15', hour: '12', minute: '00' })).toBe(
      early.getTime()
    );
  });

  test('reads years below 100 as written', () => {
    const ms = fromLocalDateTime({ date: '0050-01-02', hour: '03', minute: '04' });
    expect(ms).not.toBeNull();
    const date = new Date(ms!);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([50, 0, 2]);
    expect([date.getHours(), date.getMinutes()]).toEqual([3, 4]);
  });

  test('toLocalDateTime returns null for a year the date field cannot hold', () => {
    expect(toLocalDateTime(1640995200000 * 1000)).toBeNull();
    expect(toLocalDateTime(-8.64e15)).toBeNull();
    expect(toLocalDateTime(Number.NaN)).toBeNull();
  });

  test('fromLocalDateTime returns null for anything that is not a real date and time', () => {
    expect(fromLocalDateTime({ date: '', hour: '00', minute: '00' })).toBeNull();
    expect(fromLocalDateTime({ date: '2024-0', hour: '00', minute: '00' })).toBeNull();
    expect(fromLocalDateTime({ date: '2023-02-30', hour: '00', minute: '00' })).toBeNull();
    expect(fromLocalDateTime({ date: '2024-01-01', hour: '24', minute: '00' })).toBeNull();
    expect(fromLocalDateTime({ date: '2024-01-01', hour: '00', minute: '60' })).toBeNull();
    expect(fromLocalDateTime({ date: '2024-01-01', hour: '7', minute: '00' })).toBeNull();
    expect(fromLocalDateTime({ date: '2024-01-01', hour: '', minute: '00' })).toBeNull();
  });
});

test.describe('editTimestamp', () => {
  // The results used to be rebuilt from the date, hour and minute alone, so
  // this showed 00:00:00 instead of 00:00:15.
  test('keeps the seconds of a typed timestamp', () => {
    const state = editTimestamp(blank, '1640995215');
    expect(state.instant).toBe(1640995215000);
    expect(state.timestamp).toBe('1640995215');
    expect(describeInstant(state.instant!).iso).toBe('2022-01-01T00:00:15.000Z');
  });

  test('keeps the milliseconds of a typed timestamp', () => {
    const state = editTimestamp(blankMs, '1640995215123');
    expect(state.instant).toBe(1640995215123);
    expect(describeInstant(state.instant!).iso).toBe('2022-01-01T00:00:15.123Z');
  });

  test('fills the date side from the moment', () => {
    const state = editTimestamp(blank, '1640995215');
    expect({ date: state.date, hour: state.hour, minute: state.minute }).toEqual(
      localFields(1640995215000)
    );
    expect(state.error).toBe('');
  });

  test('drops characters that cannot be part of a number', () => {
    expect(editTimestamp(blank, ' 1,640,995,200 s').timestamp).toBe('1640995200');
    expect(editTimestamp(blank, ' 1,640,995,200 s').instant).toBe(1640995200000);
  });

  // The date side and the result cards used to keep showing the old moment.
  test('empties the date side and the result when the text is cleared', () => {
    const typed = editTimestamp(blank, '1640995215');
    expect(editTimestamp(typed, '')).toEqual(blank);
  });

  test('reports text that is not a number and shows no result for it', () => {
    const state = editTimestamp(editTimestamp(blank, '1640995215'), '16409-95215');
    expect(state.instant).toBeNull();
    expect(state.error).not.toBe('');
    expect(state.timestamp).toBe('16409-95215');
    expect(state.date).toBe('');
  });

  test('shows no error while only a minus sign is typed', () => {
    const state = editTimestamp(blank, '-');
    expect(state.instant).toBeNull();
    expect(state.error).toBe('');
  });

  test('clears an earlier error once the text is a number again', () => {
    const state = editTimestamp(editTimestamp(blank, '1-2'), '12');
    expect(state.error).toBe('');
    expect(state.instant).toBe(12000);
  });

  // A millisecond timestamp pasted while the unit is seconds lands in the
  // year 53970. The date used to be written as "53970-..." into a field
  // masked to four year digits.
  test('leaves the date side empty for a year the date field cannot hold', () => {
    const state = editTimestamp(blank, '1640995200000');
    expect(state.instant).toBe(1640995200000 * 1000);
    expect(state.timestamp).toBe('1640995200000');
    expect({ date: state.date, hour: state.hour, minute: state.minute }).toEqual({
      date: '',
      hour: '00',
      minute: '00',
    });
    expect(state.error).toBe('');
    expect(describeInstant(state.instant!).iso).toMatch(/^\+0539\d\d-/);
  });
});

test.describe('editDateTime', () => {
  test('sets the timestamp from a picked date and time', () => {
    const dated = editDateTime(blank, { date: '2024-03-05' });
    expect(dated.instant).toBe(new Date(2024, 2, 5).getTime());
    expect(dated.timestamp).toBe(String(new Date(2024, 2, 5).getTime() / 1000));

    const timed = editDateTime(editDateTime(dated, { hour: '07' }), { minute: '09' });
    expect(timed.instant).toBe(new Date(2024, 2, 5, 7, 9).getTime());
    expect(timed.timestamp).toBe(String(new Date(2024, 2, 5, 7, 9).getTime() / 1000));
    expect({ date: timed.date, hour: timed.hour, minute: timed.minute }).toEqual({
      date: '2024-03-05',
      hour: '07',
      minute: '09',
    });
  });

  test('writes the timestamp in milliseconds when that is the unit', () => {
    const state = editDateTime(blankMs, { date: '2024-03-05' });
    expect(state.timestamp).toBe(String(new Date(2024, 2, 5).getTime()));
  });

  // The masked date field hands every value it is given straight back as a
  // change. Treating that as an edit rewrote the timestamp being typed to the
  // start of its minute: 1640995215 turned into 1640995200.
  test('returns the same state when nothing changed', () => {
    const typed = editTimestamp(blank, '1640995215');
    expect(editDateTime(typed, { date: typed.date })).toBe(typed);
    expect(editDateTime(typed, { hour: typed.hour, minute: typed.minute })).toBe(typed);
    expect(editDateTime(typed, {})).toBe(typed);
    expect(editDateTime(typed, { date: typed.date }).timestamp).toBe('1640995215');
  });

  test('an echo of the emptied date does not touch an out-of-range timestamp', () => {
    const typed = editTimestamp(blank, '1640995200000');
    expect(editDateTime(typed, { date: '' })).toBe(typed);
  });

  test('a real change of the time drops the seconds of the old moment', () => {
    const typed = editTimestamp(blank, '1640995215');
    const nextMinute = typed.minute === '59' ? '58' : pad(Number(typed.minute) + 1);
    const edited = editDateTime(typed, { minute: nextMinute });
    expect(edited.instant! % 60_000).toBe(0);
    expect(edited.timestamp).toBe(String(edited.instant! / 1000));
  });

  test('empties the timestamp while the date is half typed or not a real date', () => {
    const typed = editTimestamp(blank, '1640995215');

    const partial = editDateTime(typed, { date: '2024-0' });
    expect(partial).toMatchObject({ date: '2024-0', timestamp: '', instant: null, error: '' });
    expect(partial.hour).toBe(typed.hour);

    const impossible = editDateTime(typed, { date: '2023-02-30' });
    expect(impossible).toMatchObject({ date: '2023-02-30', timestamp: '', instant: null });

    const cleared = editDateTime(typed, { date: '' });
    expect(cleared).toMatchObject({ date: '', timestamp: '', instant: null });
  });

  test('picking a time before any date changes nothing else', () => {
    expect(editDateTime(blank, { hour: '05' })).toEqual({ ...blank, hour: '05' });
  });

  test('clears a timestamp error', () => {
    const state = editDateTime(editTimestamp(blank, '1-2'), { date: '2024-03-05' });
    expect(state.error).toBe('');
    expect(state.instant).toBe(new Date(2024, 2, 5).getTime());
  });
});

test.describe('showInstant', () => {
  test('puts a moment on both sides at the precision of the unit', () => {
    const seconds = showInstant(blank, 1640995215789);
    expect(seconds.timestamp).toBe('1640995215');
    expect(seconds.instant).toBe(1640995215000);
    expect({ date: seconds.date, hour: seconds.hour, minute: seconds.minute }).toEqual(
      localFields(1640995215000)
    );

    const milliseconds = showInstant(blankMs, 1640995215789);
    expect(milliseconds.timestamp).toBe('1640995215789');
    expect(milliseconds.instant).toBe(1640995215789);
  });

  test('replaces whatever was there before', () => {
    const state = showInstant(editTimestamp(blank, '1-2'), 1640995215000);
    expect(state.error).toBe('');
    expect(state.timestamp).toBe('1640995215');
  });
});

test.describe('changeUnit', () => {
  // The timestamp used to be rebuilt from the date and time, which lost the
  // seconds: 1640995215 became 1640995200000.
  test('keeps the moment and rewrites the timestamp', () => {
    const seconds = editTimestamp(blank, '1640995215');
    const milliseconds = changeUnit(seconds, 'milliseconds');
    expect(milliseconds).toMatchObject({
      unit: 'milliseconds',
      timestamp: '1640995215000',
      instant: 1640995215000,
      date: seconds.date,
      hour: seconds.hour,
      minute: seconds.minute,
    });
    expect(changeUnit(milliseconds, 'seconds')).toEqual(seconds);
  });

  test('rounds down to the second when going from milliseconds to seconds', () => {
    const state = changeUnit(editTimestamp(blankMs, '1640995215789'), 'seconds');
    expect(state.timestamp).toBe('1640995215');
    expect(state.instant).toBe(1640995215000);
  });

  test('reads the text again when it gave no date the field could show', () => {
    const pasted = editTimestamp(blank, '1640995200000');
    const state = changeUnit(pasted, 'milliseconds');
    expect(state.timestamp).toBe('1640995200000');
    expect(state.instant).toBe(1640995200000);
    expect({ date: state.date, hour: state.hour, minute: state.minute }).toEqual(
      localFields(1640995200000)
    );
  });

  test('reads text that was out of range again in the new unit', () => {
    const tooBig = editTimestamp(blank, '8640000000000001');
    expect(tooBig.error).not.toBe('');
    const state = changeUnit(tooBig, 'milliseconds');
    expect(state.error).not.toBe('');
    expect(changeUnit(editTimestamp(blank, '8640000000001'), 'milliseconds')).toMatchObject({
      error: '',
      instant: 8640000000001,
    });
  });

  test('only switches the unit when there is no timestamp', () => {
    expect(changeUnit(blank, 'milliseconds')).toEqual(blankMs);
    const partial = editDateTime(blank, { date: '2024-0' });
    expect(changeUnit(partial, 'milliseconds')).toEqual({ ...partial, unit: 'milliseconds' });
  });

  test('returns the same state for the unit it already has', () => {
    const state = editTimestamp(blank, '1640995215');
    expect(changeUnit(state, 'seconds')).toBe(state);
  });
});

test.describe('formatRelativeTime', () => {
  const now = 1_700_000_000_000;
  const second = 1000;
  const minute = 60 * second;
  const hour = 60 * minute;
  const day = 24 * hour;

  // This used to read "0 second from now".
  test('says "now" within the same second', () => {
    expect(formatRelativeTime(now, now)).toBe('now');
    expect(formatRelativeTime(now - 999, now)).toBe('now');
    expect(formatRelativeTime(now + 999, now)).toBe('now');
  });

  test('counts the past in the largest whole unit', () => {
    expect(formatRelativeTime(now - second, now)).toBe('1 second ago');
    expect(formatRelativeTime(now - 59 * second, now)).toBe('59 seconds ago');
    expect(formatRelativeTime(now - minute, now)).toBe('1 minute ago');
    expect(formatRelativeTime(now - 90 * second, now)).toBe('1 minute ago');
    expect(formatRelativeTime(now - 59 * minute, now)).toBe('59 minutes ago');
    expect(formatRelativeTime(now - 3 * hour, now)).toBe('3 hours ago');
    expect(formatRelativeTime(now - 23 * hour, now)).toBe('23 hours ago');
    expect(formatRelativeTime(now - day, now)).toBe('1 day ago');
    expect(formatRelativeTime(now - 49 * hour, now)).toBe('2 days ago');
  });

  test('counts the future the same way', () => {
    expect(formatRelativeTime(now + second, now)).toBe('1 second from now');
    expect(formatRelativeTime(now + 90 * second, now)).toBe('1 minute from now');
    expect(formatRelativeTime(now + 2 * hour, now)).toBe('2 hours from now');
    expect(formatRelativeTime(now + 400 * day, now)).toBe('400 days from now');
  });
});

test.describe('describeInstant', () => {
  test('gives the ISO, UTC and local forms', () => {
    expect(describeInstant(0)).toEqual({
      iso: '1970-01-01T00:00:00.000Z',
      utc: 'Thu, 01 Jan 1970 00:00:00 GMT',
      local: new Date(0).toLocaleString(),
    });
  });

  test('covers the whole range a parsed timestamp can have', () => {
    expect(describeInstant(8.64e15).iso).toBe('+275760-09-13T00:00:00.000Z');
    expect(describeInstant(-8.64e15).iso).toBe('-271821-04-20T00:00:00.000Z');
  });
});

test('createConverterState starts blank in the given unit', () => {
  expect(blank).toEqual({
    unit: 'seconds',
    timestamp: '',
    date: '',
    hour: '00',
    minute: '00',
    instant: null,
    error: '',
  });
  expect(blankMs.unit).toBe('milliseconds');
});
