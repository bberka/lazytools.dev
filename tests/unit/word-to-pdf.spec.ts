import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { layoutTextPages, textToPdf } from '@/lib/tools/word-to-pdf';

// A ruler that needs no font: every character is one unit wide.
const byLength = (text: string) => Array.from(text).length;

const layout = (text: string, maxWidth = 20, linesPerPage = 100) =>
  layoutTextPages(text, { maxWidth, linesPerPage, measure: byLength });

const lines = (text: string, maxWidth = 20) => layout(text, maxWidth).flat();

test.describe('layoutTextPages', () => {
  test('breaks lines at spaces and keeps every line inside the width', () => {
    const wrapped = lines('The quick brown fox jumps over the lazy dog', 12);

    expect(wrapped).toEqual(['The quick', 'brown fox', 'jumps over', 'the lazy dog']);
    expect(wrapped.every((line) => byLength(line) <= 12)).toBe(true);
  });

  test('keeps text that fits on one line', () => {
    expect(layout('Hello world')).toEqual([['Hello world']]);
  });

  // mammoth separates paragraphs with two line breaks. The tool used to split
  // on spaces only, so "one.\n\nSecond" reached pdf-lib as a single line.
  test('turns paragraph breaks into separate lines, never into a line with a break in it', () => {
    const wrapped = lines('First paragraph one.\n\nSecond paragraph two.\n\n', 40);

    expect(wrapped).toEqual(['First paragraph one.', '', 'Second paragraph two.']);
    expect(wrapped.some((line) => /[\n\r\f\v]/.test(line))).toBe(false);
  });

  test('keeps single line breaks inside a paragraph', () => {
    expect(lines('Name\nStreet 1\nTown', 40)).toEqual(['Name', 'Street 1', 'Town']);
  });

  test('reads every kind of line break', () => {
    expect(lines('a\r\nb\rc\fd\ve\u{2028}f\u{2029}g\u{85}h', 40)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
    ]);
  });

  test('puts one blank line between paragraphs however many empty lines there were', () => {
    expect(lines('\n\n\nA\n\n\n\n\nB\n   \n\nC\n\n\n', 40)).toEqual(['A', '', 'B', '', 'C']);
  });

  // The old loop drew an empty line in front of a word that did not fit and
  // then let the word run off the page.
  test('cuts a word that is wider than the line, without a blank line before it', () => {
    expect(lines('see https://example.com/a/very/long/path now', 10)).toEqual([
      'see',
      'https://ex',
      'ample.com/',
      'a/very/lon',
      'g/path now',
    ]);
    expect(lines('abcdefghijklmnopqrstuvwxyz', 10)).toEqual(['abcdefghij', 'klmnopqrst', 'uvwxyz']);
  });

  test('cuts between whole characters, not inside a surrogate pair', () => {
    const wrapped = lines('😀😀😀😀😀', 2);

    expect(wrapped).toEqual(['😀😀', '😀😀', '😀']);
  });

  test('still makes progress when a single character is wider than the line', () => {
    expect(layoutTextPages('abc', { maxWidth: 0.5, linesPerPage: 10, measure: byLength })).toEqual([
      ['a', 'b', 'c'],
    ]);
  });

  test('keeps repeated spaces inside a line and drops them at a line break', () => {
    expect(lines('a  b', 20)).toEqual(['a  b']);
    expect(lines('aaaa    bbbb', 6)).toEqual(['aaaa', 'bbbb']);
    expect(lines('  indented', 20)).toEqual(['  indented']);
  });

  test('turns tabs into spaces and drops characters that cannot be drawn', () => {
    expect(lines('a\tb', 20)).toEqual(['a    b']);
    expect(lines('zero\u{200B}width soft\u{AD}hyphen \u{FEFF}bom nul\u{0}', 80)).toEqual([
      'zerowidth softhyphen bom nul',
    ]);
  });

  test('fills pages to the line count and starts no page with a paragraph gap', () => {
    const pages = layout('1\n2\n3\n\n4\n5\n6\n7', 20, 3);

    expect(pages).toEqual([['1', '2', '3'], ['4', '5', '6'], ['7']]);
  });

  test('gives no pages when there is nothing to draw', () => {
    expect(layout('')).toEqual([]);
    expect(layout('  \n\n \t \n')).toEqual([]);
    expect(layout('\u{200B}\u{FEFF}')).toEqual([]);
  });

  test('treats a page size below one line as one line', () => {
    expect(layout('a\nb', 20, 0)).toEqual([['a'], ['b']]);
  });
});

test.describe('textToPdf', () => {
  // The font the tool fetches from /fonts at run time.
  const roboto = readFileSync(join(process.cwd(), 'public', 'fonts', 'Roboto-Regular.ttf'));

  const A4 = { width: 595.28, height: 841.89 };
  const MARGIN = 50;

  /** For every page, the baseline of each piece of text drawn and how many lines it drew. */
  async function drawnText(bytes: Uint8Array) {
    const doc = await PDFDocument.load(bytes);

    return doc.getPages().map((page) => {
      const contents = page.node.Contents();
      const streams =
        contents instanceof PDFArray
          ? contents.asArray().map((ref) => doc.context.lookup(ref))
          : [contents];
      const source = streams
        .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
        .map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1'))
        .join('\n');

      return source
        .split(/\bBT\b/)
        .slice(1)
        .map((block) => ({
          x: Number(/1 0 0 1 (\S+) (\S+) Tm/.exec(block)?.[1]),
          y: Number(/1 0 0 1 (\S+) (\S+) Tm/.exec(block)?.[2]),
          lineCount: block.match(/\bTj\b/g)?.length ?? 0,
        }));
    });
  }

  test('writes an A4 page of text that pdf-lib can read back', async () => {
    const pdf = await textToPdf('Hello world', roboto);
    const doc = await PDFDocument.load(pdf.bytes);

    expect(pdf.pageCount).toBe(1);
    expect(pdf.unsupportedCharacters).toBe(0);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual(A4);
    expect(await drawnText(pdf.bytes)).toEqual([[{ x: MARGIN, y: A4.height - MARGIN, lineCount: 1 }]]);
  });

  // Each paragraph break used to be drawn inside one drawText call: three
  // lines at pdf-lib's 24 pt spacing, while the tool moved on by one line of
  // 18 pt, so the following lines were printed on top of them.
  test('draws every line on a baseline of its own, a full line apart', async () => {
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph, last one.\n\n';
    const [page] = await drawnText((await textToPdf(text, roboto)).bytes);

    expect(page).toHaveLength(3);
    expect(page.every((draw) => draw.lineCount === 1)).toBe(true);

    const baselines = page.map((draw) => draw.y);
    // 12 pt Roboto is 14.0625 high and the tool adds 4: lines are 18.0625 apart,
    // and a paragraph gap is one empty line.
    expect(baselines[0] - baselines[1]).toBeCloseTo(2 * 18.0625, 3);
    expect(baselines[1] - baselines[2]).toBeCloseTo(2 * 18.0625, 3);
  });

  test('converts a Word document read the way the tool reads it', async () => {
    const paragraphs = [
      'Quarterly report',
      'Revenue grew in every region this quarter, and the growth was strongest in the regions where the new product line launched first, which is what the plan had assumed.',
      '',
      'Thanks for reading.',
    ];
    const docx = await Packer.toBuffer(
      new Document({
        sections: [{ children: paragraphs.map((text) => new Paragraph({ children: [new TextRun(text)] })) }],
      })
    );

    // mammoth ends every paragraph, the empty one included, with two line breaks.
    const { value: text } = await mammoth.extractRawText({ buffer: docx });
    expect(text).toBe(`${paragraphs.join('\n\n')}\n\n`);

    const [page] = await drawnText((await textToPdf(text, roboto)).bytes);
    const lineHeight = 18.0625;
    const steps = page.slice(1).map((draw, index) => (page[index].y - draw.y) / lineHeight);

    // Title, a paragraph that needs two lines, closing line: four lines, each
    // drawn alone, with one empty line wherever a paragraph ends.
    expect(page.map((draw) => draw.lineCount)).toEqual([1, 1, 1, 1]);
    expect(steps.map((step) => Math.round(step * 1000) / 1000)).toEqual([2, 1, 2]);
  });

  test('continues on new pages and keeps every baseline between the margins', async () => {
    const text = Array.from({ length: 100 }, (_, index) => `Line number ${index + 1}`).join('\n');
    const pdf = await textToPdf(text, roboto);
    const pages = await drawnText(pdf.bytes);

    // 42 baselines fit between the top and bottom margin of an A4 page.
    expect(pdf.pageCount).toBe(3);
    expect(pages.map((page) => page.length)).toEqual([42, 42, 16]);

    for (const page of pages) {
      const baselines = page.map((draw) => draw.y);

      expect(page.every((draw) => draw.lineCount === 1)).toBe(true);
      expect(baselines[0]).toBeCloseTo(A4.height - MARGIN, 3);
      expect(Math.min(...baselines)).toBeGreaterThanOrEqual(MARGIN);
      expect(baselines).toEqual([...baselines].sort((a, b) => b - a));
      expect(new Set(baselines).size).toBe(baselines.length);
    }
  });

  test('wraps a long paragraph instead of running past the right margin', async () => {
    const paragraph = Array.from({ length: 60 }, () => 'wrapping').join(' ');
    const [page] = await drawnText((await textToPdf(paragraph, roboto)).bytes);

    expect(page.length).toBeGreaterThan(1);
    expect(page.every((draw) => draw.lineCount === 1 && draw.x === MARGIN)).toBe(true);
  });

  test('wraps a long run without spaces as well', async () => {
    const [page] = await drawnText((await textToPdf('x'.repeat(400), roboto)).bytes);

    expect(page.length).toBeGreaterThan(1);
  });

  test('sets no line wider than the space between the margins, measured in the real font', async () => {
    const scratch = await PDFDocument.create();
    scratch.registerFontkit(fontkit);
    const font = await scratch.embedFont(roboto);
    const measure = (line: string) => font.widthOfTextAtSize(line, 12);
    const maxWidth = A4.width - MARGIN * 2;

    const text = [
      'Typography is the art and technique of arranging type to make written language legible.',
      `A link nobody can break by hand: https://example.com/${'path-segment/'.repeat(20)}end`,
      'WWWWWWWWWW iiiiiiiiii '.repeat(30),
    ].join('\n\n');

    const pages = layoutTextPages(text, { maxWidth, linesPerPage: 42, measure });
    const laidOut = pages.flat().filter(Boolean);

    expect(laidOut.length).toBeGreaterThan(10);
    expect(Math.max(...laidOut.map(measure))).toBeLessThanOrEqual(maxWidth);
    // Nothing is lost on the way: the lines hold every character of the text.
    expect(laidOut.join('').replace(/ /g, '')).toBe(text.replace(/\s/g, ''));

    // The PDF holds exactly these lines.
    const drawn = await drawnText((await textToPdf(text, roboto)).bytes);
    expect(drawn.map((page) => page.length)).toEqual(pages.map((page) => page.filter(Boolean).length));
  });

  test('counts the characters the font has no glyph for', async () => {
    expect((await textToPdf('Grüße, Ελληνικά, Привет, naïve café', roboto)).unsupportedCharacters).toBe(0);
    expect((await textToPdf('Hello 你好 and 😀', roboto)).unsupportedCharacters).toBe(3);
    // Zero-width and unusual spaces are not characters anyone would miss.
    expect((await textToPdf('a\u{200B}b\u{3000}c\u{2009}d', roboto)).unsupportedCharacters).toBe(0);
  });

  test('gives one empty page for text with nothing to draw', async () => {
    const pdf = await textToPdf(' \n\n ', roboto);

    expect(pdf.pageCount).toBe(1);
    expect(await drawnText(pdf.bytes)).toEqual([[]]);
  });
});
