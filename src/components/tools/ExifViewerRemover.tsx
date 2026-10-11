'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Download, Eye, Image as ImageIcon, Loader2, Shield, Trash2, Upload, X, Archive, FileImage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCopyToClipboard } from '@/hooks';
import { useFileIntake } from '@/hooks/useFileIntake';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FileDropzone } from '@/components/FileDropzone';
import {
  downloadBlob,
  formatBytes,
  loadImage,
  outputFileName,
  readFileAsArrayBuffer,
  type FormatBytesOptions,
} from '@/lib/files';
import { parseExifSections, uniqueFileNames, type ExifSection } from '@/lib/tools/exif-viewer-remover';
import { canvasImageType, canvasToBlob, imageTypeExtension, type CanvasImageType } from '@/lib/tools/image-canvas';
import JSZip from 'jszip';

type OutputFormat = 'original' | 'jpeg' | 'png' | 'webp';

// Sizes on this page read "512 B", "845.3 KB", "2.41 MB".
const SIZE_FORMAT: FormatBytesOptions = { fixed: true, byteUnit: 'B', decimals: { KB: 1 } };

const outputTypeFor = (file: File, format: OutputFormat): CanvasImageType =>
  format === 'original' ? canvasImageType(file.type) : `image/${format}`;

/**
 * Redraws the image on a canvas and encodes it again, which leaves every
 * embedded metadata block behind. The Blob's type says what was written: a
 * browser that cannot encode the requested type writes PNG instead.
 */
async function reencodeWithoutMetadata(file: File, format: OutputFormat): Promise<Blob> {
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas context is not available for cleanup.');
  }

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const type = outputTypeFor(file, format);

  // JPEG has no transparency; without a backdrop the see-through areas come out black.
  if (type === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(image, 0, 0);

  try {
    return await canvasToBlob(canvas, type, type === 'image/png' ? 1 : 0.92);
  } finally {
    // Hand the pixel buffer back now; a batch would otherwise hold one per image until collected.
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function ExifViewerRemover() {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [cleanFile, setCleanFile] = useState<File | null>(null);
  // The previews follow the files: each URL is revoked when its file changes or the tool unmounts.
  const previewUrl = useObjectUrl(file);
  const cleanUrl = useObjectUrl(cleanFile);
  const [sections, setSections] = useState<ExifSection[]>([]);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('original');
  // The field whose copy button was pressed last. The hook knows whether that copy worked and when to stop showing it.
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyResult = useCopyToClipboard();
  // Bumped whenever the single image changes, so work started for the previous one is dropped.
  const singleRun = useRef(0);
  // A batch saves its ZIP when it finishes, but not once the tool has been left.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Batch processing types
  type BatchFileStatus = 'waiting' | 'processing' | 'done' | 'error';

  type BatchItem = {
    id: string;
    file: File;
    status: BatchFileStatus;
    error?: string;
    cleanedBlob?: Blob;
    cleanedSize?: number;
  };

  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchOutputFormat, setBatchOutputFormat] = useState<OutputFormat>('original');
  const [batchZip, setBatchZip] = useState<Blob | null>(null);
  const [batchError, setBatchError] = useState('');

  // The intake only passes images on; anything else is reported under the drop area.
  const addBatchFiles = (files: File[]) => {
    const newItems: BatchItem[] = files.map((f) => ({
      id: Math.random().toString(36).substring(2, 9),
      file: f,
      status: 'waiting',
    }));
    setBatchZip(null);
    setBatchError('');
    setBatchItems((prev) => [...prev, ...newItems]);
  };

  const batchIntake = useFileIntake({ accept: 'image/*', multiple: true, onFiles: addBatchFiles });

  const handleProcessBatch = async () => {
    if (batchItems.length === 0) return;
    setBatchProcessing(true);
    setBatchZip(null);
    setBatchError('');

    // Reset status of all items to 'waiting'
    const resetItems: BatchItem[] = batchItems.map(item => ({
      ...item,
      status: 'waiting' as BatchFileStatus,
      error: undefined,
      cleanedBlob: undefined,
      cleanedSize: undefined,
    }));
    setBatchItems(resetItems);

    const activeItems = [...resetItems];
    const concurrencyLimit = 4;
    let index = 0;

    const worker = async () => {
      while (index < activeItems.length) {
        const currentIndex = index;
        index += 1;
        const item = activeItems[currentIndex];

        setBatchItems((prev) =>
          prev.map((prevItem) =>
            prevItem.id === item.id ? { ...prevItem, status: 'processing' } : prevItem
          )
        );

        try {
          const cleanedBlob = await reencodeWithoutMetadata(item.file, batchOutputFormat);

          setBatchItems((prev) =>
            prev.map((prevItem) =>
              prevItem.id === item.id
                ? {
                    ...prevItem,
                    status: 'done',
                    cleanedBlob,
                    cleanedSize: cleanedBlob.size,
                  }
                : prevItem
            )
          );
          activeItems[currentIndex] = {
            ...item,
            status: 'done',
            cleanedBlob,
            cleanedSize: cleanedBlob.size,
          };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Error cleaning image';
          setBatchItems((prev) =>
            prev.map((prevItem) =>
              prevItem.id === item.id ? { ...prevItem, status: 'error', error: errMsg } : prevItem
            )
          );
          activeItems[currentIndex] = {
            ...item,
            status: 'error',
            error: errMsg,
          };
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrencyLimit, activeItems.length) }, worker);
    await Promise.all(workers);

    try {
      const cleaned = activeItems.flatMap((item) =>
        item.status === 'done' && item.cleanedBlob ? [{ file: item.file, blob: item.cleanedBlob }] : []
      );

      if (cleaned.length === 0) {
        setBatchError('None of the images could be cleaned, so there is no ZIP to download.');
        return;
      }

      // Two files may share a name, or differ only in an extension that the
      // output format replaces. Each entry needs a name of its own or the
      // archive keeps only the last of them.
      const zipFileNames = uniqueFileNames(
        cleaned.map(({ file: source, blob }) =>
          outputFileName(source.name, { suffix: '-clean', extension: imageTypeExtension(blob.type) })
        )
      );

      const zip = new JSZip();
      cleaned.forEach(({ blob }, position) => zip.file(zipFileNames[position], blob));

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      if (!mountedRef.current) return;

      setBatchZip(zipBlob);
      downloadBlob(zipBlob, `cleaned_images_${Date.now()}.zip`);
    } catch (zipErr) {
      console.error('Failed to generate ZIP archive', zipErr);
      setBatchError('The ZIP archive could not be created.');
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleRemoveBatchItem = (id: string) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
    setBatchZip(null);
    setBatchError('');
  };

  const handleClearBatch = () => {
    setBatchItems([]);
    setBatchProcessing(false);
    setBatchOutputFormat('original');
    setBatchZip(null);
    setBatchError('');
    batchIntake.reset();
  };

  const getStatusBadge = (status: BatchFileStatus, errorMsg?: string) => {
    switch (status) {
      case 'waiting':
        return <Badge variant="outline">Waiting</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="animate-pulse">Processing</Badge>;
      case 'done':
        return <Badge className="bg-green-600 hover:bg-green-600/90 text-white">Cleaned</Badge>;
      case 'error':
        return (
          <Badge variant="destructive" title={errorMsg}>
            Failed
          </Badge>
        );
    }
  };

  const handleCopyField = (value: string, fieldKey: string) => {
    setCopiedField(fieldKey);
    void copyResult.copyToClipboard(value);
  };

  const loadSingleImage = async (nextFile: File) => {
    singleRun.current += 1;
    const run = singleRun.current;

    setError('');
    setProcessing(false);
    setFile(nextFile);
    setCleanFile(null);
    setSections([]);

    try {
      const buffer = await readFileAsArrayBuffer(nextFile);
      if (run !== singleRun.current) return;
      setSections(parseExifSections(buffer));
    } catch (readError) {
      if (run !== singleRun.current) return;
      setError(
        readError instanceof Error
          ? readError.message
          : 'Unable to inspect metadata for the selected file.'
      );
    }
  };

  const singleIntake = useFileIntake({
    accept: 'image/*',
    onFiles: ([nextFile]) => loadSingleImage(nextFile),
  });

  const handleRemoveMetadata = async () => {
    if (!file) {
      return;
    }

    const run = singleRun.current;
    setProcessing(true);
    setError('');

    try {
      const blob = await reencodeWithoutMetadata(file, outputFormat);
      if (run !== singleRun.current) return;

      const extension = imageTypeExtension(blob.type);
      const nextCleanFile = new File([blob], outputFileName(file.name, { suffix: '-clean', extension }), {
        type: blob.type,
      });

      setCleanFile(nextCleanFile);
    } catch (removeError) {
      if (run !== singleRun.current) return;
      setError(
        removeError instanceof Error
          ? removeError.message
          : 'Unable to remove metadata from the selected image.'
      );
    } finally {
      if (run === singleRun.current) setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!cleanFile) {
      return;
    }

    downloadBlob(cleanFile, cleanFile.name);
  };

  const handleClear = () => {
    singleRun.current += 1;
    setFile(null);
    setCleanFile(null);
    setSections([]);
    setError('');
    setProcessing(false);
    setOutputFormat('original');
    setCopiedField(null);
    singleIntake.reset();
  };

  const completedItems = batchItems.filter((item) => item.status === 'done');
  const totalOriginalSize = completedItems.reduce((acc, item) => acc + item.file.size, 0);
  const totalCleanedSize = completedItems.reduce((acc, item) => acc + (item.cleanedSize || 0), 0);
  const totalSavedBytes = totalOriginalSize - totalCleanedSize;
  const savingsPercent = totalOriginalSize > 0 ? (totalSavedBytes / totalOriginalSize) * 100 : 0;

  const metadataSummary = sections.flatMap((section) => section.fields);

  return (
    <div className="space-y-4 sm:space-y-6">
      <Tabs defaultValue="single" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto mb-4 sm:mb-6">
          <TabsTrigger value="single" className="flex items-center justify-center gap-2 py-3">
            <ImageIcon className="h-4 w-4" />
            Single Image
          </TabsTrigger>
          <TabsTrigger value="batch" className="flex items-center justify-center gap-2 py-3">
            <Archive className="h-4 w-4" />
            Batch Clean
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Image
              </CardTitle>
              <CardDescription>
                Inspect image metadata locally in your browser and optionally export a cleaned copy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FileDropzone
                intake={singleIntake}
                label="Drag & drop an image here or click to browse"
                hint="Files remain local on your machine"
                selected={
                  file && (
                    <>
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span>{`${file.name} (${formatBytes(file.size, SIZE_FORMAT)})`}</span>
                    </>
                  )
                }
              />

              {file && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-md border bg-card p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      File
                    </div>
                    <div className="mt-1 break-all font-semibold">{file.name}</div>
                  </div>
                  <div className="rounded-md border bg-card p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Type
                    </div>
                    <div className="mt-1 font-mono text-sm">{file.type || 'Unknown'}</div>
                  </div>
                  <div className="rounded-md border bg-card p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Size
                    </div>
                    <div className="mt-1 font-semibold">{formatBytes(file.size, SIZE_FORMAT)}</div>
                  </div>
                  <div className="rounded-md border bg-card p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      EXIF fields
                    </div>
                    <div className="mt-1 font-semibold">{metadataSummary.length}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {file && (
            <Card>
              <CardHeader>
                <CardTitle>Metadata Removal</CardTitle>
                <CardDescription>
                  Re-encode the image in the browser to remove embedded metadata.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label id={`${id}-format-label`} className="mb-2 block text-sm font-medium">Output format</label>
                  <Select
                    value={outputFormat}
                    onValueChange={(value) => setOutputFormat(value as OutputFormat)}
                  >
                    <SelectTrigger id={`${id}-format`} aria-labelledby={`${id}-format-label ${id}-format`}>
                      <SelectValue placeholder="Select output format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="original">Keep original format when supported</SelectItem>
                        <SelectItem value="jpeg">JPEG</SelectItem>
                        <SelectItem value="png">PNG</SelectItem>
                        <SelectItem value="webp">WebP</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  >
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={handleRemoveMetadata} disabled={processing}>
                    {processing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Removing metadata...
                      </>
                    ) : (
                      <>
                        <Shield className="mr-2 h-4 w-4" />
                        Remove metadata
                      </>
                    )}
                  </Button>
                  <Button onClick={handleDownload} disabled={!cleanFile} variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Download cleaned image
                  </Button>
                  <Button onClick={handleClear} variant="outline">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear
                  </Button>
                </div>

                {cleanFile && (
                  <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
                    Cleaned image ready: {cleanFile.name} ({formatBytes(cleanFile.size, SIZE_FORMAT)})
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {file && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Metadata Viewer
                </CardTitle>
                <CardDescription>
                  JPEG EXIF tags are shown when present. Other image formats may have little or no EXIF metadata.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {sections.length > 0 ? (
                  <div className="space-y-4">
                    {sections.map((section) => (
                      <div key={section.title} className="rounded-md border">
                        <div className="border-b px-4 py-3 font-medium">{section.title}</div>
                        <div className="divide-y">
                          {section.fields.map((field) => {
                            // Labels repeat across sections, so the section is part of the key.
                            const fieldKey = `${section.title}-${field.label}`;
                            const copied = copiedField === fieldKey && copyResult.isCopied;

                            return (
                              <div
                                key={fieldKey}
                                className="grid gap-2 px-4 py-3 sm:grid-cols-[180px_1fr_auto] sm:items-start"
                              >
                                <div className="text-sm font-medium">{field.label}</div>
                                <div className="break-all font-mono text-sm text-muted-foreground">
                                  {field.value}
                                </div>
                                <Button
                                  onClick={() => handleCopyField(field.value, fieldKey)}
                                  variant={copied ? 'default' : 'ghost'}
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label={copied ? `Copied ${field.label}` : `Copy ${field.label}`}
                                >
                                  {copied ? (
                                    <Check className="h-4 w-4" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed px-4 py-4 sm:py-8 text-center text-sm text-muted-foreground">
                    No EXIF fields were detected in this file, or the format does not expose EXIF data in this viewer.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {file && previewUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Preview
                </CardTitle>
                <CardDescription>Original image and optional cleaned export.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-medium">Original</p>
                    <img src={previewUrl} alt="Original upload" className="w-full rounded-md border" />
                  </div>
                  {cleanUrl && (
                    <div>
                      <p className="mb-2 text-sm font-medium">Cleaned</p>
                      <img src={cleanUrl} alt="Metadata removed" className="w-full rounded-md border" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="batch" className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Batch EXIF Remover
              </CardTitle>
              <CardDescription>
                Drag and drop multiple images to strip all EXIF metadata concurrently and download them in a single ZIP archive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FileDropzone
                intake={batchIntake}
                label="Drop images here or click to browse"
                hint="Supports JPEG, PNG, and WebP formats"
              />

              {batchError && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {batchError}
                </div>
              )}

              {batchItems.length > 0 && (
                <div className="flex flex-col gap-4 p-4 rounded-lg border bg-card sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex-1 space-y-2 max-w-sm">
                    <label id={`${id}-batch-format-label`} className="text-sm font-medium">Batch Output Format</label>
                    <Select
                      value={batchOutputFormat}
                      onValueChange={(value) => setBatchOutputFormat(value as OutputFormat)}
                      disabled={batchProcessing}
                    >
                      <SelectTrigger
                        id={`${id}-batch-format`}
                        aria-labelledby={`${id}-batch-format-label ${id}-batch-format`}
                      >
                        <SelectValue placeholder="Select output format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="original">Keep original format</SelectItem>
                          <SelectItem value="jpeg">Convert to JPEG</SelectItem>
                          <SelectItem value="png">Convert to PNG</SelectItem>
                          <SelectItem value="webp">Convert to WebP</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleProcessBatch} disabled={batchProcessing || batchItems.length === 0}>
                      {batchProcessing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing Batch...
                        </>
                      ) : (
                        <>
                          <Shield className="mr-2 h-4 w-4" />
                          Clean & Download ZIP
                        </>
                      )}
                    </Button>
                    {batchZip && (
                      <Button
                        variant="outline"
                        onClick={() => downloadBlob(batchZip, `cleaned_images_${Date.now()}.zip`)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download ZIP Again ({formatBytes(batchZip.size, SIZE_FORMAT)})
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={handleClearBatch}
                      disabled={batchProcessing}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear All
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {batchItems.length > 0 && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">Selected Files ({batchItems.length})</CardTitle>
                  <CardDescription>Images to be stripped of metadata</CardDescription>
                </div>
                {completedItems.length > 0 && (
                  <Badge variant="secondary" className="font-semibold text-sm px-3 py-1">
                    Processed {completedItems.length}/{batchItems.length}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {completedItems.length > 0 && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 p-4 rounded-lg bg-green-500/5 dark:bg-green-500/10 border border-green-500/20 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs font-semibold uppercase">Total Original Size</div>
                      <div className="font-bold text-base mt-0.5">{formatBytes(batchItems.reduce((acc, item) => acc + item.file.size, 0), SIZE_FORMAT)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs font-semibold uppercase">Cleaned Size</div>
                      <div className="font-bold text-base mt-0.5">
                        {totalCleanedSize > 0 ? formatBytes(totalCleanedSize, SIZE_FORMAT) : 'Processing...'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs font-semibold uppercase">Data Saved</div>
                      <div className="font-bold text-base mt-0.5 text-green-600 dark:text-green-400">
                        {totalSavedBytes > 0 ? (
                          <>
                            {formatBytes(totalSavedBytes, SIZE_FORMAT)} ({savingsPercent.toFixed(1)}%)
                          </>
                        ) : (
                          '0 B (0%)'
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left font-medium text-muted-foreground">
                        <th className="p-3">File Name</th>
                        <th className="p-3">Original Size</th>
                        <th className="p-3">Output Type</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {batchItems.map((item) => {
                        const targetFormat = batchOutputFormat === 'original'
                          ? (item.file.type === 'image/jpeg' ? 'JPEG' : item.file.type === 'image/png' ? 'PNG' : item.file.type === 'image/webp' ? 'WebP' : 'PNG')
                          : batchOutputFormat.toUpperCase();

                        return (
                          <tr key={item.id} className="hover:bg-muted/30">
                            <td className="p-3 font-medium max-w-[200px] sm:max-w-xs truncate" title={item.file.name}>
                              <div className="flex items-center gap-2">
                                <FileImage className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span className="truncate">{item.file.name}</span>
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground font-mono">{formatBytes(item.file.size, SIZE_FORMAT)}</td>
                            <td className="p-3 text-muted-foreground font-mono text-xs">{targetFormat}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {getStatusBadge(item.status, item.error)}
                                {item.status === 'done' && item.cleanedSize !== undefined && (
                                  <span className="text-xs text-muted-foreground font-mono">
                                    {formatBytes(item.cleanedSize, SIZE_FORMAT)}
                                  </span>
                                )}
                                {item.status === 'error' && item.error && (
                                  <span className="text-xs text-destructive">{item.error}</span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                disabled={batchProcessing}
                                onClick={() => handleRemoveBatchItem(item.id)}
                                aria-label={`Remove ${item.file.name}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );

}
