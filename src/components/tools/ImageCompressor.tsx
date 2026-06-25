'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Image as ImageIcon, Upload, Download, Trash2, Zap } from 'lucide-react';

export function ImageCompressor() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [quality, setQuality] = useState(80);
  const [maxWidth, setMaxWidth] = useState<number | ''>('');
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState<{ original: number; compressed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    setOriginalFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setOriginalImage(result);
      compressImage(file);
    };
    reader.readAsDataURL(file);
  };

  const compressImage = async (file: File) => {
    setProcessing(true);
    setStats(null);

    try {
      const { default: imageCompression } = await import('browser-image-compression');
      const options = {
        maxSizeMB: 10,
        maxWidthOrHeight: maxWidth || undefined,
        useWebWorker: true,
        initialQuality: quality / 100,
      };

      const compressedFile = await imageCompression(file, options);
      const url = URL.createObjectURL(compressedFile);
      setProcessedImage(url);
      setStats({
        original: file.size,
        compressed: compressedFile.size,
      });
    } catch (error) {
      console.error('Compression error:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedImage || !originalFile) return;
    const link = document.createElement('a');
    link.href = processedImage;
    link.download = `compressed-${originalFile.name}`;
    link.click();
  };

  const handleClear = () => {
    setOriginalImage(null);
    setProcessedImage(null);
    setOriginalFile(null);
    setStats(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Compress Image
          </CardTitle>
          <CardDescription>Reduce image file size while maintaining quality</CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="block w-full text-sm text-muted-foreground
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-primary file:text-primary-foreground
              hover:file:bg-primary/90"
          />
        </CardContent>
      </Card>

      {originalImage && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Compression Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Quality: {quality}%</label>
                <Slider
                  min={1}
                  max={100}
                  value={quality}
                  onChange={setQuality}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Width/Height (Optional)</label>
                <Input
                  type="number"
                  value={maxWidth}
                  onChange={(e) => setMaxWidth(e.target.value ? parseInt(e.target.value) : '')}
                  placeholder="e.g. 1920"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => originalFile && compressImage(originalFile)} disabled={processing}>
                  {processing ? 'Compressing...' : 'Compress'}
                </Button>
                <Button variant="outline" onClick={handleClear}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {stats && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Original</p>
                    <p className="text-lg font-bold">{formatSize(stats.original)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Compressed</p>
                    <p className="text-lg font-bold text-primary">{formatSize(stats.compressed)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Reduction</p>
                    <p className="text-lg font-bold text-green-600">
                      {Math.round((1 - stats.compressed / stats.original) * 100)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium mb-2">Original</p>
                  <img src={originalImage} alt="Original" className="w-full border rounded-md" />
                </div>
                {processedImage && (
                  <div>
                    <p className="text-sm font-medium mb-2">Compressed</p>
                    <img src={processedImage} alt="Compressed" className="w-full border rounded-md" />
                    <Button onClick={handleDownload} className="mt-4 w-full">
                      <Download className="h-4 w-4 mr-2" />
                      Download Compressed
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
