import { test, expect } from '@playwright/test';
import {
  describeSpeechError,
  locateSpokenWord,
  splitIntoSentences,
} from '@/lib/tools/text-to-speech';

const withoutWhitespace = (value: string) => value.replace(/\s+/g, '');

test.describe('splitIntoSentences', () => {
  test('splits at sentence-ending punctuation followed by whitespace', () => {
    expect(splitIntoSentences('Hello world. How are you? Fine!')).toEqual([
      'Hello world.',
      'How are you?',
      'Fine!',
    ]);
  });

  test('gives no sentences for empty and whitespace-only text', () => {
    expect(splitIntoSentences('')).toEqual([]);
    expect(splitIntoSentences('   \n\t  \r\n ')).toEqual([]);
  });

  test('keeps text without closing punctuation as one sentence', () => {
    expect(splitIntoSentences('No terminator')).toEqual(['No terminator']);
    expect(splitIntoSentences('First one. Then a trailing fragment')).toEqual([
      'First one.',
      'Then a trailing fragment',
    ]);
  });

  test('ends a sentence at every line break, whatever the line ending', () => {
    expect(splitIntoSentences('Title\nBody text.\n\n\nLast line')).toEqual([
      'Title',
      'Body text.',
      'Last line',
    ]);
    expect(splitIntoSentences('One.\r\nTwo\rThree')).toEqual(['One.', 'Two', 'Three']);
  });

  test('keeps runs of punctuation and closing quotes with their sentence', () => {
    expect(splitIntoSentences('Wait... what?! Really?')).toEqual(['Wait...', 'what?!', 'Really?']);
    expect(splitIntoSentences('He said "Stop." Then he left.')).toEqual([
      'He said "Stop."',
      'Then he left.',
    ]);
    expect(splitIntoSentences('(See below.) Next one.')).toEqual(['(See below.)', 'Next one.']);
    expect(splitIntoSentences('And then… Silence.')).toEqual(['And then…', 'Silence.']);
  });

  // Each of these used to lose everything in front of the dot: "Version 3.14
  // is out." was spoken as "14 is out.".
  test('does not drop text in front of a dot that is not followed by a space', () => {
    expect(splitIntoSentences('Version 3.14 is out.')).toEqual(['Version 3.14 is out.']);
    expect(splitIntoSentences('Visit example.com today.')).toEqual(['Visit example.com today.']);
    expect(splitIntoSentences('Mail me at a.b@c.org')).toEqual(['Mail me at a.b@c.org']);
    expect(splitIntoSentences('Hello!World')).toEqual(['Hello!World']);
    expect(splitIntoSentences('Is it 5 p.m.? Yes.')).toEqual(['Is it 5 p.m.?', 'Yes.']);
  });

  test('puts every non-whitespace character into exactly one sentence', () => {
    const inputs = [
      'Version 3.14 is out. Visit example.com today! He said "Stop." Then he left.',
      '(See below.) e.g.this\n...\n?!\n- item one\n- item two.',
      'Dr. Smith met J. K. Rowling at 5 p.m. in the U.S. Embassy. It went well.',
      'Hi 👋. Bye 👨‍👩‍👧‍👦!\r\nGrüße aus Köln. İstanbul’da güzel bir gün.',
      'こんにちは。元気ですか？ はい. OK',
      '.leading dot and trailing dot.',
      'a.b.c.d. e!f?g … h',
    ];

    for (const input of inputs) {
      expect(withoutWhitespace(splitIntoSentences(input).join(''))).toBe(withoutWhitespace(input));
    }
  });

  // "Dr." used to be its own sentence, so the voice stopped before the name.
  test('does not end a sentence at the full stop of an abbreviation', () => {
    expect(splitIntoSentences('Dr. Smith went home.')).toEqual(['Dr. Smith went home.']);
    expect(splitIntoSentences('J. K. Rowling wrote it. It sold well.')).toEqual([
      'J. K. Rowling wrote it.',
      'It sold well.',
    ]);
    expect(splitIntoSentences('We met at 5 p.m. and left early.')).toEqual([
      'We met at 5 p.m. and left early.',
    ]);
    expect(splitIntoSentences('The U.S. Army arrived. Nobody spoke.')).toEqual([
      'The U.S. Army arrived.',
      'Nobody spoke.',
    ]);
  });

  test('still ends a sentence after a number, a question or an exclamation', () => {
    expect(splitIntoSentences('It was 2019. Five people came.')).toEqual([
      'It was 2019.',
      'Five people came.',
    ]);
    expect(splitIntoSentences('Is that Dr? Yes! He is.')).toEqual(['Is that Dr?', 'Yes!', 'He is.']);
  });

  test('splits text written without capital letters like any other', () => {
    expect(splitIntoSentences('i went home. then i slept. it was fine.')).toEqual([
      'i went home.',
      'then i slept.',
      'it was fine.',
    ]);
    expect(splitIntoSentences('i met dr. smith. he was late.')).toEqual([
      'i met dr. smith.',
      'he was late.',
    ]);
  });

  test('handles emoji and non-Latin text', () => {
    expect(splitIntoSentences('Hi 👋. Bye')).toEqual(['Hi 👋.', 'Bye']);
    expect(splitIntoSentences('Grüße aus Köln. Übermorgen geht es weiter.')).toEqual([
      'Grüße aus Köln.',
      'Übermorgen geht es weiter.',
    ]);
  });

  test('stays fast on very large text', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog near example.com at 3.14 p.m. today.';
    const oneLine = Array.from({ length: 20000 }, () => sentence).join(' ');
    const started = Date.now();

    expect(splitIntoSentences(oneLine)).toHaveLength(20000);
    // Long runs without a place to cut: dot leaders, and dots glued to letters.
    expect(splitIntoSentences('.'.repeat(200000))).toHaveLength(1);
    expect(splitIntoSentences('a.'.repeat(100000))).toHaveLength(1);
    expect(splitIntoSentences('e.g. '.repeat(50000))).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

test.describe('locateSpokenWord', () => {
  const sentence = 'Hello brave new world.';

  test('cuts the sentence around the reported word', () => {
    expect(locateSpokenWord(sentence, { charIndex: 6, charLength: 5 })).toEqual({
      before: 'Hello ',
      word: 'brave',
      after: ' new world.',
    });
  });

  test('marks nothing before the first boundary event', () => {
    expect(locateSpokenWord(sentence, null)).toEqual({ before: sentence, word: '', after: '' });
  });

  // Without a length the old code rendered "Hello " twice and then the whole
  // sentence again.
  test('reads the word from the text when the engine reports no length', () => {
    const expected = { before: 'Hello ', word: 'brave', after: ' new world.' };

    expect(locateSpokenWord(sentence, { charIndex: 6 })).toEqual(expected);
    expect(locateSpokenWord(sentence, { charIndex: 6, charLength: 0 })).toEqual(expected);
    expect(locateSpokenWord(sentence, { charIndex: 6, charLength: Number.NaN })).toEqual(expected);
  });

  test('leaves trailing punctuation out of a word it has to measure itself', () => {
    expect(locateSpokenWord(sentence, { charIndex: 16 }).word).toBe('world');
    expect(locateSpokenWord("Don't stop", { charIndex: 0 }).word).toBe("Don't");
    expect(locateSpokenWord('Wait - what', { charIndex: 5 }).word).toBe('-');
  });

  test('pulls positions outside the sentence back into it', () => {
    expect(locateSpokenWord(sentence, { charIndex: 999, charLength: 4 })).toEqual({
      before: sentence,
      word: '',
      after: '',
    });
    expect(locateSpokenWord(sentence, { charIndex: 16, charLength: 999 })).toEqual({
      before: 'Hello brave new ',
      word: 'world.',
      after: '',
    });
    expect(locateSpokenWord(sentence, { charIndex: -3, charLength: 5 }).word).toBe('Hello');
    expect(locateSpokenWord(sentence, { charIndex: Number.NaN, charLength: 5 }).word).toBe('Hello');
    expect(locateSpokenWord('', { charIndex: 0, charLength: 3 })).toEqual({
      before: '',
      word: '',
      after: '',
    });
  });

  test('always returns parts that join back to the sentence', () => {
    const boundaries = [
      null,
      { charIndex: 0 },
      { charIndex: 5 },
      { charIndex: 6, charLength: 5 },
      { charIndex: 21, charLength: 9 },
      { charIndex: 400 },
      { charIndex: -1, charLength: -1 },
      { charIndex: 2.7, charLength: 2.2 },
    ];

    for (const boundary of boundaries) {
      const { before, word, after } = locateSpokenWord(sentence, boundary);
      expect(before + word + after).toBe(sentence);
    }
  });
});

test.describe('describeSpeechError', () => {
  test('reports nothing when speech was cut off on purpose', () => {
    expect(describeSpeechError('interrupted')).toBeNull();
    expect(describeSpeechError('canceled')).toBeNull();
  });

  test('explains the codes a browser can report', () => {
    expect(describeSpeechError('not-allowed')).toContain('blocked');
    expect(describeSpeechError('voice-unavailable')).toContain('voice');
    expect(describeSpeechError('network')).toContain('network');
  });

  test('falls back to the code itself, and to a plain message without one', () => {
    expect(describeSpeechError('something-new')).toBe('Speech playback failed (something-new).');
    expect(describeSpeechError('constructor')).toBe('Speech playback failed (constructor).');
    expect(describeSpeechError('')).toBe('Speech playback failed.');
    expect(describeSpeechError(undefined)).toBe('Speech playback failed.');
  });
});
