import { test, expect } from '@playwright/test';
import { convertList, type ListOptions } from '@/lib/tools/list-converter';

const DEFAULTS: ListOptions = {
  inputDelimiter: 'newline',
  customInputDelimiter: '',
  outputDelimiter: '|',
  trimItems: true,
  removeEmpty: true,
  deduplicate: false,
  sortOrder: 'none',
  caseConversion: 'none',
};

const convert = (input: string, options: Partial<ListOptions> = {}) =>
  convertList(input, { ...DEFAULTS, ...options });

const items = (input: string, options: Partial<ListOptions> = {}) => convert(input, options).items;

test.describe('splitting and cleaning', () => {
  test('splits lines, trims them and drops the empty ones by default', () => {
    expect(items('  apple \r\nbanana\n\n   \ncherry\n')).toEqual(['apple', 'banana', 'cherry']);
  });

  test('splits on the chosen delimiter', () => {
    expect(items('a, b,c', { inputDelimiter: 'comma' })).toEqual(['a', 'b', 'c']);
    expect(items('a; b;c', { inputDelimiter: 'semicolon' })).toEqual(['a', 'b', 'c']);
    expect(items('a\tb\tc', { inputDelimiter: 'tab' })).toEqual(['a', 'b', 'c']);
    expect(items('a::b::c', { inputDelimiter: 'custom', customInputDelimiter: '::' })).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  test('keeps the input as one item while the custom delimiter is still empty', () => {
    expect(items('a, b', { inputDelimiter: 'custom' })).toEqual(['a, b']);
  });

  test('can keep whitespace and empty items', () => {
    expect(items(' a ,,b', { inputDelimiter: 'comma', trimItems: false, removeEmpty: false })).toEqual(
      [' a ', '', 'b']
    );
    expect(items(' a , ,b', { inputDelimiter: 'comma', trimItems: false })).toEqual([
      ' a ',
      ' ',
      'b',
    ]);
  });

  test('removes duplicates and keeps the first of each', () => {
    expect(items('b\na\nb\nc\na', { deduplicate: true })).toEqual(['b', 'a', 'c']);
  });

  test('duplicates are case sensitive without a case conversion', () => {
    expect(items('Apple\napple', { deduplicate: true })).toEqual(['Apple', 'apple']);
  });

  // Defect: duplicates were removed before the case conversion, so "Apple"
  // and "apple" both survived and came out as two identical items.
  test('removes items that only become duplicates after the case conversion', () => {
    expect(items('Apple\napple\nAPPLE\npear', { deduplicate: true, caseConversion: 'lower' })).toEqual(
      ['apple', 'pear']
    );
    expect(items('Apple\napple', { deduplicate: true, caseConversion: 'upper' })).toEqual(['APPLE']);
  });

  test('converts case', () => {
    expect(items('Apple\nbanana', { caseConversion: 'upper' })).toEqual(['APPLE', 'BANANA']);
    expect(items('Apple\nBANANA', { caseConversion: 'lower' })).toEqual(['apple', 'banana']);
  });

  test('sorts in either direction, ignoring case', () => {
    expect(items('pear\nApple\nbanana', { sortOrder: 'asc' })).toEqual(['Apple', 'banana', 'pear']);
    expect(items('pear\nApple\nbanana', { sortOrder: 'desc' })).toEqual(['pear', 'banana', 'Apple']);
  });

  test('has no items for empty or blank input', () => {
    expect(items('')).toEqual([]);
    expect(items('  \n \n')).toEqual([]);
  });
});

test.describe('outputs', () => {
  test('formats a plain list every way', () => {
    expect(convert('apple\nbanana\ncherry').outputs).toEqual({
      csv: 'apple, banana, cherry',
      singleQuoted: "'apple', 'banana', 'cherry'",
      doubleQuoted: '"apple", "banana", "cherry"',
      json: '[\n  "apple",\n  "banana",\n  "cherry"\n]',
      sql: "IN ('apple', 'banana', 'cherry')",
      custom: 'apple|banana|cherry',
    });
  });

  test('joins with the chosen output delimiter, including an empty one', () => {
    expect(convert('a\nb', { outputDelimiter: ' -> ' }).outputs.custom).toBe('a -> b');
    expect(convert('a\nb', { outputDelimiter: '' }).outputs.custom).toBe('ab');
  });

  test('gives empty outputs when there are no items', () => {
    expect(convert('  \n ').outputs).toEqual({
      csv: '',
      singleQuoted: '',
      doubleQuoted: '',
      json: '',
      sql: '',
      custom: '',
    });
  });

  test('escapes the quote character of each quoted style', () => {
    const { outputs } = convert('it\'s\nsay "hi"');

    expect(outputs.singleQuoted).toBe(`'it\\'s', 'say "hi"'`);
    expect(outputs.doubleQuoted).toBe(`"it's", "say \\"hi\\""`);
    expect(outputs.sql).toBe(`IN ('it''s', 'say "hi"')`);
    expect(JSON.parse(outputs.json)).toEqual(["it's", 'say "hi"']);
  });

  // Defect: backslashes were not escaped, so an item ending in "\" escaped
  // its own closing quote and "C:\new" turned into a line break when pasted.
  test('escapes backslashes in quoted items', () => {
    const { outputs } = convert('C:\\new\\\nend\\');

    expect(outputs.singleQuoted).toBe(`'C:\\\\new\\\\', 'end\\\\'`);
    expect(outputs.doubleQuoted).toBe(`"C:\\\\new\\\\", "end\\\\"`);
    // A JavaScript engine reads the literals back as the original items.
    expect(new Function(`return [${outputs.singleQuoted}]`)()).toEqual(['C:\\new\\', 'end\\']);
    expect(new Function(`return [${outputs.doubleQuoted}]`)()).toEqual(['C:\\new\\', 'end\\']);
  });

  // Defect: an item that spans lines put a raw line break inside the quotes.
  test('writes a line break inside a quoted item as \\n', () => {
    const { outputs } = convert('one\ntwo,three', { inputDelimiter: 'comma' });

    expect(outputs.singleQuoted).toBe(`'one\\ntwo', 'three'`);
    expect(outputs.doubleQuoted).toBe(`"one\\ntwo", "three"`);
    expect(new Function(`return [${outputs.singleQuoted}]`)()).toEqual(['one\ntwo', 'three']);
  });

  test('round-trips awkward items through the quoted outputs', () => {
    const awkward = ["it's \\'quoted\\'", 'tab\there', '"double" \\ \'single\'', 'ünïcödé 😀'];
    const { outputs } = convert(awkward.join('\n'));

    expect(new Function(`return [${outputs.singleQuoted}]`)()).toEqual(awkward);
    expect(new Function(`return [${outputs.doubleQuoted}]`)()).toEqual(awkward);
    expect(JSON.parse(outputs.json)).toEqual(awkward);
  });
});
