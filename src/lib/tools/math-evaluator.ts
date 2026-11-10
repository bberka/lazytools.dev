/**
 * A calculator for typed math expressions, with a hand-written tokenizer and a
 * recursive-descent parser that evaluates as it parses. There is no `eval`
 * and no `Function` constructor: the only things an expression can do are the
 * operators, constants, functions and variables listed here.
 *
 * Grammar, loosest binding first:
 *
 *     statement  = NAME "=" sum | sum
 *     sum        = product { ("+" | "-") product }
 *     product    = unary { ("*" | "/" | "%") unary }
 *     unary      = ("-" | "+") unary | power
 *     power      = primary [ "^" exponent ]          (right-associative)
 *     exponent   = ("-" | "+") exponent | power
 *     primary    = NUMBER | NAME | NAME "(" [ sum { "," sum } ] ")" | "(" sum ")"
 *
 * So `-2^2` is -4 and `2^-1` is 0.5, as in written math. `%` is the
 * remainder (the result takes the sign of the left operand, like JavaScript).
 * Names are case-insensitive. Every failure is a `MathError` with the
 * position in the source, reported as a result and never thrown to callers.
 * Nothing here touches the DOM, so it runs in Node.
 */

// ── Public types ──────────────────────────────────────────────────────────────

export type AngleMode = 'deg' | 'rad';

export interface MathErrorInfo {
  /** Includes the 1-based position, for example "Unexpected ")" at position 5". */
  message: string;
  /** 0-based index into the source where the problem starts. */
  index: number;
  /** How many characters the problem covers (at least 1). */
  length: number;
}

export type Variables = Readonly<Record<string, number>>;

export type Evaluation =
  | { ok: true; value: number; assignment?: { name: string; value: number } }
  | { ok: false; error: MathErrorInfo };

export interface EvaluateOptions {
  angle?: AngleMode;
  variables?: Variables;
}

export const MAX_SOURCE_LENGTH = 1000;
const MAX_DEPTH = 100;
/** Significant digits shown in a result. */
const RESULT_PRECISION = 12;

// ── Errors ────────────────────────────────────────────────────────────────────

class MathError extends Error {
  constructor(
    message: string,
    readonly index: number,
    readonly length = 1
  ) {
    super(message);
  }
}

function has(table: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, key);
}

function fail(message: string, index: number, length = 1): never {
  throw new MathError(`${message} at position ${index + 1}`, index, Math.max(1, length));
}

// ── Constants and functions ───────────────────────────────────────────────────

const CONSTANTS: Readonly<Record<string, number>> = {
  pi: Math.PI,
  e: Math.E,
};

interface FunctionSpec {
  /** Minimum and maximum argument counts. */
  min: number;
  max: number;
  /** Receives the angle mode and the checked arguments. */
  run: (args: number[], context: { angle: AngleMode; at: number; length: number }) => number;
}

const DEG_TO_RAD = Math.PI / 180;

/** Tiny values that are really rounding noise (sin(pi) = 1.2e-16) become exactly 0. */
function snap(value: number): number {
  return Math.abs(value) < 1e-15 ? 0 : value;
}

function toRadians(x: number, angle: AngleMode): number {
  return angle === 'deg' ? x * DEG_TO_RAD : x;
}

function fromRadians(x: number, angle: AngleMode): number {
  return angle === 'deg' ? x / DEG_TO_RAD : x;
}

function sinOf(x: number, angle: AngleMode): number {
  if (angle === 'deg') {
    // Exact for the angles people type: 30 gives 0.5, 90 gives 1.
    const turn = ((x % 360) + 360) % 360;
    if (turn === 0 || turn === 180) return 0;
    if (turn === 90) return 1;
    if (turn === 270) return -1;
    if (turn === 30 || turn === 150) return 0.5;
    if (turn === 210 || turn === 330) return -0.5;
  }
  return snap(Math.sin(toRadians(x, angle)));
}

function cosOf(x: number, angle: AngleMode): number {
  if (angle === 'deg') {
    const turn = ((x % 360) + 360) % 360;
    if (turn === 90 || turn === 270) return 0;
    if (turn === 0) return 1;
    if (turn === 180) return -1;
    if (turn === 60 || turn === 300) return 0.5;
    if (turn === 120 || turn === 240) return -0.5;
  }
  return snap(Math.cos(toRadians(x, angle)));
}

/** Rounds halves away from zero, so round(-2.5) is -3 (Math.round gives -2). */
function roundHalfAway(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

const FUNCTIONS: Readonly<Record<string, FunctionSpec>> = {
  sqrt: {
    min: 1,
    max: 1,
    run: ([x], { at, length }) => {
      if (x < 0) fail('sqrt of a negative number', at, length);
      return Math.sqrt(x);
    },
  },
  cbrt: { min: 1, max: 1, run: ([x]) => Math.cbrt(x) },
  sin: { min: 1, max: 1, run: ([x], { angle }) => sinOf(x, angle) },
  cos: { min: 1, max: 1, run: ([x], { angle }) => cosOf(x, angle) },
  tan: {
    min: 1,
    max: 1,
    run: ([x], { angle, at, length }) => {
      const cos = cosOf(x, angle);
      if (cos === 0) fail('tan is undefined for this angle', at, length);
      return sinOf(x, angle) / cos;
    },
  },
  asin: {
    min: 1,
    max: 1,
    run: ([x], { angle, at, length }) => {
      if (x < -1 || x > 1) fail('asin needs a value between -1 and 1', at, length);
      return fromRadians(Math.asin(x), angle);
    },
  },
  acos: {
    min: 1,
    max: 1,
    run: ([x], { angle, at, length }) => {
      if (x < -1 || x > 1) fail('acos needs a value between -1 and 1', at, length);
      return fromRadians(Math.acos(x), angle);
    },
  },
  atan: { min: 1, max: 1, run: ([x], { angle }) => fromRadians(Math.atan(x), angle) },
  exp: { min: 1, max: 1, run: ([x]) => Math.exp(x) },
  ln: {
    min: 1,
    max: 1,
    run: ([x], { at, length }) => {
      if (x <= 0) fail('ln needs a positive number', at, length);
      return Math.log(x);
    },
  },
  log: {
    min: 1,
    max: 1,
    run: ([x], { at, length }) => {
      if (x <= 0) fail('log needs a positive number', at, length);
      return Math.log10(x);
    },
  },
  log2: {
    min: 1,
    max: 1,
    run: ([x], { at, length }) => {
      if (x <= 0) fail('log2 needs a positive number', at, length);
      return Math.log2(x);
    },
  },
  abs: { min: 1, max: 1, run: ([x]) => Math.abs(x) },
  floor: { min: 1, max: 1, run: ([x]) => Math.floor(x) },
  ceil: { min: 1, max: 1, run: ([x]) => Math.ceil(x) },
  round: { min: 1, max: 1, run: ([x]) => roundHalfAway(x) },
  min: { min: 1, max: Infinity, run: (args) => Math.min(...args) },
  max: { min: 1, max: Infinity, run: (args) => Math.max(...args) },
  pow: { min: 2, max: 2, run: ([x, y]) => Math.pow(x, y) },
};

export const FUNCTION_NAMES: readonly string[] = Object.keys(FUNCTIONS);

// ── Tokenizer ─────────────────────────────────────────────────────────────────

type Token =
  | { type: 'number'; value: number; index: number; end: number }
  | { type: 'name'; name: string; index: number; end: number }
  | { type: 'op'; op: string; index: number; end: number }
  | { type: 'end'; index: number; end: number };

const OPERATOR_ALIASES: Readonly<Record<string, string>> = {
  '×': '*',
  '·': '*',
  '÷': '/',
  '−': '-',
};

const NUMBER_AT = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const NAME_AT = /[A-Za-z_][A-Za-z0-9_]*/y;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      NUMBER_AT.lastIndex = i;
      const match = NUMBER_AT.exec(source);
      if (!match) fail(`Unexpected "${char}"`, i);
      const value = Number(match[0]);
      if (!Number.isFinite(value)) fail('Number is too large', i, match[0].length);
      tokens.push({ type: 'number', value, index: i, end: i + match[0].length });
      i += match[0].length;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      NAME_AT.lastIndex = i;
      const match = NAME_AT.exec(source)!;
      tokens.push({ type: 'name', name: match[0].toLowerCase(), index: i, end: i + match[0].length });
      i += match[0].length;
      continue;
    }

    if (char === '*' && source[i + 1] === '*') {
      tokens.push({ type: 'op', op: '^', index: i, end: i + 2 });
      i += 2;
      continue;
    }

    const op = OPERATOR_ALIASES[char] ?? char;
    if ('+-*/^%(),='.includes(op)) {
      tokens.push({ type: 'op', op, index: i, end: i + 1 });
      i++;
      continue;
    }

    fail(`Unexpected "${char}"`, i);
  }
  tokens.push({ type: 'end', index: source.length, end: source.length });
  return tokens;
}

// ── Parser and evaluator ──────────────────────────────────────────────────────

function describe(token: Token, source: string): string {
  if (token.type === 'end') return 'end of expression';
  return `"${source.slice(token.index, token.end)}"`;
}

class Parser {
  private position = 0;
  private depth = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
    private readonly angle: AngleMode,
    private readonly variables: Variables
  ) {}

  private peek(): Token {
    return this.tokens[this.position];
  }

  private next(): Token {
    return this.tokens[this.position++];
  }

  /** Consumes the operator token the caller just saw with `isOp`. */
  private nextOp(): { op: string; token: Token } {
    const token = this.next();
    return { op: token.type === 'op' ? token.op : '', token };
  }

  private isOp(...ops: string[]): boolean {
    const token = this.peek();
    return token.type === 'op' && ops.includes(token.op);
  }

  private enter(token: Token): void {
    if (++this.depth > MAX_DEPTH) fail('Expression is nested too deeply', token.index);
  }

  private leave(): void {
    this.depth--;
  }

  parseStatement(): { value: number; assignment?: { name: string; value: number } } {
    const first = this.tokens[0];
    const second = this.tokens[1];
    if (first.type === 'name' && second.type === 'op' && second.op === '=') {
      if (has(CONSTANTS, first.name) || has(FUNCTIONS, first.name) || first.name === 'ans') {
        const kind = has(FUNCTIONS, first.name) ? 'a function' : first.name === 'ans' ? 'set automatically' : 'a constant';
        fail(`"${first.name}" is ${kind} and cannot be assigned`, first.index, first.end - first.index);
      }
      this.position = 2;
      const value = this.finish(this.parseSum());
      return { value, assignment: { name: first.name, value } };
    }
    return { value: this.finish(this.parseSum()) };
  }

  /** Makes sure nothing is left over after a complete expression. */
  private finish(value: number): number {
    const token = this.peek();
    if (token.type === 'end') return value;
    if (token.type === 'op' && token.op === ')') fail('Unmatched ")"', token.index);
    if (token.type === 'op' && token.op === '=') fail('Unexpected "="; only "name = expression" can assign', token.index);
    if (token.type === 'number' || token.type === 'name' || (token.type === 'op' && token.op === '(')) {
      fail(`Unexpected ${describe(token, this.source)}; put an operator such as * before it`, token.index, token.end - token.index);
    }
    fail(`Unexpected ${describe(token, this.source)}`, token.index, token.end - token.index);
  }

  private check(value: number, token: Token): number {
    if (!Number.isFinite(value)) fail('The result is too large or undefined', token.index, token.end - token.index);
    return value;
  }

  private parseSum(): number {
    let left = this.parseProduct();
    while (this.isOp('+', '-')) {
      const { op, token } = this.nextOp();
      const right = this.parseProduct();
      left = this.check(op === '+' ? left + right : left - right, token);
    }
    return left;
  }

  private parseProduct(): number {
    let left = this.parseUnary();
    while (this.isOp('*', '/', '%')) {
      const { op, token } = this.nextOp();
      const right = this.parseUnary();
      if (op === '*') {
        left = this.check(left * right, token);
      } else if (right === 0) {
        fail(op === '/' ? 'Division by zero' : 'Remainder of division by zero', token.index);
      } else {
        left = this.check(op === '/' ? left / right : left % right, token);
      }
    }
    return left;
  }

  private parseUnary(): number {
    if (this.isOp('-', '+')) {
      const { op, token } = this.nextOp();
      this.enter(token);
      const value = this.parseUnary();
      this.leave();
      return op === '-' ? -value : value;
    }
    return this.parsePower();
  }

  private parsePower(): number {
    const base = this.parsePrimary();
    if (this.isOp('^')) {
      const token = this.next();
      this.enter(token);
      const exponent = this.parseExponent();
      this.leave();
      if (base === 0 && exponent < 0) fail('Zero cannot be raised to a negative power', token.index);
      const value = Math.pow(base, exponent);
      if (Number.isNaN(value)) fail('A negative number cannot be raised to a fractional power', token.index);
      return this.check(value, token);
    }
    return base;
  }

  private parseExponent(): number {
    if (this.isOp('-', '+')) {
      const { op, token } = this.nextOp();
      this.enter(token);
      const value = this.parseExponent();
      this.leave();
      return op === '-' ? -value : value;
    }
    return this.parsePower();
  }

  private parsePrimary(): number {
    const token = this.next();

    if (token.type === 'number') return token.value;

    if (token.type === 'name') {
      if (this.isOp('(')) return this.parseCall(token);
      if (has(CONSTANTS, token.name)) return CONSTANTS[token.name];
      if (has(this.variables, token.name)) return this.variables[token.name];
      if (has(FUNCTIONS, token.name)) fail(`"${token.name}" is a function; write ${token.name}(...)`, token.index, token.end - token.index);
      fail(`Unknown name "${this.source.slice(token.index, token.end)}"`, token.index, token.end - token.index);
    }

    if (token.type === 'op' && token.op === '(') {
      this.enter(token);
      if (this.isOp(')')) fail('Empty parentheses', token.index, 2);
      const value = this.parseSum();
      const close = this.next();
      if (close.type !== 'op' || close.op !== ')') {
        fail(close.type === 'end' ? 'Missing ")"' : `Expected ")" but found ${describe(close, this.source)}`, close.index);
      }
      this.leave();
      return value;
    }

    if (token.type === 'end') fail('The expression ends too early', token.index);
    fail(`Unexpected ${describe(token, this.source)}`, token.index, token.end - token.index);
  }

  private parseCall(nameToken: Token & { type: 'name' }): number {
    const spec = has(FUNCTIONS, nameToken.name) ? FUNCTIONS[nameToken.name] : undefined;
    const length = nameToken.end - nameToken.index;
    if (!spec) fail(`Unknown function "${this.source.slice(nameToken.index, nameToken.end)}"`, nameToken.index, length);

    const open = this.next();
    this.enter(open);
    const args: number[] = [];
    if (!this.isOp(')')) {
      args.push(this.parseSum());
      while (this.isOp(',')) {
        this.next();
        args.push(this.parseSum());
      }
    }
    const close = this.next();
    if (close.type !== 'op' || close.op !== ')') {
      fail(close.type === 'end' ? 'Missing ")"' : `Expected "," or ")" but found ${describe(close, this.source)}`, close.index);
    }
    this.leave();

    if (args.length < spec.min || args.length > spec.max) {
      const expected =
        spec.max === Infinity
          ? `at least ${spec.min}`
          : spec.min === spec.max
            ? String(spec.min)
            : `${spec.min} to ${spec.max}`;
      fail(
        `${nameToken.name} expects ${expected} argument${expected === '1' || expected === 'at least 1' ? '' : 's'}, got ${args.length}`,
        nameToken.index,
        close.end - nameToken.index
      );
    }

    const value = spec.run(args, { angle: this.angle, at: nameToken.index, length: close.end - nameToken.index });
    return this.check(value, nameToken);
  }
}

/**
 * Evaluates one line: an expression, or an assignment such as `x = 3 * 4`.
 * Names in `options.variables` must be lowercase. Failures come back as
 * `{ ok: false }` with the position; this function does not throw.
 */
export function evaluateExpression(source: string, options: EvaluateOptions = {}): Evaluation {
  try {
    if (source.length > MAX_SOURCE_LENGTH) {
      fail(`The expression is longer than ${MAX_SOURCE_LENGTH} characters`, MAX_SOURCE_LENGTH);
    }
    const tokens = tokenize(source);
    if (tokens.length === 1) throw new MathError('Enter an expression', 0);
    const parser = new Parser(tokens, source, options.angle ?? 'rad', options.variables ?? {});
    const { value, assignment } = parser.parseStatement();
    // A -0 result would print as "-0".
    const clean = value === 0 ? 0 : value;
    return assignment
      ? { ok: true, value: clean, assignment: { name: assignment.name, value: clean } }
      : { ok: true, value: clean };
  } catch (error) {
    if (error instanceof MathError) {
      return { ok: false, error: { message: error.message, index: error.index, length: error.length } };
    }
    throw error;
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Shows a result with 12 significant digits, so 0.1 + 0.2 reads 0.3 and 1 / 3
 * reads 0.333333333333. Whole numbers below 2^53 are shown exactly, and very
 * large or small values switch to exponent notation (1.15292150461e+18).
 */
export function formatResult(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  if (Number.isSafeInteger(value)) return String(value);

  const magnitude = Math.abs(value);
  if (magnitude >= 1e15 || magnitude < 1e-6) {
    const [mantissa, exponent] = value.toExponential(RESULT_PRECISION - 1).split('e');
    const trimmed = mantissa.includes('.') ? mantissa.replace(/\.?0+$/, '') : mantissa;
    return `${trimmed}e${exponent}`;
  }
  return String(Number(value.toPrecision(RESULT_PRECISION)));
}

// ── Help for the page ─────────────────────────────────────────────────────────

export const EXAMPLE_EXPRESSIONS: readonly string[] = [
  '2 + 3 * 4',
  '(1 + 2) ^ 3 / 9',
  'sqrt(144) + log2(8)',
  'sin(30) + cos(60)',
  'r = 5',
  'pi * r ^ 2',
  'max(3, 9, 4) % 4',
];
