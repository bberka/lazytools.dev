'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Download, Trash2, FileInput } from 'lucide-react';
// @ts-expect-error - mammoth does not export typescript declarations
import mammoth from 'mammoth/mammoth.browser.min.js';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, outputFileName, readFileAsArrayBuffer } from '@/lib/files';
import { pdfBlob } from '@/lib/pdf';
import { textToPdf } from '@/lib/tools/word-to-pdf';

// Roboto ships with the app in public/fonts, so the text font needs no third-party request.
const FONT_URL = '/fonts/Roboto-Regular.ttf';

interface PdfResult {
  // The converted document. It is kept as a Blob, so there is no object URL to revoke.
  blob: Blob;
  /** Characters of the document that the font cannot show. */
  unsupportedCharacters: number;
}

export function WordToPdf() {
  const [wordFile, setWordFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [pdfResult, setPdfResult] = useState<PdfResult | null>(null);
  const [error, setError] = useState('');

  // Identifies the conversion whose result is still wanted. Choosing another
  // file, Clear and leaving the tool all move it on, so a conversion that is
  // still running cannot offer its document under the wrong file.
  const runRef = useRef(0);
  useEffect(
    () => () => {
      runRef.current += 1;
    },
    []
  );

  const showFile = (file: File | null) => {
    runRef.current += 1;
    setWordFile(file);
    setPdfResult(null);
    setConverting(false);
    setError('');
  };

  // The intake only passes .docx files on; anything else is reported under the drop area.
  const intake = useFileIntake({
    accept: '.docx',
    onFiles: ([file]) => showFile(file),
  });

  const clear = () => {
    showFile(null);
    intake.reset();
  };

  const convertToPdf = async () => {
    if (!wordFile) return;
    const run = ++runRef.current;
    const isCurrent = () => runRef.current === run;
    setConverting(true);
    setError('');

    try {
      // 1. Extract text from Word document using mammoth
      const arrayBuffer = await readFileAsArrayBuffer(wordFile);
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text: string = result.value;
      if (!isCurrent()) return;

      if (!text.trim()) {
        setError('No text found in the Word document.');
        return;
      }

      // 2. Generate PDF using pdf-lib
      const fontResponse = await fetch(FONT_URL);
      if (!fontResponse.ok) {
        throw new Error('The font needed to write the PDF could not be loaded.');
      }

      const pdf = await textToPdf(text, await fontResponse.arrayBuffer());
      if (!isCurrent()) return;

      setPdfResult({ blob: pdfBlob(pdf.bytes), unsupportedCharacters: pdf.unsupportedCharacters });
    } catch (conversionError) {
      if (!isCurrent()) return;
      console.error('Error converting Word to PDF:', conversionError);
      setError(
        'Failed to convert document: ' +
          (conversionError instanceof Error ? conversionError.message : String(conversionError))
      );
    } finally {
      if (isCurrent()) setConverting(false);
    }
  };

  const handleDownload = () => {
    if (!pdfResult || !wordFile) return;
    downloadBlob(pdfResult.blob, outputFileName(wordFile.name, { extension: 'pdf' }));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileInput className="h-5 w-5" />
            Word to PDF
          </CardTitle>
          <CardDescription>
            Extract text from a Word (.docx) document and generate a PDF.
            <br />
            <span className="text-xs text-muted-foreground">Note: This is a client-side tool. It extracts raw text and basic paragraphs, but does not preserve complex styling, fonts, tables, or images.</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...intake.dropzoneProps}
            className={`border-2 border-dashed rounded-lg p-4 sm:p-8 text-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              intake.isDragging ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
            }`}
          >
            <input {...intake.inputProps} aria-label="Upload a Word document" />
            <Upload aria-hidden="true" className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-medium">Click to upload a Word Document (.docx)</p>
            {wordFile && <p className="text-xs text-primary mt-2 break-all">{wordFile.name}</p>}
          </div>
          {intake.error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {intake.error}
            </p>
          )}

          {wordFile && !pdfResult && (
            <div className="mt-4 flex gap-2">
              <Button onClick={convertToPdf} disabled={converting} className="flex-1">
                {converting ? 'Converting...' : 'Convert to PDF'}
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

          {pdfResult && (
            <div className="mt-4 flex gap-2">
              <Button onClick={handleDownload} className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Download .pdf
              </Button>
              <Button variant="outline" onClick={clear}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          )}

          {pdfResult && pdfResult.unsupportedCharacters > 0 && (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              {pdfResult.unsupportedCharacters === 1
                ? '1 character is not in the font this tool writes with and shows as an empty box in the PDF.'
                : `${pdfResult.unsupportedCharacters} characters are not in the font this tool writes with and show as empty boxes in the PDF.`}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
