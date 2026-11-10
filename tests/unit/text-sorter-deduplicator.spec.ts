import { describe, expect, test } from 'vite-plus/test';
import {
  DEFAULT_OPTIONS,
  EXAMPLE_TEXT,
  leadingNumber,
  processLines,
  shuffleLines,
  sortLines,
  type LineOptions,
} from '@/lib/tools/text-sorter-deduplicator';

// Expected values are worked out by hand from the rules in the module header.

const plain: LineOptions = {
  ...DEFAULT_OPTIONS,
  sort: 'none',
  trimLines: false,
  removeEmpty: false,
  removeDuplicates: false,
};

function run(text: string, changes: Partial<LineOptions>) {
  return processLines(text, { ...plain, ...changes });
}

describe('leadingNumber', () => {
  test('reads the number a line starts with', () => {
    expect(leadingNumber('10 apples')).toBe(10);
    expect(leadingNumber('  -3.5kg')).toBe(-3.5);
    expect(leadingNumber('1e2')).toBe(100);
    expect(leadingNumber('.5')).toBe(0.5);
    expect(leadingNumber('+7')).toBe(7);
  });

  test('is null when the line does not start with a number', () => {
    expect(leadingNumber('abc')).toBeNull();
    expect(leadingNumber('')).toBeNull();
    expect(leadingNumber('x1')).toBeNull();
  });
});

describe('sorting', () => {
  test('A to Z puts lower case before upper case for the same letter and ignores case otherwise', () => {
    expect(run('banana\nApple\ncherry', { sort: 'az' }).text).toBe('Apple\nbanana\ncherry');
    expect(run('b\nA\na\nB', { sort: 'az' }).text).toBe('a\nA\nb\nB');
    expect(run('b\nA\na\nB', { sort: 'za' }).text).toBe('B\nb\nA\na');
  });

  test('code point order puts every capital before every small letter', () => {
    expect(run('b\nA\na\nB', { sort: 'az', codePointOrder: true }).text).toBe('A\nB\na\nb');
    expect(run('b\nA\na\nB', { sort: 'za', codePointOrder: true }).text).toBe('b\na\nB\nA');
  });

  test('natural order reads digit runs as numbers; plain A to Z does not', () => {
    const text = 'file10\nfile2\nfile1';
    expect(run(text, { sort: 'natural' }).text).toBe('file1\nfile2\nfile10');
    expect(run(text, { sort: 'az' }).text).toBe('file1\nfile10\nfile2');
  });

  test('length sorting is stable for equal lengths and counts code points', () => {
    expect(run('ccc\na\nbb\ndd', { sort: 'length-asc' }).text).toBe('a\nbb\ndd\nccc');
    expect(run('ccc\na\nbb\ndd', { sort: 'length-desc' }).text).toBe('ccc\nbb\ndd\na');
    // Two astral letters are 2 code points (4 UTF-16 units), shorter than "abc".
    expect(run('abc\n\u{1D49C}\u{1D49C}', { sort: 'length-asc' }).text).toBe(
      '\u{1D49C}\u{1D49C}\nabc'
    );
  });

  test('numeric sorting orders by the leading number and leaves lines without one last', () => {
    const text = '10\n9\n-3\n2.5\nabc\n1e2\nzzz';
    expect(run(text, { sort: 'numeric-asc' }).text).toBe('-3\n2.5\n9\n10\n1e2\nabc\nzzz');
    expect(run(text, { sort: 'numeric-desc' }).text).toBe('1e2\n10\n9\n2.5\n-3\nabc\nzzz');
  });

  test('reverse flips the order and none keeps it', () => {
    expect(run('a\nb\nc', { sort: 'reverse' }).text).toBe('c\nb\na');
    expect(run('c\na\nb', { sort: 'none' }).text).toBe('c\na\nb');
  });

  test('shuffle keeps every line, repeats for the same seed, and handles 0 and 1 lines', () => {
    const lines = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const once = shuffleLines(lines, 42);
    expect([...once].sort()).toEqual(lines);
    expect(shuffleLines(lines, 42)).toEqual(once);
    expect(shuffleLines(lines, 7)).not.toEqual(shuffleLines(lines, 8));
    expect(shuffleLines([], 1)).toEqual([]);
    expect(shuffleLines(['only'], 1)).toEqual(['only']);
    expect(lines).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(sortLines(lines, 'shuffle', { shuffleSeed: 42 })).toEqual(once);
  });
});

describe('processLines', () => {
  test('removes duplicates and counts them; the first occurrence stays', () => {
    const result = run('a\nA\na\nb', { removeDuplicates: true });
    expect(result.text).toBe('a\nA\nb');
    expect(result.stats).toEqual({
      inputLines: 4,
      outputLines: 3,
      removedEmpty: 0,
      removedDuplicates: 1,
    });
  });

  test('ignoring case keeps the first spelling', () => {
    const result = run('a\nA\na\nb', { removeDuplicates: true, ignoreCase: true });
    expect(result.text).toBe('a\nb');
    expect(result.stats.removedDuplicates).toBe(2);
    expect(run('Apple\napple', { removeDuplicates: true, ignoreCase: true }).text).toBe('Apple');
  });

  test('trimming makes padded lines equal; without it they differ', () => {
    expect(run('  a\na  \n a', { trimLines: true, removeDuplicates: true }).text).toBe('a');
    expect(run('  a\na  \n a', { removeDuplicates: true }).text).toBe('  a\na  \n a');
  });

  test('removing empty lines also drops whitespace-only lines, and counts them', () => {
    const result = run('a\n\n  \nb\n\t\nc', { removeEmpty: true });
    expect(result.text).toBe('a\nb\nc');
    expect(result.stats.removedEmpty).toBe(3);
    expect(result.stats.inputLines).toBe(6);
  });

  test('keeps empty lines when asked to, and sorts them to the top', () => {
    expect(run('b\n\na', { sort: 'az' }).text).toBe('\na\nb');
  });

  test('CRLF input gives CRLF output and the trailing break is not a line', () => {
    const result = run('b\r\na\r\nb\r\n', { sort: 'az', removeDuplicates: true });
    expect(result.text).toBe('a\r\nb');
    expect(result.stats.inputLines).toBe(3);
  });

  test('empty input gives empty output and zero counts', () => {
    const result = processLines('', DEFAULT_OPTIONS);
    expect(result.text).toBe('');
    expect(result.lines).toEqual([]);
    expect(result.stats).toEqual({
      inputLines: 0,
      outputLines: 0,
      removedEmpty: 0,
      removedDuplicates: 0,
    });
  });

  test('unicode lines are compared as written and decomposed text is a different line', () => {
    const result = run('café\ncafé\n\u{1F600}\n\u{1F600}', { removeDuplicates: true });
    expect(result.text).toBe('café\ncafé\n\u{1F600}');
  });

  test('the defaults on the example text', () => {
    // banana twice and one empty line go; the rest is in dictionary order.
    const result = processLines(EXAMPLE_TEXT, DEFAULT_OPTIONS);
    expect(result.text).toBe(
      ['apple', 'Apple', 'banana', 'cherry', 'Cherry', 'file10.txt', 'file2.txt'].join('\n')
    );
    expect(result.stats).toEqual({
      inputLines: 9,
      outputLines: 7,
      removedEmpty: 1,
      removedDuplicates: 1,
    });
  });
});
