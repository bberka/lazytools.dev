import { test, expect } from '@playwright/test';
import { DEFAULT_PALETTE_SIZE, extractPalette } from '@/lib/tools/color-palette-extractor';

type Rgba = [number, number, number, number];

/** RGBA bytes for a run of pixels: `[colour, how many]` pairs. */
function pixels(...runs: Array<[Rgba, number]>): Uint8ClampedArray {
  return Uint8ClampedArray.from(runs.flatMap(([color, count]) => Array.from({ length: count }, () => color).flat()));
}

const opaque = (red: number, green: number, blue: number): Rgba => [red, green, blue, 255];

test.describe('extractPalette', () => {
  test('reports pure white as white', () => {
    // 255 rounds to 260 at a step of 10. That overflowed into the next
    // channel, and a white background came out as the near-black #050504.
    expect(extractPalette(pixels([opaque(255, 255, 255), 10]))).toEqual(['#ffffff']);
  });

  test('reports fully saturated colours as themselves', () => {
    // Same overflow: pure red used to be reported as #040000.
    expect(extractPalette(pixels([opaque(255, 0, 0), 4]))).toEqual(['#ff0000']);
    expect(extractPalette(pixels([opaque(0, 255, 0), 4]))).toEqual(['#00ff00']);
    expect(extractPalette(pixels([opaque(0, 0, 255), 4]))).toEqual(['#0000ff']);
    expect(extractPalette(pixels([opaque(255, 255, 0), 4]))).toEqual(['#ffff00']);
  });

  test('always returns a six-digit colour, for every channel value', () => {
    for (let value = 0; value <= 255; value += 1) {
      const [color] = extractPalette(pixels([opaque(value, value, value), 1]));
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      // A grey stays a grey, within the rounding step.
      const channel = parseInt(color.slice(1, 3), 16);
      expect(color).toBe(`#${color.slice(1, 3).repeat(3)}`);
      expect(Math.abs(channel - value)).toBeLessThanOrEqual(5);
    }
  });

  test('orders colours by how much of the image they cover', () => {
    const image = pixels([opaque(200, 30, 30), 5], [opaque(30, 30, 200), 20], [opaque(30, 200, 30), 10]);

    expect(extractPalette(image)).toEqual(['#1e1ec8', '#1ec81e', '#c81e1e']);
  });

  test('counts near-identical shades as one colour', () => {
    const image = pixels([opaque(12, 12, 12), 3], [opaque(14, 13, 11), 3], [opaque(100, 100, 100), 5]);

    expect(extractPalette(image)).toEqual(['#0a0a0a', '#646464']);
  });

  test('ignores pixels that are mostly transparent', () => {
    const image = pixels([[255, 0, 0, 0], 50], [[0, 255, 0, 127], 50], [[0, 0, 255, 128], 1]);

    expect(extractPalette(image)).toEqual(['#0000ff']);
  });

  test('returns nothing for a fully transparent image or no pixels at all', () => {
    expect(extractPalette(pixels([[10, 20, 30, 0], 100]))).toEqual([]);
    expect(extractPalette(new Uint8ClampedArray(0))).toEqual([]);
  });

  test('returns at most the requested number of colours', () => {
    const image = pixels(
      ...Array.from({ length: 20 }, (_, index): [Rgba, number] => [opaque(index * 10, 0, 0), 20 - index])
    );

    expect(extractPalette(image)).toHaveLength(DEFAULT_PALETTE_SIZE);
    expect(extractPalette(image, 3)).toEqual(['#000000', '#0a0000', '#140000']);
    expect(extractPalette(image, 0)).toEqual([]);
  });

  test('accepts plain arrays as well as image data', () => {
    expect(extractPalette([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255])).toEqual(['#000000', '#ffffff']);
  });
});
