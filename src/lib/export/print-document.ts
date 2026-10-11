// Print export: hand a complete HTML document to the browser's print dialog,
// from which it can be saved as a PDF whose text stays selectable.

// The frame of the print job in progress, so that a new job can replace it.
let activeFrame: HTMLIFrameElement | null = null;

// How long the frame is kept after the print dialog closes.
const CLEANUP_DELAY_MS = 500;
// When to clean up anyway, for browsers that never report the dialog closing.
const AFTERPRINT_FALLBACK_MS = 5000;

/**
 * Opens the print dialog for `html`, a full document including its
 * `<!DOCTYPE>`. The document is written into a hidden iframe, so only it is
 * printed and the page around the tool is left out.
 *
 * `title` replaces the page title while the dialog is open, because browsers
 * suggest it as the file name when the user saves as PDF.
 */
export function printHtmlDocument(html: string, title: string): void {
  activeFrame?.remove();

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  iframe.onload = () => {
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      return;
    }

    const originalTitle = document.title;
    document.title = title;

    frameWindow.focus();
    frameWindow.print();

    const cleanup = () => {
      setTimeout(() => {
        document.title = originalTitle;
        iframe.remove();
        if (activeFrame === iframe) {
          activeFrame = null;
        }
      }, CLEANUP_DELAY_MS);
    };

    frameWindow.onafterprint = cleanup;
    setTimeout(cleanup, AFTERPRINT_FALLBACK_MS);
  };

  document.body.appendChild(iframe);
  activeFrame = iframe;

  const frameDocument = iframe.contentDocument;
  if (!frameDocument) {
    return;
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
}
