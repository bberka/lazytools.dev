/**
 * List converter logic: splits a pasted list into items, cleans them up and
 * writes them out in the formats the tool offers. Pure, so it runs in Node and
 * in the browser.
 */

export type ListDelimiter = 'newline' | 'comma' | 'semicolon' | 'tab' | 'custom';
export type ListSortOrder = 'none' | 'asc' | 'desc';
export type ListCaseConversion = 'none' | 'upper' | 'lower';

export interface ListOptions {
  inputDelimiter: ListDelimiter;
  /** The separator to split on when `inputDelimiter` is 'custom'. */
  customInputDelimiter: string;
  /** The separator of the custom output. */
  outputDelimiter: string;
  trimItems: boolean;
  removeEmpty: boolean;
  deduplicate: boolean;
  sortOrder: ListSortOrder;
  caseConversion: ListCaseConversion;
}

export interface ListOutputs {
  csv: string;
  singleQuoted: string;
  doubleQuoted: string;
  json: string;
  sql: string;
  custom: string;
}

export interface ListConversion {
  /** The items after clean-up, case conversion and sorting. */
  items: string[];
  /** Every output is '' when there are no items. */
  outputs: ListOutputs;
}

const EMPTY_OUTPUTS: ListOutputs = {
  csv: '',
  singleQuoted: '',
  doubleQuoted: '',
  json: '',
  sql: '',
  custom: '',
};

function splitItems(input: string, options: ListOptions): string[] {
  switch (options.inputDelimiter) {
    case 'comma':
      return input.split(',');
    case 'semicolon':
      return input.split(';');
    case 'tab':
      return input.split('\t');
    case 'custom':
      // Nothing to split on yet: the whole input is one item.
      return options.customInputDelimiter ? input.split(options.customInputDelimiter) : [input];
    default:
      return input.split(/\r?\n/);
  }
}

function parseItems(input: string, options: ListOptions): string[] {
  if (!input) {
    return [];
  }

  let items = splitItems(input, options);

  if (options.trimItems) {
    items = items.map((item) => item.trim());
  }

  if (options.removeEmpty) {
    items = items.filter((item) => item !== '');
  }

  if (options.caseConversion === 'upper') {
    items = items.map((item) => item.toUpperCase());
  } else if (options.caseConversion === 'lower') {
    items = items.map((item) => item.toLowerCase());
  }

  // After the case conversion, so "Apple" and "apple" count as one item once
  // both have become "apple".
  if (options.deduplicate) {
    items = Array.from(new Set(items));
  }

  if (options.sortOrder === 'asc') {
    items.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  } else if (options.sortOrder === 'desc') {
    items.sort((a, b) => b.localeCompare(a, undefined, { sensitivity: 'base' }));
  }

  return items;
}

/**
 * A string literal as most languages read it. The backslash is escaped first,
 * otherwise an item ending in "\" would escape its own closing quote.
 */
function quote(item: string, quoteCharacter: "'" | '"'): string {
  const escaped = item
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .split(quoteCharacter)
    .join(`\\${quoteCharacter}`);

  return `${quoteCharacter}${escaped}${quoteCharacter}`;
}

function sqlLiteral(item: string): string {
  return `'${item.replace(/'/g, "''")}'`;
}

export function convertList(input: string, options: ListOptions): ListConversion {
  const items = parseItems(input, options);
  if (items.length === 0) {
    return { items, outputs: EMPTY_OUTPUTS };
  }

  return {
    items,
    outputs: {
      csv: items.join(', '),
      singleQuoted: items.map((item) => quote(item, "'")).join(', '),
      doubleQuoted: items.map((item) => quote(item, '"')).join(', '),
      json: JSON.stringify(items, null, 2),
      sql: `IN (${items.map(sqlLiteral).join(', ')})`,
      custom: items.join(options.outputDelimiter),
    },
  };
}
