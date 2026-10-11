import { createHash } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { test, expect, type Download, type Locator, type Page } from '@playwright/test';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
  degrees,
  type PDFPage,
} from 'pdf-lib';

// End-to-end flows of the PDF editing tools: Edit Pages, Merge, Split,
// Compress and Watermark. Every fixture is built in memory and every result is
// read back from the downloaded file with pdf-lib.

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PDF_MIME = 'application/pdf';

interface Upload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

interface PageSpec {
  size: [number, number];
  /** The page's own /Rotate. */
  rotate?: number;
  /** Text drawn on the page. */
  label?: string;
}

/** Letters that do not compress, to give a document some weight. */
function randomLetters(length: number): string {
  let seed = 0x9e3779b9;
  let text = '';
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    text += String.fromCharCode(97 + ((seed >>> 16) % 26));
  }
  return text;
}

/** A document with one page per entry; the page sizes tell the pages apart. */
async function makePdf(pages: ReadonlyArray<PageSpec | [number, number]>): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const entry of pages) {
    const spec: PageSpec = Array.isArray(entry) ? { size: entry } : entry;
    const page = doc.addPage(spec.size);
    if (spec.label) page.drawText(spec.label, { x: 20, y: 20, size: 14, font });
    if (spec.rotate !== undefined) page.setRotation(degrees(spec.rotate));
  }

  return Buffer.from(await doc.save());
}

function pdfUpload(name: string, buffer: Buffer): Upload {
  return { name, mimeType: PDF_MIME, buffer };
}

/** Bytes that carry the PDF type but are not a PDF. */
const NOT_A_PDF = Buffer.from('This is plain text, not a PDF document.\n'.repeat(8), 'latin1');

/** A document pdf-lib refuses as encrypted: its trailer names an encryption dictionary. */
async function makeMarkedEncryptedPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  doc.context.trailerInfo.Encrypt = doc.context.register(
    doc.context.obj({ Filter: 'Standard', V: 1 })
  );
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

function rc4(key: Buffer, data: Buffer): Buffer {
  const state = Array.from({ length: 256 }, (_, index) => index);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + state[i] + key[i % key.length]) & 255;
    [state[i], state[j]] = [state[j], state[i]];
  }

  const out = Buffer.alloc(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + state[i]) & 255;
    [state[i], state[j]] = [state[j], state[i]];
    out[n] = data[n] ^ state[(state[i] + state[j]) & 255];
  }
  return out;
}

function md5(...parts: Buffer[]): Buffer {
  return createHash('md5').update(Buffer.concat(parts)).digest();
}

/**
 * A really encrypted one-page PDF (200 x 200 points) with an owner password
 * and an empty user password: the 40-bit RC4 standard security handler of
 * PDF 1.1. Viewers, pdfjs included, open it without asking; pdf-lib refuses it.
 */
function makeOwnerProtectedPdf(): Buffer {
  const padding = Buffer.from(
    '28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a',
    'hex'
  );
  const fileId = Buffer.from('6c617a79746f6f6c732d7064662d6964', 'hex');
  const permissions = Buffer.alloc(4);
  permissions.writeInt32LE(-4);

  const ownerPadded = Buffer.concat([Buffer.from('owner', 'latin1'), padding]).subarray(0, 32);
  const ownerEntry = rc4(md5(ownerPadded).subarray(0, 5), padding);
  const fileKey = md5(padding, ownerEntry, permissions, fileId).subarray(0, 5);
  const userEntry = rc4(fileKey, padding);

  const objectKey = (objectNumber: number) =>
    md5(
      fileKey,
      Buffer.from([objectNumber & 255, (objectNumber >> 8) & 255, (objectNumber >> 16) & 255, 0, 0])
    ).subarray(0, 10);
  const content = rc4(objectKey(4), Buffer.from('0.9 0.2 0.2 rg 20 20 100 60 re f', 'latin1'));

  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << >> >>'
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from('\nendstream'),
    ]),
    Buffer.from(
      `<< /Filter /Standard /V 1 /R 2 /O <${ownerEntry.toString('hex')}> /U <${userEntry.toString('hex')}> /P -4 >>`
    ),
  ];

  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let length = parts[0].length;
  const push = (part: Buffer) => {
    parts.push(part);
    length += part.length;
  };

  objects.forEach((body, index) => {
    offsets.push(length);
    push(Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]));
  });

  const xrefOffset = length;
  const id = fileId.toString('hex');
  push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
        offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('') +
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Encrypt 5 0 R /ID [<${id}> <${id}>] >>\n` +
        `startxref\n${xrefOffset}\n%%EOF\n`
    )
  );

  return Buffer.concat(parts);
}

type Rgba = [number, number, number, number];

/** An 8-bit RGBA PNG whose pixels come from `pixel`. */
function makePng(width: number, height: number, pixel: (x: number, y: number) => Rgba): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, tail]);
  };

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);

  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rows.set(pixel(x, y), y * (width * 4 + 1) + 1 + x * 4);
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Opaque noise: pixels that neither deflate nor JPEG can describe briefly. */
function makeNoisePng(width: number, height: number): Buffer {
  let seed = 0x2545f491;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  };
  return makePng(width, height, () => [next(), next(), next(), 255]);
}

// ── Driving the page ──────────────────────────────────────────────────────────

/** Picks files through the drop area's file chooser, the way a click does. */
async function chooseFiles(page: Page, opener: Locator, files: Upload | Upload[]) {
  const chooser = page.waitForEvent('filechooser');
  await opener.click();
  await (await chooser).setFiles(files);
}

/** Drops files on an element, as a drag from the file manager does. */
async function dropFiles(page: Page, target: Locator, files: Upload[]) {
  const dataTransfer = await page.evaluateHandle((items) => {
    const transfer = new DataTransfer();
    for (const item of items) {
      transfer.items.add(new File([new Uint8Array(item.bytes)], item.name, { type: item.type }));
    }
    return transfer;
  }, files.map((file) => ({ name: file.name, type: file.mimeType, bytes: Array.from(file.buffer) })));

  await target.dispatchEvent('drop', { dataTransfer });
}

async function readDownload(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Clicks and returns the file the click downloads. */
async function downloadFrom(page: Page, trigger: Locator) {
  const pending = page.waitForEvent('download');
  await trigger.click();
  const download = await pending;
  return { name: download.suggestedFilename(), bytes: await readDownload(download) };
}

/** Names of everything the page downloads from now on. */
function watchDownloads(page: Page): string[] {
  const names: string[] = [];
  page.on('download', (download) => names.push(download.suggestedFilename()));
  return names;
}

/** The app's own alerts; Next's route announcer is an (empty) alert too. */
function alertWith(page: Page, text: string | RegExp): Locator {
  return page.getByRole('alert').filter({ hasText: text });
}

async function chooseOption(page: Page, select: string, option: string) {
  await page.getByRole('combobox', { name: select }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** "0.6 KB", "264.3 KB": how these tools print a size below one megabyte. */
function kilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

interface Ink {
  /** Canvas size in pixels. */
  width: number;
  height: number;
  /** Number of pixels that are not fully transparent. */
  count: number;
  /** Bounding box of those pixels. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Mean row of the inked pixels in the left and in the right half. */
  leftHalfRow: number;
  rightHalfRow: number;
}

/** What is drawn on a (transparent) canvas. */
async function canvasInk(canvas: Locator): Promise<Ink> {
  return canvas.evaluate((node) => {
    const element = node as HTMLCanvasElement;
    const { width, height } = element;
    const data = element.getContext('2d')!.getImageData(0, 0, width, height).data;
    const ink = {
      width,
      height,
      count: 0,
      left: width,
      top: height,
      right: -1,
      bottom: -1,
      leftHalfRow: 0,
      rightHalfRow: 0,
    };
    let leftCount = 0;
    let rightCount = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] === 0) continue;
        ink.count += 1;
        ink.left = Math.min(ink.left, x);
        ink.right = Math.max(ink.right, x);
        ink.top = Math.min(ink.top, y);
        ink.bottom = Math.max(ink.bottom, y);
        if (x < width / 2) {
          leftCount += 1;
          ink.leftHalfRow += y;
        } else {
          rightCount += 1;
          ink.rightHalfRow += y;
        }
      }
    }

    ink.leftHalfRow /= leftCount || 1;
    ink.rightHalfRow /= rightCount || 1;
    return ink;
  });
}

/** Alpha (0 to 255) of one pixel of a canvas. */
async function canvasAlpha(canvas: Locator, x: number, y: number): Promise<number> {
  return canvas.evaluate(
    (node, at) =>
      (node as HTMLCanvasElement).getContext('2d')!.getImageData(at.x, at.y, 1, 1).data[3],
    { x, y }
  );
}

// ── Reading a PDF back ────────────────────────────────────────────────────────

async function openPdfBytes(bytes: Buffer): Promise<PDFDocument> {
  // Loading must not touch the information fields the tests read.
  return PDFDocument.load(bytes, { updateMetadata: false });
}

/** Width, height and /Rotate of every page, in order. */
async function pageShapes(bytes: Buffer): Promise<Array<[number, number, number]>> {
  const doc = await openPdfBytes(bytes);
  return doc.getPages().map((page) => [page.getWidth(), page.getHeight(), page.getRotation().angle]);
}

function decodeStream(stream: unknown): string {
  if (!(stream instanceof PDFRawStream)) return '';
  return Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
}

function contentOf(page: PDFPage): string {
  const contents = page.node.Contents();
  if (!contents) return '';
  if (contents instanceof PDFArray) {
    return contents
      .asArray()
      .map((item) => decodeStream(page.doc.context.lookup(item)))
      .join('\n');
  }
  return decodeStream(contents);
}

/** A PDF matrix [a b c d e f]: the point (x, y) goes to (a x + c y + e, b x + d y + f). */
type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** The matrix that applies `first` and then `second`. */
function concat(first: Matrix, second: Matrix): Matrix {
  return [
    first[0] * second[0] + first[1] * second[2],
    first[0] * second[1] + first[1] * second[3],
    first[2] * second[0] + first[3] * second[2],
    first[2] * second[1] + first[3] * second[3],
    first[4] * second[0] + first[5] * second[2] + second[4],
    first[4] * second[1] + first[5] * second[3] + second[5],
  ];
}

function applyMatrix(matrix: Matrix, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

interface DrawnText {
  text: string;
  /** Text space to page space: the origin is the start of the baseline. */
  matrix: Matrix;
  fontSize: number;
  fontName: string;
  fill: number[];
  graphicsState: string;
}

interface DrawnImage {
  name: string;
  /** The unit square of the image to page space. */
  matrix: Matrix;
  graphicsState: string;
}

/** The text and the images a page draws, with where it draws them. */
function drawnOn(page: PDFPage): { texts: DrawnText[]; images: DrawnImage[] } {
  const texts: DrawnText[] = [];
  const images: DrawnImage[] = [];
  const stack: Matrix[] = [];
  let ctm = IDENTITY;
  let textMatrix = IDENTITY;
  let fontSize = 0;
  let fontName = '';
  let fill: number[] = [];
  let graphicsState = '';
  let operands: string[] = [];
  const numbers = () => operands.map(Number);

  for (const token of contentOf(page).split(/\s+/).filter(Boolean)) {
    if (!/^[A-Za-z'"*]+$/.test(token)) {
      operands.push(token);
      continue;
    }

    if (token === 'q') stack.push(ctm);
    else if (token === 'Q') ctm = stack.pop() ?? IDENTITY;
    else if (token === 'cm') ctm = concat(numbers() as Matrix, ctm);
    else if (token === 'gs') graphicsState = operands[0].slice(1);
    else if (token === 'BT') textMatrix = IDENTITY;
    else if (token === 'Tm') textMatrix = numbers() as Matrix;
    else if (token === 'rg') fill = numbers();
    else if (token === 'Tf') {
      fontName = operands[0].slice(1);
      fontSize = Number(operands[1]);
    } else if (token === 'Tj') {
      texts.push({
        text: Buffer.from(operands[0].replace(/[<>]/g, ''), 'hex').toString('latin1'),
        matrix: concat(textMatrix, ctm),
        fontSize,
        fontName,
        fill,
        graphicsState,
      });
    } else if (token === 'Do') {
      images.push({ name: operands[0].slice(1), matrix: ctm, graphicsState });
    }

    operands = [];
  }

  return { texts, images };
}

function resourceDict(page: PDFPage, kind: string): PDFDict | undefined {
  const dict = page.node.Resources()?.lookup(PDFName.of(kind));
  return dict instanceof PDFDict ? dict : undefined;
}

interface PageImage {
  width: number;
  height: number;
  filter: string;
  stream: PDFRawStream;
}

/** The image XObjects in a page's resources, by resource name. */
function imagesOf(page: PDFPage): Map<string, PageImage> {
  const images = new Map<string, PageImage>();

  for (const [name, value] of resourceDict(page, 'XObject')?.entries() ?? []) {
    const stream = page.doc.context.lookup(value);
    if (!(stream instanceof PDFRawStream)) continue;
    if (stream.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;

    images.set(name.asString().slice(1), {
      width: stream.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber(),
      height: stream.dict.lookup(PDFName.of('Height'), PDFNumber).asNumber(),
      filter: String(stream.dict.get(PDFName.of('Filter'))),
      stream,
    });
  }

  return images;
}

/** The constant opacity a named graphics state sets for fills. */
function fillOpacity(page: PDFPage, graphicsState: string): number | undefined {
  const state = resourceDict(page, 'ExtGState')?.lookup(PDFName.of(graphicsState));
  const opacity = state instanceof PDFDict ? state.lookup(PDFName.of('ca')) : undefined;
  return opacity instanceof PDFNumber ? opacity.asNumber() : undefined;
}

/** The base font a font resource name stands for, such as "Helvetica". */
function baseFont(page: PDFPage, fontName: string): string {
  const font = resourceDict(page, 'Font')?.lookup(PDFName.of(fontName));
  return font instanceof PDFDict ? String(font.get(PDFName.of('BaseFont'))) : '';
}

interface Layer {
  width: number;
  height: number;
  /** Red, green, blue of a pixel; x from the left, y from the top. */
  rgb(x: number, y: number): [number, number, number];
  alpha(x: number, y: number): number;
  /** Bounding box and centre of everything that is not transparent, in pixels. */
  ink(): { count: number; left: number; top: number; right: number; bottom: number; cx: number; cy: number };
  /** The colours of the pixels that are fully opaque, as "r,g,b". */
  solidColours(): Set<string>;
}

/** The pixels of an embedded PNG: pdf-lib stores colour and alpha as two deflated streams. */
function readLayer(image: PageImage): Layer {
  const mask = image.stream.dict.lookup(PDFName.of('SMask'));
  if (!(mask instanceof PDFRawStream)) throw new Error('The image has no alpha channel.');

  const colour = decodePDFRawStream(image.stream).decode();
  const alpha = decodePDFRawStream(mask).decode();
  const { width, height } = image;

  return {
    width,
    height,
    rgb: (x, y) => {
      const at = (y * width + x) * 3;
      return [colour[at], colour[at + 1], colour[at + 2]];
    },
    alpha: (x, y) => alpha[y * width + x],
    ink: () => {
      const box = { count: 0, left: width, top: height, right: -1, bottom: -1, cx: 0, cy: 0 };
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (alpha[y * width + x] === 0) continue;
          box.count += 1;
          box.left = Math.min(box.left, x);
          box.right = Math.max(box.right, x);
          box.top = Math.min(box.top, y);
          box.bottom = Math.max(box.bottom, y);
          box.cx += x;
          box.cy += y;
        }
      }
      box.cx /= box.count || 1;
      box.cy /= box.count || 1;
      return box;
    },
    solidColours: () => {
      const colours = new Set<string>();
      for (let at = 0; at < width * height; at++) {
        if (alpha[at] === 255) colours.add(`${colour[at * 3]},${colour[at * 3 + 1]},${colour[at * 3 + 2]}`);
      }
      return colours;
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('PDF editing tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // An exception nobody caught is a defect whatever the test was looking at.
  let pageErrors: string[];

  test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
  });

  test.afterEach(() => {
    expect(pageErrors, 'uncaught exceptions on the page').toEqual([]);
  });

  test.describe('PDF Editor page', () => {
    test('each tab opens its tool under its own address', async ({ page }) => {
      await page.goto('/tools/pdf-editor/');

      await expect(page.getByRole('heading', { level: 1 })).toHaveText('PDF Editor');
      await expect(page.getByRole('tab')).toHaveText([
        'Edit Pages',
        'Merge',
        'Split',
        'Compress',
        'Watermark',
      ]);
      await expect(page.getByRole('tab', { name: 'Edit Pages' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(page.getByRole('tabpanel', { name: 'Edit Pages' })).toContainText(
        'Rearrange pages, delete pages, rotate layouts, and annotate with drawings and text notes.'
      );

      const tabs: Array<[string, string, string]> = [
        ['Merge', 'pdf-merge', 'Combine multiple PDF documents into a single file'],
        ['Split', 'pdf-split', 'Extract specific pages or ranges from a PDF document'],
        [
          'Compress',
          'pdf-compress',
          'Reduce PDF file sizes by compressing images or stripping structural metadata.',
        ],
        [
          'Watermark',
          'pdf-watermark',
          'Overlay custom text or image stamps onto your PDF documents securely in the browser.',
        ],
        [
          'Edit Pages',
          'pdf-editor',
          'Rearrange pages, delete pages, rotate layouts, and annotate with drawings and text notes.',
        ],
      ];

      for (const [tab, slug, description] of tabs) {
        await page.getByRole('tab', { name: tab }).click();
        await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tabpanel', { name: tab })).toContainText(description);
        await expect(page).toHaveURL(new RegExp(`/tools/${slug}/$`));
      }
    });

    test('the tool addresses open their own tab', async ({ page }) => {
      const routes: Array<[string, string, string]> = [
        ['pdf-merge', 'Merge PDF', 'Merge'],
        ['pdf-split', 'Split PDF', 'Split'],
        ['pdf-compress', 'Compress PDF', 'Compress'],
        ['pdf-watermark', 'PDF Watermark', 'Watermark'],
      ];

      for (const [slug, heading, tab] of routes) {
        await page.goto(`/tools/${slug}/`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
        await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tabpanel', { name: tab })).toBeVisible();
      }
    });
  });

  test.describe('Merge PDF', () => {
    const dropzone = (page: Page) =>
      page.getByRole('button', { name: 'Click to upload or drag and drop PDFs' });

    test('merges the files in the order of the list', async ({ page }) => {
      const cover = await makePdf([[200, 300]]);
      const body = await makePdf([
        [400, 500],
        [410, 510],
      ]);
      const appendix = await makePdf([{ size: [600, 700], label: randomLetters(1800) }]);

      await page.goto('/tools/pdf-merge/');
      await chooseFiles(page, dropzone(page), [
        pdfUpload('cover.pdf', cover),
        pdfUpload('body.pdf', body),
      ]);
      // A second pick adds to the list instead of replacing it.
      await chooseFiles(page, dropzone(page), pdfUpload('appendix.pdf', appendix));

      const panel = page.getByRole('tabpanel', { name: 'Merge' });
      await expect(panel).toContainText('Selected Files (3)');
      // The heavier file shows a larger size than the two small ones.
      expect(kilobytes(appendix.length)).not.toBe(kilobytes(cover.length));
      await expect(panel.getByText(/^\d+\.\d KB$/)).toHaveText([
        kilobytes(cover.length),
        kilobytes(body.length),
        kilobytes(appendix.length),
      ]);
      await expect(panel.getByText(/\.pdf$/)).toHaveText(['cover.pdf', 'body.pdf', 'appendix.pdf']);

      await expect(page.getByRole('button', { name: 'Move cover.pdf up' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Move appendix.pdf down' })).toBeDisabled();

      // appendix, cover, body
      await page.getByRole('button', { name: 'Move appendix.pdf up' }).click();
      await page.getByRole('button', { name: 'Move appendix.pdf up' }).click();
      await expect(panel.getByText(/\.pdf$/)).toHaveText(['appendix.pdf', 'cover.pdf', 'body.pdf']);
      // appendix, body, cover
      await page.getByRole('button', { name: 'Move cover.pdf down' }).click();
      await expect(panel.getByText(/\.pdf$/)).toHaveText(['appendix.pdf', 'body.pdf', 'cover.pdf']);

      const merged = await downloadFrom(page, page.getByRole('button', { name: 'Merge PDFs' }));

      expect(merged.name).toBe('merged.pdf');
      expect(await pageShapes(merged.bytes)).toEqual([
        [600, 700, 0],
        [400, 500, 0],
        [410, 510, 0],
        [200, 300, 0],
      ]);
      await expect(page.getByRole('status')).toHaveText('Merged 3 files (4 pages) into merged.pdf.');

      // Removing a file changes what the next merge contains.
      await page.getByRole('button', { name: 'Remove body.pdf' }).click();
      await expect(panel).toContainText('Selected Files (2)');
      await expect(page.getByRole('status')).toHaveCount(0);

      const again = await downloadFrom(page, page.getByRole('button', { name: 'Merge PDFs' }));
      expect(await pageShapes(again.bytes)).toEqual([
        [600, 700, 0],
        [200, 300, 0],
      ]);
      await expect(page.getByRole('status')).toHaveText('Merged 2 files (2 pages) into merged.pdf.');
    });

    test('one file cannot be merged, and dropped files are taken like picked ones', async ({ page }) => {
      await page.goto('/tools/pdf-merge/');
      const panel = page.getByRole('tabpanel', { name: 'Merge' });

      await dropFiles(page, dropzone(page), [pdfUpload('first.pdf', await makePdf([[200, 300]]))]);

      await expect(panel).toContainText('Selected Files (1)');
      await expect(panel).toContainText('Add at least one more PDF to merge.');
      await expect(page.getByRole('button', { name: 'Merge PDFs' })).toHaveCount(0);

      // A dropped file that is not a PDF is refused, the PDF next to it is taken.
      await dropFiles(page, dropzone(page), [
        { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
        pdfUpload('second.pdf', await makePdf([[300, 200]])),
      ]);

      await expect(alertWith(page, 'notes.txt')).toHaveText(
        '"notes.txt" is not a supported file type. Accepted: application/pdf.'
      );
      await expect(panel).toContainText('Selected Files (2)');
      await expect(panel).not.toContainText('Add at least one more PDF to merge.');

      const merged = await downloadFrom(page, page.getByRole('button', { name: 'Merge PDFs' }));
      expect(await pageShapes(merged.bytes)).toEqual([
        [200, 300, 0],
        [300, 200, 0],
      ]);

      await page.getByRole('button', { name: 'Remove first.pdf' }).click();
      await page.getByRole('button', { name: 'Remove second.pdf' }).click();
      await expect(panel).not.toContainText('Selected Files');
    });

    test('names the file that cannot be read and downloads nothing', async ({ page }) => {
      const downloads = watchDownloads(page);
      await page.goto('/tools/pdf-merge/');

      await chooseFiles(page, dropzone(page), [
        pdfUpload('good.pdf', await makePdf([[200, 300]])),
        pdfUpload('broken.pdf', NOT_A_PDF),
      ]);
      await page.getByRole('button', { name: 'Merge PDFs' }).click();

      await expect(alertWith(page, 'broken.pdf')).toHaveText(
        'Error: "broken.pdf" could not be read as a PDF. It may be damaged or not a PDF at all.'
      );
      await expect(page.getByRole('status')).toHaveCount(0);

      // Taking the bad file out clears the error; a protected one is named in plain words.
      await page.getByRole('button', { name: 'Remove broken.pdf' }).click();
      await expect(alertWith(page, 'broken.pdf')).toHaveCount(0);

      await chooseFiles(page, dropzone(page), pdfUpload('locked.pdf', await makeMarkedEncryptedPdf()));
      await page.getByRole('button', { name: 'Merge PDFs' }).click();

      await expect(alertWith(page, 'locked.pdf')).toHaveText(
        'Error: "locked.pdf" is password-protected or encrypted. Remove the protection and try again.'
      );
      expect(downloads).toEqual([]);
    });
  });

  test.describe('Split PDF', () => {
    const dropzone = (page: Page) =>
      page.getByRole('button', { name: 'Drag & drop a PDF file here or click to browse' });
    const rangeField = (page: Page) => page.getByLabel('Page Range (e.g. 1-3, 5, 7-10)');
    const extract = (page: Page) => page.getByRole('button', { name: 'Extract Pages' });

    const FIVE_PAGES: Array<[number, number]> = [
      [110, 210],
      [120, 220],
      [130, 230],
      [140, 240],
      [150, 250],
    ];

    test('extracts the pages named by the range, in document order', async ({ page }) => {
      const source = await makePdf(FIVE_PAGES);

      await page.goto('/tools/pdf-split/');
      await chooseFiles(page, dropzone(page), pdfUpload('report.pdf', source));

      const panel = page.getByRole('tabpanel', { name: 'Split' });
      await expect(panel).toContainText('PDF contains 5 pages');
      await expect(dropzone(page)).toContainText('report.pdf');
      // The whole document is offered first.
      await expect(rangeField(page)).toHaveValue('1-5');

      // Out of order and with a repeat: each page once, in document order.
      await rangeField(page).fill('5, 2-3, 2');
      const split = await downloadFrom(page, extract(page));

      expect(split.name).toBe('split-report.pdf');
      expect(await pageShapes(split.bytes)).toEqual([
        [120, 220, 0],
        [130, 230, 0],
        [150, 250, 0],
      ]);
      await expect(page.getByRole('status')).toHaveText(
        'Extracted pages 2-3, 5 to split-report.pdf.'
      );

      // One page, and the part of a range that lies outside the document is ignored.
      await rangeField(page).fill('4');
      await expect(page.getByRole('status')).toHaveCount(0);
      const single = await downloadFrom(page, extract(page));
      expect(await pageShapes(single.bytes)).toEqual([[140, 240, 0]]);
      await expect(page.getByRole('status')).toHaveText('Extracted page 4 to split-report.pdf.');

      await rangeField(page).fill('4-9');
      const tail = await downloadFrom(page, extract(page));
      expect(await pageShapes(tail.bytes)).toEqual([
        [140, 240, 0],
        [150, 250, 0],
      ]);
      await expect(page.getByRole('status')).toHaveText('Extracted pages 4-5 to split-report.pdf.');
    });

    test('a range that matches no page is an error, not a blank PDF', async ({ page }) => {
      const downloads = watchDownloads(page);

      await page.goto('/tools/pdf-split/');
      await chooseFiles(page, dropzone(page), pdfUpload('report.pdf', await makePdf(FIVE_PAGES)));
      await expect(rangeField(page)).toHaveValue('1-5');

      await rangeField(page).fill('8-12');
      await extract(page).click();
      await expect(alertWith(page, 'No pages')).toHaveText(
        'Error: No pages match "8-12". This PDF has pages 1 to 5.'
      );

      await rangeField(page).fill('3-1');
      await extract(page).click();
      await expect(alertWith(page, 'No pages')).toHaveText(
        'Error: No pages match "3-1". This PDF has pages 1 to 5.'
      );

      await rangeField(page).fill('two');
      await extract(page).click();
      await expect(alertWith(page, 'No pages')).toHaveText(
        'Error: No pages match "two". This PDF has pages 1 to 5.'
      );

      // Nothing to extract: the button is off for an empty and for a blank range.
      await rangeField(page).fill('');
      await expect(extract(page)).toBeDisabled();
      await rangeField(page).fill('   ');
      await expect(extract(page)).toBeDisabled();

      expect(downloads).toEqual([]);

      // A valid range afterwards clears the error and downloads.
      await rangeField(page).fill('1');
      const split = await downloadFrom(page, extract(page));
      expect(await pageShapes(split.bytes)).toEqual([[110, 210, 0]]);
      await expect(alertWith(page, 'No pages')).toHaveCount(0);
    });

    test('reports unreadable and protected files, and Clear empties the tool', async ({ page }) => {
      await page.goto('/tools/pdf-split/');
      const panel = page.getByRole('tabpanel', { name: 'Split' });

      // Not a PDF by type: refused in the drop area.
      await chooseFiles(page, dropzone(page), {
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('hello'),
      });
      await expect(alertWith(page, 'notes.txt')).toHaveText(
        '"notes.txt" is not a supported file type. Accepted: application/pdf.'
      );
      await expect(panel).not.toContainText('Split Options');

      // A PDF by type whose bytes are not one.
      await chooseFiles(page, dropzone(page), pdfUpload('broken.pdf', NOT_A_PDF));
      await expect(alertWith(page, 'could not be read')).toHaveText(
        'Error: This file could not be read as a PDF. It may be damaged or not a PDF at all.'
      );
      await expect(panel).not.toContainText('PDF contains');
      await expect(rangeField(page)).toHaveValue('');
      await rangeField(page).fill('1');
      await expect(extract(page)).toBeDisabled();

      await chooseFiles(page, dropzone(page), pdfUpload('locked.pdf', await makeMarkedEncryptedPdf()));
      await expect(alertWith(page, 'password-protected')).toHaveText(
        'Error: This PDF is password-protected or encrypted. Remove the protection and try again.'
      );
      await expect(extract(page)).toBeDisabled();

      // A good file replaces the failed one and its error; a name without an extension still downloads as .pdf.
      await chooseFiles(page, dropzone(page), pdfUpload('scan', await makePdf([[300, 300]])));
      await expect(panel).toContainText('PDF contains 1 page');
      await expect(panel).not.toContainText('1 pages');
      await expect(page.getByRole('alert').filter({ hasText: 'Error' })).toHaveCount(0);
      await expect(rangeField(page)).toHaveValue('1-1');

      const split = await downloadFrom(page, extract(page));
      expect(split.name).toBe('split-scan.pdf');
      expect(await pageShapes(split.bytes)).toEqual([[300, 300, 0]]);
      await expect(page.getByRole('status')).toHaveText('Extracted page 1 to split-scan.pdf.');

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(panel).not.toContainText('Split Options');
      await expect(dropzone(page)).not.toContainText('scan');
    });
  });

  test.describe('Compress PDF', () => {
    const dropzone = (page: Page) => page.getByRole('button', { name: 'Click to upload a PDF file' });
    const compress = (page: Page) => page.getByRole('button', { name: 'Compress PDF', exact: true });
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    /** The three figures of the result card, as the panel prints them. */
    const figures = (original: number, compressed: number, saved: string) =>
      new RegExp(
        `Original Size\\s*${escape(kilobytes(original))}\\s*` +
          `Compressed Size\\s*${escape(kilobytes(compressed))}\\s*` +
          `Space Saved\\s*${escape(saved)}`
      );

    /** Share of the original that is gone, in percent with one decimal. */
    const savedPercent = (original: number, compressed: number) =>
      `-${Math.round(((original - compressed) / original) * 1000) / 10}%`;

    /** Two pages that show the same noisy picture: a scan, as far as a compressor can tell. */
    async function makeScanPdf(): Promise<Buffer> {
      const doc = await PDFDocument.create();
      const picture = await doc.embedPng(makeNoisePng(300, 300));
      doc.addPage([300, 300]).drawImage(picture, { x: 0, y: 0, width: 300, height: 300 });
      doc.addPage([400, 200]).drawImage(picture, { x: 0, y: 0, width: 400, height: 200 });
      return Buffer.from(await doc.save());
    }

    /** Twelve pages of text with a full description and an XMP packet, written without object streams. */
    async function makeDescribedPdf(): Promise<Buffer> {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      for (let number = 1; number <= 12; number++) {
        doc
          .addPage([300, 400])
          .drawText(`Quarterly figures, page ${number}`, { x: 30, y: 350, size: 14, font });
      }

      doc.setTitle('Quarterly Secret Report');
      doc.setAuthor('Ada Lovelace');
      doc.setSubject('Internal figures');
      doc.setKeywords(['secret', 'draft']);
      doc.setCreator('Report Builder');
      doc.setProducer('Fixture Producer');

      const packet =
        '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">' +
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
        '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        '<dc:title>Quarterly Secret Report</dc:title><dc:creator>Ada Lovelace</dc:creator>' +
        '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
      doc.catalog.set(
        PDFName.of('Metadata'),
        doc.context.register(doc.context.stream(packet, { Type: 'Metadata', Subtype: 'XML' }))
      );

      return Buffer.from(await doc.save({ useObjectStreams: false }));
    }

    test('Compress Images redraws every page as a JPEG and reports the saving', async ({ page }) => {
      const source = await makeScanPdf();

      await page.goto('/tools/pdf-compress/');
      await chooseFiles(page, dropzone(page), pdfUpload('scan.pdf', source));

      const panel = page.getByRole('tabpanel', { name: 'Compress' });
      await expect(dropzone(page)).toContainText(`scan.pdf (${kilobytes(source.length)})`);

      // Defaults: image mode at the middle level. The labels give the resolution of each level.
      const mode = page.getByRole('group', { name: 'Compression Mode' });
      const level = page.getByRole('group', { name: 'Compression Level' });
      await expect(mode.getByRole('button', { name: /^Compress Images \(Recommended\)/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect(level.getByRole('button')).toHaveText([
        /^Low\s*Clear \(144 DPI\)$/,
        /^Medium\s*Balanced \(108 DPI\)$/,
        /^High\s*Smallest \(72 DPI\)$/,
      ]);
      await expect(level.getByRole('button', { name: /^Medium/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      await level.getByRole('button', { name: /^High/ }).click();
      await expect(level.getByRole('button', { name: /^High/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(level.getByRole('button', { name: /^Medium/ })).toHaveAttribute(
        'aria-pressed',
        'false'
      );

      await compress(page).click();
      await expect(panel).toContainText('Compression Successful!');

      const result = await downloadFrom(page, page.getByRole('button', { name: 'Download PDF' }));
      expect(result.name).toBe('compressed-scan.pdf');
      expect(result.bytes.length).toBeLessThan(source.length);
      await expect(panel).toContainText(
        figures(source.length, result.bytes.length, savedPercent(source.length, result.bytes.length))
      );

      // Same pages, each now one JPEG drawn over the whole page. 72 DPI is one pixel per point.
      const doc = await openPdfBytes(result.bytes);
      expect(await pageShapes(result.bytes)).toEqual([
        [300, 300, 0],
        [400, 200, 0],
      ]);

      for (const [index, [width, height]] of [
        [300, 300],
        [400, 200],
      ].entries()) {
        const compressedPage = doc.getPage(index);
        const images = [...imagesOf(compressedPage).values()];
        expect(images.map((image) => [image.width, image.height, image.filter])).toEqual([
          [width, height, '/DCTDecode'],
        ]);
        expect(drawnOn(compressedPage).images.map((image) => image.matrix)).toEqual([
          [width, 0, 0, height, 0, 0],
        ]);
      }

      await page.getByRole('button', { name: 'Compress Another File' }).click();
      await expect(panel).not.toContainText('Compression Successful!');
      await expect(panel).not.toContainText('Compression Settings');
      await expect(dropzone(page)).not.toContainText('scan.pdf');
    });

    test('a result that is not smaller is not called a success', async ({ page }) => {
      const source = await makePdf([[200, 100]]);

      await page.goto('/tools/pdf-compress/');
      await chooseFiles(page, dropzone(page), pdfUpload('tiny.pdf', source));

      const panel = page.getByRole('tabpanel', { name: 'Compress' });
      const level = page.getByRole('group', { name: 'Compression Level' });
      await level.getByRole('button', { name: /^Low/ }).click();
      await compress(page).click();

      // An empty page as a picture is larger than the empty page.
      await expect(panel).toContainText('No Size Reduction');
      await expect(panel).not.toContainText('Compression Successful!');
      await expect(page.getByRole('button', { name: 'Download PDF' })).toHaveCount(0);

      const result = await downloadFrom(page, page.getByRole('button', { name: 'Download Anyway' }));
      expect(result.name).toBe('compressed-tiny.pdf');
      expect(result.bytes.length).toBeGreaterThan(source.length);
      await expect(panel).toContainText(figures(source.length, result.bytes.length, '0%'));

      // Low is 144 DPI: two pixels per point.
      const doc = await openPdfBytes(result.bytes);
      expect(await pageShapes(result.bytes)).toEqual([[200, 100, 0]]);
      expect(
        [...imagesOf(doc.getPage(0)).values()].map((image) => [image.width, image.height, image.filter])
      ).toEqual([[400, 200, '/DCTDecode']]);

      // Back to the settings, which are as they were left.
      await page.getByRole('button', { name: 'Try Other Settings' }).click();
      await expect(panel).not.toContainText('No Size Reduction');
      await expect(level.getByRole('button', { name: /^Low/ })).toHaveAttribute('aria-pressed', 'true');

      // Structure mode has no levels.
      await page.getByRole('button', { name: /^Optimize Structure/ }).click();
      await expect(page.getByRole('group', { name: 'Compression Level' })).toHaveCount(0);

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(panel).not.toContainText('Compression Settings');
      await expect(dropzone(page)).not.toContainText('tiny.pdf');
    });

    test('Optimize Structure removes the description and keeps the pages', async ({ page }) => {
      const source = await makeDescribedPdf();
      // The fixture really carries what the tool is expected to take out.
      expect(source.includes('Ada Lovelace')).toBe(true);

      await page.goto('/tools/pdf-compress/');
      await chooseFiles(page, dropzone(page), pdfUpload('quarterly.pdf', source));

      const panel = page.getByRole('tabpanel', { name: 'Compress' });
      await page.getByRole('button', { name: /^Optimize Structure/ }).click();
      await expect(page.getByRole('button', { name: /^Optimize Structure/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await compress(page).click();
      await expect(panel).toContainText('Compression Successful!');

      const result = await downloadFrom(page, page.getByRole('button', { name: 'Download PDF' }));
      expect(result.name).toBe('compressed-quarterly.pdf');
      expect(result.bytes.length).toBeLessThan(source.length);
      await expect(panel).toContainText(
        figures(source.length, result.bytes.length, savedPercent(source.length, result.bytes.length))
      );

      const doc = await openPdfBytes(result.bytes);
      expect([
        doc.getTitle(),
        doc.getAuthor(),
        doc.getSubject(),
        doc.getKeywords(),
        doc.getCreator(),
        doc.getProducer(),
      ].map((value) => value ?? '')).toEqual(['', '', '', '', '', '']);
      expect(doc.catalog.get(PDFName.of('Metadata'))).toBeUndefined();

      // Nothing in the file still spells out the title or the author.
      const readable = [
        result.bytes.toString('latin1'),
        ...doc.context.enumerateIndirectObjects().map(([, object]) => {
          try {
            return decodeStream(object);
          } catch {
            return '';
          }
        }),
      ].join('\n');
      expect(readable).not.toContain('Ada Lovelace');
      expect(readable).not.toContain('Quarterly Secret Report');

      // The pages and their text are untouched.
      expect(doc.getPageCount()).toBe(12);
      doc.getPages().forEach((compressedPage, index) => {
        expect([compressedPage.getWidth(), compressedPage.getHeight()]).toEqual([300, 400]);
        expect(drawnOn(compressedPage).texts.map((text) => text.text)).toEqual([
          `Quarterly figures, page ${index + 1}`,
        ]);
      });
    });

    test('reports files it cannot compress', async ({ page }) => {
      const downloads = watchDownloads(page);
      await page.goto('/tools/pdf-compress/');
      const panel = page.getByRole('tabpanel', { name: 'Compress' });

      await chooseFiles(page, dropzone(page), {
        name: 'photo.png',
        mimeType: 'image/png',
        buffer: makePng(4, 4, () => [0, 0, 255, 255]),
      });
      await expect(alertWith(page, 'photo.png')).toHaveText(
        '"photo.png" is not a supported file type. Accepted: application/pdf.'
      );
      await expect(panel).not.toContainText('Compression Settings');

      // A PDF by type whose bytes are not one: both modes say so and leave the settings up.
      await chooseFiles(page, dropzone(page), pdfUpload('broken.pdf', NOT_A_PDF));
      await compress(page).click();
      await expect(alertWith(page, 'Error')).toContainText('Failed to compress PDF');
      await expect(panel).toContainText('Compression Settings');

      await page.getByRole('button', { name: /^Optimize Structure/ }).click();
      await compress(page).click();
      await expect(alertWith(page, 'Error')).toHaveText(
        'Error: This file could not be read as a PDF. It may be damaged or not a PDF at all.'
      );

      // A protected file cannot be rewritten; the message says why.
      await chooseFiles(page, dropzone(page), pdfUpload('protected.pdf', makeOwnerProtectedPdf()));
      await expect(alertWith(page, 'Error')).toHaveCount(0);
      await compress(page).click();
      await expect(alertWith(page, 'Error')).toHaveText(
        'Error: This PDF is password-protected or encrypted. Remove the protection and try again.'
      );
      await expect(panel).not.toContainText('Compression Successful!');
      expect(downloads).toEqual([]);
    });
  });

  test.describe('PDF Watermark', () => {
    const dropzone = (page: Page) => page.getByRole('button', { name: 'Click to upload a PDF file' });
    const stamp = (page: Page) => page.getByRole('button', { name: 'Watermark PDF', exact: true });
    const textField = (page: Page) => page.getByLabel('Watermark Text');
    // The watermark is drawn on the second canvas, laid over the picture of page 1.
    const overlay = (page: Page) => page.getByRole('tabpanel', { name: 'Watermark' }).locator('canvas').nth(1);
    // The sliders have no accessible name; in text mode they are Font Size, Angle and Opacity, in that order.
    const slider = (page: Page, index: number) =>
      page.getByRole('tabpanel', { name: 'Watermark' }).getByRole('slider').nth(index);

    async function press(target: Locator, key: string, times = 1) {
      for (let count = 0; count < times; count++) await target.press(key);
    }

    async function load(page: Page, name: string, pdf: Buffer) {
      await page.goto('/tools/pdf-watermark/');
      await chooseFiles(page, dropzone(page), pdfUpload(name, pdf));
      await expect(page.getByRole('tabpanel', { name: 'Watermark' })).toContainText('Watermark Settings');
      await expect(dropzone(page)).toContainText(name);
    }

    /** Where a point of a page's own coordinates is shown: from the left and from the bottom of the page as a viewer turns it. */
    function shownAt(pdfPage: PDFPage, x: number, y: number): [number, number] {
      const { width, height } = pdfPage.getSize();
      const turn = ((pdfPage.getRotation().angle % 360) + 360) % 360;
      if (turn === 90) return [y, width - x];
      if (turn === 180) return [width - x, height - y];
      if (turn === 270) return [height - y, x];
      return [x, y];
    }

    const THREE_PAGES: Array<[number, number]> = [
      [400, 400],
      [300, 500],
      [500, 300],
    ];

    test('stamps the text on every page, turned the way the preview shows it', async ({ page }) => {
      await load(page, 'contract.pdf', await makePdf(THREE_PAGES));
      const panel = page.getByRole('tabpanel', { name: 'Watermark' });

      // Defaults
      await expect(textField(page)).toHaveValue('CONFIDENTIAL');
      await expect(page.getByRole('combobox', { name: 'Font Family' })).toHaveText('Helvetica');
      await expect(page.getByRole('button', { name: 'Red', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('combobox', { name: 'Placement' })).toHaveText('Center');
      await expect(page.getByRole('combobox', { name: 'Page Range' })).toHaveText('All Pages');
      await expect(panel).toContainText(/Font Size\s*48px/);
      await expect(panel).toContainText(/Angle \(Degrees\)\s*-45°/);
      await expect(panel).toContainText(/Opacity \(Transparency\)\s*30%/);

      // The preview: page 1 at one pixel per point, the text climbing from the lower left to the upper right.
      await expect.poll(async () => (await canvasInk(overlay(page))).count).toBeGreaterThan(0);
      const preview = await canvasInk(overlay(page));
      expect([preview.width, preview.height]).toEqual([400, 400]);
      expect(preview.leftHalfRow).toBeGreaterThan(preview.rightHalfRow + 50);

      const marked = await downloadFrom(page, stamp(page));
      expect(marked.name).toBe('watermarked-contract.pdf');
      await expect(page.getByRole('status')).toHaveText('Watermark added to pages 1-3.');

      const helvetica = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
      const textWidth = helvetica.widthOfTextAtSize('CONFIDENTIAL', 48);
      const capHeight = 0.718 * 48;

      const doc = await openPdfBytes(marked.bytes);
      expect(await pageShapes(marked.bytes)).toEqual(THREE_PAGES.map(([width, height]) => [width, height, 0]));

      for (const markedPage of doc.getPages()) {
        const { texts, images } = drawnOn(markedPage);
        expect(images).toEqual([]);
        expect(texts.map((text) => text.text)).toEqual(['CONFIDENTIAL']);

        const [text] = texts;
        expect(text.fontSize).toBe(48);
        expect(baseFont(markedPage, text.fontName)).toBe('/Helvetica');
        expect(text.fill).toEqual([1, 0, 0]);
        expect(fillOpacity(markedPage, text.graphicsState)).toBeCloseTo(0.3, 5);

        // 45 degrees counter-clockwise: the text climbs to the right, as in the preview.
        const [a, b, c, d] = text.matrix;
        expect(a).toBeCloseTo(Math.SQRT1_2, 3);
        expect(b).toBeCloseTo(Math.SQRT1_2, 3);
        expect(c).toBeCloseTo(-Math.SQRT1_2, 3);
        expect(d).toBeCloseTo(Math.SQRT1_2, 3);

        // The middle of the letters sits on the middle of the page.
        const [middleX, middleY] = applyMatrix(text.matrix, textWidth / 2, capHeight / 2);
        expect(Math.hypot(middleX - markedPage.getWidth() / 2, middleY - markedPage.getHeight() / 2)).toBeLessThan(10);
      }
    });

    test('text, font, colour, angle, opacity, placement and page range reach the file', async ({ page }) => {
      await load(page, 'contract.pdf', await makePdf(THREE_PAGES));
      const panel = page.getByRole('tabpanel', { name: 'Watermark' });
      await expect.poll(async () => (await canvasInk(overlay(page))).count).toBeGreaterThan(0);

      await textField(page).fill('DRAFT');
      await chooseOption(page, 'Font Family', 'Courier');
      await page.getByRole('button', { name: 'Blue', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Blue', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Red', exact: true })).toHaveAttribute('aria-pressed', 'false');

      // Angle from -45 to 0, opacity to its maximum.
      await press(slider(page, 1), 'PageUp', 4);
      await press(slider(page, 1), 'ArrowRight', 5);
      await expect(panel).toContainText(/Angle \(Degrees\)\s*0°/);
      await press(slider(page, 2), 'End');
      await expect(panel).toContainText(/Opacity \(Transparency\)\s*100%/);

      await chooseOption(page, 'Placement', 'Bottom-Right');
      await chooseOption(page, 'Page Range', 'Last Page');

      // The preview follows: the word now lies level in the lower right corner of page 1.
      await expect
        .poll(async () => {
          const ink = await canvasInk(overlay(page));
          return ink.left > 200 && ink.top > 200 && ink.bottom - ink.top < 60;
        })
        .toBe(true);

      const marked = await downloadFrom(page, stamp(page));
      await expect(page.getByRole('status')).toHaveText('Watermark added to page 3.');

      const doc = await openPdfBytes(marked.bytes);
      expect(drawnOn(doc.getPage(0)).texts).toEqual([]);
      expect(drawnOn(doc.getPage(1)).texts).toEqual([]);

      const last = doc.getPage(2);
      const { texts } = drawnOn(last);
      expect(texts.map((text) => text.text)).toEqual(['DRAFT']);

      const [text] = texts;
      expect(baseFont(last, text.fontName)).toBe('/Courier');
      expect(text.fontSize).toBe(48);
      expect(text.fill).toEqual([0, 0, 1]);
      expect(fillOpacity(last, text.graphicsState)).toBeCloseTo(1, 5);

      // Level, and in the lower right corner: Courier is 0.6 em wide per letter.
      const [a, b, c, d, x, y] = text.matrix;
      expect([a, b, c, d].map((value) => Math.round(value * 1000) / 1000)).toEqual([1, 0, 0, 1]);
      const rightGap = 500 - (x + 5 * 0.6 * 48);
      expect(rightGap).toBeGreaterThan(0);
      expect(rightGap).toBeLessThanOrEqual(40);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThanOrEqual(40);

      // A custom range marks exactly the pages it names.
      await chooseOption(page, 'Page Range', 'Custom Range');
      const rangeField = page.getByLabel('Custom Range (e.g. 1-3, 5)');
      await expect(rangeField).toHaveValue('1');
      await rangeField.fill('1-2');
      await chooseOption(page, 'Placement', 'Tiled Layout');

      const tiled = await downloadFrom(page, stamp(page));
      await expect(page.getByRole('status')).toHaveText('Watermark added to pages 1-2.');

      const tiledDoc = await openPdfBytes(tiled.bytes);
      expect(drawnOn(tiledDoc.getPage(2)).texts).toEqual([]);
      for (const index of [0, 1]) {
        const tiledPage = tiledDoc.getPage(index);
        const copies = drawnOn(tiledPage).texts;
        expect(copies.length).toBeGreaterThanOrEqual(4);
        expect(new Set(copies.map((copy) => copy.text))).toEqual(new Set(['DRAFT']));
        // Every copy starts on the page, and no two start at the same place.
        const starts = copies.map((copy) => `${copy.matrix[4].toFixed(1)},${copy.matrix[5].toFixed(1)}`);
        expect(new Set(starts).size).toBe(copies.length);
        for (const copy of copies) {
          expect(copy.matrix[4]).toBeGreaterThanOrEqual(0);
          expect(copy.matrix[4]).toBeLessThan(tiledPage.getWidth());
          expect(copy.matrix[5]).toBeGreaterThanOrEqual(0);
          expect(copy.matrix[5]).toBeLessThan(tiledPage.getHeight());
        }
      }
    });

    test('a range without pages and blank text do not download an unmarked copy', async ({ page }) => {
      const downloads = watchDownloads(page);
      await load(page, 'contract.pdf', await makePdf(THREE_PAGES));

      await chooseOption(page, 'Page Range', 'Custom Range');
      await page.getByLabel('Custom Range (e.g. 1-3, 5)').fill('9');
      await stamp(page).click();
      await expect(alertWith(page, 'Error')).toHaveText(
        'Error: No pages match "9". This PDF has pages 1 to 3.'
      );
      await expect(page.getByRole('status')).toHaveCount(0);

      await page.getByLabel('Custom Range (e.g. 1-3, 5)').fill('');
      await stamp(page).click();
      await expect(alertWith(page, 'Error')).toHaveText(
        'Error: No pages were selected. This PDF has pages 1 to 3.'
      );

      // Nothing to stamp: the button is off, and the preview is empty.
      await chooseOption(page, 'Page Range', 'All Pages');
      await textField(page).fill('   ');
      await expect(stamp(page)).toBeDisabled();
      await textField(page).fill('');
      await expect(stamp(page)).toBeDisabled();
      await expect.poll(async () => (await canvasInk(overlay(page))).count).toBe(0);

      expect(downloads).toEqual([]);

      // Clear empties the tool.
      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(page.getByRole('tabpanel', { name: 'Watermark' })).not.toContainText('Watermark Settings');
      await expect(dropzone(page)).not.toContainText('contract.pdf');
    });

    test('text the PDF fonts cannot draw is stamped as a picture', async ({ page }) => {
      await load(page, 'sözleşme.pdf', await makePdf([[400, 400]]));

      // Turkish capitals: outside the character set of the built-in PDF fonts.
      await textField(page).fill('GİZLİ ŞĞ');
      await expect.poll(async () => (await canvasInk(overlay(page))).count).toBeGreaterThan(0);
      const preview = await canvasInk(overlay(page));
      expect(preview.leftHalfRow).toBeGreaterThan(preview.rightHalfRow + 50);

      const marked = await downloadFrom(page, stamp(page));
      expect(marked.name).toBe('watermarked-sözleşme.pdf');
      await expect(page.getByRole('status')).toHaveText('Watermark added to page 1.');

      const doc = await openPdfBytes(marked.bytes);
      const markedPage = doc.getPage(0);
      const { texts, images } = drawnOn(markedPage);
      expect(texts).toEqual([]);
      expect(images).toHaveLength(1);

      // The picture is the text in its colour, at the chosen opacity and angle, about the middle of the page.
      const picture = imagesOf(markedPage).get(images[0].name)!;
      const layer = readLayer(picture);
      const ink = layer.ink();
      expect(ink.count).toBeGreaterThan(500);
      expect(layer.solidColours()).toEqual(new Set(['255,0,0']));
      expect(fillOpacity(markedPage, images[0].graphicsState)).toBeCloseTo(0.3, 5);

      const [a, b] = images[0].matrix;
      expect(Math.atan2(b, a)).toBeCloseTo(Math.PI / 4, 3);
      const [middleX, middleY] = applyMatrix(images[0].matrix, 0.5, 0.5);
      expect(Math.hypot(middleX - 200, middleY - 200)).toBeLessThan(15);

      // Level, the picture can be compared with the preview directly: the
      // letters the preview draws lie inside the box the file gives the picture.
      await press(slider(page, 1), 'PageUp', 4);
      await press(slider(page, 1), 'ArrowRight', 5);
      await expect(page.getByRole('tabpanel', { name: 'Watermark' })).toContainText(
        /Angle \(Degrees\)\s*0°/
      );
      await expect
        .poll(async () => {
          const level = await canvasInk(overlay(page));
          return level.bottom - level.top;
        })
        .toBeLessThan(80);
      const level = await canvasInk(overlay(page));

      const flat = await downloadFrom(page, stamp(page));
      const flatPage = (await openPdfBytes(flat.bytes)).getPage(0);
      const [width, skewB, skewC, height, x, y] = drawnOn(flatPage).images[0].matrix;
      expect([skewB, skewC]).toEqual([0, 0]);

      const box = { left: x, right: x + width, top: 400 - (y + height), bottom: 400 - y };
      expect(level.left).toBeGreaterThanOrEqual(box.left - 2);
      expect(level.right).toBeLessThanOrEqual(box.right + 2);
      expect(level.top).toBeGreaterThanOrEqual(box.top - 2);
      expect(level.bottom).toBeLessThanOrEqual(box.bottom + 2);
      expect(level.right - level.left).toBeGreaterThan(0.9 * width);
      expect(level.bottom - level.top).toBeGreaterThan(0.6 * height);
    });

    test('stamps an image where the preview shows it', async ({ page }) => {
      const downloads = watchDownloads(page);
      const logo = makePng(40, 20, () => [0, 0, 255, 255]);

      await load(page, 'contract.pdf', await makePdf(THREE_PAGES));
      const panel = page.getByRole('tabpanel', { name: 'Watermark' });
      await expect.poll(async () => (await canvasInk(overlay(page))).count).toBeGreaterThan(0);

      await page.getByRole('button', { name: 'Image', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Image', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(panel).toContainText('No file chosen');
      await expect(stamp(page)).toBeDisabled();
      // With no image there is nothing in the preview.
      await expect.poll(async () => (await canvasInk(overlay(page))).count).toBe(0);

      const imageButton = page.getByRole('button', { name: 'Choose File, watermark image (PNG/JPG)' });

      // Not an image: refused next to the control.
      await chooseFiles(page, imageButton, {
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('hello'),
      });
      await expect(alertWith(page, 'notes.txt')).toHaveText(
        '"notes.txt" is not a supported file type. Accepted: image/png, image/jpeg.'
      );
      await expect(stamp(page)).toBeDisabled();

      await chooseFiles(page, imageButton, { name: 'logo.png', mimeType: 'image/png', buffer: logo });
      await expect(panel).toContainText('logo.png');
      await expect(alertWith(page, 'notes.txt')).toHaveCount(0);
      await expect(panel).toContainText(/Scale\s*50%/);

      // 40 x 20 pixels at 50% is 20 x 10 points, in the middle of the 400 x 400 preview.
      await expect.poll(async () => (await canvasInk(overlay(page))).count).toBeGreaterThan(0);
      const centred = await canvasInk(overlay(page));
      expect([centred.left, centred.top, centred.right, centred.bottom]).toEqual([190, 195, 209, 204]);

      const marked = await downloadFrom(page, stamp(page));
      expect(marked.name).toBe('watermarked-contract.pdf');
      await expect(page.getByRole('status')).toHaveText('Watermark added to pages 1-3.');

      const doc = await openPdfBytes(marked.bytes);
      for (const markedPage of doc.getPages()) {
        const { width, height } = markedPage.getSize();
        const { images, texts } = drawnOn(markedPage);
        expect(texts).toEqual([]);
        expect(images.map((image) => image.matrix)).toEqual([
          [20, 0, 0, 10, width / 2 - 10, height / 2 - 5],
        ]);
        const picture = imagesOf(markedPage).get(images[0].name)!;
        expect([picture.width, picture.height]).toEqual([40, 20]);
        expect(fillOpacity(markedPage, images[0].graphicsState)).toBeCloseTo(0.3, 5);
      }

      // Larger and in the upper left corner. In image mode the sliders are Scale and Opacity.
      await press(slider(page, 0), 'End');
      await expect(panel).toContainText(/Scale\s*150%/);
      await chooseOption(page, 'Placement', 'Top-Left');
      await chooseOption(page, 'Page Range', 'First Page');

      await expect.poll(async () => (await canvasInk(overlay(page))).left).toBeLessThan(100);
      const corner = await canvasInk(overlay(page));
      // 60 x 30 points, the same distance from the left and from the top edge.
      expect([corner.right - corner.left + 1, corner.bottom - corner.top + 1]).toEqual([60, 30]);
      expect(corner.left).toBe(corner.top);
      expect(corner.left).toBeGreaterThan(0);
      expect(corner.left).toBeLessThanOrEqual(40);

      const moved = await downloadFrom(page, stamp(page));
      await expect(page.getByRole('status')).toHaveText('Watermark added to page 1.');
      const movedDoc = await openPdfBytes(moved.bytes);
      expect(drawnOn(movedDoc.getPage(1)).images).toEqual([]);
      expect(drawnOn(movedDoc.getPage(2)).images).toEqual([]);
      // The file has the picture where the preview has it: same corner, same size, measured from the top.
      expect(drawnOn(movedDoc.getPage(0)).images.map((image) => image.matrix)).toEqual([
        [60, 0, 0, 30, corner.left, 400 - corner.top - 30],
      ]);

      expect(downloads).toHaveLength(2);
    });

    test('reads the image format from the file, and reports an image it cannot read', async ({ page }) => {
      const downloads = watchDownloads(page);
      await load(page, 'contract.pdf', await makePdf([[400, 400]]));
      const panel = page.getByRole('tabpanel', { name: 'Watermark' });

      await page.getByRole('button', { name: 'Image', exact: true }).click();
      const imageButton = page.getByRole('button', { name: 'Choose File, watermark image (PNG/JPG)' });

      // A PNG that calls itself a JPEG is still stamped.
      await chooseFiles(page, imageButton, {
        name: 'stamp.jpg',
        mimeType: 'image/jpeg',
        buffer: makePng(40, 20, () => [0, 128, 0, 255]),
      });
      await expect(panel).toContainText('stamp.jpg');

      const marked = await downloadFrom(page, stamp(page));
      await expect(page.getByRole('status')).toHaveText('Watermark added to page 1.');
      const markedPage = (await openPdfBytes(marked.bytes)).getPage(0);
      const { images } = drawnOn(markedPage);
      expect(images.map((image) => image.matrix)).toEqual([[20, 0, 0, 10, 190, 195]]);
      expect(imagesOf(markedPage).get(images[0].name)!.filter).toBe('/FlateDecode');

      // An image by type whose bytes are not one: said in the settings, and again on export.
      await chooseFiles(page, imageButton, {
        name: 'broken.png',
        mimeType: 'image/png',
        buffer: Buffer.from('not an image at all'),
      });
      await expect(alertWith(page, 'Unable to load')).toHaveText('Unable to load the selected image.');

      await stamp(page).click();
      await expect(alertWith(page, 'Error')).toHaveText(
        'Error: The watermark image could not be read. Use a PNG or JPEG file.'
      );
      expect(downloads).toHaveLength(1);
    });

    test('a turned page is stamped as it is shown, not sideways', async ({ page }) => {
      // 400 x 200 points turned a quarter clockwise: shown 200 wide and 400 tall.
      const logo = makePng(40, 20, () => [0, 0, 255, 255]);
      await load(page, 'turned.pdf', await makePdf([{ size: [400, 200], rotate: 90 }]));
      const panel = page.getByRole('tabpanel', { name: 'Watermark' });

      // Text first: it climbs to the right in the preview and in the file.
      await expect.poll(async () => (await canvasInk(overlay(page))).count).toBeGreaterThan(0);
      const textPreview = await canvasInk(overlay(page));
      expect([textPreview.width, textPreview.height]).toEqual([200, 400]);
      expect(textPreview.leftHalfRow).toBeGreaterThan(textPreview.rightHalfRow + 30);

      const withText = await downloadFrom(page, stamp(page));
      const textPage = (await openPdfBytes(withText.bytes)).getPage(0);
      expect(textPage.getRotation().angle).toBe(90);
      const [text] = drawnOn(textPage).texts;
      expect(text.text).toBe('CONFIDENTIAL');
      const [startX, startY] = shownAt(textPage, ...applyMatrix(text.matrix, 0, 0));
      const [endX, endY] = shownAt(textPage, ...applyMatrix(text.matrix, 100, 0));
      // 45 degrees up to the right, as the page is shown.
      expect(Math.atan2(endY - startY, endX - startX)).toBeCloseTo(Math.PI / 4, 3);

      // An image in the upper left corner of the page as shown.
      await page.getByRole('button', { name: 'Image', exact: true }).click();
      await chooseFiles(page, page.getByRole('button', { name: 'Choose File, watermark image (PNG/JPG)' }), {
        name: 'logo.png',
        mimeType: 'image/png',
        buffer: logo,
      });
      await expect(panel).toContainText('logo.png');
      await chooseOption(page, 'Placement', 'Top-Left');

      await expect.poll(async () => (await canvasInk(overlay(page))).count).toBeGreaterThan(0);
      const corner = await canvasInk(overlay(page));
      expect([corner.right - corner.left + 1, corner.bottom - corner.top + 1]).toEqual([20, 10]);
      expect(corner.left).toBe(corner.top);
      expect(corner.left).toBeLessThanOrEqual(40);

      const withImage = await downloadFrom(page, stamp(page));
      const imagePage = (await openPdfBytes(withImage.bytes)).getPage(0);
      const [image] = drawnOn(imagePage).images;

      // The corners of the picture, as the page is shown: upright, 20 x 10, where the preview has it.
      const [left, bottom] = shownAt(imagePage, ...applyMatrix(image.matrix, 0, 0));
      const [right, sameBottom] = shownAt(imagePage, ...applyMatrix(image.matrix, 1, 0));
      const [sameLeft, top] = shownAt(imagePage, ...applyMatrix(image.matrix, 0, 1));
      expect([right - left, sameBottom - bottom]).toEqual([20, 0]);
      expect([sameLeft - left, top - bottom]).toEqual([0, 10]);
      expect([left, 400 - top]).toEqual([corner.left, corner.top]);
    });

    test('reports a file it cannot open', async ({ page }) => {
      await page.goto('/tools/pdf-watermark/');
      const panel = page.getByRole('tabpanel', { name: 'Watermark' });

      await chooseFiles(page, dropzone(page), {
        name: 'photo.png',
        mimeType: 'image/png',
        buffer: makePng(4, 4, () => [0, 0, 255, 255]),
      });
      await expect(alertWith(page, 'photo.png')).toHaveText(
        '"photo.png" is not a supported file type. Accepted: application/pdf.'
      );

      await chooseFiles(page, dropzone(page), pdfUpload('broken.pdf', NOT_A_PDF));
      await expect(alertWith(page, 'Error')).toHaveText('Error: Failed to parse PDF.');
      await expect(panel).not.toContainText('Watermark Settings');
      await expect(panel).not.toContainText('Generating live preview');

      // A protected file opens for the preview but cannot be rewritten; the message says why.
      const downloads = watchDownloads(page);
      await chooseFiles(page, dropzone(page), pdfUpload('protected.pdf', makeOwnerProtectedPdf()));
      await expect(panel).toContainText('Watermark Settings');
      await expect(alertWith(page, 'Error')).toHaveCount(0);

      await stamp(page).click();
      await expect(alertWith(page, 'Error')).toHaveText(
        'Error: This PDF is password-protected or encrypted. Remove the protection and try again.'
      );
      await expect(page.getByRole('status')).toHaveCount(0);
      expect(downloads).toEqual([]);
    });
  });

  test.describe('Edit PDF', () => {
    const dropzone = (page: Page) =>
      page.getByRole('button', { name: 'Drag & drop a PDF file here or click to browse' });
    const download = (page: Page) => page.getByRole('button', { name: 'Download Edited PDF' });
    const panelOf = (page: Page) => page.getByRole('tabpanel', { name: 'Edit Pages' });
    // The workspace is two canvases without a role or a name: the page, and the strokes over it.
    const pageCanvas = (page: Page) => panelOf(page).locator('canvas').nth(0);
    const strokeCanvas = (page: Page) => panelOf(page).locator('canvas').nth(1);
    const sourcePages = (page: Page) => panelOf(page).getByText(/^Source Page: \d+$/);

    async function load(page: Page, name: string, pdf: Buffer, pageCount: number) {
      await page.goto('/tools/pdf-editor/');
      await chooseFiles(page, dropzone(page), pdfUpload(name, pdf));
      await expect(panelOf(page)).toContainText(
        `Page Layout (${pageCount} ${pageCount === 1 ? 'Page' : 'Pages'})`
      );
    }

    /** Waits until the workspace shows a page of this size in points; it is drawn at 1.25 pixels per point. */
    async function expectWorkspace(page: Page, width: number, height: number) {
      for (const canvas of [pageCanvas(page), strokeCanvas(page)]) {
        await expect(canvas).toHaveJSProperty('width', width * 1.25);
        await expect(canvas).toHaveJSProperty('height', height * 1.25);
      }
    }

    /** The stroke canvas in the viewport: its left, top, width and height in CSS pixels. */
    async function workspaceBox(page: Page) {
      await strokeCanvas(page).scrollIntoViewIfNeeded();
      const box = await strokeCanvas(page).boundingBox();
      if (!box) throw new Error('The workspace is not shown.');
      return box;
    }

    /** Presses at one point of the workspace and releases at another; both are fractions of the page. */
    async function drawLine(page: Page, from: [number, number], to: [number, number]) {
      const box = await workspaceBox(page);
      await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height);
      await page.mouse.down();
      await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, { steps: 12 });
      await page.mouse.up();
    }

    async function tapAt(page: Page, at: [number, number]) {
      const box = await workspaceBox(page);
      await page.mouse.click(box.x + at[0] * box.width, box.y + at[1] * box.height);
    }

    /** Where a point of a page's own coordinates is shown: from the left and from the bottom of the page as a viewer turns it. */
    function shownAt(pdfPage: PDFPage, x: number, y: number): [number, number] {
      const { width, height } = pdfPage.getSize();
      const turn = ((pdfPage.getRotation().angle % 360) + 360) % 360;
      if (turn === 90) return [y, width - x];
      if (turn === 180) return [width - x, height - y];
      if (turn === 270) return [height - y, x];
      return [x, y];
    }

    test('reorders, rotates and deletes pages, and exports what the list shows', async ({ page }) => {
      const source = await makePdf([
        { size: [320, 240], label: 'A' },
        { size: [300, 300], label: 'B' },
        { size: [240, 320], label: 'C' },
        { size: [200, 260], label: 'D' },
      ]);

      await load(page, 'brochure.pdf', source, 4);
      const panel = panelOf(page);

      await expect(dropzone(page)).toContainText(`brochure.pdf (${kilobytes(source.length)})`);
      await expect(sourcePages(page)).toHaveText([
        'Source Page: 1',
        'Source Page: 2',
        'Source Page: 3',
        'Source Page: 4',
      ]);
      // Every page has a thumbnail, and the first one is open in the workspace.
      for (const number of [1, 2, 3, 4]) {
        // The thumbnail is decorative (empty alt); the button around it carries the name.
        await expect(
          page.getByRole('button', { name: `Select page ${number}` }).locator('img')
        ).toHaveAttribute('src', /^data:image\/png;base64,.{100,}/);
      }
      await expect(page.getByRole('button', { name: 'Select page 1' })).toHaveAttribute('aria-pressed', 'true');
      await expectWorkspace(page, 320, 240);
      await expect(page.getByRole('button', { name: 'Move page 1 up' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Move page 4 down' })).toBeDisabled();

      // A C B D
      await page.getByRole('button', { name: 'Move page 3 up' }).click();
      await expect(sourcePages(page)).toHaveText([
        'Source Page: 1',
        'Source Page: 3',
        'Source Page: 2',
        'Source Page: 4',
      ]);
      // C A B D
      await page.getByRole('button', { name: 'Move page 1 down' }).click();
      await expect(sourcePages(page)).toHaveText([
        'Source Page: 3',
        'Source Page: 1',
        'Source Page: 2',
        'Source Page: 4',
      ]);
      // Page A stays the open one wherever it is in the list.
      await expect(page.getByRole('button', { name: 'Select page 2' })).toHaveAttribute('aria-pressed', 'true');

      // Selecting a page opens it; turning it turns the workspace.
      await page.getByRole('button', { name: 'Select page 3' }).click();
      await expectWorkspace(page, 300, 300);
      await page.getByRole('button', { name: 'Select page 1' }).click();
      await expectWorkspace(page, 240, 320);
      await page.getByRole('button', { name: 'Rotate page 1' }).click();
      await expectWorkspace(page, 320, 240);

      // A is turned upside down without being opened.
      await page.getByRole('button', { name: 'Rotate page 2' }).click();
      await page.getByRole('button', { name: 'Rotate page 2' }).click();
      await expect(page.getByRole('button', { name: 'Select page 1' })).toHaveAttribute('aria-pressed', 'true');

      // D goes, then B.
      await page.getByRole('button', { name: 'Delete page 4' }).click();
      await expect(panel).toContainText('Page Layout (3 Pages)');
      await page.getByRole('button', { name: 'Delete page 3' }).click();
      await expect(panel).toContainText('Page Layout (2 Pages)');
      await expect(sourcePages(page)).toHaveText(['Source Page: 3', 'Source Page: 1']);
      await expect(page.getByRole('button', { name: 'Move page 2 down' })).toBeDisabled();

      const edited = await downloadFrom(page, download(page));
      expect(edited.name).toBe('edited-brochure.pdf');
      expect(await pageShapes(edited.bytes)).toEqual([
        [240, 320, 90],
        [320, 240, 180],
      ]);

      // The pages are the source pages, not pictures of them.
      const doc = await openPdfBytes(edited.bytes);
      expect(doc.getPages().map((editedPage) => drawnOn(editedPage).texts.map((text) => text.text))).toEqual([
        ['C'],
        ['A'],
      ]);
      expect(doc.getPages().map((editedPage) => imagesOf(editedPage).size)).toEqual([0, 0]);
    });

    test('deleting the open page opens another, and the last page cannot be deleted', async ({ page }) => {
      await load(
        page,
        'pair.pdf',
        await makePdf([
          [320, 240],
          [240, 320],
        ]),
        2
      );
      const panel = panelOf(page);
      await expectWorkspace(page, 320, 240);

      await page.getByRole('button', { name: 'Delete page 1' }).click();
      await expect(sourcePages(page)).toHaveText(['Source Page: 2']);
      await expect(page.getByRole('button', { name: 'Select page 1' })).toHaveAttribute('aria-pressed', 'true');
      await expectWorkspace(page, 240, 320);
      await expect(page.getByRole('button', { name: 'Delete page 1' })).toBeDisabled();

      const edited = await downloadFrom(page, download(page));
      expect(await pageShapes(edited.bytes)).toEqual([[240, 320, 0]]);

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(panel).not.toContainText('Page Layout');
      await expect(download(page)).toHaveCount(0);
      await expect(dropzone(page)).not.toContainText('pair.pdf');
      await expect(panel.locator('canvas')).toHaveCount(0);
    });

    test('the page count reads "1 Page" for a single page', async ({ page }) => {
      await page.goto('/tools/pdf-editor/');
      await chooseFiles(page, dropzone(page), pdfUpload('single.pdf', await makePdf([[320, 240]])));

      await expect(page.getByRole('button', { name: 'Select page 1' })).toBeVisible();
      await expect(panelOf(page)).toContainText('Page Layout (1 Page)');
    });

    test('strokes are exported where and as thick as they were drawn', async ({ page }) => {
      await load(
        page,
        'form.pdf',
        await makePdf([
          [320, 240],
          [320, 240],
        ]),
        2
      );
      const panel = panelOf(page);
      await expectWorkspace(page, 320, 240);

      await page.getByRole('button', { name: 'Draw / Sign' }).click();
      await expect(page.getByRole('button', { name: 'Draw / Sign' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Red brush' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Undo last stroke' })).toBeDisabled();

      // The widest brush, in blue. The size slider has no accessible name; it is the only one shown.
      await page.getByRole('button', { name: 'Blue brush' }).click();
      await panel.getByRole('slider').press('End');
      await expect(panel).toContainText(/Size:\s*15px/);

      // A level line through the middle of the page, from a quarter to three quarters of its width.
      await drawLine(page, [0.25, 0.5], [0.75, 0.5]);
      await expect(panel).toContainText('Drawings: 1 stroke(s)');

      // On screen: 15 pixels thick with round ends, on the 400 x 300 pixel workspace.
      const shown = await canvasInk(strokeCanvas(page));
      expect([shown.width, shown.height]).toEqual([400, 300]);
      expect(Math.abs(shown.left - 92.5)).toBeLessThanOrEqual(2);
      expect(Math.abs(shown.right - 307.5)).toBeLessThanOrEqual(2);
      expect(Math.abs(shown.top - 142.5)).toBeLessThanOrEqual(2);
      expect(Math.abs(shown.bottom - 157.5)).toBeLessThanOrEqual(2);

      // A second stroke, taken back again.
      await drawLine(page, [0.1, 0.1], [0.3, 0.2]);
      await expect(panel).toContainText('Drawings: 2 stroke(s)');
      await page.getByRole('button', { name: 'Undo last stroke' }).click();
      await expect(panel).toContainText('Drawings: 1 stroke(s)');
      await expect.poll(async () => (await canvasInk(strokeCanvas(page))).top).toBe(shown.top);

      // The strokes belong to their page.
      await page.getByRole('button', { name: 'Select page 2' }).click();
      await expect(panel).not.toContainText('Drawings:');
      await expect.poll(async () => (await canvasInk(strokeCanvas(page))).count).toBe(0);
      await page.getByRole('button', { name: 'Select page 1' }).click();
      await expect(panel).toContainText('Drawings: 1 stroke(s)');
      await expect.poll(async () => (await canvasInk(strokeCanvas(page))).top).toBe(shown.top);

      const edited = await downloadFrom(page, download(page));
      expect(edited.name).toBe('edited-form.pdf');

      const doc = await openPdfBytes(edited.bytes);
      expect(await pageShapes(edited.bytes)).toEqual([
        [320, 240, 0],
        [320, 240, 0],
      ]);
      expect(imagesOf(doc.getPage(1)).size).toBe(0);

      // One transparent layer over the whole of page 1.
      const first = doc.getPage(0);
      const { images } = drawnOn(first);
      expect(images.map((image) => image.matrix)).toEqual([[320, 0, 0, 240, 0, 0]]);
      const layer = readLayer(imagesOf(first).get(images[0].name)!);
      const scale = layer.width / 320;
      expect(layer.height / 240).toBe(scale);

      // The line is blue and lies where it was drawn: 12 points thick (15 pixels at 1.25 pixels per point).
      expect(layer.solidColours()).toEqual(new Set(['0,0,255']));
      const ink = layer.ink();
      const tolerance = 2 * scale;
      expect(Math.abs(ink.left / scale - (80 - 6))).toBeLessThanOrEqual(tolerance / scale + 1);
      expect(Math.abs(ink.right / scale - (240 + 6))).toBeLessThanOrEqual(tolerance / scale + 1);
      expect(Math.abs(ink.top / scale - (120 - 6))).toBeLessThanOrEqual(tolerance / scale + 1);
      expect(Math.abs(ink.bottom / scale - (120 + 6))).toBeLessThanOrEqual(tolerance / scale + 1);

      // And it is what the screen showed, point for point.
      expect(Math.abs(ink.left / scale - shown.left / 1.25)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(ink.right / scale - shown.right / 1.25)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(ink.top / scale - shown.top / 1.25)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(ink.bottom / scale - shown.bottom / 1.25)).toBeLessThanOrEqual(1.5);
    });

    test('a tap leaves a dot, and marks on turned pages land where they were made', async ({ page }) => {
      // Page 2 is turned in the file, page 3 gets turned in the editor: both are shown 240 wide and 320 tall.
      await load(
        page,
        'turned.pdf',
        await makePdf([[320, 240], { size: [320, 240], rotate: 90 }, [320, 240]]),
        3
      );
      const panel = panelOf(page);

      await page.getByRole('button', { name: 'Draw / Sign' }).click();
      await panel.getByRole('slider').press('End');
      await expect(panel).toContainText(/Size:\s*15px/);

      await page.getByRole('button', { name: 'Select page 2' }).click();
      await expectWorkspace(page, 240, 320);
      await tapAt(page, [0.25, 0.1]);
      await expect(panel).toContainText('Drawings: 1 stroke(s)');

      // The dot is on screen at once: 15 pixels across, a quarter in from the left and a tenth down.
      const dot = await canvasInk(strokeCanvas(page));
      expect(Math.abs((dot.left + dot.right) / 2 - 75)).toBeLessThanOrEqual(1.5);
      expect(Math.abs((dot.top + dot.bottom) / 2 - 40)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(dot.right - dot.left + 1 - 15)).toBeLessThanOrEqual(2);

      await page.getByRole('button', { name: 'Select page 3' }).click();
      await expectWorkspace(page, 320, 240);
      await page.getByRole('button', { name: 'Rotate page 3' }).click();
      await expectWorkspace(page, 240, 320);
      await tapAt(page, [0.25, 0.1]);
      await expect(panel).toContainText('Drawings: 1 stroke(s)');

      const edited = await downloadFrom(page, download(page));
      const doc = await openPdfBytes(edited.bytes);
      expect(await pageShapes(edited.bytes)).toEqual([
        [320, 240, 0],
        [320, 240, 90],
        [320, 240, 90],
      ]);
      expect(imagesOf(doc.getPage(0)).size).toBe(0);

      for (const index of [1, 2]) {
        const turned = doc.getPage(index);
        const { images } = drawnOn(turned);
        expect(images).toHaveLength(1);

        const layer = readLayer(imagesOf(turned).get(images[0].name)!);
        // The layer has the shape of the page as it is shown.
        expect(layer.width / layer.height).toBeCloseTo(240 / 320, 2);

        // A dot of 12 points, a quarter in from the left and a tenth down from the top of the shown page.
        const ink = layer.ink();
        const pixelsPerPoint = layer.width / 240;
        expect(Math.abs((ink.right - ink.left + 1) / pixelsPerPoint - 12)).toBeLessThanOrEqual(1.5);

        const [x, y] = applyMatrix(images[0].matrix, ink.cx / layer.width, 1 - ink.cy / layer.height);
        const [fromLeft, fromBottom] = shownAt(turned, x, y);
        expect(Math.abs(fromLeft - 0.25 * 240)).toBeLessThanOrEqual(2);
        expect(Math.abs(320 - fromBottom - 0.1 * 320)).toBeLessThanOrEqual(2);
      }
    });

    test('text is added, edited, moved, exported as shown, and removed', async ({ page }) => {
      await load(page, 'letter.pdf', await makePdf([[320, 240]]), 1);
      const panel = panelOf(page);
      await expectWorkspace(page, 320, 240);

      await page.getByRole('button', { name: 'Add Text', exact: true }).click();
      const newText = page.getByLabel('Text to add');
      await expect(newText).toHaveValue('Double click to edit');

      // Nothing to add without text.
      await newText.fill('  ');
      await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();

      // Red, at the largest size. The size slider has no accessible name; it is the only one shown.
      await newText.fill('Approved');
      await page.getByRole('button', { name: 'Red text' }).click();
      await panel.getByRole('slider').press('End');
      await expect(panel).toContainText('36px');
      await page.getByRole('button', { name: 'Add', exact: true }).click();

      // The text is on the page and the tool is back on selecting.
      const note = panel.getByText('Approved', { exact: true });
      await expect(note).toBeVisible();
      await expect(note).toHaveCSS('font-size', '36px');
      await expect(note).toHaveCSS('color', 'rgb(255, 0, 0)');
      await expect(page.getByRole('button', { name: 'Pan & Select' })).toHaveAttribute('aria-pressed', 'true');

      // Double-click to edit, Enter to finish.
      await note.dblclick();
      const editor = page.getByLabel('Annotation text');
      await expect(editor).toHaveValue('Approved');
      await expect(editor).toBeFocused();
      await editor.fill('Paid in full');
      await editor.press('Enter');
      await expect(editor).toHaveCount(0);
      const edited = panel.getByText('Paid in full', { exact: true });
      await expect(edited).toBeVisible();

      // Drag it 50 pixels right and 30 down.
      await edited.scrollIntoViewIfNeeded();
      const before = (await edited.boundingBox())!;
      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
      await page.mouse.down();
      await page.mouse.move(before.x + before.width / 2 + 50, before.y + before.height / 2 + 30, { steps: 8 });
      await page.mouse.up();
      // The box eases into its new place, so wait for it to arrive.
      await expect
        .poll(async () => {
          const box = (await edited.boundingBox())!;
          return Math.hypot(box.x - before.x - 50, box.y - before.y - 30);
        })
        .toBeLessThanOrEqual(1.5);
      const after = (await edited.boundingBox())!;
      // Measured now, before anything scrolls the page.
      const workspace = (await pageCanvas(page).boundingBox())!;

      const exported = await downloadFrom(page, download(page));
      expect(exported.name).toBe('edited-letter.pdf');

      const first = (await openPdfBytes(exported.bytes)).getPage(0);
      const { images } = drawnOn(first);
      expect(images.map((image) => image.matrix)).toEqual([[320, 0, 0, 240, 0, 0]]);
      const layer = readLayer(imagesOf(first).get(images[0].name)!);
      expect(layer.solidColours()).toEqual(new Set(['255,0,0']));

      // The letters in the file against the text on screen, both in points from the upper left
      // corner of the page: same place, same size.
      const onScreen = {
        left: (after.x - workspace.x) / 1.25,
        top: (after.y - workspace.y) / 1.25,
        right: (after.x + after.width - workspace.x) / 1.25,
        bottom: (after.y + after.height - workspace.y) / 1.25,
      };
      const pixelsPerPoint = layer.width / 320;
      const ink = layer.ink();
      const inFile = {
        left: ink.left / pixelsPerPoint,
        top: ink.top / pixelsPerPoint,
        right: (ink.right + 1) / pixelsPerPoint,
        bottom: (ink.bottom + 1) / pixelsPerPoint,
      };
      expect(inFile.left).toBeGreaterThanOrEqual(onScreen.left - 2);
      expect(inFile.right).toBeLessThanOrEqual(onScreen.right + 2);
      expect(inFile.top).toBeGreaterThanOrEqual(onScreen.top - 2);
      expect(inFile.bottom).toBeLessThanOrEqual(onScreen.bottom + 2);
      const widthOnScreen = onScreen.right - onScreen.left;
      expect(Math.abs(inFile.right - inFile.left - widthOnScreen)).toBeLessThanOrEqual(0.06 * widthOnScreen);

      // The remove button shows when the pointer is over the text.
      const remove = page.getByRole('button', { name: 'Remove text' });
      await edited.hover();
      await expect(remove).toHaveCSS('opacity', '1');
      await remove.click();
      await expect(edited).toHaveCount(0);

      // Without annotations the page is exported without a layer.
      const plain = await downloadFrom(page, download(page));
      expect(imagesOf((await openPdfBytes(plain.bytes)).getPage(0)).size).toBe(0);
    });

    test('reports files it cannot open or cannot rewrite', async ({ page }) => {
      const downloads = watchDownloads(page);
      await page.goto('/tools/pdf-editor/');
      const panel = panelOf(page);

      await chooseFiles(page, dropzone(page), {
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('hello'),
      });
      await expect(alertWith(page, 'notes.txt')).toHaveText(
        '"notes.txt" is not a supported file type. Accepted: application/pdf.'
      );
      await expect(panel).not.toContainText('Page Layout');

      await chooseFiles(page, dropzone(page), pdfUpload('broken.pdf', NOT_A_PDF));
      await expect(alertWith(page, 'Error')).toHaveText('Error: Failed to load PDF file.');
      await expect(panel).not.toContainText('Page Layout');
      await expect(panel).not.toContainText('Parsing PDF and rendering pages');
      await expect(download(page)).toHaveCount(0);

      // A protected file opens for viewing, so its page is listed, but it cannot be rewritten.
      await chooseFiles(page, dropzone(page), pdfUpload('protected.pdf', makeOwnerProtectedPdf()));
      await expect(panel).toContainText('Page Layout (1 Page)');
      await expect(alertWith(page, 'Error')).toHaveCount(0);
      await expectWorkspace(page, 200, 200);

      await download(page).click();
      await expect(alertWith(page, 'Error')).toHaveText(
        'Error: This PDF is password-protected or encrypted. Remove the protection and try again.'
      );
      await expect(download(page)).toBeEnabled();
      expect(downloads).toEqual([]);

      // A good file afterwards replaces the page list and the error.
      await chooseFiles(page, dropzone(page), pdfUpload('good.pdf', await makePdf([[320, 240], [240, 320]])));
      await expect(panel).toContainText('Page Layout (2 Pages)');
      await expect(alertWith(page, 'Error')).toHaveCount(0);
      const edited = await downloadFrom(page, download(page));
      expect(edited.name).toBe('edited-good.pdf');
      expect(await pageShapes(edited.bytes)).toEqual([
        [320, 240, 0],
        [240, 320, 0],
      ]);
    });
  });
});
