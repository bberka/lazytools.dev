import { test, expect } from '@playwright/test';
import { parseExifSections, uniqueFileNames, type ExifSection } from '@/lib/tools/exif-viewer-remover';

// ── A tiny EXIF writer ────────────────────────────────────────────────────────
// Builds a JPEG that is nothing but an APP1 EXIF segment, in either byte
// order, so each test states exactly the tags it is about.

const TYPE = { BYTE: 1, ASCII: 2, SHORT: 3, LONG: 4, RATIONAL: 5, UNDEFINED: 7, SLONG: 9, SRATIONAL: 10 } as const;

interface Entry {
  tag: number;
  type: number;
  count: number;
  /** The value's bytes. Up to four sit in the entry; more are stored after the directory. */
  data: number[];
  /** Overrides where the entry says its value is, to describe a damaged file. */
  pointer?: number;
}

function writer(littleEndian: boolean) {
  const u16 = (value: number) => {
    const bytes = [value & 0xff, (value >>> 8) & 0xff];
    return littleEndian ? bytes : bytes.reverse();
  };
  const u32 = (value: number) => {
    const bytes = [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
    return littleEndian ? bytes : bytes.reverse();
  };

  return {
    u16,
    u32,
    ascii: (tag: number, text: string | number[]): Entry => {
      const data = [...(typeof text === 'string' ? new TextEncoder().encode(text) : text), 0];
      return { tag, type: TYPE.ASCII, count: data.length, data };
    },
    short: (tag: number, ...values: number[]): Entry => ({
      tag,
      type: TYPE.SHORT,
      count: values.length,
      data: values.flatMap(u16),
    }),
    rational: (tag: number, ...pairs: Array<[number, number]>): Entry => ({
      tag,
      type: TYPE.RATIONAL,
      count: pairs.length,
      data: pairs.flatMap(([numerator, denominator]) => [...u32(numerator), ...u32(denominator)]),
    }),
    srational: (tag: number, ...pairs: Array<[number, number]>): Entry => ({
      tag,
      type: TYPE.SRATIONAL,
      count: pairs.length,
      data: pairs.flatMap(([numerator, denominator]) => [...u32(numerator), ...u32(denominator)]),
    }),
    undefinedBytes: (tag: number, data: number[]): Entry => ({
      tag,
      type: TYPE.UNDEFINED,
      count: data.length,
      data,
    }),
  };
}

const padded = (length: number) => length + (length % 2);

function directorySize(entries: Entry[]): number {
  const stored = entries.filter((entry) => entry.data.length > 4 && entry.pointer === undefined);
  return 2 + entries.length * 12 + 4 + stored.reduce((sum, entry) => sum + padded(entry.data.length), 0);
}

function writeDirectory(entries: Entry[], start: number, littleEndian: boolean): number[] {
  const { u16, u32 } = writer(littleEndian);
  const directory = [...u16(entries.length)];
  const stored: number[] = [];
  let storedAt = start + 2 + entries.length * 12 + 4;

  for (const entry of entries) {
    directory.push(...u16(entry.tag), ...u16(entry.type), ...u32(entry.count));

    if (entry.pointer !== undefined) {
      directory.push(...u32(entry.pointer));
    } else if (entry.data.length <= 4) {
      directory.push(...entry.data, ...new Array<number>(4 - entry.data.length).fill(0));
    } else {
      directory.push(...u32(storedAt));
      stored.push(...entry.data, ...new Array<number>(padded(entry.data.length) - entry.data.length).fill(0));
      storedAt += padded(entry.data.length);
    }
  }

  return [...directory, 0, 0, 0, 0, ...stored];
}

interface ExifLayout {
  littleEndian?: boolean;
  image?: Entry[];
  exif?: Entry[];
  gps?: Entry[];
}

/** Offset of the TIFF block inside the files this writer makes. */
const TIFF_START = 12;

function jpegWithExif({ littleEndian = true, image = [], exif, gps }: ExifLayout): ArrayBuffer {
  const { u16, u32 } = writer(littleEndian);
  // The pointers to the two sub-directories; their targets are known once the sizes are.
  const exifPointer: Entry = { tag: 0x8769, type: TYPE.LONG, count: 1, data: [0, 0, 0, 0] };
  const gpsPointer: Entry = { tag: 0x8825, type: TYPE.LONG, count: 1, data: [0, 0, 0, 0] };
  const first = [...image, ...(exif ? [exifPointer] : []), ...(gps ? [gpsPointer] : [])];

  const firstStart = 8;
  const exifStart = firstStart + directorySize(first);
  const gpsStart = exifStart + (exif ? directorySize(exif) : 0);
  exifPointer.data = u32(exifStart);
  gpsPointer.data = u32(gpsStart);

  const tiff = [
    ...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(42),
    ...u32(firstStart),
    ...writeDirectory(first, firstStart, littleEndian),
    ...(exif ? writeDirectory(exif, exifStart, littleEndian) : []),
    ...(gps ? writeDirectory(gps, gpsStart, littleEndian) : []),
  ];
  const segment = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]; // "Exif\0\0"
  const length = segment.length + 2;

  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...segment, 0xff, 0xd9]).buffer;
}

function fieldsOf(sections: ExifSection[], title: string): Record<string, string> {
  const section = sections.find((candidate) => candidate.title === title);
  return Object.fromEntries((section?.fields ?? []).map((field) => [field.label, field.value]));
}

// ── Reading ───────────────────────────────────────────────────────────────────

test.describe('parseExifSections', () => {
  for (const littleEndian of [true, false]) {
    const order = littleEndian ? 'little-endian' : 'big-endian';

    test(`reads the image, EXIF and GPS directories of a ${order} file`, () => {
      const w = writer(littleEndian);
      const sections = parseExifSections(
        jpegWithExif({
          littleEndian,
          image: [w.ascii(0x010f, 'Canon'), w.ascii(0x0110, 'Canon EOS 5D Mark IV'), w.short(0x0112, 6)],
          exif: [
            w.rational(0x829a, [1, 250]),
            w.rational(0x829d, [28, 10]),
            w.short(0x8827, 100),
            w.ascii(0x9003, '2024:05:17 14:03:22'),
            w.rational(0x920a, [50, 1]),
          ],
          gps: [
            w.ascii(0x0001, 'N'),
            w.rational(0x0002, [37, 1], [46, 1], [2964, 100]),
            w.ascii(0x0003, 'W'),
            w.rational(0x0004, [122, 1], [25, 1], [1, 2]),
          ],
        })
      );

      expect(sections.map((section) => section.title)).toEqual(['Image', 'EXIF', 'GPS']);
      expect(fieldsOf(sections, 'Image')).toEqual({
        'Camera Make': 'Canon',
        'Camera Model': 'Canon EOS 5D Mark IV',
        Orientation: '6',
      });
      expect(fieldsOf(sections, 'EXIF')).toEqual({
        'Exposure Time': '1/250',
        Aperture: '2.8',
        ISO: '100',
        Taken: '2024:05:17 14:03:22',
        'Focal Length': '50',
      });
      expect(fieldsOf(sections, 'GPS')).toEqual({
        'Latitude Ref': 'N',
        Latitude: '37, 46, 29.64',
        'Longitude Ref': 'W',
        Longitude: '122, 25, 1/2',
      });
    });
  }

  test('returns nothing for data that is not a JPEG with EXIF', () => {
    expect(parseExifSections(new ArrayBuffer(0))).toEqual([]);
    expect(parseExifSections(Uint8Array.from([0xff, 0xd8]).buffer)).toEqual([]);
    expect(parseExifSections(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer)).toEqual([]);
    // A JPEG whose only segment is JFIF.
    expect(
      parseExifSections(
        Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 7, 0x4a, 0x46, 0x49, 0x46, 0, 0xff, 0xd9]).buffer
      )
    ).toEqual([]);
  });

  test('names tags it does not know by number', () => {
    const w = writer(true);
    const sections = parseExifSections(jpegWithExif({ image: [w.short(0x0128, 2)] }));

    expect(fieldsOf(sections, 'Image')).toEqual({ 'Tag 0x0128': '2' });
  });

  test('shows a zero rational as 0 and reduces fractions', () => {
    // An exposure bias of 0/10 used to read "0/10", and 10/2500s "10/2500".
    const w = writer(true);
    const sections = parseExifSections(
      jpegWithExif({
        exif: [
          w.srational(0x9204, [0, 10]),
          w.rational(0x829a, [10, 2500]),
          w.rational(0x829d, [0, 0]),
          w.srational(0x9201, [-1, 3]),
          w.srational(0x9202, [2, -6]),
        ],
      })
    );

    expect(fieldsOf(sections, 'EXIF')).toEqual({
      'Exposure Bias': '0',
      'Exposure Time': '1/250',
      Aperture: '0',
      'Shutter Speed': '-1/3',
      'Aperture Value': '-1/3',
    });
  });

  test('reads names written in UTF-8', () => {
    // Read one byte per character, "José Müller ©" came out as "JosÃ© MÃ¼ller Â©".
    const w = writer(true);
    const sections = parseExifSections(
      jpegWithExif({ image: [w.ascii(0x013b, 'José Müller'), w.ascii(0x8298, '© 2024 写真家 📷')] })
    );

    expect(fieldsOf(sections, 'Image')).toEqual({ Artist: 'José Müller', Copyright: '© 2024 写真家 📷' });
  });

  test('falls back to Latin-1 for bytes that are not UTF-8', () => {
    const w = writer(true);
    const sections = parseExifSections(
      jpegWithExif({ image: [w.ascii(0x013b, [0x4a, 0x6f, 0x73, 0xe9])] })
    );

    expect(fieldsOf(sections, 'Image')).toEqual({ Artist: 'José' });
  });

  test('keeps long UTF-8 text readable when the read limit falls inside a character', () => {
    // 1 + 2 x 1000 bytes: the 1024-byte read limit lands on the first half of an "é".
    const w = writer(true);
    const sections = parseExifSections(jpegWithExif({ image: [w.ascii(0x8298, `x${'é'.repeat(1000)}`)] }));

    expect(fieldsOf(sections, 'Image')).toEqual({ Copyright: `x${'é'.repeat(139)}...` });
  });

  test('cuts long text at 140 characters and reports empty text as Empty', () => {
    const w = writer(true);
    const sections = parseExifSections(
      jpegWithExif({ image: [w.ascii(0x0131, 'x'.repeat(500)), w.ascii(0x013b, '')] })
    );

    expect(fieldsOf(sections, 'Image')).toEqual({ Software: `${'x'.repeat(140)}...`, Artist: 'Empty' });
  });

  test('leaves the maker note out', () => {
    // The check meant to skip it compared the value, not the tag, so a camera's
    // private block was printed as thousands of comma-separated byte values.
    const w = writer(true);
    const makerNote = Array.from({ length: 3000 }, (_, index) => index % 251);
    const sections = parseExifSections(
      jpegWithExif({ exif: [w.undefinedBytes(0x927c, makerNote), w.short(0x8827, 400)] })
    );

    expect(fieldsOf(sections, 'EXIF')).toEqual({ ISO: '400' });
  });

  test('reads a user comment as text', () => {
    // It used to be listed as the byte values of "ASCII\0\0\0" and the text.
    const w = writer(true);
    const ascii = [...new TextEncoder().encode('ASCII\0\0\0Sunset at the pier'), 0, 0, 0];
    const unicode = [...new TextEncoder().encode('UNICODE\0'), 0x48, 0, 0x69, 0, 0x26, 0x20]; // "Hi…" in UTF-16LE

    expect(
      fieldsOf(parseExifSections(jpegWithExif({ exif: [w.undefinedBytes(0x9286, ascii)] })), 'EXIF')
    ).toEqual({ Comment: 'Sunset at the pier' });
    expect(
      fieldsOf(parseExifSections(jpegWithExif({ exif: [w.undefinedBytes(0x9286, unicode)] })), 'EXIF')
    ).toEqual({ Comment: 'Hi…' });
    expect(
      fieldsOf(
        parseExifSections(jpegWithExif({ exif: [w.undefinedBytes(0x9286, [0x41, 0x53, 0x43, 0x49, 0x49, 0, 0, 0])] })),
        'EXIF'
      )
    ).toEqual({ Comment: 'Empty' });
  });

  test('shows version stamps as text and other untyped bytes as numbers', () => {
    const w = writer(true);
    const sections = parseExifSections(
      jpegWithExif({
        exif: [w.undefinedBytes(0x9000, [0x30, 0x32, 0x33, 0x32]), w.undefinedBytes(0x9101, [1, 2, 3, 0])],
      })
    );

    expect(fieldsOf(sections, 'EXIF')).toEqual({ 'Tag 0x9000': '0232', 'Tag 0x9101': '1, 2, 3, 0' });
  });

  test('summarises a long list of numbers instead of printing all of it', () => {
    // Padding blocks left by editors run to thousands of bytes.
    const w = writer(true);
    const sections = parseExifSections(
      jpegWithExif({ image: [w.undefinedBytes(0xea1c, new Array<number>(2060).fill(0))] })
    );

    expect(fieldsOf(sections, 'Image')).toEqual({
      'Tag 0xea1c': `${new Array<number>(16).fill(0).join(', ')}, ... (2060 values)`,
    });
  });

  test('keeps a list that fits', () => {
    const w = writer(true);
    const sections = parseExifSections(jpegWithExif({ image: [w.short(0x0102, 8, 8, 8)] }));

    expect(fieldsOf(sections, 'Image')).toEqual({ 'Tag 0x0102': '8, 8, 8' });
  });

  test('does not throw when a value runs past the end of the file', () => {
    // A rational that starts inside the file and ends outside it used to
    // throw, and the tool showed a DataView error instead of the other tags.
    const w = writer(true);
    const layout = (pointer: number): ExifLayout => ({
      image: [w.ascii(0x010f, 'Nikon')],
      exif: [{ tag: 0x829a, type: TYPE.RATIONAL, count: 1, data: [], pointer }, w.short(0x8827, 200)],
    });
    const fileLength = jpegWithExif(layout(0)).byteLength;
    const sections = parseExifSections(jpegWithExif(layout(fileLength - TIFF_START - 3)));

    expect(fieldsOf(sections, 'Image')).toEqual({ 'Camera Make': 'Nikon' });
    expect(fieldsOf(sections, 'EXIF')).toEqual({ ISO: '200' });
  });

  test('reports a value that lies wholly outside the file', () => {
    const w = writer(true);
    const sections = parseExifSections(
      jpegWithExif({
        image: [{ tag: 0x010f, type: TYPE.ASCII, count: 20, data: [], pointer: 0x00ffffff }, w.short(0x0112, 1)],
      })
    );

    expect(fieldsOf(sections, 'Image')).toEqual({ 'Camera Make': 'Out of bounds', Orientation: '1' });
  });

  test('survives absurd counts and directories that point at themselves', () => {
    const w = writer(true);
    const sections = parseExifSections(
      jpegWithExif({
        image: [
          { tag: 0x010f, type: TYPE.ASCII, count: 0xffffffff, data: [], pointer: 8 },
          { tag: 0x0111, type: TYPE.BYTE, count: 0xffffffff, data: [], pointer: 8 },
          // The EXIF directory pointer leads straight back to this directory.
          { tag: 0x8769, type: TYPE.LONG, count: 1, data: w.u32(8) },
          w.short(0x0112, 3),
        ],
      })
    );

    const image = fieldsOf(sections, 'Image');
    expect(sections.map((section) => section.title)).toEqual(['Image']);
    expect(image.Orientation).toBe('3');
    // Four billion bytes are claimed; sixteen are listed.
    expect(image['Tag 0x0111']).toMatch(/^\d+(, \d+){15}, \.\.\. \(4294967295 values\)$/);
  });

  test('does not throw on a file cut off anywhere', () => {
    const w = writer(false);
    const whole = new Uint8Array(
      jpegWithExif({
        littleEndian: false,
        image: [w.ascii(0x010f, 'Fujifilm'), w.rational(0x011a, [72, 1])],
        exif: [w.rational(0x829a, [1, 60]), w.ascii(0x9003, '2023:01:02 03:04:05')],
        gps: [w.rational(0x0002, [1, 1], [2, 1], [3, 1])],
      })
    );

    for (let length = 0; length <= whole.length; length += 1) {
      expect(() => parseExifSections(whole.slice(0, length).buffer)).not.toThrow();
    }
  });

  test('lists a label once per section', () => {
    const w = writer(true);
    const sections = parseExifSections(
      jpegWithExif({ image: [w.ascii(0x010f, 'First'), w.ascii(0x010f, 'Second')] })
    );

    expect(fieldsOf(sections, 'Image')).toEqual({ 'Camera Make': 'First' });
    expect(sections[0].fields).toHaveLength(1);
  });
});

// ── Batch file names ──────────────────────────────────────────────────────────

test.describe('uniqueFileNames', () => {
  test('leaves distinct names alone', () => {
    expect(uniqueFileNames(['a-clean.jpg', 'b-clean.jpg', 'a-clean.png'])).toEqual([
      'a-clean.jpg',
      'b-clean.jpg',
      'a-clean.png',
    ]);
    expect(uniqueFileNames([])).toEqual([]);
  });

  test('numbers repeated names', () => {
    // IMG_0001.jpg from two folders, or a.jpg and a.jpeg, both became
    // a-clean.jpg, and the ZIP silently kept only the last one.
    expect(uniqueFileNames(['a-clean.jpg', 'a-clean.jpg', 'a-clean.jpg'])).toEqual([
      'a-clean.jpg',
      'a-clean (2).jpg',
      'a-clean (3).jpg',
    ]);
  });

  test('treats names that differ only in case as the same', () => {
    expect(uniqueFileNames(['Photo.JPG', 'photo.jpg'])).toEqual(['Photo.JPG', 'photo (2).jpg']);
  });

  test('does not hand out a name another file already has', () => {
    expect(uniqueFileNames(['a.jpg', 'a.jpg', 'a (2).jpg'])).toEqual(['a.jpg', 'a (2).jpg', 'a (2) (2).jpg']);
    expect(uniqueFileNames(['a (2).jpg', 'a.jpg', 'a.jpg'])).toEqual(['a (2).jpg', 'a.jpg', 'a (3).jpg']);
  });

  test('handles names without an extension', () => {
    expect(uniqueFileNames(['scan', 'scan', '.hidden', '.hidden'])).toEqual([
      'scan',
      'scan (2)',
      '.hidden',
      '.hidden (2)',
    ]);
  });
});
