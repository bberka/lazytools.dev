import { deflateSync } from 'node:zlib';
import { test, expect } from '@playwright/test';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFStream,
  decodePDFRawStream,
} from 'pdf-lib';
import {
  MAX_PAGE_SIDE,
  detectImageFormat,
  imagesToPdf,
  placeImage,
  readJpegOrientation,
} from '@/lib/tools/image-to-pdf';

// ── Test images ───────────────────────────────────────────────────────────────

const bytesOf = (...parts: Array<number[] | Uint8Array>) =>
  Uint8Array.from(parts.flatMap((part) => Array.from(part)));

const uint16 = (value: number, littleEndian = false) =>
  littleEndian ? [value & 0xff, value >> 8] : [value >> 8, value & 0xff];

const uint32 = (value: number, littleEndian = false) => {
  const bigEndian = [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
  return littleEndian ? bigEndian.reverse() : bigEndian;
};

/** A JPEG segment: marker, length (which counts itself) and payload. */
const segment = (marker: number, payload: number[]) => [0xff, marker, ...uint16(payload.length + 2), ...payload];

interface ExifOptions {
  littleEndian?: boolean;
  /** TIFF field type of the orientation entry: 3 is SHORT, 4 is LONG. */
  type?: number;
}

/** An APP1 segment whose only job is to carry an orientation. */
function exifSegment(orientation: number, { littleEndian = false, type = 3 }: ExifOptions = {}): number[] {
  const value = type === 4 ? uint32(orientation, littleEndian) : [...uint16(orientation, littleEndian), 0, 0];

  return segment(0xe1, [
    ...[0x45, 0x78, 0x69, 0x66, 0, 0], // "Exif\0\0"
    ...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...uint16(0x002a, littleEndian),
    ...uint32(8, littleEndian), // the directory follows the TIFF header
    ...uint16(2, littleEndian), // two entries
    ...uint16(0x010f, littleEndian), // Make, which is not the tag looked for
    ...uint16(2, littleEndian),
    ...uint32(1, littleEndian),
    ...[0x41, 0, 0, 0],
    ...uint16(0x0112, littleEndian), // Orientation
    ...uint16(type, littleEndian),
    ...uint32(1, littleEndian),
    ...value,
  ]);
}

const JFIF = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const XMP = segment(0xe1, Array.from(Buffer.from('http://ns.adobe.com/xap/1.0/\0<x/>', 'latin1')));

/**
 * The frame of a JPEG without picture data. pdf-lib reads the size from the
 * frame header and embeds the bytes as they are, so this is enough to build a
 * PDF from.
 */
function jpeg(width: number, height: number, ...leading: number[][]): Uint8Array {
  const frame = segment(0xc0, [8, ...uint16(height), ...uint16(width), 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return bytesOf([0xff, 0xd8], ...leading, frame, [0xff, 0xd9]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const pngChunk = (type: string, data: Uint8Array) => {
  const body = bytesOf(Array.from(Buffer.from(type, 'latin1')), data);
  return bytesOf(uint32(data.length), body, uint32(crc32(body)));
};

/** A real, decodable PNG: opaque grey pixels. */
function png(width: number, height: number): Uint8Array {
  const header = bytesOf(uint32(width), uint32(height), [8, 2, 0, 0, 0]);
  // Each row: filter type 0, then three bytes per pixel.
  const rows = new Uint8Array(height * (1 + width * 3)).fill(0x80);
  for (let row = 0; row < height; row++) rows[row * (1 + width * 3)] = 0;

  return bytesOf(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', new Uint8Array())
  );
}

const file = (bytes: Uint8Array, name: string, type = '') =>
  new File([bytes as Uint8Array<ArrayBuffer>], name, { type });

// ── Reading a PDF back ────────────────────────────────────────────────────────

/** For every page: its size and the matrix its image is drawn with. */
async function readPages(pdfBytes: Uint8Array) {
  const doc = await PDFDocument.load(pdfBytes);

  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
    const source = streams
      .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
      .map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1'))
      .join('\n');
    const matrix = /([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+) cm/.exec(source);

    return {
      width: page.getWidth(),
      height: page.getHeight(),
      matrix: matrix ? matrix.slice(1).map(Number) : null,
      imagesDrawn: source.match(/\bDo\b/g)?.length ?? 0,
    };
  });
}

/** For every page: the name its content stream draws, and the images its resources hold. */
async function readPageImages(pdfBytes: Uint8Array) {
  const doc = await PDFDocument.load(pdfBytes);

  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
    const source = streams
      .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
      .map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1'))
      .join('\n');

    const xObjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    const resources = (xObjects?.entries() ?? []).map(([name, ref]) => {
      const image = doc.context.lookup(ref, PDFStream).dict;
      const entry = (key: string) => image.get(PDFName.of(key))?.toString();

      return {
        name: name.toString(),
        subtype: entry('Subtype'),
        filter: entry('Filter'),
        width: Number(entry('Width')),
        height: Number(entry('Height')),
      };
    });

    return { drawn: /(\/\S+) Do\b/.exec(source)?.[1], resources };
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('detectImageFormat', () => {
  test('recognises JPEG and PNG by their first bytes', () => {
    expect(detectImageFormat(jpeg(4, 3))).toBe('jpeg');
    expect(detectImageFormat(png(2, 2))).toBe('png');
  });

  test('gives null for anything else', () => {
    expect(detectImageFormat(new Uint8Array())).toBeNull();
    expect(detectImageFormat(Uint8Array.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageFormat(Uint8Array.from(Buffer.from('GIF89a', 'latin1')))).toBeNull();
    expect(detectImageFormat(Uint8Array.from(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')))).toBeNull();
    expect(detectImageFormat(Uint8Array.from(Buffer.from('\x89PNG\r\n', 'latin1')))).toBeNull();
  });
});

test.describe('readJpegOrientation', () => {
  test('reads every orientation, in both byte orders', () => {
    for (let orientation = 1; orientation <= 8; orientation++) {
      expect(readJpegOrientation(jpeg(4, 3, exifSegment(orientation)))).toBe(orientation);
      expect(readJpegOrientation(jpeg(4, 3, exifSegment(orientation, { littleEndian: true })))).toBe(
        orientation
      );
    }
  });

  test('finds EXIF behind a JFIF header and behind another APP1 segment', () => {
    expect(readJpegOrientation(jpeg(4, 3, JFIF, exifSegment(6)))).toBe(6);
    expect(readJpegOrientation(jpeg(4, 3, JFIF, XMP, exifSegment(8, { littleEndian: true })))).toBe(8);
  });

  test('reads an orientation stored as a LONG', () => {
    expect(readJpegOrientation(jpeg(4, 3, exifSegment(3, { type: 4 })))).toBe(3);
    expect(readJpegOrientation(jpeg(4, 3, exifSegment(3, { type: 4, littleEndian: true })))).toBe(3);
  });

  test('reads a view that does not start at the beginning of its buffer', () => {
    const image = jpeg(4, 3, exifSegment(6));
    const padded = new Uint8Array(image.length + 7);
    padded.set(image, 5);

    expect(readJpegOrientation(padded.subarray(5, 5 + image.length))).toBe(6);
  });

  test('gives 1 when there is no orientation', () => {
    expect(readJpegOrientation(jpeg(4, 3))).toBe(1);
    expect(readJpegOrientation(jpeg(4, 3, JFIF, XMP))).toBe(1);
  });

  test('gives 1 for values outside 1 to 8 and for a tag of another type', () => {
    expect(readJpegOrientation(jpeg(4, 3, exifSegment(0)))).toBe(1);
    expect(readJpegOrientation(jpeg(4, 3, exifSegment(9)))).toBe(1);
    expect(readJpegOrientation(jpeg(4, 3, exifSegment(6, { type: 2 })))).toBe(1);
  });

  test('gives 1 for files that are cut off or are not JPEG', () => {
    const image = jpeg(4, 3, exifSegment(6));

    for (let length = 0; length < 40; length++) {
      expect(readJpegOrientation(image.subarray(0, length))).toBe(1);
    }
    expect(readJpegOrientation(png(2, 2))).toBe(1);
    expect(readJpegOrientation(new Uint8Array())).toBe(1);
    // A segment that claims to be longer than the file.
    expect(readJpegOrientation(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x45, 0x78]))).toBe(1);
  });
});

test.describe('placeImage', () => {
  const WIDTH = 40;
  const HEIGHT = 30;

  /** Where a point of the stored image, in pixels from its top-left corner, lands on the page (y up). */
  function onPage(orientation: number, column: number, row: number) {
    const { matrix } = placeImage(WIDTH, HEIGHT, orientation);
    const [a, b, c, d, e, f] = matrix;
    // PDF puts the image in a unit square whose top row is at y = 1.
    const x = column / WIDTH;
    const y = 1 - row / HEIGHT;
    return [a * x + c * y + e, b * x + d * y + f];
  }

  // Named corners of the upright picture, as page coordinates for a page of the given size.
  const corners = (pageWidth: number, pageHeight: number) => ({
    topLeft: [0, pageHeight],
    topRight: [pageWidth, pageHeight],
    bottomLeft: [0, 0],
    bottomRight: [pageWidth, 0],
  });

  test('leaves an upright image as it is', () => {
    expect(placeImage(WIDTH, HEIGHT)).toEqual({ pageWidth: 40, pageHeight: 30, matrix: [40, 0, 0, 30, 0, 0] });
    expect(placeImage(WIDTH, HEIGHT, 1)).toEqual(placeImage(WIDTH, HEIGHT));
    expect(placeImage(WIDTH, HEIGHT, 0)).toEqual(placeImage(WIDTH, HEIGHT));
    expect(placeImage(WIDTH, HEIGHT, 42)).toEqual(placeImage(WIDTH, HEIGHT));
  });

  // EXIF names, for each value, where row 0 and column 0 of the stored pixels
  // belong in the upright picture. The stored top-left pixel is where the two meet.
  const storedTopLeft: Record<number, keyof ReturnType<typeof corners>> = {
    1: 'topLeft',
    2: 'topRight',
    3: 'bottomRight',
    4: 'bottomLeft',
    5: 'topLeft',
    6: 'topRight',
    7: 'bottomRight',
    8: 'bottomLeft',
  };
  // Orientations 5 to 8 swap rows and columns: the stored top row runs down a side of the picture.
  const storedTopRight: Record<number, keyof ReturnType<typeof corners>> = {
    1: 'topRight',
    2: 'topLeft',
    3: 'bottomLeft',
    4: 'bottomRight',
    5: 'bottomLeft',
    6: 'bottomRight',
    7: 'topRight',
    8: 'topLeft',
  };

  for (let orientation = 1; orientation <= 8; orientation++) {
    test(`orientation ${orientation} puts the stored corners where EXIF says they belong`, () => {
      const { pageWidth, pageHeight } = placeImage(WIDTH, HEIGHT, orientation);
      const turned = orientation >= 5;
      const page = corners(pageWidth, pageHeight);

      expect([pageWidth, pageHeight]).toEqual(turned ? [HEIGHT, WIDTH] : [WIDTH, HEIGHT]);
      expect(onPage(orientation, 0, 0)).toEqual(page[storedTopLeft[orientation]]);
      expect(onPage(orientation, WIDTH, 0)).toEqual(page[storedTopRight[orientation]]);

      // The whole image stays on the page.
      for (const [column, row] of [
        [0, 0],
        [WIDTH, 0],
        [0, HEIGHT],
        [WIDTH, HEIGHT],
      ]) {
        const [x, y] = onPage(orientation, column, row);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(pageWidth);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(pageHeight);
      }
    });
  }

  test('scales a page down that would be longer than a PDF page may be', () => {
    const tall = placeImage(1080, 43200);

    expect(tall.pageHeight).toBe(MAX_PAGE_SIDE);
    expect(tall.pageWidth).toBe(360);
    expect(tall.matrix).toEqual([360, 0, 0, MAX_PAGE_SIDE, 0, 0]);

    const turned = placeImage(28800, 1000, 6);
    expect([turned.pageWidth, turned.pageHeight]).toEqual([500, MAX_PAGE_SIDE]);

    expect(placeImage(MAX_PAGE_SIDE, 100)).toEqual({
      pageWidth: MAX_PAGE_SIDE,
      pageHeight: 100,
      matrix: [MAX_PAGE_SIDE, 0, 0, 100, 0, 0],
    });
  });
});

test.describe('imagesToPdf', () => {
  test('makes one page per image, in order, each the size of its image', async () => {
    const pdf = await imagesToPdf([
      file(png(3, 2), 'first.png', 'image/png'),
      file(jpeg(640, 480), 'second.jpg', 'image/jpeg'),
      file(png(1, 5), 'third.png', 'image/png'),
    ]);

    expect(await readPages(pdf)).toEqual([
      { width: 3, height: 2, matrix: [3, 0, 0, 2, 0, 0], imagesDrawn: 1 },
      { width: 640, height: 480, matrix: [640, 0, 0, 480, 0, 0], imagesDrawn: 1 },
      { width: 1, height: 5, matrix: [1, 0, 0, 5, 0, 0], imagesDrawn: 1 },
    ]);
  });

  test('draws the embedded image itself, which keeps its stored pixel size', async () => {
    const pages = await readPageImages(
      await imagesToPdf([
        file(jpeg(400, 300, exifSegment(6)), 'portrait.jpg', 'image/jpeg'),
        file(png(3, 2), 'small.png', 'image/png'),
      ])
    );

    expect(pages).toHaveLength(2);
    expect(pages[0].resources).toEqual([
      { name: pages[0].drawn, subtype: '/Image', filter: '/DCTDecode', width: 400, height: 300 },
    ]);
    expect(pages[1].resources).toEqual([
      { name: pages[1].drawn, subtype: '/Image', filter: '/FlateDecode', width: 3, height: 2 },
    ]);
  });

  // The tool went by the MIME type, which the browser derives from the file
  // name: a JPEG saved as .png made the whole PDF fail.
  test('goes by the content of a file, not by its name or reported type', async () => {
    const pdf = await imagesToPdf([
      file(jpeg(20, 10), 'really-a-jpeg.png', 'image/png'),
      file(png(4, 6), 'really-a-png.jpg', 'image/jpeg'),
    ]);

    expect((await readPages(pdf)).map((page) => [page.width, page.height])).toEqual([
      [20, 10],
      [4, 6],
    ]);
  });

  // The file picker lets a file through when the browser reports no type for
  // it. Such an image was skipped without a word; alone, it gave a PDF with one
  // blank page.
  test('embeds an image that has no reported type', async () => {
    const pdf = await imagesToPdf([file(jpeg(20, 10), 'scan', ''), file(png(4, 6), 'IMG_0001', '')]);

    expect(await readPages(pdf)).toEqual([
      { width: 20, height: 10, matrix: [20, 0, 0, 10, 0, 0], imagesDrawn: 1 },
      { width: 4, height: 6, matrix: [4, 0, 0, 6, 0, 0], imagesDrawn: 1 },
    ]);
  });

  test('refuses a file that is neither JPEG nor PNG, and names it', async () => {
    const gif = file(Uint8Array.from(Buffer.from('GIF89a', 'latin1')), 'animation.gif', '');

    await expect(imagesToPdf([file(png(2, 2), 'ok.png'), gif])).rejects.toThrow(
      '"animation.gif" is not a JPEG or PNG image.'
    );
  });

  test('names the file when an image is damaged', async () => {
    const broken = file(png(2, 2).subarray(0, 30), 'broken.png', 'image/png');

    await expect(imagesToPdf([broken])).rejects.toThrow(/^"broken\.png" could not be read as an image: /);
  });

  test('refuses an empty list instead of writing a blank page', async () => {
    await expect(imagesToPdf([])).rejects.toThrow('There are no images to put in the PDF.');
  });

  // A phone stores a portrait photo as landscape pixels plus an EXIF
  // orientation. The browser turns the thumbnail; the PDF page used to lie on
  // its side.
  test('turns a JPEG upright according to its EXIF orientation', async () => {
    const pdf = await imagesToPdf([
      file(jpeg(400, 300, exifSegment(6)), 'portrait.jpg', 'image/jpeg'),
      file(jpeg(400, 300, JFIF, exifSegment(3, { littleEndian: true })), 'upside-down.jpg', 'image/jpeg'),
      file(jpeg(400, 300, exifSegment(8)), 'other-side.jpg', 'image/jpeg'),
    ]);

    expect(await readPages(pdf)).toEqual([
      { width: 300, height: 400, matrix: [0, -400, 300, 0, 0, 400], imagesDrawn: 1 },
      { width: 400, height: 300, matrix: [-400, 0, 0, -300, 400, 300], imagesDrawn: 1 },
      { width: 300, height: 400, matrix: [0, 400, -300, 0, 300, 0], imagesDrawn: 1 },
    ]);
  });

  test('keeps a very long image inside the largest page a PDF allows', async () => {
    const [page] = await readPages(await imagesToPdf([file(jpeg(1080, 43200), 'long-screenshot.jpg')]));

    expect([page.width, page.height]).toEqual([360, MAX_PAGE_SIDE]);
    expect(page.matrix).toEqual([360, 0, 0, MAX_PAGE_SIDE, 0, 0]);
  });
});
