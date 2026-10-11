/**
 * Speech to Text logic: joins the phrases a recognizer reports into one
 * transcript, words recognition errors for the user, and names the downloaded
 * transcript.
 *
 * Pure, so it runs in Node and in the browser. The recognizer and the
 * microphone stay in the component.
 */

// Written without spaces between words, so phrases are joined directly.
const UNSPACED_LANGUAGES = ['ja', 'zh'];

function usesSpaces(lang: string): boolean {
  const language = lang.toLowerCase().split('-')[0];
  return !UNSPACED_LANGUAGES.includes(language);
}

/**
 * Adds a recognized phrase to a transcript.
 *
 * Recognizers pad phrases differently (Chrome starts every phrase after the
 * first with a space), so the phrase is trimmed and joined with exactly one
 * space, or with none in a language that does not put spaces between words.
 * Line breaks at the end of the transcript are kept. A phrase without text
 * changes nothing.
 *
 * @param lang BCP 47 tag of the spoken language, for example `en-US`.
 */
export function appendTranscript(transcript: string, phrase: string, lang = 'en-US'): string {
  const addition = phrase.trim();
  if (!addition) return transcript;
  if (!transcript || /\s$/.test(transcript) || !usesSpaces(lang)) return transcript + addition;
  return `${transcript} ${addition}`;
}

/** The parts of a recognition `result` event that are read here. */
export interface RecognitionResultsLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string } | undefined;
    };
  };
}

export interface RecognizedText {
  /** Text the recognizer has settled on; belongs in the transcript. */
  finalText: string;
  /** Text still being worked out; a later event replaces it. */
  interimText: string;
}

/** Reads what one `result` event adds: the results from `resultIndex` on, best alternative each. */
export function readRecognitionResults(event: RecognitionResultsLike, lang = 'en-US'): RecognizedText {
  let finalText = '';
  let interimText = '';

  for (let index = Math.max(event.resultIndex, 0); index < event.results.length; index += 1) {
    const result = event.results[index];
    const phrase = result?.[0]?.transcript ?? '';

    if (result?.isFinal) {
      finalText = appendTranscript(finalText, phrase, lang);
    } else {
      interimText = appendTranscript(interimText, phrase, lang);
    }
  }

  return { finalText, interimText };
}

const RECOGNITION_ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access blocked. Please enable mic permissions in your browser.',
  'service-not-allowed': 'Speech recognition is blocked or switched off in this browser.',
  'no-speech': 'No speech was detected. Check your microphone and try again.',
  'audio-capture': 'No microphone was found. Connect one and try again.',
  network: 'The speech recognition service could not be reached. Check your connection and try again.',
  'language-not-supported': 'The selected language is not supported by speech recognition in this browser.',
};

/**
 * The message to show for a `SpeechRecognitionErrorEvent.error` code, or null
 * for `aborted`: that only says recognition was cut off, by this page or by
 * the browser, and there is nothing to report.
 */
export function describeRecognitionError(code: string | undefined): string | null {
  if (code === 'aborted') return null;
  if (!code) return 'Recognition error: Unknown error';

  // The type check keeps inherited keys such as "constructor" out.
  const message: unknown = RECOGNITION_ERROR_MESSAGES[code];
  return typeof message === 'string' ? message : `Recognition error: ${code}`;
}

export type TranscriptFormat = 'txt' | 'md';

/**
 * File name of a downloaded transcript: `transcript-2026-03-09.txt`, dated by
 * the user's own calendar day rather than the UTC one.
 */
export function transcriptFileName(format: TranscriptFormat, date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `transcript-${day}.${format}`;
}
