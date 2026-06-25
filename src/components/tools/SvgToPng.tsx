'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Image as ImageIcon, Download, Trash2, Code, FileImage, Upload } from 'lucide-react';

export function SvgToPng() {
  const [svgCode, setSvgCode] = useState('');
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(2);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const loadSvgFile = (file: File) => {
    if (!file) return;
    setOriginalFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setSvgCode(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadSvgFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === 'image/svg+xml' || file.name.endsWith('.svg'))) {
      loadSvgFile(file);
    }
  };

  const convertSvgToPng = () => {
    if (!svgCode) return;
    setProcessing(true);

    const svgBlob = new Blob([svgCode], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
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
      URL.revokeObjectURL(url);
    };

    img.onerror = () => {
      console.error('Failed to load SVG');
      setProcessing(false);
      URL.revokeObjectURL(url);
    };

    img.src = url;
  };

  const handleDownload = () => {
    if (!pngDataUrl) return;
    const link = document.createElement('a');
    link.href = pngDataUrl;
    link.download = 'vector.png';
    link.click();
  };

  const handleClear = () => {
    setSvgCode('');
    setPngDataUrl(null);
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
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-slate-50 dark:hover:bg-slate-900/40'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".svg"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm font-semibold">Drag & drop an SVG file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Files remain local on your machine</p>
              {originalFile && (
                <div className="mt-3 inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium border border-primary/20" onClick={(e) => e.stopPropagation()}>
                  <Code className="h-3.5 w-3.5" />
                  {originalFile.name} ({formatSize(originalFile.size)})
                </div>
              )}
            </div>
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
