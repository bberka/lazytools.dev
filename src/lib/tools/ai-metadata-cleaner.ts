/**
 * Text half of the AI Metadata Cleaner: removes the invisible characters and
 * the tracking query strings that AI chat tools leave in pasted text.
 *
 * The character tables and the emoji-sequence rules come from the Unicode
 * inspector; this module only groups its character classes into the cleanup
 * categories the user can switch on and off, and rewrites URLs.
 *
 * Pure functions, no DOM: they run in Node as well as in the browser.
 */

import {
  describeCodePoint,
  findEmojiSequenceMembers,
  isScriptJoiner,
  type CharClass,
} from '@/lib/tools/unicode-inspector';

export const TEXT_CATEGORIES = [
  'invisible',
  'softHyphen',
  'bidi',
  'tags',
  'variationSelectors',
  'spaces',
  'trackingParams',
] as const;

export type TextCategory = (typeof TEXT_CATEGORIES)[number];

export interface TextCategoryInfo {
  label: string;
  description: string;
}

export const TEXT_CATEGORY_INFO: Record<TextCategory, TextCategoryInfo> = {
  invisible: {
    label: 'Zero-width and invisible characters',
    description:
      'Zero-width space, joiner and non-joiner, word joiner, byte order mark, fillers and control codes.',
  },
  softHyphen: {
    label: 'Soft hyphens',
    description: 'U+00AD, invisible unless a line breaks there.',
  },
  bidi: {
    label: 'Bidirectional controls',
    description: 'Direction marks, embeddings, overrides and isolates.',
  },
  tags: {
    label: 'Unicode tag characters',
    description: 'U+E0000 to U+E007F, invisible copies of ASCII that can carry a hidden message.',
  },
  variationSelectors: {
    label: 'Variation selectors',
    description: 'Used to smuggle data. The ones that give an emoji its colour or text look stay.',
  },
  spaces: {
    label: 'Exotic spaces',
    description: 'Narrow no-break, no-break, thin, em and other spaces become a normal space.',
  },
  trackingParams: {
    label: 'Tracking parameters in URLs',
    description:
      'utm_* parameters and ref or source parameters naming an AI assistant, such as utm_source=chatgpt.com.',
  },
};

export type TextCleanOptions = Readonly<Record<TextCategory, boolean>>;
export type TextCategoryCounts = Record<TextCategory, number>;

export const DEFAULT_TEXT_OPTIONS: TextCleanOptions = {
  invisible: true,
  softHyphen: true,
  bidi: true,
  tags: true,
  variationSelectors: true,
  spaces: true,
  trackingParams: true,
};

export interface TextCleanResult {
  text: string;
  /** What the text contains per category, whether or not that category is switched on. */
  found: TextCategoryCounts;
  /** What was removed or replaced, per category: `found` for the categories that are on, 0 for the rest. */
  applied: TextCategoryCounts;
  /** Sum of `applied`. */
  total: number;
  changed: boolean;
}

const emptyCounts = (): TextCategoryCounts => ({
  invisible: 0,
  softHyphen: 0,
  bidi: 0,
  tags: 0,
  variationSelectors: 0,
  spaces: 0,
  trackingParams: 0,
});

const CLASS_CATEGORY: Partial<Record<CharClass, TextCategory>> = {
  'zero-width': 'invisible',
  filler: 'invisible',
  control: 'invisible',
  'soft-hyphen': 'softHyphen',
  bidi: 'bidi',
  tag: 'tags',
  'variation-selector': 'variationSelectors',
  space: 'spaces',
};

function categoryOf(
  codePoints: readonly number[],
  index: number,
  members: ReadonlySet<number>
): TextCategory | null {
  // Joiners, emoji presentation selectors and flag tags that belong to an emoji, and the joiners of Persian or Indic words.
  if (members.has(index) || isScriptJoiner(codePoints, index)) return null;
  const codePoint = codePoints[index];
  if (codePoint >= 0xe0000 && codePoint <= 0xe007f) return 'tags';
  const info = describeCodePoint(codePoint);
  return info ? (CLASS_CATEGORY[info.className] ?? null) : null;
}

// URLs

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
// Characters that end a sentence or a Markdown link rather than the address. They are put back unchanged.
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>*_]+$/;
const AI_REFERRER =
  /^(chatgpt(\.com)?|openai(\.com)?|claude(\.ai)?|anthropic|gemini|bard|perplexity(\.ai)?|copilot)$/i;
const REFERRER_KEYS = new Set(['ref', 'referrer', 'referer', 'source', 'src', 'from']);

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function isTrackingParam(pair: string): boolean {
  const separator = pair.indexOf('=');
  const key = safeDecode(separator < 0 ? pair : pair.slice(0, separator)).toLowerCase();
  if (key.startsWith('utm_')) return true;
  if (separator < 0 || !REFERRER_KEYS.has(key)) return false;
  return AI_REFERRER.test(safeDecode(pair.slice(separator + 1)).trim());
}

/** Drops the tracking parameters of one URL, leaving every other byte as it was. */
export function stripTrackingParams(url: string): { url: string; removed: number } {
  const hash = url.indexOf('#');
  const fragment = hash < 0 ? '' : url.slice(hash);
  const withoutFragment = hash < 0 ? url : url.slice(0, hash);
  const question = withoutFragment.indexOf('?');
  if (question < 0) return { url, removed: 0 };

  const pairs = withoutFragment.slice(question + 1).split('&');
  const kept = pairs.filter((pair) => !isTrackingParam(pair));
  const removed = pairs.length - kept.length;
  if (removed === 0) return { url, removed: 0 };

  const base = withoutFragment.slice(0, question);
  return { url: `${base}${kept.length > 0 ? `?${kept.join('&')}` : ''}${fragment}`, removed };
}

/** Strips tracking parameters from every http(s) URL in the text. */
export function stripTrackingParamsInText(text: string): { text: string; removed: number } {
  let removed = 0;
  const result = text.replace(URL_PATTERN, (match) => {
    const trailing = TRAILING_PUNCTUATION.exec(match)?.[0] ?? '';
    const address = trailing ? match.slice(0, -trailing.length) : match;
    const cleaned = stripTrackingParams(address);
    removed += cleaned.removed;
    return cleaned.url + trailing;
  });
  return { text: result, removed };
}

// Cleaning

/**
 * Counts every category in the text and applies the ones that are switched on.
 * Characters go first, then URLs, so a URL with a zero-width character inside
 * is parsed as the address it really is.
 */
export function cleanAiText(
  text: string,
  options: TextCleanOptions = DEFAULT_TEXT_OPTIONS
): TextCleanResult {
  const found = emptyCounts();
  const codePoints = Array.from(text, (char) => char.codePointAt(0) ?? 0);
  const members = findEmojiSequenceMembers(codePoints);
  const kept: string[] = [];

  codePoints.forEach((codePoint, index) => {
    const category = categoryOf(codePoints, index, members);
    if (category === null) {
      kept.push(String.fromCodePoint(codePoint));
      return;
    }
    found[category] += 1;
    if (!options[category]) kept.push(String.fromCodePoint(codePoint));
    else if (category === 'spaces') kept.push(' ');
  });

  const characters = kept.join('');
  const urls = stripTrackingParamsInText(characters);
  found.trackingParams = urls.removed;
  const output = options.trackingParams ? urls.text : characters;

  const applied = emptyCounts();
  for (const category of TEXT_CATEGORIES)
    applied[category] = options[category] ? found[category] : 0;
  const total = TEXT_CATEGORIES.reduce((sum, category) => sum + applied[category], 0);

  return { text: output, found, applied, total, changed: output !== text };
}
