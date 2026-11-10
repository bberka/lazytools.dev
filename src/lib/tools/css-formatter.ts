/**
 * CSS minifier and beautifier written by hand, with no dependencies.
 *
 * Both start from the same two steps. The tokenizer turns the text into
 * comments, strings, unquoted `url(...)` values, words, numbers and single
 * punctuation marks; strings, URLs and comments are therefore never looked
 * into by any later step, so a `;`, `}` or `/*` inside a string cannot be
 * mistaken for CSS. The parser then groups the tokens into statements,
 * deciding what a statement is by how it ends: one that ends with `{` is a
 * rule or an at-rule with a block, one that ends with `;` or `}` is a
 * declaration (or an at-rule such as `@import`). That is what lets modern CSS
 * nesting, `@media` inside rules and `@keyframes` all come out right.
 *
 * Minifying removes comments, collapses whitespace only where CSS allows it,
 * drops the last `;` of a block and empty style rules, trims numbers (`0.50`
 * becomes `.5`) and shortens six-digit hex colours that have repeated digit
 * pairs (`#aabbcc` becomes `#abc`). It leaves alone anything whose meaning
 * depends on spacing: the spaces around `+` and `-` in `calc()`, spaces in
 * selectors that are descendant combinators, custom property values, `0px`
 * (which `calc(0px + 1em)` needs) and IE `progid:` filters. Nothing here
 * touches the DOM, so it runs in Node.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CssResult {
  output: string;
  /** Problems found in the input, such as an unclosed block. The output is still produced. */
  warnings: string[];
}

export interface MinifyOptions {
  /** Keep comments that start with `/*!`, the convention for licence notices. Default false. */
  keepImportantComments?: boolean;
}

export type IndentChoice = 2 | 4 | 'tab';

export interface BeautifyOptions {
  /** Spaces per level, or `'tab'`. Default 2. */
  indent?: IndentChoice;
}

type TokenType = 'comment' | 'string' | 'url' | 'word' | 'number' | 'punct';

interface Token {
  type: TokenType;
  text: string;
  /** Whitespace or a comment came right before this token. */
  sep: boolean;
  /** Offset in the input, for warnings. */
  start: number;
}

type Node =
  | { kind: 'comment'; text: string }
  | { kind: 'decl'; prop: Token[]; value: Token[] }
  | { kind: 'rule'; selector: Token[]; children: Node[] }
  | { kind: 'at'; head: Token[]; children: Node[] | null }
  | { kind: 'raw'; tokens: Token[] };

// ── Tokenizer ─────────────────────────────────────────────────────────────────

const NUMBER_AT = /[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/y;
const UNIT_AT = /%|[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿-]*/y;

function isIdentChar(char: string): boolean {
  return /[A-Za-z0-9_\u0080-￿-]/.test(char);
}

function isIdentStart(char: string): boolean {
  return /[A-Za-z_\u0080-￿\\-]/.test(char);
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function startsNumber(input: string, i: number): boolean {
  const char = input[i];
  if (isDigit(char)) return true;
  if (char === '.') return isDigit(input[i + 1]);
  if (char === '+' || char === '-') {
    return isDigit(input[i + 1]) || (input[i + 1] === '.' && isDigit(input[i + 2]));
  }
  return false;
}

function lineAt(input: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < input.length; i++) if (input[i] === '\n') line++;
  return line;
}

function tokenize(input: string, warnings: string[]): Token[] {
  const tokens: Token[] = [];
  const n = input.length;
  let i = 0;
  let sep = false;

  const push = (type: TokenType, text: string, start: number) => {
    tokens.push({ type, text, sep, start });
    sep = type === 'comment';
  };

  while (i < n) {
    const char = input[i];

    if (/\s/.test(char)) {
      sep = true;
      i++;
      continue;
    }

    if (char === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      if (end === -1) {
        warnings.push(`Unterminated comment starting on line ${lineAt(input, i)}`);
        push('comment', input.slice(i), i);
        i = n;
      } else {
        push('comment', input.slice(i, end + 2), i);
        i = end + 2;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const next = input[j];
        if (next === '\\') {
          j += 2;
          continue;
        }
        if (next === char) {
          j++;
          closed = true;
          break;
        }
        if (next === '\n') break; // an unescaped newline ends a bad string
        j++;
      }
      j = Math.min(j, n);
      if (!closed) warnings.push(`Unterminated string on line ${lineAt(input, i)}`);
      push('string', input.slice(i, j), i);
      i = j;
      continue;
    }

    if (
      (char === 'u' || char === 'U') &&
      /^url\(/i.test(input.slice(i, i + 4)) &&
      (i === 0 || !isIdentChar(input[i - 1]))
    ) {
      let k = i + 4;
      while (k < n && /\s/.test(input[k])) k++;
      if (k < n && input[k] !== '"' && input[k] !== "'") {
        let m = k;
        while (m < n && input[m] !== ')') m += input[m] === '\\' ? 2 : 1;
        if (m >= n) {
          warnings.push(`Unterminated url( on line ${lineAt(input, i)}`);
          push('url', `url(${input.slice(i + 4).trim()}`, i);
          i = n;
        } else {
          push('url', `url(${input.slice(i + 4, m).trim()})`, i);
          i = m + 1;
        }
        continue;
      }
    }

    if (char === '@' || char === '#') {
      let j = i + 1;
      while (j < n && (isIdentChar(input[j]) || input[j] === '\\')) j += input[j] === '\\' ? 2 : 1;
      if (j > i + 1) {
        push('word', input.slice(i, Math.min(j, n)), i);
        i = Math.min(j, n);
      } else {
        push('punct', char, i);
        i++;
      }
      continue;
    }

    if (startsNumber(input, i)) {
      NUMBER_AT.lastIndex = i;
      const number = NUMBER_AT.exec(input)!;
      let j = i + number[0].length;
      UNIT_AT.lastIndex = j;
      const unit = UNIT_AT.exec(input);
      if (unit) j += unit[0].length;
      push('number', input.slice(i, j), i);
      i = j;
      continue;
    }

    if (isIdentStart(char)) {
      let j = i;
      while (j < n && (isIdentChar(input[j]) || input[j] === '\\')) j += input[j] === '\\' ? 2 : 1;
      j = Math.min(j, n);
      push('word', input.slice(i, j), i);
      i = j;
      continue;
    }

    push('punct', char, i);
    i++;
  }

  return tokens;
}

// ── Parser ────────────────────────────────────────────────────────────────────

const isPunct = (token: Token | undefined, text: string): boolean =>
  token !== undefined && token.type === 'punct' && token.text === text;

/** True at `--name :`, where braces belong to the value. */
function startsCustomProperty(tokens: Token[], pos: number): boolean {
  const first = tokens[pos];
  if (first.type !== 'word' || !first.text.startsWith('--')) return false;
  let next = pos + 1;
  while (tokens[next]?.type === 'comment') next++;
  return isPunct(tokens[next], ':');
}

function findTopLevelColon(tokens: Token[]): number {
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'punct') continue;
    if (token.text === '(' || token.text === '[') depth++;
    else if (token.text === ')' || token.text === ']') depth = Math.max(0, depth - 1);
    else if (token.text === ':' && depth === 0) return i;
  }
  return -1;
}

interface ParseState {
  pos: number;
  input: string;
  warnings: string[];
}

function parseBlock(
  tokens: Token[],
  state: ParseState,
  topLevel: boolean
): { nodes: Node[]; closed: boolean } {
  const nodes: Node[] = [];

  while (state.pos < tokens.length) {
    const first = tokens[state.pos];

    if (isPunct(first, '}')) {
      state.pos++;
      if (topLevel) {
        state.warnings.push(`Unexpected "}" on line ${lineAt(state.input, first.start)}`);
        continue;
      }
      return { nodes, closed: true };
    }
    if (first.type === 'comment') {
      nodes.push({ kind: 'comment', text: first.text });
      state.pos++;
      continue;
    }
    if (isPunct(first, ';')) {
      state.pos++;
      continue;
    }

    const custom = startsCustomProperty(tokens, state.pos);
    const statement: Token[] = [];
    let terminator: ';' | '{' | '}' | null = null;
    let depth = 0;
    let braces = 0;

    while (state.pos < tokens.length) {
      const token = tokens[state.pos];
      if (token.type === 'punct') {
        const text = token.text;
        if (text === '(' || text === '[') depth++;
        else if (text === ')' || text === ']') depth = Math.max(0, depth - 1);
        else if (text === '{') {
          if (custom) {
            braces++;
          } else {
            terminator = '{';
            state.pos++;
            break;
          }
        } else if (text === '}') {
          if (custom && braces > 0) {
            braces--;
          } else {
            terminator = '}';
            break; // left for the enclosing block to consume
          }
        } else if (text === ';' && depth === 0 && braces === 0) {
          terminator = ';';
          state.pos++;
          break;
        }
      }
      statement.push(token);
      state.pos++;
    }

    if (terminator === '{') {
      const { nodes: children, closed } = parseBlock(tokens, state, false);
      if (!closed) {
        state.warnings.push(
          `Missing closing "}" for the block opened on line ${lineAt(state.input, statement[0]?.start ?? first.start)}`
        );
      }
      if (statement[0]?.type === 'word' && statement[0].text.startsWith('@')) {
        nodes.push({ kind: 'at', head: statement, children });
      } else {
        nodes.push({ kind: 'rule', selector: statement, children });
      }
      continue;
    }

    if (statement.length === 0) continue;

    if (statement[0].type === 'word' && statement[0].text.startsWith('@')) {
      nodes.push({ kind: 'at', head: statement, children: null });
      continue;
    }

    const colon = findTopLevelColon(statement);
    if (colon > 0) {
      nodes.push({
        kind: 'decl',
        prop: statement.slice(0, colon),
        value: statement.slice(colon + 1),
      });
    } else {
      nodes.push({ kind: 'raw', tokens: statement });
    }
  }

  return { nodes, closed: false };
}

function parse(input: string, warnings: string[]): Node[] {
  const tokens = tokenize(input, warnings);
  return parseBlock(tokens, { pos: 0, input, warnings }, true).nodes;
}

// ── Rendering tokens ──────────────────────────────────────────────────────────

type Context = 'selector' | 'prelude' | 'value' | 'prop' | 'custom';

interface RenderOptions {
  context: Context;
  pretty: boolean;
  /** Minify only: trim numbers and shorten hex colours. */
  shortenValues?: boolean;
}

const SHORT_HEX = /^#([0-9a-fA-F])\1([0-9a-fA-F])\2([0-9a-fA-F])\3(?:([0-9a-fA-F])\4)?$/;

/** `0.50` becomes `.5`, `1.0` becomes `1`, `007` becomes `7`. Numbers with an exponent are left alone. */
export function shortenNumber(text: string): string {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?([A-Za-z%_\u0080-￿][\s\S]*)?$/.exec(text);
  if (!match || /^[+-]?[\d.]+[eE][+-]?\d/.test(text)) return text;
  const [, sign, intPart, fraction = '', unit = ''] = match;
  const integer = intPart.replace(/^0+/, '');
  const decimals = fraction.replace(/0+$/, '');
  if (decimals === '') return `${sign}${integer === '' ? '0' : integer}${unit}`;
  return `${sign}${integer}.${decimals}${unit}`;
}

function shortenToken(token: Token, previous: Token | undefined, valueHasFilter: boolean): string {
  if (token.type === 'number') {
    const standsAlone =
      token.sep ||
      previous === undefined ||
      (previous.type === 'punct' && ['(', ',', '/'].includes(previous.text));
    return standsAlone ? shortenNumber(token.text) : token.text;
  }
  if (token.type === 'word' && !valueHasFilter) {
    const match = SHORT_HEX.exec(token.text);
    if (match) return `#${match[1]}${match[2]}${match[3]}${match[4] ?? ''}`;
  }
  return token.text;
}

function renderTokens(tokens: Token[], options: RenderOptions): string {
  const { context, pretty } = options;

  // Minifying drops comments but they still separate the tokens around them.
  const list: Token[] = [];
  let carry = false;
  for (const token of tokens) {
    if (!pretty && token.type === 'comment') {
      carry = true;
      continue;
    }
    list.push(carry ? { ...token, sep: true } : token);
    carry = false;
  }

  const valueHasFilter =
    options.shortenValues === true && list.some((token) => /progid|expression/i.test(token.text));

  // For each open "(": true when it groups a feature such as `(min-width: 1px)`
  // rather than calling a function such as `selector(a:hover)`.
  const groups: boolean[] = [];
  let brackets = 0;
  let out = '';

  for (let i = 0; i < list.length; i++) {
    const token = list[i];
    const previous = list[i - 1];
    const inFeatureGroup = context === 'prelude' && groups.length > 0 && groups[groups.length - 1];
    const atTopLevel = groups.length === 0 && brackets === 0;

    const is = (candidate: Token | undefined, text: string) => isPunct(candidate, text);
    const isCombinator = (candidate: Token | undefined) =>
      candidate !== undefined && candidate.type === 'punct' && '>+~'.includes(candidate.text);

    let space: boolean;
    if (!previous) {
      space = false;
    } else if (pretty) {
      if (is(token, ',')) space = false;
      else if (is(previous, ',')) space = !(is(token, ')') || is(token, ']'));
      else if (is(previous, '(') || is(previous, '[')) space = false;
      else if (is(token, ')') || is(token, ']')) space = false;
      else if (
        context === 'selector' &&
        atTopLevel &&
        (isCombinator(previous) || isCombinator(token))
      )
        space = true;
      else if (context === 'value' && is(token, '!')) space = true;
      else if (context === 'value' && is(previous, '!')) space = false;
      else if (context === 'prelude' && previous.text.startsWith('@') && is(token, '('))
        space = true;
      else if (inFeatureGroup && is(previous, ':')) space = true;
      else if (inFeatureGroup && is(token, ':')) space = false;
      else if (token.type === 'comment' || previous.type === 'comment') space = true;
      else space = token.sep;
    } else if (!token.sep) {
      space = false;
    } else if (context === 'custom') {
      space = true; // a custom property keeps its tokens as written, spaces collapsed
    } else {
      const tightAfter =
        is(previous, '(') ||
        is(previous, '[') ||
        is(previous, ',') ||
        (context === 'value' && is(previous, '!')) ||
        (context === 'selector' && (isCombinator(previous) || is(previous, '='))) ||
        (inFeatureGroup && is(previous, ':'));
      const tightBefore =
        is(token, ')') ||
        is(token, ']') ||
        is(token, ',') ||
        (context === 'value' && is(token, '!')) ||
        (context === 'selector' && (isCombinator(token) || is(token, '='))) ||
        (inFeatureGroup && is(token, ':'));
      space = !(tightAfter || tightBefore);
    }

    if (space) out += ' ';
    out += options.shortenValues ? shortenToken(token, previous, valueHasFilter) : token.text;

    if (token.type === 'punct') {
      if (token.text === '(') {
        const isFunction =
          previous !== undefined &&
          !token.sep &&
          previous.type === 'word' &&
          !previous.text.startsWith('@');
        groups.push(!isFunction);
      } else if (token.text === ')') groups.pop();
      else if (token.text === '[') brackets++;
      else if (token.text === ']') brackets = Math.max(0, brackets - 1);
    }
  }

  return out;
}

/** Splits a selector list at its top-level commas. */
function splitSelectors(tokens: Token[]): Token[][] {
  const parts: Token[][] = [[]];
  let depth = 0;
  for (const token of tokens) {
    if (token.type === 'punct') {
      if (token.text === '(' || token.text === '[') depth++;
      else if (token.text === ')' || token.text === ']') depth = Math.max(0, depth - 1);
      else if (token.text === ',' && depth === 0) {
        parts.push([]);
        continue;
      }
    }
    parts[parts.length - 1].push(token);
  }
  return parts.filter((part) => part.some((token) => token.type !== 'comment'));
}

function propertyName(prop: Token[]): string {
  return renderTokens(prop, { context: 'prop', pretty: false });
}

/** Blocks nested thousands deep overflow the recursion; the input comes back unchanged. */
function tooDeep(input: string, warnings: string[]): CssResult {
  return {
    output: input,
    warnings: [
      ...warnings,
      'Blocks are nested too deeply to process; the input is returned unchanged',
    ],
  };
}

// ── Minify ────────────────────────────────────────────────────────────────────

interface Piece {
  text: string;
  /** Needs a `;` after it when another piece follows. */
  statement: boolean;
}

function minifyNodes(nodes: Node[], options: MinifyOptions): string {
  const pieces: Piece[] = [];

  for (const node of nodes) {
    if (node.kind === 'comment') {
      if (options.keepImportantComments && node.text.startsWith('/*!')) {
        pieces.push({ text: node.text, statement: false });
      }
    } else if (node.kind === 'decl') {
      const name = propertyName(node.prop);
      const custom = name.startsWith('--');
      const value = renderTokens(node.value, {
        context: custom ? 'custom' : 'value',
        pretty: false,
        shortenValues: !custom && name.toLowerCase() !== 'unicode-range',
      });
      pieces.push({
        text: custom && value === '' ? `${name}: ` : `${name}:${value}`,
        statement: true,
      });
    } else if (node.kind === 'rule') {
      const body = minifyNodes(node.children, options);
      if (body === '') continue; // an empty style rule does nothing
      const selector = splitSelectors(node.selector)
        .map((part) => renderTokens(part, { context: 'selector', pretty: false }))
        .join(',');
      pieces.push({ text: `${selector}{${body}}`, statement: false });
    } else if (node.kind === 'at') {
      const head = renderTokens(node.head, { context: 'prelude', pretty: false });
      if (node.children === null) {
        pieces.push({ text: head, statement: true });
      } else {
        pieces.push({ text: `${head}{${minifyNodes(node.children, options)}}`, statement: false });
      }
    } else {
      pieces.push({
        text: renderTokens(node.tokens, { context: 'value', pretty: false }),
        statement: true,
      });
    }
  }

  return pieces
    .map((piece, index) =>
      piece.statement && index < pieces.length - 1 ? `${piece.text};` : piece.text
    )
    .join('');
}

/** Removes everything that does not change how the CSS is read. */
export function minifyCss(input: string, options: MinifyOptions = {}): CssResult {
  const warnings: string[] = [];
  try {
    const nodes = parse(input, warnings);
    return { output: minifyNodes(nodes, options), warnings };
  } catch (error) {
    if (error instanceof RangeError) return tooDeep(input, warnings);
    throw error;
  }
}

// ── Beautify ──────────────────────────────────────────────────────────────────

function indentUnit(indent: IndentChoice): string {
  return indent === 'tab' ? '\t' : ' '.repeat(indent);
}

function beautifyNodes(nodes: Node[], unit: string, level: number): string[] {
  const pad = unit.repeat(level);
  const lines: string[] = [];

  nodes.forEach((node, index) => {
    if (node.kind === 'comment') {
      lines.push(`${pad}${node.text}`);
    } else if (node.kind === 'decl') {
      const name = propertyName(node.prop);
      const value = renderTokens(node.value, { context: 'value', pretty: true });
      lines.push(value === '' ? `${pad}${name}:;` : `${pad}${name}: ${value};`);
    } else if (node.kind === 'raw') {
      lines.push(`${pad}${renderTokens(node.tokens, { context: 'value', pretty: true })};`);
    } else if (node.kind === 'rule') {
      const selectors = splitSelectors(node.selector).map((part) =>
        renderTokens(part, { context: 'selector', pretty: true })
      );
      selectors.forEach((selector, i) => {
        lines.push(`${pad}${selector}${i < selectors.length - 1 ? ',' : ' {'}`);
      });
      if (selectors.length === 0) lines.push(`${pad}{`);
      lines.push(...beautifyNodes(node.children, unit, level + 1), `${pad}}`);
    } else {
      const head = renderTokens(node.head, { context: 'prelude', pretty: true });
      if (node.children === null) {
        lines.push(`${pad}${head};`);
      } else {
        lines.push(`${pad}${head} {`, ...beautifyNodes(node.children, unit, level + 1), `${pad}}`);
      }
    }

    // A blank line after every block that has something following it.
    const hasBlock = node.kind === 'rule' || (node.kind === 'at' && node.children !== null);
    if (hasBlock && index < nodes.length - 1) lines.push('');
  });

  return lines;
}

/** Lays the CSS out with one declaration per line and nested blocks indented. */
export function beautifyCss(input: string, options: BeautifyOptions = {}): CssResult {
  const warnings: string[] = [];
  try {
    const nodes = parse(input, warnings);
    const lines = beautifyNodes(nodes, indentUnit(options.indent ?? 2), 0);
    return { output: lines.length ? `${lines.join('\n')}\n` : '', warnings };
  } catch (error) {
    if (error instanceof RangeError) return tooDeep(input, warnings);
    throw error;
  }
}

// ── Sizes ─────────────────────────────────────────────────────────────────────

/** Size in bytes when saved as UTF-8. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export interface SizeChange {
  before: number;
  after: number;
  /** Bytes saved; negative when the output is larger. */
  saved: number;
  /** Saved bytes as a percentage of `before`, to one decimal; 0 for empty input. */
  percent: number;
}

export function sizeChange(before: number, after: number): SizeChange {
  const saved = before - after;
  return {
    before,
    after,
    saved,
    percent: before === 0 ? 0 : Math.round((saved / before) * 1000) / 10,
  };
}
