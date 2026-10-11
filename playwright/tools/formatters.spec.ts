import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * End-to-end flows for the formatter group: JSON Formatter, YAML Validator,
 * XML Formatter, SQL Formatter and the JSON / YAML / XML / CSV / TOML
 * converter. Every expected value below was worked out by hand from the
 * input, not produced by the code under test.
 *
 * Tests marked `test.fixme` describe the correct behaviour of something that
 * is currently broken; the reason string says what is wrong.
 */

const CHUNKS = '**/_next/static/chunks/**';

/**
 * Opens a tool page and returns its input box once the page is interactive.
 * The export is static HTML, so the textarea is on screen before React has
 * attached its handlers; text filled in that gap would be ignored.
 */
async function openTool(page: Page, slug: string, inputLabel: string) {
  await page.goto(`/tools/${slug}/`);
  const input = page.getByLabel(inputLabel, { exact: true });
  await expect(input).toBeVisible();
  await expect
    .poll(() => input.evaluate((element) => Object.keys(element).some((key) => key.startsWith('__reactProps$'))))
    .toBe(true);
  return input;
}

/** Picks an option from one of the labelled dropdowns and waits for it to close. */
async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(0);
}

/** Clipboard text with Windows line endings folded back to "\n". */
async function clipboardText(page: Page) {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.replace(/\r\n/g, '\n');
}

/** Lines given as [nesting level, text], indented with `unit` per level. */
function indented(unit: string, lines: Array<[number, string]>) {
  return lines.map(([level, text]) => unit.repeat(level) + text).join('\n');
}

/** What the browser's own XML parser says about a document: "OK" or its error. */
function xmlParserVerdict(page: Page, xml: string) {
  return page.evaluate((text) => {
    const parsed = new DOMParser().parseFromString(text, 'application/xml');
    return parsed.getElementsByTagName('parsererror').length === 0
      ? 'OK'
      : (parsed.getElementsByTagName('parsererror')[0].textContent ?? 'error');
  }, xml);
}

test.describe('Formatter tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // -------------------------------------------------------------------------
  // JSON Formatter
  // -------------------------------------------------------------------------
  test.describe('JSON Formatter', () => {
    const SAMPLE = '{"name":"Ada","roles":["admin","editor"],"active":true}';
    const sampleLines: Array<[number, string]> = [
      [0, '{'],
      [1, '"name": "Ada",'],
      [1, '"roles": ['],
      [2, '"admin",'],
      [2, '"editor"'],
      [1, '],'],
      [1, '"active": true'],
      [0, '}'],
    ];

    test('formats with each indentation, minifies, and counts lines', async ({ page }) => {
      const input = await openTool(page, 'json-formatter', 'JSON input');
      const output = page.getByLabel('Formatted JSON output');

      await input.fill(SAMPLE);
      await expect(page.getByText('Valid JSON: Object with 3 keys', { exact: true })).toBeVisible();
      await expect(output).toHaveValue(indented('  ', sampleLines));
      await expect(page.getByText('8 lines', { exact: true })).toBeVisible();

      await choose(page, 'Indentation:', '4 spaces');
      await expect(output).toHaveValue(indented('    ', sampleLines));

      await choose(page, 'Indentation:', 'Tab');
      await expect(output).toHaveValue(indented('\t', sampleLines));

      await page.getByRole('button', { name: 'Minify JSON' }).click();
      await expect(output).toHaveValue(SAMPLE);
      await expect(page.getByText('1 line', { exact: true })).toBeVisible();

      // Picking an indentation leaves minified mode again.
      await choose(page, 'Indentation:', '8 spaces');
      await expect(output).toHaveValue(indented('        ', sampleLines));
      await expect(page.getByText('8 lines', { exact: true })).toBeVisible();
    });

    test('filters the output by dot and bracket paths', async ({ page }) => {
      const input = await openTool(page, 'json-formatter', 'JSON input');
      const output = page.getByLabel('Formatted JSON output');

      await input.fill(
        '{"users":[{"name":"Ada","roles":["admin","editor"]},{"name":"Linus","roles":["viewer"]}],' +
          '"matrix":[[1,2],[3,4]],"$ref":"#/defs/user","odd key":{"a.b":7}}'
      );
      await expect(page.getByText('Valid JSON: Object with 4 keys', { exact: true })).toBeVisible();

      const filter = page.getByLabel('Filter path');

      await filter.fill('$.users[0].roles[1]');
      await expect(output).toHaveValue('"editor"');

      // A key applied to an array reads it from every item.
      await filter.fill('users.name');
      await expect(output).toHaveValue('[\n  "Ada",\n  "Linus"\n]');
      await expect(page.getByText('4 lines', { exact: true })).toBeVisible();

      // More than one bracket in a row.
      await filter.fill('matrix[1][0]');
      await expect(output).toHaveValue('3');

      // A key that starts with "$" is a key, not the root marker.
      await filter.fill('$ref');
      await expect(output).toHaveValue('"#/defs/user"');

      // Quoted keys may hold spaces and dots.
      await filter.fill('["odd key"]["a.b"]');
      await expect(output).toHaveValue('7');

      // A typo matches nothing and says so instead of printing nulls.
      await filter.fill('users.nmae');
      await expect(page.getByText('No matching properties found for path: "users.nmae"', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Copy Output' })).toBeDisabled();
      await expect(page.getByRole('group', { name: 'Output view' })).toHaveCount(0);

      // Inherited members of Object are not properties of the document.
      await filter.fill('constructor');
      await expect(page.getByText('No matching properties found for path: "constructor"', { exact: true })).toBeVisible();

      await filter.fill('');
      await expect(output).toHaveValue(/^\{\n  "users": \[/);
      await expect(page.getByRole('button', { name: 'Copy Output' })).toBeEnabled();
    });

    test('keeps integers above 2^53 digit for digit and accepts a byte order mark', async ({ page }) => {
      const input = await openTool(page, 'json-formatter', 'JSON input');
      const output = page.getByLabel('Formatted JSON output');
      const big = '{"id":9007199254740993,"ids":[12345678901234567890,-9007199254740993],"safe":42}';

      await input.fill(big);
      await expect(page.getByText('Valid JSON: Object with 3 keys', { exact: true })).toBeVisible();
      await expect(output).toHaveValue(
        indented('  ', [
          [0, '{'],
          [1, '"id": 9007199254740993,'],
          [1, '"ids": ['],
          [2, '12345678901234567890,'],
          [2, '-9007199254740993'],
          [1, '],'],
          [1, '"safe": 42'],
          [0, '}'],
        ])
      );

      await page.getByRole('button', { name: 'Minify JSON' }).click();
      await expect(output).toHaveValue(big);

      await page.getByRole('button', { name: 'Tree View' }).click();
      await expect(page.getByText('9007199254740993', { exact: true })).toBeVisible();

      // Text copied out of some editors starts with U+FEFF.
      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input).toHaveValue('');
      await input.fill('\uFEFF{"a":1}');
      await expect(page.getByText('Valid JSON: Object with 1 key', { exact: true })).toBeVisible();
    });

    test('tree view shows the structure and expands and collapses', async ({ page }) => {
      const input = await openTool(page, 'json-formatter', 'JSON input');
      await input.fill('{"user":{"name":"Ada","tags":["red","blue"]},"count":36,"none":null,"ok":false}');

      const views = page.getByRole('group', { name: 'Output view' });
      await expect(views.getByRole('button', { name: 'Text', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await views.getByRole('button', { name: 'Tree View' }).click();
      await expect(views.getByRole('button', { name: 'Tree View' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByLabel('Formatted JSON output')).toHaveCount(0);

      // The root and its direct children start open; deeper levels start closed.
      const root = page.getByRole('button', { name: /^Object \{4 keys\}$/ });
      const user = page.getByRole('button', { name: /^user:\s*Object \{2 keys\}$/ });
      const tags = page.getByRole('button', { name: /^tags:\s*Array\[2\]$/ });
      await expect(root).toHaveAttribute('aria-expanded', 'true');
      await expect(user).toHaveAttribute('aria-expanded', 'true');
      await expect(tags).toHaveAttribute('aria-expanded', 'false');

      await expect(page.getByText('"Ada"', { exact: true })).toBeVisible();
      await expect(page.getByText('36', { exact: true })).toBeVisible();
      await expect(page.getByText('null', { exact: true })).toBeVisible();
      await expect(page.getByText('false', { exact: true })).toBeVisible();
      await expect(page.getByText('"red"', { exact: true })).toHaveCount(0);

      await tags.click();
      await expect(tags).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByText('"red"', { exact: true })).toBeVisible();
      await expect(page.getByText('"blue"', { exact: true })).toBeVisible();

      await user.click();
      await expect(user).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByText('"Ada"', { exact: true })).toHaveCount(0);
      await expect(page.getByText('36', { exact: true })).toBeVisible();

      await root.click();
      await expect(page.getByText('36', { exact: true })).toHaveCount(0);

      // The tree follows the filter.
      await root.click();
      await page.getByLabel('Filter path').fill('user.tags');
      await expect(page.getByRole('button', { name: /^Array\[2\]$/ })).toBeVisible();
      await expect(page.getByText('"blue"', { exact: true })).toBeVisible();
    });

    test('reports invalid JSON and offers nothing to minify or copy', async ({ page }) => {
      const input = await openTool(page, 'json-formatter', 'JSON input');
      const minify = page.getByRole('button', { name: 'Minify JSON' });
      const copy = page.getByRole('button', { name: 'Copy Output' });

      // Nothing typed yet.
      await expect(minify).toBeDisabled();
      await expect(copy).toBeDisabled();
      await expect(page.getByText('Output will appear here', { exact: true })).toBeVisible();

      // A trailing comma: the "}" at offset 7 is where a key should start.
      await input.fill('{"a":1,}');
      await expect(page.getByText(/^Invalid JSON Syntax: .*position 7/)).toBeVisible();
      await expect(page.getByLabel('Formatted JSON output')).toHaveValue('');
      await expect(page.getByText('Output will appear here', { exact: true })).toBeVisible();
      await expect(minify).toBeDisabled();
      await expect(copy).toBeDisabled();
      await expect(page.getByLabel('Filter path')).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'Output view' })).toHaveCount(0);

      await input.fill('{"a":1}');
      await expect(page.getByText('Valid JSON: Object with 1 key', { exact: true })).toBeVisible();
      await expect(page.getByText(/Invalid JSON Syntax/)).toHaveCount(0);
      await expect(minify).toBeEnabled();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input).toHaveValue('');
      await expect(page.getByText(/Valid JSON/)).toHaveCount(0);
    });

    test('indentation dropdown works from the keyboard and Copy puts the output on the clipboard', async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const input = await openTool(page, 'json-formatter', 'JSON input');
      const output = page.getByLabel('Formatted JSON output');
      await input.fill('{"a":[1,2]}');

      const indentation = page.getByRole('combobox', { name: 'Indentation:' });
      await expect(indentation).toHaveText('2 spaces');

      // Arrow keys open the list and move the highlight; Enter selects.
      await indentation.focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: '2 spaces' })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: '4 spaces' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('option')).toHaveCount(0);
      await expect(indentation).toHaveText('4 spaces');
      await expect(indentation).toBeFocused();
      const fourSpaces = '{\n    "a": [\n        1,\n        2\n    ]\n}';
      await expect(output).toHaveValue(fourSpaces);

      // ArrowUp moves back; Space selects too.
      await page.keyboard.press('ArrowUp');
      await expect(page.getByRole('option', { name: '4 spaces' })).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(page.getByRole('option', { name: '2 spaces' })).toBeFocused();
      await page.keyboard.press('Space');
      await expect(page.getByRole('option')).toHaveCount(0);
      await expect(indentation).toHaveText('2 spaces');
      const twoSpaces = '{\n  "a": [\n    1,\n    2\n  ]\n}';
      await expect(output).toHaveValue(twoSpaces);

      // Escape closes without changing the value.
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: '2 spaces' })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: '4 spaces' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('option')).toHaveCount(0);
      await expect(indentation).toHaveText('2 spaces');

      await page.getByRole('button', { name: 'Copy Output' }).click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await clipboardText(page)).toBe(twoSpaces);
    });

    test('does not change numbers that a double cannot hold', async ({ page }) => {
      const input = await openTool(page, 'json-formatter', 'JSON input');
      const output = page.getByLabel('Formatted JSON output');

      await input.fill('{"big":1e400}');
      await expect(page.getByText('Valid JSON: Object with 1 key', { exact: true })).toBeVisible();
      await expect(output).toHaveValue(/^\{\n  "big": 1e\+?400\n\}$/i);

      await input.fill('{"ratio":0.1234567890123456789}');
      await expect(output).toHaveValue('{\n  "ratio": 0.1234567890123456789\n}');
    });
  });

  // -------------------------------------------------------------------------
  // YAML Formatter & Validator
  // -------------------------------------------------------------------------
  test.describe('YAML Validator', () => {
    const SAMPLE = 'name:   Ada\nroles: [admin, editor]\naddress: {city: London, zip: "N1"}\nage: 36\n';
    const sampleLines: Array<[number, string]> = [
      [0, 'name: Ada'],
      [0, 'roles:'],
      [1, '- admin'],
      [1, '- editor'],
      [0, 'address:'],
      [1, 'city: London'],
      [1, 'zip: N1'],
      [0, 'age: 36'],
    ];

    test('rewrites flow style as block YAML, re-indents, and minifies to JSON', async ({ page }) => {
      const input = await openTool(page, 'yaml-validator', 'YAML input');
      const output = page.getByLabel('Formatted YAML output');

      await input.fill(SAMPLE);
      await expect(page.getByText('Valid YAML: Top-level mapping with 4 keys', { exact: true })).toBeVisible();
      await expect(output).toHaveValue(indented('  ', sampleLines) + '\n');
      // The final newline ends the last line; it is not a ninth one.
      await expect(page.getByText('8 lines', { exact: true })).toBeVisible();

      // YAML forbids tabs for indentation, so the list offers spaces only.
      await page.getByLabel('Indentation:', { exact: true }).click();
      await expect(page.getByRole('option')).toHaveText(['2 spaces', '4 spaces', '8 spaces']);
      await page.getByRole('option', { name: '4 spaces' }).click();
      await expect(page.getByRole('option')).toHaveCount(0);
      await expect(output).toHaveValue(indented('    ', sampleLines) + '\n');

      await page.getByRole('button', { name: 'Minify YAML (JSON format)' }).click();
      await expect(output).toHaveValue(
        '{"name":"Ada","roles":["admin","editor"],"address":{"city":"London","zip":"N1"},"age":36}'
      );
      await expect(page.getByText('1 line', { exact: true })).toBeVisible();

      await choose(page, 'Indentation:', '2 spaces');
      await expect(output).toHaveValue(indented('  ', sampleLines) + '\n');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input).toHaveValue('');
      await expect(output).toHaveValue('');
      await expect(page.getByText(/Valid YAML/)).toHaveCount(0);
      await expect(page.getByText('Output will appear here', { exact: true })).toBeVisible();
    });

    test('handles a multi-document stream, large integers and the tree view', async ({ page }) => {
      const input = await openTool(page, 'yaml-validator', 'YAML input');
      const output = page.getByLabel('Formatted YAML output');
      const stream = 'kind: Service\nid: 9007199254740993\n---\nkind: Deployment\nreplicas: 3\n';

      await input.fill(stream);
      await expect(page.getByText('Valid YAML: 2 documents', { exact: true })).toBeVisible();
      await expect(output).toHaveValue(stream);
      await expect(page.getByText('5 lines', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Minify YAML (JSON format)' }).click();
      await expect(output).toHaveValue(
        '{"kind":"Service","id":9007199254740993}\n{"kind":"Deployment","replicas":3}'
      );
      await expect(page.getByText('2 lines', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Tree View' }).click();
      const first = page.getByRole('button', { name: /^Document 1:\s*Mapping \{2 keys\}$/ });
      const second = page.getByRole('button', { name: /^Document 2:\s*Mapping \{2 keys\}$/ });
      await expect(first).toHaveAttribute('aria-expanded', 'true');
      await expect(second).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByText('"Service"', { exact: true })).toBeVisible();
      await expect(page.getByText('9007199254740993', { exact: true })).toBeVisible();
      await expect(page.getByText('"Deployment"', { exact: true })).toBeVisible();

      await first.click();
      await expect(first).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByText('"Service"', { exact: true })).toHaveCount(0);
      await expect(page.getByText('"Deployment"', { exact: true })).toBeVisible();

      // A single document has no "Document n" wrapper.
      await input.fill('roles:\n  - admin\n  - editor\n');
      await expect(page.getByText('Valid YAML: Top-level mapping with 1 key', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Mapping \{1 key\}$/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /^roles:\s*Sequence\[2\]$/ })).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByText('"editor"', { exact: true })).toBeVisible();
    });

    test('reports invalid YAML with its reason and position', async ({ page }) => {
      const input = await openTool(page, 'yaml-validator', 'YAML input');
      const minify = page.getByRole('button', { name: 'Minify YAML (JSON format)' });
      const copy = page.getByRole('button', { name: 'Copy Output' });

      await expect(minify).toBeDisabled();
      await expect(copy).toBeDisabled();

      // The second "a" starts at line 2, column 1.
      await input.fill('a: 1\na: 2\n');
      await expect(
        page.getByText('Invalid YAML Syntax: duplicated mapping key (line 2, column 1)', { exact: true })
      ).toBeVisible();
      await expect(page.getByLabel('Formatted YAML output')).toHaveValue('');
      await expect(page.getByText('Output will appear here', { exact: true })).toBeVisible();
      await expect(minify).toBeDisabled();
      await expect(copy).toBeDisabled();
      await expect(page.getByRole('group', { name: 'Output view' })).toHaveCount(0);

      // A flow sequence that never closes runs to the end of the text.
      await input.fill('a: [1\n');
      await expect(
        page.getByText('Invalid YAML Syntax: unexpected end of the stream within a flow collection (line 2, column 1)', {
          exact: true,
        })
      ).toBeVisible();

      await input.fill('a: [1]\n');
      await expect(page.getByText('Valid YAML: Top-level mapping with 1 key', { exact: true })).toBeVisible();
      await expect(page.getByText(/Invalid YAML Syntax/)).toHaveCount(0);
      await expect(page.getByLabel('Formatted YAML output')).toHaveValue('a:\n  - 1\n');
      await expect(minify).toBeEnabled();
      await expect(copy).toBeEnabled();
    });

    test('says the parser is unavailable when its chunk cannot be downloaded', async ({ page }) => {
      const input = await openTool(page, 'yaml-validator', 'YAML input');
      await page.route(CHUNKS, (route) => route.abort());

      await input.fill('name: Ada\n');
      await expect(
        page.getByText(
          'Parser unavailable: The YAML parser could not be loaded. Check your connection, then edit the text to try again.',
          { exact: true }
        )
      ).toBeVisible();
      // Valid YAML must not be called invalid just because the parser is missing.
      await expect(page.getByText(/Invalid YAML Syntax/)).toHaveCount(0);
      await expect(page.getByText('Evaluating YAML syntax...')).toHaveCount(0);
      await expect(page.getByLabel('Formatted YAML output')).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy Output' })).toBeDisabled();
    });

    test('loads the parser on the next edit once the connection is back', async ({ page }) => {
      test.fixme(
        true,
        'YAML Validator never recovers from a failed parser download: editing the text does not request the chunk again, only a page reload helps. The cause is outside the tool: the Turbopack chunk loader (loadChunkCached) keeps a failed load rejected, so a repeated import() never reaches the network.'
      );
      const input = await openTool(page, 'yaml-validator', 'YAML input');
      await page.route(CHUNKS, (route) => route.abort());
      await input.fill('name: Ada\n');
      await expect(page.getByText(/Parser unavailable/)).toBeVisible();

      await page.unroute(CHUNKS);
      await input.fill('name: Ada\nrole: admin\n');
      await expect(page.getByText('Valid YAML: Top-level mapping with 2 keys', { exact: true })).toBeVisible();
      await expect(page.getByText(/Parser unavailable/)).toHaveCount(0);
      await expect(page.getByLabel('Formatted YAML output')).toHaveValue('name: Ada\nrole: admin\n');
    });

    test('leaves a date-only value as it was written', async ({ page }) => {
      const input = await openTool(page, 'yaml-validator', 'YAML input');
      await input.fill('released: 2024-01-01\n');
      await expect(page.getByText('Valid YAML: Top-level mapping with 1 key', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Formatted YAML output')).toHaveValue('released: 2024-01-01\n');
    });
  });

  // -------------------------------------------------------------------------
  // XML Formatter & Validator
  // -------------------------------------------------------------------------
  test.describe('XML Formatter', () => {
    const SAMPLE =
      '<?xml version="1.0" encoding="UTF-8"?><catalog><book id="b1"><title>XML Basics</title>' +
      '<price>29.99</price><tags/></book><book id="b2"><title>Learning SQL</title><empty></empty></book></catalog>';
    const sampleLines: Array<[number, string]> = [
      [0, '<?xml version="1.0" encoding="UTF-8"?>'],
      [0, '<catalog>'],
      [1, '<book id="b1">'],
      [2, '<title>XML Basics</title>'],
      [2, '<price>29.99</price>'],
      [2, '<tags/>'],
      [1, '</book>'],
      [1, '<book id="b2">'],
      [2, '<title>Learning SQL</title>'],
      [2, '<empty></empty>'],
      [1, '</book>'],
      [0, '</catalog>'],
    ];

    test('pretty-prints with each indentation and minifies back to one line', async ({ page }) => {
      const input = await openTool(page, 'xml-formatter', 'XML input');
      const output = page.getByLabel('Formatted XML output');

      await input.fill(SAMPLE);
      // catalog, 2 x book, 2 x title, price, tags, empty.
      await expect(page.getByText('Valid XML: XML Document with 8 elements', { exact: true })).toBeVisible();
      await expect(output).toHaveValue(indented('  ', sampleLines));
      await expect(page.getByText('12 lines', { exact: true })).toBeVisible();

      await choose(page, 'Indentation:', '4 spaces');
      await expect(output).toHaveValue(indented('    ', sampleLines));

      await choose(page, 'Indentation:', 'Tab');
      await expect(output).toHaveValue(indented('\t', sampleLines));

      await page.getByRole('button', { name: 'Minify XML' }).click();
      await expect(output).toHaveValue(SAMPLE);
      await expect(page.getByText('1 line', { exact: true })).toBeVisible();

      // Formatted XML pasted back in: minifying it gives the one-line form again.
      await input.fill(indented('    ', sampleLines));
      await expect(output).toHaveValue(SAMPLE);

      await choose(page, 'Indentation:', '2 spaces');
      await expect(output).toHaveValue(indented('  ', sampleLines));

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input).toHaveValue('');
      await expect(output).toHaveValue('');
      await expect(page.getByText(/Valid XML/)).toHaveCount(0);
    });

    test('leaves text, attribute values, comments and CDATA untouched', async ({ page }) => {
      const input = await openTool(page, 'xml-formatter', 'XML input');
      const output = page.getByLabel('Formatted XML output');

      await input.fill(
        '<doc><a note="x > y">two  spaces</a><!-- <old>gone</old> --><b><![CDATA[5 > 3 & 2 < 4]]></b>' +
          '<p>Hello <i>big</i> world</p></doc>'
      );
      // doc, a, b, p, i: the commented-out <old> is not an element.
      await expect(page.getByText('Valid XML: XML Document with 5 elements', { exact: true })).toBeVisible();
      await expect(output).toHaveValue(
        indented('  ', [
          [0, '<doc>'],
          [1, '<a note="x > y">two  spaces</a>'],
          [1, '<!-- <old>gone</old> -->'],
          [1, '<b><![CDATA[5 > 3 & 2 < 4]]></b>'],
          [1, '<p>Hello <i>big</i> world</p>'],
          [0, '</doc>'],
        ])
      );

      // Text laid out on lines of its own moves with the indentation.
      await input.fill('<root>\n        <note>\n                first line\n                second line\n        </note>\n</root>');
      await expect(output).toHaveValue(
        indented('  ', [
          [0, '<root>'],
          [1, '<note>'],
          [2, 'first line'],
          [2, 'second line'],
          [1, '</note>'],
          [0, '</root>'],
        ])
      );
    });

    test('tree view shows elements, attributes and repeated children, and follows edits', async ({ page }) => {
      const input = await openTool(page, 'xml-formatter', 'XML input');
      await input.fill('<user id="7"><name>Ada</name><role>admin</role><role>editor</role></user>');
      await expect(page.getByText('Valid XML: XML Document with 4 elements', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Tree View' }).click();
      const user = page.getByRole('button', { name: /^user:\s*Element \{3 nodes\}$/ });
      await expect(user).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('button', { name: /^Element \{1 node\}$/ })).toHaveAttribute('aria-expanded', 'true');

      const attributes = page.getByRole('button', { name: /^_attributes:\s*Element \{1 node\}$/ });
      const name = page.getByRole('button', { name: /^name:\s*Element \{1 node\}$/ });
      const roles = page.getByRole('button', { name: /^role:\s*List\[2\]$/ });
      await expect(attributes).toHaveAttribute('aria-expanded', 'false');
      await expect(name).toHaveAttribute('aria-expanded', 'false');
      await expect(roles).toHaveAttribute('aria-expanded', 'false');

      await attributes.click();
      await expect(page.getByText('"7"', { exact: true })).toBeVisible();
      await name.click();
      await expect(page.getByText('"Ada"', { exact: true })).toBeVisible();
      await roles.click();
      await expect(page.getByRole('button', { name: /^0:\s*Element \{1 node\}$/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /^1:\s*Element \{1 node\}$/ })).toBeVisible();

      // Editing while the tree is showing replaces it; nothing of the old document stays.
      await input.fill('<order><total>12.50</total></order>');
      await expect(page.getByRole('button', { name: /^order:\s*Element \{1 node\}$/ })).toBeVisible();
      await expect(user).toHaveCount(0);
      await expect(page.getByText('"Ada"', { exact: true })).toHaveCount(0);

      await page.getByRole('button', { name: 'Text', exact: true }).click();
      await expect(page.getByLabel('Formatted XML output')).toHaveValue('<order>\n  <total>12.50</total>\n</order>');
    });

    test('reports XML that is not well-formed in one clean sentence', async ({ page }) => {
      const input = await openTool(page, 'xml-formatter', 'XML input');
      const minify = page.getByRole('button', { name: 'Minify XML' });
      const copy = page.getByRole('button', { name: 'Copy Output' });

      await expect(minify).toBeDisabled();
      await expect(copy).toBeDisabled();

      await input.fill('<a><b>text</a>');
      const banner = page.getByText(/^Invalid XML Syntax: /);
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('Opening and ending tag mismatch: b line 1 and a');
      // The browser wraps the reason in boilerplate about "this page"; none of it belongs here.
      await expect(banner).not.toContainText('This page contains');
      await expect(banner).not.toContainText('Below is a rendering');
      await expect(page.getByLabel('Formatted XML output')).toHaveValue('');
      await expect(page.getByText('Output will appear here', { exact: true })).toBeVisible();
      await expect(minify).toBeDisabled();
      await expect(copy).toBeDisabled();
      await expect(page.getByRole('group', { name: 'Output view' })).toHaveCount(0);

      // Two root elements are not one document.
      await input.fill('<a>1</a><b>2</b>');
      await expect(banner).toContainText('Extra content at the end of the document');

      await input.fill('<a><b>text</b></a>');
      await expect(page.getByText('Valid XML: XML Document with 2 elements', { exact: true })).toBeVisible();
      await expect(banner).toHaveCount(0);
      await expect(page.getByLabel('Formatted XML output')).toHaveValue('<a>\n  <b>text</b>\n</a>');
      await expect(minify).toBeEnabled();
      await expect(copy).toBeEnabled();
    });

    test('accepts a well-formed document that has an element named parsererror', async ({ page }) => {
      const input = await openTool(page, 'xml-formatter', 'XML input');
      await input.fill('<log><parsererror>disk full</parsererror></log>');
      await expect(page.getByText('Valid XML: XML Document with 2 elements', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Formatted XML output')).toHaveValue(
        '<log>\n  <parsererror>disk full</parsererror>\n</log>'
      );
    });

    test('shows the tree once the connection is back after its chunk failed to download', async ({ page }) => {
      test.fixme(
        true,
        'XML Formatter tree view never recovers from a failed chunk download and gives no message: "Tree View" stays pressed over the text view until the page is reloaded. The cause is outside the tool: the Turbopack chunk loader (loadChunkCached) keeps a failed load rejected, so a repeated import() never reaches the network.'
      );
      const input = await openTool(page, 'xml-formatter', 'XML input');
      await input.fill('<a><b>t</b></a>');
      await expect(page.getByText('Valid XML: XML Document with 2 elements', { exact: true })).toBeVisible();

      await page.route(CHUNKS, (route) => route.abort());
      const failed = page.waitForEvent('requestfailed');
      await page.getByRole('button', { name: 'Tree View' }).click();
      await failed;

      await page.unroute(CHUNKS);
      await page.getByRole('button', { name: 'Text', exact: true }).click();
      await page.getByRole('button', { name: 'Tree View' }).click();
      await expect(page.getByRole('button', { name: /^a:\s*Element \{1 node\}$/ })).toBeVisible();
    });
  });

  // -------------------------------------------------------------------------
  // SQL Formatter
  // -------------------------------------------------------------------------
  test.describe('SQL Formatter', () => {
    const QUERY = 'Select id, name From users where age > 18 and active = 1 order by name';

    test('formats a query and applies keyword case, AND/OR wrapping and indentation', async ({ page }) => {
      const input = await openTool(page, 'sql-formatter', 'SQL input');
      const output = page.getByLabel('Formatted SQL output');

      await input.fill(QUERY);
      await expect(
        page.getByText('Valid SQL: Formatted successfully under Standard SQL dialect.', { exact: true })
      ).toBeVisible();
      await expect(output).toHaveValue(
        indented('  ', [
          [0, 'SELECT'],
          [1, 'id,'],
          [1, 'name'],
          [0, 'FROM'],
          [1, 'users'],
          [0, 'WHERE'],
          [1, 'age > 18'],
          [1, 'AND active = 1'],
          [0, 'ORDER BY'],
          [1, 'name'],
        ])
      );
      await expect(page.getByText('10 lines', { exact: true })).toBeVisible();

      await choose(page, 'Keyword case', 'lowercase');
      await expect(output).toHaveValue(
        indented('  ', [
          [0, 'select'],
          [1, 'id,'],
          [1, 'name'],
          [0, 'from'],
          [1, 'users'],
          [0, 'where'],
          [1, 'age > 18'],
          [1, 'and active = 1'],
          [0, 'order by'],
          [1, 'name'],
        ])
      );

      // "Preserve" keeps each keyword as it was typed.
      await choose(page, 'Keyword case', 'Preserve');
      await expect(output).toHaveValue(
        indented('  ', [
          [0, 'Select'],
          [1, 'id,'],
          [1, 'name'],
          [0, 'From'],
          [1, 'users'],
          [0, 'where'],
          [1, 'age > 18'],
          [1, 'and active = 1'],
          [0, 'order by'],
          [1, 'name'],
        ])
      );

      await choose(page, 'Keyword case', 'UPPERCASE');
      await choose(page, 'AND / OR wrapping', 'After operator');
      const wrappedAfter: Array<[number, string]> = [
        [0, 'SELECT'],
        [1, 'id,'],
        [1, 'name'],
        [0, 'FROM'],
        [1, 'users'],
        [0, 'WHERE'],
        [1, 'age > 18 AND'],
        [1, 'active = 1'],
        [0, 'ORDER BY'],
        [1, 'name'],
      ];
      await expect(output).toHaveValue(indented('  ', wrappedAfter));

      await choose(page, 'Indentation', '4 spaces');
      await expect(output).toHaveValue(indented('    ', wrappedAfter));

      await choose(page, 'Indentation', 'Tab');
      await expect(output).toHaveValue(indented('\t', wrappedAfter));

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input).toHaveValue('');
      await expect(output).toHaveValue('');
      await expect(page.getByText(/Valid SQL/)).toHaveCount(0);
      await expect(page.getByText('Output will appear here', { exact: true })).toBeVisible();
    });

    test('formats dialect-specific syntax once the dialect is picked from the searchable list', async ({ page }) => {
      const input = await openTool(page, 'sql-formatter', 'SQL input');
      const output = page.getByLabel('Formatted SQL output');

      // Square-bracket identifiers and TOP are SQL Server syntax; standard SQL
      // stops at the bracket, 13 characters in.
      await input.fill('select top 5 [first name] from dbo.users');
      await expect(
        page.getByText(/^Formatting Exception: Parse error: Unexpected "\[first nam" at line 1 column 14\./)
      ).toBeVisible();
      await expect(output).toHaveValue('');

      // Twenty dialects: the list has a search box, and Enter picks the match.
      await page.getByLabel('SQL dialect', { exact: true }).click();
      await page.getByPlaceholder('Search...').fill('server');
      await expect(page.getByRole('option')).toHaveText(['SQL Server (T-SQL)']);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('option')).toHaveCount(0);
      await expect(page.getByRole('combobox', { name: 'SQL dialect' })).toHaveText('SQL Server (T-SQL)');

      await expect(
        page.getByText('Valid SQL: Formatted successfully under SQL Server (T-SQL) dialect.', { exact: true })
      ).toBeVisible();
      await expect(output).toHaveValue('SELECT\n  TOP 5 [first name]\nFROM\n  dbo.users');

      // PostgreSQL casts and JSON operators.
      await choose(page, 'SQL dialect', 'PostgreSQL');
      await input.fill("select a::int, data->>'k' from t where x = $1");
      await expect(
        page.getByText('Valid SQL: Formatted successfully under PostgreSQL dialect.', { exact: true })
      ).toBeVisible();
      await expect(output).toHaveValue("SELECT\n  a::int,\n  data ->> 'k'\nFROM\n  t\nWHERE\n  x = $1");
    });

    test('minifies without touching strings and keeps line comments from swallowing code', async ({ page }) => {
      const input = await openTool(page, 'sql-formatter', 'SQL input');
      const output = page.getByLabel('Formatted SQL output');

      await input.fill("select 1 -- note\nfrom t\nwhere a = 'two  spaces'  and  b in ( 1, 2 ) ;");
      await expect(page.getByText(/^Valid SQL: /)).toBeVisible();
      await page.getByRole('button', { name: 'Minify' }).click();
      await expect(output).toHaveValue("select 1 /* note */ from t where a = 'two  spaces' and b in (1, 2);");
      await expect(page.getByText('1 line', { exact: true })).toBeVisible();

      // Editing the SQL returns to formatted output.
      await input.fill('select 1 from t');
      await expect(output).toHaveValue('SELECT\n  1\nFROM\n  t');
      await expect(page.getByText('4 lines', { exact: true })).toBeVisible();
    });

    test('reports SQL it cannot parse in one line and keeps the error after Minify', async ({ page }) => {
      const input = await openTool(page, 'sql-formatter', 'SQL input');
      const output = page.getByLabel('Formatted SQL output');
      const copy = page.getByRole('button', { name: 'Copy to Clipboard' });

      await expect(copy).toBeDisabled();

      // An unclosed bracket: the parser runs out of input after the 16 characters.
      await input.fill('select (1 from t');
      await expect(
        page.getByText('Formatting Exception: Parse error at token: «EOF» at line 1 column 17', { exact: true })
      ).toBeVisible();
      await expect(page.getByText(/Valid SQL/)).toHaveCount(0);
      await expect(output).toHaveValue('');
      await expect(page.getByText('Output will appear here', { exact: true })).toBeVisible();
      await expect(copy).toBeDisabled();

      // Minify needs no parser, but it must not turn the banner green.
      await page.getByRole('button', { name: 'Minify' }).click();
      await expect(output).toHaveValue('select (1 from t');
      await expect(page.getByText(/^Formatting Exception: Parse error at token/)).toBeVisible();
      await expect(page.getByText(/Valid SQL/)).toHaveCount(0);

      await input.fill('select (1) from t');
      await expect(
        page.getByText('Valid SQL: Formatted successfully under Standard SQL dialect.', { exact: true })
      ).toBeVisible();
      await expect(page.getByText(/Formatting Exception/)).toHaveCount(0);
      await expect(output).toHaveValue('SELECT\n  (1)\nFROM\n  t');
      await expect(copy).toBeEnabled();
    });

    test('copies the formatted SQL', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const input = await openTool(page, 'sql-formatter', 'SQL input');

      await input.fill('select id from users');
      await expect(page.getByLabel('Formatted SQL output')).toHaveValue('SELECT\n  id\nFROM\n  users');
      await page.getByRole('button', { name: 'Copy to Clipboard' }).click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await clipboardText(page)).toBe('SELECT\n  id\nFROM\n  users');
    });

    test('says the formatter could not be loaded when its chunk cannot be downloaded', async ({ page }) => {
      const input = await openTool(page, 'sql-formatter', 'SQL input');
      await page.route(CHUNKS, (route) => route.abort());

      await input.fill('select 1');
      await expect(
        page.getByText(
          'Formatting Exception: The SQL formatter could not be loaded. Check your connection and try again.',
          { exact: true }
        )
      ).toBeVisible();
      await expect(page.getByText(/Valid SQL/)).toHaveCount(0);
      await expect(page.getByText('Loading SQL formatter...')).toHaveCount(0);
      await expect(page.getByLabel('Formatted SQL output')).toHaveValue('');
    });

    test('formats on the next edit once the connection is back', async ({ page }) => {
      test.fixme(
        true,
        'SQL Formatter never recovers from a failed formatter download: later edits do not request the chunk again, only a page reload helps. The cause is outside the tool: the Turbopack chunk loader (loadChunkCached) keeps a failed load rejected, so a repeated import() never reaches the network.'
      );
      const input = await openTool(page, 'sql-formatter', 'SQL input');
      await page.route(CHUNKS, (route) => route.abort());
      await input.fill('select 1');
      await expect(page.getByText(/could not be loaded/)).toBeVisible();

      await page.unroute(CHUNKS);
      await input.fill('select 2');
      await expect(
        page.getByText('Valid SQL: Formatted successfully under Standard SQL dialect.', { exact: true })
      ).toBeVisible();
      await expect(page.getByLabel('Formatted SQL output')).toHaveValue('SELECT\n  2');
    });
  });

  // -------------------------------------------------------------------------
  // JSON / YAML / XML / CSV / TOML Converter
  // -------------------------------------------------------------------------
  test.describe('Format Converter', () => {
    test('converts one JSON document to YAML, XML, TOML and CSV', async ({ page }) => {
      const input = await openTool(page, 'json-yaml-xml', 'JSON input');

      // JSON to YAML is the default pair.
      await expect(page.getByRole('combobox', { name: 'From:' })).toHaveText('JSON');
      await expect(page.getByRole('combobox', { name: 'To:' })).toHaveText('YAML');
      await expect(page.getByText('Output will appear here', { exact: true })).toBeVisible();

      await input.fill('{"name":"Ada","tags":["dev","ops"],"nested":{"level":1},"port":443,"ok":true}');
      await expect(page.getByLabel('YAML output')).toHaveValue(
        'name: Ada\ntags:\n  - dev\n  - ops\nnested:\n  level: 1\nport: 443\nok: true\n'
      );
      await expect(page.getByText('8 lines', { exact: true })).toBeVisible();

      // XML needs one root element, so several keys are wrapped in <root>.
      await choose(page, 'To:', 'XML');
      await expect(page.getByLabel('XML output')).toHaveValue(
        indented('  ', [
          [0, '<root>'],
          [1, '<name>Ada</name>'],
          [1, '<tags>dev</tags>'],
          [1, '<tags>ops</tags>'],
          [1, '<nested>'],
          [2, '<level>1</level>'],
          [1, '</nested>'],
          [1, '<port>443</port>'],
          [1, '<ok>true</ok>'],
          [0, '</root>'],
        ])
      );
      await expect(page.getByText('10 lines', { exact: true })).toBeVisible();

      await choose(page, 'To:', 'TOML');
      await expect(page.getByLabel('TOML output')).toHaveValue(
        'name = "Ada"\ntags = [ "dev", "ops" ]\nport = 443\nok = true\n\n[nested]\nlevel = 1\n'
      );
      await expect(page.getByText('7 lines', { exact: true })).toBeVisible();

      // One object is one CSV row; nested values are written as JSON.
      await choose(page, 'To:', 'CSV');
      await expect(page.getByLabel('CSV output')).toHaveValue(
        'name,tags,nested,port,ok\nAda,"[""dev"",""ops""]","{""level"":1}",443,true'
      );
      await expect(page.getByText('2 lines', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input).toHaveValue('');
      await expect(page.getByLabel('CSV output')).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy to Clipboard' })).toBeDisabled();
    });

    test('writes JSON as one well-formed XML document whatever its shape', async ({ page }) => {
      const input = await openTool(page, 'json-yaml-xml', 'JSON input');
      await choose(page, 'To:', 'XML');
      const output = page.getByLabel('XML output');

      const cases: Array<[string, string]> = [
        // A single key is the root element.
        ['{"name":"Ada"}', '<name>Ada</name>'],
        // A list has no name of its own.
        ['[1,"two",null]', '<root>\n  <item>1</item>\n  <item>two</item>\n  <item/>\n</root>'],
        // Keys that are not XML names are made into names.
        ['{"first name":"Ada","1st":"gold"}', '<root>\n  <first_name>Ada</first_name>\n  <_1st>gold</_1st>\n</root>'],
        // Markup characters in text are escaped.
        ['{"t":"x & y < z"}', '<t>x &amp; y &lt; z</t>'],
        ['"just text"', '<root>just text</root>'],
        [
          '[[1,2],[3,4]]',
          '<root>\n  <item>\n    <item>1</item>\n    <item>2</item>\n  </item>\n  <item>\n    <item>3</item>\n    <item>4</item>\n  </item>\n</root>',
        ],
      ];

      for (const [json, xml] of cases) {
        await input.fill(json);
        await expect(output).toHaveValue(xml);
        expect(await xmlParserVerdict(page, await output.inputValue()), `XML written for ${json}`).toBe('OK');
      }
    });

    test('reads CSV with quoted cells, repeated headers and other delimiters', async ({ page }) => {
      await openTool(page, 'json-yaml-xml', 'JSON input');
      await choose(page, 'From:', 'CSV');
      await choose(page, 'To:', 'JSON');
      const input = page.getByLabel('CSV input');
      const output = page.getByLabel('JSON output');
      const headerRow = page.getByRole('checkbox', { name: 'Use header row / object keys' });
      await expect(headerRow).toBeChecked();

      await input.fill('name,city,name\n"Lovelace, Ada",London,x\nLinus,"Helsinki ""HEL""",y\n');
      // The second "name" column is kept under a name of its own.
      await expect(output).toHaveValue(
        JSON.stringify(
          [
            { name: 'Lovelace, Ada', city: 'London', name_2: 'x' },
            { name: 'Linus', city: 'Helsinki "HEL"', name_2: 'y' },
          ],
          null,
          2
        )
      );

      // Without a header row every line is a row of cells.
      await headerRow.click();
      await expect(headerRow).not.toBeChecked();
      const rows = [
        ['name', 'city', 'name'],
        ['Lovelace, Ada', 'London', 'x'],
        ['Linus', 'Helsinki "HEL"', 'y'],
      ];
      await expect(output).toHaveValue(JSON.stringify(rows, null, 2));

      await choose(page, 'JSON Indentation', '4 spaces');
      await expect(output).toHaveValue(JSON.stringify(rows, null, 4));
      await choose(page, 'JSON Indentation', 'Tab');
      await expect(output).toHaveValue(JSON.stringify(rows, null, '\t'));
      await choose(page, 'JSON Indentation', '2 spaces');

      // A quote that does not open a cell is an ordinary character.
      await headerRow.click();
      await expect(headerRow).toBeChecked();
      await choose(page, 'CSV Delimiter', 'Semicolon (;)');
      await input.fill('item;size\nMonitor;24" wide\n"Desk; oak";large\n');
      await expect(output).toHaveValue(
        JSON.stringify(
          [
            { item: 'Monitor', size: '24" wide' },
            { item: 'Desk; oak', size: 'large' },
          ],
          null,
          2
        )
      );

      await input.fill('a;b\n"open;1\n');
      await expect(
        page.getByText('Error parsing CSV: CSV contains an unclosed quoted field.', { exact: true })
      ).toBeVisible();
      await expect(output).toHaveValue('');
    });

    test('writes CSV with the chosen delimiter and header setting', async ({ page }) => {
      const input = await openTool(page, 'json-yaml-xml', 'JSON input');
      await choose(page, 'To:', 'CSV');
      const output = page.getByLabel('CSV output');

      await input.fill(
        '[{"name":"Ada, Countess","age":36,"note":"said \\"hi\\""},{"name":"Linus","age":54,"note":null}]'
      );
      await expect(output).toHaveValue('name,age,note\n"Ada, Countess",36,"said ""hi"""\nLinus,54,');
      await expect(page.getByText('3 lines', { exact: true })).toBeVisible();

      // With semicolons the comma no longer needs quoting.
      await choose(page, 'CSV Delimiter', 'Semicolon (;)');
      await expect(output).toHaveValue('name;age;note\nAda, Countess;36;"said ""hi"""\nLinus;54;');

      await choose(page, 'CSV Delimiter', 'Tab');
      await expect(output).toHaveValue('name\tage\tnote\nAda, Countess\t36\t"said ""hi"""\nLinus\t54\t');

      await choose(page, 'CSV Delimiter', 'Pipe (|)');
      await expect(output).toHaveValue('name|age|note\nAda, Countess|36|"said ""hi"""\nLinus|54|');

      await page.getByRole('checkbox', { name: 'Use header row / object keys' }).click();
      await expect(output).toHaveValue('Ada, Countess|36|"said ""hi"""\nLinus|54|');
      await expect(page.getByText('2 lines', { exact: true })).toBeVisible();

      // Data with no rows-and-columns shape is a write error, not a JSON parse error.
      await input.fill('[1,2,3]');
      await expect(
        page.getByText('Cannot convert to CSV: CSV conversion requires items to all be objects or all be arrays.', {
          exact: true,
        })
      ).toBeVisible();
      await expect(page.getByText(/Error parsing JSON/)).toHaveCount(0);
      await expect(output).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy to Clipboard' })).toBeDisabled();
    });

    test('reads TOML, YAML and XML into JSON', async ({ page }) => {
      await openTool(page, 'json-yaml-xml', 'JSON input');
      await choose(page, 'To:', 'JSON');
      const output = page.getByLabel('JSON output');

      await choose(page, 'From:', 'TOML');
      await page
        .getByLabel('TOML input')
        .fill('title = "Example"\nbig = 9007199254740993\n\n[owner]\nname = "Tom"\nports = [8001, 8002]\nenabled = true\n');
      await expect(output).toHaveValue(
        indented('  ', [
          [0, '{'],
          [1, '"title": "Example",'],
          [1, '"big": 9007199254740993,'],
          [1, '"owner": {'],
          [2, '"name": "Tom",'],
          [2, '"ports": ['],
          [3, '8001,'],
          [3, '8002'],
          [2, '],'],
          [2, '"enabled": true'],
          [1, '}'],
          [0, '}'],
        ])
      );

      // Several YAML documents become a list of them.
      await choose(page, 'From:', 'YAML');
      await page.getByLabel('YAML input').fill('a: 1\nid: 9007199254740993\n---\nb: [x, z]\n');
      await expect(output).toHaveValue(
        indented('  ', [
          [0, '['],
          [1, '{'],
          [2, '"a": 1,'],
          [2, '"id": 9007199254740993'],
          [1, '},'],
          [1, '{'],
          [2, '"b": ['],
          [3, '"x",'],
          [3, '"z"'],
          [2, ']'],
          [1, '}'],
          [0, ']'],
        ])
      );

      await choose(page, 'From:', 'XML');
      await page.getByLabel('XML input').fill('<user id="7"><name>Ada</name><role>admin</role><role>editor</role></user>');
      await expect(output).toHaveValue(
        JSON.stringify(
          {
            user: {
              _attributes: { id: '7' },
              name: { _text: 'Ada' },
              role: [{ _text: 'admin' }, { _text: 'editor' }],
            },
          },
          null,
          2
        )
      );

      // Swapping feeds that JSON back in and rebuilds the same XML.
      await page.getByRole('button', { name: 'Swap input and output formats' }).click();
      await expect(page.getByRole('combobox', { name: 'From:' })).toHaveText('JSON');
      await expect(page.getByRole('combobox', { name: 'To:' })).toHaveText('XML');
      await expect(page.getByLabel('JSON input')).toHaveValue(/"_attributes"/);
      await expect(page.getByLabel('XML output')).toHaveValue(
        '<user id="7">\n  <name>Ada</name>\n  <role>admin</role>\n  <role>editor</role>\n</user>'
      );
    });

    test('names the failing stage and format in its error messages', async ({ page }) => {
      const input = await openTool(page, 'json-yaml-xml', 'JSON input');
      const copy = page.getByRole('button', { name: 'Copy to Clipboard' });

      // Missing closing brace: a parse error in the source format.
      await input.fill('{"a":[1,{"b":2}]');
      await expect(page.getByText(/^Error parsing JSON: .*position 16/)).toBeVisible();
      await expect(page.getByLabel('YAML output')).toHaveValue('');
      await expect(copy).toBeDisabled();

      // Valid JSON that TOML cannot hold: a write error in the target format.
      await choose(page, 'To:', 'TOML');
      await input.fill('{"mixed":[1,"a"]}');
      await expect(page.getByText(/^Cannot convert to TOML: \S/)).toBeVisible();
      await expect(page.getByText(/Error parsing JSON/)).toHaveCount(0);
      await expect(page.getByLabel('TOML output')).toHaveValue('');

      await choose(page, 'To:', 'JSON');
      await choose(page, 'From:', 'XML');
      await page.getByLabel('XML input').fill('<a><b></a>');
      // One line, with the line counted from 1.
      await expect(
        page.getByText('Error parsing XML: Unexpected close tag (line 1, column 10)', { exact: true })
      ).toBeVisible();

      await choose(page, 'From:', 'YAML');
      await page.getByLabel('YAML input').fill('a: [1\n');
      await expect(
        page.getByText('Error parsing YAML: unexpected end of the stream within a flow collection (line 2, column 1)', {
          exact: true,
        })
      ).toBeVisible();

      await choose(page, 'From:', 'TOML');
      await page.getByLabel('TOML input').fill('title = \n');
      await expect(page.getByText(/^Error parsing TOML: Unexpected character.* at row 1, col 10, pos 9$/)).toBeVisible();
      await expect(page.getByLabel('JSON output')).toHaveValue('');

      await page.getByLabel('TOML input').fill('title = "ok"\n');
      await expect(page.getByLabel('JSON output')).toHaveValue('{\n  "title": "ok"\n}');
      await expect(page.getByText(/Error parsing|Cannot convert/)).toHaveCount(0);
      await expect(copy).toBeEnabled();
    });

    test('swap moves the output to the input, keeps typed text after an error, and starts from an example when empty', async ({
      page,
    }) => {
      const input = await openTool(page, 'json-yaml-xml', 'JSON input');
      const swap = page.getByRole('button', { name: 'Swap input and output formats' });

      await input.fill('{"name":"Ada","langs":["en","fr"]}');
      await expect(page.getByLabel('YAML output')).toHaveValue('name: Ada\nlangs:\n  - en\n  - fr\n');

      await swap.click();
      await expect(page.getByRole('combobox', { name: 'From:' })).toHaveText('YAML');
      await expect(page.getByRole('combobox', { name: 'To:' })).toHaveText('JSON');
      await expect(page.getByText('Input YAML', { exact: true })).toBeVisible();
      await expect(page.getByText('Output JSON', { exact: true })).toBeVisible();
      await expect(page.getByLabel('YAML input')).toHaveValue('name: Ada\nlangs:\n  - en\n  - fr\n');
      await expect(page.getByLabel('JSON output')).toHaveValue(
        '{\n  "name": "Ada",\n  "langs": [\n    "en",\n    "fr"\n  ]\n}'
      );

      // YAML pasted into the JSON side: swapping keeps it and converts it.
      await swap.click();
      await page.getByLabel('JSON input').fill('city: Paris');
      await expect(page.getByText(/^Error parsing JSON: /)).toBeVisible();
      await swap.click();
      await expect(page.getByLabel('YAML input')).toHaveValue('city: Paris');
      await expect(page.getByLabel('JSON output')).toHaveValue('{\n  "city": "Paris"\n}');
      await expect(page.getByText(/Error parsing/)).toHaveCount(0);

      // Nothing typed: swap loads the example for the new input format.
      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByLabel('YAML input')).toHaveValue('');
      await expect(page.getByLabel('JSON output')).toHaveValue('');
      await swap.click();
      await expect(page.getByLabel('JSON input')).toHaveValue(
        '[\n  {\n    "name": "John",\n    "age": 30,\n    "city": "New York"\n  }\n]'
      );
      await expect(page.getByLabel('YAML output')).toHaveValue('- name: John\n  age: 30\n  city: New York\n');
    });

    test('re-indents JSON to JSON, reports bad JSON there, and copies the result', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const input = await openTool(page, 'json-yaml-xml', 'JSON input');
      await choose(page, 'To:', 'JSON');
      const output = page.getByLabel('JSON output');

      await input.fill('{"a":[1,2],"id":9007199254740993}');
      await expect(output).toHaveValue('{\n  "a": [\n    1,\n    2\n  ],\n  "id": 9007199254740993\n}');

      await choose(page, 'JSON Indentation', '4 spaces');
      const fourSpaces = '{\n    "a": [\n        1,\n        2\n    ],\n    "id": 9007199254740993\n}';
      await expect(output).toHaveValue(fourSpaces);

      await page.getByRole('button', { name: 'Copy to Clipboard' }).click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await clipboardText(page)).toBe(fourSpaces);

      await input.fill('{"a":[1,2}');
      await expect(page.getByText(/^Error parsing JSON: /)).toBeVisible();
      await expect(output).toHaveValue('');
    });

    test('a parser that arrives late does not overwrite a newer conversion', async ({ page }) => {
      const input = await openTool(page, 'json-yaml-xml', 'JSON input');
      await input.fill('[{"a":1}]');
      await expect(page.getByLabel('YAML output')).toHaveValue('- a: 1\n');

      // Hold back the TOML parser so its conversion stays pending.
      const held: Route[] = [];
      await page.route(CHUNKS, (route) => {
        held.push(route);
      });
      await choose(page, 'To:', 'TOML');
      await expect.poll(() => held.length).toBeGreaterThan(0);

      // CSV needs no parser: this newer conversion finishes first.
      await choose(page, 'To:', 'CSV');
      await expect(page.getByLabel('CSV output')).toHaveValue('a\n1');

      const arrived = Promise.all(
        held.map((route) => page.waitForResponse(route.request().url()).then((response) => response.finished()))
      );
      await Promise.all(held.map((route) => route.continue()));
      await arrived;
      await page.unroute(CHUNKS);

      // The TOML result for the old request is dropped.
      await expect(page.getByText('Output CSV', { exact: true })).toBeVisible();
      await expect(page.getByLabel('CSV output')).toHaveValue('a\n1');

      // And the parser itself did load: asking again converts at once.
      await choose(page, 'To:', 'TOML');
      await expect(page.getByLabel('TOML output')).toHaveValue('[[items]]\na = 1\n');
    });

    test('says a converter is unavailable when a parser chunk cannot be downloaded', async ({ page }) => {
      const input = await openTool(page, 'json-yaml-xml', 'JSON input');
      await page.route(CHUNKS, (route) => route.abort());

      await input.fill('{"a":1}');
      await expect(
        page.getByText('Converter unavailable: A converter could not be loaded. Check your connection and try again.', {
          exact: true,
        })
      ).toBeVisible();
      await expect(page.getByText(/Error parsing JSON/)).toHaveCount(0);
      await expect(page.getByLabel('YAML output')).toHaveValue('');

      // A pair that needs no parser still works offline.
      await choose(page, 'To:', 'CSV');
      await expect(page.getByLabel('CSV output')).toHaveValue('a\n1');
      await expect(page.getByText(/Converter unavailable/)).toHaveCount(0);
    });

    test('converts on the next edit once the connection is back', async ({ page }) => {
      test.fixme(
        true,
        'Format Converter never recovers from a failed parser download: later conversions do not request the chunk again, only a page reload helps. The cause is outside the tool: the Turbopack chunk loader (loadChunkCached) keeps a failed load rejected, so a repeated import() never reaches the network.'
      );
      const input = await openTool(page, 'json-yaml-xml', 'JSON input');
      await page.route(CHUNKS, (route) => route.abort());
      await input.fill('{"a":1}');
      await expect(page.getByText(/Converter unavailable/)).toBeVisible();

      await page.unroute(CHUNKS);
      await input.fill('{"a":2}');
      await expect(page.getByLabel('YAML output')).toHaveValue('a: 2\n');
      await expect(page.getByText(/Converter unavailable/)).toHaveCount(0);
    });

    test('does not show the previous format under the new heading while a parser loads', async ({ page }) => {
      const input = await openTool(page, 'json-yaml-xml', 'JSON input');
      await input.fill('[{"a":1}]');
      await expect(page.getByLabel('YAML output')).toHaveValue('- a: 1\n');

      const held: Route[] = [];
      await page.route(CHUNKS, (route) => {
        held.push(route);
      });
      await choose(page, 'To:', 'TOML');
      await expect.poll(() => held.length).toBeGreaterThan(0);

      await expect(page.getByText('Output TOML', { exact: true })).toBeVisible();
      await expect(page.getByLabel('TOML output')).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy to Clipboard' })).toBeDisabled();

      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });

    test('keeps both values when two JSON keys become the same XML name', async ({ page }) => {
      const input = await openTool(page, 'json-yaml-xml', 'JSON input');
      await choose(page, 'To:', 'XML');
      const output = page.getByLabel('XML output');

      await input.fill('{"a b":1,"a_b":2}');
      await expect(output).toHaveValue(/>2</);
      await expect(output).toHaveValue(/>1</);
      expect(await xmlParserVerdict(page, await output.inputValue())).toBe('OK');
    });

    test('writes a JSON key that contains a colon as XML a parser accepts', async ({ page }) => {
      const input = await openTool(page, 'json-yaml-xml', 'JSON input');
      await choose(page, 'To:', 'XML');
      const output = page.getByLabel('XML output');

      await input.fill('{"og:title":"x"}');
      await expect(output).toHaveValue(/>x</);
      expect(await xmlParserVerdict(page, await output.inputValue())).toBe('OK');
    });
  });
});
