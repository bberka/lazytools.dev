'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Upload, Download, Trash2, Image as ImageIcon } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';

export function ImageToPdf() {
  const [images, setImages] = useState<{ id: string; url: string; file: File }[]>([]);
  const [generating, setGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newImages = files.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      url: URL.createObjectURL(file),
      file,
    }));
    setImages((prev) => [...prev, ...newImages]);
  };

  const generatePdf = async () => {
    if (images.length === 0) return;
    setGenerating(true);

    try {
      const pdfDoc = await PDFDocument.create();

      for (const imgData of images) {
        const imgBytes = await imgData.file.arrayBuffer();
        let pdfImg;
        
        if (imgData.file.type === 'image/jpeg' || imgData.file.type === 'image/jpg') {
          pdfImg = await pdfDoc.embedJpg(imgBytes);
        } else if (imgData.file.type === 'image/png') {
          pdfImg = await pdfDoc.embedPng(imgBytes);
        } else {
          // Attempt to convert to PNG/JPG via canvas if needed, but for simplicity:
          console.warn('Unsupported image format for direct embedding');
          continue;
        }

        const page = pdfDoc.addPage([pdfImg.width, pdfImg.height]);
        page.drawImage(pdfImg, {
          x: 0,
          y: 0,
          width: pdfImg.width,
          height: pdfImg.height,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'images.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setGenerating(false);
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const filtered = prev.filter((img) => img.id !== id);
      const removed = prev.find((img) => img.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return filtered;
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Image to PDF
          </CardTitle>
          <CardDescription>Convert one or more images into a PDF document</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="border-2 border-dashed rounded-lg p-4 sm:p-8 text-center hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-medium">Click to upload JPEG or PNG images</p>
          </div>
        </CardContent>
      </Card>

      {images.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              Selected Images ({images.length})
              <Button onClick={generatePdf} disabled={generating}>
                {generating ? 'Generating...' : 'Generate PDF'}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {images.map((img) => (
                <div key={img.id} className="relative group aspect-square border rounded-md overflow-hidden bg-slate-100">
                  <img src={img.url} alt="Uploaded" className="object-cover w-full h-full" />
                  <button
                    onClick={() => removeImage(img.id)}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
