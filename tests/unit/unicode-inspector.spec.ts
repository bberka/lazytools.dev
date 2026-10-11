import { test, expect } from '@playwright/test';
import {
  CHAR_CLASSES,
  CHAR_TABLE,
  CLASS_INFO,
  EXAMPLE_TEXT,
  cleanText,
  countGraphemes,
  countGraphemesApproximate,
  describeCodePoint,
  htmlEntity,
  inspectText,
  jsEscape,
  normalizeText,
  removeInvisibleCharacters,
  replaceNonStandardSpaces,
  utf16Units,
  utf8Bytes,
  type CharClass,
} from '@/lib/tools/unicode-inspector';

// Test vectors. The UTF-8 and UTF-16 figures are the standard encodings
// (RFC 3629 and the UTF-16 surrogate formula in the Unicode Standard), for
// example EURO SIGN = E2 82 AC, GRINNING FACE = F0 9F 98 80 / D83D DE00, and
// U+10FFFF = F4 8F BF BF / DBFF DFFF. Byte and unit totals for emoji
// sequences were added up by hand from the code points, not taken from the
// module. The normalisation example is the one in UAX #15.

const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}';
const US_FLAG = '\u{1F1FA}\u{1F1F8}';
const THUMBS_UP_MEDIUM = '\u{1F44D}\u{1F3FD}';
const E_ACUTE_DECOMPOSED = 'e\u0301';
const ENGLAND_FLAG = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
const RED_HEART = '\u2764\uFE0F';
const KEYCAP_ONE = '1\uFE0F\u20E3';
const RAINBOW_FLAG = '\u{1F3F3}\uFE0F\u200D\u{1F308}';

/** Encode ASCII as invisible tag characters (U+E0020 to U+E007E). */
function tagEncode(ascii: string): string {
  return Array.from(ascii, (char) => String.fromCodePoint(0xe0000 + char.charCodeAt(0))).join('');
}

test.describe('UTF-8 and UTF-16 encoding', () => {
  const utf8Vectors: Array<[number, number[]]> = [
    [0x0000, [0x00]],
    [0x0041, [0x41]],
    [0x007f, [0x7f]],
    [0x0080, [0xc2, 0x80]],
    [0x00e9, [0xc3, 0xa9]],
    [0x07ff, [0xdf, 0xbf]],
    [0x0800, [0xe0, 0xa0, 0x80]],
    [0x20ac, [0xe2, 0x82, 0xac]],
    [0xd7ff, [0xed, 0x9f, 0xbf]],
    [0xe000, [0xee, 0x80, 0x80]],
    [0xffff, [0xef, 0xbf, 0xbf]],
    [0x10000, [0xf0, 0x90, 0x80, 0x80]],
    [0x1f600, [0xf0, 0x9f, 0x98, 0x80]],
    [0x10ffff, [0xf4, 0x8f, 0xbf, 0xbf]],
  ];

  for (const [codePoint, bytes] of utf8Vectors) {
    test(`U+${codePoint.toString(16).toUpperCase()} is ${bytes.length} UTF-8 byte(s)`, () => {
      expect(utf8Bytes(codePoint)).toEqual(bytes);
    });
  }

  test('matches TextEncoder across the whole code point range', () => {
    const encoder = new TextEncoder();
    const sample: number[] = [];
    for (let codePoint = 0; codePoint < 0x400; codePoint++) sample.push(codePoint);
    for (let codePoint = 0x400; codePoint <= 0x10ffff; codePoint += 251) sample.push(codePoint);
    sample.push(0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000, 0xffff, 0x10000, 0x10ffff);

    for (const codePoint of sample) {
      const expected = Array.from(encoder.encode(String.fromCodePoint(codePoint)));
      expect(utf8Bytes(codePoint), `U+${codePoint.toString(16)}`).toEqual(expected);
    }
  });

  test('a lone surrogate encodes as U+FFFD, like TextEncoder', () => {
    expect(utf8Bytes(0xd800)).toEqual([0xef, 0xbf, 0xbd]);
    expect(Array.from(new TextEncoder().encode('\ud800'))).toEqual([0xef, 0xbf, 0xbd]);
  });

  test('UTF-16 units: one unit in the BMP, a surrogate pair above it', () => {
    expect(utf16Units(0x20ac)).toEqual([0x20ac]);
    expect(utf16Units(0x1f600)).toEqual([0xd83d, 0xde00]);
    expect(utf16Units(0x10000)).toEqual([0xd800, 0xdc00]);
    expect(utf16Units(0x10ffff)).toEqual([0xdbff, 0xdfff]);
  });

  test('UTF-16 units agree with String.fromCodePoint', () => {
    for (let codePoint = 0x10000; codePoint <= 0x10ffff; codePoint += 4093) {
      const text = String.fromCodePoint(codePoint);
      expect(utf16Units(codePoint)).toEqual([text.charCodeAt(0), text.charCodeAt(1)]);
    }
  });

  test('total UTF-8 bytes match TextEncoder for mixed text', () => {
    const samples = ['', 'plain ASCII', 'caf\u00E9 \u20AC \u{1F600}', FAMILY, ENGLAND_FLAG, 'bad \ud800 surrogate', EXAMPLE_TEXT];
    for (const text of samples) {
      expect(inspectText(text).stats.utf8Bytes).toBe(new TextEncoder().encode(text).length);
    }
  });
});

test.describe('escapes and entities', () => {
  test('JavaScript escapes use \\uXXXX in the BMP and \\u{X} above it', () => {
    expect(jsEscape(0x61)).toBe('\\u0061');
    expect(jsEscape(0x200b)).toBe('\\u200B');
    expect(jsEscape(0x1f600)).toBe('\\u{1F600}');
    expect(jsEscape(0xd800)).toBe('\\uD800');
  });

  test('well-known named entities, numeric references otherwise', () => {
    expect(htmlEntity(0xa0)).toBe('&nbsp;');
    expect(htmlEntity(0xad)).toBe('&shy;');
    expect(htmlEntity(0x200c)).toBe('&zwnj;');
    expect(htmlEntity(0x200d)).toBe('&zwj;');
    expect(htmlEntity(0x200e)).toBe('&lrm;');
    expect(htmlEntity(0x200f)).toBe('&rlm;');
    expect(htmlEntity(0x26)).toBe('&amp;');
    expect(htmlEntity(0x20ac)).toBe('&#x20AC;');
    expect(htmlEntity(0x1f600)).toBe('&#x1F600;');
    expect(htmlEntity(0x202e)).toBe('&#x202E;');
  });
});

test.describe('surrogate pairs and emoji sequences', () => {
  test('an astral character is one code point and two UTF-16 units', () => {
    const { stats, rows } = inspectText('\u{1F600}');
    expect(stats).toMatchObject({ utf16Length: 2, codePoints: 1, graphemes: 1, utf8Bytes: 4, flagged: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      position: 1,
      offset: 0,
      hex: 'U+1F600',
      utf8: 'F0 9F 98 80',
      utf16: 'D83D DE00',
      html: '&#x1F600;',
      js: '\\u{1F600}',
      glyph: '\u{1F600}',
      badge: false,
      className: null,
      label: 'Other symbol (So)',
    });
  });

  test('offsets count UTF-16 code units', () => {
    const { rows } = inspectText('a\u{1F600}b');
    expect(rows.map((row) => row.offset)).toEqual([0, 1, 3]);
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3]);
  });

  test('an unpaired surrogate is one malformed code point', () => {
    const { stats, rows } = inspectText('x\ud83dy');
    expect(stats.codePoints).toBe(3);
    expect(stats.utf16Length).toBe(3);
    expect(stats.flagged).toBe(1);
    expect(rows[1]).toMatchObject({ hex: 'U+D83D', className: 'malformed', utf8: 'EF BF BD', utf16: 'D83D', js: '\\uD83D' });
  });

  const sequences: Array<{
    name: string;
    text: string;
    codePoints: number;
    utf16: number;
    bytes: number;
    emojiParts: number;
  }> = [
    { name: 'family emoji (4 people, 3 ZWJ)', text: FAMILY, codePoints: 7, utf16: 11, bytes: 25, emojiParts: 3 },
    { name: 'US flag (regional indicators)', text: US_FLAG, codePoints: 2, utf16: 4, bytes: 8, emojiParts: 0 },
    { name: 'thumbs up with skin tone', text: THUMBS_UP_MEDIUM, codePoints: 2, utf16: 4, bytes: 8, emojiParts: 0 },
    { name: 'e with combining acute', text: E_ACUTE_DECOMPOSED, codePoints: 2, utf16: 2, bytes: 3, emojiParts: 0 },
    { name: 'England flag (tag sequence)', text: ENGLAND_FLAG, codePoints: 7, utf16: 14, bytes: 28, emojiParts: 6 },
    { name: 'red heart with VS16', text: RED_HEART, codePoints: 2, utf16: 2, bytes: 6, emojiParts: 1 },
    { name: 'keycap 1', text: KEYCAP_ONE, codePoints: 3, utf16: 3, bytes: 7, emojiParts: 1 },
    { name: 'rainbow flag (VS16 + ZWJ)', text: RAINBOW_FLAG, codePoints: 4, utf16: 6, bytes: 14, emojiParts: 2 },
    { name: 'CR LF', text: '\r\n', codePoints: 2, utf16: 2, bytes: 2, emojiParts: 0 },
  ];

  for (const sequence of sequences) {
    test(`${sequence.name}: one grapheme, counted correctly`, () => {
      const { stats } = inspectText(sequence.text);
      expect(stats.codePoints).toBe(sequence.codePoints);
      expect(stats.utf16Length).toBe(sequence.utf16);
      expect(stats.utf8Bytes).toBe(sequence.bytes);
      expect(stats.graphemes).toBe(1);
      expect(stats.graphemeMethod).toBe('intl-segmenter');
      expect(stats.emojiParts).toBe(sequence.emojiParts);
      expect(countGraphemesApproximate(sequence.text)).toBe(1);
    });
  }

  test('joiners, selectors and tags inside emoji sequences are not counted as suspicious', () => {
    for (const text of [FAMILY, ENGLAND_FLAG, RED_HEART, KEYCAP_ONE, RAINBOW_FLAG]) {
      const { stats, hiddenTagText } = inspectText(text);
      expect(stats.flagged, text).toBe(0);
      expect(hiddenTagText, text).toBe('');
    }
  });

  test('the same characters outside an emoji sequence are suspicious', () => {
    expect(inspectText('a\u200Db').stats.flagged).toBe(1);
    expect(inspectText('\u{1F468}\u200D').stats.flagged).toBe(1);
    expect(inspectText('\u200D\u{1F468}').stats.flagged).toBe(1);
    expect(inspectText('a\uFE0F').stats.flagged).toBe(1);
    expect(inspectText('1\uFE0F').stats.flagged).toBe(1);
    expect(inspectText(`x${tagEncode('hi')}\u{E007F}`).stats.flagged).toBe(3);
    // A flag tag sequence needs its cancel tag.
    expect(inspectText(`\u{1F3F4}${tagEncode('gb')}`).stats.flagged).toBe(2);
  });

  test('grapheme counts for several clusters in a row', () => {
    const text = `a${FAMILY}${US_FLAG}${US_FLAG}${E_ACUTE_DECOMPOSED}\r\n${THUMBS_UP_MEDIUM}`;
    expect(countGraphemes(text)).toEqual({ count: 7, method: 'intl-segmenter' });
    expect(countGraphemesApproximate(text)).toBe(7);
  });

  test('approximate graphemes pair regional indicators', () => {
    expect(countGraphemesApproximate('\u{1F1FA}\u{1F1F8}\u{1F1EC}\u{1F1E7}')).toBe(2);
    expect(countGraphemesApproximate('\u{1F1FA}\u{1F1F8}\u{1F1EC}')).toBe(2);
    expect(countGraphemesApproximate('a\r\nb')).toBe(3);
    expect(countGraphemesApproximate('')).toBe(0);
  });

  test('empty text has all-zero statistics', () => {
    expect(inspectText('')).toEqual({
      stats: {
        utf16Length: 0,
        codePoints: 0,
        graphemes: 0,
        graphemeMethod: 'intl-segmenter',
        utf8Bytes: 0,
        flagged: 0,
        emojiParts: 0,
        byClass: {},
      },
      rows: [],
      totalRows: 0,
      rowsTruncated: false,
      highlight: [],
      highlightTruncated: false,
      hiddenTagText: '',
    });
  });
});

test.describe('detecting the characters in the table', () => {
  const named: Array<[number, string, CharClass]> = [
    [0x200b, 'Zero-width space', 'zero-width'],
    [0x200c, 'Zero-width non-joiner', 'zero-width'],
    [0x200d, 'Zero-width joiner', 'zero-width'],
    [0x2060, 'Word joiner', 'zero-width'],
    [0xfeff, 'Byte order mark (zero-width no-break space)', 'zero-width'],
    [0x034f, 'Combining grapheme joiner', 'zero-width'],
    [0x2062, 'Invisible times', 'zero-width'],
    [0x00a0, 'No-break space', 'space'],
    [0x2002, 'En space', 'space'],
    [0x2003, 'Em space', 'space'],
    [0x2009, 'Thin space', 'space'],
    [0x202f, 'Narrow no-break space', 'space'],
    [0x3000, 'Ideographic space', 'space'],
    [0x00ad, 'Soft hyphen', 'soft-hyphen'],
    [0x061c, 'Arabic letter mark', 'bidi'],
    [0x200e, 'Left-to-right mark', 'bidi'],
    [0x200f, 'Right-to-left mark', 'bidi'],
    [0x202a, 'Left-to-right embedding', 'bidi'],
    [0x202b, 'Right-to-left embedding', 'bidi'],
    [0x202c, 'Pop directional formatting', 'bidi'],
    [0x202d, 'Left-to-right override', 'bidi'],
    [0x202e, 'Right-to-left override', 'bidi'],
    [0x2066, 'Left-to-right isolate', 'bidi'],
    [0x2067, 'Right-to-left isolate', 'bidi'],
    [0x2068, 'First strong isolate', 'bidi'],
    [0x2069, 'Pop directional isolate', 'bidi'],
    [0xfe00, 'Variation selector-1', 'variation-selector'],
    [0xfe0e, 'Variation selector-15', 'variation-selector'],
    [0xfe0f, 'Variation selector-16', 'variation-selector'],
    [0xe0100, 'Variation selector-17', 'variation-selector'],
    [0xe01ef, 'Variation selector-256', 'variation-selector'],
    [0xe0001, 'Language tag', 'tag'],
    [0xe0041, 'Tag "A"', 'tag'],
    [0xe007f, 'Cancel tag', 'tag'],
    [0x0000, 'Null', 'control'],
    [0x0007, 'Bell', 'control'],
    [0x001b, 'Escape', 'control'],
    [0x007f, 'Delete', 'control'],
    [0x0080, 'Padding character', 'control'],
    [0x009f, 'Application program command', 'control'],
    [0x000b, 'Line tabulation (vertical tab)', 'line-break'],
    [0x000c, 'Form feed', 'line-break'],
    [0x0085, 'Next line', 'line-break'],
    [0x2028, 'Line separator', 'line-break'],
    [0x2029, 'Paragraph separator', 'line-break'],
    [0x0009, 'Character tabulation', 'whitespace'],
    [0x000a, 'Line feed', 'whitespace'],
    [0x000d, 'Carriage return', 'whitespace'],
    [0x3164, 'Hangul filler', 'filler'],
    [0xffa0, 'Halfwidth Hangul filler', 'filler'],
    [0x115f, 'Hangul choseong filler', 'filler'],
    [0xfffd, 'Replacement character', 'malformed'],
    [0xfffc, 'Object replacement character', 'malformed'],
  ];

  for (const [codePoint, name, className] of named) {
    const hex = codePoint.toString(16).toUpperCase().padStart(4, '0');
    test(`U+${hex} is ${name}`, () => {
      expect(describeCodePoint(codePoint)).toMatchObject({ name, className });
      const { rows, stats } = inspectText(String.fromCodePoint(codePoint));
      expect(rows[0]).toMatchObject({ className, label: name, badge: true, flagged: CLASS_INFO[className].flagged });
      expect(stats.flagged).toBe(CLASS_INFO[className].flagged ? 1 : 0);
    });
  }

  test('ranges: private use, noncharacters and unlisted default-ignorables', () => {
    for (const codePoint of [0xe000, 0xf8ff, 0xf0000, 0xffffd, 0x100000, 0x10fffd]) {
      expect(describeCodePoint(codePoint), codePoint.toString(16)).toMatchObject({ className: 'private-use' });
    }
    for (const codePoint of [0xfdd0, 0xfdef, 0xfffe, 0xffff, 0x1fffe, 0x10ffff]) {
      expect(describeCodePoint(codePoint), codePoint.toString(16)).toMatchObject({ className: 'malformed' });
    }
    for (const codePoint of [0xd800, 0xdbff, 0xdc00, 0xdfff]) {
      expect(describeCodePoint(codePoint), codePoint.toString(16)).toMatchObject({ name: 'Unpaired surrogate' });
    }
    // Musical symbol begin beam and a tag-block code point with no assigned meaning.
    expect(describeCodePoint(0x1d173)).toMatchObject({ className: 'zero-width' });
    expect(describeCodePoint(0xe0080)).toMatchObject({ className: 'zero-width' });
  });

  test('ordinary characters are not flagged', () => {
    for (const char of ['a', 'Z', '0', ' ', '~', '\u00E9', '\u4E2D', '\u20AC', '\u{1F600}', '\u0301']) {
      const codePoint = char.codePointAt(0) ?? 0;
      expect(describeCodePoint(codePoint), char).toBeNull();
      expect(inspectText(char).stats.flagged, char).toBe(0);
    }
  });

  test('the table has no duplicates and covers every class', () => {
    const codePoints = CHAR_TABLE.map((item) => item.codePoint);
    expect(new Set(codePoints).size).toBe(codePoints.length);
    for (const item of CHAR_TABLE) {
      expect(item.short, item.name).not.toBe('');
      expect(item.name).not.toBe('');
    }
    // Private use is the one class that is described by a range only.
    for (const className of CHAR_CLASSES.filter((name) => name !== 'private-use')) {
      expect(
        CHAR_TABLE.some((item) => item.className === className),
        className
      ).toBe(true);
    }
  });

  test('every table entry is detected as its own class', () => {
    for (const item of CHAR_TABLE) {
      expect(describeCodePoint(item.codePoint)).toBe(item);
    }
  });

  test('table size: 65 control codes, 260 variation selectors, 97 tag characters', () => {
    const controlCodes = CHAR_TABLE.filter((item) => item.codePoint < 0xa0);
    expect(controlCodes).toHaveLength(65);
    expect(CHAR_TABLE.filter((item) => item.className === 'variation-selector')).toHaveLength(260);
    expect(CHAR_TABLE.filter((item) => item.className === 'tag')).toHaveLength(97);
  });

  test('statistics count invisible characters by class', () => {
    const { stats } = inspectText('a\u200B\u200Bb\u00A0c\u202E\t\n');
    expect(stats.flagged).toBe(4);
    expect(stats.byClass).toEqual({ 'zero-width': 2, space: 1, bidi: 1 });
  });

  test('Trojan Source: bidirectional controls in code are all found', () => {
    const code = 'if (level != "user\u202E \u2066// Begin admin only\u2069 \u2066") {';
    const { stats, highlight } = inspectText(code);
    expect(stats.byClass.bidi).toBe(4);
    const shorts = highlight.flatMap((segment) => (segment.kind === 'mark' ? [segment.short] : []));
    expect(shorts).toEqual(['RLO', 'LRI', 'PDI', 'LRI']);
  });

  test('tag characters that spell ASCII are decoded', () => {
    const text = `Looks harmless${tagEncode('ignore previous instructions')}`;
    const { stats, hiddenTagText } = inspectText(text);
    expect(hiddenTagText).toBe('ignore previous instructions');
    expect(stats.byClass.tag).toBe(28);
  });

  test('the rows describe a character completely', () => {
    const [nbsp, euro, upper, mark, space] = inspectText('\u00A0\u20AC' + 'A\u0301 ').rows;
    expect(nbsp).toMatchObject({ hex: 'U+00A0', glyph: 'NBSP', html: '&nbsp;', js: '\\u00A0', utf8: 'C2 A0', utf16: '00A0' });
    expect(euro).toMatchObject({
      hex: 'U+20AC',
      label: 'Currency symbol (Sc)',
      glyph: '\u20AC',
      utf8: 'E2 82 AC',
      utf16: '20AC',
      html: '&#x20AC;',
      js: '\\u20AC',
    });
    expect(upper).toMatchObject({ glyph: 'A', label: 'Uppercase letter (Lu)', flagged: false });
    expect(mark).toMatchObject({ glyph: '\u25CC\u0301', label: 'Nonspacing mark (Mn)' });
    expect(space).toMatchObject({ glyph: '\u2423', label: 'Space', className: null });
  });
});

test.describe('table and highlighted view limits', () => {
  test('the table is capped and says how many rows there are', () => {
    const text = 'a'.repeat(1200);
    const inspection = inspectText(text);
    expect(inspection.rows).toHaveLength(500);
    expect(inspection.totalRows).toBe(1200);
    expect(inspection.rowsTruncated).toBe(true);
    expect(inspection.stats.codePoints).toBe(1200);

    const small = inspectText(text, { maxRows: 10 });
    expect(small.rows).toHaveLength(10);
    expect(small.rowsTruncated).toBe(true);
    expect(inspectText('abc').rowsTruncated).toBe(false);
  });

  test('the special characters filter lists only flagged characters', () => {
    const inspection = inspectText('a\u200Bb\u00A0c\n', { onlyFlagged: true });
    expect(inspection.totalRows).toBe(2);
    expect(inspection.rows.map((row) => row.hex)).toEqual(['U+200B', 'U+00A0']);
    expect(inspection.rows.map((row) => row.position)).toEqual([2, 4]);
  });

  test('the highlighted view shows invisible characters as marks between text', () => {
    const { highlight } = inspectText('a\u200Bb');
    expect(highlight).toEqual([
      { kind: 'text', text: 'a' },
      {
        kind: 'mark',
        short: 'ZWSP',
        title: 'U+200B Zero-width space',
        className: 'zero-width',
        flagged: true,
        emojiPart: false,
        after: '',
      },
      { kind: 'text', text: 'b' },
    ]);
    expect(inspectText('plain text').highlight).toEqual([{ kind: 'text', text: 'plain text' }]);
  });

  test('marks inside an emoji sequence are tagged as such', () => {
    const { highlight } = inspectText(FAMILY);
    const marks = highlight.flatMap((segment) => (segment.kind === 'mark' ? [segment] : []));
    expect(marks).toHaveLength(3);
    expect(marks.every((mark) => mark.emojiPart && mark.short === 'ZWJ')).toBe(true);
  });

  test('tabs and line breaks are marked only on request and keep their layout', () => {
    const text = 'a\tb\nc';
    expect(inspectText(text).highlight).toEqual([{ kind: 'text', text }]);

    const marked = inspectText(text, { markWhitespace: true }).highlight;
    expect(marked.map((segment) => (segment.kind === 'mark' ? segment.short : segment.text))).toEqual([
      'a',
      'TAB',
      'b',
      'LF',
      'c',
    ]);
    const rebuilt = marked.map((segment) => (segment.kind === 'mark' ? segment.after : segment.text)).join('');
    expect(rebuilt).toBe(text);
  });

  test('unusual line breaks are always marked and followed by a real break', () => {
    const { highlight } = inspectText('a\u2028b');
    expect(highlight[1]).toMatchObject({ kind: 'mark', short: 'LS', after: '\n', flagged: true });
  });

  test('the highlighted view stops after the mark limit', () => {
    const inspection = inspectText('a\u200B'.repeat(5), { maxMarks: 2 });
    expect(inspection.highlightTruncated).toBe(true);
    expect(inspection.highlight.filter((segment) => segment.kind === 'mark')).toHaveLength(2);
    // Statistics still cover the whole text.
    expect(inspection.stats.flagged).toBe(5);
  });
});

test.describe('removing invisible characters', () => {
  test('removes zero-width characters, word joiner, BOM and soft hyphen', () => {
    expect(removeInvisibleCharacters('foo\u200Bbar\u200C\u200D\u2060\uFEFF\u00AD')).toEqual({ text: 'foobar', count: 6 });
  });

  test('removes bidirectional controls', () => {
    const result = removeInvisibleCharacters('x\u202Ey\u2066z\u2069\u200E\u200F\u061C');
    expect(result).toEqual({ text: 'xyz', count: 6 });
  });

  test('removes control codes but keeps tab, line feed and carriage return', () => {
    expect(removeInvisibleCharacters('a\tb\r\nc')).toEqual({ text: 'a\tb\r\nc', count: 0 });
    expect(removeInvisibleCharacters('a\u0000b\u001Bc\u007Fd\u0090e')).toEqual({ text: 'abcde', count: 4 });
  });

  test('keeps non-standard spaces, odd line breaks and private use (other actions or the user decide)', () => {
    const text = 'a\u00A0b\u2028c\u000Bd\u0085e\uE000';
    expect(removeInvisibleCharacters(text)).toEqual({ text, count: 0 });
  });

  test('removes variation selectors and tag characters outside emoji', () => {
    expect(removeInvisibleCharacters('a\uFE0Fb\u{E0100}c')).toEqual({ text: 'abc', count: 2 });
    expect(removeInvisibleCharacters(`a${tagEncode('hi')}b`)).toEqual({ text: 'ab', count: 2 });
    expect(removeInvisibleCharacters('\u{1F3F4}' + tagEncode('gb'))).toEqual({ text: '\u{1F3F4}', count: 2 });
  });

  test('keeps joiners, selectors and tags that belong to emoji sequences', () => {
    for (const text of [FAMILY, RED_HEART, RAINBOW_FLAG, ENGLAND_FLAG, KEYCAP_ONE, `${THUMBS_UP_MEDIUM}\u200D\u{1F9B0}`]) {
      expect(removeInvisibleCharacters(text), text).toEqual({ text, count: 0 });
    }
  });

  test('removes joiners that dangle at the edge of an emoji or sit between other characters', () => {
    expect(removeInvisibleCharacters('\u{1F468}\u200D')).toEqual({ text: '\u{1F468}', count: 1 });
    expect(removeInvisibleCharacters('a\u200D\u{1F468}')).toEqual({ text: 'a\u{1F468}', count: 1 });
    // A zero-width space inside the sequence breaks it, so the ZWJ after it goes too.
    expect(removeInvisibleCharacters('\u{1F468}\u200B\u200D\u{1F469}')).toEqual({
      text: '\u{1F468}\u{1F469}',
      count: 2,
    });
  });

  test('cleans around an emoji sequence without damaging it', () => {
    const result = removeInvisibleCharacters(`pre\u200B${FAMILY}\u200Bpost`);
    expect(result).toEqual({ text: `pre${FAMILY}post`, count: 2 });
  });

  test('script joiners are removed by default and kept on request', () => {
    const persian = '\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645';
    expect(removeInvisibleCharacters(persian)).toEqual({ text: persian.replace('\u200C', ''), count: 1 });
    expect(removeInvisibleCharacters(persian, { keepScriptJoiners: true })).toEqual({ text: persian, count: 0 });

    const devanagari = '\u0915\u094D\u200D\u0937';
    expect(removeInvisibleCharacters(devanagari, { keepScriptJoiners: true })).toEqual({ text: devanagari, count: 0 });

    // Between Latin letters, or at the edge of a word, they are still removed.
    expect(removeInvisibleCharacters('foo\u200Cbar', { keepScriptJoiners: true }).count).toBe(1);
    expect(removeInvisibleCharacters('\u200C\u0645', { keepScriptJoiners: true }).count).toBe(1);
    expect(removeInvisibleCharacters('\u0645\u200C', { keepScriptJoiners: true }).count).toBe(1);
  });

  test('text without invisible characters is returned unchanged', () => {
    expect(removeInvisibleCharacters('Hello, world! \u00E9\u4E2D')).toEqual({ text: 'Hello, world! \u00E9\u4E2D', count: 0 });
    expect(removeInvisibleCharacters('')).toEqual({ text: '', count: 0 });
  });
});

test.describe('replacing non-standard spaces', () => {
  test('replaces each space variant with U+0020, one for one', () => {
    const text = 'a\u00A0b\u2003c\u202Fd\u3000e\u2009f\u2800g\u1680h\u205Fi\u200Aj';
    expect(replaceNonStandardSpaces(text)).toEqual({ text: 'a b c d e f g h i j', count: 9 });
  });

  test('leaves ordinary whitespace, zero-width characters and other text alone', () => {
    const text = 'a b\tc\nd\u200Be';
    expect(replaceNonStandardSpaces(text)).toEqual({ text, count: 0 });
    expect(replaceNonStandardSpaces('')).toEqual({ text: '', count: 0 });
  });
});

test.describe('normalisation', () => {
  test('UAX #15 example: U+1E9B U+0323 in all four forms', () => {
    const text = '\u1E9B\u0323';
    expect(normalizeText(text, 'NFC')).toBe('\u1E9B\u0323');
    expect(normalizeText(text, 'NFD')).toBe('\u017F\u0323\u0307');
    expect(normalizeText(text, 'NFKC')).toBe('\u1E69');
    expect(normalizeText(text, 'NFKD')).toBe('s\u0323\u0307');
  });

  test('composes and decomposes accents', () => {
    expect(normalizeText('e\u0301', 'NFC')).toBe('\u00E9');
    expect(normalizeText('\u00E9', 'NFD')).toBe('e\u0301');
  });

  test('singletons: angstrom sign and ohm sign', () => {
    expect(normalizeText('\u212B', 'NFC')).toBe('\u00C5');
    expect(normalizeText('\u212B', 'NFD')).toBe('A\u030A');
    expect(normalizeText('\u2126', 'NFC')).toBe('\u03A9');
  });

  test('compatibility forms fold ligatures and no-break spaces; canonical forms do not', () => {
    expect(normalizeText('\uFB01', 'NFC')).toBe('\uFB01');
    expect(normalizeText('\uFB01', 'NFKC')).toBe('fi');
    expect(normalizeText('a\u00A0b', 'NFC')).toBe('a\u00A0b');
    expect(normalizeText('a\u00A0b', 'NFKC')).toBe('a b');
  });

  test('Hangul syllables decompose to jamo and compose back', () => {
    expect(normalizeText('\uD55C', 'NFD')).toBe('\u1112\u1161\u11AB');
    expect(normalizeText('\u1112\u1161\u11AB', 'NFC')).toBe('\uD55C');
  });
});

test.describe('cleanText', () => {
  test('does nothing unless asked', () => {
    const text = 'a\u200B\u00A0b';
    expect(cleanText(text)).toEqual({
      text,
      removed: 0,
      replaced: 0,
      normalizationChanged: false,
      changed: false,
    });
  });

  test('runs the selected steps and reports what each did', () => {
    const result = cleanText('a\u200Bb\u00A0c\u00A0d e\u0301', {
      removeInvisible: true,
      replaceSpaces: true,
      normalization: 'NFC',
    });
    expect(result).toEqual({
      text: 'ab c d \u00E9',
      removed: 1,
      replaced: 2,
      normalizationChanged: true,
      changed: true,
    });
  });

  test('removes before it normalises, so a hidden character cannot block composition', () => {
    const text = 'e\u200B\u0301';
    expect(cleanText(text, { normalization: 'NFC' }).text).toBe(text);
    expect(cleanText(text, { removeInvisible: true, normalization: 'NFC' }).text).toBe('\u00E9');
  });

  test('is idempotent', () => {
    const options = { removeInvisible: true, replaceSpaces: true, normalization: 'NFKC' } as const;
    const once = cleanText(EXAMPLE_TEXT, options);
    const twice = cleanText(once.text, options);
    expect(twice.text).toBe(once.text);
    expect(twice.changed).toBe(false);
  });

  test('passes keepScriptJoiners through', () => {
    const persian = '\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645';
    expect(cleanText(persian, { removeInvisible: true, keepScriptJoiners: true }).text).toBe(persian);
    expect(cleanText(persian, { removeInvisible: true }).text).toBe(persian.replace('\u200C', ''));
  });
});

test.describe('example text', () => {
  test('contains the traps it advertises', () => {
    const { stats, hiddenTagText } = inspectText(EXAMPLE_TEXT);
    expect(stats.byClass['zero-width']).toBe(3); // ZWSP, word joiner, BOM
    expect(stats.byClass.space).toBe(1);
    expect(stats.byClass['soft-hyphen']).toBe(1);
    expect(stats.byClass.bidi).toBe(1);
    expect(stats.byClass.tag).toBe(2);
    expect(hiddenTagText).toBe('hi');
    // The family emoji and the heart are legitimate and not counted as suspicious.
    expect(stats.emojiParts).toBe(3);
  });

  test('cleans to something with no suspicious characters left, emoji intact', () => {
    const cleaned = cleanText(EXAMPLE_TEXT, { removeInvisible: true, replaceSpaces: true });
    const { stats, hiddenTagText } = inspectText(cleaned.text);
    expect(stats.flagged).toBe(0);
    expect(hiddenTagText).toBe('');
    expect(cleaned.text).toContain('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}');
    expect(cleaned.text).toContain('\u2764\uFE0F');
    expect(cleaned.removed).toBe(3 + 1 + 1 + 2); // zero-width, soft hyphen, bidi, tags
    expect(cleaned.replaced).toBe(1);
  });
});
