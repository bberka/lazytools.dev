import { describe, expect, test } from 'vite-plus/test';
import {
  DEFAULT_OPTIONS,
  EXAMPLE_TEXT,
  generateNumeronyms,
  graphemes,
  numeronym,
  type NumeronymOptions,
} from '@/lib/tools/numeronym-generator';

// Expected values are counted by hand: first character, the number of
// characters between the first and the last, last character.

const generate = (text: string, changes: Partial<NumeronymOptions> = {}) =>
  generateNumeronyms(text, { ...DEFAULT_OPTIONS, ...changes });

describe('numeronym', () => {
  test('the well-known ones', () => {
    expect(numeronym('internationalization')).toBe('i18n'); // 20 letters
    expect(numeronym('localization')).toBe('l10n'); // 12
    expect(numeronym('accessibility')).toBe('a11y'); // 13
    expect(numeronym('Kubernetes')).toBe('K8s'); // 10
    expect(numeronym('observability')).toBe('o11y'); // 13
    expect(numeronym('globalization')).toBe('g11n'); // 13
  });

  test('a four-letter word is the shortest that is shortened by default', () => {
    expect(numeronym('abcd')).toBe('a2d');
    expect(numeronym('cat')).toBe('cat');
    expect(numeronym('')).toBe('');
  });

  test('the minimum length can be raised, and never goes below three', () => {
    expect(numeronym('abcd', 5)).toBe('abcd');
    expect(numeronym('abcde', 5)).toBe('a3e');
    expect(numeronym('cat', 3)).toBe('c1t');
    expect(numeronym('ab', 3)).toBe('ab');
    expect(numeronym('cat', 1)).toBe('c1t');
    expect(numeronym('cat', 0)).toBe('c1t');
    expect(numeronym('cat', Number.NaN)).toBe('c1t');
  });

  test('lower-casing applies to the result', () => {
    expect(numeronym('Kubernetes', 4, true)).toBe('k8s');
    expect(numeronym('Cat', 4, true)).toBe('cat');
  });

  test('counts grapheme clusters, not UTF-16 units', () => {
    // Six graphemes: R, e plus an accent, s, u, m, e plus an accent.
    expect(numeronym('Résumé')).toBe('R4é');
    // Two of the five letters are outside the BMP and take two UTF-16 units each.
    expect(numeronym('\u{1D49C}bcd\u{1D4B5}')).toBe('\u{1D49C}3\u{1D4B5}');
    // Family emoji joined with ZWJ is one grapheme; with a letter on each side that is 3.
    expect(numeronym('a\u{1F468}‍\u{1F469}‍\u{1F467}b', 3)).toBe('a1b');
    expect(graphemes('éa')).toEqual(['é', 'a']);
    expect(graphemes('')).toEqual([]);
  });
});

describe('per-word mode', () => {
  test('shortens each word in place and leaves the rest alone', () => {
    expect(generate('The internationalization of Kubernetes, again!')).toBe(
      'The i18n of K8s, a3n!'
    );
  });

  test('leaves numbers alone but shortens words that contain digits', () => {
    expect(generate('Year 2024 and abc123def')).toBe('Y2r 2024 and a7f');
  });

  test('hyphenated and apostrophe words are separate words', () => {
    expect(generate('well-known')).toBe('w2l-k3n');
    expect(generate("internationalization's")).toBe("i18n's");
  });

  test('letters outside Latin and composed or decomposed accents', () => {
    expect(generate('Çağlayan')).toBe('Ç6n'); // 8 letters, Turkish
    expect(generate('Caǵlayan')).toBe('C6n');
    expect(generate('Привет')).toBe('П4т'); // Russian, 6 letters
    expect(generate('日本語の言葉')).toBe('日4葉');
  });

  test('keeps CRLF, blank lines and spacing exactly', () => {
    expect(generate('localization\r\n\r\n  accessibility  ')).toBe('l10n\r\n\r\n  a11y  ');
  });

  test('minimum length applies word by word', () => {
    expect(generate('cat house', { minLength: 3 })).toBe('c1t h3e');
    expect(generate('cat house', { minLength: 5 })).toBe('cat h3e');
  });

  test('empty input and text without words', () => {
    expect(generate('')).toBe('');
    expect(generate('... !!!')).toBe('... !!!');
  });
});

describe('phrase mode', () => {
  test('treats the letters and digits of a line as one word', () => {
    expect(generate('Hello, World!', { mode: 'phrase' })).toBe('H8d'); // HelloWorld has 10 letters
    expect(generate('Hello, World!', { mode: 'phrase', lowercase: true })).toBe('h8d');
    expect(generate('Simple Storage Service', { mode: 'phrase' })).toBe('S18e'); // 6 + 7 + 7 = 20 letters
  });

  test('one result per line, CRLF kept, short lines unchanged', () => {
    expect(generate('Hello World\r\nab\r\n', { mode: 'phrase' })).toBe('H8d\r\nab');
    expect(generate('Hello World\n\nCat', { mode: 'phrase' })).toBe('H8d\n\nCat');
    expect(generate('A B', { mode: 'phrase', lowercase: true })).toBe('a b');
  });

  test('counts graphemes across the joined line', () => {
    // Four astral letters and a combining pair: 5 graphemes, 3 between the ends.
    expect(generate('\u{1D49C} \u{1D49C}é \u{1D49C}\u{1D49C}', { mode: 'phrase' })).toBe(
      '\u{1D49C}3\u{1D49C}'
    );
  });

  test('empty input', () => {
    expect(generate('', { mode: 'phrase' })).toBe('');
  });
});

test('the example text', () => {
  expect(generate(EXAMPLE_TEXT)).toBe('i18n\nl10n\na11y\nK8s\no11y');
});
