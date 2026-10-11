/**
 * SVG path data: reading it, checking it, shortening it without changing the
 * shape, and wrapping it in a standalone SVG file.
 *
 * Path data is read by the SVG 2 path grammar: a command letter followed by
 * groups of numbers, with elliptical arcs carrying two single-digit flags.
 * Numbers are kept as text from start to finish, so shortening a path never
 * rounds a coordinate.
 */

export interface PathSegment {
  /** The command letter as written, for example `M` or `l`. */
  command: string;
  /** Its numbers as written, flags included. */
  args: string[];
}

export interface PathParseResult {
  /** Every segment that could be read; all of them when `error` is empty. */
  segments: PathSegment[];
  /** Why reading stopped, or an empty string for valid path data. */
  error: string;
}

export interface PathAnalysis {
  commandCount: number;
  /** Characters in the path data as typed. */
  length: number;
  /** How often each command occurs, keyed by its upper-case letter. */
  commands: Record<string, number>;
}

export interface PathInspection {
  /** True when there is nothing but whitespace to look at. */
  empty: boolean;
  error: string;
  analysis: PathAnalysis | null;
  /** The shortened path, or an empty string when the path cannot be read. */
  optimized: string;
  /** How much shorter `optimized` is than the input, such as `12.5`. */
  savingsPercent: string;
}

export interface PathSvgOptions {
  pathData: string;
  viewBox: string;
  stroke: string;
  strokeWidth: string;
  fill: string;
}

/** Numbers each command takes at a time. */
const ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

const WHITESPACE = /[\t\n\f\r ]/;
const NUMBER = /[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/y;

/** Reads path data into segments, stopping at the first thing that is wrong. */
export function parsePath(pathData: string): PathParseResult {
  const segments: PathSegment[] = [];
  let index = 0;

  const skipWhitespace = () => {
    while (index < pathData.length && WHITESPACE.test(pathData[index])) index += 1;
  };
  const fail = (error: string): PathParseResult => ({ segments, error });
  // Named by code point, so an emoji is quoted whole rather than as half a pair.
  const found = () =>
    index < pathData.length
      ? `"${String.fromCodePoint(pathData.codePointAt(index) ?? 0)}" at character ${index + 1}`
      : 'the end of the path';

  skipWhitespace();

  while (index < pathData.length) {
    const command = pathData[index];
    const arity = ARITY[command.toUpperCase()];

    if (arity === undefined) {
      return fail(`Expected a command letter but found ${found()}.`);
    }
    if (segments.length === 0 && command.toUpperCase() !== 'M') {
      return fail('Path data must start with a move command (M or m).');
    }

    const commandAt = index + 1;
    index += 1;
    skipWhitespace();

    const args: string[] = [];
    while (arity > 0 && index < pathData.length && ARITY[pathData[index].toUpperCase()] === undefined) {
      const position = args.length % arity;
      const isFlag = arity === 7 && (position === 3 || position === 4);

      if (isFlag) {
        if (pathData[index] !== '0' && pathData[index] !== '1') {
          return fail(`Arc flags must be 0 or 1, but found ${found()}.`);
        }
        args.push(pathData[index]);
        index += 1;
      } else {
        NUMBER.lastIndex = index;
        const match = NUMBER.exec(pathData);
        if (!match) {
          return fail(`Expected a number but found ${found()}.`);
        }
        args.push(match[0]);
        index += match[0].length;
      }

      skipWhitespace();
      if (pathData[index] === ',') {
        index += 1;
        skipWhitespace();
        if (index >= pathData.length || ARITY[pathData[index].toUpperCase()] !== undefined) {
          return fail(`Expected a number after the comma but found ${found()}.`);
        }
      }
    }

    if (arity > 0 && (args.length === 0 || args.length % arity !== 0)) {
      const needs = `${arity} number${arity === 1 ? '' : 's'}`;
      return fail(
        args.length === 0
          ? `Command "${command}" at character ${commandAt} needs ${needs}.`
          : `Command "${command}" at character ${commandAt} takes ${needs} at a time, but has ${args.length}.`
      );
    }

    segments.push({ command, args });
  }

  return { segments, error: '' };
}

/** Counts the commands in already parsed path data. */
function analyze(pathData: string, segments: PathSegment[]): PathAnalysis {
  const commands: Record<string, number> = {};
  for (const { command } of segments) {
    const letter = command.toUpperCase();
    commands[letter] = (commands[letter] ?? 0) + 1;
  }
  return { commandCount: segments.length, length: pathData.length, commands };
}

/** The shortest spelling of one number: `0.50` is `.5`, `-0.0` is `0`, `1e+05` is `1e5`. */
function shortenNumber(token: string): string {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?)(\d+))?$/.exec(token);
  if (!match) return token;

  const whole = match[2].replace(/^0+/, '');
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  if (!whole && !fraction) return '0';

  const exponent = (match[5] ?? '').replace(/^0+/, '');
  return [
    match[1] === '-' ? '-' : '',
    fraction ? `${whole}.${fraction}` : whole,
    exponent ? `e${match[4] === '-' ? '-' : ''}${exponent}` : '',
  ].join('');
}

/**
 * Whether two neighbouring numbers need a space to stay two numbers. A minus
 * sign always starts a new number, and so does a decimal point once the
 * number before it has one of its own (`1.5.5` is 1.5 then .5).
 */
function needsSeparator(previous: string, next: string): boolean {
  if (next.startsWith('-')) return false;
  if (next.startsWith('.') && /[.e]/.test(previous)) return false;
  return true;
}

function serialize(segments: PathSegment[]): string {
  let output = '';
  for (const { command, args } of segments) {
    output += command;
    let previous: string | null = null;
    for (const arg of args) {
      const text = shortenNumber(arg);
      if (previous !== null && needsSeparator(previous, text)) output += ' ';
      output += text;
      previous = text;
    }
  }
  return output;
}

/**
 * Shortens path data without changing what it draws: drops optional
 * whitespace, commas, leading and trailing zeros and plus signs. Returns an
 * empty string for path data that cannot be read, and never returns anything
 * longer than the input.
 */
export function optimizePath(pathData: string): string {
  const { segments, error } = parsePath(pathData);
  if (error) return '';

  const trimmed = pathData.trim();
  const shortened = serialize(segments);
  return shortened.length < trimmed.length ? shortened : trimmed;
}

/** Everything the editor shows about a path, in one call. */
export function inspectPath(pathData: string): PathInspection {
  if (!pathData.trim()) {
    return { empty: true, error: '', analysis: null, optimized: '', savingsPercent: '0' };
  }

  const { segments, error } = parsePath(pathData);
  const optimized = error ? '' : optimizePath(pathData);
  const saved = optimized ? ((pathData.length - optimized.length) / pathData.length) * 100 : 0;

  return {
    empty: false,
    error,
    analysis: analyze(pathData, segments),
    optimized,
    savingsPercent: saved.toFixed(1),
  };
}

/** True for a usable viewBox: four numbers with a width and height that are not negative. */
export function isValidViewBox(viewBox: string): boolean {
  const parts = viewBox.trim().split(/[\s,]+/);
  if (parts.length !== 4) return false;

  const numbers = parts.map((part) =>
    /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(part) ? Number(part) : NaN
  );
  return numbers.every(Number.isFinite) && numbers[2] >= 0 && numbers[3] >= 0;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A standalone SVG file holding the path. Values are escaped, so a quote or
 * an ampersand in a field cannot break the markup, and a blank presentation
 * field or an unusable viewBox is left out rather than written empty.
 */
export function buildPathSvg({ pathData, viewBox, stroke, strokeWidth, fill }: PathSvgOptions): string {
  const attribute = (name: string, value: string) =>
    value.trim() ? ` ${name}="${escapeAttribute(value.trim())}"` : '';

  const viewBoxAttribute = isValidViewBox(viewBox) ? attribute('viewBox', viewBox) : '';
  const pathAttributes =
    attribute('d', pathData) +
    attribute('stroke', stroke) +
    attribute('stroke-width', strokeWidth) +
    attribute('fill', fill);

  return `<svg xmlns="http://www.w3.org/2000/svg"${viewBoxAttribute}>\n  <path${pathAttributes}/>\n</svg>`;
}
