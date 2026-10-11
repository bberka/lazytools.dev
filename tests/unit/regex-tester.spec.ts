import { test, expect } from '@playwright/test';
import {
  explainRegex,
  testRegex,
  toFlagString,
  type RegexFlags,
} from '@/lib/tools/regex-tester';

const flags = (overrides: Partial<RegexFlags> = {}): RegexFlags => ({
  global: true,
  multiline: false,
  caseInsensitive: false,
  dotAll: false,
  unicode: false,
  ...overrides,
});

test.describe('toFlagString', () => {
  test('writes the flags in a fixed order', () => {
    expect(toFlagString(flags())).toBe('g');
    expect(toFlagString(flags({ global: false }))).toBe('');
    expect(
      toFlagString(flags({ multiline: true, caseInsensitive: true, dotAll: true, unicode: true }))
    ).toBe('gmisu');
  });
});

test.describe('testRegex', () => {
  test('finds every match with its index and capture groups', () => {
    const result = testRegex('(\\w)(\\d)?', flags(), 'a1 b');

    expect(result.isValid).toBe(true);
    expect(result.error).toBe('');
    expect(result.matches).toEqual([
      { text: 'a1', index: 0, groups: ['a', '1'] },
      { text: 'b', index: 3, groups: ['b', undefined] },
    ]);
  });

  test('returns only the first match without the global flag', () => {
    const result = testRegex('\\d+', flags({ global: false }), 'a 12 b 345');

    expect(result.matches).toEqual([{ text: '12', index: 2, groups: [] }]);
  });

  test('honours the case, multiline and dot-all flags', () => {
    expect(testRegex('abc', flags(), 'ABC').matches).toHaveLength(0);
    expect(testRegex('abc', flags({ caseInsensitive: true }), 'ABC').matches).toHaveLength(1);
    expect(testRegex('^b', flags(), 'a\nb').matches).toHaveLength(0);
    expect(testRegex('^b', flags({ multiline: true }), 'a\nb').matches).toHaveLength(1);
    expect(testRegex('a.b', flags(), 'a\nb').matches).toHaveLength(0);
    expect(testRegex('a.b', flags({ dotAll: true }), 'a\nb').matches).toHaveLength(1);
  });

  test('is neither valid nor an error for an empty pattern', () => {
    expect(testRegex('', flags(), 'text')).toEqual({ isValid: false, error: '', matches: [] });
  });

  test('is valid with no matches for an empty test string', () => {
    expect(testRegex('a+', flags(), '')).toEqual({ isValid: true, error: '', matches: [] });
  });

  test('reports a pattern that does not compile', () => {
    const result = testRegex('(unclosed', flags(), 'text');

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid regular expression');
    expect(result.matches).toEqual([]);
  });

  test('reports a pattern that is only invalid in Unicode mode', () => {
    expect(testRegex('\\-', flags(), 'a-b').isValid).toBe(true);
    expect(testRegex('\\-', flags({ unicode: true }), 'a-b').isValid).toBe(false);
  });

  test('finds every empty match once and then stops', () => {
    const result = testRegex('x*', flags(), 'ab');

    expect(result.matches.map((match) => match.index)).toEqual([0, 1, 2]);
    expect(result.matches.every((match) => match.text === '')).toBe(true);
  });

  // Defect: after an empty match the search stepped on by one UTF-16 unit. In
  // Unicode mode the engine steps back out of the middle of an emoji, so the
  // same empty match came back for ever and the page hung.
  test('gets past an empty match in front of an emoji in Unicode mode', () => {
    expect(
      testRegex('(?:)', flags({ unicode: true }), '😀').matches.map((match) => match.index)
    ).toEqual([0, 2]);
    expect(
      testRegex('x*', flags({ unicode: true }), 'hi 😀').matches.map((match) => match.index)
    ).toEqual([0, 1, 2, 3, 5]);
    expect(
      testRegex('^', flags({ unicode: true, multiline: true }), '😀\n😀').matches.map(
        (match) => match.index
      )
    ).toEqual([0, 3]);
  });

  test('matches whole emoji with the dot in Unicode mode', () => {
    const result = testRegex('.', flags({ unicode: true }), 'a😀b');

    expect(result.matches.map((match) => match.text)).toEqual(['a', '😀', 'b']);
  });
});

const tokens = (pattern: string, options?: Parameters<typeof explainRegex>[1]) =>
  explainRegex(pattern, options).map((item) => item.token);

const describeToken = (pattern: string, token: string, options?: Parameters<typeof explainRegex>[1]) =>
  explainRegex(pattern, options).find((item) => item.token === token);

test.describe('explainRegex', () => {
  test('explains nothing for an empty pattern', () => {
    expect(explainRegex('')).toEqual([]);
  });

  test('explains classes, quantifiers, anchors and literals', () => {
    expect(explainRegex('^\\d{2,5}a+?$')).toEqual([
      { token: '^', description: 'Start of string (or line)', category: 'Anchor' },
      { token: '\\d', description: 'Any digit character (0-9)', category: 'Character Class' },
      {
        token: '{2,5}',
        description: 'Repeat preceding element: between 2 and 5 times',
        category: 'Quantifier',
      },
      { token: 'a', description: 'Literal character "a"', category: 'Literal' },
      {
        token: '+?',
        description: 'Repeat preceding element 1 or more times (lazy/non-greedy match)',
        category: 'Quantifier',
      },
      { token: '$', description: 'End of string (or line)', category: 'Anchor' },
    ]);
  });

  test('explains the three range forms', () => {
    expect(describeToken('a{3}', '{3}')?.description).toBe(
      'Repeat preceding element: exactly 3 times'
    );
    expect(describeToken('a{1,}', '{1,}')?.description).toBe(
      'Repeat preceding element: 1 or more times'
    );
    expect(describeToken('a{2,5}', '{2,5}')?.description).toBe(
      'Repeat preceding element: between 2 and 5 times'
    );
  });

  test('explains groups, alternation and character sets', () => {
    expect(tokens('(a|b)(?:[^x-z]c)')).toEqual(['(', 'a', '|', 'b', ')', '(?:', '[^x-z]', 'c', ')']);
    expect(describeToken('[^x-z]', '[^x-z]')?.description).toBe(
      'Any single character NOT in set: "x-z"'
    );
    expect(describeToken('[abc]', '[abc]')?.description).toBe(
      'Any single character in set: "abc"'
    );
  });

  // Defect: "(?=" was read as a capturing group, an optional marker and a
  // literal "=", which is what the built-in password recipe showed.
  test('explains lookaheads and lookbehinds as one token', () => {
    const password = explainRegex('^(?=.*[a-z])(?=.*\\d).{8,}$');

    expect(password.map((item) => item.token)).toEqual([
      '^',
      '(?=',
      '.',
      '*',
      '[a-z]',
      ')',
      '(?=',
      '.',
      '*',
      '\\d',
      ')',
      '.',
      '{8,}',
      '$',
    ]);
    expect(password[1]).toEqual({
      token: '(?=',
      description: 'Start of positive lookahead (what follows must match)',
      category: 'Group',
    });
    expect(describeToken('a(?!b)', '(?!')?.description).toContain('negative lookahead');
    expect(describeToken('(?<=a)b', '(?<=')?.description).toContain('positive lookbehind');
    expect(describeToken('(?<!a)b', '(?<!')?.description).toContain('negative lookbehind');
  });

  // Defect: a named group was read as "(", "?", "<", ...
  test('explains named groups and references to them', () => {
    expect(tokens('(?<year>\\d{4})-\\k<year>')).toEqual([
      '(?<year>',
      '\\d',
      '{4}',
      ')',
      '-',
      '\\k<year>',
    ]);
    expect(describeToken('(?<year>\\d)', '(?<year>')?.description).toBe(
      'Start of capturing group named "year"'
    );
  });

  // Defect: "\1" was explained as the literal character "1".
  test('explains backreferences', () => {
    const reference = describeToken('(a)\\1', '\\1');

    expect(reference?.category).toBe('Group');
    expect(reference?.description).toContain('capture group 1');
    expect(tokens('(a)\\12')).toEqual(['(', 'a', ')', '\\12']);
  });

  // Defect: a set was cut at an escaped "]".
  test('reads an escaped bracket as part of the set', () => {
    expect(tokens('[\\]a]b')).toEqual(['[\\]a]', 'b']);
    expect(tokens('[a\\\\]b')).toEqual(['[a\\\\]', 'b']);
  });

  test('explains the empty and the match-anything set', () => {
    expect(describeToken('[]', '[]')?.description).toBe('Empty set (matches nothing)');
    expect(describeToken('[^]', '[^]')?.description).toBe('Any character, including newline');
  });

  // Defect: any "{...}" was called a quantifier, "a{b}" included.
  test('reads braces that are not a range as literals', () => {
    expect(tokens('a{b}')).toEqual(['a', '{', 'b', '}']);
    expect(tokens('a{,5}')).toEqual(['a', '{', ',', '5', '}']);
    expect(describeToken('a{b}', '{')?.category).toBe('Literal');
  });

  // Defect: the dot was always "except newline", also with the s flag.
  test('describes the dot according to the dot-all flag', () => {
    expect(describeToken('.', '.')?.description).toBe('Any character except newline');
    expect(describeToken('.', '.', { dotAll: true })?.description).toBe(
      'Any character, including newline'
    );
  });

  // Defect: an emoji in the pattern was listed as two broken halves.
  test('keeps a character outside the basic plane in one piece', () => {
    expect(tokens('a😀+')).toEqual(['a', '😀', '+']);
    expect(tokens('\\😀')).toEqual(['\\😀']);
  });

  test('explains escaped meta-characters and code escapes', () => {
    expect(describeToken('\\.', '\\.')?.description).toBe(
      'Escaped special meta-character "." (matches literal ".")'
    );
    expect(describeToken('\\u00e9', '\\u00e9')?.description).toBe('Character with code U+00E9');
    expect(describeToken('\\x41', '\\x41')?.description).toBe('Character with code U+0041');
    expect(describeToken('\\-', '\\-')?.description).toBe('Literal character "-"');
  });

  test('explains Unicode escapes only in Unicode mode', () => {
    expect(tokens('\\p{L}+', { unicode: true })).toEqual(['\\p{L}', '+']);
    expect(describeToken('\\p{L}', '\\p{L}', { unicode: true })?.category).toBe('Character Class');
    expect(tokens('\\u{1F600}', { unicode: true })).toEqual(['\\u{1F600}']);
    // Without the flag "\p" is just a "p" and the braces are literals.
    expect(tokens('\\p{L}')).toEqual(['\\p', '{', 'L', '}']);
    expect(tokens('\\u{3}')).toEqual(['\\u', '{3}']);
  });

  test('copes with a trailing backslash and an unclosed set', () => {
    expect(tokens('a\\')).toEqual(['a', '\\']);
    expect(tokens('[ab')).toEqual(['[', 'a', 'b']);
  });

  test('joined tokens give back the pattern', () => {
    const patterns = [
      '^[\\w.%+-]+@[\\w.-]+\\.[A-Za-z]{2,}$',
      '^https?:\\/\\/[\\w.-]+(?:\\/[\\w./?%&=-]*)?$',
      '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$',
      '\\b[A-Fa-f0-9]{8}\\b',
      '(?<a>x)\\k<a>|[\\]]{b}😀*?',
    ];

    for (const pattern of patterns) {
      expect(tokens(pattern).join(''), pattern).toBe(pattern);
    }
  });
});
