import { test, expect } from '@playwright/test';
import {
  BLINDNESS_TYPES,
  applyColorMatrix,
  colorMatrixValues,
  simulateColorBlindness,
  type BlindnessType,
} from '@/lib/tools/color-blindness-simulator';

const TYPES = Object.keys(BLINDNESS_TYPES) as BlindnessType[];

/** One pixel through the simulation. */
function simulate(type: BlindnessType, red: number, green: number, blue: number, alpha = 255): number[] {
  const pixel = Uint8ClampedArray.from([red, green, blue, alpha]);
  simulateColorBlindness(pixel, type);
  return Array.from(pixel);
}

function expectWithinOne(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThanOrEqual(1));
}

test.describe('BLINDNESS_TYPES', () => {
  test('lists the nine kinds in the order the tool shows them', () => {
    expect(TYPES).toEqual([
      'normal',
      'protanopia',
      'protanomaly',
      'deuteranopia',
      'deuteranomaly',
      'tritanopia',
      'tritanomaly',
      'achromatopsia',
      'achromatomaly',
    ]);
  });

  test('has a matrix for everything except normal vision', () => {
    for (const type of TYPES) {
      expect(BLINDNESS_TYPES[type].matrix === null).toBe(type === 'normal');
    }
  });

  test('every matrix row adds up to one, so neutral colours stay neutral', () => {
    for (const type of TYPES) {
      const matrix = BLINDNESS_TYPES[type].matrix;
      if (!matrix) continue;
      for (let row = 0; row < 3; row += 1) {
        const sum = matrix[row * 3] + matrix[row * 3 + 1] + matrix[row * 3 + 2];
        expect(sum).toBeCloseTo(1, 2);
      }
    }
  });
});

test.describe('colorMatrixValues', () => {
  test('writes the feColorMatrix rows with alpha untouched', () => {
    const matrix = BLINDNESS_TYPES.protanopia.matrix;
    expect(matrix).not.toBeNull();
    if (!matrix) return;

    expect(colorMatrixValues(matrix)).toBe('0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 1 0');
  });
});

test.describe('applyColorMatrix', () => {
  test('the identity matrix returns every 8-bit value unchanged', () => {
    const before = Uint8ClampedArray.from({ length: 256 * 4 }, (_, index) => (index % 4 === 3 ? 255 : index >> 2));
    const after = before.slice();

    applyColorMatrix(after, [1, 0, 0, 0, 1, 0, 0, 0, 1]);

    expect(Array.from(after)).toEqual(Array.from(before));
  });

  test('clamps results that leave the 0 to 1 range', () => {
    const pixel = Uint8ClampedArray.from([200, 200, 200, 255]);

    applyColorMatrix(pixel, [3, 0, 0, 0, -1, 0, 0, 0, 1]);

    expect(Array.from(pixel)).toEqual([255, 0, 200, 255]);
  });

  test('ignores a trailing partial pixel', () => {
    const data = Uint8ClampedArray.from([255, 0, 0, 255, 9, 9]);

    applyColorMatrix(data, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

    expect(Array.from(data)).toEqual([0, 0, 0, 255, 9, 9]);
  });
});

test.describe('simulateColorBlindness', () => {
  test('normal vision changes nothing', () => {
    expect(simulate('normal', 12, 200, 99, 40)).toEqual([12, 200, 99, 40]);
  });

  test('never touches alpha', () => {
    for (const type of TYPES) {
      for (const alpha of [0, 1, 128, 254, 255]) {
        expect(simulate(type, 10, 120, 240, alpha)[3]).toBe(alpha);
      }
    }
  });

  test('keeps black black and white white for every kind', () => {
    for (const type of TYPES) {
      expect(simulate(type, 0, 0, 0)).toEqual([0, 0, 0, 255]);
      expectWithinOne(simulate(type, 255, 255, 255), [255, 255, 255, 255]);
    }
  });

  test('achromatopsia removes all colour', () => {
    for (const [red, green, blue] of [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [12, 200, 99],
      [250, 128, 3],
    ]) {
      const [r, g, b] = simulate('achromatopsia', red, green, blue);
      expect(g).toBe(r);
      expect(b).toBe(r);
    }
  });

  test('mixes in linear light, as the preview filter does', () => {
    // An SVG colour matrix filter works on linear light by default. Pure red
    // at a 0.299 weight is 149 that way; mixing the sRGB numbers directly
    // would give 76 and a download much darker than the preview.
    expectWithinOne(simulate('achromatopsia', 255, 0, 0), [149, 149, 149, 255]);
    expectWithinOne(simulate('protanopia', 255, 0, 0), [198, 197, 0, 255]);
    expectWithinOne(simulate('tritanopia', 0, 0, 255), [0, 198, 192, 255]);
  });

  test('works on a whole image in place', () => {
    const image = Uint8ClampedArray.from([255, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 128]);

    simulateColorBlindness(image, 'achromatopsia');

    expectWithinOne(Array.from(image), [149, 149, 149, 255, 0, 0, 0, 255, 255, 255, 255, 128]);
  });
});
