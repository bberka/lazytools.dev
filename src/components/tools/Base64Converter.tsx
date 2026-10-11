'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Copy, Check, Trash2, ArrowLeftRight, Upload, FileText, X, Image as ImageIcon, Binary } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, formatBytes, readFileAsDataUrl, type FormatBytesOptions } from '@/lib/files';
import { convertBase64, type Base64Mode } from '@/lib/tools/base64-converter';

type Mode = Base64Mode;
type Tab = 'text' | 'file';

const SIZE_FORMAT: FormatBytesOptions = { fixed: true, byteUnit: 'B' };

function isImageType(mime: string) {
  return mime.startsWith('image/');
}

export function Base64Converter() {
  const [tab, setTab] = useState<Tab>('text');

  // Text tab state
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('encode');
  const { output, error } = useMemo(() => convertBase64(input, mode), [input, mode]);

  // File tab state
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileError, setFileError] = useState('');
  const [isReading, setIsReading] = useState(false);
  // Identifies the read in progress, so a slower, older one cannot overwrite it.
  const readId = useRef(0);
  // A read still running when the tool is closed must not report back either.
  useEffect(() => () => {
    readId.current = -1;
  }, []);

  const textCopy = useCopyToClipboard();
  const fileCopy = useCopyToClipboard();

  // ── Text mode ────────────────────────────────────────────────────────────────

  const handleSwap = () => {
    setInput(output);
    setMode(mode === 'encode' ? 'decode' : 'encode');
  };

  const handleClear = () => setInput('');

  // ── File mode ────────────────────────────────────────────────────────────────

  const processFile = (f: File) => {
    const id = ++readId.current;
    setFile(f);
    setFileBase64('');
    setPreviewUrl('');
    setFileError('');
    setIsReading(true);
    readFileAsDataUrl(f)
      .then((dataUrl) => {
        // Another file, or Clear, has replaced this one while it was being read.
        if (id !== readId.current) return;
        setIsReading(false);
        // dataUrl = "data:<mime>;base64,<b64>", or just "data:" for an empty file
        const comma = dataUrl.indexOf(',');
        const b64 = comma === -1 ? '' : dataUrl.slice(comma + 1);
        if (!b64) {
          setFileError('This file is empty, so there is nothing to encode.');
          return;
        }
        setFileBase64(b64);
        if (isImageType(f.type)) setPreviewUrl(dataUrl);
      })
      .catch(() => {
        if (id !== readId.current) return;
        setIsReading(false);
        setFileError('Failed to read file');
      });
  };

  const intake = useFileIntake({ onFiles: ([f]) => processFile(f) });

  const clearFile = () => {
    readId.current++;
    setFile(null);
    setFileBase64('');
    setPreviewUrl('');
    setFileError('');
    setIsReading(false);
    intake.reset();
  };

  const handleDownload = () => {
    if (!file || !fileBase64) return;
    downloadBlob(file, file.name);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Tab */}
      <Tabs value={tab} onValueChange={(val) => setTab(val as Tab)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="text" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Text
          </TabsTrigger>
          <TabsTrigger value="file" className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            File / Image
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'text' ? (
        <>
          {/* Mode */}
          <Tabs value={mode} onValueChange={(val) => setMode(val as Mode)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-auto">
              <TabsTrigger value="encode" className="flex items-center gap-2">
                <Binary className="h-4 w-4" />
                Encode
              </TabsTrigger>
              <TabsTrigger value="decode" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Decode
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Card>
            <CardHeader>
              <CardTitle>Input</CardTitle>
              <CardDescription>{mode === 'encode' ? 'Enter text to encode' : 'Enter Base64 to decode'}</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={mode === 'encode' ? 'Type here...' : 'Paste Base64 here...'}
                aria-label={mode === 'encode' ? 'Text to encode' : 'Base64 to decode'}
                rows={8}
                className="font-mono"
              />
            </CardContent>
          </Card>

          {error && (
            <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Output</CardTitle>
              <CardDescription>{output ? `${output.length} ${output.length === 1 ? 'character' : 'characters'}` :'Result appears here automatically'}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Textarea
                  value={output}
                  readOnly
                  placeholder="Output will appear here..."
                  aria-label="Output"
                  rows={8}
                  className="font-mono"
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => textCopy.copyToClipboard(output)} disabled={!output} size="sm" variant={textCopy.isCopied ? 'default' : 'outline'}>
                    {textCopy.isCopied ? <><Check className="h-4 w-4 mr-2" />Copied!</> : <><Copy className="h-4 w-4 mr-2" />Copy</>}
                  </Button>
                  <Button onClick={handleSwap} disabled={!output} variant="outline" size="sm">
                    <ArrowLeftRight className="h-4 w-4 mr-2" />Swap
                  </Button>
                  <Button onClick={handleClear} variant="outline" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>File</CardTitle>
              <CardDescription>Any file type — images show a preview. Processed entirely in browser.</CardDescription>
            </CardHeader>
            <CardContent>
              {file ? (
                <div className="flex items-center gap-3 p-4 rounded-md border bg-muted">
                  {isImageType(file.type)
                    ? <ImageIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    : <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{file.name}</p>
                    <p className="text-sm text-muted-foreground">{file.type || 'unknown type'} · {formatBytes(file.size, SIZE_FORMAT)}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={clearFile} aria-label="Remove file"><X className="h-4 w-4" /></Button>
                </div>
              ) : (
                <div
                  {...intake.dropzoneProps}
                  className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-md p-6 sm:p-10 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${intake.isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'}`}
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Drop file here or click to browse</p>
                  <input {...intake.inputProps} aria-label="Select file to encode as Base64" />
                </div>
              )}
              {isReading && (
                <p role="status" className="mt-3 text-sm text-muted-foreground">Reading file...</p>
              )}
            </CardContent>
          </Card>

          {fileError && (
            <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
              <strong>Error:</strong> {fileError}
            </div>
          )}

          {previewUrl && (
            <Card>
              <CardHeader><CardTitle>Image Preview</CardTitle></CardHeader>
              <CardContent>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Preview" className="max-h-64 rounded-md object-contain mx-auto" />
              </CardContent>
            </Card>
          )}

          {fileBase64 && (
            <Card>
              <CardHeader>
                <CardTitle>Base64 Output</CardTitle>
                <CardDescription>{fileBase64.length.toLocaleString()} characters</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Textarea value={fileBase64} readOnly aria-label="Base64 output" rows={8} className="font-mono text-xs" />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => fileCopy.copyToClipboard(fileBase64)} size="sm" variant={fileCopy.isCopied ? 'default' : 'outline'}>
                      {fileCopy.isCopied ? <><Check className="h-4 w-4 mr-2" />Copied!</> : <><Copy className="h-4 w-4 mr-2" />Copy</>}
                    </Button>
                    <Button onClick={handleDownload} variant="outline" size="sm">
                      Download original
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
