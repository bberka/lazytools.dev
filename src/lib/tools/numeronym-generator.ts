/**
 * Numeronym Generator logic.
 *
 * A numeronym keeps the first and the last character of a word and writes the
 * number of characters between them: internationalization becomes i18n.
 * Characters are counted as grapheme clusters, so an astral letter or a letter
 * with a combining accent counts once. Pure functions, no DOM: they run in
 * Node as well as in the browser.
 */

import { lineEnding, splitLines } from '@/lib/text';

export type NumeronymMode = 'word' | 'phrase';

export interface NumeronymOptions {
  /** `word` shortens every word in place; `phrase` shortens each line as one word. */
  mode: NumeronymMode;
  /** Words with fewer characters stay as they are. Never below 3, the shortest word with a middle. */
  minLength: number;
  lowercase: boolean;
}

export const DEFAULT_OPTIONS: NumeronymOptions = { mode: 'word', minLength: 4, lowercase: false };

export const MIN_ALLOWED_LENGTH = 3;

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/** Grapheme clusters of a string. Falls back to code points where Intl.Segmenter is missing. */
export function graphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (part) => part.segment);
  return Array.from(text);
}

function minimumLength(minLength: number): number {
  return Math.max(MIN_ALLOWED_LENGTH, Math.floor(minLength) || MIN_ALLOWED_LENGTH);
}

/** Numeronym of one word, or the word itself when it is shorter than `minLength`. */
export function numeronym(
  word: string,
  minLength: number = DEFAULT_OPTIONS.minLength,
  lowercase = false
): string {
  const characters = graphemes(word);
  const result =
    characters.length < minimumLength(minLength)
      ? word
      : `${characters[0]}${characters.length - 2}${characters[characters.length - 1]}`;
  return lowercase ? result.toLowerCase() : result;
}

const WORD = /[\p{L}\p{M}\p{N}]+/gu;

/** Shortens every word of the text in place. Numbers and punctuation are left alone. */
function numeronymWords(text: string, options: NumeronymOptions): string {
  return text.replace(WORD, (word) =>
    // A run of digits alone is a number, not a word.
    /\p{L}/u.test(word) ? numeronym(word, options.minLength, options.lowercase) : word
  );
}

/** Shortens each line as a single word made of its letters and digits. */
function numeronymPhrases(text: string, options: NumeronymOptions): string {
  if (text === '') return '';
  const eol = lineEnding(text);
  return splitLines(text)
    .map((line) => {
      const joined = (line.match(WORD) ?? []).join('');
      // Too short to abbreviate: the line stays as it was typed.
      if (graphemes(joined).length < minimumLength(options.minLength)) {
        return options.lowercase ? line.toLowerCase() : line;
      }
      return numeronym(joined, options.minLength, options.lowercase);
    })
    .join(eol);
}

export function generateNumeronyms(text: string, options: NumeronymOptions): string {
  return options.mode === 'phrase'
    ? numeronymPhrases(text, options)
    : numeronymWords(text, options);
}

export const EXAMPLE_TEXT = [
  'internationalization',
  'localization',
  'accessibility',
  'Kubernetes',
  'observability',
].join('\n');
