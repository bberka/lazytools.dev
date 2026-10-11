'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, Download, Trash2, Pipette, Palette } from 'lucide-react';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { formatBytes, readFileAsDataUrl } from '@/lib/files';

export function ColorPaletteExtractor() {
  const [image, setImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const extractPalette = (imageSrc: string) => {
    setProcessing(true);
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw small version for faster processing
      const size = 100;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);

      const imageData = ctx.getImageData(0, 0, size, size).data;
      const colorCounts: Record<string, number> = {};

      for (let i = 0; i < imageData.length; i += 4) {
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        const a = imageData[i + 3];

        if (a < 128) continue; // Skip transparent

        // Quantize colors slightly to group similar ones
        const qr = Math.round(r / 10) * 10;
        const qg = Math.round(g / 10) * 10;
        const qb = Math.round(b / 10) * 10;
        const hex = `#${((1 << 24) + (qr << 16) + (qg << 8) + qb).toString(16).slice(1)}`;
        colorCounts[hex] = (colorCounts[hex] || 0) + 1;
      }

      const sortedColors = Object.entries(colorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([color]) => color);

      setPalette(sortedColors);
      setProcessing(false);
    };
    img.src = imageSrc;
  };

  const loadImageFile = async (file: File) => {
    setOriginalFile(file);

    let dataUrl: string;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch {
      toast.error('Failed to read file');
      return;
    }

    setImage(dataUrl);
    extractPalette(dataUrl);
  };

  const intake = useFileIntake({ accept: 'image/*', onFiles: ([file]) => loadImageFile(file) });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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
        <CardContent>
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
        </CardContent>
      </Card>

      {image && (
        <Card>
          <CardHeader>
            <CardTitle>Extraction Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <img src={image} alt="Source" className="max-h-64 rounded-md border" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Dominant Colors</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {palette.map((color) => (
                  <div
                    key={color}
                    className="group relative cursor-pointer"
                    onClick={() => copyToClipboard(color)}
                  >
                    <div
                      className="h-16 w-full rounded-md shadow-inner border"
                      style={{ backgroundColor: color }}
                    />
                    <div className="mt-1 text-xs font-mono text-center">{color}</div>
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-md">
                      <span className="text-white text-[10px] font-bold">Copy</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setImage(null);
                setPalette([]);
                intake.reset();
              }}
              className="w-full"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Image
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
