'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Upload, Download, Trash2, FileOutput } from 'lucide-react';

export function PdfToWord() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [wordDataUrl, setWordDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;
    setPdfFile(file);
    setWordDataUrl(null);
  };

  const convertToWord = async () => {
    if (!pdfFile) return;
    setConverting(true);

    try {
      // 1. Read PDF text using pdfjs-dist
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const totalPages = pdf.numPages;
      
      let fullText = '';

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => (item as { str?: string }).str ?? '')
          .join(' ');
        fullText += pageText + '\n\n';
      }

      // 2. Generate Word Document using docx
      const { Document, Packer, Paragraph, TextRun } = await import('docx');

      const paragraphs = fullText.split('\n').map((line) => {
        return new Paragraph({
          children: [new TextRun(line)],
        });
      });

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: paragraphs,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      setWordDataUrl(url);

    } catch (error) {
      console.error('Error converting PDF to Word:', error);
      alert('Failed to extract text from PDF: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setConverting(false);
    }
  };

  const handleDownload = () => {
    if (!wordDataUrl || !pdfFile) return;
    const link = document.createElement('a');
    link.href = wordDataUrl;
    link.download = `${pdfFile.name.replace('.pdf', '')}.docx`;
    link.click();
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

          {pdfFile && !wordDataUrl && (
            <div className="mt-4 flex gap-2">
              <Button onClick={convertToWord} disabled={converting} className="flex-1">
                {converting ? 'Extracting Text...' : 'Convert to Word'}
              </Button>
              <Button variant="outline" onClick={() => setPdfFile(null)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          )}
          
          {wordDataUrl && (
            <div className="mt-4 flex gap-2">
              <Button onClick={handleDownload} className="flex-1 bg-green-600 hover:bg-green-700">
                <Download className="h-4 w-4 mr-2" />
                Download .docx
              </Button>
              <Button variant="outline" onClick={() => { setPdfFile(null); setWordDataUrl(null); }}>
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
