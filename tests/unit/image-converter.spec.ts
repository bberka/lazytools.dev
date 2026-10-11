import { test, expect } from '@playwright/test';
import {
  ICO_MAX_SIDE,
  canvasFilter,
  cropToImagePixels,
  encodeIco,
  planOutput,
  type Adjustments,
  type OutputRequest,
} from '@/lib/tools/image-converter';

const photo = { width: 800, height: 600 };

const request = (overrides: Partial<OutputRequest> = {}): OutputRequest => ({
  maintainAspectRatio: true,
  format: 'png',
  ...overrides,
});

const untouched: Adjustments = {
  grayscale: false,
  sepia: false,
  blur: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
};

test.describe('planOutput', () => {
  test('keeps the source size when nothing is asked for', () => {
    expect(planOutput(photo, request())).toEqual({
      drawWidth: 800,
      drawHeight: 600,
      canvasWidth: 800,
      canvasHeight: 600,
    });
  });

  test('follows the proportions when one side is given', () => {
    expect(planOutput(photo, request({ width: 400 }))).toMatchObject({ drawWidth: 400, drawHeight: 300 });
    expect(planOutput(photo, request({ height: 150 }))).toMatchObject({ drawWidth: 200, drawHeight: 150 });
  });

  test('leaves the other side alone when proportions are not kept', () => {
    expect(planOutput(photo, request({ width: 400, maintainAspectRatio: false }))).toMatchObject({
      drawWidth: 400,
      drawHeight: 600,
    });
  });

  test('fits the image inside the box when both sides are given and proportions are kept', () => {
    // With "Maintain aspect ratio" ticked, 800x600 into 400x400 used to come
    // out as a stretched 400x400.
    expect(planOutput(photo, request({ width: 400, height: 400 }))).toMatchObject({
      drawWidth: 400,
      drawHeight: 300,
    });
    expect(planOutput(photo, request({ width: 1600, height: 300 }))).toMatchObject({
      drawWidth: 400,
      drawHeight: 300,
    });
  });

  test('stretches to the exact box when proportions are not kept', () => {
    expect(
      planOutput(photo, request({ width: 400, height: 400, maintainAspectRatio: false }))
    ).toMatchObject({ drawWidth: 400, drawHeight: 400 });
  });

  test('treats empty, zero, negative and unreadable sides as "work it out"', () => {
    // A negative width used to reach the canvas, which drew the image
    // mirrored onto a canvas of the default size.
    for (const side of ['', 0, -200, Number.NaN, Number.POSITIVE_INFINITY, null, undefined] as const) {
      expect(planOutput(photo, request({ width: side, height: side }))).toMatchObject({
        drawWidth: 800,
        drawHeight: 600,
      });
    }
  });

  test('gives whole pixels and never less than one', () => {
    // 1000x10 at width 10 is 0.1px tall. A canvas of height 0 encodes to
    // nothing, which left the tool processing forever.
    expect(planOutput({ width: 1000, height: 10 }, request({ width: 10 }))).toMatchObject({
      drawWidth: 10,
      drawHeight: 1,
    });
    expect(planOutput({ width: 3, height: 2 }, request({ width: 100 }))).toMatchObject({
      drawWidth: 100,
      drawHeight: 67,
    });
  });

  test('scales ICO output down to fit 256x256', () => {
    expect(planOutput({ width: 1024, height: 512 }, request({ format: 'ico' }))).toMatchObject({
      drawWidth: ICO_MAX_SIDE,
      drawHeight: 128,
    });
    expect(planOutput({ width: 64, height: 32 }, request({ format: 'ico' }))).toMatchObject({
      drawWidth: 64,
      drawHeight: 32,
    });
    expect(planOutput(photo, request({ format: 'ico', width: 2000 }))).toMatchObject({
      drawWidth: 256,
      drawHeight: 192,
    });
  });

  test('keeps the short side of a very long ICO at one pixel', () => {
    expect(planOutput({ width: 10000, height: 10 }, request({ format: 'ico' }))).toMatchObject({
      drawWidth: 256,
      drawHeight: 1,
    });
  });

  test('swaps the canvas sides for a quarter turn only', () => {
    expect(planOutput(photo, request({ rotation: 90 }))).toMatchObject({
      drawWidth: 800,
      drawHeight: 600,
      canvasWidth: 600,
      canvasHeight: 800,
    });
    expect(planOutput(photo, request({ rotation: 270 }))).toMatchObject({ canvasWidth: 600, canvasHeight: 800 });
    expect(planOutput(photo, request({ rotation: 180 }))).toMatchObject({ canvasWidth: 800, canvasHeight: 600 });
    expect(planOutput(photo, request({ rotation: 0 }))).toMatchObject({ canvasWidth: 800, canvasHeight: 600 });
  });

  test('returns null for a source without a pixel size', () => {
    expect(planOutput({ width: 0, height: 0 }, request())).toBeNull();
    expect(planOutput({ width: 100, height: 0 }, request())).toBeNull();
    expect(planOutput({ width: Number.NaN, height: 100 }, request())).toBeNull();
  });
});

test.describe('cropToImagePixels', () => {
  const displayed = { width: 400, height: 300 };

  test('maps the selection onto the image at its own scale', () => {
    // The download used to be multiplied by the device pixel ratio on top of
    // this, so it was larger than the "Crop: WxH" label on a HiDPI screen.
    expect(cropToImagePixels({ x: 10, y: 20, width: 100, height: 50 }, displayed, photo)).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 100,
    });
  });

  test('is the identity when the image is shown at full size', () => {
    const crop = { x: 5, y: 6, width: 70, height: 80 };
    expect(cropToImagePixels(crop, photo, photo)).toEqual(crop);
  });

  test('rounds to whole pixels', () => {
    expect(
      cropToImagePixels({ x: 10.4, y: 10.6, width: 33.3, height: 33.3 }, displayed, { width: 1000, height: 750 })
    ).toEqual({ x: 26, y: 27, width: 83, height: 83 });
  });

  test('keeps the rectangle inside the image', () => {
    expect(cropToImagePixels({ x: 350, y: 250, width: 100, height: 100 }, displayed, photo)).toEqual({
      x: 700,
      y: 500,
      width: 100,
      height: 100,
    });
    expect(cropToImagePixels({ x: -20, y: -20, width: 50, height: 50 }, displayed, photo)).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  test('returns null for an empty selection', () => {
    // A click without a drag completes a 0x0 selection. It used to enable the
    // download button, which then saved an empty file.
    expect(cropToImagePixels({ x: 50, y: 50, width: 0, height: 0 }, displayed, photo)).toBeNull();
    expect(cropToImagePixels({ x: 50, y: 50, width: 0.1, height: 40 }, displayed, photo)).toBeNull();
    expect(cropToImagePixels({ x: 400, y: 300, width: 20, height: 20 }, displayed, photo)).toBeNull();
  });

  test('returns null while the image has no size on screen', () => {
    expect(
      cropToImagePixels({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 }, photo)
    ).toBeNull();
  });
});

test.describe('canvasFilter', () => {
  test('is none when nothing is adjusted', () => {
    expect(canvasFilter(untouched)).toBe('none');
  });

  test('lists only the adjustments that change the image', () => {
    expect(canvasFilter({ ...untouched, grayscale: true })).toBe('grayscale(100%)');
    expect(canvasFilter({ ...untouched, blur: 4 })).toBe('blur(4px)');
    expect(canvasFilter({ ...untouched, brightness: 0 })).toBe('brightness(0%)');
  });

  test('keeps the order the editor has always applied them in', () => {
    expect(
      canvasFilter({ grayscale: true, sepia: true, blur: 2, brightness: 120, contrast: 80, saturation: 150 })
    ).toBe('grayscale(100%) sepia(100%) blur(2px) brightness(120%) contrast(80%) saturate(150%)');
  });
});

test.describe('encodeIco', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

  test('writes a one-image icon directory in front of the PNG', () => {
    const ico = encodeIco(png, 32, 16);
    const view = new DataView(ico.buffer);

    expect(ico.length).toBe(22 + png.length);
    expect(view.getUint16(0, true)).toBe(0); // reserved
    expect(view.getUint16(2, true)).toBe(1); // icon
    expect(view.getUint16(4, true)).toBe(1); // one image
    expect(ico[6]).toBe(32);
    expect(ico[7]).toBe(16);
    expect(view.getUint16(10, true)).toBe(1); // planes
    expect(view.getUint16(12, true)).toBe(32); // bits per pixel
    expect(view.getUint32(14, true)).toBe(png.length);
    expect(view.getUint32(18, true)).toBe(22);
    expect(Array.from(ico.subarray(22))).toEqual(Array.from(png));
  });

  test('stores a side of 256 as 0', () => {
    const ico = encodeIco(png, 256, 128);

    expect(ico[6]).toBe(0);
    expect(ico[7]).toBe(128);
  });
});
