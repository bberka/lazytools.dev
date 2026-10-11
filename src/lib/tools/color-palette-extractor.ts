/**
 * Color Palette Extractor logic: the most common colours in a block of
 * pixels. Pure, so it runs in Node; the component only supplies the pixels
 * of a scaled-down copy of the image.
 */

/** Similar colours are counted together: each channel is rounded to the nearest multiple of this. */
const CHANNEL_STEP = 10;
/** Pixels more transparent than this do not count. */
const MIN_ALPHA = 128;

export const DEFAULT_PALETTE_SIZE = 8;

// A channel of 255 rounds up to 260, which does not fit in a byte.
function quantize(channel: number): number {
  return Math.min(255, Math.round(channel / CHANNEL_STEP) * CHANNEL_STEP);
}

function toHex(red: number, green: number, blue: number): string {
  return `#${((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1)}`;
}

/**
 * The dominant colours of an image as lowercase `#rrggbb` strings, most
 * common first.
 *
 * `pixels` is RGBA, four bytes per pixel, as `ImageData.data` holds it.
 * Returns fewer than `maxColors` when the image has fewer distinct colours,
 * and none when it is fully transparent.
 */
export function extractPalette(pixels: ArrayLike<number>, maxColors = DEFAULT_PALETTE_SIZE): string[] {
  const counts = new Map<string, number>();

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] < MIN_ALPHA) continue;

    const hex = toHex(quantize(pixels[index]), quantize(pixels[index + 1]), quantize(pixels[index + 2]));
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, maxColors))
    .map(([color]) => color);
}
