'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, Loader2, Trash2, Palette } from 'lucide-react';
import { FileDropzone } from '@/components/FileDropzone';
import { useCopyToClipboard } from '@/hooks';
import { useFileIntake } from '@/hooks/useFileIntake';
import { formatBytes, loadImage, readFileAsDataUrl } from '@/lib/files';
import { cn } from '@/lib/utils';
import { extractPalette } from '@/lib/tools/color-palette-extractor';

export function ColorPaletteExtractor() {
  const [image, setImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  // The swatch pressed last. The hook knows whether that copy worked and when to stop showing it.
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const copy = useCopyToClipboard();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Each chosen file gets a number; a file that is no longer the latest is dropped.
  const loadRef = useRef(0);

  const loadImageFile = async (file: File) => {
    loadRef.current += 1;
    const load = loadRef.current;

    let dataUrl: string;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch {
      if (load === loadRef.current) toast.error('Failed to read file');
      return;
    }
    if (load !== loadRef.current) return;

    setOriginalFile(file);
    setImage(null);
    setPalette([]);
    setCopiedColor(null);
    setError('');
    setProcessing(true);

    try {
      const img = await loadImage(dataUrl);
      if (load !== loadRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) throw new Error('Canvas is not available in this browser.');

      // Draw small version for faster processing
      const size = 100;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);

      setPalette(extractPalette(ctx.getImageData(0, 0, size, size).data));
      setImage(dataUrl);
    } catch (cause) {
      if (load !== loadRef.current) return;
      setError(cause instanceof Error ? cause.message : 'The colors could not be extracted.');
    } finally {
      if (load === loadRef.current) setProcessing(false);
    }
  };

  const intake = useFileIntake({ accept: 'image/*', onFiles: ([file]) => loadImageFile(file) });

  const handleCopy = (color: string) => {
    setCopiedColor(color);
    void copy.copyToClipboard(color);
  };

  const handleClear = () => {
    loadRef.current += 1;
    setImage(null);
    setOriginalFile(null);
    setPalette([]);
    setCopiedColor(null);
    setError('');
    setProcessing(false);
    intake.reset();
  };

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Color Palette Extractor
          </CardTitle>
          <CardDescription>Extract dominant colors from any image</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            intake={intake}
            label="Drag & drop an image here or click to browse"
            hint="Files remain local on your machine"
            selected={
              originalFile && (
                <>
                  <ImageIcon className="h-3.5 w-3.5" />
                  {originalFile.name} ({formatBytes(originalFile.size)})
                </>
              )
            }
          />
          {processing && (
            <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Extracting colors...
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {image && (
        <Card>
          <CardHeader>
            <CardTitle>Extraction Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            <div className="flex justify-center">
              <img src={image} alt="Source" className="max-h-64 rounded-md border" />
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Dominant Colors</h3>
              {palette.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No colors found: every part of this image is transparent.
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {palette.map((color) => {
                  const copied = copiedColor === color && copy.isCopied;

                  return (
                    <button
                      key={color}
                      type="button"
                      className="group relative cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      onClick={() => handleCopy(color)}
                      aria-label={copied ? `Copied ${color}` : `Copy ${color}`}
                    >
                      <span
                        className="block h-16 w-full rounded-md shadow-inner border"
                        style={{ backgroundColor: color }}
                      />
                      <span className="mt-1 block text-xs font-mono text-center">{color}</span>
                      <span
                        className={cn(
                          'absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity rounded-md',
                          copied
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                        )}
                      >
                        <span className="text-white text-[10px] font-bold">{copied ? 'Copied' : 'Copy'}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button variant="outline" onClick={handleClear} className="w-full">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Image
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
