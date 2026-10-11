/**
 * Word to PDF logic: lays plain text out as lines and pages, and writes those
 * pages into a PDF with pdf-lib.
 *
 * The layout is pure. It takes the function that measures a line, so it runs
 * in Node with any ruler; `textToPdf` supplies the ruler of the embedded font.
 * Every line it produces is drawn on its own baseline. Text is never handed to
 * pdf-lib with a line break in it: pdf-lib would then draw several lines at
 * its own line spacing while the caller counts one.
 */
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// ── Layout ────────────────────────────────────────────────────────────────────

export interface TextLayoutOptions {
  /** Widest a line may be, in the unit `measure` answers in. */
  maxWidth: number;
  /** Lines that fit on one page. */
  linesPerPage: number;
  /** Width of a piece of text set on a single line. */
  measure: (text: string) => number;
}

const LINE_BREAKS = /\r\n?|[\f\v\u{85}\u{2028}\u{2029}]/gu;
// Control and format characters (zero-width spaces, soft hyphens, byte-order
// marks) have no glyph; drawn, they turn into boxes or stray spaces.
const INVISIBLE_CHARACTERS = /(?!\n)[\p{Cc}\p{Cf}]/gu;

/** Leaves "\n" as the only line break and drops characters that cannot be drawn. */
function normalizeText(text: string): string {
  return text.replace(LINE_BREAKS, '\n').replace(/\t/g, '    ').replace(INVISIBLE_CHARACTERS, '');
}

/** The longest start of `word` that fits the line; always at least one character. */
function fittingStart(word: string, maxWidth: number, measure: (text: string) => number): string {
  let start = '';

  // Iterating the string walks whole characters, so a surrogate pair is never split.
  for (const character of word) {
    if (start && measure(start + character) > maxWidth) break;
    start += character;
  }

  return start;
}

/** Wraps one line of the source text. An empty or blank line stays one empty line. */
function wrapLine(line: string, maxWidth: number, measure: (text: string) => number): string[] {
  const wrapped: string[] = [];
  let current = '';
  // Whether `current` holds a word yet. Empty words are the gaps of repeated spaces.
  let started = false;

  for (const word of line.split(' ')) {
    const candidate = started ? `${current} ${word}` : word;

    if (measure(candidate) <= maxWidth) {
      current = candidate;
      started = true;
      continue;
    }

    if (current.trim()) wrapped.push(current.trimEnd());

    // A word wider than the line (a long URL, text without spaces) is cut to fit.
    let rest = word;
    for (;;) {
      const start = fittingStart(rest, maxWidth, measure);
      if (start.length === rest.length) break;
      wrapped.push(start);
      rest = rest.slice(start.length);
    }

    current = rest;
    started = rest !== '';
  }

  if (current.trim() || wrapped.length === 0) wrapped.push(current.trimEnd());
  return wrapped;
}

function layoutNormalizedText(text: string, options: TextLayoutOptions): string[][] {
  const { maxWidth, measure } = options;
  const linesPerPage = Math.max(1, Math.floor(options.linesPerPage));
  const lines: string[] = [];

  for (const sourceLine of text.split('\n')) {
    for (const line of wrapLine(sourceLine, maxWidth, measure)) {
      // Paragraphs end up one blank line apart, however many empty lines separated them.
      if (line === '' && (lines.length === 0 || lines[lines.length - 1] === '')) continue;
      lines.push(line);
    }
  }

  if (lines[lines.length - 1] === '') lines.pop();

  const pages: string[][] = [];
  let page: string[] = [];

  for (const line of lines) {
    // A page does not open with the gap between two paragraphs.
    if (line === '' && page.length === 0) continue;

    page.push(line);
    if (page.length === linesPerPage) {
      pages.push(page);
      page = [];
    }
  }

  if (page.length > 0) pages.push(page);
  return pages;
}

/**
 * Lays text out as pages of lines. Each line fits `maxWidth`: lines break at
 * spaces, and a word that is too wide on its own is cut. Line breaks in the
 * text are kept, and an empty string in the result is the blank line between
 * two paragraphs. Text with nothing to draw gives no pages.
 */
export function layoutTextPages(text: string, options: TextLayoutOptions): string[][] {
  return layoutNormalizedText(normalizeText(text), options);
}

// ── PDF ───────────────────────────────────────────────────────────────────────

const MARGIN = 50;
const FONT_SIZE = 12;
// Added to the font's own height to get the distance between two baselines.
const LINE_GAP = 4;

export interface TextPdf {
  /** The saved PDF. */
  bytes: Uint8Array;
  pageCount: number;
  /** How many characters of the text the font has no glyph for. A PDF viewer shows them as empty boxes. */
  unsupportedCharacters: number;
}

/**
 * Writes plain text into a PDF: A4 pages, 12 pt, set in the given TrueType or
 * OpenType font, which is embedded. Long text continues on further pages.
 */
export async function textToPdf(text: string, fontBytes: ArrayBuffer | Uint8Array): Promise<TextPdf> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes);

  // Spaces the font lacks (thin, ideographic) become plain ones; any other
  // character it lacks is counted, since it will not be readable.
  const available = new Set(font.getCharacterSet());
  let unsupportedCharacters = 0;

  // With the `u` flag a match is a whole character, never half a surrogate pair.
  const drawable = normalizeText(text).replace(/[^\n]/gu, (character) => {
    if (available.has(character.codePointAt(0) ?? 0)) return character;
    if (/\s/u.test(character)) return ' ';

    unsupportedCharacters += 1;
    return character;
  });

  let page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const lineHeight = font.heightAtSize(FONT_SIZE) + LINE_GAP;
  const top = height - MARGIN;

  const pages = layoutNormalizedText(drawable, {
    maxWidth: width - MARGIN * 2,
    // Baselines run from the top margin down to, at the lowest, the bottom margin.
    linesPerPage: Math.floor((top - MARGIN) / lineHeight) + 1,
    measure: (line) => font.widthOfTextAtSize(line, FONT_SIZE),
  });

  pages.forEach((lines, pageIndex) => {
    if (pageIndex > 0) page = pdfDoc.addPage();

    lines.forEach((line, lineIndex) => {
      if (!line) return;

      page.drawText(line, {
        x: MARGIN,
        y: top - lineIndex * lineHeight,
        size: FONT_SIZE,
        font,
        color: rgb(0, 0, 0),
      });
    });
  });

  return {
    bytes: await pdfDoc.save(),
    pageCount: pdfDoc.getPageCount(),
    unsupportedCharacters,
  };
}
