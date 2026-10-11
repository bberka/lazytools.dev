import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import {
  HMAC_ALGORITHMS,
  computeHmac,
  decodeKey,
  digestLength,
  encodeDigest,
  hmacDigest,
  timingSafeEqual,
  verifySignature,
  type Bytes,
  type HmacAlgorithm,
} from '@/lib/tools/hmac-generator';

/** Hex text to bytes through the module's own key decoder. */
function fromHex(text: string): Bytes {
  const decoded = decodeKey(text, 'hex');
  if (!decoded.ok) throw new Error(decoded.error);
  return decoded.bytes;
}

const utf8 = (text: string): Bytes => new TextEncoder().encode(text);
const repeatByte = (byte: number, count: number): Bytes => new Uint8Array(count).fill(byte);

async function hmacHex(algorithm: HmacAlgorithm, key: Bytes, data: Bytes): Promise<string> {
  return encodeDigest(await hmacDigest(algorithm, key, data), 'hex');
}

interface Vector {
  name: string;
  key: Bytes;
  data: Bytes;
  expected: Partial<Record<HmacAlgorithm, string>>;
}

// RFC 4231, section 4 (test cases 1 to 4, plus the large-key cases 6 and 7).
const RFC_4231: Vector[] = [
  {
    name: 'RFC 4231 test case 1',
    key: repeatByte(0x0b, 20),
    data: utf8('Hi There'),
    expected: {
      'SHA-256': 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
      'SHA-384':
        'afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6',
      'SHA-512':
        '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854',
    },
  },
  {
    name: 'RFC 4231 test case 2',
    key: utf8('Jefe'),
    data: utf8('what do ya want for nothing?'),
    expected: {
      'SHA-256': '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
      'SHA-384':
        'af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649',
      'SHA-512':
        '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
    },
  },
  {
    name: 'RFC 4231 test case 3',
    key: repeatByte(0xaa, 20),
    data: repeatByte(0xdd, 50),
    expected: {
      'SHA-256': '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe',
      'SHA-384':
        '88062608d3e6ad8a0aa2ace014c8a86f0aa635d947ac9febe83ef4e55966144b2a5ab39dc13814b94e3ab6e101a34f27',
      'SHA-512':
        'fa73b0089d56a284efb0f0756c890be9b1b5dbdd8ee81a3655f83e33b2279d39bf3e848279a722c806b485a47e67c807b946a337bee8942674278859e13292fb',
    },
  },
  {
    name: 'RFC 4231 test case 4',
    key: fromHex('0102030405060708090a0b0c0d0e0f10111213141516171819'),
    data: repeatByte(0xcd, 50),
    expected: {
      'SHA-256': '82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b',
      'SHA-384':
        '3e8a69b7783c25851933ab6290af6ca77a9981480850009cc5577c6e1f573b4e6801dd23c4a7d679ccf8a386c674cffb',
      'SHA-512':
        'b0ba465637458c6990e5a8c5f61d4af7e576d97ff94b872de76f8050361ee3dba91ca5c11aa25eb4d679275cc5788063a5f19741120c4f2de2adebeb10a298dd',
    },
  },
  {
    name: 'RFC 4231 test case 6 (key longer than the block size)',
    key: repeatByte(0xaa, 131),
    data: utf8('Test Using Larger Than Block-Size Key - Hash Key First'),
    expected: {
      'SHA-256': '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
      'SHA-384':
        '4ece084485813e9088d2c63a041bc5b44f9ef1012a2b588f3cd11f05033ac4c60c2ef6ab4030fe8296248df163f44952',
      'SHA-512':
        '80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f3526b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598',
    },
  },
  {
    name: 'RFC 4231 test case 7 (long key and long data)',
    key: repeatByte(0xaa, 131),
    data: utf8(
      'This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.'
    ),
    expected: {
      'SHA-256': '9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2',
      'SHA-384':
        '6617178e941f020d351e2f254e8fd32c602420feb0b8fb9adccebb82461e99c5a678cc31e799176d3860e6110c46523e',
      'SHA-512':
        'e37b6a775dc87dbaa4dfa9f96e5e3ffddebd71f8867289865df5a32d20cdc944b6022cac3c4982b10d5eeb55c3e4de15134676fb6de0446065c97440fa8c6a58',
    },
  },
];

// RFC 2202, section 3 (HMAC-SHA-1).
const RFC_2202_SHA1: Vector[] = [
  {
    name: 'RFC 2202 test case 1',
    key: repeatByte(0x0b, 20),
    data: utf8('Hi There'),
    expected: { 'SHA-1': 'b617318655057264e28bc0b6fb378c8ef146be00' },
  },
  {
    name: 'RFC 2202 test case 2',
    key: utf8('Jefe'),
    data: utf8('what do ya want for nothing?'),
    expected: { 'SHA-1': 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79' },
  },
  {
    name: 'RFC 2202 test case 3',
    key: repeatByte(0xaa, 20),
    data: repeatByte(0xdd, 50),
    expected: { 'SHA-1': '125d7342b9ac11cd91a39af48aa17b4f63f175d3' },
  },
  {
    name: 'RFC 2202 test case 4',
    key: fromHex('0102030405060708090a0b0c0d0e0f10111213141516171819'),
    data: repeatByte(0xcd, 50),
    expected: { 'SHA-1': '4c9007f4026250c6bc8414f9bf50c86c2d7235da' },
  },
  {
    name: 'RFC 2202 test case 5 (full digest, not truncated)',
    key: repeatByte(0x0c, 20),
    data: utf8('Test With Truncation'),
    expected: { 'SHA-1': '4c1a03424b55e07fe7f27be1d58bb9324a9a5a04' },
  },
  {
    name: 'RFC 2202 test case 6 (key longer than the block size)',
    key: repeatByte(0xaa, 80),
    data: utf8('Test Using Larger Than Block-Size Key - Hash Key First'),
    expected: { 'SHA-1': 'aa4ae5e15272d00e95705637ce8a3b55ed402112' },
  },
  {
    name: 'RFC 2202 test case 7 (long key and long data)',
    key: repeatByte(0xaa, 80),
    data: utf8('Test Using Larger Than Block-Size Key and Larger Than One Block-Size Data'),
    expected: { 'SHA-1': 'e8e99d0f45237d786d6bbaa7965c7808bbff1a91' },
  },
];

test.describe('published test vectors (hmacDigest)', () => {
  for (const vector of [...RFC_4231, ...RFC_2202_SHA1]) {
    test(vector.name, async () => {
      for (const [algorithm, expected] of Object.entries(vector.expected) as [HmacAlgorithm, string][]) {
        expect(await hmacHex(algorithm, vector.key, vector.data), algorithm).toBe(expected);
      }
    });
  }
});

test.describe('computeHmac', () => {
  test('RFC 4231 case 2 from UTF-8 key and message text', async () => {
    const result = await computeHmac({
      message: 'what do ya want for nothing?',
      key: 'Jefe',
      keyEncoding: 'utf8',
      algorithm: 'SHA-256',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encodeDigest(result.digest, 'hex')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
    );
    expect(result.keyBytes).toBe(4);
  });

  test('RFC 4231 case 1 from a hex key, with spaces and a 0x prefix tolerated', async () => {
    const result = await computeHmac({
      message: 'Hi There',
      key: '0x0b0b0b0b 0b0b0b0b 0b0b0b0b 0b0b0b0b 0b0b0b0b',
      keyEncoding: 'hex',
      algorithm: 'SHA-512',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encodeDigest(result.digest, 'hex')).toBe(
      '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854'
    );
    expect(result.keyBytes).toBe(20);
  });

  test('RFC 2202 case 2 from a Base64 key', async () => {
    const result = await computeHmac({
      message: 'what do ya want for nothing?',
      key: 'SmVmZQ==', // "Jefe"
      keyEncoding: 'base64',
      algorithm: 'SHA-1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encodeDigest(result.digest, 'hex')).toBe('effcdf6ae5eb2fa2d27416d5f184df9c259a7c79');
  });

  test('the same key as UTF-8, hex and Base64 gives the same HMAC', async () => {
    const base = { message: 'payload', algorithm: 'SHA-384' } as const;
    const fromText = await computeHmac({ ...base, key: 'Jefe', keyEncoding: 'utf8' });
    const fromHexKey = await computeHmac({ ...base, key: '4a656665', keyEncoding: 'hex' });
    const fromB64 = await computeHmac({ ...base, key: 'SmVmZQ', keyEncoding: 'base64' });
    expect(fromText.ok && fromHexKey.ok && fromB64.ok).toBe(true);
    if (!fromText.ok || !fromHexKey.ok || !fromB64.ok) return;
    const expected = encodeDigest(fromText.digest, 'hex');
    expect(encodeDigest(fromHexKey.digest, 'hex')).toBe(expected);
    expect(encodeDigest(fromB64.digest, 'hex')).toBe(expected);
  });

  test('digest sizes match the algorithm', async () => {
    for (const algorithm of HMAC_ALGORITHMS) {
      const result = await computeHmac({ message: 'm', key: 'k', keyEncoding: 'utf8', algorithm });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.digest.length).toBe(digestLength(algorithm));
    }
    expect(HMAC_ALGORITHMS.map(digestLength)).toEqual([20, 32, 48, 64]);
  });

  test('an empty key is valid and equals a single zero byte (HMAC zero-pads the key)', async () => {
    for (const algorithm of HMAC_ALGORITHMS) {
      const empty = await computeHmac({ message: 'abc', key: '', keyEncoding: 'utf8', algorithm });
      const zero = await computeHmac({ message: 'abc', key: '00', keyEncoding: 'hex', algorithm });
      expect(empty.ok && zero.ok).toBe(true);
      if (!empty.ok || !zero.ok) continue;
      expect(encodeDigest(empty.digest, 'hex')).toBe(encodeDigest(zero.digest, 'hex'));
      expect(empty.keyBytes).toBe(0);
      const expected = createHmac(algorithm.replace('-', '').toLowerCase(), '').update('abc').digest('hex');
      expect(encodeDigest(empty.digest, 'hex')).toBe(expected);
    }
  });

  test('an empty message is valid', async () => {
    const result = await computeHmac({ message: '', key: '', keyEncoding: 'utf8', algorithm: 'SHA-256' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encodeDigest(result.digest, 'hex')).toBe(
      'b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad'
    );
  });

  test('agrees with node:crypto on non-ASCII text, emoji and a long key', async () => {
    const message = 'Grüße, 世界 😀 line one\nline two\r\n';
    const key = 'пароль-🔑-'.repeat(30);
    for (const algorithm of HMAC_ALGORITHMS) {
      const result = await computeHmac({ message, key, keyEncoding: 'utf8', algorithm });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const expected = createHmac(algorithm.replace('-', '').toLowerCase(), key).update(message).digest('hex');
      expect(encodeDigest(result.digest, 'hex')).toBe(expected);
    }
  });

  test('reports an invalid hex key as an error result instead of throwing', async () => {
    for (const key of ['xyz', 'abc', '0b0g', '12 3']) {
      const result = await computeHmac({ message: 'm', key, keyEncoding: 'hex', algorithm: 'SHA-256' });
      expect(result.ok, key).toBe(false);
      if (result.ok) continue;
      expect(result.error).toMatch(/hex/i);
    }
  });

  test('reports an invalid Base64 key as an error result instead of throwing', async () => {
    for (const key of ['!!!!', 'a', 'ab=c', 'abcde', 'a+b_', 'ab===', 'ab=']) {
      const result = await computeHmac({ message: 'm', key, keyEncoding: 'base64', algorithm: 'SHA-256' });
      expect(result.ok, key).toBe(false);
      if (result.ok) continue;
      expect(result.error).toMatch(/base64/i);
    }
  });
});

test.describe('decodeKey', () => {
  test('UTF-8 keeps every character, including multi-byte ones', () => {
    const decoded = decodeKey('é😀', 'utf8');
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(Array.from(decoded.bytes)).toEqual([0xc3, 0xa9, 0xf0, 0x9f, 0x98, 0x80]);
  });

  test('UTF-8 does not trim or alter whitespace', () => {
    const decoded = decodeKey(' a\n', 'utf8');
    expect(decoded.ok && Array.from(decoded.bytes)).toEqual([0x20, 0x61, 0x0a]);
  });

  test('hex accepts either case, whitespace and a 0x prefix', () => {
    for (const text of ['DEADbeef', 'de ad\nbe ef', '0xDEADBEEF', '0Xdeadbeef']) {
      const decoded = decodeKey(text, 'hex');
      expect(decoded.ok && Array.from(decoded.bytes), text).toEqual([0xde, 0xad, 0xbe, 0xef]);
    }
  });

  test('hex rejects odd length, stray characters and names the problem', () => {
    const odd = decodeKey('abc', 'hex');
    expect(odd.ok).toBe(false);
    if (!odd.ok) expect(odd.error).toMatch(/odd/i);

    const bad = decodeKey('12zz', 'hex');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('z');
  });

  test('empty input decodes to an empty key in every encoding', () => {
    for (const encoding of ['utf8', 'hex', 'base64'] as const) {
      const decoded = decodeKey('', encoding);
      expect(decoded.ok && decoded.bytes.length, encoding).toBe(0);
    }
  });

  test('Base64 accepts padded, unpadded and URL-safe forms', () => {
    const expected = [0xfb, 0xff, 0xbf];
    for (const text of ['+/+/', '-_-_', '-_-_\n']) {
      const decoded = decodeKey(text, 'base64');
      expect(decoded.ok && Array.from(decoded.bytes), text).toEqual(expected);
    }
    for (const text of ['SmVmZQ==', 'SmVmZQ', 'Sm Vm\nZQ==']) {
      const decoded = decodeKey(text, 'base64');
      expect(decoded.ok && Array.from(decoded.bytes), text).toEqual([0x4a, 0x65, 0x66, 0x65]);
    }
  });

  test('Base64 rejects bad characters, bad padding, bad length and mixed alphabets', () => {
    const cases: [string, RegExp][] = [
      ['ab$d', /character/i],
      ['ab=c', /character/i],
      ['ab===', /padding/i],
      ['abc=d', /character/i],
      ['abcde', /length/i],
      ['SmVmZQ=', /padding/i],
      ['a+b_', /alphabet/i],
    ];
    for (const [text, message] of cases) {
      const decoded = decodeKey(text, 'base64');
      expect(decoded.ok, text).toBe(false);
      if (!decoded.ok) expect(decoded.error, text).toMatch(message);
    }
  });
});

test.describe('encodeDigest', () => {
  const bytes = new Uint8Array([0xfb, 0xff, 0xbf, 0x00, 0x0a]);

  test('hex is lowercase by default and uppercase on request', () => {
    expect(encodeDigest(bytes, 'hex')).toBe('fbffbf000a');
    expect(encodeDigest(bytes, 'hex', true)).toBe('FBFFBF000A');
  });

  test('Base64 is standard and padded', () => {
    expect(encodeDigest(bytes, 'base64')).toBe('+/+/AAo=');
  });

  test('Base64URL swaps the alphabet and drops the padding', () => {
    expect(encodeDigest(bytes, 'base64url')).toBe('-_-_AAo');
  });

  test('Base64 matches the RFC 4648 vectors for every padding length', () => {
    const cases: [string, string][] = [
      ['', ''],
      ['f', 'Zg=='],
      ['fo', 'Zm8='],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg=='],
      ['fooba', 'Zm9vYmE='],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [text, expected] of cases) {
      expect(encodeDigest(utf8(text), 'base64'), text).toBe(expected);
      expect(encodeDigest(utf8(text), 'base64url'), text).toBe(expected.replace(/=+$/, ''));
    }
  });

  test('hex output round-trips through the hex decoder', () => {
    const decoded = decodeKey(encodeDigest(bytes, 'hex', true), 'hex');
    expect(decoded.ok && Array.from(decoded.bytes)).toEqual(Array.from(bytes));
  });
});

test.describe('timingSafeEqual', () => {
  test('is true only for identical bytes', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([9, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(false);
  });

  test('different lengths are never equal, even when one is a prefix of the other', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2, 0]), new Uint8Array([1, 2]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array(0), new Uint8Array([0]))).toBe(false);
  });

  test('two empty arrays are equal', () => {
    expect(timingSafeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
});

test.describe('verifySignature', () => {
  // RFC 4231 test case 2, HMAC-SHA-256.
  const digest = fromHex('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');

  test('matches the hex output, in either case', () => {
    expect(verifySignature(digest, encodeDigest(digest, 'hex'))).toEqual({ status: 'match', encoding: 'hex' });
    expect(verifySignature(digest, encodeDigest(digest, 'hex', true))).toEqual({
      status: 'match',
      encoding: 'hex',
    });
  });

  test('matches the Base64 output', () => {
    const expected = encodeDigest(digest, 'base64');
    expect(expected).toMatch(/[+/=]/); // make sure this input really is the padded form
    expect(verifySignature(digest, expected)).toEqual({ status: 'match', encoding: 'base64' });
  });

  test('matches the Base64URL output, padded or not', () => {
    const unpadded = encodeDigest(digest, 'base64url');
    expect(verifySignature(digest, unpadded).status).toBe('match');
    expect(verifySignature(digest, `${unpadded}=`).status).toBe('match');

    // A digest whose Base64 form uses + and / so the URL-safe form needs - and _.
    const tricky = fromHex('fbff'.repeat(16));
    const url = encodeDigest(tricky, 'base64url');
    expect(url).toMatch(/[-_]/);
    expect(verifySignature(tricky, url)).toEqual({ status: 'match', encoding: 'base64url' });
    expect(verifySignature(tricky, encodeDigest(tricky, 'base64'))).toEqual({
      status: 'match',
      encoding: 'base64',
    });
  });

  test('ignores surrounding and embedded whitespace', () => {
    const hex = encodeDigest(digest, 'hex');
    expect(verifySignature(digest, `  ${hex.slice(0, 32)}\n${hex.slice(32)}\n`).status).toBe('match');
  });

  test('reports a mismatch when a single digit differs', () => {
    const hex = encodeDigest(digest, 'hex');
    const flipped = `${hex.slice(0, -1)}${hex.endsWith('3') ? '4' : '3'}`;
    expect(verifySignature(digest, flipped)).toEqual({ status: 'mismatch', encoding: 'hex' });

    const b64 = encodeDigest(digest, 'base64url');
    const flippedB64 = `${b64.slice(0, 10)}${b64[10] === 'A' ? 'B' : 'A'}${b64.slice(11)}`;
    expect(verifySignature(digest, flippedB64).status).toBe('mismatch');
  });

  test('a signature for another algorithm is a mismatch that explains the length', () => {
    const sha1 = 'b617318655057264e28bc0b6fb378c8ef146be00';
    const result = verifySignature(digest, sha1);
    expect(result.status).toBe('mismatch');
    if (result.status !== 'mismatch') return;
    expect(result.detail).toMatch(/20 bytes/);
    expect(result.detail).toMatch(/32 bytes/);
  });

  test('a one-byte signature is described in the singular', () => {
    const result = verifySignature(digest, 'ab');
    expect(result).toEqual({
      status: 'mismatch',
      encoding: 'hex',
      detail: 'Decoded to 1 byte, but this HMAC is 32 bytes.',
    });
  });

  test('a truncated signature is a mismatch, not a match', () => {
    const hex = encodeDigest(digest, 'hex');
    expect(verifySignature(digest, hex.slice(0, 32)).status).toBe('mismatch');
  });

  test('empty input is its own state', () => {
    expect(verifySignature(digest, '')).toEqual({ status: 'empty' });
    expect(verifySignature(digest, '  \n ')).toEqual({ status: 'empty' });
  });

  test('text that is no supported encoding is invalid', () => {
    for (const text of ['not a signature!', 'zz$', 'sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843']) {
      const result = verifySignature(digest, text);
      expect(result.status, text).toBe('invalid');
      if (result.status === 'invalid') expect(result.error).toMatch(/hex/i);
    }
  });

  test('Base64 with non-zero trailing bits is not accepted as a match', () => {
    // 43 unpadded characters carry 258 bits for 256 data bits; the last two must be zero.
    const canonical = encodeDigest(digest, 'base64url');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = alphabet.indexOf(canonical[canonical.length - 1]);
    const altered = `${canonical.slice(0, -1)}${alphabet[last + 1]}`;
    expect(verifySignature(digest, altered).status).not.toBe('match');
  });
});
