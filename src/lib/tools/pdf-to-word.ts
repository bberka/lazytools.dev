/**
 * PDF to Word logic: turns the text of each PDF page into the paragraphs of a
 * Word document and packs them into a .docx.
 *
 * The paragraph step is pure. The docx library is loaded on first use and
 * runs in Node as well as in the browser.
 */

// Whitespace that is not a line break. A PDF stores many spaces as runs of
// their own, so joined page text is full of doubled and tripled spaces.
const SPACES = /[ \t\f\v]+/g;

// Everything XML 1.0 has no way to carry: control characters, the two
// non-characters at the end of the Basic Multilingual Plane, and half
// surrogate pairs. The `u` flag makes a whole pair count as one character, so
// only unpaired halves fall outside the last range.
const NOT_XML = /[^\t\n\r\u{20}-\u{D7FF}\u{E000}-\u{FFFD}\u{10000}-\u{10FFFF}]/gu;

/**
 * The paragraphs of the Word document, from the text of each PDF page in
 * order. Every line of text is one paragraph, pages are an empty paragraph
 * apart, and pages without text (scans, pictures) are left out. Returns [] when
 * no page has any text.
 *
 * Characters that would make the document invalid XML are removed: PDFs with
 * unusual font encodings yield control characters, and Word refuses to open a
 * file that contains a single one.
 */
export function pdfTextToParagraphs(pages: readonly string[]): string[] {
  const paragraphs: string[] = [];

  for (const pageText of pages) {
    const lines = pageText
      .split(/\r\n?|\n/)
      .map((line) => line.replace(SPACES, ' ').replace(NOT_XML, '').replace(SPACES, ' ').trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    if (paragraphs.length > 0) paragraphs.push('');
    for (const line of lines) paragraphs.push(line);
  }

  return paragraphs;
}

/**
 * Builds the .docx for the text of a PDF, one string per page. Resolves to
 * null when the pages hold no text at all, which is what a scanned PDF gives.
 */
export async function pdfTextToDocx(pages: readonly string[]): Promise<Blob | null> {
  const paragraphs = pdfTextToParagraphs(pages);
  if (paragraphs.length === 0) return null;

  const { Document, Packer, Paragraph, TextRun } = await import('docx');

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs.map((text) => new Paragraph({ children: [new TextRun(text)] })),
      },
    ],
  });

  return Packer.toBlob(doc);
}
