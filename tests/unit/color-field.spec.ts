import { test, expect } from '@playwright/test';
import { fieldPositionOf, hsvAtFieldPoint } from '@/lib/tools/color-field';
import { pickerPosition } from '@/lib/tools/color-picker';
import { hsvToRgb, rgbToHex, rgbToHsv } from '@/lib/tools/design-color';

test.describe('hsvAtFieldPoint', () => {
  test('reads the corners of the square as the colours painted there', () => {
    // Defect: the pointer was read as HSL, so the pure-red corner picked white.
    const red = 0;
    expect(rgbToHex(hsvToRgb(hsvAtFieldPoint(red, 1, 0)))).toBe('#FF0000');
    expect(rgbToHex(hsvToRgb(hsvAtFieldPoint(red, 0, 0)))).toBe('#FFFFFF');
    expect(rgbToHex(hsvToRgb(hsvAtFieldPoint(red, 0, 1)))).toBe('#000000');
    expect(rgbToHex(hsvToRgb(hsvAtFieldPoint(red, 1, 1)))).toBe('#000000');
    expect(rgbToHex(hsvToRgb(hsvAtFieldPoint(120, 1, 0)))).toBe('#00FF00');
    expect(rgbToHex(hsvToRgb(hsvAtFieldPoint(240, 1, 0)))).toBe('#0000FF');
  });

  test('reads the middle of a blue square as the colour painted there', () => {
    expect(hsvAtFieldPoint(240, 0.5, 0.5)).toEqual({ h: 240, s: 50, v: 50 });
    expect(hsvToRgb(hsvAtFieldPoint(240, 0.5, 0.5))).toEqual({ r: 64, g: 64, b: 128 });
  });

  test('treats a pointer outside the square as the nearest edge', () => {
    expect(hsvAtFieldPoint(30, 1.7, -0.4)).toEqual({ h: 30, s: 100, v: 100 });
    expect(hsvAtFieldPoint(30, -3, 2)).toEqual({ h: 30, s: 0, v: 0 });
    expect(hsvAtFieldPoint(30, Number.NaN, Number.NaN)).toEqual({ h: 30, s: 0, v: 100 });
  });
});

test.describe('fieldPositionOf', () => {
  test('puts pure colours on the top edge and black on the bottom', () => {
    expect(fieldPositionOf(rgbToHsv({ r: 255, g: 0, b: 0 }))).toEqual({ left: 100, top: 0 });
    expect(fieldPositionOf(rgbToHsv({ r: 255, g: 255, b: 255 }))).toEqual({ left: 0, top: 0 });
    expect(fieldPositionOf(rgbToHsv({ r: 0, g: 0, b: 0 }))).toEqual({ left: 0, top: 100 });
    expect(fieldPositionOf(rgbToHsv({ r: 128, g: 128, b: 128 }))).toEqual({ left: 0, top: 50 });
  });

  test('keeps the marker inside the square', () => {
    expect(fieldPositionOf({ h: 0, s: 140, v: -20 })).toEqual({ left: 100, top: 100 });
  });
});

test.describe('the picked colour and the marker agree', () => {
  const COLOURS = [
    { name: 'red', rgb: { r: 255, g: 0, b: 0 } },
    { name: 'green', rgb: { r: 0, g: 255, b: 0 } },
    { name: 'blue', rgb: { r: 0, g: 0, b: 255 } },
    { name: 'grey', rgb: { r: 128, g: 128, b: 128 } },
    { name: 'black', rgb: { r: 0, g: 0, b: 0 } },
    { name: 'white', rgb: { r: 255, g: 255, b: 255 } },
  ];

  for (const { name, rgb } of COLOURS) {
    test(`${name} round-trips through the square`, () => {
      const hex = rgbToHex(rgb);
      const marker = fieldPositionOf(pickerPosition(rgb, null));
      const hsv = hsvAtFieldPoint(pickerPosition(rgb, null).h, marker.left / 100, marker.top / 100);

      expect(rgbToHex(hsvToRgb(hsv))).toBe(hex);
    });
  }

  test('a hue chosen on black or white is kept', () => {
    const remembered = { h: 200, s: 0, v: 0 };
    const marker = fieldPositionOf(pickerPosition({ r: 0, g: 0, b: 0 }, remembered));

    expect(marker).toEqual({ left: 0, top: 100 });
    expect(pickerPosition({ r: 0, g: 0, b: 0 }, remembered).h).toBe(200);
  });
});
