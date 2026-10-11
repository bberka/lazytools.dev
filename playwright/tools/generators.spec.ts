import { readFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { test, expect, type Download, type Locator, type Page } from '@playwright/test';

// Dates the tools print in local time are asserted as text, so the zone and locale are pinned.
test.use({
  timezoneId: 'UTC',
  locale: 'en-US',
  permissions: ['clipboard-read', 'clipboard-write'],
});

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Opens a tool page and waits until it can be used.
 *
 * The export is prerendered, so every control is on screen before React has
 * taken the page over, and a click in that gap does nothing. Nothing a user
 * can see marks the moment, so this waits for React's own mark on a control.
 */
async function openTool(page: Page, slug: string, heading: string): Promise<void> {
  const response = await page.goto(`/tools/${slug}/`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();

  const lastControl = page.getByRole('main').getByRole('button').last();
  await expect
    .poll(() => lastControl.evaluate((el) => Object.keys(el).some((key) => key.startsWith('__reactProps'))))
    .toBe(true);
}

/** Picks an option of one of the app's dropdowns the way a mouse user does. */
async function choose(page: Page, combobox: Locator, option: string): Promise<void> {
  await combobox.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(combobox).toHaveText(option);
  // The list fades out; the next dropdown must not find its options still around.
  await expect(page.getByRole('option')).toHaveCount(0);
}

/** Clicks something that saves a file and returns the download with its bytes. */
async function saveFrom(page: Page, trigger: Locator): Promise<{ download: Download; bytes: Buffer }> {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  return { download, bytes: await readFile(await download.path()) };
}

/** What is on the clipboard. Chromium on Windows hands line breaks back as CRLF, whatever was written. */
async function readClipboard(page: Page): Promise<string> {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.replace(/\r\n/g, '\n');
}

/** How opaque an element ends up on screen: its own opacity times that of everything around it. */
function shownOpacity(locator: Locator): Promise<number> {
  return locator.evaluate((node) => {
    let opacity = 1;
    for (let element: Element | null = node; element; element = element.parentElement) {
      opacity *= Number(getComputedStyle(element).opacity);
    }
    return opacity;
  });
}

/** Collects what the page throws, unhandled promise rejections included, for the test to check at its end. */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

// ── QR reading ────────────────────────────────────────────────────────────────

interface Bitmap {
  width: number;
  height: number;
  /** Four numbers per pixel, row by row. */
  rgba: number[];
}

type Rgba = [number, number, number, number];

interface SampledQr {
  /** `modules[row][column]`, true for a dark module. */
  modules: boolean[][];
  /** Width of the empty border, in modules. */
  quietZone: number;
  foreground: Rgba;
}

interface ReadQr {
  text: string;
  level: 'L' | 'M' | 'Q' | 'H';
  version: number;
}

/** The pixels of an image on the page, as the browser decodes it. */
function pixelsOf(image: Locator): Promise<Bitmap> {
  return image.evaluate(async (node) => {
    const img = node as HTMLImageElement;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.drawImage(img, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    return { width: data.width, height: data.height, rgba: Array.from(data.data) };
  });
}

function pixelAt(bitmap: Bitmap, x: number, y: number): Rgba {
  const offset = (y * bitmap.width + x) * 4;
  return [bitmap.rgba[offset], bitmap.rgba[offset + 1], bitmap.rgba[offset + 2], bitmap.rgba[offset + 3]];
}

/**
 * Finds the symbol in a drawn QR code and reads the middle of every module.
 * Three corners of a symbol hold finder patterns, so the box around every
 * non-background pixel is the symbol itself, and the first dark run on its
 * top edge is seven modules long.
 */
function sampleQr(bitmap: Bitmap, background: Rgba): SampledQr {
  const isDark = (x: number, y: number) => pixelAt(bitmap, x, y).some((value, index) => value !== background[index]);

  let left = bitmap.width;
  let top = bitmap.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      if (!isDark(x, y)) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new Error('The image has no dark pixels.');
  if (right - left !== bottom - top) throw new Error('The symbol is not square.');

  let run = 0;
  while (left + run <= right && isDark(left + run, top)) run++;
  const moduleSize = run / 7;
  const span = right - left + 1;
  const count = Math.round(span / moduleSize);
  const pitch = span / count;

  const modules = Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, column) =>
      isDark(Math.floor(left + (column + 0.5) * pitch), Math.floor(top + (row + 0.5) * pitch))
    )
  );
  return { modules, quietZone: left / moduleSize, foreground: pixelAt(bitmap, left, top) };
}

/**
 * Reads the text out of a QR symbol, written from the QR standard and not
 * from the library the tool draws with. It covers what these tests need:
 * versions 1 and 2 (which keep all data in one block) holding byte-mode text.
 */
function readQr(modules: boolean[][]): ReadQr {
  const size = modules.length;
  const version = (size - 17) / 4;
  if (version !== 1 && version !== 2) throw new Error(`A ${size}-module symbol is outside this reader's range.`);
  const bit = (row: number, column: number) => (modules[row][column] ? 1 : 0);

  // The 15 format bits beside the top-left finder pattern, least significant first.
  const formatCells: Array<[number, number]> = [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8],
    [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  ];
  let format = 0;
  formatCells.forEach(([row, column], index) => {
    format |= bit(row, column) << index;
  });
  format ^= 0b101010000010010;
  const level = (['M', 'L', 'H', 'Q'] as const)[format >> 13];
  const maskId = (format >> 10) & 7;

  const masks: Array<(row: number, column: number) => boolean> = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r * c) % 3) + ((r + c) % 2)) % 2 === 0,
  ];
  const masked = masks[maskId];

  const isFunctionModule = (row: number, column: number) =>
    (row <= 8 && column <= 8) || // top-left finder, separator and format bits
    (row <= 8 && column >= size - 8) || // top-right
    (row >= size - 8 && column <= 8) || // bottom-left
    row === 6 || // timing
    column === 6 ||
    (version === 2 && row >= size - 9 && row <= size - 5 && column >= size - 9 && column <= size - 5); // alignment

  // Data runs in two-module columns from the bottom right, snaking up and down.
  const bits: number[] = [];
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right -= 1;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const column of [right, right - 1]) {
        if (!isFunctionModule(row, column)) bits.push(bit(row, column) ^ (masked(row, column) ? 1 : 0));
      }
    }
    upward = !upward;
  }

  const dataCodewords = { 1: { L: 19, M: 16, Q: 13, H: 9 }, 2: { L: 34, M: 28, Q: 22, H: 16 } }[version][level];
  const data = bits.slice(0, dataCodewords * 8);
  let position = 0;
  const take = (length: number) => {
    let value = 0;
    for (let i = 0; i < length; i++) value = (value << 1) | (data[position++] ?? 0);
    return value;
  };

  const bytes: number[] = [];
  while (position + 4 <= data.length) {
    const mode = take(4);
    if (mode === 0) break;
    if (mode !== 0b0100) throw new Error(`Mode ${mode} is not byte mode.`);
    const length = take(8);
    for (let i = 0; i < length; i++) bytes.push(take(8));
  }
  return { text: Buffer.from(bytes).toString('utf8'), level, version };
}

/** Width and height a PNG file declares in its header. */
function pngSize(file: Buffer): { width: number; height: number } {
  expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

// ── CSV reading ───────────────────────────────────────────────────────────────

/** Parses CSV in which every field is quoted and a quote inside a field is doubled. */
function parseQuotedCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] !== '"') throw new Error(`Field at offset ${index} is not quoted.`);
    index += 1;
    let value = '';
    for (;;) {
      if (index >= text.length) throw new Error('A quoted field never ends.');
      if (text[index] === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index += 2;
          continue;
        }
        index += 1;
        break;
      }
      value += text[index];
      index += 1;
    }
    row.push(value);

    if (text[index] === ',') {
      index += 1;
    } else if (text[index] === '\n' || index >= text.length) {
      rows.push(row);
      row = [];
      index += 1;
    } else {
      throw new Error(`Unexpected character after a field at offset ${index}.`);
    }
  }
  return rows;
}

// ── The flows ─────────────────────────────────────────────────────────────────

test.describe('Generator tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // ── UUID Generator ──────────────────────────────────────────────────────────

  test.describe('UUID Generator', () => {
    const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    // RFC 9562: the version is the first digit of the third group, the variant (binary 10) the first of the fourth.
    const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    const generate = (page: Page) => page.getByRole('button', { name: 'Generate', exact: true });
    const listedUuids = (page: Page) => page.getByRole('main').getByText(UUID_SHAPE);

    test('generates random v4 UUIDs, copies them and clears the list', async ({ page }) => {
      await openTool(page, 'uuid-generator', 'UUID Generator');
      await expect(page.getByText('Generated IDs')).toBeHidden();

      // One by default.
      await generate(page).click();
      await expect(listedUuids(page)).toHaveCount(1);
      const [single] = await listedUuids(page).allTextContents();
      expect(single).toMatch(UUID_V4);

      await choose(page, page.getByRole('combobox', { name: 'Count' }), '20');
      await generate(page).click();
      await expect(listedUuids(page)).toHaveCount(20);
      const uuids = await listedUuids(page).allTextContents();
      for (const uuid of uuids) expect(uuid).toMatch(UUID_V4);
      expect(new Set(uuids).size).toBe(20);
      expect(uuids).not.toContain(single);

      // A row's copy button stays out of sight until the row is pointed at or the button is reached by keyboard.
      const rowCopy = page.getByRole('button', { name: `Copy ${uuids[3]}`, exact: true });
      await expect.poll(() => shownOpacity(rowCopy)).toBe(0);
      await page.getByText(uuids[3]).hover();
      await expect.poll(() => shownOpacity(rowCopy)).toBe(1);
      const firstRowCopy = page.getByRole('button', { name: `Copy ${uuids[0]}`, exact: true });
      await expect.poll(() => shownOpacity(firstRowCopy)).toBe(0);
      await page.getByRole('button', { name: 'Clear' }).focus();
      await page.keyboard.press('Tab');
      await expect(firstRowCopy).toBeFocused();
      await expect.poll(() => shownOpacity(firstRowCopy)).toBe(1);

      // Copy one row: the button says so and the clipboard holds exactly that ID.
      await rowCopy.click();
      await expect(page.getByRole('button', { name: `Copied ${uuids[3]}`, exact: true })).toBeVisible();
      expect(await readClipboard(page)).toBe(uuids[3]);

      await page.getByRole('button', { name: 'Copy All' }).click();
      await expect.poll(() => readClipboard(page)).toBe(uuids.join('\n'));

      // A new list starts without the check mark of the old one.
      await page.getByRole('button', { name: `Copy ${uuids[5]}`, exact: true }).click();
      await expect(page.getByRole('button', { name: `Copied ${uuids[5]}`, exact: true })).toBeVisible();
      await generate(page).click();
      await expect(page.getByRole('button', { name: `Copy ${uuids[5]}`, exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Copied / })).toHaveCount(0);
      await expect(listedUuids(page)).toHaveCount(20);

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(listedUuids(page)).toHaveCount(0);
      await expect(page.getByText('Generated IDs')).toBeHidden();
    });

    test('generates v7 UUIDs that carry the clock and sort in creation order', async ({ page }) => {
      // 2024-01-01T00:00:00.000Z is 1704067200000 ms, which is 018cc251f400 in 48-bit hex.
      await page.clock.setFixedTime(new Date('2024-01-01T00:00:00.000Z'));
      await openTool(page, 'uuid-generator', 'UUID Generator');

      // Chosen with the keyboard: arrow down opens the list, arrow down moves to the next type, Enter takes it.
      const type = page.getByRole('combobox', { name: 'Type' });
      await type.focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: 'UUID v4 (Random)' })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: 'UUID v7 (Timestamp)' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(type).toHaveText('UUID v7 (Timestamp)');

      await choose(page, page.getByRole('combobox', { name: 'Count' }), '20');
      await generate(page).click();
      await expect(listedUuids(page)).toHaveCount(20);

      const uuids = await listedUuids(page).allTextContents();
      for (const uuid of uuids) {
        expect(uuid).toMatch(/^018cc251-f400-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      }
      expect(new Set(uuids).size).toBe(20);
      // Made in one millisecond, they still sort in the order they were made.
      expect([...uuids].sort()).toEqual(uuids);
    });

    test('generates Snowflake IDs that hold the clock and never repeat', async ({ page }) => {
      await page.clock.setFixedTime(new Date('2024-01-01T00:00:00.000Z'));
      await openTool(page, 'uuid-generator', 'UUID Generator');

      await choose(page, page.getByRole('combobox', { name: 'Type' }), 'Snowflake ID');
      await choose(page, page.getByRole('combobox', { name: 'Count' }), '10');
      await generate(page).click();

      const listed = page.getByRole('main').getByText(/^\d{15,20}$/);
      await expect(listed).toHaveCount(10);
      const ids = (await listed.allTextContents()).map((text) => BigInt(text));

      // The top 41 bits count milliseconds from 2022-01-01T00:00:00Z: two years of 365 days, 63072000000 ms.
      expect(ids[0] >> 22n).toBe(63072000000n);
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i] > ids[i - 1]).toBe(true);
        // The sequence may roll over into the next millisecond, never further.
        expect([63072000000n, 63072000001n]).toContain(ids[i] >> 22n);
      }
    });

    test('reports a clock that is too early for a Snowflake ID instead of listing bad IDs', async ({ page }) => {
      await page.clock.setFixedTime(new Date('2021-06-01T00:00:00.000Z'));
      await openTool(page, 'uuid-generator', 'UUID Generator');

      await choose(page, page.getByRole('combobox', { name: 'Type' }), 'Snowflake ID');
      await generate(page).click();

      await expect(page.getByRole('main').getByRole('alert')).toHaveText(
        'The timestamp is before the epoch (2022-01-01 00:00:00.000 UTC), so it cannot be stored in an ID.'
      );
      await expect(page.getByText('Generated IDs')).toBeHidden();

      // The other types do not depend on that epoch and still work, and the error goes away.
      await choose(page, page.getByRole('combobox', { name: 'Type' }), 'UUID v4 (Random)');
      await generate(page).click();
      await expect(listedUuids(page)).toHaveCount(1);
      await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    });

    test('does not claim a copy the browser refused', async ({ page }) => {
      await page.addInitScript(() => {
        navigator.clipboard.writeText = () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'));
      });
      await openTool(page, 'uuid-generator', 'UUID Generator');

      await generate(page).click();
      await expect(listedUuids(page)).toHaveCount(1);
      const [uuid] = await listedUuids(page).allTextContents();

      const refused = page.waitForEvent('console', (message) => message.text().includes('Failed to copy'));
      await page.getByRole('button', { name: `Copy ${uuid}`, exact: true }).click();
      await refused;
      await expect(page.getByRole('button', { name: `Copy ${uuid}`, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Copied / })).toHaveCount(0);
    });
  });

  // ── Snowflake ID Generator & Decoder ────────────────────────────────────────

  test.describe('Snowflake ID Generator & Decoder', () => {
    const SLUG = 'snowflake-id-generator';
    const TITLE = 'Snowflake ID Generator & Decoder';
    // 2024-01-15T12:30:45.123Z
    const CLOCK = 1705321845123;

    const generate = (page: Page) => page.getByRole('button', { name: 'Generate IDs' });
    const listedIds = (page: Page) => page.getByRole('main').getByText(/^\d{15,20}$/);

    test('generates Twitter IDs from the chosen node values and decodes a row back', async ({ page }) => {
      await page.clock.setFixedTime(new Date(CLOCK));
      await openTool(page, SLUG, TITLE);
      const main = page.getByRole('main');

      await expect(main).toContainText('Timestamp Epoch:2010-11-04 01:42:54.657 UTC');
      await expect(page.getByText('No Snowflake IDs generated yet.')).toBeVisible();

      await page.getByRole('spinbutton', { name: 'Datacenter ID' }).fill('3');
      await page.getByRole('spinbutton', { name: 'Worker ID' }).fill('7');
      await page.getByRole('spinbutton', { name: 'Start Sequence' }).fill('5');
      await generate(page).click();

      // ((1705321845123 - 1288834974657) << 22) | (3 << 17) | (7 << 12) | sequence, sequence 5 to 9.
      const expected = [
        '1746872546743447557',
        '1746872546743447558',
        '1746872546743447559',
        '1746872546743447560',
        '1746872546743447561',
      ];
      await expect(listedIds(page)).toHaveText(expected);
      await expect(main).toContainText(
        '1746872546743447557twitter1/15/2024, 12:30:45 PMDatacenter: 3Worker: 7Seq: 5Decode'
      );
      await expect(main).toContainText(
        '1746872546743447561twitter1/15/2024, 12:30:45 PMDatacenter: 3Worker: 7Seq: 9Decode'
      );

      // On a wide screen the row actions wait for the pointer or for keyboard focus.
      const rowDecode = page.getByRole('button', { name: 'Decode', exact: true }).nth(4);
      await expect.poll(() => shownOpacity(rowDecode)).toBe(0);
      await rowDecode.focus();
      await expect.poll(() => shownOpacity(rowDecode)).toBe(1);
      await page.getByText(expected[0], { exact: true }).hover();
      await expect.poll(() => shownOpacity(page.getByRole('button', { name: 'Decode', exact: true }).first())).toBe(1);

      await page.getByRole('button', { name: 'Copy all IDs' }).click();
      await expect.poll(() => readClipboard(page)).toBe(expected.join('\n'));
      await page.getByRole('button', { name: `Copy ${expected[1]}`, exact: true }).click();
      await expect(page.getByRole('button', { name: `Copied ${expected[1]}`, exact: true })).toBeVisible();
      expect(await readClipboard(page)).toBe(expected[1]);

      // Rows keep the preset they were made with when the form moves on.
      await choose(page, page.getByRole('combobox', { name: 'Preset Format' }), 'Discord Snowflake');
      await expect(main).toContainText('Timestamp Epoch:2015-01-01 00:00:00.000 UTC');
      await expect(main).toContainText(
        '1746872546743447557twitter1/15/2024, 12:30:45 PMDatacenter: 3Worker: 7Seq: 5Decode'
      );

      // Decode from a row: the decoder takes the row's own layout, not the form's.
      await page.getByRole('button', { name: 'Decode', exact: true }).nth(2).click();
      await expect(page.getByRole('tab', { name: 'Decode ID' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('textbox', { name: 'Snowflake ID to decode' })).toHaveValue(expected[2]);
      await expect(page.getByRole('combobox', { name: 'Decoder preset' })).toHaveText('Decode as Twitter Preset');
      await expect(main).toContainText('UTC Timestamp DateMon, 15 Jan 2024 12:30:45 GMT');
      await expect(main).toContainText('Local Time1/15/2024, 12:30:45 PM');
      // 1705321845123 - 1288834974657
      await expect(main).toContainText('Unix Milliseconds Offset416486870466 (from Epoch base)');
      await expect(main).toContainText('Raw Timestamp (ms)1705321845123Datacenter ID3Worker ID7Sequence ID7');
    });

    test('exports the generated batch as CSV and JSON', async ({ page }) => {
      await page.clock.setFixedTime(new Date(CLOCK));
      await openTool(page, SLUG, TITLE);

      await page.getByRole('spinbutton', { name: 'Datacenter ID' }).fill('3');
      await page.getByRole('spinbutton', { name: 'Worker ID' }).fill('7');
      await page.getByRole('spinbutton', { name: 'Start Sequence' }).fill('5');
      await generate(page).click();
      await expect(listedIds(page)).toHaveCount(5);

      const csv = await saveFrom(page, page.getByRole('button', { name: 'Export CSV' }));
      expect(csv.download.suggestedFilename()).toBe(`snowflake-ids-${CLOCK}.csv`);
      // The date holds a comma, so it has to be quoted for every row to keep seven fields.
      expect(csv.bytes.toString('utf8')).toBe(
        [
          'ID,Timestamp_MS,UTC_Date,Node_A_ID,Node_B_ID,Node_C_ID,Sequence',
          '1746872546743447557,1705321845123,"Mon, 15 Jan 2024 12:30:45 GMT",3,7,0,5',
          '1746872546743447558,1705321845123,"Mon, 15 Jan 2024 12:30:45 GMT",3,7,0,6',
          '1746872546743447559,1705321845123,"Mon, 15 Jan 2024 12:30:45 GMT",3,7,0,7',
          '1746872546743447560,1705321845123,"Mon, 15 Jan 2024 12:30:45 GMT",3,7,0,8',
          '1746872546743447561,1705321845123,"Mon, 15 Jan 2024 12:30:45 GMT",3,7,0,9',
        ].join('\n')
      );

      const json = await saveFrom(page, page.getByRole('button', { name: 'Export JSON' }));
      expect(json.download.suggestedFilename()).toBe(`snowflake-ids-${CLOCK}.json`);
      const exported = JSON.parse(json.bytes.toString('utf8'));
      expect(exported).toHaveLength(5);
      expect(exported[0]).toEqual({
        id: '1746872546743447557',
        timestamp: 1705321845123,
        utcDate: 'Mon, 15 Jan 2024 12:30:45 GMT',
        datacenterId: 3,
        workerId: 7,
        processId: 0,
        sequence: 5,
      });
      expect(exported.map((item: { id: string }) => item.id)).toEqual([
        '1746872546743447557',
        '1746872546743447558',
        '1746872546743447559',
        '1746872546743447560',
        '1746872546743447561',
      ]);

      await page.getByRole('button', { name: 'Clear IDs' }).click();
      await expect(page.getByText('No Snowflake IDs generated yet.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);
    });

    test('generates Discord and Instagram IDs, rolling the sequence into the next millisecond', async ({ page }) => {
      await page.clock.setFixedTime(new Date(CLOCK));
      await openTool(page, SLUG, TITLE);
      const main = page.getByRole('main');
      const preset = page.getByRole('combobox', { name: 'Preset Format' });

      await choose(page, preset, 'Discord Snowflake');
      await expect(main).toContainText('Timestamp Epoch:2015-01-01 00:00:00.000 UTC');
      await page.getByRole('spinbutton', { name: 'Worker ID' }).fill('1');
      await page.getByRole('spinbutton', { name: 'Process ID' }).fill('2');
      await page.getByRole('spinbutton', { name: 'Start Sequence' }).fill('4094');
      await generate(page).click();

      // ((1705321845123 - 1420070400000) << 22) | (1 << 17) | (2 << 12) | sequence. After 4095 the
      // sequence starts again at 0 one millisecond later, so the IDs keep going up.
      await expect(listedIds(page)).toHaveText([
        '1196431277285322750',
        '1196431277285322751',
        '1196431277289512960',
        '1196431277289512961',
        '1196431277289512962',
      ]);
      await expect(main).toContainText('1196431277285322751discord1/15/2024, 12:30:45 PMWorker: 1Process: 2Seq: 4095Decode');
      await expect(main).toContainText('1196431277289512960discord1/15/2024, 12:30:45 PMWorker: 1Process: 2Seq: 0Decode');

      // Instagram: 41 timestamp bits from 2011-08-24T21:07:01.721Z, a 13-bit shard and a 10-bit sequence.
      await choose(page, preset, 'Instagram Shard ID');
      await expect(main).toContainText('Timestamp Epoch:2011-08-24 21:07:01.721 UTC');
      await expect(main).toContainText('Shard ID:13 bits');
      await expect(main).toContainText('Sequence Bits:10 bits');
      await page.getByRole('spinbutton', { name: 'Shard ID' }).fill('1341');
      await generate(page).click();

      // ((1705321845123 - 1314220021721) << 23) | (1341 << 10) | sequence
      await expect(listedIds(page)).toHaveText([
        '3280799884605977600',
        '3280799884605977601',
        '3280799884605977602',
        '3280799884605977603',
        '3280799884605977604',
      ]);
      await expect(main).toContainText('3280799884605977600instagram1/15/2024, 12:30:45 PMShard: 1341Seq: 0Decode');
    });

    test('decodes published Twitter, Discord and Instagram IDs', async ({ page }) => {
      // "Now" is 2024-01-15T12:30:45Z, so the age of each ID is known.
      await page.clock.setFixedTime(new Date(CLOCK));
      await openTool(page, SLUG, TITLE);
      const main = page.getByRole('main');
      await page.getByRole('tab', { name: 'Decode ID' }).click();

      const input = page.getByRole('textbox', { name: 'Snowflake ID to decode' });
      const preset = page.getByRole('combobox', { name: 'Decoder preset' });

      // Nothing to decode yet: no result and no error.
      await expect(main).not.toContainText('Decoded Values');
      await expect(main.getByRole('alert')).toHaveCount(0);

      // Twitter: (1541815603606036480 >> 22) + 1288834974657 = 1656432460105, 2022-06-28T16:07:40.105Z.
      await input.fill('1541815603606036480');
      await expect(main).toContainText('UTC Timestamp DateTue, 28 Jun 2022 16:07:40 GMT');
      // 565 whole days before the clock: more than one year of 365 days, less than two.
      await expect(main).toContainText('Local Time6/28/2022, 4:07:40 PMRelative Time1y ago');
      await expect(main).toContainText('Unix Milliseconds Offset367597485448 (from Epoch base)');
      await expect(main).toContainText('Raw Timestamp (ms)1656432460105Datacenter ID11Worker ID26Sequence ID0');
      await expect(main).toContainText(
        'Sign (1 bit)Timestamp (41 bits)Datacenter ID (5 bits)Worker ID (5 bits)Sequence (12 bits)'
      );

      // Discord's documented example: 2016-04-30 11:18:25.796 UTC, worker 1, process 0, increment 7.
      await input.fill('175928847299117063');
      await choose(page, preset, 'Decode as Discord Preset');
      await expect(main).toContainText('UTC Timestamp DateSat, 30 Apr 2016 11:18:25 GMT');
      // 2816 whole days before the clock.
      await expect(main).toContainText('Relative Time7y ago');
      await expect(main).toContainText('Unix Milliseconds Offset41944705796 (from Epoch base)');
      await expect(main).toContainText('Raw Timestamp (ms)1462015105796Worker ID1Process ID0Sequence ID7');
      // All 64 bits, sign first, and nothing after them.
      await expect(main).toContainText(
        'Binary Bit String:' +
          '0' +
          '00000100111000100000110010110101100000100' +
          '00001' +
          '00000' +
          '000000000111' +
          'Decoded Values'
      );
      // The first block is the unused sign bit, the last one the lowest sequence bit.
      await main.getByText(/^[01]$/).first().hover();
      await expect(main).toContainText('Bit Position:#63 (Array Index: 0)SignValue:0');
      await main.getByText(/^[01]$/).nth(63).hover();
      await expect(main).toContainText('Bit Position:#0 (Array Index: 63)SequenceValue:1');

      // Instagram's published example: 1387263000 ms after the epoch, shard 1341, sequence 5001 % 1024 = 905.
      // (1387263000 << 23) | (1341 << 10) | 905 = 11637205501278089
      await input.fill('11637205501278089');
      await choose(page, preset, 'Decode as Instagram Preset');
      // 1387263000 + 1314220021721 = 1315607284721
      await expect(main).toContainText('UTC Timestamp DateFri, 09 Sep 2011 22:28:04 GMT');
      // 4510 whole days before the clock.
      await expect(main).toContainText('Relative Time12y ago');
      await expect(main).toContainText('Unix Milliseconds Offset1387263000 (from Epoch base)');
      await expect(main).toContainText('Raw Timestamp (ms)1315607284721Shard ID1341Sequence ID905');
      // This layout fills all 64 bits: 64 blocks, no sign bit.
      await expect(main.getByText(/^[01]$/)).toHaveCount(64);
      await expect(main).not.toContainText('Sign (1 bit)');
      await expect(main).toContainText('Timestamp (41 bits)Shard ID (13 bits)Sequence (10 bits)');
      await expect(main).toContainText(
        'Binary Bit String:' +
          '00000000001010010101011111111010000011000' +
          '0010100111101' +
          '1110001001' +
          'Decoded Values'
      );
      await main.getByText(/^[01]$/).first().hover();
      await expect(main).toContainText('Bit Position:#63 (Array Index: 0)TimestampValue:0');

      // The largest 64-bit value is a legal Instagram ID: every field at its maximum.
      await input.fill('18446744073709551615');
      await expect(main).toContainText('Unix Milliseconds Offset2199023255551 (from Epoch base)');
      await expect(main).toContainText('Shard ID8191Sequence ID1023');
    });

    test('rejects IDs and layouts that cannot be decoded', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      const main = page.getByRole('main');
      await page.getByRole('tab', { name: 'Decode ID' }).click();

      const input = page.getByRole('textbox', { name: 'Snowflake ID to decode' });
      const invalid = 'Invalid Snowflake ID format. Ensure it is a valid 64-bit unsigned integer.';

      for (const text of ['tweet-123', '-1', '12.5', '18446744073709551616']) {
        await input.fill(text);
        await expect(main.getByRole('alert')).toHaveText(invalid);
        await expect(main).not.toContainText('Decoded Values');
      }

      // Back to a good ID, the error goes.
      await input.fill('1541815603606036480');
      await expect(main).toContainText('Raw Timestamp (ms)1656432460105');
      await expect(main.getByRole('alert')).toHaveCount(0);

      // A custom layout must still fill 63 or 64 bits.
      await choose(page, page.getByRole('combobox', { name: 'Decoder preset' }), 'Decode as Custom Configuration');
      // The custom default is the Twitter split from 2024-01-01: the same fields, 13 years later.
      await expect(main).toContainText('Raw Timestamp (ms)2071664685448Node ID A11Node ID B26Sequence ID0');
      await page.getByRole('spinbutton', { name: 'Timestamp Bits' }).fill('50');
      await expect(main.getByRole('alert')).toHaveText(
        'Bit widths must sum to 63 bits (leaving the sign bit unused) or 64 bits. Current sum: 72 bits.'
      );
      await expect(main).not.toContainText('Decoded Values');

      // 42 + 5 + 5 + 0 + 12 = 64 is fine again; the Twitter epoch brings the Twitter time back, one bit over.
      await page.getByRole('spinbutton', { name: 'Timestamp Bits' }).fill('42');
      await page.getByRole('spinbutton', { name: 'Custom Decoder Epoch (ms)' }).fill('1288834974657');
      await expect(main.getByRole('alert')).toHaveCount(0);
      await expect(main).toContainText('Raw Timestamp (ms)1656432460105Node ID A11Node ID B26Sequence ID0');
      await expect(main).not.toContainText('Sign (1 bit)');
    });

    test('generates with a custom layout, epoch and timestamp, and refuses what does not fit', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      const main = page.getByRole('main');

      await choose(page, page.getByRole('combobox', { name: 'Preset Format' }), 'Custom Configuration');
      await expect(main).toContainText('Timestamp Epoch:2024-01-01 00:00:00.000 UTC');
      await expect(main).toContainText('Unix epoch (ms):1704067200000');

      // Move the epoch to 2020: the summary line follows.
      await page.getByLabel('Custom Epoch').fill('2020-01-01T00:00');
      await expect(main).toContainText('Unix epoch (ms):1577836800000');
      await expect(main).toContainText('Timestamp Epoch:2020-01-01 00:00:00.000 UTC');

      await page.getByRole('spinbutton', { name: 'Node ID A' }).fill('1');
      await page.getByRole('spinbutton', { name: 'Node ID B' }).fill('2');
      await page.getByRole('switch', { name: 'Use Current Time' }).click();
      const customTime = page.getByLabel('Custom Timestamp Date');

      // A second before the epoch cannot be stored.
      await customTime.fill('2019-12-31T23:59:59');
      await generate(page).click();
      await expect(main.getByRole('alert')).toHaveText(
        'The timestamp is before the epoch (2020-01-01 00:00:00.000 UTC), so it cannot be stored in an ID.'
      );
      await expect(page.getByText('No Snowflake IDs generated yet.')).toBeVisible();

      // One second after it: (1000 << 22) | (1 << 17) | (2 << 12) | sequence = 4194304000 + 131072 + 8192 + sequence.
      await customTime.fill('2020-01-01T00:00:01');
      await generate(page).click();
      await expect(main.getByRole('alert')).toHaveCount(0);
      // (How the two node fields are captioned is left open here; see the test about telling them apart.)
      await expect(main).toContainText(/4194443264custom1\/1\/2020, 12:00:01 AMNode[^:]*: 1Node[^:]*: 2Seq: 0Decode/);
      await expect(main).toContainText(/4194443268custom1\/1\/2020, 12:00:01 AMNode[^:]*: 1Node[^:]*: 2Seq: 4Decode/);

      // Decode uses the epoch the row was made with, not the custom default.
      await page.getByRole('button', { name: 'Decode', exact: true }).first().click();
      await expect(page.getByRole('textbox', { name: 'Snowflake ID to decode' })).toHaveValue('4194443264');
      await expect(page.getByRole('combobox', { name: 'Decoder preset' })).toHaveText('Decode as Custom Configuration');
      await expect(page.getByRole('spinbutton', { name: 'Custom Decoder Epoch (ms)' })).toHaveValue('1577836800000');
      await expect(main).toContainText('UTC Timestamp DateWed, 01 Jan 2020 00:00:01 GMT');
      await expect(main).toContainText('Unix Milliseconds Offset1000 (from Epoch base)');
      await expect(main).toContainText('Raw Timestamp (ms)1577836801000Node ID A1Node ID B2Sequence ID0');
    });

    test('keeps custom bit widths and field values consistent', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      const main = page.getByRole('main');

      await choose(page, page.getByRole('combobox', { name: 'Preset Format' }), 'Custom Configuration');
      await expect(main).toContainText('Node A Width (e.g. Datacenter):5 bits');
      await page.getByRole('spinbutton', { name: 'Node ID A' }).fill('31');
      await expect(main).toContainText('Range: 0 - 31 (5 bits)');

      // The width sliders are addressed by position (they are named in a test below):
      // timestamp, node A, node B, node C, sequence, and last the count.
      const sliders = page.getByRole('slider');
      await expect(sliders).toHaveCount(6);

      // 41 + 4 + 5 + 0 + 12 = 62 bits: one short, and 31 no longer fits in node A.
      await sliders.nth(1).press('ArrowLeft');
      await expect(main).toContainText('Node A Width (e.g. Datacenter):4 bits');
      await expect(page.getByRole('spinbutton', { name: 'Node ID A' })).toHaveValue('15');
      await expect(main).toContainText('Range: 0 - 15 (4 bits)');
      await expect(main.getByRole('alert')).toHaveText(
        'Bit widths must sum to 63 bits (leaving the sign bit unused) or 64 bits. Current sum: 62 bits.'
      );
      await expect(generate(page)).toBeDisabled();

      // Give the bit to the sequence: 41 + 4 + 5 + 0 + 13 = 63.
      await sliders.nth(4).press('ArrowRight');
      await expect(main).toContainText('Sequence Width:13 bits');
      await expect(main).toContainText('Range: 0 - 8191 (13 bits)');
      await expect(main.getByRole('alert')).toHaveCount(0);
      await expect(generate(page)).toBeEnabled();
    });

    test('refuses a timestamp that the timestamp field is too narrow for', async ({ page }) => {
      await page.clock.setFixedTime(new Date(CLOCK));
      await openTool(page, SLUG, TITLE);
      const main = page.getByRole('main');

      await choose(page, page.getByRole('combobox', { name: 'Preset Format' }), 'Custom Configuration');
      // Sliders by position, as above: timestamp down to its minimum of 20 bits, node A up to its
      // maximum of 20, node B from 5 to 11. With the 12 sequence bits that is 20 + 20 + 11 + 12 = 63.
      const sliders = page.getByRole('slider');
      await sliders.nth(0).press('Home');
      await sliders.nth(1).press('End');
      for (let i = 0; i < 6; i++) await sliders.nth(2).press('ArrowRight');
      await expect(main).toContainText('Timestamp Width:20 bits');
      await expect(main).toContainText('Node A Width (e.g. Datacenter):20 bits');
      await expect(main).toContainText('Node B Width (e.g. Worker):11 bits');
      await expect(main.getByRole('alert')).toHaveCount(0);

      // 20 bits of milliseconds are 17.5 minutes; the clock is two weeks past the 2024-01-01 epoch.
      await generate(page).click();
      await expect(main.getByRole('alert')).toHaveText(
        'The timestamp does not fit in 20 bits after this epoch. Use a later epoch or a wider timestamp.'
      );
      await expect(page.getByText('No Snowflake IDs generated yet.')).toBeVisible();

      // Ten minutes after the epoch fits: (600000 << 43) with nothing in the other fields.
      await page.getByRole('switch', { name: 'Use Current Time' }).click();
      await page.getByLabel('Custom Timestamp Date').fill('2024-01-01T00:10');
      await generate(page).click();
      await expect(main.getByRole('alert')).toHaveCount(0);
      // 600000 × 2^43 = 5277655813324800000
      await expect(main).toContainText(
        /5277655813324800000custom1\/1\/2024, 12:10:00 AMNode[^:]*: 0Node[^:]*: 0Seq: 0Decode/
      );
    });

    test('tells the node fields of a custom row apart', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      const main = page.getByRole('main');

      await choose(page, page.getByRole('combobox', { name: 'Preset Format' }), 'Custom Configuration');
      await page.getByRole('spinbutton', { name: 'Node ID A' }).fill('1');
      await page.getByRole('spinbutton', { name: 'Node ID B' }).fill('2');
      await generate(page).click();

      // The form calls them "Node ID A" and "Node ID B"; a row has to keep the letters too.
      await expect(page.getByRole('button', { name: 'Decode', exact: true })).toHaveCount(5);
      await expect(main).toContainText(/Node (ID )?A: 1Node (ID )?B: 2Seq: 0/);
    });

    test('lists a full batch of 100 and lets the last row be reached', async ({ page }) => {
      await page.clock.setFixedTime(new Date(CLOCK));
      await openTool(page, SLUG, TITLE);
      const main = page.getByRole('main');

      await page.getByRole('slider').press('End');
      await expect(main).toContainText('Count to Generate: 100');
      await generate(page).click();

      await expect(listedIds(page)).toHaveCount(100);
      // (1705321845123 - 1288834974657) << 22 = 1746872546743025664, then sequence 0 to 99.
      await expect(listedIds(page).first()).toHaveText('1746872546743025664');
      const last = listedIds(page).last();
      await expect(last).toHaveText('1746872546743025763');
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
    });

    test('decodes a custom field wider than 53 bits without losing digits', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      const main = page.getByRole('main');
      await page.getByRole('tab', { name: 'Decode ID' }).click();

      // One timestamp bit and a 63-bit node field: 64 bits, a layout the decoder accepts.
      await choose(page, page.getByRole('combobox', { name: 'Decoder preset' }), 'Decode as Custom Configuration');
      await page.getByRole('spinbutton', { name: 'Timestamp Bits' }).fill('1');
      await page.getByRole('spinbutton', { name: 'Node A Bits' }).fill('63');
      await page.getByRole('spinbutton', { name: 'Node B Bits' }).fill('0');
      await page.getByRole('spinbutton', { name: 'Sequence Bits' }).fill('0');

      // 2^53 + 1, the first whole number a double cannot hold. All of it lies in the node field.
      await page.getByRole('textbox', { name: 'Snowflake ID to decode' }).fill('9007199254740993');
      await expect(main.getByRole('alert')).toHaveCount(0);
      await expect(main).toContainText('Node ID A9007199254740993Sequence ID0');
    });

    test('lets a node value be cleared and typed again', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      const main = page.getByRole('main');

      const datacenter = page.getByRole('spinbutton', { name: 'Datacenter ID' });
      await datacenter.fill('7');
      await expect(main).toContainText('Datacenter ID:7');

      // Select everything, delete it, type a new number: what any user does to replace a value.
      await datacenter.press('ControlOrMeta+a');
      await datacenter.press('Backspace');
      await datacenter.pressSequentially('12');
      await expect(main).toContainText('Datacenter ID:12');
      await expect(datacenter).toHaveValue('12');
    });

    test('names its sliders for assistive technology', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      await expect(page.getByRole('slider', { name: /count/i })).toBeVisible();

      await choose(page, page.getByRole('combobox', { name: 'Preset Format' }), 'Custom Configuration');
      await expect(page.getByRole('slider', { name: /timestamp width/i })).toBeVisible();
      await expect(page.getByRole('slider', { name: /sequence width/i })).toBeVisible();
    });
  });

  // ── Mock Data Generator ─────────────────────────────────────────────────────

  test.describe('Mock Data Generator', () => {
    const SLUG = 'mock-data-generator';
    const TITLE = 'Mock Data Generator';
    const STALE = 'The schema changed. Generate again to update the output.';

    const headers = (page: Page) => page.getByRole('columnheader');
    const bodyRows = (page: Page) => page.getByRole('row').filter({ has: page.getByRole('cell') });

    test('generates the default user list and serves it as a table, JSON and CSV', async ({ page }) => {
      await openTool(page, SLUG, TITLE);

      await expect(headers(page)).toHaveText(['id', 'first_name', 'last_name', 'email', 'country']);
      await expect(bodyRows(page)).toHaveCount(10);
      await expect(page.getByText('Showing first 10 generated rows of 50 total.')).toBeVisible();
      await expect(page.getByText(STALE)).toBeHidden();
      const firstRowCells = await bodyRows(page).first().getByRole('cell').allTextContents();

      await page.getByRole('button', { name: 'JSON Output' }).click();
      const jsonText = await page.getByRole('textbox', { name: 'JSON output' }).inputValue();
      const rows: Array<Record<string, string | number>> = JSON.parse(jsonText);
      expect(rows).toHaveLength(50);

      rows.forEach((row, index) => {
        expect(Object.keys(row)).toEqual(['id', 'first_name', 'last_name', 'email', 'country']);
        expect(row.id).toBe(index + 1);
        expect(String(row.first_name)).toMatch(/^[A-Z][a-z]+$/);
        expect(String(row.last_name)).toMatch(/^[A-Z][a-z]+$/);
        // The address belongs to the person in the same row.
        const [local, domain] = String(row.email).split('@');
        expect(local).toMatch(
          new RegExp(`^${String(row.first_name).toLowerCase()}\\.${String(row.last_name).toLowerCase()}\\d{0,2}$`)
        );
        expect(domain).toMatch(/^[a-z]+\.com$/);
        expect(String(row.country).length).toBeGreaterThan(3);
      });
      // The table shows the same data as the JSON.
      expect(firstRowCells).toEqual(Object.values(rows[0]).map(String));

      const jsonFile = await saveFrom(page, page.getByRole('button', { name: 'Download', exact: true }));
      expect(jsonFile.download.suggestedFilename()).toBe('mock-data.json');
      expect(jsonFile.bytes.toString('utf8')).toBe(jsonText);

      await page.getByRole('button', { name: 'Copy', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
      expect(await readClipboard(page)).toBe(jsonText);

      await page.getByRole('button', { name: 'CSV Output' }).click();
      const csvText = await page.getByRole('textbox', { name: 'CSV output' }).inputValue();
      const csvRows = parseQuotedCsv(csvText);
      expect(csvRows).toHaveLength(51);
      expect(csvRows[0]).toEqual(['id', 'first_name', 'last_name', 'email', 'country']);
      expect(csvRows.slice(1)).toEqual(rows.map((row) => Object.values(row).map(String)));

      const csvFile = await saveFrom(page, page.getByRole('button', { name: 'Download', exact: true }));
      expect(csvFile.download.suggestedFilename()).toBe('mock-data.csv');
      expect(csvFile.bytes.toString('utf8')).toBe(csvText);

      // Generating again draws new people.
      await page.getByRole('button', { name: 'Generate Data' }).click();
      await expect(page.getByRole('textbox', { name: 'CSV output' })).not.toHaveValue(csvText);
    });

    test('builds a custom schema with typed fields and a new row count', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      await expect(bodyRows(page)).toHaveCount(10);

      await choose(page, page.getByRole('combobox', { name: 'Rows count' }), '100 Rows');
      await expect(page.getByText(STALE)).toBeVisible();

      // Keep the incremental ID, drop the rest, and add one field of each remaining kind.
      for (const name of ['first_name', 'last_name', 'email', 'country']) {
        await page.getByRole('button', { name: `Remove ${name}` }).click();
      }
      await expect(page.getByRole('button', { name: 'Remove id', exact: true })).toBeDisabled();

      const added = [
        ['ID (UUID)', 'id_uuid'],
        ['Full Name', 'full_name'],
        ['Phone Number', 'phone'],
        ['Street Address', 'street'],
        ['City', 'city'],
        ['State', 'state'],
        ['Zip Code', 'zip'],
        ['Company Name', 'company'],
        ['Job Title', 'job'],
        ['Date', 'date'],
        ['Boolean (True/False)', 'boolean'],
        ['Text / Paragraph', 'text'],
      ];
      for (const [index, [label, column]] of added.entries()) {
        const position = index + 2;
        await page.getByRole('button', { name: 'Add New Field' }).click();
        const name = page.getByRole('textbox', { name: `Column name of field ${position}` });
        await expect(name).toHaveValue(/^field_\d{4}$/);
        const placeholderName = await name.inputValue();

        await page.getByRole('combobox', { name: `Type of ${placeholderName}`, exact: true }).click();
        if (index === 0) {
          // The type list is long enough to come with a search box: narrow it down and take the match with Enter.
          await page.getByPlaceholder('Search...').fill('uuid');
          await expect(page.getByRole('option')).toHaveText(['ID (UUID)']);
          await page.keyboard.press('Enter');
        } else {
          await page.getByRole('option', { name: label, exact: true }).click();
        }
        // A field that still has its placeholder name takes the name of its type.
        await expect(name).toHaveValue(column);
        await expect(page.getByRole('combobox', { name: `Type of ${column}`, exact: true })).toHaveText(label);
        await expect(page.getByRole('option')).toHaveCount(0);
      }

      // The table still shows the old data until it is generated again.
      await expect(headers(page)).toHaveText(['id', 'first_name', 'last_name', 'email', 'country']);
      await page.getByRole('button', { name: 'Generate Data' }).click();
      await expect(page.getByText(STALE)).toBeHidden();
      await expect(headers(page)).toHaveText(['id', ...added.map(([, column]) => column)]);
      await expect(page.getByText('Showing first 10 generated rows of 100 total.')).toBeVisible();

      await page.getByRole('button', { name: 'JSON Output' }).click();
      const jsonText = await page.getByRole('textbox', { name: 'JSON output' }).inputValue();
      const rows: Array<Record<string, string | number | boolean>> = JSON.parse(jsonText);
      expect(rows).toHaveLength(100);

      // Where each of the tool's cities really is.
      const stateOf: Record<string, string> = {
        'New York': 'NY',
        'Los Angeles': 'CA',
        Chicago: 'IL',
        Houston: 'TX',
        Phoenix: 'AZ',
        Philadelphia: 'PA',
        'San Antonio': 'TX',
        'San Diego': 'CA',
        Dallas: 'TX',
        'San Jose': 'CA',
        Austin: 'TX',
        Jacksonville: 'FL',
        'San Francisco': 'CA',
        Indianapolis: 'IN',
        Columbus: 'OH',
        'Fort Worth': 'TX',
        Charlotte: 'NC',
        Seattle: 'WA',
        Denver: 'CO',
        'El Paso': 'TX',
      };

      rows.forEach((row, index) => {
        expect(Object.keys(row)).toEqual(['id', ...added.map(([, column]) => column)]);
        expect(row.id).toBe(index + 1);
        expect(row.id_uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(row.full_name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
        expect(row.phone).toMatch(/^\+1 \(555\) \d{3}-\d{4}$/);
        expect(row.street).toMatch(/^\d{3,4} [A-Z][A-Za-z ]+$/);
        expect(stateOf[String(row.city)], `state of ${row.city}`).toBe(row.state);
        expect(row.zip).toMatch(/^\d{5}$/);
        expect(String(row.company).length).toBeGreaterThan(2);
        expect(String(row.job).length).toBeGreaterThan(2);
        expect(row.date).toMatch(/^(19[89]\d|20[012]\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
        expect(typeof row.boolean).toBe('boolean');
        expect(String(row.text)).toMatch(/^[A-Z].+\.$/);
      });
      // Every row has its own UUID, and both truth values and several cities turn up in 100 rows.
      expect(new Set(rows.map((row) => row.id_uuid)).size).toBe(100);
      expect(new Set(rows.map((row) => row.boolean)).size).toBe(2);
      expect(new Set(rows.map((row) => row.city)).size).toBeGreaterThan(5);

      // Text with commas survives the CSV, and booleans are written as words.
      await page.getByRole('button', { name: 'CSV Output' }).click();
      const csvRows = parseQuotedCsv(await page.getByRole('textbox', { name: 'CSV output' }).inputValue());
      expect(csvRows).toHaveLength(101);
      expect(csvRows[0]).toEqual(['id', ...added.map(([, column]) => column)]);
      expect(csvRows.slice(1)).toEqual(rows.map((row) => Object.values(row).map(String)));
    });

    test('keeps the output consistent through renames, duplicate and blank column names', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      await expect(bodyRows(page)).toHaveCount(10);
      const firstRowBefore = await bodyRows(page).first().getByRole('cell').allTextContents();

      // A rename alone changes nothing on show; the tool says the output is out of date.
      await page.getByRole('textbox', { name: 'Column name of field 2' }).fill('id');
      await page.getByRole('textbox', { name: 'Column name of field 3' }).fill('');
      await page.getByRole('textbox', { name: 'Column name of field 5' }).fill('__proto__');
      await expect(page.getByText(STALE)).toBeVisible();
      await expect(headers(page)).toHaveText(['id', 'first_name', 'last_name', 'email', 'country']);
      expect(await bodyRows(page).first().getByRole('cell').allTextContents()).toEqual(firstRowBefore);

      // Email moves in front of the names.
      await page.getByRole('button', { name: 'Move email up' }).click();
      await page.getByRole('button', { name: 'Move email up' }).click();
      await expect(page.getByRole('textbox', { name: 'Column name of field 2' })).toHaveValue('email');

      await page.getByRole('button', { name: 'Generate Data' }).click();
      await expect(page.getByText(STALE)).toBeHidden();
      // The second `id` is told apart, and the nameless third field is named after its position in the default schema.
      await expect(headers(page)).toHaveText(['id', 'email', 'id_2', 'field_3', '__proto__']);
      await expect(bodyRows(page)).toHaveCount(10);
      const cells = await bodyRows(page).first().getByRole('cell').allTextContents();
      expect(cells).toHaveLength(5);
      expect(cells[0]).toBe('1');
      // The moved email column still belongs to the two name columns behind it.
      expect(cells[2]).toMatch(/^[A-Z][a-z]+$/);
      expect(cells[3]).toMatch(/^[A-Z][a-z]+$/);
      expect(cells[1]).toMatch(
        new RegExp(`^${cells[2].toLowerCase()}\\.${cells[3].toLowerCase()}\\d{0,2}@[a-z]+\\.com$`)
      );
      expect(cells[4].length).toBeGreaterThan(3);

      await page.getByRole('button', { name: 'JSON Output' }).click();
      const jsonText = await page.getByRole('textbox', { name: 'JSON output' }).inputValue();
      // Five keys per object, in column order, `__proto__` included.
      const firstObject = jsonText.slice(jsonText.indexOf('{'), jsonText.indexOf('}') + 1);
      expect([...firstObject.matchAll(/^\s+"([^"]+)":/gm)].map((match) => match[1])).toEqual([
        'id',
        'email',
        'id_2',
        'field_3',
        '__proto__',
      ]);
      expect(jsonText.match(/"__proto__": "/g)).toHaveLength(50);
      expect(JSON.parse(jsonText)).toHaveLength(50);

      await page.getByRole('button', { name: 'CSV Output' }).click();
      const csvRows = parseQuotedCsv(await page.getByRole('textbox', { name: 'CSV output' }).inputValue());
      expect(csvRows[0]).toEqual(['id', 'email', 'id_2', 'field_3', '__proto__']);
      expect(csvRows).toHaveLength(51);
      for (const row of csvRows) expect(row).toHaveLength(5);
    });
  });

  // ── QR Code Generator ───────────────────────────────────────────────────────

  test.describe('QR Code Generator', () => {
    const SLUG = 'qr-code-generator';
    const TITLE = 'QR Code Generator';
    const WHITE: Rgba = [255, 255, 255, 255];

    const generate = (page: Page) => page.getByRole('button', { name: 'Generate', exact: true });
    const preview = (page: Page) => page.getByRole('img', { name: 'Generated QR code' });

    /** One of the two colour buttons, named after what it colours and the value it shows ("Foreground: #111827"). */
    const colourButton = (page: Page, label: 'Foreground' | 'Background', value: string) =>
      page.getByRole('main').getByRole('button', { name: `${label}: ${value}`, exact: true });

    /** Opens the colour picker that shows `current`, runs `pick` in it and closes it again. */
    async function withColourPicker(
      page: Page,
      label: 'Foreground' | 'Background',
      current: string,
      pick: () => Promise<void>
    ): Promise<void> {
      await colourButton(page, label, current).click();
      const hex = page.getByPlaceholder('#FFFFFF');
      await expect(hex).toBeVisible();
      await pick();
      await page.keyboard.press('Escape');
      await expect(hex).toBeHidden();
    }

    test('draws a code that reads back as the content and downloads it as PNG and SVG', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      await expect(page.getByText('No QR code generated yet.')).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Content' })).toHaveValue('https://lazytools.dev');

      await generate(page).click();
      await expect(preview(page)).toBeVisible();
      await expect(page.getByText('Ready at 320 × 320 pixels')).toBeVisible();

      const bitmap = await pixelsOf(preview(page));
      expect([bitmap.width, bitmap.height]).toEqual([320, 320]);
      const sampled = sampleQr(bitmap, WHITE);
      // 21 bytes at level M need version 2: 25 modules, here with the default margin of 2 around them.
      expect(sampled.modules).toHaveLength(25);
      // The drawing library rounds the margin up to the next whole pixel, so "2 modules" is 2.09 of them here.
      expect(Math.round(sampled.quietZone)).toBe(2);
      // #111827
      expect(sampled.foreground).toEqual([17, 24, 39, 255]);
      expect(readQr(sampled.modules)).toEqual({ text: 'https://lazytools.dev', level: 'M', version: 2 });

      const png = await saveFrom(page, page.getByRole('button', { name: 'Download PNG' }));
      expect(png.download.suggestedFilename()).toBe('https-lazytools-dev.png');
      expect(pngSize(png.bytes)).toEqual({ width: 320, height: 320 });
      // The file is the picture on show.
      const shown = await preview(page).getAttribute('src');
      expect(png.bytes.toString('base64')).toBe(shown?.replace('data:image/png;base64,', ''));

      const svg = await saveFrom(page, page.getByRole('button', { name: 'Download SVG' }));
      expect(svg.download.suggestedFilename()).toBe('https-lazytools-dev.svg');
      const markup = svg.bytes.toString('utf8');
      expect(markup).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(markup).toContain('width="320" height="320"');
      // 25 modules plus two of margin on each side.
      expect(markup).toContain('viewBox="0 0 29 29"');
      expect(markup).toMatch(/<path fill="#ffffff" d="M0 0h29v29H0z"\/>/i);
      expect(markup).toMatch(/<path stroke="#111827" /);

      await page.getByRole('button', { name: 'Copy content' }).click();
      await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
      expect(await readClipboard(page)).toBe('https://lazytools.dev');
    });

    test('applies size, margin, error correction and colour, and flags a stale preview', async ({ page }) => {
      await openTool(page, SLUG, TITLE);

      // Surrounding whitespace is not part of the content.
      await page.getByRole('textbox', { name: 'Content' }).fill('  lazytools.dev\n');
      await page.getByRole('spinbutton', { name: 'Size (px)' }).fill('256');
      await page.getByRole('spinbutton', { name: 'Margin' }).fill('0');
      await choose(page, page.getByRole('combobox', { name: 'Error correction' }), 'High (H)');
      await expect(page.getByText('~30% recovery')).toBeVisible();

      await withColourPicker(page, 'Foreground', '#111827', () => page.getByPlaceholder('#FFFFFF').fill('#1D4ED8'));
      await expect(colourButton(page, 'Foreground', '#1D4ED8')).toBeVisible();

      await generate(page).click();
      await expect(page.getByText('Ready at 256 × 256 pixels')).toBeVisible();

      const bitmap = await pixelsOf(preview(page));
      expect([bitmap.width, bitmap.height]).toEqual([256, 256]);
      const sampled = sampleQr(bitmap, WHITE);
      expect(sampled.quietZone).toBe(0);
      // #1D4ED8
      expect(sampled.foreground).toEqual([29, 78, 216, 255]);
      // 13 bytes at level H do not fit version 1 (7 bytes) and do fit version 2 (14 bytes).
      expect(readQr(sampled.modules)).toEqual({ text: 'lazytools.dev', level: 'H', version: 2 });

      const svg = await saveFrom(page, page.getByRole('button', { name: 'Download SVG' }));
      expect(svg.download.suggestedFilename()).toBe('lazytools-dev.svg');
      const markup = svg.bytes.toString('utf8');
      expect(markup).toContain('width="256" height="256"');
      expect(markup).toContain('viewBox="0 0 25 25"');
      expect(markup).toMatch(/<path stroke="#1d4ed8" /i);

      // Editing the content afterwards: the picture is the old code, and the tool says so.
      await page.getByRole('textbox', { name: 'Content' }).fill('something else');
      await expect(
        page.getByText('The content or settings changed after this code was generated. Generate again to update it.')
      ).toBeVisible();
      await expect(page.getByText(/^Ready at/)).toBeHidden();
      // The downloads are still the code on show, under its own name.
      const stale = await saveFrom(page, page.getByRole('button', { name: 'Download PNG' }));
      expect(stale.download.suggestedFilename()).toBe('lazytools-dev.png');

      await generate(page).click();
      await expect(page.getByText('Ready at 256 × 256 pixels')).toBeVisible();
      expect(readQr(sampleQr(await pixelsOf(preview(page)), WHITE).modules).text).toBe('something else');

      // Clear takes the form back to its defaults and drops the code.
      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByRole('textbox', { name: 'Content' })).toHaveValue('');
      await expect(page.getByRole('spinbutton', { name: 'Size (px)' })).toHaveValue('320');
      await expect(page.getByRole('spinbutton', { name: 'Margin' })).toHaveValue('2');
      await expect(page.getByRole('combobox', { name: 'Error correction' })).toHaveText('Medium (M)');
      await expect(colourButton(page, 'Foreground', '#111827')).toBeVisible();
      await expect(page.getByText('No QR code generated yet.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Copy content' })).toBeDisabled();
    });

    test('explains what is wrong with the form instead of drawing a code', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      const alert = page.getByRole('main').getByRole('alert');
      const content = page.getByRole('textbox', { name: 'Content' });
      const size = page.getByRole('spinbutton', { name: 'Size (px)' });
      const margin = page.getByRole('spinbutton', { name: 'Margin' });

      // A good code first, so each error can be seen to take it away.
      await generate(page).click();
      await expect(preview(page)).toBeVisible();

      await content.fill('   ');
      await generate(page).click();
      await expect(alert).toHaveText('Enter text or a URL to generate a QR code.');
      await expect(preview(page)).toHaveCount(0);
      await expect(page.getByText('No QR code generated yet.')).toBeVisible();

      await content.fill('https://lazytools.dev');
      for (const value of ['127', '2049', '']) {
        await size.fill(value);
        await generate(page).click();
        await expect(alert).toHaveText('Size must be between 128 and 2048 pixels.');
      }
      await size.fill('128');

      for (const value of ['11', '-1', '']) {
        await margin.fill(value);
        await generate(page).click();
        await expect(alert).toHaveText('Margin must be between 0 and 10.');
      }
      await margin.fill('10');

      // White on white, picked from the swatches.
      await withColourPicker(page, 'Foreground', '#111827', () => page.getByTitle('#ffffff').click());
      await generate(page).click();
      await expect(alert).toHaveText('Foreground and background colors must be different.');
      await expect(preview(page)).toHaveCount(0);

      // The limits themselves are accepted: 128 px with a margin of 10.
      await withColourPicker(page, 'Foreground', '#ffffff', () => page.getByTitle('#000000').click());
      await generate(page).click();
      await expect(alert).toHaveCount(0);
      await expect(page.getByText('Ready at 128 × 128 pixels')).toBeVisible();
      const sampled = sampleQr(await pixelsOf(preview(page)), WHITE);
      expect(sampled.modules).toHaveLength(25);
      // 128 px shared by 25 modules and 10 of margin on each side.
      expect(Math.round(sampled.quietZone)).toBe(10);
      expect(sampled.foreground).toEqual([0, 0, 0, 255]);
      expect(readQr(sampled.modules).text).toBe('https://lazytools.dev');

      // More than any QR code holds.
      await content.fill('a'.repeat(3000));
      await generate(page).click();
      await expect(alert).toContainText(/too big/i);
      await expect(preview(page)).toHaveCount(0);
    });

    test('reports the real size of a code that needs more pixels than asked for, and caps the file name', async ({
      page,
    }) => {
      await openTool(page, SLUG, TITLE);

      // 1499 bytes need far more than 128 modules, so 128 px cannot hold the code.
      const text = 'Abcdefghi '.repeat(150).trim();
      await page.getByRole('textbox', { name: 'Content' }).fill(text);
      await page.getByRole('spinbutton', { name: 'Size (px)' }).fill('128');
      await generate(page).click();
      await expect(preview(page)).toBeVisible();

      const naturalWidth = await preview(page).evaluate((node) => (node as HTMLImageElement).naturalWidth);
      expect(naturalWidth).toBeGreaterThan(128);
      const label = new Intl.NumberFormat('en-US').format(naturalWidth);
      await expect(page.getByText(`Ready at ${label} × ${label} pixels`)).toBeVisible();

      const png = await saveFrom(page, page.getByRole('button', { name: 'Download PNG' }));
      expect(pngSize(png.bytes)).toEqual({ width: naturalWidth, height: naturalWidth });
      // The name is the content in lower case with hyphens for everything else, cut at 60 characters.
      // The 60th here is a hyphen, which is not left dangling: six words and five hyphens remain.
      expect(png.download.suggestedFilename()).toBe(
        'abcdefghi-abcdefghi-abcdefghi-abcdefghi-abcdefghi-abcdefghi.png'
      );
    });

    test('draws on a transparent background, and refuses a transparent foreground', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      const transparent: Rgba = [0, 0, 0, 0];

      // The picker's HEX field takes "none" for no colour at all.
      await withColourPicker(page, 'Background', '#FFFFFF', () => page.getByPlaceholder('#FFFFFF').fill('none'));
      await expect(colourButton(page, 'Background', 'none')).toBeVisible();
      await generate(page).click();
      await expect(page.getByText('Ready at 320 × 320 pixels')).toBeVisible();

      const bitmap = await pixelsOf(preview(page));
      expect(pixelAt(bitmap, 0, 0)).toEqual(transparent);
      const sampled = sampleQr(bitmap, transparent);
      expect(sampled.foreground).toEqual([17, 24, 39, 255]);
      expect(readQr(sampled.modules)).toEqual({ text: 'https://lazytools.dev', level: 'M', version: 2 });

      // The SVG has the modules and no background rectangle.
      const svg = await saveFrom(page, page.getByRole('button', { name: 'Download SVG' }));
      const markup = svg.bytes.toString('utf8');
      expect(markup).toMatch(/<path stroke="#111827" /);
      expect(markup).not.toContain('fill=');

      // Nothing to scan without a foreground.
      await withColourPicker(page, 'Foreground', '#111827', () => page.getByPlaceholder('#FFFFFF').fill('none'));
      await generate(page).click();
      await expect(page.getByRole('main').getByRole('alert')).toHaveText('Choose a foreground color.');
      await expect(preview(page)).toHaveCount(0);
    });

    test('encodes text beyond ASCII and names the files after what is left of it', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      const content = page.getByRole('textbox', { name: 'Content' });

      // 12 bytes of UTF-8, which a version 1 symbol of 21 modules holds at level M.
      await content.fill('Grüße 👋');
      await generate(page).click();
      await expect(page.getByText('Ready at 320 × 320 pixels')).toBeVisible();
      const small = sampleQr(await pixelsOf(preview(page)), WHITE);
      expect(small.modules).toHaveLength(21);
      expect(readQr(small.modules)).toEqual({ text: 'Grüße 👋', level: 'M', version: 1 });
      // Only Latin letters and digits make it into the name: "gr", one hyphen for "üß", then "e".
      const png = await saveFrom(page, page.getByRole('button', { name: 'Download PNG' }));
      expect(png.download.suggestedFilename()).toBe('gr-e.png');

      // With none of those at all the files get a plain name instead of an empty one.
      await content.fill('こんにちは');
      await expect(page.getByText(/^Ready at/)).toBeHidden();
      await generate(page).click();
      await expect(page.getByText('Ready at 320 × 320 pixels')).toBeVisible();
      expect(readQr(sampleQr(await pixelsOf(preview(page)), WHITE).modules)).toEqual({
        text: 'こんにちは',
        level: 'M',
        version: 2,
      });
      const svg = await saveFrom(page, page.getByRole('button', { name: 'Download SVG' }));
      expect(svg.download.suggestedFilename()).toBe('qr-code.svg');
    });

    test('names its colour pickers after what they colour', async ({ page }) => {
      await openTool(page, SLUG, TITLE);
      await expect(page.getByRole('button', { name: /foreground/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /background/i })).toBeVisible();
    });
  });

  // ── GZip Compressor / Decompressor ──────────────────────────────────────────

  test.describe('GZip Compressor / Decompressor', () => {
    const SLUG = 'gzip-compressor';
    const TITLE = 'GZip Compressor / Decompressor';

    test('compresses text to Base64 GZip, reports the sizes and swaps back to the text', async ({ page }) => {
      const errors = trackPageErrors(page);
      await openTool(page, SLUG, TITLE);
      const main = page.getByRole('main');

      const compress = page.getByRole('button', { name: 'Compress', exact: true });
      await expect(compress).toBeDisabled();
      await page.getByRole('textbox', { name: 'Text to compress' }).fill('   \n ');
      await expect(compress).toBeDisabled();

      // 45 bytes, 20 times: 900 bytes that compress well.
      const text = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
      await page.getByRole('textbox', { name: 'Text to compress' }).fill(text);
      await compress.click();

      const output = page.getByRole('textbox', { name: 'Base64-encoded GZip result' });
      await expect(output).toHaveValue(/^H4sI[A-Za-z0-9+/]+={0,2}$/);
      const base64 = await output.inputValue();
      // Node's own gunzip gets the text back.
      expect(gunzipSync(Buffer.from(base64, 'base64')).toString('utf8')).toBe(text);

      expect(base64.length).toBeLessThan(900);
      const saved = ((1 - base64.length / 900) * 100).toFixed(1);
      await expect(main).toContainText(`Input: 900 BOutput: ${base64.length} BRatio: ${saved}% smaller`);

      await page.getByRole('button', { name: 'Copy', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await readClipboard(page)).toBe(base64);

      // Swap: the result becomes the input of the opposite direction.
      await page.getByRole('button', { name: 'Swap' }).click();
      await expect(page.getByRole('tab', { name: 'Decompress' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('textbox', { name: 'Base64-encoded GZip data' })).toHaveValue(base64);
      await expect(page.getByRole('textbox', { name: 'Decompressed text' })).toHaveValue('');
      await expect(main).not.toContainText('Ratio:');

      await page.getByRole('button', { name: 'Decompress', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Decompressed text' })).toHaveValue(text);
      await expect(main).toContainText(`Input: ${base64.length} BOutput: 900 B`);
      await expect(main).not.toContainText('Ratio:');

      // Editing the input drops the result that belonged to the old input.
      await page.getByRole('textbox', { name: 'Base64-encoded GZip data' }).pressSequentially('A');
      await expect(page.getByRole('textbox', { name: 'Decompressed text' })).toHaveValue('');
      await expect(main).not.toContainText('Output: 900 B');
      await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeDisabled();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByRole('textbox', { name: 'Base64-encoded GZip data' })).toHaveValue('');
      expect(errors).toEqual([]);
    });

    test('says when compressing made a short text larger', async ({ page }) => {
      await openTool(page, SLUG, TITLE);

      await page.getByRole('textbox', { name: 'Text to compress' }).fill('hi');
      await page.getByRole('button', { name: 'Compress', exact: true }).click();

      const output = page.getByRole('textbox', { name: 'Base64-encoded GZip result' });
      await expect(output).toHaveValue(/^H4sI/);
      const base64 = await output.inputValue();
      expect(gunzipSync(Buffer.from(base64, 'base64')).toString('utf8')).toBe('hi');
      // A GZip member is at least 18 bytes of header and trailer, so two bytes can only grow.
      const grown = ((base64.length / 2 - 1) * 100).toFixed(1);
      await expect(page.getByRole('main')).toContainText(`Input: 2 BOutput: ${base64.length} BRatio: ${grown}% larger`);
    });

    test('decompresses Base64 GZip made elsewhere, in every Base64 spelling', async ({ page }) => {
      const errors = trackPageErrors(page);
      await openTool(page, SLUG, TITLE);
      const main = page.getByRole('main');
      await page.getByRole('tab', { name: 'Decompress' }).click();

      const input = page.getByRole('textbox', { name: 'Base64-encoded GZip data' });
      const output = page.getByRole('textbox', { name: 'Decompressed text' });
      const decompress = page.getByRole('button', { name: 'Decompress', exact: true });

      const text = 'Grüße, 世界! 🚀 naïve café\nline two';
      const base64 = gzipSync(Buffer.from(text, 'utf8')).toString('base64');
      await input.fill(base64);
      await decompress.click();
      await expect(output).toHaveValue(text);
      await expect(main).toContainText(`Input: ${base64.length} BOutput: ${Buffer.byteLength(text, 'utf8')} B`);

      // URL-safe alphabet without padding, wrapped over several lines.
      const urlSafe = gzipSync(Buffer.from(text, 'utf8')).toString('base64url');
      const wrapped = urlSafe.replace(/(.{20})/g, '$1\n');
      await input.fill(wrapped);
      await expect(output).toHaveValue('');
      await decompress.click();
      await expect(output).toHaveValue(text);
      expect(errors).toEqual([]);
    });

    test('reports input that is not Base64 or not GZip, and recovers', async ({ page }) => {
      const errors = trackPageErrors(page);
      await openTool(page, SLUG, TITLE);
      await page.getByRole('tab', { name: 'Decompress' }).click();

      const main = page.getByRole('main');
      const alert = main.getByRole('alert');
      const input = page.getByRole('textbox', { name: 'Base64-encoded GZip data' });
      const output = page.getByRole('textbox', { name: 'Decompressed text' });
      const decompress = page.getByRole('button', { name: 'Decompress', exact: true });

      await input.fill('this is *not* base64');
      await decompress.click();
      await expect(alert).toHaveText('Error: The input is not valid Base64.');
      await expect(output).toHaveValue('');

      // "hello world" in Base64: well-formed, but not a GZip stream.
      await input.fill('aGVsbG8gd29ybGQ=');
      await expect(alert).toHaveCount(0);
      await decompress.click();
      await expect(alert).toHaveText('Error: The input is Base64 but not valid GZip data.');
      await expect(output).toHaveValue('');
      await expect(main).not.toContainText('Output:');

      // A real stream cut off half way.
      const whole = gzipSync(Buffer.from('The quick brown fox jumps over the lazy dog. '.repeat(20), 'utf8'));
      await input.fill(whole.subarray(0, Math.floor(whole.length / 2)).toString('base64'));
      await decompress.click();
      await expect(alert).toHaveText('Error: The input is Base64 but not valid GZip data.');
      await expect(output).toHaveValue('');

      await input.fill(whole.toString('base64'));
      await decompress.click();
      await expect(output).toHaveValue('The quick brown fox jumps over the lazy dog. '.repeat(20));
      await expect(alert).toHaveCount(0);

      // Bad data must not leave a rejected promise behind.
      expect(errors).toEqual([]);
    });

    test('compresses input whose GZip result is several hundred kilobytes', async ({ page }) => {
      const errors = trackPageErrors(page);
      await openTool(page, SLUG, TITLE);

      // 300,000 characters with no repetition to speak of: the result stays above 200 KB.
      let state = 0x2545f491;
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let text = '';
      for (let i = 0; i < 300_000; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        text += alphabet[(state >>> 0) % 64];
      }

      await page.getByRole('textbox', { name: 'Text to compress' }).fill(text);
      await page.getByRole('button', { name: 'Compress', exact: true }).click();

      const output = page.getByRole('textbox', { name: 'Base64-encoded GZip result' });
      await expect(output).toHaveValue(/^H4sI/);
      const base64 = await output.inputValue();
      expect(base64.length).toBeGreaterThan(200_000);
      expect(gunzipSync(Buffer.from(base64, 'base64')).toString('utf8')).toBe(text);
      // 300000 / 1024 = 292.97
      await expect(page.getByRole('main')).toContainText('Input: 292.97 KB');
      await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });

  // ── Narrow screens ──────────────────────────────────────────────────────────

  test.describe('on a phone-sized screen', () => {
    test.use({ viewport: { width: 360, height: 740 } });

    /** How far the page can be scrolled sideways, in pixels. */
    const sidewaysOverflow = (page: Page) =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    test('the UUID Generator lists 20 IDs without sideways scrolling', async ({ page }) => {
      await openTool(page, 'uuid-generator', 'UUID Generator');
      await choose(page, page.getByRole('combobox', { name: 'Count' }), '20');
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
      await expect(page.getByRole('button', { name: /^Copy [0-9a-f-]{36}$/ })).toHaveCount(20);
      expect(await sidewaysOverflow(page)).toBe(0);
    });

    test('the Snowflake tool generates and decodes without sideways scrolling', async ({ page }) => {
      await openTool(page, 'snowflake-id-generator', 'Snowflake ID Generator & Decoder');
      await page.getByRole('button', { name: 'Generate IDs' }).click();
      await expect(page.getByRole('button', { name: 'Decode', exact: true })).toHaveCount(5);
      // The row actions are on show without a pointer hovering over the row.
      await expect(page.getByRole('button', { name: 'Decode', exact: true }).first()).toBeInViewport();
      expect(await sidewaysOverflow(page)).toBe(0);

      await page.getByRole('button', { name: 'Decode', exact: true }).first().click();
      await expect(page.getByText('Decoded Values')).toBeVisible();
      expect(await sidewaysOverflow(page)).toBe(0);
    });

    test('the Mock Data Generator keeps its wide table inside the page', async ({ page }) => {
      await openTool(page, 'mock-data-generator', 'Mock Data Generator');
      await expect(page.getByRole('row').filter({ has: page.getByRole('cell') })).toHaveCount(10);
      expect(await sidewaysOverflow(page)).toBe(0);

      await page.getByRole('button', { name: 'JSON Output' }).click();
      await expect(page.getByRole('textbox', { name: 'JSON output' })).toHaveValue(/^\[\s+\{/);
      await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeInViewport();
      expect(await sidewaysOverflow(page)).toBe(0);
    });

    test('the QR Code Generator shows its code without sideways scrolling', async ({ page }) => {
      await openTool(page, 'qr-code-generator', 'QR Code Generator');
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
      const image = page.getByRole('img', { name: 'Generated QR code' });
      await expect(image).toBeVisible();
      // A 320 px code is scaled down to fit the card.
      const box = await image.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(320);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(360);
      expect(await sidewaysOverflow(page)).toBe(0);
    });

    test('the GZip tool wraps its buttons and its long result', async ({ page }) => {
      await openTool(page, 'gzip-compressor', 'GZip Compressor / Decompressor');
      await page.getByRole('textbox', { name: 'Text to compress' }).fill('LazyTools'.repeat(400));
      await page.getByRole('button', { name: 'Compress', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Base64-encoded GZip result' })).toHaveValue(/^H4sI/);
      for (const name of ['Compress', 'Swap', 'Clear']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect((box?.x ?? 0) + (box?.width ?? 0), `right edge of ${name}`).toBeLessThanOrEqual(360);
      }
      expect(await sidewaysOverflow(page)).toBe(0);
    });
  });
});
