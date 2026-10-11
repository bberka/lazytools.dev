'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Trash2, Scissors } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, formatBytes, outputFileName, readFileAsArrayBuffer } from '@/lib/files';
import { PDF_MIME_TYPE, parsePageRange, pdfBlob } from '@/lib/pdf';

export function PdfSplit() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [range, setRange] = useState('');
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState('');

  const loadPdfFile = async (file: File) => {
    setPdfFile(file);
    // Nothing of the previous document may be left if this one fails to load.
    setPageCount(0);
    setRange('');
    setError('');

    try {
      const arrayBuffer = await readFileAsArrayBuffer(file);
      const pdf = await PDFDocument.load(arrayBuffer);
      setPageCount(pdf.getPageCount());
      setRange(`1-${pdf.getPageCount()}`);
    } catch (loadError) {
      console.error('Error loading PDF:', loadError);
      setError(
        'Failed to load PDF: ' + (loadError instanceof Error ? loadError.message : String(loadError))
      );
    }
  };

  // The intake only passes PDFs on; anything else is reported in the drop area.
  const intake = useFileIntake({
    accept: PDF_MIME_TYPE,
    onFiles: ([file]) => loadPdfFile(file),
  });

  const splitPdf = async () => {
    if (!pdfFile || !range) return;
    setSplitting(true);
    setError('');

    try {
      const arrayBuffer = await readFileAsArrayBuffer(pdfFile);
      const pdf = await PDFDocument.load(arrayBuffer);
      const newPdf = await PDFDocument.create();

      // Requested pages, without duplicates and in document order
      const uniquePages = parsePageRange(range, pageCount);

      const copiedPages = await newPdf.copyPages(pdf, uniquePages);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const pdfBytes = await newPdf.save();
      downloadBlob(pdfBlob(pdfBytes), outputFileName(pdfFile.name, { prefix: 'split-' }));
    } catch (splitError) {
      console.error('Error splitting PDF:', splitError);
      setError(
        'Failed to split PDF: ' +
          (splitError instanceof Error ? splitError.message : String(splitError))
      );
    } finally {
      setSplitting(false);
    }
  };

  const handleClear = () => {
    setPdfFile(null);
    setError('');
    intake.reset();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Split PDF
          </CardTitle>
          <CardDescription>Extract specific pages or ranges from a PDF document</CardDescription>
        </CardHeader>
        <CardContent>
          <FileDropzone
            intake={intake}
            label="Drag & drop a PDF file here or click to browse"
            hint="Files remain local on your machine"
            selected={
              pdfFile && (
                <>
                  <FileText className="h-3.5 w-3.5" />
                  {pdfFile.name} ({formatBytes(pdfFile.size)})
                </>
              )
            }
          />
        </CardContent>
      </Card>

      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {pdfFile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Split Options</CardTitle>
            <CardDescription>PDF contains {pageCount} pages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Page Range (e.g. 1-3, 5, 7-10)</label>
              <Input
                value={range}
                onChange={(e) => setRange(e.target.value)}
                placeholder="1-3, 5"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={splitPdf} disabled={splitting || !range} className="flex-1">
                {splitting ? 'Splitting...' : 'Extract Pages'}
              </Button>
              <Button variant="outline" onClick={handleClear}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
