import { test, expect } from '@playwright/test';
import {
  DEFAULT_DECODE_OPTIONS,
  DEFAULT_ENCODE_OPTIONS,
  EXAMPLE_TEXT,
  NATO_DIGITS,
  NATO_LETTERS,
  decodeNato,
  encodeNato,
  type DecodeOptions,
  type EncodeOptions,
} from '@/lib/tools/nato-alphabet';

// Code words are the ICAO ones: Alfa, Juliett, Whiskey, X-ray and the digit
// words Wun, Too, Tree, Fower, Fife, Six, Seven, Ait, Niner.

const encode = (text: string, changes: Partial<EncodeOptions> = {}) =>
  encodeNato(text, { ...DEFAULT_ENCODE_OPTIONS, ...changes });
const decode = (text: string, changes: Partial<DecodeOptions> = {}) =>
  decodeNato(text, { ...DEFAULT_DECODE_OPTIONS, ...changes });

test.describe('reference tables', () => {
  test('hold 26 letters A to Z and 10 digits 0 to 9, in order', () => {
    expect(NATO_LETTERS.map((entry) => entry.symbol).join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(NATO_DIGITS.map((entry) => entry.symbol).join('')).toBe('0123456789');
    expect(NATO_LETTERS.every((entry) => entry.pronunciation.length > 0)).toBe(true);
  });

  test('use the ICAO spellings', () => {
    const words = (entries: typeof NATO_LETTERS) => entries.map((entry) => entry.word).join(' ');
    expect(words(NATO_LETTERS)).toBe(
      'Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu'
    );
    expect(words(NATO_DIGITS)).toBe('Zero Wun Too Tree Fower Fife Six Seven Ait Niner');
  });
});

test.describe('encodeNato', () => {
  test('spells letters, whatever their case', () => {
    expect(encode('Hello')).toBe('Hotel Echo Lima Lima Oscar');
    expect(encode('hELLO')).toBe('Hotel Echo Lima Lima Oscar');
  });

  test('marks the break between words with a slash and collapses runs of spaces', () => {
    expect(encode('Hello World')).toBe(
      'Hotel Echo Lima Lima Oscar / Whiskey Oscar Romeo Lima Delta'
    );
    expect(encode('a  \t b')).toBe('Alfa / Bravo');
    expect(encode('  a b  ')).toBe('Alfa / Bravo');
  });

  test('spells every digit the ICAO way, or the everyday way on request', () => {
    expect(encode('0123456789')).toBe('Zero Wun Too Tree Fower Fife Six Seven Ait Niner');
    expect(encode('42', { digitStyle: 'plain' })).toBe('Four Two');
    expect(encode('9', { digitStyle: 'plain' })).toBe('Nine');
  });

  test('keeps characters without a code word, or leaves them out', () => {
    expect(encode('Hi!')).toBe('Hotel India !');
    expect(encode('Hi!', { keepUnknown: false })).toBe('Hotel India');
    expect(encode('a ! b', { keepUnknown: false })).toBe('Alfa / Bravo');
    expect(encode('\u{1F600}a', { keepUnknown: true })).toBe('\u{1F600} Alfa');
    expect(encode('\u{1F600}a', { keepUnknown: false })).toBe('Alfa');
  });

  test('uses the base letter of accented letters, including Turkish i', () => {
    expect(encode('Zoë')).toBe('Zulu Oscar Echo');
    expect(encode('çağ')).toBe('Charlie Alfa Golf');
    expect(encode('Café')).toBe('Charlie Alfa Foxtrot Echo');
    expect(encode('ıİ')).toBe('India India');
  });

  test('upper and lower case code words', () => {
    expect(encode('x7', { wordCase: 'upper' })).toBe('X-RAY SEVEN');
    expect(encode('Xa', { wordCase: 'lower' })).toBe('x-ray alfa');
  });

  test('spells each line on its own line and keeps CRLF', () => {
    expect(encode('a\nb')).toBe('Alfa\nBravo');
    expect(encode('a\r\nb\r\n')).toBe('Alfa\r\nBravo');
    expect(encode('a\n\nb')).toBe('Alfa\n\nBravo');
  });

  test('empty input gives empty output', () => {
    expect(encode('')).toBe('');
    expect(encode('   ')).toBe('');
  });

  test('the example text', () => {
    expect(encode(EXAMPLE_TEXT)).toBe(
      'Foxtrot Lima India Golf Hotel Tango / Bravo Alfa / Too Fower Niner Zero , / Golf Alfa Tango Echo / Seven'
    );
  });
});

test.describe('decodeNato', () => {
  test('reads letters, digits and word breaks', () => {
    expect(decode('Hotel India / Alfa Wun')).toBe('HI A1');
    expect(decode('Zero Wun Too Tree Fower Fife Six Seven Ait Niner')).toBe('0123456789');
  });

  test('is case-insensitive and accepts common variants', () => {
    expect(decode('juliet whisky alpha xray niner')).toBe('JWAX9');
    expect(decode('X-RAY x-ray')).toBe('XX');
    expect(decode('one two three four five eight nine')).toBe('1234589');
  });

  test('a slash without spaces is still a word break', () => {
    expect(decode('Hotel/India')).toBe('H I');
    expect(decode('Hotel  /  /  India')).toBe('H I');
  });

  test('keeps what it does not know, or leaves it out', () => {
    expect(decode('Hotel India !')).toBe('HI!');
    expect(decode('Hotel India !', { keepUnknown: false })).toBe('HI');
    expect(decode('Hotel India hello Alfa')).toBe('HI hello A');
    expect(decode('Hotel India hello', { keepUnknown: false })).toBe('HI');
  });

  test('lower-case output', () => {
    expect(decode('Hotel India', { lowercase: true })).toBe('hi');
  });

  test('decodes line by line and keeps CRLF', () => {
    expect(decode('Alfa\nBravo')).toBe('A\nB');
    expect(decode('Alfa\r\nBravo\r\n')).toBe('A\r\nB');
  });

  test('empty input gives empty output; a lone break gives nothing', () => {
    expect(decode('')).toBe('');
    expect(decode('/')).toBe('');
    expect(decode('   ')).toBe('');
  });

  test('round-trips text of letters, digits and punctuation, as upper case', () => {
    const text = 'Hello World 2024!';
    expect(decode(encode(text))).toBe('HELLO WORLD 2024!');
    expect(decode(encode(text, { digitStyle: 'plain', wordCase: 'upper' }))).toBe(
      'HELLO WORLD 2024!'
    );
  });
});
