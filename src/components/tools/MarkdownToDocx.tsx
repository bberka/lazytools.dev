'use client';

import { useState, useEffect } from 'react';
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
import MarkdownIt from 'markdown-it';

// Define options structure
interface StyleOptions {
  fontFamily: string;
  bodyFontSize: number;
  bodyLineSpacing: number;
  paragraphSpacingAfter: number;
  h1FontSize: number;
  h2FontSize: number;
  h3FontSize: number;
  h1Color: string;
  h2Color: string;
  h3Color: string;
  headingSpacingBefore: number;
  headingSpacingAfter: number;
  codeBgColor: string;
  codeBorderColor: string;
  tableHeaderBgColor: string;
  tableHeaderColor: string;
}

const THEME_PRESETS: Record<string, { name: string; options: StyleOptions }> = {
  modern: {
    name: 'Modern Clean',
    options: {
      fontFamily: 'Segoe UI',
      bodyFontSize: 11,
      bodyLineSpacing: 1.25,
      paragraphSpacingAfter: 8,
      h1FontSize: 22,
      h2FontSize: 16,
      h3FontSize: 13,
      h1Color: '1F2937', // Charcoal
      h2Color: '374151',
      h3Color: '4B5563',
      headingSpacingBefore: 16,
      headingSpacingAfter: 6,
      codeBgColor: 'F3F4F6',
      codeBorderColor: '9CA3AF',
      tableHeaderBgColor: 'F3F4F6',
      tableHeaderColor: '1F2937',
    },
  },
  corporate: {
    name: 'Corporate Professional',
    options: {
      fontFamily: 'Calibri',
      bodyFontSize: 11,
      bodyLineSpacing: 1.15,
      paragraphSpacingAfter: 6,
      h1FontSize: 20,
      h2FontSize: 15,
      h3FontSize: 12,
      h1Color: '1B365D', // Dark Blue
      h2Color: '2A4B7C',
      h3Color: '46689C',
      headingSpacingBefore: 12,
      headingSpacingAfter: 4,
      codeBgColor: 'F8FAFC',
      codeBorderColor: 'CBD5E1',
      tableHeaderBgColor: '1B365D',
      tableHeaderColor: 'FFFFFF',
    },
  },
  academic: {
    name: 'Academic / Thesis',
    options: {
      fontFamily: 'Times New Roman',
      bodyFontSize: 12,
      bodyLineSpacing: 2.0, // Double spaced
      paragraphSpacingAfter: 12,
      h1FontSize: 18,
      h2FontSize: 14,
      h3FontSize: 12,
      h1Color: '000000',
      h2Color: '000000',
      h3Color: '000000',
      headingSpacingBefore: 18,
      headingSpacingAfter: 12,
      codeBgColor: 'F9FAFB',
      codeBorderColor: 'D1D5DB',
      tableHeaderBgColor: 'FFFFFF',
      tableHeaderColor: '000000',
    },
  },
  technical: {
    name: 'Technical Documentation',
    options: {
      fontFamily: 'Consolas',
      bodyFontSize: 10,
      bodyLineSpacing: 1.15,
      paragraphSpacingAfter: 6,
      h1FontSize: 18,
      h2FontSize: 14,
      h3FontSize: 11,
      h1Color: '0F172A',
      h2Color: '334155',
      h3Color: '475569',
      headingSpacingBefore: 14,
      headingSpacingAfter: 6,
      codeBgColor: 'F1F5F9',
      codeBorderColor: '64748B',
      tableHeaderBgColor: '334155',
      tableHeaderColor: 'FFFFFF',
    },
  },
  elegant: {
    name: 'Elegant Serif (Georgia)',
    options: {
      fontFamily: 'Georgia',
      bodyFontSize: 11.5,
      bodyLineSpacing: 1.35,
      paragraphSpacingAfter: 10,
      h1FontSize: 24,
      h2FontSize: 18,
      h3FontSize: 14,
      h1Color: '2D3748',
      h2Color: '4A5568',
      h3Color: '718096',
      headingSpacingBefore: 20,
      headingSpacingAfter: 8,
      codeBgColor: 'F7FAFC',
      codeBorderColor: 'E2E8F0',
      tableHeaderBgColor: 'EDF2F7',
      tableHeaderColor: '2D3748',
    },
  },
};

interface MarkdownBlock {
  id: string;
  type: 'heading' | 'paragraph' | 'list' | 'code' | 'table' | 'hr';
  level?: number;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokens: any[];
  pageBreakBefore: boolean;
  spacingBefore?: number;
  spacingAfter?: number;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
});

const defaultMarkdown = `# Project Implementation Plan

Welcome to the Markdown to DOCX Converter. This document demonstrates how headings, paragraphs, lists, tables, and code blocks are formatted into a Word document.

## Formatting Features

- **Keep With Next**: Headings will never be split from their following text.
- **Prevent Row Splits**: Tables rows stay together rather than breaking awkwardly.
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

Use the "Spacing & Spacing Outline" tab in the right pane to toggle manual page breaks and add spaces!
`;

// Helper to compile inline tokens to docx TextRuns
const compileInlineTokens = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inlineToken: any,
  options: StyleOptions,
  isHeader: boolean,
  headingLevel?: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  docxLib?: any
) => {
  const { TextRun, ShadingType } = docxLib;

  if (!inlineToken || !inlineToken.children) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runs: any[] = [];
  let isBold = false;
  let isItalic = false;
  let isLink = false;

  // Decide font sizing (in half-points)
  let fontSize = options.bodyFontSize * 2;
  let fontColor = isHeader ? options.tableHeaderColor : undefined;

  if (headingLevel) {
    if (headingLevel === 1) {
      fontSize = options.h1FontSize * 2;
      fontColor = options.h1Color;
    } else if (headingLevel === 2) {
      fontSize = options.h2FontSize * 2;
      fontColor = options.h2Color;
    } else {
      fontSize = options.h3FontSize * 2;
      fontColor = options.h3Color;
    }
  }

  for (const child of inlineToken.children) {
    if (child.type === 'text') {
      runs.push(
        new TextRun({
          text: child.content,
          bold: isBold || isHeader,
          italics: isItalic,
          font: options.fontFamily,
          size: fontSize,
          color: fontColor || (isLink ? '0563C1' : undefined),
          underline: isLink ? {} : undefined,
        })
      );
    } else if (child.type === 'strong_open') {
      isBold = true;
    } else if (child.type === 'strong_close') {
      isBold = false;
    } else if (child.type === 'em_open') {
      isItalic = true;
    } else if (child.type === 'em_close') {
      isItalic = false;
    } else if (child.type === 'code_inline') {
      runs.push(
        new TextRun({
          text: child.content,
          font: 'Consolas',
          size: fontSize * 0.9,
          shading: {
            type: ShadingType.SOLID,
            fill: 'F3F4F6',
            color: 'auto',
          },
        })
      );
    } else if (child.type === 'link_open') {
      isLink = true;
    } else if (child.type === 'link_close') {
      isLink = false;
    } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
      runs.push(
        new TextRun({
          text: '',
          break: 1,
        })
      );
    }
  }

  return runs;
};

// Sync rendered HTML and blocks
const parseMarkdownToBlocks = (markdownText: string): MarkdownBlock[] => {
  if (typeof window === 'undefined') return [];
  try {
    const tokens = md.parse(markdownText, {});
    const parsedBlocks: MarkdownBlock[] = [];
    let currentBlock: MarkdownBlock | null = null;
    let depth = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token.type === 'heading_open') {
        currentBlock = {
          id: `block-${i}-${Math.random().toString(36).substring(2, 7)}`,
          type: 'heading',
          level: parseInt(token.tag.replace('h', ''), 10),
          text: '',
          tokens: [token],
          pageBreakBefore: false,
        };
        depth = 1;
      } else if (token.type === 'paragraph_open') {
        if (depth > 0) {
          if (currentBlock) currentBlock.tokens.push(token);
        } else {
          currentBlock = {
            id: `block-${i}-${Math.random().toString(36).substring(2, 7)}`,
            type: 'paragraph',
            text: '',
            tokens: [token],
            pageBreakBefore: false,
          };
          depth = 1;
        }
      } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        if (depth > 0) {
          if (currentBlock) currentBlock.tokens.push(token);
        } else {
          currentBlock = {
            id: `block-${i}-${Math.random().toString(36).substring(2, 7)}`,
            type: 'list',
            text: '',
            tokens: [token],
            pageBreakBefore: false,
          };
          depth = 1;
        }
      } else if (token.type === 'table_open') {
        if (depth > 0) {
          if (currentBlock) currentBlock.tokens.push(token);
        } else {
          currentBlock = {
            id: `block-${i}-${Math.random().toString(36).substring(2, 7)}`,
            type: 'table',
            text: '',
            tokens: [token],
            pageBreakBefore: false,
          };
          depth = 1;
        }
      } else if (token.type === 'fence' || token.type === 'code_block') {
        if (depth > 0) {
          if (currentBlock) currentBlock.tokens.push(token);
        } else {
          const blockText = token.content || '';
          parsedBlocks.push({
            id: `block-${i}-${Math.random().toString(36).substring(2, 7)}`,
            type: 'code',
            text: blockText,
            tokens: [token],
            pageBreakBefore: false,
          });
        }
      } else if (token.type === 'hr') {
        if (depth > 0) {
          if (currentBlock) currentBlock.tokens.push(token);
        } else {
          parsedBlocks.push({
            id: `block-${i}-${Math.random().toString(36).substring(2, 7)}`,
            type: 'hr',
            text: '--- (Horizontal Rule / Manual Page Break)',
            tokens: [token],
            pageBreakBefore: false,
          });
        }
      } else {
        if (currentBlock) {
          currentBlock.tokens.push(token);

          if (
            (currentBlock.type === 'heading' && token.type === 'heading_close') ||
            (currentBlock.type === 'paragraph' && token.type === 'paragraph_close') ||
            (currentBlock.type === 'list' &&
              (token.type === 'bullet_list_close' || token.type === 'ordered_list_close')) ||
            (currentBlock.type === 'table' && token.type === 'table_close')
          ) {
            depth = 0;

            // Extract clean preview text
            const inlineToken = currentBlock.tokens.find((t) => t.type === 'inline');
            if (inlineToken) {
              currentBlock.text = inlineToken.content;
            } else if (currentBlock.type === 'list') {
              const items = currentBlock.tokens
                .filter((t) => t.type === 'inline')
                .map((t) => '• ' + t.content);
              currentBlock.text = items.join('\n');
            } else if (currentBlock.type === 'table') {
              const inlineTokens = currentBlock.tokens.filter((t) => t.type === 'inline');
              currentBlock.text = `Table (${inlineTokens.length} cells)`;
            }

            parsedBlocks.push(currentBlock);
            currentBlock = null;
          }
        }
      }
    }
    return parsedBlocks;
  } catch {
    return [];
  }
};

export function MarkdownToDocx() {
  const [input, setInput] = useState(defaultMarkdown);
  const [html, setHtml] = useState(() => md.render(defaultMarkdown));
  const [activeRightTab, setActiveRightTab] = useState<'preview' | 'outline'>('outline');
  const [activeLeftTab, setActiveLeftTab] = useState<'layout' | 'typography' | 'breaks'>('layout');
  const [themeKey, setThemeKey] = useState<string>('modern');
  const [options, setOptions] = useState<StyleOptions>({ ...THEME_PRESETS.modern.options });

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

  const [blocks, setBlocks] = useState<MarkdownBlock[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBlocks(parseMarkdownToBlocks(defaultMarkdown));
  }, []);

  const updateBlocksPreservingSettings = (newInput: string) => {
    const freshBlocks = parseMarkdownToBlocks(newInput);
    setBlocks((prev) => {
      return freshBlocks.map((newB, index) => {
        // Try content matching
        const match = prev.find((old) => old.type === newB.type && old.text === newB.text);
        if (match) {
          return {
            ...newB,
            id: match.id,
            pageBreakBefore: match.pageBreakBefore,
            spacingBefore: match.spacingBefore,
            spacingAfter: match.spacingAfter,
          };
        }

        // Try index matching
        if (prev[index] && prev[index].type === newB.type) {
          return {
            ...newB,
            id: prev[index].id,
            pageBreakBefore: prev[index].pageBreakBefore,
            spacingBefore: prev[index].spacingBefore,
            spacingAfter: prev[index].spacingAfter,
          };
        }

        return newB;
      });
    });
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    try {
      setHtml(md.render(val));
    } catch {
      setHtml('<p class="text-red-500">Error parsing Markdown</p>');
    }
    updateBlocksPreservingSettings(val);
  };



  const handleThemeChange = (key: string) => {
    setThemeKey(key);
    if (key !== 'custom' && THEME_PRESETS[key]) {
      setOptions({ ...THEME_PRESETS[key].options });
    }
  };

  const updateOption = (key: keyof StyleOptions, value: string | number) => {
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
      prev.map((b) => {
        if (b.id === id) {
          const current = (type === 'before' ? b.spacingBefore : b.spacingAfter) ?? 0;
          const delta = increment ? 2 : -2;
          const nextVal = Math.max(0, Math.min(100, current + delta));
          return {
            ...b,
            [type === 'before' ? 'spacingBefore' : 'spacingAfter']: nextVal,
          };
        }
        return b;
      })
    );
  };

  const handleClear = () => {
    setInput('');
    setHtml('');
    setBlocks([]);
  };

  const handleDownloadDocx = async () => {
    if (blocks.length === 0) return;
    setExporting(true);

    try {
      const docx = await import('docx');
      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        Table,
        TableRow,
        TableCell,
        WidthType,
        BorderStyle,
        PageBreak,
        AlignmentType,
        PageOrientation,
        HeadingLevel,
        Header,
        Footer,
        PageNumber,
      } = docx;

      const pageSizes = {
        A4: { width: 11906, height: 16838 },
        Letter: { width: 12240, height: 15840 },
      };

      const marginsMap = {
        normal: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        narrow: { top: 720, bottom: 720, left: 720, right: 720 },
        wide: { top: 1440, bottom: 1440, left: 2160, right: 2160 },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const compiledElements: any[] = [];
      let lastElementWasPageBreak: boolean = true;

      for (const block of blocks) {
        // Evaluate manual and automatic page breaks
        const hasManualBreak = block.pageBreakBefore;
        const hasAutoBreak =
          (block.type === 'heading' && block.level === 1 && autoPageBreakBeforeH1) ||
          (block.type === 'heading' && block.level === 2 && autoPageBreakBeforeH2);

        const shouldBreakBefore: boolean = (hasManualBreak || hasAutoBreak) && !lastElementWasPageBreak;

        if (block.type === 'heading') {
          const runs = compileInlineTokens(
            block.tokens.find((t) => t.type === 'inline'),
            options,
            false,
            block.level,
            docx
          );

          compiledElements.push(
            new Paragraph({
              children: runs,
              heading:
                block.level === 1
                  ? HeadingLevel.HEADING_1
                  : block.level === 2
                  ? HeadingLevel.HEADING_2
                  : HeadingLevel.HEADING_3,
              spacing: {
                before: (block.spacingBefore ?? options.headingSpacingBefore) * 20,
                after: (block.spacingAfter ?? options.headingSpacingAfter) * 20,
              },
              keepNext: keepHeadingsWithNext,
              pageBreakBefore: shouldBreakBefore,
            })
          );
          lastElementWasPageBreak = shouldBreakBefore;
        } else if (block.type === 'paragraph') {
          const runs = compileInlineTokens(
            block.tokens.find((t) => t.type === 'inline'),
            options,
            false,
            undefined,
            docx
          );

          compiledElements.push(
            new Paragraph({
              children: runs,
              spacing: {
                before: (block.spacingBefore ?? 0) * 20,
                after: (block.spacingAfter ?? options.paragraphSpacingAfter) * 20,
                line: options.bodyLineSpacing * 240,
              },
              keepLines: true,
              pageBreakBefore: shouldBreakBefore,
            })
          );
          lastElementWasPageBreak = shouldBreakBefore;
        } else if (block.type === 'hr') {
          compiledElements.push(
            new Paragraph({
              children: [new PageBreak()],
            })
          );
          lastElementWasPageBreak = true;
        } else if (block.type === 'list') {
          let itemIndex = 1;
          const isOrdered = block.tokens[0].type === 'ordered_list_open';
          let inItem = false;
          let isFirstItem = true;

          for (const token of block.tokens) {
            if (token.type === 'list_item_open') {
              inItem = true;
            } else if (token.type === 'list_item_close') {
              inItem = false;
            } else if (token.type === 'inline' && inItem) {
              const runs = compileInlineTokens(token, options, false, undefined, docx);
              const prefix = isOrdered ? `${itemIndex}.  ` : '•  ';

              compiledElements.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: prefix,
                      bold: true,
                      font: options.fontFamily,
                      size: options.bodyFontSize * 2,
                    }),
                    ...runs,
                  ],
                  indent: {
                    left: 720,
                    hanging: 360,
                  },
                  spacing: {
                    before: (block.spacingBefore ?? 0) * 20,
                    after: (block.spacingAfter ?? options.paragraphSpacingAfter / 2) * 20,
                    line: options.bodyLineSpacing * 240,
                  },
                  pageBreakBefore: shouldBreakBefore && isFirstItem,
                })
              );
              isFirstItem = false;
              if (isOrdered) itemIndex++;
            }
          }
          lastElementWasPageBreak = shouldBreakBefore;
        } else if (block.type === 'code') {
          const rawCode = block.tokens[0].content || '';
          const codeLines = rawCode.replace(/\n$/, '').split('\n');

          compiledElements.push(
            new Table({
              rows: [
                new TableRow({
                  cantSplit: true,
                  children: [
                    new TableCell({
                      children: codeLines.map(
                        (line: string, lineIdx: number) =>
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: line,
                                font: 'Consolas',
                                size: options.bodyFontSize * 1.8,
                              }),
                            ],
                            spacing: { before: 0, after: 0, line: 240 },
                            pageBreakBefore: shouldBreakBefore && lineIdx === 0,
                          })
                      ),
                      shading: { fill: options.codeBgColor },
                      borders: {
                        top: { style: BorderStyle.NONE },
                        bottom: { style: BorderStyle.NONE },
                        right: { style: BorderStyle.NONE },
                        left: {
                          style: BorderStyle.SINGLE,
                          size: 24,
                          color: options.codeBorderColor,
                        },
                      },
                      margins: { top: 160, bottom: 160, left: 200, right: 200 },
                    }),
                  ],
                }),
              ],
              width: {
                size: 100,
                type: WidthType.PERCENTAGE,
              },
            })
          );
          lastElementWasPageBreak = shouldBreakBefore;
        } else if (block.type === 'table') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tableRows: any[] = [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let currentRowCells: any[] = [];
          let isHeaderCell = false;
          let isFirstCellInTable = true;

          for (const token of block.tokens) {
            if (token.type === 'thead_open') {
              isHeaderCell = true;
            } else if (token.type === 'thead_close') {
              isHeaderCell = false;
            } else if (token.type === 'tr_open') {
              currentRowCells = [];
            } else if (token.type === 'tr_close') {
              tableRows.push(
                new TableRow({
                  tableHeader: isHeaderCell,
                  cantSplit: preventTableRowSplit,
                  children: currentRowCells,
                })
              );
            } else if (token.type === 'inline') {
              const runs = compileInlineTokens(token, options, isHeaderCell, undefined, docx);
              currentRowCells.push(
                new TableCell({
                  children: [
                    new Paragraph({
                      children: runs,
                      spacing: { before: 0, after: 0 },
                      pageBreakBefore: shouldBreakBefore && isFirstCellInTable,
                    }),
                  ],
                  shading: isHeaderCell ? { fill: options.tableHeaderBgColor } : undefined,
                  margins: { top: 120, bottom: 120, left: 120, right: 120 },
                })
              );
              isFirstCellInTable = false;
            }
          }

          if (tableRows.length > 0) {
            compiledElements.push(
              new Table({
                rows: tableRows,
                width: {
                  size: 100,
                  type: WidthType.PERCENTAGE,
                },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
                  left: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
                  right: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
                  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
                  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
                },
              })
            );
          }
          lastElementWasPageBreak = shouldBreakBefore;
        }
      }

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                size: {
                  width:
                    orientation === 'portrait' ? pageSizes[pageSize].width : pageSizes[pageSize].height,
                  height:
                    orientation === 'portrait' ? pageSizes[pageSize].height : pageSizes[pageSize].width,
                  orientation:
                    orientation === 'portrait'
                      ? PageOrientation.PORTRAIT
                      : PageOrientation.LANDSCAPE,
                },
                margin: marginsMap[marginType],
              },
              // Configure Footer
              ...(includePageNumbers || footerText
                ? {
                    footers: {
                      default: new Footer({
                        children: [
                          new Paragraph({
                            alignment:
                              pageNumberPosition === 'left'
                                ? AlignmentType.LEFT
                                : pageNumberPosition === 'right'
                                ? AlignmentType.RIGHT
                                : AlignmentType.CENTER,
                            children: [
                              ...(footerText
                                ? [
                                    new TextRun({
                                      text: `${footerText}      `,
                                      font: options.fontFamily,
                                      size: 18,
                                      color: '6B7280',
                                    }),
                                  ]
                                : []),
                              ...(includePageNumbers
                                ? [
                                    new TextRun({
                                      text: 'Page ',
                                      font: options.fontFamily,
                                      size: 18,
                                      color: '6B7280',
                                    }),
                                    new TextRun({
                                      children: [PageNumber.CURRENT],
                                      font: options.fontFamily,
                                      size: 18,
                                      color: '6B7280',
                                    }),
                                    new TextRun({
                                      text: ' of ',
                                      font: options.fontFamily,
                                      size: 18,
                                      color: '6B7280',
                                    }),
                                    new TextRun({
                                      children: [PageNumber.TOTAL_PAGES],
                                      font: options.fontFamily,
                                      size: 18,
                                      color: '6B7280',
                                    }),
                                  ]
                                : []),
                            ],
                          }),
                        ],
                      }),
                    },
                  }
                : {}),
              // Configure Header
              ...(headerText
                ? {
                    headers: {
                      default: new Header({
                        children: [
                          new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            children: [
                              new TextRun({
                                text: headerText,
                                font: options.fontFamily,
                                size: 18,
                                color: '6B7280',
                                italics: true,
                              }),
                            ],
                          }),
                        ],
                      }),
                    },
                  }
                : {}),
            },
            children: compiledElements,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Extract filename from H1 if possible
      let docTitle = 'markdown-export';
      const firstHeading = blocks.find((b) => b.type === 'heading');
      if (firstHeading && firstHeading.text) {
        docTitle = firstHeading.text
          .replace(/[\\/:*?"<>|]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      link.download = `${docTitle}.docx`;
      link.click();

      // Defer revocation and spinner reset to give the browser time to initiate the large file download
      setTimeout(() => {
        URL.revokeObjectURL(url);
        setExporting(false);
      }, 1500);
    } catch (err) {
      console.error('Error compiling docx:', err);
      alert('Failed to generate Word document.');
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
                      <label className="text-xs font-semibold block mb-1">Page Size</label>
                      <Select value={pageSize} onValueChange={(val: 'A4' | 'Letter') => setPageSize(val)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Page Size" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A4">A4 (210 x 297 mm)</SelectItem>
                          <SelectItem value="Letter">Letter (8.5 x 11 in)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1">Orientation</label>
                      <Select value={orientation} onValueChange={(val: 'portrait' | 'landscape') => setOrientation(val)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Orientation" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="portrait">Portrait</SelectItem>
                          <SelectItem value="landscape">Landscape</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1">Page Margins</label>
                      <Select value={marginType} onValueChange={(val: 'normal' | 'narrow' | 'wide') => setMarginType(val)}>
                        <SelectTrigger className="h-9">
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
                      <label className="text-xs font-semibold block mb-1">Header Text (Right aligned)</label>
                      <Input
                        placeholder="e.g. Project Proposal"
                        value={headerText}
                        onChange={(e) => setHeaderText(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1">Footer Text (Left aligned)</label>
                      <Input
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
                          <span className="text-[10px] text-muted-foreground">Page Number Alignment</span>
                          <Select
                            value={pageNumberPosition}
                            onValueChange={(val: 'left' | 'center' | 'right') => setPageNumberPosition(val)}
                          >
                            <SelectTrigger className="h-7 w-28 text-[11px]">
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
                      <label className="text-xs font-semibold block mb-1">Theme Preset</label>
                      <Select value={themeKey} onValueChange={handleThemeChange}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(THEME_PRESETS).map(([key, item]) => (
                            <SelectItem key={key} value={key}>
                              {item.name}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Custom Styling</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1">Font Family</label>
                      <Select
                        value={options.fontFamily}
                        onValueChange={(val) => updateOption('fontFamily', val)}
                      >
                        <SelectTrigger className="h-9">
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
                      <label className="text-xs font-semibold block mb-1">Line Spacing</label>
                      <Select
                        value={String(options.bodyLineSpacing)}
                        onValueChange={(val) => updateOption('bodyLineSpacing', parseFloat(val))}
                      >
                        <SelectTrigger className="h-9">
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
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-semibold">Body Font Size ({options.bodyFontSize}pt)</span>
                        </div>
                        <Slider
                          value={options.bodyFontSize}
                          min={9}
                          max={16}
                          step={0.5}
                          onChange={(val: number) => updateOption('bodyFontSize', val)}
                        />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-semibold">Paragraph Spacing After ({options.paragraphSpacingAfter}pt)</span>
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
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-semibold">Heading 1 Size ({options.h1FontSize}pt)</span>
                        </div>
                        <Slider
                          value={options.h1FontSize}
                          min={14}
                          max={32}
                          step={1}
                          onChange={(val: number) => updateOption('h1FontSize', val)}
                        />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-semibold">Heading Spacing Before ({options.headingSpacingBefore}pt)</span>
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
                                            ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200'
                                            : block.type === 'code'
                                            ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200'
                                            : block.type === 'table'
                                            ? 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200'
                                            : 'bg-secondary text-secondary-foreground'
                                        }`}
                                      >
                                        {levelName}
                                      </span>
                                      <span className="font-medium text-muted-foreground truncate max-w-[200px]">
                                        {block.text ? block.text : <span className="italic text-slate-300">empty block</span>}
                                      </span>
                                    </div>

                                    {/* Action: Toggle page break */}
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-muted-foreground">Force Break</span>
                                      <Switch
                                        checked={block.pageBreakBefore}
                                        onCheckedChange={() => togglePageBreak(block.id)}
                                        aria-label="Force page break before block"
                                      />
                                    </div>
                                  </div>

                                  {/* Spacing adjustments */}
                                  <div className="flex items-center justify-between border-t pt-2 mt-2 gap-4 text-[10px] text-muted-foreground bg-muted/20 -mx-3 -mb-3 px-3 rounded-b-lg">
                                    <div className="flex items-center gap-1">
                                      <span>Space Before:</span>
                                      <span className="font-semibold text-foreground">
                                        {block.spacingBefore ?? (isHeading ? options.headingSpacingBefore : 0)}pt
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 rounded-sm border"
                                        onClick={() => adjustSpacing(block.id, 'before', false)}
                                      >
                                        <Minus className="h-2 w-2" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 rounded-sm border"
                                        onClick={() => adjustSpacing(block.id, 'before', true)}
                                      >
                                        <Plus className="h-2 w-2" />
                                      </Button>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <span>Space After:</span>
                                      <span className="font-semibold text-foreground">
                                        {block.spacingAfter ??
                                          (isHeading
                                            ? options.headingSpacingAfter
                                            : block.type === 'list'
                                            ? options.paragraphSpacingAfter / 2
                                            : options.paragraphSpacingAfter)}
                                        pt
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 rounded-sm border"
                                        onClick={() => adjustSpacing(block.id, 'after', false)}
                                      >
                                        <Minus className="h-2 w-2" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 rounded-sm border"
                                        onClick={() => adjustSpacing(block.id, 'after', true)}
                                      >
                                        <Plus className="h-2 w-2" />
                                      </Button>
                                    </div>
                                  </div>
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
