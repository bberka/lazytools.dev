import { test, expect } from '@playwright/test';
import {
  convertPunycode,
  decodeDomain,
  decodePunycode,
  encodeDomain,
  encodePunycode,
} from '@/lib/tools/punycode-converter';

// Label pairs checked against the reference implementation (punycode.js). The
// last four are sample strings from RFC 3492, section 7.1.
const VECTORS: Array<[unicode: string, punycode: string]> = [
  ['münchen', 'mnchen-3ya'],
  ['bücher', 'bcher-kva'],
  ['español', 'espaol-zwa'],
  ['straße', 'strae-oqa'],
  ['ü', 'tda'],
  ['домены', 'd1acufc5f'],
  ['рф', 'p1ai'],
  ['例え', 'r8jz45g'],
  ['日本語', 'wgv71a119e'],
  ['中文', 'fiq228c'],
  ['💩', 'ls8h'],
  ['abc', 'abc-'],
  ['ليهمابتكلموشعربي؟', 'egbpdaj6bu4bxfgehfvwxn'],
  ['3年B組金八先生', '3B-ww4c5e180e575a65lsy2b'],
  ['そのスピードで', 'd9juau41awczczp'],
  ['-> $1.00 <-', '-> $1.00 <--'],
];

test.describe('encodePunycode / decodePunycode', () => {
  test('match the reference vectors in both directions', () => {
    for (const [unicode, punycode] of VECTORS) {
      expect(encodePunycode(unicode), unicode).toBe(punycode);
      expect(decodePunycode(punycode), punycode).toBe(unicode);
    }
  });

  test('decode digits in either letter case', () => {
    expect(decodePunycode('MNCHEN-3YA')).toBe('MüNCHEN');
    expect(decodePunycode('mnchen-3YA')).toBe('münchen');
  });

  test('handle the empty label', () => {
    expect(encodePunycode('')).toBe('');
    expect(decodePunycode('')).toBe('');
  });

  // Defect: characters below "0" and between the letter ranges were turned
  // into digits (some of them negative), so garbage decoded to garbage
  // instead of being rejected: "_a" came out as "~~".
  test('reject characters that are not Punycode digits', () => {
    for (const input of ['_a', '!', 'a@b', 'ab[c', 'a b', 'é']) {
      expect(() => decodePunycode(input), input).toThrow(/Invalid input/);
    }
  });

  test('reject input that ends in the middle of a number or has no basic part before "-"', () => {
    expect(() => decodePunycode('mnchen-3y')).toThrow('Invalid input: unexpected end of stream.');
    expect(() => decodePunycode('-abc')).toThrow(/Invalid input/);
  });

  test('reject numbers that leave the Unicode range', () => {
    expect(() => decodePunycode('99999999a')).toThrow('Invalid input: code point out of range.');
  });
});

test.describe('encodeDomain / decodeDomain', () => {
  test('convert only the labels that need it', () => {
    expect(encodeDomain('münchen.de')).toBe('xn--mnchen-3ya.de');
    expect(encodeDomain('www.домены.рф')).toBe('www.xn--d1acufc5f.xn--p1ai');
    expect(encodeDomain('example.com')).toBe('example.com');
    expect(decodeDomain('xn--mnchen-3ya.de')).toBe('münchen.de');
    expect(decodeDomain('www.xn--d1acufc5f.xn--p1ai')).toBe('www.домены.рф');
    expect(decodeDomain('example.com')).toBe('example.com');
  });

  test('lower-case non-ASCII labels and leave ASCII labels as typed', () => {
    expect(encodeDomain('MÜNCHEN.Example.COM')).toBe('xn--mnchen-3ya.Example.COM');
    expect(decodeDomain('XN--MNCHEN-3YA.DE')).toBe('MüNCHEN.DE');
    expect(decodeDomain('Xn--mnchen-3ya.de')).toBe('münchen.de');
  });

  // Defect: a decomposed "u" + combining diaeresis (as copied from macOS)
  // was encoded as it was, giving a different, unresolvable name.
  test('normalise a label to NFC before encoding', () => {
    expect(encodeDomain('münchen.de')).toBe('xn--mnchen-3ya.de');
  });

  test('leave a label that is not valid Punycode as it is', () => {
    expect(decodeDomain('xn--_a.com')).toBe('xn--_a.com');
    expect(decodeDomain('xn--.com')).toBe('xn--.com');
    expect(decodeDomain('xn--mnchen-3y.de')).toBe('xn--mnchen-3y.de');
  });
});

test.describe('convertPunycode', () => {
  test('returns nothing for blank input', () => {
    expect(convertPunycode('', 'encode')).toBe('');
    expect(convertPunycode('  \n ', 'decode')).toBe('');
  });

  test('converts bare domains, one per line, keeping blank lines', () => {
    expect(convertPunycode('münchen.de\n\n  bücher.example  \nexample.com', 'encode')).toBe(
      'xn--mnchen-3ya.de\n\nxn--bcher-kva.example\nexample.com'
    );
    expect(convertPunycode('xn--mnchen-3ya.de\nxn--bcher-kva.example', 'decode')).toBe(
      'münchen.de\nbücher.example'
    );
  });

  // Defect: a URL was decoded through the URL class, whose host is always
  // written back as ASCII, so decoding a full URL changed nothing.
  test('decodes the host of a full URL', () => {
    expect(convertPunycode('https://xn--d1acufc5f.xn--p1ai/index.html', 'decode')).toBe(
      'https://домены.рф/index.html'
    );
    expect(convertPunycode('http://user:pw@xn--bcher-kva.example:8080/a%20b?q=1#top', 'decode')).toBe(
      'http://user:pw@bücher.example:8080/a%20b?q=1#top'
    );
    // The path is not touched, even when it looks like a Punycode label.
    expect(convertPunycode('https://example.com/xn--mnchen-3ya.de', 'decode')).toBe(
      'https://example.com/xn--mnchen-3ya.de'
    );
  });

  test('encodes a web URL the way a browser normalises it', () => {
    expect(convertPunycode('https://münchen.de', 'encode')).toBe('https://xn--mnchen-3ya.de/');
    expect(convertPunycode('https://домены.рф/index.html', 'encode')).toBe(
      'https://xn--d1acufc5f.xn--p1ai/index.html'
    );
    expect(convertPunycode('http://user:pw@bücher.example:8080/a b', 'encode')).toBe(
      'http://user:pw@xn--bcher-kva.example:8080/a%20b'
    );
  });

  // Defect: without a scheme the whole line was split on dots, so the path
  // was encoded together with the last label.
  test('converts only the host when a path, port or user follows it', () => {
    expect(convertPunycode('münchen.de/straße?q=ä', 'encode')).toBe('xn--mnchen-3ya.de/straße?q=ä');
    expect(convertPunycode('münchen.de:8080', 'encode')).toBe('xn--mnchen-3ya.de:8080');
    expect(convertPunycode('info@bücher.example', 'encode')).toBe('info@xn--bcher-kva.example');
    expect(convertPunycode('xn--mnchen-3ya.de:8080/xn--a', 'decode')).toBe('münchen.de:8080/xn--a');
  });

  test('converts the host of a URL with a scheme the URL class does not map', () => {
    expect(convertPunycode('redis://bücher.example:6379/0', 'encode')).toBe(
      'redis://xn--bcher-kva.example:6379/0'
    );
  });

  test('leaves an IPv6 host alone', () => {
    expect(convertPunycode('http://[::1]:8080/x', 'decode')).toBe('http://[::1]:8080/x');
  });

  test('swapping direction gives the original domains back', () => {
    const domains = 'münchen.de\nдомены.рф\n例え.jp\nexample.com';
    const encoded = convertPunycode(domains, 'encode');
    expect(encoded).toBe('xn--mnchen-3ya.de\nxn--d1acufc5f.xn--p1ai\nxn--r8jz45g.jp\nexample.com');
    expect(convertPunycode(encoded, 'decode')).toBe(domains);
  });
});
