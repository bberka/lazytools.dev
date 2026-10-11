'use client';

import { type CSSProperties, useMemo, useRef, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
import { useCopyToClipboard } from '@/hooks';
import { useFileIntake } from '@/hooks/useFileIntake';
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  FileText,
  FileUp,
  Loader2,
  Printer,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { printHtmlDocument } from '@/lib/export/print-document';
import { saveSnapshotPdf } from '@/lib/export/snapshot-pdf';
import { downloadText, readFileAsText, sanitizeFileName } from '@/lib/files';
import {
  PAGE_FORMATS_MM,
  escapeHtml,
  previewPageSize,
  type PageFormatName,
  type PageOrientation,
} from '@/lib/tools/document-export';
import { htmlToMarkdown, htmlToPlainText } from '@/lib/tools/html-converter';

type ExportFormat = 'pdf' | 'md' | 'html' | 'txt';
type PageSize = PageFormatName;
type Orientation = PageOrientation;
type PdfTheme = 'light' | 'dark';

type PreviewDocumentOptions = {
  readonly html: string;
  readonly styleTag: string;
  readonly backgroundColor: string;
  readonly pdfTheme: PdfTheme;
  readonly pageStyle: CSSProperties;
};

const sampleHtml = `<article>
  <h1>Release Notes</h1>
  <p>This example document can be exported as <strong>PDF</strong>, Markdown, HTML, or plain text.</p>

  <h2>Highlights</h2>
  <ul>
    <li>Client-side conversion</li>
    <li>Custom PDF page setup</li>
    <li>Optional print CSS support</li>
  </ul>

  <blockquote>
    <p>Use the print CSS box to hide controls, force page breaks, or tune spacing for exported files.</p>
  </blockquote>

  <h2>Table</h2>
  <table>
    <thead>
      <tr><th>Area</th><th>Status</th></tr>
    </thead>
    <tbody>
      <tr><td>Preview</td><td>Ready</td></tr>
      <tr><td>Export</td><td>Ready</td></tr>
    </tbody>
  </table>
</article>`;

const defaultPrintCss = `h1, h2, h3 {
  page-break-after: avoid;
}

table, blockquote, pre {
  page-break-inside: avoid;
}`;

const basePreviewCss = `
.html-converter-preview {
  background: #ffffff;
  color: #111827;
  color-scheme: light;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 16px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  box-sizing: border-box;
}

.html-converter-preview * {
  box-sizing: border-box;
}

.html-converter-preview p,
.html-converter-preview li,
.html-converter-preview a,
.html-converter-preview td,
.html-converter-preview th,
.html-converter-preview dd,
.html-converter-preview dt,
.html-converter-preview figcaption {
  color: #111827;
}

.html-converter-preview a {
  color: #2563eb;
  text-decoration: underline;
}

.html-converter-preview h1,
.html-converter-preview h2,
.html-converter-preview h3 {
  color: #111827;
  line-height: 1.25;
  margin: 1.35em 0 0.55em;
}

.html-converter-preview h1 {
  font-size: 2rem;
}

.html-converter-preview h2 {
  font-size: 1.5rem;
}

.html-converter-preview p,
.html-converter-preview ul,
.html-converter-preview ol,
.html-converter-preview blockquote,
.html-converter-preview table,
.html-converter-preview pre {
  margin: 0 0 1rem;
}

.html-converter-preview blockquote {
  border-left: 4px solid #d1d5db;
  color: #4b5563;
  padding-left: 1rem;
}

.html-converter-preview code,
.html-converter-preview pre {
  background: #f3f4f6;
  border-radius: 0.375rem;
}

.html-converter-preview code {
  padding: 0.125rem 0.25rem;
}

.html-converter-preview pre {
  overflow-x: auto;
  padding: 1rem;
}

.html-converter-preview table {
  border-collapse: collapse;
  width: 100%;
}

.html-converter-preview th,
.html-converter-preview td {
  border: 1px solid #d1d5db;
  padding: 0.5rem 0.65rem;
  text-align: left;
}

.html-converter-preview th {
  background: #f9fafb;
}

/* Dark theme overrides */
.html-converter-preview.dark-pdf {
  color: #ffffff;
  color-scheme: dark;
}

.html-converter-preview.dark-pdf p,
.html-converter-preview.dark-pdf li,
.html-converter-preview.dark-pdf td,
.html-converter-preview.dark-pdf th,
.html-converter-preview.dark-pdf dd,
.html-converter-preview.dark-pdf dt,
.html-converter-preview.dark-pdf figcaption {
  color: #f3f4f6;
}

.html-converter-preview.dark-pdf a {
  color: #60a5fa;
}

.html-converter-preview.dark-pdf h1,
.html-converter-preview.dark-pdf h2,
.html-converter-preview.dark-pdf h3 {
  color: #ffffff;
}

.html-converter-preview.dark-pdf blockquote {
  border-left-color: #4b5563;
  color: #9ca3af;
}

.html-converter-preview.dark-pdf code,
.html-converter-preview.dark-pdf pre {
  background: #1f2937;
  color: #f3f4f6;
}

.html-converter-preview.dark-pdf th,
.html-converter-preview.dark-pdf td {
  border-color: #374151;
}

.html-converter-preview.dark-pdf th {
  background: #111827;
}
`;

const pageLabels: Record<PageSize, string> = {
  A4: 'A4',
  Letter: 'Letter',
  Legal: 'Legal',
};

function isPdfTheme(value: string): value is PdfTheme {
  return value === 'light' || value === 'dark';
}

function splitHtmlDocument(html: string): { readonly head: string; readonly body: string } {
  if (typeof window === 'undefined') {
    return { head: '', body: html };
  }

  const containsDocumentShell = /<(?:!doctype|html|head|body)\b/i.test(html);
  if (!containsDocumentShell) {
    return { head: '', body: html };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  return {
    head: doc.head.innerHTML,
    body: doc.body.innerHTML,
  };
}

function buildPreviewDocument(options: PreviewDocumentOptions): string {
  const documentParts = splitHtmlDocument(options.html);
  const pageStyles = Object.entries(options.pageStyle)
    .map(([property, value]) => `${property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}: ${value};`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${documentParts.head}
  <style>
    html,
    body {
      margin: 0;
      min-height: 100%;
      background: ${options.backgroundColor};
    }

    body {
      padding: 1rem;
    }

    .html-converter-preview {
      ${pageStyles}
    }

    ${options.styleTag}
  </style>
</head>
<body>
  <main class="html-converter-preview ${options.pdfTheme === 'dark' ? 'dark-pdf' : ''}">
    ${documentParts.body}
  </main>
</body>
</html>`;
}

export function HtmlConverter() {
  const [input, setInput] = useState(sampleHtml);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [pageSize, setPageSize] = useState<PageSize>('A4');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [margin, setMargin] = useState(16);
  const [scale, setScale] = useState(2);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [pdfTheme, setPdfTheme] = useState<PdfTheme>('light');

  const handlePdfThemeChange = (theme: PdfTheme) => {
    setPdfTheme(theme);
    if (theme === 'dark') {
      setBackgroundColor('#000000');
    } else {
      setBackgroundColor('#ffffff');
    }
  };
  const [filename, setFilename] = useState('html-export');
  const [includePageNumbers, setIncludePageNumbers] = useState(false);
  const [applyPrintCss, setApplyPrintCss] = useState(true);
  const [printCss, setPrintCss] = useState(defaultPrintCss);
  // Which of the two export buttons is at work, so that one shows the progress.
  const [activeExport, setActiveExport] = useState<'format' | 'snapshot' | null>(null);
  const exporting = activeExport !== null;
  const [exportProgress, setExportProgress] = useState('');
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  // One per copy button, so "Copied" shows only on the button that was pressed.
  const inputCopy = useCopyToClipboard();
  const exportCopy = useCopyToClipboard();
  const outputCopy = useCopyToClipboard();

  const { markdownOutput, plainTextOutput } = useMemo(() => {
    if (typeof window === 'undefined') {
      return { markdownOutput: '', plainTextOutput: '' };
    }

    const { body } = new DOMParser().parseFromString(input, 'text/html');
    return { markdownOutput: htmlToMarkdown(body), plainTextOutput: htmlToPlainText(body) };
  }, [input]);

  const styleTag = `${basePreviewCss}\n${applyPrintCss ? printCss : ''}`;
  const safeFilename = sanitizeFileName(filename, 'html-export');
  const previewSize = previewPageSize(pageSize, orientation);
  const previewPageStyle: CSSProperties = {
    backgroundColor,
    maxWidth: `${previewSize.width}px`,
    minHeight: `${previewSize.minHeight}px`,
  };
  const previewDocument = buildPreviewDocument({
    html: input,
    styleTag,
    backgroundColor,
    pdfTheme,
    pageStyle: previewPageStyle,
  });

  const exportPrintPdf = () => {
    const pageRule = `${pageLabels[pageSize]} ${orientation}`;
    const printDocument = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(safeFilename)}</title>
  <style>
    @page {
      size: ${pageRule};
      margin: ${margin}mm;
    }

    html,
    body {
      margin: 0;
      background: ${backgroundColor};
      min-height: 100%;
    }

    .html-converter-preview {
      min-height: auto;
      padding: 0;
    }

    ${styleTag}

    @media print {
      html,
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <main class="html-converter-preview ${pdfTheme === 'dark' ? 'dark-pdf' : ''}">
    ${input}
  </main>
</body>
</html>`;

    printHtmlDocument(printDocument, safeFilename);
  };

  const exportSnapshotPdf = async () => {
    const previewDocumentElement =
      previewFrameRef.current?.contentDocument?.querySelector<HTMLElement>(
        '.html-converter-preview'
      );

    if (!previewDocumentElement) {
      toast.error('The preview is not ready yet. Please try again in a moment.');
      return;
    }

    setActiveExport('snapshot');

    try {
      await saveSnapshotPdf(previewDocumentElement, {
        fileName: `${safeFilename}.pdf`,
        pageFormat: PAGE_FORMATS_MM[pageSize],
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
      setActiveExport(null);
      setExportProgress('');
    }
  };

  const handleExport = async () => {
    if (!input.trim()) {
      return;
    }

    setActiveExport('format');
    setExportProgress('');

    try {
      switch (exportFormat) {
        case 'pdf':
          exportPrintPdf();
          break;
        case 'md':
          downloadText(markdownOutput, `${safeFilename}.md`, 'text/markdown');
          break;
        case 'html':
          downloadText(input, `${safeFilename}.html`, 'text/html');
          break;
        case 'txt':
          downloadText(plainTextOutput, `${safeFilename}.txt`, 'text/plain');
          break;
      }
    } finally {
      setActiveExport(null);
      setExportProgress('');
    }
  };

  const clearInput = () => {
    setInput('');
  };

  const importHtmlFile = (file: File) => {
    readFileAsText(file)
      .then(setInput)
      .catch(() => toast.error('Failed to read file'));
  };

  // The picker suggests HTML files (set on the input below) but any file is
  // taken: whatever text it holds becomes the input.
  const intake = useFileIntake({ onFiles: ([file]) => importHtmlFile(file) });

  // What the export button saves, and what the Text Output card shows.
  const currentOutput =
    exportFormat === 'md' ? markdownOutput : exportFormat === 'txt' ? plainTextOutput : input;
  const shownOutput = exportFormat === 'txt' ? plainTextOutput : markdownOutput;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
        <Card className="flex h-full flex-col">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2">
              <Code2 className="h-5 w-5" />
              HTML Input
            </CardTitle>
            <CardDescription>Paste a complete document or an HTML fragment.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.currentTarget.value)}
              placeholder="<article>...</article>"
              aria-label="HTML input"
              rows={18}
              className="min-h-[420px] flex-1 resize-y font-mono text-sm xl:min-h-0"
            />

            <div className="flex flex-wrap gap-2">
              <input
                {...intake.inputProps}
                accept=".html,.htm,text/html"
                aria-label="Import HTML file"
              />
              <Button
                onClick={intake.open}
                variant="outline"
                size="sm"
                disabled={exporting}
              >
                <FileUp className="h-4 w-4" />
                Import HTML
              </Button>
              <Button
                onClick={() => inputCopy.copyToClipboard(input)}
                variant={inputCopy.isCopied ? 'default' : 'outline'}
                size="sm"
                disabled={!input}
              >
                {inputCopy.isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {inputCopy.isCopied ? 'Copied' : inputCopy.isError ? 'Copy failed' : 'Copy HTML'}
              </Button>
              <Button onClick={clearInput} variant="outline" size="sm">
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
            <CardDescription>Configure output files and PDF rendering.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label id="html-export-format" className="text-sm font-medium">
                  Format
                </label>
                <Select
                  value={exportFormat}
                  onValueChange={(value) => setExportFormat(value as ExportFormat)}
                  disabled={exporting}
                >
                  <SelectTrigger aria-labelledby="html-export-format">
                    <SelectValue placeholder="Format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="pdf">PDF document</SelectItem>
                      <SelectItem value="md">Markdown</SelectItem>
                      <SelectItem value="html">HTML file</SelectItem>
                      <SelectItem value="txt">Plain text</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label htmlFor="html-export-filename" className="text-sm font-medium">
                  Filename
                </label>
                <Input
                  id="html-export-filename"
                  value={filename}
                  onChange={(event) => setFilename(event.currentTarget.value)}
                  disabled={exporting}
                />
              </div>
            </div>

            {exportFormat === 'pdf' ? (
              <div className="space-y-4 rounded-md border p-3 sm:p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label id="html-export-page-size" className="text-sm font-medium">
                      Page size
                    </label>
                    <Select
                      value={pageSize}
                      onValueChange={(value) => setPageSize(value as PageSize)}
                      disabled={exporting}
                    >
                      <SelectTrigger aria-labelledby="html-export-page-size">
                        <SelectValue placeholder="Page size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="A4">A4</SelectItem>
                          <SelectItem value="Letter">Letter</SelectItem>
                          <SelectItem value="Legal">Legal</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label id="html-export-orientation" className="text-sm font-medium">
                      Orientation
                    </label>
                    <Select
                      value={orientation}
                      onValueChange={(value) => setOrientation(value as Orientation)}
                      disabled={exporting}
                    >
                      <SelectTrigger aria-labelledby="html-export-orientation">
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
                </div>

                <div className="space-y-2" role="group" aria-labelledby="html-export-margins">
                  <label id="html-export-margins" className="text-sm font-medium">
                    Margins: {margin} mm
                  </label>
                  <Slider
                    value={margin}
                    onChange={setMargin}
                    min={0}
                    max={40}
                    step={1}
                    disabled={exporting}
                  />
                </div>

                <div className="space-y-2" role="group" aria-labelledby="html-export-scale">
                  <label id="html-export-scale" className="text-sm font-medium">
                    Render scale: {scale}x
                  </label>
                  <Slider
                    value={scale}
                    onChange={setScale}
                    min={1}
                    max={4}
                    step={1}
                    disabled={exporting}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label id="html-export-theme" className="text-sm font-medium">
                      PDF theme
                    </label>
                    <Select
                      value={pdfTheme}
                      onValueChange={(value) => {
                        if (isPdfTheme(value)) {
                          handlePdfThemeChange(value);
                        }
                      }}
                      disabled={exporting}
                    >
                      <SelectTrigger aria-labelledby="html-export-theme">
                        <SelectValue placeholder="PDF theme" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="light">Light Mode</SelectItem>
                          <SelectItem value="dark">Dark Mode</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div
                    className="space-y-2"
                    role="group"
                    aria-labelledby="html-export-background"
                  >
                    <label id="html-export-background" className="text-sm font-medium">
                      PDF background
                    </label>
                    <ColorPicker
                      value={backgroundColor}
                      onChange={setBackgroundColor}
                      disabled={exporting}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Checkbox
                    checked={includePageNumbers}
                    onCheckedChange={setIncludePageNumbers}
                    label="Include page numbers in snapshot PDF mode"
                    disabled={exporting}
                  />
                  <Checkbox
                    checked={applyPrintCss}
                    onCheckedChange={setApplyPrintCss}
                    label="Apply custom print CSS to preview and PDF"
                    disabled={exporting}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="html-export-print-css" className="text-sm font-medium">
                    Custom print CSS
                  </label>
                  <Textarea
                    id="html-export-print-css"
                    value={printCss}
                    onChange={(event) => setPrintCss(event.currentTarget.value)}
                    rows={6}
                    className="font-mono text-xs"
                    disabled={exporting || !applyPrintCss}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleExport} disabled={exporting || !input.trim()}>
                {activeExport === 'format' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {activeExport === 'format' ? exportProgress || 'Exporting...' : 'Export'}
              </Button>
              {exportFormat === 'pdf' ? (
                <Button
                  onClick={exportSnapshotPdf}
                  variant="outline"
                  disabled={exporting || !input.trim()}
                >
                  {activeExport === 'snapshot' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {exportProgress || 'Exporting...'}
                    </>
                  ) : (
                    'Snapshot PDF'
                  )}
                </Button>
              ) : null}
              {exportFormat !== 'pdf' ? (
                <Button
                  onClick={() => exportCopy.copyToClipboard(currentOutput)}
                  variant={exportCopy.isCopied ? 'default' : 'outline'}
                  disabled={!currentOutput.trim()}
                >
                  {exportCopy.isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {exportCopy.isCopied ? 'Copied' : exportCopy.isError ? 'Copy failed' : 'Copy output'}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4">
        <Card className="flex h-full flex-col">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Preview
            </CardTitle>
            <CardDescription>Rendered HTML used for PDF export.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
            <div className="flex-1 rounded-md border bg-muted/30 p-3 sm:p-4">
              <iframe
                ref={previewFrameRef}
                title="HTML preview"
                sandbox="allow-same-origin"
                srcDoc={previewDocument}
                className="h-[70vh] min-h-[520px] w-full rounded-md border bg-background shadow-sm"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Text Output
            </CardTitle>
            <CardDescription>Markdown or plain text output updates as you type.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
            <Textarea
              value={shownOutput}
              readOnly
              placeholder="The Markdown or plain text of your HTML appears here."
              aria-label={exportFormat === 'txt' ? 'Plain text output' : 'Markdown output'}
              rows={22}
              className="min-h-[520px] flex-1 resize-y font-mono text-sm xl:min-h-0"
            />

            <div className="flex flex-wrap gap-2">
              {/* Not disabled while the output is empty: the output only exists
                  in the browser, so the button's first render there would
                  disagree with the server's. Copying nothing does nothing. */}
              <Button
                onClick={() => outputCopy.copyToClipboard(shownOutput)}
                variant={outputCopy.isCopied ? 'default' : 'outline'}
                size="sm"
              >
                {outputCopy.isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {outputCopy.isCopied
                  ? 'Copied'
                  : outputCopy.isError
                    ? 'Copy failed'
                    : exportFormat === 'txt'
                      ? 'Copy text'
                      : 'Copy Markdown'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
