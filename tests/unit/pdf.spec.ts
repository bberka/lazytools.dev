import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import {
  PDF_MIME_TYPE,
  isPdfFile,
  layoutPdfText,
  parsePageRange,
  pdfBlob,
  type PdfTextRun,
} from '@/lib/pdf';

test.describe('isPdfFile', () => {
  test('accepts files the browser reports as PDF', () => {
    expect(isPdfFile(new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' }))).toBe(true);
    expect(isPdfFile({ type: PDF_MIME_TYPE })).toBe(true);
  });

  test('rejects other types and missing files', () => {
    expect(isPdfFile(new File(['hello'], 'notes.txt', { type: 'text/plain' }))).toBe(false);
    expect(isPdfFile({ type: 'image/png' })).toBe(false);
    expect(isPdfFile(null)).toBe(false);
    expect(isPdfFile(undefined)).toBe(false);
  });

  test('goes by the reported type, not the file name', () => {
    expect(isPdfFile(new File(['%PDF-1.7'], 'report.pdf'))).toBe(false);
    expect(isPdfFile(new File(['hello'], 'notes.txt', { type: 'application/pdf' }))).toBe(true);
  });

  test('narrows a list of files when used as a filter', () => {
    const pdf = new File(['%PDF-1.7'], 'a.pdf', { type: 'application/pdf' });
    const png = new File(['png'], 'b.png', { type: 'image/png' });

    expect([pdf, png, pdf].filter(isPdfFile).map((file) => file.name)).toEqual(['a.pdf', 'a.pdf']);
  });
});

test.describe('pdfBlob', () => {
  test('keeps the bytes and marks them as a PDF', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const blob = pdfBlob(bytes);

    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(bytes.length);
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(Array.from(bytes));
  });

  test('copies only the viewed part of a larger buffer', async () => {
    const view = new Uint8Array([9, 9, 1, 2, 3, 9]).subarray(2, 5);

    expect(Array.from(new Uint8Array(await pdfBlob(view).arrayBuffer()))).toEqual([1, 2, 3]);
  });
});

test.describe('parsePageRange', () => {
  test('reads single pages and ranges as zero-based indices', () => {
    expect(parsePageRange('1-3, 5', 10)).toEqual([0, 1, 2, 4]);
    expect(parsePageRange('7', 10)).toEqual([6]);
    expect(parsePageRange('1-10', 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('sorts and removes duplicates', () => {
    expect(parsePageRange('5, 1-3, 2, 5', 10)).toEqual([0, 1, 2, 4]);
  });

  test('tolerates spaces around numbers and dashes', () => {
    expect(parsePageRange('  2 - 4 ,6 ', 10)).toEqual([1, 2, 3, 5]);
  });

  test('drops pages outside the document', () => {
    expect(parsePageRange('0, 3, 4, 99', 3)).toEqual([2]);
    expect(parsePageRange('2-50', 4)).toEqual([1, 2, 3]);
    expect(parsePageRange('8-12', 4)).toEqual([]);
  });

  test('treats an open start as page 1 and an open end as nothing', () => {
    expect(parsePageRange('-3', 10)).toEqual([0, 1, 2]);
    expect(parsePageRange('4-', 10)).toEqual([]);
  });

  test('ignores reversed ranges and entries that are not whole numbers', () => {
    expect(parsePageRange('5-2', 10)).toEqual([]);
    expect(parsePageRange('abc, , 1.5, 2.5-4, x-3, 2', 10)).toEqual([1]);
    expect(parsePageRange('', 10)).toEqual([]);
  });

  test('clamps a huge range to the document instead of walking it', () => {
    expect(parsePageRange('1-9999999999', 3)).toEqual([0, 1, 2]);
    expect(parsePageRange('1-Infinity', 3)).toEqual([]);
  });

  test('yields nothing for an empty document', () => {
    expect(parsePageRange('1-3', 0)).toEqual([]);
  });
});

test.describe('layoutPdfText', () => {
  const run = (str: string, y: number, hasEOL = false): PdfTextRun => ({
    str,
    hasEOL,
    transform: [1, 0, 0, 1, 0, y],
  });

  test('flow joins every run with one space and keeps empty runs', () => {
    const runs: PdfTextRun[] = [run('Hello', 700), run('', 700), {}, run('world', 680)];

    expect(layoutPdfText(runs, 'flow')).toBe('Hello   world');
    expect(layoutPdfText([], 'flow')).toBe('');
  });

  test('lines starts a new line when the baseline moves', () => {
    const runs = [run('John', 700), run('Doe', 700.4), run('Engineer', 680), run('Berlin', 660)];

    expect(layoutPdfText(runs, 'lines')).toBe('John Doe\nEngineer\nBerlin');
  });

  test('lines keeps runs within two points of each other together', () => {
    expect(layoutPdfText([run('x', 700), run('2', 702)], 'lines')).toBe('x 2');
    expect(layoutPdfText([run('x', 700), run('y', 703)], 'lines')).toBe('x\ny');
  });

  test('lines honours explicit end-of-line markers on the same baseline', () => {
    const runs = [run('Skills', 500, true), run('TypeScript', 500), run('React', 500, true)];

    expect(layoutPdfText(runs, 'lines')).toBe('Skills\nTypeScript React');
  });

  test('lines trims runs and skips blank and marker-only ones', () => {
    const runs: PdfTextRun[] = [run('  Summary ', 400), run('   ', 300), {}, run('Builder', 400)];

    expect(layoutPdfText(runs, 'lines')).toBe('Summary Builder');
    expect(layoutPdfText([], 'lines')).toBe('');
  });
});

test.describe('with pdf-lib documents', () => {
  const pageSizes: Array<[number, number]> = [
    [200, 300],
    [400, 500],
    [600, 700],
  ];

  async function createDocument() {
    const doc = await PDFDocument.create();
    pageSizes.forEach((size) => doc.addPage(size));
    return doc;
  }

  test('saved bytes survive the trip through a Blob', async () => {
    const blob = pdfBlob(await (await createDocument()).save());
    const reloaded = await PDFDocument.load(await blob.arrayBuffer());

    expect(blob.type).toBe('application/pdf');
    expect(reloaded.getPageCount()).toBe(3);
    expect(reloaded.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual(
      pageSizes
    );
  });

  test('a parsed page range selects the pages to copy', async () => {
    const source = await createDocument();
    const target = await PDFDocument.create();
    const indices = parsePageRange('3, 1, 9', source.getPageCount());

    (await target.copyPages(source, indices)).forEach((page) => target.addPage(page));
    const reloaded = await PDFDocument.load(await pdfBlob(await target.save()).arrayBuffer());

    expect(indices).toEqual([0, 2]);
    expect(reloaded.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([
      pageSizes[0],
      pageSizes[2],
    ]);
  });
});
