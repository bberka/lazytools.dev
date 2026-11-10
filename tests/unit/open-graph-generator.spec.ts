import { test, expect } from '@playwright/test';
import {
  checkFields,
  displayHost,
  EMPTY_OG_FIELDS,
  escapeAttribute,
  generateMetaTags,
  lengthHint,
  normalizeHandle,
  type OpenGraphFields,
} from '@/lib/tools/open-graph-generator';

const fields = (overrides: Partial<OpenGraphFields>): OpenGraphFields => ({ ...EMPTY_OG_FIELDS, ...overrides });

test.describe('escapeAttribute', () => {
  test('escapes the characters that break a double-quoted attribute', () => {
    expect(escapeAttribute(`Tom & "Jerry" <b>it's</b>`)).toBe('Tom &amp; &quot;Jerry&quot; &lt;b&gt;it&#39;s&lt;/b&gt;');
  });

  test('escapes an ampersand first so entities are not doubled', () => {
    expect(escapeAttribute('a &amp; b')).toBe('a &amp;amp; b');
  });

  test('leaves plain and non-ASCII text alone', () => {
    expect(escapeAttribute('Café ☕ 日本')).toBe('Café ☕ 日本');
  });
});

test.describe('generateMetaTags', () => {
  test('writes the tags for a full set of fields in order', () => {
    const tags = generateMetaTags(
      fields({
        title: 'LazyTools',
        description: 'Fast, private tools.',
        url: 'https://lazytools.dev/',
        image: 'https://lazytools.dev/og.png',
        imageAlt: 'The LazyTools home page',
        siteName: 'LazyTools',
        type: 'article',
        locale: 'en_US',
        twitterCard: 'summary_large_image',
        twitterSite: 'lazytools',
        twitterCreator: '@@berk',
      })
    );
    expect(tags.split('\n')).toEqual([
      '<meta property="og:title" content="LazyTools" />',
      '<meta property="og:type" content="article" />',
      '<meta property="og:url" content="https://lazytools.dev/" />',
      '<meta property="og:image" content="https://lazytools.dev/og.png" />',
      '<meta property="og:image:alt" content="The LazyTools home page" />',
      '<meta property="og:description" content="Fast, private tools." />',
      '<meta property="og:site_name" content="LazyTools" />',
      '<meta property="og:locale" content="en_US" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      '<meta name="twitter:site" content="@lazytools" />',
      '<meta name="twitter:creator" content="@berk" />',
      '<meta name="twitter:image:alt" content="The LazyTools home page" />',
    ]);
  });

  test('leaves out empty fields but always has a type and card', () => {
    expect(generateMetaTags(fields({ title: 'Hi' })).split('\n')).toEqual([
      '<meta property="og:title" content="Hi" />',
      '<meta property="og:type" content="website" />',
      '<meta name="twitter:card" content="summary_large_image" />',
    ]);
  });

  test('escapes values and collapses line breaks', () => {
    const tags = generateMetaTags(fields({ title: 'A "quoted" & <odd>\ntitle', description: '  two\n\n  lines  ' }));
    expect(tags).toContain('content="A &quot;quoted&quot; &amp; &lt;odd&gt; title"');
    expect(tags).toContain('<meta property="og:description" content="two lines" />');
  });

  test('keeps the image alt text out when there is no image', () => {
    const tags = generateMetaTags(fields({ imageAlt: 'orphan alt' }));
    expect(tags).not.toContain('alt');
  });

  test('ignores fields that hold only whitespace', () => {
    expect(generateMetaTags(fields({ title: '   ', description: '\n' }))).toBe(
      '<meta property="og:type" content="website" />\n<meta name="twitter:card" content="summary_large_image" />'
    );
  });
});

test.describe('normalizeHandle', () => {
  test('adds one @ and trims', () => {
    expect(normalizeHandle('berk')).toBe('@berk');
    expect(normalizeHandle(' @@berk ')).toBe('@berk');
    expect(normalizeHandle('')).toBe('');
    expect(normalizeHandle('@')).toBe('');
  });
});

test.describe('lengthHint', () => {
  test('counts up to the limit as ok and beyond it as over', () => {
    expect(lengthHint('', 60)).toEqual({ count: 0, limit: 60, state: 'empty' });
    expect(lengthHint('a'.repeat(60), 60)).toEqual({ count: 60, limit: 60, state: 'ok' });
    expect(lengthHint('a'.repeat(61), 60)).toEqual({ count: 61, limit: 60, state: 'over' });
    expect(lengthHint('a'.repeat(155), 155).state).toBe('ok');
    expect(lengthHint('a'.repeat(156), 155).state).toBe('over');
  });

  test('counts an emoji as one character and ignores extra space', () => {
    expect(lengthHint('😀😀', 10).count).toBe(2);
    expect(lengthHint('  a   b \n c ', 10).count).toBe(5);
  });
});

test.describe('checkFields', () => {
  test('is quiet for good fields', () => {
    expect(
      checkFields(fields({ title: 'T', url: 'https://a.test/', image: 'http://a.test/i.png', locale: 'en_US' }))
    ).toEqual([]);
    expect(checkFields(fields({ title: 'T', locale: 'en' }))).toEqual([]);
  });

  test('warns about relative URLs, odd locales and a missing title', () => {
    expect(checkFields(fields({ url: '/about', image: 'img/x.png', locale: 'en-us' }))).toEqual([
      'The page URL should be absolute, starting with http:// or https://.',
      'The image URL should be absolute, starting with http:// or https://.',
      'The locale looks like en or en_US (language, then an optional _REGION).',
      'Add a title: og:title is the one tag every site expects.',
    ]);
  });

  test('rejects URLs with other schemes', () => {
    expect(checkFields(fields({ title: 'T', url: 'javascript:alert(1)' }))).toHaveLength(1);
    expect(checkFields(fields({ title: 'T', image: 'ftp://a.test/x.png' }))).toHaveLength(1);
  });
});

test.describe('displayHost', () => {
  test('returns the host without www', () => {
    expect(displayHost('https://www.lazytools.dev/tools/x')).toBe('lazytools.dev');
    expect(displayHost(' http://sub.example.com:8080/a ')).toBe('sub.example.com');
    expect(displayHost('not a url')).toBe('');
    expect(displayHost('')).toBe('');
  });
});
