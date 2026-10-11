import { test, expect } from '@playwright/test';
import { formatNumber, readNumber } from '@/lib/tools/calculator-numbers';

const number = (value: number) => ({ kind: 'number', value });
const EMPTY = { kind: 'empty' };
const INVALID = { kind: 'invalid' };

test.describe('readNumber', () => {
  test('reads plain, signed, fractional and exponent numbers', () => {
    expect(readNumber('42')).toEqual(number(42));
    expect(readNumber('  42  ')).toEqual(number(42));
    expect(readNumber('-3.5')).toEqual(number(-3.5));
    expect(readNumber('+7')).toEqual(number(7));
    expect(readNumber('.5')).toEqual(number(0.5));
    expect(readNumber('5.')).toEqual(number(5));
    expect(readNumber('1e3')).toEqual(number(1000));
    expect(readNumber('2.5E-2')).toEqual(number(0.025));
  });

  test('reads commas as thousands separators', () => {
    expect(readNumber('1,250')).toEqual(number(1250));
    expect(readNumber('1,234,567.89')).toEqual(number(1234567.89));
    expect(readNumber('-12,000')).toEqual(number(-12000));
    // Indian grouping: two digits between the later separators.
    expect(readNumber('1,00,000')).toEqual(number(100000));
  });

  // Commas used to be deleted wherever they stood, so the decimal comma in
  // "1,5" produced 15 and "0,125" produced 125.
  test('reads a comma that cannot group thousands as a decimal comma', () => {
    expect(readNumber('1,5')).toEqual(number(1.5));
    expect(readNumber('0,125')).toEqual(number(0.125));
    expect(readNumber('12,34')).toEqual(number(12.34));
    expect(readNumber('1,2345')).toEqual(number(1.2345));
    expect(readNumber('1234,567')).toEqual(number(1234.567));
    expect(readNumber('-0,5')).toEqual(number(-0.5));
    expect(readNumber(',5')).toEqual(number(0.5));
    expect(readNumber('5,')).toEqual(number(5));
    expect(readNumber('2,5e3')).toEqual(number(2500));
  });

  test('reads periods as thousands separators before a decimal comma', () => {
    expect(readNumber('1.250,5')).toEqual(number(1250.5));
    expect(readNumber('1.234.567,89')).toEqual(number(1234567.89));
  });

  test('keeps reading a comma before exactly three digits as thousands', () => {
    expect(readNumber('1,250')).toEqual(number(1250));
    expect(readNumber('999,999')).toEqual(number(999999));
    // A single period is always a decimal point.
    expect(readNumber('1.250')).toEqual(number(1.25));
  });

  // A lone "," used to read as 0.
  test('treats blank text and a number still being typed as empty', () => {
    for (const text of ['', '   ', '-', '+', '.', '-.', '+.', ',', '-,']) {
      expect(readNumber(text), JSON.stringify(text)).toEqual(EMPTY);
    }
  });

  test('refuses separators that fit neither reading', () => {
    for (const text of [',,', '1,,000', '1,2,3', '1,5,', '1.2.3', '1.234.567', '1.5,5.5']) {
      expect(readNumber(text), text).toEqual(INVALID);
    }
  });

  // Typing 1,000,000 a key at a time passes through "1,000," and "1,000,0",
  // which are no number yet but are not a mistake either.
  test('treats a number grouped in thousands and cut off after a comma as empty', () => {
    for (const text of ['1,000,', '1,000,0', '1,000,00', '1,250,5', '12,34,', '1,00,0', '-1,000,0']) {
      expect(readNumber(text), text).toEqual(EMPTY);
    }

    // Each step of the way to 1,000,000 is empty or a number, never invalid.
    const typed = '1,000,000';
    for (let length = 1; length <= typed.length; length++) {
      expect(readNumber(typed.slice(0, length)).kind, typed.slice(0, length)).not.toBe('invalid');
    }
    expect(readNumber('1,000,000')).toEqual(number(1000000));
  });

  test('still refuses a grouped number that no further typing could complete', () => {
    for (const text of ['01,000,', '1,0000,', '1234,000,', '1,000,000,0000', '1,000,.']) {
      expect(readNumber(text), text).toEqual(INVALID);
    }
  });

  test('refuses text that is not a decimal number', () => {
    for (const text of ['abc', '12abc', '50%', '1 000', '1e', '--5', 'NaN', 'Infinity']) {
      expect(readNumber(text), text).toEqual(INVALID);
    }
  });

  // Number() reads these as 16, 3 and 15.
  test('refuses hexadecimal, binary and octal literals', () => {
    for (const text of ['0x10', '0b11', '0o17']) {
      expect(readNumber(text), text).toEqual(INVALID);
    }
  });

  test('refuses a number too large to hold', () => {
    expect(readNumber('1e999')).toEqual(INVALID);
  });

  test('reads the typographic minus sign that web pages paste', () => {
    expect(readNumber('\u22125')).toEqual(number(-5));
  });
});

test.describe('formatNumber', () => {
  const twoDecimals = { minFractionDigits: 2, maxFractionDigits: 2 };
  const keepsSmall = { ...twoDecimals, minSignificantDigits: 2 };

  test('pads to the minimum and rounds to the maximum fraction digits', () => {
    expect(formatNumber(30, twoDecimals)).toBe('30.00');
    expect(formatNumber(1 / 3, twoDecimals)).toBe('0.33');
    expect(formatNumber(2.5, { maxFractionDigits: 8 })).toBe('2.5');
    expect(formatNumber(3, { maxFractionDigits: 8 })).toBe('3');
  });

  test('groups thousands', () => {
    expect(formatNumber(1234567.891, twoDecimals)).toBe('1,234,567.89');
    expect(formatNumber(-1250, { maxFractionDigits: 0 })).toBe('-1,250');
  });

  test('rounds a small value to zero when no significant digits are asked for', () => {
    expect(formatNumber(0.001, twoDecimals)).toBe('0.00');
  });

  test('keeps the asked-for significant digits of a small value', () => {
    expect(formatNumber(0.00005, keepsSmall)).toBe('0.00005');
    expect(formatNumber(0.001234, keepsSmall)).toBe('0.0012');
    expect(formatNumber(0.057, keepsSmall)).toBe('0.057');
    expect(formatNumber(-0.001234, keepsSmall)).toBe('-0.0012');
  });

  test('leaves values that already have enough digits as they were', () => {
    expect(formatNumber(0.5, keepsSmall)).toBe('0.50');
    expect(formatNumber(0.25, keepsSmall)).toBe('0.25');
    expect(formatNumber(0.0999, keepsSmall)).toBe('0.10');
    expect(formatNumber(12.345, keepsSmall)).toBe('12.35');
  });

  // Intl writes negative zero, and a negative value that rounds to zero, with
  // a minus sign.
  test('never writes a signed zero', () => {
    expect(formatNumber(-0, twoDecimals)).toBe('0.00');
    expect(formatNumber(-0.001, twoDecimals)).toBe('0.00');
    expect(formatNumber(-0, { maxFractionDigits: 8 })).toBe('0');
  });

  test('switches to exponent form where digits stop being readable', () => {
    expect(formatNumber(1e21, twoDecimals)).toBe('1e+21');
    expect(formatNumber(-1.2345e25, twoDecimals)).toBe('-1.2345e+25');
    expect(formatNumber(1e-25, keepsSmall)).toBe('1e-25');
    expect(formatNumber(1.234e-25, keepsSmall)).toBe('1.2e-25');
    // Just inside the plain range on both sides.
    expect(formatNumber(1e20, { maxFractionDigits: 0 })).toBe('100,000,000,000,000,000,000');
    expect(formatNumber(1e-12, { maxFractionDigits: 8, minSignificantDigits: 6 })).toBe(
      '0.000000000001'
    );
  });

  test('writes exponent form that readNumber accepts', () => {
    expect(readNumber(formatNumber(1.5e30, twoDecimals))).toEqual(number(1.5e30));
    expect(readNumber(formatNumber(2e-30, keepsSmall))).toEqual(number(2e-30));
  });

  test('formats a value that is not finite as an empty string', () => {
    expect(formatNumber(Infinity, twoDecimals)).toBe('');
    expect(formatNumber(-Infinity, twoDecimals)).toBe('');
    expect(formatNumber(NaN, twoDecimals)).toBe('');
  });
});
