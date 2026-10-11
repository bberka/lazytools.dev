/**
 * Find and replace logic: finds every match of a literal or regex search in a
 * text and builds the replaced text. Pure, so it runs in Node and the browser.
 */

import type { TextMatch } from './match-segments';

export interface FindReplaceOptions {
  find: string;
  replace: string;
  caseSensitive: boolean;
  /** Only match when the neighbouring characters are not part of a word. */
  wholeWord: boolean;
  /** Treat `find` as a regular expression and expand $1, $& in `replace`. */
  useRegex: boolean;
  /** Replace every match instead of only the first. */
  replaceAll: boolean;
}

export interface FindReplaceResult {
  /** Every match in the input, whether or not it gets replaced. */
  matches: TextMatch[];
  /** How many of the matches `output` replaces. */
  replacements: number;
  /** The replaced text; the input itself when there is nothing to do. */
  output: string;
  /** Why the search could not run, or '' when it did. */
  error: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Letters, digits and marks of any script, plus the underscore. `\b` only
// knows ASCII, so it finds no word edge next to "é" or "я".
const WORD_CHARACTER = '[\\p{L}\\p{N}\\p{M}_]';

/** One regex source and the extra flags it needs. */
type Pattern = { source: string; flags: string };

/** The ways to compile the search, most capable first. */
function candidatePatterns({ find, useRegex, wholeWord }: FindReplaceOptions): Pattern[] {
  const source = useRegex ? find : escapeRegExp(find);
  if (!wholeWord) {
    return [{ source, flags: '' }];
  }

  return [
    { source: `(?<!${WORD_CHARACTER})(?:${source})(?!${WORD_CHARACTER})`, flags: 'u' },
    // For a browser without lookbehind, and for a regex that is not valid in
    // Unicode mode (a stray "\-", say): the ASCII-only word boundary.
    { source: `\\b(?:${source})\\b`, flags: '' },
  ];
}

function compile(options: FindReplaceOptions, extraFlags: string): RegExp {
  const baseFlags = `${options.caseSensitive ? '' : 'i'}${extraFlags}`;
  const candidates = candidatePatterns(options);
  let lastError: unknown;

  for (const { source, flags } of candidates) {
    try {
      return new RegExp(source, baseFlags + flags);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export function findAndReplace(input: string, options: FindReplaceOptions): FindReplaceResult {
  if (!options.find) {
    return { matches: [], replacements: 0, output: input, error: '' };
  }

  try {
    const matchRegex = compile(options, 'g');
    const replaceRegex = options.replaceAll ? matchRegex : compile(options, '');

    const matches = Array.from(input.matchAll(matchRegex), (match) => ({
      index: match.index ?? 0,
      text: match[0],
    }));

    const { replace } = options;
    const output = options.useRegex
      ? input.replace(replaceRegex, replace)
      : // A function keeps "$1" and "$&" in a literal replacement as typed.
        input.replace(replaceRegex, () => replace);

    return {
      matches,
      replacements: options.replaceAll ? matches.length : Math.min(matches.length, 1),
      output,
      error: '',
    };
  } catch (error) {
    return {
      matches: [],
      replacements: 0,
      output: input,
      error: error instanceof Error ? error.message : 'Invalid search pattern',
    };
  }
}
