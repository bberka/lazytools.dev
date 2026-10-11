'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Download, Trash2, FileInput } from 'lucide-react';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
// @ts-expect-error - mammoth does not export typescript declarations
import mammoth from 'mammoth/mammoth.browser.min.js';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, outputFileName, readFileAsArrayBuffer } from '@/lib/files';
import { pdfBlob } from '@/lib/pdf';

// Roboto ships with the app in public/fonts, so the text font needs no third-party request.
const FONT_URL = '/fonts/Roboto-Regular.ttf';

export function WordToPdf() {
  const [wordFile, setWordFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  // The converted document. It is kept as a Blob, so there is no object URL to revoke.
  const [pdfResult, setPdfResult] = useState<Blob | null>(null);
  const [error, setError] = useState('');

  // The intake only passes .docx files on; anything else is reported under the drop area.
  const intake = useFileIntake({
    accept: '.docx',
    onFiles: ([file]) => {
      setWordFile(file);
      setPdfResult(null);
      setError('');
    },
  });

  const convertToPdf = async () => {
    if (!wordFile) return;
    setConverting(true);
    setError('');

    try {
      // 1. Extract text from Word document using mammoth
      const arrayBuffer = await readFileAsArrayBuffer(wordFile);
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;

      if (!text.trim()) {
        setError('No text found in the Word document.');
        setConverting(false);
        return;
      }

      // 2. Generate PDF using pdf-lib
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);

      const fontResponse = await fetch(FONT_URL);
      if (!fontResponse.ok) {
        throw new Error('The font needed to write the PDF could not be loaded.');
      }
      const font = await pdfDoc.embedFont(await fontResponse.arrayBuffer());

      let page = pdfDoc.addPage();
      const { width, height } = page.getSize();
      const margin = 50;
      const fontSize = 12;
      const lineHeight = font.heightAtSize(fontSize) + 4;
      
      let cursorY = height - margin;

      // Basic text wrapping simulation
      const words = text.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const textWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (textWidth > width - margin * 2) {
          // Draw current line and move down
          page.drawText(currentLine, {
            x: margin,
            y: cursorY,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0),
          });
          currentLine = word;
          cursorY -= lineHeight;

          // Add new page if necessary
          if (cursorY < margin) {
            page = pdfDoc.addPage();
            cursorY = height - margin;
          }
        } else {
          currentLine = testLine;
        }
      }

      // Draw remaining text
      if (currentLine) {
        page.drawText(currentLine, {
          x: margin,
          y: cursorY,
          size: fontSize,
          font: font,
          color: rgb(0, 0, 0),
        });
      }

      const pdfBytes = await pdfDoc.save();
      setPdfResult(pdfBlob(pdfBytes));

    } catch (conversionError) {
      console.error('Error converting Word to PDF:', conversionError);
      setError(
        'Failed to convert document: ' +
          (conversionError instanceof Error ? conversionError.message : String(conversionError))
      );
    } finally {
      setConverting(false);
    }
  };

  const handleDownload = () => {
    if (!pdfResult || !wordFile) return;
    downloadBlob(pdfResult, outputFileName(wordFile.name, { extension: 'pdf' }));
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
              intake.isDragging
                ? 'border-primary bg-primary/5'
                : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
            }`}
          >
            <input {...intake.inputProps} aria-label="Upload a Word document" />
            <Upload aria-hidden="true" className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-medium">Click to upload a Word Document (.docx)</p>
            {wordFile && <p className="text-xs text-primary mt-2">{wordFile.name}</p>}
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
              <Button
                variant="outline"
                onClick={() => {
                  setWordFile(null);
                  setError('');
                  intake.reset();
                }}
              >
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
              <Button onClick={handleDownload} className="flex-1 bg-red-600 hover:bg-red-700">
                <Download className="h-4 w-4 mr-2" />
                Download .pdf
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setWordFile(null);
                  setPdfResult(null);
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
    </div>
  );
}
