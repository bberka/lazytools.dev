'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown, Upload, Download, CheckCircle2 } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { cn } from '@/lib/utils';
import { isPdfFile, openPdf, pdfBlob } from '@/lib/pdf';

interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  reductionPercentage: number;
  downloadUrl: string;
  fileName: string;
}

export function PdfCompress() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [error, setError] = useState('');

  // Settings
  const [compressionLevel, setCompressionLevel] = useState<'high' | 'medium' | 'low'>('medium');
  const [compressionMode, setCompressionMode] = useState<'image' | 'structure'>('image');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!isPdfFile(file)) return;
    setPdfFile(file);
    setResult(null);
    setProgress(null);
    setError('');
  };

  const handleClear = () => {
    setPdfFile(null);
    setResult(null);
    setProgress(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const compressPdf = async () => {
    if (!pdfFile) return;
    setCompressing(true);
    setResult(null);
    setProgress(null);
    setError('');

    try {
      let compressedBytes: Uint8Array;

      if (compressionMode === 'structure') {
        // Mode 1: Optimize structure (strips metadata and compresses streams)
        setProgress({ current: 1, total: 1 });
        const arrayBuffer = await pdfFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        
        // Strip common metadata
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setCreator('');
        pdfDoc.setProducer('');
        
        // Save with object stream compression
        compressedBytes = await pdfDoc.save({ useObjectStreams: true });
      } else {
        // Mode 2: Re-compress images (render pages to JPEG at lower quality/DPI)
        const pdf = await openPdf(pdfFile);

        try {
          const totalPages = pdf.pageCount;

          setProgress({ current: 0, total: totalPages });
          const newPdf = await PDFDocument.create();

          // Preset parameters
          let scale = 1.5;
          let quality = 0.65;
          if (compressionLevel === 'high') {
            scale = 1.0;
            quality = 0.45;
          } else if (compressionLevel === 'low') {
            scale = 2.0;
            quality = 0.85;
          }

          for (let i = 1; i <= totalPages; i++) {
            setProgress({ current: i, total: totalPages });
            const page = await pdf.page(i);

            // Render to canvas at target compression scale (DPI adjustments)
            const rendered = await page.render({ scale });

            if (rendered) {
              // Compress page rendering as JPEG
              const jpegDataUrl = rendered.canvas.toDataURL('image/jpeg', quality);
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
          }

          compressedBytes = await newPdf.save();
        } finally {
          await pdf.destroy();
        }
      }

      const blob = pdfBlob(compressedBytes);
      const reduction = ((pdfFile.size - blob.size) / pdfFile.size) * 100;
      
      setResult({
        originalSize: pdfFile.size,
        compressedSize: blob.size,
        reductionPercentage: Math.max(0, parseFloat(reduction.toFixed(1))),
        downloadUrl: URL.createObjectURL(blob),
        fileName: `compressed-${pdfFile.name}`,
      });
    } catch (compressionError) {
      console.error('Error compressing PDF:', compressionError);
      setError(
        'Failed to compress PDF: ' +
          (compressionError instanceof Error ? compressionError.message : String(compressionError))
      );
    } finally {
      setCompressing(false);
      setProgress(null);
    }
  };

  const formatSize = (bytes: number) => {
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    return (kb / 1024).toFixed(1) + ' MB';
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
          <div
            className="border-2 border-dashed border-border rounded-xl p-4 sm:p-8 text-center hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-semibold">Click to upload a PDF file</p>
            <p className="text-xs text-muted-foreground mt-1">Processed entirely in your browser</p>
            {pdfFile && (
              <div className="mt-3 inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium border border-primary/20">
                {pdfFile.name} ({formatSize(pdfFile.size)})
              </div>
            )}
          </div>
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
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Compression Mode
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCompressionMode('image')}
                  className={cn(
                    "p-4 rounded-xl border text-left transition-all hover:bg-muted/30 flex flex-col gap-1",
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
                  onClick={() => setCompressionMode('structure')}
                  className={cn(
                    "p-4 rounded-xl border text-left transition-all hover:bg-muted/30 flex flex-col gap-1",
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
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Compression Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'low', name: 'Low', desc: 'Clear (220 DPI)' },
                      { id: 'medium', name: 'Medium', desc: 'Balanced (150 DPI)' },
                      { id: 'high', name: 'High', desc: 'Smallest (72 DPI)' },
                    ] as const
                  ).map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setCompressionLevel(lvl.id)}
                      className={cn(
                        "p-3 rounded-lg border text-center transition-all hover:bg-muted/20 flex flex-col items-center gap-0.5",
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

            <div className="flex gap-3 pt-2">
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
        <Card className="border-border/60 shadow-md p-4 sm:p-8 flex flex-col items-center justify-center space-y-4">
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
        <Card className="border-border/60 shadow-lg bg-emerald-500/5 border-emerald-500/20">
          <CardHeader>
            <CardTitle className="text-emerald-600 dark:text-emerald-400 flex items-center gap-2 text-base font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              Compression Successful!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border bg-card/50 flex flex-col">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  Original Size
                </span>
                <span className="text-lg font-bold mt-1">{formatSize(result.originalSize)}</span>
              </div>
              <div className="p-4 rounded-xl border bg-card/50 flex flex-col">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  Compressed Size
                </span>
                <span className="text-lg font-bold mt-1 text-primary">
                  {formatSize(result.compressedSize)}
                </span>
              </div>
              <div className="p-4 rounded-xl border bg-primary/10 border-primary/20 flex flex-col justify-center">
                <span className="text-[10px] text-primary/80 font-semibold uppercase tracking-wider">
                  Space Saved
                </span>
                <span className="text-2xl font-black mt-1 text-primary">
                  -{result.reductionPercentage}%
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button asChild className="flex-1 bg-primary hover:bg-primary/90">
                <a href={result.downloadUrl} download={result.fileName}>
                  Download PDF
                  <Download className="h-4 w-4 ml-2" />
                </a>
              </Button>
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
