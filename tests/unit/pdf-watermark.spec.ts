import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PdfToolError } from '@/lib/tools/pdf-page-ops';
import {
  layoutWatermark,
  measureWatermarkText,
  parseHexColor,
  selectWatermarkPages,
  watermarkPdf,
  type TextWatermark,
  type WatermarkOptions,
} from '@/lib/tools/pdf-watermark';
import {
  createEncryptedPdf,
  createJpeg,
  createPdf,
  createPdfWithPages,
  createPng,
  pageContent,
  pageDrawings,
  pageSizes,
} from './pdf-edit-fixtures';

const page = { width: 600, height: 800 };
const mark = { width: 100, height: 40 };

test.describe('selectWatermarkPages', () => {
  test('picks every page, the first or the last', () => {
    expect(selectWatermarkPages('all', 3)).toEqual([0, 1, 2]);
    expect(selectWatermarkPages('first', 3)).toEqual([0]);
    expect(selectWatermarkPages('last', 3)).toEqual([2]);
    expect(selectWatermarkPages('last', 1)).toEqual([0]);
  });

  test('reads a page list', () => {
    expect(selectWatermarkPages({ range: '3, 1-2, 9' }, 4)).toEqual([0, 1, 2]);
    expect(selectWatermarkPages({ range: '7' }, 4)).toEqual([]);
    expect(selectWatermarkPages({ range: '' }, 4)).toEqual([]);
  });

  test('picks nothing in a document without pages', () => {
    expect(selectWatermarkPages('all', 0)).toEqual([]);
    expect(selectWatermarkPages('last', 0)).toEqual([]);
  });
});

test.describe('layoutWatermark', () => {
  test('keeps corner marks 20 points from the edges', () => {
    const at = (position: WatermarkOptions['position']) =>
      layoutWatermark(page, mark, { position, kind: 'image' });

    expect(at('bottom-left')).toEqual([{ x: 20, y: 20, rotation: 0 }]);
    expect(at('bottom-right')).toEqual([{ x: 480, y: 20, rotation: 0 }]);
    expect(at('top-left')).toEqual([{ x: 20, y: 740, rotation: 0 }]);
    expect(at('top-right')).toEqual([{ x: 480, y: 740, rotation: 0 }]);
  });

  test('centres an upright mark', () => {
    expect(layoutWatermark(page, mark, { position: 'center', kind: 'image' })).toEqual([
      { x: 250, y: 380, rotation: 0 },
    ]);
    expect(layoutWatermark(page, mark, { position: 'center', kind: 'text', angle: 0 })).toEqual([
      { x: 250, y: 380, rotation: 0 },
    ]);
  });

  test('keeps the middle of a turned mark on the middle of the page', () => {
    for (const angle of [-90, -45, 30, 90]) {
      const [placement] = layoutWatermark(page, mark, { position: 'center', kind: 'text', angle });
      const radians = (placement.rotation * Math.PI) / 180;

      // Half the width along the mark and half the height across it leads to its middle.
      const middleX =
        placement.x + (Math.cos(radians) * mark.width) / 2 - (Math.sin(radians) * mark.height) / 2;
      const middleY =
        placement.y + (Math.sin(radians) * mark.width) / 2 + (Math.cos(radians) * mark.height) / 2;

      expect(middleX, `angle ${angle}`).toBeCloseTo(300);
      expect(middleY, `angle ${angle}`).toBeCloseTo(400);
    }
  });

  test('turns text the way the preview shows it', () => {
    // The Angle control runs clockwise on screen, where y points down. A PDF
    // rotation runs counter-clockwise, so -45 on the control is +45 in the file.
    for (const position of ['center', 'top-left', 'bottom-right', 'tiled'] as const) {
      const placements = layoutWatermark(page, mark, { position, kind: 'text', angle: -45 });

      expect(placements.length).toBeGreaterThan(0);
      expect(placements.every((placement) => placement.rotation === 45)).toBe(true);
    }
  });

  test('never turns an image', () => {
    const placements = layoutWatermark(page, mark, { position: 'tiled', kind: 'image', angle: 30 });

    expect(placements.every((placement) => placement.rotation === 0)).toBe(true);
  });

  test('tiles text on a fixed grid', () => {
    const placements = layoutWatermark(page, mark, { position: 'tiled', kind: 'text', angle: 0 });

    expect(
      placements.map(({ x }) => x).filter((x, index, all) => all.indexOf(x) === index)
    ).toEqual([50, 270, 490]);
    expect(
      placements.map(({ y }) => y).filter((y, index, all) => all.indexOf(y) === index)
    ).toEqual([50, 230, 410, 590, 770]);
    expect(placements).toHaveLength(15);
  });

  test('tiles an image on a grid that leaves room for it', () => {
    const small = layoutWatermark(
      page,
      { width: 30, height: 30 },
      { position: 'tiled', kind: 'image' }
    );
    const large = layoutWatermark(
      page,
      { width: 250, height: 300 },
      { position: 'tiled', kind: 'image' }
    );

    // Small images keep a minimum distance of 150 by 120 points.
    expect(small.slice(0, 2)).toEqual([
      { x: 20, y: 20, rotation: 0 },
      { x: 20, y: 140, rotation: 0 },
    ]);
    expect(small).toHaveLength(4 * 7);
    // Large images step by their own size plus 40 points.
    expect(large).toEqual([
      { x: 20, y: 20, rotation: 0 },
      { x: 20, y: 360, rotation: 0 },
      { x: 20, y: 700, rotation: 0 },
      { x: 310, y: 20, rotation: 0 },
      { x: 310, y: 360, rotation: 0 },
      { x: 310, y: 700, rotation: 0 },
    ]);
  });

  test('stops after one mark when the size is not a number', () => {
    const placements = layoutWatermark(
      page,
      { width: Number.NaN, height: Number.NaN },
      { position: 'tiled', kind: 'image' }
    );

    expect(placements).toHaveLength(1);
  });
});

test.describe('measureWatermarkText', () => {
  test('agrees with the font pdf-lib embeds', async () => {
    const doc = await PDFDocument.create();
    const fonts = [
      ['Helvetica', StandardFonts.Helvetica],
      ['Times Roman', StandardFonts.TimesRoman],
      ['Courier', StandardFonts.Courier],
    ] as const;

    for (const [name, standardFont] of fonts) {
      const font = await doc.embedFont(standardFont);
      const size = measureWatermarkText('CONFIDENTIAL', name, 48);

      expect(size?.width, name).toBeCloseTo(font.widthOfTextAtSize('CONFIDENTIAL', 48));
      expect(size?.height, name).toBeCloseTo(font.heightAtSize(48));
    }
  });

  test('measures Western European text', () => {
    expect(measureWatermarkText('Entwurf – café €', 'Helvetica', 12)).not.toBeNull();
    expect(measureWatermarkText('', 'Helvetica', 12)).toEqual({
      width: 0,
      height: expect.any(Number),
    });
  });

  test('says when the built-in fonts cannot draw the text', () => {
    // Turkish, Chinese, Russian, an emoji and a tab.
    for (const text of ['GİZLİ', '机密', 'Секрет', 'Top \u{1f512}', 'a\tb']) {
      expect(measureWatermarkText(text, 'Helvetica', 48), text).toBeNull();
    }
  });
});

test.describe('parseHexColor', () => {
  test('reads six and three digit colours', () => {
    expect(parseHexColor('#ff0000')).toEqual({ r: 1, g: 0, b: 0 });
    expect(parseHexColor('#0000FF')).toEqual({ r: 0, g: 0, b: 1 });
    expect(parseHexColor('808080')).toEqual({ r: 128 / 255, g: 128 / 255, b: 128 / 255 });
    expect(parseHexColor('#0f0')).toEqual({ r: 0, g: 1, b: 0 });
  });

  test('rejects anything else', () => {
    expect(parseHexColor('none')).toBeNull();
    expect(parseHexColor('#12345')).toBeNull();
    expect(parseHexColor('red')).toBeNull();
    expect(parseHexColor('')).toBeNull();
  });
});

test.describe('watermarkPdf with text', () => {
  const text: TextWatermark = {
    kind: 'text',
    text: 'CONFIDENTIAL',
    font: 'Helvetica',
    size: 48,
    color: '#ff0000',
    angle: -45,
  };
  const options: WatermarkOptions = { position: 'center', opacity: 30, pages: 'all' };
  const threePages: Array<[number, number]> = [
    [600, 800],
    [600, 800],
    [600, 800],
  ];

  test('marks the chosen pages and leaves the others alone', async () => {
    const source = await createPdf(threePages);
    const marked = await watermarkPdf(source, text, { ...options, pages: { range: '3, 1' } });

    expect(marked.pages).toEqual([1, 3]);
    expect(await pageSizes(marked.bytes)).toEqual(threePages);
    expect((await pageDrawings(marked.bytes, 0)).texts).toHaveLength(1);
    expect((await pageDrawings(marked.bytes, 1)).texts).toHaveLength(0);
    expect((await pageDrawings(marked.bytes, 2)).texts).toHaveLength(1);
  });

  test('marks the first or the last page only', async () => {
    const source = await createPdf(threePages);
    const first = await watermarkPdf(source, text, { ...options, pages: 'first' });
    const last = await watermarkPdf(source, text, { ...options, pages: 'last' });

    expect(first.pages).toEqual([1]);
    expect(last.pages).toEqual([3]);
    expect((await pageDrawings(last.bytes, 0)).texts).toHaveLength(0);
    expect((await pageDrawings(last.bytes, 2)).texts).toHaveLength(1);
  });

  test('writes the text rising to the right for an angle of -45, as the preview shows it', async () => {
    const marked = await watermarkPdf(await createPdf([[600, 800]]), text, options);
    const [drawn] = (await pageDrawings(marked.bytes, 0)).texts;

    // Before the fix the file said -45, which a PDF reads as falling to the right.
    expect(drawn.angle).toBeCloseTo(45);
    expect(drawn.size).toBe(48);
  });

  test('centres the text on the page', async () => {
    const marked = await watermarkPdf(
      await createPdf([[600, 800]]),
      { ...text, angle: 0 },
      options
    );
    const [drawn] = (await pageDrawings(marked.bytes, 0)).texts;
    const size = measureWatermarkText(text.text, text.font, text.size)!;

    expect(drawn.origin[0]).toBeCloseTo(300 - size.width / 2);
    expect(drawn.origin[1]).toBeCloseTo(400 - size.height / 2);
    expect(drawn.angle).toBeCloseTo(0);
  });

  test('draws one copy per grid point when tiled', async () => {
    const marked = await watermarkPdf(await createPdf([[600, 800]]), text, {
      ...options,
      position: 'tiled',
    });

    expect((await pageDrawings(marked.bytes, 0)).texts).toHaveLength(15);
  });

  test('refuses a page list that selects nothing instead of returning the file unmarked', async () => {
    const source = await createPdf(threePages);

    for (const range of ['9', '', 'abc', '5-7']) {
      const failure = await watermarkPdf(source, text, { ...options, pages: { range } }).catch(
        (error: unknown) => error
      );
      expect(failure, `range "${range}"`).toBeInstanceOf(PdfToolError);
    }

    await expect(watermarkPdf(source, text, { ...options, pages: { range: '9' } })).rejects.toThrow(
      'No pages match "9". This PDF has pages 1 to 3.'
    );
  });

  test('refuses blank text instead of returning the file unmarked', async () => {
    await expect(
      watermarkPdf(await createPdf(threePages), { ...text, text: '   ' }, options)
    ).rejects.toThrow('Enter the watermark text first.');
  });

  test('falls back to red for a colour it cannot read', async () => {
    const marked = await watermarkPdf(
      await createPdf([[600, 800]]),
      { ...text, color: 'none' },
      options
    );

    expect(await pageContent(marked.bytes, 0)).toContain('1 0 0 rg');
  });

  test('reports a protected document in plain words', async () => {
    await expect(watermarkPdf(await createEncryptedPdf(), text, options)).rejects.toThrow(
      'This PDF is password-protected or encrypted.'
    );
  });
});

test.describe('watermarkPdf on turned and cropped pages', () => {
  const text: TextWatermark = {
    kind: 'text',
    text: 'DRAFT',
    font: 'Helvetica',
    size: 40,
    color: '#000000',
    angle: 0,
  };
  const size = measureWatermarkText(text.text, text.font, text.size)!;

  test('keeps a corner mark in the corner the viewer shows', async () => {
    // A page stored upright and shown turned by 90 degrees: 800 wide, 600 high.
    const source = await createPdfWithPages([{ size: [600, 800], rotate: 90 }]);
    const marked = await watermarkPdf(source, text, {
      position: 'bottom-left',
      opacity: 100,
      pages: 'all',
    });
    const [drawn] = (await pageDrawings(marked.bytes, 0)).texts;

    // 20 right and 20 up from the shown corner is 20 left of the stored
    // page's right edge and 20 above its bottom. Before the fix the text sat
    // at (20, 20) unturned, which the viewer shows sideways in another corner.
    expect(drawn.origin[0]).toBeCloseTo(580);
    expect(drawn.origin[1]).toBeCloseTo(20);
    expect(drawn.angle).toBeCloseTo(90);
  });

  test('lays the mark out on the page as shown, not as stored', async () => {
    const source = await createPdfWithPages([{ size: [600, 800], rotate: 270 }]);
    const marked = await watermarkPdf(source, text, {
      position: 'top-right',
      opacity: 100,
      pages: 'all',
    });
    const [drawn] = (await pageDrawings(marked.bytes, 0)).texts;

    // Shown 800 by 600: the baseline starts at (800 - width - 20, 600 - height - 20).
    const shownX = 800 - size.width - 20;
    const shownY = 600 - size.height - 20;
    expect(drawn.origin[0]).toBeCloseTo(shownY);
    expect(drawn.origin[1]).toBeCloseTo(800 - shownX);
    expect(drawn.angle).toBeCloseTo(-90);
  });

  test('turns the text with a page that is shown upside down', async () => {
    const source = await createPdfWithPages([{ size: [600, 800], rotate: 180 }]);
    const marked = await watermarkPdf(
      source,
      { ...text, angle: -30 },
      { position: 'bottom-left', opacity: 100, pages: 'all' }
    );
    const [drawn] = (await pageDrawings(marked.bytes, 0)).texts;

    expect(drawn.origin[0]).toBeCloseTo(580);
    expect(drawn.origin[1]).toBeCloseTo(780);
    expect(drawn.angle).toBeCloseTo(-150);
  });

  test('measures from the visible box of a cropped page', async () => {
    const source = await createPdfWithPages([{ size: [600, 800], crop: [100, 150, 300, 400] }]);
    const marked = await watermarkPdf(source, text, {
      position: 'top-left',
      opacity: 100,
      pages: 'all',
    });
    const [drawn] = (await pageDrawings(marked.bytes, 0)).texts;

    // Before the fix the mark was placed against the media box, outside the visible part.
    expect(drawn.origin[0]).toBeCloseTo(120);
    expect(drawn.origin[1]).toBeCloseTo(150 + 400 - size.height - 20);
  });
});

test.describe('watermarkPdf with text the built-in fonts cannot draw', () => {
  const text: TextWatermark = {
    kind: 'text',
    text: 'GİZLİ',
    font: 'Helvetica',
    size: 48,
    color: '#ff0000',
    angle: 0,
  };
  const options: WatermarkOptions = { position: 'bottom-left', opacity: 50, pages: 'all' };

  test('draws the picture the caller supplies', async () => {
    let calls = 0;
    const marked = await watermarkPdf(
      await createPdf([
        [600, 800],
        [600, 800],
      ]),
      {
        ...text,
        rasterize: () => {
          calls += 1;
          return { png: createPng(8, 4), width: 120, height: 60, baseline: 12 };
        },
      },
      options
    );

    // Drawn once, then placed on both pages.
    expect(calls).toBe(1);
    expect((await pageDrawings(marked.bytes, 0)).texts).toHaveLength(0);

    for (const pageIndex of [0, 1]) {
      const [image] = (await pageDrawings(marked.bytes, pageIndex)).images;

      // The baseline sits 20 above the page edge; the picture starts 12 below it.
      expect(image.origin[0]).toBeCloseTo(20);
      expect(image.origin[1]).toBeCloseTo(8);
      expect(image.right[0]).toBeCloseTo(140);
      expect(image.up[1]).toBeCloseTo(68);
    }
  });

  test('turns the picture like text', async () => {
    const marked = await watermarkPdf(
      await createPdf([[600, 800]]),
      {
        ...text,
        angle: -90,
        rasterize: async () => ({ png: createPng(8, 4), width: 120, height: 60, baseline: 12 }),
      },
      options
    );
    const [image] = (await pageDrawings(marked.bytes, 0)).images;

    // Reading upwards from (20, 20); "below the baseline" is now to the right.
    expect(image.origin[0]).toBeCloseTo(32);
    expect(image.origin[1]).toBeCloseTo(20);
    expect(image.right[0]).toBeCloseTo(32);
    expect(image.right[1]).toBeCloseTo(140);
  });

  test('does not ask for a picture when the font can draw the text', async () => {
    const marked = await watermarkPdf(
      await createPdf([[600, 800]]),
      {
        ...text,
        text: 'DRAFT',
        rasterize: () => {
          throw new Error('not needed');
        },
      },
      options
    );

    expect((await pageDrawings(marked.bytes, 0)).texts).toHaveLength(1);
  });

  test('explains the refusal when it has no way to draw a picture', async () => {
    // Before the fix this surfaced as a bare "Failed to apply watermark."
    const failure = await watermarkPdf(await createPdf([[600, 800]]), text, options).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(PdfToolError);
    expect((failure as Error).message).toBe(
      'The Helvetica font cannot draw this text. Use Western European characters only.'
    );
  });
});

test.describe('watermarkPdf with an image', () => {
  const options: WatermarkOptions = { position: 'bottom-right', opacity: 40, pages: 'all' };

  test('sizes the image from its pixels and the scale', async () => {
    const marked = await watermarkPdf(
      await createPdf([[600, 800]]),
      { kind: 'image', image: createPng(200, 100), scale: 50 },
      options
    );
    const [image] = (await pageDrawings(marked.bytes, 0)).images;

    // 100 by 50 points, 20 points from the right and bottom edges.
    expect(image.origin[0]).toBeCloseTo(480);
    expect(image.origin[1]).toBeCloseTo(20);
    expect(image.right[0]).toBeCloseTo(580);
    expect(image.up[1]).toBeCloseTo(70);
  });

  test('reads the format from the bytes, not from the file type', async () => {
    const source = await createPdf([[600, 800]]);

    // A PNG saved as "logo.jpg" used to be handed to the JPEG reader and fail.
    const mislabeled = new File([createPng(40, 40).slice()], 'logo.jpg', { type: 'image/jpeg' });
    const untyped = new File([createJpeg(40, 40).slice()], 'logo');

    for (const image of [mislabeled, untyped]) {
      const marked = await watermarkPdf(source, { kind: 'image', image, scale: 100 }, options);
      expect((await pageDrawings(marked.bytes, 0)).images, image.name).toHaveLength(1);
    }
  });

  test('accepts a view into a larger buffer', async () => {
    const padded = new Uint8Array(64 + 4096);
    const jpeg = createJpeg(40, 20);
    padded.set(jpeg, 64);

    const marked = await watermarkPdf(
      await createPdf([[600, 800]]),
      { kind: 'image', image: padded.subarray(64, 64 + jpeg.length), scale: 100 },
      options
    );
    const [image] = (await pageDrawings(marked.bytes, 0)).images;

    expect(image.right[0] - image.origin[0]).toBeCloseTo(40);
    expect(image.up[1] - image.origin[1]).toBeCloseTo(20);
  });

  test('keeps the image upright on a page that is shown turned', async () => {
    const marked = await watermarkPdf(
      await createPdfWithPages([{ size: [600, 800], rotate: 90 }]),
      { kind: 'image', image: createPng(100, 50), scale: 100 },
      { ...options, position: 'bottom-left' }
    );
    const [image] = (await pageDrawings(marked.bytes, 0)).images;

    // Shown at (20, 20) with its width running right: on the stored page that
    // is (580, 20) with its width running up.
    expect(image.origin[0]).toBeCloseTo(580);
    expect(image.origin[1]).toBeCloseTo(20);
    expect(image.right[0]).toBeCloseTo(580);
    expect(image.right[1]).toBeCloseTo(120);
    expect(image.up[0]).toBeCloseTo(530);
    expect(image.up[1]).toBeCloseTo(20);
  });

  test('tiles the image', async () => {
    const marked = await watermarkPdf(
      await createPdf([[600, 800]]),
      { kind: 'image', image: createPng(250, 300), scale: 100 },
      { ...options, position: 'tiled' }
    );

    expect((await pageDrawings(marked.bytes, 0)).images).toHaveLength(6);
  });

  test('says when the image is neither a PNG nor a JPEG', async () => {
    const failure = await watermarkPdf(
      await createPdf([[600, 800]]),
      { kind: 'image', image: new TextEncoder().encode('GIF89a not really'), scale: 100 },
      options
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PdfToolError);
    expect((failure as Error).message).toBe(
      'The watermark image could not be read. Use a PNG or JPEG file.'
    );
  });
});
