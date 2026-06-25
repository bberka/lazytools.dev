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

type ExportFormat = 'pdf' | 'md' | 'html' | 'txt';
type PageSize = 'A4' | 'Letter' | 'Legal';
type Orientation = 'portrait' | 'landscape';

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

const pageFormats: Record<PageSize, [number, number]> = {
  A4: [210, 297],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

const pageLabels: Record<PageSize, string> = {
  A4: 'A4',
  Letter: 'Letter',
  Legal: 'Legal',
};

function textContent(node: Node): string {
  return node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\\x60*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.replace(/\s+/g, ' ') ?? '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const content = Array.from(element.childNodes).map(inlineMarkdown).join('');

  switch (element.tagName.toLowerCase()) {
    case 'strong':
    case 'b':
      return `**${content.trim()}**`;
    case 'em':
    case 'i':
      return `*${content.trim()}*`;
    case 'code':
      return `\`${textContent(element)}\``;
    case 'a': {
      const href = element.getAttribute('href');
      return href ? `[${content.trim() || href}](${href})` : content;
    }
    case 'br':
      return '\n';
    default:
      return content;
  }
}

function tableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
    Array.from(row.children).map((cell) => textContent(cell))
  );

  if (rows.length === 0) {
    return '';
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => escapeMarkdown(row[index] ?? ''))
  );
  const header = normalizedRows[0];
  const separator = Array.from({ length: columnCount }, () => '---');
  const body = normalizedRows.slice(1);

  return [header, separator, ...body]
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');
}

function blockMarkdown(node: Node, depth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return textContent(node);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const children = () =>
    Array.from(element.childNodes)
      .map((child) => blockMarkdown(child, depth))
      .filter(Boolean)
      .join('\n\n');

  switch (element.tagName.toLowerCase()) {
    case 'h1':
      return `# ${textContent(element)}`;
    case 'h2':
      return `## ${textContent(element)}`;
    case 'h3':
      return `### ${textContent(element)}`;
    case 'h4':
      return `#### ${textContent(element)}`;
    case 'h5':
      return `##### ${textContent(element)}`;
    case 'h6':
      return `###### ${textContent(element)}`;
    case 'p':
      return inlineMarkdown(element).trim();
    case 'blockquote':
      return children()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'pre':
      return `\`\`\`\n${element.textContent?.trim() ?? ''}\n\`\`\``;
    case 'ul':
      return Array.from(element.children)
        .map((child) => blockMarkdown(child, depth + 1))
        .join('\n');
    case 'ol':
      return Array.from(element.children)
        .map((child, index) => `${'  '.repeat(depth)}${index + 1}. ${inlineMarkdown(child).trim()}`)
        .join('\n');
    case 'li':
      return `${'  '.repeat(Math.max(0, depth - 1))}- ${inlineMarkdown(element).trim()}`;
    case 'table':
      return tableToMarkdown(element as HTMLTableElement);
    case 'hr':
      return '---';
    case 'script':
    case 'style':
      return '';
    default:
      return children() || inlineMarkdown(element).trim();
  }
}

function htmlToMarkdown(html: string): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.body.childNodes)
    .map((node) => blockMarkdown(node))
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function downloadText(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function HtmlConverter() {
  const [input, setInput] = useState(sampleHtml);
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
  const [filename, setFilename] = useState('html-export');
  const [includePageNumbers, setIncludePageNumbers] = useState(false);
  const [applyPrintCss, setApplyPrintCss] = useState(true);
  const [printCss, setPrintCss] = useState(defaultPrintCss);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const markdownOutput = useMemo(() => htmlToMarkdown(input), [input]);
  const plainTextOutput = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    const doc = new DOMParser().parseFromString(input, 'text/html');
    return doc.body.textContent?.replace(/\n{3,}/g, '\n\n').trim() ?? '';
  }, [input]);

  const styleTag = `${basePreviewCss}\n${applyPrintCss ? printCss : ''}`;
  const safeFilename = filename.trim() || 'html-export';
  const [basePageWidth, basePageHeight] = pageFormats[pageSize];
  const pageWidth = orientation === 'portrait' ? basePageWidth : basePageHeight;
  const pageHeight = orientation === 'portrait' ? basePageHeight : basePageWidth;
  const previewPageStyle: CSSProperties = {
    backgroundColor,
    maxWidth: `${Math.round(pageWidth * 3.78)}px`,
    minHeight: `${Math.round((pageHeight / pageWidth) * Math.round(pageWidth * 3.78))}px`,
  };

  const exportPrintPdf = () => {
    const pageRule = `${pageLabels[pageSize]} ${orientation}`;
    const printDocument = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeFilename}</title>
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

    const existingFrame = printFrameRef.current;
    if (existingFrame) {
      existingFrame.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';

    iframe.onload = () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        return;
      }

      const originalTitle = document.title;
      document.title = safeFilename;

      frameWindow.focus();
      frameWindow.print();

      const cleanup = () => {
        setTimeout(() => {
          document.title = originalTitle;
          iframe.remove();
          if (printFrameRef.current === iframe) {
            printFrameRef.current = null;
          }
        }, 500);
      };

      frameWindow.onafterprint = cleanup;
      setTimeout(cleanup, 5000);
    };

    document.body.appendChild(iframe);
    printFrameRef.current = iframe;

    const frameDocument = iframe.contentDocument;
    if (!frameDocument) {
      return;
    }

    frameDocument.open();
    frameDocument.write(printDocument);
    frameDocument.close();
  };

  const exportSnapshotPdf = async () => {
    if (!previewRef.current) {
      return;
    }

    setExportProgress('Capturing preview...');
    await new Promise((resolve) => setTimeout(resolve, 50));

    const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
      import('jspdf'),
      import('html2canvas'),
    ]);
    const canvas = await html2canvas(previewRef.current, {
      scale,
      backgroundColor,
      logging: false,
      useCORS: true,
      windowWidth: previewRef.current.scrollWidth,
      windowHeight: previewRef.current.scrollHeight,
    });

    setExportProgress('Composing PDF...');

    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: pageFormats[pageSize],
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const usableWidth = pdfWidth - margin * 2;
    const usableHeight = pdfHeight - margin * 2;
    const imgWidth = usableWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const pageHeightInImage = (usableHeight * canvas.width) / usableWidth;

    let sourceY = 0;
    let pageNumber = 0;

    while (sourceY < canvas.height) {
      if (pageNumber > 0) {
        pdf.addPage();
      }

      const sliceHeight = Math.min(pageHeightInImage, canvas.height - sourceY);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const context = pageCanvas.getContext('2d');

      if (context) {
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        context.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight
        );
      }

      const sliceData = pageCanvas.toDataURL('image/png');
      const slicePdfHeight = (sliceHeight * imgWidth) / canvas.width;
      pdf.addImage(sliceData, 'PNG', margin, margin, imgWidth, slicePdfHeight);

      sourceY += sliceHeight;
      pageNumber++;
    }

    if (includePageNumbers) {
      const totalPages = pdf.getNumberOfPages();
      for (let page = 1; page <= totalPages; page++) {
        pdf.setPage(page);
        pdf.setFontSize(9);
        pdf.setTextColor(pdfTheme === 'dark' ? 180 : 90);
        pdf.text(`Page ${page} of ${totalPages}`, pdfWidth / 2, pdfHeight - 6, {
          align: 'center',
        });
      }
    }

    setExportProgress('Saving file...');
    pdf.save(`${safeFilename}.pdf`);
  };

  const handleExport = async () => {
    if (!input.trim()) {
      return;
    }

    setExporting(true);
    setExportProgress('');

    try {
      switch (exportFormat) {
        case 'pdf':
          exportPrintPdf();
          break;
        case 'md':
          downloadText(`${safeFilename}.md`, markdownOutput, 'text/markdown');
          break;
        case 'html':
          downloadText(`${safeFilename}.html`, input, 'text/html');
          break;
        case 'txt':
          downloadText(`${safeFilename}.txt`, plainTextOutput, 'text/plain');
          break;
      }
    } finally {
      setExporting(false);
      setExportProgress('');
    }
  };

  const copyCurrentOutput = () => {
    if (exportFormat === 'md') {
      copyToClipboard(markdownOutput);
      return;
    }

    if (exportFormat === 'txt') {
      copyToClipboard(plainTextOutput);
      return;
    }

    copyToClipboard(input);
  };

  const clearInput = () => {
    setInput('');
  };

  const importHtmlFile = (file: File | undefined) => {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setInput(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsText(file);
  };

  const currentOutput =
    exportFormat === 'md' ? markdownOutput : exportFormat === 'txt' ? plainTextOutput : input;

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
              rows={18}
              className="min-h-[420px] flex-1 resize-y font-mono text-sm xl:min-h-0"
            />

            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,text/html"
                className="hidden"
                onChange={(event) => {
                  importHtmlFile(event.currentTarget.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                size="sm"
                disabled={exporting}
              >
                <FileUp className="h-4 w-4" />
                Import HTML
              </Button>
              <Button
                onClick={() => copyToClipboard(input)}
                variant={isCopied ? 'default' : 'outline'}
                size="sm"
              >
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {isCopied ? 'Copied' : 'Copy HTML'}
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
                <label className="text-sm font-medium">Format</label>
                <Select
                  value={exportFormat}
                  onValueChange={(value) => setExportFormat(value as ExportFormat)}
                  disabled={exporting}
                >
                  <SelectTrigger>
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
                <label className="text-sm font-medium">Filename</label>
                <Input
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
                          <SelectItem value="Legal">Legal</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

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
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Margins: {margin} mm</label>
                  <Slider value={margin} onChange={setMargin} min={0} max={40} step={1} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Render scale: {scale}x</label>
                  <Slider value={scale} onChange={setScale} min={1} max={4} step={1} />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">PDF theme</label>
                    <Select
                      value={pdfTheme}
                      onValueChange={(value) => handlePdfThemeChange(value as 'light' | 'dark')}
                      disabled={exporting}
                    >
                      <SelectTrigger>
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

                  <div className="space-y-2">
                    <label className="text-sm font-medium">PDF background</label>
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
                    label="Include page numbers"
                  />
                  <Checkbox
                    checked={applyPrintCss}
                    onCheckedChange={setApplyPrintCss}
                    label="Apply custom print CSS to preview and PDF"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Custom print CSS</label>
                  <Textarea
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
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {exporting ? exportProgress || 'Exporting...' : 'Export'}
              </Button>
              {exportFormat === 'pdf' ? (
                <Button
                  onClick={exportSnapshotPdf}
                  variant="outline"
                  disabled={exporting || !input.trim()}
                >
                  Snapshot PDF
                </Button>
              ) : null}
              {exportFormat !== 'pdf' ? (
                <Button
                  onClick={copyCurrentOutput}
                  variant={isCopied ? 'default' : 'outline'}
                  disabled={!currentOutput.trim()}
                >
                  {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {isCopied ? 'Copied' : 'Copy output'}
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
              <style>{styleTag}</style>
              <div
                ref={previewRef}
                className={`html-converter-preview mx-auto w-full overflow-hidden p-4 shadow-sm sm:p-6 lg:p-8 ${
                  pdfTheme === 'dark' ? 'dark-pdf' : ''
                }`}
                style={previewPageStyle}
                dangerouslySetInnerHTML={{ __html: input }}
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
          <CardContent className="flex flex-1 flex-col px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
            <Textarea
              value={exportFormat === 'txt' ? plainTextOutput : markdownOutput}
              readOnly
              rows={22}
              className="min-h-[520px] flex-1 resize-y font-mono text-sm xl:min-h-0"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
