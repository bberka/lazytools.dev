import { readFile } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

// End-to-end flows of the PDF Converter page (/tools/pdf-tools) and its four
// tools: PDF to Image, PDF to Word, Word to PDF and Image to PDF. Every fixture
// is built in memory, and every result is read back with a library other than
// the one the tool wrote it with.

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Conversions are quick, but the machine may be busy with other suites. */
const SLOW = { timeout: 30_000 };

const A4 = { width: 595.28, height: 841.89 };

interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

type Rgb = [number, number, number];

// ── Fixtures ──────────────────────────────────────────────────────────────────

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** A PNG of one solid colour: 8-bit RGB, not interlaced. */
function solidPng(width: number, height: number, [r, g, b]: Rgb): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(2, 9); // colour type: RGB

  const row = Buffer.alloc(1 + width * 3); // filter type 0, then the pixels
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A 40 x 20 JPEG whose left half is red and whose right half is blue, encoded by the browser. */
async function twoToneJpeg(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 20;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 20, 20);
    context.fillStyle = '#0000ff';
    context.fillRect(20, 0, 20, 20);
    return canvas.toDataURL('image/jpeg', 1).split(',')[1];
  });
  return Buffer.from(base64, 'base64');
}

/** Adds an EXIF block that holds nothing but an orientation, right after the JFIF header. */
function withExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  if (jpeg.readUInt16BE(0) !== 0xffd8 || jpeg.readUInt16BE(2) !== 0xffe0) {
    throw new Error('Expected a JPEG that starts with a JFIF header');
  }

  const exif = Buffer.from([
    0xff, 0xe1, 0x00, 0x22, // APP1, 34 bytes long including these two length bytes
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif", two zero bytes
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF, first directory at offset 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, one SHORT
    0x00, 0x00, 0x00, 0x00, // no further directory
  ]);

  const afterJfif = 4 + jpeg.readUInt16BE(4);
  return Buffer.concat([jpeg.subarray(0, afterJfif), exif, jpeg.subarray(afterJfif)]);
}

/** A PDF with one line of Helvetica text per page. */
async function textPdf(pages: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) doc.addPage([300, 200]).drawText(text, { x: 20, y: 100, size: 12, font });
  return Buffer.from(await doc.save());
}

/** A .docx with one plain paragraph per string. */
async function docxOf(paragraphs: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: paragraphs.map((text) => new Paragraph({ children: [new TextRun(text)] })) }],
  });
  return Packer.toBuffer(doc);
}

// ── Reading results back ──────────────────────────────────────────────────────

/** Clicks `trigger` and returns the file the browser was handed. */
async function download(page: Page, trigger: Locator): Promise<{ name: string; bytes: Buffer }> {
  const downloadPromise = page.waitForEvent('download');
  await trigger.click();
  const file = await downloadPromise;
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The colour of an on-screen image at positions given as fractions of its width and height. */
async function pixelsAt(image: Locator, points: [number, number][]): Promise<Rgb[]> {
  return image.evaluate(async (img: HTMLImageElement, at: [number, number][]) => {
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(img, 0, 0);

    return at.map(([x, y]) => {
      const [r, g, b] = context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data;
      return [r, g, b] as [number, number, number];
    });
  }, points);
}

const isRed = ([r, g, b]: Rgb) => r > 200 && g < 60 && b < 60;
const isBlue = ([r, g, b]: Rgb) => r < 60 && g < 60 && b > 200;

/** The text of every paragraph of a .docx, read from its main document part. */
async function docxParagraphs(bytes: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml']));
  const xml = await zip.file('word/document.xml')!.async('string');

  const decode = (text: string) =>
    text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');

  return Array.from(xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>|<w:p\/>/g), ([, body = '']) =>
    Array.from(body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g), ([, text]) => decode(text)).join('')
  );
}

interface PdfLine {
  text: string;
  /** Left edge, baseline and right edge, in PDF points from the bottom left corner. */
  x: number;
  y: number;
  right: number;
}

/** The text of a PDF as pdf.js reads it, one entry per page, lines from the top down. */
async function pdfLines(bytes: Buffer): Promise<{ width: number; height: number; lines: PdfLine[] }[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const pdf = await loadingTask.promise;

  try {
    const pages: { width: number; height: number; lines: PdfLine[] }[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const { width, height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      // Runs that share a baseline are one line.
      const runsByBaseline = new Map<number, { str: string; x: number; right: number }[]>();
      for (const item of content.items) {
        if (!('str' in item) || item.str === '') continue;
        const x = item.transform[4];
        const y = Math.round(item.transform[5] * 100) / 100;
        runsByBaseline.set(y, [...(runsByBaseline.get(y) ?? []), { str: item.str, x, right: x + item.width }]);
      }

      const lines = Array.from(runsByBaseline, ([y, runs]) => {
        const ordered = [...runs].sort((a, b) => a.x - b.x);
        return {
          text: ordered.map((run) => run.str).join(''),
          x: ordered[0].x,
          y,
          right: Math.max(...ordered.map((run) => run.right)),
        };
      }).sort((a, b) => b.y - a.y);

      pages.push({ width, height, lines });
    }

    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

// ── Driving the page ──────────────────────────────────────────────────────────

/** Opens a tool route and waits until the lazily loaded tool is on screen. */
async function openTool(page: Page, path: string, prompt: string): Promise<Locator> {
  await page.goto(path);
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByRole('button', { name: prompt })).toBeVisible(SLOW);
  return panel;
}

/** Drops files onto a drop area the way a drag from the desktop does. */
async function dropFiles(page: Page, target: Locator, files: FilePayload[]): Promise<void> {
  const dataTransfer = await page.evaluateHandle(
    (items) => {
      const transfer = new DataTransfer();
      for (const item of items) {
        transfer.items.add(new File([new Uint8Array(item.bytes)], item.name, { type: item.mimeType }));
      }
      return transfer;
    },
    files.map((file) => ({ name: file.name, mimeType: file.mimeType, bytes: Array.from(file.buffer) }))
  );

  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });
}

/**
 * Keeps pdf.js from starting until `release` is called, which holds a
 * conversion in its "running" state for as long as a test needs. pdf.js starts
 * one worker per opened document and ends it when the document is closed, so
 * `settled(n)` resolves once n conversions have opened their PDF and every one
 * of them has finished.
 */
async function holdPdfWorker(page: Page) {
  const started: string[] = [];
  page.on('worker', (worker) => started.push(worker.url()));

  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route(/pdf\.worker[^/]*\.mjs/, async (route) => {
    await held;
    await route.continue();
  });

  return {
    release,
    settled: async (conversions: number) => {
      await expect.poll(() => started.length, SLOW).toBeGreaterThanOrEqual(conversions);
      await expect.poll(() => page.workers().length, SLOW).toBe(0);
    },
  };
}

const TABS = ['To Image', 'To Word', 'From Word', 'From Image'];

async function expectSelectedTab(page: Page, selected: string): Promise<void> {
  for (const name of TABS) {
    await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
      'aria-selected',
      name === selected ? 'true' : 'false'
    );
  }
}

test.describe('PDF conversion tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // ── PDF Converter: the page that holds the four tools as tabs ───────────────

  test.describe('PDF Converter', () => {
    test('opens on To Image and gives every tab its tool and its own address', async ({ page }) => {
      const panel = await openTool(page, '/tools/pdf-tools', 'Click to upload a PDF');

      await expect(page.getByRole('heading', { level: 1 })).toHaveText('PDF Converter');
      await expect(page.getByRole('tab')).toHaveText(TABS);
      await expectSelectedTab(page, 'To Image');
      await expect(panel).toContainText('Convert PDF pages into high-quality PNG images');

      await page.getByRole('tab', { name: 'To Word' }).click();
      await expectSelectedTab(page, 'To Word');
      await expect(page).toHaveURL(/\/tools\/pdf-to-word\/$/);
      await expect(panel).toContainText('Extract text from a PDF and convert it to a Word (.docx) document.');

      // The tab list is a keyboard widget: arrows, Home and End move and select.
      await page.keyboard.press('ArrowRight');
      await expectSelectedTab(page, 'From Word');
      await expect(page).toHaveURL(/\/tools\/word-to-pdf\/$/);
      await expect(panel.getByRole('button', { name: 'Click to upload a Word Document (.docx)' })).toBeVisible();

      await page.keyboard.press('End');
      await expectSelectedTab(page, 'From Image');
      await expect(page).toHaveURL(/\/tools\/image-to-pdf\/$/);
      await expect(panel.getByRole('button', { name: 'Click to upload JPEG or PNG images' })).toBeVisible();

      await page.keyboard.press('Home');
      await expectSelectedTab(page, 'To Image');
      await expect(page).toHaveURL(/\/tools\/pdf-to-image\/$/);
      await expect(panel.getByRole('button', { name: 'Click to upload a PDF' })).toBeVisible();

      await expect(page.getByRole('heading', { level: 1 })).toHaveText('PDF Converter');
    });

    for (const route of [
      { slug: 'pdf-to-image', heading: 'PDF to Image', tab: 'To Image', prompt: 'Click to upload a PDF', text: 'Convert PDF pages into high-quality PNG images' },
      { slug: 'pdf-to-word', heading: 'PDF to Word', tab: 'To Word', prompt: 'Click to upload a PDF', text: 'Extract text from a PDF and convert it to a Word (.docx) document.' },
      { slug: 'word-to-pdf', heading: 'Word to PDF', tab: 'From Word', prompt: 'Click to upload a Word Document (.docx)', text: 'Extract text from a Word (.docx) document and generate a PDF.' },
      { slug: 'image-to-pdf', heading: 'Image to PDF', tab: 'From Image', prompt: 'Click to upload JPEG or PNG images', text: 'Convert one or more images into a PDF document' },
    ]) {
      test(`/tools/${route.slug} opens the ${route.tab} tab`, async ({ page }) => {
        const response = await page.goto(`/tools/${route.slug}`);
        expect(response?.status()).toBe(200);

        await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.heading);
        await expectSelectedTab(page, route.tab);

        const panel = page.getByRole('tabpanel');
        await expect(panel.getByRole('button', { name: route.prompt })).toBeVisible(SLOW);
        await expect(panel).toContainText(route.text);
      });
    }

    test('is reachable from the home page and converts in one tab after another', async ({ page }) => {
      await page.goto('/');
      await page.getByPlaceholder('Search tools...').fill('PDF Converter');
      await page.getByRole('link', { name: /PDF Converter/ }).first().click();

      await expect(page).toHaveURL(/\/tools\/pdf-tools\/$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('PDF Converter');

      const panel = page.getByRole('tabpanel');
      const pdf = { name: 'memo.pdf', mimeType: PDF_MIME, buffer: await textPdf(['Memo for the team', 'Second sheet']) };

      await panel.getByLabel('Upload a PDF').setInputFiles(pdf);
      await panel.getByRole('button', { name: 'Convert to Images' }).click();
      await expect(panel.getByText('Extracted Pages (2)')).toBeVisible(SLOW);

      // The PDF reader is closed after each conversion; the next tool has to start it again.
      await page.getByRole('tab', { name: 'To Word' }).click();
      await panel.getByLabel('Upload a PDF').setInputFiles(pdf);
      await panel.getByRole('button', { name: 'Convert to Word' }).click();

      const word = await download(page, panel.getByRole('button', { name: 'Download .docx' }));
      expect(word.name).toBe('memo.docx');
      expect(await docxParagraphs(word.bytes)).toEqual(['Memo for the team', '', 'Second sheet']);
    });

    test('names the tool on screen in the page heading after a tab change', async ({ page }) => {
      test.fixme(
        !process.env.PDF_CONVERT_RUN_FIXME,
        'Opening /tools/pdf-to-image and switching to From Word leaves the heading, description and title of PDF to Image above the Word to PDF tool'
      );

      await openTool(page, '/tools/pdf-to-image', 'Click to upload a PDF');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('PDF to Image');

      await page.getByRole('tab', { name: 'From Word' }).click();
      await expect(page).toHaveURL(/\/tools\/word-to-pdf\/$/);
      await expect(page.getByRole('tabpanel').getByRole('button', { name: 'Click to upload a Word Document (.docx)' })).toBeVisible();

      // Either the tool's own name or the name of the whole page would be true; "PDF to Image" is not.
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^(Word to PDF|PDF Converter)$/);
      await expect(page).toHaveTitle(/^(Word to PDF|PDF Converter) \| /);
    });
  });

  // ── PDF to Image ────────────────────────────────────────────────────────────

  test.describe('PDF to Image', () => {
    test('turns every page into a PNG at twice the page size and saves each one', async ({ page }) => {
      const doc = await PDFDocument.create();
      // Page 1 is portrait with a red upper half; page 2 is landscape and blue all over.
      doc.addPage([200, 300]).drawRectangle({ x: 0, y: 150, width: 200, height: 150, color: rgb(1, 0, 0) });
      doc.addPage([300, 200]).drawRectangle({ x: 0, y: 0, width: 300, height: 200, color: rgb(0, 0, 1) });

      const panel = await openTool(page, '/tools/pdf-to-image', 'Click to upload a PDF');
      await panel
        .getByLabel('Upload a PDF')
        .setInputFiles({ name: 'two-pages.pdf', mimeType: PDF_MIME, buffer: Buffer.from(await doc.save()) });
      await expect(panel.getByText('two-pages.pdf')).toBeVisible();

      await panel.getByRole('button', { name: 'Convert to Images' }).click();
      await expect(panel.getByText('Extracted Pages (2)')).toBeVisible(SLOW);
      await expect(panel.getByRole('img')).toHaveCount(2);

      const first = panel.getByRole('img', { name: 'Page 1', exact: true });
      await expect(first).toHaveJSProperty('naturalWidth', 400);
      await expect(first).toHaveJSProperty('naturalHeight', 600);
      expect(await pixelsAt(first, [[0.5, 0.25], [0.5, 0.75]])).toEqual([[255, 0, 0], [255, 255, 255]]);

      const second = panel.getByRole('img', { name: 'Page 2', exact: true });
      await expect(second).toHaveJSProperty('naturalWidth', 600);
      await expect(second).toHaveJSProperty('naturalHeight', 400);
      expect(await pixelsAt(second, [[0.5, 0.5]])).toEqual([[0, 0, 255]]);

      const firstPng = await download(page, panel.getByRole('button', { name: 'Page 1', exact: true }));
      expect(firstPng.name).toBe('page-1.png');
      expect(pngSize(firstPng.bytes)).toEqual({ width: 400, height: 600 });

      const secondPng = await download(page, panel.getByRole('button', { name: 'Page 2', exact: true }));
      expect(secondPng.name).toBe('page-2.png');
      expect(pngSize(secondPng.bytes)).toEqual({ width: 600, height: 400 });

      await panel.getByRole('button', { name: 'Clear All' }).click();
      await expect(panel.getByText('Extracted Pages')).toBeHidden();
      await expect(panel.getByText('two-pages.pdf')).toBeHidden();
      await expect(panel.getByRole('button', { name: 'Convert to Images' })).toBeHidden();
    });

    test('draws text, honours page rotation and fits a poster into a canvas every browser has', async ({ page }) => {
      test.setTimeout(90_000);

      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      // 1: black text in a font the PDF does not embed.
      doc.addPage([300, 200]).drawText('Hello', { x: 20, y: 60, size: 90, font, color: rgb(0, 0, 0) });
      // 2: a portrait page with a red upper half, shown turned a quarter clockwise.
      const turned = doc.addPage([200, 300]);
      turned.setRotation(degrees(90));
      turned.drawRectangle({ x: 0, y: 150, width: 200, height: 150, color: rgb(1, 0, 0) });
      // 3: the largest page a PDF may have, 200 x 200 inches, with a blue upper half.
      doc.addPage([14400, 14400]).drawRectangle({ x: 0, y: 7200, width: 14400, height: 7200, color: rgb(0, 0, 1) });

      const panel = await openTool(page, '/tools/pdf-to-image', 'Click to upload a PDF');
      await panel
        .getByLabel('Upload a PDF')
        .setInputFiles({ name: 'edge-pages.pdf', mimeType: PDF_MIME, buffer: Buffer.from(await doc.save()) });
      await panel.getByRole('button', { name: 'Convert to Images' }).click();

      await expect(panel.getByText('Extracted Pages (3)')).toBeVisible({ timeout: 60_000 });
      await expect(panel.getByRole('alert')).toHaveCount(0);

      // The text is there: its strokes are black where the page is otherwise white.
      const textPage = panel.getByRole('img', { name: 'Page 1', exact: true });
      await expect(textPage).toHaveJSProperty('naturalWidth', 600);
      const darkPixels = await textPage.evaluate(async (img: HTMLImageElement) => {
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const context = canvas.getContext('2d')!;
        context.drawImage(img, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let dark = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index] < 80 && data[index + 1] < 80 && data[index + 2] < 80) dark += 1;
        }
        return dark;
      });
      expect(darkPixels).toBeGreaterThan(2000);

      // Turned clockwise, the page is landscape and its former top is on the right.
      const turnedPage = panel.getByRole('img', { name: 'Page 2', exact: true });
      await expect(turnedPage).toHaveJSProperty('naturalWidth', 600);
      await expect(turnedPage).toHaveJSProperty('naturalHeight', 400);
      expect(await pixelsAt(turnedPage, [[0.25, 0.5], [0.75, 0.5]])).toEqual([[255, 255, 255], [255, 0, 0]]);

      // At twice its size the poster would need 28800 x 28800 pixels. It is
      // drawn as large as 4096 x 4096 allows instead of being left out.
      const poster = panel.getByRole('img', { name: 'Page 3', exact: true });
      const posterWidth = await poster.evaluate((img: HTMLImageElement) => img.naturalWidth);
      const posterHeight = await poster.evaluate((img: HTMLImageElement) => img.naturalHeight);
      expect(posterWidth).toBe(posterHeight);
      expect(posterWidth).toBeGreaterThanOrEqual(4090);
      expect(posterWidth).toBeLessThanOrEqual(4096);
      expect(await pixelsAt(poster, [[0.5, 0.25], [0.5, 0.75]])).toEqual([[0, 0, 255], [255, 255, 255]]);
    });

    test('takes a PDF by click, by keyboard and by drag-and-drop', async ({ page }) => {
      const panel = await openTool(page, '/tools/pdf-to-image', 'Click to upload a PDF');
      const dropzone = panel.getByRole('button', { name: 'Click to upload a PDF' });
      const buffer = await textPdf(['One page']);

      const clicked = page.waitForEvent('filechooser');
      await dropzone.click();
      const picker = await clicked;
      expect(picker.isMultiple()).toBe(false);
      await picker.setFiles({ name: 'clicked.pdf', mimeType: PDF_MIME, buffer });
      await expect(panel.getByText('clicked.pdf')).toBeVisible();

      await dropzone.focus();
      const keyed = page.waitForEvent('filechooser');
      await page.keyboard.press('Enter');
      await (await keyed).setFiles({ name: 'keyboard.pdf', mimeType: PDF_MIME, buffer });
      await expect(panel.getByText('keyboard.pdf')).toBeVisible();
      await expect(panel.getByText('clicked.pdf')).toBeHidden();

      await dropFiles(page, dropzone, [{ name: 'dropped.pdf', mimeType: PDF_MIME, buffer }]);
      await expect(panel.getByText('dropped.pdf')).toBeVisible();
      await expect(panel.getByText('keyboard.pdf')).toBeHidden();

      // A dropped file of another type is refused and the chosen PDF stays.
      await dropFiles(page, dropzone, [{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('plain text') }]);
      await expect(panel.getByRole('alert')).toHaveText(
        '"notes.txt" is not a supported file type. Accepted: application/pdf.'
      );
      await expect(panel.getByText('dropped.pdf')).toBeVisible();

      await panel.getByRole('button', { name: 'Convert to Images' }).click();
      await expect(panel.getByText('Extracted Pages (1)')).toBeVisible(SLOW);
    });

    test('refuses a file that is not a PDF and reports a PDF it cannot read', async ({ page }) => {
      const panel = await openTool(page, '/tools/pdf-to-image', 'Click to upload a PDF');
      const input = panel.getByLabel('Upload a PDF');

      await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('plain text') });
      await expect(panel.getByRole('alert')).toHaveText(
        '"notes.txt" is not a supported file type. Accepted: application/pdf.'
      );
      await expect(panel.getByRole('button', { name: 'Convert to Images' })).toBeHidden();

      // Named and typed as a PDF, but the bytes are not one.
      await input.setInputFiles({ name: 'broken.pdf', mimeType: PDF_MIME, buffer: Buffer.from('this is not a pdf') });
      await expect(panel.getByText('broken.pdf')).toBeVisible();
      await expect(panel.getByRole('alert')).toHaveCount(0);

      await panel.getByRole('button', { name: 'Convert to Images' }).click();
      await expect(panel.getByRole('alert')).toContainText('Error: Failed to convert PDF:', SLOW);
      await expect(panel.getByText('Extracted Pages')).toBeHidden();
      await expect(panel.getByRole('button', { name: 'Convert to Images' })).toBeEnabled();

      await panel.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(panel.getByText('broken.pdf')).toBeHidden();
      await expect(panel.getByRole('alert')).toHaveCount(0);
      await expect(panel.getByRole('button', { name: 'Convert to Images' })).toBeHidden();
    });

    test('says which page could not be drawn and keeps the page numbers of the others', async ({ page }) => {
      // Stands in for a browser that runs out of image memory on one page: the
      // canvas of page 2, and only that one, cannot be encoded.
      await page.addInitScript(() => {
        const encode = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (callback, ...rest) {
          if (this.width === 444 && this.height === 666) {
            callback(null);
            return;
          }
          encode.call(this, callback, ...rest);
        };
      });

      const doc = await PDFDocument.create();
      doc.addPage([200, 300]);
      doc.addPage([222, 333]); // 444 x 666 pixels at twice its size
      doc.addPage([300, 200]);

      const panel = await openTool(page, '/tools/pdf-to-image', 'Click to upload a PDF');
      await panel
        .getByLabel('Upload a PDF')
        .setInputFiles({ name: 'three-pages.pdf', mimeType: PDF_MIME, buffer: Buffer.from(await doc.save()) });
      await panel.getByRole('button', { name: 'Convert to Images' }).click();

      await expect(panel.getByText('Extracted Pages (2)')).toBeVisible(SLOW);
      await expect(panel.getByRole('alert')).toHaveText('Error: Page 2 could not be rendered and is missing below.');
      await expect(panel.getByRole('img', { name: 'Page 1', exact: true })).toBeVisible();
      await expect(panel.getByRole('img', { name: 'Page 2', exact: true })).toHaveCount(0);

      // The third page is still called page 3, on screen and as a file.
      await expect(panel.getByRole('img', { name: 'Page 3', exact: true })).toHaveJSProperty('naturalWidth', 600);
      const third = await download(page, panel.getByRole('button', { name: 'Page 3', exact: true }));
      expect(third.name).toBe('page-3.png');
      expect(pngSize(third.bytes)).toEqual({ width: 600, height: 400 });
    });

    test('drops a running conversion when another PDF is chosen', async ({ page }) => {
      const pdfWorker = await holdPdfWorker(page);
      const panel = await openTool(page, '/tools/pdf-to-image', 'Click to upload a PDF');
      const input = panel.getByLabel('Upload a PDF');

      await input.setInputFiles({ name: 'first.pdf', mimeType: PDF_MIME, buffer: await textPdf(['a', 'b', 'c']) });
      await panel.getByRole('button', { name: 'Convert to Images' }).click();
      await expect(panel.getByRole('button', { name: 'Converting...' })).toBeDisabled();

      // Choosing another file hands the button back at once.
      await input.setInputFiles({ name: 'second.pdf', mimeType: PDF_MIME, buffer: await textPdf(['only page']) });
      await expect(panel.getByText('second.pdf')).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Convert to Images' })).toBeEnabled();
      await panel.getByRole('button', { name: 'Convert to Images' }).click();

      pdfWorker.release();
      await expect(panel.getByText('Extracted Pages (1)')).toBeVisible(SLOW);

      // Once both conversions are over, only the second file's page is shown.
      await pdfWorker.settled(2);
      await expect(panel.getByText('Extracted Pages (1)')).toBeVisible();
      await expect(panel.getByRole('img')).toHaveCount(1);
      await expect(panel.getByText('second.pdf')).toBeVisible();
      await expect(panel.getByText('first.pdf')).toBeHidden();
      await expect(panel.getByRole('alert')).toHaveCount(0);
    });

    test('says so when a PDF has no pages to convert', async ({ page }) => {
      const doc = await PDFDocument.create();
      const buffer = Buffer.from(await doc.save({ addDefaultPage: false }));

      const panel = await openTool(page, '/tools/pdf-to-image', 'Click to upload a PDF');
      await panel.getByLabel('Upload a PDF').setInputFiles({ name: 'no-pages.pdf', mimeType: PDF_MIME, buffer });
      await panel.getByRole('button', { name: 'Convert to Images' }).click();

      await expect(panel.getByRole('alert')).toBeVisible(SLOW);
      await expect(panel.getByText('Extracted Pages')).toBeHidden();
    });
  });

  // ── PDF to Word ─────────────────────────────────────────────────────────────

  test.describe('PDF to Word', () => {
    test('writes the text of each page into a .docx named after the PDF', async ({ page }) => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      // Page 1: two lines, with characters that XML has to escape.
      const first = doc.addPage([400, 300]);
      first.drawText('Quarterly report: Tom & Jerry <draft>', { x: 40, y: 250, size: 14, font });
      first.drawText('Verdict "5 > 3" stands', { x: 40, y: 220, size: 14, font });
      // Page 2: no text at all.
      doc.addPage([400, 300]);
      // Page 3: one line whose space is a text run of its own, as many PDFs store it.
      const third = doc.addPage([400, 300]);
      const closing = font.widthOfTextAtSize('Closing', 14);
      const space = font.widthOfTextAtSize(' ', 14);
      third.drawText('Closing', { x: 40, y: 250, size: 14, font });
      third.drawText(' ', { x: 40 + closing, y: 250, size: 14, font });
      third.drawText('notes', { x: 40 + closing + space, y: 250, size: 14, font });

      const panel = await openTool(page, '/tools/pdf-to-word', 'Click to upload a PDF');
      await panel
        .getByLabel('Upload a PDF')
        .setInputFiles({ name: 'report.final.pdf', mimeType: PDF_MIME, buffer: Buffer.from(await doc.save()) });
      await expect(panel.getByText('report.final.pdf')).toBeVisible();

      await panel.getByRole('button', { name: 'Convert to Word' }).click();
      const word = await download(page, panel.getByRole('button', { name: 'Download .docx' }));
      await expect(panel.getByRole('alert')).toHaveCount(0);

      expect(word.name).toBe('report.final.docx');

      const paragraphs = await docxParagraphs(word.bytes);
      // Every word, in reading order, single-spaced. How the lines of one page
      // are split into paragraphs is left open here.
      expect(paragraphs.join(' ').replace(/\s+/g, ' ').trim()).toBe(
        'Quarterly report: Tom & Jerry <draft> Verdict "5 > 3" stands Closing notes'
      );
      // The page without text adds nothing, and one empty paragraph parts the two pages that have some.
      expect(paragraphs.at(-1)).toBe('Closing notes');
      expect(paragraphs.at(-2)).toBe('');
      expect(paragraphs.filter((paragraph) => paragraph === '')).toHaveLength(1);

      await panel.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(panel.getByText('report.final.pdf')).toBeHidden();
      await expect(panel.getByRole('button', { name: 'Download .docx' })).toBeHidden();
    });

    test('reports a scanned PDF, an unreadable PDF and a file of another type', async ({ page }) => {
      // A "scan": the page is a picture and holds no text.
      const scan = await PDFDocument.create();
      const picture = await scan.embedPng(solidPng(60, 80, [120, 120, 120]));
      scan.addPage([300, 400]).drawImage(picture, { x: 0, y: 0, width: 300, height: 400 });

      const panel = await openTool(page, '/tools/pdf-to-word', 'Click to upload a PDF');
      const input = panel.getByLabel('Upload a PDF');

      await input.setInputFiles({ name: 'scan.pdf', mimeType: PDF_MIME, buffer: Buffer.from(await scan.save()) });
      await panel.getByRole('button', { name: 'Convert to Word' }).click();
      await expect(panel.getByRole('alert')).toHaveText(
        'Error: No text found in the PDF. Scanned pages are pictures and have no text to extract.',
        SLOW
      );
      await expect(panel.getByRole('button', { name: 'Download .docx' })).toBeHidden();
      await expect(panel.getByRole('button', { name: 'Convert to Word' })).toBeEnabled();

      // Choosing the next file takes the old error away.
      await input.setInputFiles({ name: 'broken.pdf', mimeType: PDF_MIME, buffer: Buffer.from('this is not a pdf') });
      await expect(panel.getByText('broken.pdf')).toBeVisible();
      await expect(panel.getByRole('alert')).toHaveCount(0);

      await panel.getByRole('button', { name: 'Convert to Word' }).click();
      await expect(panel.getByRole('alert')).toContainText('Error: Failed to extract text from PDF:', SLOW);
      await expect(panel.getByRole('button', { name: 'Download .docx' })).toBeHidden();

      await panel.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(panel.getByRole('alert')).toHaveCount(0);

      await input.setInputFiles({ name: 'letter.docx', mimeType: DOCX_MIME, buffer: await docxOf(['Not a PDF']) });
      await expect(panel.getByRole('alert')).toHaveText(
        '"letter.docx" is not a supported file type. Accepted: application/pdf.'
      );
      await expect(panel.getByRole('button', { name: 'Convert to Word' })).toBeHidden();
    });

    test('offers nothing when Clear is pressed while the text is being read', async ({ page }) => {
      const pdfWorker = await holdPdfWorker(page);
      const panel = await openTool(page, '/tools/pdf-to-word', 'Click to upload a PDF');

      await panel
        .getByLabel('Upload a PDF')
        .setInputFiles({ name: 'cancelled.pdf', mimeType: PDF_MIME, buffer: await textPdf(['Text that is never offered']) });
      await panel.getByRole('button', { name: 'Convert to Word' }).click();
      await expect(panel.getByRole('button', { name: 'Extracting Text...' })).toBeDisabled();

      await panel.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(panel.getByText('cancelled.pdf')).toBeHidden();

      pdfWorker.release();
      await pdfWorker.settled(1);

      await expect(panel.getByRole('button', { name: 'Download .docx' })).toBeHidden();
      await expect(panel.getByRole('button', { name: 'Convert to Word' })).toBeHidden();
      await expect(panel.getByRole('alert')).toHaveCount(0);
      await expect(panel.getByText('cancelled.pdf')).toBeHidden();
    });
  });

  // ── Word to PDF ─────────────────────────────────────────────────────────────

  test.describe('Word to PDF', () => {
    test('sets the paragraphs of a .docx on an A4 page inside the margins', async ({ page }) => {
      const sentence = Array.from({ length: 60 }, (_, index) => `word${index}`).join(' ');
      const link = `https://example.com/${'a'.repeat(150)}`;
      const paragraphs = [
        'Dear team,',
        'Café déjà vu — 100 € “quoted” office',
        sentence,
        link,
        'Regards',
      ];

      const panel = await openTool(page, '/tools/word-to-pdf', 'Click to upload a Word Document (.docx)');
      await panel
        .getByLabel('Upload a Word document')
        .setInputFiles({ name: 'letter.docx', mimeType: DOCX_MIME, buffer: await docxOf(paragraphs) });
      await expect(panel.getByText('letter.docx')).toBeVisible();

      await panel.getByRole('button', { name: 'Convert to PDF' }).click();
      const pdf = await download(page, panel.getByRole('button', { name: 'Download .pdf' }));
      expect(pdf.name).toBe('letter.pdf');

      // Every character is in the font, so there is nothing to warn about.
      await expect(panel.getByRole('status')).toHaveCount(0);
      await expect(panel.getByRole('alert')).toHaveCount(0);

      const pages = await pdfLines(pdf.bytes);
      expect(pages).toHaveLength(1);
      expect(pages[0].width).toBeCloseTo(A4.width, 2);
      expect(pages[0].height).toBeCloseTo(A4.height, 2);

      const { lines } = pages[0];
      // 50 pt margins: the first baseline sits 50 pt below the top edge, and no line leaves the text area.
      expect(lines[0].text).toBe('Dear team,');
      expect(lines[0].y).toBeCloseTo(A4.height - 50, 2);
      for (const line of lines) {
        expect(line.x).toBeCloseTo(50, 2);
        expect(line.right).toBeLessThanOrEqual(A4.width - 50 + 0.01);
        expect(line.y).toBeGreaterThanOrEqual(50);
      }

      // No two lines share a baseline. Lines of one paragraph are one line
      // height apart; paragraphs are parted by one empty line. Baselines are
      // rounded to 0.01 pt above, so a difference of two of them is good to 0.05.
      const gaps = lines.slice(1).map((line, index) => lines[index].y - line.y);
      const lineHeight = Math.min(...gaps);
      expect(lineHeight).toBeGreaterThan(12);

      const set: PdfLine[][] = [[lines[0]]];
      gaps.forEach((gap, index) => {
        if (gap > lineHeight * 1.5) {
          expect(gap).toBeCloseTo(lineHeight * 2, 1);
          set.push([]);
        } else {
          expect(gap).toBeCloseTo(lineHeight, 1);
        }
        set[set.length - 1].push(lines[index + 1]);
      });

      expect(set).toHaveLength(5);
      const [greeting, accents, wrapped, cut, closing] = set.map((group) => group.map((line) => line.text));

      expect(greeting).toEqual(['Dear team,']);
      expect(accents).toEqual([paragraphs[1]]);
      // The long sentence breaks at spaces only.
      expect(wrapped.length).toBeGreaterThan(1);
      expect(wrapped.join(' ')).toBe(sentence);
      // A word wider than the line is cut and continues on the next line.
      expect(cut.length).toBeGreaterThan(1);
      expect(cut.join('')).toBe(link);
      expect(closing).toEqual(['Regards']);
    });

    test('continues a long document on further pages without losing a paragraph', async ({ page }) => {
      const paragraphs = Array.from({ length: 100 }, (_, index) => `Paragraph number ${index + 1} of the office file`);

      const panel = await openTool(page, '/tools/word-to-pdf', 'Click to upload a Word Document (.docx)');
      await panel
        .getByLabel('Upload a Word document')
        .setInputFiles({ name: 'Long Report.v2.DOCX', mimeType: DOCX_MIME, buffer: await docxOf(paragraphs) });
      await panel.getByRole('button', { name: 'Convert to PDF' }).click();

      const pdf = await download(page, panel.getByRole('button', { name: 'Download .pdf' }));
      expect(pdf.name).toBe('Long Report.v2.pdf');

      const pages = await pdfLines(pdf.bytes);
      // Between the 50 pt margins an A4 page has room for 42 baselines of
      // 12 pt Roboto, 18.06 pt apart: 21 one-line paragraphs with an empty
      // line after each. A hundred paragraphs need five pages.
      expect(pages).toHaveLength(5);
      expect(pages.map((pdfPage) => pdfPage.lines.length)).toEqual([21, 21, 21, 21, 16]);

      for (const pdfPage of pages) {
        expect(pdfPage.width).toBeCloseTo(A4.width, 2);
        expect(pdfPage.height).toBeCloseTo(A4.height, 2);
        expect(pdfPage.lines[0].y).toBeCloseTo(A4.height - 50, 2);
        expect(Math.min(...pdfPage.lines.map((line) => line.y))).toBeGreaterThanOrEqual(50);
      }

      expect(pages.flatMap((pdfPage) => pdfPage.lines.map((line) => line.text))).toEqual(paragraphs);
    });

    test('counts the characters its font cannot show and leaves invisible ones out', async ({ page }) => {
      const panel = await openTool(page, '/tools/word-to-pdf', 'Click to upload a Word Document (.docx)');
      const input = panel.getByLabel('Upload a Word document');
      const convert = panel.getByRole('button', { name: 'Convert to PDF' });

      // Three Japanese characters among Latin text.
      await input.setInputFiles({
        name: 'mixed.docx',
        mimeType: DOCX_MIME,
        buffer: await docxOf(['Hello 日本語 world']),
      });
      await convert.click();
      await expect(panel.getByRole('button', { name: 'Download .pdf' })).toBeVisible(SLOW);
      await expect(panel.getByRole('status')).toHaveText(
        '3 characters are not in the font this tool writes with and show as empty boxes in the PDF.'
      );

      await input.setInputFiles({ name: 'single.docx', mimeType: DOCX_MIME, buffer: await docxOf(['One 日 only']) });
      await expect(panel.getByRole('status')).toHaveCount(0);
      await convert.click();
      await expect(panel.getByRole('status')).toHaveText(
        '1 character is not in the font this tool writes with and shows as an empty box in the PDF.',
        SLOW
      );

      // A zero-width space and a soft hyphen have nothing to draw and are not counted.
      await input.setInputFiles({
        name: 'invisible.docx',
        mimeType: DOCX_MIME,
        buffer: await docxOf(['Zero​width and soft­hyphen']),
      });
      await convert.click();
      const pdf = await download(page, panel.getByRole('button', { name: 'Download .pdf' }));
      await expect(panel.getByRole('status')).toHaveCount(0);
      expect((await pdfLines(pdf.bytes))[0].lines.map((line) => line.text)).toEqual(['Zerowidth and softhyphen']);
    });

    test('reports an empty document, an unreadable one and a file of another type', async ({ page }) => {
      const panel = await openTool(page, '/tools/word-to-pdf', 'Click to upload a Word Document (.docx)');
      const input = panel.getByLabel('Upload a Word document');

      await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('plain text') });
      await expect(panel.getByRole('alert')).toHaveText('"notes.txt" is not a supported file type. Accepted: .docx.');
      await expect(panel.getByRole('button', { name: 'Convert to PDF' })).toBeHidden();

      // The old binary Word format is not a .docx either.
      await input.setInputFiles({ name: 'old.doc', mimeType: 'application/msword', buffer: Buffer.from('old format') });
      await expect(panel.getByRole('alert')).toHaveText('"old.doc" is not a supported file type. Accepted: .docx.');

      await input.setInputFiles({ name: 'empty.docx', mimeType: DOCX_MIME, buffer: await docxOf(['', '   ']) });
      await expect(panel.getByRole('alert')).toHaveCount(0);
      await panel.getByRole('button', { name: 'Convert to PDF' }).click();
      await expect(panel.getByRole('alert')).toHaveText('Error: No text found in the Word document.', SLOW);
      await expect(panel.getByRole('button', { name: 'Download .pdf' })).toBeHidden();
      await expect(panel.getByRole('button', { name: 'Convert to PDF' })).toBeEnabled();

      // Named .docx, but not the zip archive a .docx is.
      await input.setInputFiles({ name: 'broken.docx', mimeType: DOCX_MIME, buffer: Buffer.from('not a zip archive') });
      await expect(panel.getByRole('alert')).toHaveCount(0);
      await panel.getByRole('button', { name: 'Convert to PDF' }).click();
      await expect(panel.getByRole('alert')).toContainText('Error: Failed to convert document:', SLOW);
      await expect(panel.getByRole('button', { name: 'Download .pdf' })).toBeHidden();

      await panel.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(panel.getByText('broken.docx')).toBeHidden();
      await expect(panel.getByRole('alert')).toHaveCount(0);
    });

    test('explains itself when its font cannot be loaded', async ({ page }) => {
      await page.route('**/fonts/Roboto-Regular.ttf', (route) => route.fulfill({ status: 404, body: 'Not found' }));

      const panel = await openTool(page, '/tools/word-to-pdf', 'Click to upload a Word Document (.docx)');
      await panel
        .getByLabel('Upload a Word document')
        .setInputFiles({ name: 'letter.docx', mimeType: DOCX_MIME, buffer: await docxOf(['Dear team,']) });
      await panel.getByRole('button', { name: 'Convert to PDF' }).click();

      await expect(panel.getByRole('alert')).toHaveText(
        'Error: Failed to convert document: The font needed to write the PDF could not be loaded.',
        SLOW
      );
      await expect(panel.getByRole('button', { name: 'Download .pdf' })).toBeHidden();
      await expect(panel.getByRole('button', { name: 'Convert to PDF' })).toBeEnabled();
    });
  });

  // ── Image to PDF ────────────────────────────────────────────────────────────

  test.describe('Image to PDF', () => {
    test('puts the chosen images into one PDF, one page each, in the order shown', async ({ page }) => {
      const panel = await openTool(page, '/tools/image-to-pdf', 'Click to upload JPEG or PNG images');

      const chosen = page.waitForEvent('filechooser');
      await panel.getByRole('button', { name: 'Click to upload JPEG or PNG images' }).click();
      const picker = await chosen;
      expect(picker.isMultiple()).toBe(true);
      await picker.setFiles([
        { name: 'red.png', mimeType: 'image/png', buffer: solidPng(40, 20, [255, 0, 0]) },
        { name: 'blue.png', mimeType: 'image/png', buffer: solidPng(10, 30, [0, 0, 255]) },
        { name: 'green.png', mimeType: 'image/png', buffer: solidPng(7, 9, [0, 255, 0]) },
      ]);

      await expect(panel.getByText('Selected Images (3)')).toBeVisible();
      await expect(panel.getByRole('img', { name: 'red.png' })).toHaveJSProperty('naturalWidth', 40);
      await expect(panel.getByRole('img', { name: 'blue.png' })).toHaveJSProperty('naturalWidth', 10);
      await expect(panel.getByRole('img', { name: 'green.png' })).toHaveJSProperty('naturalWidth', 7);

      await panel.getByRole('button', { name: 'Remove blue.png' }).click();
      await expect(panel.getByText('Selected Images (2)')).toBeVisible();
      await expect(panel.getByRole('img', { name: 'blue.png' })).toHaveCount(0);

      const firstPdf = await download(page, panel.getByRole('button', { name: 'Generate PDF' }));
      expect(firstPdf.name).toBe('images.pdf');
      expect((await PDFDocument.load(firstPdf.bytes)).getPages().map((pdfPage) => pdfPage.getSize())).toEqual([
        { width: 40, height: 20 },
        { width: 7, height: 9 },
      ]);

      // Images chosen later go to the end of the list.
      await panel
        .getByLabel('Upload JPEG or PNG images')
        .setInputFiles({ name: 'grey.png', mimeType: 'image/png', buffer: solidPng(5, 5, [128, 128, 128]) });
      await expect(panel.getByText('Selected Images (3)')).toBeVisible();

      const secondPdf = await download(page, panel.getByRole('button', { name: 'Generate PDF' }));
      expect((await PDFDocument.load(secondPdf.bytes)).getPages().map((pdfPage) => pdfPage.getSize())).toEqual([
        { width: 40, height: 20 },
        { width: 7, height: 9 },
        { width: 5, height: 5 },
      ]);
    });

    test('shows photos upright and reads the image type from the file itself', async ({ page }) => {
      const panel = await openTool(page, '/tools/image-to-pdf', 'Click to upload JPEG or PNG images');
      const jpeg = await twoToneJpeg(page);

      await panel.getByLabel('Upload JPEG or PNG images').setInputFiles([
        { name: 'plain.jpg', mimeType: 'image/jpeg', buffer: jpeg },
        // EXIF orientation 6, what a phone held upright writes: the stored
        // left edge is the top of the picture.
        { name: 'phone.jpg', mimeType: 'image/jpeg', buffer: withExifOrientation(jpeg, 6) },
        // A JPEG that was saved under a .png name.
        { name: 'mislabelled.png', mimeType: 'image/png', buffer: jpeg },
        { name: 'green.png', mimeType: 'image/png', buffer: solidPng(30, 10, [0, 128, 0]) },
      ]);
      await expect(panel.getByText('Selected Images (4)')).toBeVisible();

      const pdf = await download(page, panel.getByRole('button', { name: 'Generate PDF' }));
      await expect(panel.getByRole('alert')).toHaveCount(0);
      expect((await PDFDocument.load(pdf.bytes)).getPages().map((pdfPage) => pdfPage.getSize())).toEqual([
        { width: 40, height: 20 },
        { width: 20, height: 40 },
        { width: 40, height: 20 },
        { width: 30, height: 10 },
      ]);

      // What is on those pages: the PDF goes through the neighbouring tab, which draws it.
      await page.getByRole('tab', { name: 'To Image' }).click();
      await panel.getByLabel('Upload a PDF').setInputFiles({ name: pdf.name, mimeType: PDF_MIME, buffer: pdf.bytes });
      await panel.getByRole('button', { name: 'Convert to Images' }).click();
      await expect(panel.getByText('Extracted Pages (4)')).toBeVisible(SLOW);

      const [plainLeft, plainRight] = await pixelsAt(panel.getByRole('img', { name: 'Page 1', exact: true }), [[0.25, 0.5], [0.75, 0.5]]);
      expect(isRed(plainLeft)).toBe(true);
      expect(isBlue(plainRight)).toBe(true);

      const [phoneTop, phoneBottom] = await pixelsAt(panel.getByRole('img', { name: 'Page 2', exact: true }), [[0.5, 0.25], [0.5, 0.75]]);
      expect(isRed(phoneTop)).toBe(true);
      expect(isBlue(phoneBottom)).toBe(true);

      const [renamedLeft, renamedRight] = await pixelsAt(panel.getByRole('img', { name: 'Page 3', exact: true }), [[0.25, 0.5], [0.75, 0.5]]);
      expect(isRed(renamedLeft)).toBe(true);
      expect(isBlue(renamedRight)).toBe(true);

      expect(await pixelsAt(panel.getByRole('img', { name: 'Page 4', exact: true }), [[0.5, 0.5]])).toEqual([[0, 128, 0]]);
    });

    test('scales an image longer than a PDF page may be down to the longest page allowed', async ({ page }) => {
      const panel = await openTool(page, '/tools/image-to-pdf', 'Click to upload JPEG or PNG images');
      await panel
        .getByLabel('Upload JPEG or PNG images')
        .setInputFiles({ name: 'long-screenshot.png', mimeType: 'image/png', buffer: solidPng(14500, 10, [0, 128, 0]) });
      await expect(panel.getByText('Selected Images (1)')).toBeVisible();

      const pdf = await download(page, panel.getByRole('button', { name: 'Generate PDF' }));
      const [pdfPage] = (await PDFDocument.load(pdf.bytes)).getPages();

      // 14400 units, 200 inches, is the most a page side may measure; the height keeps the proportion.
      expect(pdfPage.getSize().width).toBeCloseTo(14400, 5);
      expect(pdfPage.getSize().height).toBeCloseTo((10 * 14400) / 14500, 5);
    });

    test('refuses other file types and names the image it cannot read', async ({ page }) => {
      const panel = await openTool(page, '/tools/image-to-pdf', 'Click to upload JPEG or PNG images');
      const input = panel.getByLabel('Upload JPEG or PNG images');

      await input.setInputFiles([
        { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('plain text') },
        { name: 'animation.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') },
        // Named and typed as a PNG, but the bytes are not an image.
        { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') },
      ]);

      await expect(panel.getByRole('alert')).toHaveText(
        '"notes.txt" is not a supported file type. Accepted: image/jpeg, image/png. 1 more file was skipped.'
      );
      await expect(panel.getByText('Selected Images (1)')).toBeVisible();

      await panel.getByRole('button', { name: 'Generate PDF' }).click();
      const failure = panel.getByRole('alert').filter({ hasText: 'Failed to generate PDF' });
      await expect(failure).toHaveText('Error: Failed to generate PDF: "fake.png" is not a JPEG or PNG image.', SLOW);
      await expect(panel.getByRole('button', { name: 'Generate PDF' })).toBeEnabled();

      // Taking the bad image out takes its error along, and the list with it.
      await panel.getByRole('button', { name: 'Remove fake.png' }).click();
      await expect(failure).toHaveCount(0);
      await expect(panel.getByText('Selected Images')).toBeHidden();
      await expect(panel.getByRole('button', { name: 'Generate PDF' })).toBeHidden();

      await input.setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: solidPng(40, 20, [255, 0, 0]) });
      await expect(panel.getByRole('alert')).toHaveCount(0);
      const pdf = await download(page, panel.getByRole('button', { name: 'Generate PDF' }));
      expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(1);
    });

    test('shows the remove button of an image on hover and on keyboard focus', async ({ page }) => {
      const panel = await openTool(page, '/tools/image-to-pdf', 'Click to upload JPEG or PNG images');
      await panel.getByLabel('Upload JPEG or PNG images').setInputFiles([
        { name: 'red.png', mimeType: 'image/png', buffer: solidPng(40, 20, [255, 0, 0]) },
        { name: 'blue.png', mimeType: 'image/png', buffer: solidPng(10, 30, [0, 0, 255]) },
      ]);

      const remove = panel.getByRole('button', { name: 'Remove red.png' });
      await expect(remove).toHaveCSS('opacity', '0');

      await panel.getByRole('img', { name: 'red.png' }).hover();
      await expect(remove).toHaveCSS('opacity', '1');

      await page.mouse.move(0, 0);
      await expect(remove).toHaveCSS('opacity', '0');

      // By keyboard: the button after Generate PDF is the first remove button.
      await panel.getByRole('button', { name: 'Generate PDF' }).focus();
      await page.keyboard.press('Tab');
      await expect(remove).toBeFocused();
      await expect(remove).toHaveCSS('opacity', '1');

      await page.keyboard.press('Enter');
      await expect(panel.getByText('Selected Images (1)')).toBeVisible();
      await expect(panel.getByRole('img', { name: 'red.png' })).toHaveCount(0);
      await expect(panel.getByRole('img', { name: 'blue.png' })).toBeVisible();
    });
  });

  // ── On a phone ──────────────────────────────────────────────────────────────

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('fits the screen and shows the remove buttons without a pointer to hover with', async ({ page }) => {
      const panel = await openTool(page, '/tools/pdf-tools', 'Click to upload a PDF');

      const insideScreen = async (locator: Locator) => {
        const box = await locator.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      };

      for (const name of TABS) await insideScreen(page.getByRole('tab', { name, exact: true }));

      await page.getByRole('tab', { name: 'From Image' }).click();
      await panel.getByLabel('Upload JPEG or PNG images').setInputFiles([
        { name: 'red.png', mimeType: 'image/png', buffer: solidPng(40, 20, [255, 0, 0]) },
        { name: 'blue.png', mimeType: 'image/png', buffer: solidPng(10, 30, [0, 0, 255]) },
      ]);
      await expect(panel.getByText('Selected Images (2)')).toBeVisible();

      const remove = panel.getByRole('button', { name: 'Remove red.png' });
      await expect(remove).toHaveCSS('opacity', '1');
      await insideScreen(remove);
      await insideScreen(panel.getByRole('button', { name: 'Generate PDF' }));
      await insideScreen(panel.getByRole('button', { name: 'Click to upload JPEG or PNG images' }));

      await remove.tap();
      await expect(panel.getByText('Selected Images (1)')).toBeVisible();
    });

    test('keeps an error that quotes a long file name inside its box', async ({ page }) => {
      // No spaces and no hyphens: nothing a browser would break the line at.
      const name = 'Screenshot_20261011_143522_com_android_chrome_edited_final_copy';

      /** How far the text of a message reaches past the right edge of its own box, in pixels. */
      const overhang = (message: Locator) =>
        message.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const textRight = Math.max(...Array.from(range.getClientRects(), (rect) => rect.right));
          return Math.max(0, Math.round(textRight - element.getBoundingClientRect().right));
        });

      const panel = await openTool(page, '/tools/pdf-tools', 'Click to upload a PDF');

      // The message for a refused file, the same in all four tools.
      await panel
        .getByLabel('Upload a PDF')
        .setInputFiles({ name: `${name}.txt`, mimeType: 'text/plain', buffer: Buffer.from('plain text') });
      const refused = panel.getByRole('alert').filter({ hasText: 'is not a supported file type' });
      await expect(refused).toBeVisible();
      expect(await overhang(refused)).toBe(0);

      // The message for an image that cannot be read.
      await page.getByRole('tab', { name: 'From Image' }).click();
      await panel
        .getByLabel('Upload JPEG or PNG images')
        .setInputFiles({ name: `${name}.png`, mimeType: 'image/png', buffer: Buffer.from('not really a png') });
      await panel.getByRole('button', { name: 'Generate PDF' }).click();
      const failure = panel.getByRole('alert').filter({ hasText: 'Failed to generate PDF' });
      await expect(failure).toBeVisible(SLOW);
      expect(await overhang(failure)).toBe(0);
    });
  });
});
