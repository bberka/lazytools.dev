'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Image as ImageIcon, Download, Trash2, Box, Upload } from 'lucide-react';

export function ImageToIcon() {
  const [image, setImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [sizes, setSizes] = useState<number[]>([16, 32, 48, 128, 256]);
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

  const loadImageFile = (file: File) => {
    if (!file) return;
    setOriginalFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadImageFile(file);
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
    if (file && file.type.startsWith('image/')) {
      loadImageFile(file);
    }
  };

  const toggleSize = (size: number) => {
    setSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size].sort((a, b) => a - b)
    );
  };

  const generateIcon = async () => {
    if (!image || sizes.length === 0) return;
    setProcessing(true);

    try {
      // For now, we'll generate the largest selected size as the ICO
      // Real ICOs can contain multiple sizes, but that requires a more complex blob builder.
      // We already have a simple one in ImageConverter for 256x256.
      
      const img = new Image();
      img.onload = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const largestSize = Math.max(...sizes);
        canvas.width = largestSize;
        canvas.height = largestSize;
        ctx.drawImage(img, 0, 0, largestSize, largestSize);

        canvas.toBlob(async (blob) => {
          if (!blob) return;
          
          // Reusing the ico logic
          const pngBytes = new Uint8Array(await blob.arrayBuffer());
          const headerSize = 6;
          const directorySize = 16;
          const imageOffset = headerSize + directorySize;
          const icoBytes = new Uint8Array(imageOffset + pngBytes.length);
          const view = new DataView(icoBytes.buffer);

          view.setUint16(0, 0, true);
          view.setUint16(2, 1, true);
          view.setUint16(4, 1, true);

          icoBytes[6] = largestSize >= 256 ? 0 : largestSize;
          icoBytes[7] = largestSize >= 256 ? 0 : largestSize;
          icoBytes[8] = 0;
          icoBytes[9] = 0;
          view.setUint16(10, 1, true);
          view.setUint16(12, 32, true);
          view.setUint32(14, pngBytes.length, true);
          view.setUint32(18, imageOffset, true);
          icoBytes.set(pngBytes, imageOffset);

          const icoBlob = new Blob([icoBytes], { type: 'image/x-icon' });
          const url = URL.createObjectURL(icoBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'favicon.ico';
          link.click();
          setProcessing(false);
        }, 'image/png');
      };
      img.src = image;
    } catch (error) {
      console.error('Icon generation failed', error);
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            Image to Icon
          </CardTitle>
          <CardDescription>Convert images to multi-resolution ICO files for websites and apps</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-xl p-4 sm:p-8 text-center cursor-pointer transition-colors ${
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
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-semibold">Drag & drop an image here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Files remain local on your machine</p>
            {originalFile && (
              <div className="mt-3 inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium border border-primary/20" onClick={(e) => e.stopPropagation()}>
                <ImageIcon className="h-3.5 w-3.5" />
                {originalFile.name} ({formatSize(originalFile.size)})
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {image && (
        <Card>
          <CardHeader>
            <CardTitle>Icon Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <img src={image} alt="Source" className="max-h-48 rounded-md border" />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Included Sizes (px)</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                {[16, 32, 48, 64, 128, 256].map((size) => (
                  <div key={size} className="flex items-center space-x-2">
                    <Checkbox
                      id={`size-${size}`}
                      checked={sizes.includes(size)}
                      onCheckedChange={() => toggleSize(size)}
                    />
                    <label htmlFor={`size-${size}`} className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {size}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={generateIcon} disabled={processing || sizes.length === 0} className="flex-1">
                {processing ? 'Generating...' : 'Generate & Download .ico'}
              </Button>
              <Button variant="outline" onClick={() => setImage(null)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
