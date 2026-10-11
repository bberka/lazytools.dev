import { test, expect } from '@playwright/test';
import {
  base64ToBytes,
  bytesToBase64,
  convertBase64,
  decodeBase64,
  encodeBase64,
} from '@/lib/tools/base64-converter';

// RFC 4648, section 10.
const RFC_VECTORS: Array<[text: string, base64: string]> = [
  ['', ''],
  ['f', 'Zg=='],
  ['fo', 'Zm8='],
  ['foo', 'Zm9v'],
  ['foob', 'Zm9vYg=='],
  ['fooba', 'Zm9vYmE='],
  ['foobar', 'Zm9vYmFy'],
];

test.describe('encodeBase64 / decodeBase64', () => {
  test('match the RFC 4648 test vectors in both directions', () => {
    for (const [text, base64] of RFC_VECTORS) {
      expect(encodeBase64(text)).toBe(base64);
      expect(decodeBase64(base64)).toBe(text);
    }
  });

  test('encode text as UTF-8', () => {
    expect(encodeBase64('héllo')).toBe('aMOpbGxv');
    expect(encodeBase64('日本語')).toBe('5pel5pys6Kqe');
    expect(encodeBase64('😀')).toBe('8J+YgA==');
    expect(decodeBase64('8J+YgA==')).toBe('😀');
  });

  test('agree with Node for every byte value and every padding length', () => {
    const all = Uint8Array.from({ length: 256 }, (_, index) => index);
    for (const length of [0, 1, 2, 3, 4, 5, 254, 255, 256]) {
      const bytes = all.slice(0, length);
      const expected = Buffer.from(bytes).toString('base64');
      expect(bytesToBase64(bytes)).toBe(expected);
      expect(Array.from(base64ToBytes(expected))).toEqual(Array.from(bytes));
    }
  });

  test('round-trip a megabyte of bytes', () => {
    const bytes = Uint8Array.from({ length: 1_000_000 }, (_, index) => (index * 31 + 7) & 255);
    const encoded = bytesToBase64(bytes);
    expect(encoded).toBe(Buffer.from(bytes).toString('base64'));
    expect(Buffer.from(base64ToBytes(encoded)).equals(Buffer.from(bytes))).toBe(true);
  });
});

test.describe('base64ToBytes', () => {
  test('accepts input without padding', () => {
    expect(decodeBase64('SGVsbG8')).toBe('Hello');
    expect(decodeBase64('Zg')).toBe('f');
  });

  test('ignores line breaks and other whitespace', () => {
    expect(decodeBase64('SGVs\nbG8g\r\n V29y bGQ=\t')).toBe('Hello World');
  });

  test('accepts the URL-safe alphabet', () => {
    expect(Array.from(base64ToBytes('-_8'))).toEqual([0xfb, 0xff]);
    expect(Array.from(base64ToBytes('+/8='))).toEqual([0xfb, 0xff]);
    // The header of a typical JWT.
    expect(decodeBase64('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toBe('{"alg":"HS256","typ":"JWT"}');
  });

  test('names the first character that is not Base64', () => {
    expect(() => base64ToBytes('SG*sbG8=')).toThrow('Invalid Base64 character "*" at position 3.');
    expect(() => base64ToBytes('héllo')).toThrow('Invalid Base64 character "é" at position 2.');
  });

  test('rejects input that is cut off or has data after the padding', () => {
    expect(() => base64ToBytes('SGVsb')).toThrow(/Invalid Base64 length/);
    expect(() => base64ToBytes('Zg===')).toThrow(/Invalid Base64 length/);
    expect(() => base64ToBytes('Zg==Zg==')).toThrow(/padding is only allowed at the end/);
  });

  test('shows bytes that are not UTF-8 as U+FFFD instead of failing', () => {
    expect(decodeBase64('//4=')).toBe('��');
  });
});

test.describe('convertBase64', () => {
  test('returns nothing for empty input in either direction', () => {
    expect(convertBase64('', 'encode')).toEqual({ output: '', error: '' });
    expect(convertBase64('', 'decode')).toEqual({ output: '', error: '' });
    expect(convertBase64('  \n ', 'decode')).toEqual({ output: '', error: '' });
  });

  // Defect: whitespace-only text used to encode to an empty result.
  test('encodes text that is only whitespace', () => {
    expect(convertBase64(' ', 'encode')).toEqual({ output: 'IA==', error: '' });
    expect(convertBase64('\n', 'encode')).toEqual({ output: 'Cg==', error: '' });
    expect(convertBase64('\t \n', 'encode')).toEqual({ output: 'CSAK', error: '' });
  });

  // Defect: base64url input (as found in JWTs and URLs) used to be rejected.
  test('decodes URL-safe Base64', () => {
    expect(convertBase64('8J-YgA', 'decode')).toEqual({ output: '😀', error: '' });
  });

  test('reports invalid input as an error and gives no output', () => {
    const result = convertBase64('not base64!', 'decode');
    expect(result.output).toBe('');
    expect(result.error).toBe('Invalid Base64 character "!" at position 11.');
  });

  test('is its own inverse for text', () => {
    for (const text of ['Hello, World!', 'ünïcödé ✓', '  padded  ', 'line1\nline2', '👩‍👩‍👧‍👦']) {
      const encoded = convertBase64(text, 'encode').output;
      expect(convertBase64(encoded, 'decode')).toEqual({ output: text, error: '' });
    }
  });
});
