import { test, expect } from '@playwright/test';
import { convertHex, hexToText, textToHex } from '@/lib/tools/hex-converter';

test.describe('textToHex', () => {
  test('writes one lower-case pair per UTF-8 byte', () => {
    expect(textToHex('Hello')).toBe('48656c6c6f');
    expect(textToHex('Hello', { delimiter: ' ' })).toBe('48 65 6c 6c 6f');
    expect(textToHex('\n\0', { delimiter: ' ' })).toBe('0a 00');
    expect(textToHex('')).toBe('');
  });

  test('applies prefix, delimiter and case', () => {
    expect(textToHex('Hi', { prefix: '0x', delimiter: ', ' })).toBe('0x48, 0x69');
    expect(textToHex('Hi', { prefix: '\\x' })).toBe('\\x48\\x69');
    expect(textToHex('jk', { uppercase: true, delimiter: ':' })).toBe('6A:6B');
    // The prefix keeps its own case.
    expect(textToHex('j', { uppercase: true, prefix: '0x' })).toBe('0x6A');
  });

  test('encodes non-ASCII text as UTF-8', () => {
    expect(textToHex('é', { delimiter: ' ' })).toBe('c3 a9');
    expect(textToHex('€', { delimiter: ' ' })).toBe('e2 82 ac');
    expect(textToHex('😀', { delimiter: ' ' })).toBe('f0 9f 98 80');
  });
});

test.describe('hexToText', () => {
  test('reads pairs with or without separators, in either case', () => {
    expect(hexToText('48656c6c6f')).toBe('Hello');
    expect(hexToText('48 65 6C 6c 6F')).toBe('Hello');
    expect(hexToText('48:65:6c:6c:6f')).toBe('Hello');
    expect(hexToText('48,65,\n6c-6c 6f')).toBe('Hello');
    expect(hexToText('f0 9f 98 80')).toBe('😀');
  });

  test('strips the selected prefix and delimiter', () => {
    expect(hexToText('%48%65', { prefix: '%' })).toBe('He');
    expect(hexToText('48|65', { delimiter: '|' })).toBe('He');
  });

  // Defect: with the prefix option on "None", the 0 of every "0x" was read as a digit.
  test('strips 0x and \\x prefixes whatever prefix is selected', () => {
    expect(hexToText('0x48 0x65 0x6c 0x6c 0x6f')).toBe('Hello');
    expect(hexToText('0X48,0X65')).toBe('He');
    expect(hexToText('\\x48\\x65\\x6c\\x6c\\x6f')).toBe('Hello');
    expect(hexToText('{ 0x48, 0x65 }', { prefix: '%' })).toBe('He');
    // A byte that ends in 0 next to the following prefix is not mistaken for one.
    expect(hexToText('0x200x41')).toBe(' A');
  });

  test('accepts the h suffix and the &H prefix', () => {
    expect(hexToText('48h 65h 6Ch 6ch 6FH')).toBe('Hello');
    expect(hexToText('&H48, &h65')).toBe('He');
  });

  // Defect: a letter that is not a hex digit was silently dropped, giving wrong text.
  test('reports a letter that is not a hex digit', () => {
    expect(() => hexToText('4g 6h')).toThrow('"g" is not a hexadecimal digit.');
    expect(() => hexToText('Hello')).toThrow('"H" is not a hexadecimal digit.');
    expect(() => hexToText('48 x 65')).toThrow('"x" is not a hexadecimal digit.');
    expect(() => hexToText('48 é5')).toThrow('"é" is not a hexadecimal digit.');
  });

  test('reports input without hex digits or with an odd number of them', () => {
    expect(() => hexToText('--')).toThrow('No valid hexadecimal characters found.');
    expect(() => hexToText('486')).toThrow('Hexadecimal string must have an even number of characters.');
  });

  test('shows bytes that are not UTF-8 as U+FFFD', () => {
    expect(hexToText('ff 41')).toBe('�A');
  });
});

test.describe('convertHex', () => {
  test('returns nothing for empty input, and for blank input when decoding', () => {
    expect(convertHex('', 'encode')).toEqual({ output: '', error: '' });
    expect(convertHex('', 'decode')).toEqual({ output: '', error: '' });
    expect(convertHex(' \n ', 'decode')).toEqual({ output: '', error: '' });
  });

  // Defect: whitespace-only text used to encode to an empty result.
  test('encodes text that is only whitespace', () => {
    expect(convertHex(' ', 'encode')).toEqual({ output: '20', error: '' });
    expect(convertHex('\t\n', 'encode', { delimiter: ' ' })).toEqual({ output: '09 0a', error: '' });
  });

  test('turns a failure into an error without output', () => {
    expect(convertHex('48 6', 'decode')).toEqual({
      output: '',
      error: 'Hexadecimal string must have an even number of characters.',
    });
  });

  test('decodes what it encoded, for every format option', () => {
    const text = 'Grüße, 世界! 0x10 😀';
    const formats = [
      {},
      { delimiter: ' ' },
      { delimiter: ',' },
      { delimiter: '\n' },
      { prefix: '0x' },
      { prefix: '\\x' },
      { prefix: '0x', delimiter: ' ', uppercase: true },
      { prefix: '%', delimiter: '', uppercase: true },
    ];
    for (const format of formats) {
      const hex = convertHex(text, 'encode', format).output;
      expect(convertHex(hex, 'decode', format)).toEqual({ output: text, error: '' });
    }
  });
});
