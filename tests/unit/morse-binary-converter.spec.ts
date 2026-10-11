import { test, expect } from '@playwright/test';
import {
  UNKNOWN_MORSE,
  binaryToText,
  convertCode,
  morseTimeline,
  morseToText,
  textToBinary,
  textToMorse,
  unsupportedMorseCharacters,
} from '@/lib/tools/morse-binary-converter';

test.describe('textToMorse', () => {
  test('encodes letters, digits and punctuation, ignoring case', () => {
    expect(textToMorse('SOS')).toBe('... --- ...');
    expect(textToMorse('Hello World')).toBe('.... . .-.. .-.. --- / .-- --- .-. .-.. -..');
    expect(textToMorse('1905')).toBe('.---- ----. ----- .....');
    expect(textToMorse('a.b,c?')).toBe('.- .-.-.- -... --..-- -.-. ..--..');
    expect(textToMorse('a/b')).toBe('.- -..-. -...');
  });

  test('writes one word break per space', () => {
    expect(textToMorse('a  b')).toBe('.- / / -...');
    expect(textToMorse('')).toBe('');
    expect(textToMorse(' ')).toBe('/');
  });

  // Defect: line breaks and tabs were dropped, so words on separate lines ran together.
  test('treats a line break or a tab as a word break', () => {
    expect(textToMorse('hello\nworld')).toBe('.... . .-.. .-.. --- / .-- --- .-. .-.. -..');
    expect(textToMorse('a\tb')).toBe('.- / -...');
    expect(textToMorse('a\r\nb')).toBe('.- / -...');
  });

  test('leaves out characters that have no Morse code', () => {
    expect(textToMorse('héllo')).toBe('.... .-.. .-.. ---');
    expect(textToMorse('100%')).toBe('.---- ----- -----');
  });
});

test.describe('unsupportedMorseCharacters', () => {
  test('lists each left-out character once, in order', () => {
    expect(unsupportedMorseCharacters('héllo wörld é 100% 😀')).toEqual(['é', 'ö', '%', '😀']);
  });

  test('finds nothing in text that is fully supported', () => {
    expect(unsupportedMorseCharacters('Hello, World! 123\n(ok) "x" a@b.c')).toEqual([]);
    expect(unsupportedMorseCharacters('')).toEqual([]);
    // Upper-cases to "SS", which has a code.
    expect(unsupportedMorseCharacters('straße')).toEqual([]);
  });
});

test.describe('morseToText', () => {
  test('decodes letters and word breaks', () => {
    expect(morseToText('... --- ...')).toBe('SOS');
    expect(morseToText('.... . .-.. .-.. --- / .-- --- .-. .-.. -..')).toBe('HELLO WORLD');
    expect(morseToText('  .-   -...  ')).toBe('AB');
    expect(morseToText('.-\n-...')).toBe('AB');
  });

  // Defect: "/" only worked with spaces around it; ".-/-..." was one unknown
  // symbol and decoded to nothing.
  test('accepts a word break without spaces around it', () => {
    expect(morseToText('.-/-...')).toBe('A B');
    expect(morseToText('... --- .../... --- ...')).toBe('SOS SOS');
  });

  // Defect: a sequence that is no character was dropped without a trace.
  test('marks a sequence that is no known character', () => {
    expect(morseToText('.- ........ -...')).toBe(`A${UNKNOWN_MORSE}B`);
    expect(morseToText('...---...')).toBe(UNKNOWN_MORSE);
  });

  // Phones and Macs turn typed "..." into an ellipsis and "--" into an em dash.
  test('reads smart punctuation and typographic dots and dashes as Morse', () => {
    expect(morseToText('… —- …')).toBe('SOS');
    expect(morseToText('·− −•••')).toBe('AB');
    expect(morseTimeline('…', 12).tones).toHaveLength(3);
  });

  test('rejects anything but dots, dashes, slashes and whitespace', () => {
    const message = /should contain only dots \(\.\), dashes \(-\), spaces, or word breaks \(\/\)/;
    expect(() => morseToText('hello')).toThrow(message);
    expect(() => morseToText('.- * -...')).toThrow(message);
    expect(() => morseToText('.- 1')).toThrow(message);
  });

  test('decodes what textToMorse wrote', () => {
    for (const text of ['HELLO WORLD', 'SOS', 'A  B', '1, 2 & 3!', 'USER@EXAMPLE.COM', '"QUOTED" (X) $5 = A+B_C; D: E/F-G\'S?']) {
      expect(morseToText(textToMorse(text)), text).toBe(text);
    }
  });
});

test.describe('morseTimeline', () => {
  // At 12 words per minute one unit is exactly a tenth of a second.
  const units = (morse: string) =>
    morseTimeline(morse, 12).tones.map((tone) => [
      Math.round(tone.start * 10),
      Math.round(tone.duration * 10),
    ]);

  test('times dots, dashes and the gaps inside a letter', () => {
    // A: dot, 1 unit of silence, dash.
    expect(units('.-')).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(morseTimeline('.-', 12).duration).toBeCloseTo(0.5, 10);
  });

  test('leaves three units between letters', () => {
    // E E: dot, 3 units, dot.
    expect(units('. .')).toEqual([
      [0, 1],
      [4, 1],
    ]);
  });

  // Defect: " / " was timed as letter gap + word gap + letter gap, 11 units of
  // silence instead of 7, so playback was slower than the selected speed.
  test('leaves seven units between words', () => {
    expect(units('. / .')).toEqual([
      [0, 1],
      [8, 1],
    ]);
    expect(units('./.')).toEqual([
      [0, 1],
      [8, 1],
    ]);
  });

  test('takes exactly 50 units for the standard word PARIS', () => {
    const paris = textToMorse('PARIS PARIS');
    const { tones } = morseTimeline(paris, 12);
    // The second word starts one full word (50 units) after the first.
    const half = tones.length / 2;
    expect(Math.round(tones[half].start * 10)).toBe(50);
    // And at 20 words per minute a word takes 60 / 20 = 3 seconds.
    expect(morseTimeline(paris, 20).tones[half].start).toBeCloseTo(3, 10);
  });

  test('ignores leading word breaks, unknown characters and empty input', () => {
    expect(units('/ .')).toEqual([[0, 1]]);
    expect(units('x.y')).toEqual([[0, 1]]);
    expect(morseTimeline('', 20)).toEqual({ tones: [], duration: 0 });
    expect(morseTimeline(' / / ', 20)).toEqual({ tones: [], duration: 0 });
  });

  test('never divides by zero for a nonsensical speed', () => {
    expect(Number.isFinite(morseTimeline('.-', 0).duration)).toBe(true);
  });
});

test.describe('textToBinary / binaryToText', () => {
  test('writes eight bits per UTF-8 byte', () => {
    expect(textToBinary('Hi', ' ')).toBe('01001000 01101001');
    expect(textToBinary('Hi', '')).toBe('0100100001101001');
    expect(textToBinary('é', ',')).toBe('11000011,10101001');
    expect(textToBinary('', ' ')).toBe('');
  });

  test('reads bits back whatever separates them', () => {
    expect(binaryToText('01001000 01101001', ' ')).toBe('Hi');
    expect(binaryToText('0100100001101001', '')).toBe('Hi');
    expect(binaryToText('01001000,01101001', ',')).toBe('Hi');
    expect(binaryToText('01001000\n01101001', ' ')).toBe('Hi');
    expect(binaryToText('11110000 10011111 10011000 10000000', ' ')).toBe('😀');
  });

  test('skips a 0b prefix or a b suffix on each group', () => {
    expect(binaryToText('0b01001000 0b01101001', ' ')).toBe('Hi');
    expect(binaryToText('01001000b 01101001B', ' ')).toBe('Hi');
  });

  test('rejects a bit count that is not a multiple of eight', () => {
    expect(() => binaryToText('0100100', ' ')).toThrow('Binary data length must be a multiple of 8 bits.');
  });

  // Defect: letters and other digits were dropped silently; text with no bits
  // at all gave an empty result and no error.
  test('reports a letter or a digit other than 0 and 1', () => {
    expect(() => binaryToText('hello', ' ')).toThrow('"h" is not a binary digit.');
    expect(() => binaryToText('01001000 01101002', ' ')).toThrow('"2" is not a binary digit.');
  });

  test('gives nothing when only separators are left', () => {
    expect(binaryToText(' , , ', ',')).toBe('');
  });
});

test.describe('convertCode', () => {
  test('returns nothing for empty input, and for blank input when decoding', () => {
    for (const kind of ['morse', 'binary'] as const) {
      expect(convertCode('', kind, 'encode')).toEqual({ output: '', error: '' });
      expect(convertCode('', kind, 'decode')).toEqual({ output: '', error: '' });
      expect(convertCode(' \n', kind, 'decode')).toEqual({ output: '', error: '' });
    }
  });

  // Defect: whitespace-only text used to encode to an empty result.
  test('encodes text that is only whitespace', () => {
    expect(convertCode(' ', 'binary', 'encode')).toEqual({ output: '00100000', error: '' });
    expect(convertCode(' ', 'morse', 'encode')).toEqual({ output: '/', error: '' });
  });

  test('uses the separator for binary in both directions', () => {
    expect(convertCode('Hi', 'binary', 'encode', ',')).toEqual({ output: '01001000,01101001', error: '' });
    expect(convertCode('01001000,01101001', 'binary', 'decode', ',')).toEqual({ output: 'Hi', error: '' });
  });

  test('turns a failure into an error without output', () => {
    expect(convertCode('abc', 'morse', 'decode').output).toBe('');
    expect(convertCode('abc', 'morse', 'decode').error).toContain('should contain only dots');
    expect(convertCode('0101', 'binary', 'decode')).toEqual({
      output: '',
      error: 'Binary data length must be a multiple of 8 bits.',
    });
  });

  test('decodes what it encoded', () => {
    const morse = convertCode('Hello World', 'morse', 'encode').output;
    expect(convertCode(morse, 'morse', 'decode')).toEqual({ output: 'HELLO WORLD', error: '' });

    const text = 'Grüße, 世界 😀';
    for (const separator of [' ', '', ',']) {
      const binary = convertCode(text, 'binary', 'encode', separator).output;
      expect(convertCode(binary, 'binary', 'decode', separator)).toEqual({ output: text, error: '' });
    }
  });
});
