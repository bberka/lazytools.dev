import { test, expect } from '@playwright/test';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  PdfToolError,
  describePdfFailure,
  extractPdfPages,
  formatPageList,
  loadPdf,
  mergePdfs,
  noPagesMessage,
  pageFrame,
  quarterTurn,
  toPageSpace,
  uprightSize,
  type PageFrame,
} from '@/lib/tools/pdf-page-ops';
import { createEncryptedPdf, createPdf, createPdfWithPages, pageSizes } from './pdf-edit-fixtures';

const notAPdf = new TextEncoder().encode('just some text');

test.describe('loadPdf', () => {
  test('opens bytes, buffers and files', async () => {
    const bytes = await createPdf([
      [200, 300],
      [400, 500],
    ]);

    expect((await loadPdf(bytes)).getPageCount()).toBe(2);
    expect((await loadPdf(bytes.slice().buffer)).getPageCount()).toBe(2);
    expect((await loadPdf(new File([bytes.slice()], 'a.pdf'))).getPageCount()).toBe(2);
  });

  test('says in plain words that a document is protected', async () => {
    const failure = await loadPdf(await createEncryptedPdf()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PdfToolError);
    expect((failure as Error).message).toBe(
      'This PDF is password-protected or encrypted. Remove the protection and try again.'
    );
    // pdf-lib's own wording is advice for developers and must not reach the user.
    expect((failure as Error).message).not.toContain('ignoreEncryption');
  });

  test('says in plain words that a file is not a PDF', async () => {
    for (const data of [notAPdf, new Uint8Array(0)]) {
      const failure = await loadPdf(data).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(PdfToolError);
      expect((failure as Error).message).toBe(
        'This file could not be read as a PDF. It may be damaged or not a PDF at all.'
      );
    }
  });

  test('names the file when it is given a name', async () => {
    await expect(loadPdf(notAPdf, 'notes.pdf')).rejects.toThrow(
      '"notes.pdf" could not be read as a PDF.'
    );
    await expect(loadPdf(await createEncryptedPdf(), 'locked.pdf')).rejects.toThrow(
      '"locked.pdf" is password-protected or encrypted.'
    );
  });
});

test.describe('describePdfFailure', () => {
  test('shows a PdfToolError as it is and prefixes anything else', () => {
    expect(describePdfFailure(new PdfToolError('No pages match "9".'), 'Failed to split PDF')).toBe(
      'No pages match "9".'
    );
    expect(describePdfFailure(new Error('disk gone'), 'Failed to split PDF')).toBe(
      'Failed to split PDF: disk gone'
    );
    expect(describePdfFailure('odd', 'Failed to split PDF')).toBe('Failed to split PDF: odd');
    expect(describePdfFailure(new Error(''), 'Failed to split PDF')).toBe('Failed to split PDF');
  });
});

test.describe('mergePdfs', () => {
  test('joins the documents in the given order', async () => {
    const first = await createPdf([
      [100, 100],
      [110, 110],
    ]);
    const second = await createPdf([[200, 200]]);

    const merged = await mergePdfs([
      { name: 'second.pdf', data: second },
      { name: 'first.pdf', data: new File([first.slice()], 'first.pdf') },
      { name: 'second.pdf', data: second },
    ]);

    expect(merged.pageCount).toBe(4);
    expect(await pageSizes(merged.bytes)).toEqual([
      [200, 200],
      [100, 100],
      [110, 110],
      [200, 200],
    ]);
  });

  test('names the document that cannot be read', async () => {
    const good = await createPdf([[100, 100]]);

    await expect(
      mergePdfs([
        { name: 'good.pdf', data: good },
        { name: 'locked.pdf', data: await createEncryptedPdf() },
      ])
    ).rejects.toThrow('"locked.pdf" is password-protected or encrypted.');

    await expect(
      mergePdfs([
        { name: 'broken.pdf', data: notAPdf },
        { name: 'good.pdf', data: good },
      ])
    ).rejects.toThrow('"broken.pdf" could not be read as a PDF.');
  });

  test('refuses an empty list instead of writing a blank page', async () => {
    await expect(mergePdfs([])).rejects.toBeInstanceOf(PdfToolError);
  });
});

test.describe('formatPageList', () => {
  test('collapses runs of pages into ranges', () => {
    expect(formatPageList([1, 2, 3, 5])).toBe('1-3, 5');
    expect(formatPageList([4])).toBe('4');
    expect(formatPageList([1, 3, 5])).toBe('1, 3, 5');
    expect(formatPageList([2, 3, 7, 8, 9])).toBe('2-3, 7-9');
    expect(formatPageList([])).toBe('');
  });
});

test.describe('extractPdfPages', () => {
  const sizes: Array<[number, number]> = [
    [100, 100],
    [200, 200],
    [300, 300],
    [400, 400],
  ];

  test('copies the listed pages in document order', async () => {
    const extracted = await extractPdfPages(await createPdf(sizes), '4, 1-2');

    expect(extracted.pages).toEqual([1, 2, 4]);
    expect(await pageSizes(extracted.bytes)).toEqual([sizes[0], sizes[1], sizes[3]]);
  });

  test('reports the pages it copied when part of the list is outside the document', async () => {
    const extracted = await extractPdfPages(await createPdf(sizes), '3-9, 5x, 99');

    expect(extracted.pages).toEqual([3, 4]);
    expect(await pageSizes(extracted.bytes)).toEqual([sizes[2], sizes[3]]);
  });

  test('refuses a list that selects nothing instead of writing a blank page', async () => {
    const source = await createPdf(sizes);

    // Before the fix each of these produced a one-page blank PDF named after the file.
    for (const range of ['8-12', '0', 'abc', '3-1', '4-', '1–3', '', '   ']) {
      const failure = await extractPdfPages(source, range).catch((error: unknown) => error);
      expect(failure, `range "${range}"`).toBeInstanceOf(PdfToolError);
    }

    await expect(extractPdfPages(source, '8-12')).rejects.toThrow(
      'No pages match "8-12". This PDF has pages 1 to 4.'
    );
  });

  test('reports a protected document in plain words', async () => {
    await expect(extractPdfPages(await createEncryptedPdf(), '1')).rejects.toThrow(
      'This PDF is password-protected or encrypted.'
    );
  });
});

test.describe('noPagesMessage', () => {
  test('names the list and the pages that exist', () => {
    expect(noPagesMessage(' 7 ', 3)).toBe('No pages match "7". This PDF has pages 1 to 3.');
    expect(noPagesMessage('2', 1)).toBe('No pages match "2". This PDF has only page 1.');
    expect(noPagesMessage('  ', 3)).toBe('No pages were selected. This PDF has pages 1 to 3.');
  });
});

test.describe('quarterTurn', () => {
  test('brings rotations into 0, 90, 180 and 270', () => {
    expect(quarterTurn(0)).toBe(0);
    expect(quarterTurn(90)).toBe(90);
    expect(quarterTurn(450)).toBe(90);
    expect(quarterTurn(-90)).toBe(270);
    expect(quarterTurn(360)).toBe(0);
    expect(quarterTurn(540)).toBe(180);
  });

  test('counts anything that is not a quarter turn as upright', () => {
    expect(quarterTurn(45)).toBe(0);
    expect(quarterTurn(Number.NaN)).toBe(0);
  });
});

test.describe('pageFrame', () => {
  async function frameOf(
    setup: Parameters<typeof createPdfWithPages>[0][number]
  ): Promise<PageFrame> {
    const doc = await PDFDocument.load(await createPdfWithPages([setup]));
    return pageFrame(doc.getPage(0));
  }

  test('is the whole page for a plain page', async () => {
    expect(await frameOf({ size: [612, 792] })).toEqual({
      x: 0,
      y: 0,
      width: 612,
      height: 792,
      rotation: 0,
    });
  });

  test('follows the crop box and the rotation', async () => {
    expect(await frameOf({ size: [612, 792], crop: [50, 60, 400, 500], rotate: 270 })).toEqual({
      x: 50,
      y: 60,
      width: 400,
      height: 500,
      rotation: 270,
    });
  });

  test('starts where the media box starts', async () => {
    expect(await frameOf({ size: [612, 792], media: [-30, 40, 500, 600] })).toMatchObject({
      x: -30,
      y: 40,
      width: 500,
      height: 600,
    });
  });

  test('clips a crop box that reaches past the page', async () => {
    expect(await frameOf({ size: [600, 800], crop: [500, 700, 300, 300] })).toMatchObject({
      x: 500,
      y: 700,
      width: 100,
      height: 100,
    });
  });

  test('ignores a crop box that misses the page', async () => {
    expect(await frameOf({ size: [600, 800], crop: [900, 900, 100, 100] })).toMatchObject({
      x: 0,
      y: 0,
      width: 600,
      height: 800,
    });
  });

  test('reads a box whose corners are given in reverse', async () => {
    expect(await frameOf({ size: [600, 800], media: [600, 800, -600, -800] })).toMatchObject({
      x: 0,
      y: 0,
      width: 600,
      height: 800,
    });
  });

  test('reads a rotation that is not normalized', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);

    page.setRotation(degrees(-90));
    expect(pageFrame(page).rotation).toBe(270);
    page.setRotation(degrees(810));
    expect(pageFrame(page).rotation).toBe(90);
  });
});

test.describe('uprightSize', () => {
  const frame = (rotation: PageFrame['rotation']): PageFrame => ({
    x: 0,
    y: 0,
    width: 600,
    height: 800,
    rotation,
  });

  test('swaps the sides of a page that lies sideways', () => {
    expect(uprightSize(frame(0))).toEqual({ width: 600, height: 800 });
    expect(uprightSize(frame(180))).toEqual({ width: 600, height: 800 });
    expect(uprightSize(frame(90))).toEqual({ width: 800, height: 600 });
    expect(uprightSize(frame(270))).toEqual({ width: 800, height: 600 });
  });
});

test.describe('toPageSpace', () => {
  const frame = (rotation: PageFrame['rotation'], x = 0, y = 0): PageFrame => ({
    x,
    y,
    width: 600,
    height: 800,
    rotation,
  });

  test('leaves an upright page at the origin alone', () => {
    expect(toPageSpace(frame(0), { x: 20, y: 30, rotation: 15 })).toEqual({
      x: 20,
      y: 30,
      rotation: 15,
    });
  });

  test('puts the lower-left corner of the shown page on the right corner of a turned page', () => {
    // A viewer turns the page clockwise by its rotation, so the corner that
    // ends up lower-left on screen is a different corner of the page each time.
    expect(toPageSpace(frame(90), { x: 0, y: 0, rotation: 0 })).toEqual({
      x: 600,
      y: 0,
      rotation: 90,
    });
    expect(toPageSpace(frame(180), { x: 0, y: 0, rotation: 0 })).toEqual({
      x: 600,
      y: 800,
      rotation: 180,
    });
    expect(toPageSpace(frame(270), { x: 0, y: 0, rotation: 0 })).toEqual({
      x: 0,
      y: 800,
      rotation: 270,
    });
  });

  test('maps a point and its direction on a page turned by 90 degrees', () => {
    // Shown 800 wide and 600 high. 20 right and 30 up from the shown corner
    // is 30 left of the page's right edge and 20 above its bottom edge.
    expect(toPageSpace(frame(90), { x: 20, y: 30, rotation: -45 })).toEqual({
      x: 570,
      y: 20,
      rotation: 45,
    });
  });

  test('maps a point on pages turned by 180 and 270 degrees', () => {
    expect(toPageSpace(frame(180), { x: 20, y: 30, rotation: 0 })).toMatchObject({
      x: 580,
      y: 770,
    });
    expect(toPageSpace(frame(270), { x: 20, y: 30, rotation: 0 })).toMatchObject({ x: 30, y: 780 });
  });

  test('adds the corner of the visible box', () => {
    expect(toPageSpace(frame(0, 50, -60), { x: 20, y: 30, rotation: 0 })).toMatchObject({
      x: 70,
      y: -30,
    });
    expect(toPageSpace(frame(90, 50, -60), { x: 20, y: 30, rotation: 0 })).toMatchObject({
      x: 620,
      y: -40,
    });
  });

  test('keeps the angle within 0 to 359', () => {
    expect(toPageSpace(frame(270), { x: 0, y: 0, rotation: 135 }).rotation).toBe(45);
    expect(toPageSpace(frame(0), { x: 0, y: 0, rotation: -45 }).rotation).toBe(315);
  });
});
