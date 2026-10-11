'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Download, Trash2, ImageIcon } from 'lucide-react';
import { useFileIntake } from '@/hooks/useFileIntake';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { downloadBlob } from '@/lib/files';
import { PDF_MIME_TYPE, openPdf, type PdfPage } from '@/lib/pdf';
import { RENDER_SCALE, describeFailedPages, pageRenderScale } from '@/lib/tools/pdf-to-image';

interface PageImage {
  /** 1-based number of the page in the PDF. */
  pageNumber: number;
  png: Blob;
}

/** Draws a page and encodes it as PNG. Null when the browser cannot do it at this scale. */
async function drawPagePng(page: PdfPage, scale: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');

  try {
    const rendered = await page.render({ scale, canvas });
    if (!rendered) return null;

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    // Hands the pixels back now instead of whenever the canvas is collected.
    // Canvases that are merely unreferenced still count against the canvas
    // memory Safari allows, which a long document would otherwise use up.
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function renderPagePng(page: PdfPage): Promise<Blob | null> {
  const safeScale = pageRenderScale(page.width, page.height);
  if (safeScale >= RENDER_SCALE) return drawPagePng(page, RENDER_SCALE);

  // A poster or plan at full scale can be more than the browser's canvas
  // holds. When it is, the page is drawn again at the largest size that fits.
  const png = await drawPagePng(page, RENDER_SCALE).catch(() => null);
  return png ?? drawPagePng(page, safeScale);
}

// The preview URL belongs to the tile: it is revoked when the page leaves the
// list or the tool unmounts.
function PagePreview({ image }: { image: PageImage }) {
  const url = useObjectUrl(image.png);

  return (
    <div className="aspect-[1/1.4] relative overflow-hidden rounded border bg-white">
      {url && <img src={url} alt={`Page ${image.pageNumber}`} className="object-contain w-full h-full" />}
    </div>
  );
}

export function PdfToImage() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [images, setImages] = useState<PageImage[]>([]);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');

  // Identifies the conversion whose result is still wanted. Choosing another
  // file, Clear and leaving the tool all move it on, so a conversion that is
  // still running stops and cannot show its pages under the wrong file.
  const runRef = useRef(0);
  useEffect(
    () => () => {
      runRef.current += 1;
    },
    []
  );

  const showFile = (file: File | null) => {
    runRef.current += 1;
    setPdfFile(file);
    setImages([]);
    setConverting(false);
    setError('');
  };

  // The intake only passes PDFs on; anything else is reported under the drop area.
  const intake = useFileIntake({
    accept: PDF_MIME_TYPE,
    onFiles: ([file]) => showFile(file),
  });

  const clear = () => {
    showFile(null);
    intake.reset();
  };

  const convertToImages = async () => {
    if (!pdfFile) return;
    const run = ++runRef.current;
    const isCurrent = () => runRef.current === run;
    setConverting(true);
    setError('');

    try {
      const pdf = await openPdf(pdfFile);

      try {
        const pages: PageImage[] = [];
        const failedPages: number[] = [];

        for (let pageNumber = 1; pageNumber <= pdf.pageCount && isCurrent(); pageNumber++) {
          const png = await renderPagePng(await pdf.page(pageNumber));
          if (png) pages.push({ pageNumber, png });
          else failedPages.push(pageNumber);
        }

        if (!isCurrent()) return;
        setImages(pages);
        setError(
          pdf.pageCount === 0 ? 'This PDF has no pages to convert.' : describeFailedPages(failedPages, pdf.pageCount)
        );
      } finally {
        await pdf.destroy();
      }
    } catch (conversionError) {
      if (!isCurrent()) return;
      console.error('Error converting PDF to images:', conversionError);
      setError(
        'Failed to convert PDF: ' +
          (conversionError instanceof Error ? conversionError.message : String(conversionError))
      );
    } finally {
      if (isCurrent()) setConverting(false);
    }
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
              intake.isDragging ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
            }`}
          >
            <input {...intake.inputProps} aria-label="Upload a PDF" />
            <Upload aria-hidden="true" className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-medium">Click to upload a PDF</p>
            {pdfFile && <p className="text-xs text-primary mt-2 break-all">{pdfFile.name}</p>}
          </div>
          {intake.error && (
            <p role="alert" className="mt-2 break-words text-sm text-destructive">
              {intake.error}
            </p>
          )}

          {pdfFile && images.length === 0 && (
            <div className="mt-4 flex gap-2">
              <Button onClick={convertToImages} disabled={converting} className="flex-1">
                {converting ? 'Converting...' : 'Convert to Images'}
              </Button>
              <Button variant="outline" onClick={clear}>
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
              {images.map((image) => (
                <div key={image.pageNumber} className="space-y-2 border rounded-md p-2 bg-muted/50">
                  <PagePreview image={image} />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => downloadBlob(image.png, `page-${image.pageNumber}.png`)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Page {image.pageNumber}
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-center">
              <Button variant="outline" onClick={clear}>
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
