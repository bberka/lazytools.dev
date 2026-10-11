/**
 * Format converter logic: reads JSON, YAML, XML, CSV or TOML into plain data
 * and writes that data back out in another of the five formats.
 *
 * The YAML, XML and TOML parsers are loaded on first use, so `convertData`
 * is async. The CSV reader and writer live here and are pure. Integers too
 * large for a double travel as `bigint` (TOML and the JSON and YAML readers
 * produce them) and every writer prints them digit for digit.
 */

import { parseJson, stringifyJson } from './json-formatter';
import { loadYamlTools } from './yaml-validator';

export type DataFormat = 'json' | 'yaml' | 'xml' | 'csv' | 'toml';
export type CsvDelimiter = ',' | ';' | '\t' | '|';

export interface ConvertOptions {
  /** Field separator for CSV input and output. Default: comma. */
  delimiter?: CsvDelimiter;
  /** CSV: first row holds the column names; objects are written with one. Default: true. */
  useHeaders?: boolean;
  /** Indent for JSON output, as `JSON.stringify` takes it. Default: 2. */
  jsonIndent?: number | string;
}

export interface ConvertError {
  /**
   * `parse`: the input is not valid in the source format. `write`: the data
   * has no form in the target format. `load`: a parser failed to download.
   */
  stage: 'parse' | 'write' | 'load';
  message: string;
}

export interface ConvertResult {
  output: string;
  error: ConvertError | null;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Splits CSV text into rows of cells. A quote opens a quoted field only at
 * the start of a field; anywhere else it is an ordinary character, so
 * `24" monitor` stays one cell. Blank lines are skipped. Throws when a
 * quoted field is never closed.
 */
export function parseCsv(input: string, delimiter: CsvDelimiter = ','): string[][] {
  // A byte order mark would otherwise become part of the first column name.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let insideQuotes = false;
  let fieldQuoted = false;
  let rowQuoted = false;

  const endField = () => {
    row.push(value);
    value = '';
    fieldQuoted = false;
  };

  const endRow = () => {
    endField();
    // A lone empty cell is a blank line, unless it was written as "".
    if (row.length > 1 || row[0] !== '' || rowQuoted) {
      rows.push(row);
    }
    row = [];
    rowQuoted = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (insideQuotes) {
      if (character !== '"') {
        value += character;
      } else if (text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        insideQuotes = false;
      }
      continue;
    }

    if (character === '"' && !fieldQuoted && value.trim() === '') {
      insideQuotes = true;
      fieldQuoted = true;
      rowQuoted = true;
      continue;
    }

    if (character === delimiter) {
      endField();
      continue;
    }

    if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      endRow();
      continue;
    }

    value += character;
  }

  if (insideQuotes) {
    throw new Error('CSV contains an unclosed quoted field.');
  }

  if (value.length > 0 || row.length > 0 || fieldQuoted) {
    endRow();
  }

  return rows;
}

/** Column names for `width` columns: trimmed, never empty, never repeated. */
function columnNames(headers: string[], width: number): string[] {
  const used = new Set<string>();
  const names: string[] = [];

  for (let index = 0; index < width; index += 1) {
    const base = (headers[index] ?? '').trim() || `column_${index + 1}`;
    let name = base;
    for (let copy = 2; used.has(name); copy += 1) {
      name = `${base}_${copy}`;
    }
    used.add(name);
    names.push(name);
  }

  return names;
}

function csvToData(text: string, delimiter: CsvDelimiter, useHeaders: boolean): unknown {
  const rows = parseCsv(text, delimiter);

  if (rows.length === 0 || !useHeaders) {
    return rows;
  }

  const [headers, ...dataRows] = rows;

  // A row may carry more cells than the header names. Keep them under
  // generated names instead of dropping them; trailing empty cells do not count.
  let width = headers.length;
  for (const dataRow of dataRows) {
    let filled = dataRow.length;
    while (filled > width && dataRow[filled - 1] === '') {
      filled -= 1;
    }
    width = Math.max(width, filled);
  }

  const names = columnNames(headers, width);
  return dataRows.map((dataRow) =>
    Object.fromEntries(names.map((name, index) => [name, dataRow[index] ?? '']))
  );
}

function dateText(value: Date): string {
  return Number.isNaN(value.getTime()) ? '' : value.toISOString();
}

function csvCell(value: unknown, delimiter: CsvDelimiter): string {
  let text: string;
  if (value === null || value === undefined) {
    text = '';
  } else if (value instanceof Date) {
    text = dateText(value);
  } else if (typeof value === 'object') {
    // A nested list or object has no CSV form; JSON keeps it readable.
    text = stringifyJson(value);
  } else {
    text = String(value);
  }

  const needsQuotes =
    text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(delimiter);
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

function dataToCsv(data: unknown, delimiter: CsvDelimiter, useHeaders: boolean): string {
  if (data === null || data === undefined) {
    return '';
  }

  let parsed: unknown = data;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      // Keep it as is
    }
  }

  if (!Array.isArray(parsed)) {
    if (parsed && typeof parsed === 'object') {
      parsed = [parsed];
    } else {
      throw new Error('Data must be an array of objects or arrays to convert to CSV.');
    }
  }

  const items = parsed as unknown[];
  if (items.length === 0) {
    return '';
  }

  if (items.every((item) => Array.isArray(item))) {
    return items
      .map((item) => (item as unknown[]).map((cell) => csvCell(cell, delimiter)).join(delimiter))
      .join('\n');
  }

  if (!items.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
    throw new Error('CSV conversion requires items to all be objects or all be arrays.');
  }

  const objects = items as Array<Record<string, unknown>>;
  const headers = Array.from(new Set(objects.flatMap((item) => Object.keys(item))));
  const lines: string[] = [];

  if (useHeaders) {
    lines.push(headers.map((header) => csvCell(header, delimiter)).join(delimiter));
  }

  objects.forEach((item) => {
    lines.push(headers.map((header) => csvCell(item[header], delimiter)).join(delimiter));
  });

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

/** Keys xml-js gives a meaning to in its compact form; they are not elements. */
const XML_PROLOG_KEYS = new Set(['_declaration', '_instruction', '_doctype', '_comment']);
const XML_SPECIAL_KEYS = new Set([...XML_PROLOG_KEYS, '_attributes', '_text', '_cdata']);

/** Makes a key usable as an element name: no spaces, no leading digit. */
function xmlName(key: string): string {
  const name = key.replace(/[^\p{L}\p{N}_.:-]/gu, '_');
  return /^[\p{L}_]/u.test(name) ? name : `_${name}`;
}

function toXmlNode(value: unknown): unknown {
  if (value === null || value === undefined) return {};
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return dateText(value);

  if (Array.isArray(value)) {
    // A list inside a list has no element name of its own; call it "item".
    return value.map((item) => (Array.isArray(item) ? { item: toXmlNode(item) } : toXmlNode(item)));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, member]) =>
        XML_SPECIAL_KEYS.has(key) ? [key, member] : [xmlName(key), toXmlNode(member)]
      )
    );
  }

  return value;
}

/**
 * Shapes data for xml-js so the result is one well-formed document. XML
 * needs exactly one root element, so a list, a bare value or an object with
 * several keys is wrapped in `<root>`, and list entries become `<item>`.
 */
function toXmlDocument(data: unknown): Record<string, unknown> {
  const node = toXmlNode(data);

  if (Array.isArray(node)) {
    return { root: { item: node } };
  }

  if (node === null || typeof node !== 'object') {
    return { root: node };
  }

  const entries = Object.entries(node);
  const prolog = entries.filter(([key]) => XML_PROLOG_KEYS.has(key));
  const body = entries.filter(([key]) => !XML_PROLOG_KEYS.has(key));

  const hasOneRoot =
    body.length === 1 && !XML_SPECIAL_KEYS.has(body[0][0]) && !Array.isArray(body[0][1]);
  if (hasOneRoot) {
    return node as Record<string, unknown>;
  }

  return Object.fromEntries([...prolog, ['root', Object.fromEntries(body)]]);
}

// ---------------------------------------------------------------------------
// Readers and writers
// ---------------------------------------------------------------------------

class LoadError extends Error {}

/** Loads a parser chunk; a failed download is told apart from bad input. */
async function load<T>(importer: () => Promise<T>): Promise<T> {
  try {
    return await importer();
  } catch {
    throw new LoadError('A converter could not be loaded. Check your connection and try again.');
  }
}

const loadYaml = () => load(loadYamlTools);
const loadXml = () => load(() => import('xml-js'));
const loadToml = () => load(() => import('@iarna/toml'));

function firstLine(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : '';
  return message.split('\n')[0].replace(/:$/, '') || fallback;
}

/** xml-js reports "reason\nLine: 0\nColumn: 9\nChar: >" with lines from 0. */
function describeXmlError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const match = /^([\s\S]*?)\nLine: (\d+)\nColumn: (\d+)\nChar: /.exec(message);
  return match
    ? `${match[1].trim()} (line ${Number(match[2]) + 1}, column ${match[3]})`
    : firstLine(error, 'Invalid XML');
}

async function readData(text: string, format: DataFormat, options: Required<ConvertOptions>): Promise<unknown> {
  switch (format) {
    case 'json':
      return parseJson(text);
    case 'yaml': {
      const yaml = await loadYaml();
      try {
        const documents = yaml.parseDocuments(text);
        // Several documents in one stream become a list of them.
        return documents.length === 1 ? documents[0] : documents;
      } catch (error) {
        throw new Error(yaml.describeError(error));
      }
    }
    case 'xml': {
      const xml = await loadXml();
      try {
        return JSON.parse(xml.xml2json(text, { compact: true, spaces: 2 }));
      } catch (error) {
        throw new Error(describeXmlError(error));
      }
    }
    case 'csv':
      return csvToData(text, options.delimiter, options.useHeaders);
    case 'toml': {
      const toml = await loadToml();
      try {
        return toml.parse(text);
      } catch (error) {
        throw new Error(firstLine(error, 'Invalid TOML'));
      }
    }
  }
}

async function writeData(data: unknown, format: DataFormat, options: Required<ConvertOptions>): Promise<string> {
  // An empty YAML document parses to nothing at all; every format has null.
  const value = data === undefined ? null : data;

  switch (format) {
    case 'json':
      return stringifyJson(value, options.jsonIndent);
    case 'yaml':
      return (await loadYaml()).dump(value);
    case 'xml':
      return (await loadXml()).js2xml(toXmlDocument(value), { compact: true, spaces: 2 });
    case 'csv':
      return dataToCsv(value, options.delimiter, options.useHeaders);
    case 'toml': {
      const toml = await loadToml();
      // TOML is always a table at the top: name a list "items", a bare value "value".
      let table: unknown = value;
      if (Array.isArray(table)) {
        table = { items: table };
      } else if (typeof table !== 'object' || table === null || table instanceof Date) {
        table = { value: table };
      }
      // The typings know nothing of bigint or null, both of which it handles.
      return toml.stringify(table as Parameters<typeof toml.stringify>[0]);
    }
  }
}

function failure(error: unknown, stage: 'parse' | 'write', fallback: string): ConvertResult {
  if (error instanceof LoadError) {
    return { output: '', error: { stage: 'load', message: error.message } };
  }
  return { output: '', error: { stage, message: firstLine(error, fallback) } };
}

/**
 * Converts text from one format to another. Never rejects: bad input, data
 * the target format cannot hold and a parser that failed to load all come
 * back in `error`. Blank text converts to empty output.
 */
export async function convertData(
  text: string,
  from: DataFormat,
  to: DataFormat,
  options: ConvertOptions = {}
): Promise<ConvertResult> {
  if (!text.trim()) {
    return { output: '', error: null };
  }

  // Same format in and out: pass the text through untouched. JSON is the
  // exception, because it has an indentation setting to apply.
  if (from === to && from !== 'json') {
    return { output: text, error: null };
  }

  const settings: Required<ConvertOptions> = {
    delimiter: options.delimiter ?? ',',
    useHeaders: options.useHeaders ?? true,
    jsonIndent: options.jsonIndent ?? 2,
  };

  let data: unknown;
  try {
    data = await readData(text, from, settings);
  } catch (error) {
    return failure(error, 'parse', `Invalid ${from.toUpperCase()}`);
  }

  try {
    return { output: await writeData(data, to, settings), error: null };
  } catch (error) {
    return failure(error, 'write', `This data cannot be written as ${to.toUpperCase()}`);
  }
}
