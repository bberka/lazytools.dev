/**
 * YAML validator logic: parsing a stream of documents, summarising it and
 * writing it back as formatted YAML or one-line JSON.
 *
 * js-yaml is loaded on first use, which is why everything hangs off
 * `loadYamlTools()`. js-yaml reads every integer as a double; the schema
 * built here keeps integers that do not fit one as `bigint`, so a 64-bit id
 * survives formatting.
 */

import type * as JsYaml from 'js-yaml';
import { stringifyJson } from './json-formatter';

export interface YamlValidation {
  valid: boolean;
  /** Every document in the stream; empty when the text is not valid YAML. */
  documents: unknown[];
  /** "Top-level mapping with 2 keys", "3 documents". */
  summary: string;
  error: string;
}

export interface YamlRenderOptions {
  /** Spaces per indent level. YAML does not allow tabs for indentation. */
  indent?: number;
  /** Write each document as one line of JSON instead of YAML. */
  minify?: boolean;
}

export interface YamlRenderResult {
  text: string;
  error: string;
}

export interface YamlTools {
  /**
   * Parses a YAML stream into its documents. Text with no `---` separator is
   * one document. Throws on invalid YAML; see `describeError`.
   */
  parseDocuments(text: string): unknown[];
  /** Writes one value as block-style YAML without wrapping long lines. */
  dump(value: unknown, indent?: number): string;
  /** Validates YAML text. Blank text is neither valid nor invalid: null. */
  validate(text: string): YamlValidation | null;
  /**
   * Writes parsed documents back out. As YAML, documents are separated by
   * `---`; minified, each document is one line of JSON.
   */
  render(documents: unknown[], options?: YamlRenderOptions): YamlRenderResult;
  /** One line for a parse failure: the reason and where it is. */
  describeError(error: unknown): string;
}

function toBigInt(scalar: string): bigint | null {
  let digits = scalar.replace(/_/g, '');
  let negative = false;
  if (digits.startsWith('-') || digits.startsWith('+')) {
    negative = digits.startsWith('-');
    digits = digits.slice(1);
  }

  try {
    // Accepts the same 0b, 0o and 0x prefixes YAML does.
    const magnitude = BigInt(digits);
    return negative ? -magnitude : magnitude;
  } catch {
    return null;
  }
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}

function summarizeDocument(value: unknown): string {
  if (Array.isArray(value)) {
    return `Top-level sequence with ${plural(value.length, 'item')}`;
  }

  if (value instanceof Date) {
    return 'Top-level timestamp value';
  }

  if (value && typeof value === 'object') {
    return `Top-level mapping with ${plural(Object.keys(value).length, 'key')}`;
  }

  const type =
    value === null || value === undefined
      ? 'null'
      : typeof value === 'bigint'
        ? 'number'
        : typeof value;
  return `Top-level ${type} value`;
}

function createYamlTools(yaml: typeof JsYaml): YamlTools {
  // The built-in types are exported at runtime but missing from the typings.
  const builtInInteger = (yaml as unknown as { types: { int: JsYaml.Type } }).types.int;

  const losslessInteger = new yaml.Type('tag:yaml.org,2002:int', {
    kind: 'scalar',
    resolve: (data: unknown) => builtInInteger.resolve(data),
    construct: (data: string): number | bigint => {
      const value = builtInInteger.construct(data) as number;
      if (Number.isSafeInteger(value)) return value;
      return toBigInt(data) ?? value;
    },
    predicate: (data: unknown) =>
      typeof data === 'bigint' || Boolean(builtInInteger.predicate?.(data as object)),
    represent: (data: unknown) => (data as number | bigint).toString(10),
  });

  // A timestamp is written back the way it was typed. Left to js-yaml, the date
  // 2024-01-01 would come out as the date-time 2024-01-01T00:00:00.000Z.
  const builtInTimestamp = (yaml as unknown as { types: { timestamp: JsYaml.Type } }).types.timestamp;
  const writtenAs = new WeakMap<Date, string>();

  const sourceTimestamp = new yaml.Type('tag:yaml.org,2002:timestamp', {
    kind: 'scalar',
    resolve: (data: unknown) => builtInTimestamp.resolve(data),
    construct: (data: string): Date => {
      const date = builtInTimestamp.construct(data) as Date;
      writtenAs.set(date, data);
      return date;
    },
    instanceOf: Date,
    represent: (data: object) => writtenAs.get(data as Date) ?? (data as Date).toISOString(),
  });

  // The default schema with the integer and timestamp types swapped for ours.
  const schema = yaml.DEFAULT_SCHEMA.extend({ implicit: [losslessInteger, sourceTimestamp] });

  const parseDocuments = (text: string): unknown[] => {
    const documents = yaml.loadAll(text, null, { schema });
    return documents.length > 0 ? documents : [null];
  };

  const dump = (value: unknown, indent = 2): string =>
    yaml.dump(value, { schema, indent, lineWidth: -1 });

  const describeError = (error: unknown): string => {
    if (error instanceof yaml.YAMLException) {
      // The full message ends in a source snippet that only reads well in
      // monospace; the reason and the position say the same in one line.
      const mark = error.mark as JsYaml.Mark | undefined;
      const position = mark ? ` (line ${mark.line + 1}, column ${mark.column + 1})` : '';
      return `${error.reason || 'Invalid YAML syntax'}${position}`;
    }

    return error instanceof Error ? error.message : 'Invalid YAML syntax';
  };

  const validate = (text: string): YamlValidation | null => {
    if (!text.trim()) return null;

    try {
      const documents = parseDocuments(text);
      const summary =
        documents.length === 1
          ? summarizeDocument(documents[0])
          : plural(documents.length, 'document');
      return { valid: true, documents, summary, error: '' };
    } catch (error) {
      return { valid: false, documents: [], summary: '', error: describeError(error) };
    }
  };

  const render = (documents: unknown[], options: YamlRenderOptions = {}): YamlRenderResult => {
    try {
      if (options.minify) {
        return { text: documents.map((document) => stringifyJson(document)).join('\n'), error: '' };
      }

      const text = documents.map((document) => dump(document, options.indent)).join('---\n');
      return { text, error: '' };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return {
        text: '',
        error: /circular/i.test(message)
          ? 'This YAML refers to itself through an alias, so it cannot be written as JSON.'
          : message.split('\n')[0] || 'This YAML could not be written out.',
      };
    }
  };

  return { parseDocuments, dump, validate, render, describeError };
}

let toolsPromise: Promise<YamlTools> | null = null;

/**
 * Loads js-yaml once and returns the YAML functions built on it. A failed
 * download rejects and is not cached, so the next call tries again.
 */
export function loadYamlTools(): Promise<YamlTools> {
  toolsPromise ??= import('js-yaml').then(createYamlTools, (error: unknown) => {
    toolsPromise = null;
    throw error;
  });
  return toolsPromise;
}
