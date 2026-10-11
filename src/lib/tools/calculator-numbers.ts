/**
 * Number text for the calculator tools: reading what a person typed into a
 * number field, and writing a result back out.
 *
 * Results are written in en-US form (1,250.5) so the text is the same on the
 * server and in the browser. Fields are read more generously, because a
 * decimal keypad offers whichever decimal separator the device's region uses.
 */

/** What a number field holds. */
export type NumberField =
  /**
   * Blank, or a number still being typed: only a sign or decimal separator so
   * far, or a number grouped in thousands that stops after a comma.
   */
  | { kind: 'empty' }
  /** Text that is not a number. */
  | { kind: 'invalid' }
  | { kind: 'number'; value: number };

// A number with a decimal point: digits, optionally grouped in thousands by
// commas (1,250 or the Indian 1,00,000), an optional fraction, an optional
// exponent. A group of thousands never starts with a zero.
const POINT_DECIMAL =
  /^[+-]?(?:(?:\d+|[1-9]\d{0,2}(?:,\d{2,3})*,\d{3})(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

// The same with the separators swapped (1.250,5), tried second: a comma that
// cannot be grouping thousands is a decimal comma, so "1,5" is one and a half.
const COMMA_DECIMAL =
  /^[+-]?(?:(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+),\d*|,\d+)(?:e[+-]?\d+)?$/i;

// A sign or decimal separator on its own is a number still being typed.
const UNFINISHED = /^[+-]?[.,]?$/;

// A number grouped in thousands, cut off after a comma while it is typed key by
// key: "1,000," or "1,000,0" on the way to 1,000,000. It is only meaningful
// once the text has failed both readings above, which claim "1,", "1,0" and
// "1,00" as decimal commas.
const UNFINISHED_GROUPS = /^[+-]?[1-9]\d{0,2}(?:,\d{2,3})*,\d{0,2}$/;

/**
 * Reads a number field. Surrounding whitespace is ignored.
 *
 * The decimal separator may be a period or a comma. Where the text can be
 * read both ways, a comma groups thousands: "1,250" is 1250, as it always
 * was here, while "1,5", "0,125" and "1.250,5" can only be decimal commas.
 */
export function readNumber(text: string): NumberField {
  // U+2212 is the minus sign that web pages and spreadsheets paste.
  const trimmed = text.trim().replace(/^\u2212/, '-');

  if (UNFINISHED.test(trimmed)) {
    return { kind: 'empty' };
  }

  let plain: string;

  if (POINT_DECIMAL.test(trimmed)) {
    plain = trimmed.replace(/,/g, '');
  } else if (COMMA_DECIMAL.test(trimmed)) {
    plain = trimmed.replace(/\./g, '').replace(',', '.');
  } else if (UNFINISHED_GROUPS.test(trimmed)) {
    return { kind: 'empty' };
  } else {
    return { kind: 'invalid' };
  }

  const value = Number(plain);

  // "1e999" is well formed but overflows.
  return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'invalid' };
}

export interface NumberStyle {
  /** Fraction digits always shown, padded with zeros. Default 0. */
  minFractionDigits?: number;
  /** Fraction digits an ordinary value is rounded to. */
  maxFractionDigits: number;
  /**
   * Significant digits a value between -1 and 1 keeps even when that takes
   * more than `maxFractionDigits`, so a small result is not rounded away to
   * zero. Leave it out where zero is the honest answer, for example after a
   * subtraction that leaves only floating-point noise.
   */
  minSignificantDigits?: number;
}

// Engines older than ES2023 reject more fraction digits than this.
const MAX_FRACTION_DIGITS = 20;

// From here up plain digits stop being readable, as in Number#toString.
const EXPONENT_FROM = 1e21;
const EXPONENT_DIGITS = 10;

function toExponent(value: number, significantDigits: number): string {
  return Number(value.toPrecision(significantDigits)).toExponential();
}

/**
 * Formats a number in en-US form with thousands separators. Values too large
 * or too small to write out come back in exponent form ("1.5e-25"), which
 * `readNumber` accepts. A value that is not finite formats as an empty string.
 */
export function formatNumber(value: number, style: NumberStyle): string {
  if (!Number.isFinite(value)) {
    return '';
  }

  const { minFractionDigits = 0, maxFractionDigits, minSignificantDigits = 0 } = style;
  const magnitude = Math.abs(value);

  if (magnitude >= EXPONENT_FROM) {
    return toExponent(value, EXPONENT_DIGITS);
  }

  let fractionDigits = maxFractionDigits;

  if (minSignificantDigits > 0 && magnitude > 0 && magnitude < 1) {
    const leadingZeros = -Math.floor(Math.log10(magnitude)) - 1;
    fractionDigits = Math.max(fractionDigits, leadingZeros + minSignificantDigits);

    if (fractionDigits > MAX_FRACTION_DIGITS) {
      return toExponent(value, minSignificantDigits);
    }
  }

  const text = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Math.min(minFractionDigits, fractionDigits),
    maximumFractionDigits: fractionDigits,
  }).format(value);

  // Intl keeps the sign of a value that rounds to zero ("-0.00").
  return /[1-9]/.test(text) ? text : text.replace('-', '');
}
