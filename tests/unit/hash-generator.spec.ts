import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import {
  EMPTY_HASHES,
  HASH_ALGORITHMS,
  computeHashes,
  findMatchingAlgorithm,
  type HashAlgorithm,
} from '@/lib/tools/hash-generator';

const NODE_NAMES: Record<HashAlgorithm, string> = {
  MD5: 'md5',
  'SHA-1': 'sha1',
  'SHA-256': 'sha256',
  'SHA-384': 'sha384',
  'SHA-512': 'sha512',
};

/** The digests Node's own implementation gives for the same bytes. */
function reference(bytes: Uint8Array) {
  return Object.fromEntries(
    HASH_ALGORITHMS.map((algorithm) => [algorithm, createHash(NODE_NAMES[algorithm]).update(bytes).digest('hex')])
  );
}

/** Repeatable pseudo-random bytes, so a failure can be reproduced. */
function pseudoRandomBytes(length: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[i] = state >>> 24;
  }
  return bytes;
}

test.describe('computeHashes', () => {
  test('hashes text as UTF-8 with the published digests', async () => {
    expect(await computeHashes('abc')).toEqual({
      MD5: '900150983cd24fb0d6963f7d28e17f72',
      'SHA-1': 'a9993e364706816aba3e25717850c26c9cd0d89d',
      'SHA-256': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      'SHA-384':
        'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
      'SHA-512':
        'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    });
  });

  test('gives the well-known digests of an empty input', async () => {
    const hashes = await computeHashes('');
    expect(hashes.MD5).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(hashes['SHA-1']).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(hashes['SHA-256']).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await computeHashes(new ArrayBuffer(0))).toEqual(hashes);
  });

  test('hashes Unicode and emoji text as its UTF-8 bytes', async () => {
    const text = 'Grüße, 世界 👋🏽';
    expect(await computeHashes(text)).toEqual(reference(new TextEncoder().encode(text)));
  });

  // Defect: MD5 threw "URI malformed" on half of a surrogate pair (text cut in
  // the middle of an emoji), which left the hashes of the previous text on
  // screen. It is now encoded like every other algorithm does it, as U+FFFD.
  test('hashes text with an unpaired surrogate instead of failing', async () => {
    const hashes = await computeHashes('cut \ud83d');
    expect(hashes).toEqual(reference(new TextEncoder().encode('cut �')));
  });

  // Defect: the MD5 of a file was computed from a text conversion of its
  // bytes, so every file with a byte of 0x80 or above got a wrong checksum.
  test('hashes bytes of 0x80 and above as they are', async () => {
    const bytes = new Uint8Array([0x80, 0xff, 0x00, 0x41]);
    const hashes = await computeHashes(bytes);
    expect(hashes.MD5).toBe('9c7288b6dae72c6103f3109cbe9e5a1b');
    expect(hashes).toEqual(reference(bytes));
  });

  test('matches the reference for every byte value', async () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(await computeHashes(bytes)).toEqual(reference(bytes));
  });

  test('matches the reference around the MD5 block and padding boundaries', async () => {
    for (const length of [1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 129, 1000]) {
      const bytes = pseudoRandomBytes(length, length);
      expect((await computeHashes(bytes)).MD5, `length ${length}`).toBe(reference(bytes).MD5);
    }
  });

  test('matches the reference for a multi-megabyte input', async () => {
    const bytes = pseudoRandomBytes(3 * 1024 * 1024 + 17, 7);
    expect(await computeHashes(bytes)).toEqual(reference(bytes));
  });

  test('accepts an ArrayBuffer and a view into a larger buffer', async () => {
    const whole = pseudoRandomBytes(300, 3);
    const view = whole.subarray(100, 230);
    const expected = reference(view);
    expect(await computeHashes(view)).toEqual(expected);
    expect(await computeHashes(view.slice().buffer)).toEqual(expected);
  });
});

test.describe('findMatchingAlgorithm', () => {
  test('names the algorithm whose digest was pasted', async () => {
    const hashes = await computeHashes('abc');
    for (const algorithm of HASH_ALGORITHMS) {
      expect(findMatchingAlgorithm(hashes, hashes[algorithm])).toBe(algorithm);
    }
  });

  test('ignores surrounding whitespace and letter case', async () => {
    const hashes = await computeHashes('abc');
    expect(findMatchingAlgorithm(hashes, `  ${hashes['SHA-256'].toUpperCase()}\n`)).toBe('SHA-256');
  });

  test('returns null for a different, empty or blank checksum', async () => {
    const hashes = await computeHashes('abc');
    expect(findMatchingAlgorithm(hashes, 'd41d8cd98f00b204e9800998ecf8427e')).toBeNull();
    expect(findMatchingAlgorithm(hashes, '')).toBeNull();
    expect(findMatchingAlgorithm(hashes, '   ')).toBeNull();
  });

  test('never matches while nothing has been computed', () => {
    expect(findMatchingAlgorithm(EMPTY_HASHES, '')).toBeNull();
    expect(findMatchingAlgorithm(EMPTY_HASHES, 'abc')).toBeNull();
  });
});
