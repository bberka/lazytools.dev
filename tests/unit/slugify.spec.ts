import { describe, expect, test } from 'vite-plus/test';
import {
  DEFAULT_OPTIONS,
  EXAMPLE_TEXT,
  generateSlugs,
  slugify,
  slugifyLines,
  type SlugOptions,
} from '@/lib/tools/slugify';

// Expected values are worked out by hand from the rules in the module header.

const slug = (text: string, changes: Partial<SlugOptions> = {}) =>
  slugify(text, { ...DEFAULT_OPTIONS, ...changes });

describe('slugify basics', () => {
  test('lower-cases, drops punctuation and joins words with a hyphen', () => {
    expect(slug('Hello, World!')).toBe('hello-world');
    expect(slug('  --Hello___World--  ')).toBe('hello-world');
    expect(slug('Top 10 tips & tricks')).toBe('top-10-tips-tricks');
  });

  test('empty text, symbols and emoji give an empty slug', () => {
    expect(slug('')).toBe('');
    expect(slug('   ')).toBe('');
    expect(slug('!!! \u{1F600} ???')).toBe('');
  });

  test('separator choices', () => {
    expect(slug('Hello World', { separator: '_' })).toBe('hello_world');
    expect(slug('Hello World', { separator: '.' })).toBe('hello.world');
    expect(slug('Hello World', { separator: '' })).toBe('helloworld');
  });

  test('lower-casing can be switched off', () => {
    expect(slug('Hello World', { lowercase: false })).toBe('Hello-World');
  });

  test('apostrophes disappear instead of splitting the word', () => {
    expect(slug("Don't Stop")).toBe('dont-stop');
    expect(slug('Dont’t Stop')).toBe('dontt-stop');
  });

  test('line breaks in a single slug are word breaks', () => {
    expect(slug('Hello\r\nWorld\nAgain')).toBe('hello-world-again');
  });
});

describe('transliteration', () => {
  test('Turkish letters become plain Latin letters', () => {
    expect(slug('Işık Şişli Çağ Üzüm Öğle İstanbul')).toBe('isik-sisli-cag-uzum-ogle-istanbul');
  });

  test('sharp s and ligatures', () => {
    expect(slug('Straße')).toBe('strasse');
    expect(slug('Æsir Øre')).toBe('aesir-ore');
  });

  test('basic mode strips umlauts, german mode spells them out', () => {
    const text = 'Straße Müller Köln Äpfel';
    expect(slug(text)).toBe('strasse-muller-koln-apfel');
    expect(slug(text, { transliteration: 'german' })).toBe('strasse-mueller-koeln-aepfel');
    expect(slug('Äpfel', { transliteration: 'german', lowercase: false })).toBe('Aepfel');
  });

  test('accents and Vietnamese marks are removed, composed or decomposed', () => {
    expect(slug('Crème Brûlée')).toBe('creme-brulee');
    expect(slug('Café')).toBe('cafe');
    expect(slug('Đường Hà Nội')).toBe('duong-ha-noi');
  });

  test('with transliteration off, letters stay as typed (composed) and still lower-case', () => {
    expect(slug('Café Münch', { transliteration: 'off' })).toBe('café-münch');
    expect(slug('Café', { transliteration: 'off' })).toBe('café');
    expect(slug('İstanbul', { transliteration: 'off' })).toBe('istanbul');
  });

  test('other scripts are kept, and a mark that belongs to the letter survives', () => {
    expect(slug('Привет, мир')).toBe('привет-мир');
    expect(slug('Йод')).toBe('йод');
    expect(slug('日本語 テスト')).toBe('日本語-テスト');
  });
});

describe('stopwords', () => {
  test('are removed when asked, whatever their case', () => {
    expect(slug('The Quick Brown Fox of the Year', { removeStopwords: true })).toBe(
      'quick-brown-fox-year'
    );
    expect(slug('THE Cat', { removeStopwords: true })).toBe('cat');
    expect(slug('Crème Brûlée à la carte', { removeStopwords: true })).toBe(
      'creme-brulee-la-carte'
    );
  });

  test('a text made only of stopwords keeps them', () => {
    expect(slug('The and', { removeStopwords: true })).toBe('the-and');
  });

  test('are kept by default', () => {
    expect(slug('The Cat')).toBe('the-cat');
  });
});

describe('maximum length', () => {
  test('cuts between words and counts the separators', () => {
    expect(slug('Hello wonderful world', { maxLength: 10 })).toBe('hello');
    expect(slug('Hello wonderful world', { maxLength: 15 })).toBe('hello-wonderful');
    expect(slug('Hello wonderful world', { maxLength: 14 })).toBe('hello');
    expect(slug('a b c d', { maxLength: 5 })).toBe('a-b-c');
    expect(slug('a b c d', { maxLength: 4 })).toBe('a-b');
    expect(slug('Hello World', { maxLength: 11 })).toBe('hello-world');
  });

  test('a first word longer than the limit is cut inside the word', () => {
    expect(slug('wonderful', { maxLength: 3 })).toBe('won');
  });

  test('counts code points, not UTF-16 units', () => {
    // Three mathematical script capitals are 3 code points (6 UTF-16 units).
    expect(slug('\u{1D49C}\u{1D49C}\u{1D49C}\u{1D49C}', { maxLength: 3, lowercase: false })).toBe(
      '\u{1D49C}\u{1D49C}\u{1D49C}'
    );
  });

  test('zero means no limit', () => {
    expect(slug('Hello wonderful world', { maxLength: 0 })).toBe('hello-wonderful-world');
  });

  test('is applied after stopwords are removed', () => {
    expect(slug('The Quick Brown Fox', { removeStopwords: true, maxLength: 11 })).toBe(
      'quick-brown'
    );
  });
});

describe('one slug per line', () => {
  test('keeps blank lines and the CRLF line ending', () => {
    const options = { ...DEFAULT_OPTIONS, perLine: true };
    expect(slugifyLines('Hello World\r\n\r\nFoo  Bar\r\n', options)).toBe(
      'hello-world\r\n\r\nfoo-bar'
    );
    expect(slugifyLines('One\nTwo', options)).toBe('one\ntwo');
    expect(slugifyLines('', options)).toBe('');
  });

  test('generateSlugs picks the mode', () => {
    expect(generateSlugs('A b\nC d', { ...DEFAULT_OPTIONS, perLine: false })).toBe('a-b-c-d');
    expect(generateSlugs('A b\nC d', { ...DEFAULT_OPTIONS, perLine: true })).toBe('a-b\nc-d');
  });
});

test('the example text', () => {
  expect(slug(EXAMPLE_TEXT)).toBe('the-quick-brown-fox-strasse-isik-cagris-cafe');
  expect(slug(EXAMPLE_TEXT, { removeStopwords: true })).toBe(
    'quick-brown-fox-strasse-isik-cagris-cafe'
  );
});
