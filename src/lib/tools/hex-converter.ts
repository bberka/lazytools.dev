/**
 * Text to hexadecimal byte pairs and back. Text is UTF-8 in both directions.
 *
 * Encoding writes one pair per byte, each with the chosen prefix, joined by
 * the chosen delimiter. Decoding reads pairs back out of loosely formatted
 * input: the chosen prefix and delimiter, the usual notations (`0x48`,
 * `\x48`, `&H48`, `48h`), whitespace and punctuation are all skipped. Any
 * other letter is an error, so a typo is reported instead of quietly dropped.
 *
 * Everything here is pure and runs in Node.
 */

export interface HexFormat {
  /** Text between byte pairs, for example a space. Default none. */
  delimiter?: string;
  /** Text in front of every byte pair, for example `0x`. Default none. */
  prefix?: string;
  /** Write A-F instead of a-f. Only affects encoding. Default false. */
  uppercase?: boolean;
}

/** The text's UTF-8 bytes as hexadecimal pairs. */
export function textToHex(text: string, format: HexFormat = {}): string {
  const { delimiter = '', prefix = '', uppercase = false } = format;
  const bytes = new TextEncoder().encode(text);
  const pairs: string[] = [];

  for (let index = 0; index < bytes.length; index++) {
    const pair = bytes[index].toString(16).padStart(2, '0');
    pairs.push(prefix + (uppercase ? pair.toUpperCase() : pair));
  }

  return pairs.join(delimiter);
}

// Anything that is neither a hex digit nor something safe to skip
// (whitespace, punctuation, symbols).
const NOT_HEX = /[^\s\p{P}\p{S}0-9a-fA-F]/u;

/**
 * The text that hexadecimal byte pairs stand for, read as UTF-8. Bytes that
 * are not valid UTF-8 come out as U+FFFD.
 *
 * @throws Error when the input holds no hex digits, an odd number of them, or
 * a letter or digit that is not hexadecimal.
 */
export function hexToText(hex: string, format: Pick<HexFormat, 'delimiter' | 'prefix'> = {}): string {
  const { delimiter = '', prefix = '' } = format;

  let clean = hex;
  if (prefix) clean = clean.split(prefix).join('');
  if (delimiter) clean = clean.split(delimiter).join('');
  // "x" and "h" are not hex digits, so these can only ever be notation: the
  // 0x and \x prefixes, the &H prefix and the h suffix (48h). They are dropped
  // whatever prefix is selected: pasted bytes rarely match the option.
  clean = clean.replace(/0x|\\x|&h/gi, '').replace(/([0-9a-fA-F])h/gi, '$1');

  const stray = NOT_HEX.exec(clean);
  if (stray) {
    throw new Error(`"${stray[0]}" is not a hexadecimal digit.`);
  }

  clean = clean.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length === 0) {
    throw new Error('No valid hexadecimal characters found.');
  }
  if (clean.length % 2 !== 0) {
    throw new Error('Hexadecimal string must have an even number of characters.');
  }

  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < clean.length; index += 2) {
    bytes[index / 2] = parseInt(clean.substring(index, index + 2), 16);
  }

  return new TextDecoder().decode(bytes);
}

export type HexMode = 'encode' | 'decode';

/**
 * What the tool shows for an input: the converted text, or the reason it
 * could not be converted. Never throws. Whitespace counts as data when
 * encoding (a space is `20`) and as nothing when decoding.
 */
export function convertHex(
  text: string,
  mode: HexMode,
  format: HexFormat = {}
): { output: string; error: string } {
  if (mode === 'encode' ? text === '' : !text.trim()) return { output: '', error: '' };
  try {
    return { output: mode === 'encode' ? textToHex(text, format) : hexToText(text, format), error: '' };
  } catch (err) {
    return {
      output: '',
      error: err instanceof Error ? err.message : 'Failed to convert hexadecimal input.',
    };
  }
}
