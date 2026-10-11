import { test, expect } from '@playwright/test';
import { planPageSlices } from '@/lib/export/snapshot-pdf';
import {
  MARKDOWN_PREVIEW_CSS,
  SOURCE_LINE_ATTRIBUTE,
  buildStandaloneHtml,
  previewMarkdown,
  sourceLineOffset,
} from '@/lib/markdown';
import { createMarkdownParser, type MarkdownToken } from '@/lib/markdown/parser';

const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1;

test.describe('preview rendering', () => {
  test('renders headings', () => {
    const html = previewMarkdown.render('# One\n\n## Two\n');

    expect(html).toContain('<h1 data-source-line="0">One</h1>');
    expect(html).toContain('<h2 data-source-line="2">Two</h2>');
  });

  test('renders bullet and ordered lists', () => {
    const html = previewMarkdown.render('- a\n- b\n\n1. x\n2. y\n');

    expect(html).toContain('<ul data-source-line="0">');
    expect(html).toContain('<li data-source-line="1">b</li>');
    expect(html).toContain('<ol data-source-line="3">');
    expect(html).toContain('<li data-source-line="4">y</li>');
  });

  test('renders tables with a header and a body', () => {
    const html = previewMarkdown.render('| Name | Role |\n|------|------|\n| Ada | Engineer |\n');

    expect(html).toContain('<thead');
    expect(html).toContain('<th>Name</th>');
    expect(html).toContain('<tbody');
    expect(html).toContain('<td>Engineer</td>');
  });

  test('applies the shared syntax options', () => {
    const html = previewMarkdown.render(
      'Visit https://example.com now\nsecond line\n\n"quoted" (c)\n\n<mark>raw</mark>\n'
    );

    // linkify, breaks, typographer and html, in that order.
    expect(html).toContain('<a href="https://example.com">https://example.com</a>');
    expect(html).toContain('now<br>\nsecond line');
    expect(html).toContain('“quoted” ©');
    expect(html).toContain('<mark>raw</mark>');
  });

  test('highlights fenced code in a registered language', () => {
    const html = previewMarkdown.render('```typescript\nconst n: number = 1 < 2 ? 1 : 2;\n```\n');

    expect(html).toContain('<pre class="hljs"><code><span class="hljs-keyword">const</span>');
    expect(html).toContain('<span class="hljs-built_in">number</span>');
    // The code itself is still escaped.
    expect(html).toContain('&lt;');
    expect(html).not.toContain('1 < 2');
  });

  test('knows every language the preview advertises', () => {
    const samples: Record<string, string> = {
      bash: 'echo "hi"',
      css: 'a { color: red; }',
      html: '<p class="x">hi</p>',
      javascript: 'const a = 1;',
      json: '{ "a": 1 }',
      markdown: '# Title',
      typescript: 'const a: number = 1;',
      xml: '<a b="c">d</a>',
    };

    for (const [language, code] of Object.entries(samples)) {
      const html = previewMarkdown.render(`\`\`\`${language}\n${code}\n\`\`\`\n`);
      expect(html, language).toContain('<span class="hljs-');
    }
  });

  test('escapes fenced code in an unknown language', () => {
    const html = previewMarkdown.render('```nolang\n<b>&"\'</b>\n```\n');

    expect(html).toBe(
      '<pre class="hljs"><code>&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;\n</code></pre>\n'
    );
  });

  test('escapes fenced code with no language', () => {
    const html = previewMarkdown.render('```\n<i>x</i>\n```\n');

    expect(html).toBe('<pre class="hljs"><code>&lt;i&gt;x&lt;/i&gt;\n</code></pre>\n');
  });

  test('renders inline maths', () => {
    const html = previewMarkdown.render('Euler: $e^{i\\pi} + 1 = 0$ holds.');

    expect(html).toContain('Euler: <eq><span class="katex">');
    expect(html).toContain(
      '<annotation encoding="application/x-tex">e^{i\\pi} + 1 = 0</annotation>'
    );
    expect(html).toContain('</eq> holds.');
    expect(html).not.toContain('$');
  });

  test('renders block maths', () => {
    const html = previewMarkdown.render('$$\n\\int_0^1 x\\,dx\n$$\n');

    expect(html).toContain('<section><eqn><span class="katex-display">');
    expect(html).toContain('\\int_0^1 x\\,dx');
    expect(html).not.toContain('$$');
  });

  test('expands the \\RR macro', () => {
    const html = previewMarkdown.render('$x \\in \\RR$');

    expect(html).toContain('<mi mathvariant="double-struck">R</mi>');
    // KaTeX prints a command it does not know in red instead of throwing.
    expect(html).not.toContain('#cc0000');
  });

  test('leaves prices alone', () => {
    const html = previewMarkdown.render('It costs $5 and $10.');

    expect(html).toBe('<p data-source-line="0">It costs $5 and $10.</p>\n');
  });
});

test.describe('source line mapping', () => {
  const source = [
    '# Title', // 0
    '',
    'First paragraph', // 2
    'spans two lines.',
    '',
    '- alpha', // 5
    '- beta', // 6
    '',
    '> quote', // 8
    '',
    '| A | B |', // 10
    '|---|---|',
    '| 1 | 2 |', // 12
    '',
    '---', // 14
    '',
    'Last paragraph.', // 16
    '',
  ].join('\n');

  const stampedBlocks = (html: string) =>
    [...html.matchAll(new RegExp(`<(\\w+) ${SOURCE_LINE_ATTRIBUTE}="(\\d+)"`, 'g'))].map(
      (match) => [match[1], Number(match[2])] as const
    );

  test('stamps each block with the line it starts on', () => {
    expect(stampedBlocks(previewMarkdown.render(source))).toEqual([
      ['h1', 0],
      ['p', 2],
      ['ul', 5],
      ['li', 5],
      ['li', 6],
      ['blockquote', 8],
      ['p', 8],
      ['table', 10],
      ['thead', 10],
      ['tr', 10],
      ['tbody', 12],
      ['tr', 12],
      ['hr', 14],
      ['p', 16],
    ]);
  });

  test('resolves a stamped line to where that line starts in the source', () => {
    const startsWith = (line: number) => source.slice(sourceLineOffset(source, line));

    expect(sourceLineOffset(source, 0)).toBe(0);
    expect(startsWith(2)).toMatch(/^First paragraph\n/);
    expect(startsWith(6)).toMatch(/^- beta\n/);
    expect(startsWith(12)).toMatch(/^\| 1 \| 2 \|\n/);
    expect(startsWith(16)).toMatch(/^Last paragraph\./);
  });

  test('every stamped line points at the text that produced the block', () => {
    const lines = source.split('\n');

    for (const [tag, line] of stampedBlocks(previewMarkdown.render(source))) {
      const offset = sourceLineOffset(source, line);
      expect(source.slice(offset, offset + lines[line].length), tag).toBe(lines[line]);
      expect(lines[line].trim(), tag).not.toBe('');
    }
  });

  test('clamps lines outside the source', () => {
    expect(sourceLineOffset('ab\ncd', -1)).toBe(0);
    expect(sourceLineOffset('ab\ncd', 1)).toBe(3);
    expect(sourceLineOffset('ab\ncd', 2)).toBe(5);
    expect(sourceLineOffset('ab\ncd', 99)).toBe(5);
    expect(sourceLineOffset('', 3)).toBe(0);
  });
});

test.describe('standalone export template', () => {
  const bodyHtml = '<h1>Quarterly Report</h1>\n<p>unique-body-marker</p>';

  test('wraps the content once with the given title', () => {
    const html = buildStandaloneHtml({
      bodyHtml,
      title: 'Quarterly Report',
      theme: 'light',
      backgroundColor: '#ffffff',
    });

    expect(html.startsWith('<!DOCTYPE html>\n<html lang="en">')).toBe(true);
    expect(html.endsWith('</body>\n</html>')).toBe(true);
    expect(countOf(html, '<title>')).toBe(1);
    expect(html).toContain('<title>Quarterly Report</title>');
    expect(countOf(html, 'unique-body-marker')).toBe(1);
    expect(countOf(html, '<main')).toBe(1);
    expect(html).toContain(`<main class="markdown-print-preview ">\n    ${bodyHtml}\n  </main>`);
    expect(countOf(html, MARKDOWN_PREVIEW_CSS)).toBe(1);
  });

  test('builds a screen document by default', () => {
    const html = buildStandaloneHtml({
      bodyHtml,
      title: 'Doc',
      theme: 'light',
      backgroundColor: '#fafafa',
    });

    expect(html).toContain('max-width: 800px;');
    expect(html).toContain('color: #111827;\n      background: #fafafa;');
    expect(html).toContain('/styles/github.min.css">');
    expect(html).toContain('katex.min.css">');
    expect(html).not.toContain('@page');
    expect(html).not.toContain('@media print');
  });

  test('builds a paged document for printing', () => {
    const html = buildStandaloneHtml({
      bodyHtml,
      title: '',
      theme: 'light',
      backgroundColor: '#ffffff',
      page: { size: 'A4', orientation: 'landscape', marginMm: 12 },
    });

    expect(html).toContain('<title></title>');
    expect(html).toContain('@page {\n      size: A4 landscape;\n      margin: 12mm;\n    }');
    expect(html).toContain('print-color-adjust: exact;');
    expect(html).not.toContain('max-width: 800px;');
    expect(countOf(html, 'unique-body-marker')).toBe(1);
  });

  test('switches stylesheet, text colour and class for the dark theme', () => {
    const html = buildStandaloneHtml({
      bodyHtml,
      title: 'Doc',
      theme: 'dark',
      backgroundColor: '#000000',
    });

    expect(html).toContain('/styles/github-dark.min.css">');
    expect(html).toContain('color: #ffffff;\n      background: #000000;');
    expect(html).toContain('<main class="markdown-print-preview dark-pdf">');
  });
});

test.describe('DOCX-side parser', () => {
  const docxMarkdown = createMarkdownParser();

  // How the source was split up, without the attributes and rendering
  // details the preview layers on top.
  const structure = (tokens: MarkdownToken[]): unknown[] =>
    tokens.map((token) => ({
      type: token.type,
      tag: token.tag,
      nesting: token.nesting,
      level: token.level,
      map: token.map,
      markup: token.markup,
      info: token.info,
      content: token.content,
      children: token.children ? structure(token.children) : null,
    }));

  const sample = [
    '# Project *Plan*',
    '',
    'Intro with **bold**, `code`, a [link](https://example.com) and https://auto.link',
    'continued on a second line.',
    '',
    '- first',
    '- second',
    '  - nested',
    '',
    '1. one',
    '2. two',
    '',
    '> quoted "text"',
    '',
    '```javascript',
    'const a = 1;',
    '```',
    '',
    '    indented code',
    '',
    '| Feature | Support |',
    '|---------|---------|',
    '| Tables | Yes |',
    '',
    '---',
    '',
    '<div>raw html</div>',
    '',
    'Closing paragraph.',
    '',
  ].join('\n');

  test('agrees with the preview parser on block structure', () => {
    const docxTokens = docxMarkdown.parse(sample);

    expect(structure(docxTokens)).toEqual(structure(previewMarkdown.parse(sample)));
    expect(
      docxTokens
        .filter((token) => token.level === 0 && token.nesting >= 0)
        .map((token) => token.type)
    ).toEqual([
      'heading_open',
      'paragraph_open',
      'bullet_list_open',
      'ordered_list_open',
      'blockquote_open',
      'fence',
      'code_block',
      'table_open',
      'hr',
      'html_block',
      'paragraph_open',
    ]);
  });

  test('carries no preview-only attributes', () => {
    const tokens = docxMarkdown.parse(sample);

    expect(tokens.every((token) => token.attrGet(SOURCE_LINE_ATTRIBUTE) === null)).toBe(true);
    expect(docxMarkdown.render('```js\nlet a = 1;\n```\n')).toBe(
      '<pre><code class="language-js">let a = 1;\n</code></pre>\n'
    );
  });

  test('keeps maths as literal text, where the preview renders it', () => {
    const inlineTypes = (tokens: MarkdownToken[]) =>
      tokens.flatMap((token) => token.children ?? []).map((child) => child.type);

    const inline = 'Mass: $E = mc^2$';
    expect(inlineTypes(previewMarkdown.parse(inline))).toEqual(['text', 'math_inline']);
    expect(inlineTypes(docxMarkdown.parse(inline))).toEqual(['text']);
    expect(docxMarkdown.parse(inline)[1].content).toBe(inline);

    const block = '$$\na + b\n$$\n';
    expect(previewMarkdown.parse(block).map((token) => token.type)).toEqual(['math_block']);
    expect(docxMarkdown.parse(block).map((token) => token.type)).toEqual([
      'paragraph_open',
      'inline',
      'paragraph_close',
    ]);
  });
});

test.describe('snapshot PDF paging', () => {
  test('cuts a capture into page-high slices with the remainder last', () => {
    expect(planPageSlices(2500, 1000)).toEqual([
      { sourceY: 0, height: 1000 },
      { sourceY: 1000, height: 1000 },
      { sourceY: 2000, height: 500 },
    ]);
  });

  test('uses one slice when the capture fits on a page', () => {
    expect(planPageSlices(400, 1000)).toEqual([{ sourceY: 0, height: 400 }]);
    expect(planPageSlices(1000, 1000)).toEqual([{ sourceY: 0, height: 1000 }]);
  });

  test('covers the capture exactly when the page height is fractional', () => {
    const slices = planPageSlices(1000, 333.3);

    expect(slices).toHaveLength(4);
    expect(slices.reduce((total, slice) => total + slice.height, 0)).toBeCloseTo(1000);
  });

  test('plans nothing for an empty capture or an unusable page', () => {
    expect(planPageSlices(0, 1000)).toEqual([]);
    expect(planPageSlices(1000, 0)).toEqual([]);
    expect(planPageSlices(1000, Number.NaN)).toEqual([]);
  });
});
