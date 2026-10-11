/**
 * Roman numerals for the Roman Numeral Converter, in standard notation:
 * whole numbers from 1 to 3999, written with the subtractive pairs (IV, IX,
 * XL, XC, CD, CM) and no symbol repeated more than three times.
 */

export const ROMAN_MIN = 1;
export const ROMAN_MAX = 3999;

const SYMBOLS: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

const SYMBOL_VALUES: Readonly<Record<string, number>> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

// Thousands, hundreds, tens and ones, each in its one standard spelling.
const STANDARD_FORM = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

/** The Roman numeral for a whole number from 1 to 3999, or null for any other number. */
export function toRoman(value: number): string | null {
  if (!Number.isInteger(value) || value < ROMAN_MIN || value > ROMAN_MAX) {
    return null;
  }

  let roman = '';
  let remaining = value;

  for (const [amount, symbol] of SYMBOLS) {
    while (remaining >= amount) {
      roman += symbol;
      remaining -= amount;
    }
  }

  return roman;
}

/**
 * The value of a Roman numeral in standard form, in either letter case, or
 * null when the text is not one (IIII, VX, IC, an empty string).
 */
export function fromRoman(text: string): number | null {
  const roman = text.trim().toUpperCase();

  if (!roman || !STANDARD_FORM.test(roman)) {
    return null;
  }

  let total = 0;

  for (let index = 0; index < roman.length; index++) {
    const current = SYMBOL_VALUES[roman[index]];
    const next = SYMBOL_VALUES[roman[index + 1]] ?? 0;

    // A smaller symbol before a larger one is subtracted (the I in IV).
    total += current < next ? -current : current;
  }

  return total;
}

/**
 * Reads the decimal field: the whole number it holds when that is between 1
 * and 3999, otherwise null. Leading zeros are allowed (007 is 7); a sign, a
 * fraction or an exponent is not.
 */
export function parseDecimal(text: string): number | null {
  const trimmed = text.trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const value = Number(trimmed);

  return value >= ROMAN_MIN && value <= ROMAN_MAX ? value : null;
}

/**
 * Reduces typed or pasted text to Roman numeral letters in upper case.
 * Unicode numeral characters such as Ⅻ are spelled out as letters (XII);
 * every other character is dropped.
 */
export function cleanRomanInput(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[^ivxlcdm]/gi, '')
    .toUpperCase();
}
