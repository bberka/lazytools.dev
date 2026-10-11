/**
 * Structural JSON comparison.
 *
 * `parseJson` is a strict RFC 8259 parser. It exists because the error
 * messages of `JSON.parse` differ between engines and often carry no
 * position; this one always says which line and column it stopped at.
 *
 * `diffJson` compares two parsed documents by structure. Key order never
 * matters. Arrays are compared by index, or, with `ignoreArrayOrder`, as
 * multisets: equal elements are matched wherever they sit, and unmatched
 * records that share at least half their members are paired so that one
 * changed field is reported as one change. Every difference has a path (an
 * RFC 6901 JSON Pointer) and an operation in an RFC 6902 JSON Patch that
 * turns the left document into the right one.
 *
 * Everything here is a plain function: no React, no DOM. Functions that take
 * user text return a result object instead of throwing.
 */

export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = null | boolean | number | string | JsonArray | JsonObject;
export type JsonType = 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';

export function jsonTypeOf(value: JsonValue): JsonType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as 'boolean' | 'number' | 'string' | 'object';
}

const hasOwn = (target: object, key: string): boolean => Object.prototype.hasOwnProperty.call(target, key);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface ParseError {
  message: string;
  /** Zero-based index into the text. */
  position: number;
  /** One-based. */
  line: number;
  /** One-based. */
  column: number;
}

export type ParseResult =
  | {
      ok: true;
      value: JsonValue;
      /** Number literals with more digits than a 64-bit float keeps. */
      lossyNumbers: number;
    }
  | { ok: false; error: ParseError };

const MAX_DEPTH = 500;

class JsonSyntaxError extends Error {
  constructor(
    message: string,
    readonly position: number
  ) {
    super(message);
  }
}

/** More than 15 significant digits: two different literals may share one double. */
function hasExcessPrecision(literal: string): boolean {
  const mantissa = literal.split(/[eE]/, 1)[0];
  const digits = mantissa.replace(/[-.]/g, '').replace(/^0+/, '').replace(/0+$/, '');
  return digits.length > 15;
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

function isHexDigit(code: number): boolean {
  return isDigit(code) || (code >= 0x41 && code <= 0x46) || (code >= 0x61 && code <= 0x66);
}

const ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

const LITERALS: Array<[string, JsonValue]> = [
  ['true', true],
  ['false', false],
  ['null', null],
];

function parseText(text: string): { value: JsonValue; lossyNumbers: number } {
  const length = text.length;
  // A leading byte order mark is skipped; positions still count it.
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let lossyNumbers = 0;

  const fail = (message: string, at: number = pos): never => {
    throw new JsonSyntaxError(message, at);
  };

  /** Fail with `message`, or with the end-of-input message when nothing is left. */
  const unexpected = (message: string): never => {
    if (pos >= length) return fail('Unexpected end of JSON input', length);
    if (text[pos] === "'") return fail('Strings and property names must use double quotes');
    return fail(message);
  };

  const describeChar = (): string => `Unexpected character ${JSON.stringify(text[pos])}`;

  const skipWhitespace = (): void => {
    while (pos < length) {
      const code = text.charCodeAt(pos);
      if (code !== 0x20 && code !== 0x0a && code !== 0x0d && code !== 0x09) return;
      pos++;
    }
  };

  const parseString = (): string => {
    const start = pos;
    pos++; // opening quote
    let result = '';
    let chunk = pos;
    for (;;) {
      if (pos >= length) return fail('Unterminated string', start);
      const code = text.charCodeAt(pos);
      if (code === 0x22) {
        result += text.slice(chunk, pos);
        pos++;
        return result;
      }
      if (code < 0x20) return fail('Control character in string must be escaped (for example \\n)');
      if (code !== 0x5c) {
        pos++;
        continue;
      }
      result += text.slice(chunk, pos);
      const escapeStart = pos;
      pos++;
      if (pos >= length) return fail('Unterminated string', start);
      const escape = text[pos];
      if (escape === 'u') {
        let hex = '';
        for (let i = 1; i <= 4; i++) {
          if (pos + i >= length) return fail('Unterminated string', start);
          if (!isHexDigit(text.charCodeAt(pos + i))) {
            return fail('Invalid \\u escape: expected 4 hexadecimal digits', pos + i);
          }
          hex += text[pos + i];
        }
        result += String.fromCharCode(parseInt(hex, 16));
        pos += 5;
      } else if (hasOwn(ESCAPES, escape)) {
        result += ESCAPES[escape];
        pos++;
      } else {
        return fail(`Invalid escape sequence ${JSON.stringify(`\\${escape}`)}`, escapeStart);
      }
      chunk = pos;
    }
  };

  const skipDigits = (): number => {
    const start = pos;
    while (pos < length && isDigit(text.charCodeAt(pos))) pos++;
    return pos - start;
  };

  const parseNumber = (): number => {
    const start = pos;
    if (text[pos] === '-') pos++;
    if (pos >= length || !isDigit(text.charCodeAt(pos))) return fail('Expected a digit after "-"');
    if (text[pos] === '0') {
      pos++;
      if (pos < length && isDigit(text.charCodeAt(pos))) return fail('Numbers cannot have leading zeros');
    } else {
      skipDigits();
    }
    if (text[pos] === '.') {
      pos++;
      if (skipDigits() === 0) return fail('Expected a digit after the decimal point');
    }
    if (text[pos] === 'e' || text[pos] === 'E') {
      pos++;
      if (text[pos] === '+' || text[pos] === '-') pos++;
      if (skipDigits() === 0) return fail('Expected a digit in the exponent');
    }
    const literal = text.slice(start, pos);
    const value = Number(literal);
    if (!Number.isFinite(value)) return fail('Number is too large to represent', start);
    if (hasExcessPrecision(literal)) lossyNumbers++;
    return value;
  };

  const parseLiteral = (word: string, value: JsonValue): JsonValue => {
    for (let i = 0; i < word.length; i++) {
      if (text[pos + i] !== word[i]) {
        pos += i;
        return unexpected(describeChar());
      }
    }
    pos += word.length;
    return value;
  };

  const parseArray = (depth: number): JsonArray => {
    if (depth > MAX_DEPTH) return fail(`Nesting is too deep (more than ${MAX_DEPTH} levels)`);
    pos++; // [
    const items: JsonArray = [];
    skipWhitespace();
    if (text[pos] === ']') {
      pos++;
      return items;
    }
    for (;;) {
      items.push(parseValue(depth + 1));
      skipWhitespace();
      if (text[pos] === ',') {
        pos++;
        skipWhitespace();
        if (text[pos] === ']') return fail('Trailing comma is not allowed in JSON');
      } else if (text[pos] === ']') {
        pos++;
        return items;
      } else {
        return unexpected("Expected ',' or ']' after the array element");
      }
    }
  };

  const parseObject = (depth: number): JsonObject => {
    if (depth > MAX_DEPTH) return fail(`Nesting is too deep (more than ${MAX_DEPTH} levels)`);
    pos++; // {
    const members: JsonObject = {};
    skipWhitespace();
    if (text[pos] === '}') {
      pos++;
      return members;
    }
    for (;;) {
      skipWhitespace();
      if (text[pos] !== '"') return unexpected('Expected a property name in double quotes');
      const key = parseString();
      skipWhitespace();
      if (text[pos] !== ':') return unexpected("Expected ':' after the property name");
      pos++;
      const value = parseValue(depth + 1);
      // Assignment would turn a "__proto__" member into a prototype change.
      Object.defineProperty(members, key, { value, enumerable: true, writable: true, configurable: true });
      skipWhitespace();
      if (text[pos] === ',') {
        pos++;
        skipWhitespace();
        if (text[pos] === '}') return fail('Trailing comma is not allowed in JSON');
      } else if (text[pos] === '}') {
        pos++;
        return members;
      } else {
        return unexpected("Expected ',' or '}' after the property value");
      }
    }
  };

  function parseValue(depth: number): JsonValue {
    skipWhitespace();
    if (pos >= length) return fail('Unexpected end of JSON input', length);
    const char = text[pos];
    if (char === '{') return parseObject(depth);
    if (char === '[') return parseArray(depth);
    if (char === '"') return parseString();
    if (char === '-' || isDigit(text.charCodeAt(pos))) return parseNumber();
    for (const [word, value] of LITERALS) {
      if (char === word[0]) return parseLiteral(word, value);
    }
    return unexpected(describeChar());
  }

  const value = parseValue(0);
  skipWhitespace();
  if (pos < length) fail('Unexpected content after the JSON value');
  return { value, lossyNumbers };
}

function locate(text: string, position: number): { line: number; column: number } {
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < position && i < text.length; i++) {
    if (text.charCodeAt(i) === 0x0a) {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: position - lastBreak };
}

/** Parse JSON text. Never throws; a syntax error comes back with its position. */
export function parseJson(text: string): ParseResult {
  if (text.trim() === '') {
    return { ok: false, error: { message: 'Input is empty', position: 0, line: 1, column: 1 } };
  }
  try {
    const { value, lossyNumbers } = parseText(text);
    return { ok: true, value, lossyNumbers };
  } catch (error) {
    if (!(error instanceof JsonSyntaxError)) throw error;
    return {
      ok: false,
      error: { message: error.message, position: error.position, ...locate(text, error.position) },
    };
  }
}

/** "object with 3 keys", "array with 1 item", "string"... */
export function describeJson(value: JsonValue): string {
  if (Array.isArray(value)) return `array with ${value.length} item${value.length === 1 ? '' : 's'}`;
  if (value !== null && typeof value === 'object') {
    const count = Object.keys(value).length;
    return `object with ${count} key${count === 1 ? '' : 's'}`;
  }
  return jsonTypeOf(value);
}

// ---------------------------------------------------------------------------
// JSON Pointer (RFC 6901)
// ---------------------------------------------------------------------------

/** "~" becomes "~0" first, then "/" becomes "~1", so a literal "~1" survives. */
export function escapePointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** The root document has the empty pointer; show it as a word. */
export function displayPath(path: string): string {
  return path === '' ? '(root)' : path;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export type DiffKind = 'added' | 'removed' | 'changed' | 'type-changed' | 'unchanged';

/**
 * Paths of removed, changed and unchanged values point into the left
 * document, paths of added values into the right one. The two are the same
 * unless array order is ignored and an array element moved.
 */
export type DiffEntry =
  | { kind: 'added'; path: string; newValue: JsonValue }
  | { kind: 'removed'; path: string; oldValue: JsonValue }
  | { kind: 'changed' | 'type-changed'; path: string; oldValue: JsonValue; newValue: JsonValue }
  | { kind: 'unchanged'; path: string; value: JsonValue };

export type JsonPatchOperation =
  | { op: 'add'; path: string; value: JsonValue }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: JsonValue };

export interface DiffOptions {
  /** Treat arrays as multisets. Default: compare by index. */
  ignoreArrayOrder?: boolean;
  /** List unchanged values among the entries. They are counted either way. */
  showUnchanged?: boolean;
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  typeChanged: number;
  /** Unchanged leaf values: scalars and empty objects or arrays. */
  unchanged: number;
  /** added + removed + changed + typeChanged. */
  differences: number;
}

export interface DiffResult {
  entries: DiffEntry[];
  summary: DiffSummary;
  /**
   * Turns the left document into the right one: exactly, or, when array order
   * is ignored, up to the order of array elements.
   */
  patch: JsonPatchOperation[];
  ignoreArrayOrder: boolean;
}

interface Context {
  ignoreOrder: boolean;
  showUnchanged: boolean;
  entries: DiffEntry[];
  patch: JsonPatchOperation[];
  summary: DiffSummary;
}

function record(ctx: Context, entry: DiffEntry): void {
  switch (entry.kind) {
    case 'added':
      ctx.summary.added++;
      break;
    case 'removed':
      ctx.summary.removed++;
      break;
    case 'changed':
      ctx.summary.changed++;
      break;
    case 'type-changed':
      ctx.summary.typeChanged++;
      break;
    case 'unchanged':
      ctx.summary.unchanged++;
      if (!ctx.showUnchanged) return;
      break;
  }
  ctx.entries.push(entry);
}

/** Text that is equal for equal values whatever the key order or array order. */
function canonical(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  // String() prints -0 as "0" and gives every other double its own text.
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(',')}]`;
  const members = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`);
  return `{${members.join(',')}}`;
}

interface Match {
  /** [left index, right index] */
  pairs: Array<[number, number]>;
  freeLeft: number[];
  freeRight: number[];
}

function matchByIndex(left: JsonArray, right: JsonArray): Match {
  const common = Math.min(left.length, right.length);
  const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);
  return {
    pairs: range(0, common).map((i): [number, number] => [i, i]),
    freeLeft: range(common, left.length),
    freeRight: range(common, right.length),
  };
}

/** Largest number of unmatched left x right elements compared for similarity. */
const PAIRING_LIMIT = 250_000;

/** The members of an object or the elements of an array, as a multiset of texts. */
function membersOf(value: JsonValue): { type: 'object' | 'array'; counts: Map<string, number> } | null {
  let parts: string[];
  let type: 'object' | 'array';
  if (Array.isArray(value)) {
    type = 'array';
    parts = value.map(canonical);
  } else if (value !== null && typeof value === 'object') {
    type = 'object';
    parts = Object.keys(value).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`);
  } else {
    return null;
  }
  const counts = new Map<string, number>();
  for (const part of parts) counts.set(part, (counts.get(part) ?? 0) + 1);
  return { type, counts };
}

function overlap(a: Map<string, number>, b: Map<string, number>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const [part, count] of small) shared += Math.min(count, large.get(part) ?? 0);
  return shared;
}

/**
 * Match equal elements first, then pair leftover objects (or arrays) that
 * share at least half of their members, best first.
 */
function matchUnordered(left: JsonArray, right: JsonArray): Match {
  const rightByText = new Map<string, number[]>();
  right.forEach((item, index) => {
    const text = canonical(item);
    const indices = rightByText.get(text);
    if (indices) indices.push(index);
    else rightByText.set(text, [index]);
  });

  const pairs: Array<[number, number]> = [];
  let freeLeft: number[] = [];
  const taken = new Array<boolean>(right.length).fill(false);
  left.forEach((item, index) => {
    const partner = rightByText.get(canonical(item))?.shift();
    if (partner === undefined) {
      freeLeft.push(index);
    } else {
      pairs.push([index, partner]);
      taken[partner] = true;
    }
  });
  let freeRight = right.map((_, index) => index).filter((index) => !taken[index]);

  if (freeLeft.length > 0 && freeRight.length > 0 && freeLeft.length * freeRight.length <= PAIRING_LIMIT) {
    const leftMembers = freeLeft.map((index) => membersOf(left[index]));
    const rightMembers = freeRight.map((index) => membersOf(right[index]));
    const candidates: Array<{ score: number; a: number; b: number }> = [];
    leftMembers.forEach((a, ai) => {
      rightMembers.forEach((b, bi) => {
        if (!a || !b || a.type !== b.type) return;
        const score = overlap(a.counts, b.counts);
        const larger = Math.max(a.counts.size, b.counts.size);
        if (score > 0 && score * 2 >= larger) candidates.push({ score, a: ai, b: bi });
      });
    });
    candidates.sort((x, y) => y.score - x.score || x.a - y.a || x.b - y.b);
    const usedLeft = new Set<number>();
    const usedRight = new Set<number>();
    for (const { a, b } of candidates) {
      if (usedLeft.has(a) || usedRight.has(b)) continue;
      usedLeft.add(a);
      usedRight.add(b);
      pairs.push([freeLeft[a], freeRight[b]]);
    }
    freeLeft = freeLeft.filter((_, i) => !usedLeft.has(i));
    freeRight = freeRight.filter((_, i) => !usedRight.has(i));
  }

  pairs.sort((x, y) => x[0] - y[0]);
  return { pairs, freeLeft, freeRight };
}

function diffArrays(ctx: Context, left: JsonArray, right: JsonArray, leftPath: string, rightPath: string): void {
  if (left.length === 0 && right.length === 0) {
    record(ctx, { kind: 'unchanged', path: leftPath, value: left });
    return;
  }
  const { pairs, freeLeft, freeRight } = ctx.ignoreOrder ? matchUnordered(left, right) : matchByIndex(left, right);

  // Operations inside paired elements come first: nothing has moved yet, so
  // their left-hand indices are still right.
  for (const [i, j] of pairs) walk(ctx, left[i], right[j], `${leftPath}/${i}`, `${rightPath}/${j}`);

  for (const i of freeLeft) record(ctx, { kind: 'removed', path: `${leftPath}/${i}`, oldValue: left[i] });
  for (const j of freeRight) record(ctx, { kind: 'added', path: `${rightPath}/${j}`, newValue: right[j] });

  // Highest index first, so each removal leaves the lower indices alone.
  for (let k = freeLeft.length - 1; k >= 0; k--) {
    ctx.patch.push({ op: 'remove', path: `${leftPath}/${freeLeft[k]}` });
  }
  // Then append in order, after whatever is left.
  const base = left.length - freeLeft.length;
  freeRight.forEach((j, k) => {
    ctx.patch.push({ op: 'add', path: `${leftPath}/${base + k}`, value: right[j] });
  });
}

function diffObjects(ctx: Context, left: JsonObject, right: JsonObject, leftPath: string, rightPath: string): void {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length === 0 && rightKeys.length === 0) {
    record(ctx, { kind: 'unchanged', path: leftPath, value: left });
    return;
  }
  // Sorted, so the report reads the same whatever order the keys came in.
  for (const key of [...new Set([...leftKeys, ...rightKeys])].sort()) {
    const token = `/${escapePointerToken(key)}`;
    const inLeft = hasOwn(left, key);
    const inRight = hasOwn(right, key);
    if (inLeft && inRight) {
      walk(ctx, left[key], right[key], leftPath + token, rightPath + token);
    } else if (inLeft) {
      record(ctx, { kind: 'removed', path: leftPath + token, oldValue: left[key] });
      ctx.patch.push({ op: 'remove', path: leftPath + token });
    } else {
      record(ctx, { kind: 'added', path: rightPath + token, newValue: right[key] });
      ctx.patch.push({ op: 'add', path: leftPath + token, value: right[key] });
    }
  }
}

function walk(ctx: Context, left: JsonValue, right: JsonValue, leftPath: string, rightPath: string): void {
  const leftType = jsonTypeOf(left);
  if (leftType !== jsonTypeOf(right)) {
    record(ctx, { kind: 'type-changed', path: leftPath, oldValue: left, newValue: right });
    ctx.patch.push({ op: 'replace', path: leftPath, value: right });
  } else if (leftType === 'object') {
    diffObjects(ctx, left as JsonObject, right as JsonObject, leftPath, rightPath);
  } else if (leftType === 'array') {
    diffArrays(ctx, left as JsonArray, right as JsonArray, leftPath, rightPath);
  } else if (left === right) {
    record(ctx, { kind: 'unchanged', path: leftPath, value: left });
  } else {
    record(ctx, { kind: 'changed', path: leftPath, oldValue: left, newValue: right });
    ctx.patch.push({ op: 'replace', path: leftPath, value: right });
  }
}

/** Compare two parsed documents. */
export function diffJson(left: JsonValue, right: JsonValue, options: DiffOptions = {}): DiffResult {
  const ctx: Context = {
    ignoreOrder: options.ignoreArrayOrder === true,
    showUnchanged: options.showUnchanged === true,
    entries: [],
    patch: [],
    summary: { added: 0, removed: 0, changed: 0, typeChanged: 0, unchanged: 0, differences: 0 },
  };
  walk(ctx, left, right, '', '');
  const { summary } = ctx;
  summary.differences = summary.added + summary.removed + summary.changed + summary.typeChanged;
  return { entries: ctx.entries, summary, patch: ctx.patch, ignoreArrayOrder: ctx.ignoreOrder };
}

// ---------------------------------------------------------------------------
// From text
// ---------------------------------------------------------------------------

export type SideState =
  | { status: 'empty' }
  | { status: 'invalid'; error: ParseError }
  | { status: 'valid'; value: JsonValue; description: string; lossyNumbers: number };

export interface Comparison {
  left: SideState;
  right: SideState;
  /** Null until both sides are valid JSON. */
  result: DiffResult | null;
}

function readSide(text: string): SideState {
  if (text.trim() === '') return { status: 'empty' };
  const parsed = parseJson(text);
  if (!parsed.ok) return { status: 'invalid', error: parsed.error };
  return {
    status: 'valid',
    value: parsed.value,
    description: describeJson(parsed.value),
    lossyNumbers: parsed.lossyNumbers,
  };
}

/** Parse both texts and, when both are valid, compare them. */
export function compareJsonText(leftText: string, rightText: string, options: DiffOptions = {}): Comparison {
  const left = readSide(leftText);
  const right = readSide(rightText);
  const result = left.status === 'valid' && right.status === 'valid' ? diffJson(left.value, right.value, options) : null;
  return { left, right, result };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** One character per kind, so the report reads without colour. */
export const KIND_MARKERS: Record<DiffKind, string> = {
  added: '+',
  removed: '-',
  changed: '~',
  'type-changed': '!',
  unchanged: '=',
};

export const KIND_LABELS: Record<DiffKind, string> = {
  added: 'added',
  removed: 'removed',
  changed: 'changed',
  'type-changed': 'type changed',
  unchanged: 'unchanged',
};

/** Compact JSON, cut short with "..." past `maxLength` characters. */
export function formatValue(value: JsonValue, maxLength = Infinity): string {
  const text = JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}...` : text;
}

function typed(value: JsonValue): string {
  return `${formatValue(value)} (${jsonTypeOf(value)})`;
}

/** The detail after the path: `1 -> 2`, `"x"`, `true (boolean) -> "yes" (string)`. */
export function describeEntry(entry: DiffEntry): string {
  switch (entry.kind) {
    case 'added':
      return formatValue(entry.newValue);
    case 'removed':
      return formatValue(entry.oldValue);
    case 'changed':
      return `${formatValue(entry.oldValue)} -> ${formatValue(entry.newValue)}`;
    case 'type-changed':
      return `${typed(entry.oldValue)} -> ${typed(entry.newValue)}`;
    case 'unchanged':
      return formatValue(entry.value);
  }
}

/** The differences as plain text, one per line, each starting with a marker. */
export function formatReport(result: DiffResult): string {
  const { summary } = result;
  if (summary.differences === 0 && result.entries.length === 0) return 'No differences found.';

  const counts: string[] = [];
  if (summary.added) counts.push(`${summary.added} added`);
  if (summary.removed) counts.push(`${summary.removed} removed`);
  if (summary.changed) counts.push(`${summary.changed} changed`);
  if (summary.typeChanged) counts.push(`${summary.typeChanged} type changed`);
  const noun = summary.differences === 1 ? 'difference' : 'differences';
  const lines = [counts.length > 0 ? `${summary.differences} ${noun}: ${counts.join(', ')}` : 'No differences found.'];
  if (result.ignoreArrayOrder) lines.push('Array order ignored.');
  lines.push('');
  for (const entry of result.entries) {
    lines.push(`${KIND_MARKERS[entry.kind]} ${displayPath(entry.path)} (${KIND_LABELS[entry.kind]}): ${describeEntry(entry)}`);
  }
  return lines.join('\n');
}

/** The patch as pretty-printed JSON. */
export function formatPatch(patch: JsonPatchOperation[]): string {
  return JSON.stringify(patch, null, 2);
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

/** Shows every kind of difference; the other differences are only in how it is written. */
export const SAMPLE_LEFT = `{
  "id": 1042,
  "name": "Ada Lovelace",
  "active": true,
  "score": 7.50,
  "age": "36",
  "nickname": null,
  "roles": ["admin", "editor"],
  "address": { "city": "London", "zip": "N1 9GU" },
  "legacyId": "A-77"
}`;

export const SAMPLE_RIGHT = `{
  "address": { "zip": "N1 9GU", "city": "Cambridge", "country": "UK" },
  "age": 36,
  "active": true,
  "id": 1042,
  "name": "Ada Lovelace",
  "roles": ["editor", "admin", "reviewer"],
  "score": 7.5
}`;
