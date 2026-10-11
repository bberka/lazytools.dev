/**
 * WCAG 2.1 contrast checking for a text colour on a background colour.
 *
 * Colours are hex strings (`#RRGGBB` or `#RGB`, hash optional). The ratio and
 * the four pass/fail checks follow success criteria 1.4.3 and 1.4.6, which
 * compare the exact ratio against the threshold with no rounding.
 */

import { parseHexColor, rgbToHex, type Rgb } from '@/lib/tools/design-color';

export type ContrastLevel = 'AAA' | 'AA' | 'AA Large' | 'Fail';

export interface ContrastResult {
  /** Exact ratio, between 1 and 21. */
  ratio: number;
  /** The ratio as shown, for example `4.49:1`. */
  ratioLabel: string;
  level: ContrastLevel;
  passAANormal: boolean;
  passAALarge: boolean;
  passAAANormal: boolean;
  passAAALarge: boolean;
}

export interface ContrastCheck {
  /** `#RRGGBB` form of each colour, or `null` when it could not be read. */
  foreground: string | null;
  background: string | null;
  /** The verdict, or `null` when either colour is unreadable. */
  result: ContrastResult | null;
  /** What to tell the user when there is no verdict; empty otherwise. */
  error: string;
}

/** Relative luminance of an sRGB colour, 0 for black to 1 for white. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Contrast ratio of two colours; the order does not matter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** The ratios the four checks compare against. */
const THRESHOLDS = [3, 4.5, 7];

/**
 * The ratio to two decimals, rounded as usual (5.5666 reads `5.57:1`) with
 * one exception: a ratio just under a threshold is cut instead, so 4.4999
 * reads `4.49:1` and the number on screen never claims a pass the colours do
 * not earn.
 */
export function formatRatio(ratio: number): string {
  const rounded = Number(ratio.toFixed(2));
  const overstates = THRESHOLDS.some((threshold) => ratio < threshold && rounded >= threshold);
  const shown = overstates ? Math.floor(ratio * 100) / 100 : rounded;
  return `${shown.toFixed(2)}:1`;
}

function levelOf(ratio: number): ContrastLevel {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA Large';
  return 'Fail';
}

/** Checks a text colour against a background colour. */
export function checkContrast(foreground: string, background: string): ContrastCheck {
  const text = parseHexColor(foreground);
  const surface = parseHexColor(background);

  if (!text || !surface) {
    const unreadable = [!text && 'foreground', !surface && 'background'].filter(Boolean);
    return {
      foreground: text ? rgbToHex(text) : null,
      background: surface ? rgbToHex(surface) : null,
      result: null,
      error: `Enter the ${unreadable.join(' and ')} as a HEX color, such as #1E293B or #FFF.`,
    };
  }

  const ratio = contrastRatio(text, surface);

  return {
    foreground: rgbToHex(text),
    background: rgbToHex(surface),
    result: {
      ratio,
      ratioLabel: formatRatio(ratio),
      level: levelOf(ratio),
      passAANormal: ratio >= 4.5,
      passAALarge: ratio >= 3,
      passAAANormal: ratio >= 7,
      passAAALarge: ratio >= 4.5,
    },
    error: '',
  };
}
