import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdownLanguage from 'highlight.js/lib/languages/markdown';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import katex from 'katex';
import type { PluginSimple } from 'markdown-it';
import texmath from 'markdown-it-texmath';
import { createMarkdownParser, type MarkdownParser } from './parser';

// Markdown rendering for the preview and its exports: the shared syntax from
// `./parser` plus syntax highlighting, KaTeX maths and source-line mapping.
// Everything exported here is pure and runs without a DOM. The browser-only
// helpers live in `./dom`, and the stylesheets that give the highlighted and
// maths markup its look (`highlight.js/styles/*`, `katex/dist/katex.min.css`)
// are imported by the component that mounts the preview.

export {
  MARKDOWN_PREVIEW_CSS,
  buildStandaloneHtml,
  type MarkdownTheme,
  type StandaloneHtmlOptions,
} from './export-template';
export type { MarkdownParser, MarkdownToken } from './parser';

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

// Fenced code in a registered language is highlighted; anything else is
// escaped and shown as plain text in the same block markup.
function highlightCode(code: string, language: string): string {
  if (language && hljs.getLanguage(language)) {
    try {
      return `<pre class="hljs"><code>${hljs.highlight(code, { language, ignoreIllegals: true }).value}</code></pre>`;
    } catch {
      // Fall through to the escaped block.
    }
  }
  return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`;
}

/** Attribute on rendered blocks holding the zero-based source line they start on. */
export const SOURCE_LINE_ATTRIBUTE = 'data-source-line';

// Stamps every block that opens on a known source line, so a click in the
// rendered output can be traced back to the text that produced it.
const sourceLines: PluginSimple = (markdown) => {
  markdown.core.ruler.push('inject_line_numbers', (state) => {
    state.tokens.forEach((token) => {
      if (token.map && token.nesting >= 0) {
        token.attrSet(SOURCE_LINE_ATTRIBUTE, String(token.map[0]));
      }
    });
  });
};

// `$...$` inline and `$$...$$` display maths, rendered by KaTeX.
const maths: PluginSimple = (markdown) => {
  markdown.use(texmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: { macros: { '\\RR': '\\mathbb{R}' } },
  });
};

/** The parser behind the Markdown preview and everything exported from it. */
export const previewMarkdown: MarkdownParser = createMarkdownParser({
  highlight: highlightCode,
  plugins: [sourceLines, maths],
});

/**
 * Character offset in `source` at which zero-based `line` starts, for moving
 * an editor caret to the line named by a `SOURCE_LINE_ATTRIBUTE` value.
 * Lines past the end resolve to the end of the text.
 */
export function sourceLineOffset(source: string, line: number): number {
  const lines = source.split('\n');
  let offset = 0;

  for (let index = 0; index < Math.min(line, lines.length); index++) {
    offset += lines[index].length + 1; // +1 for '\n'
  }

  return Math.min(offset, source.length);
}
