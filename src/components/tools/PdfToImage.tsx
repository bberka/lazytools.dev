'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Upload, Download, Trash2, ImageIcon } from 'lucide-react';

export function PdfToImage() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [converting, setConverting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;
    setPdfFile(file);
    setImages([]);
  };

  const convertToImages = async () => {
    if (!pdfFile) return;
    setConverting(true);

    try {
      // Dynamic import to avoid SSR issues with pdfjs
      const pdfjsLib = await import('pdfjs-dist');
      
      // Set worker path
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const totalPages = pdf.numPages;
      const imageUrls: string[] = [];

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better quality

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          canvas: canvas,
          viewport: viewport,
        }).promise;

        imageUrls.push(canvas.toDataURL('image/png'));
      }

      setImages(imageUrls);
    } catch (error) {
      console.error('Error converting PDF to images:', error);
      alert('Failed to convert PDF: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setConverting(false);
    }
  };

  const downloadImage = (url: string, index: number) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `page-${index + 1}.png`;
    link.click();
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
            className="border-2 border-dashed rounded-lg p-4 sm:p-8 text-center hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors"
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
            <p className="text-sm font-medium">Click to upload a PDF</p>
            {pdfFile && <p className="text-xs text-primary mt-2">{pdfFile.name}</p>}
          </div>

          {pdfFile && images.length === 0 && (
            <div className="mt-4 flex gap-2">
              <Button onClick={convertToImages} disabled={converting} className="flex-1">
                {converting ? 'Converting...' : 'Convert to Images'}
              </Button>
              <Button variant="outline" onClick={() => setPdfFile(null)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
              <Button variant="outline" onClick={() => { setPdfFile(null); setImages([]); }}>
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
