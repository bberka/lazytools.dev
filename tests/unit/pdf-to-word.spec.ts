import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { pdfTextToDocx, pdfTextToParagraphs } from '@/lib/tools/pdf-to-word';

// What XML 1.0 allows in a document. One character outside it and Word reports the file as damaged.
const XML_ONLY = /^[\t\n\r\u{20}-\u{D7FF}\u{E000}-\u{FFFD}\u{10000}-\u{10FFFF}]*$/u;

const CONTROL_CHARACTERS = '\u{0}\u{1}\u{2}\u{8}\u{B}\u{C}\u{E}\u{1F}';
const NON_CHARACTERS = '\u{FFFE}\u{FFFF}';
// Half of a surrogate pair, which a string can hold but XML cannot. Built from
// its code so that this file stays valid text.
const LONE_SURROGATE = String.fromCharCode(0xd83d);

/** The text of every paragraph in a .docx, and its main document part. */
async function readDocx(docx: Blob) {
  const zip = await JSZip.loadAsync(await docx.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const unescape = (text: string) =>
    text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

  const paragraphs = Array.from(xml.matchAll(/<w:p>(.*?)<\/w:p>/gs), ([, body]) =>
    Array.from(body.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/gs), ([, text]) => unescape(text)).join('')
  );

  return { xml, paragraphs };
}

test.describe('pdfTextToParagraphs', () => {
  test('makes one paragraph per page, with an empty one between pages', () => {
    expect(pdfTextToParagraphs(['Page one text', 'Page two text', 'Page three'])).toEqual([
      'Page one text',
      '',
      'Page two text',
      '',
      'Page three',
    ]);
  });

  test('makes a paragraph of every line when a page has line breaks', () => {
    expect(pdfTextToParagraphs(['Title\nFirst line\r\nSecond line\rThird'])).toEqual([
      'Title',
      'First line',
      'Second line',
      'Third',
    ]);
  });

  // Page text is the PDF's text runs joined by spaces, and spaces are often
  // runs themselves: "Hello", " ", "world" arrives as "Hello   world".
  test('reduces the runs of spaces that joining text runs leaves behind', () => {
    expect(pdfTextToParagraphs(['Hello   world  again', '  padded\t\ttabs  '])).toEqual([
      'Hello world again',
      '',
      'padded tabs',
    ]);
  });

  test('leaves out pages without text and adds no empty paragraphs for them', () => {
    expect(pdfTextToParagraphs(['', 'Only text page', '   ', '\n\n'])).toEqual(['Only text page']);
    expect(pdfTextToParagraphs(['First', '', '', 'Last'])).toEqual(['First', '', 'Last']);
  });

  test('gives nothing for a PDF without text', () => {
    expect(pdfTextToParagraphs([])).toEqual([]);
    expect(pdfTextToParagraphs(['', '   ', ' \n '])).toEqual([]);
    expect(pdfTextToParagraphs([CONTROL_CHARACTERS])).toEqual([]);
  });

  test('removes characters that XML cannot carry', () => {
    const [paragraph] = pdfTextToParagraphs([
      `of${CONTROL_CHARACTERS}fice ${NON_CHARACTERS}end${LONE_SURROGATE}`,
    ]);

    // Vertical tab and form feed are white space; the rest disappears.
    expect(paragraph).toBe('of fice end');
    expect(paragraph).toMatch(XML_ONLY);
  });

  test('keeps everything else: accents, other scripts, emoji, markup characters', () => {
    const text = 'Grüße & <b>"Zitat"</b> 你好 Привет 😀 naïve';

    expect(pdfTextToParagraphs([text])).toEqual([text]);
  });
});

test.describe('pdfTextToDocx', () => {
  test('writes a Word document with the paragraphs of the PDF', async () => {
    const docx = await pdfTextToDocx(['First  page', 'Second page: a < b & c > d']);

    expect(docx).not.toBeNull();
    expect(docx!.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect((await readDocx(docx!)).paragraphs).toEqual(['First page', '', 'Second page: a < b & c > d']);
  });

  // A scanned PDF used to give a .docx with nothing in it and no explanation.
  test('gives null instead of an empty document when the PDF has no text', async () => {
    expect(await pdfTextToDocx([])).toBeNull();
    expect(await pdfTextToDocx(['', '   ', '\n'])).toBeNull();
  });

  // docx writes text into the XML as it is. A control character from a PDF
  // with an unusual font encoding made a file Word refuses to open.
  test('never writes a character that makes the document invalid XML', async () => {
    const docx = await pdfTextToDocx([
      `Total${CONTROL_CHARACTERS} due ${NON_CHARACTERS}${LONE_SURROGATE} 42 😀`,
    ]);
    const { xml, paragraphs } = await readDocx(docx!);

    expect(xml).toMatch(XML_ONLY);
    expect(paragraphs).toEqual(['Total due 42 😀']);
  });
});
