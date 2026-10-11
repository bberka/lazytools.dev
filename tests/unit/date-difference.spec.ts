import { test, expect } from '@playwright/test';
import { DAY_IN_MS, daysInMonth, utcTime } from '@/lib/tools/calendar-date';
import {
  calculateAge,
  calendarDifference,
  formatCount,
  formatDuration,
} from '@/lib/tools/date-difference';

const ymd = (start: string, end: string) => {
  const difference = calendarDifference(start, end);
  return difference && [difference.years, difference.months, difference.days];
};

test.describe('calendarDifference', () => {
  test('is zero for the same day', () => {
    expect(calendarDifference('2024-05-10', '2024-05-10')).toEqual({
      years: 0,
      months: 0,
      days: 0,
      totalMonths: 0,
      totalWeeks: 0,
      totalDays: 0,
    });
  });

  test('counts days inside one month', () => {
    expect(ymd('2024-01-01', '2024-01-31')).toEqual([0, 0, 30]);
    expect(ymd('2024-01-01', '2024-01-02')).toEqual([0, 0, 1]);
  });

  test('counts whole months and years on matching days', () => {
    expect(ymd('2024-01-15', '2024-02-15')).toEqual([0, 1, 0]);
    expect(ymd('2023-01-31', '2023-03-31')).toEqual([0, 2, 0]);
    expect(ymd('2000-01-01', '2024-01-01')).toEqual([24, 0, 0]);
    expect(ymd('1990-06-15', '2024-06-15')).toEqual([34, 0, 0]);
  });

  test('borrows from the month before the end when the end day is earlier', () => {
    expect(ymd('2023-01-15', '2023-02-10')).toEqual([0, 0, 26]);
    expect(ymd('2023-12-25', '2024-01-05')).toEqual([0, 0, 11]);
    expect(ymd('1990-06-15', '2024-06-14')).toEqual([33, 11, 30]);
    // The figure the tool's own static page showed before this module existed.
    expect(ymd('1990-06-15', '2026-10-11')).toEqual([36, 3, 26]);
  });

  // The old borrow added the length of the month before the end even when the
  // start day does not exist in it: these gave "1 months, -2 days",
  // "34 years, 1 months, -1 days" and "1 months, -1 days".
  test('never goes negative when the borrowed month is shorter than the start day', () => {
    expect(ymd('2023-01-31', '2023-03-01')).toEqual([0, 1, 1]);
    expect(ymd('1990-01-31', '2024-03-01')).toEqual([34, 1, 1]);
    expect(ymd('2023-01-30', '2023-03-01')).toEqual([0, 1, 1]);
    expect(ymd('2023-01-29', '2023-03-01')).toEqual([0, 1, 1]);
    expect(ymd('2024-01-31', '2024-03-01')).toEqual([0, 1, 1]);
    expect(ymd('2023-03-31', '2023-05-05')).toEqual([0, 1, 5]);
  });

  test('does not call a short month whole before the start day is reached', () => {
    expect(ymd('2023-01-31', '2023-02-28')).toEqual([0, 0, 28]);
    expect(ymd('2024-01-31', '2024-02-29')).toEqual([0, 0, 29]);
    expect(ymd('2023-08-31', '2023-09-30')).toEqual([0, 0, 30]);
  });

  test('handles 29 February starts', () => {
    expect(ymd('2020-02-29', '2021-02-28')).toEqual([0, 11, 30]);
    expect(ymd('2020-02-29', '2021-03-01')).toEqual([1, 0, 1]);
    expect(ymd('2020-02-29', '2024-02-28')).toEqual([3, 11, 30]);
    expect(ymd('2020-02-29', '2024-02-29')).toEqual([4, 0, 0]);
  });

  test('reports the span as totals', () => {
    // 24 years with leap days in 2000, 2004, 2008, 2012, 2016 and 2020.
    expect(calendarDifference('2000-01-01', '2024-01-01')).toMatchObject({
      totalMonths: 288,
      totalDays: 24 * 365 + 6,
      totalWeeks: 1252,
    });
    expect(calendarDifference('2023-01-31', '2023-03-01')).toMatchObject({
      totalMonths: 1,
      totalDays: 29,
      totalWeeks: 4,
    });
    expect(calendarDifference('2024-01-01', '2024-01-07')).toMatchObject({ totalWeeks: 0 });
    expect(calendarDifference('2024-01-01', '2024-01-08')).toMatchObject({ totalWeeks: 1 });
  });

  test('works for years below 100', () => {
    expect(ymd('0050-01-01', '0051-03-01')).toEqual([1, 2, 0]);
    expect(calendarDifference('0099-12-31', '0100-01-01')?.totalDays).toBe(1);
  });

  test('returns null for an end before the start or a value that is not a date', () => {
    expect(calendarDifference('2024-01-02', '2024-01-01')).toBeNull();
    expect(calendarDifference('2023-02-29', '2024-01-01')).toBeNull();
    expect(calendarDifference('2024-01-01', '')).toBeNull();
    expect(calendarDifference('2024-0', '2024-01-01')).toBeNull();
  });

  // Every start day of two years, a leap one included, against every end up
  // to 800 days later: the parts stay in range, and adding them back to the
  // start gives the end.
  test('always gives parts that add back up to the end date', () => {
    const firstStart = utcTime(2023, 0, 1);
    const failures: string[] = [];

    for (let startOffset = 0; startOffset < 731; startOffset += 1) {
      const start = new Date(firstStart + startOffset * DAY_IN_MS);
      const startValue = start.toISOString().slice(0, 10);

      for (let span = 0; span <= 800; span += 1) {
        const end = new Date(start.getTime() + span * DAY_IN_MS);
        const endValue = end.toISOString().slice(0, 10);
        const difference = calendarDifference(startValue, endValue);

        if (!difference) {
          failures.push(`${startValue} to ${endValue}: null`);
          continue;
        }

        const monthIndex = start.getUTCMonth() + difference.totalMonths;
        const day = Math.min(start.getUTCDate(), daysInMonth(start.getUTCFullYear(), monthIndex));
        const rebuilt =
          utcTime(start.getUTCFullYear(), monthIndex, day) + difference.days * DAY_IN_MS;

        if (
          rebuilt !== end.getTime() ||
          difference.days < 0 ||
          difference.days > 30 ||
          difference.months < 0 ||
          difference.months > 11 ||
          difference.totalMonths !== difference.years * 12 + difference.months ||
          difference.totalDays !== span
        ) {
          failures.push(`${startValue} to ${endValue}: ${JSON.stringify(difference)}`);
        }
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
  });
});

test.describe('calculateAge', () => {
  test('gives the age and the next birthday', () => {
    // 36 years with nine leap days (1992 to 2024) are 13,149 days; 15 June to
    // 11 October is another 118.
    expect(calculateAge('1990-06-15', '2026-10-11')).toEqual({
      years: 36,
      months: 3,
      days: 26,
      totalMonths: 435,
      totalWeeks: 1895,
      totalDays: 13267,
      nextBirthdayAge: 37,
      nextBirthdayLabel: 'June 15, 2027',
      // 20 days left in October, then November to May, then 15 days of June.
      nextBirthdayDaysAway: 20 + 30 + 31 + 31 + 28 + 31 + 30 + 31 + 15,
    });
  });

  test('says the birthday is today on the birthday', () => {
    expect(calculateAge('1990-06-15', '2024-06-15')).toMatchObject({
      years: 34,
      months: 0,
      days: 0,
      nextBirthdayAge: 34,
      nextBirthdayLabel: 'June 15, 2024',
      nextBirthdayDaysAway: 0,
    });
  });

  test('counts down to a birthday later in the year or in the next one', () => {
    expect(calculateAge('1990-06-15', '2024-06-14')).toMatchObject({
      years: 33,
      nextBirthdayAge: 34,
      nextBirthdayLabel: 'June 15, 2024',
      nextBirthdayDaysAway: 1,
    });
    expect(calculateAge('1990-06-15', '2024-06-16')).toMatchObject({
      years: 34,
      nextBirthdayAge: 35,
      nextBirthdayLabel: 'June 15, 2025',
      nextBirthdayDaysAway: 364,
    });
    expect(calculateAge('1990-12-31', '2024-01-01')).toMatchObject({
      years: 33,
      nextBirthdayAge: 34,
      nextBirthdayLabel: 'December 31, 2024',
      nextBirthdayDaysAway: 365,
    });
  });

  // The next birthday used to be pulled back to 28 February while the age
  // only went up on 1 March, so 28 February read "Turns 22 in 0 days" for
  // someone who had been 22 for a year.
  test('keeps a 29 February birthday in step with the age in a common year', () => {
    expect(calculateAge('2000-02-29', '2023-02-27')).toMatchObject({
      years: 22,
      nextBirthdayAge: 23,
      nextBirthdayLabel: 'March 1, 2023',
      nextBirthdayDaysAway: 2,
    });
    expect(calculateAge('2000-02-29', '2023-02-28')).toMatchObject({
      years: 22,
      months: 11,
      days: 30,
      nextBirthdayAge: 23,
      nextBirthdayLabel: 'March 1, 2023',
      nextBirthdayDaysAway: 1,
    });
    expect(calculateAge('2000-02-29', '2023-03-01')).toMatchObject({
      years: 23,
      nextBirthdayAge: 23,
      nextBirthdayLabel: 'March 1, 2023',
      nextBirthdayDaysAway: 0,
    });
  });

  test('uses 29 February itself in a leap year', () => {
    expect(calculateAge('2000-02-29', '2024-02-28')).toMatchObject({
      years: 23,
      nextBirthdayAge: 24,
      nextBirthdayLabel: 'February 29, 2024',
      nextBirthdayDaysAway: 1,
    });
    expect(calculateAge('2000-02-29', '2024-02-29')).toMatchObject({
      years: 24,
      months: 0,
      days: 0,
      nextBirthdayAge: 24,
      nextBirthdayDaysAway: 0,
    });
    expect(calculateAge('2000-02-29', '2024-03-01')).toMatchObject({
      years: 24,
      nextBirthdayAge: 25,
      nextBirthdayLabel: 'March 1, 2025',
      nextBirthdayDaysAway: 365,
    });
  });

  // On whatever day the next birthday falls, the age in years is the age the
  // tool says the person turns.
  test('the age in years goes up exactly on the next birthday', () => {
    const failures: string[] = [];

    for (const birth of ['2000-02-29', '1996-02-29', '1990-06-15', '1988-12-31', '2001-01-01']) {
      for (let offset = 0; offset < 1500; offset += 1) {
        const targetTime = utcTime(2021, 0, 1) + offset * DAY_IN_MS;
        const target = new Date(targetTime).toISOString().slice(0, 10);
        const age = calculateAge(birth, target)!;
        const birthday = new Date(targetTime + age.nextBirthdayDaysAway * DAY_IN_MS)
          .toISOString()
          .slice(0, 10);
        const dayBefore = new Date(targetTime + (age.nextBirthdayDaysAway - 1) * DAY_IN_MS)
          .toISOString()
          .slice(0, 10);

        if (
          age.nextBirthdayDaysAway < 0 ||
          age.nextBirthdayDaysAway > 366 ||
          calculateAge(birth, birthday)!.years !== age.nextBirthdayAge ||
          calculateAge(birth, dayBefore)!.years !== age.nextBirthdayAge - 1
        ) {
          failures.push(`${birth} at ${target}: ${JSON.stringify(age)}`);
        }
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
  });

  test('returns null for a target before the birth or a value that is not a date', () => {
    expect(calculateAge('2024-06-15', '2024-06-14')).toBeNull();
    expect(calculateAge('', '2024-06-14')).toBeNull();
    expect(calculateAge('1990-06-31', '2024-06-14')).toBeNull();
  });
});

test.describe('formatDuration', () => {
  test('uses the singular for one and the plural otherwise', () => {
    expect(formatDuration({ years: 1, months: 1, days: 1 })).toBe('1 year, 1 month, 1 day');
    expect(formatDuration({ years: 0, months: 0, days: 0 })).toBe('0 years, 0 months, 0 days');
    expect(formatDuration({ years: 34, months: 11, days: 30 })).toBe(
      '34 years, 11 months, 30 days'
    );
    expect(formatDuration({ years: 2, months: 1, days: 0 })).toBe('2 years, 1 month, 0 days');
  });

  test('formats a difference directly', () => {
    expect(formatDuration(calendarDifference('1990-01-31', '2024-03-01')!)).toBe(
      '34 years, 1 month, 1 day'
    );
  });
});

test('formatCount adds thousands separators', () => {
  expect(formatCount(0)).toBe('0');
  expect(formatCount(999)).toBe('999');
  expect(formatCount(13267)).toBe('13,267');
  expect(formatCount(1234567)).toBe('1,234,567');
});
