import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end flows for the reference tools: HTTP Status Codes, User-Agent
 * Parser and Loan & Mortgage Calculator.
 *
 * All three work in the browser alone, so every request that leaves the app's
 * own origin is turned away and each test checks that none was attempted.
 */

let blocked: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  const appOrigin = new URL(baseURL ?? 'http://localhost:3000').origin;
  blocked = [];
  await page.route(
    (url) => url.origin !== appOrigin,
    (route) => {
      blocked.push(route.request().url());
      return route.abort();
    }
  );
});

test.afterEach(() => {
  expect(blocked).toEqual([]);
});

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

/** The clipboard text. Windows hands multi-line text back with CRLF line ends. */
async function readClipboard(page: Page) {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.replace(/\r\n/g, '\n');
}

test.describe('Reference tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // ---------------------------------------------------------------------------
  // HTTP Status Codes
  // ---------------------------------------------------------------------------
  test.describe('HTTP Status Codes', () => {
    const search = (page: Page) => page.getByRole('textbox', { name: 'Search HTTP status codes' });
    const table = (page: Page) => page.getByRole('list', { name: 'HTTP status codes', exact: true });
    const rows = (page: Page) => table(page).getByRole('listitem');
    const phrases = (page: Page) => table(page).getByRole('heading', { level: 3 });
    const summary = (page: Page) => page.getByText(/^Showing \d+ of \d+ status codes$/);
    const chip = (page: Page, name: string) =>
      page.getByRole('group', { name: 'Filter by class' }).getByRole('button', { name, exact: true });

    test('narrows the table by code prefix, words and class, with live counts', async ({ page }) => {
      await openTool(page, 'http-status-codes', 'HTTP Status Codes');
      await expect(summary(page)).toHaveText('Showing 63 of 63 status codes');
      await expect(rows(page)).toHaveCount(63);
      await expect(phrases(page).first()).toHaveText('Continue');
      await expect(phrases(page).last()).toHaveText('Network Authentication Required');
      await expect(chip(page, 'All classes, 63 matching')).toHaveAttribute('aria-pressed', 'true');
      await expect(chip(page, '1xx Informational, 4 matching')).toBeVisible();
      await expect(chip(page, '2xx Successful, 10 matching')).toBeVisible();
      await expect(chip(page, '3xx Redirection, 9 matching')).toBeVisible();
      await expect(chip(page, '4xx Client Error, 29 matching')).toBeVisible();
      await expect(chip(page, '5xx Server Error, 11 matching')).toBeVisible();

      // A number matches the start of the code, so 40 finds 400 to 409; the counts follow the search.
      await search(page).fill('40');
      await expect(summary(page)).toHaveText('Showing 10 of 63 status codes');
      await expect(phrases(page)).toHaveText([
        'Bad Request',
        'Unauthorized',
        'Payment Required',
        'Forbidden',
        'Not Found',
        'Method Not Allowed',
        'Not Acceptable',
        'Proxy Authentication Required',
        'Request Timeout',
        'Conflict',
      ]);
      await expect(chip(page, '4xx Client Error, 10 matching')).toBeVisible();
      await expect(chip(page, '1xx Informational, 0 matching')).toBeVisible();

      await search(page).fill('404');
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page).first()).toContainText('Not Found');
      await expect(rows(page).first()).toContainText('Client Error');
      await expect(rows(page).first()).toContainText('Defined in RFC 9110, Section 15.5.5');

      await search(page).fill('redirect');
      await expect(phrases(page)).toHaveText([
        'Moved Permanently',
        'Found',
        'See Other',
        'Temporary Redirect',
        'Permanent Redirect',
      ]);

      // A word can sit in more than one class; the chips say where, and picking one narrows the list.
      await search(page).fill('timeout');
      await expect(phrases(page)).toHaveText(['Request Timeout', 'Gateway Timeout']);
      await chip(page, '5xx Server Error, 1 matching').click();
      await expect(chip(page, '5xx Server Error, 1 matching')).toHaveAttribute('aria-pressed', 'true');
      await expect(chip(page, 'All classes, 2 matching')).toHaveAttribute('aria-pressed', 'false');
      await expect(phrases(page)).toHaveText(['Gateway Timeout']);
      await expect(summary(page)).toHaveText('Showing 1 of 63 status codes');
      await chip(page, 'All classes, 2 matching').click();
      await expect(rows(page)).toHaveCount(2);

      // Apostrophes are ignored, so the phrase can be typed without one.
      await search(page).fill('im a teapot');
      await expect(phrases(page)).toHaveText(["I'm a teapot"]);
    });

    test('copies a code with its phrase and moves between the rows with the arrow keys', async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openTool(page, 'http-status-codes', 'HTTP Status Codes');

      await search(page).fill('im a teapot');
      await page.getByRole('button', { name: "Copy 418 I'm a teapot" }).click();
      await expect(page.getByText("Copied 418 I'm a teapot", { exact: true })).toBeVisible();
      await expect.poll(() => readClipboard(page)).toBe("418 I'm a teapot");

      await search(page).fill('404');
      await page.getByRole('button', { name: 'Copy 404 Not Found' }).click();
      await expect(page.getByText('Copied 404 Not Found', { exact: true })).toBeVisible();
      await expect.poll(() => readClipboard(page)).toBe('404 Not Found');

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(rows(page)).toHaveCount(63);
      await expect(search(page)).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('button', { name: 'Copy 100 Continue' })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('button', { name: 'Copy 101 Switching Protocols' })).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(page.getByRole('button', { name: 'Copy 100 Continue' })).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(search(page)).toBeFocused();
    });

    test('explains an empty result, and Clear or Escape brings the whole table back', async ({ page }) => {
      await openTool(page, 'http-status-codes', 'HTTP Status Codes');
      const clear = page.getByRole('button', { name: 'Clear', exact: true });
      await expect(clear).toBeDisabled();

      await search(page).fill('zzzz');
      await expect(page.getByText('No status codes match "zzzz"', { exact: true })).toBeVisible();
      await expect(summary(page)).toHaveText('Showing 0 of 63 status codes');
      await expect(table(page)).toHaveCount(0);
      await expect(chip(page, 'All classes, 0 matching')).toBeVisible();
      await page.getByRole('button', { name: 'Clear search and filter' }).click();
      await expect(search(page)).toHaveValue('');
      await expect(rows(page)).toHaveCount(63);
      await expect(clear).toBeDisabled();

      // 404 is not a success code, so the class filter and the search leave nothing.
      await chip(page, '2xx Successful, 10 matching').click();
      await search(page).fill('404');
      await expect(page.getByText('No status codes match "404"', { exact: true })).toBeVisible();
      await expect(clear).toBeEnabled();
      await clear.click();
      await expect(search(page)).toHaveValue('');
      await expect(chip(page, 'All classes, 63 matching')).toHaveAttribute('aria-pressed', 'true');
      await expect(rows(page)).toHaveCount(63);

      await search(page).fill('gateway');
      await expect(rows(page)).toHaveCount(2);
      await search(page).press('Escape');
      await expect(search(page)).toHaveValue('');
      await expect(rows(page)).toHaveCount(63);
    });
  });

  // ---------------------------------------------------------------------------
  // User-Agent Parser
  // ---------------------------------------------------------------------------
  test.describe('User-Agent Parser', () => {
    const OWN_UA =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    const PIXEL_UA =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36';

    test.use({ userAgent: OWN_UA });

    const sample = (page: Page) => page.getByRole('combobox', { name: 'Sample user agents' });
    const input = (page: Page) => page.getByRole('textbox', { name: 'User-Agent', exact: true });
    const json = (page: Page) => page.getByRole('textbox', { name: 'JSON', exact: true });
    const notesHeading = (page: Page) => page.getByRole('heading', { level: 3, name: 'Good to know' });
    const notes = (page: Page) => notesHeading(page).locator('xpath=..').getByRole('listitem');

    async function chooseSample(page: Page, label: string) {
      await sample(page).click();
      await page.getByRole('option', { name: label, exact: true }).click();
      await expect(sample(page)).toHaveText(label);
      await expect(page.getByRole('option')).toHaveCount(0);
    }

    /** The value in one row of a result panel, such as "Operating system" and "Version". */
    function field(page: Page, panel: string, label: string) {
      return page
        .getByRole('heading', { level: 3, name: panel, exact: true })
        .locator('xpath=following-sibling::dl[1]')
        .getByText(label, { exact: true })
        .locator('xpath=following-sibling::dd[1]');
    }

    test('parses a sample into its fields and JSON, copies it, and reads the browser\'s own string', async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'userAgentData', {
          configurable: true,
          value: {
            brands: [
              { brand: 'Chromium', version: '126' },
              { brand: 'Not/A)Brand', version: '8' },
            ],
            mobile: false,
            platform: 'Linux',
          },
        });
      });
      await openTool(page, 'user-agent-parser', 'User-Agent Parser');
      await expect(page.getByText('Paste a User-Agent string, pick a sample', { exact: false })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Clear' })).toBeDisabled();

      await chooseSample(page, 'Chrome on Windows');
      const windowsUa =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
      await expect(input(page)).toHaveValue(windowsUa);
      await expect(page.getByText('Chrome 126.0.0.0 on Windows 10 or 11', { exact: true })).toBeVisible();
      await expect(field(page, 'Browser', 'Name')).toHaveText('Chrome');
      await expect(field(page, 'Rendering engine', 'Name')).toHaveText('Blink');
      await expect(field(page, 'Operating system', 'Version')).toHaveText('10 or 11');
      await expect(field(page, 'Device', 'Type')).toHaveText('Desktop');
      await expect(field(page, 'Device', 'Model')).toHaveText('unknown');
      await expect(field(page, 'Device', 'CPU architecture')).toHaveText('x86_64');
      await expect(notes(page)).toHaveText([
        'Windows 11 also reports Windows NT 10.0, so Windows 10 and 11 cannot be told apart from this string.',
      ]);

      const parsed = JSON.parse(await json(page).inputValue());
      expect(parsed).toEqual({
        userAgent: windowsUa,
        kind: 'browser',
        browser: { name: 'Chrome', version: '126.0.0.0' },
        engine: { name: 'Blink', version: '126.0.0.0' },
        os: { name: 'Windows', version: '10 or 11' },
        device: { type: 'desktop', vendor: null, model: null },
        cpu: { architecture: 'x86_64' },
        notes: [
          'Windows 11 also reports Windows NT 10.0, so Windows 10 and 11 cannot be told apart from this string.',
        ],
      });
      await page.getByRole('button', { name: 'Copy JSON' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      await expect.poll(() => readClipboard(page)).toBe(await json(page).inputValue());

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input(page)).toHaveValue('');
      await expect(sample(page)).toHaveText('Choose a sample...');
      await expect(page.getByRole('heading', { level: 3, name: 'Browser', exact: true })).toHaveCount(0);

      await page.getByRole('button', { name: "Use my browser's" }).click();
      await expect(input(page)).toHaveValue(OWN_UA);
      await expect(page.getByText('Chrome 126.0.0.0 on Linux', { exact: true })).toBeVisible();
      await expect(field(page, 'Operating system', 'Version')).toHaveText('unknown');
      await expect(field(page, 'Device', 'CPU architecture')).toHaveText('x86_64');
      const hints = page.getByRole('heading', { level: 3, name: "This browser's client hints" }).locator('xpath=..');
      await expect(hints.getByText('Chromium 126', { exact: true })).toBeVisible();
      await expect(hints.getByText('Not/A)Brand 8', { exact: true })).toBeVisible();
      await expect(hints.getByText('Mobile', { exact: true }).locator('xpath=following-sibling::dd[1]')).toHaveText('No');
      await expect(hints.getByText('Platform', { exact: true }).locator('xpath=following-sibling::dd[1]')).toHaveText('Linux');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(hints).toHaveCount(0);
    });

    test('cleans a pasted header and tells a phone, a crawler and a command-line client apart', async ({ page }) => {
      await openTool(page, 'user-agent-parser', 'User-Agent Parser');

      await input(page).fill(PIXEL_UA);
      await expect(page.getByText('Chrome 126.0.6478.122 on Android 14', { exact: true })).toBeVisible();
      await expect(field(page, 'Operating system', 'Version')).toHaveText('14');
      await expect(field(page, 'Device', 'Type')).toHaveText('Mobile');
      await expect(field(page, 'Device', 'Vendor')).toHaveText('Google');
      await expect(field(page, 'Device', 'Model')).toHaveText('Pixel 8');
      await expect(field(page, 'Device', 'CPU architecture')).toHaveText('unknown');
      await expect(notesHeading(page)).toHaveCount(0);

      // Typing over a loaded sample leaves the sample list on its prompt.
      await chooseSample(page, 'Safari on iPhone');
      await expect(page.getByText('Safari 17.5 on iOS 17.5.1', { exact: true })).toBeVisible();
      await expect(field(page, 'Device', 'Model')).toHaveText('iPhone');
      await input(page).fill(`${PIXEL_UA} `);
      await expect(sample(page)).toHaveText('Choose a sample...');

      await input(page).fill('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
      await expect(page.getByText('Bot or crawler', { exact: true })).toBeVisible();
      await expect(field(page, 'Bot', 'Name')).toHaveText('Googlebot');
      await expect(field(page, 'Bot', 'Version')).toHaveText('2.1');
      await expect(field(page, 'Device', 'Type')).toHaveText('Bot or automated client');
      await expect(notes(page)).toHaveText([
        'A bot names itself, and anyone can copy the name. Verify crawlers by reverse DNS before trusting them.',
      ]);

      // A "User-Agent:" prefix and wrapping quotes are not part of the value.
      await input(page).fill('User-Agent: "curl/8.4.0"');
      await expect(page.getByText('Command-line or HTTP client', { exact: true })).toBeVisible();
      await expect(field(page, 'Client', 'Name')).toHaveText('curl');
      await expect(field(page, 'Client', 'Version')).toHaveText('8.4.0');
      await expect(field(page, 'Operating system', 'Name')).toHaveText('unknown');
      expect(JSON.parse(await json(page).inputValue()).userAgent).toBe('curl/8.4.0');
    });

    test('reports empty, unrecognised and oversized input, and a browser without client hints', async ({ page }) => {
      await openTool(page, 'user-agent-parser', 'User-Agent Parser');
      const oversized = page.getByRole('alert').filter({ hasText: 'A User-Agent is at most 8192 characters long.' });

      await input(page).fill('   \n  ');
      await expect(page.getByText('Paste a User-Agent string, pick a sample', { exact: false })).toBeVisible();
      await expect(json(page)).toHaveCount(0);

      await input(page).fill('hello world');
      await expect(page.getByText(/^Nothing in this string matched a known browser/)).toBeVisible();
      await expect(page.getByText('Unknown client', { exact: true })).toBeVisible();
      await expect(field(page, 'Browser', 'Name')).toHaveText('unknown');
      await expect(field(page, 'Device', 'Type')).toHaveText('unknown');

      await input(page).fill('a'.repeat(8193));
      await expect(oversized).toBeVisible();
      await expect(json(page)).toHaveCount(0);
      await input(page).fill('a'.repeat(8192));
      await expect(oversized).toHaveCount(0);
      await expect(json(page)).toBeVisible();

      // Firefox and Safari have no navigator.userAgentData.
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: undefined });
      });
      await page.getByRole('button', { name: "Use my browser's" }).click();
      await expect(input(page)).toHaveValue(OWN_UA);
      await expect(page.getByText(/does not expose navigator\.userAgentData/)).toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  // Loan & Mortgage Calculator
  // ---------------------------------------------------------------------------
  test.describe('Loan & Mortgage Calculator', () => {
    const amount = (page: Page) => page.getByRole('textbox', { name: /^Loan amount/ });
    const rate = (page: Page) => page.getByRole('textbox', { name: 'Annual interest rate (%)' });
    const term = (page: Page) => page.getByRole('textbox', { name: 'Loan term', exact: true });
    const extra = (page: Page) => page.getByRole('textbox', { name: /^Extra monthly payment/ });
    const table = (page: Page) => page.getByRole('region', { name: 'Amortization schedule table' });

    /** The monthly payment shown in the big figure. */
    const monthly = (page: Page) =>
      page.getByText('Monthly payment', { exact: true }).locator('xpath=following-sibling::div[1]');
    /** The figure under a label such as "Total interest". */
    const stat = (page: Page, label: string) =>
      page.getByText(label, { exact: true }).locator('xpath=following-sibling::dd[1]');

    async function choose(page: Page, label: string, option: string) {
      await page.getByRole('combobox', { name: label, exact: true }).click();
      await page.getByRole('option', { name: option, exact: true }).click();
      await expect(page.getByRole('option')).toHaveCount(0);
    }

    test('works out 200,000 at 6 percent over 30 years, with its schedule, summary and CSV', async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openTool(page, 'loan-calculator', 'Loan & Mortgage Calculator');

      await expect(amount(page)).toHaveValue('200000');
      await expect(rate(page)).toHaveValue('6');
      await expect(term(page)).toHaveValue('30');
      await expect(page.getByText('$200,000.00 at 6% over 30 years', { exact: true })).toBeVisible();
      await expect(monthly(page)).toHaveText('$1,199.10');
      await expect(stat(page, 'Total interest')).toHaveText('$231,677.04');
      await expect(stat(page, 'Total paid')).toHaveText('$431,677.04');
      await expect(stat(page, 'Payments')).toHaveText('360');
      await expect(page.getByText('30 years', { exact: true })).toBeVisible();
      await expect(page.getByText('The last payment is $1,200.14, which clears the remaining balance.')).toBeVisible();
      await expect(page.getByText('What the extra payment saves')).toHaveCount(0);

      // Every payment is a row; the last one is adjusted so the balance ends at exactly zero.
      const months = table(page).locator('tbody tr');
      await expect(months).toHaveCount(360);
      await expect(months.first().getByRole('rowheader')).toHaveText('1');
      await expect(months.first().getByRole('cell')).toHaveText(['$1,199.10', '$199.10', '$1,000.00', '$199,800.90']);
      await expect(months.last().getByRole('rowheader')).toHaveText('360');
      await expect(months.last().getByRole('cell')).toHaveText(['$1,200.14', '$1,194.17', '$5.97', '$0.00']);
      await expect(table(page).locator('tfoot').getByRole('cell')).toHaveText([
        '$431,677.04',
        '$200,000.00',
        '$231,677.04',
        '-',
      ]);

      await page.getByRole('switch', { name: 'Group by year' }).click();
      const years = table(page).locator('tbody tr');
      await expect(years).toHaveCount(30);
      await expect(years.first().getByRole('rowheader')).toHaveText('Year 1');
      await expect(years.first().getByRole('cell')).toHaveText(['$14,389.20', '$2,456.01', '$11,933.19', '$197,543.99']);
      await expect(years.last().getByRole('rowheader')).toHaveText('Year 30');
      await expect(years.last().getByRole('cell')).toHaveText(['$14,390.24', '$13,933.23', '$457.01', '$0.00']);

      await page.getByRole('button', { name: 'Copy summary' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      await expect.poll(() => readClipboard(page)).toBe(
        [
          'Loan summary',
          'Loan amount: $200,000.00',
          'Interest rate: 6% per year',
          'Term: 30 years (360 monthly payments)',
          'Monthly payment: $1,199.10',
          'Number of payments: 360',
          'Final payment: $1,200.14',
          'Total interest: $231,677.04',
          'Total paid: $431,677.04',
        ].join('\n')
      );

      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download CSV' }).click();
      const file = await downloadPromise;
      expect(file.suggestedFilename()).toBe('loan-amortization-schedule.csv');
      const lines = (await readFile(await file.path(), 'utf8')).split('\r\n');
      expect(lines).toHaveLength(362);
      expect(lines.slice(0, 3)).toEqual([
        'Month,Payment,Principal,Interest,Balance',
        '1,1199.10,199.10,1000.00,199800.90',
        '2,1199.10,200.10,999.00,199600.80',
      ]);
      expect(lines[360]).toBe('360,1200.14,1194.17,5.97,0.00');
      expect(lines[361]).toBe('');
    });

    test('shows what an extra payment saves, and handles a term in months and another currency', async ({ page }) => {
      await openTool(page, 'loan-calculator', 'Loan & Mortgage Calculator');

      await extra(page).fill('200');
      await expect(monthly(page)).toHaveText('$1,199.10');
      await expect(page.getByText('$1,399.10 a month with the extra payment')).toBeVisible();
      await expect(stat(page, 'Total interest')).toHaveText('$151,876.18');
      await expect(stat(page, 'Total paid')).toHaveText('$351,876.18');
      await expect(stat(page, 'Payments')).toHaveText('252');
      await expect(stat(page, 'Time saved')).toHaveText('9 years');
      await expect(page.getByText('Paid off in 21 years instead of 30 years')).toBeVisible();
      await expect(stat(page, 'Interest saved')).toHaveText('$79,800.86');
      await expect(page.getByText('$151,876.18 instead of $231,677.04')).toBeVisible();
      await expect(page.getByText('The last payment is $702.08, which clears the remaining balance.')).toBeVisible();
      await expect(table(page).locator('tbody tr')).toHaveCount(252);
      await extra(page).fill('');
      await expect(page.getByText('What the extra payment saves')).toHaveCount(0);

      await choose(page, 'Term unit', 'Months');
      await amount(page).fill('10000');
      await rate(page).fill('5');
      await term(page).fill('18');
      await expect(page.getByText('$10,000.00 at 5% over 1 year 6 months', { exact: true })).toBeVisible();
      await expect(monthly(page)).toHaveText('$577.81');
      await expect(stat(page, 'Total interest')).toHaveText('$400.47');
      await expect(stat(page, 'Total paid')).toHaveText('$10,400.47');
      await expect(stat(page, 'Payments')).toHaveText('18');
      await expect(page.getByText('The last payment is $577.70, which clears the remaining balance.')).toBeVisible();
      await page.getByRole('switch', { name: 'Group by year' }).click();
      await expect(table(page).locator('tbody tr').nth(1).getByRole('rowheader')).toHaveText(/^Year 2\s*\(6 mo\)$/);

      // A currency without cents is worked in whole units.
      await choose(page, 'Currency', 'JPY - Japanese Yen');
      await expect(page.getByRole('textbox', { name: 'Loan amount (JPY)' })).toBeVisible();
      await choose(page, 'Term unit', 'Years');
      await amount(page).fill('1,000,000');
      await rate(page).fill('3');
      await term(page).fill('5');
      await expect(page.getByText('¥1,000,000 at 3% over 5 years', { exact: true })).toBeVisible();
      await expect(monthly(page)).toHaveText('¥17,969');
      await expect(stat(page, 'Total interest')).toHaveText('¥78,120');
      await expect(stat(page, 'Total paid')).toHaveText('¥1,078,120');
      await expect(stat(page, 'Payments')).toHaveText('60');
    });

    test('flags each field that cannot be used, and Clear empties the form', async ({ page }) => {
      await openTool(page, 'loan-calculator', 'Loan & Mortgage Calculator');
      const problem = (message: string) => page.getByRole('alert').filter({ hasText: message });

      const cases = [
        { field: amount, bad: 'abc', message: 'Enter a number such as 6.5. Use a period for decimals.', good: '200000' },
        { field: amount, bad: '0', message: 'Loan amount must be greater than zero.', good: '200000' },
        { field: rate, bad: '6,5', message: 'Enter a number such as 6.5. Use a period for decimals.', good: '6' },
        { field: rate, bad: '150', message: 'Interest rate must be between 0 and 100 percent.', good: '6' },
        { field: rate, bad: '', message: 'Enter the annual interest rate (0 for no interest).', good: '6' },
        { field: term, bad: '2.1', message: 'Loan term must be a whole number of months (2.5 years is 30 months).', good: '30' },
        { field: term, bad: '101', message: 'Loan term can be at most 100 years (1,200 months).', good: '30' },
        { field: extra, bad: '-5', message: 'Extra payment cannot be negative.', good: '' },
      ];
      for (const { field, bad, message, good } of cases) {
        await field(page).fill(bad);
        await expect(problem(message), `${bad} -> ${message}`).toBeVisible();
        await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
        await expect(field(page)).toHaveAccessibleDescription(message);
        await expect(page.getByText('Fix the highlighted fields to see the repayment.')).toBeVisible();
        await expect(monthly(page)).toHaveCount(0);
        await expect(table(page)).toHaveCount(0);

        await field(page).fill(good);
        await expect(problem(message)).toHaveCount(0);
        await expect(monthly(page)).toHaveText('$1,199.10');
      }

      // Thousands separators are accepted; a comma standing in for a decimal point is not (rate "6,5" above).
      await amount(page).fill('200,000');
      await expect(monthly(page)).toHaveText('$1,199.10');

      await page.getByRole('button', { name: 'Clear' }).click();
      for (const field of [amount, rate, term, extra]) await expect(field(page)).toHaveValue('');
      await expect(page.getByText('Enter a loan amount, interest rate and term to see the repayment.')).toBeVisible();
      await expect(monthly(page)).toHaveCount(0);
      await expect(table(page)).toHaveCount(0);
    });
  });
});
