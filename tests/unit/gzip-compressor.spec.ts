import { test, expect } from '@playwright/test';
import { runGzip, sizeChangeLabel } from '@/lib/tools/gzip-compressor';

const utf8Size = (text: string) => new TextEncoder().encode(text).length;

async function roundTrip(text: string): Promise<string> {
  const compressed = await runGzip('compress', text);
  return (await runGzip('decompress', compressed.output)).output;
}

/** Text that barely compresses, so the GZip output stays about as large as the input. */
function noise(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let state = 12345;
  let text = '';
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    text += alphabet[state >>> 26];
  }
  return text;
}

test.describe('runGzip', () => {
  test('compresses to Base64 of a GZip stream', async () => {
    const { output } = await runGzip('compress', 'hello hello hello hello');
    expect(output).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);

    const bytes = Buffer.from(output, 'base64');
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
  });

  test('round-trips plain, multi-line and Unicode text', async () => {
    for (const text of [
      'hello',
      'line one\nline two\r\n\ttabbed',
      '  leading and trailing spaces  ',
      'Grüße, 你好, 🌍👩‍👩‍👧‍👦',
      'a'.repeat(50_000),
    ]) {
      expect(await roundTrip(text)).toBe(text);
    }
  });

  test('compresses text whose result is far larger than one argument list can hold', async () => {
    const text = noise(600_000);
    const compressed = await runGzip('compress', text);

    expect(compressed.outputSize).toBeGreaterThan(300_000);
    expect((await runGzip('decompress', compressed.output)).output).toBe(text);
  });

  test('reports the UTF-8 size of both sides', async () => {
    const text = 'Grüße 🌍 '.repeat(200);
    const compressed = await runGzip('compress', text);
    expect(compressed.inputSize).toBe(utf8Size(text));
    expect(compressed.outputSize).toBe(compressed.output.length);
    expect(compressed.outputSize).toBeLessThan(compressed.inputSize);

    const restored = await runGzip('decompress', compressed.output);
    expect(restored.inputSize).toBe(compressed.output.length);
    expect(restored.outputSize).toBe(utf8Size(text));
  });

  test('reads Base64 that is wrapped, unpadded or URL-safe', async () => {
    // Look for a result that has both characters the URL-safe alphabet replaces.
    let text = '';
    let output = '';
    for (let i = 0; !(output.includes('+') && output.includes('/')); i++) {
      text = noise(200 + i);
      output = (await runGzip('compress', text)).output;
    }

    const wrapped = `  ${output.replace(/(.{20})/g, '$1\n')}  \n`;
    expect((await runGzip('decompress', wrapped)).output).toBe(text);

    const unpadded = output.replace(/=+$/, '');
    expect((await runGzip('decompress', unpadded)).output).toBe(text);

    const urlSafe = unpadded.replace(/\+/g, '-').replace(/\//g, '_');
    expect((await runGzip('decompress', urlSafe)).output).toBe(text);
  });

  test('says when the input is not Base64', async () => {
    for (const input of ['not base64 at all!', 'abc$def', 'A', 'QUJD====', '']) {
      await expect(runGzip('decompress', input), JSON.stringify(input)).rejects.toThrow('The input is not valid Base64.');
    }
  });

  test('says when the Base64 does not hold GZip data', async () => {
    const plain = Buffer.from('this is plain text, not a gzip stream').toString('base64');
    await expect(runGzip('decompress', plain)).rejects.toThrow('The input is Base64 but not valid GZip data.');
  });

  test('leaves no rejection unhandled when decompression fails', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);

    try {
      const plain = Buffer.from('definitely not gzip').toString('base64');
      await expect(runGzip('decompress', plain)).rejects.toThrow();
      // Unhandled rejections are reported after the microtask queue drains.
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toEqual([]);
  });
});

test.describe('sizeChangeLabel', () => {
  test('says how much smaller the output is', () => {
    expect(sizeChangeLabel(1000, 375)).toBe('62.5% smaller');
    expect(sizeChangeLabel(200, 200)).toBe('0.0% smaller');
  });

  test('says "larger" instead of a negative saving when the output grew', () => {
    expect(sizeChangeLabel(5, 36)).toBe('620.0% larger');
    expect(sizeChangeLabel(100, 150)).toBe('50.0% larger');
  });

  test('has nothing to say without input', () => {
    expect(sizeChangeLabel(0, 20)).toBeNull();
    expect(sizeChangeLabel(Number.NaN, 20)).toBeNull();
  });
});
