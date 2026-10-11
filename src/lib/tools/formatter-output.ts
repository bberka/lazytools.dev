/**
 * What the output panels of the JSON, YAML, XML and SQL formatters and the
 * format converter share: the line-count caption and the model behind the
 * collapsible tree view. Pure, so it runs in Node and in the browser.
 */

import { ExactNumber } from './json-formatter';

/**
 * "1 line", "12 lines". A final newline ends the last line rather than
 * starting an empty one, so YAML and TOML output is not counted one too high.
 */
export function describeLineCount(text: string): string {
  if (!text) {
    return '0 lines';
  }

  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  const lines = body.split('\n').length;
  return `${lines} line${lines === 1 ? '' : 's'}`;
}

/** The words a tree view uses for one format's containers and empty values. */
export interface TreeVocabulary {
  /** Name of an ordered container, as in "Array[3]". */
  list: string;
  /** Name of a keyed container, as in "Object {2 keys}". */
  map: string;
  /** What the members of a keyed container are called: "key", "node". */
  member: string;
  /** Text shown for null and missing values. */
  empty: string;
}

export type TreeLeafType = 'empty' | 'boolean' | 'number' | 'string';

export interface TreeLeaf {
  kind: 'leaf';
  type: TreeLeafType;
  text: string;
}

export interface TreeBranch {
  kind: 'branch';
  label: string;
  children: Array<{ name: string; value: unknown }>;
}

/**
 * Describes one value for the tree view: either a leaf with the text to show,
 * or a branch with its caption and its children in order. Children are listed
 * but not described, so a huge or self-referencing value costs nothing until
 * the reader expands it.
 */
export function describeTreeNode(value: unknown, vocabulary: TreeVocabulary): TreeLeaf | TreeBranch {
  if (value === null || value === undefined) {
    return { kind: 'leaf', type: 'empty', text: vocabulary.empty };
  }

  if (typeof value === 'boolean') {
    return { kind: 'leaf', type: 'boolean', text: value ? 'true' : 'false' };
  }

  if (typeof value === 'number' || typeof value === 'bigint' || value instanceof ExactNumber) {
    return { kind: 'leaf', type: 'number', text: String(value) };
  }

  if (typeof value === 'string') {
    return { kind: 'leaf', type: 'string', text: `"${value}"` };
  }

  // Timestamps print bare, the way YAML and TOML write them. Without this a
  // Date would show as a container with no members.
  if (value instanceof Date) {
    const text = Number.isNaN(value.getTime()) ? 'Invalid date' : value.toISOString();
    return { kind: 'leaf', type: 'string', text };
  }

  if (Array.isArray(value)) {
    return {
      kind: 'branch',
      label: `${vocabulary.list}[${value.length}]`,
      children: value.map((item, index) => ({ name: String(index), value: item })),
    };
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    return {
      kind: 'branch',
      label: `${vocabulary.map} {${keys.length} ${vocabulary.member}${keys.length === 1 ? '' : 's'}}`,
      children: keys.map((key) => ({ name: key, value: record[key] })),
    };
  }

  // Functions and symbols cannot come out of a parser; show them as text.
  return { kind: 'leaf', type: 'empty', text: String(value) };
}
