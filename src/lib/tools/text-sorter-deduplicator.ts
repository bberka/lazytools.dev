/**
 * Text Sorter & Deduplicator logic.
 *
 * `processLines` runs a fixed pipeline over the lines of a text: trim, drop
 * empty lines, remove duplicates (the first occurrence wins), then sort.
 * Pure functions, no DOM: they run in Node as well as in the browser.
 */

import { lineEnding, splitLines } from '@/lib/text';

export type SortMode =
  | 'none'
  | 'az'
  | 'za'
  | 'length-asc'
  | 'length-desc'
  | 'numeric-asc'
  | 'numeric-desc'
  | 'natural'
  | 'reverse'
  | 'shuffle';

export interface LineOptions {
  sort: SortMode;
  /** Compare raw code points (ASCII order) instead of dictionary order. Affects `az` and `za`. */
  codePointOrder: boolean;
  trimLines: boolean;
  removeEmpty: boolean;
  removeDuplicates: boolean;
  /** Treat "Apple" and "apple" as the same line when removing duplicates. */
  ignoreCase: boolean;
  /** Seed of the shuffle, so the same seed always gives the same order. */
  shuffleSeed: number;
}

export interface LineStats {
  inputLines: number;
  outputLines: number;
  removedEmpty: number;
  removedDuplicates: number;
}

export interface LineResult {
  text: string;
  lines: string[];
  stats: LineStats;
}

export const DEFAULT_OPTIONS: LineOptions = {
  sort: 'az',
  codePointOrder: false,
  trimLines: true,
  removeEmpty: true,
  removeDuplicates: true,
  ignoreCase: false,
  shuffleSeed: 1,
};

export const SORT_MODES: ReadonlyArray<{ value: SortMode; label: string }> = [
  { value: 'none', label: 'Keep the original order' },
  { value: 'az', label: 'A to Z' },
  { value: 'za', label: 'Z to A' },
  { value: 'length-asc', label: 'Shortest first' },
  { value: 'length-desc', label: 'Longest first' },
  { value: 'numeric-asc', label: 'Numeric, smallest first' },
  { value: 'numeric-desc', label: 'Numeric, largest first' },
  { value: 'natural', label: 'Natural (file2 before file10)' },
  { value: 'reverse', label: 'Reverse the order' },
  { value: 'shuffle', label: 'Shuffle' },
];

/** The leading number of a line (`-3`, `2.5`, `1e3`), or null when it has none. */
export function leadingNumber(line: string): number | null {
  const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/.exec(line);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** Number of code points, so a letter outside the BMP counts once, not twice. */
function charLength(line: string): number {
  return Array.from(line).length;
}

/** mulberry32: a tiny seeded generator, enough for a repeatable shuffle. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleLines(lines: readonly string[], seed: number): string[] {
  const result = [...lines];
  const random = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const DICTIONARY = new Intl.Collator('en');
const NATURAL = new Intl.Collator('en', { numeric: true });

function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortLines(
  lines: readonly string[],
  mode: SortMode,
  options: { codePointOrder?: boolean; shuffleSeed?: number } = {}
): string[] {
  const compareText = options.codePointOrder ? compareCodePoints : DICTIONARY.compare;
  switch (mode) {
    case 'none':
      return [...lines];
    case 'az':
      return [...lines].sort(compareText);
    case 'za':
      return [...lines].sort((a, b) => compareText(b, a));
    case 'natural':
      return [...lines].sort(NATURAL.compare);
    case 'length-asc':
      return [...lines].sort((a, b) => charLength(a) - charLength(b));
    case 'length-desc':
      return [...lines].sort((a, b) => charLength(b) - charLength(a));
    case 'numeric-asc':
    case 'numeric-desc': {
      const direction = mode === 'numeric-asc' ? 1 : -1;
      const keyed = lines.map((line) => ({ line, value: leadingNumber(line) }));
      // Lines without a number always go last, in their original order.
      keyed.sort((a, b) => {
        if (a.value === null || b.value === null) {
          return a.value === b.value ? 0 : a.value === null ? 1 : -1;
        }
        return (a.value - b.value) * direction || DICTIONARY.compare(a.line, b.line);
      });
      return keyed.map((entry) => entry.line);
    }
    case 'reverse':
      return [...lines].reverse();
    case 'shuffle':
      return shuffleLines(lines, options.shuffleSeed ?? 1);
  }
}

export function processLines(text: string, options: LineOptions): LineResult {
  const source = splitLines(text);
  let lines = options.trimLines ? source.map((line) => line.trim()) : source;

  let removedEmpty = 0;
  if (options.removeEmpty) {
    const kept = lines.filter((line) => line.trim() !== '');
    removedEmpty = lines.length - kept.length;
    lines = kept;
  }

  let removedDuplicates = 0;
  if (options.removeDuplicates) {
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const line of lines) {
      const key = options.ignoreCase ? line.toLowerCase() : line;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(line);
    }
    removedDuplicates = lines.length - kept.length;
    lines = kept;
  }

  lines = sortLines(lines, options.sort, options);

  return {
    text: lines.join(lineEnding(text)),
    lines,
    stats: {
      inputLines: source.length,
      outputLines: lines.length,
      removedEmpty,
      removedDuplicates,
    },
  };
}

export const EXAMPLE_TEXT = [
  'banana',
  'Apple',
  'cherry',
  '',
  'apple',
  'banana',
  'file10.txt',
  'file2.txt',
  'Cherry',
].join('\n');
