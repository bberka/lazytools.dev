import { test, expect } from '@playwright/test';
import { decodeJwt, isJwtExpired, jwtTimes } from '@/lib/tools/jwt-decoder';

// The example token from jwt.io.
const SAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

function segment(value: unknown): string {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  return Buffer.from(json, 'utf8').toString('base64url');
}

function token(header: unknown, payload: unknown, signature = 'c2ln'): string {
  return `${segment(header)}.${segment(payload)}.${signature}`;
}

test.describe('decodeJwt', () => {
  test('decodes the header, the payload and keeps the signature', () => {
    expect(decodeJwt(SAMPLE)).toEqual({
      header: { alg: 'HS256', typ: 'JWT' },
      payload: { sub: '1234567890', name: 'John Doe', iat: 1516239022 },
      signature: 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    });
  });

  test('decodes UTF-8 claims and base64url characters', () => {
    // Three "?" or ">" in a row always put a "_" or a "-" into the encoded payload.
    const payload = { name: 'Jürgen 日本 😀', note: 'a???b>>>c', nested: { roles: ['a', 'b'] } };
    const encoded = token({ alg: 'none' }, payload);
    expect(encoded).toContain('_');
    expect(encoded).toContain('-');
    expect(decodeJwt(encoded).payload).toEqual(payload);
  });

  test('accepts an unsigned token with an empty signature', () => {
    expect(decodeJwt(`${segment({ alg: 'none' })}.${segment({ sub: 'x' })}.`)).toEqual({
      header: { alg: 'none' },
      payload: { sub: 'x' },
      signature: '',
    });
  });

  // Defect: a token pasted with a leading space or line break, or wrapped
  // across lines, was rejected as "Invalid base64url encoding".
  test('ignores whitespace around and inside the token', () => {
    const expected = decodeJwt(SAMPLE);
    expect(decodeJwt(`\n  ${SAMPLE}  \n`)).toEqual(expected);
    expect(decodeJwt(SAMPLE.replace(/(.{40})/g, '$1\n'))).toEqual(expected);
    expect(decodeJwt(SAMPLE.split('.').join('.\r\n '))).toEqual(expected);
  });

  test('ignores a leading "Bearer"', () => {
    expect(decodeJwt(`Bearer ${SAMPLE}`)).toEqual(decodeJwt(SAMPLE));
    expect(decodeJwt(`  bearer   ${SAMPLE}`)).toEqual(decodeJwt(SAMPLE));
  });

  test('accepts segments with base64 padding', () => {
    const header = Buffer.from('{"alg":"none"}').toString('base64');
    expect(header.endsWith('=')).toBe(true);
    expect(decodeJwt(`${header}.${segment({ a: 1 })}.x`).header).toEqual({ alg: 'none' });
  });

  test('rejects anything that is not three segments', () => {
    const message = 'Invalid JWT format. Expected 3 parts separated by dots.';
    expect(() => decodeJwt('abc')).toThrow(message);
    expect(() => decodeJwt('a.b')).toThrow(message);
    expect(() => decodeJwt('a.b.c.d')).toThrow(message);
  });

  test('says so when the token is an encrypted JWE', () => {
    expect(() => decodeJwt('a.b.c.d.e')).toThrow(/encrypted token \(JWE, 5 parts\)/);
  });

  test('names the segment that is not base64url', () => {
    expect(() => decodeJwt(`!!!.${segment({})}.x`)).toThrow('Invalid base64url encoding in the header.');
    expect(() => decodeJwt(`${segment({})}.a.x`)).toThrow('Invalid base64url encoding in the payload.');
    // Bytes that are not UTF-8 text.
    expect(() => decodeJwt(`${segment({})}.__79.x`)).toThrow('Invalid base64url encoding in the payload.');
  });

  test('names the segment that is not JSON', () => {
    expect(() => decodeJwt(`${segment('hello')}.${segment({})}.x`)).toThrow('The header is not valid JSON.');
    expect(() => decodeJwt(`${segment({})}.${segment('{"a":')}.x`)).toThrow('The payload is not valid JSON.');
    expect(() => decodeJwt('..')).toThrow('The header is not valid JSON.');
  });

  // Defect: JSON that is not an object (null, a number, a string, an array)
  // was accepted, and reading claims from a null payload crashed the tool.
  test('rejects a header or payload that is not a JSON object', () => {
    for (const value of ['null', '42', '"text"', '[1,2]', 'true']) {
      expect(() => decodeJwt(token({ alg: 'none' }, value)), value).toThrow('The payload must be a JSON object.');
      expect(() => decodeJwt(token(value, {})), value).toThrow('The header must be a JSON object.');
    }
  });
});

test.describe('jwtTimes', () => {
  test('reads iat, exp and nbf', () => {
    expect(jwtTimes({ iat: 1516239022, exp: 1516242622, nbf: 1516239000 })).toEqual({
      issuedAt: 1516239022,
      expiresAt: 1516242622,
      notBefore: 1516239000,
    });
  });

  test('reports missing claims and claims that are not numbers as null', () => {
    expect(jwtTimes({})).toEqual({ issuedAt: null, expiresAt: null, notBefore: null });
    expect(jwtTimes({ iat: '1516239022', exp: null, nbf: [1] })).toEqual({
      issuedAt: null,
      expiresAt: null,
      notBefore: null,
    });
  });

  // Defect: a claim of 0 (the Unix epoch) was treated as missing and not shown.
  test('keeps a claim of zero', () => {
    expect(jwtTimes({ iat: 0, exp: 0, nbf: 0 })).toEqual({ issuedAt: 0, expiresAt: 0, notBefore: 0 });
  });
});

test.describe('isJwtExpired', () => {
  const now = Date.UTC(2024, 0, 1, 12, 0, 0);

  test('compares exp, in seconds, with the given time, in milliseconds', () => {
    expect(isJwtExpired(now / 1000 - 1, now)).toBe(true);
    expect(isJwtExpired(now / 1000 + 1, now)).toBe(false);
    expect(isJwtExpired(now / 1000, now)).toBe(false);
  });

  test('treats exp 0 as expired and a missing exp as not expired', () => {
    expect(isJwtExpired(0, now)).toBe(true);
    expect(isJwtExpired(null, now)).toBe(false);
  });
});
