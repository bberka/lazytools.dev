// Snapshot PDF export: photograph a rendered element with html2canvas and lay
// the picture out over as many jsPDF pages as it needs. The text in the result
// is not selectable, but the pages look exactly like the preview.
//
// Both libraries are loaded on first use, so importing this file is cheap.

export interface SnapshotPdfOptions {
  /** Name of the saved file, including the `.pdf` extension. */
  fileName: string;
  /** Portrait page size in millimetres, as `[width, height]`. */
  pageFormat: readonly [number, number];
  orientation: 'portrait' | 'landscape';
  /** Blank border on every side of each page, in millimetres. */
  marginMm: number;
  /** Capture resolution multiplier; higher is sharper and slower. */
  scale: number;
  /** CSS colour painted behind the capture and behind each page. */
  backgroundColor: string;
  /** Title stored in the PDF's metadata. Leave out to store none. */
  title?: string;
  /** Print "Page n of m" centred in the bottom margin. */
  pageNumbers?: boolean;
  /** Picks a page-number grey that stays readable on the background. */
  theme?: 'light' | 'dark';
  /** Called with a short status message as each stage begins. */
  onProgress?: (message: string) => void;
}

export interface PageSlice {
  /** Pixel row of the capture at which the slice starts. */
  sourceY: number;
  /** Height of the slice in capture pixels. */
  height: number;
}

/**
 * Cuts a capture `captureHeight` pixels tall into consecutive slices of at
 * most `pageHeight` pixels, one per PDF page, top to bottom.
 */
export function planPageSlices(captureHeight: number, pageHeight: number): PageSlice[] {
  const slices: PageSlice[] = [];
  // A page with no usable height can never consume the capture.
  if (!(pageHeight > 0)) return slices;

  let sourceY = 0;
  while (sourceY < captureHeight) {
    const height = Math.min(pageHeight, captureHeight - sourceY);
    slices.push({ sourceY, height });
    sourceY += height;
  }

  return slices;
}

// Long enough for the caller to paint a status message before the main
// thread is taken up by the next stage.
const PAINT_DELAY_MS = 50;

/**
 * Captures `element` as it is currently rendered and saves it as a paginated
 * PDF. Rejects if the capture or the PDF cannot be produced; reporting that
 * to the user is left to the caller.
 */
export async function saveSnapshotPdf(
  element: HTMLElement,
  options: SnapshotPdfOptions
): Promise<void> {
  const {
    fileName,
    pageFormat,
    orientation,
    marginMm,
    scale,
    backgroundColor,
    title,
    pageNumbers = false,
    theme = 'light',
    onProgress,
  } = options;

  const report = async (message: string) => {
    if (!onProgress) return;
    onProgress(message);
    await new Promise((resolve) => setTimeout(resolve, PAINT_DELAY_MS));
  };

  await report('Capturing preview...');

  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  await report('Generating PDF...');

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [...pageFormat],
  });

  if (title !== undefined) {
    pdf.setProperties({ title });
  }

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pdfWidth - marginMm * 2;
  const usableHeight = pdfHeight - marginMm * 2;
  const pageHeightInImage = (usableHeight * canvas.width) / usableWidth;

  planPageSlices(canvas.height, pageHeightInImage).forEach((slice, index) => {
    if (index > 0) {
      pdf.addPage();
    }

    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = slice.height;
    const context = pageCanvas.getContext('2d');

    if (context) {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(
        canvas,
        0,
        slice.sourceY,
        canvas.width,
        slice.height,
        0,
        0,
        canvas.width,
        slice.height
      );
    }

    const sliceData = pageCanvas.toDataURL('image/png');
    const slicePdfHeight = (slice.height * usableWidth) / canvas.width;
    pdf.addImage(sliceData, 'PNG', marginMm, marginMm, usableWidth, slicePdfHeight);
  });

  if (pageNumbers) {
    const totalPages = pdf.getNumberOfPages();
    for (let page = 1; page <= totalPages; page++) {
      pdf.setPage(page);
      pdf.setFontSize(9);
      pdf.setTextColor(theme === 'dark' ? 180 : 90);
      pdf.text(`Page ${page} of ${totalPages}`, pdfWidth / 2, pdfHeight - 6, {
        align: 'center',
      });
    }
  }

  await report('Saving file...');
  pdf.save(fileName);
}
