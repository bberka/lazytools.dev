import { test, expect } from '@playwright/test';
import {
  DAY_IN_MS,
  daysInMonth,
  formatDateInput,
  formatLongDate,
  formatLongUtcDate,
  parseDateInput,
  toDateInputValue,
  utcTime,
} from '@/lib/tools/calendar-date';

test.describe('utcTime', () => {
  test('matches Date.UTC for ordinary years', () => {
    expect(utcTime(2024, 1, 29)).toBe(Date.UTC(2024, 1, 29));
    expect(utcTime(1970, 0, 1)).toBe(0);
    expect(utcTime(2024, 5, 15, 13, 45, 30)).toBe(Date.UTC(2024, 5, 15, 13, 45, 30));
  });

  test('takes years below 100 literally, unlike Date.UTC', () => {
    expect(new Date(Date.UTC(50, 0, 1)).getUTCFullYear()).toBe(1950);
    expect(new Date(utcTime(50, 0, 1)).toISOString()).toBe('0050-01-01T00:00:00.000Z');
    expect(new Date(utcTime(1, 0, 1)).toISOString()).toBe('0001-01-01T00:00:00.000Z');
  });

  test('rolls over days, months and hours that are out of range', () => {
    expect(new Date(utcTime(2023, 1, 29)).toISOString()).toBe('2023-03-01T00:00:00.000Z');
    expect(new Date(utcTime(2023, 12, 1)).toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(new Date(utcTime(2023, 0, 1, 24)).toISOString()).toBe('2023-01-02T00:00:00.000Z');
    expect(new Date(utcTime(2023, 2, 0)).toISOString()).toBe('2023-02-28T00:00:00.000Z');
  });
});

test.describe('daysInMonth', () => {
  test('knows the leap year rules', () => {
    expect(daysInMonth(2023, 1)).toBe(28);
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(1900, 1)).toBe(28);
    expect(daysInMonth(2000, 1)).toBe(29);
  });

  test('gives every month of a year its length', () => {
    const lengths = Array.from({ length: 12 }, (_, monthIndex) => daysInMonth(2023, monthIndex));
    expect(lengths).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });

  test('accepts a month index past December', () => {
    expect(daysInMonth(2023, 13)).toBe(29); // February 2024
  });
});

test.describe('parseDateInput', () => {
  test('reads a real date as UTC midnight', () => {
    expect(parseDateInput('1990-06-15')?.toISOString()).toBe('1990-06-15T00:00:00.000Z');
    expect(parseDateInput('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(parseDateInput('9999-12-31')?.toISOString()).toBe('9999-12-31T00:00:00.000Z');
  });

  test('rejects dates that are not on the calendar', () => {
    expect(parseDateInput('2023-02-29')).toBeNull();
    expect(parseDateInput('2024-02-30')).toBeNull();
    expect(parseDateInput('2024-04-31')).toBeNull();
    expect(parseDateInput('2024-13-01')).toBeNull();
    expect(parseDateInput('2024-00-10')).toBeNull();
    expect(parseDateInput('2024-01-00')).toBeNull();
  });

  test('rejects empty, half-typed and padded values', () => {
    expect(parseDateInput('')).toBeNull();
    expect(parseDateInput('2024-0')).toBeNull();
    expect(parseDateInput('2024-1-1')).toBeNull();
    expect(parseDateInput(' 2024-01-01')).toBeNull();
    expect(parseDateInput('2024-01-01T00:00')).toBeNull();
    expect(parseDateInput('20240101')).toBeNull();
  });

  // Date.UTC reads years 0 to 99 as 1900 to 1999, so these used to fail the
  // round-trip check and were reported as invalid dates.
  test('accepts years below 100', () => {
    expect(parseDateInput('0099-12-31')?.toISOString()).toBe('0099-12-31T00:00:00.000Z');
    expect(parseDateInput('0001-01-01')?.toISOString()).toBe('0001-01-01T00:00:00.000Z');
    expect(parseDateInput('0004-02-29')?.toISOString()).toBe('0004-02-29T00:00:00.000Z');
  });

  test('rejects the year 0000', () => {
    expect(parseDateInput('0000-01-01')).toBeNull();
  });
});

test.describe('formatDateInput and toDateInputValue', () => {
  test('pads every field', () => {
    expect(formatDateInput(2024, 1, 5)).toBe('2024-01-05');
    expect(formatDateInput(50, 12, 31)).toBe('0050-12-31');
  });

  test('uses the local calendar date of a Date', () => {
    expect(toDateInputValue(new Date(2024, 0, 5, 0, 0))).toBe('2024-01-05');
    expect(toDateInputValue(new Date(2024, 0, 5, 23, 59))).toBe('2024-01-05');
    expect(toDateInputValue(new Date(1999, 11, 31, 12))).toBe('1999-12-31');
  });

  test('round-trips through parseDateInput', () => {
    const parsed = parseDateInput(toDateInputValue(new Date(2024, 1, 29, 15)));
    expect(parsed?.getTime()).toBe(Date.UTC(2024, 1, 29));
  });
});

test.describe('formatLongDate', () => {
  test('writes the date out in words', () => {
    expect(formatLongDate('1990-06-15')).toBe('June 15, 1990');
    expect(formatLongDate('2024-02-29')).toBe('February 29, 2024');
  });

  test('returns a value that is not a date unchanged', () => {
    expect(formatLongDate('2023-02-30')).toBe('2023-02-30');
    expect(formatLongDate('soon')).toBe('soon');
  });

  test('formatLongUtcDate reads the UTC date of a Date or a timestamp', () => {
    expect(formatLongUtcDate(new Date(Date.UTC(2027, 5, 15)))).toBe('June 15, 2027');
    expect(formatLongUtcDate(Date.UTC(2023, 2, 1))).toBe('March 1, 2023');
    expect(formatLongUtcDate(Date.UTC(2023, 11, 31, 23, 59))).toBe('December 31, 2023');
  });
});

test('DAY_IN_MS is one day', () => {
  expect(DAY_IN_MS).toBe(86_400_000);
});
