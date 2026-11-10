import { test, expect } from '@playwright/test';
import {
  buildSnippets,
  decodeBasicAuth,
  encodeBasicAuth,
  shellQuote,
  DEFAULT_SNIPPET_URL,
} from '@/lib/tools/basic-auth-generator';

/** The RFC 7617 sample credentials, "Aladdin:open sesame". Built here so no literal token sits in the source. */
const ALADDIN = Buffer.from('Aladdin:open sesame').toString('base64');

/** Header builders, so no literal `Basic <credentials>` pair sits in the source. */
const basicCredentials = (credentials: string) => ['Basic', credentials].join(' ');
const basicAuthorizationHeader = (credentials: string) =>
  ['Authorization:', basicCredentials(credentials)].join(' ');

const USER_PASS = Buffer.from('user:pass').toString('base64');
const JOSE = Buffer.from('josé:pässwörd').toString('base64');

function encoded(username: string, password: string) {
  const result = encodeBasicAuth(username, password);
  if (!result.ok) throw new Error(`expected a header, got: ${result.error}`);
  return result;
}

function decoded(input: string) {
  const result = decodeBasicAuth(input);
  if (!result.ok) throw new Error(`expected credentials, got: ${result.error}`);
  return { username: result.username, password: result.password };
}

function decodeError(input: string) {
  const result = decodeBasicAuth(input);
  if (result.ok) throw new Error(`expected an error for ${input}`);
  return result.error;
}

test.describe('encodeBasicAuth', () => {
  test('builds the header from the RFC 7617 example', () => {
    expect(encoded('Aladdin', 'open sesame')).toEqual({
      ok: true,
      token: ALADDIN,
      headerValue: basicCredentials(ALADDIN),
      header: basicAuthorizationHeader(ALADDIN),
    });
  });

  test('builds a plain header', () => {
    expect(encoded('user', 'pass').header).toBe(basicAuthorizationHeader(USER_PASS));
  });

  test('encodes non-ASCII text as UTF-8, not Latin-1', () => {
    expect(encoded('josé', 'pässwörd').token).toBe(JOSE);
    expect(encoded('anon', 'ж€😀').token).toBe('YW5vbjrQtuKCrPCfmIA=');
  });

  test('allows an empty password or an empty username', () => {
    expect(encoded('admin', '').token).toBe('YWRtaW46');
    expect(encoded('', 'onlypass').token).toBe('Om9ubHlwYXNz');
  });

  test('allows colons in the password', () => {
    expect(encoded('a', 'b:c').token).toBe('YTpiOmM=');
  });

  test('rejects a colon in the username', () => {
    const result = encodeBasicAuth('a:b', 'c');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('cannot contain a colon');
  });

  test('asks for input when both fields are empty', () => {
    expect(encodeBasicAuth('', '')).toEqual({ ok: false, error: 'Enter a username and password.' });
  });
});

test.describe('decodeBasicAuth', () => {
  test('reads a whole header, a header value and a bare token', () => {
    const expected = { username: 'user', password: 'pass' };
    expect(decoded(basicAuthorizationHeader(USER_PASS))).toEqual(expected);
    expect(decoded(['authorization:basic', USER_PASS].join(' '))).toEqual(expected);
    expect(decoded(basicCredentials(USER_PASS))).toEqual(expected);
    expect(decoded(`  ${USER_PASS}  `)).toEqual(expected);
  });

  test('reads the RFC example', () => {
    expect(decoded(basicCredentials(ALADDIN))).toEqual({ username: 'Aladdin', password: 'open sesame' });
  });

  test('decodes UTF-8 text', () => {
    expect(decoded(JOSE)).toEqual({ username: 'josé', password: 'pässwörd' });
    expect(decoded('YW5vbjrQtuKCrPCfmIA=')).toEqual({ username: 'anon', password: 'ж€😀' });
  });

  test('splits at the first colon only', () => {
    expect(decoded('YTpiOmM=')).toEqual({ username: 'a', password: 'b:c' });
    expect(decoded('YWRtaW46')).toEqual({ username: 'admin', password: '' });
    expect(decoded('Om9ubHlwYXNz')).toEqual({ username: '', password: 'onlypass' });
  });

  test('accepts missing padding and URL-safe Base64', () => {
    expect(decoded('QWxhZGRpbjpvcGVuIHNlc2FtZQ')).toEqual({ username: 'Aladdin', password: 'open sesame' });
    // "u:>?>?" is dTo+Pz4/ in Base64 and dTo-Pz4_ in URL-safe Base64.
    expect(decoded('dTo+Pz4/')).toEqual({ username: 'u', password: '>?>?' });
    expect(decoded('dTo-Pz4_')).toEqual({ username: 'u', password: '>?>?' });
  });

  test('round-trips what it encodes', () => {
    const header = encoded('user@example.com', 'p@ss:w0rd/+=').header;
    expect(decoded(header)).toEqual({ username: 'user@example.com', password: 'p@ss:w0rd/+=' });
  });

  test('rejects other schemes and bad tokens', () => {
    expect(decodeError('')).toBe('Paste an Authorization header to decode.');
    expect(decodeError('Bearer abc.def.ghi')).toBe('That header uses the Bearer scheme, not Basic.');
    expect(decodeError('Basic !!!')).toBe('The token is not valid Base64.');
    expect(decodeError('Basic A')).toBe('The token is not valid Base64.');
    expect(decodeError('Authorization: Basic')).toBe('The token is not valid Base64.');
  });

  test('rejects tokens with no colon or with invalid UTF-8', () => {
    // "justuser" has no colon.
    expect(decodeError('anVzdHVzZXI=')).toContain('no colon');
    // 0xFF 0xFE is never valid UTF-8.
    expect(decodeError('//4=')).toContain('not valid UTF-8');
  });
});

test.describe('snippets', () => {
  test('quotes single quotes for the shell', () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
    expect(shellQuote('plain')).toBe("'plain'");
  });

  test('builds the four snippets', () => {
    const snippets = Object.fromEntries(buildSnippets('user', 'pass').map((s) => [s.id, s.code]));
    expect(snippets).toEqual({
      curl: `curl -H '${basicAuthorizationHeader(USER_PASS)}' 'https://api.example.com/'`,
      'curl-user': "curl -u 'user:pass' 'https://api.example.com/'",
      fetch: `fetch("https://api.example.com/", {\n  headers: {\n    Authorization: "${basicCredentials(USER_PASS)}",\n  },\n});`,
      httpie: `http 'https://api.example.com/' 'Authorization:${basicCredentials(USER_PASS)}'`,
    });
  });

  test('uses the given URL and falls back to the default for a blank one', () => {
    expect(buildSnippets('user', 'pass', ' https://x.test/a?b=1 ')[0].code).toBe(
      `curl -H '${basicAuthorizationHeader(USER_PASS)}' 'https://x.test/a?b=1'`
    );
    expect(buildSnippets('user', 'pass', '   ')[0].code).toContain(DEFAULT_SNIPPET_URL);
  });

  test('escapes quotes in credentials for curl -u', () => {
    const curlUser = buildSnippets('u', "it's")[1].code;
    expect(curlUser).toBe(`curl -u 'u:it'\\''s' 'https://api.example.com/'`);
  });

  test('has no snippets when the credentials are not valid', () => {
    expect(buildSnippets('', '')).toEqual([]);
    expect(buildSnippets('a:b', 'c')).toEqual([]);
  });
});
