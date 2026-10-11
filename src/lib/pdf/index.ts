/**
 * PDF documents for the browser-side tools.
 *
 * Reading goes through pdfjs-dist, which `openPdf` loads on first use together
 * with a worker that ships with the app (see `./pdfjs`). Tools ask for pages,
 * text and Blobs; the pdfjs import, the worker, viewports and typed-array casts
 * stay in here.
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export const PDF_MIME_TYPE = 'application/pdf';

/** True when the browser reports the file as a PDF. */
export function isPdfFile<T extends { readonly type: string }>(
  file: T | null | undefined
): file is T {
  return file?.type === PDF_MIME_TYPE;
}

/** Wraps saved PDF bytes (for example the result of pdf-lib's `save()`) in a Blob. */
export function pdfBlob(bytes: Uint8Array): Blob {
  // Typed arrays are generic over their buffer; a Blob part must not be shared memory.
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: PDF_MIME_TYPE });
}

/**
 * Parses a 1-based page list such as "1-3, 5" into sorted, de-duplicated
 * zero-based page indices. Pages outside 1..pageCount and entries that are not
 * whole numbers are ignored, so a range that matches nothing yields [].
 */
export function parsePageRange(range: string, pageCount: number): number[] {
  const indices = new Set<number>();

  for (const part of range.split(',')) {
    const entry = part.trim();

    if (entry.includes('-')) {
      const [start, end] = entry.split('-').map(Number);
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      for (let page = Math.max(start, 1); page <= Math.min(end, pageCount); page++) {
        indices.add(page - 1);
      }
    } else {
      const page = Number(entry);
      if (Number.isInteger(page) && page > 0 && page <= pageCount) indices.add(page - 1);
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

/** A run of text as pdfjs reports it. Marked-content markers carry no `str`. */
export interface PdfTextRun {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
}

/**
 * How the text runs of a page are joined:
 * - `flow`: every run separated by one space, without line breaks.
 * - `lines`: runs grouped into lines by their vertical position.
 */
export type PdfTextLayout = 'flow' | 'lines';

/** Joins the text runs of one page. This is the pure half of text extraction. */
export function layoutPdfText(runs: readonly PdfTextRun[], layout: PdfTextLayout): string {
  if (layout === 'flow') {
    return runs.map((run) => run.str ?? '').join(' ');
  }

  const lines: string[] = [];
  let currentLine = '';
  let lastY: number | null = null;

  for (const run of runs) {
    const value = run.str?.trim();
    if (!value) continue;

    const y = Math.round(run.transform?.[5] ?? 0);

    if (lastY !== null && Math.abs(y - lastY) > 2 && currentLine.trim()) {
      lines.push(currentLine.trim());
      currentLine = '';
    }

    currentLine += `${value} `;

    if (run.hasEOL) {
      lines.push(currentLine.trim());
      currentLine = '';
    }

    lastY = y;
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines.join('\n');
}

export type PdfSource = Blob | ArrayBuffer | Uint8Array;

export interface PdfRenderOptions {
  /** Zoom factor; 1 draws one canvas pixel per PDF point. Defaults to 1. */
  scale?: number;
  /** Extra clockwise rotation in degrees, added to the page's own rotation. */
  rotation?: number;
  /** Canvas to draw on; it is resized to fit. A new canvas is created when omitted. */
  canvas?: HTMLCanvasElement;
}

export interface PdfRenderedPage {
  canvas: HTMLCanvasElement;
  /** Exact (unrounded) size the page was drawn at, in canvas pixels. */
  width: number;
  height: number;
}

export interface PdfPage {
  /** 1-based page number. */
  readonly pageNumber: number;
  /** Page size in PDF points: the size at scale 1 with the page's own rotation. */
  readonly width: number;
  readonly height: number;
  /** Draws the page. Resolves to null when the canvas has no 2D context. */
  render(options?: PdfRenderOptions): Promise<PdfRenderedPage | null>;
  /** The text of this page. */
  text(layout: PdfTextLayout): Promise<string>;
}

export interface OpenedPdf {
  readonly pageCount: number;
  /** Loads a page by its 1-based number. */
  page(pageNumber: number): Promise<PdfPage>;
  /** The text of every page in order, one string per page. */
  text(layout: PdfTextLayout): Promise<string[]>;
  /** Releases the document and its worker. Never rejects; safe to call twice. */
  destroy(): Promise<void>;
}

async function toBytes(source: PdfSource): Promise<Uint8Array> {
  if (source instanceof Blob) {
    return new Uint8Array(await source.arrayBuffer());
  }
  // pdfjs transfers the buffer to its worker, so hand it a copy of the caller's bytes.
  return source instanceof Uint8Array ? source.slice() : new Uint8Array(source.slice(0));
}

function wrapPage(proxy: PDFPageProxy): PdfPage {
  const { width, height } = proxy.getViewport({ scale: 1 });

  return {
    pageNumber: proxy.pageNumber,
    width,
    height,

    async render({ scale = 1, rotation, canvas = document.createElement('canvas') } = {}) {
      const viewport = proxy.getViewport(
        rotation === undefined ? { scale } : { scale, rotation: (proxy.rotate + rotation) % 360 }
      );

      const canvasContext = canvas.getContext('2d');
      if (!canvasContext) return null;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await proxy.render({ canvasContext, canvas, viewport }).promise;

      return { canvas, width: viewport.width, height: viewport.height };
    },

    async text(layout) {
      const content = await proxy.getTextContent();
      // Marked-content markers have no text; they count as empty runs.
      const runs = content.items.map((item): PdfTextRun => ('str' in item ? item : {}));
      return layoutPdfText(runs, layout);
    },
  };
}

function wrapDocument(proxy: PDFDocumentProxy): OpenedPdf {
  const page = async (pageNumber: number) => wrapPage(await proxy.getPage(pageNumber));

  return {
    pageCount: proxy.numPages,
    page,

    async text(layout) {
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= proxy.numPages; pageNumber++) {
        pages.push(await (await page(pageNumber)).text(layout));
      }
      return pages;
    },

    async destroy() {
      try {
        await proxy.loadingTask.destroy();
      } catch {
        // Cleanup is best-effort; there is nothing a caller could do about a failure.
      }
    },
  };
}

/** Opens a PDF for rendering and text extraction. Browser only. */
export async function openPdf(source: PdfSource): Promise<OpenedPdf> {
  // pdfjs and its worker setup sit behind import() so they load on first use only.
  const { loadDocument } = await import('./pdfjs');
  return wrapDocument(await loadDocument(await toBytes(source)));
}
