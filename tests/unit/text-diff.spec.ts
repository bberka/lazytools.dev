import { test, expect } from '@playwright/test';
import {
  diffText,
  hasChanges,
  segmentsOf,
  toSideBySideRows,
  type DiffRow,
} from '@/lib/tools/text-diff';

const lineRows = (original: string, modified: string) =>
  toSideBySideRows(diffText(original, modified, 'lines'));

/** One string per row: " text" unchanged, "-text" removed, "+text" added, "(none)" padding. */
const sketch = (rows: DiffRow[]) =>
  rows.map((row) => {
    const mark = (cell: DiffRow['left']) =>
      cell.kind === 'empty'
        ? '(none)'
        : `${cell.kind === 'added' ? '+' : cell.kind === 'removed' ? '-' : ' '}${cell.text}`;
    return `${mark(row.left)} | ${mark(row.right)}`;
  });

test.describe('diffText', () => {
  test('finds nothing to compare in two empty texts', () => {
    expect(diffText('', '', 'lines')).toEqual([]);
    expect(diffText('', '', 'words')).toEqual([]);
  });

  test('marks changed lines', () => {
    expect(diffText('a\nb\nc', 'a\nx\nc', 'lines')).toEqual([
      { text: 'a\n', change: 'unchanged' },
      { text: 'b\n', change: 'removed' },
      { text: 'x\n', change: 'added' },
      { text: 'c', change: 'unchanged' },
    ]);
  });

  test('marks changed words', () => {
    expect(diffText('The quick brown fox', 'The slow brown fox', 'words')).toEqual([
      { text: 'The ', change: 'unchanged' },
      { text: 'quick', change: 'removed' },
      { text: 'slow', change: 'added' },
      { text: ' brown fox', change: 'unchanged' },
    ]);
  });

  test('treats text against nothing as all added or all removed', () => {
    expect(diffText('', 'x\ny', 'lines')).toEqual([{ text: 'x\ny', change: 'added' }]);
    expect(diffText('x y', '', 'words')).toEqual([{ text: 'x y', change: 'removed' }]);
  });

  test('compares emoji and non-Latin text', () => {
    expect(diffText('привет 😀', 'привет 🎉', 'words')).toEqual([
      { text: 'привет ', change: 'unchanged' },
      { text: '😀', change: 'removed' },
      { text: '🎉', change: 'added' },
    ]);
  });
});

test.describe('hasChanges', () => {
  test('is false for identical texts and true otherwise', () => {
    expect(hasChanges(diffText('same\ntext', 'same\ntext', 'lines'))).toBe(false);
    expect(hasChanges(diffText('same\ntext', 'same\ntexts', 'lines'))).toBe(true);
    expect(hasChanges([])).toBe(false);
  });

  test('is false when a word diff only differs in whitespace', () => {
    expect(hasChanges(diffText('a  b', 'a b', 'words'))).toBe(false);
  });
});

test.describe('segmentsOf', () => {
  const segments = diffText('The quick brown fox', 'The slow brown fox', 'words');
  const text = (side: 'original' | 'modified') =>
    segmentsOf(segments, side)
      .map((segment) => segment.text)
      .join('');

  test('rebuilds each text from the shared parts and its own changes', () => {
    expect(text('original')).toBe('The quick brown fox');
    expect(text('modified')).toBe('The slow brown fox');
  });

  test('keeps the change marks', () => {
    expect(segmentsOf(segments, 'original').map((segment) => segment.change)).toEqual([
      'unchanged',
      'removed',
      'unchanged',
    ]);
    expect(segmentsOf(segments, 'modified').map((segment) => segment.change)).toEqual([
      'unchanged',
      'added',
      'unchanged',
    ]);
  });

  // Defect: side by side, a word diff put every changed word on a row of its
  // own. Each pane now gets its whole text, line breaks included.
  test('keeps a multi-line text in one piece per side', () => {
    const multiline = diffText('one two\nthree four', 'one 2\nthree four', 'words');

    expect(
      segmentsOf(multiline, 'modified')
        .map((segment) => segment.text)
        .join('')
    ).toBe('one 2\nthree four');
  });
});

test.describe('toSideBySideRows', () => {
  test('has no rows for no differences to show', () => {
    expect(toSideBySideRows([])).toEqual([]);
  });

  test('puts unchanged lines on both sides', () => {
    expect(lineRows('a\nb', 'a\nb')).toEqual([
      { left: { text: 'a', kind: 'unchanged' }, right: { text: 'a', kind: 'unchanged' } },
      { left: { text: 'b', kind: 'unchanged' }, right: { text: 'b', kind: 'unchanged' } },
    ]);
  });

  // Defect: every chunk of the diff was followed by a phantom blank row.
  test('adds no blank rows between chunks', () => {
    expect(sketch(lineRows('a\nb\nc', 'a\nx\nc'))).toEqual([
      ' a |  a',
      '-b | (none)',
      '(none) | +x',
      ' c |  c',
    ]);
  });

  // Defect: when the diff ended with an added line, that line was dropped.
  test('keeps an added last line', () => {
    expect(sketch(lineRows('hello\nworld', 'hello\nthere'))).toEqual([
      ' hello |  hello',
      '-world | (none)',
      '(none) | +there',
    ]);
    expect(sketch(lineRows('a\n', 'a\nb'))).toEqual([' a |  a', '(none) | +b']);
    expect(sketch(lineRows('', 'x\ny'))).toEqual(['(none) | +x', '(none) | +y']);
  });

  test('keeps a removed last line', () => {
    expect(sketch(lineRows('a\nb', 'a\n'))).toEqual([' a |  a', '-b | (none)']);
    expect(sketch(lineRows('x\ny', ''))).toEqual(['-x | (none)', '-y | (none)']);
  });

  test('shows blank lines that were added or removed as rows', () => {
    expect(sketch(lineRows('a\n\n\nb', 'a\nb'))).toEqual([
      ' a |  a',
      '- | (none)',
      '- | (none)',
      ' b |  b',
    ]);
    expect(sketch(lineRows('a\nb', 'a\n\nb'))).toEqual([' a |  a', '(none) | +', ' b |  b']);
  });

  test('keeps unchanged blank lines and indentation', () => {
    expect(sketch(lineRows('a\n\n  b', 'a\n\n  b'))).toEqual([' a |  a', '  |  ', '   b |    b']);
  });

  test('has as many rows on the left as on the right', () => {
    const rows = lineRows('one\ntwo\nthree\nfour', 'zero\ntwo\nthree and a half\nfour\nfive');

    expect(rows.filter((row) => row.left.kind !== 'empty').map((row) => row.left.text)).toEqual([
      'one',
      'two',
      'three',
      'four',
    ]);
    expect(rows.filter((row) => row.right.kind !== 'empty').map((row) => row.right.text)).toEqual([
      'zero',
      'two',
      'three and a half',
      'four',
      'five',
    ]);
  });
});
