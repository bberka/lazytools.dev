import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { buildEditedPdf } from '@/lib/tools/pdf-editor';
import { PdfToolError } from '@/lib/tools/pdf-page-ops';
import {
  createEncryptedPdf,
  createJpeg,
  createPdf,
  createPdfWithPages,
  createPng,
  pageDrawings,
  pageSizes,
} from './pdf-edit-fixtures';

const sizes: Array<[number, number]> = [
  [100, 100],
  [200, 200],
  [300, 300],
];

async function rotations(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => page.getRotation().angle);
}

test.describe('buildEditedPdf', () => {
  test('writes the kept pages in their new order', async () => {
    const edited = await buildEditedPdf(await createPdf(sizes), [
      { sourceIndex: 2, rotation: 0 },
      { sourceIndex: 0, rotation: 0 },
    ]);

    expect(await pageSizes(edited)).toEqual([sizes[2], sizes[0]]);
  });

  test('adds the turn to the rotation a page already has', async () => {
    const source = await createPdfWithPages([
      { size: [100, 100] },
      { size: [200, 200], rotate: 90 },
      { size: [300, 300], rotate: 270 },
    ]);

    const edited = await buildEditedPdf(source, [
      { sourceIndex: 0, rotation: 90 },
      { sourceIndex: 1, rotation: 180 },
      { sourceIndex: 2, rotation: 90 },
    ]);

    expect(await rotations(edited)).toEqual([90, 270, 0]);
  });

  test('writes what the pages share once, not once per page', async () => {
    // Six pages showing the same 100 KB picture, as pages share fonts and logos.
    const doc = await PDFDocument.create();
    const picture = await doc.embedJpg(createJpeg(40, 40, 100_000));
    for (let index = 0; index < 6; index++) {
      doc.addPage([200, 200]).drawImage(picture, { x: 0, y: 0, width: 200, height: 200 });
    }
    const source = await doc.save();

    const edited = await buildEditedPdf(
      source,
      [5, 4, 3, 2, 1, 0].map((sourceIndex) => ({ sourceIndex, rotation: 0 }))
    );

    // Copying page by page wrote the picture six times: about 600 KB.
    expect(source.length).toBeGreaterThan(100_000);
    expect(edited.length).toBeLessThan(source.length * 1.5);
    expect((await pageSizes(edited)).length).toBe(6);
  });

  test('gives a page that is listed twice a copy of its own', async () => {
    const edited = await buildEditedPdf(await createPdf(sizes), [
      { sourceIndex: 1, rotation: 0 },
      { sourceIndex: 1, rotation: 90 },
      { sourceIndex: 0, rotation: 180 },
    ]);

    expect(await pageSizes(edited)).toEqual([sizes[1], sizes[1], sizes[0]]);
    expect(await rotations(edited)).toEqual([0, 90, 180]);
  });

  test('refuses an empty page list instead of writing a blank page', async () => {
    await expect(buildEditedPdf(await createPdf(sizes), [])).rejects.toBeInstanceOf(PdfToolError);
  });

  test('refuses pages the document does not have', async () => {
    const source = await createPdf(sizes);

    await expect(buildEditedPdf(source, [{ sourceIndex: 3, rotation: 0 }])).rejects.toBeInstanceOf(
      PdfToolError
    );
    await expect(buildEditedPdf(source, [{ sourceIndex: -1, rotation: 0 }])).rejects.toBeInstanceOf(
      PdfToolError
    );
  });

  test('reports a protected document in plain words', async () => {
    await expect(
      buildEditedPdf(await createEncryptedPdf(), [{ sourceIndex: 0, rotation: 0 }])
    ).rejects.toThrow('This PDF is password-protected or encrypted.');
  });
});

test.describe('buildEditedPdf annotations', () => {
  const overlay = createPng(4, 4);

  test('asks for one layer per page, in output order, in the shape the page is shown in', async () => {
    const source = await createPdfWithPages([
      { size: [600, 800] },
      { size: [300, 400], rotate: 90 },
      { size: [500, 700], crop: [50, 60, 400, 500] },
    ]);
    const asked: Array<[number, number, number]> = [];

    await buildEditedPdf(
      source,
      [
        { sourceIndex: 1, rotation: 0 },
        { sourceIndex: 0, rotation: 90 },
        { sourceIndex: 2, rotation: 0 },
        { sourceIndex: 0, rotation: 180 },
      ],
      (pageIndex, size) => {
        asked.push([pageIndex, size.width, size.height]);
        return null;
      }
    );

    expect(asked).toEqual([
      [0, 400, 300],
      [1, 800, 600],
      [2, 400, 500],
      [3, 600, 800],
    ]);
  });

  test('draws nothing on pages without a layer', async () => {
    const edited = await buildEditedPdf(
      await createPdf(sizes),
      sizes.map((_, sourceIndex) => ({ sourceIndex, rotation: 0 })),
      (pageIndex) => (pageIndex === 1 ? overlay : null)
    );

    expect((await pageDrawings(edited, 0)).images).toHaveLength(0);
    expect((await pageDrawings(edited, 1)).images).toHaveLength(1);
    expect((await pageDrawings(edited, 2)).images).toHaveLength(0);
  });

  test('accepts the layer as a data URL and from a promise', async () => {
    const dataUrl = `data:image/png;base64,${Buffer.from(overlay).toString('base64')}`;
    const edited = await buildEditedPdf(
      await createPdf(sizes),
      [{ sourceIndex: 0, rotation: 0 }],
      async () => dataUrl
    );

    expect((await pageDrawings(edited, 0)).images).toHaveLength(1);
  });

  test('lays the layer over an upright page as it is', async () => {
    const edited = await buildEditedPdf(
      await createPdf([[600, 800]]),
      [{ sourceIndex: 0, rotation: 0 }],
      () => overlay
    );
    const [image] = (await pageDrawings(edited, 0)).images;

    expect(image.origin).toEqual([0, 0]);
    expect(image.right[0]).toBeCloseTo(600);
    expect(image.right[1]).toBeCloseTo(0);
    expect(image.up[0]).toBeCloseTo(0);
    expect(image.up[1]).toBeCloseTo(800);
  });

  // The layer is drawn upright in the shape the page is shown in. Before the
  // fix it was stretched over the unturned page, so annotations made on a
  // turned page came out turned and squeezed.
  for (const turn of [90, 180, 270] as const) {
    test(`turns the layer back for a page the user turned by ${turn} degrees`, async () => {
      const edited = await buildEditedPdf(
        await createPdf([[600, 800]]),
        [{ sourceIndex: 0, rotation: turn }],
        () => overlay
      );
      const [image] = (await pageDrawings(edited, 0)).images;

      // Corners of the unturned page that a viewer shows lower-left,
      // lower-right and upper-left once it has turned the page clockwise.
      const corners = {
        90: { origin: [600, 0], right: [600, 800], up: [0, 0] },
        180: { origin: [600, 800], right: [0, 800], up: [600, 0] },
        270: { origin: [0, 800], right: [0, 0], up: [600, 800] },
      }[turn];

      for (const corner of ['origin', 'right', 'up'] as const) {
        expect(image[corner][0], `${corner} x`).toBeCloseTo(corners[corner][0]);
        expect(image[corner][1], `${corner} y`).toBeCloseTo(corners[corner][1]);
      }
    });
  }

  test('counts the rotation the page already had', async () => {
    const edited = await buildEditedPdf(
      await createPdfWithPages([{ size: [600, 800], rotate: 90 }]),
      [{ sourceIndex: 0, rotation: 90 }],
      () => overlay
    );
    const [image] = (await pageDrawings(edited, 0)).images;

    // 90 of its own plus 90 from the user: shown upside down.
    expect(image.origin[0]).toBeCloseTo(600);
    expect(image.origin[1]).toBeCloseTo(800);
    expect(image.right[0]).toBeCloseTo(0);
    expect(image.right[1]).toBeCloseTo(800);
  });

  test('covers the visible part of a cropped page, not its media box', async () => {
    const edited = await buildEditedPdf(
      await createPdfWithPages([{ size: [600, 800], crop: [50, 60, 400, 500] }]),
      [{ sourceIndex: 0, rotation: 0 }],
      () => overlay
    );
    const [image] = (await pageDrawings(edited, 0)).images;

    expect(image.origin).toEqual([50, 60]);
    expect(image.right[0]).toBeCloseTo(450);
    expect(image.up[1]).toBeCloseTo(560);
  });
});
