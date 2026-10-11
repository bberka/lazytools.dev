import { test, expect } from '@playwright/test';
import {
  colorValues,
  generateTheme,
  pickerPosition,
  readableTextColor,
  themeCss,
  themeDeclaration,
  tintsAndShades,
} from '@/lib/tools/color-picker';
import { hsvToRgb, parseHexColor } from '@/lib/tools/design-color';

const BLUE = { r: 59, g: 130, b: 246 };
const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

test.describe('colorValues', () => {
  test('lists the four copyable forms', () => {
    expect(colorValues(BLUE)).toEqual([
      { label: 'HEX', value: '#3B82F6' },
      { label: 'RGB', value: 'rgb(59, 130, 246)' },
      { label: 'HSL', value: 'hsl(217, 91%, 60%)' },
      { label: 'CSS Var', value: '--color-picked: #3B82F6;' },
    ]);
  });

  test('describes black and white without a stray hue', () => {
    expect(colorValues(BLACK)[2].value).toBe('hsl(0, 0%, 0%)');
    expect(colorValues(WHITE)[2].value).toBe('hsl(0, 0%, 100%)');
  });
});

test.describe('tintsAndShades', () => {
  test('runs from the darkest shade to the lightest tint around the base', () => {
    expect(tintsAndShades(BLUE)).toEqual([
      { label: 'Shade 40', hex: '#234E94' },
      { label: 'Shade 20', hex: '#2F68C5' },
      { label: 'Shade 10', hex: '#3575DD' },
      { label: 'Base', hex: '#3B82F6' },
      { label: 'Tint 10', hex: '#4F8FF7' },
      { label: 'Tint 20', hex: '#629BF8' },
      { label: 'Tint 40', hex: '#89B4FA' },
    ]);
  });

  test('leaves black shades black and white tints white', () => {
    const black = tintsAndShades(BLACK);
    const white = tintsAndShades(WHITE);

    expect(black.slice(0, 4).every((swatch) => swatch.hex === '#000000')).toBe(true);
    expect(white.slice(3).every((swatch) => swatch.hex === '#FFFFFF')).toBe(true);
  });
});

test.describe('readableTextColor', () => {
  test('picks dark text on light colours and white on dark ones', () => {
    expect(readableTextColor(WHITE)).toBe('#111827');
    expect(readableTextColor({ r: 250, g: 204, b: 21 })).toBe('#111827');
    expect(readableTextColor(BLACK)).toBe('#FFFFFF');
    expect(readableTextColor(BLUE)).toBe('#FFFFFF');
  });
});

test.describe('generateTheme', () => {
  const theme = generateTheme(BLUE);

  test('builds the twelve variables in a fixed order', () => {
    expect(theme.map((entry) => entry.variable)).toEqual([
      '--background',
      '--foreground',
      '--primary',
      '--primary-foreground',
      '--secondary',
      '--secondary-foreground',
      '--muted',
      '--muted-foreground',
      '--accent',
      '--accent-foreground',
      '--border',
      '--destructive',
    ]);
  });

  test('uses the picked colour as primary and derives the rest from its hue', () => {
    const byName = Object.fromEntries(theme.map((entry) => [entry.variable, entry.hsl]));

    expect(byName['--primary']).toEqual({ h: 217, s: 91, l: 60 });
    expect(byName['--secondary']).toEqual({ h: 37, s: 46, l: 50 });
    expect(byName['--accent']).toEqual({ h: 247, s: 68, l: 55 });
    expect(byName['--background']).toEqual({ h: 217, s: 7, l: 98 });
    expect(byName['--primary-foreground']).toEqual({ h: 0, s: 0, l: 98 });
  });

  test('gives every entry a hex colour that parses', () => {
    for (const entry of theme) {
      expect(parseHexColor(entry.hex), entry.variable).not.toBeNull();
    }
  });

  test('writes declarations and the :root block', () => {
    expect(themeDeclaration(theme[2])).toBe('--primary: 217 91% 60%;');

    const css = themeCss(theme);
    expect(css.startsWith(':root {\n  --background: 217 7% 98%;\n')).toBe(true);
    expect(css.endsWith('\n  --destructive: 0 72% 51%;\n}')).toBe(true);
    expect(css.split('\n')).toHaveLength(14);
  });

  test('wraps the derived hues round the circle', () => {
    // Primary hue 345: the complement is 165 and the accent wraps to 15.
    const byName = Object.fromEntries(
      generateTheme({ r: 255, g: 0, b: 64 }).map((entry) => [entry.variable, entry.hsl.h])
    );

    expect(byName['--primary']).toBe(345);
    expect(byName['--secondary']).toBe(165);
    expect(byName['--accent']).toBe(15);
  });

  test('gives each swatch a text colour that reads on it', () => {
    const byName = Object.fromEntries(theme.map((entry) => [entry.variable, entry.textColor]));

    expect(byName['--background']).toBe('#111827');
    expect(byName['--foreground']).toBe('#FFFFFF');
    expect(byName['--primary']).toBe('#FFFFFF');
  });
});

test.describe('pickerPosition', () => {
  test('derives the handle from the colour when nothing is remembered', () => {
    expect(pickerPosition({ r: 0, g: 0, b: 255 }, null)).toEqual({ h: 240, s: 100, v: 100 });
  });

  test('keeps the hue when the handle is dragged to the black edge', () => {
    // Defect: the bottom edge is black for every hue, and black converts back
    // to hue 0, so the field flipped to red in the middle of a drag.
    const dragged = { h: 217, s: 76, v: 0 };

    expect(hsvToRgb(dragged)).toEqual(BLACK);
    expect(pickerPosition(BLACK, dragged)).toEqual(dragged);
  });

  test('lets the hue move while the colour is white, grey or black', () => {
    // Defect: with no saturation the hue slider snapped back to 0 on every move.
    const turned = { h: 200, s: 0, v: 100 };

    expect(hsvToRgb(turned)).toEqual(WHITE);
    expect(pickerPosition(WHITE, turned).h).toBe(200);
  });

  test('keeps the handle where it was dropped when rounding would move it', () => {
    // Dark colours have few distinct 8-bit values: this spot reads back as
    // saturation 100, which would pull the handle away from the pointer.
    const dragged = { h: 217, s: 91, v: 2 };

    expect(pickerPosition(hsvToRgb(dragged), null).s).not.toBe(91);
    expect(pickerPosition(hsvToRgb(dragged), dragged)).toEqual(dragged);
  });

  test('follows the colour once it no longer matches what was remembered', () => {
    const remembered = { h: 217, s: 76, v: 96 };

    expect(pickerPosition({ r: 255, g: 0, b: 0 }, remembered)).toEqual({ h: 0, s: 100, v: 100 });
  });
});
