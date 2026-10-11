import { test, expect } from '@playwright/test';
import { findAndReplace, type FindReplaceOptions } from '@/lib/tools/find-and-replace';

const run = (input: string, options: Partial<FindReplaceOptions>) =>
  findAndReplace(input, {
    find: '',
    replace: '',
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    replaceAll: true,
    ...options,
  });

test.describe('literal search', () => {
  test('replaces every match and reports where they were', () => {
    const result = run('one cat, two cats, CAT', { find: 'cat', replace: 'dog' });

    expect(result.output).toBe('one dog, two dogs, dog');
    expect(result.matches).toEqual([
      { index: 4, text: 'cat' },
      { index: 13, text: 'cat' },
      { index: 19, text: 'CAT' },
    ]);
    expect(result.replacements).toBe(3);
    expect(result.error).toBe('');
  });

  test('respects case when asked', () => {
    const result = run('Cat cat CAT', { find: 'cat', replace: 'dog', caseSensitive: true });

    expect(result.output).toBe('Cat dog CAT');
    expect(result.matches).toEqual([{ index: 4, text: 'cat' }]);
  });

  test('replaces only the first match without replace all, but still lists them all', () => {
    const result = run('a-a-a', { find: 'a', replace: 'b', replaceAll: false });

    expect(result.output).toBe('b-a-a');
    expect(result.matches).toHaveLength(3);
    expect(result.replacements).toBe(1);
  });

  test('treats regex characters in the search as plain text', () => {
    const result = run('price: $5.00 (approx.) [a+b]', { find: '$5.00 (approx.)', replace: '?' });

    expect(result.output).toBe('price: ? [a+b]');
    expect(run('a.b axb', { find: 'a.b', replace: '-' }).output).toBe('- axb');
  });

  test('keeps $ sequences in the replacement as typed', () => {
    expect(run('cost', { find: 'cost', replace: '$& is $1 and $$' }).output).toBe(
      '$& is $1 and $$'
    );
  });

  test('deletes matches when the replacement is empty', () => {
    expect(run('a, b, c', { find: ', ' }).output).toBe('abc');
  });

  test('does nothing without a search text', () => {
    expect(run('unchanged', { replace: 'x' })).toEqual({
      matches: [],
      replacements: 0,
      output: 'unchanged',
      error: '',
    });
  });

  test('handles empty input and input without a match', () => {
    expect(run('', { find: 'a', replace: 'b' }).output).toBe('');
    expect(run('xyz', { find: 'a', replace: 'b' })).toEqual({
      matches: [],
      replacements: 0,
      output: 'xyz',
      error: '',
    });
  });

  test('finds emoji and text next to them', () => {
    const result = run('go 🚀 now 🚀', { find: '🚀', replace: 'up' });

    expect(result.output).toBe('go up now up');
    expect(result.matches.map((match) => match.index)).toEqual([3, 10]);
  });
});

test.describe('whole word', () => {
  test('skips matches inside longer words', () => {
    const result = run('cat concat cats cat_1 Cat.', { find: 'cat', replace: 'dog', wholeWord: true });

    expect(result.output).toBe('dog concat cats cat_1 dog.');
    expect(result.replacements).toBe(2);
  });

  // Defect: \b only knows ASCII, so a word that starts or ends with an
  // accented or non-Latin letter was never found.
  test('finds words that start or end with a non-ASCII letter', () => {
    expect(run('un café noir', { find: 'café', replace: 'thé', wholeWord: true }).output).toBe(
      'un thé noir'
    );
    expect(run('über uns', { find: 'über', replace: 'about', wholeWord: true }).output).toBe(
      'about uns'
    );
    expect(run('это мир', { find: 'мир', replace: 'world', wholeWord: true }).output).toBe(
      'это world'
    );
  });

  // Defect: an ASCII word glued to an accented letter counted as a whole word.
  test('does not match part of a word that continues with a non-ASCII letter', () => {
    expect(run('caféine cafe', { find: 'caf', replace: 'X', wholeWord: true }).matches).toEqual(
      []
    );
    expect(run('élan lan', { find: 'lan', replace: 'X', wholeWord: true }).output).toBe('élan X');
    expect(
      run('café cafe', { find: 'cafe', replace: 'X', wholeWord: true }).output
    ).toBe('café X');
  });

  test('matches a search that ends in punctuation', () => {
    expect(run('I use C++ daily', { find: 'C++', replace: 'Rust', wholeWord: true }).output).toBe(
      'I use Rust daily'
    );
  });

  test('applies to regex searches as well', () => {
    const result = run('cat dog catdog été', {
      find: 'cat|dog|été',
      replace: '#',
      wholeWord: true,
      useRegex: true,
    });

    expect(result.output).toBe('# # catdog #');
  });

  test('still works for a regex that is only valid outside Unicode mode', () => {
    const result = run('a-b xa-b', { find: 'a\\-b', replace: '#', wholeWord: true, useRegex: true });

    expect(result.error).toBe('');
    expect(result.output).toBe('# xa-b');
  });
});

test.describe('regex search', () => {
  test('expands capture groups in the replacement', () => {
    const result = run('2026-05-03 and 2025-12-31', {
      find: '(\\d{4})-(\\d{2})-(\\d{2})',
      replace: '$3/$2/$1',
      useRegex: true,
    });

    expect(result.output).toBe('03/05/2026 and 31/12/2025');
    expect(result.matches.map((match) => match.text)).toEqual(['2026-05-03', '2025-12-31']);
  });

  test('is case insensitive unless asked otherwise', () => {
    expect(run('Foo foo', { find: 'f(o+)', replace: '<$1>', useRegex: true }).output).toBe(
      '<oo> <oo>'
    );
    expect(
      run('Foo foo', { find: 'f(o+)', replace: '<$1>', useRegex: true, caseSensitive: true })
        .output
    ).toBe('Foo <oo>');
  });

  test('reports an invalid pattern and leaves the text alone', () => {
    const result = run('some text', { find: '(unclosed', replace: 'x', useRegex: true });

    expect(result.error).not.toBe('');
    expect(result.output).toBe('some text');
    expect(result.matches).toEqual([]);
    expect(result.replacements).toBe(0);
  });

  test('reports an invalid pattern with whole word on too', () => {
    const result = run('some text', {
      find: '[a-',
      replace: 'x',
      useRegex: true,
      wholeWord: true,
    });

    expect(result.error).not.toBe('');
    expect(result.output).toBe('some text');
  });

  test('handles patterns that match the empty string', () => {
    const result = run('ab', { find: 'x*', replace: '-', useRegex: true });

    expect(result.output).toBe('-a-b-');
    expect(result.matches).toEqual([
      { index: 0, text: '' },
      { index: 1, text: '' },
      { index: 2, text: '' },
    ]);
    expect(result.replacements).toBe(3);
  });

  test('replaces only the first regex match without replace all', () => {
    const result = run('a1 b2 c3', { find: '\\d', replace: '#', useRegex: true, replaceAll: false });

    expect(result.output).toBe('a# b2 c3');
    expect(result.matches).toHaveLength(3);
    expect(result.replacements).toBe(1);
  });
});
