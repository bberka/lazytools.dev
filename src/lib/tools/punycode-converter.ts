/**
 * Punycode (RFC 3492) and its use in internationalised domain names.
 *
 * `convertPunycode` is what the tool calls: it takes one address per line (a
 * bare domain, a host with a port, an e-mail style `user@host` or a full URL)
 * and rewrites only the host, label by label. `encodePunycode` and
 * `decodePunycode` are the raw algorithm for a single label without the
 * `xn--` prefix.
 *
 * Everything here is pure. Encoding a web URL uses the platform `URL` class,
 * which is the same in browsers and in Node.
 */

export type PunycodeMode = 'encode' | 'decode';

// Punycode parameters (RFC 3492, section 5)
const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const DELIMITER = '-';
const ACE_PREFIX = 'xn--';
const MAX_CODE_POINT = 0x10ffff;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  delta = firstTime ? Math.floor(delta / DAMP) : Math.floor(delta / 2);
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > Math.floor(((BASE - TMIN) * TMAX) / 2)) {
    delta = Math.floor(delta / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
}

function threshold(k: number, bias: number): number {
  if (k <= bias) return TMIN;
  return k >= bias + TMAX ? TMAX : k - bias;
}

// 0-25 become a-z, 26-35 become 0-9.
function digitToBasic(digit: number): number {
  return digit + 22 + 75 * (digit < 26 ? 1 : 0);
}

// The reverse; BASE stands for "not a Punycode digit".
function basicToDigit(codePoint: number): number {
  if (codePoint >= 0x30 && codePoint <= 0x39) return codePoint - 0x30 + 26; // 0-9
  if (codePoint >= 0x41 && codePoint <= 0x5a) return codePoint - 0x41; // A-Z
  if (codePoint >= 0x61 && codePoint <= 0x7a) return codePoint - 0x61; // a-z
  return BASE;
}

/** Punycode of one label, without the `xn--` prefix. */
export function encodePunycode(input: string): string {
  const codePoints = Array.from(input, (character) => character.codePointAt(0) ?? 0);
  const output: string[] = [];

  for (const codePoint of codePoints) {
    if (codePoint < 0x80) output.push(String.fromCharCode(codePoint));
  }

  const basicCount = output.length;
  let handledCount = basicCount;
  // The delimiter follows the basic code points even when nothing comes after
  // it ("abc" is "abc-"); that is what lets the decoder tell the two parts apart.
  if (basicCount > 0) output.push(DELIMITER);

  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;

  while (handledCount < codePoints.length) {
    let m = Infinity;
    for (const codePoint of codePoints) {
      if (codePoint >= n && codePoint < m) m = codePoint;
    }

    delta += (m - n) * (handledCount + 1);
    n = m;

    for (const codePoint of codePoints) {
      if (codePoint < n) {
        delta++;
      } else if (codePoint === n) {
        let q = delta;
        for (let k = BASE; ; k += BASE) {
          const t = threshold(k, bias);
          if (q < t) break;
          output.push(String.fromCharCode(digitToBasic(t + ((q - t) % (BASE - t)))));
          q = Math.floor((q - t) / (BASE - t));
        }
        output.push(String.fromCharCode(digitToBasic(q)));
        bias = adapt(delta, handledCount + 1, handledCount === basicCount);
        delta = 0;
        handledCount++;
      }
    }
    delta++;
    n++;
  }

  return output.join('');
}

/**
 * The Unicode label a Punycode string (without `xn--`) stands for.
 *
 * @throws Error when the input is not valid Punycode.
 */
export function decodePunycode(input: string): string {
  const output: number[] = [];

  // Everything before the last delimiter is copied as it is.
  const basicLength = Math.max(input.lastIndexOf(DELIMITER), 0);
  for (let index = 0; index < basicLength; index++) {
    const codePoint = input.charCodeAt(index);
    if (codePoint >= 0x80) throw new Error('Invalid input: non-ASCII in basic part.');
    output.push(codePoint);
  }

  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  let index = basicLength > 0 ? basicLength + 1 : 0;

  while (index < input.length) {
    const oldI = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) throw new Error('Invalid input: unexpected end of stream.');
      const digit = basicToDigit(input.charCodeAt(index++));
      if (digit >= BASE) throw new Error('Invalid input: non-alphanumeric code point.');
      i += digit * w;
      const t = threshold(k, bias);
      if (digit < t) break;
      w *= BASE - t;
    }

    const outLength = output.length + 1;
    bias = adapt(i - oldI, outLength, oldI === 0);
    n += Math.floor(i / outLength);
    if (n > MAX_CODE_POINT) throw new Error('Invalid input: code point out of range.');
    i %= outLength;

    output.splice(i, 0, n);
    i++;
  }

  let label = '';
  for (const codePoint of output) label += String.fromCodePoint(codePoint);
  return label;
}

/**
 * ASCII form of a domain: every label with a non-ASCII character becomes
 * `xn--` plus its Punycode. Such labels are lower-cased and put in NFC first,
 * as IDNA requires; ASCII labels are left alone.
 */
export function encodeDomain(domain: string): string {
  return domain
    .split('.')
    .map((label) => {
      if (/[^\x00-\x7F]/.test(label)) {
        return ACE_PREFIX + encodePunycode(label.normalize('NFC').toLowerCase());
      }
      return label;
    })
    .join('.');
}

/**
 * Unicode form of a domain: every `xn--` label is decoded. A label that is
 * not valid Punycode is left as it is.
 */
export function decodeDomain(domain: string): string {
  return domain
    .split('.')
    .map((label) => {
      if (label.toLowerCase().startsWith(ACE_PREFIX)) {
        try {
          // A bare "xn--" decodes to nothing; keep it rather than lose the label.
          return decodePunycode(label.substring(ACE_PREFIX.length)) || label;
        } catch {
          return label;
        }
      }
      return label;
    })
    .join('.');
}

// [scheme://] authority [/path?query#hash]
const ADDRESS = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)?([^/?#]*)([\s\S]*)$/;
// Schemes whose host the URL class converts with the full IDNA mapping.
const WEB_SCHEME = /^(https?|wss?|ftp):\/\/$/i;

function convertAuthority(authority: string, mode: PunycodeMode): string {
  const at = authority.lastIndexOf('@');
  const userInfo = authority.slice(0, at + 1);
  const hostAndPort = authority.slice(at + 1);
  // An IPv6 literal has no labels to convert.
  if (hostAndPort.startsWith('[')) return authority;

  const port = /:\d*$/.exec(hostAndPort)?.[0] ?? '';
  const host = hostAndPort.slice(0, hostAndPort.length - port.length);
  return userInfo + (mode === 'encode' ? encodeDomain(host) : decodeDomain(host)) + port;
}

function convertLine(line: string, mode: PunycodeMode): string {
  const trimmed = line.trim();
  const match = ADDRESS.exec(trimmed);
  if (!trimmed || !match) return trimmed;

  const [, scheme = '', authority, rest] = match;

  if (mode === 'encode' && WEB_SCHEME.test(scheme)) {
    try {
      return new URL(trimmed).toString();
    } catch {
      // Not a URL the platform accepts; convert the host by hand below.
    }
  }

  // Decoding must not go through the URL class: it always writes the host
  // back in its ASCII form, which would undo the conversion.
  return scheme + convertAuthority(authority, mode) + rest;
}

/**
 * Converts every line of the text. Each line may be a domain, a host with a
 * port, or a full URL; only the host part changes, except that encoding a web
 * URL also normalises it the way a browser's address bar would.
 */
export function convertPunycode(text: string, mode: PunycodeMode): string {
  if (!text.trim()) return '';
  return text
    .split('\n')
    .map((line) => convertLine(line, mode))
    .join('\n');
}
