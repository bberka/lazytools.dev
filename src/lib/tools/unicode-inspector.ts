/**
 * Unicode & Zero-Width Inspector logic.
 *
 * `inspectText` walks the text once, by code point, and returns everything the
 * tool shows: statistics, a capped table of per-character facts, the pieces of
 * a highlighted view, and any ASCII hidden in tag characters. `cleanText`
 * applies the cleanup actions (remove invisible characters, replace
 * non-standard spaces, Unicode normalisation) in a fixed order.
 *
 * Joiners, variation selectors and tag characters are kept when they belong to
 * an emoji sequence, because removing them would change what the emoji looks
 * like. The rules follow UAX #29 rule GB11 and UTS #51 (ZWJ, presentation
 * selector and tag sequences).
 *
 * Pure functions, no DOM, no side effects: they run in Node as well as in the
 * browser.
 */

import {
  CHAR_CLASSES,
  CHAR_TABLE,
  CLASS_INFO,
  GENERAL_CATEGORIES,
  HTML_NAMED_ENTITIES,
  type CharClass,
  type CharEntry,
} from '@/lib/tools/unicode-inspector-data';

export { CHAR_CLASSES, CHAR_TABLE, CLASS_INFO, type CharClass, type CharEntry };

export const DEFAULT_MAX_ROWS = 500;
export const DEFAULT_MAX_MARKS = 2000;

const ZWNJ = 0x200c;
const ZWJ = 0x200d;
const VS15 = 0xfe0e;
const VS16 = 0xfe0f;
const KEYCAP = 0x20e3;
const CANCEL_TAG = 0xe007f;

const ENTRY_BY_CODE_POINT: ReadonlyMap<number, CharEntry> = new Map(
  CHAR_TABLE.map((item) => [item.codePoint, item])
);

const DEFAULT_IGNORABLE = /^\p{Default_Ignorable_Code_Point}$/u;
const SPACE_SEPARATOR = /^\p{Zs}$/u;
const MARK = /^\p{M}$/u;
const LETTER_OR_MARK = /^[\p{L}\p{M}]$/u;
const LATIN = /^\p{Script=Latin}$/u;
const EXTENDED_PICTOGRAPHIC = /^\p{Extended_Pictographic}$/u;
const EMOJI = /^\p{Emoji}$/u;
const GRAPHEME_EXTEND = /^[\p{Grapheme_Extend}\p{Mc}]$/u;

// ---------------------------------------------------------------------------
// Code point basics
// ---------------------------------------------------------------------------

function toCodePoints(text: string): number[] {
  const codePoints: number[] = [];
  for (const char of text) {
    codePoints.push(char.codePointAt(0) ?? 0);
  }
  return codePoints;
}

function isValidCodePoint(codePoint: number): boolean {
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff;
}

/** "U+0041", "U+1F600": four digits at least, upper case. */
export function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * UTF-8 bytes of one code point. A lone surrogate has no UTF-8 form; like
 * TextEncoder, this encodes it as U+FFFD (EF BF BD).
 */
export function utf8Bytes(codePoint: number): number[] {
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return [0xef, 0xbf, 0xbd];
  if (codePoint < 0x80) return [codePoint];
  if (codePoint < 0x800) return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
  if (codePoint < 0x10000) {
    return [0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f)];
  }
  return [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  ];
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** UTF-16 code units of one code point: one unit, or a surrogate pair above U+FFFF. */
export function utf16Units(codePoint: number): number[] {
  if (codePoint < 0x10000) return [codePoint];
  const offset = codePoint - 0x10000;
  return [0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff)];
}

function hexBytes(bytes: readonly number[], width: number): string {
  return bytes.map((byte) => byte.toString(16).toUpperCase().padStart(width, '0')).join(' ');
}

/** JavaScript string escape: \uXXXX in the BMP, \u{X} above it. */
export function jsEscape(codePoint: number): string {
  if (codePoint > 0xffff) return `\\u{${codePoint.toString(16).toUpperCase()}}`;
  return `\\u${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** Named HTML entity where a well-known one exists, otherwise a hexadecimal reference. */
export function htmlEntity(codePoint: number): string {
  return HTML_NAMED_ENTITIES[codePoint] ?? `&#x${codePoint.toString(16).toUpperCase()};`;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function isPrivateUse(codePoint: number): boolean {
  return (
    (codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
    (codePoint >= 0xf0000 && codePoint <= 0xffffd) ||
    (codePoint >= 0x100000 && codePoint <= 0x10fffd)
  );
}

function isNoncharacter(codePoint: number): boolean {
  return (codePoint >= 0xfdd0 && codePoint <= 0xfdef) || (codePoint & 0xfffe) === 0xfffe;
}

/**
 * The table entry for a code point, or null for an ordinary character.
 * Listed characters come from the table. Private use, noncharacters, lone
 * surrogates and unlisted default-ignorable or space characters get a
 * generic entry.
 */
export function describeCodePoint(codePoint: number): CharEntry | null {
  if (!isValidCodePoint(codePoint)) return null;
  if (codePoint >= 0x20 && codePoint < 0x7f) return null;

  const known = ENTRY_BY_CODE_POINT.get(codePoint);
  if (known) return known;

  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    return { codePoint, short: 'SURR', name: 'Unpaired surrogate', className: 'malformed' };
  }
  if (isNoncharacter(codePoint)) {
    return { codePoint, short: 'NONCHAR', name: 'Noncharacter', className: 'malformed' };
  }
  if (isPrivateUse(codePoint)) {
    return { codePoint, short: 'PUA', name: 'Private use character', className: 'private-use' };
  }

  const char = String.fromCodePoint(codePoint);
  if (SPACE_SEPARATOR.test(char)) {
    return { codePoint, short: formatCodePoint(codePoint), name: 'Space separator', className: 'space' };
  }
  if (DEFAULT_IGNORABLE.test(char)) {
    return {
      codePoint,
      short: formatCodePoint(codePoint),
      name: 'Default-ignorable character',
      className: 'zero-width',
    };
  }
  return null;
}

function categoryLabel(codePoint: number): string {
  if (codePoint === 0x20) return 'Space';
  const char = String.fromCodePoint(codePoint);
  const category = GENERAL_CATEGORIES.find((item) => item.test.test(char));
  return category ? `${category.label} (${category.code})` : 'Unknown';
}

// ---------------------------------------------------------------------------
// Emoji sequences
// ---------------------------------------------------------------------------

function isEmojiModifier(codePoint: number): boolean {
  return codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
}

function isTagSpec(codePoint: number | undefined): boolean {
  return codePoint !== undefined && codePoint >= 0xe0020 && codePoint <= 0xe007e;
}

function isExtendedPictographic(codePoint: number | undefined): boolean {
  return (
    codePoint !== undefined && codePoint >= 0xa9 && EXTENDED_PICTOGRAPHIC.test(String.fromCodePoint(codePoint))
  );
}

function isEmoji(codePoint: number): boolean {
  return codePoint >= 0x23 && EMOJI.test(String.fromCodePoint(codePoint));
}

function isKeycapBase(codePoint: number): boolean {
  return codePoint === 0x23 || codePoint === 0x2a || (codePoint >= 0x30 && codePoint <= 0x39);
}

/** True when an emoji (pictographic) character sits before `index`, ignoring presentation selectors and skin tones. */
function emojiBaseBefore(codePoints: readonly number[], index: number): boolean {
  let position = index - 1;
  while (
    position >= 0 &&
    (codePoints[position] === VS16 || codePoints[position] === VS15 || isEmojiModifier(codePoints[position]))
  ) {
    position--;
  }
  return position >= 0 && isExtendedPictographic(codePoints[position]);
}

/**
 * Indices of the joiners, presentation selectors and tag characters that are
 * part of an emoji sequence:
 * - a ZWJ between two pictographic characters (UAX #29 GB11),
 * - VS15 or VS16 right after an emoji character, and VS16 in a keycap sequence,
 * - the tag characters of a flag tag sequence, up to and including the cancel tag.
 */
function findEmojiSequenceMembers(codePoints: readonly number[]): Set<number> {
  const members = new Set<number>();

  for (let index = 0; index < codePoints.length; index++) {
    const codePoint = codePoints[index];

    if (codePoint === ZWJ) {
      if (isExtendedPictographic(codePoints[index + 1]) && emojiBaseBefore(codePoints, index)) {
        members.add(index);
      }
    } else if (codePoint === VS16 || codePoint === VS15) {
      const previous = codePoints[index - 1];
      if (previous !== undefined && isEmoji(previous)) {
        const keycap = isKeycapBase(previous);
        if (!keycap || (codePoint === VS16 && codePoints[index + 1] === KEYCAP)) members.add(index);
      }
    } else if (isTagSpec(codePoint) && !isTagSpec(codePoints[index - 1])) {
      let end = index;
      while (isTagSpec(codePoints[end])) end++;
      if (codePoints[end] === CANCEL_TAG && emojiBaseBefore(codePoints, index)) {
        for (let tag = index; tag <= end; tag++) members.add(tag);
      }
      index = end - 1;
    }
  }

  return members;
}

/**
 * A ZWNJ or ZWJ between two letters or marks that are not both Latin, as in
 * Persian or Devanagari, where they change how the word is shaped.
 */
function isScriptJoiner(codePoints: readonly number[], index: number): boolean {
  const codePoint = codePoints[index];
  if (codePoint !== ZWNJ && codePoint !== ZWJ) return false;
  const previous = codePoints[index - 1];
  const next = codePoints[index + 1];
  if (previous === undefined || next === undefined) return false;
  const before = String.fromCodePoint(previous);
  const after = String.fromCodePoint(next);
  if (!LETTER_OR_MARK.test(before) || !LETTER_OR_MARK.test(after)) return false;
  return !(LATIN.test(before) && LATIN.test(after));
}

// ---------------------------------------------------------------------------
// Grapheme clusters
// ---------------------------------------------------------------------------

export type GraphemeMethod = 'intl-segmenter' | 'approximate';

/**
 * Grapheme cluster count without Intl.Segmenter. Handles combining marks,
 * ZWJ emoji sequences, skin tones, variation selectors, tag sequences,
 * regional-indicator flag pairs and CR LF. It does not implement the Hangul
 * syllable or Prepend rules, so treat it as an estimate.
 */
export function countGraphemesApproximate(text: string): number {
  const codePoints = toCodePoints(text);
  let count = 0;
  let regionalRun = 0;

  for (let index = 0; index < codePoints.length; index++) {
    const codePoint = codePoints[index];
    const previous = codePoints[index - 1];
    const isRegional = codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;

    let joinsPrevious = false;
    if (previous !== undefined) {
      if (previous === 0x0d && codePoint === 0x0a) {
        joinsPrevious = true;
      } else if (previous === 0x0d || previous === 0x0a || previous < 0x20 || codePoint < 0x20) {
        joinsPrevious = false;
      } else if (
        codePoint === ZWJ ||
        codePoint === ZWNJ ||
        isEmojiModifier(codePoint) ||
        isTagSpec(codePoint) ||
        codePoint === CANCEL_TAG ||
        GRAPHEME_EXTEND.test(String.fromCodePoint(codePoint))
      ) {
        joinsPrevious = true;
      } else if (previous === ZWJ && isExtendedPictographic(codePoint)) {
        joinsPrevious = true;
      } else if (isRegional && regionalRun % 2 === 1) {
        joinsPrevious = true;
      }
    }

    regionalRun = isRegional ? regionalRun + 1 : 0;
    if (!joinsPrevious) count++;
  }

  return count;
}

let cachedSegmenter: Intl.Segmenter | null | undefined;

function getSegmenter(): Intl.Segmenter | null {
  if (cachedSegmenter === undefined) {
    cachedSegmenter =
      typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;
  }
  return cachedSegmenter;
}

/** Grapheme clusters via Intl.Segmenter when the runtime has it, otherwise an estimate. */
export function countGraphemes(text: string): { count: number; method: GraphemeMethod } {
  const segmenter = getSegmenter();
  if (!segmenter) return { count: countGraphemesApproximate(text), method: 'approximate' };

  const iterator = segmenter.segment(text)[Symbol.iterator]();
  let count = 0;
  while (!iterator.next().done) count++;
  return { count, method: 'intl-segmenter' };
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

export interface CharRow {
  /** 1-based position among the code points of the text. */
  position: number;
  /** UTF-16 offset of the first code unit. */
  offset: number;
  codePoint: number;
  /** "U+200B" */
  hex: string;
  /** Table name for a known character, otherwise the general category, for example "Lowercase letter (Ll)". */
  label: string;
  /** What to show as the character: the badge text for a listed character, a printable form otherwise. */
  glyph: string;
  /** True when `glyph` is a badge text rather than the character itself. */
  badge: boolean;
  className: CharClass | null;
  /** Invisible, special or suspicious (any class except plain tab, line feed and carriage return). */
  flagged: boolean;
  /** A joiner, selector or tag that belongs to an emoji sequence. */
  emojiPart: boolean;
  /** "E2 80 8B" */
  utf8: string;
  /** "D83D DE00" */
  utf16: string;
  html: string;
  js: string;
}

export type HighlightSegment =
  | { kind: 'text'; text: string }
  | {
      kind: 'mark';
      /** Badge text. */
      short: string;
      /** Tooltip: code point and name. */
      title: string;
      className: CharClass;
      flagged: boolean;
      emojiPart: boolean;
      /** Real whitespace that follows the badge, so line breaks and tabs keep their layout. */
      after: string;
    };

export interface TextStats {
  utf16Length: number;
  codePoints: number;
  graphemes: number;
  graphemeMethod: GraphemeMethod;
  utf8Bytes: number;
  /** Invisible or suspicious characters, not counting emoji sequence parts. */
  flagged: number;
  /** Joiners, selectors and tags that are part of emoji sequences. */
  emojiParts: number;
  /** `flagged` split by class. */
  byClass: Partial<Record<CharClass, number>>;
}

export interface InspectOptions {
  /** Rows to return at most. */
  maxRows?: number;
  /** Only list invisible, special and suspicious characters. */
  onlyFlagged?: boolean;
  /** Also mark tabs, line feeds and carriage returns in the highlighted view. */
  markWhitespace?: boolean;
  /** Marked characters to put in the highlighted view at most. */
  maxMarks?: number;
}

export interface Inspection {
  stats: TextStats;
  rows: CharRow[];
  /** Rows that matched the filter, before the cap. */
  totalRows: number;
  rowsTruncated: boolean;
  highlight: HighlightSegment[];
  /** The highlighted view stops early because of `maxMarks`. */
  highlightTruncated: boolean;
  /** ASCII spelled by tag characters that are not part of an emoji flag. Empty when there are none. */
  hiddenTagText: string;
}

const LINE_BREAK_AFTER: ReadonlySet<number> = new Set([0x0a, 0x85, 0x2028, 0x2029]);

function glyphFor(codePoint: number, info: CharEntry | null): { glyph: string; badge: boolean } {
  if (info) return { glyph: info.short, badge: true };
  if (codePoint === 0x20) return { glyph: '\u2423', badge: false };
  const char = String.fromCodePoint(codePoint);
  // A combining mark on its own is drawn on a dotted circle.
  return { glyph: MARK.test(char) ? `\u25CC${char}` : char, badge: false };
}

/** Inspect `text`: statistics, character table rows, highlighted view segments and hidden tag text. */
export function inspectText(text: string, options: InspectOptions = {}): Inspection {
  const {
    maxRows = DEFAULT_MAX_ROWS,
    onlyFlagged = false,
    markWhitespace = false,
    maxMarks = DEFAULT_MAX_MARKS,
  } = options;

  const codePoints = toCodePoints(text);
  const members = findEmojiSequenceMembers(codePoints);

  const rows: CharRow[] = [];
  const highlight: HighlightSegment[] = [];
  const byClass: Partial<Record<CharClass, number>> = {};
  let totalRows = 0;
  let flagged = 0;
  let emojiParts = 0;
  let utf8Total = 0;
  let marks = 0;
  let highlightTruncated = false;
  let hiddenTagText = '';
  let offset = 0;
  let runStart = 0;

  for (let index = 0; index < codePoints.length; index++) {
    const codePoint = codePoints[index];
    const width = codePoint > 0xffff ? 2 : 1;
    const info = describeCodePoint(codePoint);
    const className = info ? info.className : null;
    const isFlagged = className !== null && CLASS_INFO[className].flagged;
    const emojiPart = info !== null && members.has(index);

    utf8Total += utf8Length(codePoint);

    if (isFlagged) {
      if (emojiPart) {
        emojiParts++;
      } else {
        flagged++;
        if (className) byClass[className] = (byClass[className] ?? 0) + 1;
        if (className === 'tag' && isTagSpec(codePoint)) {
          hiddenTagText += String.fromCharCode(codePoint - 0xe0000);
        }
      }
    }

    if (!onlyFlagged || isFlagged) {
      totalRows++;
      if (rows.length < maxRows) {
        const { glyph, badge } = glyphFor(codePoint, info);
        rows.push({
          position: index + 1,
          offset,
          codePoint,
          hex: formatCodePoint(codePoint),
          label: info ? info.name : categoryLabel(codePoint),
          glyph,
          badge,
          className,
          flagged: isFlagged,
          emojiPart,
          utf8: hexBytes(utf8Bytes(codePoint), 2),
          utf16: hexBytes(utf16Units(codePoint), 4),
          html: htmlEntity(codePoint),
          js: jsEscape(codePoint),
        });
      }
    }

    if (info && className && !highlightTruncated && (isFlagged || (markWhitespace && className === 'whitespace'))) {
      if (marks >= maxMarks) {
        highlightTruncated = true;
        if (offset > runStart) highlight.push({ kind: 'text', text: text.slice(runStart, offset) });
      } else {
        if (offset > runStart) highlight.push({ kind: 'text', text: text.slice(runStart, offset) });
        marks++;
        highlight.push({
          kind: 'mark',
          short: info.short,
          title: `${formatCodePoint(codePoint)} ${info.name}`,
          className,
          flagged: isFlagged,
          emojiPart,
          after: LINE_BREAK_AFTER.has(codePoint) ? '\n' : codePoint === 0x09 ? '\t' : '',
        });
        runStart = offset + width;
      }
    }

    offset += width;
  }

  if (!highlightTruncated && offset > runStart) {
    highlight.push({ kind: 'text', text: text.slice(runStart, offset) });
  }

  const graphemes = countGraphemes(text);

  return {
    stats: {
      utf16Length: text.length,
      codePoints: codePoints.length,
      graphemes: graphemes.count,
      graphemeMethod: graphemes.method,
      utf8Bytes: utf8Total,
      flagged,
      emojiParts,
      byClass,
    },
    rows,
    totalRows,
    rowsTruncated: totalRows > rows.length,
    highlight,
    highlightTruncated,
    hiddenTagText,
  };
}

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

export type NormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';

export const NORMALIZATION_FORMS: readonly NormalizationForm[] = ['NFC', 'NFD', 'NFKC', 'NFKD'];

export interface RemoveOptions {
  /**
   * Keep ZWNJ and ZWJ between letters of scripts where they shape the word
   * (Persian, Indic). Off by default, because the same characters are used to
   * hide text inside Latin words.
   */
  keepScriptJoiners?: boolean;
}

export interface CleanStep {
  text: string;
  /** Characters removed or replaced. */
  count: number;
}

/**
 * Remove invisible characters: zero-width, filler, soft hyphen, bidirectional
 * controls, variation selectors, tag characters and control codes. Tab, line
 * feed and carriage return stay. Joiners, VS15/VS16 and flag tag sequences
 * that belong to an emoji sequence stay too.
 */
export function removeInvisibleCharacters(text: string, options: RemoveOptions = {}): CleanStep {
  const codePoints = toCodePoints(text);
  const members = findEmojiSequenceMembers(codePoints);
  const kept: string[] = [];
  let count = 0;

  codePoints.forEach((codePoint, index) => {
    const info = describeCodePoint(codePoint);
    const removable =
      info !== null &&
      CLASS_INFO[info.className].removable &&
      !members.has(index) &&
      !(options.keepScriptJoiners && isScriptJoiner(codePoints, index));

    if (removable) {
      count++;
    } else {
      kept.push(String.fromCodePoint(codePoint));
    }
  });

  return { text: kept.join(''), count };
}

/** Replace every non-standard space (no-break, en, em, thin, ideographic, ...) with U+0020, one for one. */
export function replaceNonStandardSpaces(text: string): CleanStep {
  const out: string[] = [];
  let count = 0;

  for (const char of text) {
    const info = describeCodePoint(char.codePointAt(0) ?? 0);
    if (info && info.className === 'space') {
      out.push(' ');
      count++;
    } else {
      out.push(char);
    }
  }

  return { text: out.join(''), count };
}

/** Unicode normalisation form NFC, NFD, NFKC or NFKD. */
export function normalizeText(text: string, form: NormalizationForm): string {
  return text.normalize(form);
}

export interface CleanOptions extends RemoveOptions {
  removeInvisible?: boolean;
  replaceSpaces?: boolean;
  normalization?: NormalizationForm | 'none';
}

export interface CleanResult {
  text: string;
  removed: number;
  replaced: number;
  /** Normalisation was requested and changed the text. */
  normalizationChanged: boolean;
  changed: boolean;
}

/**
 * Apply the selected cleanup steps in a fixed order: remove invisible
 * characters, replace spaces, then normalise. Normalising last means it sees
 * the final characters (a removed combining grapheme joiner can no longer
 * block reordering).
 */
export function cleanText(text: string, options: CleanOptions = {}): CleanResult {
  const { removeInvisible = false, replaceSpaces = false, normalization = 'none', keepScriptJoiners } = options;
  let current = text;
  let removed = 0;
  let replaced = 0;
  let normalizationChanged = false;

  if (removeInvisible) {
    const step = removeInvisibleCharacters(current, { keepScriptJoiners });
    current = step.text;
    removed = step.count;
  }
  if (replaceSpaces) {
    const step = replaceNonStandardSpaces(current);
    current = step.text;
    replaced = step.count;
  }
  if (normalization !== 'none') {
    const normalised = normalizeText(current, normalization);
    normalizationChanged = normalised !== current;
    current = normalised;
  }

  return { text: current, removed, replaced, normalizationChanged, changed: current !== text };
}

// ---------------------------------------------------------------------------
// Example
// ---------------------------------------------------------------------------

/** A short text with one of each common trap, written with escapes so the source shows what is in it. */
export const EXAMPLE_TEXT = [
  'Invoice\u200B number: 4821',
  'Price:\u00A0\u20AC12,50',
  'Soft\u00ADhyphen and a word\u2060joiner',
  '\uFEFFThis line starts with a byte order mark',
  'Open report\u202E fdp.exe',
  'Family: \u{1F468}\u200D\u{1F469}\u200D\u{1F467} and a heart: \u2764\uFE0F',
  'Hidden message: \u{E0068}\u{E0069}',
].join('\n');
