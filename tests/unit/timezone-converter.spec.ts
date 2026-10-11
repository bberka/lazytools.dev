import { test, expect } from '@playwright/test';
import {
  COMMON_TIME_ZONES,
  convertTimeZone,
  isValidTimeZone,
  listTimeZones,
  resolveLocalTimeZone,
  searchTimeZones,
  timeZoneLabel,
  toTimeZoneOptions,
  toZonedInputValue,
  type TimeZoneConversion,
} from '@/lib/tools/timezone-converter';

type Converted = Extract<TimeZoneConversion, { status: 'ok' }>;

function convert(input: string, source: string, target: string): Converted {
  const conversion = convertTimeZone(input, source, target);
  expect(conversion.status, `${input} ${source} -> ${target}`).toBe('ok');
  return conversion as Converted;
}

// What V8 returns from Intl.supportedValuesOf('timeZone'), cut down: no UTC,
// and the older names for Kolkata and Buenos Aires.
const V8_STYLE_ZONES = [
  'America/Buenos_Aires',
  'America/New_York',
  'Asia/Calcutta',
  'Asia/Tokyo',
  'Europe/Paris',
];

test.describe('convertTimeZone', () => {
  test('converts standard time and daylight time to UTC', () => {
    const winter = convert('2024-01-15T12:00', 'America/New_York', 'UTC');
    expect(winter.utcDate.toISOString()).toBe('2024-01-15T17:00:00.000Z');
    expect(winter.targetInputValue).toBe('2024-01-15T17:00');
    expect(winter.sourceOffset).toBe('GMT-5');

    const summer = convert('2024-07-15T12:00', 'America/New_York', 'UTC');
    expect(summer.utcDate.toISOString()).toBe('2024-07-15T16:00:00.000Z');
    expect(summer.targetInputValue).toBe('2024-07-15T16:00');
    expect(summer.sourceOffset).toBe('GMT-4');
  });

  test('converts from UTC into a zone', () => {
    const tokyo = convert('2024-02-29T23:59', 'UTC', 'Asia/Tokyo');
    expect(tokyo.targetInputValue).toBe('2024-03-01T08:59');
    expect(tokyo.targetOffset).toBe('GMT+9');
    expect(tokyo.utcDate.toISOString()).toBe('2024-02-29T23:59:00.000Z');
  });

  test('handles half-hour and quarter-hour offsets', () => {
    const kolkata = convert('2024-01-15T12:00', 'Asia/Kolkata', 'UTC');
    expect(kolkata.utcDate.toISOString()).toBe('2024-01-15T06:30:00.000Z');
    expect(kolkata.sourceOffset).toBe('GMT+5:30');

    const kathmandu = convert('2024-01-15T12:00', 'UTC', 'Asia/Kathmandu');
    expect(kathmandu.targetInputValue).toBe('2024-01-15T17:45');
  });

  test('crosses the date line between two zones', () => {
    const conversion = convert('2024-01-15T09:00', 'Asia/Tokyo', 'America/New_York');
    expect(conversion.utcDate.toISOString()).toBe('2024-01-15T00:00:00.000Z');
    expect(conversion.targetInputValue).toBe('2024-01-14T19:00');

    const auckland = convert('2024-01-15T09:00', 'Pacific/Honolulu', 'Pacific/Auckland');
    expect(auckland.targetInputValue).toBe('2024-01-16T08:00');
  });

  test('gives the same wall-clock time back when both zones are the same', () => {
    for (const zone of ['UTC', 'Europe/Berlin', 'Asia/Kolkata', 'America/Los_Angeles']) {
      expect(convert('2024-06-01T08:05', zone, zone).targetInputValue).toBe('2024-06-01T08:05');
    }
  });

  test('describes the result in words', () => {
    const conversion = convert('2024-01-15T12:00', 'America/New_York', 'Europe/Paris');
    expect(conversion.value).toContain('Monday, January 15, 2024');
    expect(conversion.value).toContain('6:00:00');
    expect(conversion.sourceFormatted).toContain('12:00:00');
    expect(conversion.utcFormatted).toContain('5:00:00');
    expect(conversion.utcFormatted).toContain('UTC');
    expect(conversion.targetOffset).toBe('GMT+1');
  });

  // Midnight must come out as hour 00 of the new day. Engines that print it
  // as hour 24 would give "T24:00" here and fail every 00:xx source time.
  test('writes midnight as 00:00 of the next day', () => {
    const toMidnight = convert('2024-01-15T19:00', 'America/New_York', 'UTC');
    expect(toMidnight.targetInputValue).toBe('2024-01-16T00:00');

    const fromMidnight = convert('2024-01-15T00:30', 'America/New_York', 'UTC');
    expect(fromMidnight.utcDate.toISOString()).toBe('2024-01-15T05:30:00.000Z');

    const utcMidnight = convert('2024-12-31T00:00', 'UTC', 'UTC');
    expect(utcMidnight.targetInputValue).toBe('2024-12-31T00:00');
  });

  test('reports a time the source zone skips when daylight saving starts', () => {
    expect(convertTimeZone('2024-03-10T02:30', 'America/New_York', 'UTC').status).toBe(
      'nonexistent'
    );
    expect(convertTimeZone('2024-03-31T02:30', 'Europe/Berlin', 'UTC').status).toBe('nonexistent');
    // Lord Howe Island moves its clocks by half an hour: 02:00 becomes 02:30.
    expect(convertTimeZone('2024-10-06T02:15', 'Australia/Lord_Howe', 'UTC').status).toBe(
      'nonexistent'
    );
  });

  test('converts the times on either side of the skipped hour', () => {
    expect(
      convert('2024-03-10T01:59', 'America/New_York', 'UTC').utcDate.toISOString()
    ).toBe('2024-03-10T06:59:00.000Z');
    expect(
      convert('2024-03-10T03:00', 'America/New_York', 'UTC').utcDate.toISOString()
    ).toBe('2024-03-10T07:00:00.000Z');
    expect(
      convert('2024-10-06T02:45', 'Australia/Lord_Howe', 'UTC').utcDate.toISOString()
    ).toBe('2024-10-05T15:45:00.000Z');
  });

  test('resolves a time that happens twice to one of its two moments', () => {
    const conversion = convert('2024-11-03T01:30', 'America/New_York', 'UTC');
    expect(['2024-11-03T05:30:00.000Z', '2024-11-03T06:30:00.000Z']).toContain(
      conversion.utcDate.toISOString()
    );
  });

  test('a zone that only skips the hour does not affect other zones', () => {
    expect(convertTimeZone('2024-03-10T02:30', 'America/Phoenix', 'UTC').status).toBe('ok');
    expect(convertTimeZone('2024-03-10T02:30', 'UTC', 'America/New_York').status).toBe('ok');
  });

  // Date.UTC reads years 0 to 99 as 1900 to 1999, so these were rejected with
  // "Enter a valid date and time."
  test('accepts years below 100', () => {
    const conversion = convert('0050-06-15T12:00', 'UTC', 'UTC');
    expect(conversion.utcDate.toISOString()).toBe('0050-06-15T12:00:00.000Z');
    expect(conversion.targetInputValue).toBe('0050-06-15T12:00');
  });

  test('is empty without input', () => {
    expect(convertTimeZone('', 'UTC', 'Asia/Tokyo')).toEqual({ status: 'empty' });
  });

  test('rejects input that is not a complete, real date and time', () => {
    for (const input of [
      '2024-02-30T10:00',
      '2023-02-29T10:00',
      '2024-01-01T24:00',
      '2024-01-01T10:60',
      '2024-01-01',
      '2024-0T10:00',
      '2024-01-01T1:00',
      '0000-01-01T00:00',
      'tomorrow',
    ]) {
      expect(convertTimeZone(input, 'UTC', 'UTC'), input).toEqual({ status: 'invalid' });
    }
  });
});

// "Now" fills the form with the clock of the From zone, not the visitor's.
test.describe('toZonedInputValue', () => {
  const moment = new Date('2025-03-16T02:45:30Z');

  test('reads the wall clock of a moment in each zone, to the minute', () => {
    expect(toZonedInputValue(moment, 'UTC')).toBe('2025-03-16T02:45');
    expect(toZonedInputValue(moment, 'Asia/Tokyo')).toBe('2025-03-16T11:45');
    // Still the 15th, and daylight saving time has started in New York.
    expect(toZonedInputValue(moment, 'America/New_York')).toBe('2025-03-15T22:45');
    expect(toZonedInputValue(moment, 'Asia/Kathmandu')).toBe('2025-03-16T08:30');
  });

  test('writes midnight as 00:00', () => {
    expect(toZonedInputValue(new Date('2025-03-16T00:00:00Z'), 'UTC')).toBe('2025-03-16T00:00');
    expect(toZonedInputValue(new Date('2025-03-16T15:00:00Z'), 'Asia/Tokyo')).toBe(
      '2025-03-17T00:00'
    );
  });

  test('converts back to the same moment through convertTimeZone', () => {
    const wallClock = toZonedInputValue(moment, 'Asia/Tokyo');
    const conversion = convert(wallClock, 'Asia/Tokyo', 'UTC');
    expect(conversion.utcDate.toISOString()).toBe('2025-03-16T02:45:00.000Z');
  });
});

test.describe('listTimeZones', () => {
  // The pickers used to offer exactly the runtime's list, so in Chrome
  // "utc", "kolkata" and "argentina" found nothing.
  test('adds the common zones the runtime leaves out', () => {
    const zones = listTimeZones(V8_STYLE_ZONES);

    expect(zones).toContain('UTC');
    expect(zones).toContain('Asia/Kolkata');
    expect(zones).toContain('America/Argentina/Buenos_Aires');
    for (const zone of [...V8_STYLE_ZONES, ...COMMON_TIME_ZONES]) {
      expect(zones, zone).toContain(zone);
    }
  });

  test('is sorted and has no duplicates', () => {
    const zones = listTimeZones(V8_STYLE_ZONES);

    expect(new Set(zones).size).toBe(zones.length);
    expect(zones).toEqual([...zones].sort());
    // Two of the five runtime zones are not among the common ones.
    expect(zones.length).toBe(COMMON_TIME_ZONES.length + 2);
  });

  test('includes extra zones', () => {
    expect(listTimeZones([], ['Antarctica/Troll'])).toContain('Antarctica/Troll');
    expect(listTimeZones([], ['UTC']).filter((zone) => zone === 'UTC')).toHaveLength(1);
  });

  test('falls back to the common zones when the runtime has no list', () => {
    expect(listTimeZones([])).toEqual([...COMMON_TIME_ZONES].sort());
  });

  test('offers only zones this runtime can convert', () => {
    const zones = listTimeZones();

    expect(zones.length).toBeGreaterThanOrEqual(COMMON_TIME_ZONES.length);
    expect(zones).toContain('UTC');
    expect(zones.filter((zone) => !isValidTimeZone(zone))).toEqual([]);
  });
});

test.describe('time zone names', () => {
  // The label used to be "America/New / York".
  test('timeZoneLabel shows underscores as spaces', () => {
    expect(timeZoneLabel('America/New_York')).toBe('America/New York');
    expect(timeZoneLabel('America/Argentina/Buenos_Aires')).toBe('America/Argentina/Buenos Aires');
    expect(timeZoneLabel('America/Port_of_Spain')).toBe('America/Port of Spain');
    expect(timeZoneLabel('UTC')).toBe('UTC');
  });

  test('toTimeZoneOptions keeps the zone as the value', () => {
    expect(toTimeZoneOptions(['Asia/Hong_Kong', 'UTC'])).toEqual([
      { value: 'Asia/Hong_Kong', label: 'Asia/Hong Kong' },
      { value: 'UTC', label: 'UTC' },
    ]);
  });

  test('isValidTimeZone tells real zones from made-up ones', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  test('resolveLocalTimeZone returns a zone that can be converted', () => {
    expect(isValidTimeZone(resolveLocalTimeZone())).toBe(true);
  });
});

test.describe('searchTimeZones', () => {
  const options = toTimeZoneOptions(listTimeZones(V8_STYLE_ZONES));
  const values = (query: string, limit?: number) =>
    searchTimeZones(options, query, limit).map((option) => option.value);

  // "new york" matched neither "america/new_york" nor "america/new / york".
  test('finds a zone by its name written with spaces', () => {
    expect(values('new york')).toEqual(['America/New_York']);
    expect(values('hong kong')).toEqual(['Asia/Hong_Kong']);
    expect(values('buenos aires')).toEqual([
      'America/Argentina/Buenos_Aires',
      'America/Buenos_Aires',
    ]);
  });

  test('ignores case, underscores and extra spaces', () => {
    expect(values('New_York')).toEqual(['America/New_York']);
    expect(values('  NEW   york ')).toEqual(['America/New_York']);
    expect(values('america/new')).toEqual(['America/New_York']);
  });

  test('finds the common zones the runtime list lacks', () => {
    expect(values('utc')).toEqual(['UTC']);
    expect(values('kolkata')).toEqual(['Asia/Kolkata']);
    expect(values('calcutta')).toEqual(['Asia/Calcutta']);
  });

  test('keeps the list order and stops at the limit', () => {
    expect(values('europe/', 3)).toEqual(['Europe/Amsterdam', 'Europe/Berlin', 'Europe/Istanbul']);
    expect(values('a', 5)).toHaveLength(5);
  });

  // Enter picks the first result, so the likelier zone has to lead.
  test('lists names where the query starts a word first', () => {
    const zones = toTimeZoneOptions([
      'Antarctica/Vostok',
      'Asia/Tokyo',
      'America/North_Dakota/New_Salem',
      'America/Port-au-Prince',
      'Europe/Paris',
    ]);
    const found = (query: string) => searchTimeZones(zones, query).map((option) => option.value);

    expect(found('tok')).toEqual(['Asia/Tokyo', 'Antarctica/Vostok']);
    expect(found('salem')).toEqual(['America/North_Dakota/New_Salem']);
    expect(found('prince')).toEqual(['America/Port-au-Prince']);
    expect(found('ar')).toEqual(['Antarctica/Vostok', 'Europe/Paris']);
    expect(found('a')).toEqual([
      'Antarctica/Vostok',
      'Asia/Tokyo',
      'America/North_Dakota/New_Salem',
      'America/Port-au-Prince',
      'Europe/Paris',
    ]);
  });

  test('returns nothing when no zone matches', () => {
    expect(values('atlantis')).toEqual([]);
  });

  test('a blank query matches every zone up to the limit', () => {
    expect(values('', 1000)).toEqual(options.map((option) => option.value));
    expect(values('   ', 4)).toHaveLength(4);
  });
});
