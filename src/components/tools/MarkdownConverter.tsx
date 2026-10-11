'use client';

import { type CSSProperties, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { ColorPicker } from '@/components/ui/color-picker';
import { FileText, Download, Eye, Trash2, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { printHtmlDocument } from '@/lib/export/print-document';
import { saveSnapshotPdf } from '@/lib/export/snapshot-pdf';
import { downloadBlob, downloadText, sanitizeFileName } from '@/lib/files';
import {
  MARKDOWN_PREVIEW_CSS,
  buildStandaloneHtml,
  previewMarkdown,
  sourceLineOffset,
} from '@/lib/markdown';
import { firstHeadingText, scrollTextareaToOffset, sourceLineAt } from '@/lib/markdown/dom';
// Styles for the markup `previewMarkdown` emits: highlighted code and KaTeX maths.
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';

type ExportFormat = 'pdf' | 'html' | 'txt' | 'png' | 'jpg';
type PageSize = 'A4' | 'Letter';
type Orientation = 'portrait' | 'landscape';

// Exports are named after the document's first heading.
const getSafeFilename = (htmlContent: string, defaultName: string): string =>
  sanitizeFileName(firstHeadingText(htmlContent), defaultName);

const pageFormats: Record<PageSize, [number, number]> = {
  A4: [210, 297],
  Letter: [215.9, 279.4],
};

const defaultMarkdown = `# Document Title

This is a sample document to convert.

## Features

- Markdown support
- Code highlighting
- Tables and lists

## Code Example

\`\`\`javascript
function greet(name) {
  console.log(\`Hello, \${name}!\`);
}
\`\`\`

## Table

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |
| Data 3   | Data 4   |
`;

export function MarkdownConverter() {
  const [input, setInput] = useState(defaultMarkdown);
  const [html, setHtml] = useState(() => previewMarkdown.render(defaultMarkdown));
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [pageSize, setPageSize] = useState<PageSize>('A4');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [margin, setMargin] = useState(16);
  const [scale, setScale] = useState(2);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [pdfTheme, setPdfTheme] = useState<'light' | 'dark'>('light');

  const handlePdfThemeChange = (theme: 'light' | 'dark') => {
    setPdfTheme(theme);
    if (theme === 'dark') {
      setBackgroundColor('#000000');
    } else {
      setBackgroundColor('#ffffff');
    }
  };

  const [includePageNumbers, setIncludePageNumbers] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handlePreviewDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const line = sourceLineAt(e.target as HTMLElement);
    const textarea = textareaRef.current;
    if (line === null || !textarea) return;

    scrollTextareaToOffset(textarea, sourceLineOffset(input, line));
  };

  const renderMarkdown = (text: string) => {
    if (!text.trim()) {
      setHtml('');
      return;
    }

    try {
      setHtml(previewMarkdown.render(text));
    } catch {
      setHtml('<div style="color:#dc2626">Error rendering markdown</div>');
    }
  };

  const handleInputChange = (text: string) => {
    setInput(text);
    renderMarkdown(text);
  };

  const [basePageWidth, basePageHeight] = pageFormats[pageSize];
  const pageWidth = orientation === 'portrait' ? basePageWidth : basePageHeight;
  const pageHeight = orientation === 'portrait' ? basePageHeight : basePageWidth;
  const previewWidthPx = Math.round(pageWidth * 3.78);
  const previewPageStyle: CSSProperties = {
    backgroundColor,
    maxWidth: `${previewWidthPx}px`,
    minHeight: `${Math.round((pageHeight / pageWidth) * previewWidthPx)}px`,
  };

  const exportPrintPdf = () => {
    const firstHeader = firstHeadingText(html);
    const printDocument = buildStandaloneHtml({
      bodyHtml: html,
      title: firstHeader,
      theme: pdfTheme,
      backgroundColor,
      page: { size: pageSize, orientation, marginMm: margin },
    });

    printHtmlDocument(printDocument, firstHeader);
  };

  const exportHtml = () => {
    const fullHtml = buildStandaloneHtml({
      bodyHtml: html,
      title: firstHeadingText(html) || 'Markdown Export',
      theme: pdfTheme,
      backgroundColor,
    });

    downloadText(fullHtml, `${getSafeFilename(html, 'markdown-export')}.html`, 'text/html');
  };

  const exportText = () => {
    downloadText(input, `${getSafeFilename(html, 'markdown-export')}.txt`);
  };

  const exportImage = async (format: 'png' | 'jpg') => {
    if (!previewRef.current) return;

    setExportProgress(`Generating ${format.toUpperCase()}...`);

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(previewRef.current, {
        scale,
        useCORS: true,
        logging: false,
        backgroundColor,
        windowWidth: previewRef.current.scrollWidth,
        windowHeight: previewRef.current.scrollHeight,
      });

      setExportProgress('Saving image...');
      await new Promise((resolve) => setTimeout(resolve, 50));

      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          downloadBlob(blob, `${getSafeFilename(html, 'markdown-export')}.${format}`);
          setExportProgress('');
        },
        `image/${format === 'jpg' ? 'jpeg' : 'png'}`,
        0.95
      );
    } catch (error) {
      console.error(`Error exporting ${format.toUpperCase()}:`, error);
      toast.error(`Error exporting ${format.toUpperCase()}. Please try again.`);
      setExportProgress('');
    }
  };

  const exportSnapshotPdf = async () => {
    if (!previewRef.current) return;

    try {
      await saveSnapshotPdf(previewRef.current, {
        fileName: `${getSafeFilename(html, 'markdown-export')}.pdf`,
        title: firstHeadingText(html),
        pageFormat: pageFormats[pageSize],
        orientation,
        marginMm: margin,
        scale,
        backgroundColor,
        pageNumbers: includePageNumbers,
        theme: pdfTheme,
        onProgress: setExportProgress,
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Error exporting PDF. Please try again.');
    } finally {
      setExportProgress('');
    }
  };

  const handleExport = async () => {
    if (!input.trim()) {
      toast.error('Please enter markdown content first');
      return;
    }

    setExporting(true);
    setExportProgress('');

    try {
      switch (exportFormat) {
        case 'pdf':
          exportPrintPdf();
          break;
        case 'html':
          exportHtml();
          break;
        case 'txt':
          exportText();
          break;
        case 'png':
          await exportImage('png');
          break;
        case 'jpg':
          await exportImage('jpg');
          break;
      }
    } finally {
      setExporting(false);
      setExportProgress('');
    }
  };

  const handleClear = () => {
    setInput('');
    setHtml('');
  };

  const showPdfOptions = exportFormat === 'pdf';
  const showImageOptions = exportFormat === 'png' || exportFormat === 'jpg';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
        <Card className="flex h-full flex-col">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Markdown Input
            </CardTitle>
            <CardDescription>Write your markdown content.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => handleInputChange(event.currentTarget.value)}
              placeholder="# Enter your markdown here..."
              rows={18}
              className="min-h-[420px] flex-1 resize-y font-mono text-sm xl:min-h-0"
            />

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleClear} variant="outline" size="sm">
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Export Settings
            </CardTitle>
            <CardDescription>PDF uses browser print so text stays selectable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Export format</label>
                <Select
                  value={exportFormat}
                  onValueChange={(value) => setExportFormat(value as ExportFormat)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Export format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="pdf">PDF document</SelectItem>
                      <SelectItem value="html">HTML file</SelectItem>
                      <SelectItem value="txt">Plain text (Markdown)</SelectItem>
                      <SelectItem value="png">PNG image</SelectItem>
                      <SelectItem value="jpg">JPG image</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {(showPdfOptions || showImageOptions) && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Page size</label>
                  <Select
                    value={pageSize}
                    onValueChange={(value) => setPageSize(value as PageSize)}
                    disabled={exporting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Page size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="A4">A4</SelectItem>
                        <SelectItem value="Letter">Letter</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {(showPdfOptions || showImageOptions) && (
              <div className="space-y-4 rounded-md border p-3 sm:p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Orientation</label>
                    <Select
                      value={orientation}
                      onValueChange={(value) => setOrientation(value as Orientation)}
                      disabled={exporting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Orientation" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="portrait">Portrait</SelectItem>
                          <SelectItem value="landscape">Landscape</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {showPdfOptions ? 'Margins' : 'Render scale'}: {showPdfOptions ? `${margin} mm` : `${scale}x`}
                    </label>
                    {showPdfOptions ? (
                      <Slider value={margin} onChange={setMargin} min={0} max={40} step={1} />
                    ) : (
                      <Slider value={scale} onChange={setScale} min={1} max={4} step={1} />
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Background</label>
                  <ColorPicker
                    value={backgroundColor}
                    onChange={setBackgroundColor}
                    disabled={exporting}
                  />
                </div>

                {showPdfOptions && (
                  <Checkbox
                    checked={includePageNumbers}
                    onCheckedChange={setIncludePageNumbers}
                    label="Include page numbers in snapshot PDF mode"
                  />
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleExport} disabled={exporting || !input.trim()}>
                {exporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {exportProgress || 'Exporting...'}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Export as {exportFormat.toUpperCase()}
                  </>
                )}
              </Button>
              {showPdfOptions && (
                <Button
                  onClick={exportSnapshotPdf}
                  variant="outline"
                  disabled={exporting || !input.trim()}
                >
                  Snapshot PDF
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="flex h-full flex-col">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Preview
          </CardTitle>
          <CardDescription>
            Rendered markdown. Double-click a line to jump to that line in the editor
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
          <div className="flex-1 rounded-md border bg-muted/30 p-3 sm:p-4">
            <style>{MARKDOWN_PREVIEW_CSS}</style>
            <div
              ref={previewRef}
              className="markdown-print-preview mx-auto w-full overflow-hidden bg-white p-4 shadow-sm sm:p-6 lg:p-8 cursor-pointer select-text"
              style={previewPageStyle}
              dangerouslySetInnerHTML={{ __html: html }}
              onDoubleClick={handlePreviewDoubleClick}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
