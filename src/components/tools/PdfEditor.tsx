'use client';

import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  FileText,
  Upload,
  Download,
  Trash2,
  RotateCw,
  ArrowLeft,
  ArrowRight,
  Plus,
  Type,
  Edit2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Undo2,
  Trash
} from 'lucide-react';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { cn } from '@/lib/utils';

interface Point {
  x: number;
  y: number;
}

interface Path {
  points: Point[];
  color: string;
  size: number;
}

interface TextAnnotation {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

interface PageState {
  id: string;
  originalIndex: number;
  rotation: number; // 0, 90, 180, 270
  thumbnailUrl: string;
  drawPaths: Path[];
  texts: TextAnnotation[];
}

export function PdfEditor() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  
  // Annotation states
  const [activeTool, setActiveTool] = useState<'pan' | 'draw' | 'text'>('pan');
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [brushSize, setBrushSize] = useState(4);
  const [textInput, setTextInput] = useState('Double click to edit');
  const [textColor, setTextColor] = useState('#000000');
  const [textSize, setTextSize] = useState(16);
  
  // Dragging and drawing references
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfDocRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null); // pdfjs doc instance
  const workspaceRef = useRef<HTMLDivElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const isDrawing = useRef(false);
  const currentPathPoints = useRef<Point[]>([]);
  const dragStartOffset = useRef({ x: 0, y: 0 });

  const colors = [
    '#000000', // Black
    '#ffffff', // White
    '#ff0000', // Red
    '#0000ff', // Blue
    '#00ff00', // Green
    '#ffff00', // Yellow
    '#ff00ff', // Magenta
    '#00ffff', // Cyan
  ];

  // Clean up states when file clears
  const handleClearAll = () => {
    setPdfFile(null);
    setPages([]);
    setSelectedPageId(null);
    pdfDocRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadPdfFile = async (file: File) => {
    if (!file || file.type !== 'application/pdf') return;

    setPdfFile(file);
    setLoading(true);
    setPages([]);
    setSelectedPageId(null);

    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      pdfDocRef.current = pdf;

      const loadedPages: PageState[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 }); // Small thumbnail size

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({
            canvasContext: ctx,
            canvas: canvas,
            viewport: viewport,
          }).promise;

          loadedPages.push({
            id: `page-${i}-${Math.random().toString(36).substr(2, 4)}`,
            originalIndex: i - 1,
            rotation: 0,
            thumbnailUrl: canvas.toDataURL('image/png'),
            drawPaths: [],
            texts: [],
          });
        }
      }

      setPages(loadedPages);
      if (loadedPages.length > 0) {
        setSelectedPageId(loadedPages[0].id);
      }
    } catch (error) {
      console.error('Error loading PDF:', error);
      alert('Failed to load PDF file.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await loadPdfFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      await loadPdfFile(file);
    }
  };

  const selectedPage = pages.find((p) => p.id === selectedPageId) || null;

  // Render high-res page inside the annotator workspace
  useEffect(() => {
    const doc = pdfDocRef.current;
    if (!doc || !selectedPage || !pageCanvasRef.current) return;

    let active = true;

    const renderActivePage = async () => {
      try {
        const page = await doc.getPage(selectedPage.originalIndex + 1);
        
        // Render at scale 1.25 for comfortable editing. Adjust based on rotation
        const viewport = page.getViewport({
          scale: 1.25,
          rotation: (page.rotate + selectedPage.rotation) % 360,
        });

        if (!active) return;

        const canvas = pageCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: ctx,
          canvas: canvas,
          viewport: viewport,
        }).promise;

        // Sync drawing canvas sizes
        const drawCanvas = drawingCanvasRef.current;
        if (drawCanvas) {
          drawCanvas.width = viewport.width;
          drawCanvas.height = viewport.height;
          redrawDrawingCanvas(drawCanvas, selectedPage.drawPaths);
        }
      } catch (error) {
        console.error('Error rendering page preview:', error);
      }
    };

    renderActivePage();

    return () => {
      active = false;
    };
  }, [selectedPageId, selectedPage?.rotation, pages]);

  // Sync drawing canvas when paths change
  useEffect(() => {
    const drawCanvas = drawingCanvasRef.current;
    if (drawCanvas && selectedPage) {
      redrawDrawingCanvas(drawCanvas, selectedPage.drawPaths);
    }
  }, [selectedPage?.drawPaths]);

  const redrawDrawingCanvas = (canvas: HTMLCanvasElement, paths: Path[]) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    paths.forEach((path) => {
      if (path.points.length === 0) return;
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const first = path.points[0];
      ctx.moveTo(first.x * canvas.width, first.y * canvas.height);

      for (let i = 1; i < path.points.length; i++) {
        const p = path.points[i];
        ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
      }
      ctx.stroke();
    });
  };

  // Reordering, rotations and page management
  const movePage = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const newPages = [...pages];
      [newPages[index - 1], newPages[index]] = [newPages[index], newPages[index - 1]];
      setPages(newPages);
    } else if (direction === 'down' && index < pages.length - 1) {
      const newPages = [...pages];
      [newPages[index + 1], newPages[index]] = [newPages[index], newPages[index + 1]];
      setPages(newPages);
    }
  };

  const rotatePage = (id: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p))
    );
  };

  const deletePage = (id: string) => {
    const remaining = pages.filter((p) => p.id !== id);
    setPages(remaining);
    if (selectedPageId === id) {
      setSelectedPageId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // Drawings mouse handlers
  const getCanvasMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handleDrawStart = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'draw' || !selectedPage) return;
    isDrawing.current = true;
    const pos = getCanvasMousePos(e);
    currentPathPoints.current = [pos];

    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.beginPath();
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(pos.x * canvas.width, pos.y * canvas.height);
    }
  };

  const handleDrawMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || activeTool !== 'draw') return;
    const pos = getCanvasMousePos(e);
    currentPathPoints.current.push(pos);

    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas && currentPathPoints.current.length > 1) {
      const pts = currentPathPoints.current;
      const last = pts[pts.length - 2];
      ctx.lineTo(pos.x * canvas.width, pos.y * canvas.height);
      ctx.stroke();
    }
  };

  const handleDrawEnd = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (currentPathPoints.current.length > 0 && selectedPageId) {
      const newPath: Path = {
        points: currentPathPoints.current,
        color: brushColor,
        size: brushSize,
      };

      setPages((prev) =>
        prev.map((p) => (p.id === selectedPageId ? { ...p, drawPaths: [...p.drawPaths, newPath] } : p))
      );
    }
    currentPathPoints.current = [];
  };

  const handleUndo = () => {
    if (!selectedPageId) return;
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== selectedPageId) return p;
        return {
          ...p,
          drawPaths: p.drawPaths.slice(0, -1),
        };
      })
    );
  };

  // Text annotations
  const handleAddText = () => {
    if (!selectedPageId) return;
    const newText: TextAnnotation = {
      id: `text-${Math.random().toString(36).substr(2, 9)}`,
      text: textInput,
      x: 0.4,
      y: 0.4,
      size: textSize,
      color: textColor,
    };

    setPages((prev) =>
      prev.map((p) => (p.id === selectedPageId ? { ...p, texts: [...p.texts, newText] } : p))
    );
    setActiveTool('pan');
  };

  const startTextDrag = (e: React.MouseEvent, textId: string, currentX: number, currentY: number) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingTextId(textId);

    const workspace = workspaceRef.current;
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    dragStartOffset.current = {
      x: mouseX - currentX * rect.width,
      y: mouseY - currentY * rect.height,
    };
  };

  const handleWorkspaceMouseMove = (e: React.MouseEvent) => {
    if (draggingTextId && selectedPageId) {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const rect = workspace.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let nextX = (mouseX - dragStartOffset.current.x) / rect.width;
      let nextY = (mouseY - dragStartOffset.current.y) / rect.height;

      // Clamp coordinates
      nextX = Math.max(0.01, Math.min(nextX, 0.95));
      nextY = Math.max(0.01, Math.min(nextY, 0.95));

      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== selectedPageId) return p;
          return {
            ...p,
            texts: p.texts.map((t) => (t.id === draggingTextId ? { ...t, x: nextX, y: nextY } : t)),
          };
        })
      );
    }
  };

  const handleWorkspaceMouseUp = () => {
    if (draggingTextId) {
      setDraggingTextId(null);
    }
  };

  const removeText = (textId: string) => {
    if (!selectedPageId) return;
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== selectedPageId) return p;
        return {
          ...p,
          texts: p.texts.filter((t) => t.id !== textId),
        };
      })
    );
  };

  const updateTextValue = (textId: string, value: string) => {
    if (!selectedPageId) return;
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== selectedPageId) return p;
        return {
          ...p,
          texts: p.texts.map((t) => (t.id === textId ? { ...t, text: value } : t)),
        };
      })
    );
  };

  // Export PDF
  const exportEditedPdf = async () => {
    if (pages.length === 0 || !pdfFile) return;
    setExporting(true);

    try {
      const originalArrayBuffer = await pdfFile.arrayBuffer();
      const srcPdf = await PDFDocument.load(originalArrayBuffer);
      const newPdf = await PDFDocument.create();

      for (const pageState of pages) {
        const [copiedPage] = await newPdf.copyPages(srcPdf, [pageState.originalIndex]);
        const addedPage = newPdf.addPage(copiedPage);
        
        // 1. Rotate page
        const originalRotation = copiedPage.getRotation().angle;
        addedPage.setRotation(degrees((originalRotation + pageState.rotation) % 360));

        // 2. Draw annotations if any exist
        if (pageState.drawPaths.length > 0 || pageState.texts.length > 0) {
          const width = addedPage.getWidth();
          const height = addedPage.getHeight();

          // Create matching resolution canvas to render the overlay
          const renderCanvas = document.createElement('canvas');
          renderCanvas.width = width * 2; // 2x scale for high resolution
          renderCanvas.height = height * 2;

          const renderCtx = renderCanvas.getContext('2d');
          if (renderCtx) {
            renderCtx.scale(2, 2);

            // Draw paths
            pageState.drawPaths.forEach((path) => {
              if (path.points.length === 0) return;
              renderCtx.beginPath();
              renderCtx.strokeStyle = path.color;
              renderCtx.lineWidth = path.size;
              renderCtx.lineCap = 'round';
              renderCtx.lineJoin = 'round';

              const first = path.points[0];
              renderCtx.moveTo(first.x * width, first.y * height);
              for (let i = 1; i < path.points.length; i++) {
                const p = path.points[i];
                renderCtx.lineTo(p.x * width, p.y * height);
              }
              renderCtx.stroke();
            });

            // Draw texts
            pageState.texts.forEach((textAnn) => {
              renderCtx.fillStyle = textAnn.color;
              renderCtx.font = `${textAnn.size}px Helvetica, sans-serif`;
              renderCtx.textBaseline = 'top';
              renderCtx.fillText(textAnn.text, textAnn.x * width, textAnn.y * height);
            });

            // Embed PNG overlay
            const pngDataUrl = renderCanvas.toDataURL('image/png');
            const embeddedPng = await newPdf.embedPng(pngDataUrl);

            // Draw transparent overlay onto PDF page
            addedPage.drawImage(embeddedPng, {
              x: 0,
              y: 0,
              width: width,
              height: height,
            });
          }
        }
      }

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `edited-${pdfFile.name}`;
      link.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting edited PDF:', error);
      alert('Failed to generate output PDF.');
    } finally {
      setExporting(false);
    }
  };

  const formatSize = (bytes: number) => {
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    return (kb / 1024).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-lg backdrop-blur-md bg-card/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-bold">
            <Edit2 className="h-5 w-5 text-primary" />
            Edit PDF
          </CardTitle>
          <CardDescription>
            Rearrange pages, delete pages, rotate layouts, and annotate with drawings and text notes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
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
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-semibold">Drag & drop a PDF file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Files remain local on your machine</p>
            {pdfFile && (
              <div className="mt-3 inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium border border-primary/20">
                <FileText className="h-3.5 w-3.5" />
                {pdfFile.name} ({formatSize(pdfFile.size)})
              </div>
            )}
          </div>

          {pages.length > 0 && (
            <div className="mt-4 flex gap-2 flex-wrap">
              <Button onClick={exportEditedPdf} disabled={exporting} className="bg-primary hover:bg-primary/90">
                {exporting ? 'Generating PDF...' : 'Download Edited PDF'}
                <Download className="h-4 w-4 ml-2" />
              </Button>
              <Button variant="outline" onClick={handleClearAll}>
                Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className="flex flex-col items-center justify-center p-12 space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Parsing PDF and rendering pages...</p>
        </div>
      )}

      {pages.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: Page organizer thumbnails */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="border-border/60 shadow shadow-md">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-semibold flex justify-between items-center">
                  Page Layout ({pages.length} Pages)
                  <span className="text-xs font-normal text-muted-foreground">Reorder and rotate</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 max-h-[600px] overflow-y-auto scrollbar-thin space-y-3">
                {pages.map((p, index) => (
                  <div
                    key={p.id}
                    className={cn(
                      "flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer group",
                      selectedPageId === p.id
                        ? "bg-primary/5 border-primary shadow-sm"
                        : "bg-card hover:bg-muted/30 border-border/80"
                    )}
                    onClick={() => setSelectedPageId(p.id)}
                  >
                    {/* Page thumbnail view */}
                    <div className="w-16 h-20 bg-white border border-border/50 rounded overflow-hidden flex-shrink-0 relative flex items-center justify-center shadow-sm">
                      <img
                        src={p.thumbnailUrl}
                        alt={`Page ${index + 1}`}
                        className="object-contain max-h-full max-w-full"
                        style={{ transform: `rotate(${p.rotation}deg)` }}
                      />
                      <span className="absolute bottom-0.5 right-0.5 bg-slate-900/70 text-[10px] text-white px-1 rounded font-semibold">
                        {index + 1}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground">Page {index + 1}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        Source Page: {p.originalIndex + 1}
                      </p>
                      <div className="flex items-center gap-0.5 mt-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={index === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            movePage(index, 'up');
                          }}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={index === pages.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            movePage(index, 'down');
                          }}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            rotatePage(p.id);
                          }}
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePage(p.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN: Active Page Annotation Canvas */}
          <div className="lg:col-span-8">
            {selectedPage ? (
              <Card className="border-border/60 shadow shadow-md overflow-hidden flex flex-col h-full">
                {/* Annotation Controls Toolbar */}
                <div className="border-b bg-muted/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3 select-none">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      variant={activeTool === 'pan' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setActiveTool('pan')}
                      className="h-8"
                    >
                      Pan & Select
                    </Button>
                    <Button
                      variant={activeTool === 'draw' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setActiveTool('draw')}
                      className="h-8"
                    >
                      Draw / Sign
                    </Button>
                    <Button
                      variant={activeTool === 'text' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setActiveTool('text')}
                      className="h-8"
                    >
                      Add Text
                    </Button>
                  </div>

                  {activeTool === 'draw' && (
                    <div className="flex items-center gap-3 bg-muted/40 p-1 rounded-lg border text-xs">
                      {/* Color swatches */}
                      <div className="flex gap-1">
                        {colors.map((c) => (
                          <button
                            key={c}
                            onClick={() => setBrushColor(c)}
                            className={cn(
                              "w-5 h-5 rounded-full border border-black/10 transition-transform",
                              brushColor === c ? "scale-125 border-primary shadow-sm" : "hover:scale-110"
                            )}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 border-l pl-3">
                        <span>Size:</span>
                        <Slider
                          min={1}
                          max={15}
                          value={brushSize}
                          onChange={setBrushSize}
                          className="w-16 py-0"
                        />
                        <span className="w-4 text-right">{brushSize}px</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={selectedPage.drawPaths.length === 0}
                        onClick={handleUndo}
                      >
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {activeTool === 'text' && (
                    <div className="flex items-center gap-2 bg-muted/40 p-1.5 rounded-lg border text-xs flex-wrap">
                      <Input
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        className="h-7 max-w-[150px] text-xs px-2"
                        placeholder="Text to add..."
                      />
                      <div className="flex gap-1 pl-1">
                        {colors.map((c) => (
                          <button
                            key={c}
                            onClick={() => setTextColor(c)}
                            className={cn(
                              "w-4 h-4 rounded-full border border-black/10",
                              textColor === c ? "scale-125 border-primary" : "hover:scale-110"
                            )}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-1 border-l pl-2">
                        <Slider
                          min={10}
                          max={36}
                          value={textSize}
                          onChange={setTextSize}
                          className="w-16 py-0"
                        />
                        <span>{textSize}px</span>
                      </div>
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={handleAddText}>
                        <Plus className="h-3 w-3 mr-1" /> Add
                      </Button>
                    </div>
                  )}
                </div>

                {/* Workspace Canvas Layer */}
                <div className="p-4 bg-muted/30 flex items-center justify-center overflow-auto scrollbar-thin min-h-[450px]">
                  <div
                    ref={workspaceRef}
                    className="relative bg-white shadow-md rounded border border-border overflow-hidden select-none"
                    onMouseMove={handleWorkspaceMouseMove}
                    onMouseUp={handleWorkspaceMouseUp}
                    onMouseLeave={handleWorkspaceMouseUp}
                  >
                    {/* 1. Underlying PDF Render Canvas */}
                    <canvas ref={pageCanvasRef} className="block" />

                    {/* 2. Drawing Annotation Canvas */}
                    <canvas
                      ref={drawingCanvasRef}
                      className={cn(
                        "absolute inset-0 w-full h-full",
                        activeTool === 'draw' ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"
                      )}
                      onMouseDown={handleDrawStart}
                      onMouseMove={handleDrawMove}
                      onMouseUp={handleDrawEnd}
                      onMouseLeave={handleDrawEnd}
                    />

                    {/* 3. Draggable Text Annotation absolute-layer */}
                    <div className="absolute inset-0 pointer-events-none">
                      {selectedPage.texts.map((t) => (
                        <div
                          key={t.id}
                          style={{
                            left: `${t.x * 100}%`,
                            top: `${t.y * 100}%`,
                            color: t.color,
                            fontSize: `${t.size}px`,
                            fontFamily: 'Helvetica, Arial, sans-serif',
                          }}
                          className={cn(
                            "absolute pointer-events-auto cursor-move select-none p-1 rounded border border-dashed transition-all hover:bg-black/5 dark:hover:bg-white/5",
                            draggingTextId === t.id ? "border-primary bg-primary/5" : "border-transparent"
                          )}
                          onMouseDown={(e) => startTextDrag(e, t.id, t.x, t.y)}
                        >
                          {editingTextId === t.id ? (
                            <input
                              type="text"
                              value={t.text}
                              onChange={(e) => updateTextValue(t.id, e.target.value)}
                              onBlur={() => setEditingTextId(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') setEditingTextId(null);
                              }}
                              className="bg-transparent border-b border-primary outline-none px-0.5"
                              style={{ color: t.color, fontSize: `${t.size}px` }}
                              autoFocus
                            />
                          ) : (
                            <span
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setEditingTextId(t.id);
                              }}
                            >
                              {t.text}
                            </span>
                          )}

                          <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => removeText(t.id)}
                            className="ml-2 inline-flex items-center justify-center w-4 h-4 bg-destructive text-white rounded-full text-[9px] font-bold opacity-0 group-hover:opacity-100 hover:bg-destructive/90 hover:scale-110 transition-all cursor-pointer pointer-events-auto"
                            style={{ verticalAlign: 'middle' }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground flex justify-between items-center">
                  <span>Double-click text boxes to edit. Drag to position.</span>
                  {selectedPage.drawPaths.length > 0 && (
                    <span>Drawings: {selectedPage.drawPaths.length} stroke(s)</span>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="h-full border-border/60 flex items-center justify-center p-12 text-center text-muted-foreground">
                <div>
                  <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/45" />
                  <p className="text-sm font-semibold">No Page Selected</p>
                  <p className="text-xs">Choose a page from the layout list to start editing.</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
