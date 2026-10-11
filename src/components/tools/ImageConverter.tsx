'use client';

import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Image as ImageIcon, Download, Trash2, Loader2, Crop as CropIcon } from 'lucide-react';
import ReactCrop, {
  type Crop as CropType,
  centerCrop,
  convertToPixelCrop,
  makeAspectCrop,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import {
  downloadBlob,
  downloadDataUrl,
  formatBytes,
  loadImage,
  outputFileName,
  readFileAsDataUrl,
} from '@/lib/files';
import {
  canvasImageType,
  canvasToBlob,
  imageTypeExtension,
  type CanvasImageType,
} from '@/lib/tools/image-canvas';
import {
  canvasFilter,
  cropToImagePixels,
  encodeIco,
  planOutput,
  type OutputFormat,
  type Rect,
} from '@/lib/tools/image-converter';

// Results above this size are handed to the compressor to be brought back under it.
const MAX_OUTPUT_MB = 10;

const parseSide = (value: string): number | '' => {
  const side = Number(value);
  return value.trim() !== '' && Number.isFinite(side) ? Math.trunc(side) : '';
};

// The crop selection is measured on the displayed image; files are cut from its own pixels.
const cropInImagePixels = (pixelCrop: PixelCrop, image: HTMLImageElement) =>
  cropToImagePixels(
    pixelCrop,
    { width: image.width, height: image.height },
    { width: image.naturalWidth, height: image.naturalHeight }
  );

export function ImageConverter() {
  const id = useId();
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  // The format is kept with the result: the format select may change before the download.
  const [processed, setProcessed] = useState<{ blob: Blob; format: OutputFormat } | null>(null);
  const processedImage = useObjectUrl(processed?.blob ?? null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('png');
  const [quality, setQuality] = useState(90);
  const [width, setWidth] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [grayscale, setGrayscale] = useState(false);
  const [sepia, setSepia] = useState(false);
  const [blur, setBlur] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [filtersSkipped, setFiltersSkipped] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  // Each file load and each conversion gets a number; a result that is no longer the latest is dropped.
  const loadRef = useRef(0);
  const runRef = useRef(0);

  // In percent, so the selection follows the image when the layout changes size.
  const [crop, setCrop] = useState<CropType>();
  // The completed selection in the image's own pixels: what the label shows and the download cuts.
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [cropAspect, setCropAspect] = useState<number | undefined>(undefined);

  const applyAspectCrop = (image: HTMLImageElement, aspect: number) => {
    const { width: shownWidth, height: shownHeight } = image;
    const next = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, aspect, shownWidth, shownHeight),
      shownWidth,
      shownHeight
    );
    setCrop(next);
    setCropRect(cropInImagePixels(convertToPixelCrop(next, shownWidth, shownHeight), image));
  };

  // The crop library does not reshape an existing selection when the aspect changes, so it is done here.
  const selectAspect = (aspect: number | undefined) => {
    setCropAspect(aspect);
    const image = cropImgRef.current;
    if (aspect && image && image.width > 0 && image.height > 0) {
      applyAspectCrop(image, aspect);
    } else if (!aspect) {
      setCrop(undefined);
      setCropRect(null);
    }
  };

  const onCropImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (cropAspect) applyAspectCrop(e.currentTarget, cropAspect);
  };

  const handleCropComplete = (pixelCrop: PixelCrop) => {
    const image = cropImgRef.current;
    setCropRect(image ? cropInImagePixels(pixelCrop, image) : null);
  };

  const handleDownloadCropped = () => {
    const image = cropImgRef.current;
    if (!image || !cropRect) return;
    const canvas = document.createElement('canvas');
    canvas.width = cropRect.width;
    canvas.height = cropRect.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      image,
      cropRect.x,
      cropRect.y,
      cropRect.width,
      cropRect.height,
      0, 0,
      cropRect.width,
      cropRect.height,
    );

    // A canvas writes PNG, JPEG or WebP; any other source type comes out as PNG and is named so.
    const dataUrl = canvas.toDataURL(canvasImageType(originalFile?.type ?? ''));
    if (!dataUrl.startsWith('data:image/')) {
      toast.error('The cropped area is too large to export in this browser');
      return;
    }
    const writtenType = dataUrl.slice('data:'.length, dataUrl.indexOf(';'));
    const fileName =
      originalFile && originalFile.type === writtenType
        ? `cropped-${originalFile.name}`
        : outputFileName(originalFile?.name || 'image', {
            prefix: 'cropped-',
            extension: imageTypeExtension(writtenType),
          });
    downloadDataUrl(dataUrl, fileName);
  };

  const processImage = async (imageSrc: string) => {
    runRef.current += 1;
    const run = runRef.current;
    setProcessing(true);
    setError('');

    try {
      const img = await loadImage(imageSrc);
      if (run !== runRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) throw new Error('Canvas is not available in this browser.');

      // Calculate dimensions
      const plan = planOutput(
        { width: img.width, height: img.height },
        { width, height, maintainAspectRatio, rotation, format: outputFormat }
      );
      if (!plan) throw new Error('This image has no pixel size, so it cannot be converted.');

      // Adjust dimensions for rotation
      canvas.width = plan.canvasWidth;
      canvas.height = plan.canvasHeight;

      const mimeType: CanvasImageType = outputFormat === 'ico' ? 'image/png' : `image/${outputFormat}`;

      // JPEG has no transparency; without a backdrop the see-through areas come out black.
      if (mimeType === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Apply filters
      const filter = canvasFilter({ grayscale, sepia, blur, brightness, contrast, saturation });
      const canFilter = typeof (ctx as { filter?: unknown }).filter === 'string';
      if (filter !== 'none' && canFilter) ctx.filter = filter;

      // Handle transformations
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
      ctx.drawImage(img, -plan.drawWidth / 2, -plan.drawHeight / 2, plan.drawWidth, plan.drawHeight);
      ctx.restore();

      // Convert to desired format
      const qualityValue = mimeType === 'image/png' ? 1 : quality / 100;
      const blob = await canvasToBlob(canvas, mimeType, qualityValue);
      if (run !== runRef.current) return;

      // A browser that cannot write the requested type writes PNG instead.
      const format: OutputFormat =
        outputFormat === 'ico' ? 'ico' : blob.type === mimeType ? outputFormat : 'png';
      let result = blob;

      if (format === 'ico') {
        const png = new Uint8Array(await blob.arrayBuffer());
        result = new Blob([encodeIco(png, plan.canvasWidth, plan.canvasHeight)], {
          type: 'image/x-icon',
        });
      } else if (format === 'png' || blob.size > MAX_OUTPUT_MB * 1024 * 1024) {
        // JPEG and WebP already carry the chosen quality. PNG is shrunk by the
        // compressor, and so is anything over the size limit.
        try {
          // Compress only after conversion begins so the image tool shell stays light.
          const { default: imageCompression } = await import('browser-image-compression');
          result = await imageCompression(new File([blob], 'image', { type: blob.type }), {
            maxSizeMB: MAX_OUTPUT_MB,
            maxWidthOrHeight: Math.max(plan.drawWidth, plan.drawHeight),
            useWebWorker: true,
            initialQuality: qualityValue,
            // The library's worker loads the library a second time by URL and
            // defaults to a CDN copy. This is the bundler's asset syntax for
            // the copy that ships with the app, so nothing is fetched from
            // anywhere else. The bundler may give a path ("/_next/static/media/...")
            // and the worker is a blob: script, which cannot resolve one, so the
            // address is made absolute here.
            libURL: new URL(
              new URL(
                'browser-image-compression/dist/browser-image-compression.js',
                import.meta.url
              ).toString(),
              window.location.href
            ).toString(),
          });
        } catch {
          result = blob;
        }
      }
      if (run !== runRef.current) return;

      setProcessed({ blob: result, format });
      setFiltersSkipped(filter !== 'none' && !canFilter);
    } catch (cause) {
      if (run !== runRef.current) return;
      setProcessed(null);
      setFiltersSkipped(false);
      setError(cause instanceof Error ? cause.message : 'The image could not be converted.');
    } finally {
      if (run === runRef.current) setProcessing(false);
    }
  };

  const loadImageFile = async (file: File) => {
    loadRef.current += 1;
    const load = loadRef.current;

    let result: string;
    try {
      result = await readFileAsDataUrl(file);
    } catch {
      if (load === loadRef.current) toast.error('Failed to read file');
      return;
    }
    // A newer file was chosen while this one was being read.
    if (load !== loadRef.current) return;

    // What belonged to the previous image goes with it.
    setProcessed(null);
    setCrop(undefined);
    setCropRect(null);
    setOriginalFile(file);
    setOriginalImage(result);
    void processImage(result);
  };

  const intake = useFileIntake({ accept: 'image/*', onFiles: ([file]) => loadImageFile(file) });

  const handleConvert = () => {
    if (originalImage) {
      void processImage(originalImage);
    }
  };

  const handleDownload = () => {
    if (!processed) return;
    downloadBlob(processed.blob, `converted.${processed.format}`);
  };

  const handleClear = () => {
    // Anything still being read or converted must not come back after the reset.
    loadRef.current += 1;
    runRef.current += 1;
    setProcessing(false);
    setError('');
    setFiltersSkipped(false);
    setOriginalImage(null);
    setProcessed(null);
    setOriginalFile(null);
    setWidth('');
    setHeight('');
    setRotation(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
    setGrayscale(false);
    setSepia(false);
    setBlur(0);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setCrop(undefined);
    setCropRect(null);
    intake.reset();
  };

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Image Converter & Editor
          </CardTitle>
          <CardDescription>Convert, resize, rotate, flip, and apply filters to images</CardDescription>
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

      {originalImage && (
        <>
          {/* Crop Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CropIcon className="h-5 w-5" />
                Crop
              </CardTitle>
              <CardDescription>Select an area to crop from your image</CardDescription>
              <div className="flex gap-2 flex-wrap pt-2">
                <Button variant={cropAspect === undefined ? 'default' : 'outline'} size="sm" aria-pressed={cropAspect === undefined} onClick={() => selectAspect(undefined)}>Free</Button>
                <Button variant={cropAspect === 1 ? 'default' : 'outline'} size="sm" aria-pressed={cropAspect === 1} onClick={() => selectAspect(1)}>1:1</Button>
                <Button variant={cropAspect === 16 / 9 ? 'default' : 'outline'} size="sm" aria-pressed={cropAspect === 16 / 9} onClick={() => selectAspect(16 / 9)}>16:9</Button>
                <Button variant={cropAspect === 4 / 3 ? 'default' : 'outline'} size="sm" aria-pressed={cropAspect === 4 / 3} onClick={() => selectAspect(4 / 3)}>4:3</Button>
                <Button variant={cropAspect === 9 / 16 ? 'default' : 'outline'} size="sm" aria-pressed={cropAspect === 9 / 16} onClick={() => selectAspect(9 / 16)}>9:16</Button>
                <Button variant={cropAspect === 3 / 4 ? 'default' : 'outline'} size="sm" aria-pressed={cropAspect === 3 / 4} onClick={() => selectAspect(3 / 4)}>3:4</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  onComplete={handleCropComplete}
                  aspect={cropAspect}
                >
                  <img ref={cropImgRef} alt="Crop" src={originalImage} onLoad={onCropImageLoad} style={{ maxHeight: '500px', minWidth: '200px', width: 'auto', maxWidth: '100%' }} />
                </ReactCrop>
              </div>
              {cropRect && (
                <p className="text-xs text-muted-foreground text-center">
                  Crop: {cropRect.width}×{cropRect.height}px
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={handleDownloadCropped} disabled={!cropRect} className="flex-1 min-h-11 sm:min-h-10">
                  <Download className="h-4 w-4 mr-2" />
                  Download Cropped Image
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
              <CardDescription>Configure output format, dimensions, and transformations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label id={`${id}-format-label`} className="text-sm font-medium">Output Format</label>
                  <Select
                    value={outputFormat}
                    onValueChange={(value) => setOutputFormat(value as OutputFormat)}
                  >
                    <SelectTrigger id={`${id}-format`} aria-labelledby={`${id}-format-label ${id}-format`}>
                      <SelectValue placeholder="Select output format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="png">PNG</SelectItem>
                        <SelectItem value="jpeg">JPEG</SelectItem>
                        <SelectItem value="webp">WebP</SelectItem>
                        <SelectItem value="ico">ICO</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {outputFormat !== 'png' && outputFormat !== 'ico' && (
                  <div className="space-y-2" role="group" aria-labelledby={`${id}-quality`}>
                    <label id={`${id}-quality`} className="text-sm font-medium">Quality: {quality}%</label>
                    <Slider
                      min={1}
                      max={100}
                      value={quality}
                      onChange={setQuality}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Resize</label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${id}-width`} className="text-xs text-muted-foreground">Width (px)</label>
                    <Input
                      id={`${id}-width`}
                      type="number"
                      min={1}
                      value={width}
                      onChange={(e) => setWidth(parseSide(e.target.value))}
                      placeholder="Auto"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${id}-height`} className="text-xs text-muted-foreground">Height (px)</label>
                    <Input
                      id={`${id}-height`}
                      type="number"
                      min={1}
                      value={height}
                      onChange={(e) => setHeight(parseSide(e.target.value))}
                      placeholder="Auto"
                    />
                  </div>
                </div>
                <Checkbox
                  checked={maintainAspectRatio}
                  onCheckedChange={setMaintainAspectRatio}
                  label="Maintain aspect ratio"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Transform</label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2" role="group" aria-labelledby={`${id}-rotate`}>
                    <label id={`${id}-rotate`} className="text-xs text-muted-foreground">Rotate: {rotation}°</label>
                    <Slider
                      min={0}
                      max={270}
                      step={90}
                      value={rotation}
                      onChange={setRotation}
                    />
                  </div>
                  <div className="flex gap-4 sm:gap-6 items-center h-full pt-4">
                    <Checkbox
                      checked={flipHorizontal}
                      onCheckedChange={setFlipHorizontal}
                      label="Flip H"
                    />
                    <Checkbox
                      checked={flipVertical}
                      onCheckedChange={setFlipVertical}
                      label="Flip V"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Filters</label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Checkbox
                    checked={grayscale}
                    onCheckedChange={setGrayscale}
                    label="Grayscale"
                  />
                  <Checkbox
                    checked={sepia}
                    onCheckedChange={setSepia}
                    label="Sepia"
                  />
                </div>
              </div>

              <div className="space-y-2" role="group" aria-labelledby={`${id}-blur`}>
                <label id={`${id}-blur`} className="text-sm font-medium">Blur: {blur}px</label>
                <Slider
                  min={0}
                  max={20}
                  value={blur}
                  onChange={setBlur}
                />
              </div>

              <div className="space-y-2" role="group" aria-labelledby={`${id}-brightness`}>
                <label id={`${id}-brightness`} className="text-sm font-medium">Brightness: {brightness}%</label>
                <Slider
                  min={0}
                  max={200}
                  value={brightness}
                  onChange={setBrightness}
                />
              </div>

              <div className="space-y-2" role="group" aria-labelledby={`${id}-contrast`}>
                <label id={`${id}-contrast`} className="text-sm font-medium">Contrast: {contrast}%</label>
                <Slider
                  min={0}
                  max={200}
                  value={contrast}
                  onChange={setContrast}
                />
              </div>

              <div className="space-y-2" role="group" aria-labelledby={`${id}-saturation`}>
                <label id={`${id}-saturation`} className="text-sm font-medium">Saturation: {saturation}%</label>
                <Slider
                  min={0}
                  max={200}
                  value={saturation}
                  onChange={setSaturation}
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={handleConvert} disabled={processing} className="min-h-11 sm:min-h-10">
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Convert'
                  )}
                </Button>
                <Button onClick={handleClear} variant="outline" className="min-h-11 sm:min-h-10">
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
                Preview
              </CardTitle>
              <CardDescription>Before and after comparison</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium mb-2">Original</p>
                  <img src={originalImage} alt="Original" className="w-full border rounded-md" />
                </div>
                {processedImage && (
                  <div>
                    <p className="text-sm font-medium mb-2">Converted</p>
                    <img src={processedImage} alt="Converted" className="w-full border rounded-md" />
                  </div>
                )}
              </div>

              {error && !processing && (
                <div
                  role="alert"
                  className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {error}
                </div>
              )}
              {filtersSkipped && !processing && (
                <p role="status" className="mt-4 text-sm text-muted-foreground">
                  This browser cannot apply filters when exporting, so the converted image does not include them.
                </p>
              )}
              {processed && !processing && (
                <Button onClick={handleDownload} className="mt-4 min-h-11 w-full sm:min-h-10 sm:w-auto">
                  <Download className="h-4 w-4 mr-2" />
                  Download Converted Image
                </Button>
              )}
              {processing && (
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
                  Processing image...
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
