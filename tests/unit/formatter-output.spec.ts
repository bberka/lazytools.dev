import { test, expect } from '@playwright/test';
import {
  describeLineCount,
  describeTreeNode,
  type TreeVocabulary,
} from '@/lib/tools/formatter-output';

const JSON_WORDS: TreeVocabulary = { list: 'Array', map: 'Object', member: 'key', empty: 'null' };
const XML_WORDS: TreeVocabulary = { list: 'List', map: 'Element', member: 'node', empty: 'empty' };

test.describe('describeLineCount', () => {
  test('counts lines and uses the singular for one', () => {
    expect(describeLineCount('a\nb\nc')).toBe('3 lines');
    expect(describeLineCount('{"a":1}')).toBe('1 line');
  });

  test('does not count the empty line after a final newline', () => {
    expect(describeLineCount('a: 1\n')).toBe('1 line');
    expect(describeLineCount('a: 1\nb: 2\n')).toBe('2 lines');
  });

  test('counts blank lines inside the text', () => {
    expect(describeLineCount('a\n\nb')).toBe('3 lines');
    expect(describeLineCount('\n')).toBe('1 line');
  });

  test('reports nothing to count for empty text', () => {
    expect(describeLineCount('')).toBe('0 lines');
  });
});

test.describe('describeTreeNode leaves', () => {
  test('describes scalars', () => {
    expect(describeTreeNode(true, JSON_WORDS)).toEqual({ kind: 'leaf', type: 'boolean', text: 'true' });
    expect(describeTreeNode(false, JSON_WORDS)).toEqual({ kind: 'leaf', type: 'boolean', text: 'false' });
    expect(describeTreeNode(0, JSON_WORDS)).toEqual({ kind: 'leaf', type: 'number', text: '0' });
    expect(describeTreeNode(-1.5, JSON_WORDS)).toEqual({ kind: 'leaf', type: 'number', text: '-1.5' });
    expect(describeTreeNode('', JSON_WORDS)).toEqual({ kind: 'leaf', type: 'string', text: '""' });
    expect(describeTreeNode('héllo 😀', JSON_WORDS)).toEqual({
      kind: 'leaf',
      type: 'string',
      text: '"héllo 😀"',
    });
  });

  test('uses the vocabulary for null and missing values', () => {
    expect(describeTreeNode(null, JSON_WORDS)).toEqual({ kind: 'leaf', type: 'empty', text: 'null' });
    expect(describeTreeNode(undefined, XML_WORDS)).toEqual({ kind: 'leaf', type: 'empty', text: 'empty' });
  });

  test('prints a big integer in full', () => {
    expect(describeTreeNode(BigInt('9007199254740993'), JSON_WORDS)).toEqual({
      kind: 'leaf',
      type: 'number',
      text: '9007199254740993',
    });
  });

  test('shows a timestamp as its ISO text, not as an empty container', () => {
    expect(describeTreeNode(new Date('2024-01-01T00:00:00Z'), JSON_WORDS)).toEqual({
      kind: 'leaf',
      type: 'string',
      text: '2024-01-01T00:00:00.000Z',
    });
    expect(describeTreeNode(new Date(Number.NaN), JSON_WORDS)).toMatchObject({
      kind: 'leaf',
      text: 'Invalid date',
    });
  });
});

test.describe('describeTreeNode branches', () => {
  test('lists array items by index', () => {
    expect(describeTreeNode(['a', null], JSON_WORDS)).toEqual({
      kind: 'branch',
      label: 'Array[2]',
      children: [
        { name: '0', value: 'a' },
        { name: '1', value: null },
      ],
    });
    expect(describeTreeNode([], XML_WORDS)).toEqual({ kind: 'branch', label: 'List[0]', children: [] });
  });

  test('lists object members in order and pluralises the caption', () => {
    expect(describeTreeNode({ b: 1, a: [2] }, JSON_WORDS)).toEqual({
      kind: 'branch',
      label: 'Object {2 keys}',
      children: [
        { name: 'b', value: 1 },
        { name: 'a', value: [2] },
      ],
    });
    expect(describeTreeNode({ only: 1 }, JSON_WORDS)).toMatchObject({ label: 'Object {1 key}' });
    expect(describeTreeNode({}, XML_WORDS)).toMatchObject({ label: 'Element {0 nodes}', children: [] });
    expect(describeTreeNode({ item: 'x' }, XML_WORDS)).toMatchObject({ label: 'Element {1 node}' });
  });

  test('keeps a member whose key is the empty string', () => {
    const node = describeTreeNode({ '': 1 }, JSON_WORDS);

    expect(node).toMatchObject({ kind: 'branch', children: [{ name: '', value: 1 }] });
  });

  test('describes one level only, so a self-referencing value is safe', () => {
    const loop: unknown[] = [];
    loop.push(loop);

    expect(describeTreeNode(loop, JSON_WORDS)).toMatchObject({ kind: 'branch', label: 'Array[1]' });
  });
});
