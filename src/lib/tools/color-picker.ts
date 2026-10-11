/**
 * Colour picker logic: the copyable values of a colour, its tints and shades,
 * a UI theme derived from it, and the position of the picker handle.
 *
 * The picker field is a saturation/value square, so its handle lives in HSV.
 * Pure functions only; conversions come from `design-color`.
 */

import {
  hslToRgb,
  hslToRgbUnrounded,
  hsvToRgb,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  type Hsl,
  type Hsv,
  type Rgb,
} from '@/lib/tools/design-color';

export interface LabelledValue {
  label: string;
  value: string;
}

export interface Swatch {
  label: string;
  hex: string;
}

export interface ThemeEntry {
  variable: string;
  label: string;
  hsl: Hsl;
  hex: string;
  /** Text colour that reads on `hex`. */
  textColor: string;
}

/** The values offered for copying, in the order they are shown. */
export function colorValues(rgb: Rgb): LabelledValue[] {
  const hex = rgbToHex(rgb);
  const hsl = rgbToHsl(rgb);

  return [
    { label: 'HEX', value: hex },
    { label: 'RGB', value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
    { label: 'HSL', value: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` },
    { label: 'CSS Var', value: `--color-picked: ${hex};` },
  ];
}

function mix(rgb: Rgb, target: 0 | 255, amount: number): Rgb {
  return {
    r: rgb.r + (target - rgb.r) * amount,
    g: rgb.g + (target - rgb.g) * amount,
    b: rgb.b + (target - rgb.b) * amount,
  };
}

/** Three shades, the colour itself and three tints, darkest first. */
export function tintsAndShades(rgb: Rgb): Swatch[] {
  return [
    { label: 'Shade 40', hex: rgbToHex(mix(rgb, 0, 0.4)) },
    { label: 'Shade 20', hex: rgbToHex(mix(rgb, 0, 0.2)) },
    { label: 'Shade 10', hex: rgbToHex(mix(rgb, 0, 0.1)) },
    { label: 'Base', hex: rgbToHex(rgb) },
    { label: 'Tint 10', hex: rgbToHex(mix(rgb, 255, 0.1)) },
    { label: 'Tint 20', hex: rgbToHex(mix(rgb, 255, 0.2)) },
    { label: 'Tint 40', hex: rgbToHex(mix(rgb, 255, 0.4)) },
  ];
}

function luma({ r, g, b }: Rgb): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function isLight(rgb: Rgb): boolean {
  return luma(rgb) > 0.62;
}

/** Near-black on light colours, white on dark ones. */
export function readableTextColor(rgb: Rgb): string {
  return isLight(rgb) ? '#111827' : '#FFFFFF';
}

// Light or dark is judged on the exact colour: rounding to whole channels
// first would tip the ones that sit right on the threshold.
function readableHsl(hsl: Hsl): Hsl {
  return isLight(hslToRgbUnrounded(hsl)) ? { h: 0, s: 0, l: 5 } : { h: 0, s: 0, l: 98 };
}

/** A twelve-variable UI theme built around `rgb` as the primary colour. */
export function generateTheme(rgb: Rgb): ThemeEntry[] {
  const primary = rgbToHsl(rgb);
  const { h, s } = primary;
  const faint = Math.round(Math.min(s * 0.08, 8));
  const secondary: Hsl = { h: (h + 180) % 360, s: Math.round(s * 0.5), l: 50 };
  const accent: Hsl = { h: (h + 30) % 360, s: Math.round(s * 0.75), l: 55 };

  const entries: Array<[variable: string, label: string, hsl: Hsl]> = [
    ['--background', 'Background', { h, s: faint, l: 98 }],
    ['--foreground', 'Foreground', { h, s: faint, l: 5 }],
    ['--primary', 'Primary', primary],
    ['--primary-foreground', 'Primary Foreground', readableHsl(primary)],
    ['--secondary', 'Secondary', secondary],
    ['--secondary-foreground', 'Secondary Foreground', readableHsl(secondary)],
    ['--muted', 'Muted', { h, s: Math.round(s * 0.12), l: 93 }],
    ['--muted-foreground', 'Muted Foreground', { h, s: faint, l: 45 }],
    ['--accent', 'Accent', accent],
    ['--accent-foreground', 'Accent Foreground', readableHsl(accent)],
    ['--border', 'Border', { h, s: Math.round(s * 0.1), l: 88 }],
    ['--destructive', 'Destructive', { h: 0, s: 72, l: 51 }],
  ];

  return entries.map(([variable, label, hsl]) => ({
    variable,
    label,
    hsl,
    hex: rgbToHex(hslToRgb(hsl)),
    textColor: readableTextColor(hslToRgbUnrounded(hsl)),
  }));
}

/** One theme variable as a declaration: `--primary: 217 91% 60%;`. */
export function themeDeclaration({ variable, hsl }: ThemeEntry): string {
  return `${variable}: ${hsl.h} ${hsl.s}% ${hsl.l}%;`;
}

/** The whole theme as a `:root` block. */
export function themeCss(theme: ThemeEntry[]): string {
  return `:root {\n${theme.map((entry) => `  ${themeDeclaration(entry)}`).join('\n')}\n}`;
}

/**
 * Where the picker handle sits for `rgb`.
 *
 * Black, white and the greys have no hue, and black has no saturation either,
 * so converting the colour back would throw the handle to red or to a corner.
 * `remembered` is the position the user last dragged to: while it still
 * describes `rgb` it wins, which keeps the hue and the handle steady.
 */
export function pickerPosition(rgb: Rgb, remembered: Hsv | null): Hsv {
  if (remembered && rgbToHex(hsvToRgb(remembered)) === rgbToHex(rgb)) {
    return remembered;
  }
  return rgbToHsv(rgb);
}
