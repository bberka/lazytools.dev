/**
 * GZip for text: compress a string to Base64-encoded GZip, or turn such a
 * Base64 string back into text. Uses the platform's Compression Streams, so
 * it runs in browsers and in Node without a library.
 *
 * `runGzip` rejects with an Error whose message can be shown to the user.
 */

export type GzipMode = 'compress' | 'decompress';

export interface GzipResult {
  output: string;
  /** UTF-8 size of the input text, in bytes. */
  inputSize: number;
  /** UTF-8 size of the output text, in bytes. */
  outputSize: number;
}

/** Bytes handed to `String.fromCharCode` at once; a whole large array overflows the call stack. */
const BASE64_CHUNK = 0x8000;

function utf8Size(text: string): number {
  return new TextEncoder().encode(text).length;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
  }
  return btoa(binary);
}

/** Reads standard or URL-safe Base64, with or without padding; whitespace is ignored. */
function base64ToBytes(base64: string): Uint8Array {
  const compact = base64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const body = compact.replace(/=+$/, '');

  if (!body || !/^[A-Za-z0-9+/]+$/.test(body) || compact.length - body.length > 2 || body.length % 4 === 1) {
    throw new Error('The input is not valid Base64.');
  }

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function transform(bytes: Uint8Array, mode: GzipMode): Promise<Uint8Array> {
  const stream = mode === 'compress' ? new CompressionStream('gzip') : new DecompressionStream('gzip');
  // Piping from a Blob leaves one promise to await, so bad data cannot leave a rejection unhandled.
  const piped = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

/**
 * Compresses `input` to Base64 GZip, or decompresses Base64 GZip to text,
 * and reports the UTF-8 sizes of both sides.
 */
export async function runGzip(mode: GzipMode, input: string): Promise<GzipResult> {
  if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') {
    throw new Error('This browser does not support GZip compression streams.');
  }

  let output: string;

  if (mode === 'compress') {
    output = bytesToBase64(await transform(new TextEncoder().encode(input), 'compress'));
  } else {
    const bytes = base64ToBytes(input);
    let inflated: Uint8Array;
    try {
      inflated = await transform(bytes, 'decompress');
    } catch {
      throw new Error('The input is Base64 but not valid GZip data.');
    }
    output = new TextDecoder().decode(inflated);
  }

  return { output, inputSize: utf8Size(input), outputSize: utf8Size(output) };
}

/**
 * How the output size compares with the input: `62.5% smaller`, or
 * `620.0% larger` when compressing made it grow. Null when there is no input.
 */
export function sizeChangeLabel(inputSize: number, outputSize: number): string | null {
  if (!(inputSize > 0)) return null;

  const saved = (1 - outputSize / inputSize) * 100;
  return saved >= 0 ? `${saved.toFixed(1)}% smaller` : `${(-saved).toFixed(1)}% larger`;
}
