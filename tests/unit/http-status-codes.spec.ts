import { test, expect } from '@playwright/test';
import {
  HTTP_STATUS_CODES,
  STATUS_CLASSES,
  countByClass,
  formatStatusLine,
  getStatusCode,
  searchStatusCodes,
  statusClassOf,
} from '@/lib/tools/http-status-codes';

// The codes the IANA HTTP Status Code Registry lists as assigned, plus 306
// (registered as "(Unused)") and 418 (reserved by RFC 9110). Written out
// separately from the data so a dropped or mistyped entry shows up here.
const EXPECTED_CODES = [
  100, 101, 102, 103,
  200, 201, 202, 203, 204, 205, 206, 207, 208, 226,
  300, 301, 302, 303, 304, 305, 306, 307, 308,
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418,
  421, 422, 423, 424, 425, 426, 428, 429, 431, 451,
  500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511,
];

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const codesOf = (entries: readonly { code: number }[]) => entries.map((entry) => entry.code);

test.describe('the status code table', () => {
  test('lists exactly the registered codes', () => {
    expect(codesOf(HTTP_STATUS_CODES)).toEqual(EXPECTED_CODES);
  });

  test('has unique codes in ascending order', () => {
    const codes = codesOf(HTTP_STATUS_CODES);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual([...codes].sort((a, b) => a - b));
  });

  test('gives every entry a phrase, description, usage note and specification', () => {
    for (const entry of HTTP_STATUS_CODES) {
      const label = String(entry.code);
      expect(entry.phrase.trim(), `${label} phrase`).not.toBe('');
      expect(entry.description.trim(), `${label} description`).not.toBe('');
      expect(entry.usage.trim(), `${label} usage`).not.toBe('');
      expect(entry.spec, `${label} spec`).toMatch(/^RFC \d{4}/);
      for (const text of [entry.phrase, entry.description, entry.usage, entry.spec]) {
        expect(text, `${label} has stray whitespace`).toBe(text.trim());
      }
    }
  });

  test('has descriptions of a sentence or two', () => {
    for (const entry of HTTP_STATUS_CODES) {
      const sentences = entry.description.split(/(?<=[.!?])\s+/);
      expect(sentences.length, `${entry.code} description`).toBeLessThanOrEqual(2);
      expect(entry.description, `${entry.code} description`).toMatch(/[.!?]$/);
    }
  });

  test('uses the current names from RFC 9110', () => {
    const phrase = (code: number) => getStatusCode(code)?.phrase;
    expect(phrase(200)).toBe('OK');
    expect(phrase(404)).toBe('Not Found');
    expect(phrase(413)).toBe('Content Too Large');
    expect(phrase(414)).toBe('URI Too Long');
    expect(phrase(416)).toBe('Range Not Satisfiable');
    expect(phrase(418)).toBe("I'm a teapot");
    expect(phrase(422)).toBe('Unprocessable Content');
    expect(phrase(429)).toBe('Too Many Requests');
    expect(phrase(451)).toBe('Unavailable For Legal Reasons');
    expect(phrase(505)).toBe('HTTP Version Not Supported');
    expect(phrase(511)).toBe('Network Authentication Required');
  });

  test('credits each code to the specification that defines it', () => {
    const spec = (code: number) => getStatusCode(code)?.spec;
    expect(spec(200)).toBe('RFC 9110, Section 15.3.1');
    expect(spec(404)).toBe('RFC 9110, Section 15.5.5');
    expect(spec(503)).toBe('RFC 9110, Section 15.6.4');
    expect(spec(103)).toBe('RFC 8297');
    expect(spec(207)).toContain('RFC 4918');
    expect(spec(429)).toContain('RFC 6585');
    expect(spec(451)).toBe('RFC 7725');
    expect(spec(418)).toContain('RFC 2324');
    expect(spec(418)).toContain('RFC 9110');
  });
});

test.describe('statusClassOf', () => {
  test('maps the edges of each class', () => {
    expect(statusClassOf(100)).toBe('1xx');
    expect(statusClassOf(199)).toBe('1xx');
    expect(statusClassOf(200)).toBe('2xx');
    expect(statusClassOf(299)).toBe('2xx');
    expect(statusClassOf(300)).toBe('3xx');
    expect(statusClassOf(399)).toBe('3xx');
    expect(statusClassOf(400)).toBe('4xx');
    expect(statusClassOf(499)).toBe('4xx');
    expect(statusClassOf(500)).toBe('5xx');
    expect(statusClassOf(599)).toBe('5xx');
  });

  test('returns null for anything that is not a three-digit status code in 1xx-5xx', () => {
    expect(statusClassOf(99)).toBeNull();
    expect(statusClassOf(0)).toBeNull();
    expect(statusClassOf(600)).toBeNull();
    expect(statusClassOf(-404)).toBeNull();
    expect(statusClassOf(404.5)).toBeNull();
    expect(statusClassOf(Number.NaN)).toBeNull();
    expect(statusClassOf(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

test.describe('classes of the table entries', () => {
  test('are derived from the code', () => {
    for (const entry of HTTP_STATUS_CODES) {
      expect(entry.statusClass, String(entry.code)).toBe(statusClassOf(entry.code));
    }
    expect(getStatusCode(102)?.statusClass).toBe('1xx');
    expect(getStatusCode(226)?.statusClass).toBe('2xx');
    expect(getStatusCode(308)?.statusClass).toBe('3xx');
    expect(getStatusCode(451)?.statusClass).toBe('4xx');
    expect(getStatusCode(511)?.statusClass).toBe('5xx');
  });

  test('are described by five labelled classes in order', () => {
    expect(STATUS_CLASSES.map((info) => info.id)).toEqual(['1xx', '2xx', '3xx', '4xx', '5xx']);
    expect(STATUS_CLASSES.map((info) => info.label)).toEqual([
      'Informational',
      'Successful',
      'Redirection',
      'Client Error',
      'Server Error',
    ]);
    for (const info of STATUS_CLASSES) {
      expect(info.summary.trim(), info.id).not.toBe('');
    }
  });

  test('are counted per class', () => {
    expect(countByClass(HTTP_STATUS_CODES)).toEqual({
      '1xx': 4,
      '2xx': 10,
      '3xx': 9,
      '4xx': 29,
      '5xx': 11,
    });
    expect(countByClass([])).toEqual({ '1xx': 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 });
  });
});

test.describe('getStatusCode and formatStatusLine', () => {
  test('look an entry up by number', () => {
    expect(getStatusCode(404)?.phrase).toBe('Not Found');
    expect(getStatusCode(999)).toBeUndefined();
    expect(getStatusCode(40)).toBeUndefined();
  });

  test('format the code with its phrase for copying', () => {
    expect(formatStatusLine(getStatusCode(404)!)).toBe('404 Not Found');
    expect(formatStatusLine(getStatusCode(418)!)).toBe("418 I'm a teapot");
    expect(formatStatusLine(getStatusCode(200)!)).toBe('200 OK');
  });
});

test.describe('searchStatusCodes by number', () => {
  test('returns every code for an empty or blank query', () => {
    expect(codesOf(searchStatusCodes(''))).toEqual(EXPECTED_CODES);
    expect(codesOf(searchStatusCodes('   '))).toEqual(EXPECTED_CODES);
  });

  test('matches by prefix, so 40 finds 400 to 409', () => {
    expect(codesOf(searchStatusCodes('40'))).toEqual(range(400, 409));
  });

  test('matches a whole class from its first digit', () => {
    expect(codesOf(searchStatusCodes('5'))).toEqual(EXPECTED_CODES.filter((c) => c >= 500));
    expect(codesOf(searchStatusCodes('1'))).toEqual([100, 101, 102, 103]);
  });

  test('matches an exact code', () => {
    expect(codesOf(searchStatusCodes('404'))).toEqual([404]);
    expect(codesOf(searchStatusCodes('418'))).toEqual([418]);
  });

  test('matches only from the start of the code', () => {
    // 04 sits inside 404 but starts no code.
    expect(searchStatusCodes('04')).toEqual([]);
    expect(codesOf(searchStatusCodes('2'))).not.toContain(102);
  });

  test('finds nothing for a number that no code starts with', () => {
    expect(searchStatusCodes('999')).toEqual([]);
    expect(searchStatusCodes('4040')).toEqual([]);
    expect(searchStatusCodes('0')).toEqual([]);
    expect(searchStatusCodes('600')).toEqual([]);
  });

  test('ignores surrounding whitespace', () => {
    expect(codesOf(searchStatusCodes('  404  '))).toEqual([404]);
  });

  test('does not match a number against the text or specification', () => {
    // 9110 and 2518 occur in the specification column, but a number only matches codes.
    expect(searchStatusCodes('9110')).toEqual([]);
    expect(searchStatusCodes('2518')).toEqual([]);
  });

  test('returns entries in ascending code order', () => {
    const codes = codesOf(searchStatusCodes('4'));
    expect(codes).toEqual([...codes].sort((a, b) => a - b));
  });
});

test.describe('searchStatusCodes by words', () => {
  test('matches words in the phrase', () => {
    expect(codesOf(searchStatusCodes('teapot'))).toEqual([418]);
    expect(codesOf(searchStatusCodes('gateway'))).toEqual([502, 504]);
  });

  test('matches words in the description', () => {
    expect(codesOf(searchStatusCodes('rate limiting'))).toContain(429);
    // "April" is in the description of 418, not in its phrase.
    expect(codesOf(searchStatusCodes('april'))).toEqual([418]);
  });

  test('ignores case', () => {
    expect(searchStatusCodes('TeaPot')).toEqual(searchStatusCodes('teapot'));
    expect(codesOf(searchStatusCodes('NOT FOUND'))).toContain(404);
  });

  test('matches part of a word', () => {
    expect(codesOf(searchStatusCodes('redirect'))).toEqual(
      expect.arrayContaining([301, 302, 303, 307, 308]),
    );
    expect(codesOf(searchStatusCodes('authent'))).toEqual(expect.arrayContaining([401, 407, 511]));
  });

  test('needs every word to match, in any order', () => {
    const results = codesOf(searchStatusCodes('found not'));
    expect(results).toContain(404);
    expect(results).not.toContain(200);
    for (const code of results) {
      const entry = getStatusCode(code)!;
      const text = `${entry.phrase} ${entry.description}`.toLowerCase();
      expect(text, String(code)).toContain('found');
      expect(text, String(code)).toContain('not');
    }
  });

  test('looks past apostrophes in either the query or the text', () => {
    expect(codesOf(searchStatusCodes('im a teapot'))).toEqual([418]);
    expect(codesOf(searchStatusCodes("i'm a teapot"))).toEqual([418]);
    expect(codesOf(searchStatusCodes('i’m a teapot'))).toEqual([418]);
  });

  test('finds the unused 306 by its phrase', () => {
    expect(codesOf(searchStatusCodes('unused'))).toContain(306);
  });

  test('finds nothing for words that appear nowhere', () => {
    expect(searchStatusCodes('zebra')).toEqual([]);
  });

  test('handles characters that are special in regular expressions', () => {
    expect(() => searchStatusCodes('[a-z')).not.toThrow();
    expect(searchStatusCodes('[a-z')).toEqual([]);
    expect(searchStatusCodes('.*')).toEqual([]);
  });
});

test.describe('searchStatusCodes with numbers and words together', () => {
  test('keeps codes with the prefix whose text has the word', () => {
    const results = codesOf(searchStatusCodes('40 not'));
    expect(results).toEqual(expect.arrayContaining([404, 405, 406]));
    for (const code of results) {
      expect(code).toBeGreaterThanOrEqual(400);
      expect(code).toBeLessThanOrEqual(409);
    }
  });

  test('finds nothing when the word belongs to a different code', () => {
    expect(searchStatusCodes('404 teapot')).toEqual([]);
    expect(codesOf(searchStatusCodes('418 teapot'))).toEqual([418]);
  });
});

test.describe('searchStatusCodes by class', () => {
  test('narrows the results to one class', () => {
    expect(codesOf(searchStatusCodes('', '3xx'))).toEqual(range(300, 308));
    expect(codesOf(searchStatusCodes('', '1xx'))).toEqual([100, 101, 102, 103]);
    expect(codesOf(searchStatusCodes('', 'all'))).toEqual(EXPECTED_CODES);
  });

  test('applies the class filter on top of the query', () => {
    expect(codesOf(searchStatusCodes('40', '4xx'))).toEqual(range(400, 409));
    expect(searchStatusCodes('40', '5xx')).toEqual([]);
    const redirects = searchStatusCodes('redirect', '3xx');
    expect(redirects.length).toBeGreaterThan(0);
    expect(redirects.every((entry) => entry.statusClass === '3xx')).toBe(true);
  });

  test('accepts a class such as 4xx as a search term', () => {
    expect(codesOf(searchStatusCodes('4xx'))).toEqual(EXPECTED_CODES.filter((c) => c >= 400 && c < 500));
    expect(searchStatusCodes('4XX')).toEqual(searchStatusCodes('4xx'));
    expect(codesOf(searchStatusCodes('5xx timeout'))).toEqual([504]);
    expect(searchStatusCodes('4xx', '5xx')).toEqual([]);
  });

  test('does not mutate the table', () => {
    const before = codesOf(HTTP_STATUS_CODES);
    searchStatusCodes('4');
    searchStatusCodes('', '2xx');
    expect(codesOf(HTTP_STATUS_CODES)).toEqual(before);
  });
});
