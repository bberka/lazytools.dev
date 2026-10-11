/**
 * Page-level PDF work shared by the PDF editor tools (edit, merge, split,
 * compress, watermark): opening a document with pdf-lib, merging documents,
 * extracting pages, and the geometry of pages that are rotated or cropped.
 *
 * Bytes in, bytes out. Nothing here needs a browser, and every failure a user
 * can cause is a `PdfToolError` whose message can be shown as it is.
 */
import { PDFDocument, type PDFPage } from 'pdf-lib';
import { readFileAsArrayBuffer } from '@/lib/files';
import { parsePageRange } from '@/lib/pdf';

// ── Opening ───────────────────────────────────────────────────────────────────

/** A PDF: a picked file, or bytes that are already in memory. */
export type PdfData = Blob | ArrayBuffer | Uint8Array;

/** A failure whose message is written for the user and can be shown as it is. */
export class PdfToolError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PdfToolError';
  }
}

/**
 * The text to show for a failed operation: a `PdfToolError` speaks for
 * itself, anything else is reported as `summary` followed by its detail.
 */
export function describePdfFailure(error: unknown, summary: string): string {
  if (error instanceof PdfToolError) return error.message;
  const detail = error instanceof Error ? error.message : String(error);
  return detail ? `${summary}: ${detail}` : summary;
}

/**
 * Opens a PDF with pdf-lib. A protected or unreadable file is reported in
 * plain words; `name` puts the file's name into that message, for tools that
 * take several files.
 */
export async function loadPdf(data: PdfData, name?: string): Promise<PDFDocument> {
  const bytes = data instanceof Blob ? await readFileAsArrayBuffer(data) : data;

  try {
    return await PDFDocument.load(bytes);
  } catch (cause) {
    // pdf-lib's error classes do not survive `instanceof`, so go by the message.
    const encrypted = cause instanceof Error && /encrypted/i.test(cause.message);
    const subject = name ? `"${name}"` : encrypted ? 'This PDF' : 'This file';

    throw new PdfToolError(
      encrypted
        ? `${subject} is password-protected or encrypted. Remove the protection and try again.`
        : `${subject} could not be read as a PDF. It may be damaged or not a PDF at all.`,
      { cause }
    );
  }
}

// ── Merging and extracting ────────────────────────────────────────────────────

export interface NamedPdf {
  /** File name, used to say which document could not be read. */
  name: string;
  data: PdfData;
}

/** Joins the documents in the given order into one. */
export async function mergePdfs(
  files: readonly NamedPdf[]
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  // Saving a document without pages would produce a single blank page.
  if (files.length === 0) throw new PdfToolError('Add the PDF files to merge first.');

  const merged = await PDFDocument.create();

  for (const file of files) {
    const source = await loadPdf(file.data, file.name);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }

  return { bytes: await merged.save(), pageCount: merged.getPageCount() };
}

/** Collapses sorted page numbers into ranges: [1, 2, 3, 7] reads "1-3, 7". */
export function formatPageList(pageNumbers: readonly number[]): string {
  const ranges: string[] = [];

  for (let index = 0; index < pageNumbers.length; index++) {
    const start = pageNumbers[index];
    while (pageNumbers[index + 1] === pageNumbers[index] + 1) index++;
    const end = pageNumbers[index];
    ranges.push(start === end ? String(start) : `${start}-${end}`);
  }

  return ranges.join(', ');
}

/** The sentence for a page list that selects nothing in a document of `pageCount` pages. */
export function noPagesMessage(range: string, pageCount: number): string {
  const available = pageCount === 1 ? 'has only page 1' : `has pages 1 to ${pageCount}`;
  const asked = range.trim() ? `No pages match "${range.trim()}"` : 'No pages were selected';
  return `${asked}. This PDF ${available}.`;
}

/**
 * Copies the pages named by a 1-based list such as "1-3, 5" into a new
 * document, in document order. `pages` holds the page numbers that were
 * copied; entries of the list outside the document are left out of it.
 */
export async function extractPdfPages(
  data: PdfData,
  range: string
): Promise<{ bytes: Uint8Array; pages: number[] }> {
  const source = await loadPdf(data);
  const indices = parsePageRange(range, source.getPageCount());

  // Saving a document without pages would produce a single blank page.
  if (indices.length === 0) {
    throw new PdfToolError(noPagesMessage(range, source.getPageCount()));
  }

  const extracted = await PDFDocument.create();
  const pages = await extracted.copyPages(source, indices);
  pages.forEach((page) => extracted.addPage(page));

  return { bytes: await extracted.save(), pages: indices.map((index) => index + 1) };
}

// ── Page geometry ─────────────────────────────────────────────────────────────

export interface Size {
  width: number;
  height: number;
}

/**
 * The part of a page a viewer shows, and how it turns it.
 *
 * A page's own coordinates start at the lower-left corner of its media box,
 * which need not be (0, 0), and ignore `/Rotate`. Drawing that should end up
 * where the user saw it on screen has to go through `toPageSpace`.
 */
export interface PageFrame {
  /** Lower-left corner of the visible box, in the page's own coordinates. */
  x: number;
  y: number;
  /** Size of the visible box before the page is turned. */
  width: number;
  height: number;
  /** Clockwise turn a viewer applies when it shows the page. */
  rotation: 0 | 90 | 180 | 270;
}

/** A point on the page as it is shown, with a direction. */
export interface UprightPlacement {
  /** Points from the lower-left corner of the page as shown; y runs up. */
  x: number;
  y: number;
  /** Counter-clockwise angle in degrees, 0 pointing right on screen. */
  rotation: number;
}

/** Brings any angle into 0..359. */
function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** A page's `/Rotate` as a quarter turn. Anything that is not one counts as 0, as viewers do. */
export function quarterTurn(angle: number): PageFrame['rotation'] {
  const normalized = normalizeAngle(angle);
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A box given by two opposite corners in any order, as left, bottom, right, top. */
function edges(box: Box): [number, number, number, number] {
  return [
    Math.min(box.x, box.x + box.width),
    Math.min(box.y, box.y + box.height),
    Math.max(box.x, box.x + box.width),
    Math.max(box.y, box.y + box.height),
  ];
}

/** The frame of a pdf-lib page: its crop box clipped to its media box, and its rotation. */
export function pageFrame(page: PDFPage): PageFrame {
  const [mediaLeft, mediaBottom, mediaRight, mediaTop] = edges(page.getMediaBox());
  const [cropLeft, cropBottom, cropRight, cropTop] = edges(page.getCropBox());

  let left = Math.max(mediaLeft, cropLeft);
  let bottom = Math.max(mediaBottom, cropBottom);
  let right = Math.min(mediaRight, cropRight);
  let top = Math.min(mediaTop, cropTop);

  // A crop box that misses the page is ignored, as viewers do.
  if (!(right > left && top > bottom)) {
    [left, bottom, right, top] = [mediaLeft, mediaBottom, mediaRight, mediaTop];
  }

  return {
    x: left,
    y: bottom,
    width: right - left,
    height: top - bottom,
    rotation: quarterTurn(page.getRotation().angle),
  };
}

/** The size of the page as a viewer shows it: sideways pages swap width and height. */
export function uprightSize(frame: PageFrame): Size {
  return frame.rotation === 90 || frame.rotation === 270
    ? { width: frame.height, height: frame.width }
    : { width: frame.width, height: frame.height };
}

/**
 * Translates a placement on the page as shown into the page's own
 * coordinates, so that something drawn there with pdf-lib (text, or an image
 * with its lower-left corner at the point) appears where and how it was
 * placed, whatever the page's rotation and crop box.
 */
export function toPageSpace(frame: PageFrame, placement: UprightPlacement): UprightPlacement {
  const { width, height } = frame;
  let x = placement.x;
  let y = placement.y;

  if (frame.rotation === 90) {
    [x, y] = [width - placement.y, placement.x];
  } else if (frame.rotation === 180) {
    [x, y] = [width - placement.x, height - placement.y];
  } else if (frame.rotation === 270) {
    [x, y] = [placement.y, height - placement.x];
  }

  return {
    x: frame.x + x,
    y: frame.y + y,
    rotation: normalizeAngle(placement.rotation + frame.rotation),
  };
}
