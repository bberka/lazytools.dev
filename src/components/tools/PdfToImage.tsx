'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Download, Trash2, ImageIcon } from 'lucide-react';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadDataUrl } from '@/lib/files';
import { PDF_MIME_TYPE, openPdf } from '@/lib/pdf';

export function PdfToImage() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');

  // The intake only passes PDFs on; anything else is reported under the drop area.
  const intake = useFileIntake({
    accept: PDF_MIME_TYPE,
    onFiles: ([file]) => {
      setPdfFile(file);
      setImages([]);
      setError('');
    },
  });

  const convertToImages = async () => {
    if (!pdfFile) return;
    setConverting(true);
    setError('');

    try {
      const pdf = await openPdf(pdfFile);

      try {
        const imageUrls: string[] = [];

        for (let pageNum = 1; pageNum <= pdf.pageCount; pageNum++) {
          const page = await pdf.page(pageNum);
          const rendered = await page.render({ scale: 2.0 }); // Higher scale for better quality
          if (!rendered) continue;

          imageUrls.push(rendered.canvas.toDataURL('image/png'));
        }

        setImages(imageUrls);
      } finally {
        await pdf.destroy();
      }
    } catch (conversionError) {
      console.error('Error converting PDF to images:', conversionError);
      setError(
        'Failed to convert PDF: ' +
          (conversionError instanceof Error ? conversionError.message : String(conversionError))
      );
    } finally {
      setConverting(false);
    }
  };

  const downloadImage = (url: string, index: number) => {
    downloadDataUrl(url, `page-${index + 1}.png`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            PDF to Image
          </CardTitle>
          <CardDescription>Convert PDF pages into high-quality PNG images directly in your browser</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...intake.dropzoneProps}
            className={`border-2 border-dashed rounded-lg p-4 sm:p-8 text-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              intake.isDragging
                ? 'border-primary bg-primary/5'
                : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
            }`}
          >
            <input {...intake.inputProps} aria-label="Upload a PDF" />
            <Upload aria-hidden="true" className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-medium">Click to upload a PDF</p>
            {pdfFile && <p className="text-xs text-primary mt-2">{pdfFile.name}</p>}
          </div>
          {intake.error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {intake.error}
            </p>
          )}

          {pdfFile && images.length === 0 && (
            <div className="mt-4 flex gap-2">
              <Button onClick={convertToImages} disabled={converting} className="flex-1">
                {converting ? 'Converting...' : 'Convert to Images'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPdfFile(null);
                  setError('');
                  intake.reset();
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {images.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Extracted Pages ({images.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {images.map((url, i) => (
                <div key={i} className="space-y-2 border rounded-md p-2 bg-slate-50 dark:bg-slate-900">
                  <div className="aspect-[1/1.4] relative overflow-hidden rounded border bg-white">
                    <img src={url} alt={`Page ${i + 1}`} className="object-contain w-full h-full" />
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => downloadImage(url, i)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Page {i + 1}
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  setPdfFile(null);
                  setImages([]);
                  intake.reset();
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
