/**
 * Text to Speech logic: cuts text into the sentences that are spoken one
 * utterance at a time, finds the word a speech boundary event points at, and
 * words synthesis errors for the user.
 *
 * Pure, so it runs in Node and in the browser. The speech engine itself stays
 * in the component.
 */

// A run of sentence-ending punctuation with the closing quotes and brackets
// that belong to it. It only ends a sentence when whitespace follows: the full
// stops inside "3.14" and "example.com" do not.
const SENTENCE_END_PATTERN = /[.!?…]+["'”’»)\]}]*/g;

// Abbreviations that are followed by a name or by the rest of the sentence.
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'vs']);

// How far back to look for the word in front of a full stop. Abbreviations are
// short, and a fixed window keeps the check cheap on very long lines.
const ABBREVIATION_WINDOW = 24;

/**
 * True when a single full stop belongs to an abbreviation and the sentence
 * carries on after it. `before` is the text in front of the full stop.
 *
 * Joining two sentences only makes one utterance longer; cutting inside one
 * makes the voice stop in the middle of "Dr. Smith". So the doubtful cases
 * count as abbreviations.
 */
function isAbbreviationStop(before: string): boolean {
  const word = /[\p{L}.]+$/u.exec(before)?.[0] ?? '';

  return (
    ABBREVIATIONS.has(word.toLowerCase()) || // "Dr. Smith"
    /^\p{Lu}$/u.test(word) || // the initials in "J. K. Rowling"
    word.includes('.') // dotted forms: "U.S. Army", "5 p.m. sharp", "e.g. Berlin"
  );
}

function splitLine(line: string): string[] {
  const sentences: string[] = [];
  let start = 0;

  for (const match of line.matchAll(SENTENCE_END_PATTERN)) {
    const index = match.index ?? 0;
    const end = index + match[0].length;

    // The end of the line needs no cut, and "3.14" or "example.com" must not get one.
    if (end >= line.length || !/\s/.test(line.charAt(end))) continue;

    if (
      match[0] === '.' &&
      isAbbreviationStop(line.slice(Math.max(start, index - ABBREVIATION_WINDOW), index))
    ) {
      continue;
    }

    sentences.push(line.slice(start, end));
    start = end;
  }

  // Whatever follows the last sentence end, with or without punctuation.
  sentences.push(line.slice(start));
  return sentences;
}

/**
 * Splits text into sentences, in order and trimmed. A line break always ends
 * a sentence; inside a line a sentence ends at `.`, `!`, `?` or `…` followed
 * by whitespace.
 *
 * Every character of the input other than whitespace ends up in exactly one
 * sentence, so nothing is left unspoken. Blank text gives `[]`.
 */
export function splitIntoSentences(text: string): string[] {
  return text
    .split(/[\r\n]+/)
    .flatMap(splitLine)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Where the speech engine is inside a sentence, as a `boundary` event reports it. */
export interface WordBoundary {
  charIndex: number;
  /** Missing, zero or NaN in engines that only report where a word starts. */
  charLength?: number;
}

/** A sentence cut around the word being spoken; the three parts always join back to the sentence. */
export interface SpokenWord {
  before: string;
  word: string;
  after: string;
}

/**
 * Cuts a sentence around the word a boundary event points at. Without a
 * boundary nothing is marked. When the engine gives no usable length the word
 * is read from the text at `charIndex`, and positions outside the sentence are
 * pulled back into it.
 */
export function locateSpokenWord(sentence: string, boundary: WordBoundary | null): SpokenWord {
  if (!boundary) return { before: sentence, word: '', after: '' };

  const start = Math.min(Math.max(Math.trunc(boundary.charIndex) || 0, 0), sentence.length);
  const reported = boundary.charLength;
  const length =
    typeof reported === 'number' && reported > 0
      ? Math.trunc(reported)
      : (/^[\p{L}\p{N}\p{M}'’-]+|^\S/u.exec(sentence.slice(start))?.[0].length ?? 0);
  const end = Math.min(start + length, sentence.length);

  return {
    before: sentence.slice(0, start),
    word: sentence.slice(start, end),
    after: sentence.slice(end),
  };
}

const SPEECH_ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'The browser blocked speech playback. Press Speak Text again to allow it.',
  'audio-busy': 'The audio output is being used by another application.',
  'audio-hardware': 'No audio output device is available.',
  network: 'The selected voice needs a network connection. Try a voice marked (Local).',
  'synthesis-unavailable': 'No speech engine is available on this device.',
  'synthesis-failed': 'The speech engine could not speak this text.',
  'language-unavailable': 'No installed voice supports the language of this text.',
  'voice-unavailable': 'The selected voice is no longer available. Choose another voice.',
  'text-too-long': 'A sentence is too long for the speech engine. Break it into shorter sentences.',
  'invalid-argument': 'The speech engine rejected the current speed, pitch or volume.',
};

/**
 * The message to show for a `SpeechSynthesisErrorEvent.error` code, or null
 * when the code only says that speech was cut off on purpose (`interrupted`,
 * `canceled`) and there is nothing to report.
 */
export function describeSpeechError(code: string | undefined): string | null {
  if (code === 'interrupted' || code === 'canceled') return null;
  if (!code) return 'Speech playback failed.';

  // The type check keeps inherited keys such as "constructor" out.
  const message: unknown = SPEECH_ERROR_MESSAGES[code];
  return typeof message === 'string' ? message : `Speech playback failed (${code}).`;
}
