import { test, expect } from '@playwright/test';
import {
  appendTranscript,
  describeRecognitionError,
  readRecognitionResults,
  transcriptFileName,
  type RecognitionResultsLike,
} from '@/lib/tools/speech-to-text';

/** Builds a `result` event the way a recognizer reports it: an array-like of array-likes. */
function resultEvent(
  resultIndex: number,
  results: Array<{ transcript: string; isFinal: boolean }>
): RecognitionResultsLike {
  return {
    resultIndex,
    results: results.map(({ transcript, isFinal }) => ({ isFinal, 0: { transcript } })),
  };
}

test.describe('appendTranscript', () => {
  test('starts a transcript with the first phrase', () => {
    expect(appendTranscript('', 'Hello there')).toBe('Hello there');
  });

  test('joins phrases with one space', () => {
    expect(appendTranscript('Hello there', 'how are you')).toBe('Hello there how are you');
  });

  // Chrome starts every phrase after the first with a space; adding a
  // separator on top of it used to leave two spaces between phrases.
  test('does not double the space a recognizer puts in front of a phrase', () => {
    expect(appendTranscript('Hello there', ' how are you')).toBe('Hello there how are you');
    expect(appendTranscript('Hello there', '  how are you  ')).toBe('Hello there how are you');
    expect(appendTranscript('', ' Hello there')).toBe('Hello there');
  });

  test('ignores a phrase without text', () => {
    expect(appendTranscript('Hello', '')).toBe('Hello');
    expect(appendTranscript('Hello', '   \n ')).toBe('Hello');
    expect(appendTranscript('', ' ')).toBe('');
  });

  test('keeps whitespace that already ends the transcript', () => {
    expect(appendTranscript('First line\n', 'second line')).toBe('First line\nsecond line');
    expect(appendTranscript('Hello ', 'world')).toBe('Hello world');
  });

  // Japanese and Chinese are written without spaces between words.
  test('joins Japanese and Chinese phrases without a space', () => {
    expect(appendTranscript('こんにちは', '元気ですか', 'ja-JP')).toBe('こんにちは元気ですか');
    expect(appendTranscript('你好', ' 最近怎么样', 'zh-CN')).toBe('你好最近怎么样');
    expect(appendTranscript('你好', '最近點呀', 'zh-HK')).toBe('你好最近點呀');
    expect(appendTranscript('こんにちは', '元気ですか', 'JA')).toBe('こんにちは元気ですか');
  });

  test('keeps the space in other languages, Korean included', () => {
    expect(appendTranscript('안녕하세요', '반갑습니다', 'ko-KR')).toBe('안녕하세요 반갑습니다');
    expect(appendTranscript('Merhaba', 'nasılsın', 'tr-TR')).toBe('Merhaba nasılsın');
    expect(appendTranscript('مرحبا', 'كيف حالك', 'ar-SA')).toBe('مرحبا كيف حالك');
    expect(appendTranscript('Nice 👍', 'thanks 🙏', 'en-GB')).toBe('Nice 👍 thanks 🙏');
  });
});

test.describe('readRecognitionResults', () => {
  test('separates settled text from text still being recognized', () => {
    const event = resultEvent(0, [
      { transcript: 'Hello there', isFinal: true },
      { transcript: ' how are', isFinal: false },
    ]);

    expect(readRecognitionResults(event)).toEqual({
      finalText: 'Hello there',
      interimText: 'how are',
    });
  });

  test('reads only the results from resultIndex on', () => {
    const event = resultEvent(1, [
      { transcript: 'Hello there', isFinal: true },
      { transcript: ' how are you', isFinal: true },
    ]);

    expect(readRecognitionResults(event)).toEqual({ finalText: 'how are you', interimText: '' });
  });

  test('joins several results of one event with single spaces', () => {
    const event = resultEvent(0, [
      { transcript: 'one', isFinal: true },
      { transcript: ' two', isFinal: true },
      { transcript: ' three', isFinal: false },
      { transcript: ' four', isFinal: false },
    ]);

    expect(readRecognitionResults(event)).toEqual({ finalText: 'one two', interimText: 'three four' });
  });

  test('joins results without spaces in an unspaced language', () => {
    const event = resultEvent(0, [
      { transcript: 'こんにちは', isFinal: true },
      { transcript: '元気ですか', isFinal: true },
    ]);

    expect(readRecognitionResults(event, 'ja-JP').finalText).toBe('こんにちは元気ですか');
  });

  test('gives empty text for an event without usable results', () => {
    expect(readRecognitionResults(resultEvent(0, []))).toEqual({ finalText: '', interimText: '' });
    expect(readRecognitionResults(resultEvent(5, [{ transcript: 'late', isFinal: true }]))).toEqual({
      finalText: '',
      interimText: '',
    });
    expect(
      readRecognitionResults({ resultIndex: 0, results: { length: 1, 0: { isFinal: true } } })
    ).toEqual({ finalText: '', interimText: '' });
    expect(readRecognitionResults(resultEvent(-1, [{ transcript: 'ok', isFinal: true }]))).toEqual({
      finalText: 'ok',
      interimText: '',
    });
  });
});

test.describe('describeRecognitionError', () => {
  test('reports nothing when recognition was only cut off', () => {
    expect(describeRecognitionError('aborted')).toBeNull();
  });

  test('explains the codes a browser can report', () => {
    expect(describeRecognitionError('not-allowed')).toBe(
      'Microphone access blocked. Please enable mic permissions in your browser.'
    );
    expect(describeRecognitionError('no-speech')).toContain('No speech was detected');
    expect(describeRecognitionError('audio-capture')).toContain('microphone');
    expect(describeRecognitionError('language-not-supported')).toContain('language');
  });

  test('falls back to the code itself', () => {
    expect(describeRecognitionError('bad-grammar')).toBe('Recognition error: bad-grammar');
    expect(describeRecognitionError('constructor')).toBe('Recognition error: constructor');
    expect(describeRecognitionError('')).toBe('Recognition error: Unknown error');
    expect(describeRecognitionError(undefined)).toBe('Recognition error: Unknown error');
  });
});

test.describe('transcriptFileName', () => {
  // The name used to carry the UTC date, which is the day before or after the
  // user's own date for part of every day outside UTC.
  test("is dated by the user's calendar day at any time of day", () => {
    expect(transcriptFileName('txt', new Date(2026, 9, 11, 0, 5))).toBe('transcript-2026-10-11.txt');
    expect(transcriptFileName('txt', new Date(2026, 9, 11, 23, 55))).toBe('transcript-2026-10-11.txt');
  });

  test('pads months and days and carries the format as the extension', () => {
    expect(transcriptFileName('md', new Date(2026, 0, 5, 12, 0))).toBe('transcript-2026-01-05.md');
  });

  test('handles the ends of a year and a leap day', () => {
    expect(transcriptFileName('txt', new Date(2026, 11, 31, 23, 59, 59))).toBe(
      'transcript-2026-12-31.txt'
    );
    expect(transcriptFileName('txt', new Date(2027, 0, 1, 0, 0, 0))).toBe('transcript-2027-01-01.txt');
    expect(transcriptFileName('md', new Date(2028, 1, 29, 8, 30))).toBe('transcript-2028-02-29.md');
  });
});
