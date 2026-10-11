'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  FileText,
  Download,
  Trash2,
  Sparkles,
  Split,
  Plus,
  Minus,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadBlob, sanitizeFileName } from '@/lib/files';
import {
  DOCX_THEME_PRESETS,
  adjustBlockSpacing,
  blockSpacing,
  carryBlockSettings,
  documentTitle,
  parseMarkdownBlocks,
  renderDocx,
  renderPreviewHtml,
  type DocxStyle,
  type MarkdownBlock,
} from '@/lib/tools/markdown-to-docx';

const defaultMarkdown = `# Project Implementation Plan

Welcome to the Markdown to DOCX Converter. This document demonstrates how headings, paragraphs, lists, tables, and code blocks are formatted into a Word document.

## Formatting Features

- **Keep With Next**: Headings will never be split from their following text.
- **Prevent Row Splits**: Table rows stay together rather than breaking awkwardly.
- **Custom Spacing**: Adjust spacing before/after elements directly.

### Code Block Formatting

\`\`\`javascript
// Code blocks are wrapped in tables to keep them intact
function convertMarkdown(mdText) {
  const docx = compileToDocx(mdText);
  return docx;
}
\`\`\`

### Table Structure

| Feature | Support | Output |
|---------|---------|--------|
| Bullet Lists | Supported | Perfect Indents |
| Code Highlighting | Custom Table | Monospaced Consolas |
| Tables | Fully Styled | Alternate Padding |

Use the "Spacing & Outline" tab in the right pane to toggle manual page breaks and add spaces!
`;

export function MarkdownToDocx() {
  const [input, setInput] = useState(defaultMarkdown);
  const [html, setHtml] = useState(() => renderPreviewHtml(defaultMarkdown));
  const [activeRightTab, setActiveRightTab] = useState<'preview' | 'outline'>('outline');
  const [activeLeftTab, setActiveLeftTab] = useState<'layout' | 'typography' | 'breaks'>('layout');
  const [themeKey, setThemeKey] = useState<string>('modern');
  const [options, setOptions] = useState<DocxStyle>({ ...DOCX_THEME_PRESETS.modern.options });

  // Page layout state
  const [pageSize, setPageSize] = useState<'A4' | 'Letter'>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [marginType, setMarginType] = useState<'normal' | 'narrow' | 'wide'>('normal');

  // Spacing & paging behavior state
  const [keepHeadingsWithNext, setKeepHeadingsWithNext] = useState(true);
  const [preventTableRowSplit, setPreventTableRowSplit] = useState(true);
  const [autoPageBreakBeforeH1, setAutoPageBreakBeforeH1] = useState(true);
  const [autoPageBreakBeforeH2, setAutoPageBreakBeforeH2] = useState(false);

  // Headers & Footers
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('Confidential');
  const [includePageNumbers, setIncludePageNumbers] = useState(true);
  const [pageNumberPosition, setPageNumberPosition] = useState<'left' | 'center' | 'right'>('center');

  const [blocks, setBlocks] = useState<MarkdownBlock[]>(() => parseMarkdownBlocks(defaultMarkdown));
  const [exporting, setExporting] = useState(false);
  const exportResetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The spinner is reset on a timer after a download; do not let it fire
  // once the tool has been left.
  useEffect(() => () => clearTimeout(exportResetTimer.current), []);

  const updateBlocksPreservingSettings = (newInput: string) => {
    const freshBlocks = parseMarkdownBlocks(newInput);
    setBlocks((prev) => carryBlockSettings(prev, freshBlocks));
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    try {
      setHtml(renderPreviewHtml(val));
    } catch {
      setHtml('<p class="text-destructive">Error parsing Markdown</p>');
    }
    updateBlocksPreservingSettings(val);
  };

  const handleThemeChange = (key: string) => {
    setThemeKey(key);
    if (key !== 'custom' && DOCX_THEME_PRESETS[key]) {
      setOptions({ ...DOCX_THEME_PRESETS[key].options });
    }
  };

  const updateOption = (key: keyof DocxStyle, value: string | number) => {
    setThemeKey('custom');
    setOptions((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const togglePageBreak = (id: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, pageBreakBefore: !b.pageBreakBefore } : b))
    );
  };

  const adjustSpacing = (id: string, type: 'before' | 'after', increment: boolean) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? adjustBlockSpacing(b, options, type, increment ? 2 : -2) : b))
    );
  };

  const handleClear = () => {
    setInput('');
    setHtml('');
    setBlocks([]);
  };

  const handleDownloadDocx = async () => {
    if (blocks.length === 0) return;
    clearTimeout(exportResetTimer.current);
    setExporting(true);

    try {
      const blob = await renderDocx(blocks, {
        style: options,
        pageSize,
        orientation,
        margins: marginType,
        keepHeadingsWithNext,
        preventTableRowSplit,
        pageBreakBeforeH1: autoPageBreakBeforeH1,
        pageBreakBeforeH2: autoPageBreakBeforeH2,
        headerText,
        footerText,
        pageNumbers: includePageNumbers ? pageNumberPosition : null,
      });

      // The file is named after the document's first heading.
      downloadBlob(blob, `${sanitizeFileName(documentTitle(blocks), 'markdown-export')}.docx`);

      // Defer the spinner reset to give the browser time to initiate the large file download
      exportResetTimer.current = setTimeout(() => {
        setExporting(false);
      }, 1500);
    } catch (err) {
      console.error('Error compiling docx:', err);
      toast.error('Failed to generate Word document.');
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 items-stretch gap-4 sm:gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        {/* Left pane: Editor & Settings */}
        <Card className="flex flex-col border shadow-sm">
          <Tabs value={activeLeftTab} onValueChange={(val: string) => setActiveLeftTab(val as 'layout' | 'typography' | 'breaks')} className="w-full flex flex-col flex-1">
            <CardHeader className="p-4 border-b flex flex-col gap-3 items-start">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Document Composer
                </CardTitle>
                <CardDescription className="text-xs">Write Markdown and configure layout settings.</CardDescription>
              </div>
              {/* Tabs for Left column settings */}
              <TabsList className="w-full grid grid-cols-3 bg-secondary/80 p-0.5 rounded-lg text-xs h-auto">
                <TabsTrigger value="layout" className="w-full rounded-md font-medium text-xs">Page Setup</TabsTrigger>
                <TabsTrigger value="typography" className="w-full rounded-md font-medium text-xs">Typography</TabsTrigger>
                <TabsTrigger value="breaks" className="w-full rounded-md font-medium text-xs">Paging Rules</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="p-4 flex-1 flex flex-col min-h-[480px]">
              <TabsContent value="layout" className="mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 bg-muted/40 p-4 rounded-xl border">
                  <div className="space-y-3">
                    <div>
                      <label id="docx-page-size" className="text-xs font-semibold block mb-1">Page Size</label>
                      <Select value={pageSize} onValueChange={(val: 'A4' | 'Letter') => setPageSize(val)}>
                        <SelectTrigger className="h-9" aria-labelledby="docx-page-size">
                          <SelectValue placeholder="Page Size" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A4">A4 (210 x 297 mm)</SelectItem>
                          <SelectItem value="Letter">Letter (8.5 x 11 in)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label id="docx-orientation" className="text-xs font-semibold block mb-1">Orientation</label>
                      <Select value={orientation} onValueChange={(val: 'portrait' | 'landscape') => setOrientation(val)}>
                        <SelectTrigger className="h-9" aria-labelledby="docx-orientation">
                          <SelectValue placeholder="Orientation" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="portrait">Portrait</SelectItem>
                          <SelectItem value="landscape">Landscape</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label id="docx-margins" className="text-xs font-semibold block mb-1">Page Margins</label>
                      <Select value={marginType} onValueChange={(val: 'normal' | 'narrow' | 'wide') => setMarginType(val)}>
                        <SelectTrigger className="h-9" aria-labelledby="docx-margins">
                          <SelectValue placeholder="Margins" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal (1 in / 2.54 cm)</SelectItem>
                          <SelectItem value="narrow">Narrow (0.5 in / 1.27 cm)</SelectItem>
                          <SelectItem value="wide">Wide (1.5 in / 3.81 cm)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label htmlFor="docx-header-text" className="text-xs font-semibold block mb-1">Header Text (Right aligned)</label>
                      <Input
                        id="docx-header-text"
                        placeholder="e.g. Project Proposal"
                        value={headerText}
                        onChange={(e) => setHeaderText(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label htmlFor="docx-footer-text" className="text-xs font-semibold block mb-1">Footer Text (Left aligned)</label>
                      <Input
                        id="docx-footer-text"
                        placeholder="e.g. Confidential"
                        value={footerText}
                        onChange={(e) => setFooterText(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="flex flex-col gap-2 pt-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor="show-pagenum" className="text-xs font-medium cursor-pointer">Include Page Numbers</label>
                        <Checkbox
                          id="show-pagenum"
                          checked={includePageNumbers}
                          onCheckedChange={(checked: boolean) => setIncludePageNumbers(checked)}
                        />
                      </div>
                      {includePageNumbers && (
                        <div className="flex items-center justify-between gap-2">
                          <span id="docx-page-number-alignment" className="text-[10px] text-muted-foreground">Page Number Alignment</span>
                          <Select
                            value={pageNumberPosition}
                            onValueChange={(val: 'left' | 'center' | 'right') => setPageNumberPosition(val)}
                          >
                            <SelectTrigger className="h-7 w-28 text-[11px]" aria-labelledby="docx-page-number-alignment">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="center">Center</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="typography" className="mt-0">
                <div className="space-y-4 mb-4 bg-muted/40 p-4 rounded-xl border">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label id="docx-theme-preset" className="text-xs font-semibold block mb-1">Theme Preset</label>
                      <Select value={themeKey} onValueChange={handleThemeChange}>
                        <SelectTrigger className="h-9" aria-labelledby="docx-theme-preset">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(DOCX_THEME_PRESETS).map(([key, item]) => (
                            <SelectItem key={key} value={key}>
                              {item.name}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Custom Styling</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label id="docx-font-family" className="text-xs font-semibold block mb-1">Font Family</label>
                      <Select
                        value={options.fontFamily}
                        onValueChange={(val) => updateOption('fontFamily', val)}
                      >
                        <SelectTrigger className="h-9" aria-labelledby="docx-font-family">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Segoe UI">Segoe UI (Clean Sans)</SelectItem>
                          <SelectItem value="Calibri">Calibri (Standard Office)</SelectItem>
                          <SelectItem value="Arial">Arial (Universal Sans)</SelectItem>
                          <SelectItem value="Times New Roman">Times New Roman (Academic)</SelectItem>
                          <SelectItem value="Georgia">Georgia (Elegant Serif)</SelectItem>
                          <SelectItem value="Consolas">Consolas (Code Style)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label id="docx-line-spacing" className="text-xs font-semibold block mb-1">Line Spacing</label>
                      <Select
                        value={String(options.bodyLineSpacing)}
                        onValueChange={(val) => updateOption('bodyLineSpacing', parseFloat(val))}
                      >
                        <SelectTrigger className="h-9" aria-labelledby="docx-line-spacing">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1.0 (Single)</SelectItem>
                          <SelectItem value="1.15">1.15 (Compact)</SelectItem>
                          <SelectItem value="1.25">1.25 (Readable)</SelectItem>
                          <SelectItem value="1.5">1.5 (Spacious)</SelectItem>
                          <SelectItem value="2">2.0 (Double)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3">
                    <div className="space-y-3">
                      <div role="group" aria-labelledby="docx-body-font-size">
                        <div className="flex justify-between items-center mb-1">
                          <span id="docx-body-font-size" className="text-xs font-semibold">Body Font Size ({options.bodyFontSize}pt)</span>
                        </div>
                        <Slider
                          value={options.bodyFontSize}
                          min={9}
                          max={16}
                          step={0.5}
                          onChange={(val: number) => updateOption('bodyFontSize', val)}
                        />
                      </div>
                      <div role="group" aria-labelledby="docx-paragraph-spacing">
                        <div className="flex justify-between items-center mb-1">
                          <span id="docx-paragraph-spacing" className="text-xs font-semibold">Paragraph Spacing After ({options.paragraphSpacingAfter}pt)</span>
                        </div>
                        <Slider
                          value={options.paragraphSpacingAfter}
                          min={0}
                          max={24}
                          step={1}
                          onChange={(val: number) => updateOption('paragraphSpacingAfter', val)}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div role="group" aria-labelledby="docx-h1-size">
                        <div className="flex justify-between items-center mb-1">
                          <span id="docx-h1-size" className="text-xs font-semibold">Heading 1 Size ({options.h1FontSize}pt)</span>
                        </div>
                        <Slider
                          value={options.h1FontSize}
                          min={14}
                          max={32}
                          step={1}
                          onChange={(val: number) => updateOption('h1FontSize', val)}
                        />
                      </div>
                      <div role="group" aria-labelledby="docx-heading-spacing">
                        <div className="flex justify-between items-center mb-1">
                          <span id="docx-heading-spacing" className="text-xs font-semibold">Heading Spacing Before ({options.headingSpacingBefore}pt)</span>
                        </div>
                        <Slider
                          value={options.headingSpacingBefore}
                          min={4}
                          max={36}
                          step={1}
                          onChange={(val: number) => updateOption('headingSpacingBefore', val)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="breaks" className="mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 bg-muted/40 p-4 rounded-xl border text-xs">
                  <div className="space-y-3">
                    <div className="font-semibold text-foreground mb-1">Auto Page Breaks</div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="break-h1" className="cursor-pointer">Page break before Level 1 Heading (<code>#</code>)</label>
                      <Checkbox
                        id="break-h1"
                        checked={autoPageBreakBeforeH1}
                        onCheckedChange={(checked: boolean) => setAutoPageBreakBeforeH1(checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="break-h2" className="cursor-pointer">Page break before Level 2 Heading (<code>##</code>)</label>
                      <Checkbox
                        id="break-h2"
                        checked={autoPageBreakBeforeH2}
                        onCheckedChange={(checked: boolean) => setAutoPageBreakBeforeH2(checked)}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="font-semibold text-foreground mb-1">Keep Together Rules</div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="keep-next" className="cursor-pointer">Keep Headings with following text</label>
                      <Checkbox
                        id="keep-next"
                        checked={keepHeadingsWithNext}
                        onCheckedChange={(checked: boolean) => setKeepHeadingsWithNext(checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="table-split" className="cursor-pointer">Prevent Table Rows splitting across pages</label>
                      <Checkbox
                        id="table-split"
                        checked={preventTableRowSplit}
                        onCheckedChange={(checked: boolean) => setPreventTableRowSplit(checked)}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <div className="flex-1 flex flex-col min-h-[300px] gap-3">
                <Textarea
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder="Enter your Markdown here..."
                  aria-label="Markdown input"
                  className="flex-1 min-h-[300px] font-mono text-sm leading-relaxed p-4 resize-y bg-background border shadow-xs focus-visible:ring-1 focus-visible:ring-primary"
                />
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button variant="outline" onClick={handleClear} disabled={exporting}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                  <Button onClick={handleDownloadDocx} disabled={exporting || blocks.length === 0} className="bg-primary hover:bg-primary/90">
                    {exporting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Compiling...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Download Word (.docx)
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Tabs>
        </Card>

        <Card className="flex flex-col border shadow-sm">
          <Tabs value={activeRightTab} onValueChange={(val: string) => setActiveRightTab(val as 'preview' | 'outline')} className="w-full flex flex-col flex-1">
            <CardHeader className="p-4 border-b flex flex-col gap-3 items-start">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Layout & Spacing Manager
                </CardTitle>
                <CardDescription className="text-xs">Adjust spacing and page breaks block-by-block.</CardDescription>
              </div>
              {/* Tabs for right side */}
              <TabsList className="w-full grid grid-cols-2 bg-secondary/80 p-0.5 rounded-lg text-xs h-auto">
                <TabsTrigger value="outline" className="w-full rounded-md font-medium text-xs">Spacing & Outline</TabsTrigger>
                <TabsTrigger value="preview" className="w-full rounded-md font-medium text-xs">HTML Preview</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="p-4 flex-1">
              <ScrollArea className="h-[620px] pr-4">
                <TabsContent value="preview" className="mt-0">
                  {activeRightTab === 'preview' && (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none p-4 rounded-xl border bg-background font-serif"
                      style={{
                        fontFamily: options.fontFamily === 'Segoe UI' ? 'system-ui' : options.fontFamily,
                        lineHeight: options.bodyLineSpacing,
                      }}
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  )}
                </TabsContent>

                <TabsContent value="outline" className="mt-0">
                  {activeRightTab === 'outline' && (
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground italic mb-2">
                        Tip: Toggle page breaks or fine-tune empty spacing (margins) before/after individual sections to keep related paragraphs together.
                      </p>

                      {blocks.length === 0 ? (
                        <div className="text-center py-6 sm:py-10 border border-dashed rounded-xl text-muted-foreground text-sm">
                          No content blocks. Write some Markdown to begin!
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {blocks.map((block, idx) => {
                            const isHeading = block.type === 'heading';
                            const levelName = isHeading ? `H${block.level}` : block.type.toUpperCase();
                            // Null for code, tables and rules, which the document lays out
                            // without paragraph spacing.
                            const spacing = blockSpacing(block, options);

                            // Check if a page break would naturally be forced here
                            const isPageBreakActive =
                              block.pageBreakBefore ||
                              (block.type === 'heading' && block.level === 1 && autoPageBreakBeforeH1) ||
                              (block.type === 'heading' && block.level === 2 && autoPageBreakBeforeH2);

                            return (
                              <div key={block.id} className="relative">
                                {/* Visual Page Break Line */}
                                {isPageBreakActive && idx > 0 && (
                                  <div className="my-3 flex items-center justify-center relative">
                                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                      <div className="w-full border-t border-dashed border-primary/50"></div>
                                    </div>
                                    <span className="relative px-3 py-0.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground tracking-wider flex items-center gap-1 shadow-xs">
                                      <Split className="h-3 w-3" />
                                      PAGE BREAK
                                    </span>
                                  </div>
                                )}

                                {/* Block Card */}
                                <div
                                  className={`p-3 rounded-lg border text-xs transition-all bg-card ${
                                    isPageBreakActive
                                      ? 'border-primary/50 ring-1 ring-primary/20'
                                      : 'hover:border-primary/30 border-border'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-4 mb-2">
                                    {/* Left side info */}
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`px-1.5 py-0.5 rounded-sm font-mono text-[10px] font-bold ${
                                          isHeading
                                            ? 'bg-primary text-primary-foreground'
                                            : block.type === 'code'
                                            ? 'bg-foreground/10 text-foreground'
                                            : block.type === 'table'
                                            ? 'border border-border bg-background text-foreground'
                                            : 'bg-secondary text-secondary-foreground'
                                        }`}
                                      >
                                        {levelName}
                                      </span>
                                      <span className="font-medium text-muted-foreground truncate max-w-[200px]">
                                        {block.text ? block.text : <span className="italic opacity-60">empty block</span>}
                                      </span>
                                    </div>

                                    {/* Action: Toggle page break. A rule is a page break already. */}
                                    {block.type !== 'hr' && (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-muted-foreground">Force Break</span>
                                        <Switch
                                          checked={block.pageBreakBefore}
                                          onCheckedChange={() => togglePageBreak(block.id)}
                                          aria-label="Force page break before block"
                                        />
                                      </div>
                                    )}
                                  </div>

                                  {/* Spacing adjustments */}
                                  {spacing && (
                                    <div className="flex flex-wrap items-center justify-between border-t py-2 mt-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground bg-muted/20 -mx-3 -mb-3 px-3 rounded-b-lg">
                                      <div className="flex items-center gap-1">
                                        <span>Space Before:</span>
                                        <span className="font-semibold text-foreground">{spacing.before}pt</span>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 rounded-sm border"
                                          onClick={() => adjustSpacing(block.id, 'before', false)}
                                          aria-label="Decrease space before block"
                                        >
                                          <Minus className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 rounded-sm border"
                                          onClick={() => adjustSpacing(block.id, 'before', true)}
                                          aria-label="Increase space before block"
                                        >
                                          <Plus className="h-3 w-3" />
                                        </Button>
                                      </div>

                                      <div className="flex items-center gap-1">
                                        <span>Space After:</span>
                                        <span className="font-semibold text-foreground">{spacing.after}pt</span>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 rounded-sm border"
                                          onClick={() => adjustSpacing(block.id, 'after', false)}
                                          aria-label="Decrease space after block"
                                        >
                                          <Minus className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 rounded-sm border"
                                          onClick={() => adjustSpacing(block.id, 'after', true)}
                                          aria-label="Increase space after block"
                                        >
                                          <Plus className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              </ScrollArea>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
