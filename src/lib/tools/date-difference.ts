/**
 * Calendar arithmetic behind the age calculator and the date difference
 * calculator. Dates go in as `YYYY-MM-DD` input values.
 *
 * A difference is counted the way java.time's `Period.between` and Temporal's
 * `PlainDate.until` count it: as many whole months as fit, then the days left
 * over. A month is whole once the end's day of month reaches the start's. The
 * leftover days are counted from the start date moved on by those months, and
 * pulled back to the last day of that month when the month is too short to
 * have the start's day (31 January plus one month is 28 or 29 February).
 */

import {
  DAY_IN_MS,
  daysInMonth,
  formatLongUtcDate,
  parseDateInput,
  utcTime,
} from './calendar-date';

export interface CalendarDifference {
  years: number;
  months: number;
  days: number;
  totalMonths: number;
  totalWeeks: number;
  totalDays: number;
}

export interface AgeBreakdown extends CalendarDifference {
  nextBirthdayAge: number;
  nextBirthdayLabel: string;
  nextBirthdayDaysAway: number;
}

function daysBetween(from: number, to: number): number {
  return Math.round((to - from) / DAY_IN_MS);
}

/**
 * Years, months and days from `startValue` to `endValue`, plus the same span
 * as totals. Returns null when either value is not a real date or the end is
 * before the start.
 */
export function calendarDifference(
  startValue: string,
  endValue: string
): CalendarDifference | null {
  const start = parseDateInput(startValue);
  const end = parseDateInput(endValue);

  if (!start || !end || end < start) {
    return null;
  }

  const startYear = start.getUTCFullYear();
  const startDay = start.getUTCDate();
  let totalMonths =
    (end.getUTCFullYear() - startYear) * 12 + (end.getUTCMonth() - start.getUTCMonth());

  if (end.getUTCDate() < startDay) {
    totalMonths -= 1;
  }

  // The start date moved on by the whole months. Borrowing the length of the
  // month before the end instead goes wrong when that month is shorter than
  // the start's day: 31 January to 1 March came out as "1 month, -2 days".
  const anchorMonthIndex = start.getUTCMonth() + totalMonths;
  const anchor = utcTime(
    startYear,
    anchorMonthIndex,
    Math.min(startDay, daysInMonth(startYear, anchorMonthIndex))
  );
  const totalDays = daysBetween(start.getTime(), end.getTime());

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days: daysBetween(anchor, end.getTime()),
    totalMonths,
    totalWeeks: Math.floor(totalDays / 7),
    totalDays,
  };
}

/**
 * Age on `targetValue` for someone born on `birthValue`, with the next
 * birthday on or after the target date. Returns null when either value is not
 * a real date or the target is before the birth.
 */
export function calculateAge(birthValue: string, targetValue: string): AgeBreakdown | null {
  const difference = calendarDifference(birthValue, targetValue);
  const birth = parseDateInput(birthValue);
  const target = parseDateInput(targetValue);

  if (!difference || !birth || !target) {
    return null;
  }

  // A 29 February birthday has no date in a common year. The age in years
  // goes up on 1 March then, so that is the birthday: `utcTime` rolls the
  // missing day over to it.
  const birthMonthIndex = birth.getUTCMonth();
  const birthDay = birth.getUTCDate();
  const targetYear = target.getUTCFullYear();
  let nextBirthday = utcTime(targetYear, birthMonthIndex, birthDay);

  if (nextBirthday < target.getTime()) {
    nextBirthday = utcTime(targetYear + 1, birthMonthIndex, birthDay);
  }

  const nextBirthdayDaysAway = daysBetween(target.getTime(), nextBirthday);

  return {
    ...difference,
    nextBirthdayAge: difference.years + (nextBirthdayDaysAway === 0 ? 0 : 1),
    nextBirthdayLabel: formatLongUtcDate(nextBirthday),
    nextBirthdayDaysAway,
  };
}

function count(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

/** "34 years, 1 month, 1 day". */
export function formatDuration(
  duration: Pick<CalendarDifference, 'years' | 'months' | 'days'>
): string {
  return [
    count(duration.years, 'year'),
    count(duration.months, 'month'),
    count(duration.days, 'day'),
  ].join(', ');
}

const COUNT_FORMAT = new Intl.NumberFormat('en-US');

/** A whole number with thousands separators: 12,345. */
export function formatCount(value: number): string {
  return COUNT_FORMAT.format(value);
}
