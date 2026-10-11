/**
 * PDF to Image logic that does not need a canvas: the scale a page is drawn
 * at, and the wording for pages that could not be drawn.
 */

/** Zoom factor for a page: two canvas pixels per PDF point, 144 dpi. */
export const RENDER_SCALE = 2;

/**
 * A canvas area that works in every current browser (4096 x 4096). It is the
 * documented limit of Safari on iOS, where a larger canvas stays empty.
 */
export const MAX_CANVAS_PIXELS = 4096 * 4096;

/**
 * The largest scale, up to `preferred`, at which a page of `width` x `height`
 * PDF points still fits a canvas of `MAX_CANVAS_PIXELS`. Ordinary pages get
 * `preferred`; posters and plans get less.
 */
export function pageRenderScale(width: number, height: number, preferred = RENDER_SCALE): number {
  const area = width * height;
  if (!(area > 0) || area * preferred * preferred <= MAX_CANVAS_PIXELS) return preferred;
  return Math.sqrt(MAX_CANVAS_PIXELS / area);
}

/** Collapses sorted page numbers into ranges: [1, 2, 3, 7] reads "1-3, 7". */
function formatPageList(pageNumbers: readonly number[]): string {
  const ranges: string[] = [];

  for (let index = 0; index < pageNumbers.length; index++) {
    const start = pageNumbers[index];
    while (pageNumbers[index + 1] === pageNumbers[index] + 1) index++;
    const end = pageNumbers[index];
    ranges.push(start === end ? String(start) : `${start}-${end}`);
  }

  return ranges.join(', ');
}

/**
 * The sentence shown when pages could not be turned into images, or '' when
 * every page worked. `failedPages` holds 1-based page numbers in page order.
 */
export function describeFailedPages(failedPages: readonly number[], pageCount: number): string {
  if (failedPages.length === 0) return '';
  if (failedPages.length >= pageCount) {
    return pageCount === 1
      ? 'The page could not be rendered. The browser may be out of memory for images.'
      : 'None of the pages could be rendered. The browser may be out of memory for images.';
  }

  const label = failedPages.length === 1 ? 'Page' : 'Pages';
  return `${label} ${formatPageList(failedPages)} could not be rendered and ${
    failedPages.length === 1 ? 'is' : 'are'
  } missing below.`;
}
