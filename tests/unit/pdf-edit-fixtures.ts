/**
 * Fixtures for the unit tests of the PDF editor tools (edit, merge, split,
 * compress, watermark): small documents and images built in memory, and a
 * reader for what was drawn on a page.
 */
import { deflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, degrees } from 'pdf-lib';

// ── Documents ─────────────────────────────────────────────────────────────────

/** A document with one empty page per size; the sizes tell the pages apart. */
export async function createPdf(sizes: ReadonlyArray<[number, number]>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  sizes.forEach((size) => doc.addPage(size));
  return doc.save();
}

export interface PageSetup {
  size: [number, number];
  /** The page's own `/Rotate`. */
  rotate?: number;
  /** Crop box as x, y, width, height. */
  crop?: [number, number, number, number];
  /** Media box as x, y, width, height, for pages whose corner is not (0, 0). */
  media?: [number, number, number, number];
}

/** A document whose pages are rotated or cropped as described. */
export async function createPdfWithPages(pages: readonly PageSetup[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  for (const setup of pages) {
    const page = doc.addPage(setup.size);
    if (setup.media) page.setMediaBox(...setup.media);
    if (setup.crop) page.setCropBox(...setup.crop);
    if (setup.rotate !== undefined) page.setRotation(degrees(setup.rotate));
  }

  return doc.save();
}

/** A document pdf-lib refuses as encrypted: its trailer names an encryption dictionary. */
export async function createEncryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  doc.context.trailerInfo.Encrypt = doc.context.register(
    doc.context.obj({ Filter: 'Standard', V: 1 })
  );
  return doc.save();
}

/** The sizes of the pages of a saved document, in order. */
export async function pageSizes(bytes: Uint8Array): Promise<Array<[number, number]>> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => [page.getWidth(), page.getHeight()]);
}

// ── Images ────────────────────────────────────────────────────────────────────

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(
    Array.from(type, (char) => char.charCodeAt(0)),
    4
  );
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

/** A fully transparent PNG of the given pixel size. */
export function createPng(width: number, height: number): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits per channel, RGBA

  // Every row is a filter byte followed by four zero bytes per pixel.
  const rows = new Uint8Array((width * 4 + 1) * height);
  const parts = [
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', new Uint8Array(0)),
  ];

  const png = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

/**
 * Bytes with a JPEG header of the given pixel size followed by `payloadSize`
 * bytes that do not compress. pdf-lib stores a JPEG as it is, so this is
 * enough to embed, and the payload makes the image weigh something.
 */
export function createJpeg(width: number, height: number, payloadSize = 0): Uint8Array {
  const header = [
    0xff,
    0xd8, // start of image
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08, // baseline frame, 17 bytes, 8 bits per sample
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00, // three components
  ];
  const jpeg = new Uint8Array(header.length + payloadSize + 2);
  jpeg.set(header);

  let seed = 0x2545f491;
  for (let index = 0; index < payloadSize; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    jpeg[header.length + index] = seed >>> 24;
  }

  jpeg.set([0xff, 0xd9], header.length + payloadSize);
  return jpeg;
}

// ── Reading what was drawn ────────────────────────────────────────────────────

/** A PDF transformation matrix: (x, y) goes to (a·x + c·y + e, b·x + d·y + f). */
export type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** The matrix that applies `first` and then `second`. */
function concat(first: Matrix, second: Matrix): Matrix {
  const [a, b, c, d, e, f] = first;
  const [A, B, C, D, E, F] = second;
  return [
    a * A + b * C,
    a * B + b * D,
    c * A + d * C,
    c * B + d * D,
    e * A + f * C + E,
    e * B + f * D + F,
  ];
}

export interface DrawnImage {
  /** Where the corners of the picture ended up, in the page's own coordinates. */
  origin: [number, number];
  /** End of its bottom edge. */
  right: [number, number];
  /** End of its left edge. */
  up: [number, number];
}

export interface DrawnText {
  /** Start of the baseline, in the page's own coordinates. */
  origin: [number, number];
  /** Counter-clockwise angle of the baseline in degrees, -180 to 180. */
  angle: number;
  /** Font size in points. */
  size: number;
}

export interface PageDrawings {
  images: DrawnImage[];
  texts: DrawnText[];
}

/** The decoded content streams of a page of a saved document, joined. */
export async function pageContent(bytes: Uint8Array, pageIndex: number): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(pageIndex).node.Contents();
  if (!contents) return '';

  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((entry) => doc.context.lookup(entry))
      : [contents];

  return streams
    .map((stream) =>
      stream instanceof PDFRawStream
        ? Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
        : ''
    )
    .join('\n');
}

/**
 * Follows the drawing operators of a page far enough to say where each image
 * and each run of text was put: it tracks the transformation matrix through
 * `q`, `Q` and `cm`, and reads `Do`, `Tf` and `Tm`.
 */
export async function pageDrawings(bytes: Uint8Array, pageIndex: number): Promise<PageDrawings> {
  const tokens = (await pageContent(bytes, pageIndex)).split(/\s+/).filter(Boolean);
  const drawings: PageDrawings = { images: [], texts: [] };
  const stack: Matrix[] = [];
  let matrix = IDENTITY;
  let fontSize = 0;
  let operands: string[] = [];

  const numbers = () => operands.map(Number);
  const apply = ([a, b, c, d, e, f]: Matrix, x: number, y: number): [number, number] => [
    a * x + c * y + e,
    b * x + d * y + f,
  ];

  for (const token of tokens) {
    if (/^[-+.\d]/.test(token) || token.startsWith('/') || token.startsWith('<')) {
      operands.push(token);
      continue;
    }

    if (token === 'q') stack.push(matrix);
    else if (token === 'Q') matrix = stack.pop() ?? IDENTITY;
    else if (token === 'cm') matrix = concat(numbers() as Matrix, matrix);
    else if (token === 'Tf') fontSize = Number(operands[1]);
    else if (token === 'Do') {
      drawings.images.push({
        origin: apply(matrix, 0, 0),
        right: apply(matrix, 1, 0),
        up: apply(matrix, 0, 1),
      });
    } else if (token === 'Tm') {
      const text = concat(numbers() as Matrix, matrix);
      drawings.texts.push({
        origin: apply(text, 0, 0),
        angle: (Math.atan2(text[1], text[0]) * 180) / Math.PI,
        size: fontSize,
      });
    }

    operands = [];
  }

  return drawings;
}
