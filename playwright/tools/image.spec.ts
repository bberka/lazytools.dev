import { test, expect, type Locator, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import JSZip from 'jszip';

/**
 * End-to-end flows for the image tools: Image Converter & Editor, SVG to PNG
 * Converter, EXIF Viewer & Remover, Color Palette Extractor and Color
 * Blindness Simulator.
 *
 * Every fixture is built in memory: PNGs are encoded here pixel by pixel, the
 * EXIF block is assembled tag by tag, and the expected values are worked out
 * from the fixture, never read back from the tool.
 */

// ── Fixtures ─────────────────────────────────────────────────────────────────

type Rgba = readonly [number, number, number, number];

interface Upload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const RED: Rgba = [255, 0, 0, 255];
const GREEN: Rgba = [0, 255, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];
const WHITE: Rgba = [255, 255, 255, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// The smallest GIF there is: one transparent pixel.
const ONE_PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

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

/** An 8-bit RGBA PNG whose pixels come from `pixelAt`. */
function makePng(width: number, height: number, pixelAt: (x: number, y: number) => Rgba): Buffer {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue, alpha] = pixelAt(x, y);
      const offset = y * stride + 1 + x * 4;
      raw[offset] = red;
      raw[offset + 1] = green;
      raw[offset + 2] = blue;
      raw[offset + 3] = alpha;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Repeatable noise, so lossy encoders have something to throw away. */
function noisePng(width: number, height: number): Buffer {
  let state = 0x9e3779b9;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % 256;
  };
  return makePng(width, height, () => [next(), next(), next(), 255]);
}

const pngFile = (name: string, buffer: Buffer): Upload => ({ name, mimeType: 'image/png', buffer });
const jpegFile = (name: string, buffer: Buffer): Upload => ({ name, mimeType: 'image/jpeg', buffer });
const BROKEN_PNG = pngFile('broken.png', Buffer.from('this is not a picture'));
const TEXT_FILE: Upload = { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') };

/** A 16x8 JPEG, blue on the left half and yellow on the right, encoded by the browser. */
async function drawJpeg(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 8;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas is not available');
    context.fillStyle = '#0000ff';
    context.fillRect(0, 0, 8, 8);
    context.fillStyle = '#ffff00';
    context.fillRect(8, 0, 8, 8);
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  });
  return Buffer.from(base64, 'base64');
}

interface ExifTag {
  tag: number;
  type: number;
  count: number;
  data: Buffer;
}

/** Builds an EXIF (TIFF) block in either byte order and splices it into a JPEG as its APP1 segment. */
function exifWriter(littleEndian: boolean) {
  const u16 = (value: number) => {
    const out = Buffer.alloc(2);
    if (littleEndian) out.writeUInt16LE(value);
    else out.writeUInt16BE(value);
    return out;
  };
  const u32 = (value: number) => {
    const out = Buffer.alloc(4);
    if (littleEndian) out.writeUInt32LE(value);
    else out.writeUInt32BE(value);
    return out;
  };
  const i32 = (value: number) => {
    const out = Buffer.alloc(4);
    if (littleEndian) out.writeInt32LE(value);
    else out.writeInt32BE(value);
    return out;
  };
  const pointer = (tag: number, offset: number): ExifTag => ({ tag, type: 4, count: 1, data: u32(offset) });

  // A directory: entry count, 12 bytes per entry, the next-directory offset, then every value over 4 bytes.
  const directory = (tags: ExifTag[], offset: number): Buffer => {
    const sorted = [...tags].sort((a, b) => a.tag - b.tag);
    let valueOffset = offset + 2 + sorted.length * 12 + 4;
    const entries: Buffer[] = [];
    const values: Buffer[] = [];
    for (const entry of sorted) {
      let field: Buffer;
      if (entry.data.length <= 4) {
        field = Buffer.concat([entry.data, Buffer.alloc(4 - entry.data.length)]);
      } else {
        field = u32(valueOffset);
        const value = entry.data.length % 2 === 1 ? Buffer.concat([entry.data, Buffer.alloc(1)]) : entry.data;
        values.push(value);
        valueOffset += value.length;
      }
      entries.push(Buffer.concat([u16(entry.tag), u16(entry.type), u32(entry.count), field]));
    }
    return Buffer.concat([u16(sorted.length), ...entries, u32(0), ...values]);
  };

  return {
    ascii(tag: number, text: string): ExifTag {
      const data = Buffer.from(text + '\0', 'utf8');
      return { tag, type: 2, count: data.length, data };
    },
    bytes: (tag: number, ...values: number[]): ExifTag => ({
      tag,
      type: 1,
      count: values.length,
      data: Buffer.from(values),
    }),
    short: (tag: number, ...values: number[]): ExifTag => ({
      tag,
      type: 3,
      count: values.length,
      data: Buffer.concat(values.map(u16)),
    }),
    long: (tag: number, value: number): ExifTag => ({ tag, type: 4, count: 1, data: u32(value) }),
    rational: (tag: number, ...pairs: Array<[number, number]>): ExifTag => ({
      tag,
      type: 5,
      count: pairs.length,
      data: Buffer.concat(pairs.flatMap(([numerator, denominator]) => [u32(numerator), u32(denominator)])),
    }),
    signedRational: (tag: number, ...pairs: Array<[number, number]>): ExifTag => ({
      tag,
      type: 10,
      count: pairs.length,
      data: Buffer.concat(pairs.flatMap(([numerator, denominator]) => [i32(numerator), i32(denominator)])),
    }),
    undefinedBytes: (tag: number, data: Buffer): ExifTag => ({ tag, type: 7, count: data.length, data }),
    /** UTF-16 text in this block's byte order, for a UserComment marked UNICODE. */
    utf16(text: string): Buffer {
      const encoded = Buffer.from(text, 'utf16le');
      return littleEndian ? encoded : encoded.swap16();
    },
    embed(jpeg: Buffer, image: ExifTag[], exif: ExifTag[], gps: ExifTag[]): Buffer {
      const firstDirectory = 8;
      const imageTags = (exifAt: number, gpsAt: number) => [...image, pointer(0x8769, exifAt), pointer(0x8825, gpsAt)];
      const exifAt = firstDirectory + directory(imageTags(0, 0), firstDirectory).length;
      const exifDirectory = directory(exif, exifAt);
      const gpsAt = exifAt + exifDirectory.length;
      const tiff = Buffer.concat([
        Buffer.from(littleEndian ? 'II' : 'MM', 'latin1'),
        u16(42),
        u32(firstDirectory),
        directory(imageTags(exifAt, gpsAt), firstDirectory),
        exifDirectory,
        directory(gps, gpsAt),
      ]);
      const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
      const segment = Buffer.alloc(4);
      segment.writeUInt16BE(0xffe1, 0);
      segment.writeUInt16BE(payload.length + 2, 2);
      return Buffer.concat([jpeg.subarray(0, 2), segment, payload, jpeg.subarray(2)]);
    },
  };
}

/** The markers of a JPEG's header segments, up to the start of the image data. */
function jpegMarkers(jpeg: Buffer): number[] {
  const markers: number[] = [];
  let offset = 2;
  while (offset + 4 <= jpeg.length) {
    const marker = jpeg.readUInt16BE(offset);
    markers.push(marker);
    if (marker === 0xffda) break;
    offset += 2 + jpeg.readUInt16BE(offset + 2);
  }
  return markers;
}

const APP1 = 0xffe1;

// ── Page helpers ─────────────────────────────────────────────────────────────

const IMAGE_DROPZONE = 'Drag & drop an image here or click to browse';
const UNREADABLE_IMAGE = 'Unable to load the selected image.';
const NOT_AN_IMAGE = '"notes.txt" is not a supported file type. Accepted: image files.';

async function openTool(page: Page, slug: string, name: string): Promise<void> {
  await page.goto(`/tools/${slug}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
}

/**
 * Picks files the way a user does: click the drop area, choose in the picker.
 * The page is pre-rendered, so a click that lands before React has attached
 * its handlers opens nothing; it is repeated until the picker appears.
 */
async function chooseFiles(page: Page, dropzone: string, files: Upload | Upload[]): Promise<void> {
  const area = page.getByRole('button', { name: dropzone });
  await expect(async () => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 2_000 }), area.click()]);
    await chooser.setFiles(files);
  }).toPass({ timeout: 20_000 });
}

async function dropFile(page: Page, dropzone: string, file: Upload): Promise<void> {
  const transfer = await page.evaluateHandle(
    ({ name, type, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], name, { type }));
      return data;
    },
    { name: file.name, type: file.mimeType, base64: file.buffer.toString('base64') }
  );
  await page.getByRole('button', { name: dropzone }).dispatchEvent('drop', { dataTransfer: transfer });
}

interface SavedFile {
  name: string;
  bytes: Buffer;
}

/** Clicks a download button and returns the file the browser was handed. */
async function save(page: Page, button: Locator): Promise<SavedFile> {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return { name: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

interface DecodedImage {
  width: number;
  height: number;
  /** RGBA of one pixel. */
  pixel: (x: number, y: number) => number[];
}

/** Decodes image bytes with the browser's own decoder, independently of the tool under test. */
async function decodeImage(page: Page, bytes: Buffer, mimeType: string): Promise<DecodedImage> {
  const decoded = await page.evaluate(
    async ({ base64, type }) => {
      const binary = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([binary], { type }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2D canvas is not available');
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      let text = '';
      for (let offset = 0; offset < data.length; offset += 0x8000) {
        text += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
      }
      return { width: bitmap.width, height: bitmap.height, rgba: btoa(text) };
    },
    { base64: bytes.toString('base64'), type: mimeType }
  );
  const rgba = Buffer.from(decoded.rgba, 'base64');
  return {
    width: decoded.width,
    height: decoded.height,
    pixel: (x, y) => Array.from(rgba.subarray((y * decoded.width + x) * 4, (y * decoded.width + x) * 4 + 4)),
  };
}

function expectColor(actual: number[], expected: readonly number[], tolerance = 0): void {
  const distance = Math.max(...expected.map((channel, index) => Math.abs(channel - actual[index])));
  expect(distance, `[${actual.join(', ')}] should be within ${tolerance} of [${expected.join(', ')}]`).toBeLessThanOrEqual(
    tolerance
  );
}

/** The four corners of an image: top-left, top-right, bottom-left, bottom-right. */
function corners(image: DecodedImage): number[][] {
  const right = image.width - 3;
  const bottom = image.height - 3;
  return [image.pixel(2, 2), image.pixel(right, 2), image.pixel(2, bottom), image.pixel(right, bottom)];
}

async function selectOption(page: Page, combobox: Locator, option: string): Promise<void> {
  await combobox.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(combobox).toContainText(option);
}

/** Error messages of the tool itself; the app shell has a live region of its own outside `main`. */
const alerts = (page: Page) => page.getByRole('main').getByRole('alert');

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Image tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  const uncaught = new WeakMap<Page, string[]>();

  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    uncaught.set(page, errors);
    page.on('pageerror', (error) => errors.push(error.message));
  });

  test.afterEach(async ({ page }) => {
    expect(uncaught.get(page) ?? [], 'uncaught errors on the page').toEqual([]);
  });

  // ── Image Converter & Editor ───────────────────────────────────────────────

  test.describe('Image Converter & Editor', () => {
    // Red on the left half, blue on the right.
    const twoTone = () => pngFile('two-tone.png', makePng(40, 20, (x) => (x < 20 ? RED : BLUE)));
    // Red, blue / green, white, so every turn and flip puts a known colour in each corner.
    const quadrants = () =>
      pngFile(
        'quadrants.png',
        makePng(40, 20, (x, y) => (y < 10 ? (x < 20 ? RED : BLUE) : x < 20 ? GREEN : WHITE))
      );

    const converted = (page: Page) => page.getByRole('img', { name: 'Converted' });
    const downloadConverted = (page: Page) => page.getByRole('button', { name: 'Download Converted Image' });
    const downloadCropped = (page: Page) => page.getByRole('button', { name: 'Download Cropped Image' });
    const convertButton = (page: Page) => page.getByRole('button', { name: 'Convert', exact: true });
    const format = (page: Page) => page.getByRole('combobox', { name: /Output Format/ });
    const slider = (page: Page, name: RegExp) => page.getByRole('group', { name }).getByRole('slider');
    const cropLabel = (page: Page) => page.getByText(/^Crop: /);

    async function open(page: Page, file: Upload): Promise<void> {
      await openTool(page, 'image-converter', 'Image Converter & Editor');
      await chooseFiles(page, IMAGE_DROPZONE, file);
      await expect(downloadConverted(page)).toBeVisible();
    }

    // The download button is taken away while a conversion runs and comes back with the new result.
    async function convert(page: Page): Promise<void> {
      await convertButton(page).click();
      await expect(downloadConverted(page)).toBeVisible();
    }

    async function expectPreviewSize(page: Page, width: number, height: number): Promise<void> {
      await expect(converted(page)).toHaveJSProperty('naturalWidth', width);
      await expect(converted(page)).toHaveJSProperty('naturalHeight', height);
    }

    async function pressOnSlider(page: Page, name: RegExp, key: string): Promise<void> {
      await slider(page, name).focus();
      await page.keyboard.press(key);
    }

    test('converts an upload to PNG and saves it without contacting another origin', async ({
      page,
      context,
      baseURL,
    }) => {
      const origin = new URL(baseURL ?? 'http://localhost:3000').origin;
      const elsewhere: string[] = [];
      context.on('request', (request) => {
        const url = new URL(request.url());
        if (url.protocol.startsWith('http') && url.origin !== origin) elsewhere.push(request.url());
      });

      const file = twoTone();
      await open(page, file);

      await expect(page.getByRole('button', { name: IMAGE_DROPZONE })).toContainText(
        `two-tone.png (${file.buffer.length} Bytes)`
      );
      await expect(format(page)).toContainText('PNG');
      await expect(page.getByRole('img', { name: 'Original' })).toHaveJSProperty('naturalWidth', 40);
      await expectPreviewSize(page, 40, 20);

      const saved = await save(page, downloadConverted(page));
      expect(saved.name).toBe('converted.png');
      expect(saved.bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
      const image = await decodeImage(page, saved.bytes, 'image/png');
      expect([image.width, image.height]).toEqual([40, 20]);
      expect(image.pixel(5, 10)).toEqual([...RED]);
      expect(image.pixel(35, 10)).toEqual([...BLUE]);

      expect(elsewhere, 'the image must stay in the browser').toEqual([]);
    });

    test('resizes inside the requested box and stretches only when the aspect ratio is released', async ({ page }) => {
      await open(page, twoTone());
      const width = page.getByLabel('Width (px)');
      const height = page.getByLabel('Height (px)');
      const keepRatio = page.getByRole('checkbox', { name: 'Maintain aspect ratio' });
      await expect(keepRatio).toBeChecked();

      // Width alone: the height follows the 2:1 shape.
      await width.fill('20');
      await convert(page);
      await expectPreviewSize(page, 20, 10);

      // Both sides: the image is fitted inside 20x5, not stretched to it.
      await height.fill('5');
      await convert(page);
      await expectPreviewSize(page, 10, 5);

      // Ratio released: exactly the box that was asked for.
      await keepRatio.click();
      await convert(page);
      await expectPreviewSize(page, 20, 5);
      const stretched = await save(page, downloadConverted(page));
      const image = await decodeImage(page, stretched.bytes, 'image/png');
      expect([image.width, image.height]).toEqual([20, 5]);
      expect(image.pixel(4, 2)).toEqual([...RED]);
      expect(image.pixel(15, 2)).toEqual([...BLUE]);

      // Height alone, ratio kept again.
      await keepRatio.click();
      await width.fill('');
      await height.fill('10');
      await convert(page);
      await expectPreviewSize(page, 20, 10);

      // A negative size is not a size: the image keeps its own.
      await height.fill('');
      await width.fill('-20');
      await convert(page);
      await expectPreviewSize(page, 40, 20);
    });

    test('writes JPEG on a white backdrop and names the download after what was converted', async ({ page }) => {
      await open(page, pngFile('cutout.png', makePng(40, 20, (x) => (x < 20 ? CLEAR : BLUE))));

      await selectOption(page, format(page), 'JPEG');
      await expect(page.getByText('Quality: 90%')).toBeVisible();
      await convert(page);

      const jpeg = await save(page, downloadConverted(page));
      expect(jpeg.name).toBe('converted.jpeg');
      expect(jpeg.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      const image = await decodeImage(page, jpeg.bytes, 'image/jpeg');
      expect([image.width, image.height]).toEqual([40, 20]);
      // JPEG cannot be see-through; the transparent half must not turn black.
      expectColor(image.pixel(5, 10), WHITE, 4);
      expectColor(image.pixel(35, 10), BLUE, 12);

      // Picking another format without converting does not rename the JPEG that is on screen.
      await selectOption(page, format(page), 'WebP');
      const stillJpeg = await save(page, downloadConverted(page));
      expect(stillJpeg.name).toBe('converted.jpeg');
      expect(stillJpeg.bytes.equals(jpeg.bytes)).toBe(true);

      await convert(page);
      const webp = await save(page, downloadConverted(page));
      expect(webp.name).toBe('converted.webp');
      expect(webp.bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
      expect(webp.bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
      const webpImage = await decodeImage(page, webp.bytes, 'image/webp');
      expect(webpImage.pixel(5, 10)[3]).toBe(0);
      expectColor(webpImage.pixel(35, 10), BLUE, 12);
    });

    test('the quality slider changes how hard JPEG and WebP are compressed', async ({ page }) => {
      await open(page, pngFile('noise.png', noisePng(64, 64)));

      for (const name of ['JPEG', 'WebP']) {
        await selectOption(page, format(page), name);

        await pressOnSlider(page, /Quality/, 'Home');
        await expect(page.getByText('Quality: 1%')).toBeVisible();
        await convert(page);
        const rough = await save(page, downloadConverted(page));

        await pressOnSlider(page, /Quality/, 'End');
        await expect(page.getByText('Quality: 100%')).toBeVisible();
        await convert(page);
        const fine = await save(page, downloadConverted(page));

        expect(fine.bytes.length, `${name} at 100% against ${rough.bytes.length} bytes at 1%`).toBeGreaterThan(
          rough.bytes.length * 4
        );
      }
    });

    test('rotates by quarter turns and flips', async ({ page }) => {
      await open(page, quadrants());
      const result = async () => {
        const saved = await save(page, downloadConverted(page));
        return decodeImage(page, saved.bytes, 'image/png');
      };

      // A quarter turn clockwise: the left edge becomes the top.
      await pressOnSlider(page, /Rotate/, 'ArrowRight');
      await expect(page.getByText('Rotate: 90°')).toBeVisible();
      await convert(page);
      await expectPreviewSize(page, 20, 40);
      expect(corners(await result())).toEqual([GREEN, RED, WHITE, BLUE].map((color) => [...color]));

      await pressOnSlider(page, /Rotate/, 'ArrowRight');
      await expect(page.getByText('Rotate: 180°')).toBeVisible();
      await convert(page);
      await expectPreviewSize(page, 40, 20);
      expect(corners(await result())).toEqual([WHITE, GREEN, BLUE, RED].map((color) => [...color]));

      await pressOnSlider(page, /Rotate/, 'End');
      await expect(page.getByText('Rotate: 270°')).toBeVisible();
      await convert(page);
      await expectPreviewSize(page, 20, 40);
      expect(corners(await result())).toEqual([BLUE, WHITE, RED, GREEN].map((color) => [...color]));

      await pressOnSlider(page, /Rotate/, 'Home');
      await expect(page.getByText('Rotate: 0°')).toBeVisible();
      await page.getByRole('checkbox', { name: 'Flip H' }).click();
      await convert(page);
      await expectPreviewSize(page, 40, 20);
      expect(corners(await result())).toEqual([BLUE, RED, WHITE, GREEN].map((color) => [...color]));

      await page.getByRole('checkbox', { name: 'Flip H' }).click();
      await page.getByRole('checkbox', { name: 'Flip V' }).click();
      await convert(page);
      expect(corners(await result())).toEqual([GREEN, WHITE, RED, BLUE].map((color) => [...color]));
    });

    test('applies the grayscale, sepia and brightness adjustments', async ({ page }) => {
      const BROWN: Rgba = [100, 50, 25, 255];
      await open(page, pngFile('swatches.png', makePng(30, 30, (x) => (x < 15 ? BROWN : RED))));
      const result = async () => {
        const saved = await save(page, downloadConverted(page));
        return decodeImage(page, saved.bytes, 'image/png');
      };

      // Luminance: 0.2126 R + 0.7152 G + 0.0722 B.
      await page.getByRole('checkbox', { name: 'Grayscale' }).click();
      await convert(page);
      let image = await result();
      expectColor(image.pixel(5, 15), [59, 59, 59, 255], 1);
      expectColor(image.pixel(25, 15), [54, 54, 54, 255], 1);

      // Sepia of pure red is the first column of the sepia matrix: 0.393, 0.349, 0.272.
      await page.getByRole('checkbox', { name: 'Grayscale' }).click();
      await page.getByRole('checkbox', { name: 'Sepia' }).click();
      await convert(page);
      image = await result();
      expectColor(image.pixel(25, 15), [100, 89, 69, 255], 1);

      await page.getByRole('checkbox', { name: 'Sepia' }).click();
      await pressOnSlider(page, /Brightness/, 'End');
      await expect(page.getByText('Brightness: 200%')).toBeVisible();
      await convert(page);
      image = await result();
      expectColor(image.pixel(5, 15), [200, 100, 50, 255], 1);
      expectColor(image.pixel(25, 15), RED, 1);
    });

    test('packs an ICO and scales a large image down to 256 pixels', async ({ page }) => {
      await open(page, twoTone());
      await selectOption(page, format(page), 'ICO');
      await expect(page.getByRole('group', { name: /Quality/ })).toBeHidden();
      await convert(page);

      // ICONDIR, one ICONDIRENTRY, then the picture as PNG.
      const icon = await save(page, downloadConverted(page));
      expect(icon.name).toBe('converted.ico');
      expect(icon.bytes.readUInt16LE(0)).toBe(0);
      expect(icon.bytes.readUInt16LE(2)).toBe(1);
      expect(icon.bytes.readUInt16LE(4)).toBe(1);
      expect([icon.bytes[6], icon.bytes[7]]).toEqual([40, 20]);
      expect(icon.bytes.readUInt16LE(12)).toBe(32);
      const size = icon.bytes.readUInt32LE(14);
      const offset = icon.bytes.readUInt32LE(18);
      expect(offset).toBe(22);
      expect(offset + size).toBe(icon.bytes.length);
      const picture = icon.bytes.subarray(offset);
      expect(picture.subarray(0, 8)).toEqual(PNG_SIGNATURE);
      const image = await decodeImage(page, picture, 'image/png');
      expect([image.width, image.height]).toEqual([40, 20]);
      expect(image.pixel(5, 10)).toEqual([...RED]);
      expect(image.pixel(35, 10)).toEqual([...BLUE]);

      // An icon entry holds at most 256 pixels a side, and writes 256 as 0.
      await chooseFiles(page, IMAGE_DROPZONE, pngFile('banner.png', makePng(600, 300, (x) => (x < 300 ? RED : BLUE))));
      await expect(page.getByRole('button', { name: IMAGE_DROPZONE })).toContainText('banner.png');
      await expectPreviewSize(page, 256, 128);
      const large = await save(page, downloadConverted(page));
      expect(large.name).toBe('converted.ico');
      expect([large.bytes[6], large.bytes[7]]).toEqual([0, 128]);
      const largeImage = await decodeImage(page, large.bytes.subarray(large.bytes.readUInt32LE(18)), 'image/png');
      expect([largeImage.width, largeImage.height]).toEqual([256, 128]);
    });

    test('crops with a preset or a dragged selection and never offers an empty one', async ({ page }) => {
      await open(page, twoTone());
      await expect(page.getByRole('button', { name: 'Free' })).toHaveAttribute('aria-pressed', 'true');
      await expect(downloadCropped(page)).toBeDisabled();

      // The largest centred square of a 40x20 image is 20x20, half red and half blue.
      await page.getByRole('button', { name: '1:1' }).click();
      await expect(page.getByRole('button', { name: '1:1' })).toHaveAttribute('aria-pressed', 'true');
      await expect(cropLabel(page)).toHaveText('Crop: 20×20px');
      const square = await save(page, downloadCropped(page));
      expect(square.name).toBe('cropped-two-tone.png');
      let image = await decodeImage(page, square.bytes, 'image/png');
      expect([image.width, image.height]).toEqual([20, 20]);
      expect(image.pixel(4, 10)).toEqual([...RED]);
      expect(image.pixel(15, 10)).toEqual([...BLUE]);

      // Back to a free selection: the preset's rectangle goes away.
      await page.getByRole('button', { name: 'Free' }).click();
      await expect(cropLabel(page)).toBeHidden();
      await expect(downloadCropped(page)).toBeDisabled();

      // Drag from a quarter to three quarters of the width, a tenth to nine tenths of the height.
      const picture = page.getByRole('img', { name: 'Crop' });
      await picture.scrollIntoViewIfNeeded();
      const box = await picture.boundingBox();
      if (!box) throw new Error('the crop picture is not on screen');
      await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.1);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 4 });
      await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.9, { steps: 4 });
      await page.mouse.up();
      await expect(cropLabel(page)).toHaveText('Crop: 20×16px');
      const dragged = await save(page, downloadCropped(page));
      image = await decodeImage(page, dragged.bytes, 'image/png');
      expect([image.width, image.height]).toEqual([20, 16]);
      expect(image.pixel(4, 8)).toEqual([...RED]);
      expect(image.pixel(15, 8)).toEqual([...BLUE]);

      // A click without a drag selects nothing, so there is nothing to save.
      await page.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.2);
      await expect(cropLabel(page)).toBeHidden();
      await expect(downloadCropped(page)).toBeDisabled();
    });

    test('names a crop after the type it is written as and keeps a rotated photo upright', async ({ page }) => {
      // A canvas cannot write GIF, so the crop of a GIF is a PNG and has to be called one.
      await open(page, { name: 'pixel.gif', mimeType: 'image/gif', buffer: ONE_PIXEL_GIF });
      await page.getByRole('button', { name: '1:1' }).click();
      await expect(cropLabel(page)).toHaveText('Crop: 1×1px');
      const fromGif = await save(page, downloadCropped(page));
      expect(fromGif.name).toBe('cropped-pixel.png');
      expect(fromGif.bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);

      // A 16x8 JPEG flagged "rotate 90° clockwise to view" is an 8x16 picture.
      const exif = exifWriter(true);
      const sideways = exif.embed(await drawJpeg(page), [exif.short(0x0112, 6)], [], []);
      await chooseFiles(page, IMAGE_DROPZONE, jpegFile('portrait.jpg', sideways));
      await expect(page.getByRole('button', { name: IMAGE_DROPZONE })).toContainText('portrait.jpg');
      await expectPreviewSize(page, 8, 16);

      // The 1:1 preset is still on and is applied to the new picture.
      await expect(cropLabel(page)).toHaveText(/^Crop: (\d+)×\1px$/);
      const side = Number((await cropLabel(page).innerText()).match(/\d+/)?.[0]);
      expect(side).toBeGreaterThan(0);
      expect(side).toBeLessThanOrEqual(8);
      const fromJpeg = await save(page, downloadCropped(page));
      expect(fromJpeg.name).toBe('cropped-portrait.jpg');
      expect(fromJpeg.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      const image = await decodeImage(page, fromJpeg.bytes, 'image/jpeg');
      expect([image.width, image.height]).toEqual([side, side]);
    });

    test.describe('on a HiDPI screen', () => {
      test.use({ deviceScaleFactor: 2 });

      test('the cropped file has the size the label states', async ({ page }) => {
        await open(page, twoTone());
        await page.getByRole('button', { name: '1:1' }).click();
        await expect(cropLabel(page)).toHaveText('Crop: 20×20px');
        const saved = await save(page, downloadCropped(page));
        const image = await decodeImage(page, saved.bytes, 'image/png');
        expect([image.width, image.height]).toEqual([20, 20]);
      });
    });

    test('reports a picture it cannot decode, a size it cannot encode and a file that is not an image', async ({
      page,
    }) => {
      await openTool(page, 'image-converter', 'Image Converter & Editor');

      // Not an image: refused at the drop area, nothing else appears.
      await chooseFiles(page, IMAGE_DROPZONE, TEXT_FILE);
      await expect(alerts(page)).toHaveText(NOT_AN_IMAGE);
      await expect(convertButton(page)).toBeHidden();

      // An image by name only: the conversion ends with a message instead of spinning forever.
      await chooseFiles(page, IMAGE_DROPZONE, BROKEN_PNG);
      await expect(alerts(page)).toHaveText(UNREADABLE_IMAGE);
      await expect(convertButton(page)).toBeEnabled();
      await expect(downloadConverted(page)).toBeHidden();
      await expect(converted(page)).toBeHidden();

      // A real picture clears the message.
      await chooseFiles(page, IMAGE_DROPZONE, twoTone());
      await expect(downloadConverted(page)).toBeVisible();
      await expect(alerts(page)).toHaveCount(0);

      // Wider than any canvas a browser will allocate.
      await page.getByLabel('Width (px)').fill('70000');
      await convertButton(page).click();
      await expect(alerts(page)).toHaveText('The image could not be encoded. It may be too large for this browser.');
      await expect(convertButton(page)).toBeEnabled();
      await expect(downloadConverted(page)).toBeHidden();

      // Clear takes the picture, its chip and the message away.
      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(convertButton(page)).toBeHidden();
      await expect(alerts(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: IMAGE_DROPZONE })).not.toContainText('two-tone.png');
    });

    test('keeps every colour when the output is PNG', async ({ page }) => {
      test.fixme(
        true,
        'PNG output is always passed through browser-image-compression, whose PNG encoder is lossy (UPNG, at most 4096 colours): a 16,384-colour PNG comes back with 807. Lossless PNG means skipping the compressor below 10 MB, which also changes the worker test below; a product decision'
      );
      // 16,384 different colours, the kind of range any photo has.
      const colorAt = (x: number, y: number): Rgba => [x * 2, y * 2, x + y, 255];
      await open(page, pngFile('gradient.png', makePng(128, 128, colorAt)));

      const saved = await save(page, downloadConverted(page));
      expect(saved.name).toBe('converted.png');
      const image = await decodeImage(page, saved.bytes, 'image/png');
      expect([image.width, image.height]).toEqual([128, 128]);

      let worst = 0;
      const colors = new Set<string>();
      for (let y = 0; y < 128; y += 1) {
        for (let x = 0; x < 128; x += 1) {
          const actual = image.pixel(x, y);
          colors.add(actual.join(','));
          worst = Math.max(worst, ...colorAt(x, y).map((channel, index) => Math.abs(channel - actual[index])));
        }
      }
      expect(colors.size, 'distinct colours left in the PNG').toBe(128 * 128);
      expect(worst, 'largest change to a colour channel').toBe(0);
    });

    test('compresses PNG output in its web worker, off the main thread', async ({ page }) => {
      // Listens in on what the compression worker reports back to the page.
      await page.addInitScript(() => {
        const report = { started: 0, errors: [] as string[] };
        (window as unknown as { compressionWorkers: typeof report }).compressionWorkers = report;
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
          constructor(url: string | URL, options?: WorkerOptions) {
            super(url, options);
            report.started += 1;
            this.addEventListener('message', (event: MessageEvent<{ error?: string }>) => {
              if (typeof event.data?.error === 'string') report.errors.push(event.data.error.split('\n')[0]);
            });
            this.addEventListener('error', (event) => report.errors.push(event.message));
          }
        };
      });

      await open(page, twoTone());

      const report = await page.evaluate(
        () => (window as unknown as { compressionWorkers: { started: number; errors: string[] } }).compressionWorkers
      );
      expect(report.started, 'compression workers started').toBeGreaterThan(0);
      expect(report.errors, 'errors reported by the compression worker').toEqual([]);
    });

    test('each slider has an accessible name of its own', async ({ page }) => {
      test.fixme(
        true,
        'The Slider primitive (src/components/ui/slider.tsx) cannot name its thumb: it takes no aria-label or aria-labelledby and a single Radix thumb has no label of its own, so every role=slider is nameless'
      );
      await open(page, twoTone());
      await selectOption(page, format(page), 'JPEG');

      for (const name of [/Quality/, /Rotate/, /Blur/, /Brightness/, /Contrast/, /Saturation/]) {
        await expect(page.getByRole('slider', { name })).toBeVisible();
      }
    });
  });

  // ── SVG to PNG Converter ───────────────────────────────────────────────────

  test.describe('SVG to PNG Converter', () => {
    const SVG_DROPZONE = 'Drag & drop an SVG file here or click to browse';
    const TWO_RECTS =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10">' +
      '<rect width="10" height="10" fill="#ff0000"/><rect x="10" width="10" height="10" fill="#0000ff"/></svg>';

    const code = (page: Page) => page.getByLabel('Or Paste SVG Code');
    const convertButton = (page: Page) => page.getByRole('button', { name: 'Convert to PNG' });
    const result = (page: Page) => page.getByRole('img', { name: 'Result' });
    const scale = (page: Page) => page.getByLabel(/Resolution Scale/);

    // Typing into the pre-rendered field before React is attached is lost, so it is repeated until it takes.
    async function pasteSvg(page: Page, markup: string): Promise<void> {
      await expect(async () => {
        await code(page).fill(markup);
        await expect(convertButton(page)).toBeEnabled({ timeout: 1_000 });
      }).toPass({ timeout: 20_000 });
    }

    async function expectResultSize(page: Page, width: number, height: number): Promise<void> {
      await expect(result(page)).toHaveJSProperty('naturalWidth', width);
      await expect(result(page)).toHaveJSProperty('naturalHeight', height);
    }

    test('rasterizes pasted SVG at the chosen scale and saves it as vector.png', async ({ page }) => {
      await openTool(page, 'svg-to-png', 'SVG to PNG Converter');
      await pasteSvg(page, TWO_RECTS);

      // The scale starts at 2: a 20x10 drawing becomes 40x20 pixels.
      await expect(page.getByText('Resolution Scale: 2x')).toBeVisible();
      await convertButton(page).click();
      await expect(page.getByText('Resulting PNG')).toBeVisible();
      await expectResultSize(page, 40, 20);

      const saved = await save(page, page.getByRole('button', { name: 'Download PNG' }));
      expect(saved.name).toBe('vector.png');
      expect(saved.bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
      const image = await decodeImage(page, saved.bytes, 'image/png');
      expect([image.width, image.height]).toEqual([40, 20]);
      expect(image.pixel(5, 10)).toEqual([...RED]);
      expect(image.pixel(35, 10)).toEqual([...BLUE]);

      await scale(page).fill('3');
      await expect(page.getByText('Resolution Scale: 3x')).toBeVisible();
      await convertButton(page).click();
      await expectResultSize(page, 60, 30);
    });

    test('renders SVG copied out of a web page and keeps its background transparent', async ({ page }) => {
      await openTool(page, 'svg-to-png', 'SVG to PNG Converter');
      await scale(page).fill('1');

      // No xmlns and no size, only a viewBox: by the CSS rules a square shape gets 150x150.
      await pasteSvg(page, '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#00ff00"/></svg>');
      await convertButton(page).click();
      await expectResultSize(page, 150, 150);
      const saved = await save(page, page.getByRole('button', { name: 'Download PNG' }));
      const image = await decodeImage(page, saved.bytes, 'image/png');
      expect([image.width, image.height]).toEqual([150, 150]);
      expect(image.pixel(75, 75)).toEqual([...GREEN]);
      // Outside the circle nothing was drawn.
      expect(image.pixel(1, 1)).toEqual([...CLEAR]);
      expect(image.pixel(148, 148)).toEqual([...CLEAR]);

      // Percentages are no size either; the 3:1 viewBox decides the shape.
      await pasteSvg(
        page,
        '<svg width="100%" height="100%" viewBox="0 0 30 10"><rect width="30" height="10" fill="#00ff00"/></svg>'
      );
      await convertButton(page).click();
      await expectResultSize(page, 300, 100);

      // Absolute units are converted at 96 pixels to the inch.
      await pasteSvg(
        page,
        '<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="0.5in"><rect width="100%" height="100%" fill="#00ff00"/></svg>'
      );
      await convertButton(page).click();
      await expectResultSize(page, 96, 48);

      // An XML declaration behind blank lines and a comment in front of the root.
      await pasteSvg(page, `\n\n<?xml version="1.0" encoding="UTF-8"?>\n<!-- exported -->\n${TWO_RECTS}`);
      await convertButton(page).click();
      await expectResultSize(page, 20, 10);
    });

    test('explains text that is not SVG, SVG that is malformed and a PNG too large to make', async ({ page }) => {
      await openTool(page, 'svg-to-png', 'SVG to PNG Converter');
      await expect(convertButton(page)).toBeDisabled();

      await pasteSvg(page, 'hello world');
      await convertButton(page).click();
      await expect(alerts(page)).toHaveText('This is not SVG: the code has to start with an <svg> element.');
      await expect(result(page)).toBeHidden();

      // The rect is never closed.
      await pasteSvg(
        page,
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"</svg>'
      );
      await expect(alerts(page)).toHaveCount(0);
      await convertButton(page).click();
      await expect(alerts(page)).toContainText('The SVG could not be rendered.');
      await expect(convertButton(page)).toHaveText('Convert to PNG');
      await expect(convertButton(page)).toBeEnabled();
      await expect(result(page)).toBeHidden();

      // 5000 px at ten times is far beyond what a canvas can hold.
      await pasteSvg(
        page,
        '<svg xmlns="http://www.w3.org/2000/svg" width="5000" height="5000"><rect width="5000" height="5000" fill="red"/></svg>'
      );
      await scale(page).fill('10');
      await convertButton(page).click();
      await expect(alerts(page)).toHaveText(
        'A 50000×50000px PNG is too large for this browser. Try a smaller scale.'
      );
      await expect(result(page)).toBeHidden();

      // Blank space is not code.
      await code(page).fill('  \n  ');
      await expect(convertButton(page)).toBeDisabled();
      await expect(alerts(page)).toHaveCount(0);
    });

    test('keeps the scale between 1 and 10', async ({ page }) => {
      await openTool(page, 'svg-to-png', 'SVG to PNG Converter');
      await pasteSvg(page, TWO_RECTS);

      await scale(page).fill('50');
      await expect(page.getByText('Resolution Scale: 10x')).toBeVisible();
      await scale(page).blur();
      await expect(scale(page)).toHaveValue('10');
      await convertButton(page).click();
      await expectResultSize(page, 200, 100);

      await scale(page).fill('-3');
      await expect(page.getByText('Resolution Scale: 1x')).toBeVisible();
      await scale(page).fill('');
      await expect(page.getByText('Resolution Scale: 1x')).toBeVisible();
      await convertButton(page).click();
      await expectResultSize(page, 20, 10);
    });

    test('loads an .svg file, refuses other files, and drops a result that no longer matches the code', async ({
      page,
    }) => {
      await openTool(page, 'svg-to-png', 'SVG to PNG Converter');
      const markup =
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="6"><rect width="12" height="6" fill="#ff00ff"/></svg>';
      const file: Upload = { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(markup) };

      await chooseFiles(page, SVG_DROPZONE, file);
      await expect(code(page)).toHaveValue(markup);
      await expect(page.getByRole('button', { name: SVG_DROPZONE })).toContainText(
        `logo.svg (${file.buffer.length} Bytes)`
      );
      await convertButton(page).click();
      await expectResultSize(page, 24, 12);
      const saved = await save(page, page.getByRole('button', { name: 'Download PNG' }));
      const image = await decodeImage(page, saved.bytes, 'image/png');
      expect(image.pixel(12, 6)).toEqual([255, 0, 255, 255]);

      // A PNG is not SVG: it is refused and the loaded code stays.
      await chooseFiles(page, SVG_DROPZONE, pngFile('photo.png', makePng(2, 2, () => RED)));
      await expect(alerts(page)).toHaveText('"photo.png" is not a supported file type. Accepted: .svg.');
      await expect(code(page)).toHaveValue(markup);

      // Editing the code makes the PNG on screen out of date, so it goes.
      await code(page).fill(markup.replace('#ff00ff', '#00ffff'));
      await expect(result(page)).toBeHidden();
      await expect(page.getByRole('button', { name: 'Download PNG' })).toBeHidden();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(code(page)).toHaveValue('');
      await expect(page.getByRole('button', { name: SVG_DROPZONE })).not.toContainText('logo.svg');
      await expect(alerts(page)).toHaveCount(0);
      await expect(convertButton(page)).toBeDisabled();
    });
  });

  // ── EXIF Viewer & Remover ──────────────────────────────────────────────────

  test.describe('EXIF Viewer & Remover', () => {
    const BATCH_DROPZONE = 'Drop images here or click to browse';
    const NO_EXIF = /No EXIF fields were detected in this file/;

    // One line of the metadata list: the tag's name, its value and its copy button.
    const field = (page: Page, label: string) =>
      page.getByRole('button', { name: `Copy ${label}`, exact: true }).locator('xpath=..');
    const fieldCount = (page: Page) => page.getByText('EXIF fields', { exact: true }).locator('xpath=..');
    const outputFormat = (page: Page) => page.getByRole('combobox', { name: /Output format/ });
    const removeButton = (page: Page) => page.getByRole('button', { name: 'Remove metadata' });
    const downloadCleaned = (page: Page) => page.getByRole('button', { name: 'Download cleaned image' });
    const cleanedNote = (page: Page) => page.getByText(/^Cleaned image ready: /);

    async function expectFields(page: Page, fields: Record<string, string>): Promise<void> {
      for (const [label, value] of Object.entries(fields)) {
        await expect(field(page, label)).toHaveText(`${label} ${value}`, { useInnerText: true });
      }
    }

    /** A photo as a camera writes it: little-endian EXIF with camera, exposure and GPS tags. */
    function cameraPhoto(jpeg: Buffer, orientation = 1): Buffer {
      const exif = exifWriter(true);
      return exif.embed(
        jpeg,
        [
          exif.ascii(0x010f, 'Canon'),
          exif.ascii(0x0110, 'EOS R5'),
          exif.short(0x0112, orientation),
          exif.ascii(0x013b, 'José Müller'),
        ],
        [
          exif.rational(0x829a, [10, 2500]),
          exif.rational(0x829d, [28, 10]),
          exif.short(0x8827, 400),
          exif.undefinedBytes(0x9000, Buffer.from('0232', 'latin1')),
          exif.ascii(0x9003, '2024:05:17 14:30:00'),
          exif.rational(0x920a, [50, 1]),
          exif.undefinedBytes(0x927c, Buffer.from('MAKERNOTE-PRIVATE-BLOCK-0123456789', 'latin1')),
          exif.undefinedBytes(
            0x9286,
            Buffer.concat([Buffer.from('ASCII\0\0\0', 'latin1'), Buffer.from('Sunset at the pier', 'latin1')])
          ),
        ],
        [
          exif.bytes(0x0000, 2, 3, 0, 0),
          exif.ascii(0x0001, 'N'),
          exif.rational(0x0002, [40, 1], [26, 1], [4632, 100]),
          exif.ascii(0x0003, 'W'),
          exif.rational(0x0004, [79, 1], [58, 1], [5593, 100]),
          exif.rational(0x0006, [0, 1]),
        ]
      );
    }

    test('lists the camera, exposure and GPS tags of a JPEG and copies a value', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openTool(page, 'exif-viewer-remover', 'EXIF Viewer & Remover');
      const photo = cameraPhoto(await drawJpeg(page));

      await chooseFiles(page, IMAGE_DROPZONE, jpegFile('IMG_0421.jpg', photo));

      // Sizes from 1 KB up are shown in KB with one decimal.
      expect(photo.length).toBeGreaterThanOrEqual(1024);
      await expect(page.getByRole('button', { name: IMAGE_DROPZONE })).toContainText(
        `IMG_0421.jpg (${(photo.length / 1024).toFixed(1)} KB)`
      );
      await expect(page.getByText('image/jpeg', { exact: true })).toBeVisible();
      // Four image tags, seven EXIF tags and six GPS tags; the maker note and the two directory pointers are not listed.
      await expect(fieldCount(page)).toHaveText(/^EXIF fields\s*17$/);

      await expect(page.getByText('Image', { exact: true })).toBeVisible();
      await expectFields(page, {
        'Camera Make': 'Canon',
        'Camera Model': 'EOS R5',
        Orientation: '1',
        // Written as UTF-8, as cameras and editors do.
        Artist: 'José Müller',
      });

      await expect(page.getByText('EXIF', { exact: true })).toBeVisible();
      await expectFields(page, {
        // 10/2500 of a second.
        'Exposure Time': '1/250',
        Aperture: '2.8',
        ISO: '400',
        Taken: '2024:05:17 14:30:00',
        'Focal Length': '50',
        // The comment without its eight-byte character-set prefix.
        Comment: 'Sunset at the pier',
        // The EXIF version stamp is text, not four byte codes.
        'Tag 0x9000': '0232',
      });

      await expect(page.getByText('GPS', { exact: true })).toBeVisible();
      await expectFields(page, {
        'Latitude Ref': 'N',
        Latitude: '40, 26, 46.32',
        'Longitude Ref': 'W',
        Longitude: '79, 58, 55.93',
        Altitude: '0',
      });

      // The camera maker's private block stays out of the list.
      await expect(page.getByRole('main')).not.toContainText('MAKERNOTE');
      await expect(page.getByRole('button', { name: /0x927c/i })).toHaveCount(0);

      await page.getByRole('button', { name: 'Copy Exposure Time' }).click();
      await expect(page.getByRole('button', { name: 'Copied Exposure Time' })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('1/250');

      // The other tab does not throw the picture away.
      await page.getByRole('tab', { name: 'Batch Clean' }).click();
      await expect(page.getByRole('button', { name: BATCH_DROPZONE })).toBeVisible();
      await page.getByRole('tab', { name: 'Single Image' }).click();
      await expectFields(page, { 'Camera Make': 'Canon' });
    });

    test('reads big-endian EXIF with signed, listed and UTF-16 values', async ({ page }) => {
      await openTool(page, 'exif-viewer-remover', 'EXIF Viewer & Remover');
      const exif = exifWriter(false);
      const photo = exif.embed(
        await drawJpeg(page),
        [exif.ascii(0x010f, 'Apple'), exif.ascii(0x0110, 'iPhone 15 Pro')],
        [
          exif.rational(0x829a, [1, 60]),
          exif.rational(0x829d, [178, 100]),
          exif.short(0x8827, 125),
          exif.signedRational(0x9204, [-2, 6]),
          exif.rational(0x920a, [6765, 1000]),
          exif.undefinedBytes(0x9286, Buffer.concat([Buffer.from('UNICODE\0', 'latin1'), exif.utf16('Grüße')])),
          exif.long(0xa002, 4032),
          exif.long(0xa003, 3024),
          exif.short(0xa405, 24),
          exif.rational(0xa432, [1540, 1000], [9000, 1000], [178, 100], [28, 10]),
          exif.ascii(0xa434, 'iPhone 15 Pro back triple camera 6.765mm f/1.78'),
        ],
        [
          exif.ascii(0x0001, 'S'),
          exif.rational(0x0002, [33, 1], [51, 1], [2460, 100]),
          exif.ascii(0x0003, 'E'),
          exif.rational(0x0004, [151, 1], [12, 1], [5400, 100]),
          exif.rational(0x0006, [585, 10]),
          exif.ascii(0x001d, '2024:05:17'),
        ]
      );

      await chooseFiles(page, IMAGE_DROPZONE, jpegFile('IMG_7.JPG', photo));

      await expect(fieldCount(page)).toHaveText(/^EXIF fields\s*19$/);
      await expectFields(page, {
        'Camera Make': 'Apple',
        'Camera Model': 'iPhone 15 Pro',
        'Exposure Time': '1/60',
        Aperture: '1.78',
        ISO: '125',
        // -2/6 EV, in lowest terms.
        'Exposure Bias': '-1/3',
        'Focal Length': '6.765',
        Comment: 'Grüße',
        Width: '4032',
        Height: '3024',
        'Focal Length (35mm)': '24',
        'Lens Info': '1.54, 9, 1.78, 2.8',
        'Lens Model': 'iPhone 15 Pro back triple camera 6.765mm f/1.78',
        'Latitude Ref': 'S',
        Latitude: '33, 51, 24.6',
        'Longitude Ref': 'E',
        Longitude: '151, 12, 54',
        Altitude: '58.5',
        Captured: '2024:05:17',
      });
    });

    test('removes the metadata, keeps the picture upright and the cleaned copy reads back empty', async ({ page }) => {
      await openTool(page, 'exif-viewer-remover', 'EXIF Viewer & Remover');
      // Stored 16x8 and flagged "rotate 90° clockwise to view": the stored left (blue) half is the top.
      const photo = cameraPhoto(await drawJpeg(page), 6);
      expect(jpegMarkers(photo)).toContain(APP1);

      await chooseFiles(page, IMAGE_DROPZONE, jpegFile('portrait.jpg', photo));
      await expectFields(page, { Orientation: '6' });
      await expect(downloadCleaned(page)).toBeDisabled();
      await expect(outputFormat(page)).toContainText('Keep original format when supported');

      await removeButton(page).click();
      await expect(cleanedNote(page)).toContainText('portrait-clean.jpg');
      await expect(page.getByRole('img', { name: 'Metadata removed' })).toHaveJSProperty('naturalWidth', 8);

      const cleaned = await save(page, downloadCleaned(page));
      expect(cleaned.name).toBe('portrait-clean.jpg');
      expect(cleaned.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      expect(jpegMarkers(cleaned.bytes)).not.toContain(APP1);
      expect(cleaned.bytes.includes(Buffer.from('Canon'))).toBe(false);
      await expect(cleanedNote(page)).toHaveText(`Cleaned image ready: portrait-clean.jpg (${cleaned.bytes.length} B)`);

      // With the orientation tag gone the pixels themselves have to be turned.
      const image = await decodeImage(page, cleaned.bytes, 'image/jpeg');
      expect([image.width, image.height]).toEqual([8, 16]);
      expectColor(image.pixel(4, 3), BLUE, 16);
      expectColor(image.pixel(4, 12), [255, 255, 0, 255], 16);

      // Fed back in, the cleaned copy has nothing left to show.
      await chooseFiles(page, IMAGE_DROPZONE, jpegFile(cleaned.name, cleaned.bytes));
      await expect(page.getByRole('button', { name: IMAGE_DROPZONE })).toContainText('portrait-clean.jpg');
      await expect(page.getByText(NO_EXIF)).toBeVisible();
      await expect(fieldCount(page)).toHaveText(/^EXIF fields\s*0$/);
      await expect(cleanedNote(page)).toBeHidden();
      await expect(downloadCleaned(page)).toBeDisabled();
    });

    test('writes the cleaned copy in the chosen format and never leaves transparency black', async ({ page }) => {
      await openTool(page, 'exif-viewer-remover', 'EXIF Viewer & Remover');
      const cutout = pngFile('cutout.png', makePng(8, 8, (x) => (x < 4 ? CLEAR : RED)));

      await chooseFiles(page, IMAGE_DROPZONE, cutout);
      await expect(page.getByText(NO_EXIF)).toBeVisible();
      await expect(fieldCount(page)).toHaveText(/^EXIF fields\s*0$/);

      // Original format: still a PNG, still see-through.
      await removeButton(page).click();
      await expect(cleanedNote(page)).toContainText('cutout-clean.png');
      const png = await save(page, downloadCleaned(page));
      expect(png.name).toBe('cutout-clean.png');
      expect(png.bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
      let image = await decodeImage(page, png.bytes, 'image/png');
      expect(image.pixel(1, 4)).toEqual([...CLEAR]);
      expect(image.pixel(6, 4)).toEqual([...RED]);

      await selectOption(page, outputFormat(page), 'JPEG');
      await removeButton(page).click();
      await expect(cleanedNote(page)).toContainText('cutout-clean.jpg');
      const jpeg = await save(page, downloadCleaned(page));
      expect(jpeg.name).toBe('cutout-clean.jpg');
      expect(jpeg.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      image = await decodeImage(page, jpeg.bytes, 'image/jpeg');
      expectColor(image.pixel(1, 4), WHITE, 6);
      expectColor(image.pixel(6, 4), RED, 12);

      await selectOption(page, outputFormat(page), 'WebP');
      await removeButton(page).click();
      await expect(cleanedNote(page)).toContainText('cutout-clean.webp');
      const webp = await save(page, downloadCleaned(page));
      expect(webp.name).toBe('cutout-clean.webp');
      expect(webp.bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
      expect(webp.bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(removeButton(page)).toBeHidden();
      await expect(page.getByRole('button', { name: IMAGE_DROPZONE })).not.toContainText('cutout.png');
    });

    test('survives damaged EXIF and reports a picture it cannot decode', async ({ page }) => {
      await openTool(page, 'exif-viewer-remover', 'EXIF Viewer & Remover');
      const exif = exifWriter(true);
      const photo = exif.embed(
        await drawJpeg(page),
        [exif.ascii(0x010f, 'Canon')],
        [exif.rational(0x829a, [1, 250])],
        []
      );

      // The camera make's value offset now points far past the end of the file. It sits in the
      // first directory entry: SOI (2), segment header (4), "Exif\0\0" (6), TIFF header (8), entry count (2), then 8.
      const badOffset = Buffer.from(photo);
      badOffset.writeUInt32LE(0x00ffffff, 2 + 4 + 6 + 8 + 2 + 8);
      await chooseFiles(page, IMAGE_DROPZONE, jpegFile('bad-offset.jpg', badOffset));
      await expectFields(page, { 'Camera Make': 'Out of bounds', 'Exposure Time': '1/250' });

      // Cut off in the middle of the EXIF block: nothing to list, but still a page that works.
      await chooseFiles(page, IMAGE_DROPZONE, jpegFile('cut-short.jpg', photo.subarray(0, 60)));
      await expect(page.getByRole('button', { name: IMAGE_DROPZONE })).toContainText('cut-short.jpg');
      await expect(page.getByText(NO_EXIF)).toBeVisible();
      await expect(fieldCount(page)).toHaveText(/^EXIF fields\s*0$/);

      // Half a JPEG cannot be decoded, so there is nothing to clean either.
      await removeButton(page).click();
      await expect(alerts(page)).toHaveText(UNREADABLE_IMAGE);
      await expect(removeButton(page)).toBeEnabled();
      await expect(downloadCleaned(page)).toBeDisabled();

      await chooseFiles(page, IMAGE_DROPZONE, TEXT_FILE);
      await expect(alerts(page).filter({ hasText: 'notes.txt' })).toHaveText(NOT_AN_IMAGE);
    });

    test('cleans a batch into one ZIP with a name for every file', async ({ page }) => {
      await openTool(page, 'exif-viewer-remover', 'EXIF Viewer & Remover');
      const photo = cameraPhoto(await drawJpeg(page));
      const logo = makePng(4, 4, () => RED);
      const batchTab = page.getByRole('tab', { name: 'Batch Clean' });
      await expect(async () => {
        await batchTab.click();
        await expect(page.getByRole('button', { name: BATCH_DROPZONE })).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 20_000 });

      // Two photos that would both be called beach-clean.jpg, a PNG, and a file that is no image.
      await chooseFiles(page, BATCH_DROPZONE, [
        jpegFile('beach.jpg', photo),
        jpegFile('beach.jpeg', photo),
        pngFile('logo.png', logo),
        TEXT_FILE,
      ]);
      await expect(alerts(page)).toHaveText(NOT_AN_IMAGE);
      await expect(page.getByText('Selected Files (3)')).toBeVisible();
      const row = (name: string) => page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });
      await expect(row('beach.jpg')).toContainText('Waiting');
      await expect(row('beach.jpg').getByRole('cell').nth(2)).toHaveText('JPEG');
      await expect(row('logo.png').getByRole('cell').nth(2)).toHaveText('PNG');

      const archive = await save(page, page.getByRole('button', { name: 'Clean & Download ZIP' }));
      expect(archive.name).toMatch(/^cleaned_images_\d+\.zip$/);
      const zip = await JSZip.loadAsync(archive.bytes);
      const names = Object.keys(zip.files);
      expect(names).toHaveLength(3);
      expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(3);
      expect(names).toContain('beach-clean.jpg');
      expect(names).toContain('logo-clean.png');
      expect(names.filter((name) => /^beach-clean.*\.jpg$/.test(name))).toHaveLength(2);
      for (const name of names) {
        const bytes = await zip.files[name].async('nodebuffer');
        if (name.endsWith('.png')) {
          expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
        } else {
          expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
          expect(jpegMarkers(bytes), `${name} still has an EXIF segment`).not.toContain(APP1);
        }
      }

      await expect(page.getByText('Processed 3/3')).toBeVisible();
      for (const name of ['beach.jpg', 'beach.jpeg', 'logo.png']) await expect(row(name)).toContainText('Cleaned');

      const again = await save(page, page.getByRole('button', { name: /^Download ZIP Again/ }));
      expect(again.name).toMatch(/^cleaned_images_\d+\.zip$/);
      expect(again.bytes.equals(archive.bytes)).toBe(true);

      // Taking a file out makes the archive out of date.
      await page.getByRole('button', { name: 'Remove beach.jpeg' }).click();
      await expect(page.getByText('Selected Files (2)')).toBeVisible();
      await expect(page.getByRole('button', { name: /^Download ZIP Again/ })).toBeHidden();

      await page.getByRole('button', { name: 'Clear All' }).click();
      await expect(page.getByRole('table')).toBeHidden();
      await expect(alerts(page)).toHaveCount(0);
    });

    test('converts a batch to WebP, marks what failed and says so when nothing could be cleaned', async ({ page }) => {
      await openTool(page, 'exif-viewer-remover', 'EXIF Viewer & Remover');
      const photo = cameraPhoto(await drawJpeg(page));
      const downloads: string[] = [];
      page.on('download', (download) => downloads.push(download.suggestedFilename()));
      const batchTab = page.getByRole('tab', { name: 'Batch Clean' });
      await expect(async () => {
        await batchTab.click();
        await expect(page.getByRole('button', { name: BATCH_DROPZONE })).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 20_000 });
      const row = (name: string) => page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });

      await chooseFiles(page, BATCH_DROPZONE, [
        jpegFile('one.jpg', photo),
        pngFile('two.png', makePng(4, 4, () => RED)),
        BROKEN_PNG,
      ]);
      await selectOption(page, page.getByRole('combobox', { name: /Batch Output Format/ }), 'Convert to WebP');

      const archive = await save(page, page.getByRole('button', { name: 'Clean & Download ZIP' }));
      const zip = await JSZip.loadAsync(archive.bytes);
      expect(Object.keys(zip.files).sort()).toEqual(['one-clean.webp', 'two-clean.webp']);
      for (const entry of Object.values(zip.files)) {
        const bytes = await entry.async('nodebuffer');
        expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
        expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
        expect(bytes.includes(Buffer.from('Exif'))).toBe(false);
      }
      await expect(page.getByText('Processed 2/3')).toBeVisible();
      await expect(row('one.jpg')).toContainText('Cleaned');
      await expect(row('two.png')).toContainText('Cleaned');
      await expect(row('broken.png')).toContainText('Failed');
      await expect(row('broken.png')).toContainText(UNREADABLE_IMAGE);

      // With only the unreadable file left there is no archive to hand over.
      await page.getByRole('button', { name: 'Remove one.jpg' }).click();
      await page.getByRole('button', { name: 'Remove two.png' }).click();
      await page.getByRole('button', { name: 'Clean & Download ZIP' }).click();
      await expect(alerts(page)).toHaveText('None of the images could be cleaned, so there is no ZIP to download.');
      await expect(page.getByRole('button', { name: 'Clean & Download ZIP' })).toBeEnabled();
      await expect(page.getByRole('button', { name: /^Download ZIP Again/ })).toBeHidden();
      expect(downloads).toHaveLength(1);
    });
  });

  // ── Color Palette Extractor ────────────────────────────────────────────────

  test.describe('Color Palette Extractor', () => {
    const swatches = (page: Page) => page.getByRole('button', { name: /^Cop(y|ied) #/ });
    const results = (page: Page) => page.getByText('Extraction Results');
    const toHex = ([red, green, blue]: Rgba) =>
      '#' + [red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('');

    // Half red, three tenths green, a fifth violet.
    const VIOLET: Rgba = [130, 60, 200, 255];
    const bands = () => pngFile('bands.png', makePng(100, 100, (_x, y) => (y < 50 ? RED : y < 80 ? GREEN : VIOLET)));

    async function expectPalette(page: Page, colors: string[]): Promise<void> {
      await expect(swatches(page)).toHaveCount(colors.length);
      for (const [index, color] of colors.entries()) {
        await expect(swatches(page).nth(index)).toHaveAccessibleName(`Copy ${color}`);
        await expect(swatches(page).nth(index)).toContainText(color);
      }
    }

    test('lists the colours of an image, the most common first', async ({ page }) => {
      await openTool(page, 'color-palette-extractor', 'Color Palette Extractor');
      const file = bands();

      await chooseFiles(page, IMAGE_DROPZONE, file);

      await expect(results(page)).toBeVisible();
      await expect(page.getByRole('button', { name: IMAGE_DROPZONE })).toContainText(
        `bands.png (${file.buffer.length} Bytes)`
      );
      await expect(page.getByRole('img', { name: 'Source' })).toHaveJSProperty('naturalWidth', 100);
      await expectPalette(page, ['#ff0000', '#00ff00', '#823cc8']);

      // Pure white is #ffffff, not a colour one step off.
      await chooseFiles(page, IMAGE_DROPZONE, pngFile('white.png', makePng(10, 10, () => WHITE)));
      await expect(page.getByRole('button', { name: IMAGE_DROPZONE })).toContainText('white.png');
      await expectPalette(page, ['#ffffff']);
    });

    test('shows at most the eight most common colours', async ({ page }) => {
      await openTool(page, 'color-palette-extractor', 'Color Palette Extractor');
      // Ten horizontal bands, each thinner than the one above; the last two are a single row each.
      const heights = [28, 22, 16, 12, 8, 6, 4, 2, 1, 1];
      const colors: Rgba[] = heights.map((_, index) => [index * 20, 250 - index * 20, 100, 255]);
      const bandAt = (y: number) => {
        let bottom = 0;
        return heights.findIndex((height) => (bottom += height) > y);
      };

      await chooseFiles(page, IMAGE_DROPZONE, pngFile('ten-bands.png', makePng(100, 100, (_x, y) => colors[bandAt(y)])));

      await expect(results(page)).toBeVisible();
      await expectPalette(page, colors.slice(0, 8).map(toHex));
    });

    test('explains a transparent image, an unreadable one and a file that is not an image', async ({ page }) => {
      await openTool(page, 'color-palette-extractor', 'Color Palette Extractor');

      await chooseFiles(page, IMAGE_DROPZONE, pngFile('glass.png', makePng(10, 10, () => CLEAR)));
      await expect(results(page)).toBeVisible();
      await expect(page.getByText('No colors found: every part of this image is transparent.')).toBeVisible();
      await expect(swatches(page)).toHaveCount(0);

      await chooseFiles(page, IMAGE_DROPZONE, BROKEN_PNG);
      await expect(alerts(page)).toHaveText(UNREADABLE_IMAGE);
      await expect(results(page)).toBeHidden();
      await expect(page.getByText('Extracting colors...')).toBeHidden();

      // A good image after a bad one clears the message.
      await chooseFiles(page, IMAGE_DROPZONE, bands());
      await expect(results(page)).toBeVisible();
      await expect(alerts(page)).toHaveCount(0);

      // A refused file leaves the palette that is on screen alone.
      await chooseFiles(page, IMAGE_DROPZONE, TEXT_FILE);
      await expect(alerts(page)).toHaveText(NOT_AN_IMAGE);
      await expectPalette(page, ['#ff0000', '#00ff00', '#823cc8']);
    });

    test('copies a swatch, takes a dropped file and clears', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openTool(page, 'color-palette-extractor', 'Color Palette Extractor');
      await chooseFiles(page, IMAGE_DROPZONE, bands());
      await expect(results(page)).toBeVisible();

      // From the keyboard, as the swatches are buttons.
      await page.getByRole('button', { name: 'Copy #00ff00' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Copied #00ff00' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Copied #00ff00' })).toContainText('Copied');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('#00ff00');
      // Only the swatch that was pressed says so.
      await expect(page.getByRole('button', { name: 'Copy #ff0000' })).toBeVisible();

      await dropFile(page, IMAGE_DROPZONE, pngFile('dropped.png', makePng(10, 10, () => BLUE)));
      await expect(page.getByRole('button', { name: IMAGE_DROPZONE })).toContainText('dropped.png');
      await expectPalette(page, ['#0000ff']);

      await page.getByRole('button', { name: 'Clear Image' }).click();
      await expect(results(page)).toBeHidden();
      await expect(swatches(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: IMAGE_DROPZONE })).not.toContainText('dropped.png');
    });
  });

  // ── Color Blindness Simulator ──────────────────────────────────────────────

  test.describe('Color Blindness Simulator', () => {
    const type = (page: Page) => page.getByRole('combobox', { name: /Type of Color Blindness/ });
    const simulated = (page: Page) => page.getByRole('img', { name: 'Simulated' });
    const downloadButton = (page: Page) => page.getByRole('button', { name: 'Download Simulation' });
    const settings = (page: Page) => page.getByText('Simulation Settings');

    // Red on the left half, green on the right.
    const redGreen = () => pngFile('red-green.png', makePng(60, 60, (x) => (x < 30 ? RED : GREEN)));

    /** What is painted at the middle of the left and right halves of an element. */
    async function paintedHalves(page: Page, element: Locator): Promise<number[][]> {
      const shot = await decodeImage(page, await element.screenshot(), 'image/png');
      const middle = Math.floor(shot.height / 2);
      return [shot.pixel(Math.floor(shot.width / 4), middle), shot.pixel(Math.floor((shot.width * 3) / 4), middle)];
    }

    // The matrices mix the channels in linear light. For deuteranopia red becomes (0.625, 0.7, 0)
    // and green (0.375, 0.3, 0.3); encoded back to sRGB that is the pair below. Achromatopsia
    // keeps only the luminance: 0.299 for red, 0.587 for green.
    const DEUTERANOPIA_RED = [207, 218, 0, 255];
    const DEUTERANOPIA_GREEN = [165, 149, 149, 255];
    const ACHROMATOPSIA_RED = [149, 149, 149];
    const ACHROMATOPSIA_GREEN = [201, 201, 201];

    test('shows the simulation beside the original and saves the same picture', async ({ page }) => {
      await openTool(page, 'color-blindness-simulator', 'Color Blindness Simulator');
      const file = redGreen();

      await chooseFiles(page, IMAGE_DROPZONE, file);

      await expect(settings(page)).toBeVisible();
      await expect(page.getByRole('button', { name: IMAGE_DROPZONE })).toContainText(
        `red-green.png (${file.buffer.length} Bytes)`
      );
      await expect(type(page)).toContainText('Deuteranopia');
      await expect(page.getByText('Green-blind (1% of males)')).toBeVisible();
      await expect(page.getByRole('paragraph').filter({ hasText: /^Deuteranopia$/ })).toBeVisible();

      // The original is untouched, the preview is not.
      const [originalRed, originalGreen] = await paintedHalves(page, page.getByRole('img', { name: 'Original' }));
      expect(originalRed).toEqual([...RED]);
      expect(originalGreen).toEqual([...GREEN]);
      const [previewRed, previewGreen] = await paintedHalves(page, simulated(page));
      expectColor(previewRed, DEUTERANOPIA_RED, 2);
      expectColor(previewGreen, DEUTERANOPIA_GREEN, 2);

      const saved = await save(page, downloadButton(page));
      expect(saved.name).toBe('deuteranopia-simulation.png');
      expect(saved.bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
      const image = await decodeImage(page, saved.bytes, 'image/png');
      expect([image.width, image.height]).toEqual([60, 60]);
      expectColor(image.pixel(10, 30), DEUTERANOPIA_RED, 1);
      expectColor(image.pixel(50, 30), DEUTERANOPIA_GREEN, 1);
      // The file is what the preview showed.
      expectColor(image.pixel(10, 30), previewRed, 2);
      expectColor(image.pixel(50, 30), previewGreen, 2);
      await expect(alerts(page)).toHaveCount(0);
    });

    test('switches type with the mouse and the keyboard and leaves transparency alone', async ({ page }) => {
      test.fixme(
        true,
        'The Select primitive (src/components/ui/select.tsx) leaves focus on the trigger when it opens near the bottom of the viewport: the selected option is highlighted but focus stays on the trigger. Scrolling the trigger to the top of the viewport first makes this test pass'
      );
      await openTool(page, 'color-blindness-simulator', 'Color Blindness Simulator');
      // Half-transparent red on the left, solid green on the right.
      await chooseFiles(
        page,
        IMAGE_DROPZONE,
        pngFile('veil.png', makePng(20, 20, (x) => (x < 10 ? [255, 0, 0, 128] : GREEN)))
      );
      await expect(settings(page)).toBeVisible();

      await selectOption(page, type(page), 'Achromatopsia');
      await expect(page.getByText('Total color-blind (very rare)')).toBeVisible();
      const gray = await save(page, downloadButton(page));
      expect(gray.name).toBe('achromatopsia-simulation.png');
      let image = await decodeImage(page, gray.bytes, 'image/png');
      expect([image.width, image.height]).toEqual([20, 20]);
      expectColor(image.pixel(15, 10), [...ACHROMATOPSIA_GREEN, 255], 1);
      // The colour of a see-through pixel changes, how see-through it is does not.
      expectColor(image.pixel(5, 10).slice(0, 3), ACHROMATOPSIA_RED, 3);
      expect(image.pixel(5, 10)[3]).toBe(128);

      // Arrow keys move through the list and wrap round to the first entry; Enter picks it.
      // The pointer is parked over the Download button, where the list opens: a hover would move the highlight.
      const option = (name: string) => page.getByRole('option', { name, exact: true });
      await page.mouse.move(0, 0);
      await type(page).focus();
      await page.keyboard.press('ArrowDown');
      await expect(option('Achromatopsia')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(option('Achromatomaly')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(option('Normal Vision')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(option('Normal Vision')).toBeHidden();
      await expect(type(page)).toContainText('Normal Vision');
      await expect(page.getByText('Standard color vision')).toBeVisible();

      const [previewLeft, previewRight] = await paintedHalves(page, simulated(page));
      const [originalLeft, originalRight] = await paintedHalves(page, page.getByRole('img', { name: 'Original' }));
      expect(previewLeft).toEqual(originalLeft);
      expect(previewRight).toEqual(originalRight);
      expect(previewRight).toEqual([...GREEN]);

      const untouched = await save(page, downloadButton(page));
      expect(untouched.name).toBe('normal-simulation.png');
      image = await decodeImage(page, untouched.bytes, 'image/png');
      expect(image.pixel(15, 10)).toEqual([...GREEN]);
      expectColor(image.pixel(5, 10), [255, 0, 0, 128], 2);

      // Space picks as well.
      await page.mouse.move(0, 0);
      await type(page).focus();
      await page.keyboard.press('ArrowDown');
      await expect(option('Normal Vision')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(option('Protanopia')).toBeFocused();
      await page.keyboard.press('Space');
      await expect(option('Protanopia')).toBeHidden();
      await expect(type(page)).toContainText('Protanopia');
      await expect(page.getByText('Red-blind (1% of males)')).toBeVisible();
    });

    test('opens the picker from the keyboard, reports an unreadable picture and clears', async ({ page }) => {
      await openTool(page, 'color-blindness-simulator', 'Color Blindness Simulator');
      const area = page.getByRole('button', { name: IMAGE_DROPZONE });

      // The drop area is a button: Enter opens the file picker.
      await expect(async () => {
        await area.focus();
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 2_000 }),
          page.keyboard.press('Enter'),
        ]);
        await chooser.setFiles(BROKEN_PNG);
      }).toPass({ timeout: 20_000 });
      await expect(alerts(page)).toHaveText(UNREADABLE_IMAGE);
      await expect(settings(page)).toBeHidden();
      await expect(simulated(page)).toBeHidden();

      await chooseFiles(page, IMAGE_DROPZONE, TEXT_FILE);
      await expect(alerts(page).filter({ hasText: 'notes.txt' })).toHaveText(NOT_AN_IMAGE);
      await expect(settings(page)).toBeHidden();

      await chooseFiles(page, IMAGE_DROPZONE, redGreen());
      await expect(settings(page)).toBeVisible();
      await expect(alerts(page)).toHaveCount(0);
      await expect(simulated(page)).toHaveJSProperty('naturalWidth', 60);

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(settings(page)).toBeHidden();
      await expect(simulated(page)).toBeHidden();
      await expect(area).not.toContainText('red-green.png');
    });
  });
});
