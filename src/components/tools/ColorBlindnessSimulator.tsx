'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Image as ImageIcon, Download, Trash2, Eye } from 'lucide-react';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadDataUrl, formatBytes, readFileAsDataUrl } from '@/lib/files';

type BlindnessType =
  | 'normal'
  | 'protanopia'
  | 'protanomaly'
  | 'deuteranopia'
  | 'deuteranomaly'
  | 'tritanopia'
  | 'tritanomaly'
  | 'achromatopsia'
  | 'achromatomaly';

const BLINDNESS_TYPES: Record<BlindnessType, { name: string; description: string }> = {
  normal: { name: 'Normal Vision', description: 'Standard color vision' },
  protanopia: { name: 'Protanopia', description: 'Red-blind (1% of males)' },
  protanomaly: { name: 'Protanomaly', description: 'Red-weak (1% of males)' },
  deuteranopia: { name: 'Deuteranopia', description: 'Green-blind (1% of males)' },
  deuteranomaly: { name: 'Deuteranomaly', description: 'Green-weak (6% of males)' },
  tritanopia: { name: 'Tritanopia', description: 'Blue-blind (<1% of population)' },
  tritanomaly: { name: 'Tritanomaly', description: 'Blue-weak (<1% of population)' },
  achromatopsia: { name: 'Achromatopsia', description: 'Total color-blind (very rare)' },
  achromatomaly: { name: 'Achromatomaly', description: 'Total color-weak (very rare)' },
};

export function ColorBlindnessSimulator() {
  const [image, setImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [type, setType] = useState<BlindnessType>('deuteranopia');
  const [processing, setProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadImageFile = (file: File) => {
    setOriginalFile(file);
    readFileAsDataUrl(file)
      .then(setImage)
      .catch(() => toast.error('Failed to read file'));
  };

  const intake = useFileIntake({ accept: 'image/*', onFiles: ([file]) => loadImageFile(file) });

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Apply filter based on type
      ctx.filter = getFilterString(type);
      ctx.drawImage(img, 0, 0);

      downloadDataUrl(canvas.toDataURL('image/png'), `${type}-simulation.png`);
    };
    img.src = image;
  };

  const getFilterString = (blindnessType: BlindnessType) => {
    if (blindnessType === 'normal') return 'none';
    return `url(#${blindnessType})`;
  };

  return (
    <div className="space-y-4">
      {/* SVG Filters for Color Blindness Simulation */}
      <svg className="hidden">
        <defs>
          <filter id="protanopia">
            <feColorMatrix
              type="matrix"
              values="0.567, 0.433, 0, 0, 0
                      0.558, 0.442, 0, 0, 0
                      0, 0.242, 0.758, 0, 0
                      0, 0, 0, 1, 0"
            />
          </filter>
          <filter id="protanomaly">
            <feColorMatrix
              type="matrix"
              values="0.817, 0.183, 0, 0, 0
                      0.333, 0.667, 0, 0, 0
                      0, 0.125, 0.875, 0, 0
                      0, 0, 0, 1, 0"
            />
          </filter>
          <filter id="deuteranopia">
            <feColorMatrix
              type="matrix"
              values="0.625, 0.375, 0, 0, 0
                      0.7, 0.3, 0, 0, 0
                      0, 0.3, 0.7, 0, 0
                      0, 0, 0, 1, 0"
            />
          </filter>
          <filter id="deuteranomaly">
            <feColorMatrix
              type="matrix"
              values="0.8, 0.2, 0, 0, 0
                      0.258, 0.742, 0, 0, 0
                      0, 0.142, 0.858, 0, 0
                      0, 0, 0, 1, 0"
            />
          </filter>
          <filter id="tritanopia">
            <feColorMatrix
              type="matrix"
              values="0.95, 0.05, 0, 0, 0
                      0, 0.433, 0.567, 0, 0
                      0, 0.475, 0.525, 0, 0
                      0, 0, 0, 1, 0"
            />
          </filter>
          <filter id="tritanomaly">
            <feColorMatrix
              type="matrix"
              values="0.967, 0.033, 0, 0, 0
                      0, 0.733, 0.267, 0, 0
                      0, 0.183, 0.817, 0, 0
                      0, 0, 0, 1, 0"
            />
          </filter>
          <filter id="achromatopsia">
            <feColorMatrix
              type="matrix"
              values="0.299, 0.587, 0.114, 0, 0
                      0.299, 0.587, 0.114, 0, 0
                      0.299, 0.587, 0.114, 0, 0
                      0, 0, 0, 1, 0"
            />
          </filter>
          <filter id="achromatomaly">
            <feColorMatrix
              type="matrix"
              values="0.618, 0.320, 0.062, 0, 0
                      0.163, 0.775, 0.062, 0, 0
                      0.163, 0.320, 0.516, 0, 0
                      0, 0, 0, 1, 0"
            />
          </filter>
        </defs>
      </svg>

      <canvas ref={canvasRef} className="hidden" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Color Blindness Simulator
          </CardTitle>
          <CardDescription>Visualize how images appear to individuals with different types of color blindness</CardDescription>
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
        <>
          <Card>
            <CardHeader>
              <CardTitle>Simulation Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Type of Color Blindness</label>
                <Select value={type} onValueChange={(v) => setType(v as BlindnessType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(BLINDNESS_TYPES).map(([id, { name }]) => (
                        <SelectItem key={id} value={id}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {BLINDNESS_TYPES[type].description}
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleDownload} variant="outline" className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download Simulation
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setImage(null);
                    intake.reset();
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Comparison Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium mb-2 text-center">Original</p>
                  <div className="border rounded-md overflow-hidden bg-slate-50 dark:bg-slate-900">
                    <img src={image} alt="Original" className="w-full h-auto" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2 text-center">{BLINDNESS_TYPES[type].name}</p>
                  <div className="border rounded-md overflow-hidden bg-slate-50 dark:bg-slate-900">
                    <img
                      src={image}
                      alt="Simulated"
                      className="w-full h-auto"
                      style={{ filter: getFilterString(type) }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
