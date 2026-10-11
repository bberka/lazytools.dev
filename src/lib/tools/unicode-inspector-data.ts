// Reference data for the Unicode & Zero-Width Inspector: the table of known
// invisible, control and non-standard characters, the character classes they
// belong to, and the HTML entity and general-category names. Data only; the
// logic that uses it lives in `unicode-inspector.ts`.

export type CharClass =
  | 'zero-width'
  | 'filler'
  | 'space'
  | 'soft-hyphen'
  | 'bidi'
  | 'variation-selector'
  | 'tag'
  | 'control'
  | 'line-break'
  | 'whitespace'
  | 'private-use'
  | 'malformed';

export interface CharClassInfo {
  label: string;
  description: string;
  /** Counted as "invisible or suspicious" and listed by the special-characters filter. */
  flagged: boolean;
  /** Dropped by "remove invisible characters" (emoji sequence parts are still kept). */
  removable: boolean;
}

export const CLASS_INFO: Record<CharClass, CharClassInfo> = {
  'zero-width': {
    label: 'Zero-width',
    description: 'Joiners, word joiners, the byte order mark and invisible operators. They take no space.',
    flagged: true,
    removable: true,
  },
  filler: {
    label: 'Filler',
    description: 'Blank-looking filler letters, for example the Hangul fillers.',
    flagged: true,
    removable: true,
  },
  space: {
    label: 'Non-standard space',
    description: 'Spaces other than U+0020: no-break, en, em, thin, ideographic and similar.',
    flagged: true,
    removable: false,
  },
  'soft-hyphen': {
    label: 'Soft hyphen',
    description: 'Invisible unless the line breaks at that point.',
    flagged: true,
    removable: true,
  },
  bidi: {
    label: 'Bidirectional control',
    description: 'Marks, embeddings, overrides and isolates that change the display order of text.',
    flagged: true,
    removable: true,
  },
  'variation-selector': {
    label: 'Variation selector',
    description: 'Picks a glyph variant of the previous character. VS15 and VS16 are normal in emoji.',
    flagged: true,
    removable: true,
  },
  tag: {
    label: 'Tag character',
    description: 'Invisible copies of ASCII. Used for flag emoji, but also able to hide a message.',
    flagged: true,
    removable: true,
  },
  control: {
    label: 'Control character',
    description: 'C0 and C1 control codes such as NUL, ESC, BEL and DEL.',
    flagged: true,
    removable: true,
  },
  'line-break': {
    label: 'Unusual line break',
    description: 'Vertical tab, form feed, next line, line separator and paragraph separator.',
    flagged: true,
    removable: false,
  },
  whitespace: {
    label: 'Tab or line break',
    description: 'Tab, line feed and carriage return. Ordinary whitespace, never flagged.',
    flagged: false,
    removable: false,
  },
  'private-use': {
    label: 'Private use',
    description: 'Code points with no standard meaning; what they show depends on the font.',
    flagged: true,
    removable: false,
  },
  malformed: {
    label: 'Replacement or malformed',
    description: 'Replacement characters, object placeholders, noncharacters and unpaired surrogates.',
    flagged: true,
    removable: false,
  },
};

export const CHAR_CLASSES = Object.keys(CLASS_INFO) as CharClass[];

export interface CharEntry {
  codePoint: number;
  /** Short badge text, for example "ZWSP". */
  short: string;
  /** Readable name shown in the table. */
  name: string;
  className: CharClass;
}

const entry = (codePoint: number, short: string, name: string, className: CharClass): CharEntry => ({
  codePoint,
  short,
  name,
  className,
});

// C0 control codes U+0000 to U+001F, in order.
const C0_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['NUL', 'Null'],
  ['SOH', 'Start of heading'],
  ['STX', 'Start of text'],
  ['ETX', 'End of text'],
  ['EOT', 'End of transmission'],
  ['ENQ', 'Enquiry'],
  ['ACK', 'Acknowledge'],
  ['BEL', 'Bell'],
  ['BS', 'Backspace'],
  ['TAB', 'Character tabulation'],
  ['LF', 'Line feed'],
  ['VT', 'Line tabulation (vertical tab)'],
  ['FF', 'Form feed'],
  ['CR', 'Carriage return'],
  ['SO', 'Shift out'],
  ['SI', 'Shift in'],
  ['DLE', 'Data link escape'],
  ['DC1', 'Device control one'],
  ['DC2', 'Device control two'],
  ['DC3', 'Device control three'],
  ['DC4', 'Device control four'],
  ['NAK', 'Negative acknowledge'],
  ['SYN', 'Synchronous idle'],
  ['ETB', 'End of transmission block'],
  ['CAN', 'Cancel'],
  ['EM', 'End of medium'],
  ['SUB', 'Substitute'],
  ['ESC', 'Escape'],
  ['FS', 'Information separator four (file separator)'],
  ['GS', 'Information separator three (group separator)'],
  ['RS', 'Information separator two (record separator)'],
  ['US', 'Information separator one (unit separator)'],
];

// C1 control codes U+0080 to U+009F, in order.
const C1_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['PAD', 'Padding character'],
  ['HOP', 'High octet preset'],
  ['BPH', 'Break permitted here'],
  ['NBH', 'No break here'],
  ['IND', 'Index'],
  ['NEL', 'Next line'],
  ['SSA', 'Start of selected area'],
  ['ESA', 'End of selected area'],
  ['HTS', 'Character tabulation set'],
  ['HTJ', 'Character tabulation with justification'],
  ['VTS', 'Line tabulation set'],
  ['PLD', 'Partial line forward'],
  ['PLU', 'Partial line backward'],
  ['RI', 'Reverse line feed'],
  ['SS2', 'Single shift two'],
  ['SS3', 'Single shift three'],
  ['DCS', 'Device control string'],
  ['PU1', 'Private use one'],
  ['PU2', 'Private use two'],
  ['STS', 'Set transmit state'],
  ['CCH', 'Cancel character'],
  ['MW', 'Message waiting'],
  ['SPA', 'Start of guarded area'],
  ['EPA', 'End of guarded area'],
  ['SOS', 'Start of string'],
  ['SGC', 'Single graphic character introducer'],
  ['SCI', 'Single character introducer'],
  ['CSI', 'Control sequence introducer'],
  ['ST', 'String terminator'],
  ['OSC', 'Operating system command'],
  ['PM', 'Privacy message'],
  ['APC', 'Application program command'],
];

function controlClass(codePoint: number): CharClass {
  if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) return 'whitespace';
  if (codePoint === 0x0b || codePoint === 0x0c || codePoint === 0x85) return 'line-break';
  return 'control';
}

function buildControlEntries(): CharEntry[] {
  const entries: CharEntry[] = [];
  C0_NAMES.forEach(([short, name], index) => {
    entries.push(entry(index, short, name, controlClass(index)));
  });
  entries.push(entry(0x7f, 'DEL', 'Delete', 'control'));
  C1_NAMES.forEach(([short, name], index) => {
    const codePoint = 0x80 + index;
    entries.push(entry(codePoint, short, name, controlClass(codePoint)));
  });
  return entries;
}

function buildVariationSelectorEntries(): CharEntry[] {
  const entries: CharEntry[] = [];
  // VS1 to VS16 are U+FE00 to U+FE0F, VS17 to VS256 are U+E0100 to U+E01EF.
  for (let n = 1; n <= 16; n++) {
    entries.push(entry(0xfe00 + n - 1, `VS${n}`, `Variation selector-${n}`, 'variation-selector'));
  }
  for (let n = 17; n <= 256; n++) {
    entries.push(entry(0xe0100 + n - 17, `VS${n}`, `Variation selector-${n}`, 'variation-selector'));
  }
  // Mongolian free variation selectors.
  [0x180b, 0x180c, 0x180d, 0x180f].forEach((codePoint, index) => {
    entries.push(
      entry(codePoint, `FVS${index + 1}`, `Mongolian free variation selector ${index + 1}`, 'variation-selector')
    );
  });
  return entries;
}

function buildTagEntries(): CharEntry[] {
  const entries: CharEntry[] = [entry(0xe0001, 'LANG', 'Language tag', 'tag')];
  // U+E0020 to U+E007E mirror ASCII 0x20 to 0x7E; U+E007F cancels the tag.
  for (let ascii = 0x20; ascii <= 0x7e; ascii++) {
    const glyph = String.fromCharCode(ascii);
    entries.push(
      entry(
        0xe0000 + ascii,
        ascii === 0x20 ? 'TAG SP' : `TAG ${glyph}`,
        ascii === 0x20 ? 'Tag space' : `Tag "${glyph}"`,
        'tag'
      )
    );
  }
  entries.push(entry(0xe007f, 'CANCEL', 'Cancel tag', 'tag'));
  return entries;
}

/** Every individually listed character. Ranges (private use, noncharacters, surrogates) are handled in code. */
export const CHAR_TABLE: readonly CharEntry[] = [
  // Zero-width and other invisible format characters.
  entry(0x200b, 'ZWSP', 'Zero-width space', 'zero-width'),
  entry(0x200c, 'ZWNJ', 'Zero-width non-joiner', 'zero-width'),
  entry(0x200d, 'ZWJ', 'Zero-width joiner', 'zero-width'),
  entry(0x2060, 'WJ', 'Word joiner', 'zero-width'),
  entry(0xfeff, 'BOM', 'Byte order mark (zero-width no-break space)', 'zero-width'),
  entry(0x034f, 'CGJ', 'Combining grapheme joiner', 'zero-width'),
  entry(0x180e, 'MVS', 'Mongolian vowel separator', 'zero-width'),
  entry(0x2061, 'FA', 'Function application', 'zero-width'),
  entry(0x2062, 'IT', 'Invisible times', 'zero-width'),
  entry(0x2063, 'IS', 'Invisible separator', 'zero-width'),
  entry(0x2064, 'IP', 'Invisible plus', 'zero-width'),
  entry(0x206a, 'ISS', 'Inhibit symmetric swapping (deprecated)', 'zero-width'),
  entry(0x206b, 'ASS', 'Activate symmetric swapping (deprecated)', 'zero-width'),
  entry(0x206c, 'IAFS', 'Inhibit Arabic form shaping (deprecated)', 'zero-width'),
  entry(0x206d, 'AAFS', 'Activate Arabic form shaping (deprecated)', 'zero-width'),
  entry(0x206e, 'NADS', 'National digit shapes (deprecated)', 'zero-width'),
  entry(0x206f, 'NODS', 'Nominal digit shapes (deprecated)', 'zero-width'),
  entry(0xfff9, 'IAA', 'Interlinear annotation anchor', 'zero-width'),
  entry(0xfffa, 'IAS', 'Interlinear annotation separator', 'zero-width'),
  entry(0xfffb, 'IAT', 'Interlinear annotation terminator', 'zero-width'),

  // Blank-looking fillers.
  entry(0x115f, 'HCF', 'Hangul choseong filler', 'filler'),
  entry(0x1160, 'HJF', 'Hangul jungseong filler', 'filler'),
  entry(0x3164, 'HF', 'Hangul filler', 'filler'),
  entry(0xffa0, 'HHF', 'Halfwidth Hangul filler', 'filler'),
  entry(0x17b4, 'KIA', 'Khmer vowel inherent AQ', 'filler'),
  entry(0x17b5, 'KIAA', 'Khmer vowel inherent AA', 'filler'),

  // Soft hyphen.
  entry(0x00ad, 'SHY', 'Soft hyphen', 'soft-hyphen'),

  // Non-standard spaces.
  entry(0x00a0, 'NBSP', 'No-break space', 'space'),
  entry(0x1680, 'OGSP', 'Ogham space mark', 'space'),
  entry(0x2000, 'NQSP', 'En quad', 'space'),
  entry(0x2001, 'MQSP', 'Em quad', 'space'),
  entry(0x2002, 'ENSP', 'En space', 'space'),
  entry(0x2003, 'EMSP', 'Em space', 'space'),
  entry(0x2004, '3/MSP', 'Three-per-em space', 'space'),
  entry(0x2005, '4/MSP', 'Four-per-em space', 'space'),
  entry(0x2006, '6/MSP', 'Six-per-em space', 'space'),
  entry(0x2007, 'FSP', 'Figure space', 'space'),
  entry(0x2008, 'PSP', 'Punctuation space', 'space'),
  entry(0x2009, 'THSP', 'Thin space', 'space'),
  entry(0x200a, 'HSP', 'Hair space', 'space'),
  entry(0x202f, 'NNBSP', 'Narrow no-break space', 'space'),
  entry(0x205f, 'MMSP', 'Medium mathematical space', 'space'),
  entry(0x3000, 'IDSP', 'Ideographic space', 'space'),
  entry(0x2800, 'BRAILLE', 'Braille pattern blank', 'space'),

  // Bidirectional controls.
  entry(0x061c, 'ALM', 'Arabic letter mark', 'bidi'),
  entry(0x200e, 'LRM', 'Left-to-right mark', 'bidi'),
  entry(0x200f, 'RLM', 'Right-to-left mark', 'bidi'),
  entry(0x202a, 'LRE', 'Left-to-right embedding', 'bidi'),
  entry(0x202b, 'RLE', 'Right-to-left embedding', 'bidi'),
  entry(0x202c, 'PDF', 'Pop directional formatting', 'bidi'),
  entry(0x202d, 'LRO', 'Left-to-right override', 'bidi'),
  entry(0x202e, 'RLO', 'Right-to-left override', 'bidi'),
  entry(0x2066, 'LRI', 'Left-to-right isolate', 'bidi'),
  entry(0x2067, 'RLI', 'Right-to-left isolate', 'bidi'),
  entry(0x2068, 'FSI', 'First strong isolate', 'bidi'),
  entry(0x2069, 'PDI', 'Pop directional isolate', 'bidi'),

  // Unusual line breaks outside the C0 and C1 blocks.
  entry(0x2028, 'LS', 'Line separator', 'line-break'),
  entry(0x2029, 'PS', 'Paragraph separator', 'line-break'),

  // Replacement and placeholder characters.
  entry(0xfffc, 'OBJ', 'Object replacement character', 'malformed'),
  entry(0xfffd, 'REPL', 'Replacement character', 'malformed'),

  // Control codes (C0, DEL, C1), variation selectors and tag characters.
  ...buildControlEntries(),
  ...buildVariationSelectorEntries(),
  ...buildTagEntries(),
];

/** Names of the HTML entities that are well known and safe to show. Everything else gets a numeric reference. */
export const HTML_NAMED_ENTITIES: Readonly<Record<number, string>> = {
  0x22: '&quot;',
  0x26: '&amp;',
  0x3c: '&lt;',
  0x3e: '&gt;',
  0xa0: '&nbsp;',
  0xad: '&shy;',
  0x2002: '&ensp;',
  0x2003: '&emsp;',
  0x2009: '&thinsp;',
  0x200a: '&hairsp;',
  0x200b: '&ZeroWidthSpace;',
  0x200c: '&zwnj;',
  0x200d: '&zwj;',
  0x200e: '&lrm;',
  0x200f: '&rlm;',
  0x2060: '&NoBreak;',
};

/** Unicode general categories, in the order they are tried. */
export const GENERAL_CATEGORIES: ReadonlyArray<{ code: string; label: string; test: RegExp }> = (
  [
    ['Lu', 'Uppercase letter'],
    ['Ll', 'Lowercase letter'],
    ['Lt', 'Titlecase letter'],
    ['Lm', 'Modifier letter'],
    ['Lo', 'Other letter'],
    ['Mn', 'Nonspacing mark'],
    ['Mc', 'Spacing mark'],
    ['Me', 'Enclosing mark'],
    ['Nd', 'Decimal digit'],
    ['Nl', 'Letter number'],
    ['No', 'Other number'],
    ['Pc', 'Connector punctuation'],
    ['Pd', 'Dash punctuation'],
    ['Ps', 'Opening punctuation'],
    ['Pe', 'Closing punctuation'],
    ['Pi', 'Initial quote'],
    ['Pf', 'Final quote'],
    ['Po', 'Other punctuation'],
    ['Sm', 'Math symbol'],
    ['Sc', 'Currency symbol'],
    ['Sk', 'Modifier symbol'],
    ['So', 'Other symbol'],
    ['Zs', 'Space separator'],
    ['Zl', 'Line separator'],
    ['Zp', 'Paragraph separator'],
    ['Cc', 'Control'],
    ['Cf', 'Format character'],
    ['Cs', 'Surrogate'],
    ['Co', 'Private use'],
    ['Cn', 'Unassigned'],
  ] as const
).map(([code, label]) => ({ code, label, test: new RegExp(`^\\p{${code}}$`, 'u') }));
