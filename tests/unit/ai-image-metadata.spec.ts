import { test, expect } from '@playwright/test';
import { scanImageMetadata, stripImageMetadata } from '@/lib/tools/ai-image-metadata';

// ── Fixture builders ─────────────────────────────────────────────────────────

const enc = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0));
const concat = (...parts: ArrayLike<number>[]): Uint8Array => Uint8Array.from(parts.flatMap((part) => Array.from(part)));
const u32be = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const u32le = (value: number) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: ArrayLike<number>): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// JPEG: SOI, optional segments, a baseline frame header, a scan with stuffed bytes and a restart marker, EOI.
const jpegSegment = (marker: number, payload: ArrayLike<number>) => concat([0xff, marker], [(payload.length + 2) >> 8, (payload.length + 2) & 255], payload);
const SCAN = concat([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00], [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78]);
const SOF = jpegSegment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]);
const JFIF = jpegSegment(0xe0, [...enc('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const ICC_APP2 = jpegSegment(0xe2, [...enc('ICC_PROFILE'), 0, 1, 1, 9, 9, 9, 9]);
// The EOI comes after a fill byte, which is legal and must not end the scan early.
const jpeg = (...segments: Uint8Array[]) => concat([0xff, 0xd8], ...segments, SOF, SCAN, [0xff, 0xff, 0xd9]);
const JPEG_BASE = jpeg(JFIF, ICC_APP2);

const exifApp1 = (body: readonly number[] = enc('Software\0Stable Diffusion')) =>
  jpegSegment(0xe1, [...enc('Exif'), 0, 0, ...enc('MM'), 0, 42, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, ...body]);
const xmpApp1 = (xml: string) => jpegSegment(0xe1, [...enc('http://ns.adobe.com/xap/1.0/'), 0, ...enc(xml)]);
const c2paApp11 = jpegSegment(0xeb, [...enc('JP'), 0, 1, 0, 0, 0, 1, ...u32be(40), ...enc('jumb'), ...enc('c2pa.claim')]);
const iptcApp13 = jpegSegment(0xed, [...enc('Photoshop 3.0'), 0, ...enc('8BIM'), 4, 4, 0, 0]);
const comment = (text: string) => jpegSegment(0xfe, enc(text));

// PNG
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const chunk = (type: string, data: ArrayLike<number> = []) => {
  const body = concat(enc(type), data);
  return concat(u32be(data.length), body, u32be(crc32(body)));
};
const IHDR = chunk('IHDR', [...u32be(1), ...u32be(1), 8, 6, 0, 0, 0]);
const IDAT = chunk('IDAT', [0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0xf8, 0x0f, 0x00, 0x01, 0x01, 0x01, 0x00]);
const ICCP = chunk('iCCP', [...enc('sRGB'), 0, 0, 1, 2, 3, 4]);
const IEND = chunk('IEND');
const png = (...chunks: Uint8Array[]) => concat(SIGNATURE, IHDR, ...chunks, IDAT, IEND);
const text = (keyword: string, value: string) => chunk('tEXt', [...enc(keyword), 0, ...enc(value)]);

// WebP
const riffChunk = (type: string, data: ArrayLike<number>) => concat(enc(type), u32le(data.length), data, data.length & 1 ? [0] : []);
const VP8 = riffChunk('VP8L', [0x2f, 0, 0, 0, 0, 1, 2]);
const webp = (flags: number, ...chunks: Uint8Array[]) => {
  const vp8x = riffChunk('VP8X', [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const body = concat(enc('WEBP'), vp8x, ...chunks, VP8);
  return concat(enc('RIFF'), u32le(body.length), body);
};

const sameBytes = (a: Uint8Array, b: Uint8Array) => expect(Array.from(a)).toEqual(Array.from(b));

// ── JPEG ─────────────────────────────────────────────────────────────────────

test.describe('JPEG', () => {
  test('an image without metadata is reported clean and returned unchanged', () => {
    const result = stripImageMetadata(JPEG_BASE);
    expect(result.format).toBe('jpeg');
    expect(result.changed).toBe(false);
    expect(result.verified).toBe(true);
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual(['ICC colour profile']);
    sameBytes(result.bytes, JPEG_BASE);
  });

  test('removes APP1 EXIF and XMP, APP11 C2PA, APP13 Photoshop and COM, byte for byte', () => {
    const input = jpeg(
      JFIF,
      exifApp1(),
      xmpApp1('<x:xmpmeta Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/>'),
      ICC_APP2,
      c2paApp11,
      iptcApp13,
      comment('made with Midjourney')
    );
    const result = stripImageMetadata(input);

    expect(result.changed).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.removed.map((item) => [item.category, item.location])).toEqual([
      ['EXIF', 'JPEG APP1 (EXIF)'],
      ['XMP', 'JPEG APP1 (XMP)'],
      ['Content Credentials (C2PA)', 'JPEG APP11 (JUMBF)'],
      ['IPTC / Photoshop', 'JPEG APP13 (Photoshop)'],
      ['Comment', 'JPEG COM'],
    ]);
    expect(result.signals).toEqual(
      expect.arrayContaining(['Stable Diffusion', 'DigitalSourceType: trainedAlgorithmicMedia', 'C2PA', 'Midjourney'])
    );
    // Exactly the original file with the five segments cut out: JFIF, ICC, frame header and scan data are identical.
    sameBytes(result.bytes, JPEG_BASE);
    expect(result.cleanedSize).toBe(JPEG_BASE.length);
    expect(result.originalSize).toBe(input.length);
    expect(scanImageMetadata(result.bytes).findings).toEqual([]);
  });

  test('keeps APP2 ICC, APP14 Adobe and unknown APP1 blocks', () => {
    const adobe = jpegSegment(0xee, [...enc('Adobe'), 0, 100, 0, 0, 0, 0, 1]);
    const otherApp1 = jpegSegment(0xe1, enc('NotExif data'));
    const input = jpeg(JFIF, ICC_APP2, adobe, otherApp1);
    const result = stripImageMetadata(input);
    expect(result.changed).toBe(false);
    sameBytes(result.bytes, input);
  });

  test('labels a Stable Diffusion UserComment as generation parameters', () => {
    const utf16 = [...enc('UNICODE'), 0, ...Array.from('A cat\nSteps: 20, Sampler: Euler a').flatMap((char) => [0, char.charCodeAt(0)])];
    const scan = scanImageMetadata(jpeg(exifApp1(utf16)));
    expect(scan.findings).toHaveLength(1);
    expect(scan.findings[0].category).toBe('Generation prompt/parameters');
    expect(scan.signals).toContain('Stable Diffusion parameters');
  });

  test('warns when the EXIF block carries an Orientation tag', () => {
    // Big-endian TIFF, one IFD entry: tag 0x0112 (Orientation), SHORT, count 1, value 6.
    const withOrientation = jpegSegment(0xe1, [
      ...enc('Exif'), 0, 0, ...enc('MM'), 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0,
    ]);
    const result = stripImageMetadata(jpeg(withOrientation));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Orientation tag (6)');
  });

  test('stuffed zeros, restart markers and fill bytes in scan data do not end the scan', () => {
    // The shared SCAN holds 0xFF00, 0xFFD0 and the EOI follows a fill byte; the COM before it must still be found.
    const result = stripImageMetadata(jpeg(comment('hidden')));
    expect(result.removed).toHaveLength(1);
    sameBytes(result.bytes, jpeg());
  });

  test('a real marker inside scan data is read as a segment, and a bogus length leaves the file alone', () => {
    const bogus = concat([0xff, 0xd8], comment('hidden'), SOF, SCAN.subarray(0, 10), [0xff, 0xe1, 0xff, 0x00], [0xff, 0xd9]);
    const result = stripImageMetadata(bogus);
    expect(result.changed).toBe(false);
    sameBytes(result.bytes, bogus);
  });

  test('keeps trailing bytes after EOI untouched', () => {
    const result = stripImageMetadata(concat(jpeg(comment('x')), [1, 2, 3, 4]));
    sameBytes(result.bytes, concat(jpeg(), [1, 2, 3, 4]));
  });
});

// ── PNG ──────────────────────────────────────────────────────────────────────

test.describe('PNG', () => {
  test('removes text, iTXt, eXIf and caBX chunks and keeps iCCP and pixel data', () => {
    const itxt = chunk('iTXt', [...enc('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...enc('<x:xmpmeta>firefly</x:xmpmeta>')]);
    const input = png(
      ICCP,
      text('parameters', 'a cat, Steps: 20, Sampler: Euler a, CFG scale: 7'),
      text('prompt', '{"3": {"class_type": "KSampler"}}'),
      text('Software', 'ComfyUI'),
      chunk('zTXt', [...enc('Description'), 0, 0, 0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]),
      itxt,
      chunk('eXIf', [...enc('MM'), 0, 42, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0]),
      chunk('caBX', [...u32be(24), ...enc('jumbc2pa'), 0, 0, 0, 0])
    );
    const result = stripImageMetadata(input);

    expect(result.changed).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.removed.map((item) => [item.category, item.location])).toEqual([
      ['Generation prompt/parameters', 'PNG tEXt "parameters"'],
      ['Generation prompt/parameters', 'PNG tEXt "prompt"'],
      ['Generation prompt/parameters', 'PNG tEXt "Software"'],
      ['Text metadata', 'PNG zTXt "Description"'],
      ['XMP', 'PNG iTXt "XML:com.adobe.xmp"'],
      ['EXIF', 'PNG eXIf'],
      ['Content Credentials (C2PA)', 'PNG caBX'],
    ]);
    expect(result.removed[0].preview).toContain('Steps: 20');
    expect(result.signals).toEqual(expect.arrayContaining(['Stable Diffusion parameters', 'ComfyUI', 'Adobe Firefly', 'C2PA']));
    expect(result.kept).toEqual(['ICC colour profile']);
    sameBytes(result.bytes, png(ICCP));
    expect(scanImageMetadata(result.bytes).findings).toEqual([]);
  });

  test('a text chunk without any generator marker is still removed, labelled as plain text metadata', () => {
    const result = stripImageMetadata(png(text('Author', 'Someone')));
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].category).toBe('Text metadata');
    expect(result.removed[0].signals).toEqual([]);
  });

  test('a clean PNG is returned byte for byte', () => {
    const input = png(ICCP);
    const result = stripImageMetadata(input);
    expect(result.changed).toBe(false);
    expect(result.verified).toBe(true);
    sameBytes(result.bytes, input);
  });
});

// ── WebP ─────────────────────────────────────────────────────────────────────

test.describe('WebP', () => {
  test('removes EXIF, XMP and C2PA chunks, fixes the RIFF size and clears the VP8X flags', () => {
    const iccp = riffChunk('ICCP', [1, 2, 3, 4, 5]);
    const input = webp(
      0x20 | 0x08 | 0x04,
      iccp,
      riffChunk('EXIF', [...enc('MM'), 0, 42, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, ...enc('Midjourney')]),
      riffChunk('XMP ', enc('<x:xmpmeta>trainedAlgorithmicMedia</x:xmpmeta>')),
      riffChunk('C2PA', enc('jumbc2pa!'))
    );
    const result = stripImageMetadata(input);

    expect(result.changed).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.removed.map((item) => item.category)).toEqual(['EXIF', 'XMP', 'Content Credentials (C2PA)']);
    expect(result.kept).toEqual(['ICC colour profile']);
    // The expected file is built from scratch with the ICC flag only.
    sameBytes(result.bytes, webp(0x20, iccp));
    expect(scanImageMetadata(result.bytes).findings).toEqual([]);
  });

  test('clears the XMP flag when the XMP chunk goes together with a C2PA chunk', () => {
    const xmp = riffChunk('XMP ', enc('<x/>'));
    const input = webp(0x04, xmp, riffChunk('C2PA', enc('abc')));
    const result = stripImageMetadata(input);
    sameBytes(result.bytes, webp(0));
  });

  test('a clean WebP is returned byte for byte', () => {
    const input = webp(0);
    const result = stripImageMetadata(input);
    expect(result.changed).toBe(false);
    sameBytes(result.bytes, input);
  });
});

// ── Damaged and foreign input ────────────────────────────────────────────────

test.describe('damaged input', () => {
  const full = [
    ['JPEG', jpeg(exifApp1(), comment('x'))],
    ['PNG', png(text('parameters', 'Steps: 20, Sampler: Euler'))],
    ['WebP', webp(0x08, riffChunk('EXIF', enc('MM\0*abcdefgh')))],
  ] as const;

  for (const [name, bytes] of full) {
    test(`${name}: every truncation is returned unchanged with a message and never throws`, () => {
      for (let length = 0; length < bytes.length; length++) {
        const cut = bytes.subarray(0, length);
        const result = stripImageMetadata(cut);
        expect(result.changed).toBe(false);
        sameBytes(result.bytes, cut);
        expect(result.message).not.toBe('');
        expect(() => scanImageMetadata(cut)).not.toThrow();
      }
    });

    test(`${name}: a corrupted length field is returned unchanged`, () => {
      const broken = Uint8Array.from(bytes);
      // Make the first segment, chunk or RIFF size claim far more than the file holds.
      broken[name === 'JPEG' ? 4 : name === 'PNG' ? 8 : 5] = 0xff;
      const result = stripImageMetadata(broken);
      expect(result.changed).toBe(false);
      sameBytes(result.bytes, broken);
    });
  }

  test('garbage, empty and foreign files are returned unchanged', () => {
    const inputs = [new Uint8Array(0), Uint8Array.from([1, 2, 3]), Uint8Array.from(enc('GIF89a....')), Uint8Array.from({ length: 500 }, (_, i) => (i * 37) & 255)];
    for (const input of inputs) {
      const result = stripImageMetadata(input);
      expect(result.changed).toBe(false);
      expect(result.verified).toBe(false);
      expect(result.format === null || typeof result.format === 'string').toBe(true);
      expect(result.message).toContain('left unchanged');
      sameBytes(result.bytes, input);
    }
  });

  test('a JPEG missing its EOI marker is left alone', () => {
    const input = concat([0xff, 0xd8], comment('x'), SOF, SCAN);
    const result = stripImageMetadata(input);
    expect(result.changed).toBe(false);
    expect(result.message).toContain('cut short');
  });
});
