/**
 * PDF Watermark logic: where the copies of a watermark go on a page, which
 * pages get one, and writing them into the document.
 *
 * The preview and the export place the watermark with the same
 * `layoutWatermark`, so the exported pages match what the preview shows. That
 * function works on the page as a viewer shows it; `watermarkPdf` translates
 * its result for pages that are rotated or cropped.
 *
 * Nothing here needs a browser. Text that the built-in PDF fonts cannot draw
 * is handed back to the caller to be drawn as a picture.
 */
import {
  StandardFontEmbedder,
  StandardFonts,
  degrees,
  rgb,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import { readFileAsArrayBuffer } from '@/lib/files';
import { parsePageRange } from '@/lib/pdf';
import {
  PdfToolError,
  loadPdf,
  noPagesMessage,
  pageFrame,
  toPageSpace,
  uprightSize,
  type PdfData,
  type Size,
  type UprightPlacement,
} from './pdf-page-ops';

// ── Pages ─────────────────────────────────────────────────────────────────────

/** Every page, the first, the last, or a 1-based list such as "1-3, 5". */
export type WatermarkPages = 'all' | 'first' | 'last' | { range: string };

/** The zero-based indices of the pages to mark, in document order. */
export function selectWatermarkPages(pages: WatermarkPages, pageCount: number): number[] {
  if (pageCount <= 0) return [];
  if (pages === 'all') return Array.from({ length: pageCount }, (_, index) => index);
  if (pages === 'first') return [0];
  if (pages === 'last') return [pageCount - 1];
  return parsePageRange(pages.range, pageCount);
}

// ── Layout ────────────────────────────────────────────────────────────────────

export type WatermarkPosition =
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'tiled';

export interface WatermarkLayout {
  position: WatermarkPosition;
  /** Text is turned by `angle` and tiled on a fixed grid; an image stays upright. */
  kind: 'text' | 'image';
  /** Clockwise angle in degrees, as the Angle control and the preview show it. Text only. */
  angle?: number;
}

/** Distance of a corner watermark from the page edges, in points. */
const CORNER_MARGIN = 20;

/**
 * Where the copies of a watermark of size `mark` go on an upright page.
 *
 * Each placement is the lower-left corner of one copy (for text, the start of
 * its baseline) in points from the page's lower-left corner, with the
 * counter-clockwise rotation about that corner. Sizes are in points.
 */
export function layoutWatermark(
  page: Size,
  mark: Size,
  layout: WatermarkLayout
): UprightPlacement[] {
  // The control turns clockwise as seen on screen; PDF rotations run the other way.
  const rotation = layout.kind === 'text' && layout.angle ? -layout.angle : 0;

  if (layout.position === 'tiled') {
    const [start, stepX, stepY] =
      layout.kind === 'text'
        ? [50, 220, 180]
        : [20, Math.max(150, mark.width + 40), Math.max(120, mark.height + 40)];
    const placements: UprightPlacement[] = [];

    for (let x = start; x < page.width; x += stepX) {
      for (let y = start; y < page.height; y += stepY) {
        placements.push({ x, y, rotation });
      }
    }
    return placements;
  }

  if (layout.position === 'center') {
    // Half the width back along the baseline and half the height down from the
    // middle of the page, so the middle of the mark sits on it at any angle.
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return [
      {
        x: page.width / 2 - (cos * mark.width) / 2 + (sin * mark.height) / 2,
        y: page.height / 2 - (sin * mark.width) / 2 - (cos * mark.height) / 2,
        rotation,
      },
    ];
  }

  const left = layout.position === 'top-left' || layout.position === 'bottom-left';
  const top = layout.position === 'top-left' || layout.position === 'top-right';

  return [
    {
      x: left ? CORNER_MARGIN : page.width - mark.width - CORNER_MARGIN,
      y: top ? page.height - mark.height - CORNER_MARGIN : CORNER_MARGIN,
      rotation,
    },
  ];
}

/** Moves a placement along its own axes: `along` its direction, `across` to the left of it. */
function shiftPlacement(
  placement: UprightPlacement,
  along: number,
  across: number
): UprightPlacement {
  const radians = (placement.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: placement.x + along * cos - across * sin,
    y: placement.y + along * sin + across * cos,
    rotation: placement.rotation,
  };
}

// ── Text ──────────────────────────────────────────────────────────────────────

export type WatermarkFont = 'Helvetica' | 'Times Roman' | 'Courier';

const STANDARD_FONTS: Record<WatermarkFont, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica,
  'Times Roman': StandardFonts.TimesRoman,
  Courier: StandardFonts.Courier,
};

type StandardFontName = Parameters<typeof StandardFontEmbedder.for>[0];

/**
 * The size of the text in points when it is drawn with a built-in PDF font,
 * or null when that font cannot draw it. The built-in fonts only know
 * Western European characters: no Turkish İ or ş, no Greek, Cyrillic, Arabic
 * or CJK, and no emoji.
 */
export function measureWatermarkText(text: string, font: WatermarkFont, size: number): Size | null {
  // The enum of pdf-lib and the one of its font package hold the same names.
  const embedder = StandardFontEmbedder.for(STANDARD_FONTS[font] as string as StandardFontName);

  try {
    return {
      width: embedder.widthOfTextAtSize(text, size),
      height: embedder.heightOfFontAtSize(size),
    };
  } catch {
    return null;
  }
}

/** Reads `#rgb` or `#rrggbb` into components from 0 to 1. Null for anything else. */
export function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex.trim());
  if (!match) return null;

  const digits =
    match[1].length === 3 ? Array.from(match[1], (digit) => digit + digit).join('') : match[1];

  return {
    r: parseInt(digits.slice(0, 2), 16) / 255,
    g: parseInt(digits.slice(2, 4), 16) / 255,
    b: parseInt(digits.slice(4, 6), 16) / 255,
  };
}

/** Text drawn as a picture, for text the built-in fonts cannot draw. */
export interface RasterizedText {
  /** PNG bytes or a `data:` URL, with a transparent background. */
  png: string | Uint8Array | ArrayBuffer;
  /** Size of the picture in points. */
  width: number;
  height: number;
  /** Distance from the bottom edge of the picture up to the text's baseline, in points. */
  baseline: number;
}

export interface TextWatermark {
  kind: 'text';
  text: string;
  font: WatermarkFont;
  /** Font size in points. */
  size: number;
  /** `#rrggbb`. Anything else is drawn red. */
  color: string;
  /** Clockwise angle in degrees, as the preview shows it. */
  angle: number;
  /**
   * Draws the text as a picture, in its colour and at full opacity. Called
   * only when the built-in font cannot draw the text; without it such text is
   * refused with a `PdfToolError`.
   */
  rasterize?: () => RasterizedText | Promise<RasterizedText>;
}

export interface ImageWatermark {
  kind: 'image';
  /** A PNG or JPEG file. The format is read from its bytes, not from its name or type. */
  image: Blob | ArrayBuffer | Uint8Array;
  /** Percent of the image's pixel size, one pixel counting as one point. */
  scale: number;
}

export type Watermark = TextWatermark | ImageWatermark;

export interface WatermarkOptions {
  position: WatermarkPosition;
  /** 0 (invisible) to 100 (solid). */
  opacity: number;
  pages: WatermarkPages;
}

// ── Writing ───────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** What `watermarkPdf` puts on each page: a size to lay out, and how to draw one copy. */
interface Stamp {
  size: Size;
  kind: WatermarkLayout['kind'];
  angle: number;
  /** How far below its placement the drawing starts: a picture of text begins under the baseline. */
  drop: number;
  /** Draws one copy at a placement given in the page's own coordinates. */
  draw(page: PDFPage, at: UprightPlacement): void;
}

/**
 * Adds the watermark to the chosen pages and returns the new document with
 * the 1-based numbers of the pages that were marked.
 */
export async function watermarkPdf(
  data: PdfData,
  watermark: Watermark,
  options: WatermarkOptions
): Promise<{ bytes: Uint8Array; pages: number[] }> {
  const pdf = await loadPdf(data);
  const pageCount = pdf.getPageCount();
  const indices = selectWatermarkPages(options.pages, pageCount);

  // Without this the document would be handed back unmarked, as if it had worked.
  if (indices.length === 0) {
    const range = typeof options.pages === 'object' ? options.pages.range : '';
    throw new PdfToolError(noPagesMessage(range, pageCount));
  }

  const opacity = Math.min(Math.max(options.opacity, 0), 100) / 100;
  let stamp: Stamp;

  if (watermark.kind === 'text') {
    const { text, font, size, angle } = watermark;
    if (!text.trim()) throw new PdfToolError('Enter the watermark text first.');

    const textSize = measureWatermarkText(text, font, size);

    if (textSize) {
      const embeddedFont = await pdf.embedFont(STANDARD_FONTS[font]);
      const { r, g, b } = parseHexColor(watermark.color) ?? { r: 1, g: 0, b: 0 };
      const color = rgb(r, g, b);

      stamp = {
        size: textSize,
        kind: 'text',
        angle,
        drop: 0,
        draw(page, { x, y, rotation }) {
          page.drawText(text, {
            x,
            y,
            size,
            font: embeddedFont,
            color,
            opacity,
            rotate: degrees(rotation),
          });
        },
      };
    } else {
      if (!watermark.rasterize) {
        throw new PdfToolError(
          `The ${font} font cannot draw this text. Use Western European characters only.`
        );
      }

      const picture = await watermark.rasterize();
      const image = await pdf.embedPng(picture.png);

      stamp = {
        size: { width: picture.width, height: picture.height },
        kind: 'text',
        angle,
        drop: picture.baseline,
        draw(page, { x, y, rotation }) {
          page.drawImage(image, {
            x,
            y,
            width: picture.width,
            height: picture.height,
            opacity,
            rotate: degrees(rotation),
          });
        },
      };
    }
  } else {
    const source = watermark.image;
    const bytes = new Uint8Array(
      source instanceof Blob ? await readFileAsArrayBuffer(source) : source
    );

    let image: PDFImage;
    try {
      image = isPng(bytes) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch (cause) {
      throw new PdfToolError('The watermark image could not be read. Use a PNG or JPEG file.', {
        cause,
      });
    }

    const size = {
      width: (image.width * watermark.scale) / 100,
      height: (image.height * watermark.scale) / 100,
    };

    stamp = {
      size,
      kind: 'image',
      angle: 0,
      drop: 0,
      draw(page, { x, y, rotation }) {
        page.drawImage(image, {
          x,
          y,
          width: size.width,
          height: size.height,
          opacity,
          rotate: degrees(rotation),
        });
      },
    };
  }

  for (const index of indices) {
    const page = pdf.getPage(index);
    const frame = pageFrame(page);
    const placements = layoutWatermark(uprightSize(frame), stamp.size, {
      position: options.position,
      kind: stamp.kind,
      angle: stamp.angle,
    });

    for (const placement of placements) {
      stamp.draw(page, toPageSpace(frame, shiftPlacement(placement, 0, -stamp.drop)));
    }
  }

  return { bytes: await pdf.save(), pages: indices.map((index) => index + 1) };
}
