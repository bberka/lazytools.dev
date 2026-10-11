/**
 * Image Converter & Editor logic that needs no canvas: how large the output
 * is, which rectangle of the image a crop selection covers, the CSS filter
 * for the adjustments, and the ICO container. Everything here is pure.
 */

export type OutputFormat = 'png' | 'jpeg' | 'webp' | 'ico';

export interface Size {
  width: number;
  height: number;
}

// ── Output size ───────────────────────────────────────────────────────────────

export interface OutputRequest {
  /** Requested width in pixels. Empty, zero, negative or not a number means "work it out". */
  width?: number | '' | null;
  /** Requested height in pixels, with the same rule as `width`. */
  height?: number | '' | null;
  /**
   * Keep the image's proportions. With one side given the other follows; with
   * both given the image is fitted inside that box instead of stretched to it.
   */
  maintainAspectRatio: boolean;
  /** Clockwise rotation in degrees. A quarter turn (90, 270) swaps the canvas sides. */
  rotation?: number;
  format: OutputFormat;
}

export interface OutputPlan {
  /** Size the image is drawn at, before it is rotated. */
  drawWidth: number;
  drawHeight: number;
  /** Size of the canvas, after rotation. */
  canvasWidth: number;
  canvasHeight: number;
}

/** The largest side an ICO directory entry can describe. */
export const ICO_MAX_SIDE = 256;

function requestedSide(value: number | '' | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.round(value) : null;
}

/**
 * Works out the output size in whole pixels, never smaller than 1x1. ICO
 * output is scaled down to fit 256x256. Returns null for a source without a
 * pixel size, which cannot be drawn.
 */
export function planOutput(source: Size, request: OutputRequest): OutputPlan | null {
  if (!(source.width > 0) || !(source.height > 0)) return null;

  const requestedWidth = requestedSide(request.width);
  const requestedHeight = requestedSide(request.height);
  let width = requestedWidth ?? source.width;
  let height = requestedHeight ?? source.height;

  if (request.maintainAspectRatio) {
    if (requestedWidth !== null && requestedHeight !== null) {
      const scale = Math.min(requestedWidth / source.width, requestedHeight / source.height);
      width = source.width * scale;
      height = source.height * scale;
    } else if (requestedWidth !== null) {
      height = (source.height * requestedWidth) / source.width;
    } else if (requestedHeight !== null) {
      width = (source.width * requestedHeight) / source.height;
    }
  }

  if (request.format === 'ico') {
    const largestSide = Math.max(width, height);
    if (largestSide > ICO_MAX_SIDE) {
      const scale = ICO_MAX_SIDE / largestSide;
      width *= scale;
      height *= scale;
    }
  }

  const drawWidth = Math.max(1, Math.round(width));
  const drawHeight = Math.max(1, Math.round(height));
  const quarterTurn = Math.abs(Math.round((request.rotation ?? 0) / 90)) % 2 === 1;

  return {
    drawWidth,
    drawHeight,
    canvasWidth: quarterTurn ? drawHeight : drawWidth,
    canvasHeight: quarterTurn ? drawWidth : drawHeight,
  };
}

// ── Crop ──────────────────────────────────────────────────────────────────────

export interface Rect extends Size {
  x: number;
  y: number;
}

/**
 * Maps a crop selection, measured on the image as it is displayed, onto the
 * image's own pixels. The result is in whole pixels and stays inside the
 * image, so the size shown to the user is the size of the file they get.
 * Returns null when nothing is left to crop.
 */
export function cropToImagePixels(crop: Rect, displayed: Size, natural: Size): Rect | null {
  if (!(displayed.width > 0) || !(displayed.height > 0)) return null;

  const scaleX = natural.width / displayed.width;
  const scaleY = natural.height / displayed.height;
  const x = Math.min(Math.max(Math.round(crop.x * scaleX), 0), natural.width);
  const y = Math.min(Math.max(Math.round(crop.y * scaleY), 0), natural.height);
  const width = Math.min(Math.round(crop.width * scaleX), natural.width - x);
  const height = Math.min(Math.round(crop.height * scaleY), natural.height - y);

  if (!(width >= 1) || !(height >= 1)) return null;
  return { x, y, width, height };
}

// ── Adjustments ───────────────────────────────────────────────────────────────

export interface Adjustments {
  grayscale: boolean;
  sepia: boolean;
  /** Blur radius in pixels. */
  blur: number;
  /** Percentages, 100 leaves the image as it is. */
  brightness: number;
  contrast: number;
  saturation: number;
}

/**
 * The canvas `filter` value for a set of adjustments, or `none` when they
 * leave the image untouched, so the caller can tell whether a filter is
 * needed at all.
 */
export function canvasFilter(adjustments: Adjustments): string {
  const parts: string[] = [];
  if (adjustments.grayscale) parts.push('grayscale(100%)');
  if (adjustments.sepia) parts.push('sepia(100%)');
  if (adjustments.blur > 0) parts.push(`blur(${adjustments.blur}px)`);
  if (adjustments.brightness !== 100) parts.push(`brightness(${adjustments.brightness}%)`);
  if (adjustments.contrast !== 100) parts.push(`contrast(${adjustments.contrast}%)`);
  if (adjustments.saturation !== 100) parts.push(`saturate(${adjustments.saturation}%)`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

// ── ICO ───────────────────────────────────────────────────────────────────────

const ICO_HEADER_SIZE = 6;
const ICO_ENTRY_SIZE = 16;

/**
 * Wraps one PNG image in an ICO container: a header, a single directory
 * entry and the PNG bytes as they are. `width` and `height` are the PNG's
 * pixel size, at most 256 each.
 */
export function encodeIco(png: Uint8Array, width: number, height: number): Uint8Array<ArrayBuffer> {
  const imageOffset = ICO_HEADER_SIZE + ICO_ENTRY_SIZE;
  const ico = new Uint8Array(imageOffset + png.length);
  const view = new DataView(ico.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, 1, true); // number of images

  // One byte per side; 0 stands for 256.
  ico[6] = width >= ICO_MAX_SIDE ? 0 : width;
  ico[7] = height >= ICO_MAX_SIDE ? 0 : height;
  ico[8] = 0; // palette size
  ico[9] = 0; // reserved
  view.setUint16(10, 1, true); // colour planes
  view.setUint16(12, 32, true); // bits per pixel
  view.setUint32(14, png.length, true);
  view.setUint32(18, imageOffset, true);
  ico.set(png, imageOffset);

  return ico;
}
