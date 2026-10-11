/**
 * Image to PDF logic: one PDF page per JPEG or PNG, sized to the image.
 *
 * Three things are decided from the image's own bytes rather than from what
 * the browser reports about the file:
 * - the format, because the MIME type follows the file name, which can be
 *   wrong or missing;
 * - the orientation of a JPEG, because a PDF viewer ignores the EXIF tag that
 *   makes a browser show a phone photo upright;
 * - the page size, because a PDF page may not be longer than 14400 units.
 */
import {
  PDFDocument,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib';
import { readFileAsArrayBuffer } from '@/lib/files';

// ── Format ────────────────────────────────────────────────────────────────────

export type ImageFormat = 'jpeg' | 'png';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Reads the format from the first bytes of the file. Null when it is neither JPEG nor PNG. */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return 'png';
  return null;
}

// ── Orientation ───────────────────────────────────────────────────────────────

const EXIF_HEADER = 0x45786966; // "Exif", followed by two zero bytes
const ORIENTATION_TAG = 0x0112;

/** The orientation stored in one APP1 segment, or 0 when it holds none. */
function readExifOrientation(view: DataView, start: number, end: number): number {
  // Six bytes of header, then the eight-byte TIFF header.
  if (start + 14 > end) return 0;
  if (view.getUint32(start) !== EXIF_HEADER || view.getUint16(start + 4) !== 0) return 0;

  const tiff = start + 6;
  const byteOrder = view.getUint16(tiff);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return 0;
  const littleEndian = byteOrder === 0x4949;
  if (view.getUint16(tiff + 2, littleEndian) !== 0x002a) return 0;

  const directory = tiff + view.getUint32(tiff + 4, littleEndian);
  if (directory + 2 > end) return 0;
  const entryCount = view.getUint16(directory, littleEndian);

  for (let index = 0; index < entryCount; index++) {
    const entry = directory + 2 + index * 12;
    if (entry + 12 > end) return 0;
    if (view.getUint16(entry, littleEndian) !== ORIENTATION_TAG) continue;

    // The value is a SHORT (type 3); a few writers store it as a LONG (type 4).
    const type = view.getUint16(entry + 2, littleEndian);
    const value =
      type === 3
        ? view.getUint16(entry + 8, littleEndian)
        : type === 4
          ? view.getUint32(entry + 8, littleEndian)
          : 0;
    return value >= 1 && value <= 8 ? value : 0;
  }

  return 0;
}

/**
 * The EXIF orientation of a JPEG: 1 is upright, 2 to 8 say how the stored
 * pixels have to be mirrored or turned to show the picture upright. Gives 1
 * when the file has no orientation or cannot be read.
 */
export function readJpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;

  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return 1;

    const marker = view.getUint8(offset + 1);
    if (marker === 0xff) {
      // A fill byte before the marker.
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      // These markers stand alone, without a length.
      offset += 2;
      continue;
    }
    // EXIF sits in front of the picture data, so there is nothing to find after it starts.
    if (marker === 0xda || marker === 0xd9) return 1;

    const length = view.getUint16(offset + 2);
    if (length < 2) return 1;

    if (marker === 0xe1) {
      const end = Math.min(offset + 2 + length, view.byteLength);
      const orientation = readExifOrientation(view, offset + 4, end);
      if (orientation) return orientation;
    }

    offset += 2 + length;
  }

  return 1;
}

// ── Placement ─────────────────────────────────────────────────────────────────

/** Acrobat refuses pages longer than 200 inches (14400 units) on a side. */
export const MAX_PAGE_SIDE = 14400;

export interface ImagePlacement {
  pageWidth: number;
  pageHeight: number;
  /**
   * PDF transformation matrix [a b c d e f] that maps the image's unit square
   * onto the page: (x, y) goes to (a*x + c*y + e, b*x + d*y + f).
   */
  matrix: [number, number, number, number, number, number];
}

/**
 * Where an image goes on its page. The page gets the size of the upright image,
 * one unit per pixel, scaled down when a side would pass `MAX_PAGE_SIDE`.
 * `width` and `height` are the stored pixel size; `orientation` is the EXIF
 * value, and anything outside 1 to 8 counts as upright.
 */
export function placeImage(width: number, height: number, orientation = 1): ImagePlacement {
  const turned = orientation >= 5 && orientation <= 8;
  const scale = Math.min(1, MAX_PAGE_SIDE / Math.max(width, height));
  const w = width * scale;
  const h = height * scale;

  let matrix: ImagePlacement['matrix'];
  switch (orientation) {
    case 2: // mirrored left to right
      matrix = [-w, 0, 0, h, w, 0];
      break;
    case 3: // upside down
      matrix = [-w, 0, 0, -h, w, h];
      break;
    case 4: // mirrored top to bottom
      matrix = [w, 0, 0, -h, 0, h];
      break;
    case 5: // mirrored, then lying on its side
      matrix = [0, -w, -h, 0, h, w];
      break;
    case 6: // needs a quarter turn clockwise
      matrix = [0, -w, h, 0, 0, w];
      break;
    case 7: // mirrored, then lying on its other side
      matrix = [0, w, h, 0, 0, 0];
      break;
    case 8: // needs a quarter turn counter-clockwise
      matrix = [0, w, -h, 0, h, 0];
      break;
    default:
      matrix = [w, 0, 0, h, 0, 0];
  }

  return { pageWidth: turned ? h : w, pageHeight: turned ? w : h, matrix };
}

// ── PDF ───────────────────────────────────────────────────────────────────────

/** What is needed of a picked file: a `File` fits. */
export interface ImageFile extends Blob {
  readonly name: string;
}

/**
 * Builds a PDF with one page per image, in the given order, and resolves to
 * its bytes. Rejects with a message naming the file when one of them is not a
 * JPEG or PNG or is damaged, so that no image is ever left out silently.
 */
export async function imagesToPdf(files: readonly ImageFile[]): Promise<Uint8Array> {
  if (files.length === 0) throw new Error('There are no images to put in the PDF.');

  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    const bytes = new Uint8Array(await readFileAsArrayBuffer(file));
    const format = detectImageFormat(bytes);
    if (!format) throw new Error(`"${file.name}" is not a JPEG or PNG image.`);

    let image;
    try {
      image = format === 'jpeg' ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`"${file.name}" could not be read as an image: ${detail}`, { cause });
    }

    const orientation = format === 'jpeg' ? readJpegOrientation(bytes) : 1;
    const { pageWidth, pageHeight, matrix } = placeImage(image.width, image.height, orientation);

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(...matrix),
      drawObject(page.node.newXObject('Image', image.ref)),
      popGraphicsState()
    );
  }

  return pdfDoc.save();
}
