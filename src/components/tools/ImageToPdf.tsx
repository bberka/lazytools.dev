'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { useFileIntake } from '@/hooks/useFileIntake';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { downloadBlob, readFileAsArrayBuffer } from '@/lib/files';
import { pdfBlob } from '@/lib/pdf';

// The preview URL belongs to the thumbnail: it is revoked when the image is
// removed from the list or the tool unmounts.
function ImageThumbnail({ file }: { file: File }) {
  const url = useObjectUrl(file);
  if (!url) return null;

  return <img src={url} alt="Uploaded" className="object-cover w-full h-full" />;
}

export function ImageToPdf() {
  const [images, setImages] = useState<{ id: string; file: File }[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // The intake only passes JPEG and PNG on; anything else is reported under the drop area.
  const addImages = (files: File[]) => {
    const newImages = files.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
    }));

    setError('');
    setImages((prev) => [...prev, ...newImages]);
  };

  const intake = useFileIntake({ accept: 'image/jpeg,image/png', multiple: true, onFiles: addImages });

  const generatePdf = async () => {
    if (images.length === 0) return;
    setGenerating(true);
    setError('');

    try {
      const pdfDoc = await PDFDocument.create();

      for (const imgData of images) {
        const imgBytes = await readFileAsArrayBuffer(imgData.file);
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
      downloadBlob(pdfBlob(pdfBytes), 'images.pdf');
    } catch (generateError) {
      console.error('Error generating PDF:', generateError);
      setError(
        'Failed to generate PDF: ' +
          (generateError instanceof Error ? generateError.message : String(generateError))
      );
    } finally {
      setGenerating(false);
    }
  };

  const removeImage = (id: string) => {
    setError('');
    setImages((prev) => prev.filter((img) => img.id !== id));
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
            {...intake.dropzoneProps}
            className={`border-2 border-dashed rounded-lg p-4 sm:p-8 text-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              intake.isDragging
                ? 'border-primary bg-primary/5'
                : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
            }`}
          >
            <input {...intake.inputProps} aria-label="Upload JPEG or PNG images" />
            <Upload aria-hidden="true" className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-medium">Click to upload JPEG or PNG images</p>
          </div>
          {intake.error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {intake.error}
            </p>
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
                  <ImageThumbnail file={img.file} />
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
