'use client';

import { useId, useRef, useState } from 'react';
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
import { Image as ImageIcon, Download, Loader2, Trash2, Eye } from 'lucide-react';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, formatBytes, loadImage, readFileAsDataUrl } from '@/lib/files';
import {
  BLINDNESS_TYPES,
  colorMatrixValues,
  simulateColorBlindness,
  type BlindnessType,
} from '@/lib/tools/color-blindness-simulator';
import { canvasToBlob } from '@/lib/tools/image-canvas';

export function ColorBlindnessSimulator() {
  const id = useId();
  const [image, setImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [type, setType] = useState<BlindnessType>('deuteranopia');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
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
    setError('');
    setImage(dataUrl);
  };

  const intake = useFileIntake({ accept: 'image/*', onFiles: ([file]) => loadImageFile(file) });

  // A file the browser cannot decode would leave two broken pictures on screen.
  const handlePreviewError = () => {
    setImage(null);
    setError('Unable to load the selected image.');
  };

  const handleDownload = async () => {
    if (!image) return;

    setProcessing(true);
    setError('');

    try {
      const img = await loadImage(image);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) throw new Error('Canvas is not available in this browser.');

      canvas.width = img.width;
      canvas.height = img.height;
      if (!canvas.width || !canvas.height) {
        throw new Error('This image has no pixel size, so it cannot be exported.');
      }
      ctx.drawImage(img, 0, 0);

      // The same matrix as the preview filter, applied to the pixels directly:
      // not every browser can run a filter on a canvas.
      if (BLINDNESS_TYPES[type].matrix) {
        let frame: ImageData;
        try {
          frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch {
          throw new Error('The image is too large to process in this browser.');
        }
        simulateColorBlindness(frame.data, type);
        ctx.putImageData(frame, 0, 0);
      }

      downloadBlob(await canvasToBlob(canvas, 'image/png'), `${type}-simulation.png`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The simulation could not be exported.');
    } finally {
      setProcessing(false);
    }
  };

  const handleClear = () => {
    loadRef.current += 1;
    setImage(null);
    setOriginalFile(null);
    setError('');
    intake.reset();
  };

  const getFilterString = (blindnessType: BlindnessType) => {
    if (blindnessType === 'normal') return 'none';
    return `url(#${blindnessType})`;
  };

  // Shown next to what failed: under the drop area for a bad file, under the buttons for a failed export.
  const errorAlert = error && (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {error}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* SVG Filters for Color Blindness Simulation */}
      <svg className="hidden">
        <defs>
          {Object.entries(BLINDNESS_TYPES).map(
            ([filterId, { matrix }]) =>
              matrix && (
                <filter key={filterId} id={filterId} colorInterpolationFilters="linearRGB">
                  <feColorMatrix type="matrix" values={colorMatrixValues(matrix)} />
                </filter>
              )
          )}
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
          {!image && errorAlert}
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
                <label id={`${id}-type-label`} className="text-sm font-medium">Type of Color Blindness</label>
                <Select value={type} onValueChange={(v) => setType(v as BlindnessType)}>
                  <SelectTrigger id={`${id}-type`} aria-labelledby={`${id}-type-label ${id}-type`}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(BLINDNESS_TYPES).map(([typeId, { name }]) => (
                        <SelectItem key={typeId} value={typeId}>
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
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleDownload} disabled={processing} variant="outline" className="flex-1">
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Download Simulation
                </Button>
                <Button variant="ghost" onClick={handleClear}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
              {errorAlert}
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
                  <div className="border rounded-md overflow-hidden bg-muted/50">
                    <img src={image} alt="Original" className="w-full h-auto" onError={handlePreviewError} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2 text-center">{BLINDNESS_TYPES[type].name}</p>
                  <div className="border rounded-md overflow-hidden bg-muted/50">
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
