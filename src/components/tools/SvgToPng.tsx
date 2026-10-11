'use client';

import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Download, Trash2, Code, FileImage } from 'lucide-react';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadDataUrl, formatBytes, loadImage, readFileAsText } from '@/lib/files';
import { MAX_SCALE, MIN_SCALE, clampScale, prepareSvg, rasterSize } from '@/lib/tools/svg-to-png';

export function SvgToPng() {
  const id = useId();
  const [svgCode, setSvgCode] = useState('');
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null);
  // The field keeps what was typed, so it can be emptied and retyped; the scale in use is always valid.
  const [scaleText, setScaleText] = useState('2');
  const scale = clampScale(scaleText);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Each file read and each conversion gets a number; one that is no longer the latest is dropped.
  const loadRef = useRef(0);
  const runRef = useRef(0);

  // New code makes the PNG on screen out of date, along with any conversion still running.
  const changeSource = (code: string) => {
    runRef.current += 1;
    setProcessing(false);
    setSvgCode(code);
    setPngDataUrl(null);
    setError('');
  };

  const loadSvgFile = async (file: File) => {
    loadRef.current += 1;
    const load = loadRef.current;

    let text: string;
    try {
      text = await readFileAsText(file);
    } catch {
      if (load === loadRef.current) toast.error('Failed to read file');
      return;
    }
    if (load !== loadRef.current) return;

    setOriginalFile(file);
    changeSource(text);
  };

  const intake = useFileIntake({
    accept: '.svg,image/svg+xml',
    onFiles: ([file]) => loadSvgFile(file),
  });

  const convertSvgToPng = async () => {
    const prepared = prepareSvg(svgCode);
    if (!prepared.ok) {
      setPngDataUrl(null);
      setError(prepared.error);
      return;
    }

    runRef.current += 1;
    const run = runRef.current;
    setProcessing(true);
    setError('');

    try {
      let img: HTMLImageElement;
      try {
        img = await loadImage(new Blob([prepared.markup], { type: 'image/svg+xml;charset=utf-8' }));
      } catch {
        throw new Error(
          'The SVG could not be rendered. Check that it is well-formed: every tag closed and every attribute value quoted.'
        );
      }
      if (run !== runRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) throw new Error('Canvas is not available in this browser.');

      const size = rasterSize(
        {
          width: img.naturalWidth || prepared.width,
          height: img.naturalHeight || prepared.height,
        },
        scale
      );
      canvas.width = size.width;
      canvas.height = size.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // A canvas the browser could not allocate yields an empty data URL instead of a PNG.
      const dataUrl = canvas.toDataURL('image/png');
      if (!dataUrl.startsWith('data:image/png')) {
        throw new Error(
          `A ${size.width}×${size.height}px PNG is too large for this browser. Try a smaller scale.`
        );
      }

      setPngDataUrl(dataUrl);
    } catch (cause) {
      if (run !== runRef.current) return;
      setPngDataUrl(null);
      setError(cause instanceof Error ? cause.message : 'The SVG could not be converted.');
    } finally {
      if (run === runRef.current) setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!pngDataUrl) return;
    downloadDataUrl(pngDataUrl, 'vector.png');
  };

  const handleClear = () => {
    loadRef.current += 1;
    changeSource('');
    setOriginalFile(null);
    intake.reset();
  };

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            SVG to PNG Converter
          </CardTitle>
          <CardDescription>Rasterize SVG code or files into high-resolution PNG images</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Upload SVG File</label>
            <FileDropzone
              intake={intake}
              label="Drag & drop an SVG file here or click to browse"
              hint="Files remain local on your machine"
              selected={
                originalFile && (
                  <>
                    <Code className="h-3.5 w-3.5" />
                    {originalFile.name} ({formatBytes(originalFile.size)})
                  </>
                )
              }
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={`${id}-code`} className="text-sm font-medium">Or Paste SVG Code</label>
            <Textarea
              id={`${id}-code`}
              value={svgCode}
              onChange={(e) => changeSource(e.target.value)}
              placeholder="<svg ...>...</svg>"
              className="font-mono min-h-[200px]"
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="space-y-2 flex-1">
              <label htmlFor={`${id}-scale`} className="text-sm font-medium">Resolution Scale: {scale}x</label>
              <Input
                id={`${id}-scale`}
                type="number"
                min={MIN_SCALE}
                max={MAX_SCALE}
                value={scaleText}
                onChange={(e) => setScaleText(e.target.value)}
                onBlur={() => setScaleText(String(scale))}
              />
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
            <Button onClick={convertSvgToPng} disabled={!svgCode.trim() || processing} className="flex-1">
              {processing ? 'Rasterizing...' : 'Convert to PNG'}
            </Button>
            <Button variant="outline" onClick={handleClear}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {pngDataUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileImage className="h-5 w-5" />
              Resulting PNG
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-md overflow-hidden bg-muted/50 p-4 flex justify-center">
              <img src={pngDataUrl} alt="Result" className="max-w-full h-auto shadow-sm" />
            </div>
            <Button onClick={handleDownload} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Download PNG
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
