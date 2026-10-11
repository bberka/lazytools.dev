/**
 * What the document export tools (Markdown and HTML to PDF) have in common:
 * the paper sizes they offer, the size a page is previewed at on screen, and
 * escaping for text that is placed into an exported HTML document.
 */

/** Portrait paper sizes in millimetres, as `[width, height]`. */
export const PAGE_FORMATS_MM = {
  A4: [210, 297],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
} as const satisfies Record<string, readonly [number, number]>;

export type PageFormatName = keyof typeof PAGE_FORMATS_MM;
export type PageOrientation = 'portrait' | 'landscape';

// CSS pixels to a millimetre at 96 dpi.
const PX_PER_MM = 3.78;

/**
 * Size in CSS pixels of the sheet a page is previewed on: as wide as the
 * paper, and at least as tall as one page of it.
 */
export function previewPageSize(
  format: PageFormatName,
  orientation: PageOrientation
): { width: number; minHeight: number } {
  const [shortSide, longSide] = PAGE_FORMATS_MM[format];
  const pageWidth = orientation === 'portrait' ? shortSide : longSide;
  const pageHeight = orientation === 'portrait' ? longSide : shortSide;
  const width = Math.round(pageWidth * PX_PER_MM);

  return { width, minHeight: Math.round((pageHeight / pageWidth) * width) };
}

/**
 * Makes text safe to place in HTML, as element content or inside a quoted
 * attribute. A document title or file name written into a template without
 * this can close the element it sits in.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
