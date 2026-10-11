import { test, expect } from '@playwright/test';
import {
  ROMAN_MAX,
  ROMAN_MIN,
  cleanRomanInput,
  fromRoman,
  parseDecimal,
  toRoman,
} from '@/lib/tools/roman-numeral-converter';

const KNOWN: ReadonlyArray<readonly [number, string]> = [
  [1, 'I'],
  [3, 'III'],
  [4, 'IV'],
  [9, 'IX'],
  [14, 'XIV'],
  [40, 'XL'],
  [90, 'XC'],
  [400, 'CD'],
  [900, 'CM'],
  [1994, 'MCMXCIV'],
  [2024, 'MMXXIV'],
  [3888, 'MMMDCCCLXXXVIII'],
  [3999, 'MMMCMXCIX'],
];

test.describe('toRoman', () => {
  test('writes known numbers', () => {
    for (const [value, roman] of KNOWN) {
      expect(toRoman(value), String(value)).toBe(roman);
    }
  });

  test('returns null outside 1 to 3999 and for fractions', () => {
    for (const value of [0, -1, 4000, 1.5, NaN, Infinity]) {
      expect(toRoman(value), String(value)).toBeNull();
    }
  });
});

test.describe('fromRoman', () => {
  test('reads known numerals', () => {
    for (const [value, roman] of KNOWN) {
      expect(fromRoman(roman), roman).toBe(value);
    }
  });

  test('reads lower case and ignores surrounding spaces', () => {
    expect(fromRoman('mcmxciv')).toBe(1994);
    expect(fromRoman('  Xiv ')).toBe(14);
  });

  test('returns null for anything that is not a standard numeral', () => {
    for (const text of ['', '   ', 'IIII', 'VV', 'VX', 'IC', 'IL', 'XM', 'IIV', 'MMMM', 'ABC', 'X I', '12']) {
      expect(fromRoman(text), JSON.stringify(text)).toBeNull();
    }
  });

  test('is the inverse of toRoman over the whole range', () => {
    for (let value = ROMAN_MIN; value <= ROMAN_MAX; value++) {
      const roman = toRoman(value);

      expect(roman).not.toBeNull();
      expect(fromRoman(roman ?? '')).toBe(value);
    }
  });
});

test.describe('parseDecimal', () => {
  test('reads whole numbers from 1 to 3999', () => {
    expect(parseDecimal('1')).toBe(1);
    expect(parseDecimal('1994')).toBe(1994);
    expect(parseDecimal('3999')).toBe(3999);
    expect(parseDecimal(' 7 ')).toBe(7);
  });

  // "007" was refused with "Enter an integer between 1 and 3999."
  test('reads a number written with leading zeros', () => {
    expect(parseDecimal('007')).toBe(7);
    expect(parseDecimal('01994')).toBe(1994);
  });

  test('returns null out of range and for anything but digits', () => {
    for (const text of ['', '0', '000', '4000', '99999999999999999999', '-5', '+5', '12.5', '1e3', 'abc', '1 2']) {
      expect(parseDecimal(text), JSON.stringify(text)).toBeNull();
    }
  });
});

test.describe('cleanRomanInput', () => {
  test('upper-cases numeral letters', () => {
    expect(cleanRomanInput('mcmxciv')).toBe('MCMXCIV');
  });

  test('drops every other character', () => {
    expect(cleanRomanInput(' x i v ')).toBe('XIV');
    expect(cleanRomanInput('MCMXCIV (1994)')).toBe('MCMXCIV');
    expect(cleanRomanInput('123-?!')).toBe('');
    expect(cleanRomanInput('')).toBe('');
  });

  // The single-character Unicode numerals were dropped, leaving the field empty.
  test('spells Unicode numeral characters out as letters', () => {
    expect(cleanRomanInput('\u216B')).toBe('XII');
    expect(cleanRomanInput('\u2173')).toBe('IV');
    expect(cleanRomanInput('\u216F\u216F\u2169\u2169\u2163')).toBe('MMXXIV');
    expect(fromRoman(cleanRomanInput('\u216B'))).toBe(12);
  });
});
