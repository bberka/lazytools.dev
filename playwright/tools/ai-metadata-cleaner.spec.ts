import { test, expect, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { openFileChooser } from '../support/file-chooser';

/**
 * End-to-end flows for the AI Metadata Cleaner: text mode (invisible
 * characters and tracking parameters), image mode (a PNG carrying a
 * Stable Diffusion "parameters" chunk) and audio mode (an MP3 with an ID3v2
 * tag naming a generator).
 *
 * The files are assembled here byte by byte; expected values are worked out
 * from the fixture, never read back from the tool.
 */

const SLUG = 'ai-metadata-cleaner';

/**
 * Opens a tool page and waits until it reacts to input. The export ships
 * server-rendered HTML, so the controls exist before React owns them; the tool
 * page records itself as recently used from an effect, which only runs once it
 * has hydrated.
 */
async function openTool(page: Page, slug: string, name: string) {
  await page.goto(`/tools/${slug}/`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('dev-toolbox:recent') ?? ''))
    .toContain(`"${slug}"`);
}

// ── PNG fixture ──────────────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A 2x2 RGBA PNG with one tEXt chunk between the header and the pixels. */
function pngWithParameters(parameters: string): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.concat([0, 1].map(() => Buffer.from([0, 255, 0, 0, 255, 0, 255, 0, 255])));
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('tEXt', Buffer.from(`parameters\0${parameters}`, 'latin1')),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── MP3 fixture ──────────────────────────────────────────────────────────────

const syncsafe = (value: number) => [
  (value >>> 21) & 0x7f,
  (value >>> 14) & 0x7f,
  (value >>> 7) & 0x7f,
  value & 0x7f,
];

function id3TextFrame(id: string, value: string): Buffer {
  const body = Buffer.concat([Buffer.from([0]), Buffer.from(value, 'latin1')]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length);
  return Buffer.concat([Buffer.from(id, 'ascii'), size, Buffer.from([0, 0]), body]);
}

/** One ID3v2.3 tag with a title and an encoder naming Suno, then one MPEG frame. */
function mp3WithTags(): { file: Buffer; audio: Buffer } {
  const frames = Buffer.concat([id3TextFrame('TIT2', 'Song'), id3TextFrame('TSSE', 'Suno v4')]);
  const header = Buffer.concat([
    Buffer.from('ID3', 'ascii'),
    Buffer.from([3, 0, 0]),
    Buffer.from(syncsafe(frames.length)),
  ]);
  const audio = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(64, 0x21)]);
  const id3v1 = Buffer.concat([Buffer.from('TAG', 'ascii'), Buffer.alloc(125, 0)]);
  return { file: Buffer.concat([header, frames, audio, id3v1]), audio };
}

test.describe('AI Metadata Cleaner', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');
  test.use({ locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] });

  test('text mode removes hidden characters and tracking parameters, counts them and honours the switches', async ({
    page,
  }) => {
    await openTool(page, SLUG, 'AI Metadata Cleaner');
    await page.getByRole('tab', { name: 'Text' }).click();

    const input = page.getByRole('textbox', { name: 'Text to clean' });
    const output = page.getByRole('textbox', { name: 'Cleaned text' });
    const row = (label: string) =>
      page
        .getByRole('list', { name: 'Cleanup categories' })
        .getByRole('listitem')
        .filter({ hasText: label });

    // One zero-width space, one narrow no-break space and one tracked link.
    await input.fill('Read​ this: https://example.com/a?id=1&utm_source=chatgpt.com');

    await expect(output).toHaveValue('Read this: https://example.com/a?id=1');
    await expect(row('Zero-width and invisible characters')).toContainText('1 found');
    await expect(row('Exotic spaces')).toContainText('1 found');
    await expect(row('Tracking parameters in URLs')).toContainText('1 found');
    await expect(row('Soft hyphens')).toContainText('0 found');
    await expect(page.getByRole('status').filter({ hasText: 'changes applied' })).toHaveText(
      '3 changes applied.'
    );

    // Switching a category off keeps its characters but still counts them.
    await page.getByRole('switch', { name: 'Tracking parameters in URLs' }).click();
    await expect(output).toHaveValue(
      'Read this: https://example.com/a?id=1&utm_source=chatgpt.com'
    );
    await expect(row('Tracking parameters in URLs')).toContainText('1 found');
    await expect(page.getByRole('status').filter({ hasText: 'changes applied' })).toHaveText(
      '2 changes applied.'
    );

    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe('Read this: https://example.com/a?id=1&utm_source=chatgpt.com');

    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(output).toHaveValue('');
  });

  test('image mode reports a Stable Diffusion chunk, removes it and offers a smaller download', async ({
    page,
  }) => {
    await openTool(page, SLUG, 'AI Metadata Cleaner');

    const parameters = `a cat in a hat, ${'masterpiece, '.repeat(120)}\nSteps: 20, Sampler: Euler a, CFG scale: 7`;
    const original = pngWithParameters(parameters);

    // The page is pre-rendered; a click before React attaches its handlers opens nothing, so it is repeated.
    const area = page.getByRole('button', {
      name: 'Drag & drop media files or click to browse',
    });
    await expect(async () => {
      const chooser = await openFileChooser(page, () => area.click(), { timeout: 2_000 });
      await chooser.setFiles({ name: 'cat.png', mimeType: 'image/png', buffer: original });
    }).toPass({ timeout: 20_000 });

    await expect(page.getByText('cat.png', { exact: true })).toBeVisible();
    await expect(page.getByText('Stable Diffusion parameters', { exact: true })).toBeVisible();
    await expect(page.getByText('Generation prompt/parameters')).toBeVisible();
    await expect(page.getByText('PNG tEXt "parameters"')).toBeVisible();
    await expect(page.getByText('Re-scan clean')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('cat-clean.png');
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
    const cleaned = Buffer.concat(chunks);

    expect(cleaned.length).toBeLessThan(original.length);
    expect(cleaned.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(cleaned.includes(Buffer.from('parameters'))).toBe(false);
    expect(cleaned.includes(Buffer.from('tEXt'))).toBe(false);
    // The pixel chunk is carried over byte for byte.
    const idat = pngChunk(
      'IDAT',
      deflateSync(Buffer.concat([0, 1].map(() => Buffer.from([0, 255, 0, 0, 255, 0, 255, 0, 255]))))
    );
    expect(cleaned.includes(idat)).toBe(true);
  });

  test('image mode leaves a file that is not a valid image alone and says so', async ({ page }) => {
    await openTool(page, SLUG, 'AI Metadata Cleaner');
    const area = page.getByRole('button', {
      name: 'Drag & drop media files or click to browse',
    });
    await expect(async () => {
      const chooser = await openFileChooser(page, () => area.click(), { timeout: 2_000 });
      await chooser.setFiles({
        name: 'broken.png',
        mimeType: 'image/png',
        buffer: Buffer.from('this is not a picture'),
      });
    }).toPass({ timeout: 20_000 });

    await expect(page.getByText('Not cleaned')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'left unchanged' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(0);
  });

  test('audio mode cuts an ID3 tag off an MP3 and offers the audio alone for download', async ({
    page,
  }) => {
    await openTool(page, SLUG, 'AI Metadata Cleaner');

    const { file, audio } = mp3WithTags();
    // The page is pre-rendered; a click before React attaches its handlers opens nothing, so it is repeated.
    const area = page.getByRole('button', {
      name: 'Drag & drop media files or click to browse',
    });
    await expect(async () => {
      const chooser = await openFileChooser(page, () => area.click(), { timeout: 2_000 });
      await chooser.setFiles({ name: 'song.mp3', mimeType: 'audio/mpeg', buffer: file });
    }).toPass({ timeout: 20_000 });

    await expect(page.getByText('song.mp3', { exact: true })).toBeVisible();
    // Two blocks are cut: the ID3v2 tag in front and the ID3v1 tag at the end.
    await expect(page.getByText('Audio tags')).toHaveCount(2);
    await expect(page.getByText('ID3v2.3 tag (TIT2, TSSE)', { exact: true })).toBeVisible();
    await expect(page.getByText('ID3v1 tag', { exact: true })).toBeVisible();
    await expect(page.getByText('Suno', { exact: true })).toBeVisible();
    await expect(page.getByText('Re-scan clean')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('song-clean.mp3');
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
    // Only the MPEG audio frame is left: no ID3v2 header, no ID3v1 trailer, no title.
    expect(Buffer.concat(chunks).equals(audio)).toBe(true);
  });
});
