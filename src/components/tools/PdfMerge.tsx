'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Upload, Download, Trash2, ArrowUp, ArrowDown, Files } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';

interface PdfFile {
  id: string;
  file: File;
  name: string;
  size: number;
}

export function PdfMerge() {
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [merging, setMerging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles = files
      .filter((file) => file.type === 'application/pdf')
      .map((file) => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        name: file.name,
        size: file.size,
      }));

    setPdfFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
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

    try {
      const mergedPdf = await PDFDocument.create();

      for (const pdfFile of pdfFiles) {
        const arrayBuffer = await pdfFile.file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'merged.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error merging PDFs:', error);
    } finally {
      setMerging(false);
    }
  };

  const formatSize = (bytes: number) => {
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    return (kb / 1024).toFixed(1) + ' MB';
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
            className="border-2 border-dashed rounded-lg p-4 sm:p-8 text-center hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-medium">Click to upload or drag and drop PDFs</p>
            <p className="text-xs text-muted-foreground mt-1">Combine documents in any order</p>
          </div>
        </CardContent>
      </Card>

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
                  <p className="text-xs text-muted-foreground">{formatSize(f.size)}</p>
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
