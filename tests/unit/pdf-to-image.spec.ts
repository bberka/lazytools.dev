import { test, expect } from '@playwright/test';
import {
  MAX_CANVAS_PIXELS,
  RENDER_SCALE,
  describeFailedPages,
  pageRenderScale,
} from '@/lib/tools/pdf-to-image';

// Page sizes in PDF points.
const A4: [number, number] = [595.28, 841.89];
const A1: [number, number] = [1683.78, 2383.94];
const A0: [number, number] = [2383.94, 3370.39];
const ARCH_E: [number, number] = [2592, 3456];

const canvasPixels = ([width, height]: [number, number], scale: number) =>
  Math.floor(width * scale) * Math.floor(height * scale);

test.describe('pageRenderScale', () => {
  test('draws ordinary pages at the full scale', () => {
    expect(RENDER_SCALE).toBe(2);
    expect(pageRenderScale(...A4)).toBe(2);
    expect(pageRenderScale(A4[1], A4[0])).toBe(2);
    expect(pageRenderScale(...A1)).toBe(2);
  });

  test('lowers the scale of a page whose canvas would be too large', () => {
    for (const page of [A0, ARCH_E, [14400, 14400] as [number, number]]) {
      const scale = pageRenderScale(...page);

      expect(canvasPixels(page, RENDER_SCALE)).toBeGreaterThan(MAX_CANVAS_PIXELS);
      expect(scale).toBeLessThan(RENDER_SCALE);
      expect(scale).toBeGreaterThan(0);
      expect(canvasPixels(page, scale)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    }
  });

  test('uses as much of the allowed canvas as it can', () => {
    const scale = pageRenderScale(...A0);

    expect(A0[0] * scale * A0[1] * scale).toBeCloseTo(MAX_CANVAS_PIXELS, 0);
  });

  test('keeps the full scale exactly at the limit', () => {
    // 2048 x 2048 points at scale 2 is a 4096 x 4096 canvas.
    expect(pageRenderScale(2048, 2048)).toBe(2);
    expect(pageRenderScale(2049, 2048)).toBeLessThan(2);
  });

  test('takes the scale that was asked for into account', () => {
    expect(pageRenderScale(...A0, 1)).toBe(1);
    expect(pageRenderScale(...A4, 4)).toBe(4);
    expect(pageRenderScale(...A4, 8)).toBeLessThan(8);
  });

  test('falls back to the asked scale for a page without a size', () => {
    expect(pageRenderScale(0, 0)).toBe(2);
    expect(pageRenderScale(Number.NaN, 100)).toBe(2);
    expect(pageRenderScale(-10, 100)).toBe(2);
  });
});

// A page that could not be drawn used to be skipped, so every later image
// took the number of the page before it, and nothing was said.
test.describe('describeFailedPages', () => {
  test('says nothing when every page worked', () => {
    expect(describeFailedPages([], 12)).toBe('');
  });

  test('names a single page', () => {
    expect(describeFailedPages([3], 12)).toBe('Page 3 could not be rendered and is missing below.');
  });

  test('names several pages, with neighbours as ranges', () => {
    expect(describeFailedPages([2, 5], 12)).toBe('Pages 2, 5 could not be rendered and are missing below.');
    expect(describeFailedPages([1, 2, 3, 7, 9, 10], 12)).toBe(
      'Pages 1-3, 7, 9-10 could not be rendered and are missing below.'
    );
  });

  test('says so when no page could be drawn', () => {
    expect(describeFailedPages([1], 1)).toBe(
      'The page could not be rendered. The browser may be out of memory for images.'
    );
    expect(describeFailedPages([1, 2, 3], 3)).toBe(
      'None of the pages could be rendered. The browser may be out of memory for images.'
    );
  });
});
