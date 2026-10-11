/**
 * Color Blindness Simulator logic: the kinds of colour vision deficiency the
 * tool knows, the colour matrix for each, and the matrix applied to pixels.
 *
 * The same matrices drive both outputs of the tool. The on-screen preview
 * hands them to an SVG `feColorMatrix` filter; the download runs
 * `simulateColorBlindness` over the image's pixels, which does what that
 * filter does without depending on the browser being able to filter a canvas.
 */

export type BlindnessType =
  | 'normal'
  | 'protanopia'
  | 'protanomaly'
  | 'deuteranopia'
  | 'deuteranomaly'
  | 'tritanopia'
  | 'tritanomaly'
  | 'achromatopsia'
  | 'achromatomaly';

/** Nine numbers, row by row: each output channel as a mix of red, green and blue. */
export type ColorMatrix = readonly [number, number, number, number, number, number, number, number, number];

export interface BlindnessInfo {
  name: string;
  description: string;
  /** Null for normal vision, which changes nothing. */
  matrix: ColorMatrix | null;
}

export const BLINDNESS_TYPES: Record<BlindnessType, BlindnessInfo> = {
  normal: { name: 'Normal Vision', description: 'Standard color vision', matrix: null },
  protanopia: {
    name: 'Protanopia',
    description: 'Red-blind (1% of males)',
    matrix: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],
  },
  protanomaly: {
    name: 'Protanomaly',
    description: 'Red-weak (1% of males)',
    matrix: [0.817, 0.183, 0, 0.333, 0.667, 0, 0, 0.125, 0.875],
  },
  deuteranopia: {
    name: 'Deuteranopia',
    description: 'Green-blind (1% of males)',
    matrix: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
  },
  deuteranomaly: {
    name: 'Deuteranomaly',
    description: 'Green-weak (6% of males)',
    matrix: [0.8, 0.2, 0, 0.258, 0.742, 0, 0, 0.142, 0.858],
  },
  tritanopia: {
    name: 'Tritanopia',
    description: 'Blue-blind (<1% of population)',
    matrix: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525],
  },
  tritanomaly: {
    name: 'Tritanomaly',
    description: 'Blue-weak (<1% of population)',
    matrix: [0.967, 0.033, 0, 0, 0.733, 0.267, 0, 0.183, 0.817],
  },
  achromatopsia: {
    name: 'Achromatopsia',
    description: 'Total color-blind (very rare)',
    matrix: [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114],
  },
  achromatomaly: {
    name: 'Achromatomaly',
    description: 'Total color-weak (very rare)',
    matrix: [0.618, 0.32, 0.062, 0.163, 0.775, 0.062, 0.163, 0.32, 0.516],
  },
};

/** The `values` attribute of an `feColorMatrix` that applies `matrix` and leaves alpha alone. */
export function colorMatrixValues(matrix: ColorMatrix): string {
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = matrix;
  return [m0, m1, m2, 0, 0, m3, m4, m5, 0, 0, m6, m7, m8, 0, 0, 0, 0, 0, 1, 0].join(' ');
}

// SVG filters work on linear light unless told otherwise, so the pixels are
// taken out of sRGB, mixed, and put back. Both directions are table lookups.
// 4096 steps are enough for every 8-bit value to survive the round trip.
const LINEAR_STEPS = 4095;

const TO_LINEAR = Float64Array.from({ length: 256 }, (_, value) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
});

const TO_SRGB = Uint8Array.from({ length: LINEAR_STEPS + 1 }, (_, step) => {
  const linear = step / LINEAR_STEPS;
  const channel = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(channel * 255);
});

function encode(linear: number): number {
  if (!(linear > 0)) return 0;
  return TO_SRGB[linear >= 1 ? LINEAR_STEPS : Math.round(linear * LINEAR_STEPS)];
}

/**
 * Applies a colour matrix to RGBA pixels in place, in linear light, the way
 * an `feColorMatrix` filter does. Alpha is not touched.
 */
export function applyColorMatrix(pixels: Uint8ClampedArray | Uint8Array, matrix: ColorMatrix): void {
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = matrix;

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const red = TO_LINEAR[pixels[index]];
    const green = TO_LINEAR[pixels[index + 1]];
    const blue = TO_LINEAR[pixels[index + 2]];

    pixels[index] = encode(m0 * red + m1 * green + m2 * blue);
    pixels[index + 1] = encode(m3 * red + m4 * green + m5 * blue);
    pixels[index + 2] = encode(m6 * red + m7 * green + m8 * blue);
  }
}

/**
 * Turns RGBA pixels (as in `ImageData.data`) into what someone with the
 * given colour vision would see. Works in place; normal vision is a no-op.
 */
export function simulateColorBlindness(pixels: Uint8ClampedArray | Uint8Array, type: BlindnessType): void {
  const { matrix } = BLINDNESS_TYPES[type];
  if (matrix) applyColorMatrix(pixels, matrix);
}
