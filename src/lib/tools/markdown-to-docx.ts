/**
 * Markdown to DOCX logic: splits Markdown into the blocks the outline lists,
 * keeps each block's page-break and spacing settings while the text is edited,
 * and builds the Word document from blocks and settings.
 *
 * Everything but `renderDocx` is pure. `renderDocx` loads the docx library on
 * first use and runs in Node as well as in the browser.
 */

import type { FileChild, ParagraphChild, TableCell, TableRow } from 'docx';
import { createMarkdownParser, type MarkdownToken } from '@/lib/markdown/parser';

type DocxLibrary = typeof import('docx');

// The shared Markdown syntax, so a document splits into the same blocks and
// inline runs here as in the Markdown preview. The preview's maths plugin is
// left off on purpose: Word cannot show KaTeX markup, and the walkers below
// have no case for maths tokens, so `$...$` would vanish from the document
// instead of staying as text. Highlighting is left off too; code is exported
// in a single colour and the HTML preview should match it.
const markdown = createMarkdownParser();

// ── Style ─────────────────────────────────────────────────────────────────────

/** Fonts, sizes (points), spacing (points) and colours (RRGGBB) of the document. */
export interface DocxStyle {
  fontFamily: string;
  bodyFontSize: number;
  bodyLineSpacing: number;
  paragraphSpacingAfter: number;
  h1FontSize: number;
  h2FontSize: number;
  h3FontSize: number;
  h1Color: string;
  h2Color: string;
  h3Color: string;
  headingSpacingBefore: number;
  headingSpacingAfter: number;
  codeBgColor: string;
  codeBorderColor: string;
  tableHeaderBgColor: string;
  tableHeaderColor: string;
}

export const DOCX_THEME_PRESETS: Record<string, { name: string; options: DocxStyle }> = {
  modern: {
    name: 'Modern Clean',
    options: {
      fontFamily: 'Segoe UI',
      bodyFontSize: 11,
      bodyLineSpacing: 1.25,
      paragraphSpacingAfter: 8,
      h1FontSize: 22,
      h2FontSize: 16,
      h3FontSize: 13,
      h1Color: '1F2937', // Charcoal
      h2Color: '374151',
      h3Color: '4B5563',
      headingSpacingBefore: 16,
      headingSpacingAfter: 6,
      codeBgColor: 'F3F4F6',
      codeBorderColor: '9CA3AF',
      tableHeaderBgColor: 'F3F4F6',
      tableHeaderColor: '1F2937',
    },
  },
  corporate: {
    name: 'Corporate Professional',
    options: {
      fontFamily: 'Calibri',
      bodyFontSize: 11,
      bodyLineSpacing: 1.15,
      paragraphSpacingAfter: 6,
      h1FontSize: 20,
      h2FontSize: 15,
      h3FontSize: 12,
      h1Color: '1B365D', // Dark Blue
      h2Color: '2A4B7C',
      h3Color: '46689C',
      headingSpacingBefore: 12,
      headingSpacingAfter: 4,
      codeBgColor: 'F8FAFC',
      codeBorderColor: 'CBD5E1',
      tableHeaderBgColor: '1B365D',
      tableHeaderColor: 'FFFFFF',
    },
  },
  academic: {
    name: 'Academic / Thesis',
    options: {
      fontFamily: 'Times New Roman',
      bodyFontSize: 12,
      bodyLineSpacing: 2.0, // Double spaced
      paragraphSpacingAfter: 12,
      h1FontSize: 18,
      h2FontSize: 14,
      h3FontSize: 12,
      h1Color: '000000',
      h2Color: '000000',
      h3Color: '000000',
      headingSpacingBefore: 18,
      headingSpacingAfter: 12,
      codeBgColor: 'F9FAFB',
      codeBorderColor: 'D1D5DB',
      tableHeaderBgColor: 'FFFFFF',
      tableHeaderColor: '000000',
    },
  },
  technical: {
    name: 'Technical Documentation',
    options: {
      fontFamily: 'Consolas',
      bodyFontSize: 10,
      bodyLineSpacing: 1.15,
      paragraphSpacingAfter: 6,
      h1FontSize: 18,
      h2FontSize: 14,
      h3FontSize: 11,
      h1Color: '0F172A',
      h2Color: '334155',
      h3Color: '475569',
      headingSpacingBefore: 14,
      headingSpacingAfter: 6,
      codeBgColor: 'F1F5F9',
      codeBorderColor: '64748B',
      tableHeaderBgColor: '334155',
      tableHeaderColor: 'FFFFFF',
    },
  },
  elegant: {
    name: 'Elegant Serif (Georgia)',
    options: {
      fontFamily: 'Georgia',
      bodyFontSize: 11.5,
      bodyLineSpacing: 1.35,
      paragraphSpacingAfter: 10,
      h1FontSize: 24,
      h2FontSize: 18,
      h3FontSize: 14,
      h1Color: '2D3748',
      h2Color: '4A5568',
      h3Color: '718096',
      headingSpacingBefore: 20,
      headingSpacingAfter: 8,
      codeBgColor: 'F7FAFC',
      codeBorderColor: 'E2E8F0',
      tableHeaderBgColor: 'EDF2F7',
      tableHeaderColor: '2D3748',
    },
  },
};

// ── Blocks ────────────────────────────────────────────────────────────────────

export type MarkdownBlockType = 'heading' | 'paragraph' | 'list' | 'code' | 'table' | 'hr';

/** One top-level piece of the document: what the outline lists and the export lays out. */
export interface MarkdownBlock {
  /** Unique within a document and kept across edits by `carryBlockSettings`. */
  id: string;
  type: MarkdownBlockType;
  /** Heading level, 1 to 6. Headings only. */
  level?: number;
  /** One-line summary for the outline: the block's first line of source. */
  text: string;
  /** The block's own tokens, from its opening token to its closing one. */
  tokens: MarkdownToken[];
  /** Start a new page before this block. */
  pageBreakBefore: boolean;
  /** Space above and below in points, replacing the style's default when set. */
  spacingBefore?: number;
  spacingAfter?: number;
}

/** The Markdown as an HTML fragment, in the same dialect the blocks are split by. */
export function renderPreviewHtml(source: string): string {
  return markdown.render(source);
}

// Tokens that open a block which runs until its matching closing token.
const CONTAINER_BLOCKS: Record<string, MarkdownBlockType> = {
  heading_open: 'heading',
  paragraph_open: 'paragraph',
  bullet_list_open: 'list',
  ordered_list_open: 'list',
  table_open: 'table',
};

const HR_SUMMARY = '--- (Horizontal Rule / Manual Page Break)';

let createdBlocks = 0;

function createBlock(type: MarkdownBlockType, tokens: MarkdownToken[], text = ''): MarkdownBlock {
  createdBlocks += 1;
  return { id: `block-${createdBlocks}`, type, text, tokens, pageBreakBefore: false };
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

// The readable text of a raw HTML block: comments, scripts, styles and the
// tags themselves go, what the tags wrap stays.
function htmlBlockText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ')
    .replace(/<[/!?]?[a-z][^>]*>/gi, ' ')
    .replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, decimal, hex, name) => {
      if (name) return HTML_ENTITIES[name.toLowerCase()] ?? entity;
      const code = decimal ? Number.parseInt(decimal, 10) : Number.parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits Markdown into its top-level blocks, in document order.
 *
 * A list is one block however deeply it nests, and so is a table. A
 * blockquote is not a block of its own: the paragraphs, lists and code inside
 * it are. A raw HTML block becomes a paragraph of the text its tags wrap, and
 * is left out when it wraps none.
 */
export function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let open: MarkdownBlock | null = null;
  let openLevel = 0;

  for (const token of markdown.parse(source)) {
    if (open) {
      open.tokens.push(token);
      // Only the closing token on the block's own nesting level ends it. A
      // nested list closes on a deeper level and stays inside.
      if (token.nesting === -1 && token.level === openLevel) {
        open.text = open.tokens.find((candidate) => candidate.type === 'inline')?.content ?? '';
        blocks.push(open);
        open = null;
      }
      continue;
    }

    const type = CONTAINER_BLOCKS[token.type];
    if (type) {
      open = createBlock(type, [token]);
      openLevel = token.level;
      if (type === 'heading') open.level = Number.parseInt(token.tag.slice(1), 10);
    } else if (token.type === 'fence' || token.type === 'code_block') {
      blocks.push(createBlock('code', [token], token.content));
    } else if (token.type === 'hr') {
      blocks.push(createBlock('hr', [token], HR_SUMMARY));
    } else if (token.type === 'html_block') {
      const text = htmlBlockText(token.content);
      if (text) blocks.push(createBlock('paragraph', [token], text));
    }
    // Anything else is a wrapper such as a blockquote. Its contents follow as
    // tokens of their own and become blocks in their turn.
  }

  return blocks;
}

/**
 * Re-parsed blocks with the id, page break and spacing of the blocks they
 * replace, so settings made in the outline survive typing.
 *
 * A fresh block takes over from the first unclaimed old block of the same type
 * and text; failing that, from the old block at its own position if that has
 * the same type. Every old block is handed on at most once, so two blocks
 * never share an id.
 */
export function carryBlockSettings(
  previous: readonly MarkdownBlock[],
  fresh: readonly MarkdownBlock[]
): MarkdownBlock[] {
  const claimed = new Set<MarkdownBlock>();
  const sources: (MarkdownBlock | undefined)[] = fresh.map((block) => {
    const match = previous.find(
      (old) => !claimed.has(old) && old.type === block.type && old.text === block.text
    );
    if (match) claimed.add(match);
    return match;
  });

  fresh.forEach((block, index) => {
    const old = previous[index];
    if (sources[index] || !old || claimed.has(old) || old.type !== block.type) return;
    claimed.add(old);
    sources[index] = old;
  });

  return fresh.map((block, index) => {
    const old = sources[index];
    if (!old) return block;
    return {
      ...block,
      id: old.id,
      pageBreakBefore: old.pageBreakBefore,
      spacingBefore: old.spacingBefore,
      spacingAfter: old.spacingAfter,
    };
  });
}

/**
 * Space above and below a block in points: its own setting where one was
 * made, the style's default otherwise. Null for the blocks that are laid out
 * without paragraph spacing (code, tables and rules), where a setting would
 * change nothing.
 */
export function blockSpacing(
  block: MarkdownBlock,
  style: DocxStyle
): { before: number; after: number } | null {
  const defaults =
    block.type === 'heading'
      ? { before: style.headingSpacingBefore, after: style.headingSpacingAfter }
      : block.type === 'paragraph'
        ? { before: 0, after: style.paragraphSpacingAfter }
        : block.type === 'list'
          ? { before: 0, after: style.paragraphSpacingAfter / 2 }
          : null;
  if (!defaults) return null;

  return {
    before: block.spacingBefore ?? defaults.before,
    after: block.spacingAfter ?? defaults.after,
  };
}

const MAX_SPACING = 100;

/**
 * The block with `delta` points added to the space above or below it, kept
 * between 0 and 100. The step starts from the spacing the block has now, so
 * the first change to a block moves on from the style's default. Blocks
 * without spacing are returned unchanged.
 */
export function adjustBlockSpacing(
  block: MarkdownBlock,
  style: DocxStyle,
  side: 'before' | 'after',
  delta: number
): MarkdownBlock {
  const spacing = blockSpacing(block, style);
  if (!spacing) return block;

  const next = Math.max(0, Math.min(MAX_SPACING, spacing[side] + delta));
  return side === 'before' ? { ...block, spacingBefore: next } : { ...block, spacingAfter: next };
}

/**
 * Text of the document's first heading without its Markdown markup, or an
 * empty string when there is no heading. Used to name the exported file.
 */
export function documentTitle(blocks: readonly MarkdownBlock[]): string {
  const heading = blocks.find((block) => block.type === 'heading');
  const inline = heading?.tokens.find((token) => token.type === 'inline');

  return (inline?.children ?? [])
    .map((child) => {
      if (child.type === 'softbreak' || child.type === 'hardbreak') return ' ';
      return child.type === 'text' || child.type === 'code_inline' || child.type === 'image'
        ? child.content
        : '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Lists ─────────────────────────────────────────────────────────────────────

/** One paragraph of a list once its nesting is flattened into lines. */
export interface ListLine {
  /**
   * `item` opens a list item and carries its marker, `text` is a further
   * paragraph of the same item, `code` is a code block inside it.
   */
  kind: 'item' | 'text' | 'code';
  /** How deep the line's list is nested; 0 for the outermost list. */
  depth: number;
  /** Bullet or number such as `•` or `3.` on an `item` line, empty otherwise. */
  marker: string;
  /** Token holding the line's text. Null on `code` lines and for empty items. */
  inline: MarkdownToken | null;
  /** Source of the code block on a `code` line, empty otherwise. */
  code: string;
}

const BULLETS = ['•', '◦', '▪'];

/**
 * The lines of a list block, top to bottom. Every list numbers its own items
 * from its own start value, and a nested list is one level deeper than the
 * item that holds it.
 */
export function listLines(tokens: readonly MarkdownToken[]): ListLine[] {
  const lines: ListLine[] = [];
  // The lists the walk is inside, innermost last. `marker` is set while an
  // item has been opened and nothing has been printed for it yet.
  const lists: { ordered: boolean; next: number; marker: string | null }[] = [];

  const depth = () => Math.max(0, lists.length - 1);
  const takeMarker = (): string | null => {
    const list = lists[lists.length - 1];
    if (!list) return null;
    const { marker } = list;
    list.marker = null;
    return marker;
  };
  // An item with no text of its own still shows its bullet or number.
  const flushMarker = () => {
    const marker = takeMarker();
    if (marker) lines.push({ kind: 'item', depth: depth(), marker, inline: null, code: '' });
  };

  for (const token of tokens) {
    switch (token.type) {
      case 'bullet_list_open':
      case 'ordered_list_open': {
        flushMarker();
        const start = Number.parseInt(token.attrGet('start') ?? '1', 10);
        lists.push({
          ordered: token.type === 'ordered_list_open',
          next: Number.isNaN(start) ? 1 : start,
          marker: null,
        });
        break;
      }
      case 'bullet_list_close':
      case 'ordered_list_close':
        lists.pop();
        break;
      case 'list_item_open': {
        const list = lists[lists.length - 1];
        if (!list) break;
        list.marker = list.ordered ? `${list.next}.` : BULLETS[depth() % BULLETS.length];
        list.next += 1;
        break;
      }
      case 'list_item_close':
        flushMarker();
        break;
      case 'inline': {
        const marker = takeMarker();
        lines.push({
          kind: marker ? 'item' : 'text',
          depth: depth(),
          marker: marker ?? '',
          inline: token,
          code: '',
        });
        break;
      }
      case 'fence':
      case 'code_block':
        flushMarker();
        lines.push({ kind: 'code', depth: depth(), marker: '', inline: null, code: token.content });
        break;
    }
  }

  return lines;
}

// ── Document ──────────────────────────────────────────────────────────────────

export interface DocxSettings {
  style: DocxStyle;
  pageSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  margins: 'normal' | 'narrow' | 'wide';
  /** Keep a heading on the same page as the block after it. */
  keepHeadingsWithNext: boolean;
  /** Never let a table row continue on the next page. */
  preventTableRowSplit: boolean;
  /** Start a new page before every level 1 or level 2 heading. */
  pageBreakBeforeH1: boolean;
  pageBreakBeforeH2: boolean;
  /** Printed right-aligned at the top of every page. Empty for no header. */
  headerText: string;
  /** Printed left-aligned at the bottom of every page. Empty for none. */
  footerText: string;
  /** Where "Page n of m" sits in the footer, or null for no page numbers. */
  pageNumbers: 'left' | 'center' | 'right' | null;
}

// Portrait page sizes and margins, in twentieths of a point.
const PAGE_SIZES = {
  A4: { width: 11906, height: 16838 },
  Letter: { width: 12240, height: 15840 },
};

const MARGINS = {
  normal: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
  narrow: { top: 720, bottom: 720, left: 720, right: 720 },
  wide: { top: 1440, bottom: 1440, left: 2160, right: 2160 },
};

const CODE_FONT = 'Consolas';
const LINK_COLOR = '0563C1';
const MUTED_COLOR = '6B7280';
// Left edge of a top-level list item's text, and how much further each
// nesting level sits.
const LIST_INDENT = 720;
const LIST_STEP = 360;

// Characters XML 1.0 cannot carry. Word refuses to open a document that holds
// even one of them, and text pasted from a PDF or a terminal often does. The
// `u` flag makes a surrogate pair count as one character, so only unpaired
// halves fall outside the last range.
const NOT_XML = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;
const xmlSafe = (text: string) => text.replace(NOT_XML, '');

// Addresses Word can open. Anything else (a relative path, an anchor) keeps
// the look of a link but is not made clickable.
const LINKABLE = /^(?:https?:|mailto:)/i;

/** How the text of one paragraph is set: size in half-points, colour, forced bold. */
interface RunLook {
  size: number;
  color?: string;
  bold: boolean;
}

// The runs of one inline token: text with its emphasis, inline code, line
// breaks and links.
function inlineRuns(
  docx: DocxLibrary,
  inline: MarkdownToken | null | undefined,
  style: DocxStyle,
  look: RunLook
): ParagraphChild[] {
  const { TextRun, ExternalHyperlink, ShadingType } = docx;
  const runs: ParagraphChild[] = [];
  let bold = false;
  let italics = false;
  let strike = false;
  let link: { href: string; runs: ParagraphChild[] } | null = null;

  const push = (run: ParagraphChild) => (link ? link.runs : runs).push(run);
  const pushText = (text: string) =>
    push(
      new TextRun({
        text: xmlSafe(text),
        bold: bold || look.bold,
        italics,
        strike: strike || undefined,
        font: style.fontFamily,
        size: look.size,
        color: look.color || (link ? LINK_COLOR : undefined),
        underline: link ? {} : undefined,
      })
    );
  const pushBreak = () => push(new TextRun({ text: '', break: 1 }));
  const closeLink = () => {
    if (!link) return;
    const { href, runs: linked } = link;
    link = null;
    if (linked.length === 0) return;
    if (LINKABLE.test(href)) {
      runs.push(new ExternalHyperlink({ link: xmlSafe(href), children: linked }));
    } else {
      runs.push(...linked);
    }
  };

  for (const child of inline?.children ?? []) {
    switch (child.type) {
      case 'text':
        pushText(child.content);
        break;
      case 'image':
        // The picture itself is not fetched; its description stands in for it.
        if (child.content) pushText(child.content);
        break;
      case 'code_inline':
        push(
          new TextRun({
            text: xmlSafe(child.content),
            font: CODE_FONT,
            size: look.size * 0.9,
            // `clear` shows the fill colour. `solid` covers the fill with the
            // pattern colour, which is not the grey asked for here.
            shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' },
          })
        );
        break;
      case 'softbreak':
      case 'hardbreak':
        pushBreak();
        break;
      case 'html_inline':
        // `<br>` is the usual way to break a line inside a table cell.
        if (/^<br\s*\/?>$/i.test(child.content.trim())) pushBreak();
        break;
      case 'strong_open':
        bold = true;
        break;
      case 'strong_close':
        bold = false;
        break;
      case 'em_open':
        italics = true;
        break;
      case 'em_close':
        italics = false;
        break;
      case 's_open':
        strike = true;
        break;
      case 's_close':
        strike = false;
        break;
      case 'link_open':
        closeLink();
        link = { href: child.attrGet('href') ?? '', runs: [] };
        break;
      case 'link_close':
        closeLink();
        break;
    }
  }
  closeLink();

  return runs;
}

function buildDocument(
  docx: DocxLibrary,
  blocks: readonly MarkdownBlock[],
  settings: DocxSettings
) {
  const {
    Document,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    PageBreak,
    AlignmentType,
    PageOrientation,
    HeadingLevel,
    Header,
    Footer,
    PageNumber,
    ShadingType,
    Tab,
    TabStopType,
  } = docx;
  const { style } = settings;

  const bodyLook: RunLook = { size: style.bodyFontSize * 2, bold: false };
  const headingLook = (level: number | undefined): RunLook => {
    if (level === 1) return { size: style.h1FontSize * 2, color: style.h1Color, bold: false };
    if (level === 2) return { size: style.h2FontSize * 2, color: style.h2Color, bold: false };
    return { size: style.h3FontSize * 2, color: style.h3Color, bold: false };
  };
  const codeRun = (line: string) =>
    new TextRun({ text: xmlSafe(line), font: CODE_FONT, size: style.bodyFontSize * 1.8 });
  const codeLinesOf = (code: string) => code.replace(/\n$/, '').split('\n');
  // Line height of body text, in 240ths of a line. A whole number, like the
  // paragraph spacing below.
  const bodyLine = Math.round(style.bodyLineSpacing * 240);

  const children: FileChild[] = [];
  // No break is needed at the very top of the document, nor straight after
  // another one.
  let atPageStart = true;

  for (const block of blocks) {
    const breaksAutomatically =
      block.type === 'heading' &&
      ((block.level === 1 && settings.pageBreakBeforeH1) ||
        (block.level === 2 && settings.pageBreakBeforeH2));
    const breakBefore: boolean = (block.pageBreakBefore || breaksAutomatically) && !atPageStart;
    const inline = block.tokens.find((token) => token.type === 'inline');
    // In twentieths of a point, as Word counts paragraph spacing. The file
    // format has no fractions for these, and the docx library writes them
    // as given, so they are rounded here.
    const spacing = blockSpacing(block, style);
    const before = Math.round((spacing?.before ?? 0) * 20);
    const after = Math.round((spacing?.after ?? 0) * 20);

    if (block.type === 'heading') {
      children.push(
        new Paragraph({
          children: inlineRuns(docx, inline, style, headingLook(block.level)),
          heading:
            block.level === 1
              ? HeadingLevel.HEADING_1
              : block.level === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3,
          spacing: { before, after },
          keepNext: settings.keepHeadingsWithNext,
          pageBreakBefore: breakBefore,
        })
      );
      atPageStart = breakBefore;
    } else if (block.type === 'paragraph') {
      children.push(
        new Paragraph({
          // A paragraph made from a raw HTML block has no inline token, only
          // the text that was lifted out of the markup.
          children: inline
            ? inlineRuns(docx, inline, style, bodyLook)
            : [
                new TextRun({
                  text: xmlSafe(block.text),
                  font: style.fontFamily,
                  size: bodyLook.size,
                }),
              ],
          spacing: { before, after, line: bodyLine },
          keepLines: true,
          pageBreakBefore: breakBefore,
        })
      );
      atPageStart = breakBefore;
    } else if (block.type === 'hr') {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      atPageStart = true;
    } else if (block.type === 'list') {
      let isFirstParagraph = true;

      for (const line of listLines(block.tokens)) {
        const textIndent = LIST_INDENT + line.depth * LIST_STEP;

        if (line.kind === 'code') {
          const codeLines = codeLinesOf(line.code);
          codeLines.forEach((codeLine, lineIndex) => {
            children.push(
              new Paragraph({
                children: [codeRun(codeLine)],
                indent: { left: textIndent },
                shading: { type: ShadingType.CLEAR, fill: style.codeBgColor, color: 'auto' },
                spacing: {
                  before: 0,
                  after: lineIndex === codeLines.length - 1 ? after : 0,
                  line: 240,
                },
                pageBreakBefore: breakBefore && isFirstParagraph,
              })
            );
            isFirstParagraph = false;
          });
          continue;
        }

        const runs = inlineRuns(docx, line.inline, style, bodyLook);
        children.push(
          new Paragraph({
            children:
              line.kind === 'item'
                ? [
                    new TextRun({
                      text: `${line.marker}  `,
                      bold: true,
                      font: style.fontFamily,
                      size: bodyLook.size,
                    }),
                    ...runs,
                  ]
                : runs,
            indent:
              line.kind === 'item'
                ? { left: textIndent, hanging: LIST_STEP }
                : { left: textIndent },
            spacing: { before, after, line: bodyLine },
            pageBreakBefore: breakBefore && isFirstParagraph,
          })
        );
        isFirstParagraph = false;
      }
      atPageStart = breakBefore;
    } else if (block.type === 'code') {
      children.push(
        new Table({
          rows: [
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  children: codeLinesOf(block.tokens[0].content || '').map(
                    (line, lineIndex) =>
                      new Paragraph({
                        children: [codeRun(line)],
                        spacing: { before: 0, after: 0, line: 240 },
                        pageBreakBefore: breakBefore && lineIndex === 0,
                      })
                  ),
                  shading: { fill: style.codeBgColor },
                  borders: {
                    top: { style: BorderStyle.NONE },
                    bottom: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.NONE },
                    left: {
                      style: BorderStyle.SINGLE,
                      size: 24,
                      color: style.codeBorderColor,
                    },
                  },
                  margins: { top: 160, bottom: 160, left: 200, right: 200 },
                }),
              ],
            }),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
        })
      );
      atPageStart = breakBefore;
    } else if (block.type === 'table') {
      const rows: TableRow[] = [];
      let cells: TableCell[] = [];
      let inHeader = false;
      let isFirstCell = true;
      let cellAlignment: 'left' | 'center' | 'right' | undefined;

      for (const token of block.tokens) {
        if (token.type === 'thead_open') {
          inHeader = true;
        } else if (token.type === 'thead_close') {
          inHeader = false;
        } else if (token.type === 'tr_open') {
          cells = [];
        } else if (token.type === 'tr_close') {
          rows.push(
            new TableRow({
              tableHeader: inHeader,
              cantSplit: settings.preventTableRowSplit,
              children: cells,
            })
          );
        } else if (token.type === 'th_open' || token.type === 'td_open') {
          // A column aligned with `:--`, `:-:` or `--:` carries it as a style.
          const align = /text-align:\s*(left|center|right)/.exec(token.attrGet('style') ?? '');
          cellAlignment = align ? (align[1] as 'left' | 'center' | 'right') : undefined;
        } else if (token.type === 'inline') {
          cells.push(
            new TableCell({
              children: [
                new Paragraph({
                  children: inlineRuns(
                    docx,
                    token,
                    style,
                    inHeader
                      ? { size: bodyLook.size, color: style.tableHeaderColor, bold: true }
                      : bodyLook
                  ),
                  alignment:
                    cellAlignment === 'center'
                      ? AlignmentType.CENTER
                      : cellAlignment === 'right'
                        ? AlignmentType.RIGHT
                        : cellAlignment === 'left'
                          ? AlignmentType.LEFT
                          : undefined,
                  spacing: { before: 0, after: 0 },
                  pageBreakBefore: breakBefore && isFirstCell,
                }),
              ],
              shading: inHeader ? { fill: style.tableHeaderBgColor } : undefined,
              margins: { top: 120, bottom: 120, left: 120, right: 120 },
            })
          );
          isFirstCell = false;
        }
      }

      if (rows.length > 0) {
        children.push(
          new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
              left: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
              right: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
              insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
            },
          })
        );
      }
      atPageStart = breakBefore;
    }
  }

  const page = PAGE_SIZES[settings.pageSize];
  const margin = MARGINS[settings.margins];
  const isLandscape = settings.orientation === 'landscape';
  const textWidth = (isLandscape ? page.height : page.width) - margin.left - margin.right;

  const headerText = xmlSafe(settings.headerText).trim();
  const footerText = xmlSafe(settings.footerText).trim();
  const { pageNumbers } = settings;

  const mutedRun = (
    content: { text: string } | { children: (string | InstanceType<typeof Tab>)[] }
  ) => new TextRun({ ...content, font: style.fontFamily, size: 18, color: MUTED_COLOR });
  const pageNumberRuns = pageNumbers
    ? [
        mutedRun({ text: 'Page ' }),
        mutedRun({ children: [PageNumber.CURRENT] }),
        mutedRun({ text: ' of ' }),
        mutedRun({ children: [PageNumber.TOTAL_PAGES] }),
      ]
    : [];

  // The footer text stays on the left. Page numbers on the left follow it
  // after a gap; centred or on the right they sit on a tab stop of their own.
  // Without footer text the numbers are simply aligned.
  const footerParagraph = footerText
    ? new Paragraph({
        alignment: AlignmentType.LEFT,
        tabStops:
          pageNumbers === 'center'
            ? [{ type: TabStopType.CENTER, position: Math.round(textWidth / 2) }]
            : pageNumbers === 'right'
              ? [{ type: TabStopType.RIGHT, position: textWidth }]
              : undefined,
        children: [
          mutedRun({ text: pageNumbers === 'left' ? `${footerText}      ` : footerText }),
          ...(pageNumbers === 'center' || pageNumbers === 'right'
            ? [mutedRun({ children: [new Tab()] })]
            : []),
          ...pageNumberRuns,
        ],
      })
    : new Paragraph({
        alignment:
          pageNumbers === 'left'
            ? AlignmentType.LEFT
            : pageNumbers === 'right'
              ? AlignmentType.RIGHT
              : AlignmentType.CENTER,
        children: pageNumberRuns,
      });

  return new Document({
    sections: [
      {
        properties: {
          page: {
            // docx takes the portrait size and turns it for landscape itself.
            size: {
              width: page.width,
              height: page.height,
              orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin,
          },
        },
        headers: headerText
          ? {
              default: new Header({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({
                        text: headerText,
                        font: style.fontFamily,
                        size: 18,
                        color: MUTED_COLOR,
                        italics: true,
                      }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        footers:
          footerText || pageNumbers
            ? { default: new Footer({ children: [footerParagraph] }) }
            : undefined,
        children,
      },
    ],
  });
}

/**
 * Builds the Word document for `blocks` and returns it as a .docx file.
 * Rejects if the document cannot be built or packed.
 */
export async function renderDocx(
  blocks: readonly MarkdownBlock[],
  settings: DocxSettings
): Promise<Blob> {
  const docx = await import('docx');
  return docx.Packer.toBlob(buildDocument(docx, blocks, settings));
}
