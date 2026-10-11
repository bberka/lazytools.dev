/**
 * Whole-number conversion between binary, octal, decimal and hexadecimal for
 * the Number Base Converter. The arithmetic is done with BigInt, so a number
 * of any length converts exactly.
 */

export type NumberBase = 'binary' | 'octal' | 'decimal' | 'hex';

export type BaseConversion =
  /** Nothing typed yet. */
  | { status: 'empty' }
  | { status: 'error'; error: string }
  | { status: 'ok'; values: Record<NumberBase, string> };

interface BaseDefinition {
  name: string;
  /** The literal prefix BigInt understands; it may also be typed. */
  prefix: string;
  /** A character that is not a digit of the base. */
  nonDigit: RegExp;
  /** The digits of the base, in words. */
  digits: string;
}

const BASES: Record<NumberBase, BaseDefinition> = {
  binary: { name: 'binary', prefix: '0b', nonDigit: /[^01]/, digits: 'only 0 and 1' },
  octal: { name: 'octal', prefix: '0o', nonDigit: /[^0-7]/, digits: 'the digits 0 to 7' },
  decimal: { name: 'decimal', prefix: '', nonDigit: /[^0-9]/, digits: 'the digits 0 to 9' },
  hex: {
    name: 'hexadecimal',
    prefix: '0x',
    nonDigit: /[^0-9a-f]/i,
    digits: 'the digits 0 to 9 and the letters A to F',
  },
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const failure = (error: string): BaseConversion => ({ status: 'error', error });

/**
 * Converts a whole number written in `base` to all four bases.
 *
 * Accepted besides the digits: a leading minus or plus sign, the prefix of
 * the base itself (0b, 0o, 0x), and spaces or underscores that group digits
 * ("1111 0000"). A negative number keeps its sign in every base; hexadecimal
 * comes back in upper case.
 */
export function convertNumberBase(input: string, base: NumberBase): BaseConversion {
  const text = input.trim();

  if (!text) {
    return { status: 'empty' };
  }

  const { name, prefix, nonDigit, digits } = BASES[base];
  // U+2212 is the minus sign that web pages and spreadsheets paste.
  const negative = /^[-\u2212]/.test(text);
  let body = text.replace(/^[+\-\u2212]\s*/, '');

  if (prefix && body.toLowerCase().startsWith(prefix)) {
    body = body.slice(prefix.length);
  }

  body = body.replace(/[\s_]/g, '');

  if (!body) {
    return failure(`Enter at least one ${name} digit.`);
  }

  const unexpected = body.match(nonDigit)?.[0];

  if (unexpected !== undefined) {
    return failure(
      unexpected === '.' || unexpected === ','
        ? 'Only whole numbers can be converted.'
        : `"${unexpected}" is not a valid ${name} digit. ${capitalize(name)} uses ${digits}.`
    );
  }

  const magnitude = BigInt(`${prefix}${body}`);
  const sign = negative && magnitude !== BigInt(0) ? '-' : '';

  return {
    status: 'ok',
    values: {
      binary: sign + magnitude.toString(2),
      octal: sign + magnitude.toString(8),
      decimal: sign + magnitude.toString(10),
      hex: sign + magnitude.toString(16).toUpperCase(),
    },
  };
}
