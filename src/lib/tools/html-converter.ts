/**
 * HTML Converter logic: turns a parsed HTML tree into Markdown or plain text.
 *
 * The converters walk nodes; they do not parse markup. Parsing is left to the
 * browser, which copes with any HTML a user can paste. They read only the few
 * node properties in `MarkupNode`, so they run without a DOM: a test hands
 * them a plain object tree, the tool hands them `document.body`.
 */

/** The part of a DOM node the converters read. Every browser `Node` fits. */
export interface MarkupNode {
  /** 1 for an element, 3 for text. Every other kind of node is ignored. */
  readonly nodeType: number;
  /** Tag name of an element, in either case. */
  readonly nodeName: string;
  /** The characters of a text node. */
  readonly nodeValue: string | null;
  readonly childNodes: ArrayLike<MarkupNode>;
  getAttribute?(name: string): string | null;
}

const ELEMENT = 1;
const TEXT = 3;

// Elements whose contents are not part of the document's text.
const SKIPPED = new Set(['script', 'style', 'template', 'head', 'title', 'meta', 'link', 'base']);

// Elements that start on a line of their own.
const BLOCKS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'caption',
  'center',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'html',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

const tagOf = (node: MarkupNode) => (node.nodeType === ELEMENT ? node.nodeName.toLowerCase() : '');
const childrenOf = (node: MarkupNode): MarkupNode[] => Array.from(node.childNodes);
const attributeOf = (node: MarkupNode, name: string) => node.getAttribute?.(name)?.trim() ?? '';

// Text exactly as written, for code. `<br>` counts as a line break.
function rawText(node: MarkupNode): string {
  if (node.nodeType === TEXT) return node.nodeValue ?? '';
  if (node.nodeType !== ELEMENT) return '';
  if (tagOf(node) === 'br') return '\n';
  return childrenOf(node).map(rawText).join('');
}

// One space between words, none around the line breaks or at the ends.
const tidy = (text: string) =>
  text
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();

const longestRun = (text: string, char: string) =>
  Math.max(0, ...(text.match(new RegExp(`${char}+`, 'g')) ?? []).map((run) => run.length));

// ── Output formats ────────────────────────────────────────────────────────────

// How one output format writes each construct. Inline pieces arrive with their
// spacing collapsed and `\n` standing for a `<br>`.
interface Dialect {
  text(value: string, inCell: boolean): string;
  strong(content: string): string;
  emphasis(content: string): string;
  strike(content: string): string;
  code(content: string): string;
  link(content: string, href: string): string;
  image(alt: string, src: string): string;
  /** What a `<br>` becomes inside a paragraph, and inside a table cell. */
  lineBreak: string;
  cellBreak: string;
  cell(content: string): string;
  heading(level: number, content: string): string;
  quote(content: string): string;
  codeBlock(code: string, language: string): string;
  bullet: string;
  /** What an `<hr>` becomes; empty to leave it out. */
  rule: string;
  table(rows: string[][]): string;
}

// Puts `marker` on both sides of `content`, keeping the spaces at its ends
// outside: `<b>bold </b>text` is `**bold** text`, not `**bold **text`.
// Content that is all spaces has nothing to mark and is returned as it is.
function wrap(content: string, marker: string): string {
  const inner = content.trim();
  if (!inner) return content;
  const lead = /^\s/.test(content) ? ' ' : '';
  const trail = /\s$/.test(content) ? ' ' : '';
  return `${lead}${marker}${inner}${marker}${trail}`;
}

// A link or image address. One with spaces or brackets needs the `<...>` form.
const destination = (address: string) =>
  /[\s()<>]/.test(address) ? `<${address.replace(/[<>]/g, '')}>` : address;

const MARKDOWN: Dialect = {
  text(value, inCell) {
    // Inside a table cell the characters that could turn a value into
    // formatting, or end the cell, are escaped.
    const escaped = inCell ? value.replace(/[\\`*_[\]|]/g, '\\$&') : value;
    // Text that reads like a tag or an entity would otherwise become one.
    return escaped.replace(/<(?=[a-z/!?])/gi, '\\<').replace(/&(?=#?\w+;)/g, '\\&');
  },
  strong: (content) => wrap(content, '**'),
  emphasis: (content) => wrap(content, '*'),
  strike: (content) => wrap(content, '~~'),
  code(content) {
    if (!content) return '';
    const fence = '`'.repeat(longestRun(content, '`') + 1);
    const pad = content.startsWith('`') || content.endsWith('`') ? ' ' : '';
    return `${fence}${pad}${content}${pad}${fence}`;
  },
  link(content, href) {
    const label = content.trim();
    if (!label) return `[${href}](${destination(href)})`;
    const lead = /^\s/.test(content) ? ' ' : '';
    const trail = /\s$/.test(content) ? ' ' : '';
    return `${lead}[${label}](${destination(href)})${trail}`;
  },
  image: (alt, src) => (src ? `![${alt}](${destination(src)})` : alt),
  lineBreak: '  \n',
  cellBreak: '<br>',
  // A bar ends the cell wherever it stands, inline code and addresses
  // included. Bars in plain text are escaped already and are left alone.
  cell: (content) => content.replace(/\\?\|/g, (bar) => (bar.length === 2 ? bar : '\\|')),
  heading: (level, content) => `${'#'.repeat(level)} ${content}`,
  quote: (content) =>
    content
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n'),
  codeBlock(code, language) {
    const fence = '`'.repeat(Math.max(3, longestRun(code, '`') + 1));
    return `${fence}${language}\n${code}\n${fence}`;
  },
  bullet: '- ',
  rule: '---',
  table(rows) {
    const columnCount = Math.max(...rows.map((row) => row.length));
    if (columnCount === 0) return '';
    const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
    const padded = rows.map((row) =>
      Array.from({ length: columnCount }, (_, index) => row[index] ?? '')
    );

    return [
      line(padded[0]),
      line(Array.from({ length: columnCount }, () => '---')),
      ...padded.slice(1).map(line),
    ].join('\n');
  },
};

const asIs = (content: string) => content;

const PLAIN_TEXT: Dialect = {
  text: asIs,
  strong: asIs,
  emphasis: asIs,
  strike: asIs,
  code: asIs,
  link: (content, href) => (content.trim() ? content : href),
  image: (alt) => alt,
  lineBreak: '\n',
  cellBreak: ' ',
  cell: asIs,
  heading: (_level, content) => content,
  quote: asIs,
  codeBlock: asIs,
  bullet: '- ',
  rule: '',
  table: (rows) => rows.map((row) => row.join('\t')).join('\n'),
};

// ── Tree walk ─────────────────────────────────────────────────────────────────

function convert(root: MarkupNode, dialect: Dialect): string {
  // Whether an element starts a line of its own: a block element, or any
  // other element that has one somewhere inside it.
  const blockLike = new WeakMap<MarkupNode, boolean>();
  const isBlock = (node: MarkupNode): boolean => {
    if (node.nodeType !== ELEMENT) return false;
    const known = blockLike.get(node);
    if (known !== undefined) return known;
    const tag = tagOf(node);
    const result = !SKIPPED.has(tag) && (BLOCKS.has(tag) || childrenOf(node).some(isBlock));
    blockLike.set(node, result);
    return result;
  };

  const inline = (node: MarkupNode, inCell: boolean): string => {
    if (node.nodeType === TEXT) {
      return dialect.text((node.nodeValue ?? '').replace(/\s+/g, ' '), inCell);
    }
    if (node.nodeType !== ELEMENT) return '';

    const tag = tagOf(node);
    if (SKIPPED.has(tag)) return '';
    if (tag === 'br') return '\n';
    if (tag === 'img') return dialect.image(attributeOf(node, 'alt'), attributeOf(node, 'src'));
    if (tag === 'code') return dialect.code(rawText(node).replace(/\s+/g, ' ').trim());

    const content = childrenOf(node)
      .map((child) => inline(child, inCell))
      .join('');

    switch (tag) {
      case 'strong':
      case 'b':
        return dialect.strong(content);
      case 'em':
      case 'i':
        return dialect.emphasis(content);
      case 'del':
      case 's':
      case 'strike':
        return dialect.strike(content);
      case 'a': {
        const href = attributeOf(node, 'href');
        return href ? dialect.link(content, href) : content;
      }
      default:
        // A block met in the middle of a line, such as a paragraph inside a
        // table cell, still keeps its words apart from its neighbours'.
        return BLOCKS.has(tag) ? ` ${content} ` : content;
    }
  };

  const inlineOf = (nodes: readonly MarkupNode[], inCell = false) =>
    tidy(nodes.map((node) => inline(node, inCell)).join(''));

  // One `<br>` breaks the line; two or more start a new paragraph.
  const paragraph = (nodes: readonly MarkupNode[]) =>
    inlineOf(nodes).replace(/\n+/g, (breaks) => (breaks.length > 1 ? '\n\n' : dialect.lineBreak));
  const singleLine = (nodes: readonly MarkupNode[]) => inlineOf(nodes).replace(/\n+/g, ' ');
  const cell = (node: MarkupNode) =>
    dialect.cell(inlineOf(childrenOf(node), true).replace(/\n+/g, dialect.cellBreak));

  type Emit = (text: string, isList: boolean) => void;

  // Calls `emit` for every block directly inside `container`, in order. Text
  // and inline elements between two blocks form a paragraph of their own.
  const eachBlock = (container: MarkupNode, emit: Emit) => {
    let run: MarkupNode[] = [];
    const flush = () => {
      const text = paragraph(run);
      if (text) emit(text, false);
      run = [];
    };

    for (const child of childrenOf(container)) {
      if (isBlock(child)) {
        flush();
        block(child, emit);
      } else {
        run.push(child);
      }
    }
    flush();
  };

  const block = (element: MarkupNode, emit: Emit) => {
    const tag = tagOf(element);

    switch (tag) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const text = singleLine(childrenOf(element));
        if (text) emit(dialect.heading(Number(tag[1]), text), false);
        break;
      }
      case 'blockquote': {
        const inner = blocksOf(element).join('\n\n');
        if (inner) emit(dialect.quote(inner), false);
        break;
      }
      case 'pre': {
        // Blank lines around the code go; the indent of its first line stays.
        const code = rawText(element)
          .replace(/\r\n?/g, '\n')
          .replace(/^(?:[ \t]*\n)+/, '')
          .replace(/\s+$/, '');
        if (code) emit(dialect.codeBlock(code, languageOf(element)), false);
        break;
      }
      case 'ul':
      case 'ol': {
        const text = list(element, tag === 'ol');
        if (text) emit(text, true);
        break;
      }
      case 'table':
        table(element, emit);
        break;
      case 'hr':
        if (dialect.rule) emit(dialect.rule, false);
        break;
      default:
        eachBlock(element, emit);
    }
  };

  const blocksOf = (container: MarkupNode): string[] => {
    const blocks: string[] = [];
    eachBlock(container, (text) => blocks.push(text));
    return blocks;
  };

  // The language named by a `language-xxx` class on the `<pre>` or its `<code>`.
  const languageOf = (pre: MarkupNode): string => {
    const candidates = [pre, ...childrenOf(pre).filter((child) => tagOf(child) === 'code')];
    for (const candidate of candidates) {
      const match = /(?:^|\s)lang(?:uage)?-([\w#+.-]+)/.exec(attributeOf(candidate, 'class'));
      if (match) return match[1];
    }
    return '';
  };

  const list = (element: MarkupNode, ordered: boolean): string => {
    const start = Number.parseInt(attributeOf(element, 'start'), 10);
    let number = Number.isNaN(start) ? 1 : start;
    const items: string[] = [];

    for (const child of childrenOf(element)) {
      const tag = tagOf(child);
      if (!tag || SKIPPED.has(tag)) continue;

      // A list placed straight inside a list, without an item around it.
      if (tag === 'ul' || tag === 'ol') {
        const nested = list(child, tag === 'ol');
        if (nested) items.push(nested.replace(/^(?=.)/gm, '  '));
        continue;
      }

      const marker = ordered ? `${number}. ` : dialect.bullet;
      number += 1;

      // A nested list follows its item on the next line; any other block in
      // the item is a paragraph apart.
      let body = '';
      eachBlock(child, (text, isList) => {
        body += body ? `${isList ? '\n' : '\n\n'}${text}` : text;
      });
      // Lines after the first sit under the item's text, not under its marker.
      items.push(
        `${marker}${body.replace(/\n(?=.)/g, `\n${' '.repeat(marker.length)}`)}`.trimEnd()
      );
    }

    return items.join('\n');
  };

  const table = (element: MarkupNode, emit: Emit) => {
    const rows: string[][] = [];

    // Only this table's own rows: a table inside a cell is part of that cell.
    const collect = (parent: MarkupNode) => {
      for (const child of childrenOf(parent)) {
        const tag = tagOf(child);
        if (tag === 'tr') {
          rows.push(
            childrenOf(child)
              .filter(
                (candidate) => candidate.nodeType === ELEMENT && !SKIPPED.has(tagOf(candidate))
              )
              .map(cell)
          );
        } else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
          collect(child);
        } else if (tag === 'caption') {
          const caption = singleLine(childrenOf(child));
          if (caption) emit(caption, false);
        }
      }
    };
    collect(element);

    const text = rows.length > 0 ? dialect.table(rows) : '';
    if (text) emit(text, false);
  };

  return blocksOf(root).join('\n\n');
}

/**
 * The contents of `root` as Markdown: headings, paragraphs, emphasis, links,
 * images, nested lists, blockquotes, fenced code and tables. Scripts and
 * styles are left out. Returns an empty string for a tree without text.
 */
export function htmlToMarkdown(root: MarkupNode): string {
  return convert(root, MARKDOWN);
}

/**
 * The contents of `root` as plain text: one block per paragraph a blank line
 * apart, list items on lines of their own behind `- ` or their number, table
 * cells a tab apart. Scripts and styles are left out.
 */
export function htmlToPlainText(root: MarkupNode): string {
  return convert(root, PLAIN_TEXT);
}
