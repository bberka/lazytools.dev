/**
 * NATO phonetic alphabet logic.
 *
 * `encodeNato` spells text with the ICAO/NATO code words, `decodeNato` reads
 * such words back. Word breaks are written as a slash. Pure functions, no DOM:
 * they run in Node as well as in the browser.
 */

import { lineEnding, splitLines } from '@/lib/text';

export interface NatoEntry {
  /** The letter or digit. */
  symbol: string;
  word: string;
  /** Pronunciation as the ICAO publishes it, in capitals with syllables split by hyphens. */
  pronunciation: string;
}

export const NATO_LETTERS: readonly NatoEntry[] = [
  { symbol: 'A', word: 'Alfa', pronunciation: 'AL-FAH' },
  { symbol: 'B', word: 'Bravo', pronunciation: 'BRAH-VOH' },
  { symbol: 'C', word: 'Charlie', pronunciation: 'CHAR-LEE' },
  { symbol: 'D', word: 'Delta', pronunciation: 'DELL-TAH' },
  { symbol: 'E', word: 'Echo', pronunciation: 'ECK-OH' },
  { symbol: 'F', word: 'Foxtrot', pronunciation: 'FOKS-TROT' },
  { symbol: 'G', word: 'Golf', pronunciation: 'GOLF' },
  { symbol: 'H', word: 'Hotel', pronunciation: 'HOH-TEL' },
  { symbol: 'I', word: 'India', pronunciation: 'IN-DEE-AH' },
  { symbol: 'J', word: 'Juliett', pronunciation: 'JEW-LEE-ETT' },
  { symbol: 'K', word: 'Kilo', pronunciation: 'KEY-LOH' },
  { symbol: 'L', word: 'Lima', pronunciation: 'LEE-MAH' },
  { symbol: 'M', word: 'Mike', pronunciation: 'MIKE' },
  { symbol: 'N', word: 'November', pronunciation: 'NO-VEM-BER' },
  { symbol: 'O', word: 'Oscar', pronunciation: 'OSS-CAH' },
  { symbol: 'P', word: 'Papa', pronunciation: 'PAH-PAH' },
  { symbol: 'Q', word: 'Quebec', pronunciation: 'KEH-BECK' },
  { symbol: 'R', word: 'Romeo', pronunciation: 'ROW-ME-OH' },
  { symbol: 'S', word: 'Sierra', pronunciation: 'SEE-AIR-RAH' },
  { symbol: 'T', word: 'Tango', pronunciation: 'TANG-GO' },
  { symbol: 'U', word: 'Uniform', pronunciation: 'YOU-NEE-FORM' },
  { symbol: 'V', word: 'Victor', pronunciation: 'VIK-TAH' },
  { symbol: 'W', word: 'Whiskey', pronunciation: 'WISS-KEY' },
  { symbol: 'X', word: 'X-ray', pronunciation: 'ECKS-RAY' },
  { symbol: 'Y', word: 'Yankee', pronunciation: 'YANG-KEY' },
  { symbol: 'Z', word: 'Zulu', pronunciation: 'ZOO-LOO' },
];

/** The ICAO way to say digits, which differs from everyday English so they are not mixed up on a bad line. */
export const NATO_DIGITS: readonly NatoEntry[] = [
  { symbol: '0', word: 'Zero', pronunciation: 'ZEE-ROH' },
  { symbol: '1', word: 'Wun', pronunciation: 'WUN' },
  { symbol: '2', word: 'Too', pronunciation: 'TOO' },
  { symbol: '3', word: 'Tree', pronunciation: 'TREE' },
  { symbol: '4', word: 'Fower', pronunciation: 'FOW-ER' },
  { symbol: '5', word: 'Fife', pronunciation: 'FIFE' },
  { symbol: '6', word: 'Six', pronunciation: 'SIX' },
  { symbol: '7', word: 'Seven', pronunciation: 'SEV-EN' },
  { symbol: '8', word: 'Ait', pronunciation: 'AIT' },
  { symbol: '9', word: 'Niner', pronunciation: 'NIN-ER' },
];

const PLAIN_DIGIT_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

export type DigitStyle = 'icao' | 'plain';
export type WordCase = 'title' | 'upper' | 'lower';

export interface EncodeOptions {
  digitStyle: DigitStyle;
  wordCase: WordCase;
  /** Pass characters without a code word through; otherwise they are left out. */
  keepUnknown: boolean;
}

export interface DecodeOptions {
  /** Pass words that are not code words through; otherwise they are left out. */
  keepUnknown: boolean;
  lowercase: boolean;
}

const WORD_BREAK = '/';

export const DEFAULT_ENCODE_OPTIONS: EncodeOptions = { digitStyle: 'icao', wordCase: 'title', keepUnknown: true };
export const DEFAULT_DECODE_OPTIONS: DecodeOptions = { keepUnknown: true, lowercase: false };

// Letters Unicode cannot take apart, folded to the base letter a speller would say.
const EXTRA_FOLDS: Readonly<Record<string, string>> = { 'ı': 'I', 'İ': 'I', 'ø': 'O', 'Ø': 'O', 'ł': 'L', 'Ł': 'L', 'đ': 'D', 'Đ': 'D' };

const LETTER_WORD = new Map(NATO_LETTERS.map((entry) => [entry.symbol, entry.word]));

function digitWord(digit: string, style: DigitStyle): string {
  return style === 'icao' ? NATO_DIGITS[Number(digit)].word : PLAIN_DIGIT_WORDS[Number(digit)];
}

function applyCase(word: string, wordCase: WordCase): string {
  if (wordCase === 'upper') return word.toUpperCase();
  if (wordCase === 'lower') return word.toLowerCase();
  return word;
}

/** Base letter of an accented Latin letter ("é" gives "E"); anything else comes back unchanged. */
function baseLetter(char: string): string {
  const folded = EXTRA_FOLDS[char];
  if (folded) return folded;
  const stripped = char.normalize('NFD').replace(/\p{M}+/gu, '');
  return /^[A-Za-z]$/.test(stripped) ? stripped.toUpperCase() : char;
}

function encodeLine(line: string, options: EncodeOptions): string {
  const parts: string[] = [];
  let pendingBreak = false;
  // Composing first puts a base letter and its separate accent back together.
  // Iterating by code point keeps emoji and other astral characters whole.
  for (const char of line.normalize('NFC')) {
    if (/\s/u.test(char)) {
      pendingBreak = parts.length > 0;
      continue;
    }
    const letter = baseLetter(char);
    let part: string | undefined;
    if (LETTER_WORD.has(letter)) part = applyCase(LETTER_WORD.get(letter) as string, options.wordCase);
    else if (/^[0-9]$/.test(char)) part = applyCase(digitWord(char, options.digitStyle), options.wordCase);
    else if (options.keepUnknown) part = char;
    if (part === undefined) continue;
    if (pendingBreak) parts.push(WORD_BREAK);
    pendingBreak = false;
    parts.push(part);
  }
  return parts.join(' ');
}

/** Spells the text. Every line is spelled on its own line; runs of spaces become one word break. */
export function encodeNato(text: string, options: EncodeOptions): string {
  if (text === '') return '';
  return splitLines(text)
    .map((line) => encodeLine(line, options))
    .join(lineEnding(text));
}

// Code words and common variants, lower case without hyphens or spaces.
const DECODE_TABLE: ReadonlyMap<string, string> = (() => {
  const table = new Map<string, string>();
  for (const entry of NATO_LETTERS) table.set(entry.word.toLowerCase().replace(/-/g, ''), entry.symbol);
  for (const entry of NATO_DIGITS) table.set(entry.word.toLowerCase(), entry.symbol);
  const variants: Record<string, string> = {
    alpha: 'A', juliet: 'J', whisky: 'W', zero: '0',
    one: '1', two: '2', three: '3', four: '4', five: '5', eight: '8', nine: '9',
    niner: '9', fower: '4', fife: '5', tree: '3', too: '2', wun: '1', ait: '8',
  };
  for (const [word, symbol] of Object.entries(variants)) table.set(word, symbol);
  return table;
})();

function lookupWord(token: string): string | undefined {
  return DECODE_TABLE.get(token.toLowerCase().replace(/-/g, ''));
}

function decodeLine(line: string, options: DecodeOptions): string {
  const tokens = line.replace(/\s*\/\s*/g, ' / ').trim().split(/\s+/).filter(Boolean);
  let result = '';
  // A multi-character leftover is a whole word, so it gets spaces around it.
  let lastWasWord = false;
  for (const token of tokens) {
    if (token === WORD_BREAK) {
      if (result !== '' && !result.endsWith(' ')) result += ' ';
      lastWasWord = false;
      continue;
    }
    const symbol = lookupWord(token);
    if (symbol !== undefined) {
      if (lastWasWord && !result.endsWith(' ')) result += ' ';
      result += options.lowercase ? symbol.toLowerCase() : symbol;
      lastWasWord = false;
      continue;
    }
    if (!options.keepUnknown) continue;
    const isWord = Array.from(token).length > 1;
    if (isWord && result !== '' && !result.endsWith(' ')) result += ' ';
    if (!isWord && lastWasWord && !result.endsWith(' ')) result += ' ';
    result += token;
    lastWasWord = isWord;
  }
  return result.trimEnd();
}

/** Reads code words back into text. Case, hyphens and the usual variants (Alpha, Juliet, Whisky, One...) are accepted. */
export function decodeNato(text: string, options: DecodeOptions): string {
  if (text === '') return '';
  return splitLines(text)
    .map((line) => decodeLine(line, options))
    .join(lineEnding(text));
}

export const EXAMPLE_TEXT = 'Flight BA 2490, gate 7';
