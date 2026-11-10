/**
 * HTTP Basic authentication (RFC 7617): `Authorization: Basic base64(user:pass)`.
 * The credentials are UTF-8 encoded before the Base64 step, so non-ASCII
 * names and passwords survive. Basic auth is encoding, not encryption.
 */

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type BasicAuthResult =
  | { ok: true; token: string; header: string; headerValue: string }
  | { ok: false; error: string };

/** Builds the header for a user name and password. */
export function encodeBasicAuth(username: string, password: string): BasicAuthResult {
  if (username === '' && password === '') {
    return { ok: false, error: 'Enter a username and password.' };
  }
  if (username.includes(':')) {
    return { ok: false, error: 'A username cannot contain a colon (:); it separates the username from the password.' };
  }

  const token = toBase64(`${username}:${password}`);
  return { ok: true, token, headerValue: `Basic ${token}`, header: `Authorization: Basic ${token}` };
}

export type BasicAuthDecodeResult =
  | { ok: true; username: string; password: string }
  | { ok: false; error: string };

/**
 * Reads credentials back out of a pasted header (`Authorization: Basic ...`),
 * a header value (`Basic ...`) or just the Base64 token. URL-safe Base64 and
 * missing padding are accepted.
 */
export function decodeBasicAuth(input: string): BasicAuthDecodeResult {
  let text = input.trim();
  if (text === '') return { ok: false, error: 'Paste an Authorization header to decode.' };

  text = text.replace(/^authorization\s*:\s*/i, '');
  const scheme = /^(\S+)\s+(\S.*)$/.exec(text);
  if (scheme) {
    if (scheme[1].toLowerCase() !== 'basic') {
      return { ok: false, error: `That header uses the ${scheme[1]} scheme, not Basic.` };
    }
    text = scheme[2].trim();
  }

  const token = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (token === '' || !/^[A-Za-z0-9+/]+$/.test(token) || token.length % 4 === 1) {
    return { ok: false, error: 'The token is not valid Base64.' };
  }

  let decoded: string;
  try {
    const binary = atob(token.padEnd(Math.ceil(token.length / 4) * 4, '='));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: 'The token decodes to bytes that are not valid UTF-8 text.' };
  }

  const colon = decoded.indexOf(':');
  if (colon === -1) {
    return { ok: false, error: 'The decoded value has no colon, so it is not username:password.' };
  }
  return { ok: true, username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

export type SnippetId = 'curl' | 'curl-user' | 'fetch' | 'httpie';

export interface BasicAuthSnippet {
  id: SnippetId;
  label: string;
  language: string;
  code: string;
}

/** Wraps text in single quotes for a POSIX shell. */
export function shellQuote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

export const DEFAULT_SNIPPET_URL = 'https://api.example.com/';

/** Ready-to-run requests that send the credentials. */
export function buildSnippets(
  username: string,
  password: string,
  url: string = DEFAULT_SNIPPET_URL
): BasicAuthSnippet[] {
  const result = encodeBasicAuth(username, password);
  if (!result.ok) return [];

  const target = url.trim() || DEFAULT_SNIPPET_URL;
  return [
    {
      id: 'curl',
      label: 'curl (header)',
      language: 'bash',
      code: `curl -H ${shellQuote(result.header)} ${shellQuote(target)}`,
    },
    {
      id: 'curl-user',
      label: 'curl (-u)',
      language: 'bash',
      code: `curl -u ${shellQuote(`${username}:${password}`)} ${shellQuote(target)}`,
    },
    {
      id: 'fetch',
      label: 'fetch',
      language: 'javascript',
      code: `fetch(${JSON.stringify(target)}, {\n  headers: {\n    Authorization: ${JSON.stringify(result.headerValue)},\n  },\n});`,
    },
    {
      id: 'httpie',
      label: 'HTTPie',
      language: 'bash',
      code: `http ${shellQuote(target)} ${shellQuote(`Authorization:${result.headerValue}`)}`,
    },
  ];
}
