/**
 * Slug Generator logic.
 *
 * A slug is built in a fixed order: transliterate letters (Turkish, German,
 * accents), lower-case, split into words, drop stopwords, join with the
 * separator, then cut to the maximum length at a word boundary. Pure
 * functions, no DOM: they run in Node as well as in the browser.
 */

export type SlugSeparator = '-' | '_' | '.' | '';
export type Transliteration = 'off' | 'basic' | 'german';

export interface SlugOptions {
  separator: SlugSeparator;
  lowercase: boolean;
  /**
   * `basic` turns accented Latin letters into plain ones (Turkish ı ş ğ ü ö ç İ
   * included). `german` also spells ä ö ü as ae oe ue. `off` keeps letters as typed.
   */
  transliteration: Transliteration;
  removeStopwords: boolean;
  /** 0 means no limit. Counted in characters (code points), cut between words. */
  maxLength: number;
  /** One slug per line instead of one slug for the whole text. */
  perLine: boolean;
}

export const DEFAULT_OPTIONS: SlugOptions = {
  separator: '-',
  lowercase: true,
  transliteration: 'basic',
  removeStopwords: false,
  maxLength: 0,
  perLine: false,
};

export const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'in',
  'into', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'with',
]);

// Letters that Unicode decomposition cannot split into base letter plus mark.
const BASIC_MAP: Readonly<Record<string, string>> = {
  'ß': 'ss', 'ẞ': 'SS',
  'ı': 'i', 'İ': 'I',
  'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE',
  'ø': 'o', 'Ø': 'O',
  'đ': 'd', 'Đ': 'D', 'ð': 'd', 'Ð': 'D',
  'ł': 'l', 'Ł': 'L',
  'þ': 'th', 'Þ': 'TH',
  'ħ': 'h', 'Ħ': 'H',
};

const GERMAN_MAP: Readonly<Record<string, string>> = {
  'ä': 'ae', 'Ä': 'Ae', 'ö': 'oe', 'Ö': 'Oe', 'ü': 'ue', 'Ü': 'Ue',
};

function transliterate(text: string, mode: Transliteration): string {
  if (mode === 'off') return text.normalize('NFC');
  const table = mode === 'german' ? { ...BASIC_MAP, ...GERMAN_MAP } : BASIC_MAP;
  // The table goes first: German Ü must become Ue before decomposition turns it into U.
  const mapped = Array.from(text.normalize('NFC'), (char) => table[char] ?? char).join('');
  // Marks are dropped only after Latin letters. Others keep theirs: the breve
  // of the Cyrillic й is part of the letter, not an accent to strip.
  return mapped
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC');
}

/** The words of a text: runs of letters, marks and digits. Apostrophes vanish, so "don't" is one word. */
export function slugWords(text: string, options: Pick<SlugOptions, 'transliteration' | 'lowercase'>): string[] {
  let value = transliterate(text, options.transliteration).replace(/['‘’ʼ`]/g, '');
  if (options.lowercase) {
    // Lower-casing İ gives i plus a combining dot; Turkish writes plain i.
    value = value.replace(/İ/g, 'i').toLowerCase();
  }
  return value.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

function codePoints(value: string): string[] {
  return Array.from(value);
}

function truncateWords(words: string[], separator: string, maxLength: number): string[] {
  const kept: string[] = [];
  let length = 0;
  for (const word of words) {
    const wordLength = codePoints(word).length;
    const next = length + (kept.length > 0 ? separator.length : 0) + wordLength;
    if (next > maxLength) break;
    kept.push(word);
    length = next;
  }
  // A first word longer than the limit is cut inside the word.
  if (kept.length === 0 && words.length > 0) return [codePoints(words[0]).slice(0, maxLength).join('')];
  return kept;
}

export function slugify(text: string, options: SlugOptions): string {
  let words = slugWords(text, options);

  if (options.removeStopwords) {
    const meaningful = words.filter((word) => !STOPWORDS.has(word.toLowerCase()));
    // A title made only of stopwords keeps them rather than becoming empty.
    if (meaningful.length > 0) words = meaningful;
  }

  if (options.maxLength > 0) {
    words = truncateWords(words, options.separator, Math.floor(options.maxLength));
  }

  return words.join(options.separator);
}

/** One slug per line. Blank lines stay blank so the output lines match the input lines. */
export function slugifyLines(text: string, options: SlugOptions): string {
  if (text === '') return '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.map((line) => slugify(line, options)).join(eol);
}

export function generateSlugs(text: string, options: SlugOptions): string {
  return options.perLine ? slugifyLines(text, options) : slugify(text, options);
}

export const EXAMPLE_TEXT = 'The Quick Brown Fox: Straße, Işık & Çağrı’s Café';
