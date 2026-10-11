/**
 * Lorem ipsum generator logic: builds placeholder words, sentences or
 * paragraphs. The source of randomness is an argument, so the output is
 * reproducible in tests; it defaults to `Math.random`.
 */

export type LoremUnit = 'paragraphs' | 'sentences' | 'words';

export interface LoremOptions {
  type: LoremUnit;
  /** How many units to generate; clamped to LOREM_MIN_COUNT..LOREM_MAX_COUNT. */
  count: number;
  /** Open the text with "Lorem ipsum dolor sit amet". */
  startWithLorem: boolean;
  /** Wrap each paragraph in <p> tags. Only applies to paragraphs. */
  htmlTags: boolean;
}

export const LOREM_MIN_COUNT = 1;
/** High enough for any mock-up, low enough that the page never stalls. */
export const LOREM_MAX_COUNT = 1000;

const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
  'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
  'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
  'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
  'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint',
  'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia',
  'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum',
];

const OPENING_WORDS = ['Lorem', 'ipsum', 'dolor', 'sit', 'amet'];

type Random = () => number;

/**
 * The count a user typed, as a whole number in range. Blank, zero, negative
 * and non-numeric input all give the minimum.
 */
export function parseLoremCount(value: string | number): number {
  const parsed = typeof value === 'number' ? Math.trunc(value) : parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return LOREM_MIN_COUNT;
  }
  return Math.min(LOREM_MAX_COUNT, Math.max(LOREM_MIN_COUNT, parsed));
}

/** A whole number in 0..size-1, also for a source that returns exactly 1. */
function randomIndex(random: Random, size: number): number {
  return Math.min(size - 1, Math.floor(random() * size));
}

/** Exactly `count` words; with `opening` the first ones are the classic start. */
function words(count: number, opening: boolean, random: Random): string[] {
  const result = opening ? OPENING_WORDS.slice(0, count) : [];
  while (result.length < count) {
    result.push(LOREM_WORDS[randomIndex(random, LOREM_WORDS.length)]);
  }
  return result;
}

/** 5 to 14 words, capitalised and closed with a full stop. */
function sentence(opening: boolean, random: Random): string {
  const text = words(randomIndex(random, 10) + 5, opening, random).join(' ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function sentences(count: number, opening: boolean, random: Random): string {
  return Array.from({ length: count }, (_, index) => sentence(opening && index === 0, random)).join(
    ' '
  );
}

/** Each paragraph has 3 to 7 sentences; only the first one gets the opening. */
function paragraphs(count: number, opening: boolean, random: Random): string[] {
  return Array.from({ length: count }, (_, index) =>
    sentences(randomIndex(random, 5) + 3, opening && index === 0, random)
  );
}

export function generateLoremIpsum(options: LoremOptions, random: Random = Math.random): string {
  const count = parseLoremCount(options.count);

  if (options.type === 'words') {
    return words(count, options.startWithLorem, random).join(' ');
  }

  if (options.type === 'sentences') {
    return sentences(count, options.startWithLorem, random);
  }

  const blocks = paragraphs(count, options.startWithLorem, random);
  return (options.htmlTags ? blocks.map((block) => `<p>${block}</p>`) : blocks).join('\n\n');
}
