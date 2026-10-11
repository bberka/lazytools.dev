import { test, expect } from '@playwright/test';
import { buildUrl, parseUrl, type UrlParts } from '@/lib/tools/url-parser-builder';

const EMPTY: UrlParts = { protocol: '', host: '', path: '', hash: '', params: [] };

function pairs(parts: UrlParts): Array<[string, string]> {
  return parts.params.map((param) => [param.key, param.value]);
}

test.describe('parseUrl', () => {
  test('splits an absolute URL', () => {
    const parts = parseUrl('https://example.com/api/search?q=query&limit=10#results');
    expect(parts.protocol).toBe('https:');
    expect(parts.host).toBe('example.com');
    expect(parts.path).toBe('/api/search');
    expect(parts.hash).toBe('#results');
    expect(pairs(parts)).toEqual([
      ['q', 'query'],
      ['limit', '10'],
    ]);
  });

  test('returns empty parts for empty or blank input', () => {
    expect(parseUrl('')).toEqual(EMPTY);
    expect(parseUrl('   ')).toEqual(EMPTY);
  });

  test('keeps the port and ignores surrounding whitespace', () => {
    const parts = parseUrl('  http://localhost:3000/a  ');
    expect(parts).toMatchObject({ protocol: 'http:', host: 'localhost:3000', path: '/a' });
  });

  test('decodes query keys and values, keeps repeats and order', () => {
    const parts = parseUrl('https://x.test/?tag=a&tag=b&name=J%C3%BCrgen+M&empty=&flag');
    expect(pairs(parts)).toEqual([
      ['tag', 'a'],
      ['tag', 'b'],
      ['name', 'Jürgen M'],
      ['empty', ''],
      ['flag', ''],
    ]);
  });

  test('reads an address without a scheme and reports no protocol for it', () => {
    expect(parseUrl('example.com/a?b=1')).toMatchObject({ protocol: '', host: 'example.com', path: '/a' });
    expect(parseUrl('localhost:8080')).toMatchObject({ protocol: '', host: 'localhost:8080', path: '/' });
    expect(parseUrl('//cdn.example.com/x.js')).toMatchObject({
      protocol: '',
      host: 'cdn.example.com',
      path: '/x.js',
    });
  });

  // Defect: "/api/search" was given a made-up scheme and parsed as host "api", path "/search".
  test('reads a relative reference as a path, not as a host', () => {
    const parts = parseUrl('/api/search?q=query&limit=10#results');
    expect(parts.protocol).toBe('');
    expect(parts.host).toBe('');
    expect(parts.path).toBe('/api/search');
    expect(parts.hash).toBe('#results');
    expect(pairs(parts)).toEqual([
      ['q', 'query'],
      ['limit', '10'],
    ]);

    expect(parseUrl('?page=2')).toMatchObject({ host: '', path: '', params: [{ key: 'page', value: '2' }] });
    expect(parseUrl('#top')).toMatchObject({ host: '', path: '', hash: '#top' });
    expect(parseUrl('../img/a.png')).toMatchObject({ host: '', path: '../img/a.png' });
    expect(parseUrl('./a?b=c')).toMatchObject({ host: '', path: './a' });
  });

  // Defect: the scheme pattern only allowed letters, so "s3://bucket/key" became host "s3".
  test('recognises schemes with digits, plus, dot or hyphen', () => {
    expect(parseUrl('s3://bucket/key')).toMatchObject({ protocol: 's3:', host: 'bucket', path: '/key' });
    expect(parseUrl('git+ssh://git@example.com/repo.git')).toMatchObject({
      protocol: 'git+ssh:',
      host: 'git@example.com',
      path: '/repo.git',
    });
  });

  // Defect: user name and password were dropped, so the rebuilt URL lost them.
  test('keeps credentials in the host', () => {
    expect(parseUrl('https://user:p%40ss@example.com:8443/x').host).toBe('user:p%40ss@example.com:8443');
    expect(parseUrl('ftp://anonymous@ftp.example.com/').host).toBe('anonymous@ftp.example.com');
  });

  // Defect: input the URL class rejects went to a hand-written parser that
  // called decodeURIComponent on the query and threw on a stray "%", which
  // crashed the tool while typing.
  test('never throws on malformed input', () => {
    for (const input of ['https://a b?x=%', 'http://', '://?x=%', 'http://[::1/?a=%zz', '%', 'a b c', 'https://exa mple.com/?q=100%&r=%E0']) {
      expect(() => parseUrl(input), input).not.toThrow();
    }
    const parts = parseUrl('https://a b/c d?x=%&y=1#frag#ment');
    expect(parts).toMatchObject({ protocol: 'https:', host: 'a b', path: '/c d', hash: '#frag#ment' });
    expect(pairs(parts)).toEqual([
      ['x', '%'],
      ['y', '1'],
    ]);
  });

  // Defect: "mailto:someone@example.com" became host "example.com" with user name "mailto".
  test('reads a scheme written without "//" as a path, not as a host', () => {
    const mail = parseUrl('mailto:someone@example.com?subject=Hello%20there&cc=a@b.test#top');
    expect(mail).toMatchObject({ protocol: 'mailto:', host: '', path: 'someone@example.com', hash: '#top' });
    expect(pairs(mail)).toEqual([
      ['subject', 'Hello there'],
      ['cc', 'a@b.test'],
    ]);

    expect(parseUrl('TEL:+15551234567')).toMatchObject({ protocol: 'tel:', host: '', path: '+15551234567' });
    expect(parseUrl('urn:isbn:0451450523')).toMatchObject({ protocol: 'urn:', host: '', path: 'isbn:0451450523' });
    expect(parseUrl('mailto:')).toMatchObject({ protocol: 'mailto:', host: '', path: '' });
  });

  test('still reads host:port and user:password@host as a host', () => {
    expect(parseUrl('localhost:8080/a')).toMatchObject({ protocol: '', host: 'localhost:8080', path: '/a' });
    expect(parseUrl('user:pw@example.com/a')).toMatchObject({ protocol: '', host: 'user:pw@example.com', path: '/a' });
  });

  test('gives a host a root path, and a hash of just "#" no hash', () => {
    expect(parseUrl('https://example.com').path).toBe('/');
    expect(parseUrl('https://a b').path).toBe('/');
    expect(parseUrl('https://example.com/#').hash).toBe('');
  });
});

test.describe('buildUrl', () => {
  test('puts the parts back together', () => {
    expect(
      buildUrl({
        protocol: 'https:',
        host: 'example.com',
        path: '/api/search',
        hash: '#results',
        params: [
          { key: 'q', value: 'query' },
          { key: 'limit', value: '10' },
        ],
      })
    ).toBe('https://example.com/api/search?q=query&limit=10#results');
  });

  test('accepts the protocol with or without its colon and slashes', () => {
    for (const protocol of ['http', 'http:', 'http://']) {
      expect(buildUrl({ ...EMPTY, protocol, host: 'a.test', path: '/' })).toBe('http://a.test/');
    }
  });

  test('defaults to https for a host without a protocol', () => {
    expect(buildUrl({ ...EMPTY, host: 'example.com', path: '/x' })).toBe('https://example.com/x');
  });

  test('skips disabled parameters and blank keys, and form-encodes the rest', () => {
    expect(
      buildUrl({
        ...EMPTY,
        protocol: 'https:',
        host: 'a.test',
        path: '/',
        params: [
          { key: 'q', value: 'hello world & more', enabled: true },
          { key: 'off', value: '1', enabled: false },
          { key: '  ', value: 'blank key' },
          { key: 'redirect', value: 'https://b.test/?x=1' },
          { key: 'ü', value: '' },
        ],
      })
    ).toBe('https://a.test/?q=hello+world+%26+more&redirect=https%3A%2F%2Fb.test%2F%3Fx%3D1&%C3%BC=');
  });

  test('adds the "#" a hash is missing', () => {
    expect(buildUrl({ ...EMPTY, host: 'a.test', path: '/', hash: 'top' })).toBe('https://a.test/#top');
    expect(buildUrl({ ...EMPTY, host: 'a.test', path: '/', hash: '#top' })).toBe('https://a.test/#top');
  });

  // Defect: with nothing entered the tool showed the rebuilt URL "https:///".
  test('builds nothing from nothing, even with the default protocol filled in', () => {
    expect(buildUrl(EMPTY)).toBe('');
    expect(buildUrl({ ...EMPTY, protocol: 'https:' })).toBe('');
  });

  // Defect: a relative reference was rebuilt as "https:///api/search".
  test('builds a relative reference when there is no host', () => {
    expect(buildUrl({ ...EMPTY, path: '/api/search', params: [{ key: 'q', value: '1' }] })).toBe('/api/search?q=1');
    expect(buildUrl({ ...EMPTY, protocol: 'https:', path: '/api/search' })).toBe('/api/search');
    expect(buildUrl({ ...EMPTY, params: [{ key: 'page', value: '2' }] })).toBe('?page=2');
  });

  test('keeps a scheme that works without a host', () => {
    expect(buildUrl({ ...EMPTY, protocol: 'file:', path: '/C:/Users/me/a.txt' })).toBe('file:///C:/Users/me/a.txt');
  });

  test('writes mailto: and the like without "//"', () => {
    const base = { ...EMPTY, path: 'someone@example.com', params: [{ key: 'subject', value: 'Hello there' }] };
    for (const protocol of ['mailto:', 'mailto', 'mailto://']) {
      expect(buildUrl({ ...base, protocol }), protocol).toBe('mailto:someone@example.com?subject=Hello+there');
    }
    expect(buildUrl({ ...EMPTY, protocol: 'tel:', path: '+15551234567' })).toBe('tel:+15551234567');
    // With a host the usual form is kept.
    expect(buildUrl({ ...EMPTY, protocol: 'mailto:', host: 'example.com', path: '/x' })).toBe('mailto://example.com/x');
  });

  test('separates the host from a path typed without its slash', () => {
    expect(buildUrl({ ...EMPTY, protocol: 'https:', host: 'example.com', path: 'search' })).toBe(
      'https://example.com/search'
    );
  });
});

test.describe('parseUrl then buildUrl', () => {
  test('reproduces well-formed URLs', () => {
    for (const url of [
      'https://example.com/api/search?q=query&limit=10#results',
      'http://localhost:3000/',
      'https://user:pw@example.com:8443/a/b?x=1&x=2',
      's3://bucket/key',
      'file:///C:/Users/me/a.txt',
      'mailto:someone@example.com?subject=Hello',
      'tel:+15551234567',
      '/api/search?q=1#top',
      '?page=2',
      '#top',
    ]) {
      expect(buildUrl(parseUrl(url)), url).toBe(url);
    }
  });

  test('normalises what the browser would normalise', () => {
    expect(buildUrl(parseUrl('example.com'))).toBe('https://example.com/');
    expect(buildUrl(parseUrl('HTTPS://Example.COM:443/a/../b?q=a b'))).toBe('https://example.com/b?q=a+b');
  });
});
