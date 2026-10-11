/**
 * Timezone converter logic: turns a wall-clock date and time in one IANA time
 * zone into the same moment in another, and supplies the zone list and its
 * search. All zone rules come from the runtime's `Intl` data; nothing here
 * touches the DOM or the network.
 */

import { formatDateInput, parseDateInput, utcTime } from './calendar-date';

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export interface TimeZoneOption {
  value: string;
  label: string;
}

export const COMMON_TIME_ZONES: readonly string[] = [
  'UTC',
  // Americas
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  // Europe
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Istanbul',
  'Europe/Moscow',
  // Africa
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Johannesburg',
  // Middle East & Asia
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  // Oceania
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Pacific/Honolulu',
];

const MAX_SEARCH_RESULTS = 50;

// ---------------------------------------------------------------------------
// Zone list
// ---------------------------------------------------------------------------

function runtimeTimeZones(): string[] {
  const supportedValuesOf = Intl.supportedValuesOf as
    | ((key: 'timeZone') => string[])
    | undefined;

  return typeof supportedValuesOf === 'function' ? supportedValuesOf('timeZone') : [];
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The zone the runtime is set to, or UTC when it cannot say. */
export function resolveLocalTimeZone(): string {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timeZone && isValidTimeZone(timeZone) ? timeZone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Every zone the pickers offer, sorted by name: the runtime's own list plus
 * the common zones and any `extra` ones. The runtime list alone is not enough:
 * V8 leaves out UTC and names some zones by an older alias (Asia/Calcutta for
 * Asia/Kolkata), so those could not be found by search.
 */
export function listTimeZones(
  supported: readonly string[] = runtimeTimeZones(),
  extra: readonly string[] = []
): string[] {
  const zones = new Set([...COMMON_TIME_ZONES, ...supported, ...extra]);

  return [...zones].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/** "America/New York" for "America/New_York". */
export function timeZoneLabel(timeZone: string): string {
  return timeZone.replace(/_/g, ' ');
}

export function toTimeZoneOptions(timeZones: readonly string[]): TimeZoneOption[] {
  return timeZones.map((timeZone) => ({ value: timeZone, label: timeZoneLabel(timeZone) }));
}

function searchKey(text: string): string {
  return text.toLowerCase().replace(/[_\s]+/g, ' ').trim();
}

/**
 * The options whose name contains `query`, capped at `limit`. Case,
 * underscores and extra spaces do not matter, so "new york" and "New_York"
 * both find America/New_York. Names where the query starts a word come first
 * ("tok" lists Asia/Tokyo before Antarctica/Vostok); otherwise the given
 * order is kept. A blank query matches everything.
 */
export function searchTimeZones(
  options: readonly TimeZoneOption[],
  query: string,
  limit = MAX_SEARCH_RESULTS
): TimeZoneOption[] {
  const needle = searchKey(query);
  const startingAWord: TimeZoneOption[] = [];
  const insideAWord: TimeZoneOption[] = [];

  for (const option of options) {
    const name = searchKey(option.value);

    if (
      name.startsWith(needle) ||
      ['/', ' ', '-'].some((separator) => name.includes(separator + needle))
    ) {
      startingAWord.push(option);
    } else if (name.includes(needle)) {
      insideAWord.push(option);
    }
  }

  return [...startingAWord, ...insideAWord].slice(0, limit);
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

function parseDateTimeInput(value: string): DateParts | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  const date = match ? parseDateInput(match[1]) : null;

  if (!match || !date) {
    return null;
  }

  const hour = Number(match[2]);
  const minute = Number(match[3]);

  if (hour > 23 || minute > 59) {
    return null;
  }

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour,
    minute,
    second: 0,
  };
}

function toDateTimeInput(parts: DateParts): string {
  const hour = String(parts.hour).padStart(2, '0');
  const minute = String(parts.minute).padStart(2, '0');

  return `${formatDateInput(parts.year, parts.month, parts.day)}T${hour}:${minute}`;
}

function getTimeZoneParts(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    // Not `hour12: false`: older engines print midnight as hour 24 with it,
    // which made every 00:xx time look a day off.
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  ) as Record<string, number>;

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour % 24,
    minute: map.minute,
    second: map.second,
  };
}

function wallClockAsUtc(parts: DateParts): number {
  return utcTime(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function getTimeZoneOffsetMinutes(timestamp: number, timeZone: string): number {
  return (wallClockAsUtc(getTimeZoneParts(new Date(timestamp), timeZone)) - timestamp) / 60000;
}

function sameMinute(left: DateParts, right: DateParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

/**
 * The moment a wall-clock time happens in `timeZone`, or null when the zone
 * skips that time (the hour lost when daylight saving starts). A time that
 * happens twice, when daylight saving ends, resolves to one of the two.
 */
function zonedDateTimeToUtc(parts: DateParts, timeZone: string): Date | null {
  const utcGuess = wallClockAsUtc(parts);

  let timestamp = utcGuess;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(timestamp, timeZone);
    const candidate = utcGuess - offsetMinutes * 60_000;
    const candidateParts = getTimeZoneParts(new Date(candidate), timeZone);

    timestamp = candidate;

    if (sameMinute(candidateParts, parts)) {
      return new Date(candidate);
    }
  }

  return null;
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(date);
}

function formatOffset(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const offsetPart = parts.find((part) => part.type === 'timeZoneName')?.value;

  return offsetPart ?? 'UTC';
}

export type TimeZoneConversion =
  /** No date and time yet. */
  | { status: 'empty' }
  /** The input is not a complete, real date and time. */
  | { status: 'invalid' }
  /** The source zone skips this wall-clock time. */
  | { status: 'nonexistent' }
  | {
      status: 'ok';
      utcDate: Date;
      /** Full date and time in the target zone. */
      value: string;
      /** The target wall-clock time as `YYYY-MM-DDTHH:mm`. */
      targetInputValue: string;
      targetOffset: string;
      sourceFormatted: string;
      sourceOffset: string;
      utcFormatted: string;
    };

/**
 * Converts `input`, a `YYYY-MM-DDTHH:mm` wall-clock time in `sourceTimeZone`,
 * to `targetTimeZone`.
 */
export function convertTimeZone(
  input: string,
  sourceTimeZone: string,
  targetTimeZone: string
): TimeZoneConversion {
  if (!input) {
    return { status: 'empty' };
  }

  const inputParts = parseDateTimeInput(input);

  if (!inputParts) {
    return { status: 'invalid' };
  }

  const utcDate = zonedDateTimeToUtc(inputParts, sourceTimeZone);

  if (!utcDate) {
    return { status: 'nonexistent' };
  }

  return {
    status: 'ok',
    utcDate,
    value: formatDateInTimeZone(utcDate, targetTimeZone),
    targetInputValue: toDateTimeInput(getTimeZoneParts(utcDate, targetTimeZone)),
    targetOffset: formatOffset(utcDate, targetTimeZone),
    sourceFormatted: formatDateInTimeZone(utcDate, sourceTimeZone),
    sourceOffset: formatOffset(utcDate, sourceTimeZone),
    utcFormatted: formatDateInTimeZone(utcDate, 'UTC'),
  };
}
