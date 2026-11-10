import { test, expect, type Page } from '@playwright/test';

/**
 * Browser flows for six newer tools: Compound Interest Calculator, Math
 * Expression Evaluator, SVG Placeholder Generator, CSS Minifier & Formatter,
 * MIME Types Reference and Base64 Image Decoder.
 *
 * Expected values are worked out by hand (1000 at 5% compounded monthly for
 * 10 years is 1000 * (1 + 0.05 / 12) ^ 120 = 1647.01), not taken from the
 * tools' own modules. Every tool runs in the browser alone, so each test
 * checks that no request left the app.
 */

let blocked: string[] = [];

test.beforeEach(async ({ page, baseURL, context }) => {
  const appOrigin = new URL(baseURL ?? 'http://localhost:3000').origin;
  blocked = [];
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route(
    (url) => url.protocol.startsWith('http') && url.origin !== appOrigin,
    (route) => {
      blocked.push(route.request().url());
      return route.abort();
    }
  );
});

test.afterEach(() => {
  expect(blocked).toEqual([]);
});

/** Opens a tool page and waits until React has hydrated it (the page records itself as recent). */
async function openTool(page: Page, slug: string, name: string) {
  await page.goto(`/tools/${slug}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await page.waitForFunction(
    (id) => (window.localStorage.getItem('dev-toolbox:recent') ?? '').includes(id),
    slug
  );
}

/** The tool's own error messages; Next.js keeps an empty role="alert" route announcer outside <main>. */
const alerts = (page: Page) => page.getByRole('main').getByRole('alert');

async function readClipboard(page: Page) {
  return page.evaluate(() => navigator.clipboard.readText());
}

/** Picks an option of one of the app's dropdowns, found by its label. */
async function choose(page: Page, label: string, option: string) {
  const trigger = page.getByRole('combobox', { name: label, exact: true });
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(trigger).toHaveText(option);
  await expect(page.getByRole('option')).toHaveCount(0);
}

test.describe('New calculator, generator and reference tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // ---------------------------------------------------------------------------
  // Compound Interest Calculator
  // ---------------------------------------------------------------------------
  test.describe('Compound Interest Calculator', () => {
    const principal = (page: Page) => page.getByRole('textbox', { name: /^Starting amount/ });
    const rate = (page: Page) => page.getByRole('textbox', { name: 'Annual interest rate (%)' });
    const years = (page: Page) => page.getByRole('textbox', { name: 'Years', exact: true });
    const contribution = (page: Page) => page.getByRole('textbox', { name: /^Monthly contribution/ });
    const finalBalance = (page: Page) => page.getByTestId('ci-final-balance');
    const table = (page: Page) => page.getByRole('region', { name: 'Year by year table' });
    /** The value under a result label such as "Total contributed". */
    const stat = (page: Page, label: string) =>
      page.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd');

    test('works out the balance, deposits and interest, with a table and a chart', async ({ page }) => {
      await openTool(page, 'compound-interest-calculator', 'Compound Interest Calculator');

      // 1000 at 5% for 10 years, compounded monthly: 1000 * (1 + 0.05 / 12) ^ 120 = 1647.0095
      await expect(finalBalance(page)).toHaveText('$1,647.01');
      await expect(stat(page, 'Total contributed')).toHaveText('$1,000.00');
      await expect(stat(page, 'Interest earned')).toHaveText('$647.01');
      await expect(page.getByText('$1,000.00 at 5% for 10 years', { exact: true })).toBeVisible();
      await expect(table(page).locator('tbody tr')).toHaveCount(10);
      await expect(page.getByRole('img', { name: /^Growth chart:/ })).toBeVisible();

      // Adding 100 a month at the end of each month: 1647.01 + 15528.23 = 17175.24
      await contribution(page).fill('100');
      await expect(finalBalance(page)).toHaveText('$17,175.24');
      await expect(stat(page, 'Total contributed')).toHaveText('$13,000.00');
      await expect(stat(page, 'Interest earned')).toHaveText('$4,175.24');
      const firstYear = table(page).locator('tbody tr').first();
      await expect(firstYear.getByRole('cell')).toHaveText(['$1,000.00', '$1,200.00', '$79.05', '$2,279.05']);

      // Paid at the start of the month, every deposit earns one more month of interest
      await choose(page, 'Contributions are made', 'Start of each month');
      await expect(finalBalance(page)).toHaveText('$17,239.94');
      await choose(page, 'Contributions are made', 'End of each month');

      // Annual compounding: 10000 * 1.07 ^ 30 = 76122.55
      await contribution(page).fill('');
      await principal(page).fill('10,000');
      await rate(page).fill('7');
      await years(page).fill('30');
      await choose(page, 'Compounding', 'Annually');
      await expect(finalBalance(page)).toHaveText('$76,122.55');
      await expect(table(page).locator('tbody tr')).toHaveCount(30);
    });

    test('copies the summary and reports invalid input per field', async ({ page }) => {
      await openTool(page, 'compound-interest-calculator', 'Compound Interest Calculator');
      await page.getByRole('button', { name: 'Copy summary' }).click();
      await expect.poll(() => readClipboard(page).then((text) => text.replace(/\r\n/g, '\n'))).toBe(
        [
          'Compound interest',
          'Starting amount: $1,000.00',
          'Monthly contribution: $0.00 (end of month)',
          'Annual rate: 5% compounded monthly',
          'Years: 10',
          '',
          'Final balance: $1,647.01',
          'Total contributed: $1,000.00',
          'Interest earned: $647.01',
        ].join('\n')
      );

      await rate(page).fill('150');
      await expect(alerts(page).filter({ hasText: 'Interest rate must be between 0 and 100 percent.' })).toBeVisible();
      await expect(finalBalance(page)).toHaveCount(0);
      await rate(page).fill('5');

      await years(page).fill('2.51');
      await expect(alerts(page).filter({ hasText: 'whole number of months' })).toBeVisible();
      await years(page).fill('2.5');
      await expect(table(page).locator('tbody tr')).toHaveCount(3);
      await expect(table(page).locator('tbody tr').nth(2).getByRole('rowheader')).toHaveText(/^3\s*\(6 mo\)$/);

      await principal(page).fill('');
      await expect(alerts(page).filter({ hasText: 'Enter a starting amount or a monthly contribution.' })).toBeVisible();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByText('Enter a starting amount, an interest rate and a number of years.')).toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  // Math Expression Evaluator
  // ---------------------------------------------------------------------------
  test.describe('Math Expression Evaluator', () => {
    const expression = (page: Page) => page.getByRole('textbox', { name: 'Expression' });
    const result = (page: Page) => page.getByTestId('math-live-result');
    const history = (page: Page) => page.getByRole('list', { name: 'Calculation history' });

    test('evaluates as you type, keeps a history and remembers variables', async ({ page }) => {
      await openTool(page, 'math-evaluator', 'Math Expression Evaluator');

      await expression(page).fill('2 + 3 * 4');
      await expect(result(page)).toHaveText('14');
      await expression(page).fill('0.1 + 0.2');
      await expect(result(page)).toHaveText('0.3');
      await expression(page).fill('2 ^ 3 ^ 2');
      await expect(result(page)).toHaveText('512');
      await expression(page).fill('-2 ^ 2');
      await expect(result(page)).toHaveText('-4');

      // Degrees are the default angle unit
      await expression(page).fill('sin(30)');
      await expect(result(page)).toHaveText('0.5');
      await page.getByRole('button', { name: 'Radians' }).click();
      await expect(page.getByRole('button', { name: 'Radians' })).toHaveAttribute('aria-pressed', 'true');
      await expression(page).fill('sin(pi / 2)');
      await expect(result(page)).toHaveText('1');
      await expression(page).fill('1 / 3');
      await expect(result(page)).toHaveText('0.333333333333');

      // Enter keeps a result, an assignment defines a variable, ans is the last result
      await expression(page).fill('x = 3 * 4');
      await expect(page.getByText('x =', { exact: true })).toBeVisible();
      await expression(page).press('Enter');
      await expect(expression(page)).toHaveValue('');
      await expect(history(page).getByRole('listitem')).toHaveCount(1);
      await expect(history(page).getByRole('listitem').first()).toContainText('= 12');
      await expect(page.getByRole('list', { name: 'Variables' })).toContainText('x');
      await expect(page.getByRole('list', { name: 'Variables' })).toContainText('12');

      await expression(page).fill('x * 2 + ans');
      await expect(result(page)).toHaveText('36');
      await expression(page).press('Enter');
      await expect(history(page).getByRole('listitem').first()).toContainText('= 36');
      await expect(history(page).getByRole('listitem')).toHaveCount(2);

      // The up arrow brings back the last line; a history row can be reused and its result copied
      await expression(page).press('ArrowUp');
      await expect(expression(page)).toHaveValue('x * 2 + ans');
      await page.getByRole('button', { name: 'Copy result 36' }).click();
      await expect.poll(() => readClipboard(page)).toBe('36');
      await page.getByRole('button', { name: 'Reuse x = 3 * 4' }).click();
      await expect(expression(page)).toHaveValue('x = 3 * 4');

      await page.getByRole('button', { name: 'Clear history' }).click();
      await expect(history(page)).toHaveCount(0);
      await expect(page.getByText('No results yet.')).toBeVisible();
    });

    test('reports errors with a position and never runs code', async ({ page }) => {
      await openTool(page, 'math-evaluator', 'Math Expression Evaluator');

      await expression(page).fill('1 / 0');
      await expect(alerts(page).first()).toContainText('Division by zero at position 3');
      await expect(page.getByRole('button', { name: 'Add to history' })).toBeDisabled();
      await expression(page).press('Enter');
      await expect(page.getByText('No results yet.')).toBeVisible();

      await expression(page).fill('2 + (3 * 4');
      await expect(alerts(page).first()).toContainText('Missing ")" at position 11');

      await expression(page).fill('2 $ 3');
      await expect(alerts(page).first()).toContainText('Unexpected "$" at position 3');

      await expression(page).fill('sqrt(-4)');
      await expect(alerts(page).first()).toContainText('sqrt of a negative number at position 1');

      await expression(page).fill('alert(1)');
      await expect(alerts(page).first()).toContainText('Unknown function "alert" at position 1');

      await expression(page).fill('pi = 3');
      await expect(alerts(page).first()).toContainText('"pi" is a constant and cannot be assigned');

      await expression(page).fill('2(3)');
      await expect(alerts(page).first()).toContainText('put an operator such as * before it');

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(expression(page)).toHaveValue('');
      await expect(page.getByText('The result appears here.')).toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  // SVG Placeholder Generator
  // ---------------------------------------------------------------------------
  test.describe('SVG Placeholder Generator', () => {
    const width = (page: Page) => page.getByRole('textbox', { name: 'Width (px)' });
    const height = (page: Page) => page.getByRole('textbox', { name: 'Height (px)' });
    const text = (page: Page) => page.getByRole('textbox', { name: 'Text', exact: true });
    const svgOutput = (page: Page) => page.getByRole('textbox', { name: 'SVG output' });

    test('builds the SVG, data URI, CSS and HTML and downloads the file', async ({ page }) => {
      await openTool(page, 'svg-placeholder-generator', 'SVG Placeholder Generator');

      await expect(page.getByRole('img', { name: 'Placeholder preview, 600 by 400 pixels' })).toBeVisible();
      await expect(svgOutput(page)).toHaveValue(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" role="img" aria-label="600 x 400">' +
          '<rect width="600" height="400" fill="#cccccc"/>' +
          '<text x="50%" y="50%" fill="#666666" font-family="Arial, Helvetica, sans-serif" font-size="88" text-anchor="middle" dominant-baseline="central">600 x 400</text>' +
          '</svg>'
      );

      await width(page).fill('300');
      await height(page).fill('200');
      await text(page).fill('Logo');
      await page.getByRole('textbox', { name: /^Corner radius/ }).fill('12');
      await expect(svgOutput(page)).toHaveValue(/width="300" height="200"/);
      await expect(svgOutput(page)).toHaveValue(/<rect width="300" height="200" rx="12" fill="#cccccc"\/>/);
      await expect(svgOutput(page)).toHaveValue(/>Logo<\/text>/);
      await expect(page.getByRole('img', { name: 'Placeholder preview, 300 by 200 pixels' })).toBeVisible();

      await page.getByRole('tab', { name: 'Data URI' }).click();
      const dataUri = page.getByRole('textbox', { name: 'Data URI output' });
      await expect(dataUri).toHaveValue(/^data:image\/svg\+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww\.w3\.org%2F2000%2Fsvg%22%20width%3D%22300%22/);
      expect(await dataUri.inputValue()).toMatch(/^data:image\/svg\+xml,[A-Za-z0-9%\-_.~]+$/);
      await page.getByRole('button', { name: 'Copy', exact: true }).click();
      await expect.poll(() => readClipboard(page)).toBe(await dataUri.inputValue());

      await page.getByRole('tab', { name: 'CSS' }).click();
      await expect(page.getByRole('textbox', { name: 'CSS output' })).toHaveValue(
        /^\.placeholder \{\n {2}width: 300px;\n {2}height: 200px;\n {2}background: url\("data:image\/svg\+xml,/
      );

      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download .svg' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('placeholder-300x200.svg');
    });

    test('escapes the text and rejects bad sizes', async ({ page }) => {
      await openTool(page, 'svg-placeholder-generator', 'SVG Placeholder Generator');

      await text(page).fill('</text><b>&"x"');
      await expect(svgOutput(page)).toHaveValue(/>&lt;\/text&gt;&lt;b&gt;&amp;&quot;x&quot;<\/text><\/svg>$/);
      expect(await svgOutput(page).inputValue()).not.toContain('<b>');

      await width(page).fill('0');
      await expect(alerts(page).filter({ hasText: 'Width must be a whole number from 1 to 5000.' })).toBeVisible();
      await expect(page.getByText('No preview', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Download .svg' })).toBeDisabled();
      await width(page).fill('5001');
      await expect(alerts(page).filter({ hasText: 'Width must be a whole number' })).toBeVisible();
      await width(page).fill('5000');
      await height(page).fill('abc');
      await expect(alerts(page).filter({ hasText: 'Height must be a whole number' })).toBeVisible();

      await page.getByRole('button', { name: 'Reset' }).click();
      await expect(width(page)).toHaveValue('600');
      await expect(text(page)).toHaveValue('');
      await page.getByRole('button', { name: '1280x720' }).click();
      await expect(width(page)).toHaveValue('1280');
      await expect(height(page)).toHaveValue('720');
      await expect(text(page)).toHaveAttribute('placeholder', '1280 x 720');
    });
  });

  // ---------------------------------------------------------------------------
  // CSS Minifier & Formatter
  // ---------------------------------------------------------------------------
  test.describe('CSS Minifier & Formatter', () => {
    const input = (page: Page) => page.getByRole('textbox', { name: 'CSS input' });
    const output = (page: Page) => page.getByRole('textbox', { name: 'CSS output' });

    test('minifies, shows the byte savings and beautifies', async ({ page }) => {
      await openTool(page, 'css-minifier-formatter', 'CSS Minifier & Formatter');

      await input(page).fill('a {\n  color : red ;\n}\n');
      await expect(output(page)).toHaveValue('a{color:red}');
      await expect(page.getByTestId('css-size-before')).toHaveText('22 bytes');
      await expect(page.getByTestId('css-size-after')).toHaveText('12 bytes');
      await expect(page.getByTestId('css-size-saved')).toHaveText('10 bytes (45.5%)');

      // Strings, comments in strings and calc() spacing survive; minifying drops a real comment, beautifying keeps it
      await input(page).fill(
        '/* header */\n.a  >  .b ,\n.c {\n  content : "a  /* x */ ; }" ;\n  width : calc( 100% - ( 2 * 1.50px ) ) ;\n  background : url( x y.png ) ;\n  color : #ffffff ;\n}\n'
      );
      await expect(output(page)).toHaveValue(
        '.a>.b,.c{content:"a  /* x */ ; }";width:calc(100% - (2 * 1.5px));background:url(x y.png);color:#fff}'
      );

      await page.getByRole('button', { name: 'Beautify' }).click();
      await expect(page.getByRole('button', { name: 'Beautify' })).toHaveAttribute('aria-pressed', 'true');
      await expect(output(page)).toHaveValue(
        '/* header */\n.a > .b,\n.c {\n  content: "a  /* x */ ; }";\n  width: calc(100% - (2 * 1.50px));\n  background: url(x y.png);\n  color: #ffffff;\n}\n'
      );
      await choose(page, 'Indent', '4 spaces');
      await expect(output(page)).toHaveValue(/\n {4}content: "a {2}\/\* x \*\/ ; }";\n/);
      await choose(page, 'Indent', 'Tab');
      await expect(output(page)).toHaveValue(/\n\tcontent: /);

      // Modern nesting and @media
      await input(page).fill('.card{color:red;&:hover{color:blue}@media (min-width:600px){padding:1rem}}');
      await choose(page, 'Indent', '2 spaces');
      await expect(output(page)).toHaveValue(
        [
          '.card {',
          '  color: red;',
          '  &:hover {',
          '    color: blue;',
          '  }',
          '',
          '  @media (min-width: 600px) {',
          '    padding: 1rem;',
          '  }',
          '}',
          '',
        ].join('\n')
      );

      await page.getByRole('button', { name: 'Copy', exact: true }).click();
      await expect.poll(() => readClipboard(page).then((value) => value.replace(/\r\n/g, '\n'))).toContain('  &:hover {');
    });

    test('keeps /*! comments on request and warns about broken CSS', async ({ page }) => {
      await openTool(page, 'css-minifier-formatter', 'CSS Minifier & Formatter');

      await input(page).fill('/*! MIT */\n/* drop */\na{b:c}');
      await expect(output(page)).toHaveValue('a{b:c}');
      await page.getByRole('switch', { name: /Keep .*comments/ }).click();
      await expect(output(page)).toHaveValue('/*! MIT */a{b:c}');

      await input(page).fill('a{b:c;\nd{e:f');
      await expect(alerts(page).first()).toContainText('Missing closing "}"');
      await expect(output(page)).toHaveValue(/^a\{b:c;d\{e:f\}\}$/);

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(input(page)).toHaveValue('');
      await expect(output(page)).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeDisabled();

      await page.getByRole('button', { name: 'Load example' }).click();
      await expect(output(page)).toHaveValue(/^\.card\{display:flex;margin:\.5rem 0 0px -\.5em;color:#fff;/);
      await expect(page.getByTestId('css-size-saved')).toContainText('bytes');
    });
  });

  // ---------------------------------------------------------------------------
  // MIME Types Reference
  // ---------------------------------------------------------------------------
  test.describe('MIME Types Reference', () => {
    const search = (page: Page) => page.getByRole('textbox', { name: 'Search MIME types' });
    const summary = (page: Page) => page.getByText(/^Showing \d+ of \d+ file types$/);
    const rows = (page: Page) => page.getByRole('region', { name: 'MIME types table' }).locator('tbody tr');
    const chip = (page: Page, name: string) =>
      page.getByRole('group', { name: 'Filter by category' }).getByRole('button', { name, exact: true });

    test('searches by extension and type, filters by category and copies a row', async ({ page }) => {
      await openTool(page, 'mime-types-reference', 'MIME Types Reference');
      await expect(summary(page)).toHaveText('Showing 158 of 158 file types');
      await expect(rows(page)).toHaveCount(158);

      await search(page).fill('webp');
      await expect(summary(page)).toHaveText('Showing 1 of 158 file types');
      await expect(rows(page).first()).toContainText('.webp');
      await expect(rows(page).first()).toContainText('image/webp');

      await search(page).fill('.json');
      await expect(rows(page).first()).toContainText('application/json');
      await expect(rows(page).first().getByRole('rowheader')).toContainText('.json');

      await search(page).fill('image/svg+xml');
      await expect(rows(page)).toHaveCount(2);
      await expect(rows(page).first().getByRole('rowheader')).toContainText('.svg');
      await expect(rows(page).nth(1).getByRole('rowheader')).toContainText('.svgz');

      await search(page).fill('PHOTO.WASM');
      await expect(rows(page)).toHaveCount(1);
      await page.getByRole('button', { name: 'Copy application/wasm' }).click();
      await expect(page.getByText('Copied application/wasm', { exact: true })).toBeVisible();
      await expect.poll(() => readClipboard(page)).toBe('application/wasm');
      await page.getByRole('button', { name: 'Copy extension .wasm' }).click();
      await expect.poll(() => readClipboard(page)).toBe('.wasm');

      // Counts follow the search, picking a category narrows the table
      await search(page).fill('');
      await expect(chip(page, 'Font, 6 matching')).toBeVisible();
      await chip(page, 'Font, 6 matching').click();
      await expect(chip(page, 'Font, 6 matching')).toHaveAttribute('aria-pressed', 'true');
      await expect(summary(page)).toHaveText('Showing 6 of 158 file types');
      await expect(rows(page).first().getByRole('rowheader')).toContainText('.eot');
      await search(page).fill('woff');
      await expect(rows(page)).toHaveCount(2);
      await expect(chip(page, 'Image, 0 matching')).toBeVisible();
    });

    test('shows an empty state and clears with Escape and the Clear button', async ({ page }) => {
      await openTool(page, 'mime-types-reference', 'MIME Types Reference');

      await search(page).fill('zzzzzz');
      await expect(page.getByText('No file types match "zzzzzz"')).toBeVisible();
      await expect(rows(page)).toHaveCount(0);
      await search(page).press('Escape');
      await expect(search(page)).toHaveValue('');
      await expect(summary(page)).toHaveText('Showing 158 of 158 file types');

      await chip(page, 'Audio, 18 matching').click();
      await search(page).fill('mp4');
      await expect(rows(page)).toHaveCount(1); // m4a is audio/mp4
      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(summary(page)).toHaveText('Showing 158 of 158 file types');
      await expect(chip(page, 'All categories, 158 matching')).toHaveAttribute('aria-pressed', 'true');

      // ArrowDown moves from the search box into the table, ArrowUp comes back
      await search(page).focus();
      await search(page).press('ArrowDown');
      await expect(rows(page).first().getByRole('button').first()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(rows(page).nth(1).getByRole('button').first()).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      await expect(search(page)).toBeFocused();
    });
  });

  // ---------------------------------------------------------------------------
  // Base64 Image Decoder
  // ---------------------------------------------------------------------------
  test.describe('Base64 Image Decoder', () => {
    // A 24 x 16 PNG, 759 bytes.
    const PNG_BASE64 =
      'iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAIAAACDRijCAAACvklEQVR4nAXBoQqFMABAUT/MuLZoW1xbtC0YVkReEDEoWBaEGYQZLAaDwWCwGAyG+zHvnMSmFCkupUz5pdQpbUqXMqT4lDFlSplTlpQ1ZUvZU46UM+VKuVOelDflS0msoBA4QSn4CWpBK+gEg8ALRsEkmAWLYBVsgl1wCE7BJbgFj+AVfILESgqJk5SSn6SWtJJOMki8ZJRMklmySFbJJtklh+SUXJJb8kheySdJbEaR4TLKjF9GndFmdBlDhs8YM6aMOWPJWDO2jD3jyDgzrow748l4M76MxCoKhVOUip+iVrSKTjEovGJUTIpZsShWxabYFYfiVFyKW/EoXsWnSKym0DhNqflpak2r6TSDxmtGzaSZNYtm1WyaXXNoTs2luTWP5tV8msQaCoMzlIafoTa0hs4wGLxhNEyG2bAYVsNm2A2H4TRchtvwGF7DZ0hsTpHjcsqcX06d0+Z0OUOOzxlzppw5Z8lZc7acPefIOXOunDvnyXlzvpzEWgqLs5SWn6W2tJbOMli8ZbRMltmyWFbLZtkth+W0XJbb8lhey2dJrKNwOEfp+DlqR+voHIPDO0bH5Jgdi2N1bI7dcThOx+W4HY/jdXyOxFYUFa6irPhV1BVtRVcxVPiKsWKqmCuWirViq9grjoqz4qq4K56Kt+KrSGxD0eAayoZfQ93QNnQNQ4NvGBumhrlhaVgbtoa94Wg4G66Gu+FpeBu+hsT2FD2up+z59dQ9bU/XM/T4nrFn6pl7lp61Z+vZe46es+fquXuenrfn60msp/A4T+n5eWpP6+k8g8d7Rs/kmT2LZ/Vsnt1zeE7P5bk9j+f1fJ7EBoqAC5SBX6AOtIEuMAR8YAxMgTmwBNbAFtgDR+AMXIE78ATewBdIbKSIuEgZ+UXqSBvpIkPER8bIFJkjS2SNbJE9ckTOyBW5I0/kjXyRP7Ca9N9d8tG2AAAAAElFTkSuQmCC';

    const input = (page: Page) => page.getByRole('textbox', { name: 'Base64 or data URL input' });
    const preview = (page: Page) => page.getByAltText('Decoded image preview');

    test('decodes a mislabelled data URL, detects the real type and downloads it', async ({ page }) => {
      await openTool(page, 'base64-image-decoder', 'Base64 Image Decoder');
      await expect(page.getByText('Paste Base64 text above to see the image.')).toBeVisible();

      await input(page).fill(`data:image/jpeg;base64,${PNG_BASE64}`);
      await expect(preview(page)).toBeVisible();
      await expect(page.getByText('24 x 16 px', { exact: true })).toBeVisible();
      await expect(page.getByText('759 Bytes', { exact: true })).toBeVisible();
      await expect(page.getByText('image/png', { exact: true })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'The data URL says image/jpeg, but the data is a PNG image.' })).toBeVisible();
      expect(await preview(page).evaluate((img: HTMLImageElement) => img.src.startsWith('blob:'))).toBe(true);

      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download .png' }).click();
      expect((await downloadPromise).suggestedFilename()).toBe('decoded-image.png');

      // The copied data URL carries the corrected type
      await page.getByRole('button', { name: 'Copy data URL' }).click();
      await expect.poll(() => readClipboard(page)).toBe(`data:image/png;base64,${PNG_BASE64}`);

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(input(page)).toHaveValue('');
      await expect(preview(page)).toHaveCount(0);
    });

    test('takes bare Base64 with line breaks and the URL-safe alphabet, and SVG data URLs', async ({ page }) => {
      await openTool(page, 'base64-image-decoder', 'Base64 Image Decoder');

      const urlSafe = PNG_BASE64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const wrapped = urlSafe.replace(/(.{76})/g, '$1\n');
      await input(page).fill(wrapped);
      await expect(preview(page)).toBeVisible();
      await expect(page.getByText('24 x 16 px', { exact: true })).toBeVisible();
      const notes = page.getByRole('list', { name: 'What was fixed' });
      await expect(notes).toContainText('Whitespace and line breaks were ignored.');
      await expect(notes).toContainText('Converted from the URL-safe alphabet.');

      // An SVG data URL that is not Base64 is shown through <img> and reports its own size
      await input(page).fill(
        `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="red"/></svg>')}`
      );
      await expect(page.getByText('40 x 20 px', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Download .svg' })).toBeVisible();
    });

    test('explains invalid Base64 and data that is not an image', async ({ page }) => {
      await openTool(page, 'base64-image-decoder', 'Base64 Image Decoder');

      await input(page).fill('not*base64');
      await expect(alerts(page).filter({ hasText: '"*" is not a Base64 character (position 4).' })).toBeVisible();
      await expect(preview(page)).toHaveCount(0);

      await input(page).fill('data:image/png;base64');
      await expect(alerts(page).filter({ hasText: 'A data URL needs a comma between its header and its data.' })).toBeVisible();

      await input(page).fill('QUJDRA');
      await expect(alerts(page).filter({ hasText: 'is not a PNG, JPEG, GIF, WebP, SVG, BMP, ICO or AVIF image' })).toBeVisible();
      await expect(page.getByText('First bytes: 41 42 43 44', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Download/ })).toHaveCount(0);

      await input(page).fill('SGVsbG8gd29ybGQ=');
      await expect(page.getByText('The data was decoded (11 Bytes)', { exact: false })).toBeVisible();
      await expect(page.getByText('First bytes: 48 65 6c 6c 6f 20 77 6f', { exact: true })).toBeVisible();

      await input(page).fill('data:image/png;base64,QU');
      await expect(page.getByRole('list', { name: 'What was fixed' })).toContainText('Missing "=" padding was added.');
      await input(page).fill('QUJDR');
      await expect(alerts(page).filter({ hasText: 'leaves a single character over' })).toBeVisible();
    });

    test('encodes an uploaded image to a data URL and Base64', async ({ page }) => {
      await openTool(page, 'base64-image-decoder', 'Base64 Image Decoder');
      await page.getByRole('tab', { name: 'Image to Base64' }).click();

      await page.locator('input[type="file"]').setInputFiles({
        name: 'tiny.png',
        mimeType: 'image/png',
        buffer: Buffer.from(PNG_BASE64, 'base64'),
      });
      await expect(page.getByText('tiny.png (759 Bytes)')).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Data URL' })).toHaveValue(`data:image/png;base64,${PNG_BASE64}`);
      await expect(page.getByRole('textbox', { name: 'Base64 only' })).toHaveValue(PNG_BASE64);
      await expect(page.getByAltText('Selected image preview')).toBeVisible();
      await expect(page.getByText(`${PNG_BASE64.length.toLocaleString('en-US')} characters`)).toBeVisible();

      await page.getByRole('button', { name: 'Copy Base64' }).click();
      await expect.poll(() => readClipboard(page)).toBe(PNG_BASE64);
      await page.getByRole('button', { name: 'Copy data URL' }).click();
      await expect.poll(() => readClipboard(page)).toBe(`data:image/png;base64,${PNG_BASE64}`);

      // The data wins over a wrong file label
      await page.locator('input[type="file"]').setInputFiles({
        name: 'actually-png.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from(PNG_BASE64, 'base64'),
      });
      await expect(page.getByRole('textbox', { name: 'Data URL' })).toHaveValue(`data:image/png;base64,${PNG_BASE64}`);

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Data URL' })).toHaveCount(0);
    });

    test('refuses a file that is not an image', async ({ page }) => {
      await openTool(page, 'base64-image-decoder', 'Base64 Image Decoder');
      await page.getByRole('tab', { name: 'Image to Base64' }).click();

      await page.locator('input[type="file"]').setInputFiles({
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('hello'),
      });
      await expect(alerts(page).filter({ hasText: '"notes.txt" is not a supported file type.' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Data URL' })).toHaveCount(0);
    });
  });
});
