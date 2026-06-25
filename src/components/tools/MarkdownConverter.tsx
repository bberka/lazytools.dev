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
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdownLanguage from 'highlight.js/lib/languages/markdown';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import 'highlight.js/styles/github-dark.css';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import 'katex/dist/katex.min.css';

type ExportFormat = 'pdf' | 'html' | 'txt' | 'png' | 'jpg';
type PageSize = 'A4' | 'Letter';
type Orientation = 'portrait' | 'landscape';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getFirstHeader = (htmlContent: string): string => {
  if (typeof window === 'undefined') return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const header = doc.querySelector('h1, h2, h3, h4, h5, h6');
    return header ? (header.textContent?.trim() || '') : '';
  } catch (_) {
    return '';
  }
};

const getSafeFilename = (htmlContent: string, defaultName: string): string => {
  const firstHeader = getFirstHeader(htmlContent);
  if (!firstHeader) return defaultName;
  return firstHeader.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || defaultName;
};

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdownLanguage);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
      } catch (_) {}
    }
    return `<pre class="hljs"><code>${escapeHtml(str)}</code></pre>`;
  },
});

// Inject source line mapping plugin into markdown-it
markdown.core.ruler.push('inject_line_numbers', (state) => {
  state.tokens.forEach((token) => {
    if (token.map && token.nesting >= 0) {
      const line = token.map[0];
      token.attrSet('data-source-line', String(line));
    }
  });
});

const md = markdown.use(texmath, {
  engine: katex,
  delimiters: 'dollars',
  katexOptions: { macros: { '\\RR': '\\mathbb{R}' } },
});

function getCaretYOffset(textarea: HTMLTextAreaElement, charIndex: number): number {
  if (typeof window === 'undefined') return 0;
  const styles = window.getComputedStyle(textarea);
  const div = document.createElement('div');
  
  const propertiesToCopy = [
    'direction',
    'box-sizing',
    'width',
    'height',
    'overflow-x',
    'overflow-y',
    'border-width',
    'border-style',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'font-variant',
    'text-transform',
    'word-spacing',
    'letter-spacing',
    'line-height',
    'text-indent',
  ];

  propertiesToCopy.forEach((prop) => {
    const value = styles.getPropertyValue(prop);
    div.style.setProperty(prop, value);
  });

  div.style.position = 'absolute';
  div.style.left = '-9999px';
  div.style.top = '0';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordBreak = 'break-word';
  div.style.width = `${textarea.clientWidth}px`;

  const text = textarea.value;
  const beforeText = text.substring(0, charIndex);
  
  const textNode = document.createTextNode(beforeText);
  div.appendChild(textNode);

  const span = document.createElement('span');
  span.textContent = '|';
  div.appendChild(span);

  document.body.appendChild(div);
  const offsetTop = span.offsetTop;
  document.body.removeChild(div);

  return offsetTop;
}

const scrollToLineInTextarea = (
  textarea: HTMLTextAreaElement,
  lineIndex: number,
  charIndex: number
) => {
  textarea.focus();
  textarea.setSelectionRange(charIndex, charIndex);

  const caretYOffset = getCaretYOffset(textarea, charIndex);
  const isScrollable = textarea.scrollHeight > textarea.clientHeight;
  
  if (isScrollable) {
    const targetScrollTop = Math.max(0, caretYOffset - textarea.clientHeight / 3);
    try {
      textarea.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    } catch {
      textarea.scrollTop = targetScrollTop;
    }
  }

  setTimeout(() => {
    const textareaRect = textarea.getBoundingClientRect();
    const currentScrollTop = textarea.scrollTop;
    const caretDocTop = window.scrollY + textareaRect.top + (caretYOffset - currentScrollTop);
    const targetWindowScrollTop = caretDocTop - window.innerHeight / 3;

    window.scrollTo({
      top: Math.max(0, targetWindowScrollTop),
      behavior: 'smooth',
    });
  }, 50);
};

const previewCss = `
.markdown-print-preview {
  background: #ffffff;
  color: #111827;
  color-scheme: light;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 16px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  box-sizing: border-box;
}

.markdown-print-preview * {
  box-sizing: border-box;
}

.markdown-print-preview h1,
.markdown-print-preview h2,
.markdown-print-preview h3,
.markdown-print-preview h4,
.markdown-print-preview h5,
.markdown-print-preview h6 {
  color: #111827;
  font-family: Arial, Helvetica, sans-serif;
  line-height: 1.2;
  margin: 1.35em 0 0.6em;
}

.markdown-print-preview h1 {
  font-size: 2rem;
}

.markdown-print-preview h2 {
  font-size: 1.5rem;
}

.markdown-print-preview p,
.markdown-print-preview ul,
.markdown-print-preview ol,
.markdown-print-preview blockquote,
.markdown-print-preview table,
.markdown-print-preview pre {
  margin: 0 0 1rem;
}

.markdown-print-preview a {
  color: #2563eb;
  text-decoration: underline;
}

.markdown-print-preview blockquote {
  border-left: 4px solid #d1d5db;
  color: #4b5563;
  margin-left: 0;
  padding-left: 1rem;
}

.markdown-print-preview code,
.markdown-print-preview pre {
  border-radius: 0.375rem;
}

.markdown-print-preview :not(pre) > code {
  background: #f3f4f6;
  padding: 0.125rem 0.25rem;
}

.markdown-print-preview pre {
  overflow-x: auto;
  padding: 1rem;
}

.markdown-print-preview table {
  border-collapse: collapse;
  width: 100%;
}

.markdown-print-preview th,
.markdown-print-preview td {
  border: 1px solid #d1d5db;
  padding: 0.5rem 0.65rem;
  text-align: left;
}

.markdown-print-preview th {
  background: #f9fafb;
}

/* Dark theme overrides */
.markdown-print-preview.dark-pdf {
  color: #ffffff;
  color-scheme: dark;
}

.markdown-print-preview.dark-pdf h1,
.markdown-print-preview.dark-pdf h2,
.markdown-print-preview.dark-pdf h3,
.markdown-print-preview.dark-pdf h4,
.markdown-print-preview.dark-pdf h5,
.markdown-print-preview.dark-pdf h6 {
  color: #ffffff;
}

.markdown-print-preview.dark-pdf a {
  color: #60a5fa;
}

.markdown-print-preview.dark-pdf blockquote {
  border-left-color: #4b5563;
  color: #9ca3af;
}

.markdown-print-preview.dark-pdf :not(pre) > code {
  background: #1f2937;
  color: #f3f4f6;
}

.markdown-print-preview.dark-pdf pre {
  background: #111827;
}

.markdown-print-preview.dark-pdf th,
.markdown-print-preview.dark-pdf td {
  border-color: #374151;
}

.markdown-print-preview.dark-pdf th {
  background: #1f2937;
}
`;

const pageFormats: Record<PageSize, [number, number]> = {
  A4: [210, 297],
  Letter: [215.9, 279.4],
};

const pageLabels: Record<PageSize, string> = {
  A4: 'A4',
  Letter: 'Letter',
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
  const [html, setHtml] = useState(() => md.render(defaultMarkdown));
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
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  const handlePreviewDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const blockElement = target.closest('[data-source-line]');
    if (!blockElement) return;

    const lineAttr = blockElement.getAttribute('data-source-line');
    if (lineAttr === null) return;

    const lineIndex = parseInt(lineAttr, 10);
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Calculate char index in textarea
    const lines = input.split('\n');
    let charIndex = 0;
    for (let i = 0; i < Math.min(lineIndex, lines.length); i++) {
      charIndex += lines[i].length + 1; // +1 for '\n'
    }

    scrollToLineInTextarea(textarea, lineIndex, charIndex);
  };

  const renderMarkdown = (text: string) => {
    if (!text.trim()) {
      setHtml('');
      return;
    }

    try {
      setHtml(md.render(text));
    } catch (_) {
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
    const firstHeader = getFirstHeader(html);
    const pageRule = `${pageLabels[pageSize]} ${orientation}`;
    const highlightThemeUrl = pdfTheme === 'dark'
      ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
    const printDocument = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${firstHeader}</title>
  <link rel="stylesheet" href="${highlightThemeUrl}">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.27/dist/katex.min.css">
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

    .markdown-print-preview {
      min-height: auto;
      padding: 0;
    }

    ${previewCss}

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
  <main class="markdown-print-preview ${pdfTheme === 'dark' ? 'dark-pdf' : ''}">
    ${html}
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
      document.title = firstHeader || '';

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

  const exportHtml = () => {
    const firstHeader = getFirstHeader(html);
    const highlightThemeUrl = pdfTheme === 'dark'
      ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${firstHeader || 'Markdown Export'}</title>
  <link rel="stylesheet" href="${highlightThemeUrl}">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.27/dist/katex.min.css">
  <style>
    body {
      font-family: Georgia, 'Times New Roman', serif;
      line-height: 1.65;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      color: ${pdfTheme === 'dark' ? '#ffffff' : '#111827'};
      background: ${backgroundColor};
    }

    ${previewCss}
  </style>
</head>
<body>
  <main class="markdown-print-preview ${pdfTheme === 'dark' ? 'dark-pdf' : ''}">
    ${html}
  </main>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = getSafeFilename(html, 'markdown-export');
    link.href = url;
    link.download = `${filename}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportText = () => {
    const blob = new Blob([input], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = getSafeFilename(html, 'markdown-export');
    link.href = url;
    link.download = `${filename}.txt`;
    link.click();
    URL.revokeObjectURL(url);
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
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const filename = getSafeFilename(html, 'markdown-export');
          link.href = url;
          link.download = `${filename}.${format}`;
          link.click();
          URL.revokeObjectURL(url);
          setExportProgress('');
        },
        `image/${format === 'jpg' ? 'jpeg' : 'png'}`,
        0.95
      );
    } catch (error) {
      console.error(`Error exporting ${format.toUpperCase()}:`, error);
      alert(`Error exporting ${format.toUpperCase()}. Please try again.`);
      setExportProgress('');
    }
  };

  const exportSnapshotPdf = async () => {
    if (!previewRef.current) return;

    setExportProgress('Capturing preview...');

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      const canvas = await html2canvas(previewRef.current, {
        scale,
        useCORS: true,
        logging: false,
        backgroundColor,
        windowWidth: previewRef.current.scrollWidth,
        windowHeight: previewRef.current.scrollHeight,
      });

      setExportProgress('Generating PDF...');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const firstHeader = getFirstHeader(html);
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: pageFormats[pageSize],
      });

      pdf.setProperties({
        title: firstHeader || '',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const usableWidth = pdfWidth - margin * 2;
      const usableHeight = pdfHeight - margin * 2;
      const imgWidth = usableWidth;
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
      await new Promise((resolve) => setTimeout(resolve, 50));
      const filename = getSafeFilename(html, 'markdown-export');
      pdf.save(`${filename}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Error exporting PDF. Please try again.');
    } finally {
      setExportProgress('');
    }
  };

  const handleExport = async () => {
    if (!input.trim()) {
      alert('Please enter markdown content first');
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
            <style>{previewCss}</style>
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
