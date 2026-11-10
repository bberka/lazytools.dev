import { test, expect } from '@playwright/test';
import {
  IMAGE_TYPES,
  analyzeImage,
  buildDataUrl,
  dataUrlMimeFor,
  decodeBase64,
  detectImageType,
  downloadFileName,
  encodeBase64,
  hexPreview,
  normalizeMime,
  parseImageInput,
} from '@/lib/tools/base64-image';

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_B64 = 'iVBORw0KGgo=';
const JPEG_B64 = '/9j/4A==';
const GIF_B64 = 'R0lGODlh'; // "GIF89a"

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const u8 = (...values: number[]) => Uint8Array.from(values);
const pad = (head: number[], length: number) =>
  Uint8Array.from([...head, ...new Array(Math.max(0, length - head.length)).fill(0)]);

function okParse(text: string) {
  const result = parseImageInput(text);
  if (!result.ok) throw new Error(`expected success, got: ${result.error}`);
  return result;
}

function errorOf(text: string) {
  const result = parseImageInput(text);
  if (result.ok) throw new Error('expected an error');
  return result.error;
}

test.describe('detectImageType', () => {
  test('PNG, JPEG and GIF signatures', () => {
    expect(detectImageType(u8(...PNG_HEAD))?.kind).toBe('png');
    expect(detectImageType(u8(0xff, 0xd8, 0xff, 0xe0))?.kind).toBe('jpeg');
    expect(detectImageType(u8(...ascii('GIF87a')))?.kind).toBe('gif');
    expect(detectImageType(u8(...ascii('GIF89a')))?.kind).toBe('gif');
  });

  test('WebP needs RIFF and WEBP at their places', () => {
    const webp = u8(...ascii('RIFF'), 0x1a, 0, 0, 0, ...ascii('WEBPVP8L'));
    expect(detectImageType(webp)?.kind).toBe('webp');
    const wave = u8(...ascii('RIFF'), 0x1a, 0, 0, 0, ...ascii('WAVEfmt '));
    expect(detectImageType(wave)).toBeNull();
  });

  test('AVIF by major brand and by compatible brand', () => {
    const major = u8(0, 0, 0, 0x1c, ...ascii('ftypavif'), 0, 0, 0, 0, ...ascii('mif1avif'));
    expect(detectImageType(major)?.kind).toBe('avif');
    const compatible = u8(0, 0, 0, 0x18, ...ascii('ftypmif1'), 0, 0, 0, 0, ...ascii('miafavif'));
    expect(detectImageType(compatible)?.kind).toBe('avif');
    const heic = u8(0, 0, 0, 0x18, ...ascii('ftypheic'), 0, 0, 0, 0, ...ascii('mif1heic'));
    expect(detectImageType(heic)).toBeNull();
    const mp4 = u8(0, 0, 0, 0x18, ...ascii('ftypisom'), 0, 0, 2, 0, ...ascii('isomiso2'));
    expect(detectImageType(mp4)).toBeNull();
  });

  test('BMP needs "BM" and zeroed reserved fields', () => {
    expect(detectImageType(pad([...ascii('BM'), 0x46, 0, 0, 0, 0, 0, 0, 0], 30))?.kind).toBe('bmp');
    expect(detectImageType(pad([...ascii('BM'), 0x46, 0, 0, 0, 1, 0, 0, 0], 30))).toBeNull();
    expect(detectImageType(u8(...ascii('BMP')))).toBeNull();
  });

  test('ICO needs a directory with at least one image', () => {
    expect(detectImageType(pad([0, 0, 1, 0, 1, 0], 30))?.kind).toBe('ico');
    expect(detectImageType(pad([0, 0, 1, 0, 0, 0], 30))).toBeNull();
    expect(detectImageType(pad([0, 0, 2, 0, 1, 0], 30))).toBeNull(); // a cursor, not an icon
  });

  test('SVG with and without a prolog, a BOM, comments and a doctype', () => {
    const svg = (text: string) => detectImageType(new TextEncoder().encode(text))?.kind;
    expect(svg('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe('svg');
    expect(svg('  \n<svg\n width="1">')).toBe('svg');
    expect(
      svg('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    ).toBe('svg');
    expect(svg('﻿<svg/>')).toBe('svg');
    expect(
      svg(
        '<?xml version="1.0"?><!-- c --><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg/>'
      )
    ).toBe('svg');
    expect(svg('<SVG viewBox="0 0 1 1"/>')).toBe('svg');
  });

  test('text and markup that are not SVG are not images', () => {
    const detect = (text: string) => detectImageType(new TextEncoder().encode(text));
    expect(detect('hello')).toBeNull();
    expect(detect('<html><body><svg/></body></html>')).toBeNull();
    expect(detect('<svgfoo/>')).toBeNull();
    expect(detect('{"a":1}')).toBeNull();
    expect(detect('')).toBeNull();
  });

  test('short or empty input does not throw', () => {
    expect(detectImageType(new Uint8Array(0))).toBeNull();
    expect(detectImageType(u8(0x89))).toBeNull();
    expect(detectImageType(u8(0xff, 0xd8))).toBeNull();
  });

  test('type table is consistent', () => {
    expect(
      Object.values(IMAGE_TYPES)
        .map((type) => type.kind)
        .sort()
    ).toEqual(['avif', 'bmp', 'gif', 'ico', 'jpeg', 'png', 'svg', 'webp']);
    expect(IMAGE_TYPES.jpeg.extension).toBe('jpg');
    expect(IMAGE_TYPES.svg.mime).toBe('image/svg+xml');
  });
});

test.describe('decodeBase64', () => {
  test('decodes standard Base64 with padding', () => {
    const result = decodeBase64(PNG_B64);
    expect(result).toEqual({ ok: true, bytes: u8(...PNG_HEAD), notes: [] });
    expect(decodeBase64('QQ==')).toEqual({ ok: true, bytes: u8(0x41), notes: [] });
    expect(decodeBase64('QUI=')).toEqual({ ok: true, bytes: u8(0x41, 0x42), notes: [] });
    expect(decodeBase64('QUJD')).toEqual({ ok: true, bytes: u8(0x41, 0x42, 0x43), notes: [] });
  });

  test('adds missing padding and says so', () => {
    expect(decodeBase64('QQ')).toEqual({
      ok: true,
      bytes: u8(0x41),
      notes: ['Missing "=" padding was added.'],
    });
    expect(decodeBase64('QUI')).toEqual({
      ok: true,
      bytes: u8(0x41, 0x42),
      notes: ['Missing "=" padding was added.'],
    });
    expect(decodeBase64('iVBORw0KGgo')).toEqual({
      ok: true,
      bytes: u8(...PNG_HEAD),
      notes: ['Missing "=" padding was added.'],
    });
  });

  test('corrects wrong padding', () => {
    expect(decodeBase64('QQ=')).toEqual({
      ok: true,
      bytes: u8(0x41),
      notes: ['The "=" padding was corrected.'],
    });
    expect(decodeBase64('QUJD==')).toEqual({
      ok: true,
      bytes: u8(0x41, 0x42, 0x43),
      notes: ['The "=" padding was corrected.'],
    });
  });

  test('ignores whitespace and line breaks', () => {
    const result = decodeBase64('iVBO\r\nRw0K\n  Ggo=\t');
    expect(result).toEqual({
      ok: true,
      bytes: u8(...PNG_HEAD),
      notes: ['Whitespace and line breaks were ignored.'],
    });
  });

  test('accepts the URL-safe alphabet', () => {
    // 0xfb 0xff 0xfe is "+//+" in the standard alphabet and "-__-" in the URL-safe one
    expect(decodeBase64('+//+')).toEqual({ ok: true, bytes: u8(0xfb, 0xff, 0xfe), notes: [] });
    expect(decodeBase64('-__-')).toEqual({
      ok: true,
      bytes: u8(0xfb, 0xff, 0xfe),
      notes: ['Converted from the URL-safe alphabet.'],
    });
  });

  test('rejects a mix of the two alphabets', () => {
    const result = decodeBase64('+_-/');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('mixes the standard alphabet');
  });

  test('names the first bad character and its position', () => {
    expect(decodeBase64('QUJD!A==')).toEqual({
      ok: false,
      error: '"!" is not a Base64 character (position 5).',
    });
    expect(decodeBase64('QU JD\n$')).toEqual({
      ok: false,
      error: '"$" is not a Base64 character (position 5).',
    });
    expect(decodeBase64('café')).toEqual({
      ok: false,
      error: '"é" is not a Base64 character (position 4).',
    });
  });

  test('padding problems', () => {
    expect(decodeBase64('QQ=Q')).toEqual({
      ok: false,
      error: '"=" may only appear at the end of Base64 text.',
    });
    expect(decodeBase64('QQ===')).toEqual({
      ok: false,
      error: 'Base64 can end with at most two "=" characters.',
    });
  });

  test('a single leftover character is not decodable', () => {
    const result = decodeBase64('QUJDR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('5 characters leaves a single character over');
  });

  test('empty and whitespace-only input', () => {
    expect(decodeBase64('')).toEqual({ ok: false, error: 'There is nothing to decode.' });
    expect(decodeBase64(' \n\t')).toEqual({ ok: false, error: 'There is nothing to decode.' });
  });
});

test.describe('encodeBase64', () => {
  test('round trips and pads', () => {
    expect(encodeBase64(u8(0x41))).toBe('QQ==');
    expect(encodeBase64(u8(0x41, 0x42))).toBe('QUI=');
    expect(encodeBase64(u8(...PNG_HEAD))).toBe(PNG_B64);
    expect(encodeBase64(new Uint8Array(0))).toBe('');
  });

  test('handles input larger than one chunk', () => {
    const big = Uint8Array.from({ length: 100_000 }, (_, i) => i % 251);
    const back = decodeBase64(encodeBase64(big));
    expect(back.ok && back.bytes.length).toBe(100_000);
    expect(back.ok && back.bytes[99_999]).toBe(99_999 % 251);
    expect(encodeBase64(big)).toBe(Buffer.from(big).toString('base64'));
  });

  test('builds a data URL', () => {
    expect(buildDataUrl('image/png', PNG_B64)).toBe('data:image/png;base64,iVBORw0KGgo=');
  });
});

test.describe('parseImageInput with data URLs', () => {
  test('a complete data URL', () => {
    const result = okParse(`data:image/png;base64,${PNG_B64}`);
    expect(result.bytes).toEqual(u8(...PNG_HEAD));
    expect(result.declaredMime).toBe('image/png');
    expect(result.source).toBe('data-url');
    expect(result.notes).toEqual([]);
  });

  test('the scheme and the base64 flag are case-insensitive, parameters are allowed', () => {
    const result = okParse(`DATA:Image/PNG;charset=utf-8;BASE64,${PNG_B64}`);
    expect(result.declaredMime).toBe('image/png');
    expect(result.bytes).toEqual(u8(...PNG_HEAD));
  });

  test('a missing media type is not a declared type', () => {
    expect(okParse(`data:;base64,${PNG_B64}`).declaredMime).toBeNull();
    expect(okParse(`data:base64,${PNG_B64}`).declaredMime).toBeNull();
  });

  test('line breaks and percent-encoded padding inside the data', () => {
    const result = okParse('data:image/png;base64,iVBO\nRw0K\nGgo%3D');
    expect(result.bytes).toEqual(u8(...PNG_HEAD));
    expect(result.notes).toEqual(['Whitespace and line breaks were ignored.']);
  });

  test('a percent-encoded SVG without base64', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect fill="#f00" width="2" height="2"/></svg>';
    const result = okParse(`data:image/svg+xml,${encodeURIComponent(svg)}`);
    expect(new TextDecoder().decode(result.bytes)).toBe(svg);
    expect(result.declaredMime).toBe('image/svg+xml');
    expect(result.notes[0]).toContain('not Base64');
    expect(detectImageType(result.bytes)?.kind).toBe('svg');
  });

  test('non-ASCII characters in a non-Base64 payload become UTF-8', () => {
    const result = okParse('data:image/svg+xml,<svg><text>é😀</text></svg>');
    expect(new TextDecoder().decode(result.bytes)).toBe('<svg><text>é😀</text></svg>');
  });

  test('errors in the data URL itself', () => {
    expect(errorOf('data:image/png;base64')).toBe(
      'A data URL needs a comma between its header and its data.'
    );
    expect(errorOf('data:image/svg+xml,')).toBe('The data URL has no data after the comma.');
    expect(errorOf('data:image/svg+xml,%ZZ')).toBe(
      'The data URL contains an invalid percent escape (%XX).'
    );
    expect(errorOf('data:image/png;base64,@@@')).toBe(
      '"@" is not a Base64 character (position 1).'
    );
  });

  test('wrappers: url(), quotes, an img tag and CSS', () => {
    const url = `data:image/png;base64,${PNG_B64}`;
    for (const wrapped of [
      `url(${url})`,
      `url("${url}")`,
      `url( '${url}' )`,
      `"${url}"`,
      `'${url}'`,
      `<img src="${url}" alt="x">`,
      `background-image: url("${url}");`,
      `  \n${url}\n  `,
    ]) {
      const result = okParse(wrapped);
      expect(result.bytes, wrapped).toEqual(u8(...PNG_HEAD));
      expect(result.declaredMime, wrapped).toBe('image/png');
    }
    expect(okParse(`url("${url}")`).notes).toEqual([
      'The data URL was taken out of the surrounding text.',
    ]);
    expect(okParse(url).notes).toEqual([]);
  });

  test('a wrapped data URL may span lines', () => {
    const result = okParse('url("data:image/png;base64,iVBO\nRw0K\nGgo=")');
    expect(result.bytes).toEqual(u8(...PNG_HEAD));
  });
});

test.describe('parseImageInput with raw Base64', () => {
  test('bare Base64 has no declared type', () => {
    const result = okParse(PNG_B64);
    expect(result.declaredMime).toBeNull();
    expect(result.source).toBe('base64');
    expect(result.bytes).toEqual(u8(...PNG_HEAD));
  });

  test('quoted bare Base64', () => {
    expect(okParse(`"${PNG_B64}"`).bytes).toEqual(u8(...PNG_HEAD));
  });

  test('repairs are reported', () => {
    expect(okParse('/9j/4A').notes).toEqual(['Missing "=" padding was added.']);
    expect(okParse('_9j_4A').notes).toEqual([
      'Converted from the URL-safe alphabet.',
      'Missing "=" padding was added.',
    ]);
  });

  test('errors', () => {
    expect(errorOf('')).toBe('There is nothing to decode.');
    expect(errorOf('   ')).toBe('There is nothing to decode.');
    expect(errorOf('hello world!')).toBe('"!" is not a Base64 character (position 11).');
    expect(errorOf('not base64 at all: yes')).toContain('is not a Base64 character');
  });
});

test.describe('analyzeImage', () => {
  test('a correct declaration', () => {
    const analysis = analyzeImage(u8(...PNG_HEAD), 'image/png');
    expect(analysis.type?.mime).toBe('image/png');
    expect(analysis.mismatch).toBe(false);
  });

  test('a wrong declaration is overruled by the bytes', () => {
    const analysis = analyzeImage(u8(...PNG_HEAD), 'image/jpeg');
    expect(analysis.type?.kind).toBe('png');
    expect(analysis.declaredMime).toBe('image/jpeg');
    expect(analysis.mismatch).toBe(true);
  });

  test('a missing declaration is not a mismatch', () => {
    expect(analyzeImage(u8(0xff, 0xd8, 0xff, 0xe0), null).mismatch).toBe(false);
    expect(analyzeImage(u8(0xff, 0xd8, 0xff, 0xe0), null).type?.extension).toBe('jpg');
  });

  test('aliases of the right type are not mismatches', () => {
    expect(analyzeImage(u8(0xff, 0xd8, 0xff), 'image/jpg').mismatch).toBe(false);
    expect(analyzeImage(u8(0xff, 0xd8, 0xff), 'IMAGE/PJPEG').mismatch).toBe(false);
    expect(analyzeImage(pad([0, 0, 1, 0, 1, 0], 30), 'image/x-icon').mismatch).toBe(false);
    expect(
      analyzeImage(pad([...ascii('BM'), 0, 0, 0, 0, 0, 0, 0, 0], 30), 'image/x-ms-bmp').mismatch
    ).toBe(false);
  });

  test('not an image', () => {
    const analysis = analyzeImage(new TextEncoder().encode('Hello'), 'image/png');
    expect(analysis.type).toBeNull();
    expect(analysis.mismatch).toBe(false);
  });

  test('normalizeMime', () => {
    expect(normalizeMime('Image/PNG; charset=binary')).toBe('image/png');
    expect(normalizeMime('image/jpg')).toBe('image/jpeg');
    expect(normalizeMime('')).toBe('');
  });
});

test.describe('helpers', () => {
  test('hexPreview', () => {
    expect(hexPreview(new TextEncoder().encode('Hello, world'))).toBe('48 65 6c 6c 6f 2c 20 77');
    expect(hexPreview(u8(0, 1, 0xab), 8)).toBe('00 01 ab');
    expect(hexPreview(new Uint8Array(0))).toBe('');
  });

  test('downloadFileName uses the real extension', () => {
    expect(downloadFileName(IMAGE_TYPES.jpeg)).toBe('decoded-image.jpg');
    expect(downloadFileName(IMAGE_TYPES.svg)).toBe('decoded-image.svg');
    expect(downloadFileName(IMAGE_TYPES.webp)).toBe('decoded-image.webp');
  });

  test('dataUrlMimeFor prefers the bytes over the file label', () => {
    expect(dataUrlMimeFor(u8(...PNG_HEAD), 'image/jpeg')).toBe('image/png');
    expect(dataUrlMimeFor(u8(...ascii('GIF89a')), '')).toBe('image/gif');
    expect(dataUrlMimeFor(u8(1, 2, 3), 'image/tiff')).toBe('image/tiff');
    expect(dataUrlMimeFor(u8(1, 2, 3), '')).toBe('application/octet-stream');
  });

  test('the sample constants decode to the right types', () => {
    for (const [b64, kind] of [
      [PNG_B64, 'png'],
      [JPEG_B64, 'jpeg'],
      [GIF_B64, 'gif'],
    ] as const) {
      const decoded = decodeBase64(b64);
      expect(decoded.ok && detectImageType(decoded.bytes)?.kind).toBe(kind);
    }
  });
});
