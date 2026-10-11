/**
 * Compress PDF logic that does not need a canvas: the presets of the image
 * mode, the structure mode, and the verdict on a finished compression.
 */
import { PDFName, PDFRef } from 'pdf-lib';
import { loadPdf, type PdfData } from './pdf-page-ops';

// ── Image mode presets ────────────────────────────────────────────────────────

export type CompressionLevel = 'low' | 'medium' | 'high';

export interface CompressionPreset {
  /** Zoom factor the pages are drawn at: canvas pixels per PDF point. */
  scale: number;
  /** JPEG quality, 0 to 1. */
  quality: number;
}

export const COMPRESSION_PRESETS: Record<CompressionLevel, CompressionPreset> = {
  low: { scale: 2.0, quality: 0.85 },
  medium: { scale: 1.5, quality: 0.65 },
  high: { scale: 1.0, quality: 0.45 },
};

/** The resolution a zoom factor stands for: a PDF point is 1/72 inch. */
export function renderDpi(scale: number): number {
  return Math.round(scale * 72);
}

/**
 * The canvas area every current browser can allocate (4096 x 4096). Past it
 * Safari on iOS hands back a canvas that stays empty.
 */
const MAX_CANVAS_PIXELS = 4096 * 4096;

/**
 * The largest zoom factor, up to `preferred`, at which a page of
 * `width` x `height` points still fits a canvas. Ordinary pages get
 * `preferred`; posters and plans get less.
 */
export function fitRenderScale(width: number, height: number, preferred: number): number {
  const area = width * height;
  if (!(area > 0) || area * preferred * preferred <= MAX_CANVAS_PIXELS) return preferred;
  return Math.sqrt(MAX_CANVAS_PIXELS / area);
}

// ── Structure mode ────────────────────────────────────────────────────────────

/**
 * Rewrites a PDF without its description: the six fields of the document
 * information (title, author, subject, keywords, creator, producer) are
 * emptied, the XMP metadata packet, which repeats them, is removed, and the
 * objects are packed into compressed object streams. Page content is untouched.
 */
export async function optimizePdfStructure(data: PdfData): Promise<Uint8Array> {
  const pdf = await loadPdf(data);

  pdf.setTitle('');
  pdf.setAuthor('');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setCreator('');
  pdf.setProducer('');

  // The packet has to be dropped from the document too; pdf-lib writes every
  // object it holds, referenced or not.
  const metadataKey = PDFName.of('Metadata');
  const metadata = pdf.catalog.get(metadataKey);
  if (metadata instanceof PDFRef) pdf.context.delete(metadata);
  pdf.catalog.delete(metadataKey);

  return pdf.save({ useObjectStreams: true });
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface CompressionSummary {
  originalSize: number;
  compressedSize: number;
  /** Share of the original size that was saved, in percent with one decimal. 0 when nothing was. */
  reductionPercentage: number;
  /** False when the result is as large as the original or larger. */
  smaller: boolean;
}

/** Compares the result with the original. A result that is not smaller saves 0%, never less. */
export function summarizeCompression(
  originalSize: number,
  compressedSize: number
): CompressionSummary {
  const saved = originalSize > 0 ? ((originalSize - compressedSize) / originalSize) * 100 : 0;
  const reductionPercentage = Math.max(0, Math.round(saved * 10) / 10);

  return { originalSize, compressedSize, reductionPercentage, smaller: reductionPercentage > 0 };
}
