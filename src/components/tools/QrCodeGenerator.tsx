'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Loader2, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ColorPicker } from '@/components/ui/color-picker';
import { useActionButton, useCopyToClipboard } from '@/hooks';
import { downloadDataUrl, downloadText, readImageDimensions } from '@/lib/files';
import {
  prepareQrRequest,
  QR_MARGIN_MAX,
  QR_SIZE_MAX,
  QR_SIZE_MIN,
  type QrErrorCorrectionLevel,
  type QrForm,
} from '@/lib/tools/qr-code-generator';

type GeneratedQr = {
  pngDataUrl: string;
  svgMarkup: string;
  width: number;
  fileBaseName: string;
  /** The form this code was made from, to tell when the preview is out of date. */
  formKey: string;
};

const ERROR_CORRECTION_OPTIONS: Array<{
  value: QrErrorCorrectionLevel;
  label: string;
  description: string;
}> = [
  { value: 'L', label: 'Low (L)', description: '~7% recovery' },
  { value: 'M', label: 'Medium (M)', description: '~15% recovery' },
  { value: 'Q', label: 'Quartile (Q)', description: '~25% recovery' },
  { value: 'H', label: 'High (H)', description: '~30% recovery' },
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formKeyOf(form: QrForm): string {
  return JSON.stringify([
    form.content.trim(),
    form.size,
    form.margin,
    form.foregroundColor,
    form.backgroundColor,
    form.errorCorrectionLevel,
  ]);
}

export function QrCodeGenerator() {
  const [content, setContent] = useState('https://lazytools.dev');
  const [size, setSize] = useState('320');
  const [margin, setMargin] = useState('2');
  const [foregroundColor, setForegroundColor] = useState('#111827');
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF');
  const [errorCorrectionLevel, setErrorCorrectionLevel] =
    useState<QrErrorCorrectionLevel>('M');
  const [generated, setGenerated] = useState<GeneratedQr | null>(null);
  const [error, setError] = useState('');

  const { executeAction, isLoading } = useActionButton();
  const copy = useCopyToClipboard();

  // Each run takes a number; a result is only shown while its number is still the latest.
  const runId = useRef(0);
  useEffect(
    () => () => {
      runId.current += 1;
    },
    []
  );

  const form: QrForm = {
    content,
    size,
    margin,
    foregroundColor,
    backgroundColor,
    errorCorrectionLevel,
  };
  const isOutdated = generated !== null && generated.formKey !== formKeyOf(form);

  const generateQrCode = async () => {
    const id = ++runId.current;
    const formKey = formKeyOf(form);
    const prepared = prepareQrRequest(form);

    setError('');

    if (!prepared.ok) {
      setGenerated(null);
      setError(prepared.error);
      return;
    }

    const { text, options, fileBaseName } = prepared.request;

    try {
      const QRCode = await import('qrcode');
      const [pngDataUrl, svgMarkup] = await Promise.all([
        QRCode.toDataURL(text, options),
        QRCode.toString(text, { ...options, type: 'svg' }),
      ]);

      // The library draws larger than asked when the content needs more modules
      // than the size has pixels, so the size shown is the one the PNG really has.
      const { width } = await readImageDimensions(pngDataUrl).catch(() => ({ width: options.width }));

      if (id !== runId.current) return;
      setGenerated({
        pngDataUrl,
        svgMarkup,
        width,
        fileBaseName,
        formKey,
      });
    } catch (generationError) {
      if (id !== runId.current) return;
      setGenerated(null);
      setError(
        generationError instanceof Error
          ? generationError.message
          : 'Failed to generate QR code.'
      );
    }
  };

  const handleGenerate = async () => {
    await executeAction(generateQrCode);
  };

  const handleClear = () => {
    // A code still being drawn belongs to the form that is being cleared.
    runId.current += 1;
    setContent('');
    setSize('320');
    setMargin('2');
    setForegroundColor('#111827');
    setBackgroundColor('#FFFFFF');
    setErrorCorrectionLevel('M');
    setGenerated(null);
    setError('');
  };

  const handleDownloadPng = () => {
    if (!generated) {
      return;
    }

    downloadDataUrl(generated.pngDataUrl, `${generated.fileBaseName}.png`);
  };

  const handleDownloadSvg = () => {
    if (!generated) {
      return;
    }

    downloadText(generated.svgMarkup, `${generated.fileBaseName}.svg`, 'image/svg+xml');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>QR Code Generator</CardTitle>
          <CardDescription>
            Generate browser-side QR codes for text, URLs, contact details, or any short payload.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="qr-content" className="text-sm font-medium">
              Content
            </label>
            <Textarea
              id="qr-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Enter text or paste a URL..."
              rows={5}
              className="font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <label htmlFor="qr-size" className="text-sm font-medium">
                Size (px)
              </label>
              <Input
                id="qr-size"
                type="number"
                min={QR_SIZE_MIN}
                max={QR_SIZE_MAX}
                step="32"
                value={size}
                onChange={(event) => setSize(event.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="qr-margin" className="text-sm font-medium">
                Margin
              </label>
              <Input
                id="qr-margin"
                type="number"
                min="0"
                max={QR_MARGIN_MAX}
                step="1"
                value={margin}
                onChange={(event) => setMargin(event.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="qr-error-correction" className="text-sm font-medium">
                Error correction
              </label>
              <Select
                value={errorCorrectionLevel}
                onValueChange={(value) =>
                  setErrorCorrectionLevel(value as QrErrorCorrectionLevel)
                }
              >
                <SelectTrigger id="qr-error-correction">
                  <SelectValue placeholder="Choose level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ERROR_CORRECTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {
                  ERROR_CORRECTION_OPTIONS.find(
                    (option) => option.value === errorCorrectionLevel
                  )?.description
                }
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">Colors</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Foreground</span>
                  <ColorPicker
                    label="Foreground"
                    value={foregroundColor}
                    onChange={setForegroundColor}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Background</span>
                  <ColorPicker
                    label="Background"
                    value={backgroundColor}
                    onChange={setBackgroundColor}
                  />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerate} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
            <Button onClick={handleClear} variant="outline">
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
            <Button
              onClick={() => copy.copyToClipboard(content.trim())}
              variant={copy.isCopied ? 'default' : 'outline'}
              disabled={!content.trim()}
            >
              {copy.isCopied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy content
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            {generated
              ? isOutdated
                ? 'The content or settings changed after this code was generated. Generate again to update it.'
                : `Ready at ${formatNumber(generated.width)} × ${formatNumber(
                    generated.width
                  )} pixels`
              : 'Generate a QR code to preview and download it.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {generated ? (
            <>
              <div className="flex justify-center rounded-xl border bg-muted/20 p-4 sm:p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={generated.pngDataUrl}
                  alt="Generated QR code"
                  className="h-auto max-w-full rounded-md border bg-white"
                  style={{ width: Math.min(generated.width, 360) }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleDownloadPng}>
                  <Download className="mr-2 h-4 w-4" />
                  Download PNG
                </Button>
                <Button onClick={handleDownloadSvg} variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Download SVG
                </Button>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-dashed px-4 py-6 sm:py-10 text-center text-sm text-muted-foreground">
              <QrCode className="mx-auto mb-3 h-10 w-10 opacity-50" />
              No QR code generated yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          QR codes are generated locally in your browser. For best scanner compatibility, keep strong contrast, a light background, and enough margin around the code.
        </CardContent>
      </Card>
    </div>
  );
}
