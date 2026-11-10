'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Download,
  FileImage,
  ImageIcon,
  Info,
  Trash2,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { FileDropzone } from '@/components/FileDropzone';
import { CopyButton } from '@/components/CopyButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useFileIntake } from '@/hooks/useFileIntake';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { downloadBlob, formatBytes, readFileAsArrayBuffer } from '@/lib/files';
import {
  analyzeImage,
  buildDataUrl,
  dataUrlMimeFor,
  downloadFileName,
  encodeBase64,
  hexPreview,
  parseImageInput,
} from '@/lib/tools/base64-image';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// A 24 x 16 PNG that is labelled as a JPEG, to show that the real type is detected.
const EXAMPLE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAIAAACDRijCAAACvklEQVR4nAXBoQqFMABAUT/MuLZoW1xbtC0YVkReEDEoWBaEGYQZLAaDwWCwGAyG+zHvnMSmFCkupUz5pdQpbUqXMqT4lDFlSplTlpQ1ZUvZU46UM+VKuVOelDflS0msoBA4QSn4CWpBK+gEg8ALRsEkmAWLYBVsgl1wCE7BJbgFj+AVfILESgqJk5SSn6SWtJJOMki8ZJRMklmySFbJJtklh+SUXJJb8kheySdJbEaR4TLKjF9GndFmdBlDhs8YM6aMOWPJWDO2jD3jyDgzrow748l4M76MxCoKhVOUip+iVrSKTjEovGJUTIpZsShWxabYFYfiVFyKW/EoXsWnSKym0DhNqflpak2r6TSDxmtGzaSZNYtm1WyaXXNoTs2luTWP5tV8msQaCoMzlIafoTa0hs4wGLxhNEyG2bAYVsNm2A2H4TRchtvwGF7DZ0hsTpHjcsqcX06d0+Z0OUOOzxlzppw5Z8lZc7acPefIOXOunDvnyXlzvpzEWgqLs5SWn6W2tJbOMli8ZbRMltmyWFbLZtkth+W0XJbb8lhey2dJrKNwOEfp+DlqR+voHIPDO0bH5Jgdi2N1bI7dcThOx+W4HY/jdXyOxFYUFa6irPhV1BVtRVcxVPiKsWKqmCuWirViq9grjoqz4qq4K56Kt+KrSGxD0eAayoZfQ93QNnQNQ4NvGBumhrlhaVgbtoa94Wg4G66Gu+FpeBu+hsT2FD2up+z59dQ9bU/XM/T4nrFn6pl7lp61Z+vZe46es+fquXuenrfn60msp/A4T+n5eWpP6+k8g8d7Rs/kmT2LZ/Vsnt1zeE7P5bk9j+f1fJ7EBoqAC5SBX6AOtIEuMAR8YAxMgTmwBNbAFtgDR+AMXIE78ATewBdIbKSIuEgZ+UXqSBvpIkPER8bIFJkjS2SNbJE9ckTOyBW5I0/kjXyRP7Ca9N9d8tG2AAAAAElFTkSuQmCC';
const EXAMPLE_DATA_URL = `data:image/jpeg;base64,${EXAMPLE_PNG}`;

interface Encoded {
  fileName: string;
  size: number;
  mime: string;
  base64: string;
  dataUrl: string;
  file: File;
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-card p-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-mono text-sm font-semibold">{value}</dd>
    </div>
  );
}

function DecodePanel() {
  const [input, setInput] = useState('');
  const [loaded, setLoaded] = useState<{ url: string; width: number; height: number } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const deferred = useDeferredValue(input);
  const parsed = useMemo(() => (deferred.trim() === '' ? null : parseImageInput(deferred)), [deferred]);
  const analysis = useMemo(
    () => (parsed?.ok ? analyzeImage(parsed.bytes, parsed.declaredMime) : null),
    [parsed]
  );
  const blob = useMemo(
    () =>
      parsed?.ok && analysis?.type
        ? new Blob([parsed.bytes as BlobPart], { type: analysis.type.mime })
        : null,
    [parsed, analysis]
  );
  const previewUrl = useObjectUrl(blob);
  const correctedDataUrl = useMemo(
    () =>
      parsed?.ok && analysis?.type ? buildDataUrl(analysis.type.mime, encodeBase64(parsed.bytes)) : '',
    [parsed, analysis]
  );

  const dimensions = loaded && loaded.url === previewUrl ? loaded : null;
  const previewFailed = previewUrl !== null && failedUrl === previewUrl;

  const handleDownload = () => {
    if (!parsed?.ok || !analysis?.type) return;
    try {
      downloadBlob(new Blob([parsed.bytes as BlobPart], { type: analysis.type.mime }), downloadFileName(analysis.type));
      toast.success('Image downloaded');
    } catch {
      toast.error('Could not download the image');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          Decode a Base64 image
        </CardTitle>
        <CardDescription>
          Paste a data URL or plain Base64. The image type is read from the data itself, so a missing or
          wrong label does not matter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="data:image/png;base64,iVBORw0KGgo... or just iVBORw0KGgo..."
          aria-label="Base64 or data URL input"
          rows={8}
          spellCheck={false}
          className="bg-background font-mono text-xs sm:text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setInput(EXAMPLE_DATA_URL)}>
            <Wand2 className="mr-2 h-4 w-4" />
            Load example
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setInput('')} disabled={input === ''}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>

        {!parsed && (
          <div className="flex items-start gap-2 rounded-md border border-dashed px-4 py-4 text-sm text-muted-foreground sm:py-8">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Paste Base64 text above to see the image.</span>
          </div>
        )}

        {parsed && !parsed.ok && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{parsed.error}</span>
          </div>
        )}

        {parsed?.ok && analysis && (
          <div className="space-y-4">
            {parsed.notes.length > 0 && (
              <ul aria-label="What was fixed" className="space-y-1 text-sm text-muted-foreground">
                {parsed.notes.map((note) => (
                  <li key={note} className="flex items-start gap-1.5">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            )}

            {!analysis.type && (
              <div role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="flex items-start gap-1.5 text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    The data was decoded ({formatBytes(parsed.bytes.length)}), but it is not a PNG, JPEG,
                    GIF, WebP, SVG, BMP, ICO or AVIF image.
                  </span>
                </p>
                <p className="pl-5.5 font-mono text-xs text-muted-foreground">
                  First bytes: {hexPreview(parsed.bytes) || '(none)'}
                </p>
              </div>
            )}

            {analysis.type && analysis.mismatch && (
              <div role="status" className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  The data URL says <span className="font-mono">{analysis.declaredMime}</span>, but the data is
                  a {analysis.type.label} image. The real type is used for the preview and the download.
                </span>
              </div>
            )}

            {analysis.type && (
              <>
                <div className="flex min-h-32 items-center justify-center overflow-auto rounded-md border bg-muted/40 p-3 sm:p-4">
                  {previewFailed ? (
                    <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      The browser could not display this {analysis.type.label} image. The file may be damaged.
                    </p>
                  ) : previewUrl ? (
                    // The image is rendered through <img> only, so an SVG cannot run scripts.
                    <img
                      key={previewUrl}
                      src={previewUrl}
                      alt="Decoded image preview"
                      onLoad={(event) =>
                        setLoaded({
                          url: previewUrl,
                          width: event.currentTarget.naturalWidth,
                          height: event.currentTarget.naturalHeight,
                        })
                      }
                      onError={() => setFailedUrl(previewUrl)}
                      className="h-auto max-w-full"
                    />
                  ) : null}
                </div>

                <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <FieldRow label="Type" value={analysis.type.label} />
                  <FieldRow label="MIME type" value={analysis.type.mime} />
                  <FieldRow
                    label="Dimensions"
                    value={
                      dimensions && dimensions.width > 0 && dimensions.height > 0
                        ? `${dimensions.width} x ${dimensions.height} px`
                        : previewFailed
                          ? 'Unknown'
                          : analysis.type.kind === 'svg' && dimensions
                            ? 'Scalable'
                            : '...'
                    }
                  />
                  <FieldRow
                    label="Size"
                    value={
                      parsed.bytes.length < 1024
                        ? formatBytes(parsed.bytes.length)
                        : `${formatBytes(parsed.bytes.length)} (${parsed.bytes.length.toLocaleString('en-US')} bytes)`
                    }
                  />
                </dl>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Download .{analysis.type.extension}
                  </Button>
                  <CopyButton
                    text={correctedDataUrl}
                    label="Copy data URL"
                    errorLabel="Copy failed, try again"
                    type="button"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EncodePanel() {
  const [encoded, setEncoded] = useState<Encoded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const previewUrl = useObjectUrl(encoded?.file);

  const intake = useFileIntake({
    accept: 'image/*,.svg,.avif,.ico',
    maxSize: MAX_UPLOAD_BYTES,
    onFiles: async ([file]) => {
      setBusy(true);
      setError(null);
      try {
        const bytes = new Uint8Array(await readFileAsArrayBuffer(file));
        const mime = dataUrlMimeFor(bytes, file.type);
        const base64 = encodeBase64(bytes);
        setEncoded({
          fileName: file.name,
          size: file.size,
          mime,
          base64,
          dataUrl: buildDataUrl(mime, base64),
          file,
        });
      } catch {
        setEncoded(null);
        setError('Could not read that file.');
      } finally {
        setBusy(false);
      }
    },
  });

  const handleClear = () => {
    setEncoded(null);
    setError(null);
    intake.reset();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileImage className="h-5 w-5 text-primary" />
          Encode an image to Base64
        </CardTitle>
        <CardDescription>
          Pick an image to get its data URL and Base64 text. The file never leaves your browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FileDropzone
          intake={intake}
          label="Drag & drop an image here or click to browse"
          hint={`PNG, JPEG, GIF, WebP, SVG, BMP, ICO or AVIF, up to ${formatBytes(MAX_UPLOAD_BYTES)}`}
          selected={
            encoded && (
              <>
                <FileImage className="h-3.5 w-3.5" />
                {encoded.fileName} ({formatBytes(encoded.size)})
              </>
            )
          }
        />

        {busy && <p role="status" className="text-sm text-muted-foreground">Reading the image...</p>}
        {error && (
          <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {encoded && (
          <div className="space-y-4">
            {previewUrl && (
              <div className="flex min-h-24 items-center justify-center overflow-auto rounded-md border bg-muted/40 p-3 sm:p-4">
                <img src={previewUrl} alt="Selected image preview" className="h-auto max-h-48 max-w-full" />
              </div>
            )}

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FieldRow label="MIME type" value={encoded.mime} />
              <FieldRow label="File size" value={formatBytes(encoded.size)} />
              <FieldRow label="Base64 length" value={`${encoded.base64.length.toLocaleString('en-US')} characters`} />
            </dl>

            <div className="space-y-2">
              <label htmlFor="b64img-dataurl" className="text-sm font-medium">
                Data URL
              </label>
              <Textarea
                id="b64img-dataurl"
                readOnly
                value={encoded.dataUrl}
                rows={4}
                spellCheck={false}
                className="cursor-text bg-muted/30 font-mono text-xs"
              />
              <CopyButton
                text={encoded.dataUrl}
                label="Copy data URL"
                errorLabel="Copy failed, try again"
                type="button"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="b64img-base64" className="text-sm font-medium">
                Base64 only
              </label>
              <Textarea
                id="b64img-base64"
                readOnly
                value={encoded.base64}
                rows={4}
                spellCheck={false}
                className="cursor-text bg-muted/30 font-mono text-xs"
              />
              <CopyButton
                text={encoded.base64}
                label="Copy Base64"
                errorLabel="Copy failed, try again"
                type="button"
              />
            </div>
          </div>
        )}

        <Button type="button" variant="outline" size="sm" onClick={handleClear} disabled={!encoded && !error}>
          <Trash2 className="mr-2 h-4 w-4" />
          Clear
        </Button>
      </CardContent>
    </Card>
  );
}

export function Base64ImageDecoder() {
  return (
    <Tabs defaultValue="decode" className="space-y-2">
      <TabsList className="h-auto">
        <TabsTrigger value="decode" className="py-1.5">
          Base64 to image
        </TabsTrigger>
        <TabsTrigger value="encode" className="py-1.5">
          Image to Base64
        </TabsTrigger>
      </TabsList>
      <TabsContent value="decode">
        <DecodePanel />
      </TabsContent>
      <TabsContent value="encode">
        <EncodePanel />
      </TabsContent>
    </Tabs>
  );
}
