/**
 * Morse code and 8-bit binary: text in, code out, and back.
 *
 * Morse is written with `.` and `-`, one space between letters and `/`
 * between words. Binary is the text's UTF-8 bytes as groups of eight bits.
 * `morseTimeline` turns a Morse string into the tones to play at a given
 * speed, so the audio schedule can be checked without an audio device.
 *
 * Everything here is pure and runs in Node.
 */

const MORSE_MAP: Record<string, string> = {
  'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....',
  'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.',
  'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
  'Y': '-.--', 'Z': '--..',
  '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...',
  '8': '---..', '9': '----.', '0': '-----',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.',
  '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
  '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
};

const REVERSE_MORSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE_MAP).map(([character, code]) => [code, character])
);

const WORD_BREAK = '/';
/** Shown in decoded text where a Morse sequence stands for no known character. */
export const UNKNOWN_MORSE = '�';

// ── Morse ─────────────────────────────────────────────────────────────────────

/**
 * Morse code for the text. Letter case is ignored. Every whitespace character
 * (a space, a tab, a line break) is a word break; characters that have no
 * Morse code are left out, see `unsupportedMorseCharacters`.
 */
export function textToMorse(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .toUpperCase()
    .split('')
    .map((character) => (/\s/.test(character) ? WORD_BREAK : MORSE_MAP[character] || ''))
    .filter(Boolean)
    .join(' ');
}

/** The distinct characters of the text that `textToMorse` leaves out, in order of appearance. */
export function unsupportedMorseCharacters(text: string): string[] {
  const missing = new Set<string>();
  for (const character of text) {
    if (/\s/.test(character)) continue;
    // Upper-casing can expand a character ("ß" to "SS"); it counts when every part has a code.
    const supported = Array.from(character.toUpperCase()).every((part) => part in MORSE_MAP);
    if (!supported) missing.add(character);
  }
  return Array.from(missing);
}

// Undoes what "smart punctuation" on phones and Macs does to typed Morse
// ("..." becomes an ellipsis, "--" an em dash) and accepts the typographic
// dot and dash characters Morse is often printed with.
function normalizeMorse(morse: string): string {
  return morse
    .replace(/…/g, '...')
    .replace(/—/g, '--')
    .replace(/[–−]/g, '-')
    .replace(/[·•]/g, '.');
}

/**
 * The text a Morse string spells. Letters are separated by whitespace and
 * words by `/`, with or without spaces around it. A sequence that is no known
 * character becomes `UNKNOWN_MORSE` instead of disappearing.
 *
 * @throws Error when the input contains anything but dots, dashes, slashes and whitespace.
 */
export function morseToText(morse: string): string {
  const normalized = normalizeMorse(morse);
  if (/[^.\-/\s]/.test(normalized)) {
    throw new Error(
      'Morse code inputs should contain only dots (.), dashes (-), spaces, or word breaks (/).'
    );
  }

  return normalized
    .replace(/\//g, ' / ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((symbol) => (symbol === WORD_BREAK ? ' ' : REVERSE_MORSE_MAP[symbol] ?? UNKNOWN_MORSE))
    .join('');
}

export interface MorseTone {
  /** Seconds from the start of playback. */
  start: number;
  /** Seconds the tone lasts. */
  duration: number;
}

export interface MorseTimeline {
  tones: MorseTone[];
  /** Seconds until the last tone has ended. */
  duration: number;
}

/**
 * When to sound each dot and dash of a Morse string at `wpm` words per
 * minute, using the standard timing: a dot is one unit (1.2 / wpm seconds), a
 * dash three, with one unit of silence inside a letter, three between letters
 * and seven between words.
 */
export function morseTimeline(morse: string, wpm: number): MorseTimeline {
  const unit = 1.2 / Math.max(wpm, 1);
  const tones: MorseTone[] = [];
  let time = 0;
  // Units of silence owed before the next tone.
  let gap = 0;

  for (const token of normalizeMorse(morse).replace(/\//g, ' / ').split(/\s+/)) {
    if (token === WORD_BREAK) {
      // A word break replaces the letter gap; it does not add to it.
      if (tones.length > 0) gap = 7;
      continue;
    }

    for (const element of token) {
      if (element !== '.' && element !== '-') continue;
      time += gap * unit;
      const duration = (element === '.' ? 1 : 3) * unit;
      tones.push({ start: time, duration });
      time += duration;
      gap = 1;
    }
    if (gap === 1) gap = 3;
  }

  return { tones, duration: time };
}

// ── Binary ────────────────────────────────────────────────────────────────────

/** The text's UTF-8 bytes as eight-bit groups joined by `separator`. */
export function textToBinary(text: string, separator: string): string {
  const bytes = new TextEncoder().encode(text);
  const groups: string[] = [];
  for (let index = 0; index < bytes.length; index++) {
    groups.push(bytes[index].toString(2).padStart(8, '0'));
  }
  return groups.join(separator);
}

// Anything that is neither a bit nor something safe to skip (whitespace, punctuation, symbols).
const NOT_BINARY = /[^\s\p{P}\p{S}01]/u;

/**
 * The text that a run of bits stands for, read as UTF-8. The separator,
 * whitespace and punctuation between the bits are skipped. Bytes that are not
 * valid UTF-8 come out as U+FFFD.
 *
 * @throws Error when the input holds a letter or a digit other than 0 and 1,
 * or when the number of bits is not a multiple of eight.
 */
export function binaryToText(binary: string, separator: string): string {
  // "b" is not a bit, so it can only be notation: the 0b prefix at the start
  // of a group or the b suffix at its end (01001000b). This runs while the
  // groups are still apart: joined up, a suffix would read as the next prefix.
  let clean = binary
    .trim()
    .replace(/(^|[^01])0b(?=[01])/gi, '$1')
    .replace(/([01])b(?![01])/gi, '$1');
  if (separator) {
    clean = clean.split(separator).join('');
  }

  const stray = NOT_BINARY.exec(clean);
  if (stray) {
    throw new Error(`"${stray[0]}" is not a binary digit. Binary input may only contain 0 and 1.`);
  }

  clean = clean.replace(/[^01]/g, '');
  if (clean.length === 0) return '';
  if (clean.length % 8 !== 0) {
    throw new Error('Binary data length must be a multiple of 8 bits.');
  }

  const bytes = new Uint8Array(clean.length / 8);
  for (let index = 0; index < clean.length; index += 8) {
    bytes[index / 8] = parseInt(clean.substring(index, index + 8), 2);
  }
  return new TextDecoder().decode(bytes);
}

// ── Interface of the tool ─────────────────────────────────────────────────────

export type CodeKind = 'morse' | 'binary';
export type CodeMode = 'encode' | 'decode';

/**
 * What the tool shows for an input: the converted text, or the reason it
 * could not be converted. Never throws. `separator` only matters for binary.
 * Whitespace counts as data when encoding and as nothing when decoding.
 */
export function convertCode(
  text: string,
  kind: CodeKind,
  mode: CodeMode,
  separator = ' '
): { output: string; error: string } {
  if (mode === 'encode' ? text === '' : !text.trim()) return { output: '', error: '' };

  try {
    if (kind === 'morse') {
      return { output: mode === 'encode' ? textToMorse(text) : morseToText(text), error: '' };
    }
    return {
      output: mode === 'encode' ? textToBinary(text, separator) : binaryToText(text, separator),
      error: '',
    };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : 'Conversion failed.' };
  }
}
