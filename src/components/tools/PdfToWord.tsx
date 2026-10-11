'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Download, Trash2, FileOutput } from 'lucide-react';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, outputFileName } from '@/lib/files';
import { PDF_MIME_TYPE, openPdf } from '@/lib/pdf';
import { pdfTextToDocx } from '@/lib/tools/pdf-to-word';

export function PdfToWord() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  // The converted document. It is kept as a Blob, so there is no object URL to revoke.
  const [wordBlob, setWordBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');

  // Identifies the conversion whose result is still wanted. Choosing another
  // file, Clear and leaving the tool all move it on, so a conversion that is
  // still running stops and cannot offer its document under the wrong file.
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
    setWordBlob(null);
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

  const convertToWord = async () => {
    if (!pdfFile) return;
    const run = ++runRef.current;
    const isCurrent = () => runRef.current === run;
    setConverting(true);
    setError('');

    try {
      // 1. Read the text of every page
      const pdf = await openPdf(pdfFile);
      const pages: string[] = [];

      try {
        for (let pageNumber = 1; pageNumber <= pdf.pageCount && isCurrent(); pageNumber++) {
          pages.push(await (await pdf.page(pageNumber)).text('flow'));
        }
      } finally {
        await pdf.destroy();
      }

      if (!isCurrent()) return;

      // 2. Generate Word Document using docx
      const blob = await pdfTextToDocx(pages);
      if (!isCurrent()) return;

      if (blob) {
        setWordBlob(blob);
      } else {
        setError('No text found in the PDF. Scanned pages are pictures and have no text to extract.');
      }
    } catch (conversionError) {
      if (!isCurrent()) return;
      console.error('Error converting PDF to Word:', conversionError);
      setError(
        'Failed to extract text from PDF: ' +
          (conversionError instanceof Error ? conversionError.message : String(conversionError))
      );
    } finally {
      if (isCurrent()) setConverting(false);
    }
  };

  const handleDownload = () => {
    if (!wordBlob || !pdfFile) return;
    downloadBlob(wordBlob, outputFileName(pdfFile.name, { extension: 'docx' }));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileOutput className="h-5 w-5" />
            PDF to Word
          </CardTitle>
          <CardDescription>
            Extract text from a PDF and convert it to a Word (.docx) document.
            <br />
            <span className="text-xs text-muted-foreground">Note: This is a client-side tool. It extracts raw text but may not preserve complex formatting, tables, or images.</span>
          </CardDescription>
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
            <p role="alert" className="mt-2 text-sm text-destructive">
              {intake.error}
            </p>
          )}

          {pdfFile && !wordBlob && (
            <div className="mt-4 flex gap-2">
              <Button onClick={convertToWord} disabled={converting} className="flex-1">
                {converting ? 'Extracting Text...' : 'Convert to Word'}
              </Button>
              <Button variant="outline" onClick={clear}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-4 bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}

          {wordBlob && (
            <div className="mt-4 flex gap-2">
              <Button onClick={handleDownload} className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Download .docx
              </Button>
              <Button variant="outline" onClick={clear}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
