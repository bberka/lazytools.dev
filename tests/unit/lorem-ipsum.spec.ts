import { test, expect } from '@playwright/test';
import {
  LOREM_MAX_COUNT,
  LOREM_MIN_COUNT,
  generateLoremIpsum,
  parseLoremCount,
  type LoremOptions,
} from '@/lib/tools/lorem-ipsum';

/** A repeatable stand-in for Math.random (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const generate = (options: Partial<LoremOptions>, seed = 1) =>
  generateLoremIpsum(
    { type: 'paragraphs', count: 3, startWithLorem: true, htmlTags: false, ...options },
    seeded(seed)
  );

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);
const sentencesOf = (text: string) => text.split(/(?<=\.)\s+/).filter(Boolean);

test.describe('words', () => {
  test('generates exactly the number of words asked for', () => {
    for (const count of [1, 5, 6, 50, 250]) {
      expect(wordsOf(generate({ type: 'words', count })), `${count} words`).toHaveLength(count);
      expect(
        wordsOf(generate({ type: 'words', count, startWithLorem: false })),
        `${count} words without the opening`
      ).toHaveLength(count);
    }
  });

  // Defect: with the opening on, asking for 1 to 4 words gave all five
  // opening words.
  test('cuts the opening short when fewer than five words are asked for', () => {
    expect(generate({ type: 'words', count: 1 })).toBe('Lorem');
    expect(generate({ type: 'words', count: 3 })).toBe('Lorem ipsum dolor');
    expect(generate({ type: 'words', count: 5 })).toBe('Lorem ipsum dolor sit amet');
  });

  test('starts with the classic opening only when asked', () => {
    expect(generate({ type: 'words', count: 12 })).toMatch(/^Lorem ipsum dolor sit amet /);
    for (let seed = 1; seed <= 20; seed++) {
      expect(generate({ type: 'words', count: 12, startWithLorem: false }, seed)).toMatch(
        /^[a-z]+( [a-z]+){11}$/
      );
    }
  });
});

test.describe('sentences', () => {
  test('generates the number of sentences asked for, each 5 to 14 words', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const sentences = sentencesOf(generate({ type: 'sentences', count: 6 }, seed));

      expect(sentences).toHaveLength(6);
      for (const sentence of sentences) {
        expect(sentence).toMatch(/^[A-Z][a-z]*( [a-z]+)*\.$/);
        expect(wordsOf(sentence).length).toBeGreaterThanOrEqual(5);
        expect(wordsOf(sentence).length).toBeLessThanOrEqual(14);
      }
    }
  });

  test('opens only the first sentence with the classic start', () => {
    const sentences = sentencesOf(generate({ type: 'sentences', count: 8 }));

    expect(sentences[0]).toMatch(/^Lorem ipsum dolor sit amet/);
    expect(sentences.slice(1).filter((sentence) => sentence.startsWith('Lorem ipsum dolor sit amet'))).toEqual([]);
  });
});

test.describe('paragraphs', () => {
  test('generates the number of paragraphs asked for, each 3 to 7 sentences', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const paragraphs = generate({ count: 5 }, seed).split('\n\n');

      expect(paragraphs).toHaveLength(5);
      for (const paragraph of paragraphs) {
        expect(sentencesOf(paragraph).length).toBeGreaterThanOrEqual(3);
        expect(sentencesOf(paragraph).length).toBeLessThanOrEqual(7);
      }
    }
  });

  // Defect: every paragraph, not just the first, began with "Lorem ipsum
  // dolor sit amet".
  test('opens only the first paragraph with the classic start', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const paragraphs = generate({ count: 6 }, seed).split('\n\n');

      expect(paragraphs[0]).toMatch(/^Lorem ipsum dolor sit amet/);
      expect(
        paragraphs.slice(1).filter((paragraph) => paragraph.startsWith('Lorem ipsum dolor sit amet'))
      ).toEqual([]);
    }
  });

  test('wraps each paragraph in <p> tags when asked', () => {
    const paragraphs = generate({ count: 3, htmlTags: true }).split('\n\n');

    expect(paragraphs).toHaveLength(3);
    for (const paragraph of paragraphs) {
      expect(paragraph).toMatch(/^<p>[A-Z][^<]*\.<\/p>$/);
    }
  });

  test('ignores the HTML option for words and sentences', () => {
    expect(generate({ type: 'words', count: 8, htmlTags: true })).not.toContain('<');
    expect(generate({ type: 'sentences', count: 2, htmlTags: true })).not.toContain('<');
  });
});

test.describe('count limits', () => {
  test('reads the count a user typed', () => {
    expect(parseLoremCount('3')).toBe(3);
    expect(parseLoremCount('2.7')).toBe(2);
    expect(parseLoremCount(7.9)).toBe(7);
  });

  // Defect: zero and negative counts produced no output (or the wrong one)
  // without any feedback.
  test('falls back to the minimum for blank, zero, negative and invalid counts', () => {
    for (const value of ['', '0', '-5', 'abc', Number.NaN, -1, 0]) {
      expect(parseLoremCount(value), String(value)).toBe(LOREM_MIN_COUNT);
    }
    expect(wordsOf(generate({ type: 'words', count: -5 }))).toHaveLength(1);
    expect(sentencesOf(generate({ type: 'sentences', count: 0 }))).toHaveLength(1);
  });

  // Defect: nothing limited the count, so a huge number froze the page.
  test('caps the count', () => {
    expect(parseLoremCount('999999999')).toBe(LOREM_MAX_COUNT);
    expect(parseLoremCount(Number.POSITIVE_INFINITY)).toBe(LOREM_MIN_COUNT);
    expect(wordsOf(generate({ type: 'words', count: 5_000_000 }))).toHaveLength(LOREM_MAX_COUNT);
    expect(generate({ count: 5_000_000 }).split('\n\n')).toHaveLength(LOREM_MAX_COUNT);
  });
});

test.describe('randomness', () => {
  test('gives the same text for the same random source', () => {
    expect(generate({ count: 4 }, 42)).toBe(generate({ count: 4 }, 42));
    expect(generate({ count: 4 }, 42)).not.toBe(generate({ count: 4 }, 43));
  });

  test('copes with a random source that returns its limits', () => {
    expect(wordsOf(generateLoremIpsum({ type: 'words', count: 8, startWithLorem: false, htmlTags: false }, () => 0))).toHaveLength(8);
    expect(wordsOf(generateLoremIpsum({ type: 'words', count: 8, startWithLorem: false, htmlTags: false }, () => 1))).toHaveLength(8);
    expect(generateLoremIpsum({ type: 'sentences', count: 1, startWithLorem: false, htmlTags: false }, () => 1)).toMatch(/^[A-Z]/);
  });

  test('uses Math.random by default', () => {
    const text = generateLoremIpsum({ type: 'paragraphs', count: 2, startWithLorem: true, htmlTags: false });

    expect(text.split('\n\n')).toHaveLength(2);
    expect(text).toMatch(/^Lorem ipsum dolor sit amet/);
  });
});
