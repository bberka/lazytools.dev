import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

/**
 * Browser flows for the encoder and decoder tools: Base64, Hex, HTML entities,
 * Text Escape, Punycode, URL Encoder, URL Parser & Builder, JWT Decoder and
 * Morse/Binary.
 *
 * Expected values are worked out by hand or with Node's own Buffer and URL
 * code, never with the tool's modules. Error texts are the ones the tools
 * promise in their logic modules.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openTool(page: Page, slug: string, heading: string) {
  const response = await page.goto(`/tools/${slug}/`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  // The export is pre-rendered HTML: the controls are on screen before React
  // has attached a single handler, and anything typed in that window is lost.
  // This is a readiness check only; no control is looked up this way.
  await page.waitForFunction(() => {
    const control = document.querySelector('.tool-page textarea, .tool-page input');
    return control !== null && Object.keys(control).some((key) => key.startsWith('__reactProps$'));
  });
}

/** The error box of the tool. Scoped to <main> to leave the framework's route announcer out. */
const toolAlert = (page: Page) => page.getByRole('main').getByRole('alert');

/**
 * HTML Encoder, Text Escape and URL Encoder print their result into a plain
 * <pre>: static text, no role, no accessible name. There is no user-facing way
 * to address it, and `getByText` cannot tell a line break from a space, so
 * this is the one CSS selector in the file.
 */
const resultPanel = (page: Page) => page.getByRole('main').locator('pre');

/** Exact text of the result panel, whitespace included. */
async function expectResult(page: Page, expected: string) {
  await expect(resultPanel(page)).toHaveJSProperty('textContent', expected);
}

/** Picks an entry of one of the custom dropdowns by mouse. */
async function chooseOption(page: Page, label: string, option: string) {
  const dropdown = page.getByRole('combobox', { name: label });
  await dropdown.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  // The list fades out; the next dropdown must not find two sets of options.
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(dropdown).toHaveText(option);
}

async function allowClipboard(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
}

/** What is on the clipboard. Windows hands line breaks back as CRLF. */
async function clipboardText(page: Page): Promise<string> {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.replace(/\r\n/g, '\n');
}

const values = (page: Page, name: string) =>
  page
    .getByRole('textbox', { name })
    .evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement).value));

// 1x1 transparent PNG, 70 bytes.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// The example token from jwt.io.
const JWT_SIGNATURE = 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const JWT_EXAMPLE = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.${JWT_SIGNATURE}`;

const jwtSegment = (value: unknown) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const JWT_HEADER = jwtSegment({ alg: 'HS256', typ: 'JWT' });

test.describe('Encoder and decoder tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // No flow below may end in an uncaught exception on the page.
  let pageErrors: string[] = [];
  test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
  });
  test.afterEach(() => {
    expect(pageErrors, 'uncaught errors on the page').toEqual([]);
  });

  // ── Base64 ──────────────────────────────────────────────────────────────────

  test.describe('Base64 Encoder/Decoder', () => {
    test('encodes UTF-8 text, copies the result and swaps back to the original', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'base64-converter', 'Base64 Encoder/Decoder');
      const input = page.getByRole('textbox', { name: 'Text to encode' });
      const output = page.getByRole('textbox', { name: 'Output', exact: true });
      const copy = page.getByRole('button', { name: 'Copy', exact: true });
      const swap = page.getByRole('button', { name: 'Swap', exact: true });

      // Nothing typed yet.
      await expect(output).toHaveValue('');
      await expect(page.getByText('Result appears here automatically')).toBeVisible();
      await expect(copy).toBeDisabled();
      await expect(swap).toBeDisabled();

      await input.fill('héllo wörld ✓');
      await expect(output).toHaveValue('aMOpbGxvIHfDtnJsZCDinJM=');

      // Whitespace is data: a lone space is a byte like any other.
      await input.fill(' ');
      await expect(output).toHaveValue('IA==');

      await input.fill('Hello, World!');
      await expect(output).toHaveValue('SGVsbG8sIFdvcmxkIQ==');
      await expect(page.getByText('20 characters')).toBeVisible();

      await copy.click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await clipboardText(page)).toBe('SGVsbG8sIFdvcmxkIQ==');

      await swap.click();
      await expect(page.getByRole('tab', { name: 'Decode' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('textbox', { name: 'Base64 to decode' })).toHaveValue('SGVsbG8sIFdvcmxkIQ==');
      await expect(output).toHaveValue('Hello, World!');

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Base64 to decode' })).toHaveValue('');
      await expect(output).toHaveValue('');
      await expect(copy).toBeDisabled();
    });

    test('decodes standard, URL-safe and wrapped Base64 and names what is wrong with bad input', async ({ page }) => {
      await openTool(page, 'base64-converter', 'Base64 Encoder/Decoder');
      await page.getByRole('tab', { name: 'Decode' }).click();
      const input = page.getByRole('textbox', { name: 'Base64 to decode' });
      const output = page.getByRole('textbox', { name: 'Output', exact: true });

      await input.fill('c3ViamVjdHM/X2Q=');
      await expect(output).toHaveValue('subjects?_d');

      // The URL-safe alphabet without padding, as in a JWT segment.
      await input.fill('c3ViamVjdHM_X2Q');
      await expect(output).toHaveValue('subjects?_d');

      // Wrapped the way mail and PEM files wrap it.
      await input.fill('SGVs\nbG8s IFdv\ncmxkIQ==');
      await expect(output).toHaveValue('Hello, World!');
      await expect(toolAlert(page)).toHaveCount(0);

      await input.fill('SGVsbG8*');
      await expect(toolAlert(page)).toHaveText('Error: Invalid Base64 character "*" at position 8.');
      await expect(output).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeDisabled();

      await input.fill('SGVsb');
      await expect(toolAlert(page)).toHaveText(
        'Error: Invalid Base64 length: the input looks cut off or has extra characters.'
      );

      // Correcting the input clears the error.
      await input.fill('SGVsbG8=');
      await expect(toolAlert(page)).toHaveCount(0);
      await expect(output).toHaveValue('Hello');
    });

    test('encodes a picked file, lets it be downloaded again and shows a preview for images', async ({ page }) => {
      await openTool(page, 'base64-converter', 'Base64 Encoder/Decoder');
      await page.getByRole('tab', { name: 'File / Image' }).click();
      const dropzone = page.getByRole('button', { name: 'Drop file here or click to browse' });
      const output = page.getByRole('textbox', { name: 'Base64 output' });

      // Clicking the drop area opens the file picker.
      const chooserOpened = page.waitForEvent('filechooser');
      await dropzone.click();
      const chooser = await chooserOpened;
      await chooser.setFiles({ name: 'hello.txt', mimeType: 'text/plain', buffer: Buffer.from('Hello, World!') });

      await expect(page.getByText('hello.txt', { exact: true })).toBeVisible();
      await expect(page.getByText('text/plain · 13 B')).toBeVisible();
      await expect(output).toHaveValue('SGVsbG8sIFdvcmxkIQ==');
      await expect(page.getByText('20 characters')).toBeVisible();
      await expect(page.getByRole('img', { name: 'Preview' })).toHaveCount(0);

      const downloadStarted = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download original' }).click();
      const download = await downloadStarted;
      expect(download.suggestedFilename()).toBe('hello.txt');
      expect(await readFile(await download.path(), 'utf8')).toBe('Hello, World!');

      await page.getByRole('button', { name: 'Remove file' }).click();
      await expect(dropzone).toBeVisible();
      await expect(output).toHaveCount(0);

      // An image also gets a preview.
      await page.getByLabel('Select file to encode as Base64').setInputFiles({
        name: 'pixel.png',
        mimeType: 'image/png',
        buffer: Buffer.from(PNG_BASE64, 'base64'),
      });
      await expect(page.getByText('image/png · 70 B')).toBeVisible();
      await expect(output).toHaveValue(PNG_BASE64);
      const preview = page.getByRole('img', { name: 'Preview' });
      await expect(preview).toBeVisible();
      await expect(preview).toHaveJSProperty('naturalWidth', 1);
    });

    test('takes a dropped file, opens the picker from the keyboard and refuses an empty file', async ({ page }) => {
      await openTool(page, 'base64-converter', 'Base64 Encoder/Decoder');
      await page.getByRole('tab', { name: 'File / Image' }).click();
      const dropzone = page.getByRole('button', { name: 'Drop file here or click to browse' });
      const output = page.getByRole('textbox', { name: 'Base64 output' });

      const dataTransfer = await page.evaluateHandle(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array([0, 255, 16])], 'dropped.bin', { type: 'application/octet-stream' }));
        return transfer;
      });
      await dropzone.dispatchEvent('dragover', { dataTransfer });
      await dropzone.dispatchEvent('drop', { dataTransfer });
      await expect(page.getByText('dropped.bin', { exact: true })).toBeVisible();
      await expect(page.getByText('application/octet-stream · 3 B')).toBeVisible();
      // 00 FF 10
      await expect(output).toHaveValue('AP8Q');

      await page.getByRole('button', { name: 'Remove file' }).click();

      // Enter on the focused drop area opens the picker too.
      await dropzone.focus();
      const chooserOpened = page.waitForEvent('filechooser');
      await page.keyboard.press('Enter');
      const chooser = await chooserOpened;
      await chooser.setFiles({ name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) });

      await expect(page.getByText('text/plain · 0 B')).toBeVisible();
      await expect(toolAlert(page)).toHaveText('Error: This file is empty, so there is nothing to encode.');
      await expect(output).toHaveCount(0);

      // Removing the file takes the error with it.
      await page.getByRole('button', { name: 'Remove file' }).click();
      await expect(toolAlert(page)).toHaveCount(0);
      await expect(dropzone).toBeVisible();
    });

    test('does not claim "Copied!" when the clipboard refuses the write', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: () => Promise.reject(new Error('denied by test')) },
        });
      });
      await openTool(page, 'base64-converter', 'Base64 Encoder/Decoder');
      await page.getByRole('tab', { name: 'File / Image' }).click();
      await page.getByLabel('Select file to encode as Base64').setInputFiles({
        name: 'hello.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Hello, World!'),
      });
      await expect(page.getByRole('textbox', { name: 'Base64 output' })).toHaveValue('SGVsbG8sIFdvcmxkIQ==');

      const failureLogged = page.waitForEvent('console', (message) =>
        message.text().includes('Failed to copy to clipboard')
      );
      await page.getByRole('button', { name: 'Copy', exact: true }).click();
      await failureLogged;
      await expect(page.getByRole('button', { name: 'Copied!' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
    });
  });

  // ── Hex ─────────────────────────────────────────────────────────────────────

  test.describe('Hex ↔ String Converter', () => {
    test('encodes text as UTF-8 byte pairs with the chosen delimiter, prefix and case', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'hex-converter', 'Hex ↔ String Converter');
      const input = page.getByRole('textbox', { name: 'Plain text input' });
      const output = page.getByRole('textbox', { name: 'Hexadecimal output' });

      await expect(page.getByRole('button', { name: 'Copy Output' })).toBeDisabled();

      await input.fill('Hello');
      await expect(output).toHaveValue('48 65 6c 6c 6f');

      await input.fill('é€');
      await expect(output).toHaveValue('c3 a9 e2 82 ac');

      await input.fill(' ');
      await expect(output).toHaveValue('20');

      await input.fill('Jo~');
      await expect(output).toHaveValue('4a 6f 7e');

      await page.getByRole('checkbox', { name: 'Uppercase Hex output' }).click();
      await expect(output).toHaveValue('4A 6F 7E');

      await chooseOption(page, 'Hex Delimiter', 'Comma (,)');
      await expect(output).toHaveValue('4A,6F,7E');

      await chooseOption(page, 'Hex Prefix', '0x');
      await expect(output).toHaveValue('0x4A,0x6F,0x7E');

      await chooseOption(page, 'Hex Delimiter', 'Newline (\\n)');
      await expect(output).toHaveValue('0x4A\n0x6F\n0x7E');

      await chooseOption(page, 'Hex Delimiter', 'Custom');
      await page.getByRole('textbox', { name: 'Custom Delimiter' }).fill(':');
      await expect(output).toHaveValue('0x4A:0x6F:0x7E');

      await chooseOption(page, 'Hex Prefix', 'Custom');
      await page.getByRole('textbox', { name: 'Custom Prefix' }).fill('%');
      await expect(output).toHaveValue('%4A:%6F:%7E');

      await chooseOption(page, 'Hex Delimiter', 'None');
      await chooseOption(page, 'Hex Prefix', '\\x');
      await expect(output).toHaveValue('\\x4A\\x6F\\x7E');

      await page.getByRole('button', { name: 'Copy Output' }).click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await clipboardText(page)).toBe('\\x4A\\x6F\\x7E');
    });

    test('decodes hex in the usual notations and swaps direction with the result', async ({ page }) => {
      await openTool(page, 'hex-converter', 'Hex ↔ String Converter');
      await page.getByRole('tab', { name: 'Hex to String (Decode)' }).click();
      const input = page.getByRole('textbox', { name: 'Hexadecimal input' });
      const output = page.getByRole('textbox', { name: 'Plain text output' });

      // The case option only applies to encoding.
      await expect(page.getByRole('checkbox', { name: 'Uppercase Hex output' })).toHaveCount(0);

      await input.fill('48 65 6c 6c 6f');
      await expect(output).toHaveValue('Hello');

      await input.fill('48656C6C6F');
      await expect(output).toHaveValue('Hello');

      // Pasted bytes rarely match the Prefix option, which is still "None" here.
      await input.fill('0x48 0x65 0x6c 0x6c 0x6f');
      await expect(output).toHaveValue('Hello');

      await input.fill('\\x48\\x69');
      await expect(output).toHaveValue('Hi');

      await input.fill('48:69-21');
      await expect(output).toHaveValue('Hi!');

      await input.fill('c3a9 e282ac');
      await expect(output).toHaveValue('é€');

      await input.fill('48 69');
      await expect(output).toHaveValue('Hi');
      await page.getByRole('button', { name: 'Swap Directions' }).click();
      await expect(page.getByRole('tab', { name: 'String to Hex (Encode)' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('textbox', { name: 'Plain text input' })).toHaveValue('Hi');
      await expect(page.getByRole('textbox', { name: 'Hexadecimal output' })).toHaveValue('48 69');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByRole('textbox', { name: 'Plain text input' })).toHaveValue('');
      await expect(page.getByRole('textbox', { name: 'Hexadecimal output' })).toHaveValue('');
    });

    test('reports hex that cannot be decoded and keeps the input when the mode is switched', async ({ page }) => {
      await openTool(page, 'hex-converter', 'Hex ↔ String Converter');
      await page.getByRole('tab', { name: 'Hex to String (Decode)' }).click();
      const input = page.getByRole('textbox', { name: 'Hexadecimal input' });
      const output = page.getByRole('textbox', { name: 'Plain text output' });

      // A typo must not be dropped silently.
      await input.fill('48 6g');
      await expect(toolAlert(page)).toHaveText('Invalid Hexadecimal Syntax: "g" is not a hexadecimal digit.');
      await expect(output).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy Output' })).toBeDisabled();

      await input.fill('486');
      await expect(toolAlert(page)).toHaveText(
        'Invalid Hexadecimal Syntax: Hexadecimal string must have an even number of characters.'
      );

      await input.fill('--');
      await expect(toolAlert(page)).toHaveText('Invalid Hexadecimal Syntax: No valid hexadecimal characters found.');

      // Only whitespace is no input, not an error.
      await input.fill('   ');
      await expect(toolAlert(page)).toHaveCount(0);
      await expect(output).toHaveValue('');

      // With no result to carry over, switching mode leaves what was typed.
      await input.fill('4g');
      await expect(toolAlert(page)).toBeVisible();
      await page.getByRole('tab', { name: 'String to Hex (Encode)' }).click();
      await expect(page.getByRole('textbox', { name: 'Plain text input' })).toHaveValue('4g');
      await expect(page.getByRole('textbox', { name: 'Hexadecimal output' })).toHaveValue('34 67');
      await expect(toolAlert(page)).toHaveCount(0);
    });
  });

  // ── HTML entities ───────────────────────────────────────────────────────────

  test.describe('HTML Encoder/Decoder', () => {
    test('escapes the five special characters, copies the result and swaps to decode', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'html-encoder', 'HTML Encoder/Decoder');
      const input = page.getByRole('textbox', { name: 'HTML to encode' });
      const copy = page.getByRole('button', { name: 'Copy', exact: true });
      const swap = page.getByRole('button', { name: 'Swap', exact: true });

      await expectResult(page, 'Output will appear here...');
      await expect(page.getByText('Result will appear here automatically')).toBeVisible();
      await expect(copy).toBeDisabled();
      await expect(swap).toBeDisabled();

      const markup = '<div class="a">Tom & Jerry\'s</div>';
      const encoded = '&lt;div class=&quot;a&quot;&gt;Tom &amp; Jerry&#39;s&lt;/div&gt;';
      await input.fill(markup);
      await expectResult(page, encoded);
      await expect(page.getByText('64 characters')).toBeVisible();

      // Letters outside ASCII are not entities; line breaks survive.
      await input.fill('café\n<b>');
      await expectResult(page, 'café\n&lt;b&gt;');

      await input.fill(markup);
      await copy.click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await clipboardText(page)).toBe(encoded);

      await swap.click();
      await expect(page.getByRole('tab', { name: 'Decode' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('textbox', { name: 'HTML entities to decode' })).toHaveValue(encoded);
      await expectResult(page, markup);

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'HTML entities to decode' })).toHaveValue('');
      await expectResult(page, 'Output will appear here...');
    });

    test('decodes named, numeric and legacy references and shows decoded markup as text', async ({ page }) => {
      await openTool(page, 'html-encoder', 'HTML Encoder/Decoder');
      await page.getByRole('tab', { name: 'Decode' }).click();
      const input = page.getByRole('textbox', { name: 'HTML entities to decode' });

      await input.fill('&lt;p&gt;caf&eacute; &copy; 2024 &#8364;5 &#x1F600;&lt;/p&gt;');
      await expectResult(page, '<p>café © 2024 €5 😀</p>');
      await expect(page.getByText('24 characters')).toBeVisible();

      // An HTML5-only name, a legacy name without its semicolon, an unknown
      // name and a bare ampersand.
      await input.fill('&check; &copy2024 &foo; AT&T');
      await expectResult(page, '✓ ©2024 &foo; AT&T');

      // Encoded twice comes back encoded once.
      await input.fill('&amp;lt;');
      await expectResult(page, '&lt;');

      // The decoded markup is printed, never built: no image appears.
      await input.fill('&lt;img src=x onerror=alert(1) alt=injected&gt;');
      await expectResult(page, '<img src=x onerror=alert(1) alt=injected>');
      await expect(page.getByRole('img', { name: 'injected' })).toHaveCount(0);

      await input.fill('no entities here');
      await expectResult(page, 'no entities here');
    });
  });

  // ── Text Escape ─────────────────────────────────────────────────────────────

  test.describe('Text Escape/Unescape', () => {
    // Tom's "big" <tag> & a,b
    // C:\tmp.*
    const sample = 'Tom\'s "big" <tag> & a,b\nC:\\tmp.*';
    const escaped: Record<string, string> = {
      'JavaScript/TypeScript': String.raw`Tom\'s \"big\" <tag> & a,b\nC:\\tmp.*`,
      JSON: String.raw`Tom's \"big\" <tag> & a,b\nC:\\tmp.*`,
      HTML: 'Tom&#39;s &quot;big&quot; &lt;tag&gt; &amp; a,b\nC:\\tmp.*',
      XML: 'Tom&apos;s &quot;big&quot; &lt;tag&gt; &amp; a,b\nC:\\tmp.*',
      CSV: '"Tom\'s ""big"" <tag> & a,b\nC:\\tmp.*"',
      SQL: 'Tom\'\'s "big" <tag> & a,b\nC:\\tmp.*',
      Regex: 'Tom\'s "big" <tag> & a,b\nC:\\\\tmp\\.\\*',
    };

    test('escapes text for every target and unescapes it back to the original', async ({ page }) => {
      await openTool(page, 'text-escape', 'Text Escape/Unescape');
      const escape = page.getByRole('button', { name: 'Escape', exact: true });
      const unescape = page.getByRole('button', { name: 'Unescape', exact: true });

      await expect(escape).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('combobox', { name: 'Escape Mode' })).toHaveText('JavaScript/TypeScript');

      // Plain words need no escaping in a JavaScript string.
      await page.getByRole('textbox', { name: 'Text to escape' }).fill('hello world');
      await expectResult(page, 'hello world');

      for (const [mode, expected] of Object.entries(escaped)) {
        await test.step(mode, async () => {
          await chooseOption(page, 'Escape Mode', mode);

          await escape.click();
          await page.getByRole('textbox', { name: 'Text to escape' }).fill(sample);
          await expectResult(page, expected);
          await expect(page.getByText(`${expected.length} characters`)).toBeVisible();

          await unescape.click();
          await expect(unescape).toHaveAttribute('aria-pressed', 'true');
          await page.getByRole('textbox', { name: 'Escaped text to unescape' }).fill(expected);
          await expectResult(page, sample);
          await expect(toolAlert(page)).toHaveCount(0);
        });
      }
    });

    test('unescapes JavaScript sequences in one pass and Swap reverses the direction', async ({ page }) => {
      await openTool(page, 'text-escape', 'Text Escape/Unescape');
      const input = page.getByRole('textbox', { name: 'Text to escape' });

      await input.fill('a "q"\nb\tc');
      await expectResult(page, String.raw`a \"q\"\nb\tc`);

      await page.getByRole('button', { name: 'Swap', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Unescape', exact: true })).toHaveAttribute('aria-pressed', 'true');
      const escapedInput = page.getByRole('textbox', { name: 'Escaped text to unescape' });
      await expect(escapedInput).toHaveValue(String.raw`a \"q\"\nb\tc`);
      await expectResult(page, 'a "q"\nb\tc');

      // An escaped backslash is not the start of the next escape, and the
      // \u, \x and \u{...} forms are understood.
      await escapedInput.fill(String.raw`C:\\new\tx\u0041\x42\u{1F600}`);
      await expectResult(page, 'C:\\new\txAB😀');

      // An unknown escape is left as it was typed.
      await escapedInput.fill(String.raw`50\% off`);
      await expectResult(page, String.raw`50\% off`);

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(escapedInput).toHaveValue('');
      await expectResult(page, 'Output will appear here...');
      await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeDisabled();
    });

    test('picks the mode from the keyboard and reports an invalid JSON escape', async ({ page }) => {
      await openTool(page, 'text-escape', 'Text Escape/Unescape');
      const mode = page.getByRole('combobox', { name: 'Escape Mode' });

      await mode.focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: 'JavaScript/TypeScript' })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: 'JSON', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(mode).toHaveText('JSON');
      await expect(page.getByRole('option')).toHaveCount(0);

      await page.getByRole('button', { name: 'Unescape', exact: true }).click();
      const input = page.getByRole('textbox', { name: 'Escaped text to unescape' });

      await input.fill(String.raw`bad \q escape`);
      await expect(toolAlert(page)).toHaveText(String.raw`Error: Invalid JSON escape sequence "\q" at position 5.`);
      await expectResult(page, 'Output will appear here...');
      await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Swap', exact: true })).toBeDisabled();

      // A real line break and an unescaped quote are fine: this is text, not a JSON document.
      await input.fill(String.raw`line 1\nline "2"` + '\nline 3 \\u00e9');
      await expect(toolAlert(page)).toHaveCount(0);
      await expectResult(page, 'line 1\nline "2"\nline 3 é');
    });
  });

  // ── Punycode ────────────────────────────────────────────────────────────────

  test.describe('Punycode Converter', () => {
    test('encodes Unicode domains line by line, and only the host of an address', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'punycode-converter', 'Punycode Converter');
      const input = page.getByRole('textbox', { name: 'Unicode domains or URLs' });
      const output = page.getByRole('textbox', { name: 'Punycode output' });

      await expect(page.getByRole('button', { name: 'Copy Output' })).toBeDisabled();

      // Reference values: RFC 3492 section 7.1 (B) and Node's url.domainToASCII.
      await input.fill('münchen.de\nbücher.de\n日本語.jp\n他们为什么不说中文.example');
      await expect(output).toHaveValue(
        'xn--mnchen-3ya.de\nxn--bcher-kva.de\nxn--wgv71a119e.jp\nxn--ihqwcrb4cv8a8dqg056pqjye.example'
      );

      await input.fill('https://домены.рф/index.html');
      await expect(output).toHaveValue('https://xn--d1acufc5f.xn--p1ai/index.html');

      // No scheme: port and path stay as they are, the path is not a label.
      await input.fill('münchen.de:8080/straße');
      await expect(output).toHaveValue('xn--mnchen-3ya.de:8080/straße');

      await input.fill('user@bücher.de');
      await expect(output).toHaveValue('user@xn--bcher-kva.de');

      // "u" plus a combining diaeresis is the same label as "ü".
      await input.fill('mu\u0308nchen.de');
      await expect(output).toHaveValue('xn--mnchen-3ya.de');

      await page.getByRole('button', { name: 'Copy Output' }).click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await clipboardText(page)).toBe('xn--mnchen-3ya.de');
    });

    test('decodes Punycode, full URLs included, and Swap Directions converts the result back', async ({ page }) => {
      await openTool(page, 'punycode-converter', 'Punycode Converter');
      await page.getByRole('tab', { name: 'Punycode to Unicode (Decode)' }).click();
      const input = page.getByRole('textbox', { name: 'Punycode domains or URLs' });
      const output = page.getByRole('textbox', { name: 'Unicode output' });

      await input.fill('xn--mnchen-3ya.de\nxn--wgv71a119e.jp\nxn--p1ai');
      await expect(output).toHaveValue('münchen.de\n日本語.jp\nрф');

      await input.fill('https://xn--d1acufc5f.xn--p1ai/index.html');
      await expect(output).toHaveValue('https://домены.рф/index.html');

      // Only the host is decoded; an xn-- lookalike in the query is left alone.
      await input.fill('user@xn--mnchen-3ya.de:8080/p?x=xn--p1ai');
      await expect(output).toHaveValue('user@münchen.de:8080/p?x=xn--p1ai');

      await input.fill('xn--bcher-kva.de');
      await expect(output).toHaveValue('bücher.de');
      await page.getByRole('button', { name: 'Swap Directions' }).click();
      await expect(page.getByRole('tab', { name: 'Unicode to Punycode (Encode)' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(page.getByRole('textbox', { name: 'Unicode domains or URLs' })).toHaveValue('bücher.de');
      await expect(page.getByRole('textbox', { name: 'Punycode output' })).toHaveValue('xn--bcher-kva.de');
    });

    test('leaves ASCII names and invalid labels as they are and empties on Clear', async ({ page }) => {
      await openTool(page, 'punycode-converter', 'Punycode Converter');
      const input = page.getByRole('textbox', { name: 'Unicode domains or URLs' });
      const output = page.getByRole('textbox', { name: 'Punycode output' });

      await input.fill('example.com');
      await expect(output).toHaveValue('example.com');

      await input.fill('   ');
      await expect(output).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy Output' })).toBeDisabled();

      await page.getByRole('tab', { name: 'Punycode to Unicode (Decode)' }).click();
      const encodedInput = page.getByRole('textbox', { name: 'Punycode domains or URLs' });
      const decoded = page.getByRole('textbox', { name: 'Unicode output' });

      // "!" is no Punycode digit and a bare prefix decodes to nothing: both labels stay.
      await encodedInput.fill('xn--zzzz!!.com\nxn--.com\nexample.com');
      await expect(decoded).toHaveValue('xn--zzzz!!.com\nxn--.com\nexample.com');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(encodedInput).toHaveValue('');
      await expect(decoded).toHaveValue('');
    });
  });

  // ── URL Encoder ─────────────────────────────────────────────────────────────

  test.describe('URL Encoder/Decoder', () => {
    test('percent-encodes a component as UTF-8 and swaps to decode it again', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'url-encoder', 'URL Encoder/Decoder');
      const input = page.getByRole('textbox', { name: 'URL to encode' });

      await expectResult(page, 'Output will appear here...');
      await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeDisabled();

      // Ç is C3 87, ğ is C4 9F, ı is C4 B1.
      const address = 'https://example.com/search?q=hello world&name=Çağrı';
      const encoded = 'https%3A%2F%2Fexample.com%2Fsearch%3Fq%3Dhello%20world%26name%3D%C3%87a%C4%9Fr%C4%B1';
      await input.fill(address);
      await expectResult(page, encoded);
      await expect(page.getByText(`${encoded.length} characters`)).toBeVisible();

      // The unreserved marks are left alone; a lone space is not "no input".
      await input.fill("-_.!~*'()");
      await expectResult(page, "-_.!~*'()");
      await input.fill(' ');
      await expectResult(page, '%20');

      await input.fill(address);
      await page.getByRole('button', { name: 'Copy', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await clipboardText(page)).toBe(encoded);

      await page.getByRole('button', { name: 'Swap', exact: true }).click();
      await expect(page.getByRole('tab', { name: 'Decode' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('textbox', { name: 'Encoded URL to decode' })).toHaveValue(encoded);
      await expectResult(page, address);
    });

    test('decodes percent-encoding and says where malformed input goes wrong', async ({ page }) => {
      await openTool(page, 'url-encoder', 'URL Encoder/Decoder');
      await page.getByRole('tab', { name: 'Decode' }).click();
      const input = page.getByRole('textbox', { name: 'Encoded URL to decode' });

      await input.fill('hello%20world%21%20%E2%9C%93');
      await expectResult(page, 'hello world! ✓');
      await expect(page.getByText('14 characters')).toBeVisible();

      // A plus sign is a plus sign in a component.
      await input.fill('a+b%2Bc');
      await expectResult(page, 'a+b+c');

      await input.fill('100%');
      await expect(toolAlert(page)).toHaveText(
        'Error: Invalid percent-encoding "%" at position 4. A "%" must be followed by two hex digits; write a literal percent sign as %25.'
      );
      await expectResult(page, 'Output will appear here...');
      await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Swap', exact: true })).toBeDisabled();

      await input.fill('%C3%28');
      await expect(toolAlert(page)).toHaveText('Error: "%C3%28" at position 1 is not valid UTF-8.');

      await input.fill('100%25');
      await expect(toolAlert(page)).toHaveCount(0);
      await expectResult(page, '100%');
    });
  });

  // ── URL Parser & Builder ────────────────────────────────────────────────────

  test.describe('URL Parser & Builder', () => {
    test('splits a pasted URL into its parts and decoded parameters and rebuilds it', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'url-parser-builder', 'URL Parser & Builder');
      const main = page.getByRole('main');

      // Nothing entered: no rebuilt URL, no parameters.
      await expect(page.getByText('Rebuilt Output URL')).toHaveCount(0);
      await expect(page.getByText('Query Parameters (0)')).toBeVisible();
      await expect(page.getByText('No query parameters found. Click Add Param to create one.')).toBeVisible();

      await page
        .getByRole('textbox', { name: 'Source URL' })
        .fill('https://user:pw@example.com:8080/api/search?q=hello%20world&limit=10&q=2#results');

      await expect(page.getByRole('textbox', { name: 'Protocol' })).toHaveValue('https:');
      await expect(page.getByRole('textbox', { name: 'Host / Domain' })).toHaveValue('user:pw@example.com:8080');
      await expect(page.getByRole('textbox', { name: 'Path' })).toHaveValue('/api/search');
      await expect(page.getByRole('textbox', { name: 'Hash / Anchor' })).toHaveValue('#results');

      await expect(page.getByText('Query Parameters (3)')).toBeVisible();
      await expect.poll(() => values(page, 'Parameter key')).toEqual(['q', 'limit', 'q']);
      await expect.poll(() => values(page, 'Parameter value')).toEqual(['hello world', '10', '2']);

      const rebuilt = 'https://user:pw@example.com:8080/api/search?q=hello+world&limit=10&q=2#results';
      await expect(page.getByText('Rebuilt Output URL')).toBeVisible();
      await expect(main.getByText(rebuilt, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open Link' })).toBeEnabled();

      await page.getByRole('button', { name: 'Copy URL' }).click();
      await expect(page.getByRole('button', { name: 'Copied URL!' })).toBeVisible();
      expect(await clipboardText(page)).toBe(rebuilt);

      // An address without a scheme is read as https.
      await page.getByRole('textbox', { name: 'Source URL' }).fill('example.com/a?b=1');
      await expect(page.getByRole('textbox', { name: 'Host / Domain' })).toHaveValue('example.com');
      await expect(page.getByRole('textbox', { name: 'Path' })).toHaveValue('/a');
      await expect(main.getByText('https://example.com/a?b=1', { exact: true })).toBeVisible();

      // A scheme with digits in it is still a scheme.
      await page.getByRole('textbox', { name: 'Source URL' }).fill('s3://bucket/key');
      await expect(page.getByRole('textbox', { name: 'Protocol' })).toHaveValue('s3:');
      await expect(page.getByRole('textbox', { name: 'Host / Domain' })).toHaveValue('bucket');
      await expect(page.getByRole('textbox', { name: 'Path' })).toHaveValue('/key');
      await expect(main.getByText('s3://bucket/key', { exact: true })).toBeVisible();
    });

    test('rewrites the URL as parts and parameters are edited, added, disabled and deleted', async ({ page, context }) => {
      await openTool(page, 'url-parser-builder', 'URL Parser & Builder');
      const main = page.getByRole('main');
      const source = page.getByRole('textbox', { name: 'Source URL' });
      const keys = page.getByRole('textbox', { name: 'Parameter key' });
      const paramValues = page.getByRole('textbox', { name: 'Parameter value' });
      const enabled = page.getByRole('checkbox', { name: 'Enable parameter' });

      await source.fill('https://example.com/search?q=cats&page=2');

      await paramValues.nth(0).fill('dogs & cats');
      await expect(source).toHaveValue('https://example.com/search?q=dogs+%26+cats&page=2');

      // A disabled parameter stays in the list but leaves the URL.
      await enabled.nth(1).click();
      await expect(enabled.nth(1)).toHaveAttribute('aria-checked', 'false');
      await expect(source).toHaveValue('https://example.com/search?q=dogs+%26+cats');
      await expect(keys.nth(1)).toBeDisabled();
      await expect(paramValues.nth(1)).toBeDisabled();
      await expect(page.getByText('Query Parameters (2)')).toBeVisible();

      await enabled.nth(1).click();
      await expect(source).toHaveValue('https://example.com/search?q=dogs+%26+cats&page=2');

      // A new row counts once it has a key. Typed key by key: the row must keep focus.
      await page.getByRole('button', { name: 'Add Param' }).click();
      await expect(page.getByText('Query Parameters (3)')).toBeVisible();
      await expect(source).toHaveValue('https://example.com/search?q=dogs+%26+cats&page=2');
      await keys.nth(2).pressSequentially('lang');
      await expect(keys.nth(2)).toHaveValue('lang');
      await paramValues.nth(2).pressSequentially('tr');
      await expect(source).toHaveValue('https://example.com/search?q=dogs+%26+cats&page=2&lang=tr');

      await page.getByRole('button', { name: 'Delete Parameter' }).first().click();
      await expect(page.getByText('Query Parameters (2)')).toBeVisible();
      await expect(source).toHaveValue('https://example.com/search?page=2&lang=tr');

      // The missing colon, slash and hash sign are supplied.
      await page.getByRole('textbox', { name: 'Protocol' }).fill('http');
      await page.getByRole('textbox', { name: 'Host / Domain' }).fill('api.test.dev:8443');
      await page.getByRole('textbox', { name: 'Path' }).fill('v1/items');
      await page.getByRole('textbox', { name: 'Hash / Anchor' }).fill('top');
      const rebuilt = 'http://api.test.dev:8443/v1/items?page=2&lang=tr#top';
      await expect(source).toHaveValue(rebuilt);
      await expect(main.getByText(rebuilt, { exact: true })).toBeVisible();

      // Open Link opens exactly that address in a new tab that cannot reach back.
      await context.route('http://api.test.dev:8443/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' })
      );
      const opened = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'Open Link' }).click();
      const popup = await opened;
      await expect(popup).toHaveURL(rebuilt);
      expect(await popup.evaluate(() => window.opener)).toBeNull();
    });

    test('encodes and decodes a parameter in place and reports bad percent-encoding', async ({ page }) => {
      await openTool(page, 'url-parser-builder', 'URL Parser & Builder');
      const source = page.getByRole('textbox', { name: 'Source URL' });
      const key = page.getByRole('textbox', { name: 'Parameter key' });
      const value = page.getByRole('textbox', { name: 'Parameter value' });
      const decode = page.getByRole('button', { name: 'URL Decode Key/Value' });

      await source.fill('https://example.com/?next=x');
      await value.fill('https://a.b/c?d=e f');
      await page.getByRole('button', { name: 'URL Encode Value' }).click();
      await expect(value).toHaveValue('https%3A%2F%2Fa.b%2Fc%3Fd%3De%20f');

      await decode.click();
      await expect(value).toHaveValue('https://a.b/c?d=e f');

      // Decode works on the key and the value.
      await key.fill('a%20b');
      await value.fill('c%26d');
      await decode.click();
      await expect(key).toHaveValue('a b');
      await expect(value).toHaveValue('c&d');
      await expect(source).toHaveValue('https://example.com/?a+b=c%26d');

      await page.getByRole('button', { name: 'URL Encode Key' }).click();
      await expect(key).toHaveValue('a%20b');

      // A value that is not percent-encoding is reported and left alone.
      await value.fill('100%');
      await decode.click();
      await expect(page.getByText(/Invalid percent-encoding "%" at position 4\./)).toBeVisible();
      await expect(value).toHaveValue('100%');
      await expect(key).toHaveValue('a%20b');
    });

    test('handles relative references and addresses the browser rejects, and Clear resets everything', async ({ page }) => {
      await openTool(page, 'url-parser-builder', 'URL Parser & Builder');
      const main = page.getByRole('main');
      const source = page.getByRole('textbox', { name: 'Source URL' });

      await source.fill('/api/search?q=1#top');
      await expect(page.getByRole('textbox', { name: 'Protocol' })).toHaveValue('');
      await expect(page.getByRole('textbox', { name: 'Host / Domain' })).toHaveValue('');
      await expect(page.getByRole('textbox', { name: 'Path' })).toHaveValue('/api/search');
      await expect(page.getByRole('textbox', { name: 'Hash / Anchor' })).toHaveValue('#top');
      await expect.poll(() => values(page, 'Parameter key')).toEqual(['q']);
      await expect.poll(() => values(page, 'Parameter value')).toEqual(['1']);
      await expect(main.getByText('/api/search?q=1#top', { exact: true })).toBeVisible();
      // Nothing to open without a host.
      await expect(page.getByRole('button', { name: 'Open Link' })).toBeDisabled();

      await source.fill('?page=2');
      await expect(page.getByRole('textbox', { name: 'Path' })).toHaveValue('');
      await expect(main.getByText('?page=2', { exact: true })).toBeVisible();

      // The browser's own URL parser rejects this one (the port is out of range), and the
      // query holds a stray "%": it is split by hand instead of throwing.
      await source.fill('https://example.com:99999/p?x=%');
      await expect(page.getByRole('textbox', { name: 'Host / Domain' })).toHaveValue('example.com:99999');
      await expect(page.getByRole('textbox', { name: 'Path' })).toHaveValue('/p');
      await expect.poll(() => values(page, 'Parameter value')).toEqual(['%']);
      await expect(main.getByText('https://example.com:99999/p?x=%25', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(source).toHaveValue('');
      await expect(page.getByRole('textbox', { name: 'Host / Domain' })).toHaveValue('');
      await expect(page.getByRole('textbox', { name: 'Path' })).toHaveValue('');
      await expect(page.getByText('Query Parameters (0)')).toBeVisible();
      await expect(page.getByText('Rebuilt Output URL')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Open Link' })).toHaveCount(0);
    });

    test('keeps a mailto: address instead of turning it into an https host', async ({ page }) => {
      await openTool(page, 'url-parser-builder', 'URL Parser & Builder');
      const main = page.getByRole('main');

      await page.getByRole('textbox', { name: 'Source URL' }).fill('mailto:someone@example.com?subject=Hello');

      await expect(page.getByRole('textbox', { name: 'Protocol' })).toHaveValue('mailto:');
      await expect.poll(() => values(page, 'Parameter key')).toEqual(['subject']);
      await expect(main.getByText('mailto:someone@example.com?subject=Hello', { exact: true })).toBeVisible();
      await expect(main.getByText(/https:\/\/mailto:/)).toHaveCount(0);
    });
  });

  // ── JWT Decoder ─────────────────────────────────────────────────────────────

  test.describe('JWT Decoder', () => {
    // The tool prints time claims with toLocaleString().
    test.use({ locale: 'en-US', timezoneId: 'UTC' });

    const headerJson = '{\n  "alg": "HS256",\n  "typ": "JWT"\n}';
    const payloadJson = '{\n  "sub": "1234567890",\n  "name": "John Doe",\n  "iat": 1516239022\n}';

    test('decodes the header, payload, signature and issue time of a token', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'jwt-decoder', 'JWT Decoder');
      const main = page.getByRole('main');
      const input = page.getByRole('textbox', { name: 'JWT token' });

      // Nothing decoded yet.
      await expect(page.getByRole('button', { name: 'Copy Header' })).toHaveCount(0);

      await input.fill(JWT_EXAMPLE);

      // getByText collapses whitespace; the exact layout is checked through the clipboard below.
      await expect(main.getByText('{ "alg": "HS256", "typ": "JWT" }', { exact: true })).toBeVisible();
      await expect(
        main.getByText('{ "sub": "1234567890", "name": "John Doe", "iat": 1516239022 }', { exact: true })
      ).toBeVisible();
      await expect(main.getByText(JWT_SIGNATURE, { exact: true })).toBeVisible();

      // 1516239022 is 2018-01-18T01:30:22Z.
      await expect(main.getByText(/^Issued At \(iat\):\s*1\/18\/2018, 1:30:22\sAM$/)).toBeVisible();
      await expect(main.getByText('Expires At (exp):')).toHaveCount(0);
      await expect(main.getByText('Not Before (nbf):')).toHaveCount(0);

      await page.getByRole('button', { name: 'Copy Header' }).click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await clipboardText(page)).toBe(headerJson);

      await page.getByRole('button', { name: 'Copy Payload' }).click();
      await expect.poll(() => clipboardText(page)).toBe(payloadJson);

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy Header' })).toHaveCount(0);
      await expect(main.getByText(JWT_SIGNATURE, { exact: true })).toHaveCount(0);
    });

    test('shows exp, nbf and iat (zero included), flags an expired token and accepts a pasted header value', async ({ page }) => {
      await openTool(page, 'jwt-decoder', 'JWT Decoder');
      const main = page.getByRole('main');
      const input = page.getByRole('textbox', { name: 'JWT token' });

      // iat 1970-01-01T00:00:00Z, nbf 2000-01-01T00:00:00Z, exp 2001-09-09T01:46:40Z.
      await input.fill(`${JWT_HEADER}.${jwtSegment({ sub: 'u1', iat: 0, nbf: 946684800, exp: 1000000000 })}.sig`);
      await expect(main.getByText(/^Issued At \(iat\):\s*1\/1\/1970, 12:00:00\sAM$/)).toBeVisible();
      await expect(main.getByText(/^Not Before \(nbf\):\s*1\/1\/2000, 12:00:00\sAM$/)).toBeVisible();
      await expect(main.getByText(/^Expires At \(exp\):\s*9\/9\/2001, 1:46:40\sAM\s*\(Expired\)$/)).toBeVisible();

      // exp 2100-01-01T00:00:00Z is still ahead.
      await input.fill(`${JWT_HEADER}.${jwtSegment({ sub: 'u1', exp: 4102444800 })}.sig`);
      await expect(main.getByText(/^Expires At \(exp\):\s*1\/1\/2100, 12:00:00\sAM$/)).toBeVisible();
      await expect(main.getByText('(Expired)')).toHaveCount(0);
      await expect(main.getByText('Issued At (iat):')).toHaveCount(0);

      // A time claim that is not a number is shown in the payload only.
      await input.fill(`${JWT_HEADER}.${jwtSegment({ name: 'Çağrı ✓', exp: 'soon' })}.sig`);
      await expect(main.getByText('{ "name": "Çağrı ✓", "exp": "soon" }', { exact: true })).toBeVisible();
      await expect(main.getByText('Timestamps:')).toHaveCount(0);

      // As copied from an Authorization header and wrapped by a terminal.
      const wrapped = `  Bearer ${JWT_EXAMPLE.slice(0, 30)}\n${JWT_EXAMPLE.slice(30, 90)}\n  ${JWT_EXAMPLE.slice(90)}\n`;
      await input.fill(wrapped);
      await expect(toolAlert(page)).toHaveCount(0);
      await expect(
        main.getByText('{ "sub": "1234567890", "name": "John Doe", "iat": 1516239022 }', { exact: true })
      ).toBeVisible();
      await expect(main.getByText(JWT_SIGNATURE, { exact: true })).toBeVisible();
    });

    test('explains what is wrong with a malformed token', async ({ page }) => {
      await openTool(page, 'jwt-decoder', 'JWT Decoder');
      const input = page.getByRole('textbox', { name: 'JWT token' });
      const payload = jwtSegment({ a: 1 });

      const cases: Array<[token: string, message: string]> = [
        ['abc.def', 'Error: Invalid JWT format. Expected 3 parts separated by dots.'],
        [
          'a.b.c.d.e',
          'Error: This looks like an encrypted token (JWE, 5 parts). Its content cannot be read without the key.',
        ],
        [`e!!.${payload}.sig`, 'Error: Invalid base64url encoding in the header.'],
        [`${JWT_HEADER}.${jwtSegment('hello')}.sig`, 'Error: The payload is not valid JSON.'],
        [`${JWT_HEADER}.${jwtSegment('null')}.sig`, 'Error: The payload must be a JSON object.'],
        [`${jwtSegment('[1]')}.${payload}.sig`, 'Error: The header must be a JSON object.'],
      ];

      for (const [token, message] of cases) {
        await input.fill(token);
        await expect(toolAlert(page)).toHaveText(message);
        await expect(page.getByRole('button', { name: 'Copy Header' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Copy Payload' })).toHaveCount(0);
      }

      // Whitespace is no token and no error.
      await input.fill('   ');
      await expect(toolAlert(page)).toHaveCount(0);

      await input.fill('abc.def');
      await expect(toolAlert(page)).toBeVisible();
      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(toolAlert(page)).toHaveCount(0);
    });
  });

  // ── Morse and binary ────────────────────────────────────────────────────────

  test.describe('Morse Code & Binary Converter', () => {
    test('writes text as Morse, names what has no code and decodes Morse back', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'morse-binary-converter', 'Morse Code & Binary Converter');
      const input = page.getByRole('textbox', { name: 'Plain text input' });
      const output = page.getByRole('textbox', { name: 'Morse code output' });

      await expect(page.getByRole('button', { name: 'Copy Output' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Play Morse Code' })).toHaveCount(0);

      await input.fill('SOS');
      await expect(output).toHaveValue('... --- ...');

      // A line break separates words like a space does.
      await input.fill('hello\nworld');
      await expect(output).toHaveValue('.... . .-.. .-.. --- / .-- --- .-. .-.. -..');

      // é and % have no Morse code: they are left out and named.
      await input.fill('café 100%');
      await expect(output).toHaveValue('-.-. .- ..-. / .---- ----- -----');
      await expect(page.getByText('Left out, no Morse code for: é %')).toBeVisible();

      await input.fill('Hello World');
      await expect(page.getByText(/Left out, no Morse code for/)).toHaveCount(0);
      await expect(output).toHaveValue('.... . .-.. .-.. --- / .-- --- .-. .-.. -..');
      await page.getByRole('button', { name: 'Copy Output' }).click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await clipboardText(page)).toBe('.... . .-.. .-.. --- / .-- --- .-. .-.. -..');

      await page.getByRole('button', { name: 'Swap Directions' }).click();
      await expect(page.getByRole('tab', { name: 'Decode Text (Code to Plain)' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      const morseInput = page.getByRole('textbox', { name: 'Morse code input' });
      const text = page.getByRole('textbox', { name: 'Plain text output' });
      await expect(morseInput).toHaveValue('.... . .-.. .-.. --- / .-- --- .-. .-.. -..');
      await expect(text).toHaveValue('HELLO WORLD');

      // Word breaks without spaces around them.
      await morseInput.fill('.../---/...');
      await expect(text).toHaveValue('S O S');

      // Eight dots is no character: it is marked, not dropped.
      await morseInput.fill('... ........ ...');
      await expect(text).toHaveValue('S\uFFFDS');

      await morseInput.fill('abc');
      await expect(toolAlert(page)).toHaveText(
        'Syntax/Formatting Error: Morse code inputs should contain only dots (.), dashes (-), spaces, or word breaks (/).'
      );
      await expect(text).toHaveValue('');

      // After an error there is no result to carry over: the input stays.
      await page.getByRole('tab', { name: 'Encode Text (Plain to Code)' }).click();
      await expect(page.getByRole('textbox', { name: 'Plain text input' })).toHaveValue('abc');
      await expect(page.getByRole('textbox', { name: 'Morse code output' })).toHaveValue('.- -... -.-.');
      await expect(toolAlert(page)).toHaveCount(0);
    });

    test('plays the Morse code to its end, stops on request and takes speed and pitch from the keyboard', async ({ page }) => {
      await openTool(page, 'morse-binary-converter', 'Morse Code & Binary Converter');
      const input = page.getByRole('textbox', { name: 'Plain text input' });
      const play = page.getByRole('button', { name: 'Play Morse Code' });
      const stop = page.getByRole('button', { name: 'Stop Audio' });

      // The two sliders have no accessible name (see the fixme test below), so they go by position.
      const pitch = page.getByRole('slider').nth(0);
      const speed = page.getByRole('slider').nth(1);
      await expect(page.getByText('Beep Frequency (Pitch): 600 Hz')).toBeVisible();
      await expect(page.getByText('Speed (Words per Minute): 20 WPM')).toBeVisible();
      await pitch.press('ArrowRight');
      await expect(page.getByText('Beep Frequency (Pitch): 610 Hz')).toBeVisible();
      await pitch.press('End');
      await expect(page.getByText('Beep Frequency (Pitch): 900 Hz')).toBeVisible();
      await speed.press('ArrowLeft');
      await expect(page.getByText('Speed (Words per Minute): 19 WPM')).toBeVisible();
      await speed.press('Home');
      await expect(page.getByText('Speed (Words per Minute): 10 WPM')).toBeVisible();

      // "SOS" is 27 units of 0.12 s at 10 WPM: long enough to see, short enough to wait for.
      await input.fill('SOS');
      await play.click();
      await expect(stop).toBeVisible();
      await expect(play).toBeVisible({ timeout: 15_000 });
      await expect(stop).toHaveCount(0);

      // Stop on request.
      await input.fill('SOS SOS SOS SOS SOS SOS');
      await play.click();
      await expect(stop).toBeVisible();
      await stop.click();
      await expect(play).toBeVisible();

      // Editing the text stops a playback that no longer matches it.
      await play.click();
      await expect(stop).toBeVisible();
      await input.fill('SOS SOS SOS SOS SOS SOS SOS');
      await expect(play).toBeVisible();
      await expect(stop).toHaveCount(0);
    });

    test('says so when the browser has no Web Audio', async ({ page }) => {
      await page.addInitScript(() => {
        const win = window as unknown as Record<string, unknown>;
        delete win.AudioContext;
        delete win.webkitAudioContext;
      });
      await openTool(page, 'morse-binary-converter', 'Morse Code & Binary Converter');

      await page.getByRole('textbox', { name: 'Plain text input' }).fill('SOS');
      await expect(page.getByRole('textbox', { name: 'Morse code output' })).toHaveValue('... --- ...');
      await page.getByRole('button', { name: 'Play Morse Code' }).click();

      await expect(page.getByText('Web Audio API is not supported in this browser.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Stop Audio' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Play Morse Code' })).toBeVisible();
    });

    test('writes text as 8-bit binary with each separator, decodes it and reports bad input', async ({ page }) => {
      await openTool(page, 'morse-binary-converter', 'Morse Code & Binary Converter');

      // Switching to binary starts from an empty input and has no audio controls.
      await page.getByRole('textbox', { name: 'Plain text input' }).fill('left over');
      await page.getByRole('tab', { name: 'Binary String' }).click();
      const input = page.getByRole('textbox', { name: 'Plain text input' });
      const output = page.getByRole('textbox', { name: 'Binary output' });
      await expect(input).toHaveValue('');
      await expect(page.getByRole('slider')).toHaveCount(0);

      // H is 0x48, i is 0x69.
      await input.fill('Hi');
      await expect(output).toHaveValue('01001000 01101001');
      await expect(page.getByRole('button', { name: 'Play Morse Code' })).toHaveCount(0);

      // é is C3 A9 in UTF-8.
      await input.fill('é');
      await expect(output).toHaveValue('11000011 10101001');

      await input.fill('Hi');
      await chooseOption(page, 'Binary Separator', 'None');
      await expect(output).toHaveValue('0100100001101001');
      await chooseOption(page, 'Binary Separator', 'Comma (,)');
      await expect(output).toHaveValue('01001000,01101001');

      // The result moves over when the mode changes.
      await page.getByRole('tab', { name: 'Decode Text (Code to Plain)' }).click();
      const bits = page.getByRole('textbox', { name: 'Binary input' });
      const text = page.getByRole('textbox', { name: 'Plain text output' });
      await expect(bits).toHaveValue('01001000,01101001');
      await expect(text).toHaveValue('Hi');

      await bits.fill('0b01001000 0b01101001 00100001');
      await expect(text).toHaveValue('Hi!');

      await bits.fill('0100100');
      await expect(toolAlert(page)).toHaveText(
        'Syntax/Formatting Error: Binary data length must be a multiple of 8 bits.'
      );
      await expect(text).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy Output' })).toBeDisabled();

      await bits.fill('01002000');
      await expect(toolAlert(page)).toHaveText(
        'Syntax/Formatting Error: "2" is not a binary digit. Binary input may only contain 0 and 1.'
      );

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(bits).toHaveValue('');
      await expect(toolAlert(page)).toHaveCount(0);
    });

    test('the pitch and speed sliders have accessible names', async ({ page }) => {
      test.fixme(
        true,
        'Morse: both sliders are exposed as a bare "slider" with no accessible name; the shared Slider (src/components/ui/slider.tsx) does not pass aria-label or aria-labelledby on to its thumb, so the tool cannot name them'
      );
      await openTool(page, 'morse-binary-converter', 'Morse Code & Binary Converter');

      await expect(page.getByRole('slider', { name: /Frequency|Pitch/ })).toHaveAttribute('aria-valuenow', '600');
      await expect(page.getByRole('slider', { name: /Speed|Words per Minute/ })).toHaveAttribute('aria-valuenow', '20');
    });
  });

  // ── Findings shared by several tools ────────────────────────────────────────

  test.describe('Layout and accessibility', () => {
    const long = 'A'.repeat(400);
    const tools: Array<{ slug: string; heading: string; input: string; value: string }> = [
      { slug: 'base64-converter', heading: 'Base64 Encoder/Decoder', input: 'Text to encode', value: long },
      { slug: 'hex-converter', heading: 'Hex ↔ String Converter', input: 'Plain text input', value: long },
      { slug: 'html-encoder', heading: 'HTML Encoder/Decoder', input: 'HTML to encode', value: `<${long}>` },
      { slug: 'text-escape', heading: 'Text Escape/Unescape', input: 'Text to escape', value: long },
      {
        slug: 'punycode-converter',
        heading: 'Punycode Converter',
        input: 'Unicode domains or URLs',
        value: `https://münchen.de/${long}`,
      },
      { slug: 'url-encoder', heading: 'URL Encoder/Decoder', input: 'URL to encode', value: long },
      {
        slug: 'url-parser-builder',
        heading: 'URL Parser & Builder',
        input: 'Source URL',
        value: `https://example.com/${long}?averyveryverylongparametername=${long}#${long}`,
      },
      {
        slug: 'jwt-decoder',
        heading: 'JWT Decoder',
        input: 'JWT token',
        value: `${JWT_HEADER}.${jwtSegment({ data: long, iat: 1, nbf: 2, exp: 3 })}.${long}`,
      },
      {
        slug: 'morse-binary-converter',
        heading: 'Morse Code & Binary Converter',
        input: 'Plain text input',
        value: long,
      },
    ];

    test('no tool scrolls sideways on a phone-sized screen, even with long unbroken content', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });

      for (const tool of tools) {
        await test.step(tool.heading, async () => {
          await openTool(page, tool.slug, tool.heading);
          await page.getByRole('textbox', { name: tool.input }).fill(tool.value);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          );
          expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
        });
      }
    });

    test('a one-character result is counted as "1 character"', async ({ page }) => {
      await openTool(page, 'url-encoder', 'URL Encoder/Decoder');
      await page.getByRole('tab', { name: 'Decode' }).click();
      await page.getByRole('textbox', { name: 'Encoded URL to decode' }).fill('%41');
      await expectResult(page, 'A');

      await expect(page.getByText('1 character', { exact: true })).toBeVisible();
    });
  });
});
