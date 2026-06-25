'use client';

import { useState } from 'react';
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

type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

type GeneratedQr = {
  pngDataUrl: string;
  svgMarkup: string;
  width: number;
};

const ERROR_CORRECTION_OPTIONS: Array<{
  value: ErrorCorrectionLevel;
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

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getSafeFilename(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'qr-code';
}

export function QrCodeGenerator() {
  const [content, setContent] = useState('https://lazytools.dev');
  const [size, setSize] = useState('320');
  const [margin, setMargin] = useState('2');
  const [foregroundColor, setForegroundColor] = useState('#111827');
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF');
  const [errorCorrectionLevel, setErrorCorrectionLevel] =
    useState<ErrorCorrectionLevel>('M');
  const [generated, setGenerated] = useState<GeneratedQr | null>(null);
  const [error, setError] = useState('');

  const { executeAction, isLoading } = useActionButton();
  const copy = useCopyToClipboard();

  const generateQrCode = async () => {
    const trimmedContent = content.trim();
    const parsedSize = Number(size);
    const parsedMargin = Number(margin);

    setError('');

    if (!trimmedContent) {
      setGenerated(null);
      setError('Enter text or a URL to generate a QR code.');
      return;
    }

    if (!Number.isFinite(parsedSize) || parsedSize < 128 || parsedSize > 2048) {
      setGenerated(null);
      setError('Size must be between 128 and 2048 pixels.');
      return;
    }

    if (!Number.isFinite(parsedMargin) || parsedMargin < 0 || parsedMargin > 10) {
      setGenerated(null);
      setError('Margin must be between 0 and 10.');
      return;
    }

    try {
      const QRCode = await import('qrcode');
      const options = {
        errorCorrectionLevel,
        margin: parsedMargin,
        width: parsedSize,
        color: {
          dark: foregroundColor,
          light: backgroundColor,
        },
      };

      const [pngDataUrl, svgMarkup] = await Promise.all([
        QRCode.toDataURL(trimmedContent, options),
        QRCode.toString(trimmedContent, { ...options, type: 'svg' }),
      ]);

      setGenerated({
        pngDataUrl,
        svgMarkup,
        width: parsedSize,
      });
    } catch (generationError) {
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

    const link = document.createElement('a');
    link.href = generated.pngDataUrl;
    link.download = `${getSafeFilename(content)}.png`;
    link.click();
  };

  const handleDownloadSvg = () => {
    if (!generated) {
      return;
    }

    downloadBlob(
      `${getSafeFilename(content)}.svg`,
      new Blob([generated.svgMarkup], { type: 'image/svg+xml' })
    );
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
              onChange={(event) => setContent((event.target as HTMLTextAreaElement).value)}
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
                min="128"
                max="2048"
                step="32"
                value={size}
                onChange={(event) => setSize((event.target as HTMLInputElement).value)}
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
                max="10"
                step="1"
                value={margin}
                onChange={(event) => setMargin((event.target as HTMLInputElement).value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Error correction</label>
              <Select
                value={errorCorrectionLevel}
                onValueChange={(value) =>
                  setErrorCorrectionLevel(value as ErrorCorrectionLevel)
                }
              >
                <SelectTrigger>
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
              <label className="text-sm font-medium">Colors</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Foreground</span>
                  <ColorPicker
                    value={foregroundColor}
                    onChange={setForegroundColor}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Background</span>
                  <ColorPicker
                    value={backgroundColor}
                    onChange={setBackgroundColor}
                  />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
              ? `Ready at ${formatNumber(generated.width)} × ${formatNumber(
                  generated.width
                )} pixels`
              : 'Generate a QR code to preview and download it.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {generated ? (
            <>
              <div className="flex justify-center rounded-xl border bg-muted/20 p-6">
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
            <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              <QrCode className="mx-auto mb-3 h-10 w-10 opacity-50" />
              No QR code generated yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          QR codes are generated locally in your browser. For best scanner compatibility, keep strong contrast, a light background, and enough margin around the code.
        </CardContent>
      </Card>
    </div>
  );
}
