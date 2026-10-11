/**
 * Word counter logic: counts words, characters, sentences, paragraphs and
 * lines in a block of text and estimates how long it takes to read or speak.
 *
 * Counts follow what a reader sees rather than how the text is stored: an
 * emoji or an accented letter is one character however many UTF-16 units it
 * takes, and a word keeps the combining marks of scripts such as Devanagari,
 * Thai and Arabic. Pure, so it runs in Node and in the browser.
 */

const AVERAGE_READING_WPM = 200;
const AVERAGE_SPEAKING_WPM = 130;

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingMinutes: number;
  speakingMinutes: number;
  /** The first of the longest words, or '' when the text has no words. */
  longestWord: string;
  averageWordLength: number;
}

export interface CountOptions {
  /** Count "2026" and "42" as words. Without it only words with letters count. */
  includeNumbers: boolean;
}

// A word starts with a letter (or digit) and carries the marks that follow:
// without \p{M} a decomposed accent or an Indic vowel sign would end the word.
// Apostrophes and hyphens join the parts of "don't" and "well-known".
const WORDS_WITH_NUMBERS = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’-][\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*/gu;
const WORDS_LETTERS_ONLY = /\p{L}[\p{L}\p{M}]*(?:['’-]\p{L}[\p{L}\p{M}]*)*/gu;

// Below U+0300 every UTF-16 unit is one visible character, so plain Latin
// text never needs the segmenter.
const NEEDS_SEGMENTING = /[̀-￿]/;

let graphemeSegmenter: Intl.Segmenter | null | undefined;

function getGraphemeSegmenter(): Intl.Segmenter | null {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter =
      typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;
  }
  return graphemeSegmenter;
}

/**
 * Characters as a reader counts them: "👍🏽", "é" written as e + accent and a
 * flag are each one. Falls back to code points where the browser has no
 * `Intl.Segmenter`.
 */
export function countCharacters(text: string): number {
  if (!NEEDS_SEGMENTING.test(text)) {
    return text.length;
  }

  const segmenter = getGraphemeSegmenter();
  if (!segmenter) {
    return Array.from(text).length;
  }

  let count = 0;
  const graphemes = segmenter.segment(text)[Symbol.iterator]();
  while (!graphemes.next().done) {
    count += 1;
  }
  return count;
}

// Where a sentence ends: closing punctuation followed by a space or the end
// of the line (so "3.14" and "example.com" stay whole), optionally with the
// quote or bracket that closes it. Full-width CJK marks need no space.
const SENTENCE_END = /[.!?…؟।]+["'”’)\]]*(?=\s|$)|[。！？]+[”’」』）]*/gu;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** A line break also ends a sentence, so headings and list items count. */
function countSentences(normalized: string): number {
  let count = 0;

  for (const line of normalized.split('\n')) {
    for (const candidate of line.split(SENTENCE_END)) {
      // "..." or "- - -" on their own are not sentences.
      if (HAS_LETTER_OR_DIGIT.test(candidate)) {
        count += 1;
      }
    }
  }

  return count;
}

export function analyzeText(text: string, { includeNumbers }: CountOptions): TextStats {
  const normalized = text.replace(/\r\n/g, '\n');
  const words = normalized.match(includeNumbers ? WORDS_WITH_NUMBERS : WORDS_LETTERS_ONLY) ?? [];
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  let totalWordLength = 0;
  let longestWord = '';
  let longestLength = 0;
  for (const word of words) {
    const length = countCharacters(word);
    totalWordLength += length;
    if (length > longestLength) {
      longestWord = word;
      longestLength = length;
    }
  }

  const characters = countCharacters(normalized);
  const whitespace = normalized.match(/\s/g)?.length ?? 0;

  return {
    words: words.length,
    characters,
    charactersNoSpaces: characters - whitespace,
    sentences: countSentences(normalized),
    paragraphs: paragraphs.length,
    lines: normalized ? normalized.split('\n').length : 0,
    readingMinutes: words.length / AVERAGE_READING_WPM,
    speakingMinutes: words.length / AVERAGE_SPEAKING_WPM,
    longestWord,
    averageWordLength: words.length > 0 ? totalWordLength / words.length : 0,
  };
}

/** "45 sec", "3 min", "3 min 20 sec". Anything above zero is at least 1 sec. */
export function formatDuration(minutes: number): string {
  if (!(minutes > 0)) {
    return '0 sec';
  }

  const totalSeconds = Math.max(1, Math.round(minutes * 60));
  if (totalSeconds < 60) {
    return `${totalSeconds} sec`;
  }

  const wholeMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (seconds === 0) {
    return `${wholeMinutes} min`;
  }

  return `${wholeMinutes} min ${seconds} sec`;
}
