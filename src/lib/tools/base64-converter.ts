/**
 * Base64 for text and bytes.
 *
 * Encoding always produces standard, padded Base64. Decoding is forgiving
 * about everything that does not change the data: it takes the URL-safe
 * alphabet (`-` and `_`) as well as the standard one, with or without `=`
 * padding, and skips whitespace, so wrapped output and JWT segments decode
 * as they are. Anything else is an error that names the offending character.
 *
 * Text is UTF-8 in both directions. Everything here is pure and runs in Node.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Value of every accepted character, by char code. -1 marks the rest.
const DECODE_TABLE = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let index = 0; index < ALPHABET.length; index++) table[ALPHABET.charCodeAt(index)] = index;
  table['-'.charCodeAt(0)] = 62;
  table['_'.charCodeAt(0)] = 63;
  return table;
})();

const PADDING = '='.charCodeAt(0);

function isWhitespace(code: number): boolean {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d);
}

/** Standard, padded Base64 of the given bytes. */
export function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  const whole = bytes.length - (bytes.length % 3);

  for (let index = 0; index < whole; index += 3) {
    const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    output +=
      ALPHABET[chunk >> 18] + ALPHABET[(chunk >> 12) & 63] + ALPHABET[(chunk >> 6) & 63] + ALPHABET[chunk & 63];
  }

  if (bytes.length - whole === 1) {
    const chunk = bytes[whole] << 16;
    output += `${ALPHABET[chunk >> 18]}${ALPHABET[(chunk >> 12) & 63]}==`;
  } else if (bytes.length - whole === 2) {
    const chunk = (bytes[whole] << 16) | (bytes[whole + 1] << 8);
    output += `${ALPHABET[chunk >> 18]}${ALPHABET[(chunk >> 12) & 63]}${ALPHABET[(chunk >> 6) & 63]}=`;
  }

  return output;
}

/**
 * The bytes a Base64 string stands for. Standard and URL-safe alphabets are
 * both accepted, padding is optional and whitespace is ignored.
 *
 * @throws Error naming the first character that is not Base64, or saying that
 * the input is cut off.
 */
export function base64ToBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let length = 0;
  // Bits read but not yet written out as a byte.
  let pending = 0;
  let pendingBits = 0;
  let characters = 0;
  let padding = 0;

  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (isWhitespace(code)) continue;

    if (code === PADDING) {
      padding++;
      continue;
    }

    const value = code < 128 ? DECODE_TABLE[code] : -1;
    if (value === -1) {
      const character = String.fromCodePoint(text.codePointAt(index) ?? code);
      throw new Error(`Invalid Base64 character "${character}" at position ${index + 1}.`);
    }
    if (padding > 0) {
      throw new Error('Invalid Base64: "=" padding is only allowed at the end.');
    }

    pending = ((pending << 6) | value) & 0xfff;
    pendingBits += 6;
    characters++;
    if (pendingBits >= 8) {
      pendingBits -= 8;
      bytes[length++] = (pending >> pendingBits) & 255;
    }
  }

  if (padding > 2 || characters % 4 === 1) {
    throw new Error('Invalid Base64 length: the input looks cut off or has extra characters.');
  }

  return bytes.slice(0, length);
}

/** Base64 of the text's UTF-8 bytes. */
export function encodeBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

/**
 * The text a Base64 string holds, read as UTF-8. Bytes that are not valid
 * UTF-8 (the Base64 of a binary file, say) come out as U+FFFD.
 *
 * @throws Error when the input is not Base64, see `base64ToBytes`.
 */
export function decodeBase64(text: string): string {
  return new TextDecoder().decode(base64ToBytes(text));
}

export type Base64Mode = 'encode' | 'decode';

/**
 * What the text tab shows for an input: the converted text, or the reason it
 * could not be converted. Never throws. Whitespace counts as data when
 * encoding (a space is `IA==`) and as nothing when decoding.
 */
export function convertBase64(text: string, mode: Base64Mode): { output: string; error: string } {
  if (mode === 'encode' ? text === '' : !text.trim()) return { output: '', error: '' };
  try {
    return { output: mode === 'encode' ? encodeBase64(text) : decodeBase64(text), error: '' };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : 'Conversion failed' };
  }
}
