/**
 * Calendar-date helpers shared by the date and time tools: age calculator,
 * date difference calculator, timestamp converter and timezone converter.
 *
 * A "date input value" is the `YYYY-MM-DD` text of a date field. Parsed dates
 * are `Date`s at UTC midnight, so day arithmetic on them never crosses a
 * daylight saving change. Only `toDateInputValue` reads the runtime's time
 * zone; everything else is pure.
 */

export const DAY_IN_MS = 24 * 60 * 60 * 1000;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/**
 * `Date.UTC` that takes the year literally. `Date.UTC(50, 0, 1)` is 1950;
 * `utcTime(50, 0, 1)` is the year 50. Out-of-range months, days and times roll
 * over the same way they do in `Date.UTC`.
 */
export function utcTime(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): number {
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(utcTime(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Reads a `YYYY-MM-DD` value as a date at UTC midnight. Returns null for
 * anything that is not a real calendar date in the years 0001 to 9999, such as
 * a half-typed value or 30 February.
 */
export function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);

  // 0000 is 1 BC, which neither the date field nor the formatted output can show.
  if (year < 1) {
    return null;
  }

  const date = new Date(utcTime(year, monthIndex, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/** Builds a date input value from calendar fields; `month` is 1 to 12. */
export function formatDateInput(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** The calendar date of `date` in the runtime's time zone, as a date input value. */
export function toDateInputValue(date: Date): string {
  return formatDateInput(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

const LONG_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "June 15, 1990" for a date at UTC midnight, as `parseDateInput` returns it. */
export function formatLongUtcDate(date: Date | number): string {
  return LONG_DATE_FORMAT.format(date);
}

/** "June 15, 1990" for "1990-06-15". A value that is not a date is returned as it is. */
export function formatLongDate(value: string): string {
  const date = parseDateInput(value);

  return date ? formatLongUtcDate(date) : value;
}
