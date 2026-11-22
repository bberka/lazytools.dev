import { describe, expect, test } from 'vite-plus/test';
import { MEDIA_MIME_TYPES, stripMediaMetadata } from '@/lib/tools/media-metadata';

// ── Fixture builders ─────────────────────────────────────────────────────────

const enc = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0));
const concat = (...parts: ArrayLike<number>[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((part) => Array.from(part)));
const u32be = (value: number) => [
  (value >>> 24) & 255,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255,
];
const u32le = (value: number) => [
  value & 255,
  (value >>> 8) & 255,
  (value >>> 16) & 255,
  (value >>> 24) & 255,
];
const u24be = (value: number) => [(value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const sameBytes = (a: Uint8Array, b: Uint8Array) => expect(Array.from(a)).toEqual(Array.from(b));
/** The ASCII text at an offset, for reading box types back out of a result. */
/** UTF-16 big-endian bytes of a string, for the frames that carry no byte order mark. */
const bigEndianText = (value: string): number[] =>
  Array.from(value).flatMap((char) => [char.charCodeAt(0) >> 8, char.charCodeAt(0) & 0xff]);
/** One code point per position, for the UTF-16 fixtures. */
const textAt = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...Array.from(bytes.subarray(offset, offset + length)));
/**
 * Every prefix of the fixture is fed through the cleaner. A cut inside the
 * audio frames is still a playable file, so it may be cleaned; a cut inside a
 * header must come back untouched. Neither may throw.
 */
const expectEveryPrefixHandled = (input: Uint8Array) => {
  for (let length = 0; length < input.length; length += 1) {
    const cut = input.subarray(0, length);
    const result = stripMediaMetadata(cut);
    if (!result.changed) sameBytes(result.bytes, cut);
    expect(result.message).not.toBe('');
  }
};
const findText = (bytes: Uint8Array, text: string): number => {
  const needle = enc(text);
  for (let at = 0; at + needle.length <= bytes.length; at++) {
    if (needle.every((byte, index) => bytes[at + index] === byte)) return at;
  }
  return -1;
};

// ── MP4 ──────────────────────────────────────────────────────────────────────

const box = (type: string, ...parts: ArrayLike<number>[]): Uint8Array => {
  const payload = concat(...parts);
  return concat(u32be(payload.length + 8), enc(type), payload);
};
const full = (version: number, flags: number, ...parts: ArrayLike<number>[]) =>
  concat([version, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255], ...parts);

const SAMPLE = [9, 8, 7, 6, 5, 4, 3, 2];
const FTYP = box('ftyp', enc('isom'), u32be(512), enc('isom'), enc('mp42'));
const MDAT = box('mdat', SAMPLE);
const C2PA_UUID = [
  0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c, 0x92, 0x97, 0x58, 0x28, 0x87, 0x7e, 0xc4, 0x81,
];
const XMP_UUID = [
  0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac,
];

const udta = () =>
  box(
    'udta',
    box('\u00a9xyz', [0, 0, 0, 0, ...enc('+37.77-122.41/')]),
    box(
      'meta',
      full(0, 0),
      box('hdlr', full(0, 0), enc('mdta')),
      box('ilst', box('\u00a9too', [0, 0, 0, 0, ...enc('Made with Google Veo')]))
    )
  );

function moov(
  sampleOffset: number,
  withUserData: boolean,
  children: Uint8Array[] = []
): Uint8Array {
  const stco = box('stco', full(0, 0), u32be(1), u32be(sampleOffset));
  const stbl = box(
    'stbl',
    box('stsd', full(0, 0), u32be(0)),
    box('stts', full(0, 0), u32be(0)),
    box('stsc', full(0, 0), u32be(0)),
    box('stsz', full(0, 0), u32be(0), u32be(0)),
    stco
  );
  const minf = box('minf', box('smhd', full(0, 0), [0, 0, 0, 0]), stbl);
  const mdia = box(
    'mdia',
    box(
      'mdhd',
      full(0, 0),
      Array.from({ length: 20 }, () => 0)
    ),
    box(
      'hdlr',
      full(0, 0),
      [0, 0, 0, 0],
      enc('vide'),
      Array.from({ length: 13 }, () => 0)
    ),
    minf
  );
  const trak = box(
    'trak',
    box(
      'tkhd',
      full(0, 0),
      Array.from({ length: 76 }, () => 0)
    ),
    mdia
  );
  return box(
    'moov',
    box(
      'mvhd',
      full(0, 0),
      Array.from({ length: 96 }, () => 0)
    ),
    trak,
    ...(withUserData ? [udta()] : []),
    ...children
  );
}

/** The chunk offset recorded in the stco table. */
const chunkOffset = (bytes: Uint8Array): number => {
  const at = findText(bytes, 'stco');
  return (
    ((bytes[at + 12] << 24) | (bytes[at + 13] << 16) | (bytes[at + 14] << 8) | bytes[at + 15]) >>> 0
  );
};

describe('MP4', () => {
  test('cuts udta out of a movie header that sits in front of the media data, and moves the chunk offset', () => {
    const userData = udta();
    // Two passes: the first measures where the sample data lands, the second writes that offset into stco.
    const probe = concat(FTYP, moov(0, true), MDAT);
    const sampleOffset = probe.length - MDAT.length + 8;
    const input = concat(FTYP, moov(sampleOffset, true), MDAT);

    const result = stripMediaMetadata(input);

    expect(result.format).toBe('mp4');
    expect(result.changed).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].category).toBe('Video metadata');
    expect(result.removed[0].location).toContain('udta');
    expect(result.removed[0].size).toBe(userData.length);
    expect(result.signals).toEqual(
      expect.arrayContaining(['GPS location (\u00a9xyz)', 'Google Veo / Imagen'])
    );
    expect(result.kept).toEqual(expect.arrayContaining(['sample tables', 'media data']));
    expect(result.cleanedSize).toBe(input.length - userData.length);

    // The stco entry follows the media data it points at, so the sample is where the table says.
    const patched = sampleOffset - userData.length;
    expect(chunkOffset(result.bytes)).toBe(patched);
    expect(Array.from(result.bytes.subarray(patched, patched + SAMPLE.length))).toEqual(SAMPLE);
    // A second pass finds nothing to cut.
    expect(stripMediaMetadata(result.bytes).changed).toBe(false);
  });

  test('a movie header after the media data leaves the chunk offsets alone', () => {
    const userData = udta();
    const sampleOffset = FTYP.length + 8;
    const input = concat(FTYP, MDAT, moov(sampleOffset, true));
    const result = stripMediaMetadata(input);

    expect(result.changed).toBe(true);
    expect(result.cleanedSize).toBe(input.length - userData.length);
    expect(chunkOffset(result.bytes)).toBe(sampleOffset);
    expect(Array.from(result.bytes.subarray(sampleOffset, sampleOffset + SAMPLE.length))).toEqual(
      SAMPLE
    );
  });

  test('removes the C2PA and XMP uuid boxes and keeps an unknown uuid box', () => {
    const c2pa = box('uuid', C2PA_UUID, enc('jumbc2pa manifest'));
    const xmp = box('uuid', XMP_UUID, enc('<x:xmpmeta>trainedAlgorithmicMedia</x:xmpmeta>'));
    const unknown = box(
      'uuid',
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      enc('drm')
    );

    const input = concat(FTYP, moov(SAMPLE.length, false, [xmp]), c2pa, unknown, MDAT);
    const result = stripMediaMetadata(input);

    expect(result.changed).toBe(true);
    expect(result.removed.map((item) => item.category)).toEqual([
      'XMP',
      'Content Credentials (C2PA)',
    ]);
    expect(result.removed.map((item) => item.location)).toEqual([
      expect.stringContaining('uuid box (XMP)'),
      expect.stringContaining('C2PA manifest'),
    ]);
    expect(result.signals).toEqual(
      expect.arrayContaining(['C2PA', 'DigitalSourceType: trainedAlgorithmicMedia'])
    );
    // The unknown uuid box survives byte for byte.
    expect(findText(result.bytes, 'drm')).toBeGreaterThan(-1);
  });

  test('a clean MP4 is reported clean and returned unchanged', () => {
    const input = concat(FTYP, moov(FTYP.length + MDAT.length + 8, false), MDAT);
    const result = stripMediaMetadata(input);
    expect(result.format).toBe('mp4');
    expect(result.changed).toBe(false);
    expect(result.verified).toBe(true);
    sameBytes(result.bytes, input);
  });

  test('a segment index stops the cut, because its offsets would go stale', () => {
    const input = concat(
      FTYP,
      box('sidx', full(0, 0), u32be(1), u32be(0), u32be(0), [0, 0]),
      moov(0, true),
      MDAT
    );
    const result = stripMediaMetadata(input);
    expect(result.changed).toBe(false);
    expect(result.message).toContain('segment index');
    sameBytes(result.bytes, input);
  });

  test('a box with a 64-bit length shrinks its own length field, not its type', () => {
    // `size === 1` puts the real length in the eight bytes after the type.
    const box64 = (type: string, ...parts: ArrayLike<number>[]): Uint8Array => {
      const payload = concat(...parts);
      const size = payload.length + 16;
      return concat(u32be(1), enc(type), u32be(0), u32be(size), payload);
    };
    const input = concat(
      FTYP,
      box64(
        'moov',
        box(
          'mvhd',
          full(0, 0),
          Array.from({ length: 96 }, () => 0)
        ),
        udta()
      ),
      MDAT
    );
    const result = stripMediaMetadata(input);

    expect(result.changed).toBe(true);
    expect(result.verified).toBe(true);
    // The moov now sits after a four-byte size and its type, with a shortened 64-bit length.
    expect(textAt(result.bytes, FTYP.length + 4, 4)).toBe('moov');
    const moovStart = FTYP.length;
    const size = new DataView(result.bytes.buffer).getBigUint64(moovStart + 8);
    expect(Number(size)).toBe(input.length - FTYP.length - MDAT.length - udta().length);
    expect(stripMediaMetadata(result.bytes).changed).toBe(false);
  });

  test('moves the random access index when a fragment shifts', () => {
    const moofOffset = (file: Uint8Array) => textAt(file, 0, file.length).indexOf('moof') - 4;
    const mfra = (offset: number) =>
      box(
        'mfra',
        // tfra: version 0, track 1, no per-entry trail lengths, one entry (time, moof offset).
        box('tfra', full(0, 0), u32be(1), u32be(0), u32be(1), u32be(0), u32be(offset)),
        box('mfro', full(0, 0), u32be(16))
      );
    const build = (indexedOffset: number) =>
      concat(
        FTYP,
        moov(0, true),
        box('moof', box('mfhd', full(0, 0), u32be(1))),
        MDAT,
        mfra(indexedOffset)
      );

    const probe = build(0);
    const input = build(moofOffset(probe));
    const result = stripMediaMetadata(input);

    expect(result.changed).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.kept).toEqual(expect.arrayContaining(['random access index']));
    // The index entry moves with the fragment it names.
    const shifted = moofOffset(result.bytes);
    expect(textAt(result.bytes, shifted + 4, 4)).toBe('moof');
    const tfra = textAt(result.bytes, 0, result.bytes.length).indexOf('tfra');
    const entry = tfra + 4 + 16 + 4;
    expect(new DataView(result.bytes.buffer).getUint32(entry)).toBe(shifted);
  });

  test('keeps a track run pointing at its sample when a box between the fragment and the data goes', () => {
    // The moof comes first, then the user data, then the samples it points at.
    const build = (dataOffset: number) =>
      concat(
        FTYP,
        box(
          'moov',
          box(
            'mvhd',
            full(0, 0),
            Array.from({ length: 96 }, () => 0)
          )
        ),
        box(
          'moof',
          box('mfhd', full(0, 0), u32be(1)),
          box(
            'traf',
            box('tfhd', full(0, 0x020000), u32be(1)),
            box('trun', full(0, 0x000001), u32be(1), u32be(dataOffset))
          )
        ),
        udta(),
        MDAT
      );

    const readOffset = (file: Uint8Array) => {
      const at = textAt(file, 0, file.length).indexOf('trun') + 4 + 8;
      return new DataView(file.buffer, file.byteOffset).getUint32(at);
    };

    const probe = build(0);
    const moofStart = textAt(probe, 0, probe.length).indexOf('moof') - 4;
    const dataStart = textAt(probe, 0, probe.length).lastIndexOf('mdat') - 4 + 8;
    const input = build(dataStart - moofStart);

    const result = stripMediaMetadata(input);
    expect(result.changed).toBe(true);
    expect(result.verified).toBe(true);
    // The fragment and the samples are now closer by exactly the removed block.
    expect(readOffset(result.bytes)).toBe(dataStart - moofStart - udta().length);
  });

  test('leaves an unknown uuid box in place and says what it mentions', () => {
    const vendor = box(
      'uuid',
      Array.from({ length: 16 }, (_, i) => i + 1),
      enc('openai shard')
    );
    const input = concat(FTYP, moov(0, false, [vendor]), MDAT);
    const result = stripMediaMetadata(input);

    expect(result.changed).toBe(false);
    expect(result.verified).toBe(true);
    expect(result.kept).toContain('unknown uuid box');
    expect(result.warnings.join(' ')).toContain('OpenAI');
    sameBytes(result.bytes, input);
  });

  test('recognises a legacy QuickTime movie that has no file type box', () => {
    const input = concat(box('moov', udta()), MDAT);
    const result = stripMediaMetadata(input);

    expect(result.format).toBe('mov');
    expect(result.changed).toBe(true);
    // The movie header stays as an empty box; only the user data inside it goes.
    sameBytes(result.bytes, concat(box('moov'), MDAT));
  });

  test('a file that only spells moov is not taken for a movie', () => {
    const input = concat(
      enc('moov is not a container'),
      Array.from({ length: 40 }, () => 0)
    );
    expect(stripMediaMetadata(input).changed).toBe(false);
  });

  test('a broken or foreign file is returned unchanged with a message', () => {
    const inputs = [
      concat(FTYP, MDAT),
      concat(FTYP, moov(0, true)),
      concat(
        enc('....ftypavif'),
        Array.from({ length: 32 }, () => 0)
      ),
    ];
    for (const input of inputs) {
      const result = stripMediaMetadata(input);
      expect(result.changed).toBe(false);
      sameBytes(result.bytes, input);
      expect(result.message).not.toBe('');
    }
  });

  test('every truncation is returned unchanged and never throws', () => {
    const input = concat(FTYP, moov(FTYP.length + 8, true), MDAT);
    // A cut MP4 is never a playable file, so every prefix has to come back untouched.
    for (let length = 0; length < input.length; length += 1) {
      const cut = input.subarray(0, length);
      const result = stripMediaMetadata(cut);
      expect(result.changed).toBe(false);
      sameBytes(result.bytes, cut);
      expect(result.message).not.toBe('');
    }
  });
});

// ── MP3 ──────────────────────────────────────────────────────────────────────

const syncsafe = (value: number) => [
  (value >>> 21) & 0x7f,
  (value >>> 14) & 0x7f,
  (value >>> 7) & 0x7f,
  value & 0x7f,
];

const id3v2 = (major: number, frames: ArrayLike<number>, footer = false): Uint8Array =>
  concat(
    enc('ID3'),
    [major, 0, footer ? 0x10 : 0, ...syncsafe(frames.length)],
    frames,
    footer ? concat(enc('3DI'), [major, 0, 0x10, ...syncsafe(frames.length)]) : []
  );

const id3Frame = (id: string, body: ArrayLike<number>, major = 3): Uint8Array =>
  concat(
    enc(id),
    // A v2.2 frame header is the three-letter id and a three-byte size, with no flags.
    major === 2 ? u24be(body.length) : major === 4 ? syncsafe(body.length) : u32be(body.length),
    major === 2 ? [] : [0, 0],
    body
  );

const textFrame = (id: string, value: string, major = 3) => id3Frame(id, [0, ...enc(value)], major);

// One complete MPEG-1 Layer III frame at 128 kbit/s and 44.1 kHz: its header says 417 bytes.
const MP3_FRAME_BYTES = 417;
const MP3_AUDIO = concat(
  [0xff, 0xfb, 0x90, 0x64],
  Array.from({ length: MP3_FRAME_BYTES - 4 }, () => 0x21)
);

const id3v1 = (title: string): Uint8Array => {
  const payload = new Uint8Array(128);
  payload.set(enc('TAG'));
  payload.set(enc(title).slice(0, 30), 3);
  return payload;
};

const apeItem = (key: string, value: string) =>
  concat(u32le(value.length), u32le(0), enc(key), [0], enc(value));

const apeTag = (items: ArrayLike<number>): Uint8Array => {
  const size = 32 + items.length;
  return concat(
    items,
    enc('APETAGEX'),
    u32le(2000),
    u32le(size),
    u32le(1),
    u32le(0),
    Array.from({ length: 8 }, () => 0)
  );
};

const lyrics3 = (text: string): Uint8Array => {
  const block = concat(enc('LYRICSBEGIN'), enc(text));
  return concat(block, enc(String(block.length).padStart(6, '0')), enc('LYRICS200'));
};

describe('MP3', () => {
  test('cuts an ID3v2 tag off the front and an ID3v1 tag off the back, leaving the audio untouched', () => {
    const frames = concat(
      textFrame('TIT2', 'Song title'),
      textFrame('TSSE', 'Suno v4'),
      textFrame('COMM', 'Made with Suno')
    );
    const input = concat(id3v2(3, frames), MP3_AUDIO, id3v1('Song title'));
    const result = stripMediaMetadata(input);

    expect(result.format).toBe('mp3');
    expect(result.changed).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.removed.map((item) => item.location)).toEqual([
      'ID3v2.3 tag (TIT2, TSSE, COMM)',
      'ID3v1 tag',
    ]);
    expect(result.removed[0].category).toBe('Audio tags');
    expect(result.removed[0].preview).toBe('Song title');
    expect(result.signals).toContain('Suno');
    sameBytes(result.bytes, MP3_AUDIO);
  });

  test('an ID3v2.4 tag with a footer, and a v2.2 tag, are cut whole', () => {
    const v4 = concat(id3v2(4, textFrame('TSSE', 'ElevenLabs', 4), true), MP3_AUDIO);
    expect(stripMediaMetadata(v4).changed).toBe(true);
    sameBytes(stripMediaMetadata(v4).bytes, MP3_AUDIO);

    const v2 = stripMediaMetadata(
      concat(id3v2(2, id3Frame('TT2', [0, ...enc('Song')], 2)), MP3_AUDIO)
    );
    expect(v2.removed.map((item) => item.location)).toEqual(['ID3v2.2 tag (TT2)']);
    expect(v2.removed[0].preview).toBe('Song');
    sameBytes(v2.bytes, MP3_AUDIO);
  });

  test('cuts two trailers in file order, Lyrics3 before ID3v1', () => {
    const lyrics = lyrics3('IND00002Some lyrics');
    const input = concat(MP3_AUDIO, lyrics, id3v1('Song'));
    const result = stripMediaMetadata(input);

    expect(result.changed).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.removed.map((item) => item.location)).toEqual(['Lyrics3 v2 tag', 'ID3v1 tag']);
    sameBytes(result.bytes, MP3_AUDIO);
  });

  test('a tag followed by half a frame is left alone', () => {
    const input = concat(id3v2(3, textFrame('TSSE', 'Suno')), MP3_AUDIO.subarray(0, 200));
    const result = stripMediaMetadata(input);
    expect(result.changed).toBe(false);
    expect(result.message).toContain('cut short');
    sameBytes(result.bytes, input);
  });

  test('an incomplete MPEG header is not taken for audio', () => {
    const input = concat(id3v2(3, textFrame('TSSE', 'Suno')), [0xff, 0xfb]);
    const result = stripMediaMetadata(input);
    expect(result.changed).toBe(false);
    expect(result.message).toContain('MPEG audio frame');
    sameBytes(result.bytes, input);
  });

  test('reads the frame text by its encoding selector', () => {
    const utf8Title = concat(
      id3v2(
        4,
        id3Frame('TIT2', [3, ...Array.from(new TextEncoder().encode('Caf\u00e9'))], 4),
        true
      ),
      MP3_AUDIO
    );
    expect(stripMediaMetadata(utf8Title).removed[0].preview).toBe('Caf\u00e9');

    // Selector 1 is UTF-16 with a byte order mark, and the mark decides the order.
    const bigEndian = [0xfe, 0xff, ...bigEndianText('Caf\u00e9')];
    const utf16 = stripMediaMetadata(
      concat(id3v2(3, id3Frame('TIT2', [1, ...bigEndian])), MP3_AUDIO)
    );
    expect(utf16.removed[0].preview).toBe('Caf\u00e9');

    // Selector 2 is UTF-16 with no mark, always big endian.
    const noMark = bigEndianText('Caf\u00e9');
    expect(
      stripMediaMetadata(concat(id3v2(3, id3Frame('TIT2', [2, ...noMark])), MP3_AUDIO)).removed[0]
        .preview
    ).toBe('Caf\u00e9');
  });

  test('cuts APEv2 and Lyrics3 tags off the back', () => {
    const withApe = concat(MP3_AUDIO, apeTag(apeItem('Title', 'Song \u2014 generated')));
    const apeResult = stripMediaMetadata(withApe);
    expect(apeResult.removed.map((item) => item.location)).toEqual(['APEv2 tag']);
    sameBytes(apeResult.bytes, MP3_AUDIO);

    const withLyrics = concat(MP3_AUDIO, lyrics3('IND00002Some lyrics'));
    const lyricsResult = stripMediaMetadata(withLyrics);
    expect(lyricsResult.removed.map((item) => item.location)).toEqual(['Lyrics3 v2 tag']);
    sameBytes(lyricsResult.bytes, MP3_AUDIO);
  });

  test('an untagged MP3 is reported clean', () => {
    const result = stripMediaMetadata(MP3_AUDIO);
    expect(result.format).toBe('mp3');
    expect(result.changed).toBe(false);
    expect(result.verified).toBe(true);
    sameBytes(result.bytes, MP3_AUDIO);
  });

  test('a file whose tags are followed by something other than audio is left alone', () => {
    const input = concat(id3v2(3, textFrame('TSSE', 'Suno')), enc('this is not audio'));
    const result = stripMediaMetadata(input);
    expect(result.changed).toBe(false);
    expect(result.message).toContain('MPEG audio frame');
    sameBytes(result.bytes, input);
  });

  test('every truncation is returned unchanged and never throws', () => {
    const input = concat(
      id3v2(3, concat(textFrame('TSSE', 'Suno'), textFrame('TIT2', 'Song'))),
      MP3_AUDIO,
      id3v1('Song')
    );
    expectEveryPrefixHandled(input);
  });
});

// ── FLAC ─────────────────────────────────────────────────────────────────────

const flacBlock = (type: number, data: ArrayLike<number>, last = false): Uint8Array =>
  concat(
    [
      (last ? 0x80 : 0) | type,
      (data.length >>> 16) & 255,
      (data.length >>> 8) & 255,
      data.length & 255,
    ],
    data
  );

const STREAMINFO = Array.from({ length: 34 }, () => 0);
const FLAC_AUDIO = concat(
  [0xff, 0xf8, 0x69, 0x08],
  Array.from({ length: 32 }, () => 7)
);

const vorbisComment = (vendor: string, comments: string[]): Uint8Array =>
  concat(
    u32le(enc(vendor).length),
    enc(vendor),
    u32le(comments.length),
    ...comments.map((comment) => concat(u32le(enc(comment).length), enc(comment)))
  );

const PICTURE = concat(u32be(3), u32be(9), enc('image/png'), u32be(4), enc('cover'));

describe('FLAC', () => {
  test('cuts the Vorbis comment and the picture out and moves the last-block flag', () => {
    const input = concat(
      enc('fLaC'),
      flacBlock(0, STREAMINFO),
      flacBlock(4, vorbisComment('Suno', ['TITLE=Song', 'ENCODER=Suno'])),
      flacBlock(6, PICTURE),
      flacBlock(1, [0, 0, 0, 0], true),
      FLAC_AUDIO
    );
    const result = stripMediaMetadata(input);

    expect(result.format).toBe('flac');
    expect(result.changed).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.removed.map((item) => item.location)).toEqual([
      'FLAC Vorbis comment block',
      'FLAC picture block',
    ]);
    expect(result.removed[0].signals).toContain('Suno');
    expect(result.removed[0].preview).toContain('ENCODER=Suno');
    expect(result.kept).toEqual(expect.arrayContaining(['STREAMINFO', 'padding']));

    sameBytes(
      result.bytes,
      concat(enc('fLaC'), flacBlock(0, STREAMINFO), flacBlock(1, [0, 0, 0, 0], true), FLAC_AUDIO)
    );
    expect(stripMediaMetadata(result.bytes).changed).toBe(false);
  });

  test('the last-block flag moves onto the block before a removed last block', () => {
    const input = concat(
      enc('fLaC'),
      flacBlock(0, STREAMINFO),
      flacBlock(4, vorbisComment('reference libFLAC', []), true),
      FLAC_AUDIO
    );
    const result = stripMediaMetadata(input);
    expect(result.changed).toBe(true);
    expect(result.removed).toHaveLength(1);
    sameBytes(result.bytes, concat(enc('fLaC'), flacBlock(0, STREAMINFO, true), FLAC_AUDIO));
  });

  test('does not read the audio frames as a metadata block to flag', () => {
    // The audio starts with FF F8, whose low seven bits make a long, plausible-looking block header.
    const longAudio = concat(
      [0xff, 0xf8, 0x69, 0x08],
      Array.from({ length: 0x6908 }, () => 0x55)
    );
    const input = concat(
      enc('fLaC'),
      flacBlock(0, STREAMINFO),
      flacBlock(4, vorbisComment('Suno', []), true),
      longAudio
    );
    const result = stripMediaMetadata(input);

    expect(result.changed).toBe(true);
    sameBytes(result.bytes, concat(enc('fLaC'), flacBlock(0, STREAMINFO, true), longAudio));
    // The sync byte of the first frame is untouched, so the audio still decodes.
    expect(result.bytes[result.bytes.length - longAudio.length]).toBe(0xff);
  });

  test('decodes the Vorbis preview as UTF-8', () => {
    const input = concat(
      enc('fLaC'),
      flacBlock(0, STREAMINFO),
      flacBlock(
        4,
        concat(
          u32le(enc('Suno').length),
          enc('Suno'),
          u32le(1),
          u32le(new TextEncoder().encode('TITLE=Caf\u00e9').length),
          Array.from(new TextEncoder().encode('TITLE=Caf\u00e9'))
        ),
        true
      ),
      FLAC_AUDIO
    );
    expect(stripMediaMetadata(input).removed[0].preview).toContain('TITLE=Caf\u00e9');
  });

  test('an ID3v2 tag in front of the stream goes with the comments', () => {
    const input = concat(
      id3v2(3, textFrame('TSSE', 'Suno')),
      enc('fLaC'),
      flacBlock(0, STREAMINFO),
      flacBlock(4, vorbisComment('Suno', []), true),
      FLAC_AUDIO
    );
    const result = stripMediaMetadata(input);
    expect(result.changed).toBe(true);
    expect(result.removed).toHaveLength(2);
    sameBytes(result.bytes, concat(enc('fLaC'), flacBlock(0, STREAMINFO, true), FLAC_AUDIO));
  });

  test('a clean FLAC is returned byte for byte', () => {
    const input = concat(
      enc('fLaC'),
      flacBlock(0, STREAMINFO),
      flacBlock(1, [0, 0], true),
      FLAC_AUDIO
    );
    const result = stripMediaMetadata(input);
    expect(result.format).toBe('flac');
    expect(result.changed).toBe(false);
    expect(result.verified).toBe(true);
    sameBytes(result.bytes, input);
  });

  test('every truncation is returned unchanged and never throws', () => {
    const input = concat(
      enc('fLaC'),
      flacBlock(0, STREAMINFO),
      flacBlock(4, vorbisComment('Suno', ['ENCODER=Suno'])),
      flacBlock(6, PICTURE),
      flacBlock(1, [0, 0], true),
      FLAC_AUDIO
    );
    expectEveryPrefixHandled(input);
  });
});

// ── WAV ──────────────────────────────────────────────────────────────────────

const riffChunk = (type: string, data: ArrayLike<number>): Uint8Array =>
  concat(enc(type), u32le(data.length), data, data.length & 1 ? [0] : []);

const wav = (...chunks: ArrayLike<number>[]): Uint8Array => {
  const body = concat(enc('WAVE'), ...chunks);
  return concat(enc('RIFF'), u32le(body.length), body);
};

const WAV_FMT = riffChunk('fmt ', [1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 0x01, 0, 2, 0, 16, 0]);
const WAV_DATA = riffChunk('data', [1, 2, 3, 4, 5, 6]);

const infoItem = (id: string, text: string) =>
  concat(enc(id), u32le(enc(text).length), enc(text), enc(text).length & 1 ? [0] : []);

describe('WAV', () => {
  test('cuts a LIST chunk and rewrites the RIFF size', () => {
    const list = riffChunk('LIST', concat(enc('INFO'), infoItem('ISFT', 'Suno AI')));
    const input = wav(WAV_FMT, list, WAV_DATA);
    const result = stripMediaMetadata(input);

    expect(result.format).toBe('wav');
    expect(result.changed).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.removed.map((item) => item.location)).toEqual(['WAV LIST chunk (INFO tags)']);
    expect(result.removed[0].signals).toContain('Suno');
    sameBytes(result.bytes, wav(WAV_FMT, WAV_DATA));
  });

  test('cuts an XMP chunk, labelled as XMP', () => {
    const axml = riffChunk('axml', enc('<x:xmpmeta>trainedAlgorithmicMedia</x:xmpmeta>'));
    const result = stripMediaMetadata(wav(WAV_FMT, axml, WAV_DATA));
    expect(result.removed.map((item) => item.category)).toEqual(['XMP']);
    sameBytes(result.bytes, wav(WAV_FMT, WAV_DATA));
  });

  test('a clean WAV is returned byte for byte', () => {
    const input = wav(WAV_FMT, WAV_DATA);
    const result = stripMediaMetadata(input);
    expect(result.changed).toBe(false);
    expect(result.verified).toBe(true);
    sameBytes(result.bytes, input);
  });

  test('a LIST chunk that is audio rather than tags is kept and counts as the audio', () => {
    const wavl = riffChunk('LIST', concat(enc('wavl'), WAV_DATA));
    const input = wav(
      WAV_FMT,
      riffChunk('LIST', concat(enc('INFO'), infoItem('ISFT', 'Suno AI'))),
      wavl
    );
    const result = stripMediaMetadata(input);

    expect(result.changed).toBe(true);
    expect(result.removed.map((item) => item.location)).toEqual(['WAV LIST chunk (INFO tags)']);
    sameBytes(result.bytes, wav(WAV_FMT, wavl));
  });

  test('a data chunk that claims more bytes than the file holds is left alone', () => {
    const truncatedData = concat(enc('data'), u32le(200), [1, 2, 3, 4]);
    const input = wav(
      WAV_FMT,
      riffChunk('LIST', concat(enc('INFO'), infoItem('ISFT', 'Suno AI'))),
      truncatedData
    );
    const result = stripMediaMetadata(input);
    expect(result.changed).toBe(false);
    expect(result.message).toContain('cut short');
    sameBytes(result.bytes, input);
  });

  test('RF64 sizes and a missing audio chunk leave the file alone', () => {
    const ds64 = wav(
      WAV_FMT,
      riffChunk(
        'ds64',
        Array.from({ length: 24 }, () => 0)
      ),
      WAV_DATA
    );
    expect(stripMediaMetadata(ds64).changed).toBe(false);
    expect(stripMediaMetadata(ds64).message).toContain('RF64');

    const noData = wav(WAV_FMT, riffChunk('LIST', concat(enc('INFO'))));
    expect(stripMediaMetadata(noData).changed).toBe(false);
    expect(stripMediaMetadata(noData).message).toContain('no format or audio chunk');
  });

  test('every truncation is returned unchanged and never throws', () => {
    const input = wav(
      WAV_FMT,
      riffChunk('LIST', concat(enc('INFO'), infoItem('ISFT', 'Suno AI'))),
      WAV_DATA
    );
    expectEveryPrefixHandled(input);
  });
});

// ── The dispatcher ───────────────────────────────────────────────────────────

describe('image formats still go through the same entry point', () => {
  test('a PNG with a generation prompt is cleaned and typed for download', () => {
    const pngChunk = (type: string, data: ArrayLike<number>) =>
      // The PNG walker reads the chunk framing only, so the CRC can stay zero.
      concat(u32be(data.length), enc(type), data, u32be(0));
    const png = concat(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      pngChunk('IHDR', [...u32be(1), ...u32be(1), 8, 6, 0, 0, 0]),
      pngChunk('tEXt', enc('parameters\0Steps: 20, Sampler: Euler a')),
      pngChunk('IEND', [])
    );
    const result = stripMediaMetadata(png);
    expect(result.format).toBe('png');
    expect(result.changed).toBe(true);
    expect(result.signals).toContain('Stable Diffusion parameters');
    expect(MEDIA_MIME_TYPES.png).toBe('image/png');
  });

  test('an audio generator named in a PNG caption does not relabel it as generation metadata', () => {
    const pngChunk = (type: string, data: ArrayLike<number>) =>
      concat(u32be(data.length), enc(type), data, u32be(0));
    const png = concat(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      pngChunk('IHDR', [...u32be(1), ...u32be(1), 8, 6, 0, 0, 0]),
      pngChunk('tEXt', enc('Description\0Recorded in Suno Valley')),
      pngChunk('IEND', [])
    );
    const result = stripMediaMetadata(png);
    expect(result.changed).toBe(true);
    expect(result.removed[0].category).toBe('Text metadata');
    expect(result.signals).toEqual([]);
  });
});

describe('file types the cleaner cannot rewrite', () => {
  test('a known marker in another type is reported but nothing is changed', () => {
    const input = concat(enc('notes.txt'), enc(' this came from c2pa and Suno'));
    const result = stripMediaMetadata(input);
    expect(result.format).toBeNull();
    expect(result.changed).toBe(false);
    expect(result.signals).toEqual(expect.arrayContaining(['C2PA', 'Suno']));
    expect(result.message).toContain('cannot be cleaned');
    sameBytes(result.bytes, input);
  });

  test('an AVIF is named as an ISO container that is not rewritten, and still reported', () => {
    const input = concat(
      enc('\0\0\0\x20ftyp'),
      enc('avif'),
      Array.from({ length: 16 }, () => 0),
      enc('c2pa manifest')
    );
    const result = stripMediaMetadata(input);
    expect(result.changed).toBe(false);
    expect(result.message).toContain('AVIF');
    expect(result.signals).toContain('C2PA');
    sameBytes(result.bytes, input);
  });

  test('an empty file is left alone with a message', () => {
    const result = stripMediaMetadata(new Uint8Array(0));
    expect(result.changed).toBe(false);
    expect(result.message).not.toBe('');
  });

  test('every MIME type the cleaner can output is mapped', () => {
    for (const format of [
      'jpeg',
      'png',
      'webp',
      'mp4',
      'mov',
      'm4a',
      'mp3',
      'flac',
      'wav',
    ] as const) {
      expect(MEDIA_MIME_TYPES[format]).toMatch(/^(image|video|audio)\//);
    }
  });
});
