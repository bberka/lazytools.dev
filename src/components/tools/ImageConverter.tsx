'use client';

import { useState, useRef, useCallback } from 'react';
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
import ReactCrop, { type Crop as CropType, centerCrop, makeAspectCrop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { downloadBlob, downloadDataUrl, formatBytes, readFileAsDataUrl } from '@/lib/files';

type OutputFormat = 'png' | 'jpeg' | 'webp' | 'ico';

const createIcoBlob = async (pngBlob: Blob, width: number, height: number) => {
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
  const headerSize = 6;
  const directorySize = 16;
  const imageOffset = headerSize + directorySize;
  const icoBytes = new Uint8Array(imageOffset + pngBytes.length);
  const view = new DataView(icoBytes.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);

  icoBytes[6] = width >= 256 ? 0 : width;
  icoBytes[7] = height >= 256 ? 0 : height;
  icoBytes[8] = 0;
  icoBytes[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, pngBytes.length, true);
  view.setUint32(18, imageOffset, true);
  icoBytes.set(pngBytes, imageOffset);

  return new Blob([icoBytes], { type: 'image/x-icon' });
};

export function ImageConverter() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const processedImage = useObjectUrl(processedBlob);
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);

  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  // Size of the completed crop in the image's own pixels, for the label under the crop area.
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | null>(null);
  const [cropAspect, setCropAspect] = useState<number | undefined>(undefined);

  const cropSizeInImagePixels = (pixelCrop: PixelCrop, image: HTMLImageElement) => ({
    width: Math.round(pixelCrop.width * (image.naturalWidth / image.width)),
    height: Math.round(pixelCrop.height * (image.naturalHeight / image.height)),
  });

  const onCropImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const image = e.currentTarget;
    if (cropAspect) {
      const { width, height } = image;
      setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, cropAspect, width, height), width, height));
    }
    // A crop kept from the previous image now maps onto this image's pixels.
    setCropSize(completedCrop ? cropSizeInImagePixels(completedCrop, image) : null);
  }, [cropAspect, completedCrop]);

  const handleCropComplete = (pixelCrop: PixelCrop) => {
    setCompletedCrop(pixelCrop);
    const image = cropImgRef.current;
    setCropSize(image ? cropSizeInImagePixels(pixelCrop, image) : null);
  };

  const handleDownloadCropped = useCallback(() => {
    const image = cropImgRef.current;
    if (!image || !completedCrop) return;
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const canvas = document.createElement('canvas');
    const pixelRatio = window.devicePixelRatio;
    canvas.width = completedCrop.width * scaleX * pixelRatio;
    canvas.height = completedCrop.height * scaleY * pixelRatio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0, 0,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
    );
    const mimeType = originalFile?.type || 'image/png';
    const ext = mimeType.split('/')[1] || 'png';
    downloadDataUrl(canvas.toDataURL(mimeType), `cropped-${originalFile?.name || `image.${ext}`}`);
  }, [completedCrop, originalFile]);

  const processImage = async (imageSrc: string, file: File) => {
    setProcessing(true);

    try {
      const img = new Image();
      img.onload = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Calculate dimensions
        let targetWidth = width || img.width;
        let targetHeight = height || img.height;

        if (maintainAspectRatio) {
          if (width && !height) {
            targetHeight = (img.height * (width as number)) / img.width;
          } else if (height && !width) {
            targetWidth = (img.width * (height as number)) / img.height;
          }
        }

        if (outputFormat === 'ico') {
          const largestSide = Math.max(targetWidth as number, targetHeight as number);

          if (largestSide > 256) {
            const scale = 256 / largestSide;
            targetWidth = Math.round((targetWidth as number) * scale);
            targetHeight = Math.round((targetHeight as number) * scale);
          }
        }

        // Adjust dimensions for rotation
        const isRotated90 = (rotation / 90) % 2 !== 0;
        canvas.width = isRotated90 ? targetHeight as number : targetWidth as number;
        canvas.height = isRotated90 ? targetWidth as number : targetHeight as number;

        // Apply filters
        ctx.filter = `
          grayscale(${grayscale ? 100 : 0}%)
          sepia(${sepia ? 100 : 0}%)
          blur(${blur}px)
          brightness(${brightness}%)
          contrast(${contrast}%)
          saturate(${saturation}%)
        `.trim();

        // Handle transformations
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
        ctx.drawImage(
          img,
          -(targetWidth as number) / 2,
          -(targetHeight as number) / 2,
          targetWidth as number,
          targetHeight as number
        );
        ctx.restore();

        // Convert to desired format
        const mimeType = outputFormat === 'ico' ? 'image/png' : `image/${outputFormat}`;
        const qualityValue = outputFormat === 'png' || outputFormat === 'ico' ? 1 : quality / 100;

        canvas.toBlob(
          async (blob) => {
            if (!blob) return;

            try {
              if (outputFormat === 'ico') {
                const icoBlob = await createIcoBlob(blob, canvas.width, canvas.height);
                setProcessedBlob(icoBlob);
                setProcessing(false);
                return;
              }

              // Compress only after conversion begins so the image tool shell stays light.
              const { default: imageCompression } = await import('browser-image-compression');
              const options = {
                maxSizeMB: 10,
                maxWidthOrHeight: Math.max(targetWidth as number, targetHeight as number),
                useWebWorker: true,
                quality: qualityValue,
              };

              const compressedFile = await imageCompression(
                new File([blob], file.name, { type: mimeType }),
                options
              );
              setProcessedBlob(compressedFile);
            } catch (error) {
              if (outputFormat === 'ico') {
                console.error('Error creating ICO:', error);
                setProcessing(false);
                return;
              }

              setProcessedBlob(blob);
            }

            setProcessing(false);
          },
          mimeType,
          qualityValue
        );
      };

      img.src = imageSrc;
    } catch (error) {
      console.error('Error processing image:', error);
      setProcessing(false);
    }
  };

  const loadImageFile = async (file: File) => {
    setOriginalFile(file);

    let result: string;
    try {
      result = await readFileAsDataUrl(file);
    } catch {
      toast.error('Failed to read file');
      return;
    }

    setOriginalImage(result);
    processImage(result, file);
  };

  const intake = useFileIntake({ accept: 'image/*', onFiles: ([file]) => loadImageFile(file) });

  const handleConvert = () => {
    if (originalImage && originalFile) {
      processImage(originalImage, originalFile);
    }
  };

  const handleDownload = () => {
    if (!processedBlob) return;
    downloadBlob(processedBlob, `converted.${outputFormat}`);
  };

  const handleClear = () => {
    setOriginalImage(null);
    setProcessedBlob(null);
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
    setCompletedCrop(undefined);
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
                <Button variant={cropAspect === undefined ? 'default' : 'outline'} size="sm" onClick={() => { setCropAspect(undefined); setCrop(undefined); setCompletedCrop(undefined); }}>Free</Button>
                <Button variant={cropAspect === 1 ? 'default' : 'outline'} size="sm" onClick={() => setCropAspect(1)}>1:1</Button>
                <Button variant={cropAspect === 16 / 9 ? 'default' : 'outline'} size="sm" onClick={() => setCropAspect(16 / 9)}>16:9</Button>
                <Button variant={cropAspect === 4 / 3 ? 'default' : 'outline'} size="sm" onClick={() => setCropAspect(4 / 3)}>4:3</Button>
                <Button variant={cropAspect === 9 / 16 ? 'default' : 'outline'} size="sm" onClick={() => setCropAspect(9 / 16)}>9:16</Button>
                <Button variant={cropAspect === 3 / 4 ? 'default' : 'outline'} size="sm" onClick={() => setCropAspect(3 / 4)}>3:4</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={handleCropComplete}
                  aspect={cropAspect}
                >
                  <img ref={cropImgRef} alt="Crop" src={originalImage} onLoad={onCropImageLoad} style={{ maxHeight: '500px', minWidth: '200px', width: 'auto', maxWidth: '100%' }} />
                </ReactCrop>
              </div>
              {completedCrop && cropSize && (
                <p className="text-xs text-muted-foreground text-center">
                  Crop: {cropSize.width}×{cropSize.height}px
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={handleDownloadCropped} disabled={!completedCrop} className="flex-1 min-h-11 sm:min-h-10">
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
                  <label className="text-sm font-medium">Output Format</label>
                  <Select
                    value={outputFormat}
                    onValueChange={(value) => setOutputFormat(value as OutputFormat)}
                  >
                    <SelectTrigger>
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
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Quality: {quality}%</label>
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
                    <label className="text-xs text-muted-foreground">Width (px)</label>
                    <Input
                      type="number"
                      value={width}
                      onChange={(e) => setWidth((e.target as HTMLInputElement).value ? parseInt((e.target as HTMLInputElement).value) : '')}
                      placeholder="Auto"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Height (px)</label>
                    <Input
                      type="number"
                      value={height}
                      onChange={(e) => setHeight((e.target as HTMLInputElement).value ? parseInt((e.target as HTMLInputElement).value) : '')}
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
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Rotate: {rotation}°</label>
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

              <div className="space-y-2">
                <label className="text-sm font-medium">Blur: {blur}px</label>
                <Slider
                  min={0}
                  max={20}
                  value={blur}
                  onChange={setBlur}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Brightness: {brightness}%</label>
                <Slider
                  min={0}
                  max={200}
                  value={brightness}
                  onChange={setBrightness}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Contrast: {contrast}%</label>
                <Slider
                  min={0}
                  max={200}
                  value={contrast}
                  onChange={setContrast}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Saturation: {saturation}%</label>
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

              {processedImage && !processing && (
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
