// Hash Generator logic: MD5 and SHA digests of text or raw bytes, as lowercase
// hex. Plain functions only, so it runs in the browser and in Node. The SHA
// family comes from WebCrypto (`globalThis.crypto`); MD5 is not in WebCrypto
// and is computed here.

export const HASH_ALGORITHMS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

/** One hex digest per algorithm. An empty string means "not computed". */
export type HashSet = Record<HashAlgorithm, string>;

export const EMPTY_HASHES: HashSet = {
  MD5: '',
  'SHA-1': '',
  'SHA-256': '',
  'SHA-384': '',
  'SHA-512': '',
};

const SHA_ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

// ── MD5 (RFC 1321) ────────────────────────────────────────────────────────────

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_CONSTANTS = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000));

/**
 * MD5 of raw bytes. It works on the bytes as they are, so a file hashes to the
 * same value `md5sum` prints. Full blocks are read in place; only the padded
 * tail is copied, so a large file is not duplicated in memory.
 */
function md5Hex(bytes: Uint8Array): string {
  let a0 = 0x67452301;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476;
  const words = new Uint32Array(16);

  const processBlock = (view: DataView, offset: number) => {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, true);

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      f = (f + a + MD5_CONSTANTS[i] + words[g]) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((f << MD5_SHIFTS[i]) | (f >>> (32 - MD5_SHIFTS[i])))) | 0;
    }

    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  };

  const fullLength = bytes.length - (bytes.length % 64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < fullLength; offset += 64) processBlock(view, offset);

  // The rest of the message, a 0x80 byte, zero padding and the message length
  // in bits as a 64-bit little-endian number.
  const rest = bytes.length - fullLength;
  const tail = new Uint8Array(rest < 56 ? 64 : 128);
  tail.set(bytes.subarray(fullLength));
  tail[rest] = 0x80;
  const tailView = new DataView(tail.buffer);
  tailView.setUint32(tail.length - 8, (bytes.length * 8) >>> 0, true);
  tailView.setUint32(tail.length - 4, Math.floor(bytes.length / 0x20000000), true);
  for (let offset = 0; offset < tail.length; offset += 64) processBlock(tailView, offset);

  const digest = new DataView(new ArrayBuffer(16));
  digest.setInt32(0, a0, true);
  digest.setInt32(4, b0, true);
  digest.setInt32(8, c0, true);
  digest.setInt32(12, d0, true);
  return toHex(new Uint8Array(digest.buffer));
}

// ── Interface ─────────────────────────────────────────────────────────────────

/**
 * Every supported digest of `data`. Text is hashed as UTF-8; bytes are hashed
 * as they are. An empty input is valid and has well-known digests.
 */
export async function computeHashes(data: string | ArrayBuffer | Uint8Array): Promise<HashSet> {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);

  const hashes: HashSet = { ...EMPTY_HASHES, MD5: md5Hex(bytes) };
  await Promise.all(
    SHA_ALGORITHMS.map(async (algorithm) => {
      const digest = await crypto.subtle.digest(algorithm, bytes as Uint8Array<ArrayBuffer>);
      hashes[algorithm] = toHex(new Uint8Array(digest));
    })
  );
  return hashes;
}

/**
 * The algorithm whose digest equals `expected`, or null. Surrounding
 * whitespace and letter case are ignored, so a checksum copied from a download
 * page or printed in upper case still matches.
 */
export function findMatchingAlgorithm(hashes: HashSet, expected: string): HashAlgorithm | null {
  const wanted = expected.trim().toLowerCase();
  if (!wanted) return null;
  return HASH_ALGORITHMS.find((algorithm) => hashes[algorithm] !== '' && hashes[algorithm] === wanted) ?? null;
}
