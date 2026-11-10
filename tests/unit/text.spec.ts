import { test, expect } from '@playwright/test';
import { lineEnding, numberReader, plural, splitLines } from '@/lib/text';

test.describe('splitLines', () => {
  test('splits on LF, CRLF and CR and ignores one trailing line break', () => {
    expect(splitLines('a\nb')).toEqual(['a', 'b']);
    expect(splitLines('a\r\nb\r\n')).toEqual(['a', 'b']);
    expect(splitLines('a\rb')).toEqual(['a', 'b']);
    expect(splitLines('a\n\n')).toEqual(['a', '']);
  });

  test('empty text has no lines, a lone line break is one empty line', () => {
    expect(splitLines('')).toEqual([]);
    expect(splitLines('\n')).toEqual(['']);
  });
});

test.describe('lineEnding', () => {
  test('is CRLF when any line break is CRLF, LF otherwise', () => {
    expect(lineEnding('a\r\nb')).toBe('\r\n');
    expect(lineEnding('a\nb\r\nc')).toBe('\r\n');
    expect(lineEnding('a\nb')).toBe('\n');
    expect(lineEnding('no break')).toBe('\n');
  });
});

test.describe('plural', () => {
  test('adds an s unless the count is exactly one', () => {
    expect(plural(1, 'item')).toBe('1 item');
    expect(plural(0, 'item')).toBe('0 items');
    expect(plural(2, 'key')).toBe('2 keys');
  });

  test('groups thousands and uses the given plural', () => {
    expect(plural(1234, 'line')).toBe('1,234 lines');
    expect(plural(1, 'empty line', 'empty lines')).toBe('1 empty line');
    expect(plural(3, 'box', 'boxes')).toBe('3 boxes');
  });
});

test.describe('numberReader', () => {
  const read = numberReader('Enter a number.');

  test('reads plain, signed and grouped numbers', () => {
    expect(read('42', null)).toEqual({ value: 42 });
    expect(read('-6.5', null)).toEqual({ value: -6.5 });
    expect(read('.5', null)).toEqual({ value: 0.5 });
    expect(read(' 1,000.50 ', null)).toEqual({ value: 1000.5 });
    expect(read('1 000', null)).toEqual({ value: 1000 });
  });

  test('rejects a comma that is not a thousands separator instead of reading 65', () => {
    expect(read('6,5', null)).toEqual({ error: 'Enter a number.' });
    expect(read('1,00', null)).toEqual({ error: 'Enter a number.' });
    expect(read('abc', null)).toEqual({ error: 'Enter a number.' });
    expect(read('1e3', null)).toEqual({ error: 'Enter a number.' });
  });

  test('a blank field is the blank error, or 0 for an optional field', () => {
    expect(read('  ', 'Required.')).toEqual({ error: 'Required.' });
    expect(read('', null)).toEqual({ value: 0 });
  });
});
