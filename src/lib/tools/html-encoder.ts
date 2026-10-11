/**
 * HTML entity encoding and decoding.
 *
 * Encoding escapes the five characters that are unsafe in HTML text and
 * attribute values. Decoding follows what a browser does with character
 * references in text: decimal and hexadecimal references with or without the
 * closing semicolon, the Windows-1252 fix-ups for `&#128;` to `&#159;`,
 * U+FFFD for references to no real character, named references, and the old
 * Latin-1 names that work without a semicolon (`&copy2024` is `©2024`).
 *
 * The built-in name table is the HTML 4 set plus `&apos;`. In a browser the
 * remaining HTML5 names (`&check;`, `&hairsp;` and so on) are looked up
 * through the DOM; without a DOM they are left as they are. Nothing else
 * here needs a browser, so the module runs in Node.
 */

const ENCODE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes `&`, `<`, `>`, `"` and `'` so the text is safe inside HTML. */
export function encodeHtmlEntities(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ENCODE_MAP[character]);
}

// Names for U+00A0 to U+00FF, in code point order.
const LATIN1_NAMES =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn ' +
  'sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave ' +
  'Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ' +
  'ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN ' +
  'szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute ' +
  'icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml ' +
  'yacute thorn yuml';

// The rest of the HTML 4 set as name:hex code point. These need the semicolon.
const OTHER_NAMES =
  'apos:27 OElig:152 oelig:153 Scaron:160 scaron:161 Yuml:178 fnof:192 circ:2c6 tilde:2dc Alpha:391 ' +
  'Beta:392 Gamma:393 Delta:394 Epsilon:395 Zeta:396 Eta:397 Theta:398 Iota:399 Kappa:39a ' +
  'Lambda:39b Mu:39c Nu:39d Xi:39e Omicron:39f Pi:3a0 Rho:3a1 Sigma:3a3 Tau:3a4 Upsilon:3a5 Phi:3a6 ' +
  'Chi:3a7 Psi:3a8 Omega:3a9 alpha:3b1 beta:3b2 gamma:3b3 delta:3b4 epsilon:3b5 zeta:3b6 eta:3b7 ' +
  'theta:3b8 iota:3b9 kappa:3ba lambda:3bb mu:3bc nu:3bd xi:3be omicron:3bf pi:3c0 rho:3c1 ' +
  'sigmaf:3c2 sigma:3c3 tau:3c4 upsilon:3c5 phi:3c6 chi:3c7 psi:3c8 omega:3c9 thetasym:3d1 ' +
  'upsih:3d2 piv:3d6 ensp:2002 emsp:2003 thinsp:2009 zwnj:200c zwj:200d lrm:200e rlm:200f ' +
  'ndash:2013 mdash:2014 lsquo:2018 rsquo:2019 sbquo:201a ldquo:201c rdquo:201d bdquo:201e ' +
  'dagger:2020 Dagger:2021 bull:2022 hellip:2026 permil:2030 prime:2032 Prime:2033 lsaquo:2039 ' +
  'rsaquo:203a oline:203e frasl:2044 euro:20ac image:2111 weierp:2118 real:211c trade:2122 ' +
  'alefsym:2135 larr:2190 uarr:2191 rarr:2192 darr:2193 harr:2194 crarr:21b5 lArr:21d0 uArr:21d1 ' +
  'rArr:21d2 dArr:21d3 hArr:21d4 forall:2200 part:2202 exist:2203 empty:2205 nabla:2207 isin:2208 ' +
  'notin:2209 ni:220b prod:220f sum:2211 minus:2212 lowast:2217 radic:221a prop:221d infin:221e ' +
  'ang:2220 and:2227 or:2228 cap:2229 cup:222a int:222b there4:2234 sim:223c cong:2245 asymp:2248 ' +
  'ne:2260 equiv:2261 le:2264 ge:2265 sub:2282 sup:2283 nsub:2284 sube:2286 supe:2287 oplus:2295 ' +
  'otimes:2297 perp:22a5 sdot:22c5 lceil:2308 rceil:2309 lfloor:230a rfloor:230b lang:27e8 ' +
  'rang:27e9 loz:25ca spades:2660 clubs:2663 hearts:2665 diams:2666';

// Names a browser also accepts without the closing semicolon.
const LEGACY = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['AMP', '&'],
  ['LT', '<'],
  ['GT', '>'],
  ['QUOT', '"'],
  ['COPY', '©'],
  ['REG', '®'],
]);
LATIN1_NAMES.split(' ').forEach((name, index) => LEGACY.set(name, String.fromCodePoint(0xa0 + index)));

const NAMED = new Map<string, string>(LEGACY);
for (const entry of OTHER_NAMES.split(' ')) {
  const [name, hex] = entry.split(':');
  NAMED.set(name, String.fromCodePoint(parseInt(hex, 16)));
}

// What browsers show for numeric references into the C1 control range.
const WINDOWS_1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc,
  0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

function fromCodePoint(codePoint: number): string {
  // Not a number a character can have: null, past the end of Unicode, or half a surrogate pair.
  if (!(codePoint > 0 && codePoint <= 0x10ffff) || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return '�';
  }
  return String.fromCodePoint(WINDOWS_1252[codePoint] ?? codePoint);
}

type DomLookup = (reference: string) => string | undefined;

// Lets the browser's own parser decode one reference. A textarea is used
// because its content is plain text: nothing in it is ever run or loaded.
function createDomLookup(): DomLookup {
  if (typeof document === 'undefined') return () => undefined;

  let scratch: HTMLTextAreaElement | undefined;
  return (reference) => {
    if (!scratch) scratch = document.createElement('textarea');
    scratch.innerHTML = reference;
    return scratch.value;
  };
}

function decodeNamed(reference: string, name: string, lookInDom: DomLookup): string {
  if (reference.endsWith(';')) {
    const exact = NAMED.get(name);
    if (exact !== undefined) return exact;

    const viaDom = lookInDom(reference);
    if (viaDom !== undefined) return viaDom;
  }

  // No semicolon, or a name the table does not know: the longest legacy name
  // the reference starts with still counts, as in "&copy2024" or "&notit;".
  for (let length = name.length; length >= 2; length--) {
    const value = LEGACY.get(name.slice(0, length));
    if (value !== undefined) return value + reference.slice(length + 1);
  }

  return reference;
}

const REFERENCE = /&(?:#(?:[xX]([0-9a-fA-F]+)|([0-9]+))|([a-zA-Z][a-zA-Z0-9]*));?/g;

/** Turns character references (`&lt;`, `&#39;`, `&#x1F600;`, `&eacute;`) back into characters. */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text;

  const lookInDom = createDomLookup();
  return text.replace(REFERENCE, (reference: string, hex?: string, decimal?: string, name?: string) => {
    if (hex !== undefined) return fromCodePoint(parseInt(hex, 16));
    if (decimal !== undefined) return fromCodePoint(parseInt(decimal, 10));
    return decodeNamed(reference, name ?? '', lookInDom);
  });
}
