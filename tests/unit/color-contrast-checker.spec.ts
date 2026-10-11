import { test, expect } from '@playwright/test';
import {
  checkContrast,
  contrastRatio,
  formatRatio,
  relativeLuminance,
} from '@/lib/tools/color-contrast-checker';

const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

test.describe('relativeLuminance and contrastRatio', () => {
  test('puts black at 0 and white at 1', () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 12);
  });

  test('gives 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 10);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
  });

  test('does not depend on which colour is the text', () => {
    const blue = { r: 0, g: 102, b: 204 };
    expect(contrastRatio(blue, WHITE)).toBe(contrastRatio(WHITE, blue));
  });

  test('matches published WCAG figures', () => {
    // #767676 is the well-known lightest grey that passes AA on white (4.54:1);
    // #777777 just misses it (4.48:1).
    expect(contrastRatio({ r: 118, g: 118, b: 118 }, WHITE)).toBeCloseTo(4.54, 2);
    expect(contrastRatio({ r: 119, g: 119, b: 119 }, WHITE)).toBeCloseTo(4.48, 2);
  });
});

test.describe('formatRatio', () => {
  test('shows two decimals', () => {
    expect(formatRatio(21)).toBe('21.00:1');
    expect(formatRatio(1)).toBe('1.00:1');
    expect(formatRatio(4.5)).toBe('4.50:1');
    expect(formatRatio(4.54)).toBe('4.54:1');
  });

  test('rounds to the nearest hundredth like other contrast tools', () => {
    expect(formatRatio(5.5666)).toBe('5.57:1');
    expect(formatRatio(4.546)).toBe('4.55:1');
    expect(formatRatio(4.544)).toBe('4.54:1');
    expect(formatRatio(20.996)).toBe('21.00:1');
  });

  test('never rounds up onto a threshold the colours do not reach', () => {
    expect(formatRatio(4.4999)).toBe('4.49:1');
    expect(formatRatio(2.9998)).toBe('2.99:1');
    expect(formatRatio(6.9958)).toBe('6.99:1');
  });

  test('still rounds up when no threshold is involved', () => {
    // Above a threshold, or nowhere near one, rounding up claims nothing.
    expect(formatRatio(4.5049)).toBe('4.50:1');
    expect(formatRatio(4.506)).toBe('4.51:1');
    expect(formatRatio(3.996)).toBe('4.00:1');
  });
});

test.describe('checkContrast', () => {
  test('passes everything for black on white', () => {
    expect(checkContrast('#000000', '#FFFFFF')).toEqual({
      foreground: '#000000',
      background: '#FFFFFF',
      error: '',
      result: {
        ratio: expect.closeTo(21, 10),
        ratioLabel: '21.00:1',
        level: 'AAA',
        passAANormal: true,
        passAALarge: true,
        passAAANormal: true,
        passAAALarge: true,
      },
    });
  });

  test('grades each WCAG band', () => {
    // 5.57:1, 3.03:1 and 1.06:1 on white.
    expect(checkContrast('#0066CC', '#FFFFFF').result).toMatchObject({
      ratioLabel: '5.57:1',
      level: 'AA',
      passAANormal: true,
      passAALarge: true,
      passAAANormal: false,
      passAAALarge: true,
    });
    expect(checkContrast('#949494', '#FFFFFF').result).toMatchObject({
      level: 'AA Large',
      passAANormal: false,
      passAALarge: true,
      passAAANormal: false,
      passAAALarge: false,
    });
    expect(checkContrast('#F8F8F8', '#FFFFFF').result).toMatchObject({
      level: 'Fail',
      passAANormal: false,
      passAALarge: false,
      passAAANormal: false,
      passAAALarge: false,
    });
  });

  test('reads three-digit shorthand instead of reporting 0:1', () => {
    // Defect: #FFF and #000 were unreadable, so the tool showed "0.00:1 Fail".
    const check = checkContrast('#000', '#FFF');

    expect(check.foreground).toBe('#000000');
    expect(check.background).toBe('#FFFFFF');
    expect(check.result?.ratioLabel).toBe('21.00:1');
    expect(check.result?.level).toBe('AAA');
  });

  test('normalizes colours typed without a hash or in lower case', () => {
    // Defect: "0066cc" was measured but could not be painted in the preview.
    const check = checkContrast('0066cc', 'ffffff');

    expect(check.foreground).toBe('#0066CC');
    expect(check.background).toBe('#FFFFFF');
    expect(check.result?.level).toBe('AA');
  });

  test('reports unreadable colours instead of a failing ratio', () => {
    // Defect: any half-typed or empty colour produced a "0.00:1 Fail" verdict.
    expect(checkContrast('#12', '#FFFFFF')).toEqual({
      foreground: null,
      background: '#FFFFFF',
      result: null,
      error: 'Enter the foreground as a HEX color, such as #1E293B or #FFF.',
    });
    expect(checkContrast('#000000', 'white').error).toBe(
      'Enter the background as a HEX color, such as #1E293B or #FFF.'
    );
    expect(checkContrast('', '   ').error).toBe(
      'Enter the foreground and background as a HEX color, such as #1E293B or #FFF.'
    );
  });

  test('does not show a threshold next to a failing check', () => {
    // Defect: these pairs sit just under 3:1, 4.5:1 and 7:1. They were shown
    // as "3.00:1", "4.50:1" and "7.00:1" while the matching check failed.
    const large = checkContrast('#0099FF', '#FFFFFF').result;
    expect(large?.passAALarge).toBe(false);
    expect(large?.level).toBe('Fail');
    expect(large?.ratioLabel).toBe('2.99:1');

    const normal = checkContrast('#006FFB', '#FFFFFF').result;
    expect(normal?.passAANormal).toBe(false);
    expect(normal?.ratioLabel).toBe('4.49:1');

    const enhanced = checkContrast('#0050CA', '#FFFFFF').result;
    expect(enhanced?.passAAANormal).toBe(false);
    expect(enhanced?.ratioLabel).toBe('6.99:1');
  });
});
