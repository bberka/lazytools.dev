'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ColorPicker } from '@/components/ui/color-picker';
import { Download, Stamp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, loadImage, outputFileName } from '@/lib/files';
import { PDF_MIME_TYPE, openPdf, pdfBlob, type OpenedPdf } from '@/lib/pdf';
import { PdfToolError, formatPageList, type Size } from '@/lib/tools/pdf-page-ops';
import {
  layoutWatermark,
  measureWatermarkText,
  parseHexColor,
  watermarkPdf,
  type RasterizedText,
  type Watermark,
  type WatermarkFont,
  type WatermarkPages,
  type WatermarkPosition,
} from '@/lib/tools/pdf-watermark';

// The browser fonts that stand in for the built-in PDF fonts in the preview.
const PREVIEW_FONTS: Record<WatermarkFont, string> = {
  Helvetica: 'Helvetica, Arial, sans-serif',
  'Times Roman': '"Times New Roman", Times, serif',
  Courier: '"Courier New", Courier, monospace',
};

// Text the built-in PDF fonts cannot draw is added as a picture: this many
// pixels per point, on a canvas no longer than every browser can allocate.
const RASTER_SCALE = 4;
const MAX_RASTER_SIDE = 4096;

const COLORS = [
  { value: '#ff0000', name: 'Red' },
  { value: '#0000ff', name: 'Blue' },
  { value: '#008000', name: 'Dark green' },
  { value: '#000000', name: 'Black' },
  { value: '#808080', name: 'Gray' },
  { value: '#ffa500', name: 'Orange' },
  { value: '#800080', name: 'Purple' },
];

// The box of `text` in the context's current font, in the context's units.
function textBox(ctx: CanvasRenderingContext2D, text: string, fontSize: number) {
  const metrics = ctx.measureText(text);
  const ascent = metrics.fontBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent;

  return {
    width: metrics.width,
    // Older browsers do not report the font's own box.
    ascent: Number.isFinite(ascent) ? ascent : fontSize * 0.9,
    descent: Number.isFinite(descent) ? descent : fontSize * 0.25,
  };
}

// Draws text as a transparent PNG, sized in points, for the export.
function rasterizeText(text: string, cssFont: string, size: number, color: string): RasterizedText {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The watermark text could not be drawn.');

  const font = `${size}px ${cssFont}`;
  ctx.font = font;
  const box = textBox(ctx, text, size);
  const width = Math.max(box.width, 1);
  const height = Math.max(box.ascent + box.descent, 1);
  const scale = Math.min(RASTER_SCALE, MAX_RASTER_SIDE / Math.max(width, height));

  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));

  // Resizing the canvas reset its context.
  ctx.scale(scale, scale);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 0, box.ascent);

  return { png: canvas.toDataURL('image/png'), width, height, baseline: box.descent };
}

interface PreviewSettings {
  type: 'text' | 'image';
  text: string;
  font: WatermarkFont;
  fontSize: number;
  color: string;
  angle: number;
  image: HTMLImageElement | null;
  imageScale: number;
  opacity: number;
  position: WatermarkPosition;
}

// Draws the watermark over the preview of page 1. `page` is the page's size
// in points; the copies are placed by the layout the export uses.
function drawWatermarkPreview(canvas: HTMLCanvasElement, page: Size, settings: PreviewSettings) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!(page.width > 0)) return;

  // Canvas pixels per point. The layout counts up from the bottom edge of the
  // page and turns counter-clockwise; a canvas counts down from its top edge
  // and turns clockwise.
  const scale = canvas.width / page.width;

  ctx.save();
  ctx.globalAlpha = settings.opacity / 100;

  if (settings.type === 'text') {
    const scaledFontSize = settings.fontSize * scale;
    ctx.font = `${scaledFontSize}px ${PREVIEW_FONTS[settings.font]}`;
    ctx.fillStyle = settings.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // The size the export lays out: that of the built-in font or, for text it
    // cannot draw, that of the picture which replaces it.
    let mark = measureWatermarkText(settings.text, settings.font, settings.fontSize);
    if (!mark) {
      const box = textBox(ctx, settings.text, scaledFontSize);
      mark = {
        width: Math.max(box.width / scale, 1),
        height: Math.max((box.ascent + box.descent) / scale, 1),
      };
    }

    const placements = layoutWatermark(page, mark, {
      position: settings.position,
      kind: 'text',
      angle: settings.angle,
    });

    for (const placement of placements) {
      ctx.save();
      ctx.translate(placement.x * scale, (page.height - placement.y) * scale);
      ctx.rotate((-placement.rotation * Math.PI) / 180);
      ctx.fillText(settings.text, 0, 0);
      ctx.restore();
    }
  } else if (settings.image) {
    const mark = {
      width: (settings.image.width * settings.imageScale) / 100,
      height: (settings.image.height * settings.imageScale) / 100,
    };
    const placements = layoutWatermark(page, mark, { position: settings.position, kind: 'image' });

    for (const placement of placements) {
      ctx.drawImage(
        settings.image,
        placement.x * scale,
        (page.height - placement.y - mark.height) * scale,
        mark.width * scale,
        mark.height * scale
      );
    }
  }

  ctx.restore();
}

export function PdfWatermark() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [watermarkType, setWatermarkType] = useState<'text' | 'image'>('text');

  // Text Settings
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(48);
  const [fontFamily, setFontFamily] = useState<WatermarkFont>('Helvetica');
  const [textColor, setTextColor] = useState('#ff0000');
  const [textAngle, setTextAngle] = useState(-45);

  // Image Settings
  const [watermarkImageFile, setWatermarkImageFile] = useState<File | null>(null);
  const [imageScale, setImageScale] = useState(50);
  const [watermarkImgElement, setWatermarkImgElement] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState('');

  // Global Settings
  const [opacity, setOpacity] = useState(30); // 0-100 scale for slider
  const [placement, setPlacement] = useState<WatermarkPosition>('center');
  const [pageRange, setPageRange] = useState<'all' | 'first' | 'last' | 'custom'>('all');
  const [customRange, setCustomRange] = useState('1');

  const [rendering, setRendering] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  // Counts the renders of page 1 that reached the preview; 0 while there is none to draw over.
  const [previewRenders, setPreviewRenders] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exportStatus, setExportStatus] = useState('');

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const pdfDocRef = useRef<OpenedPdf | null>(null); // opened document, used for the preview
  const loadIdRef = useRef(0); // names the latest load; an older one must not install its document
  const [actualPageSize, setActualPageSize] = useState({ width: 612, height: 792 }); // Letter default

  const typeLabelId = useId();
  const textInputId = useId();
  const colorLabelId = useId();
  const customRangeId = useId();

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
    setPreviewRenders(0);
    setLoadError('');
    setExportError('');
    setExportStatus('');

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
    setPreviewRenders(0);
    setLoadError('');
    setExportError('');
    setExportStatus('');
    setWatermarkImageFile(null);
    setWatermarkImgElement(null);
    setImageError('');
    pdfIntake.reset();
    imageIntake.reset();
  };

  // Decode the watermark image for the preview
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
        if (!rendered || !active) return;

        // Sync overlay canvas size
        const overlay = overlayCanvasRef.current;
        if (overlay) {
          overlay.width = rendered.width;
          overlay.height = rendered.height;
        }
        // Resizing cleared the overlay; have the watermark drawn with the settings as they are now.
        setPreviewRenders((count) => count + 1);
      } catch (error) {
        // A render cut short by a released document is not a failure.
        if (active) console.error('Error rendering preview page:', error);
      }
    };

    renderPreview();

    return () => {
      active = false;
    };
  }, [previewLoaded]);

  // Redraw overlay when the page was rendered and when settings change
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay || previewRenders === 0) return;

    drawWatermarkPreview(overlay, actualPageSize, {
      type: watermarkType,
      text: watermarkText,
      font: fontFamily,
      fontSize,
      color: textColor,
      angle: textAngle,
      image: watermarkImgElement,
      imageScale,
      opacity,
      position: placement,
    });
  }, [
    previewRenders,
    actualPageSize,
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

  // Watermark implementation
  const addWatermarkToPdf = async () => {
    if (!pdfFile) return;
    if (watermarkType === 'image' && !watermarkImageFile) return;
    const loadId = loadIdRef.current;

    setProcessing(true);
    setExportError('');
    setExportStatus('');

    try {
      const watermark: Watermark =
        watermarkType === 'image' && watermarkImageFile
          ? { kind: 'image', image: watermarkImageFile, scale: imageScale }
          : {
              kind: 'text',
              text: watermarkText,
              font: fontFamily,
              size: fontSize,
              color: textColor,
              angle: textAngle,
              // Only used for text the chosen PDF font has no glyphs for.
              rasterize: () =>
                rasterizeText(watermarkText, PREVIEW_FONTS[fontFamily], fontSize, textColor),
            };
      const pages: WatermarkPages = pageRange === 'custom' ? { range: customRange } : pageRange;

      const marked = await watermarkPdf(pdfFile, watermark, {
        position: placement,
        opacity,
        pages,
      });
      downloadBlob(
        pdfBlob(marked.bytes),
        outputFileName(pdfFile.name, { prefix: 'watermarked-', extension: 'pdf' })
      );

      // The download was asked for; the message belongs to a file that is no longer shown.
      if (loadId !== loadIdRef.current) return;
      setExportStatus(
        `Watermark added to ${marked.pages.length === 1 ? 'page' : 'pages'} ${formatPageList(marked.pages)}.`
      );
    } catch (err) {
      console.error('Error watermarking PDF:', err);
      if (loadId !== loadIdRef.current) return;
      setExportError(err instanceof PdfToolError ? err.message : 'Failed to apply watermark.');
    } finally {
      setProcessing(false);
    }
  };

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
        <div role="status" className="flex flex-col items-center justify-center p-4 sm:p-8 space-y-3">
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
                <div className="space-y-2" role="group" aria-labelledby={typeLabelId}>
                  <p
                    id={typeLabelId}
                    className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Type
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={watermarkType === 'text' ? 'default' : 'outline'}
                      size="sm"
                      aria-pressed={watermarkType === 'text'}
                      onClick={() => setWatermarkType('text')}
                      className="w-full"
                    >
                      Text
                    </Button>
                    <Button
                      variant={watermarkType === 'image' ? 'default' : 'outline'}
                      size="sm"
                      aria-pressed={watermarkType === 'image'}
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
                      <label htmlFor={textInputId} className="text-xs font-medium">
                        Watermark Text
                      </label>
                      <Input
                        id={textInputId}
                        value={watermarkText}
                        onChange={(e) => setWatermarkText(e.target.value)}
                        placeholder="CONFIDENTIAL"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <span className="text-xs font-medium">Font Family</span>
                        <Select
                          value={fontFamily}
                          onValueChange={(val) => setFontFamily(val as WatermarkFont)}
                        >
                          <SelectTrigger className="h-9" aria-label="Font Family">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Helvetica">Helvetica</SelectItem>
                            <SelectItem value="Times Roman">Times Roman</SelectItem>
                            <SelectItem value="Courier">Courier</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5" role="group" aria-labelledby={colorLabelId}>
                        <span id={colorLabelId} className="text-xs font-medium font-semibold">
                          Color
                        </span>
                        <div className="flex flex-wrap gap-1 items-center mt-1">
                          {COLORS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              aria-label={c.name}
                              aria-pressed={textColor.toLowerCase() === c.value}
                              onClick={() => setTextColor(c.value)}
                              className={cn(
                                "w-5 h-5 rounded-full border border-black/10 transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                textColor.toLowerCase() === c.value
                                  ? "scale-125 border-primary shadow-sm"
                                  : "hover:scale-115"
                              )}
                              style={{ backgroundColor: c.value }}
                            />
                          ))}
                          {/* The picker can also hand back "none", which neither the preview nor a PDF can draw. */}
                          <ColorPicker
                            label="Custom text color"
                            value={textColor}
                            onChange={(value) => {
                              if (parseHexColor(value)) setTextColor(value);
                            }}
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
                      <Slider aria-label="Font Size"
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
                      <Slider aria-label="Angle (Degrees)"
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
                      <span className="text-xs font-medium">Upload Image (PNG/JPG)</span>
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
                        <Slider aria-label="Scale"
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
                    <Slider aria-label="Opacity (Transparency)"
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
                      <span className="text-xs font-medium">Placement</span>
                      <Select
                        value={placement}
                        onValueChange={(val) => setPlacement(val as WatermarkPosition)}
                      >
                        <SelectTrigger className="h-9" aria-label="Placement">
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
                      <span className="text-xs font-medium">Page Range</span>
                      <Select
                        value={pageRange}
                        onValueChange={(val) => setPageRange(val as typeof pageRange)}
                      >
                        <SelectTrigger className="h-9" aria-label="Page Range">
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
                    <div className="space-y-1.5">
                      <label htmlFor={customRangeId} className="text-xs font-medium">
                        Custom Range (e.g. 1-3, 5)
                      </label>
                      <Input
                        id={customRangeId}
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
                <div className="flex flex-wrap gap-2 pt-2 border-t mt-4">
                  <Button
                    onClick={addWatermarkToPdf}
                    disabled={
                      processing ||
                      (watermarkType === 'image' && !watermarkImageFile) ||
                      (watermarkType === 'text' && !watermarkText.trim())
                    }
                    className="flex-1 bg-primary hover:bg-primary/90"
                  >
                    {processing ? 'Applying Watermark...' : 'Watermark PDF'}
                    <Download className="h-4 w-4 ml-2" />
                  </Button>
                  <Button variant="outline" onClick={handleClearAll}>
                    Clear
                  </Button>
                </div>

                {exportStatus && (
                  <p role="status" className="text-xs text-muted-foreground">
                    {exportStatus}
                  </p>
                )}
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
