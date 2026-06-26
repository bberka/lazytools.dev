'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TooltipSimple } from '@/components/ui/tooltip';
import {
  Eye,
  FileText,
  Copy,
  Check,
  Trash2,
  Bold,
  Italic,
  List,
  ListOrdered,
  Link,
  Heading1,
  Heading2,
  Code,
  Quote,
  Download,
  FileCode,
} from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
      } catch (__) {}
    }
    return `<pre class="hljs"><code>${escapeHtml(str)}</code></pre>`;
  }
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
  katexOptions: { macros: { "\\RR": "\\mathbb{R}" } }
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

const defaultMarkdown = `# Markdown Editor

Welcome to the **Markdown Editor**!

## Features

- **Live Preview**
- **Toolbar Actions** (Bold, Italic, etc.)
- **LaTeX Support**: $\\frac{1}{n} \\sum_{i=1}^{n} x_i$
- **Code Highlighting**
- **HTML Export**

### Code Blocks

\`\`\`javascript
function greet() {
  console.log("Hello!");
}
\`\`\`
`;

export function MarkdownEditor() {
  const [input, setInput] = useState(defaultMarkdown);
  const [output, setOutput] = useState('');
  const [fullPreview, setFullPreview] = useState(false);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    try {
      setOutput(md.render(text || ''));
    } catch {
      setOutput('<div class="text-destructive">Error rendering markdown</div>');
    }
  };

  const handleInputChange = (text: string) => {
    setInput(text);
    renderMarkdown(text);
  };

  useEffect(() => {
    renderMarkdown(input);
  }, []);

  // Auto-resize textarea to fit content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const adjustHeight = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    };

    const timer = setTimeout(adjustHeight, 0);

    window.addEventListener('resize', adjustHeight);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', adjustHeight);
    };
  }, [input, fullPreview]);

  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = input.substring(start, end);
    const replacement = before + selection + after;
    const newValue = input.substring(0, start) + replacement + input.substring(end);

    setInput(newValue);
    renderMarkdown(newValue);

    // Set focus back and selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const exportHtml = () => {
    const blob = new Blob([output], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'document.html';
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Premium Toggle Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm transition-all duration-300">
        <div className="flex items-center gap-2.5">
          <Eye className="h-5 w-5 text-primary animate-pulse" />
          <div>
            <h3 className="font-semibold text-foreground leading-none">Markdown Editor</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Toggle full preview mode to focus entirely on the rendered output
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-1.5 px-3 border border-border/50">
          <span className="text-xs font-medium text-muted-foreground sm:text-sm">
            {fullPreview ? 'Full Preview' : 'Split View'}
          </span>
          <Switch
            checked={fullPreview}
            onCheckedChange={setFullPreview}
            aria-label="Toggle full preview mode"
          />
        </div>
      </div>

      {!fullPreview && (
        <div className="flex flex-wrap gap-1">
            <TooltipSimple content="H1">
              <Button variant="outline" size="icon" onClick={() => insertText('# ', '')} aria-label="Heading 1"><Heading1 className="h-4 w-4" /></Button>
            </TooltipSimple>
            <TooltipSimple content="H2">
              <Button variant="outline" size="icon" onClick={() => insertText('## ', '')} aria-label="Heading 2"><Heading2 className="h-4 w-4" /></Button>
            </TooltipSimple>
            <div className="w-[1px] h-8 bg-border mx-1" />
            <TooltipSimple content="Bold">
              <Button variant="outline" size="icon" onClick={() => insertText('**', '**')} aria-label="Bold"><Bold className="h-4 w-4" /></Button>
            </TooltipSimple>
            <TooltipSimple content="Italic">
              <Button variant="outline" size="icon" onClick={() => insertText('_', '_')} aria-label="Italic"><Italic className="h-4 w-4" /></Button>
            </TooltipSimple>
            <div className="w-[1px] h-8 bg-border mx-1" />
            <TooltipSimple content="Unordered List">
              <Button variant="outline" size="icon" onClick={() => insertText('- ', '')} aria-label="Unordered List"><List className="h-4 w-4" /></Button>
            </TooltipSimple>
            <TooltipSimple content="Ordered List">
              <Button variant="outline" size="icon" onClick={() => insertText('1. ', '')} aria-label="Ordered List"><ListOrdered className="h-4 w-4" /></Button>
            </TooltipSimple>
            <div className="w-[1px] h-8 bg-border mx-1" />
            <TooltipSimple content="Link">
              <Button variant="outline" size="icon" onClick={() => insertText('[', '](url)')} aria-label="Link"><Link className="h-4 w-4" /></Button>
            </TooltipSimple>
            <TooltipSimple content="Inline Code">
              <Button variant="outline" size="icon" onClick={() => insertText('`', '`')} aria-label="Inline Code"><Code className="h-4 w-4" /></Button>
            </TooltipSimple>
            <TooltipSimple content="Quote">
              <Button variant="outline" size="icon" onClick={() => insertText('> ', '')} aria-label="Quote"><Quote className="h-4 w-4" /></Button>
            </TooltipSimple>
        </div>
      )}

      <div className={cn(
        "grid grid-cols-1 gap-4",
        fullPreview ? "grid-cols-1" : "lg:grid-cols-2"
      )}>
        {!fullPreview && (
          <Card className="transition-all duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" /> Editor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="Write markdown here..."
                className="min-h-[500px] w-full resize-none overflow-hidden font-mono text-sm leading-relaxed border focus-visible:ring-primary/20 focus-visible:border-primary transition-all duration-200"
              />
            </CardContent>
          </Card>
        )}

        <Card className="transition-all duration-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" /> Preview
            </CardTitle>
            <CardDescription>
              Double-click a line in the preview to jump to that line in the editor
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm dark:prose-invert max-w-none min-h-[500px] p-4 border rounded-md bg-card cursor-pointer select-text"
              dangerouslySetInnerHTML={{ __html: output }}
              onDoubleClick={handlePreviewDoubleClick}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => copyToClipboard(input)} variant={isCopied ? "default" : "outline"} className="flex-1">
          {isCopied ? <><Check className="h-4 w-4 mr-2" /> Copied!</> : <><Copy className="h-4 w-4 mr-2" /> Copy Markdown</>}
        </Button>
        <Button onClick={exportHtml} variant="outline" className="flex-1">
          <FileCode className="h-4 w-4 mr-2" /> Export HTML
        </Button>
        <Button onClick={() => setInput('')} variant="outline" className="flex-1">
          <Trash2 className="h-4 w-4 mr-2" /> Clear
        </Button>
      </div>
    </div>
  );
}
