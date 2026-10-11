/**
 * Regex tester logic: runs a pattern against a test string and explains the
 * pattern token by token. Pure, so it runs in Node and in the browser.
 */

import type { TextMatch } from './match-segments';

export interface RegexFlags {
  global: boolean;
  multiline: boolean;
  caseInsensitive: boolean;
  dotAll: boolean;
  unicode: boolean;
}

export interface RegexMatch extends TextMatch {
  /** Capture groups 1..n; a group that took no part in the match is undefined. */
  groups: Array<string | undefined>;
}

export interface RegexTestResult {
  /** False for an empty pattern as well as for one that does not compile. */
  isValid: boolean;
  /** The engine's message for a pattern that does not compile, otherwise ''. */
  error: string;
  matches: RegexMatch[];
}

/** The flags as they are written after the closing slash: "gmi". */
export function toFlagString(flags: RegexFlags): string {
  let value = '';
  if (flags.global) value += 'g';
  if (flags.multiline) value += 'm';
  if (flags.caseInsensitive) value += 'i';
  if (flags.dotAll) value += 's';
  if (flags.unicode) value += 'u';
  return value;
}

function toMatch(match: RegExpExecArray | RegExpMatchArray): RegexMatch {
  return { text: match[0], index: match.index ?? 0, groups: match.slice(1) };
}

/** Every match with the global flag, otherwise only the first. */
export function testRegex(pattern: string, flags: RegexFlags, text: string): RegexTestResult {
  if (!pattern) {
    return { isValid: false, error: '', matches: [] };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, toFlagString(flags));
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Invalid regular expression',
      matches: [],
    };
  }

  if (!text) {
    return { isValid: true, error: '', matches: [] };
  }

  if (flags.global) {
    // matchAll steps past an empty match by a whole character. Stepping by
    // one UTF-16 unit lands inside an emoji, where the u flag steps back and
    // finds the same empty match again, for ever.
    return { isValid: true, error: '', matches: Array.from(text.matchAll(regex), toMatch) };
  }

  const first = regex.exec(text);
  return { isValid: true, error: '', matches: first ? [toMatch(first)] : [] };
}

export interface RegexExplanation {
  token: string;
  description: string;
  category: 'Anchor' | 'Quantifier' | 'Character Class' | 'Group' | 'Literal' | 'Meta';
}

const META_CHARACTERS = ['.', '*', '+', '?', '^', '$', '(', ')', '[', ']', '{', '}', '|', '\\'];

const ESCAPES: Record<string, Omit<RegexExplanation, 'token'>> = {
  d: { description: 'Any digit character (0-9)', category: 'Character Class' },
  D: { description: 'Any non-digit character', category: 'Character Class' },
  w: {
    description: 'Any word character (alphanumeric or underscore)',
    category: 'Character Class',
  },
  W: { description: 'Any non-word character', category: 'Character Class' },
  s: {
    description: 'Any whitespace character (space, tab, newline)',
    category: 'Character Class',
  },
  S: { description: 'Any non-whitespace character', category: 'Character Class' },
  b: { description: 'A word boundary edge', category: 'Anchor' },
  B: { description: 'A non-word boundary edge', category: 'Anchor' },
  n: { description: 'Newline character', category: 'Literal' },
  r: { description: 'Carriage return character', category: 'Literal' },
  t: { description: 'Tab character', category: 'Literal' },
  f: { description: 'Form feed character', category: 'Literal' },
  v: { description: 'Vertical tab character', category: 'Literal' },
  '0': { description: 'Null character', category: 'Literal' },
};

const GROUP_OPENERS: Array<{ prefix: string; description: string }> = [
  { prefix: '(?:', description: 'Start of non-capturing group' },
  { prefix: '(?=', description: 'Start of positive lookahead (what follows must match)' },
  { prefix: '(?!', description: 'Start of negative lookahead (what follows must not match)' },
  { prefix: '(?<=', description: 'Start of positive lookbehind (what precedes must match)' },
  { prefix: '(?<!', description: 'Start of negative lookbehind (what precedes must not match)' },
];

function codePoint(hex: string): string {
  return `U+${hex.toUpperCase().padStart(4, '0')}`;
}

/** Explains the escape that starts at `rest[0] === '\\'`. */
function explainEscape(rest: string, unicode: boolean): RegexExplanation {
  const next = String.fromCodePoint(rest.codePointAt(1) ?? 0);
  const known = ESCAPES[next];
  if (known) {
    return { token: `\\${next}`, ...known };
  }

  const backreference = /^\\[1-9]\d*/.exec(rest);
  if (backreference) {
    return {
      token: backreference[0],
      description: `Backreference: the same text capture group ${backreference[0].slice(1)} matched`,
      category: 'Group',
    };
  }

  const namedBackreference = /^\\k<([^>]+)>/.exec(rest);
  if (namedBackreference) {
    return {
      token: namedBackreference[0],
      description: `Backreference: the same text the group named "${namedBackreference[1]}" matched`,
      category: 'Group',
    };
  }

  const codeEscape = /^\\(?:u\{([0-9A-Fa-f]+)\}|u([0-9A-Fa-f]{4})|x([0-9A-Fa-f]{2}))/.exec(rest);
  // \u{...} only means a code point with the u flag.
  if (codeEscape && (codeEscape[1] === undefined || unicode)) {
    const hex = codeEscape[1] ?? codeEscape[2] ?? codeEscape[3];
    return {
      token: codeEscape[0],
      description: `Character with code ${codePoint(hex)}`,
      category: 'Literal',
    };
  }

  const property = /^\\([pP])\{([^}]+)\}/.exec(rest);
  if (property && unicode) {
    return {
      token: property[0],
      description:
        property[1] === 'p'
          ? `Any character with the Unicode property "${property[2]}"`
          : `Any character without the Unicode property "${property[2]}"`,
      category: 'Character Class',
    };
  }

  return {
    token: `\\${next}`,
    description: META_CHARACTERS.includes(next)
      ? `Escaped special meta-character "${next}" (matches literal "${next}")`
      : `Literal character "${next}"`,
    category: 'Literal',
  };
}

/** Index of the "]" that closes the class opened at `start`, or -1. */
function findClassEnd(pattern: string, start: number): number {
  for (let index = start + 1; index < pattern.length; index++) {
    if (pattern[index] === '\\') {
      // "\]" is a bracket inside the class, not its end.
      index++;
    } else if (pattern[index] === ']') {
      return index;
    }
  }
  return -1;
}

function explainClass(token: string): RegexExplanation {
  const isNegated = token.startsWith('[^');
  const content = token.slice(isNegated ? 2 : 1, -1);

  let description: string;
  if (content === '') {
    description = isNegated ? 'Any character, including newline' : 'Empty set (matches nothing)';
  } else {
    description = isNegated
      ? `Any single character NOT in set: "${content}"`
      : `Any single character in set: "${content}"`;
  }

  return { token, description, category: 'Character Class' };
}

/**
 * A token-by-token reading of a pattern. It follows JavaScript syntax closely
 * enough for the patterns people test, but it is a guide, not a parser: it is
 * only shown for patterns the engine has already accepted.
 */
export function explainRegex(
  pattern: string,
  flags: Partial<Pick<RegexFlags, 'dotAll' | 'unicode'>> = {}
): RegexExplanation[] {
  const explanations: RegexExplanation[] = [];
  const push = (token: string, description: string, category: RegexExplanation['category']) => {
    explanations.push({ token, description, category });
  };

  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];

    // 1. Escaped characters
    if (char === '\\' && i + 1 < pattern.length) {
      const explanation = explainEscape(pattern.slice(i), flags.unicode === true);
      explanations.push(explanation);
      i += explanation.token.length;
      continue;
    }

    // 2. Anchors
    if (char === '^') {
      push('^', 'Start of string (or line)', 'Anchor');
      i++;
      continue;
    }
    if (char === '$') {
      push('$', 'End of string (or line)', 'Anchor');
      i++;
      continue;
    }

    // 3. Dot (Any char)
    if (char === '.') {
      push(
        '.',
        flags.dotAll ? 'Any character, including newline' : 'Any character except newline',
        'Character Class'
      );
      i++;
      continue;
    }

    // 4. Quantifiers: *, +, ?
    if (char === '*') {
      push('*', 'Repeat preceding element 0 or more times', 'Quantifier');
      i++;
      continue;
    }
    if (char === '+') {
      push('+', 'Repeat preceding element 1 or more times', 'Quantifier');
      i++;
      continue;
    }
    if (char === '?') {
      const prev = explanations[explanations.length - 1];
      if (prev && prev.category === 'Quantifier') {
        prev.token += '?';
        prev.description += ' (lazy/non-greedy match)';
      } else {
        push('?', 'Preceding element is optional (matches 0 or 1 time)', 'Quantifier');
      }
      i++;
      continue;
    }

    // 5. Quantifier range: {n}, {min,}, {min,max}. Any other "{" is a literal.
    if (char === '{') {
      const range = /^\{(\d+)(?:(,)(\d*))?\}/.exec(pattern.slice(i));
      if (range) {
        const [token, min, comma, max] = range;
        let description = `Repeat preceding element: exactly ${min} times`;
        if (comma) {
          description =
            max === ''
              ? `Repeat preceding element: ${min} or more times`
              : `Repeat preceding element: between ${min} and ${max} times`;
        }
        push(token, description, 'Quantifier');
        i += token.length;
        continue;
      }
    }

    // 6. Character sets: [abc], [a-z]
    if (char === '[') {
      const endIdx = findClassEnd(pattern, i);
      if (endIdx !== -1) {
        explanations.push(explainClass(pattern.substring(i, endIdx + 1)));
        i = endIdx + 1;
        continue;
      }
    }

    // 7. Groups
    if (char === '(') {
      const opener = GROUP_OPENERS.find(({ prefix }) => pattern.startsWith(prefix, i));
      const named = /^\(\?<([^>=!][^>]*)>/.exec(pattern.slice(i));
      if (opener) {
        push(opener.prefix, opener.description, 'Group');
        i += opener.prefix.length;
      } else if (named) {
        push(named[0], `Start of capturing group named "${named[1]}"`, 'Group');
        i += named[0].length;
      } else {
        push('(', 'Start of capturing group', 'Group');
        i++;
      }
      continue;
    }
    if (char === ')') {
      push(')', 'End of group', 'Group');
      i++;
      continue;
    }

    // 8. Alternation
    if (char === '|') {
      push('|', 'OR match (match left or right expression)', 'Meta');
      i++;
      continue;
    }

    // 9. Standard literals, one whole character at a time (an emoji is two
    // UTF-16 units).
    const literal = String.fromCodePoint(pattern.codePointAt(i) ?? 0);
    push(literal, `Literal character "${literal}"`, 'Literal');
    i += literal.length;
  }

  return explanations;
}
