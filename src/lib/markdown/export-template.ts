// The stylesheet and document shell for rendered Markdown that leaves the
// page: the HTML download and the document handed to the browser's print
// dialog. The on-page preview uses the same stylesheet, so all three agree.

export type MarkdownTheme = 'light' | 'dark';

export const MARKDOWN_PREVIEW_CSS = `
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

// The exported file is opened away from the app, so the highlight and maths
// stylesheets it needs are linked from public CDNs rather than bundled.
const HIGHLIGHT_STYLESHEETS: Record<MarkdownTheme, string> = {
  light: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css',
  dark: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css',
};
const KATEX_STYLESHEET = 'https://cdn.jsdelivr.net/npm/katex@0.16.27/dist/katex.min.css';

export interface StandaloneHtmlOptions {
  /** Rendered Markdown fragment, placed in the body unchanged. */
  bodyHtml: string;
  /** Text of the `<title>` element, inserted as given. */
  title: string;
  theme: MarkdownTheme;
  /** CSS colour painted behind the content. */
  backgroundColor: string;
  /**
   * Lays the document out for paged printing: an `@page` rule, no screen
   * column and exact background colours. Leave out for a document meant to
   * be read in a browser tab.
   */
  page?: {
    /** CSS page size keyword, for example `A4` or `Letter`. */
    size: string;
    orientation: 'portrait' | 'landscape';
    marginMm: number;
  };
}

/** Wraps a rendered Markdown fragment in a complete, self-describing HTML document. */
export function buildStandaloneHtml(options: StandaloneHtmlOptions): string {
  const { bodyHtml, title, theme, backgroundColor, page } = options;

  const layoutCss = page
    ? `@page {
      size: ${page.size} ${page.orientation};
      margin: ${page.marginMm}mm;
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
    }`
    : `body {
      font-family: Georgia, 'Times New Roman', serif;
      line-height: 1.65;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      color: ${theme === 'dark' ? '#ffffff' : '#111827'};
      background: ${backgroundColor};
    }`;

  const printCss = page
    ? `

    @media print {
      html,
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="${HIGHLIGHT_STYLESHEETS[theme]}">
  <link rel="stylesheet" href="${KATEX_STYLESHEET}">
  <style>
    ${layoutCss}

    ${MARKDOWN_PREVIEW_CSS}${printCss}
  </style>
</head>
<body>
  <main class="markdown-print-preview ${theme === 'dark' ? 'dark-pdf' : ''}">
    ${bodyHtml}
  </main>
</body>
</html>`;
}
