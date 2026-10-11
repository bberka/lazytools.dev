import { test, expect } from '@playwright/test';
import { analyzeText, countCharacters, formatDuration } from '@/lib/tools/word-counter';

const count = (text: string, includeNumbers = true) => analyzeText(text, { includeNumbers });

test.describe('analyzeText', () => {
  test('counts an ordinary paragraph', () => {
    const stats = count('The quick brown fox. It jumps over the lazy dog!');

    expect(stats.words).toBe(10);
    expect(stats.characters).toBe(48);
    expect(stats.charactersNoSpaces).toBe(39);
    expect(stats.sentences).toBe(2);
    expect(stats.paragraphs).toBe(1);
    expect(stats.lines).toBe(1);
    expect(stats.longestWord).toBe('quick');
    expect(stats.averageWordLength).toBeCloseTo(3.7);
  });

  test('gives zeros for empty text', () => {
    expect(count('')).toEqual({
      words: 0,
      characters: 0,
      charactersNoSpaces: 0,
      sentences: 0,
      paragraphs: 0,
      lines: 0,
      readingMinutes: 0,
      speakingMinutes: 0,
      longestWord: '',
      averageWordLength: 0,
    });
  });

  test('counts whitespace-only text as characters and lines but nothing else', () => {
    const stats = count('  \n\t ');

    expect(stats.words).toBe(0);
    expect(stats.characters).toBe(5);
    expect(stats.charactersNoSpaces).toBe(0);
    expect(stats.sentences).toBe(0);
    expect(stats.paragraphs).toBe(0);
    expect(stats.lines).toBe(2);
  });

  test('counts paragraphs, lines and Windows line endings', () => {
    const stats = count('First paragraph.\r\nStill first.\r\n\r\n\r\nSecond paragraph.');

    expect(stats.paragraphs).toBe(2);
    expect(stats.lines).toBe(5);
    expect(stats.sentences).toBe(3);
  });

  test('joins contractions and hyphenated words', () => {
    expect(count("Don't re-enter the well-known café").words).toBe(5);
  });

  test('counts numbers as words only when asked', () => {
    expect(count('In 2026 we shipped 42 tools').words).toBe(6);
    expect(count('In 2026 we shipped 42 tools', false).words).toBe(4);
  });

  test('estimates reading and speaking time from the word count', () => {
    const stats = count(Array.from({ length: 400 }, () => 'word').join(' '));

    expect(stats.words).toBe(400);
    expect(stats.readingMinutes).toBe(2);
    expect(stats.speakingMinutes).toBeCloseTo(400 / 130);
  });

  // Defect: characters were UTF-16 units, so one emoji counted as 2 or more.
  test('counts an emoji as one character', () => {
    expect(count('😀').characters).toBe(1);
    expect(count('I 👍🏽 it').characters).toBe(6);
    expect(count('👨‍👩‍👧 🇹🇷').characters).toBe(3);
    expect(count('👨‍👩‍👧 🇹🇷').charactersNoSpaces).toBe(2);
  });

  // Defect: a combining mark ended the word, so "résumé" typed with separate
  // accents and words in Devanagari, Thai or Arabic counted as several.
  test('keeps combining marks inside the word', () => {
    expect(count('résumé').words).toBe(1);
    expect(count('résumé').characters).toBe(6);
    expect(count('नमस्ते दुनिया').words).toBe(2);
    expect(count('สวัสดี').words).toBe(1);
    expect(count('مَرْحَبًا بِكَ').words).toBe(2);
    expect(count('résumé', false).words).toBe(1);
  });

  test('measures word length in visible characters', () => {
    const stats = count('résumé cv');

    expect(stats.longestWord).toBe('résumé');
    expect(stats.averageWordLength).toBe(4);
  });

  // Defect: text of a single character had no sentence.
  test('counts a one-character line as a sentence', () => {
    expect(count('A').sentences).toBe(1);
    expect(count('Go. X').sentences).toBe(2);
  });

  // Defect: punctuation on its own counted as a sentence.
  test('does not count punctuation without words as a sentence', () => {
    expect(count('...').sentences).toBe(0);
    expect(count('!!!').sentences).toBe(0);
    expect(count('- - -').sentences).toBe(0);
    expect(count('Wait... what?!').sentences).toBe(2);
  });

  // Defect: a sentence ending inside quotes or brackets ran on into the next.
  test('ends a sentence at a full stop followed by a closing quote', () => {
    expect(count('He said "Stop." Then he left.').sentences).toBe(2);
    expect(count('(It works.) Really!').sentences).toBe(2);
  });

  // Defect: full-width CJK punctuation was not recognised.
  test('recognises CJK sentence endings', () => {
    expect(count('こんにちは。さようなら。').sentences).toBe(2);
    expect(count('你好！你好吗？很好。').sentences).toBe(3);
  });

  test('does not end a sentence inside a number or a domain', () => {
    expect(count('Pi is 3.14 exactly.').sentences).toBe(1);
    expect(count('Visit example.com today.').sentences).toBe(1);
  });

  test('counts each line without closing punctuation as a sentence', () => {
    expect(count('Title\nFirst item\nSecond item').sentences).toBe(3);
  });
});

test.describe('countCharacters', () => {
  test('counts plain text by length', () => {
    expect(countCharacters('')).toBe(0);
    expect(countCharacters('hello')).toBe(5);
    expect(countCharacters('naïve')).toBe(5);
  });

  test('counts each CJK character once', () => {
    expect(countCharacters('漢字かな')).toBe(4);
  });

  test('handles a large text', () => {
    expect(countCharacters('héllo 😀 '.repeat(20000))).toBe(160000);
  });
});

test.describe('formatDuration', () => {
  test('formats seconds, whole minutes and both', () => {
    expect(formatDuration(0.75)).toBe('45 sec');
    expect(formatDuration(3)).toBe('3 min');
    expect(formatDuration(3 + 20 / 60)).toBe('3 min 20 sec');
    expect(formatDuration(90)).toBe('90 min');
  });

  test('never shows a non-empty text as zero seconds', () => {
    expect(formatDuration(1 / 200)).toBe('1 sec');
    expect(formatDuration(0.001)).toBe('1 sec');
  });

  test('gives 0 sec for zero, negative and invalid durations', () => {
    expect(formatDuration(0)).toBe('0 sec');
    expect(formatDuration(-2)).toBe('0 sec');
    expect(formatDuration(Number.NaN)).toBe('0 sec');
  });
});
