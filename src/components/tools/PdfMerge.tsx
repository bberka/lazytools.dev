'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Upload, Trash2, ArrowUp, ArrowDown, Files } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, formatBytes, readFileAsArrayBuffer, type FormatBytesOptions } from '@/lib/files';
import { PDF_MIME_TYPE, pdfBlob } from '@/lib/pdf';

interface PdfFile {
  id: string;
  file: File;
  name: string;
  size: number;
}

// Sizes in the list read "0.5 KB", "845.3 KB", "2.4 MB".
const SIZE_FORMAT: FormatBytesOptions = { fixed: true, decimals: 1, minUnit: 'KB', maxUnit: 'MB' };

export function PdfMerge() {
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState('');

  // The intake only passes PDFs on; anything else is reported under the drop area.
  const addFiles = (files: File[]) => {
    const newFiles = files.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      size: file.size,
    }));

    setError('');
    setPdfFiles((prev) => [...prev, ...newFiles]);
  };

  const intake = useFileIntake({ accept: PDF_MIME_TYPE, multiple: true, onFiles: addFiles });

  const removeFile = (id: string) => {
    setError('');
    setPdfFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const moveFile = (id: string, direction: 'up' | 'down') => {
    const index = pdfFiles.findIndex((f) => f.id === id);
    if (direction === 'up' && index > 0) {
      const newFiles = [...pdfFiles];
      [newFiles[index - 1], newFiles[index]] = [newFiles[index], newFiles[index - 1]];
      setPdfFiles(newFiles);
    } else if (direction === 'down' && index < pdfFiles.length - 1) {
      const newFiles = [...pdfFiles];
      [newFiles[index + 1], newFiles[index]] = [newFiles[index], newFiles[index + 1]];
      setPdfFiles(newFiles);
    }
  };

  const mergePdfs = async () => {
    if (pdfFiles.length < 2) return;
    setMerging(true);
    setError('');

    try {
      const mergedPdf = await PDFDocument.create();

      for (const pdfFile of pdfFiles) {
        const arrayBuffer = await readFileAsArrayBuffer(pdfFile.file);
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const pdfBytes = await mergedPdf.save();
      downloadBlob(pdfBlob(pdfBytes), 'merged.pdf');
    } catch (mergeError) {
      console.error('Error merging PDFs:', mergeError);
      setError(
        'Failed to merge PDFs: ' +
          (mergeError instanceof Error ? mergeError.message : String(mergeError))
      );
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Files className="h-5 w-5" />
            Merge PDF
          </CardTitle>
          <CardDescription>Combine multiple PDF documents into a single file</CardDescription>
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
            <input {...intake.inputProps} aria-label="Upload PDF files" />
            <Upload aria-hidden="true" className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-medium">Click to upload or drag and drop PDFs</p>
            <p className="text-xs text-muted-foreground mt-1">Combine documents in any order</p>
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

      {pdfFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex justify-between items-center">
              Selected Files ({pdfFiles.length})
              {pdfFiles.length >= 2 && (
                <Button onClick={mergePdfs} disabled={merging}>
                  {merging ? 'Merging...' : 'Merge PDFs'}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pdfFiles.map((f, index) => (
              <div
                key={f.id}
                className="flex items-center gap-3 p-3 border rounded-md bg-card"
              >
                <FileText className="h-5 w-5 text-red-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(f.size, SIZE_FORMAT)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === 0}
                    onClick={() => moveFile(f.id, 'up')}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === pdfFiles.length - 1}
                    onClick={() => moveFile(f.id, 'down')}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeFile(f.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
