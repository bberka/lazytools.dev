import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import {
  EXPIRY_PRESETS,
  JWT_ALGORITHMS,
  base64Decode,
  base64Encode,
  base64UrlDecode,
  base64UrlDecodeText,
  base64UrlEncode,
  base64UrlEncodeText,
  decodeSecret,
  describeTimeClaims,
  generateJti,
  generateRandomSecret,
  hmac,
  humanizeDuration,
  isJwtAlgorithm,
  minifyJson,
  minimumSecretBytes,
  parseJsonObject,
  setJsonMember,
  signJwt,
  unixSeconds,
  validateHeader,
  validatePayload,
  verifyJwt,
  type JwtAlgorithm,
} from '@/lib/tools/jwt-signer';

// ---------------------------------------------------------------------------
// Published vectors
// ---------------------------------------------------------------------------

// RFC 7515 Appendix A.1: the JWS Signing Input is built from these exact
// octets, including the CRLF + space line breaks inside the JSON text, so the
// signer has to be able to encode the text verbatim (minify: false).
const RFC7515_HEADER = '{"typ":"JWT",\r\n "alg":"HS256"}';
const RFC7515_PAYLOAD =
  '{"iss":"joe",\r\n "exp":1300819380,\r\n "http://example.com/is_root":true}';
// The JWK "k" value from Appendix A.1.1. It is Base64URL, not UTF-8 text.
const RFC7515_KEY =
  'AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow';
const RFC7515_HEADER_B64 = 'eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9';
const RFC7515_PAYLOAD_B64 =
  'eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ';
const RFC7515_SIGNATURE = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC7515_TOKEN = `${RFC7515_HEADER_B64}.${RFC7515_PAYLOAD_B64}.${RFC7515_SIGNATURE}`;
const RFC7515_EXP = 1300819380;

// The widely used jwt.io example (secret "your-256-bit-secret").
const JWTIO_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
/** A clock frozen at `seconds` since the epoch. */
const at = (seconds: number) => () => seconds * 1000;

const NODE_HASH: Record<JwtAlgorithm, string> = {
  HS256: 'sha256',
  HS384: 'sha384',
  HS512: 'sha512',
};

test.describe('RFC 7515 Appendix A.1 (HS256)', () => {
  test('base64url of the header and payload octets matches the RFC', () => {
    expect(base64UrlEncodeText(RFC7515_HEADER)).toBe(RFC7515_HEADER_B64);
    expect(base64UrlEncodeText(RFC7515_PAYLOAD)).toBe(RFC7515_PAYLOAD_B64);
  });

  test('signJwt reproduces the RFC token and signature byte for byte', async () => {
    const result = await signJwt({
      header: RFC7515_HEADER,
      payload: RFC7515_PAYLOAD,
      secret: RFC7515_KEY,
      secretEncoding: 'base64',
      algorithm: 'HS256',
      minify: false,
      clock: at(RFC7515_EXP - 60),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.header).toBe(RFC7515_HEADER_B64);
    expect(result.parts.payload).toBe(RFC7515_PAYLOAD_B64);
    expect(result.parts.signature).toBe(RFC7515_SIGNATURE);
    expect(result.token).toBe(RFC7515_TOKEN);
  });

  test('the RFC key is 64 octets once decoded', () => {
    const key = decodeSecret(RFC7515_KEY, 'base64');
    expect(key.ok && key.value.length).toBe(64);
  });

  test('verifyJwt accepts the RFC token before exp and rejects it from exp on', async () => {
    const options = { token: RFC7515_TOKEN, secret: RFC7515_KEY, secretEncoding: 'base64' as const };

    const before = await verifyJwt({ ...options, clock: at(RFC7515_EXP - 1) });
    expect(before.status).toBe('valid');
    expect(before.algorithm).toBe('HS256');

    // RFC 7519 4.1.4: the current time MUST be before the expiration time.
    const exact = await verifyJwt({ ...options, clock: at(RFC7515_EXP) });
    expect(exact.status).toBe('expired');

    const after = await verifyJwt({ ...options, clock: at(RFC7515_EXP + 3600) });
    expect(after.status).toBe('expired');
    expect(after.message).toContain('1 hour ago');
  });

  test('the jwt.io example token is signed identically from compact or pretty JSON', async () => {
    const compact = await signJwt({
      header: '{"alg":"HS256","typ":"JWT"}',
      payload: '{"sub":"1234567890","name":"John Doe","iat":1516239022}',
      secret: 'your-256-bit-secret',
      secretEncoding: 'utf8',
      algorithm: 'HS256',
      clock: at(1516239022),
    });
    expect(compact.ok && compact.token).toBe(JWTIO_TOKEN);

    // Default minify strips the insignificant whitespace of an edited document.
    const pretty = await signJwt({
      header: '{\n  "alg": "HS256",\n  "typ": "JWT"\n}',
      payload: '{\n  "sub": "1234567890",\n  "name": "John Doe",\n  "iat": 1516239022\n}',
      secret: 'your-256-bit-secret',
      secretEncoding: 'utf8',
      algorithm: 'HS256',
      clock: at(1516239022),
    });
    expect(pretty.ok && pretty.token).toBe(JWTIO_TOKEN);
  });
});

test.describe('algorithms', () => {
  test('only the three HMAC algorithms are recognised, case-sensitively', () => {
    expect([...JWT_ALGORITHMS]).toEqual(['HS256', 'HS384', 'HS512']);
    for (const alg of JWT_ALGORITHMS) expect(isJwtAlgorithm(alg)).toBe(true);
    for (const alg of ['hs256', 'none', 'RS256', 'HS224', '', 'HS256 ']) {
      expect(isJwtAlgorithm(alg)).toBe(false);
    }
  });
});

test.describe('HMAC primitive', () => {
  // RFC 4231 test case 2.
  const key = new TextEncoder().encode('Jefe');
  const data = new TextEncoder().encode('what do ya want for nothing?');

  test('matches RFC 4231 test case 2 for SHA-256, SHA-384 and SHA-512', async () => {
    expect(hex(await hmac('HS256', key, data))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
    );
    expect(hex(await hmac('HS384', key, data))).toBe(
      'af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649'
    );
    expect(hex(await hmac('HS512', key, data))).toBe(
      '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737'
    );
  });

  test('agrees with Node crypto for short, block-sized and oversized keys', async () => {
    for (const algorithm of JWT_ALGORITHMS) {
      for (const length of [1, 32, 64, 128, 129, 300]) {
        const secret = Uint8Array.from({ length }, (_, i) => (i * 31 + 7) & 0xff);
        const message = new TextEncoder().encode(`signing input for ${algorithm} / ${length}`);
        const expected = createHmac(NODE_HASH[algorithm], secret).update(message).digest('hex');
        expect(hex(await hmac(algorithm, secret, message))).toBe(expected);
      }
    }
  });
});

test.describe('Base64URL', () => {
  test('encodes the RFC 4648 section 10 vectors without padding', () => {
    const encode = (text: string) => base64UrlEncode(new TextEncoder().encode(text));
    expect(encode('')).toBe('');
    expect(encode('f')).toBe('Zg');
    expect(encode('fo')).toBe('Zm8');
    expect(encode('foo')).toBe('Zm9v');
    expect(encode('foob')).toBe('Zm9vYg');
    expect(encode('fooba')).toBe('Zm9vYmE');
    expect(encode('foobar')).toBe('Zm9vYmFy');
  });

  test('uses the URL-safe alphabet: - and _ instead of + and /', () => {
    const bytes = Uint8Array.from([0xfb, 0xff, 0xbf]);
    expect(base64Encode(bytes)).toBe('+/+/');
    expect(base64UrlEncode(bytes)).toBe('-_-_');
    expect(base64UrlEncode(Uint8Array.from([0xfb, 0xff]))).toBe('-_8');
    expect(Array.from(base64UrlDecode('-_-_') ?? [])).toEqual([0xfb, 0xff, 0xbf]);
  });

  test('standard Base64 keeps its padding, Base64URL never has any', () => {
    expect(base64Encode(Uint8Array.from([1]))).toBe('AQ==');
    expect(base64Encode(Uint8Array.from([1, 2]))).toBe('AQI=');
    expect(base64UrlEncode(Uint8Array.from([1]))).toBe('AQ');
    expect(base64UrlEncode(Uint8Array.from([1, 2]))).toBe('AQI');
  });

  test('round-trips every length from 0 to 300 and matches Node', () => {
    for (let length = 0; length <= 300; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 73 + length * 5) & 0xff);
      const node = Buffer.from(bytes);
      const encoded = base64UrlEncode(bytes);
      expect(encoded).toBe(node.toString('base64url'));
      expect(base64Encode(bytes)).toBe(node.toString('base64'));
      expect(encoded).not.toMatch(/[+/=]/);
      expect(Array.from(base64UrlDecode(encoded) ?? [255])).toEqual(Array.from(bytes));
      expect(Array.from(base64Decode(node.toString('base64')) ?? [255])).toEqual(Array.from(bytes));
    }
  });

  test('round-trips UTF-8 text', () => {
    const text = 'héllo wörld € 日本語 😀';
    const encoded = base64UrlEncodeText(text);
    expect(encoded).toBe(Buffer.from(text, 'utf8').toString('base64url'));
    expect(base64UrlDecodeText(encoded)).toBe(text);
  });

  test('the strict decoder refuses padding, the standard alphabet and stray characters', () => {
    expect(base64UrlDecode('Zg==')).toBeNull();
    expect(base64UrlDecode('Zg=')).toBeNull();
    expect(base64UrlDecode('+/+/')).toBeNull();
    expect(base64UrlDecode('ab cd')).toBeNull();
    expect(base64UrlDecode('ab\ncd')).toBeNull();
    expect(base64UrlDecode('ab$d')).toBeNull();
    expect(base64UrlDecode('é')).toBeNull();
  });

  test('refuses a length that cannot come from whole bytes', () => {
    expect(base64UrlDecode('A')).toBeNull();
    expect(base64UrlDecode('AAAAA')).toBeNull();
    expect(base64UrlDecode('AA')).not.toBeNull();
  });

  test('refuses non-canonical trailing bits so a tail cannot be altered unnoticed', () => {
    // "Zg" is the canonical form of "f"; "Zh" decodes to the same byte if the
    // spare bits are ignored.
    expect(base64UrlDecode('Zg')).not.toBeNull();
    expect(base64UrlDecode('Zh')).toBeNull();
    expect(base64UrlDecode('Zm9')).toBeNull();
    expect(base64UrlDecode('Zm8')).not.toBeNull();
  });

  test('the text decoder returns null for bytes that are not UTF-8', () => {
    expect(base64UrlDecodeText(base64UrlEncode(Uint8Array.from([0xff, 0xfe, 0xfd])))).toBeNull();
    expect(base64UrlDecodeText('!!!')).toBeNull();
    expect(base64UrlDecodeText('')).toBe('');
  });

  test('the lenient decoder takes either alphabet, optional padding and whitespace', () => {
    expect(Array.from(base64Decode('+/+/') ?? [])).toEqual([0xfb, 0xff, 0xbf]);
    expect(Array.from(base64Decode('-_-_') ?? [])).toEqual([0xfb, 0xff, 0xbf]);
    expect(Array.from(base64Decode('AQ==') ?? [])).toEqual([1]);
    expect(Array.from(base64Decode('AQ') ?? [])).toEqual([1]);
    expect(Array.from(base64Decode('  AQI=\n') ?? [])).toEqual([1, 2]);
    expect(Array.from(base64Decode('Zm9v\nYmFy') ?? [])).toEqual(Array.from(Buffer.from('foobar')));
  });

  test('the lenient decoder still refuses malformed input', () => {
    expect(base64Decode('A')).toBeNull();
    expect(base64Decode('A===')).toBeNull();
    expect(base64Decode('AQ=x')).toBeNull();
    expect(base64Decode('AQ==AQ==')).toBeNull();
    expect(base64Decode('ab$d')).toBeNull();
    expect(base64Decode('Zh==')).toBeNull();
  });
});

test.describe('JSON helpers', () => {
  test('parseJsonObject accepts objects only', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonObject('  {}  ')).toEqual({ ok: true, value: {} });
  });

  test('parseJsonObject reports invalid JSON as an error result', () => {
    for (const text of ['{', '{"a":}', "{'a':1}", '{"a":1,}', 'not json', '{"a":1} extra']) {
      const result = parseJsonObject(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/^Invalid JSON/);
    }
  });

  test('parseJsonObject reports empty input and non-objects', () => {
    for (const text of ['', '   \n']) {
      const result = parseJsonObject(text);
      expect(result).toEqual({ ok: false, error: 'Enter a JSON object.' });
    }
    for (const text of ['[]', '[1,2]', '"text"', '42', 'null', 'true']) {
      const result = parseJsonObject(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('Must be a JSON object, like {"key": "value"}.');
    }
  });

  test('minifyJson strips whitespace outside strings only', () => {
    expect(minifyJson('{\n  "a": 1,\n  "b": [1, 2,\t3]\r\n}')).toBe('{"a":1,"b":[1,2,3]}');
    expect(minifyJson('{ "text": "two  spaces\\n and a \\" quote", "k y": true }')).toBe(
      '{"text":"two  spaces\\n and a \\" quote","k y":true}'
    );
    // An escaped backslash right before the closing quote must not hide the quote.
    expect(minifyJson('{ "p": "C:\\\\" , "q": 1 }')).toBe('{"p":"C:\\\\","q":1}');
  });

  test('minifyJson keeps key order, big numbers and duplicate keys intact', () => {
    expect(minifyJson('{ "z": 1, "a": 2, "9": 3 }')).toBe('{"z":1,"a":2,"9":3}');
    expect(minifyJson('{ "id": 12345678901234567890 }')).toBe('{"id":12345678901234567890}');
    expect(minifyJson('{ "a": 1, "a": 2 }')).toBe('{"a":1,"a":2}');
  });

  test('setJsonMember adds a member, replaces one and keeps the others', () => {
    const added = setJsonMember('{"sub":"1"}', 'iat', 100);
    expect(added.ok && JSON.parse(added.value)).toEqual({ sub: '1', iat: 100 });

    const replaced = setJsonMember('{"iat":1,"sub":"1"}', 'iat', 200);
    expect(replaced.ok && JSON.parse(replaced.value)).toEqual({ iat: 200, sub: '1' });
    expect(replaced.ok && Object.keys(JSON.parse(replaced.value))).toEqual(['iat', 'sub']);
  });

  test('setJsonMember pretty-prints and refuses a document it cannot edit', () => {
    const ok = setJsonMember('{}', 'a', 1);
    expect(ok).toEqual({ ok: true, value: '{\n  "a": 1\n}' });

    const bad = setJsonMember('{ nope', 'a', 1);
    expect(bad.ok).toBe(false);
    const array = setJsonMember('[1]', 'a', 1);
    expect(array.ok).toBe(false);
  });
});

test.describe('secrets', () => {
  test('decodes UTF-8 text and counts bytes, not characters', () => {
    const result = decodeSecret('s3cr€t', 'utf8');
    expect(result.ok && Array.from(result.value)).toEqual(Array.from(Buffer.from('s3cr€t')));
    expect(result.ok && result.value.length).toBe(8);
  });

  test('does not trim a UTF-8 secret: whitespace is part of the key', () => {
    const result = decodeSecret(' key ', 'utf8');
    expect(result.ok && result.value.length).toBe(5);
  });

  test('decodes Base64 in either alphabet', () => {
    const standard = decodeSecret('+/+/', 'base64');
    const urlSafe = decodeSecret('-_-_', 'base64');
    expect(standard.ok && Array.from(standard.value)).toEqual([0xfb, 0xff, 0xbf]);
    expect(urlSafe.ok && Array.from(urlSafe.value)).toEqual([0xfb, 0xff, 0xbf]);
  });

  test('rejects an empty secret and invalid Base64 with an error result', () => {
    expect(decodeSecret('', 'utf8')).toEqual({ ok: false, error: 'Enter a secret.' });
    expect(decodeSecret('', 'base64')).toEqual({ ok: false, error: 'Enter a secret.' });
    expect(decodeSecret('   ', 'base64')).toEqual({ ok: false, error: 'Enter a secret.' });
    const bad = decodeSecret('not base64!', 'base64');
    expect(bad).toEqual({ ok: false, error: 'The secret is not valid Base64.' });
  });

  test('minimum sizes follow RFC 7518 section 3.2', () => {
    expect(minimumSecretBytes('HS256')).toBe(32);
    expect(minimumSecretBytes('HS384')).toBe(48);
    expect(minimumSecretBytes('HS512')).toBe(64);
  });

  test('generateRandomSecret gives a Base64 secret of the minimum size', () => {
    const fill = (length: number) => Uint8Array.from({ length }, (_, i) => i);
    for (const algorithm of JWT_ALGORITHMS) {
      const secret = generateRandomSecret(algorithm, fill);
      const decoded = decodeSecret(secret, 'base64');
      expect(decoded.ok && decoded.value.length).toBe(minimumSecretBytes(algorithm));
    }
  });

  test('generateRandomSecret uses WebCrypto by default and does not repeat', () => {
    const a = generateRandomSecret('HS256');
    const b = generateRandomSecret('HS256');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });
});

test.describe('claims and time', () => {
  test('unixSeconds floors the injected clock to whole seconds', () => {
    expect(unixSeconds(() => 1_700_000_000_999)).toBe(1_700_000_000);
    expect(unixSeconds(() => 0)).toBe(0);
    expect(unixSeconds()).toBeGreaterThan(1_700_000_000);
  });

  test('generateJti builds a version 4 UUID from the supplied random bytes', () => {
    expect(generateJti(() => new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000');
    expect(generateJti(() => new Uint8Array(16).fill(0xff))).toBe(
      'ffffffff-ffff-4fff-bfff-ffffffffffff'
    );
    const jti = generateJti();
    expect(jti).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(generateJti()).not.toBe(jti);
  });

  test('expiry presets are positive, ascending and uniquely labelled', () => {
    const seconds = EXPIRY_PRESETS.map((preset) => preset.seconds);
    expect(seconds.every((value) => Number.isInteger(value) && value > 0)).toBe(true);
    expect([...seconds].sort((a, b) => a - b)).toEqual(seconds);
    expect(new Set(EXPIRY_PRESETS.map((preset) => preset.label)).size).toBe(EXPIRY_PRESETS.length);
    expect(seconds).toContain(3600);
  });

  test('describeTimeClaims lists numeric iat, exp and nbf as UTC dates', () => {
    expect(
      describeTimeClaims({ sub: 'x', exp: RFC7515_EXP, iat: 1516239022, nbf: 0, other: 5 })
    ).toEqual([
      { claim: 'iat', iso: '2018-01-18T01:30:22.000Z' },
      { claim: 'nbf', iso: '1970-01-01T00:00:00.000Z' },
      { claim: 'exp', iso: '2011-03-22T18:43:00.000Z' },
    ]);
  });

  test('describeTimeClaims skips values that are not usable dates', () => {
    expect(describeTimeClaims({ exp: '1300819380', iat: null, nbf: Number.NaN })).toEqual([]);
    expect(describeTimeClaims({ exp: 1e20 })).toEqual([]);
    expect(describeTimeClaims({})).toEqual([]);
  });

  test('humanizeDuration shows the two largest units', () => {
    expect(humanizeDuration(0)).toBe('0 seconds');
    expect(humanizeDuration(1)).toBe('1 second');
    expect(humanizeDuration(59)).toBe('59 seconds');
    expect(humanizeDuration(60)).toBe('1 minute');
    expect(humanizeDuration(90)).toBe('1 minute 30 seconds');
    expect(humanizeDuration(3600)).toBe('1 hour');
    expect(humanizeDuration(3 * 3600 + 25 * 60 + 10)).toBe('3 hours 25 minutes');
    expect(humanizeDuration(86400)).toBe('1 day');
    expect(humanizeDuration(2 * 86400 + 5 * 3600)).toBe('2 days 5 hours');
    expect(humanizeDuration(-120)).toBe('2 minutes');
  });
});

test.describe('validateHeader and validatePayload', () => {
  test('a header must be a JSON object whose alg matches the selection', () => {
    expect(validateHeader('{"alg":"HS256","typ":"JWT"}', 'HS256')).toBeNull();
    expect(validateHeader('{"alg":"HS512"}', 'HS512')).toBeNull();
  });

  test('reports invalid JSON, wrong type and alg problems', () => {
    expect(validateHeader('{', 'HS256')).toMatch(/^Invalid JSON/);
    expect(validateHeader('[]', 'HS256')).toBe('Must be a JSON object, like {"key": "value"}.');
    expect(validateHeader('{"typ":"JWT"}', 'HS256')).toBe(
      'The header needs "alg": "HS256" to match the selected algorithm.'
    );
    expect(validateHeader('{"alg":"HS384"}', 'HS256')).toBe(
      'The header says alg "HS384" but HS256 is selected. Change the algorithm menu or the header.'
    );
    expect(validateHeader('{"alg":"none"}', 'HS256')).toContain('"none"');
    expect(validateHeader('{"alg":256}', 'HS256')).toContain('256');
  });

  test('validatePayload accepts any JSON object and rejects the rest', () => {
    expect(validatePayload('{}')).toBeNull();
    expect(validatePayload('{"sub":"1"}')).toBeNull();
    expect(validatePayload('')).toBe('Enter a JSON object.');
    expect(validatePayload('{"sub":')).toMatch(/^Invalid JSON/);
    expect(validatePayload('"text"')).toBe('Must be a JSON object, like {"key": "value"}.');
  });
});

test.describe('signJwt', () => {
  const base = {
    header: '{"alg":"HS256","typ":"JWT"}',
    payload: '{"sub":"1"}',
    secret: 'a-test-secret-that-is-long-enough!',
    secretEncoding: 'utf8' as const,
    algorithm: 'HS256' as const,
  };

  test('returns an error result for invalid header JSON', async () => {
    const result = await signJwt({ ...base, header: '{"alg":' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('header');
      expect(result.error).toMatch(/^Invalid JSON/);
    }
  });

  test('returns an error result for invalid payload JSON', async () => {
    for (const payload of ['{"sub":', '', '[1]', '"x"', 'null']) {
      const result = await signJwt({ ...base, payload });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.field).toBe('payload');
    }
  });

  test('returns an error result when the header alg disagrees with the algorithm', async () => {
    const result = await signJwt({ ...base, header: '{"alg":"HS512"}' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('header');
      expect(result.error).toContain('HS512');
    }
  });

  test('returns an error result for a missing or malformed secret', async () => {
    const empty = await signJwt({ ...base, secret: '' });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.field).toBe('secret');
      expect(empty.error).toBe('Enter a secret.');
    }

    const bad = await signJwt({ ...base, secret: 'not base64!', secretEncoding: 'base64' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.field).toBe('secret');
  });

  test('reports the header problem before the payload problem', async () => {
    const result = await signJwt({ ...base, header: '{', payload: '{' });
    expect(result.ok === false && result.field).toBe('header');
  });

  test('produces a three-part token whose parts are Base64URL of the minified JSON', async () => {
    const result = await signJwt({
      ...base,
      header: '{\n  "alg": "HS256",\n  "typ": "JWT"\n}',
      payload: '{\n  "name": "Zoë  Ünï",\n  "n": 1\n}',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const segments = result.token.split('.');
    expect(segments).toHaveLength(3);
    expect(segments).toEqual([result.parts.header, result.parts.payload, result.parts.signature]);
    expect(base64UrlDecodeText(segments[0])).toBe('{"alg":"HS256","typ":"JWT"}');
    expect(base64UrlDecodeText(segments[1])).toBe('{"name":"Zoë  Ünï","n":1}');
    expect(result.token).not.toMatch(/[+/=\s]/);
  });

  test('signatures match Node crypto for every algorithm and both secret encodings', async () => {
    const keyBytes = Uint8Array.from({ length: 64 }, (_, i) => (i * 11 + 3) & 0xff);
    for (const algorithm of JWT_ALGORITHMS) {
      for (const encoding of ['utf8', 'base64'] as const) {
        const secret = encoding === 'base64' ? Buffer.from(keyBytes).toString('base64') : 'plain-text-secret-value-1234567890';
        const result = await signJwt({
          header: `{"alg":"${algorithm}","typ":"JWT"}`,
          payload: '{"sub":"abc"}',
          secret,
          secretEncoding: encoding,
          algorithm,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        const key = encoding === 'base64' ? Buffer.from(keyBytes) : Buffer.from(secret, 'utf8');
        const expected = createHmac(NODE_HASH[algorithm], key)
          .update(`${result.parts.header}.${result.parts.payload}`)
          .digest('base64url');
        expect(result.parts.signature).toBe(expected);
      }
    }
  });

  test('a UTF-8 secret and the same bytes as Base64 give the same signature', async () => {
    const asText = await signJwt({ ...base, secret: 'hunter2-hunter2' });
    const asBase64 = await signJwt({
      ...base,
      secret: Buffer.from('hunter2-hunter2').toString('base64'),
      secretEncoding: 'base64',
    });
    expect(asText.ok && asText.token).toBe(asBase64.ok && asBase64.token);
  });

  test('warns about a secret shorter than RFC 7518 requires, per algorithm', async () => {
    const short = await signJwt({ ...base, secret: 'short' });
    expect(short.ok && short.warnings).toEqual([
      'The secret is 5 bytes. RFC 7518 requires at least 32 bytes for HS256.',
    ]);

    const hs512 = await signJwt({
      ...base,
      header: '{"alg":"HS512"}',
      algorithm: 'HS512',
      secret: 'x'.repeat(63),
    });
    expect(hs512.ok && hs512.warnings[0]).toContain('at least 64 bytes for HS512');

    const exact = await signJwt({ ...base, secret: 'x'.repeat(32) });
    expect(exact.ok && exact.warnings).toEqual([]);
  });

  test('warns about suspicious time claims using the injected clock', async () => {
    const now = 1_800_000_000;
    const sign = (payload: string) => signJwt({ ...base, payload, clock: at(now) });

    const clean = await sign(`{"iat":${now},"nbf":${now},"exp":${now + 3600}}`);
    expect(clean.ok && clean.warnings).toEqual([]);

    const expired = await sign(`{"exp":${now - 1}}`);
    expect(expired.ok && expired.warnings).toEqual([
      '"exp" is in the past, so verifiers will reject this token as expired.',
    ]);

    const atExp = await sign(`{"exp":${now}}`);
    expect(atExp.ok && atExp.warnings[0]).toContain('"exp" is in the past');

    const future = await sign(`{"nbf":${now + 60}}`);
    expect(future.ok && future.warnings).toEqual([
      '"nbf" is in the future, so verifiers will reject this token until then.',
    ]);

    const millis = await sign(`{"exp":${(now + 3600) * 1000}}`);
    expect(millis.ok && millis.warnings).toEqual([
      '"exp" looks like milliseconds. JWT times are in seconds since 1970.',
    ]);

    const text = await sign('{"exp":"tomorrow"}');
    expect(text.ok && text.warnings).toEqual([
      '"exp" should be a number of seconds since 1970 (a NumericDate).',
    ]);
  });
});

test.describe('verifyJwt', () => {
  const SECRET = 'a-test-secret-that-is-long-enough!';
  const NOW = 1_800_000_000;

  async function tokenFor(
    payload: string,
    options: { algorithm?: JwtAlgorithm; secret?: string; header?: string } = {}
  ): Promise<string> {
    const algorithm = options.algorithm ?? 'HS256';
    const result = await signJwt({
      header: options.header ?? `{"alg":"${algorithm}","typ":"JWT"}`,
      payload,
      secret: options.secret ?? SECRET,
      secretEncoding: 'utf8',
      algorithm,
      clock: at(NOW),
    });
    if (!result.ok) throw new Error(result.error);
    return result.token;
  }

  const verify = (token: string, secret = SECRET, clock = at(NOW)) =>
    verifyJwt({ token, secret, secretEncoding: 'utf8', clock });

  test('round-trips every algorithm as valid', async () => {
    for (const algorithm of JWT_ALGORITHMS) {
      const token = await tokenFor(`{"sub":"1","exp":${NOW + 60}}`, { algorithm });
      const result = await verify(token);
      expect(result.status).toBe('valid');
      expect(result.algorithm).toBe(algorithm);
    }
  });

  test('a token without time claims is valid', async () => {
    const result = await verify(await tokenFor('{"sub":"1"}'));
    expect(result.status).toBe('valid');
    expect(result.message).toBe('The signature is valid (HS256).');
  });

  test('says how long a valid token has left', async () => {
    const result = await verify(await tokenFor(`{"exp":${NOW + 90}}`));
    expect(result.status).toBe('valid');
    expect(result.message).toBe('The signature is valid (HS256). It expires in 1 minute 30 seconds.');
  });

  test('reports a wrong secret as an invalid signature', async () => {
    const token = await tokenFor('{"sub":"1"}');
    const result = await verify(token, 'a-different-secret-entirely-here');
    expect(result.status).toBe('invalid-signature');
  });

  test('reports a tampered payload as an invalid signature', async () => {
    const token = await tokenFor('{"sub":"1"}');
    const [header, , signature] = token.split('.');
    const forged = `${header}.${base64UrlEncodeText('{"sub":"2"}')}.${signature}`;
    expect((await verify(forged)).status).toBe('invalid-signature');
  });

  test('reports a tampered signature as an invalid signature', async () => {
    const token = await tokenFor('{"sub":"1"}');
    const parts = token.split('.');
    const bytes = base64UrlDecode(parts[2]);
    expect(bytes).not.toBeNull();
    const changed = Uint8Array.from(bytes ?? []);
    changed[0] ^= 1;
    const forged = `${parts[0]}.${parts[1]}.${base64UrlEncode(changed)}`;
    expect((await verify(forged)).status).toBe('invalid-signature');
  });

  test('a header that claims a different algorithm than was used fails the signature check', async () => {
    const token = await tokenFor('{"sub":"1"}');
    const [, payload, signature] = token.split('.');
    const swapped = `${base64UrlEncodeText('{"alg":"HS512","typ":"JWT"}')}.${payload}.${signature}`;
    const result = await verify(swapped);
    expect(result.status).toBe('invalid-signature');
    expect(result.algorithm).toBe('HS512');
  });

  test('an empty or truncated signature is an invalid signature, not a crash', async () => {
    const token = await tokenFor('{"sub":"1"}');
    const [header, payload, signature] = token.split('.');
    expect((await verify(`${header}.${payload}.`)).status).toBe('invalid-signature');
    expect((await verify(`${header}.${payload}.${signature.slice(0, 8)}`)).status).toBe(
      'invalid-signature'
    );
  });

  test('reports malformed tokens: wrong part count', async () => {
    for (const token of ['', '   ', 'abc', 'a.b', 'a.b.c.d', '..']) {
      const result = await verify(token);
      expect(result.status).toBe('malformed');
    }
    expect((await verify('a.b')).message).toBe('A JWT has 3 parts separated by dots, but this has 2.');
    expect((await verify('')).message).toBe('Paste a token to verify.');
  });

  test('reports malformed tokens: parts that are not Base64URL or not JSON', async () => {
    const good = await tokenFor('{"sub":"1"}');
    const [header, payload, signature] = good.split('.');

    const badHeader = await verify(`!!!.${payload}.${signature}`);
    expect(badHeader.status).toBe('malformed');
    expect(badHeader.message).toContain('header');

    const badPayload = await verify(`${header}.%%%.${signature}`);
    expect(badPayload.status).toBe('malformed');
    expect(badPayload.message).toContain('payload');

    const badSignature = await verify(`${header}.${payload}.**`);
    expect(badSignature.status).toBe('malformed');
    expect(badSignature.message).toContain('signature');

    const notJson = `${base64UrlEncodeText('not json')}.${payload}.${signature}`;
    expect((await verify(notJson)).status).toBe('malformed');

    const notObject = `${header}.${base64UrlEncodeText('[1,2]')}.${signature}`;
    expect((await verify(notObject)).status).toBe('malformed');

    const notUtf8 = `${header}.${base64UrlEncode(Uint8Array.from([0xff, 0xfe]))}.${signature}`;
    expect((await verify(notUtf8)).status).toBe('malformed');
  });

  test('padded Base64 segments are malformed because JWTs use Base64URL without padding', async () => {
    const good = await tokenFor('{"a":1}');
    const [header, payload, signature] = good.split('.');
    const padded = `${header}.${payload}=.${signature}`;
    expect((await verify(padded)).status).toBe('malformed');
  });

  test('a header without a usable alg is malformed', async () => {
    const missing = `${base64UrlEncodeText('{"typ":"JWT"}')}.${base64UrlEncodeText('{}')}.AAAA`;
    expect((await verify(missing)).status).toBe('malformed');
    const numeric = `${base64UrlEncodeText('{"alg":5}')}.${base64UrlEncodeText('{}')}.AAAA`;
    expect((await verify(numeric)).status).toBe('malformed');
  });

  test('never accepts alg none or an asymmetric alg', async () => {
    for (const alg of ['none', 'None', 'RS256', 'ES256', 'PS512', 'hs256']) {
      const token = `${base64UrlEncodeText(`{"alg":"${alg}"}`)}.${base64UrlEncodeText('{"sub":"1"}')}.`;
      const result = await verify(token);
      expect(result.status).toBe('unsupported-algorithm');
      expect(result.message).toContain(`"${alg}"`);
      expect(result.algorithm).toBeUndefined();
    }
  });

  test('tolerates surrounding whitespace and a Bearer prefix', async () => {
    const token = await tokenFor('{"sub":"1"}');
    expect((await verify(`  \n${token}\n `)).status).toBe('valid');
    expect((await verify(`Bearer ${token}`)).status).toBe('valid');
    expect((await verify(`bearer   ${token}`)).status).toBe('valid');
  });

  test('a token split across lines is malformed rather than silently repaired', async () => {
    const token = await tokenFor('{"sub":"1"}');
    const broken = `${token.slice(0, 20)}\n${token.slice(20)}`;
    expect((await verify(broken)).status).toBe('malformed');
  });

  test('reports a missing or invalid secret before checking the signature', async () => {
    const token = await tokenFor('{"sub":"1"}');
    const empty = await verifyJwt({ token, secret: '', secretEncoding: 'utf8', clock: at(NOW) });
    expect(empty.status).toBe('invalid-secret');
    expect(empty.message).toBe('Enter a secret.');
    const bad = await verifyJwt({ token, secret: 'nope!', secretEncoding: 'base64', clock: at(NOW) });
    expect(bad.status).toBe('invalid-secret');
  });

  test('malformed wins over a missing secret, so structure errors show up early', async () => {
    const result = await verifyJwt({ token: 'a.b', secret: '', secretEncoding: 'utf8', clock: at(NOW) });
    expect(result.status).toBe('malformed');
  });

  test('exp is checked against the injected clock with a strict boundary', async () => {
    const exp = NOW + 100;
    const token = await tokenFor(`{"exp":${exp}}`);
    expect((await verify(token, SECRET, at(exp - 1))).status).toBe('valid');
    expect((await verify(token, SECRET, at(exp - 0.001))).status).toBe('valid');
    expect((await verify(token, SECRET, at(exp))).status).toBe('expired');
    expect((await verify(token, SECRET, at(exp + 1))).status).toBe('expired');
  });

  test('the expired message says how long ago and names the time', async () => {
    const token = await tokenFor(`{"exp":${NOW}}`);
    const result = await verify(token, SECRET, at(NOW + 2 * 3600 + 30 * 60));
    expect(result.status).toBe('expired');
    expect(result.message).toBe(
      'The signature is valid, but the token expired 2 hours 30 minutes ago (2027-01-15T08:00:00.000Z).'
    );
  });

  test('expiry is judged with the clock the caller injects, not the real one', async () => {
    const token = await tokenFor('{"exp":4102444800}'); // 2100-01-01
    expect((await verify(token, SECRET, at(NOW))).status).toBe('valid');
    expect((await verify(token, SECRET, at(4102444800 + 1))).status).toBe('expired');
    // Default clock: the real now is well before 2100.
    const real = await verifyJwt({ token, secret: SECRET, secretEncoding: 'utf8' });
    expect(real.status).toBe('valid');
  });

  test('nbf in the future is reported as not yet valid, and nbf equal to now is valid', async () => {
    const nbf = NOW + 600;
    const token = await tokenFor(`{"nbf":${nbf}}`);
    const early = await verify(token, SECRET, at(NOW));
    expect(early.status).toBe('not-yet-valid');
    expect(early.message).toContain('10 minutes');
    expect((await verify(token, SECRET, at(nbf - 1))).status).toBe('not-yet-valid');
    expect((await verify(token, SECRET, at(nbf))).status).toBe('valid');
  });

  test('a signature failure is reported even when the token has also expired', async () => {
    const token = await tokenFor(`{"exp":${NOW - 10}}`);
    const result = await verify(token, 'the-wrong-secret-for-this-token!!');
    expect(result.status).toBe('invalid-signature');
  });

  test('a time claim that is not a number is malformed', async () => {
    for (const payload of ['{"exp":"soon"}', '{"nbf":"0"}', '{"exp":null}', '{"exp":true}']) {
      const result = await verify(await tokenFor(payload));
      expect(result.status).toBe('malformed');
      expect(result.message).toMatch(/"(exp|nbf)"/);
    }
  });

  test('iat is informational and never makes a token invalid', async () => {
    const result = await verify(await tokenFor(`{"iat":${NOW + 99999}}`));
    expect(result.status).toBe('valid');
  });

  test('verifies a Base64 secret and a UTF-8 secret of the same bytes identically', async () => {
    const token = await tokenFor('{"sub":"1"}');
    const viaBase64 = await verifyJwt({
      token,
      secret: Buffer.from(SECRET).toString('base64'),
      secretEncoding: 'base64',
      clock: at(NOW),
    });
    expect(viaBase64.status).toBe('valid');
  });
});
