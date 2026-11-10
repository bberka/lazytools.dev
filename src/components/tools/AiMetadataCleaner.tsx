'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Archive, Download, FileImage, Image as ImageIcon, ShieldCheck, Trash2, Type, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/CopyButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, formatBytes, outputFileName, readFileAsArrayBuffer, type FormatBytesOptions } from '@/lib/files';
import { IMAGE_MIME_TYPES, stripImageMetadata, type StripResult } from '@/lib/tools/ai-image-metadata';
import {
  DEFAULT_TEXT_OPTIONS,
  TEXT_CATEGORIES,
  TEXT_CATEGORY_INFO,
  cleanAiText,
  type TextCategory,
  type TextCleanOptions,
} from '@/lib/tools/ai-metadata-cleaner';
import { uniqueFileNames } from '@/lib/tools/exif-viewer-remover';

const SIZE_FORMAT: FormatBytesOptions = { fixed: true, byteUnit: 'B', decimals: { KB: 1 } };

interface ImageItem {
  id: string;
  file: File;
  /** Null while the file is being read. */
  result: StripResult | null;
  error?: string;
}

const cleanedBlob = (result: StripResult, file: File): Blob =>
  new Blob([result.bytes as BlobPart], { type: result.format ? IMAGE_MIME_TYPES[result.format] : file.type });

const cleanedName = (file: File) => outputFileName(file.name, { suffix: '-clean' });

// Images

function ImageResult({ item, onRemove }: { item: ImageItem; onRemove: () => void }) {
  const { file, result } = item;
  const failed = item.error !== undefined || (result !== null && !result.changed && !result.verified);

  return (
    <li className="space-y-3 rounded-lg border bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <FileImage className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{file.name}</span>
          </p>
          {result && (
            <p className="text-xs text-muted-foreground">
              {formatBytes(result.originalSize, SIZE_FORMAT)}
              {result.changed && (
                <>
                  {' → '}
                  {formatBytes(result.cleanedSize, SIZE_FORMAT)} (saved{' '}
                  {formatBytes(result.originalSize - result.cleanedSize, SIZE_FORMAT)})
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!result && !item.error && <Badge variant="secondary">Reading</Badge>}
          {failed && <Badge variant="destructive">Not cleaned</Badge>}
          {result?.changed && <Badge>Cleaned</Badge>}
          {result?.changed && result.verified && (
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              Re-scan clean
            </Badge>
          )}
          {result && !result.changed && result.verified && <Badge variant="outline">Nothing found</Badge>}
          {result?.changed && (
            <Button size="sm" variant="outline" onClick={() => downloadBlob(cleanedBlob(result, file), cleanedName(file))}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onRemove} aria-label={`Remove ${file.name}`}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {(item.error || (result && failed)) && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {item.error ?? result?.message}
        </p>
      )}

      {result && result.signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="AI markers found">
          {result.signals.map((signal) => (
            <Badge key={signal} variant="destructive">
              {signal}
            </Badge>
          ))}
        </div>
      )}

      {result && result.removed.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold">Removed</p>
          <ul className="space-y-1.5">
            {result.removed.map((finding, index) => (
              <li key={`${finding.location}-${index}`} className="rounded-md border bg-background p-2 text-xs">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{finding.category}</span>
                  <span className="text-muted-foreground">{finding.location}</span>
                  <span className="text-muted-foreground">{formatBytes(finding.size, SIZE_FORMAT)}</span>
                </div>
                {finding.preview && (
                  <p className="mt-1 break-words font-mono text-muted-foreground">{finding.preview}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && result.kept.length > 0 && (
        <p className="text-xs text-muted-foreground">Kept: {result.kept.join(', ')}.</p>
      )}
      {result?.warnings.map((warning) => (
        <p key={warning} className="text-xs text-muted-foreground">
          {warning}
        </p>
      ))}
      {result && !failed && !result.changed && (
        <p className="text-xs text-muted-foreground">{result.message}</p>
      )}
    </li>
  );
}

function ImageCleaner() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState('');
  const nextId = useRef(0);

  const update = (id: string, patch: Partial<ImageItem>) =>
    setItems((previous) => previous.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const addFiles = (files: File[]) => {
    setZipError('');
    const added = files.map((file): ImageItem => {
      nextId.current += 1;
      return { id: `image-${nextId.current}`, file, result: null };
    });
    setItems((previous) => [...previous, ...added]);

    for (const item of added) {
      readFileAsArrayBuffer(item.file).then(
        (buffer) => update(item.id, { result: stripImageMetadata(new Uint8Array(buffer)) }),
        () => update(item.id, { error: 'The file could not be read.' })
      );
    }
  };

  const intake = useFileIntake({ accept: 'image/jpeg,image/png,image/webp', multiple: true, onFiles: addFiles });

  const cleaned = items.filter((item) => item.result?.changed);
  const totalSaved = cleaned.reduce((sum, item) => sum + (item.result ? item.result.originalSize - item.result.cleanedSize : 0), 0);

  const handleDownloadAll = async () => {
    setZipping(true);
    setZipError('');
    try {
      const { default: JSZip } = await import('jszip');
      const names = uniqueFileNames(cleaned.map((item) => cleanedName(item.file)));
      const zip = new JSZip();
      cleaned.forEach((item, index) => {
        if (item.result) zip.file(names[index], cleanedBlob(item.result, item.file));
      });
      downloadBlob(await zip.generateAsync({ type: 'blob' }), 'cleaned-images.zip');
    } catch {
      setZipError('The ZIP archive could not be created.');
    } finally {
      setZipping(false);
    }
  };

  const handleClear = () => {
    setItems([]);
    setZipError('');
    intake.reset();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Images
          </CardTitle>
          <CardDescription>
            Finds and cuts out AI provenance metadata (EXIF, XMP, C2PA Content Credentials, IPTC, comments, PNG
            text chunks) without re-encoding. Pixels and colour profiles stay exactly as they were.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileDropzone
            intake={intake}
            label="Drag & drop JPEG, PNG or WebP images or click to browse"
            hint="You can add several at once. Files remain local on your machine"
          />
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {items.length} {items.length === 1 ? 'image' : 'images'}
            </CardTitle>
            <CardDescription>
              {cleaned.length > 0
                ? `${cleaned.length} cleaned, ${formatBytes(totalSaved, SIZE_FORMAT)} removed in total.`
                : 'Nothing has been cleaned yet.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleDownloadAll} disabled={cleaned.length === 0 || zipping} size="sm">
                <Archive className="mr-2 h-4 w-4" />
                {zipping ? 'Creating ZIP…' : `Download all cleaned (${cleaned.length})`}
              </Button>
              <Button onClick={handleClear} variant="outline" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>
            {zipError && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {zipError}
              </p>
            )}
            <ul className="space-y-3">
              {items.map((item) => (
                <ImageResult
                  key={item.id}
                  item={item}
                  onRemove={() => setItems((previous) => previous.filter((other) => other.id !== item.id))}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Text

function TextCleaner() {
  const id = useId();
  const [text, setText] = useState('');
  const [options, setOptions] = useState<TextCleanOptions>(DEFAULT_TEXT_OPTIONS);
  const result = useMemo(() => cleanAiText(text, options), [text, options]);

  const setOption = (category: TextCategory, enabled: boolean) =>
    setOptions((previous) => ({ ...previous, [category]: enabled }));

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            AI-generated Text
          </CardTitle>
          <CardDescription>
            Paste text to remove invisible watermark-style characters and chat tracking parameters. It never leaves
            your browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste text here..."
            aria-label="Text to clean"
            rows={6}
            spellCheck={false}
            className="font-mono text-sm"
          />
          <ul aria-label="Cleanup categories" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TEXT_CATEGORIES.map((category) => {
              const info = TEXT_CATEGORY_INFO[category];
              const count = result.found[category];
              return (
                <li key={category} className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                  <Switch
                    id={`${id}-${category}`}
                    checked={options[category]}
                    onCheckedChange={(checked) => setOption(category, checked)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`${id}-${category}`} className="block cursor-pointer text-sm font-medium">
                      {info.label}
                    </label>
                    <p className="text-xs text-muted-foreground">{info.description}</p>
                  </div>
                  <Badge variant={count > 0 ? 'default' : 'outline'} className="shrink-0">
                    {count} found
                  </Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cleaned text</CardTitle>
          <CardDescription role="status">
            {text === ''
              ? 'Paste some text above to see the result.'
              : result.total === 0
                ? 'Nothing to change with the selected options.'
                : `${result.total} ${result.total === 1 ? 'change' : 'changes'} applied.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            readOnly
            value={result.text}
            aria-label="Cleaned text"
            rows={6}
            spellCheck={false}
            className="bg-muted/30 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={result.text} label="Copy" disabled={!result.text} size="sm" />
            <Button onClick={() => setText('')} disabled={!text} size="sm" variant="outline">
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AiMetadataCleaner() {
  return (
    <Tabs defaultValue="images" className="w-full">
      <TabsList className="mb-4 grid h-auto w-full grid-cols-2 sm:mb-6">
        <TabsTrigger value="images" className="flex items-center justify-center gap-2 py-3">
          <ImageIcon className="h-4 w-4" />
          Images
        </TabsTrigger>
        <TabsTrigger value="text" className="flex items-center justify-center gap-2 py-3">
          <Type className="h-4 w-4" />
          Text
        </TabsTrigger>
      </TabsList>
      <TabsContent value="images">
        <ImageCleaner />
      </TabsContent>
      <TabsContent value="text">
        <TextCleaner />
      </TabsContent>
    </Tabs>
  );
}
