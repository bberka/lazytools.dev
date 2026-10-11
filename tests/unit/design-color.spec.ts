import { test, expect } from '@playwright/test';
import {
  hexToRgba,
  hslToRgb,
  hsvToRgb,
  normalizeHexColor,
  parseHexColor,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
} from '@/lib/tools/design-color';

test.describe('parseHexColor', () => {
  test('reads six-digit hex with or without the hash, in either case', () => {
    expect(parseHexColor('#3B82F6')).toEqual({ r: 59, g: 130, b: 246 });
    expect(parseHexColor('3b82f6')).toEqual({ r: 59, g: 130, b: 246 });
    expect(parseHexColor('  #000000 ')).toEqual({ r: 0, g: 0, b: 0 });
  });

  test('expands three-digit shorthand', () => {
    expect(parseHexColor('#0AF')).toEqual({ r: 0, g: 170, b: 255 });
    expect(parseHexColor('fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  test('rejects anything that is not a whole hex colour', () => {
    for (const value of ['', '   ', '#', '#f', '#ff', '#ff00', '#ff000', '#ff00000', '#ggg', 'red', 'none', '#12345g']) {
      expect(parseHexColor(value), value).toBeNull();
    }
  });
});

test.describe('rgbToHex and normalizeHexColor', () => {
  test('writes upper-case #RRGGBB', () => {
    expect(rgbToHex({ r: 59, g: 130, b: 246 })).toBe('#3B82F6');
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
  });

  test('rounds fractions and keeps channels inside 0..255', () => {
    expect(rgbToHex({ r: 254.6, g: -20, b: 300 })).toBe('#FF00FF');
    expect(rgbToHex({ r: Number.NaN, g: 0.4, b: 0.5 })).toBe('#000001');
  });

  test('normalizes every accepted spelling to the same text', () => {
    expect(normalizeHexColor('0af')).toBe('#00AAFF');
    expect(normalizeHexColor('#00aaff')).toBe('#00AAFF');
    expect(normalizeHexColor('#00aa')).toBeNull();
  });
});

test.describe('hexToRgba', () => {
  test('uses the CSS spacing by default and a custom separator on request', () => {
    expect(hexToRgba('#ffffff', 0.15)).toBe('rgba(255, 255, 255, 0.15)');
    expect(hexToRgba('#EC4899', 0.4, ',')).toBe('rgba(236,72,153,0.4)');
  });

  test('treats an unreadable colour as black instead of inventing one', () => {
    // The old per-tool parsers turned "red" into cyan and "#ff00" into green.
    expect(hexToRgba('red', 1)).toBe('rgba(0, 0, 0, 1)');
    expect(hexToRgba('#ff00', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
  });
});

test.describe('HSL', () => {
  test('converts the primaries and greys', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 100, l: 50 });
    expect(rgbToHsl({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, l: 50 });
    expect(rgbToHsl({ r: 128, g: 128, b: 128 })).toEqual({ h: 0, s: 0, l: 50 });
    expect(rgbToHsl({ r: 59, g: 130, b: 246 })).toEqual({ h: 217, s: 91, l: 60 });
  });

  test('rounds a hue a fraction short of a full turn to 360', () => {
    // 359.76 degrees. 360 is the same colour as 0 and the top of the hue slider.
    expect(rgbToHsl({ r: 255, g: 0, b: 1 })).toEqual({ h: 360, s: 100, l: 50 });
    expect(rgbToHsv({ r: 255, g: 0, b: 1 })).toEqual({ h: 360, s: 100, v: 100 });
    expect(hslToRgb({ h: 360, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hsvToRgb({ h: 360, s: 100, v: 100 })).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('converts back to whole channels', () => {
    expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hslToRgb({ h: 360, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hslToRgb({ h: 217, s: 91, l: 60 })).toEqual({ r: 60, g: 131, b: 246 });
    expect(hslToRgb({ h: 123, s: 0, l: 100 })).toEqual({ r: 255, g: 255, b: 255 });
  });
});

test.describe('HSV', () => {
  test('converts the primaries, black, white and a grey', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, v: 100 });
    expect(rgbToHsv({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, v: 100 });
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 });
    expect(rgbToHsv({ r: 255, g: 255, b: 255 })).toEqual({ h: 0, s: 0, v: 100 });
    expect(rgbToHsv({ r: 128, g: 128, b: 128 })).toEqual({ h: 0, s: 0, v: 50 });
  });

  test('converts back for every sector of the hue circle', () => {
    expect(hsvToRgb({ h: 0, s: 100, v: 100 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hsvToRgb({ h: 60, s: 100, v: 100 })).toEqual({ r: 255, g: 255, b: 0 });
    expect(hsvToRgb({ h: 120, s: 100, v: 100 })).toEqual({ r: 0, g: 255, b: 0 });
    expect(hsvToRgb({ h: 180, s: 100, v: 100 })).toEqual({ r: 0, g: 255, b: 255 });
    expect(hsvToRgb({ h: 240, s: 100, v: 100 })).toEqual({ r: 0, g: 0, b: 255 });
    expect(hsvToRgb({ h: 300, s: 100, v: 100 })).toEqual({ r: 255, g: 0, b: 255 });
    expect(hsvToRgb({ h: 360, s: 100, v: 100 })).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('matches what a saturation/value square paints at a point', () => {
    // The square is the hue, washed to white on the left and to black at the
    // bottom. Half-way across and half-way down a blue square is (64, 64, 128).
    expect(hsvToRgb({ h: 240, s: 50, v: 50 })).toEqual({ r: 64, g: 64, b: 128 });
    // Top right is the pure hue, top left is white, the bottom edge is black.
    expect(hsvToRgb({ h: 240, s: 100, v: 100 })).toEqual({ r: 0, g: 0, b: 255 });
    expect(hsvToRgb({ h: 240, s: 0, v: 100 })).toEqual({ r: 255, g: 255, b: 255 });
    expect(hsvToRgb({ h: 240, s: 80, v: 0 })).toEqual({ r: 0, g: 0, b: 0 });
  });

  test('round-trips every colour it can describe exactly', () => {
    for (const rgb of [
      { r: 255, g: 128, b: 0 },
      { r: 0, g: 128, b: 255 },
      { r: 51, g: 51, b: 51 },
      { r: 255, g: 255, b: 255 },
    ]) {
      expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb);
    }
  });
});
