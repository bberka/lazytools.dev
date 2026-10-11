/**
 * Colour conversions shared by the design tools: the colour picker, the
 * contrast checker and the glassmorphism and box-shadow generators.
 *
 * Channels are whole numbers: red, green and blue in 0..255, hue in 0..360
 * (a hue a fraction short of a full turn rounds to 360, the same colour as 0),
 * and saturation, lightness and value in 0..100. Everything here is pure, so
 * it runs in Node and in the browser.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const SHORT_HEX = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
const FULL_HEX = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

function clampChannel(value: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0;
}

/**
 * Reads `#RGB` or `#RRGGBB`, with or without the hash and in either case.
 * Anything else (a half-typed value, a colour name, `#RRGGBBAA`) is `null`
 * rather than a guess.
 */
export function parseHexColor(value: string): Rgb | null {
  const text = value.trim();

  const short = SHORT_HEX.exec(text);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16),
    };
  }

  const full = FULL_HEX.exec(text);
  if (!full) return null;

  return {
    r: parseInt(full[1], 16),
    g: parseInt(full[2], 16),
    b: parseInt(full[3], 16),
  };
}

/** `#RRGGBB` in upper case; channels are rounded and kept inside 0..255. */
export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel, 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** The `#RRGGBB` form of any hex colour `parseHexColor` accepts, or `null`. */
export function normalizeHexColor(value: string): string | null {
  const rgb = parseHexColor(value);
  return rgb ? rgbToHex(rgb) : null;
}

/** `rgba(r, g, b, a)` for a hex colour; an unreadable colour counts as black. */
export function hexToRgba(hex: string, alpha: number, separator = ', '): string {
  const { r, g, b } = parseHexColor(hex) ?? { r: 0, g: 0, b: 0 };
  return `rgba(${[r, g, b, alpha].join(separator)})`;
}

/** Hue in degrees (0..360) of a colour with some chroma; `delta` is max - min. */
function hueOf(red: number, green: number, blue: number, max: number, delta: number): number {
  let sector: number;
  if (max === red) {
    sector = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (max === green) {
    sector = (blue - red) / delta + 2;
  } else {
    sector = (red - green) / delta + 4;
  }
  return Math.round(sector * 60);
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(lightness * 100) };
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  return {
    h: hueOf(red, green, blue, max, delta),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

/**
 * HSL to RGB with the channels left as fractions. Use it where a decision
 * hangs on the exact colour (which text colour reads on it); rounding first
 * can tip a colour that sits on the threshold. Everything else wants
 * `hslToRgb`.
 */
export function hslToRgbUnrounded({ h, s, l }: Hsl): Rgb {
  const hue = (((h % 360) + 360) % 360) / 360;
  const saturation = Math.min(100, Math.max(0, s)) / 100;
  const lightness = Math.min(100, Math.max(0, l)) / 100;

  if (saturation === 0) {
    const gray = lightness * 255;
    return { r: gray, g: gray, b: gray };
  }

  const channel = (p: number, q: number, t: number) => {
    let turn = t;
    if (turn < 0) turn += 1;
    if (turn > 1) turn -= 1;
    if (turn < 1 / 6) return p + (q - p) * 6 * turn;
    if (turn < 1 / 2) return q;
    if (turn < 2 / 3) return p + (q - p) * (2 / 3 - turn) * 6;
    return p;
  };

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return {
    r: channel(p, q, hue + 1 / 3) * 255,
    g: channel(p, q, hue) * 255,
    b: channel(p, q, hue - 1 / 3) * 255,
  };
}

export function hslToRgb(hsl: Hsl): Rgb {
  const { r, g, b } = hslToRgbUnrounded(hsl);
  return { r: clampChannel(r, 255), g: clampChannel(g, 255), b: clampChannel(b, 255) };
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  return {
    h: delta === 0 ? 0 : hueOf(red, green, blue, max, delta),
    s: max === 0 ? 0 : Math.round((delta / max) * 100),
    v: Math.round(max * 100),
  };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const sector = (((h % 360) + 360) % 360) / 60;
  const saturation = Math.min(100, Math.max(0, s)) / 100;
  const value = Math.min(100, Math.max(0, v)) / 100;

  const chroma = value * saturation;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const floor = value - chroma;

  const [red, green, blue] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];

  return {
    r: clampChannel((red + floor) * 255, 255),
    g: clampChannel((green + floor) * 255, 255),
    b: clampChannel((blue + floor) * 255, 255),
  };
}
