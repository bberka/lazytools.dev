/**
 * PDF Editor export: writes the pages the user kept, in their new order and
 * rotation, with the annotations of each page laid over it.
 *
 * The annotations themselves are drawn by the caller, on a canvas, and arrive
 * here as a PNG per page; this module needs no browser.
 */
import { PDFDocument, degrees, type PDFPage } from 'pdf-lib';
import {
  PdfToolError,
  loadPdf,
  pageFrame,
  quarterTurn,
  toPageSpace,
  uprightSize,
  type PdfData,
  type Size,
} from './pdf-page-ops';

export interface EditedPage {
  /** Zero-based index of the page in the source document. */
  sourceIndex: number;
  /** Clockwise turn in degrees (a multiple of 90), added to the page's own rotation. */
  rotation: number;
}

/**
 * Supplies the annotation layer of one output page as a PNG (bytes or a
 * `data:` URL) covering the whole page, or null when the page has none.
 * `size` is the page as the viewer shows it, in points, after rotation; the
 * picture has to be drawn upright in that shape.
 */
export type OverlayPainter = (
  pageIndex: number,
  size: Size
) => string | Uint8Array | ArrayBuffer | null | Promise<string | Uint8Array | ArrayBuffer | null>;

/**
 * Copies the source pages into `target`. Pages are copied in one call, so
 * fonts and images they share are written once; copying page by page writes
 * them again for every page. A page that is asked for twice gets a copy of
 * its own, since one page object cannot sit in a document twice.
 */
async function copyPages(
  target: PDFDocument,
  source: PDFDocument,
  indices: readonly number[]
): Promise<PDFPage[]> {
  const unique = Array.from(new Set(indices));
  const copies = await target.copyPages(source, unique);
  const unused = new Map(unique.map((index, position) => [index, copies[position]]));
  const pages: PDFPage[] = [];

  for (const index of indices) {
    let page = unused.get(index);
    if (page) unused.delete(index);
    else [page] = await target.copyPages(source, [index]);
    pages.push(page);
  }

  return pages;
}

/** Builds the edited document. `paintOverlay` is asked once per page, in output order. */
export async function buildEditedPdf(
  source: PdfData,
  pages: readonly EditedPage[],
  paintOverlay?: OverlayPainter
): Promise<Uint8Array> {
  // Saving a document without pages would produce a single blank page.
  if (pages.length === 0) throw new PdfToolError('There are no pages left to export.');

  const sourcePdf = await loadPdf(source);
  const pageCount = sourcePdf.getPageCount();
  if (pages.some(({ sourceIndex }) => !(sourceIndex >= 0 && sourceIndex < pageCount))) {
    throw new PdfToolError('The page list no longer matches this PDF. Load the file again.');
  }

  const edited = await PDFDocument.create();
  const copies = await copyPages(
    edited,
    sourcePdf,
    pages.map((page) => page.sourceIndex)
  );

  for (let index = 0; index < pages.length; index++) {
    const page = edited.addPage(copies[index]);
    page.setRotation(degrees(quarterTurn(page.getRotation().angle + pages[index].rotation)));

    const frame = pageFrame(page);
    const size = uprightSize(frame);
    const overlay = await paintOverlay?.(index, size);
    if (!overlay) continue;

    // The picture is upright on screen; on a turned page it is laid down turned back.
    const image = await edited.embedPng(overlay);
    const origin = toPageSpace(frame, { x: 0, y: 0, rotation: 0 });
    page.drawImage(image, {
      x: origin.x,
      y: origin.y,
      width: size.width,
      height: size.height,
      rotate: degrees(origin.rotation),
    });
  }

  return edited.save();
}
