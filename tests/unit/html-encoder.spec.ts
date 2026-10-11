import { test, expect } from '@playwright/test';
import { decodeHtmlEntities, encodeHtmlEntities } from '@/lib/tools/html-encoder';

// These tests run without a DOM, so they cover the built-in table (HTML 4
// names plus &apos;) and the reference syntax. In a browser, names outside the
// table are additionally looked up through the DOM.

test.describe('encodeHtmlEntities', () => {
  test('escapes the five characters that are unsafe in HTML', () => {
    expect(encodeHtmlEntities('<div class="a">Tom & Jerry\'s</div>')).toBe(
      '&lt;div class=&quot;a&quot;&gt;Tom &amp; Jerry&#39;s&lt;/div&gt;'
    );
  });

  test('leaves everything else alone', () => {
    expect(encodeHtmlEntities('')).toBe('');
    expect(encodeHtmlEntities(' \n\t')).toBe(' \n\t');
    expect(encodeHtmlEntities('café 日本語 😀 © 100%')).toBe('café 日本語 😀 © 100%');
  });

  test('escapes an ampersand that is already part of an entity', () => {
    expect(encodeHtmlEntities('&lt;')).toBe('&amp;lt;');
  });
});

test.describe('decodeHtmlEntities', () => {
  test('reverses encodeHtmlEntities', () => {
    for (const text of ['<a href="x?a=1&b=2">it\'s</a>', '&amp;', '&&&', '5 < 6 > 4', '']) {
      expect(decodeHtmlEntities(encodeHtmlEntities(text))).toBe(text);
    }
  });

  test('decodes each reference once, left to right', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeHtmlEntities('&amp;amp;amp;')).toBe('&amp;amp;');
  });

  test('decodes decimal and hexadecimal references', () => {
    expect(decodeHtmlEntities('&#60;&#x3C;&#X3c;')).toBe('<<<');
    expect(decodeHtmlEntities('&#39;&#x27;&apos;')).toBe("'''");
    expect(decodeHtmlEntities('&#8364; &#x20AC;')).toBe('€ €');
    expect(decodeHtmlEntities('&#128512; &#x1F600;')).toBe('😀 😀');
  });

  test('decodes numeric references without the semicolon, as browsers do', () => {
    expect(decodeHtmlEntities('&#65 &#x42.')).toBe('A B.');
    expect(decodeHtmlEntities('&#x41g')).toBe('Ag');
  });

  test('maps C1 references through Windows-1252', () => {
    expect(decodeHtmlEntities('&#128;&#150;&#153;&#x85;')).toBe('€–™…');
    // 0x81 has no Windows-1252 character and stays a control code.
    expect(decodeHtmlEntities('&#129;')).toBe('\u0081');
  });

  test('turns references to no real character into U+FFFD', () => {
    expect(decodeHtmlEntities('&#0;')).toBe('�');
    expect(decodeHtmlEntities('&#xD800;')).toBe('�');
    expect(decodeHtmlEntities('&#x110000;')).toBe('�');
    expect(decodeHtmlEntities('&#99999999999999999999;')).toBe('�');
  });

  test('decodes named references from the HTML 4 set', () => {
    expect(decodeHtmlEntities('&nbsp;')).toBe(' ');
    expect(decodeHtmlEntities('&copy; &reg; &trade; &euro; &pound; &yen;')).toBe('© ® ™ € £ ¥');
    expect(decodeHtmlEntities('&eacute;&Eacute;&uuml;&szlig;&ntilde;&yuml;')).toBe('éÉüßñÿ');
    expect(decodeHtmlEntities('&mdash;&ndash;&hellip;&lsquo;&rsquo;&ldquo;&rdquo;')).toBe('—–…‘’“”');
    expect(decodeHtmlEntities('&alpha;&Omega;&pi;&rarr;&hArr;&ne;&le;&infin;&hearts;')).toBe('αΩπ→⇔≠≤∞♥');
    expect(decodeHtmlEntities('&lang;&rang;')).toBe('⟨⟩');
  });

  test('is case-sensitive about names', () => {
    expect(decodeHtmlEntities('&Alpha;&alpha;')).toBe('Αα');
    expect(decodeHtmlEntities('&AMP;&LT;&GT;&QUOT;&COPY;&REG;')).toBe('&<>"©®');
    expect(decodeHtmlEntities('&EURO;')).toBe('&EURO;');
  });

  test('accepts the legacy names without a semicolon', () => {
    expect(decodeHtmlEntities('&copy2024')).toBe('©2024');
    expect(decodeHtmlEntities('AT&ampT &lt b &gt')).toBe('AT&T < b >');
    expect(decodeHtmlEntities('&notit;')).toBe('¬it;');
    expect(decodeHtmlEntities('&notin;')).toBe('∉');
    expect(decodeHtmlEntities('&ampx;')).toBe('&x;');
  });

  test('requires the semicolon for every other name', () => {
    expect(decodeHtmlEntities('&euro &hellip &rarr')).toBe('&euro &hellip &rarr');
    expect(decodeHtmlEntities('&apos')).toBe('&apos');
  });

  test('leaves text that is not a reference untouched', () => {
    expect(decodeHtmlEntities('')).toBe('');
    expect(decodeHtmlEntities('a & b && c')).toBe('a & b && c');
    expect(decodeHtmlEntities('&; &# &#x; &#xZZ; &unknownname;')).toBe('&; &# &#x; &#xZZ; &unknownname;');
    expect(decodeHtmlEntities('Q&A, R&D')).toBe('Q&A, R&D');
    expect(decodeHtmlEntities('?a=1&b=2&c=3')).toBe('?a=1&b=2&c=3');
  });
});
