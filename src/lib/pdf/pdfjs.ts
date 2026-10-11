/**
 * The pdfjs runtime and its worker. Internal to `@/lib/pdf`: reach it only
 * through `import()`, so that pdfjs loads on first use and so that code which
 * runs without a bundler (the unit tests) never evaluates `import.meta.url`.
 */
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Parses PDF bytes with pdfjs, using the worker that ships with the app.
 *
 * `new URL(<literal>, import.meta.url)` is the bundler's asset syntax: the
 * worker file is copied into the build output and the expression becomes its
 * same-origin URL, so nothing is fetched from a CDN at runtime. The library and
 * the worker must come from the same pdfjs build; both are the legacy build,
 * which supports the widest range of browsers and desktop webviews.
 */
export function loadDocument(data: Uint8Array): Promise<PDFDocumentProxy> {
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }

  return getDocument({ data }).promise;
}
