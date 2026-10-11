'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown, Download, CheckCircle2, Info } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { cn } from '@/lib/utils';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, formatBytes, outputFileName, type FormatBytesOptions } from '@/lib/files';
import { PDF_MIME_TYPE, openPdf, pdfBlob } from '@/lib/pdf';
import {
  COMPRESSION_PRESETS,
  fitRenderScale,
  optimizePdfStructure,
  renderDpi,
  summarizeCompression,
  type CompressionLevel,
  type CompressionSummary,
} from '@/lib/tools/pdf-compress';
import { PdfToolError, describePdfFailure } from '@/lib/tools/pdf-page-ops';

interface CompressionResult extends CompressionSummary {
  // The compressed document. It is kept as a Blob, so there is no object URL to revoke.
  blob: Blob;
  fileName: string;
}

// Sizes on this page read "0.5 KB", "845.3 KB", "2.4 MB".
const SIZE_FORMAT: FormatBytesOptions = { fixed: true, decimals: 1, minUnit: 'KB', maxUnit: 'MB' };

// The resolution is worked out from the scale each level renders at, so the label cannot drift from it.
const COMPRESSION_LEVELS: ReadonlyArray<{ id: CompressionLevel; name: string; desc: string }> = [
  { id: 'low', name: 'Low', desc: `Clear (${renderDpi(COMPRESSION_PRESETS.low.scale)} DPI)` },
  {
    id: 'medium',
    name: 'Medium',
    desc: `Balanced (${renderDpi(COMPRESSION_PRESETS.medium.scale)} DPI)`,
  },
  { id: 'high', name: 'High', desc: `Smallest (${renderDpi(COMPRESSION_PRESETS.high.scale)} DPI)` },
];

export function PdfCompress() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [error, setError] = useState('');

  // Settings
  const [compressionLevel, setCompressionLevel] = useState<CompressionLevel>('medium');
  const [compressionMode, setCompressionMode] = useState<'image' | 'structure'>('image');

  const modeLabelId = useId();
  const levelLabelId = useId();
  // Names the latest run; one that was overtaken by another file, a clear or
  // an unmount stops and must not report back.
  const runIdRef = useRef(0);

  useEffect(
    () => () => {
      runIdRef.current += 1;
    },
    []
  );

  // The intake only passes PDFs on; anything else is reported in the drop area.
  const intake = useFileIntake({
    accept: PDF_MIME_TYPE,
    onFiles: ([file]) => {
      runIdRef.current += 1;
      setPdfFile(file);
      setCompressing(false);
      setResult(null);
      setProgress(null);
      setError('');
    },
  });

  const handleClear = () => {
    runIdRef.current += 1;
    setPdfFile(null);
    setCompressing(false);
    setResult(null);
    setProgress(null);
    setError('');
    intake.reset();
  };

  const compressPdf = async () => {
    if (!pdfFile) return;
    const runId = ++runIdRef.current;
    const overtaken = () => runId !== runIdRef.current;

    setCompressing(true);
    setResult(null);
    setProgress(null);
    setError('');

    try {
      let compressedBytes: Uint8Array;

      if (compressionMode === 'structure') {
        // Mode 1: Optimize structure (strips metadata and compresses streams)
        setProgress({ current: 1, total: 1 });
        compressedBytes = await optimizePdfStructure(pdfFile);
      } else {
        // Mode 2: Re-compress images (render pages to JPEG at lower quality/DPI)
        const pdf = await openPdf(pdfFile);
        // One canvas for every page; a canvas per page can exhaust canvas memory on long documents.
        const canvas = document.createElement('canvas');

        try {
          const totalPages = pdf.pageCount;

          setProgress({ current: 0, total: totalPages });
          const newPdf = await PDFDocument.create();
          const { scale, quality } = COMPRESSION_PRESETS[compressionLevel];

          for (let i = 1; i <= totalPages; i++) {
            if (overtaken()) return;
            setProgress({ current: i, total: totalPages });
            const page = await pdf.page(i);

            // Render to canvas at target compression scale (DPI adjustments)
            const rendered = await page.render({
              canvas,
              scale: fitRenderScale(page.width, page.height, scale),
            });

            // Compress page rendering as JPEG
            const jpegDataUrl = rendered ? rendered.canvas.toDataURL('image/jpeg', quality) : '';

            // A canvas the browser could not set up or encode yields no JPEG.
            // Leaving the page out would hand back a shorter document as a success.
            if (!jpegDataUrl.startsWith('data:image/jpeg')) {
              throw new PdfToolError(
                `Page ${i} could not be rendered, so the PDF was not compressed. Try Optimize Structure instead.`
              );
            }

            const image = await newPdf.embedJpg(jpegDataUrl);

            // Add a page matching original dimensions (in points) to keep layout physical size
            const newPage = newPdf.addPage([page.width, page.height]);
            newPage.drawImage(image, {
              x: 0,
              y: 0,
              width: page.width,
              height: page.height,
            });
          }

          compressedBytes = await newPdf.save();
        } finally {
          // Give the pixels back right away instead of waiting for garbage collection.
          canvas.width = 0;
          canvas.height = 0;
          await pdf.destroy();
        }
      }

      if (overtaken()) return;

      const blob = pdfBlob(compressedBytes);
      setResult({
        ...summarizeCompression(pdfFile.size, blob.size),
        blob,
        fileName: outputFileName(pdfFile.name, { prefix: 'compressed-', extension: 'pdf' }),
      });
    } catch (compressionError) {
      // Whatever went wrong in a run that was overtaken concerns a file that is no longer shown.
      if (overtaken()) return;
      console.error('Error compressing PDF:', compressionError);
      setError(describePdfFailure(compressionError, 'Failed to compress PDF'));
    } finally {
      if (!overtaken()) {
        setCompressing(false);
        setProgress(null);
      }
    }
  };

  const handleDownload = () => {
    if (!result) return;
    downloadBlob(result.blob, result.fileName);
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-lg backdrop-blur-md bg-card/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-bold">
            <FileDown className="h-5 w-5 text-primary" />
            Compress PDF
          </CardTitle>
          <CardDescription>
            Reduce PDF file sizes by compressing images or stripping structural metadata.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileDropzone
            intake={intake}
            label="Click to upload a PDF file"
            hint="Processed entirely in your browser"
            selected={pdfFile && `${pdfFile.name} (${formatBytes(pdfFile.size, SIZE_FORMAT)})`}
          />
        </CardContent>
      </Card>

      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {pdfFile && !result && !compressing && (
        <Card className="border-border/60 shadow-md">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Compression Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            <div className="space-y-3" role="group" aria-labelledby={modeLabelId}>
              <p
                id={modeLabelId}
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Compression Mode
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={compressionMode === 'image'}
                  onClick={() => setCompressionMode('image')}
                  className={cn(
                    "p-4 rounded-xl border text-left transition-all hover:bg-muted/30 flex flex-col gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    compressionMode === 'image'
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/80 bg-card"
                  )}
                >
                  <span className="font-semibold text-sm">Compress Images (Recommended)</span>
                  <span className="text-xs text-muted-foreground">
                    Re-compress images and layouts. High size reduction, best for scans and slide decks.
                  </span>
                </button>

                <button
                  type="button"
                  aria-pressed={compressionMode === 'structure'}
                  onClick={() => setCompressionMode('structure')}
                  className={cn(
                    "p-4 rounded-xl border text-left transition-all hover:bg-muted/30 flex flex-col gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    compressionMode === 'structure'
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/80 bg-card"
                  )}
                >
                  <span className="font-semibold text-sm">Optimize Structure</span>
                  <span className="text-xs text-muted-foreground">
                    Strip metadata and optimize internal data objects. Keeps text fully selectable.
                  </span>
                </button>
              </div>
            </div>

            {compressionMode === 'image' && (
              <div className="space-y-3" role="group" aria-labelledby={levelLabelId}>
                <p
                  id={levelLabelId}
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Compression Level
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {COMPRESSION_LEVELS.map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      aria-pressed={compressionLevel === lvl.id}
                      onClick={() => setCompressionLevel(lvl.id)}
                      className={cn(
                        "p-3 rounded-lg border text-center transition-all hover:bg-muted/20 flex flex-col items-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        compressionLevel === lvl.id
                          ? "border-primary bg-primary/5 font-semibold"
                          : "border-border/80 bg-card text-muted-foreground"
                      )}
                    >
                      <span className="text-sm">{lvl.name}</span>
                      <span className="text-[10px] opacity-80">{lvl.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button onClick={compressPdf} className="flex-1 bg-primary hover:bg-primary/90">
                Compress PDF
              </Button>
              <Button variant="outline" onClick={handleClear}>
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {compressing && (
        <Card
          role="status"
          className="border-border/60 shadow-md p-4 sm:p-8 flex flex-col items-center justify-center space-y-4"
        >
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <div className="text-center">
            <p className="text-sm font-semibold">Compressing PDF...</p>
            {progress && (
              <p className="text-xs text-muted-foreground mt-1">
                Processing page {progress.current} of {progress.total}
              </p>
            )}
          </div>
          {progress && (
            <div className="w-full max-w-xs bg-muted rounded-full h-2 overflow-hidden border">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          )}
        </Card>
      )}

      {result && (
        <Card
          className={cn(
            "border-border/60 shadow-lg",
            result.smaller && "bg-emerald-500/5 border-emerald-500/20"
          )}
        >
          <CardHeader>
            {result.smaller ? (
              <CardTitle className="text-emerald-600 dark:text-emerald-400 flex items-center gap-2 text-base font-semibold">
                <CheckCircle2 className="h-5 w-5" />
                Compression Successful!
              </CardTitle>
            ) : (
              <>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Info className="h-5 w-5 text-muted-foreground" />
                  No Size Reduction
                </CardTitle>
                <CardDescription>
                  The result is not smaller than the original, so this PDF is probably compact
                  already. Other settings may still help.
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border bg-card/50 flex flex-col">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  Original Size
                </span>
                <span className="text-lg font-bold mt-1">{formatBytes(result.originalSize, SIZE_FORMAT)}</span>
              </div>
              <div className="p-4 rounded-xl border bg-card/50 flex flex-col">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  Compressed Size
                </span>
                <span className="text-lg font-bold mt-1 text-primary">
                  {formatBytes(result.compressedSize, SIZE_FORMAT)}
                </span>
              </div>
              <div className="p-4 rounded-xl border bg-primary/10 border-primary/20 flex flex-col justify-center">
                <span className="text-[10px] text-primary/80 font-semibold uppercase tracking-wider">
                  Space Saved
                </span>
                <span className="text-2xl font-black mt-1 text-primary">
                  {result.smaller ? `-${result.reductionPercentage}%` : '0%'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {result.smaller ? (
                <Button onClick={handleDownload} className="flex-1 bg-primary hover:bg-primary/90">
                  Download PDF
                  <Download className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => setResult(null)}
                    className="flex-1 bg-primary hover:bg-primary/90"
                  >
                    Try Other Settings
                  </Button>
                  <Button variant="outline" onClick={handleDownload}>
                    Download Anyway
                    <Download className="h-4 w-4 ml-2" />
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={handleClear}>
                Compress Another File
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
