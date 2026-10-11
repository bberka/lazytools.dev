import { test, expect } from '@playwright/test';
import { PDFDocument, PDFName } from 'pdf-lib';
import {
  COMPRESSION_PRESETS,
  fitRenderScale,
  optimizePdfStructure,
  renderDpi,
  summarizeCompression,
} from '@/lib/tools/pdf-compress';
import { PdfToolError } from '@/lib/tools/pdf-page-ops';
import { createEncryptedPdf, pageSizes } from './pdf-edit-fixtures';

test.describe('renderDpi', () => {
  test('counts 72 pixels per inch for every unit of scale', () => {
    expect(renderDpi(1)).toBe(72);
    expect(renderDpi(1.5)).toBe(108);
    expect(renderDpi(2)).toBe(144);
  });

  test('gives the resolution of each compression level', () => {
    // The level buttons used to promise 220 and 150 DPI for these scales.
    expect(renderDpi(COMPRESSION_PRESETS.low.scale)).toBe(144);
    expect(renderDpi(COMPRESSION_PRESETS.medium.scale)).toBe(108);
    expect(renderDpi(COMPRESSION_PRESETS.high.scale)).toBe(72);
  });

  test('levels get smaller and coarser from low to high', () => {
    const { low, medium, high } = COMPRESSION_PRESETS;

    expect(low.scale).toBeGreaterThan(medium.scale);
    expect(medium.scale).toBeGreaterThan(high.scale);
    expect(low.quality).toBeGreaterThan(medium.quality);
    expect(medium.quality).toBeGreaterThan(high.quality);
  });
});

test.describe('fitRenderScale', () => {
  test('keeps the preferred scale for ordinary pages', () => {
    expect(fitRenderScale(612, 792, 2)).toBe(2);
    expect(fitRenderScale(595, 842, 1.5)).toBe(1.5);
    expect(fitRenderScale(2048, 2048, 2)).toBe(2);
  });

  test('lowers the scale until a large page fits a canvas', () => {
    const scale = fitRenderScale(5000, 7000, 2);

    expect(scale).toBeLessThan(2);
    expect(5000 * scale * 7000 * scale).toBeCloseTo(4096 * 4096, 0);
  });

  test('leaves the scale alone when the page has no area', () => {
    expect(fitRenderScale(0, 0, 2)).toBe(2);
    expect(fitRenderScale(Number.NaN, 100, 2)).toBe(2);
  });
});

test.describe('optimizePdfStructure', () => {
  async function describedPdf(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    doc.addPage([500, 600]);
    doc.setTitle('Quarterly figures');
    doc.setAuthor('Jane Example');
    doc.setSubject('Internal');
    doc.setKeywords(['salaries', 'draft']);
    doc.setCreator('Writer');
    doc.setProducer('Printer');

    // An XMP packet repeats the description; most editors write one.
    const packet = '<x:xmpmeta><dc:creator>Jane Example</dc:creator></x:xmpmeta>';
    const metadata = doc.context.stream(packet, { Type: 'Metadata', Subtype: 'XML' });
    doc.catalog.set(PDFName.of('Metadata'), doc.context.register(metadata));

    return doc.save({ useObjectStreams: false });
  }

  const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

  test('empties every field of the document information', async () => {
    const optimized = await PDFDocument.load(await optimizePdfStructure(await describedPdf()), {
      updateMetadata: false,
    });

    expect(optimized.getTitle()).toBe('');
    expect(optimized.getAuthor()).toBe('');
    expect(optimized.getSubject()).toBe('');
    // Keywords used to be left in place.
    expect(optimized.getKeywords()).toBe('');
    expect(optimized.getCreator()).toBe('');
    expect(optimized.getProducer()).toBe('');
  });

  test('removes the XMP packet, which repeats the description', async () => {
    const source = await describedPdf();
    const optimized = await optimizePdfStructure(source);

    expect(text(source)).toContain('Jane Example');
    expect(text(optimized)).not.toContain('Jane Example');
    expect((await PDFDocument.load(optimized)).catalog.get(PDFName.of('Metadata'))).toBeUndefined();
  });

  test('keeps the pages', async () => {
    expect(await pageSizes(await optimizePdfStructure(await describedPdf()))).toEqual([
      [300, 400],
      [500, 600],
    ]);
  });

  test('reports a protected document in plain words', async () => {
    const failure = await optimizePdfStructure(await createEncryptedPdf()).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(PdfToolError);
    expect((failure as Error).message).toContain('password-protected or encrypted');
  });
});

test.describe('summarizeCompression', () => {
  test('reports the share that was saved with one decimal', () => {
    expect(summarizeCompression(1000, 400)).toEqual({
      originalSize: 1000,
      compressedSize: 400,
      reductionPercentage: 60,
      smaller: true,
    });
    expect(summarizeCompression(3000, 1999).reductionPercentage).toBe(33.4);
  });

  test('does not call a larger result a success', () => {
    // This used to read "Compression Successful!" with "-0%" saved.
    expect(summarizeCompression(1000, 2500)).toEqual({
      originalSize: 1000,
      compressedSize: 2500,
      reductionPercentage: 0,
      smaller: false,
    });
  });

  test('does not call an equal or barely smaller result a success', () => {
    expect(summarizeCompression(1000, 1000).smaller).toBe(false);
    expect(summarizeCompression(100_000, 99_990)).toMatchObject({
      reductionPercentage: 0,
      smaller: false,
    });
  });

  test('copes with an empty original', () => {
    expect(summarizeCompression(0, 0)).toMatchObject({ reductionPercentage: 0, smaller: false });
    expect(summarizeCompression(0, 500)).toMatchObject({ reductionPercentage: 0, smaller: false });
  });
});
