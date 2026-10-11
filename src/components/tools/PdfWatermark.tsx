'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ColorPicker } from '@/components/ui/color-picker';
import { Download, Stamp } from 'lucide-react';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { cn } from '@/lib/utils';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, loadImage, outputFileName, readFileAsArrayBuffer } from '@/lib/files';
import { PDF_MIME_TYPE, openPdf, parsePageRange, pdfBlob, type OpenedPdf } from '@/lib/pdf';

export function PdfWatermark() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [watermarkType, setWatermarkType] = useState<'text' | 'image'>('text');
  
  // Text Settings
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(48);
  const [fontFamily, setFontFamily] = useState<'Helvetica' | 'Times Roman' | 'Courier'>('Helvetica');
  const [textColor, setTextColor] = useState('#ff0000');
  const [textAngle, setTextAngle] = useState(-45);
  
  // Image Settings
  const [watermarkImageFile, setWatermarkImageFile] = useState<File | null>(null);
  const [imageScale, setImageScale] = useState(50);
  const [watermarkImgElement, setWatermarkImgElement] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState('');
  
  // Global Settings
  const [opacity, setOpacity] = useState(30); // 0-100 scale for slider
  const [placement, setPlacement] = useState<'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tiled'>('center');
  const [pageRange, setPageRange] = useState<'all' | 'first' | 'last' | 'custom'>('all');
  const [customRange, setCustomRange] = useState('1');
  
  const [rendering, setRendering] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [exportError, setExportError] = useState('');

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const pdfDocRef = useRef<OpenedPdf | null>(null); // opened document, used for the preview
  const loadIdRef = useRef(0); // names the latest load; an older one must not install its document
  const [actualPageSize, setActualPageSize] = useState({ width: 612, height: 792 }); // Letter default

  // Releases the opened document and its worker. Called when another file
  // replaces the document, when the tool is cleared and when it unmounts.
  const releaseDocument = () => {
    const doc = pdfDocRef.current;
    pdfDocRef.current = null;
    void doc?.destroy();
  };

  useEffect(
    () => () => {
      loadIdRef.current += 1;
      void pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    },
    []
  );

  const loadPdfFile = async (file: File) => {
    const loadId = ++loadIdRef.current;
    releaseDocument();

    setPdfFile(file);
    setRendering(true);
    setPreviewLoaded(false);
    setLoadError('');
    setExportError('');

    try {
      const pdf = await openPdf(file);
      // Replaced, cleared or unmounted while the file was being opened.
      if (loadId !== loadIdRef.current) {
        void pdf.destroy();
        return;
      }
      pdfDocRef.current = pdf;

      const page = await pdf.page(1);
      // The document was released under this load; whoever did that owns the state now.
      if (loadId !== loadIdRef.current) return;

      setActualPageSize({ width: page.width, height: page.height });
      setPreviewLoaded(true);
    } catch (error) {
      // A load that was superseded fails because its document was released.
      if (loadId !== loadIdRef.current) return;
      console.error('Error loading PDF:', error);
      releaseDocument();
      setLoadError('Failed to parse PDF.');
    } finally {
      if (loadId === loadIdRef.current) setRendering(false);
    }
  };

  // The intakes only pass on a PDF and a PNG or JPEG image; anything else is
  // reported next to the control it was given to.
  const pdfIntake = useFileIntake({
    accept: PDF_MIME_TYPE,
    onFiles: ([file]) => loadPdfFile(file),
  });

  const imageIntake = useFileIntake({
    accept: 'image/png,image/jpeg',
    onFiles: ([file]) => {
      setImageError('');
      setWatermarkImageFile(file);
    },
  });

  // Clean up references
  const handleClearAll = () => {
    loadIdRef.current += 1;
    releaseDocument();
    setPdfFile(null);
    setRendering(false);
    setPreviewLoaded(false);
    setLoadError('');
    setExportError('');
    setWatermarkImageFile(null);
    setWatermarkImgElement(null);
    setImageError('');
    pdfIntake.reset();
    imageIntake.reset();
  };

  // Decode the watermark image for the preview and for its pixel size
  useEffect(() => {
    if (!watermarkImageFile) return;

    let active = true;

    loadImage(watermarkImageFile)
      .then((image) => {
        if (active) setWatermarkImgElement(image);
      })
      .catch(() => {
        if (!active) return;
        setWatermarkImgElement(null);
        setImageError('Unable to load the selected image.');
      });

    return () => {
      active = false;
    };
  }, [watermarkImageFile]);

  // Render first page to preview canvas
  useEffect(() => {
    const doc = pdfDocRef.current;
    if (!doc || !previewLoaded || !previewCanvasRef.current) return;

    let active = true;

    const renderPreview = async () => {
      try {
        const page = await doc.page(1);

        if (!active) return;

        const canvas = previewCanvasRef.current;
        if (!canvas) return;

        // Render at a responsive preview scale (e.g. max width 500px)
        const rendered = await page.render({
          canvas,
          scale: Math.min(500 / page.width, 1.0),
        });
        if (!rendered) return;

        // Sync overlay canvas size
        const overlay = overlayCanvasRef.current;
        if (overlay) {
          overlay.width = rendered.width;
          overlay.height = rendered.height;
          drawOverlayWatermark(overlay, rendered.width, page.width);
        }
      } catch (error) {
        // A render cut short by a released document is not a failure.
        if (active) console.error('Error rendering preview page:', error);
      }
    };

    renderPreview();

    return () => {
      active = false;
    };
  }, [previewLoaded, actualPageSize]);

  // Redraw overlay when settings change
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    const preview = previewCanvasRef.current;
    if (overlay && preview) {
      drawOverlayWatermark(overlay, overlay.width, actualPageSize.width);
    }
  }, [
    watermarkType,
    watermarkText,
    fontSize,
    fontFamily,
    textColor,
    textAngle,
    watermarkImgElement,
    imageScale,
    opacity,
    placement,
  ]);

  // Drawing overlay watermark logic
  function drawOverlayWatermark(canvas: HTMLCanvasElement, previewWidth: number, actualWidth: number) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = previewWidth / actualWidth;
    ctx.save();
    ctx.globalAlpha = opacity / 100;

    if (watermarkType === 'text') {
      ctx.fillStyle = textColor;
      const scaledFontSize = fontSize * scale;
      ctx.font = `${scaledFontSize}px sans-serif`;
      
      const rad = (textAngle * Math.PI) / 180;

      if (placement === 'tiled') {
        const stepX = 220 * scale;
        const stepY = 180 * scale;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let gx = 50 * scale; gx < canvas.width; gx += stepX) {
          for (let gy = 50 * scale; gy < canvas.height; gy += stepY) {
            ctx.save();
            ctx.translate(gx, gy);
            ctx.rotate(rad);
            ctx.fillText(watermarkText, 0, 0);
            ctx.restore();
          }
        }
      } else {
        const textWidth = ctx.measureText(watermarkText).width;
        const textHeight = scaledFontSize;

        let x = 0;
        let y = 0;

        if (placement === 'center') {
          x = canvas.width / 2;
          y = canvas.height / 2;
          ctx.translate(x, y);
          ctx.rotate(rad);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(watermarkText, 0, 0);
        } else {
          const margin = 20 * scale;
          if (placement === 'top-left') {
            x = margin;
            y = margin + textHeight;
          } else if (placement === 'top-right') {
            x = canvas.width - textWidth - margin;
            y = margin + textHeight;
          } else if (placement === 'bottom-left') {
            x = margin;
            y = canvas.height - margin;
          } else if (placement === 'bottom-right') {
            x = canvas.width - textWidth - margin;
            y = canvas.height - margin;
          }
          ctx.translate(x, y);
          ctx.rotate(rad);
          ctx.fillText(watermarkText, 0, 0);
        }
      }
    } else if (watermarkType === 'image' && watermarkImgElement) {
      const imgW = (watermarkImgElement.width * imageScale) / 100;
      const imgH = (watermarkImgElement.height * imageScale) / 100;
      const sw = imgW * scale;
      const sh = imgH * scale;

      if (placement === 'tiled') {
        const stepX = Math.max(150 * scale, sw + 40 * scale);
        const stepY = Math.max(120 * scale, sh + 40 * scale);

        for (let gx = 20 * scale; gx < canvas.width; gx += stepX) {
          for (let gy = 20 * scale; gy < canvas.height; gy += stepY) {
            ctx.drawImage(watermarkImgElement, gx, gy, sw, sh);
          }
        }
      } else {
        let x = 0;
        let y = 0;

        if (placement === 'center') {
          x = (canvas.width - sw) / 2;
          y = (canvas.height - sh) / 2;
        } else {
          const margin = 20 * scale;
          if (placement === 'top-left') {
            x = margin;
            y = margin;
          } else if (placement === 'top-right') {
            x = canvas.width - sw - margin;
            y = margin;
          } else if (placement === 'bottom-left') {
            x = margin;
            y = canvas.height - sh - margin;
          } else if (placement === 'bottom-right') {
            x = canvas.width - sw - margin;
            y = canvas.height - sh - margin;
          }
        }
        ctx.drawImage(watermarkImgElement, x, y, sw, sh);
      }
    }

    ctx.restore();
  }

  // Hex color to rgb ratios helper
  const hexToRgbRatio = (hex: string) => {
    const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return res
      ? {
          r: parseInt(res[1], 16) / 255,
          g: parseInt(res[2], 16) / 255,
          b: parseInt(res[3], 16) / 255,
        }
      : { r: 1, g: 0, b: 0 }; // Default red
  };

  // Watermark implementation
  const addWatermarkToPdf = async () => {
    if (!pdfFile) return;
    setProcessing(true);
    setExportError('');

    try {
      const arrayBuffer = await readFileAsArrayBuffer(pdfFile);
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pageCount = pdfDoc.getPageCount();
      
      // Select standard font
      const fontMap = {
        'Helvetica': StandardFonts.Helvetica,
        'Times Roman': StandardFonts.TimesRoman,
        'Courier': StandardFonts.Courier,
      };
      const embeddedFont = await pdfDoc.embedStandardFont(fontMap[fontFamily] || StandardFonts.Helvetica);

      // Parse text color
      const rgbColor = hexToRgbRatio(textColor);
      
      // Embed watermark image if type is image
      let embeddedImage: import('pdf-lib').PDFImage | null = null;
      if (watermarkType === 'image' && watermarkImageFile) {
        const imgBytes = await readFileAsArrayBuffer(watermarkImageFile);
        if (watermarkImageFile.type === 'image/png') {
          embeddedImage = await pdfDoc.embedPng(imgBytes);
        } else {
          embeddedImage = await pdfDoc.embedJpg(imgBytes);
        }
      }

      // Calculate pages to draw on
      const targetIndices: number[] = [];
      if (pageRange === 'all') {
        for (let i = 0; i < pageCount; i++) targetIndices.push(i);
      } else if (pageRange === 'first') {
        targetIndices.push(0);
      } else if (pageRange === 'last') {
        targetIndices.push(pageCount - 1);
      } else if (pageRange === 'custom') {
        targetIndices.push(...parsePageRange(customRange, pageCount));
      }

      // De-duplicate indices
      const uniqueIndices = Array.from(new Set(targetIndices));

      // Draw watermark on each target page
      for (const idx of uniqueIndices) {
        const page = pdfDoc.getPage(idx);
        const width = page.getWidth();
        const height = page.getHeight();

        if (watermarkType === 'text') {
          const textWidth = embeddedFont.widthOfTextAtSize(watermarkText, fontSize);
          const textHeight = embeddedFont.heightAtSize(fontSize);
          const rad = (textAngle * Math.PI) / 180;

          if (placement === 'tiled') {
            const stepX = 220;
            const stepY = 180;
            for (let gx = 50; gx < width; gx += stepX) {
              for (let gy = 50; gy < height; gy += stepY) {
                page.drawText(watermarkText, {
                  x: gx,
                  y: gy,
                  size: fontSize,
                  font: embeddedFont,
                  color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
                  opacity: opacity / 100,
                  rotate: degrees(textAngle),
                });
              }
            }
          } else if (placement === 'center') {
            const cx = width / 2;
            const cy = height / 2;
            // Center calculation with rotation offset
            const drawX = cx - Math.cos(rad) * (textWidth / 2) + Math.sin(rad) * (textHeight / 2);
            const drawY = cy - Math.sin(rad) * (textWidth / 2) - Math.cos(rad) * (textHeight / 2);

            page.drawText(watermarkText, {
              x: drawX,
              y: drawY,
              size: fontSize,
              font: embeddedFont,
              color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
              opacity: opacity / 100,
              rotate: degrees(textAngle),
            });
          } else {
            // Fixed corners
            let drawX = 20;
            let drawY = 20;
            const margin = 20;

            if (placement === 'top-left') {
              drawX = margin;
              drawY = height - margin - textHeight;
            } else if (placement === 'top-right') {
              drawX = width - textWidth - margin;
              drawY = height - margin - textHeight;
            } else if (placement === 'bottom-left') {
              drawX = margin;
              drawY = margin;
            } else if (placement === 'bottom-right') {
              drawX = width - textWidth - margin;
              drawY = margin;
            }

            // Draw text rotated around corner anchors
            page.drawText(watermarkText, {
              x: drawX,
              y: drawY,
              size: fontSize,
              font: embeddedFont,
              color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
              opacity: opacity / 100,
              rotate: degrees(textAngle),
            });
          }
        } else if (watermarkType === 'image' && embeddedImage && watermarkImgElement) {
          const finalWidth = (watermarkImgElement.width * imageScale) / 100;
          const finalHeight = (watermarkImgElement.height * imageScale) / 100;

          if (placement === 'tiled') {
            const stepX = Math.max(150, finalWidth + 40);
            const stepY = Math.max(120, finalHeight + 40);

            for (let gx = 20; gx < width; gx += stepX) {
              for (let gy = 20; gy < height; gy += stepY) {
                page.drawImage(embeddedImage, {
                  x: gx,
                  y: gy,
                  width: finalWidth,
                  height: finalHeight,
                  opacity: opacity / 100,
                });
              }
            }
          } else {
            let drawX = 0;
            let drawY = 0;

            if (placement === 'center') {
              drawX = (width - finalWidth) / 2;
              drawY = (height - finalHeight) / 2;
            } else {
              const margin = 20;
              if (placement === 'top-left') {
                drawX = margin;
                drawY = height - finalHeight - margin;
              } else if (placement === 'top-right') {
                drawX = width - finalWidth - margin;
                drawY = height - finalHeight - margin;
              } else if (placement === 'bottom-left') {
                drawX = margin;
                drawY = margin;
              } else if (placement === 'bottom-right') {
                drawX = width - finalWidth - margin;
                drawY = margin;
              }
            }

            page.drawImage(embeddedImage, {
              x: drawX,
              y: drawY,
              width: finalWidth,
              height: finalHeight,
              opacity: opacity / 100,
            });
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      downloadBlob(pdfBlob(pdfBytes), outputFileName(pdfFile.name, { prefix: 'watermarked-' }));
    } catch (err) {
      console.error('Error watermarking PDF:', err);
      setExportError('Failed to apply watermark.');
    } finally {
      setProcessing(false);
    }
  };

  const colors = [
    '#ff0000', // Red
    '#0000ff', // Blue
    '#008000', // Dark Green
    '#000000', // Black
    '#808080', // Gray
    '#ffa500', // Orange
    '#800080', // Purple
  ];

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-lg backdrop-blur-md bg-card/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-bold">
            <Stamp className="h-5 w-5 text-primary" />
            PDF Watermark
          </CardTitle>
          <CardDescription>
            Overlay custom text or image stamps onto your PDF documents securely in the browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileDropzone
            intake={pdfIntake}
            label="Click to upload a PDF file"
            hint="Processed securely client-side"
            selected={pdfFile && pdfFile.name}
          />
        </CardContent>
      </Card>

      {loadError && (
        <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          <strong>Error:</strong> {loadError}
        </div>
      )}

      {rendering && (
        <div className="flex flex-col items-center justify-center p-4 sm:p-8 space-y-3">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Generating live preview...</p>
        </div>
      )}

      {pdfFile && previewLoaded && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          {/* SIDEBAR: Configuration Controls */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="border-border/60 shadow-md">
              <CardHeader className="pb-3 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold">Watermark Settings</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-5">
                {/* 1. Watermark Type */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={watermarkType === 'text' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setWatermarkType('text')}
                      className="w-full"
                    >
                      Text
                    </Button>
                    <Button
                      variant={watermarkType === 'image' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setWatermarkType('image')}
                      className="w-full"
                    >
                      Image
                    </Button>
                  </div>
                </div>

                {/* 2. Text Watermark Settings */}
                {watermarkType === 'text' && (
                  <div className="space-y-4 border rounded-xl p-3 bg-muted/10">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Watermark Text</label>
                      <Input
                        value={watermarkText}
                        onChange={(e) => setWatermarkText(e.target.value)}
                        placeholder="CONFIDENTIAL"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Font Family</label>
                        <Select
                          value={fontFamily}
                          onValueChange={(val) => setFontFamily(val as 'Helvetica' | 'Times Roman' | 'Courier')}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Helvetica">Helvetica</SelectItem>
                            <SelectItem value="Times Roman">Times Roman</SelectItem>
                            <SelectItem value="Courier">Courier</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium font-semibold">Color</label>
                        <div className="flex flex-wrap gap-1 items-center mt-1">
                          {colors.map((c) => (
                            <button
                              key={c}
                              onClick={() => setTextColor(c)}
                              className={cn(
                                "w-5 h-5 rounded-full border border-black/10 transition-transform",
                                textColor === c ? "scale-125 border-primary shadow-sm" : "hover:scale-115"
                              )}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                          <ColorPicker
                            value={textColor}
                            onChange={setTextColor}
                            showText={false}
                            className="w-5 h-5 rounded-full border border-black/10"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Font Size</span>
                        <span>{fontSize}px</span>
                      </div>
                      <Slider
                        value={fontSize}
                        onChange={(val) => setFontSize(val)}
                        min={12}
                        max={120}
                        step={1}
                        className="py-2"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Angle (Degrees)</span>
                        <span>{textAngle}°</span>
                      </div>
                      <Slider
                        value={textAngle}
                        onChange={(val) => setTextAngle(val)}
                        min={-90}
                        max={90}
                        step={1}
                        className="py-2"
                      />
                    </div>
                  </div>
                )}

                {/* 3. Image Watermark Settings */}
                {watermarkType === 'image' && (
                  <div className="space-y-4 border rounded-xl p-3 bg-muted/10">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Upload Image (PNG/JPG)</label>
                      {/* Stands in for a native file input: a button, the chosen file's name, and files can be dropped on it. */}
                      <div
                        onDragOver={imageIntake.dropzoneProps.onDragOver}
                        onDragLeave={imageIntake.dropzoneProps.onDragLeave}
                        onDrop={imageIntake.dropzoneProps.onDrop}
                        className="flex items-center gap-3 text-xs text-muted-foreground"
                      >
                        <input {...imageIntake.inputProps} aria-label="Upload watermark image (PNG/JPG)" />
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={imageIntake.open}
                          aria-label="Choose File, watermark image (PNG/JPG)"
                          className="h-auto shrink-0 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 hover:text-primary"
                        >
                          Choose File
                        </Button>
                        <span className="min-w-0 truncate">
                          {watermarkImageFile ? watermarkImageFile.name : 'No file chosen'}
                        </span>
                      </div>
                      {(imageIntake.error || imageError) && (
                        <p role="alert" className="text-xs font-medium text-destructive">
                          {imageIntake.error || imageError}
                        </p>
                      )}
                    </div>

                    {watermarkImageFile && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-medium">
                          <span>Scale</span>
                          <span>{imageScale}%</span>
                        </div>
                        <Slider
                          value={imageScale}
                          onChange={(val) => setImageScale(val)}
                          min={10}
                          max={150}
                          step={1}
                          className="py-2"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Global Watermark Settings */}
                <div className="space-y-4 border rounded-xl p-3 bg-muted/10">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span>Opacity (Transparency)</span>
                      <span>{opacity}%</span>
                    </div>
                    <Slider
                      value={opacity}
                      onChange={(val) => setOpacity(val)}
                      min={5}
                      max={100}
                      step={5}
                      className="py-2"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Placement</label>
                      <Select
                        value={placement}
                        onValueChange={(val) => setPlacement(val as typeof placement)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="center">Center</SelectItem>
                          <SelectItem value="top-left">Top-Left</SelectItem>
                          <SelectItem value="top-right">Top-Right</SelectItem>
                          <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                          <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                          <SelectItem value="tiled">Tiled Layout</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Page Range</label>
                      <Select
                        value={pageRange}
                        onValueChange={(val) => setPageRange(val as typeof pageRange)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Pages</SelectItem>
                          <SelectItem value="first">First Page</SelectItem>
                          <SelectItem value="last">Last Page</SelectItem>
                          <SelectItem value="custom">Custom Range</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {pageRange === 'custom' && (
                    <div className="space-y-1.5 animate-fadeIn">
                      <label className="text-xs font-medium">Custom Range (e.g. 1-3, 5)</label>
                      <Input
                        value={customRange}
                        onChange={(e) => setCustomRange(e.target.value)}
                        placeholder="1-3, 5"
                      />
                    </div>
                  )}
                </div>

                {exportError && (
                  <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
                    <strong>Error:</strong> {exportError}
                  </div>
                )}

                {/* 5. Export Actions */}
                <div className="flex gap-2 pt-2 border-t mt-4">
                  <Button
                    onClick={addWatermarkToPdf}
                    disabled={processing || (watermarkType === 'image' && !watermarkImageFile)}
                    className="flex-1 bg-primary hover:bg-primary/90"
                  >
                    {processing ? 'Applying Watermark...' : 'Watermark PDF'}
                    <Download className="h-4 w-4 ml-2" />
                  </Button>
                  <Button variant="outline" onClick={handleClearAll}>
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* MAIN PREVIEW: Interactive workspace layout */}
          <div className="lg:col-span-7 flex flex-col items-center justify-start space-y-3">
            <div className="w-full text-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Page 1 Preview
              </span>
            </div>
            
            <div className="relative bg-white border border-border shadow-md rounded overflow-hidden select-none max-w-full">
              {/* Background PDF render page */}
              <canvas ref={previewCanvasRef} className="block max-w-full h-auto" />
              
              {/* Foreground interactive watermark render page */}
              <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            </div>

            <div className="text-xs text-muted-foreground mt-2 text-center max-w-md">
              The preview draws the watermark on page 1 of your document in real-time. Settings will apply to all target pages when exporting.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
