import { readFile } from 'node:fs/promises';
import { test, expect, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';

// End-to-end flows of the document tools: the Markdown Editor & Exporter
// (/tools/markdown-editor), Markdown to DOCX (/tools/markdown-to-docx) and the
// HTML Converter (/tools/html-converter). Files the tools save are read back
// with a library other than the one that wrote them.

/**
 * Opens a tool page and waits until React has hydrated it. The page is
 * prerendered, so the fields exist before they react to input; once hydrated
 * the page records itself as a recent tool, which is what is waited for.
 */
async function openTool(page: Page, slug: string, name: string) {
  await page.goto(`/tools/${slug}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await page.waitForFunction(
    (id) => (window.localStorage.getItem('dev-toolbox:recent') ?? '').includes(id),
    slug
  );
}

/** Picks an option of one of the app's dropdowns, found by its label. */
async function choose(page: Page, label: string, option: string) {
  const trigger = page.getByRole('combobox', { name: label, exact: true });
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(trigger).toHaveText(option);
  // The list fades out; the next dropdown must not open while it is still there.
  await expect(page.getByRole('option')).toHaveCount(0);
}

/** Clicks `trigger` and returns the file the browser was handed. */
async function download(page: Page, trigger: Locator) {
  const downloadPromise = page.waitForEvent('download');
  await trigger.click();
  const file = await downloadPromise;
  const bytes = await readFile(await file.path());
  return { name: file.suggestedFilename(), bytes, text: bytes.toString('utf8') };
}

/** The clipboard text. Windows hands multi-line text back with CRLF line ends. */
async function readClipboard(page: Page) {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.replace(/\r\n/g, '\n');
}

/** The markup of the hidden frame the PDF export hands to the print dialog. */
async function printedDocument(page: Page) {
  const frame = page.locator('iframe[aria-hidden="true"]');
  await expect(frame).toHaveCount(1);
  return frame.evaluate((el: HTMLIFrameElement) => el.contentDocument?.documentElement.outerHTML ?? '');
}

/** The `<w:p>` paragraphs of a Word XML part, table cells included, with their text. */
function paragraphs(xml: string) {
  return [...xml.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)].map(([paragraph]) => ({
    xml: paragraph,
    text: [...paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join(''),
  }));
}

/** The XML parts of a downloaded .docx; a part the file does not have reads as ''. */
async function readDocx(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  const read = async (name: string) => (await zip.file(name)?.async('string')) ?? '';
  return {
    document: await read('word/document.xml'),
    header: await read('word/header1.xml'),
    footer: await read('word/footer1.xml'),
  };
}

function pngSize(bytes: Buffer) {
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test.describe('Document tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // The exported documents link public style sheets; nothing here needs the network.
  test.beforeEach(async ({ page, baseURL }) => {
    const appOrigin = new URL(baseURL ?? 'http://localhost:3000').origin;
    await page.route(
      (url) => url.protocol.startsWith('http') && url.origin !== appOrigin,
      (route) => route.abort()
    );
  });

  // ---------------------------------------------------------------------------
  // Markdown Editor & Exporter
  // ---------------------------------------------------------------------------
  test.describe('Markdown Editor & Exporter', () => {
    const SOURCE = [
      '# Hello World',
      '',
      'Some **bold** text and a [link](https://example.com).',
      '',
      '- one',
      '- two',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '```js',
      'const answer = 42;',
      '```',
      '',
      'Maths: $E=mc^2$',
    ].join('\n');

    const editor = (page: Page) => page.getByRole('textbox', { name: 'Markdown input' });
    const sheet = (page: Page) => page.locator('.markdown-print-preview');

    test('renders the preview as you type and jumps to a line on double-click', async ({ page }) => {
      await openTool(page, 'markdown-editor', 'Markdown Editor & Exporter');
      await editor(page).fill(SOURCE);

      const preview = sheet(page);
      await expect(preview.getByRole('heading', { level: 1, name: 'Hello World' })).toBeVisible();
      await expect(preview.locator('strong')).toHaveText('bold');
      await expect(preview.getByRole('link', { name: 'link' })).toHaveAttribute('href', 'https://example.com');
      await expect(preview.getByRole('listitem')).toHaveText(['one', 'two']);
      await expect(preview.getByRole('columnheader')).toHaveText(['A', 'B']);
      await expect(preview.getByRole('cell')).toHaveText(['1', '2']);
      await expect(preview.locator('pre.hljs code')).toHaveText('const answer = 42;');
      await expect(preview.locator('.katex')).toHaveCount(1);

      // The paragraph starts on the third line, after "# Hello World" and a blank line.
      await preview.getByText('Some').dblclick({ position: { x: 4, y: 4 } });
      await expect(editor(page)).toBeFocused();
      await expect
        .poll(() => editor(page).evaluate((el: HTMLTextAreaElement) => el.selectionStart))
        .toBe('# Hello World\n\n'.length);
    });

    test('exports PDF, HTML, text and PNG under the name of the first heading', async ({ page }) => {
      test.slow(); // the image capture takes a while on a busy machine
      await openTool(page, 'markdown-editor', 'Markdown Editor & Exporter');
      // A title with characters no file system accepts, and an ampersand for the title element.
      const source = '# Fish & Chips: Q1/Q2?\n\nSome **bold** text and a [link](https://example.com).\n';
      await editor(page).fill(source);

      await page.getByRole('button', { name: 'Export as PDF' }).click();
      const printed = await printedDocument(page);
      expect(printed).toContain('<title>Fish &amp; Chips: Q1/Q2?</title>');
      expect(printed).toContain('size: A4 portrait');
      expect(printed).toContain('margin: 16mm');
      expect(printed).toContain('<strong>bold</strong>');

      await choose(page, 'Export format', 'HTML file');
      const html = await download(page, page.getByRole('button', { name: 'Export as HTML' }));
      expect(html.name).toBe('Fish & Chips Q1 Q2.html');
      expect(html.text).toContain('<!DOCTYPE html>');
      expect(html.text).toContain('<title>Fish &amp; Chips: Q1/Q2?</title>');
      expect(html.text).toContain('<a href="https://example.com">link</a>');

      await choose(page, 'Export format', 'Plain text (Markdown)');
      const text = await download(page, page.getByRole('button', { name: 'Export as TXT' }));
      expect(text.name).toBe('Fish & Chips Q1 Q2.txt');
      expect(text.text).toBe(source);

      await choose(page, 'Export format', 'PNG image');
      await expect(page.getByText('Render scale: 2x')).toBeVisible();
      const png = await download(page, page.getByRole('button', { name: 'Export as PNG' }));
      expect(png.name).toBe('Fish & Chips Q1 Q2.png');
      // The picture is the sheet as it is on screen, captured at twice its size.
      const { width, height } = pngSize(png.bytes);
      expect(width).toBe(Math.round((await sheet(page).boundingBox())!.width) * 2);
      expect(height).toBeGreaterThan(0);
    });

    test('sizes the sheet to the page setup and has nothing to export when empty', async ({ page }) => {
      await openTool(page, 'markdown-editor', 'Markdown Editor & Exporter');
      await expect(page.getByText('Margins: 16 mm')).toBeVisible();
      await expect(sheet(page)).toHaveCSS('max-width', '794px');
      await choose(page, 'Page size', 'Letter');
      await expect(sheet(page)).toHaveCSS('max-width', '816px');
      await choose(page, 'Orientation', 'Landscape');
      await expect(sheet(page)).toHaveCSS('max-width', '1056px');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(editor(page)).toHaveValue('');
      await expect(page.getByText('Nothing to preview yet.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Export as PDF' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Snapshot PDF' })).toBeDisabled();

      // A lone link definition is text, but renders to nothing.
      await editor(page).fill('[ref]: https://example.com');
      await expect(page.getByText('Nothing to preview yet.')).toBeVisible();
      await editor(page).fill('   \n  ');
      await expect(page.getByRole('button', { name: 'Export as PDF' })).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // Markdown to DOCX
  // ---------------------------------------------------------------------------
  test.describe('Markdown to DOCX', () => {
    const editor = (page: Page) => page.getByRole('textbox', { name: 'Markdown input' });
    const downloadButton = (page: Page) => page.getByRole('button', { name: 'Download Word (.docx)' });

    test('lists the blocks of the sample and downloads it as a Word document', async ({ page }) => {
      await openTool(page, 'markdown-to-docx', 'Markdown to DOCX Converter');

      const badges = { H1: 1, H2: 1, H3: 2, PARAGRAPH: 2, LIST: 1, CODE: 1, TABLE: 1, 'PAGE BREAK': 0 };
      for (const [badge, count] of Object.entries(badges)) {
        await expect(page.getByText(badge, { exact: true }), badge).toHaveCount(count);
      }
      await page.getByRole('tab', { name: 'HTML Preview' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Project Implementation Plan' })).toBeVisible();

      const file = await download(page, downloadButton(page));
      expect(file.name).toBe('Project Implementation Plan.docx');
      const { document, header, footer } = await readDocx(file.bytes);
      const texts = paragraphs(document).map((paragraph) => paragraph.text);
      expect(texts[0]).toBe('Project Implementation Plan');
      expect(texts).toContain('•  Keep With Next: Headings will never be split from their following text.');
      expect(texts).toContain('function convertMarkdown(mdText) {');
      expect(texts).toContain('Perfect Indents');
      expect(document).toContain('<w:pStyle w:val="Heading1"/>');
      // The footer text and the page numbers are on by default; there is no header.
      expect(footer).toContain('Confidential');
      expect(footer).toContain('Page ');
      expect(header).toBe('');
    });

    test('carries page setup, header and footer, theme, page breaks and spacing into the file', async ({
      page,
    }) => {
      await openTool(page, 'markdown-to-docx', 'Markdown to DOCX Converter');
      await editor(page).fill('# Title\n\nFirst paragraph\n\nSecond paragraph');
      await expect(page.getByText('PARAGRAPH', { exact: true })).toHaveCount(2);

      await choose(page, 'Page Size', 'Letter (8.5 x 11 in)');
      await choose(page, 'Orientation', 'Landscape');
      await page.getByLabel('Header Text (Right aligned)').fill('Quarterly Report');
      await page.getByLabel('Footer Text (Left aligned)').fill('Internal');
      await page.getByRole('checkbox', { name: 'Include Page Numbers' }).uncheck();

      await page.getByRole('tab', { name: 'Typography' }).click();
      // Every preset's own line spacing has to be one the list offers.
      await choose(page, 'Theme Preset', 'Elegant Serif (Georgia)');
      await expect(page.getByRole('combobox', { name: 'Line Spacing' })).toHaveText('1.35 (Relaxed)');
      await choose(page, 'Theme Preset', 'Corporate Professional');
      await expect(page.getByRole('combobox', { name: 'Font Family' })).toHaveText('Calibri (Standard Office)');

      // Blocks are Title, First paragraph, Second paragraph, in that order.
      await page.getByRole('switch', { name: 'Force page break before block' }).nth(2).click();
      await expect(page.getByText('PAGE BREAK', { exact: true })).toHaveCount(1);
      // A paragraph is followed by 6 pt in this theme; one step adds 2 pt.
      await page.getByRole('button', { name: 'Increase space after block' }).nth(2).click();
      await expect(page.getByText('8pt', { exact: true })).toHaveCount(1);

      const file = await download(page, downloadButton(page));
      expect(file.name).toBe('Title.docx');
      const { document, header, footer } = await readDocx(file.bytes);
      expect(document).toContain('w:orient="landscape"');
      expect(document).toContain('w:w="15840"');
      expect(document).toContain('w:ascii="Calibri"');
      const [title, first, second] = paragraphs(document);
      expect([title.text, first.text, second.text]).toEqual(['Title', 'First paragraph', 'Second paragraph']);
      expect(title.xml).not.toContain('<w:pageBreakBefore/>');
      expect(first.xml).not.toContain('<w:pageBreakBefore/>');
      expect(second.xml).toContain('<w:pageBreakBefore/>');
      expect(first.xml).toContain('w:after="120"');
      expect(second.xml).toContain('w:after="160"');
      expect(header).toContain('Quarterly Report');
      expect(footer).toContain('Internal');
      expect(footer).not.toContain('PAGE');
    });

    test('names the file after the heading and has nothing to download when empty', async ({ page }) => {
      await openTool(page, 'markdown-to-docx', 'Markdown to DOCX Converter');

      // Markup in the heading is not part of the name, and neither are characters a file cannot have.
      await editor(page).fill('# **Bold** and `code` / Q1: plan\n\nBody text');
      const file = await download(page, downloadButton(page));
      expect(file.name).toBe('Bold and code Q1 plan.docx');
      expect(paragraphs((await readDocx(file.bytes)).document)[0].text).toBe('Bold and code / Q1: plan');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(editor(page)).toHaveValue('');
      await expect(page.getByText('No content blocks. Write some Markdown to begin!')).toBeVisible();
      await expect(downloadButton(page)).toBeDisabled();
      await editor(page).fill('  \n\n   ');
      await expect(downloadButton(page)).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // HTML Converter
  // ---------------------------------------------------------------------------
  test.describe('HTML Converter', () => {
    const input = (page: Page) => page.getByRole('textbox', { name: 'HTML input' });
    const markdownOutput = (page: Page) => page.getByRole('textbox', { name: 'Markdown output' });
    const exportButton = (page: Page) => page.getByRole('button', { name: 'Export', exact: true });

    const SAMPLE_MARKDOWN = [
      '# Release Notes',
      '',
      'This example document can be exported as **PDF**, Markdown, HTML, or plain text.',
      '',
      '## Highlights',
      '',
      '- Client-side conversion',
      '- Custom PDF page setup',
      '- Optional print CSS support',
      '',
      '> Use the print CSS box to hide controls, force page breaks, or tune spacing for exported files.',
      '',
      '## Table',
      '',
      '| Area | Status |',
      '| --- | --- |',
      '| Preview | Ready |',
      '| Export | Ready |',
    ].join('\n');

    const SAMPLE_TEXT = [
      'Release Notes',
      '',
      'This example document can be exported as PDF, Markdown, HTML, or plain text.',
      '',
      'Highlights',
      '',
      '- Client-side conversion',
      '- Custom PDF page setup',
      '- Optional print CSS support',
      '',
      'Use the print CSS box to hide controls, force page breaks, or tune spacing for exported files.',
      '',
      'Table',
      '',
      'Area\tStatus',
      'Preview\tReady',
      'Export\tReady',
    ].join('\n');

    test('converts the sample to Markdown and plain text and copies the result', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openTool(page, 'html-converter', 'HTML Converter');

      await expect(markdownOutput(page)).toHaveValue(SAMPLE_MARKDOWN);
      await page.getByRole('button', { name: 'Copy Markdown' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await readClipboard(page)).toBe(SAMPLE_MARKDOWN);

      await choose(page, 'Format', 'Plain text');
      await expect(page.getByRole('textbox', { name: 'Plain text output' })).toHaveValue(SAMPLE_TEXT);
      await page.getByRole('button', { name: 'Copy text' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await readClipboard(page)).toBe(SAMPLE_TEXT);
    });

    test('imports an HTML file and exports it under the chosen file name', async ({ page }) => {
      await openTool(page, 'html-converter', 'HTML Converter');
      const html =
        '<h2>Quarterly</h2><p>Revenue is <em>up</em> by <b>12%</b>, see <a href="https://example.com/q">report</a>.</p>' +
        '<ul><li>North</li><li>South<ul><li>City</li></ul></li></ul>';
      const markdown = [
        '## Quarterly',
        '',
        'Revenue is *up* by **12%**, see [report](https://example.com/q).',
        '',
        '- North',
        '- South',
        '  - City',
      ].join('\n');

      await page.getByLabel('Import HTML file').setInputFiles({
        name: 'quarterly.html',
        mimeType: 'text/html',
        buffer: Buffer.from(html),
      });
      await expect(input(page)).toHaveValue(html);
      await expect(markdownOutput(page)).toHaveValue(markdown);

      await page.getByLabel('Filename', { exact: true }).fill('quarterly report');
      // PDF is the default format: the document goes to the print dialog under that name.
      await exportButton(page).click();
      const printed = await printedDocument(page);
      expect(printed).toContain('<title>quarterly report</title>');
      expect(printed).toContain('<h2>Quarterly</h2>');
      expect(printed).toContain('size: A4 portrait');

      await choose(page, 'Format', 'Markdown');
      const md = await download(page, exportButton(page));
      expect(md.name).toBe('quarterly report.md');
      expect(md.text).toBe(markdown);

      await choose(page, 'Format', 'HTML file');
      const file = await download(page, exportButton(page));
      expect(file.name).toBe('quarterly report.html');
      expect(file.text).toBe(html);

      await choose(page, 'Format', 'Plain text');
      const text = await download(page, exportButton(page));
      expect(text.name).toBe('quarterly report.txt');
      expect(text.text).toBe('Quarterly\n\nRevenue is up by 12%, see report.\n\n- North\n- South\n  - City');
    });

    test('ignores scripts, saves a snapshot PDF and has nothing to export when cleared', async ({ page }) => {
      test.slow(); // the snapshot is taken with a canvas capture
      await openTool(page, 'html-converter', 'HTML Converter');
      await input(page).fill(
        '<!DOCTYPE html><html><head><title>Hidden title</title><style>p { color: red }</style>' +
          '<script>document.body.append("SCRIPT RAN")</script></head>' +
          '<body><p>Safe text</p><script>document.body.append("SCRIPT RAN")</script></body></html>'
      );
      await expect(markdownOutput(page)).toHaveValue('Safe text');
      // The preview frame is sandboxed, so what the scripts would write never appears.
      const frame = page.frameLocator('iframe[title="HTML preview"]');
      await expect(frame.getByText('Safe text')).toBeVisible();
      await expect(frame.locator('body')).not.toContainText('SCRIPT RAN');

      const pdf = await download(page, page.getByRole('button', { name: 'Snapshot PDF' }));
      expect(pdf.name).toBe('html-export.pdf');
      const doc = await PDFDocument.load(pdf.bytes);
      expect(doc.getPageCount()).toBe(1);
      const { width, height } = doc.getPage(0).getSize();
      expect(width).toBeCloseTo(595.28, 0); // A4
      expect(height).toBeCloseTo(841.89, 0);

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input(page)).toHaveValue('');
      await expect(markdownOutput(page)).toHaveValue('');
      await expect(exportButton(page)).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Snapshot PDF' })).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // Both Markdown tools
  // ---------------------------------------------------------------------------
  for (const [slug, name] of [
    ['markdown-editor', 'Markdown Editor & Exporter'],
    ['markdown-to-docx', 'Markdown to DOCX Converter'],
  ]) {
    test(`${name} does not run scripts that come with the Markdown`, async ({ page }) => {
      test.fixme(
        true,
        'Raw HTML passes through the shared parser (html: true) into the preview unsanitised, so <img onerror> in pasted Markdown runs in the app origin. src/lib/markdown is read-only here and the fix (a sanitiser or a sandboxed preview) is a product decision.'
      );
      await openTool(page, slug, name);
      await page
        .getByRole('textbox', { name: 'Markdown input' })
        .fill(`<img src="x" onerror="document.title = 'hacked'">`);
      if (slug === 'markdown-to-docx') await page.getByRole('tab', { name: 'HTML Preview' }).click();
      const image = page.locator('img[src="x"]');
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete)).toBe(true);
      await page.evaluate(() => new Promise(requestAnimationFrame)); // let the error event run
      await expect(page).not.toHaveTitle('hacked');
    });
  }
});
