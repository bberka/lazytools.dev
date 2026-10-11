'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Trash2, Scissors } from 'lucide-react';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, formatBytes, outputFileName } from '@/lib/files';
import { PDF_MIME_TYPE, pdfBlob } from '@/lib/pdf';
import {
  describePdfFailure,
  extractPdfPages,
  formatPageList,
  loadPdf,
} from '@/lib/tools/pdf-page-ops';

export function PdfSplit() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [range, setRange] = useState('');
  const [loading, setLoading] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const rangeId = useId();
  // Names the latest file; work that was started for an earlier one must not report back.
  const loadIdRef = useRef(0);

  useEffect(
    () => () => {
      loadIdRef.current += 1;
    },
    []
  );

  const loadPdfFile = async (file: File) => {
    const loadId = ++loadIdRef.current;

    setPdfFile(file);
    // Nothing of the previous document may be left if this one fails to load.
    setPageCount(0);
    setRange('');
    setError('');
    setStatus('');
    setLoading(true);

    try {
      const count = (await loadPdf(file)).getPageCount();
      // Replaced or cleared while the file was being read.
      if (loadId !== loadIdRef.current) return;
      setPageCount(count);
      setRange(`1-${count}`);
    } catch (loadError) {
      if (loadId !== loadIdRef.current) return;
      console.error('Error loading PDF:', loadError);
      setError(describePdfFailure(loadError, 'Failed to load PDF'));
    } finally {
      if (loadId === loadIdRef.current) setLoading(false);
    }
  };

  // The intake only passes PDFs on; anything else is reported in the drop area.
  const intake = useFileIntake({
    accept: PDF_MIME_TYPE,
    onFiles: ([file]) => loadPdfFile(file),
  });

  const splitPdf = async () => {
    if (!pdfFile || !range.trim()) return;
    const loadId = loadIdRef.current;

    setSplitting(true);
    setError('');
    setStatus('');

    try {
      // Requested pages, without duplicates and in document order
      const { bytes, pages } = await extractPdfPages(pdfFile, range);
      const fileName = outputFileName(pdfFile.name, { prefix: 'split-', extension: 'pdf' });
      downloadBlob(pdfBlob(bytes), fileName);

      // The download was asked for; the message belongs to a file that is no longer shown.
      if (loadId !== loadIdRef.current) return;
      setStatus(
        `Extracted ${pages.length === 1 ? 'page' : 'pages'} ${formatPageList(pages)} to ${fileName}.`
      );
    } catch (splitError) {
      if (loadId !== loadIdRef.current) return;
      console.error('Error splitting PDF:', splitError);
      setError(describePdfFailure(splitError, 'Failed to split PDF'));
    } finally {
      setSplitting(false);
    }
  };

  const handleClear = () => {
    loadIdRef.current += 1;
    setPdfFile(null);
    setPageCount(0);
    setRange('');
    setLoading(false);
    setError('');
    setStatus('');
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
            {loading ? (
              <CardDescription>Reading PDF...</CardDescription>
            ) : (
              pageCount > 0 && (
                <CardDescription>
                  PDF contains {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                </CardDescription>
              )
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor={rangeId} className="text-sm font-medium">
                Page Range (e.g. 1-3, 5, 7-10)
              </label>
              <Input
                id={rangeId}
                value={range}
                onChange={(e) => {
                  setRange(e.target.value);
                  setStatus('');
                }}
                placeholder="1-3, 5"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={splitPdf}
                disabled={splitting || loading || pageCount === 0 || !range.trim()}
                className="flex-1"
              >
                {splitting ? 'Splitting...' : 'Extract Pages'}
              </Button>
              <Button variant="outline" onClick={handleClear}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
            {status && (
              <p role="status" className="text-sm text-muted-foreground">
                {status}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
