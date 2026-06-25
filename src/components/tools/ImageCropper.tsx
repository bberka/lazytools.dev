'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, Upload, Download, Trash2, Crop } from 'lucide-react';
import ReactCrop, { type Crop as CropType, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

export function ImageCropper() {
  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
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
    reader.addEventListener('load', () => setImgSrc(reader.result?.toString() || ''));
    reader.readAsDataURL(file);
  };

  const onSelectFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      loadImageFile(e.target.files[0]);
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

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (aspect) {
      const { width, height } = e.currentTarget;
      setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height), width, height));
    }
  };

  const getCroppedImg = () => {
    const image = imgRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas || !completedCrop) return;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pixelRatio = window.devicePixelRatio;
    canvas.width = completedCrop.width * scaleX * pixelRatio;
    canvas.height = completedCrop.height * scaleY * pixelRatio;

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY
    );

    const base64Image = canvas.toDataURL(originalFile?.type || 'image/png');
    const link = document.createElement('a');
    link.href = base64Image;
    link.download = `cropped-${originalFile?.name || 'image.png'}`;
    link.click();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crop className="h-5 w-5" />
            Crop Image
          </CardTitle>
          <CardDescription>Select an area to crop from your image</CardDescription>
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
              onChange={onSelectFile}
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

      {imgSrc && (
        <Card>
          <CardHeader>
            <CardTitle>Crop Area</CardTitle>
            <div className="flex gap-2 flex-wrap mt-2">
              <Button variant={aspect === undefined ? 'default' : 'outline'} size="sm" onClick={() => setAspect(undefined)}>Free</Button>
              <Button variant={aspect === 1 ? 'default' : 'outline'} size="sm" onClick={() => setAspect(1)}>1:1</Button>
              <Button variant={aspect === 16 / 9 ? 'default' : 'outline'} size="sm" onClick={() => setAspect(16 / 9)}>16:9</Button>
              <Button variant={aspect === 4 / 3 ? 'default' : 'outline'} size="sm" onClick={() => setAspect(4 / 3)}>4:3</Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspect}
            >
              <img ref={imgRef} alt="Crop me" src={imgSrc} onLoad={onImageLoad} />
            </ReactCrop>
            <div className="flex gap-2 mt-4 w-full">
              <Button onClick={getCroppedImg} disabled={!completedCrop} className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Download Cropped Image
              </Button>
              <Button variant="outline" onClick={() => { setImgSrc(''); setOriginalFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
