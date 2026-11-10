import { test, expect } from '@playwright/test';
import {
  MIME_CATEGORIES,
  MIME_ENTRIES,
  MIME_TYPE_PATTERN,
  contentTypeHeader,
  countByCategory,
  extensionOf,
  lookupByExtension,
  lookupByType,
  normalizeMimeType,
  searchMimeTypes,
} from '@/lib/tools/mime-types';

test.describe('known pairs', () => {
  const pairs: Array<[string, string]> = [
    ['json', 'application/json'],
    ['webp', 'image/webp'],
    ['wasm', 'application/wasm'],
    ['svg', 'image/svg+xml'],
    ['mjs', 'text/javascript'],
    ['js', 'text/javascript'],
    ['woff2', 'font/woff2'],
    ['woff', 'font/woff'],
    ['html', 'text/html'],
    ['css', 'text/css'],
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['gif', 'image/gif'],
    ['avif', 'image/avif'],
    ['ico', 'image/vnd.microsoft.icon'],
    ['pdf', 'application/pdf'],
    ['zip', 'application/zip'],
    ['gz', 'application/gzip'],
    ['mp4', 'video/mp4'],
    ['webm', 'video/webm'],
    ['mp3', 'audio/mpeg'],
    ['txt', 'text/plain'],
    ['csv', 'text/csv'],
    ['xml', 'application/xml'],
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['epub', 'application/epub+zip'],
    ['webmanifest', 'application/manifest+json'],
    ['bin', 'application/octet-stream'],
    ['ttf', 'font/ttf'],
    ['otf', 'font/otf'],
  ];

  for (const [ext, type] of pairs) {
    test(`.${ext} is ${type}`, () => {
      expect(lookupByExtension(ext)?.type).toBe(type);
    });
  }
});

test.describe('data integrity', () => {
  test('has about 150 entries', () => {
    expect(MIME_ENTRIES.length).toBeGreaterThanOrEqual(150);
    expect(MIME_ENTRIES.length).toBeLessThanOrEqual(200);
  });

  test('no duplicate extension', () => {
    const exts = MIME_ENTRIES.map((entry) => entry.ext);
    expect(exts.filter((ext, index) => exts.indexOf(ext) !== index)).toEqual([]);
  });

  test('sorted by extension', () => {
    const exts = MIME_ENTRIES.map((entry) => entry.ext);
    expect(exts).toEqual([...exts].sort());
  });

  test('extensions are lowercase, without a dot or a space', () => {
    for (const entry of MIME_ENTRIES) expect(entry.ext, entry.ext).toMatch(/^[a-z0-9]+$/);
  });

  test('every type is lowercase and in type/subtype form', () => {
    for (const entry of MIME_ENTRIES) {
      expect(entry.type, entry.ext).toBe(entry.type.toLowerCase());
      expect(entry.type, entry.ext).toMatch(MIME_TYPE_PATTERN);
    }
  });

  test('every category exists and every category is used', () => {
    const known = MIME_CATEGORIES.map((category) => category.id);
    for (const entry of MIME_ENTRIES) expect(known, entry.ext).toContain(entry.category);
    const counts = countByCategory(MIME_ENTRIES);
    for (const id of known) expect(counts[id], id).toBeGreaterThan(0);
  });

  test('categories agree with the top-level type for media', () => {
    const topLevel = { image: 'image/', audio: 'audio/', video: 'video/' } as const;
    for (const entry of MIME_ENTRIES) {
      if (entry.category === 'image' || entry.category === 'audio') {
        expect(entry.type.startsWith(topLevel[entry.category]), entry.ext).toBe(true);
      }
    }
    for (const entry of MIME_ENTRIES.filter((e) => e.type.startsWith('font/'))) expect(entry.category).toBe('font');
  });

  test('notes are short sentences', () => {
    for (const entry of MIME_ENTRIES) {
      if (entry.note) {
        expect(entry.note.length, entry.ext).toBeLessThan(120);
        expect(entry.note.endsWith('.'), entry.ext).toBe(true);
      }
    }
  });
});

test.describe('extensionOf', () => {
  test('accepts a bare extension, a dotted one, a glob and a file name', () => {
    expect(extensionOf('png')).toBe('png');
    expect(extensionOf('.PNG')).toBe('png');
    expect(extensionOf('*.png')).toBe('png');
    expect(extensionOf('photo.final.JPG')).toBe('jpg');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
    expect(extensionOf('  .json  ')).toBe('json');
  });

  test('a trailing dot or nothing gives no extension', () => {
    expect(extensionOf('file.')).toBe('');
    expect(extensionOf('')).toBe('');
    expect(extensionOf('   ')).toBe('');
  });
});

test.describe('lookups', () => {
  test('by file name', () => {
    expect(lookupByExtension('index.HTML')?.type).toBe('text/html');
    expect(lookupByExtension('.WebP')?.type).toBe('image/webp');
    expect(lookupByExtension('app.min.mjs')?.type).toBe('text/javascript');
  });

  test('unknown and empty give undefined', () => {
    expect(lookupByExtension('nope')).toBeUndefined();
    expect(lookupByExtension('')).toBeUndefined();
    expect(lookupByExtension('constructor')).toBeUndefined();
    expect(lookupByExtension('toString')).toBeUndefined();
  });

  test('normalizeMimeType drops parameters and case', () => {
    expect(normalizeMimeType('Text/HTML; charset=UTF-8')).toBe('text/html');
    expect(normalizeMimeType('  image/png ')).toBe('image/png');
  });

  test('by type returns every extension, in table order', () => {
    expect(lookupByType('image/jpeg').map((entry) => entry.ext)).toEqual(['jpe', 'jpeg', 'jpg']);
    expect(lookupByType('TEXT/JAVASCRIPT; charset=utf-8').map((entry) => entry.ext)).toEqual(['cjs', 'js', 'mjs']);
    expect(lookupByType('application/x-nothing')).toEqual([]);
    expect(lookupByType('')).toEqual([]);
  });

  test('the Content-Type header line', () => {
    expect(contentTypeHeader(lookupByExtension('svg')!)).toBe('Content-Type: image/svg+xml');
  });
});

test.describe('searchMimeTypes', () => {
  const exts = (text: string, category?: Parameters<typeof searchMimeTypes>[1]) =>
    searchMimeTypes(text, category).map((entry) => entry.ext);

  test('empty text lists everything, filtered by category', () => {
    expect(searchMimeTypes('')).toHaveLength(MIME_ENTRIES.length);
    expect(searchMimeTypes('   ')).toHaveLength(MIME_ENTRIES.length);
    expect(exts('', 'font')).toEqual(['eot', 'otf', 'ttc', 'ttf', 'woff', 'woff2']);
  });

  test('an exact extension comes first, with or without a dot', () => {
    expect(exts('png')[0]).toBe('png');
    expect(exts('.png')[0]).toBe('png');
    expect(exts('photo.PNG')[0]).toBe('png');
    expect(exts('json')[0]).toBe('json');
  });

  test('a prefix of the extension matches, ahead of a mere substring of the type', () => {
    const results = exts('jp');
    expect(results.slice(0, 4)).toEqual(['jp2', 'jpe', 'jpeg', 'jpg']);
  });

  test('a full type matches every extension that uses it', () => {
    expect(exts('image/jpeg')).toEqual(['jpe', 'jpeg', 'jpg']);
    expect(exts('IMAGE/SVG+XML')).toEqual(['svg', 'svgz']);
  });

  test('a type prefix lists the family', () => {
    const results = searchMimeTypes('font/');
    expect(results.map((entry) => entry.ext)).toEqual(['otf', 'ttc', 'ttf', 'woff', 'woff2']);
    expect(searchMimeTypes('image/', 'audio')).toEqual([]);
  });

  test('a piece of a type matches anywhere in it', () => {
    expect(exts('openxmlformats')).toEqual(['docx', 'pptx', 'xlsx']);
    expect(exts('+xml')).toContain('svg');
    expect(exts('+xml')).toContain('atom');
  });

  test('the category filter narrows the matches', () => {
    // extension prefixes first, then types that merely contain "mp" (video/mp2t, application/vnd.apple.mpegurl)
    expect(exts('mp', 'video')).toEqual(['mp4', 'mpeg', 'mpg', 'm3u8', 'ts']);
    expect(exts('mp', 'audio').slice(0, 2)).toEqual(['mp2', 'mp3']);
    expect(exts('woff2', 'image')).toEqual([]);
  });

  test('notes can be searched', () => {
    expect(exts('typescript')).toEqual(['ts']);
    expect(exts('hls')).toEqual(['m3u8']);
  });

  test('no match gives an empty list', () => {
    expect(searchMimeTypes('zzzzzz')).toEqual([]);
  });

  test('a Content-Type value with parameters finds the type', () => {
    expect(exts('text/html; charset=utf-8')).toEqual(['htm', 'html']);
  });
});

test.describe('countByCategory', () => {
  test('counts add up to the number of entries', () => {
    const counts = countByCategory(MIME_ENTRIES);
    expect(Object.values(counts).reduce((sum, value) => sum + value, 0)).toBe(MIME_ENTRIES.length);
    expect(counts.font).toBe(6);
  });

  test('counts follow the given list', () => {
    expect(countByCategory(searchMimeTypes('image/jpeg')).image).toBe(3);
    expect(countByCategory([]).image).toBe(0);
  });
});
