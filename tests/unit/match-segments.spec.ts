import { test, expect } from '@playwright/test';
import { splitAtMatches } from '@/lib/tools/match-segments';

const join = (segments: Array<{ text: string }>) => segments.map((segment) => segment.text).join('');

test.describe('splitAtMatches', () => {
  test('alternates unmatched and matched text', () => {
    expect(
      splitAtMatches('one cat, two cats', [
        { index: 4, text: 'cat' },
        { index: 13, text: 'cat' },
      ])
    ).toEqual([
      { text: 'one ', isMatch: false },
      { text: 'cat', isMatch: true },
      { text: ', two ', isMatch: false },
      { text: 'cat', isMatch: true },
      { text: 's', isMatch: false },
    ]);
  });

  test('returns the whole text as one segment when nothing matched', () => {
    expect(splitAtMatches('plain', [])).toEqual([{ text: 'plain', isMatch: false }]);
  });

  test('returns nothing for empty text', () => {
    expect(splitAtMatches('', [])).toEqual([]);
  });

  test('handles matches at the very start and end, and next to each other', () => {
    expect(
      splitAtMatches('aab', [
        { index: 0, text: 'a' },
        { index: 1, text: 'a' },
        { index: 2, text: 'b' },
      ])
    ).toEqual([
      { text: 'a', isMatch: true },
      { text: 'a', isMatch: true },
      { text: 'b', isMatch: true },
    ]);
  });

  test('keeps empty matches as empty segments without losing text', () => {
    const text = 'ab';
    const segments = splitAtMatches(text, [
      { index: 0, text: '' },
      { index: 1, text: '' },
      { index: 2, text: '' },
    ]);

    expect(segments.filter((segment) => segment.isMatch)).toHaveLength(3);
    expect(join(segments)).toBe(text);
  });

  test('always joins back to the original text', () => {
    const text = 'naïve 😀 text with 😀 emoji';
    const matches = Array.from(text.matchAll(/😀|text/gu), (match) => ({
      index: match.index,
      text: match[0],
    }));

    const segments = splitAtMatches(text, matches);

    expect(join(segments)).toBe(text);
    expect(segments.filter((segment) => segment.isMatch).map((segment) => segment.text)).toEqual([
      '😀',
      'text',
      '😀',
    ]);
  });
});
