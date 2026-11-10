/**
 * Markdown Table Generator logic.
 *
 * A table is a grid of cell text (the first row is the header) plus one
 * alignment per column. `markdownTable` writes it as a GitHub-flavoured
 * Markdown table, optionally padded so the raw text lines up. `parseDelimited`
 * reads pasted CSV or TSV. Pure functions, no DOM: they run in Node as well as
 * in the browser.
 */

export type Alignment = 'default' | 'left' | 'center' | 'right';

export interface TableData {
  /** Row 0 is the header. Every row has the same number of cells. */
  cells: string[][];
  /** One per column. */
  alignments: Alignment[];
}

export interface TableOptions {
  /** Pad cells with spaces so the columns line up in the raw text. */
  pad: boolean;
  /** Write `|` inside a cell as `\|`. Otherwise the cell text is used as typed. */
  escapePipes: boolean;
}

export const DEFAULT_TABLE_OPTIONS: TableOptions = { pad: true, escapePipes: true };

export const MAX_COLUMNS = 50;
export const MAX_ROWS = 1000;

export const ALIGNMENTS: ReadonlyArray<{ value: Alignment; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

// Editing the grid. Every function returns a new table.

export function createTable(rows: number, columns: number): TableData {
  return {
    cells: Array.from({ length: Math.max(1, rows) }, () => Array.from({ length: Math.max(1, columns) }, () => '')),
    alignments: Array.from({ length: Math.max(1, columns) }, () => 'default' as Alignment),
  };
}

export const SAMPLE_TABLE: TableData = {
  cells: [
    ['Name', 'Role', 'Score'],
    ['Ada', 'Engineer', '95'],
    ['Linus', 'Maintainer', '88'],
  ],
  alignments: ['left', 'default', 'right'],
};

/** Appends a row at the end, or inserts it so it becomes `index` (1 or more: the header stays first). */
export function addRow(table: TableData, index: number = table.cells.length): TableData {
  const at = Math.min(Math.max(1, index), table.cells.length);
  const row = table.alignments.map(() => '');
  return { ...table, cells: [...table.cells.slice(0, at), row, ...table.cells.slice(at)] };
}

/** Removes a body row. The header (row 0) cannot be removed. */
export function removeRow(table: TableData, index: number): TableData {
  if (index < 1 || index >= table.cells.length) return table;
  return { ...table, cells: table.cells.filter((_, i) => i !== index) };
}

/** Appends a column, or inserts it so it becomes `index`. */
export function addColumn(table: TableData, index: number = table.alignments.length): TableData {
  const at = Math.min(Math.max(0, index), table.alignments.length);
  const insert = <T>(list: readonly T[], value: T): T[] => [...list.slice(0, at), value, ...list.slice(at)];
  return {
    cells: table.cells.map((row) => insert(row, '')),
    alignments: insert<Alignment>(table.alignments, 'default'),
  };
}

/** Removes a column. The last column cannot be removed. */
export function removeColumn(table: TableData, index: number): TableData {
  if (table.alignments.length <= 1 || index < 0 || index >= table.alignments.length) return table;
  return {
    cells: table.cells.map((row) => row.filter((_, i) => i !== index)),
    alignments: table.alignments.filter((_, i) => i !== index),
  };
}

export function setCell(table: TableData, row: number, column: number, value: string): TableData {
  if (row < 0 || row >= table.cells.length || column < 0 || column >= table.alignments.length) return table;
  return {
    ...table,
    cells: table.cells.map((cells, r) => (r === row ? cells.map((cell, c) => (c === column ? value : cell)) : cells)),
  };
}

export function setAlignment(table: TableData, column: number, alignment: Alignment): TableData {
  if (column < 0 || column >= table.alignments.length) return table;
  return { ...table, alignments: table.alignments.map((current, i) => (i === column ? alignment : current)) };
}

/** Empties every cell and keeps the size and the alignments. */
export function clearCells(table: TableData): TableData {
  return { ...table, cells: table.cells.map((row) => row.map(() => '')) };
}

export function isBlank(table: TableData): boolean {
  return table.cells.every((row) => row.every((cell) => cell.trim() === ''));
}

// Writing Markdown

/** Escapes `|` that is not already escaped, and turns line breaks into `<br>`. */
export function escapeCell(value: string, escapePipes: boolean): string {
  const text = value.trim().replace(/\r\n|\r|\n/g, '<br>');
  if (!escapePipes) return text;
  // A pipe preceded by an odd number of backslashes is already escaped.
  return text.replace(/(\\*)\|/g, (match, backslashes: string) =>
    backslashes.length % 2 === 1 ? match : `${backslashes}\\|`
  );
}

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function isWide(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

/**
 * Columns a text takes in a monospaced font: 2 for East Asian wide characters
 * and emoji, 1 for other characters, 0 for combining marks. It decides how far
 * to pad cells; it does not change the Markdown.
 */
export function displayWidth(text: string): number {
  const parts = segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text);
  let width = 0;
  for (const part of parts) {
    const first = part.codePointAt(0) ?? 0;
    if (/\p{Extended_Pictographic}/u.test(part) || isWide(first)) width += 2;
    else if (/^[\p{M}\p{Cc}\p{Cf}]/u.test(part)) width += 0;
    else width += 1;
  }
  return width;
}

function padCell(text: string, width: number, alignment: Alignment): string {
  const extra = Math.max(0, width - displayWidth(text));
  if (alignment === 'right') return ' '.repeat(extra) + text;
  if (alignment === 'center') {
    const left = Math.floor(extra / 2);
    return ' '.repeat(left) + text + ' '.repeat(extra - left);
  }
  return text + ' '.repeat(extra);
}

function delimiterCell(width: number, alignment: Alignment): string {
  switch (alignment) {
    case 'left':
      return ':' + '-'.repeat(width - 1);
    case 'right':
      return '-'.repeat(width - 1) + ':';
    case 'center':
      return ':' + '-'.repeat(width - 2) + ':';
    default:
      return '-'.repeat(width);
  }
}

/** The Markdown table, or '' while every cell is empty. */
export function markdownTable(table: TableData, options: TableOptions): string {
  if (isBlank(table)) return '';
  const rows = table.cells.map((row) => row.map((cell) => escapeCell(cell, options.escapePipes)));
  const columnCount = table.alignments.length;

  // Narrowest a column can be: "---", or ":-:" when centred.
  const widths = Array.from({ length: columnCount }, (_, column) =>
    options.pad ? Math.max(3, ...rows.map((row) => displayWidth(row[column] ?? ''))) : 3
  );

  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  const body = (row: string[]) =>
    line(
      row.map((cell, column) =>
        options.pad ? padCell(cell, widths[column], table.alignments[column]) : cell
      )
    );
  const delimiter = line(
    table.alignments.map((alignment, column) => delimiterCell(widths[column], alignment))
  );

  return [body(rows[0]), delimiter, ...rows.slice(1).map(body)].join('\n');
}

// Reading CSV and TSV

export type Delimiter = 'auto' | 'comma' | 'tab' | 'semicolon';

const DELIMITER_CHARS: Record<Exclude<Delimiter, 'auto'>, string> = { comma: ',', tab: '\t', semicolon: ';' };

/** Picks the delimiter that occurs most in the first line, ignoring quoted text. Tab wins when present. */
export function detectDelimiter(text: string): Exclude<Delimiter, 'auto'> {
  const counts = { comma: 0, tab: 0, semicolon: 0 };
  let quoted = false;
  for (const char of text.replace(/^﻿/, '')) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && char === ',') counts.comma++;
    else if (!quoted && char === '\t') counts.tab++;
    else if (!quoted && char === ';') counts.semicolon++;
  }
  if (counts.tab > 0) return 'tab';
  return counts.semicolon > counts.comma ? 'semicolon' : 'comma';
}

/**
 * Parses CSV or TSV: quoted cells may hold the delimiter, line breaks and
 * doubled quotes. Blank lines are skipped and short rows are padded, so the
 * result is rectangular. Returns [] for empty input.
 */
export function parseDelimited(text: string, delimiter: Delimiter = 'auto'): string[][] {
  const source = text.replace(/^﻿/, '');
  if (source.trim() === '') return [];
  const separator = DELIMITER_CHARS[delimiter === 'auto' ? detectDelimiter(source) : delimiter];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === separator) {
      endCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      endRow();
    } else {
      cell += char;
    }
  }
  endRow();

  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array.from({ length: width - r.length }, () => '')]);
}

export interface ImportResult {
  table: TableData;
  /** True when rows or columns beyond the limits were left out. */
  truncated: boolean;
}

/** Builds a table from parsed rows. Without a header row, the columns are named "Column 1", "Column 2"... */
export function tableFromRows(rows: string[][], firstRowHeader: boolean): ImportResult | null {
  if (rows.length === 0 || rows[0].length === 0) return null;
  const columns = Math.min(rows[0].length, MAX_COLUMNS);
  const header = firstRowHeader ? [] : [Array.from({ length: columns }, (_, i) => `Column ${i + 1}`)];
  const all = [...header, ...rows];
  const limited = all.slice(0, MAX_ROWS).map((row) => row.slice(0, columns).map((cell) => cell.trim()));
  return {
    table: { cells: limited, alignments: Array.from({ length: columns }, () => 'default' as Alignment) },
    truncated: all.length > MAX_ROWS || rows[0].length > MAX_COLUMNS,
  };
}

export const EXAMPLE_CSV = ['Item,Quantity,Price', 'Apple,3,1.20', 'Fig | dried,12,0.45'].join('\n');
