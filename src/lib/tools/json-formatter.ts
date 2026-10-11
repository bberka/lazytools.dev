/**
 * JSON formatter logic: validation, lossless parsing, path queries and
 * serialising.
 *
 * `JSON.parse` turns every number into a double, so an integer above 2^53 - 1
 * (a 64-bit database id, a snowflake) silently changes value when it is
 * formatted. `parseJson` hands those integers back as `bigint` instead and
 * `stringifyJson` writes them out digit for digit. A formatter that must not
 * touch the document can ask for the same care for decimals and exponents a
 * double cannot hold (`1e400`, `0.1234567890123456789`), which come back as
 * `ExactNumber`. Everything here is pure, so it runs in Node and in the browser.
 */

/**
 * A number a double cannot hold, kept exactly as it was written. The text is
 * a private field so that it is not a key: the value looks like an empty
 * object to anything that walks properties.
 */
export class ExactNumber {
  readonly #literal: string;

  constructor(literal: string) {
    this.#literal = literal;
  }

  toString(): string {
    return this.#literal;
  }
}

export interface JsonParseOptions {
  /**
   * Keep a decimal or exponent that a double would round, overflow or flush to
   * zero as an `ExactNumber`. Default: false, they become plain numbers.
   */
  exactNumbers?: boolean;
}

export interface JsonValidation {
  valid: boolean;
  /** The parsed document; null when the text is not valid JSON. */
  value: unknown;
  /** "Array with 3 items", "Object with 2 keys", "Primitive (string)". */
  summary: string;
  error: string;
}

export interface JsonRenderOptions {
  /** Dot or bracket path to show instead of the whole document. */
  path?: string;
  /** Indent passed on to `JSON.stringify`: a number of spaces or a string. */
  indent?: number | string;
  /** Write everything on one line; `indent` is ignored. */
  minify?: boolean;
}

export interface JsonRenderResult {
  text: string;
  error: string;
  /** The value that was written, for the tree view; null when there is none. */
  value: unknown;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * An integer literal of 16 or more digits, the only kind that can lie past
 * 2^53 - 1. It may also match digits inside a string; that only costs a slower
 * read, never a wrong one.
 */
const LONG_INTEGER = /(?:^|[\[:,\s])(-?\d{16,})(?=[\],}\s]|$)/g;
const INTEGER_LITERAL = /^-?\d+$/;

/** True when the text holds an integer that `JSON.parse` would round. */
function holdsUnsafeInteger(text: string): boolean {
  for (const match of text.matchAll(LONG_INTEGER)) {
    if (!Number.isSafeInteger(Number(match[1]))) return true;
  }
  return false;
}

/**
 * A number literal that may not survive a double: sixteen or more characters
 * of digits, or any with an exponent. Anything shorter and plain keeps up to
 * fifteen significant digits. Like `LONG_INTEGER` it may match inside a string,
 * which only costs a slower read.
 */
const NUMBER_CANDIDATE = /-?\d[\d.]{15,}(?:[eE][+-]?\d+)?|-?\d[\d.]*[eE][+-]?\d+/g;
const DECIMAL_LITERAL = /^-?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/** A decimal as its significant digits and the power of ten they are scaled by. */
function decimalParts(literal: string): { digits: string; exponent: number } | null {
  const match = DECIMAL_LITERAL.exec(literal);
  if (!match) return null;

  const fraction = match[2] ?? '';
  const digits = `${match[1]}${fraction}`.replace(/^0+/, '');
  const significant = digits.replace(/0+$/, '');
  if (!significant) return { digits: '', exponent: 0 };

  return {
    digits: significant,
    exponent: Number(match[3] ?? 0) - fraction.length + (digits.length - significant.length),
  };
}

/** True when a double holds the literal's value: it prints back as the same decimal. */
function survivesDouble(literal: string): boolean {
  const value = Number(literal);
  if (!Number.isFinite(value)) return false;

  const written = decimalParts(literal);
  const read = decimalParts(String(value));
  return (
    written !== null &&
    read !== null &&
    written.digits === read.digits &&
    written.exponent === read.exponent
  );
}

/** True when the text holds a number that `JSON.parse` would round, overflow or flush to zero. */
function holdsInexactNumber(text: string): boolean {
  for (const match of text.matchAll(NUMBER_CANDIDATE)) {
    if (!survivesDouble(match[0])) return true;
  }
  return false;
}

function isNumberCharacter(code: number): boolean {
  // 0-9 + - . E e
  return (
    (code >= 0x30 && code <= 0x39) ||
    code === 0x2b ||
    code === 0x2d ||
    code === 0x2e ||
    code === 0x45 ||
    code === 0x65
  );
}

/**
 * Reads text that `JSON.parse` has already accepted, keeping integers that do
 * not fit a double as `bigint`. It reports nothing useful on bad input, which
 * is why the native parser always runs first.
 */
function readLossless(text: string, exactNumbers: boolean): unknown {
  let position = 0;

  const skipWhitespace = () => {
    while (position < text.length) {
      const code = text.charCodeAt(position);
      if (code !== 0x20 && code !== 0x0a && code !== 0x0d && code !== 0x09) break;
      position += 1;
    }
  };

  const readString = (): string => {
    const start = position;
    let hasEscape = false;
    position += 1;
    while (position < text.length && text[position] !== '"') {
      if (text[position] === '\\') {
        hasEscape = true;
        position += 1;
      }
      position += 1;
    }
    position += 1;
    return hasEscape
      ? (JSON.parse(text.slice(start, position)) as string)
      : text.slice(start + 1, position - 1);
  };

  const readNumber = (): number | bigint | ExactNumber => {
    const start = position;
    while (position < text.length && isNumberCharacter(text.charCodeAt(position))) {
      position += 1;
    }
    const literal = text.slice(start, position);
    const value = Number(literal);
    if (INTEGER_LITERAL.test(literal)) {
      return Number.isSafeInteger(value) ? value : BigInt(literal);
    }
    return exactNumbers && !survivesDouble(literal) ? new ExactNumber(literal) : value;
  };

  const readValue = (): unknown => {
    skipWhitespace();
    if (position >= text.length) {
      throw new SyntaxError('Unexpected end of JSON input');
    }

    const character = text[position];

    if (character === '{') {
      position += 1;
      const object: Record<string, unknown> = {};
      skipWhitespace();
      if (text[position] === '}') {
        position += 1;
        return object;
      }
      for (;;) {
        skipWhitespace();
        const key = readString();
        skipWhitespace();
        position += 1; // the colon
        const member = readValue();
        if (key === '__proto__') {
          // Plain assignment would set the prototype instead of adding a key.
          Object.defineProperty(object, key, {
            value: member,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        } else {
          object[key] = member;
        }
        skipWhitespace();
        const separator = text[position];
        position += 1;
        if (separator === '}') return object;
        if (separator !== ',') throw new SyntaxError('Unexpected token in JSON object');
      }
    }

    if (character === '[') {
      position += 1;
      const array: unknown[] = [];
      skipWhitespace();
      if (text[position] === ']') {
        position += 1;
        return array;
      }
      for (;;) {
        array.push(readValue());
        skipWhitespace();
        const separator = text[position];
        position += 1;
        if (separator === ']') return array;
        if (separator !== ',') throw new SyntaxError('Unexpected token in JSON array');
      }
    }

    if (character === '"') return readString();
    if (character === 't') {
      position += 4;
      return true;
    }
    if (character === 'f') {
      position += 5;
      return false;
    }
    if (character === 'n') {
      position += 4;
      return null;
    }
    return readNumber();
  };

  return readValue();
}

/**
 * `JSON.parse` that does not round large integers: one too big for a double
 * comes back as a `bigint`. With `exactNumbers`, a decimal or exponent a
 * double cannot hold comes back as an `ExactNumber`. Throws the native
 * `SyntaxError` on invalid text.
 */
export function parseJson(text: string, options: JsonParseOptions = {}): unknown {
  // A byte order mark survives a paste from some editors and is not JSON.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const value: unknown = JSON.parse(source);
  const exactNumbers = options.exactNumbers ?? false;

  // The native result is exact for almost every document; only re-read the
  // text when it would otherwise lose digits.
  if (!holdsUnsafeInteger(source) && !(exactNumbers && holdsInexactNumber(source))) {
    return value;
  }

  try {
    return readLossless(source, exactNumbers);
  } catch {
    // Nested deeper than the call stack allows: keep the native result.
    return value;
  }
}

// ---------------------------------------------------------------------------
// Serialising
// ---------------------------------------------------------------------------

/**
 * `JSON.stringify` that writes a `bigint` or an `ExactNumber` as a plain
 * number instead of throwing or rounding it. Everything else, including
 * `toJSON` and the indent argument, behaves as it does natively. A value with
 * no JSON form at all gives "null".
 */
export function stringifyJson(value: unknown, indent?: number | string): string {
  let hasExactNumber = false;
  const plain = JSON.stringify(
    value,
    (_key, member: unknown) => {
      if (typeof member === 'bigint' || member instanceof ExactNumber) {
        hasExactNumber = true;
        return member.toString();
      }
      return member;
    },
    indent
  ) as string | undefined;

  if (plain === undefined) return 'null';
  if (!hasExactNumber) return plain;

  // Wrap each such number in a marker that occurs nowhere else in the output,
  // then drop the quotes around it.
  let marker = '@bigint@';
  while (plain.includes(marker)) {
    marker += '@';
  }

  const marked = JSON.stringify(
    value,
    (_key, member: unknown) =>
      typeof member === 'bigint' || member instanceof ExactNumber
        ? `${marker}${member.toString()}${marker}`
        : member,
    indent
  );

  return marked.replace(new RegExp(`"${marker}(-?[\\d.eE+-]+)${marker}"`, 'g'), '$1');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}

function summarize(value: unknown): string {
  if (Array.isArray(value)) {
    return `Array with ${plural(value.length, 'item')}`;
  }

  if (value instanceof ExactNumber) {
    return 'Primitive (number)';
  }

  if (value && typeof value === 'object') {
    return `Object with ${plural(Object.keys(value).length, 'key')}`;
  }

  const type = value === null ? 'null' : typeof value === 'bigint' ? 'number' : typeof value;
  return `Primitive (${type})`;
}

/**
 * Validates JSON text. Blank text is neither valid nor invalid: null. Numbers
 * are kept exactly as written (see `parseJson`), since the value is shown back.
 */
export function validateJson(text: string): JsonValidation | null {
  if (!text.trim()) return null;

  try {
    const value = parseJson(text, { exactNumbers: true });
    return { valid: true, value, summary: summarize(value), error: '' };
  } catch (error) {
    return {
      valid: false,
      value: null,
      summary: '',
      error: error instanceof Error ? error.message : 'Invalid JSON format',
    };
  }
}

// ---------------------------------------------------------------------------
// Path queries
// ---------------------------------------------------------------------------

interface PathStep {
  key: string;
  /** Written as ["key"] or ['key']: always a key, never an array index. */
  quoted: boolean;
}

// ["key"], ['key'], [0] or [key], or else a bare name between dots.
const PATH_STEP =
  /\[\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\[\]"']*?))\s*\]|([^.\[\]]+)/g;
const ARRAY_INDEX = /^-?\d+$/;

const ROOT_MARKER = /^\$(?=[.\[]|$)/;

function parsePath(path: string): PathStep[] {
  // "$" is the root only when a step follows it; "$ref" and "$schema" are keys.
  const source = path.trim().replace(ROOT_MARKER, '');

  const steps: PathStep[] = [];
  for (const match of source.matchAll(PATH_STEP)) {
    const quotedKey = match[1] ?? match[2];
    if (quotedKey !== undefined) {
      steps.push({ key: quotedKey.replace(/\\(.)/g, '$1'), quoted: true });
      continue;
    }

    const bareKey = match[3] ?? match[4];
    if (bareKey) {
      steps.push({ key: bareKey, quoted: false });
    }
  }
  return steps;
}

function ownProperty(holder: unknown, key: string): unknown {
  if (holder === null || typeof holder !== 'object' || Array.isArray(holder)) {
    return undefined;
  }
  // Own keys only: "constructor" or "toString" must not reach the prototype.
  return Object.prototype.hasOwnProperty.call(holder, key)
    ? (holder as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Follows a dot or bracket path such as `$.users[0].roles[1]`, `users.name`
 * or `["odd key"]` into a parsed document. A key applied to an array reads
 * that key from every item. Returns undefined when nothing matches.
 */
export function queryJson(value: unknown, path: string): unknown {
  let current = value;

  for (const step of parsePath(path)) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      if (!step.quoted && ARRAY_INDEX.test(step.key)) {
        current = current[Number(step.key)];
        continue;
      }

      const picked = current.map((item) => ownProperty(item, step.key));
      current = picked.some((item) => item !== undefined) ? picked : undefined;
      continue;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    current = ownProperty(current, step.key);
  }

  return current;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * Writes a parsed document, or the part of it a path selects, as formatted or
 * minified JSON. A path that matches nothing is reported in `error`.
 */
export function renderJson(value: unknown, options: JsonRenderOptions = {}): JsonRenderResult {
  const path = options.path ?? '';
  let selected = value;

  if (path.trim()) {
    selected = queryJson(value, path);
    if (selected === undefined) {
      return {
        text: '',
        error: `No matching properties found for path: "${path}"`,
        value: null,
      };
    }
  }

  try {
    const text = stringifyJson(selected, options.minify ? undefined : options.indent);
    return { text, error: '', value: selected };
  } catch (error) {
    return {
      text: '',
      error: error instanceof Error ? error.message : 'Failed to process JSON output',
      value: null,
    };
  }
}
