'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  FileText,
  Download,
  Trash2,
  RotateCw,
  Plus,
  Edit2,
  ArrowUp,
  ArrowDown,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FileDropzone } from '@/components/FileDropzone';
import { useFileIntake } from '@/hooks/useFileIntake';
import { downloadBlob, formatBytes, outputFileName, type FormatBytesOptions } from '@/lib/files';
import { PDF_MIME_TYPE, openPdf, pdfBlob, type OpenedPdf } from '@/lib/pdf';
import { buildEditedPdf } from '@/lib/tools/pdf-editor';
import { PdfToolError, type Size } from '@/lib/tools/pdf-page-ops';

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
  thumbnailUrl: string; // empty when the thumbnail could not be drawn
  drawPaths: Path[];
  texts: TextAnnotation[];
}

// The size next to the file name reads "0.5 KB", "845.3 KB", "2.4 MB".
const SIZE_FORMAT: FormatBytesOptions = { fixed: true, decimals: 1, minUnit: 'KB', maxUnit: 'MB' };

// Zoom of the page in the annotator: screen pixels per PDF point. Brush and
// text sizes are chosen at this zoom, so the export divides them by it.
const WORKSPACE_SCALE = 1.25;
// Pixels per PDF point of the annotation layer in the exported file.
const OVERLAY_SCALE = 2;
// Longest side of that layer; every browser can allocate a canvas this large.
const MAX_OVERLAY_SIDE = 4096;
// A text box in the annotator has 4px of padding inside a 1px border.
const TEXT_BOX_INSET = 5;
const ANNOTATION_FONT = 'Helvetica, Arial, sans-serif';

const COLORS = [
  { value: '#000000', name: 'Black' },
  { value: '#ffffff', name: 'White' },
  { value: '#ff0000', name: 'Red' },
  { value: '#0000ff', name: 'Blue' },
  { value: '#00ff00', name: 'Green' },
  { value: '#ffff00', name: 'Yellow' },
  { value: '#ff00ff', name: 'Magenta' },
  { value: '#00ffff', name: 'Cyan' },
];

// Draws strokes whose points are fractions of the page onto a surface of
// width x height. `lineScale` converts brush sizes into the surface's units.
function strokePaths(
  ctx: CanvasRenderingContext2D,
  paths: readonly Path[],
  width: number,
  height: number,
  lineScale = 1
) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  paths.forEach((path) => {
    if (path.points.length === 0) return;
    const first = path.points[0];
    const lineWidth = path.size * lineScale;
    ctx.beginPath();

    // A stroke of one point is a dot (a tap, the dot of an i). A line of no
    // length is not drawn, so the dot is a filled circle.
    if (path.points.length === 1) {
      ctx.fillStyle = path.color;
      ctx.arc(first.x * width, first.y * height, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.strokeStyle = path.color;
    ctx.lineWidth = lineWidth;
    ctx.moveTo(first.x * width, first.y * height);

    for (let i = 1; i < path.points.length; i++) {
      const p = path.points[i];
      ctx.lineTo(p.x * width, p.y * height);
    }
    ctx.stroke();
  });
}

// Draws a page's annotations on a transparent layer in the shape the page is
// shown in (`size`, in points) and returns it as a PNG. Null when there are none.
function paintAnnotations(page: PageState, size: Size): string | null {
  if (page.drawPaths.length === 0 && page.texts.length === 0) return null;

  const scale = Math.min(OVERLAY_SCALE, MAX_OVERLAY_SIDE / Math.max(size.width, size.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(size.width * scale));
  canvas.height = Math.max(1, Math.round(size.height * scale));

  const ctx = canvas.getContext('2d');
  // Carrying on would export the page without what was drawn on it.
  if (!ctx) throw new Error('The annotation layer could not be created.');

  // From here on one unit is one PDF point.
  ctx.scale(canvas.width / size.width, canvas.height / size.height);

  strokePaths(ctx, page.drawPaths, size.width, size.height, 1 / WORKSPACE_SCALE);

  const inset = TEXT_BOX_INSET / WORKSPACE_SCALE;
  ctx.textBaseline = 'alphabetic';
  page.texts.forEach((textAnn) => {
    const fontSize = textAnn.size / WORKSPACE_SCALE;
    ctx.fillStyle = textAnn.color;
    ctx.font = `${fontSize}px ${ANNOTATION_FONT}`;

    // A text box sets its text on a line as tall as the font size, and the
    // browser centres the font's own ascent and descent in that line.
    const metrics = ctx.measureText(textAnn.text);
    const ascent = Number.isFinite(metrics.fontBoundingBoxAscent)
      ? metrics.fontBoundingBoxAscent
      : fontSize * 0.9;
    const descent = Number.isFinite(metrics.fontBoundingBoxDescent)
      ? metrics.fontBoundingBoxDescent
      : fontSize * 0.2;
    const baseline = inset + (fontSize - ascent - descent) / 2 + ascent;

    ctx.fillText(textAnn.text, textAnn.x * size.width + inset, textAnn.y * size.height + baseline);
  });

  return canvas.toDataURL('image/png');
}

// Gives a canvas's pixels back right away instead of waiting for garbage collection.
function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

export function PdfEditor() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

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
  // Counts the page renders that reached the workspace; the strokes are redrawn after each.
  const [workspaceVersion, setWorkspaceVersion] = useState(0);

  const pdfDocRef = useRef<OpenedPdf | null>(null); // opened document, used for page previews
  const loadIdRef = useRef(0); // names the latest load; an older one must not install its document
  const workspaceRef = useRef<HTMLDivElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);

  const isDrawing = useRef(false);
  const currentPathPoints = useRef<Point[]>([]);
  const dragStartOffset = useRef({ x: 0, y: 0 });

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
    setLoading(true);
    setPages([]);
    setSelectedPageId(null);
    setError('');

    // One canvas for every thumbnail; a canvas per page adds up on long documents.
    const thumbnailCanvas = document.createElement('canvas');

    try {
      const pdf = await openPdf(file);
      // Replaced, cleared or unmounted while the file was being opened.
      if (loadId !== loadIdRef.current) {
        void pdf.destroy();
        return;
      }
      pdfDocRef.current = pdf;

      const loadedPages: PageState[] = [];
      for (let i = 1; i <= pdf.pageCount; i++) {
        const page = await pdf.page(i);
        // Small thumbnail size
        const thumbnail = await page.render({ scale: 0.3, canvas: thumbnailCanvas });
        // The document was released under this load; whoever did that owns the state now.
        if (loadId !== loadIdRef.current) return;

        // A page whose thumbnail cannot be drawn stays in the list; leaving
        // it out would silently drop it from the exported file.
        loadedPages.push({
          id: `page-${i}-${Math.random().toString(36).slice(2, 6)}`,
          originalIndex: i - 1,
          rotation: 0,
          thumbnailUrl: thumbnail ? thumbnail.canvas.toDataURL('image/png') : '',
          drawPaths: [],
          texts: [],
        });
      }

      setPages(loadedPages);
      if (loadedPages.length > 0) {
        setSelectedPageId(loadedPages[0].id);
      }
    } catch (loadError) {
      // A load that was superseded fails because its document was released.
      if (loadId !== loadIdRef.current) return;
      console.error('Error loading PDF:', loadError);
      releaseDocument();
      setError('Failed to load PDF file.');
    } finally {
      releaseCanvas(thumbnailCanvas);
      if (loadId === loadIdRef.current) setLoading(false);
    }
  };

  // The intake only passes PDFs on; anything else is reported in the drop area.
  const intake = useFileIntake({
    accept: PDF_MIME_TYPE,
    onFiles: ([file]) => loadPdfFile(file),
  });

  // Clean up states when file clears
  const handleClearAll = () => {
    loadIdRef.current += 1;
    releaseDocument();
    setPdfFile(null);
    setPages([]);
    setSelectedPageId(null);
    setLoading(false);
    setError('');
    intake.reset();
  };

  const selectedPage = pages.find((p) => p.id === selectedPageId) || null;
  const selectedSourceIndex = selectedPage ? selectedPage.originalIndex : null;
  const selectedRotation = selectedPage ? selectedPage.rotation : 0;
  const selectedPaths = selectedPage ? selectedPage.drawPaths : null;

  // Render high-res page inside the annotator workspace. Only another page or
  // another rotation calls for it; annotations live on their own layers.
  useEffect(() => {
    const doc = pdfDocRef.current;
    if (!doc || selectedSourceIndex === null) return;

    let active = true;

    const renderActivePage = async () => {
      try {
        const page = await doc.page(selectedSourceIndex + 1);

        if (!active) return;

        // Render at scale 1.25 for comfortable editing. Adjust based on rotation.
        // The page is drawn on a canvas of its own and copied over when it is
        // complete: pdfjs refuses a second render on a canvas that is still
        // being drawn on, and a render that was overtaken must not paint over
        // the page that replaced it.
        const rendered = await page.render({
          scale: WORKSPACE_SCALE,
          rotation: selectedRotation,
        });
        if (!rendered) return;

        const canvas = pageCanvasRef.current;
        if (active && canvas) {
          canvas.width = rendered.canvas.width;
          canvas.height = rendered.canvas.height;
          canvas.getContext('2d')?.drawImage(rendered.canvas, 0, 0);

          // Sync drawing canvas sizes
          const drawCanvas = drawingCanvasRef.current;
          if (drawCanvas) {
            drawCanvas.width = canvas.width;
            drawCanvas.height = canvas.height;
          }
          // Resizing cleared the strokes; have them redrawn as they are now.
          setWorkspaceVersion((version) => version + 1);
        }
        releaseCanvas(rendered.canvas);
      } catch (renderError) {
        // A render cut short by a page change or a released document is not a failure.
        if (active) console.error('Error rendering page preview:', renderError);
      }
    };

    renderActivePage();

    return () => {
      active = false;
    };
  }, [selectedSourceIndex, selectedRotation]);

  // Sync drawing canvas when paths change
  useEffect(() => {
    const drawCanvas = drawingCanvasRef.current;
    const ctx = drawCanvas?.getContext('2d');
    if (!drawCanvas || !ctx || !selectedPaths) return;

    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    strokePaths(ctx, selectedPaths, drawCanvas.width, drawCanvas.height);
  }, [selectedPaths, workspaceVersion]);

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

  // Drawing handlers. Pointer events cover mouse, pen and touch alike.
  const getCanvasPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handleDrawStart = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'draw' || !selectedPage || !e.isPrimary || e.button !== 0) return;
    isDrawing.current = true;
    const pos = getCanvasPointerPos(e);
    currentPathPoints.current = [pos];

    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      // Show the first point at once; if the pointer never moves it stays a dot.
      strokePaths(
        ctx,
        [{ points: [pos], color: brushColor, size: brushSize }],
        canvas.width,
        canvas.height
      );
      ctx.beginPath();
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.moveTo(pos.x * canvas.width, pos.y * canvas.height);
    }
  };

  const handleDrawMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || activeTool !== 'draw' || !e.isPrimary) return;
    const pos = getCanvasPointerPos(e);
    currentPathPoints.current.push(pos);

    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas && currentPathPoints.current.length > 1) {
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
      id: `text-${Math.random().toString(36).slice(2, 11)}`,
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

  const startTextDrag = (e: React.PointerEvent, textId: string, currentX: number, currentY: number) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingTextId(textId);

    const workspace = workspaceRef.current;
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;

    dragStartOffset.current = {
      x: pointerX - currentX * rect.width,
      y: pointerY - currentY * rect.height,
    };
  };

  const handleWorkspacePointerMove = (e: React.PointerEvent) => {
    if (draggingTextId && selectedPageId) {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const rect = workspace.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;

      let nextX = (pointerX - dragStartOffset.current.x) / rect.width;
      let nextY = (pointerY - dragStartOffset.current.y) / rect.height;

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

  const handleWorkspacePointerUp = () => {
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
    const loadId = loadIdRef.current;
    setExporting(true);
    setError('');

    try {
      const pdfBytes = await buildEditedPdf(
        pdfFile,
        pages.map((p) => ({ sourceIndex: p.originalIndex, rotation: p.rotation })),
        (pageIndex, size) => paintAnnotations(pages[pageIndex], size)
      );
      downloadBlob(
        pdfBlob(pdfBytes),
        outputFileName(pdfFile.name, { prefix: 'edited-', extension: 'pdf' })
      );
    } catch (exportError) {
      console.error('Error exporting edited PDF:', exportError);
      // The message belongs to the file that was exported, not to one loaded since.
      if (loadId === loadIdRef.current) {
        setError(
          exportError instanceof PdfToolError ? exportError.message : 'Failed to generate output PDF.'
        );
      }
    } finally {
      setExporting(false);
    }
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
          <FileDropzone
            intake={intake}
            label="Drag & drop a PDF file here or click to browse"
            hint="Files remain local on your machine"
            selected={
              pdfFile && (
                <>
                  <FileText className="h-3.5 w-3.5" />
                  {pdfFile.name} ({formatBytes(pdfFile.size, SIZE_FORMAT)})
                </>
              )
            }
          />

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

      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && (
        <div role="status" className="flex flex-col items-center justify-center p-6 sm:p-12 space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Parsing PDF and rendering pages...</p>
        </div>
      )}

      {pages.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          {/* LEFT COLUMN: Page organizer thumbnails */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="border-border/60 shadow shadow-md">
              <CardHeader className="py-4">
                <CardTitle className="text-sm font-semibold flex justify-between items-center">
                  Page Layout ({pages.length} {pages.length === 1 ? 'Page' : 'Pages'})
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
                    {/* Page thumbnail view. It is the button that selects the page for keyboard users; a click anywhere on the row does the same. */}
                    <button
                      type="button"
                      aria-label={`Select page ${index + 1}`}
                      aria-pressed={selectedPageId === p.id}
                      className="w-16 h-20 bg-white border border-border/50 rounded overflow-hidden flex-shrink-0 relative flex items-center justify-center shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {p.thumbnailUrl && (
                        <img
                          src={p.thumbnailUrl}
                          alt=""
                          className="object-contain max-h-full max-w-full"
                          style={{ transform: `rotate(${p.rotation}deg)` }}
                        />
                      )}
                      <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-[10px] text-white px-1 rounded font-semibold">
                        {index + 1}
                      </span>
                    </button>

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
                          aria-label={`Move page ${index + 1} up`}
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
                          aria-label={`Move page ${index + 1} down`}
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
                          aria-label={`Rotate page ${index + 1}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            rotatePage(p.id);
                          }}
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </Button>
                        {/* The last page stays: a PDF needs one, and with none left there is nothing to export or clear. */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          aria-label={`Delete page ${index + 1}`}
                          disabled={pages.length === 1}
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
                      aria-pressed={activeTool === 'pan'}
                      onClick={() => setActiveTool('pan')}
                      className="h-8"
                    >
                      Pan & Select
                    </Button>
                    <Button
                      variant={activeTool === 'draw' ? 'default' : 'outline'}
                      size="sm"
                      aria-pressed={activeTool === 'draw'}
                      onClick={() => setActiveTool('draw')}
                      className="h-8"
                    >
                      Draw / Sign
                    </Button>
                    <Button
                      variant={activeTool === 'text' ? 'default' : 'outline'}
                      size="sm"
                      aria-pressed={activeTool === 'text'}
                      onClick={() => setActiveTool('text')}
                      className="h-8"
                    >
                      Add Text
                    </Button>
                  </div>

                  {activeTool === 'draw' && (
                    <div className="flex flex-wrap items-center gap-3 bg-muted/40 p-1 rounded-lg border text-xs">
                      {/* Color swatches */}
                      <div className="flex gap-1">
                        {COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            aria-label={`${c.name} brush`}
                            aria-pressed={brushColor === c.value}
                            onClick={() => setBrushColor(c.value)}
                            className={cn(
                              "w-5 h-5 rounded-full border border-black/10 transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              brushColor === c.value ? "scale-125 border-primary shadow-sm" : "hover:scale-110"
                            )}
                            style={{ backgroundColor: c.value }}
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
                        <span className="w-8 text-right">{brushSize}px</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Undo last stroke"
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
                        aria-label="Text to add"
                      />
                      <div className="flex gap-1 pl-1">
                        {COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            aria-label={`${c.name} text`}
                            aria-pressed={textColor === c.value}
                            onClick={() => setTextColor(c.value)}
                            className={cn(
                              "w-4 h-4 rounded-full border border-black/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              textColor === c.value ? "scale-125 border-primary" : "hover:scale-110"
                            )}
                            style={{ backgroundColor: c.value }}
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
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={!textInput.trim()}
                        onClick={handleAddText}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add
                      </Button>
                    </div>
                  )}
                </div>

                {/* Workspace Canvas Layer. The page keeps its size and the area scrolls; auto margins centre it without cutting off its left side when it is wider than the area. */}
                <div className="p-4 bg-muted/30 flex overflow-auto scrollbar-thin min-h-[450px]">
                  <div
                    ref={workspaceRef}
                    className="relative m-auto shrink-0 bg-white shadow-md rounded border border-border overflow-hidden select-none"
                    onPointerMove={handleWorkspacePointerMove}
                    onPointerUp={handleWorkspacePointerUp}
                    onPointerLeave={handleWorkspacePointerUp}
                    onPointerCancel={handleWorkspacePointerUp}
                  >
                    {/* 1. Underlying PDF Render Canvas */}
                    <canvas ref={pageCanvasRef} className="block" />

                    {/* 2. Drawing Annotation Canvas */}
                    <canvas
                      ref={drawingCanvasRef}
                      className={cn(
                        "absolute inset-0 w-full h-full",
                        activeTool === 'draw'
                          ? "cursor-crosshair pointer-events-auto touch-none"
                          : "pointer-events-none"
                      )}
                      onPointerDown={handleDrawStart}
                      onPointerMove={handleDrawMove}
                      onPointerUp={handleDrawEnd}
                      onPointerLeave={handleDrawEnd}
                      onPointerCancel={handleDrawEnd}
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
                            fontFamily: ANNOTATION_FONT,
                          }}
                          // One line as tall as the font size, with nothing else on it:
                          // the export places the text by exactly this box.
                          className={cn(
                            "group absolute pointer-events-auto cursor-move select-none touch-none whitespace-nowrap leading-none p-1 rounded border border-dashed transition-all hover:bg-black/5",
                            draggingTextId === t.id ? "border-primary bg-primary/5" : "border-transparent"
                          )}
                          onPointerDown={(e) => startTextDrag(e, t.id, t.x, t.y)}
                        >
                          {editingTextId === t.id ? (
                            <input
                              type="text"
                              aria-label="Annotation text"
                              value={t.text}
                              onChange={(e) => updateTextValue(t.id, e.target.value)}
                              onBlur={() => setEditingTextId(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') setEditingTextId(null);
                              }}
                              // A press inside the field places the caret; it does not start a drag.
                              onPointerDown={(e) => e.stopPropagation()}
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
                            type="button"
                            aria-label="Remove text"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => removeText(t.id)}
                            className="absolute left-full top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-4 h-4 bg-destructive text-destructive-foreground rounded-full text-[9px] font-bold opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 hover:bg-destructive/90 hover:scale-110 transition-all cursor-pointer pointer-events-auto"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground flex flex-wrap justify-between items-center gap-x-3">
                  <span>Double-click text boxes to edit. Drag to position.</span>
                  {selectedPage.drawPaths.length > 0 && (
                    <span>Drawings: {selectedPage.drawPaths.length} stroke(s)</span>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="h-full border-border/60 flex items-center justify-center p-6 sm:p-12 text-center text-muted-foreground">
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
