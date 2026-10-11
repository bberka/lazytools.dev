'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Trash2, ArrowUp, ArrowDown, Files } from 'lucide-react';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, formatBytes, type FormatBytesOptions } from '@/lib/files';
import { PDF_MIME_TYPE, pdfBlob } from '@/lib/pdf';
import { describePdfFailure, mergePdfs } from '@/lib/tools/pdf-page-ops';

interface PdfFile {
  id: string;
  file: File;
  name: string;
  size: number;
}

// Sizes in the list read "0.5 KB", "845.3 KB", "2.4 MB".
const SIZE_FORMAT: FormatBytesOptions = { fixed: true, decimals: 1, minUnit: 'KB', maxUnit: 'MB' };

const MERGED_FILE_NAME = 'merged.pdf';

export function PdfMerge() {
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  // The intake only passes PDFs on; anything else is reported in the drop area.
  const addFiles = (files: File[]) => {
    const newFiles = files.map((file) => ({
      id: Math.random().toString(36).slice(2, 11),
      file,
      name: file.name,
      size: file.size,
    }));

    setError('');
    setStatus('');
    setPdfFiles((prev) => [...prev, ...newFiles]);
  };

  const intake = useFileIntake({ accept: PDF_MIME_TYPE, multiple: true, onFiles: addFiles });

  const removeFile = (id: string) => {
    setError('');
    setStatus('');
    setPdfFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const moveFile = (id: string, direction: 'up' | 'down') => {
    const index = pdfFiles.findIndex((f) => f.id === id);
    setStatus('');
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

  const mergePdfFiles = async () => {
    if (pdfFiles.length < 2) return;
    setMerging(true);
    setError('');
    setStatus('');

    try {
      const { bytes, pageCount } = await mergePdfs(
        pdfFiles.map(({ name, file }) => ({ name, data: file }))
      );
      downloadBlob(pdfBlob(bytes), MERGED_FILE_NAME);
      setStatus(
        `Merged ${pdfFiles.length} files (${pageCount} ${pageCount === 1 ? 'page' : 'pages'}) into ${MERGED_FILE_NAME}.`
      );
    } catch (mergeError) {
      console.error('Error merging PDFs:', mergeError);
      setError(describePdfFailure(mergeError, 'Failed to merge PDFs'));
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
          <FileDropzone
            intake={intake}
            label="Click to upload or drag and drop PDFs"
            hint="Combine documents in any order"
          />
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
            <CardTitle className="text-sm font-medium flex justify-between items-center gap-2">
              Selected Files ({pdfFiles.length})
              {pdfFiles.length >= 2 && (
                <Button onClick={mergePdfFiles} disabled={merging}>
                  {merging ? 'Merging...' : 'Merge PDFs'}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pdfFiles.length === 1 && (
              <p className="text-sm text-muted-foreground">Add at least one more PDF to merge.</p>
            )}
            {pdfFiles.map((f, index) => (
              <div
                key={f.id}
                className="flex items-center gap-3 p-3 border rounded-md bg-card"
              >
                <FileText aria-hidden="true" className="h-5 w-5 text-red-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(f.size, SIZE_FORMAT)}</p>
                </div>
                <div className="flex items-center gap-1">
                  {/* The order is fixed while it is being merged, so the result matches the list. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${f.name} up`}
                    disabled={merging || index === 0}
                    onClick={() => moveFile(f.id, 'up')}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${f.name} down`}
                    disabled={merging || index === pdfFiles.length - 1}
                    onClick={() => moveFile(f.id, 'down')}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${f.name}`}
                    disabled={merging}
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeFile(f.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
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
