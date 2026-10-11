'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Download, Trash2, Code, FileImage } from 'lucide-react';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadDataUrl, formatBytes, loadImage, readFileAsText } from '@/lib/files';

export function SvgToPng() {
  const [svgCode, setSvgCode] = useState('');
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(2);
  const [processing, setProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadSvgFile = (file: File) => {
    setOriginalFile(file);
    readFileAsText(file)
      .then(setSvgCode)
      .catch(() => toast.error('Failed to read file'));
  };

  const intake = useFileIntake({
    accept: '.svg,image/svg+xml',
    onFiles: ([file]) => loadSvgFile(file),
  });

  const convertSvgToPng = async () => {
    if (!svgCode) return;
    setProcessing(true);

    let img: HTMLImageElement;
    try {
      img = await loadImage(new Blob([svgCode], { type: 'image/svg+xml;charset=utf-8' }));
    } catch {
      console.error('Failed to load SVG');
      setProcessing(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    setPngDataUrl(canvas.toDataURL('image/png'));
    setProcessing(false);
  };

  const handleDownload = () => {
    if (!pngDataUrl) return;
    downloadDataUrl(pngDataUrl, 'vector.png');
  };

  const handleClear = () => {
    setSvgCode('');
    setPngDataUrl(null);
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
            <label className="text-sm font-medium">Or Paste SVG Code</label>
            <Textarea
              value={svgCode}
              onChange={(e) => setSvgCode(e.target.value)}
              placeholder="<svg ...>...</svg>"
              className="font-mono min-h-[200px]"
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="space-y-2 flex-1">
              <label className="text-sm font-medium">Resolution Scale: {scale}x</label>
              <Input
                type="number"
                min="1"
                max="10"
                value={scale}
                onChange={(e) => setScale(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={convertSvgToPng} disabled={!svgCode || processing} className="flex-1">
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
            <div className="border rounded-md overflow-hidden bg-slate-50 dark:bg-slate-900 p-4 flex justify-center">
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
