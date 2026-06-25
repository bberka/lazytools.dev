'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Upload, Download, Trash2, FileInput } from 'lucide-react';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
// @ts-expect-error - mammoth does not export typescript declarations
import mammoth from 'mammoth/mammoth.browser.min.js';

export function WordToPdf() {
  const [wordFile, setWordFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith('.docx')) return;
    setWordFile(file);
    setPdfDataUrl(null);
  };

  const convertToPdf = async () => {
    if (!wordFile) return;
    setConverting(true);

    try {
      // 1. Extract text from Word document using mammoth
      const arrayBuffer = await wordFile.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;

      if (!text.trim()) {
        alert('No text found in the Word document.');
        setConverting(false);
        return;
      }

      // 2. Generate PDF using pdf-lib
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);

      const fontUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf';
      const fontBytes = await fetch(fontUrl).then(res => res.arrayBuffer());
      const font = await pdfDoc.embedFont(fontBytes);
      
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
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfDataUrl(url);

    } catch (error) {
      console.error('Error converting Word to PDF:', error);
      alert('Failed to convert document: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setConverting(false);
    }
  };

  const handleDownload = () => {
    if (!pdfDataUrl || !wordFile) return;
    const link = document.createElement('a');
    link.href = pdfDataUrl;
    link.download = `${wordFile.name.replace('.docx', '')}.pdf`;
    link.click();
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
            className="border-2 border-dashed rounded-lg p-4 sm:p-8 text-center hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-medium">Click to upload a Word Document (.docx)</p>
            {wordFile && <p className="text-xs text-primary mt-2">{wordFile.name}</p>}
          </div>

          {wordFile && !pdfDataUrl && (
            <div className="mt-4 flex gap-2">
              <Button onClick={convertToPdf} disabled={converting} className="flex-1">
                {converting ? 'Converting...' : 'Convert to PDF'}
              </Button>
              <Button variant="outline" onClick={() => setWordFile(null)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          )}

          {pdfDataUrl && (
            <div className="mt-4 flex gap-2">
              <Button onClick={handleDownload} className="flex-1 bg-red-600 hover:bg-red-700">
                <Download className="h-4 w-4 mr-2" />
                Download .pdf
              </Button>
              <Button variant="outline" onClick={() => { setWordFile(null); setPdfDataUrl(null); }}>
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
