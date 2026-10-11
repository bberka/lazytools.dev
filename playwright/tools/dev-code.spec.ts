import { test, expect, type Locator, type Page } from '@playwright/test';
import ts from 'typescript';

/**
 * Browser flows for the developer code tools: Cron Expression Parser
 * (/tools/cron-parser), cURL Command to Code (/tools/curl-to-code) and JSON to
 * Code (/tools/json-to-code).
 *
 * Expected values are worked out by hand, not by calling the tools' own logic:
 * run times from the calendar, the request a cURL command sends from curl's
 * documented behaviour, and generated TypeScript by compiling it against the
 * JSON it was generated from.
 */

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Picks an item from one of the app's Select dropdowns. */
async function choose(page: Page, trigger: Locator, option: string) {
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(trigger).toHaveText(option);
}

/** Waits until a read-only output box holds every fragment, then returns its text. */
async function codeContaining(output: Locator, fragments: string[]): Promise<string> {
  await expect.poll(() => output.inputValue()).toContain(fragments[0]);
  const code = await output.inputValue();
  for (const fragment of fragments) {
    expect(code).toContain(fragment);
  }
  return code;
}

/** What the clipboard holds. Chromium on Windows hands text back with CRLF line ends. */
async function clipboardText(page: Page): Promise<string> {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.replace(/\r\n/g, '\n');
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe('Developer code tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // An exception in the page (a crashed render, a failed hydration) fails the test.
  let pageErrors: string[] = [];
  test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
  });
  test.afterEach(() => {
    expect(pageErrors).toEqual([]);
  });

  // ── Cron Expression Parser ──────────────────────────────────────────────────

  test.describe('Cron Expression Parser', () => {
    // The run list depends on the clock and the time zone, so both are pinned:
    // Wednesday 4 March 2026, 05:30 in New York (10:30 UTC). Clocks there go
    // forward on Sunday 8 March.
    test.use({ timezoneId: 'America/New_York', locale: 'en-US' });
    const NOW = new Date('2026-03-04T10:30:00Z');

    const expressionInput = (page: Page) => page.getByLabel('Cron expression', { exact: true });
    const errorAlert = (page: Page) => page.getByRole('alert').filter({ hasText: 'Error:' });

    /**
     * The rows of the "Next Scheduled Runs" card, each as "date time from-now".
     * The rows are plain blocks without list semantics, so they are read from
     * the text that follows the card's "UTC Mode" switch label.
     */
    async function listedRuns(page: Page): Promise<string[]> {
      const lines = (await page.getByRole('main').innerText())
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const start = lines.lastIndexOf('UTC Mode');
      if (start === -1) return [];

      const cells = lines.slice(start + 1);
      const runs: string[] = [];
      for (let index = 0; index < cells.length; index += 3) {
        runs.push(cells.slice(index, index + 3).join(' '));
      }
      return runs;
    }

    async function openCronParser(page: Page, now: Date = NOW) {
      await page.clock.setFixedTime(now);
      await page.goto('/tools/cron-parser/');
      await expect(page.getByText('Next Scheduled Runs')).toBeVisible();
    }

    test('describes the default weekday schedule and lists its next runs in local time and UTC', async ({
      page,
    }) => {
      await openCronParser(page);
      const main = page.getByRole('main');

      await expect(expressionInput(page)).toHaveValue('0 9 * * 1-5');
      await expect(page.getByText('at 09:00, on weekdays', { exact: true })).toBeVisible();
      await expect(main).toContainText('Minute0Hour9Day of Month*Month*Day of Week1-5');

      // 09:00 has not come yet in New York on Wednesday; the weekend is skipped.
      await expect(main).toContainText('Upcoming execution times (your local time)');
      await expect
        .poll(() => listedRuns(page))
        .toEqual([
          '3/4/2026 09:00 AM in 3 hours',
          '3/5/2026 09:00 AM in 1 day',
          '3/6/2026 09:00 AM in 2 days',
          '3/9/2026 09:00 AM in 5 days',
          '3/10/2026 09:00 AM in 6 days',
        ]);

      // In UTC it is already 10:30, so today's 09:00 has passed.
      await page.getByRole('switch', { name: 'Toggle UTC timezone mode' }).click();
      await expect(main).toContainText('Upcoming execution times (UTC)');
      await expect
        .poll(() => listedRuns(page))
        .toEqual([
          '2026-03-05 09:00 UTC in 22 hours',
          '2026-03-06 09:00 UTC in 1 day',
          '2026-03-09 09:00 UTC in 4 days',
          '2026-03-10 09:00 UTC in 5 days',
          '2026-03-11 09:00 UTC in 6 days',
        ]);
    });

    test('runs on either day field, looks years ahead and says when a date never occurs', async ({
      page,
    }) => {
      await openCronParser(page);

      // Day 10 of the month OR a Friday, as cron does when both day fields are set.
      await expressionInput(page).fill('0 0 10 * 5');
      await expect(page.getByLabel('Schedule type')).toHaveText('Custom expression');
      await expect(
        page.getByText('at 00:00, on day 10 of the month or on Friday', { exact: true })
      ).toBeVisible();
      await expect
        .poll(() => listedRuns(page))
        .toEqual([
          '3/6/2026 12:00 AM in 1 day',
          '3/10/2026 12:00 AM in 5 days',
          '3/13/2026 12:00 AM in 8 days',
          '3/20/2026 12:00 AM in 15 days',
          '3/27/2026 12:00 AM in 22 days',
        ]);

      // 29 February only exists in leap years.
      await page.getByRole('switch', { name: 'Toggle UTC timezone mode' }).click();
      await expressionInput(page).fill('0 0 29 2 *');
      await expect
        .poll(() => listedRuns(page))
        .toEqual([
          '2028-02-29 00:00 UTC in 726 days',
          '2032-02-29 00:00 UTC in 2187 days',
          '2036-02-29 00:00 UTC in 3648 days',
          '2040-02-29 00:00 UTC in 5109 days',
          '2044-02-29 00:00 UTC in 6570 days',
        ]);

      // 30 February never comes: the card stays and says so.
      await expressionInput(page).fill('0 0 30 2 *');
      await expect(
        page.getByText(
          'No runs in the next 100 years. This combination of day and month never occurs.'
        )
      ).toBeVisible();
      await expect(page.getByRole('switch', { name: 'Toggle UTC timezone mode' })).toBeVisible();
      await expect(errorAlert(page)).toBeHidden();
    });

    test('builds the expression from the guided schedule options', async ({ page }) => {
      await openCronParser(page);
      const main = page.getByRole('main');
      const scheduleType = page.getByLabel('Schedule type');
      const hour = page.getByLabel('Hour', { exact: true });
      const minute = page.getByLabel('Minute', { exact: true });

      await expect(scheduleType).toHaveText('Weekdays');
      await expect(main).toContainText('Generated expression0 9 * * 1-5');

      // Emptying a number falls back to zero and typing into it does not leave a stray digit.
      await hour.fill('');
      await expect(expressionInput(page)).toHaveValue('0 0 * * 1-5');
      await hour.pressSequentially('14');
      await minute.fill('30');
      await expect(expressionInput(page)).toHaveValue('30 14 * * 1-5');
      await expect(page.getByText('at 14:30, on weekdays', { exact: true })).toBeVisible();
      await expect.poll(async () => (await listedRuns(page))[0]).toBe('3/4/2026 02:30 PM in 9 hours');

      await choose(page, scheduleType, 'Daily');
      await expect(expressionInput(page)).toHaveValue('30 14 * * *');

      await choose(page, scheduleType, 'Weekly');
      await choose(page, page.getByLabel('Day of week'), 'Saturday');
      await expect(expressionInput(page)).toHaveValue('30 14 * * 6');
      await expect.poll(async () => (await listedRuns(page))[0]).toBe('3/7/2026 02:30 PM in 3 days');

      // Months without a 31st are skipped.
      await choose(page, scheduleType, 'Monthly');
      await page.getByLabel('Day of month').fill('31');
      await expect(expressionInput(page)).toHaveValue('30 14 31 * *');
      await expect
        .poll(async () => (await listedRuns(page)).map((run) => run.split(' ')[0]))
        .toEqual(['3/31/2026', '5/31/2026', '7/31/2026', '8/31/2026', '10/31/2026']);

      // A yearly schedule lists five runs, one per year.
      await choose(page, scheduleType, 'Yearly');
      await choose(page, page.getByLabel('Month', { exact: true }), 'July');
      await page.getByLabel('Day', { exact: true }).fill('4');
      await expect(expressionInput(page)).toHaveValue('30 14 4 7 *');
      await expect
        .poll(() => listedRuns(page))
        .toEqual([
          '7/4/2026 02:30 PM in 122 days',
          '7/4/2027 02:30 PM in 487 days',
          '7/4/2028 02:30 PM in 853 days',
          '7/4/2029 02:30 PM in 1218 days',
          '7/4/2030 02:30 PM in 1583 days',
        ]);

      await choose(page, scheduleType, 'Hourly');
      await page.getByLabel('Minute of the hour').fill('45');
      await expect(expressionInput(page)).toHaveValue('45 * * * *');
      await expect.poll(async () => (await listedRuns(page))[0]).toBe('3/4/2026 05:45 AM in 15 minutes');

      await choose(page, scheduleType, 'Every N minutes');
      await page.getByLabel('Interval (minutes)').fill('20');
      await expect(expressionInput(page)).toHaveValue('*/20 * * * *');
      await expect(page.getByText('every 20 minutes', { exact: true })).toBeVisible();
      await expect
        .poll(() => listedRuns(page))
        .toEqual([
          '3/4/2026 05:40 AM in 10 minutes',
          '3/4/2026 06:00 AM in 30 minutes',
          '3/4/2026 06:20 AM in 50 minutes',
          '3/4/2026 06:40 AM in 1 hour',
          '3/4/2026 07:00 AM in 1 hour',
        ]);

      // A value the schedule cannot use is explained instead of silently replaced.
      await page.getByLabel('Interval (minutes)').fill('0');
      await expect(main).toContainText('Generated expression*/0 * * * *');
      await expect(errorAlert(page)).toHaveText('Error: Minute step must be a positive integer.');
    });

    test('lets the schedule type be chosen with the keyboard', async ({ page }) => {
      await openCronParser(page);
      const scheduleType = page.getByLabel('Schedule type');

      await scheduleType.focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: 'Weekdays', exact: true })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: 'Weekly', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(scheduleType).toHaveText('Weekly');
      await expect(expressionInput(page)).toHaveValue('0 9 * * 1');

      // The list closes and focus goes back to the trigger, ready for the next key.
      await expect(page.getByRole('option')).toHaveCount(0);
      await expect(scheduleType).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: 'Weekly', exact: true })).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      await expect(page.getByRole('option', { name: 'Daily', exact: true })).toBeFocused();
      await page.keyboard.press('Space');
      await expect(scheduleType).toHaveText('Daily');
      await expect(expressionInput(page)).toHaveValue('0 9 * * *');
    });

    test('presets and manual edits take over from the builder; copy and clear work', async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openCronParser(page);
      const presets = page.getByLabel('Quick presets');

      // The default expression is itself one of the presets.
      await expect(presets).toHaveText('Every weekday at 9 AM');

      await choose(page, presets, 'Every Sunday at midnight');
      await expect(expressionInput(page)).toHaveValue('0 0 * * 0');
      await expect(page.getByLabel('Schedule type')).toHaveText('Custom expression');
      await expect(page.getByText('Generated expression')).toBeHidden();
      await expect(page.getByText('at 00:00, on Sunday', { exact: true })).toBeVisible();
      await expect.poll(async () => (await listedRuns(page))[0]).toBe('3/8/2026 12:00 AM in 3 days');

      // Editing by hand stops the dropdown from naming a preset that no longer applies.
      await expressionInput(page).fill('0 12 * * 1,3,5');
      await expect(presets).toHaveText('Select a preset...');
      await expect(
        page.getByText('at 12:00, on Monday, Wednesday and Friday', { exact: true })
      ).toBeVisible();
      await expect
        .poll(async () => (await listedRuns(page)).map((run) => run.split(' ')[0]))
        .toEqual(['3/4/2026', '3/6/2026', '3/9/2026', '3/11/2026', '3/13/2026']);

      await page.getByRole('button', { name: 'Copy expression' }).click();
      await expect(page.getByRole('button', { name: 'Expression copied' })).toBeVisible();
      expect(await clipboardText(page)).toBe('0 12 * * 1,3,5');

      await page.getByRole('button', { name: 'Clear expression' }).click();
      await expect(expressionInput(page)).toHaveValue('');
      await expect(
        page.getByRole('button', { name: /^(Copy expression|Expression copied)$/ })
      ).toBeDisabled();
      await expect(page.getByText('Description', { exact: true })).toBeHidden();
      await expect(page.getByText('Next Scheduled Runs')).toBeHidden();
      await expect(errorAlert(page)).toBeHidden();
    });

    test('rejects malformed expressions with a specific error and no results', async ({ page }) => {
      await openCronParser(page);

      const invalid: Array<[expression: string, error: string]> = [
        ['61 * * * *', 'Minute must stay between 0 and 59.'],
        ['0 24 * * *', 'Hour must stay between 0 and 23.'],
        ['0 0 0 * *', 'Day of month must stay between 1 and 31.'],
        ['0 0 * 13 *', 'Month must stay between 1 and 12.'],
        ['0 0 * * 8', 'Day of week must stay between 0 and 6.'],
        ['30-10 * * * *', 'Minute range must start at or before its end.'],
        ['*/0 * * * *', 'Minute step must be a positive integer.'],
        // Half-written fields must not be read as zero.
        ['*/ * * * *', 'Minute step must be a positive integer.'],
        ['1e1 * * * *', 'Minute must stay between 0 and 59.'],
        [
          '0 9 * *',
          'Cron expression must have exactly 5 fields: minute hour day-of-month month day-of-week.',
        ],
        [
          '*/15 * * * * *',
          'Cron expression must have exactly 5 fields: minute hour day-of-month month day-of-week.',
        ],
      ];

      for (const [expression, error] of invalid) {
        await expressionInput(page).fill(expression);
        await expect(errorAlert(page), expression).toHaveText(`Error: ${error}`);
        await expect(expressionInput(page), expression).toHaveAttribute('aria-invalid', 'true');
        await expect(page.getByText('Description', { exact: true }), expression).toBeHidden();
        await expect(page.getByText('Next Scheduled Runs'), expression).toBeHidden();
      }

      // Fixing the expression brings the results back.
      await expressionInput(page).fill('*/15 * * * *');
      await expect(errorAlert(page)).toBeHidden();
      await expect(page.getByText('every 15 minutes', { exact: true })).toBeVisible();
      await expect.poll(async () => (await listedRuns(page))[0]).toBe('3/4/2026 05:45 AM in 15 minutes');
    });

    test('moves the run list on as the minutes pass', async ({ page }) => {
      await page.clock.install({ time: new Date('2026-03-04T10:30:20Z') });
      await page.goto('/tools/cron-parser/');
      await expressionInput(page).fill('* * * * *');
      await expect(page.getByText('every minute', { exact: true })).toBeVisible();
      await expect.poll(async () => (await listedRuns(page))[0]).toBe('3/4/2026 05:31 AM in 1 minute');

      // 45 seconds later the clock has passed 05:31, which has therefore run.
      await page.clock.runFor(45_000);
      await expect.poll(async () => (await listedRuns(page))[0]).toBe('3/4/2026 05:32 AM in 1 minute');
    });

    test('keeps an every-15-minutes schedule running through the hour that repeats when clocks go back', async ({
      page,
    }) => {
      // 01:10 EDT on Sunday 1 November 2026. At 02:00 EDT the clocks return to
      // 01:00 EST, so local times 01:00-01:59 occur twice, one hour apart.
      await openCronParser(page, new Date('2026-11-01T05:10:00Z'));
      await expressionInput(page).fill('*/15 * * * *');

      // The job fires every 15 minutes of real time: 05:15, 05:30, 05:45, 06:00, 06:15 UTC.
      await expect
        .poll(() => listedRuns(page))
        .toEqual([
          '11/1/2026 01:15 AM in 5 minutes',
          '11/1/2026 01:30 AM in 20 minutes',
          '11/1/2026 01:45 AM in 35 minutes',
          '11/1/2026 01:00 AM in 50 minutes',
          '11/1/2026 01:15 AM in 1 hour',
        ]);
    });
  });

  // ── cURL Command to Code ────────────────────────────────────────────────────

  test.describe('cURL Command to Code', () => {
    const commandInput = (page: Page) => page.getByLabel('cURL command', { exact: true });
    const snippetOutput = (page: Page) => page.getByLabel('Generated code snippet', { exact: true });
    const languageSelect = (page: Page) => page.getByRole('combobox', { name: 'Target language' });
    const notes = (page: Page) =>
      page.getByRole('status').filter({ hasText: 'Check before you run it' });

    // The command the tool shows as its own example.
    const EXAMPLE_COMMAND = [
      'curl -X POST https://api.example.com/v1/users',
      '-H "Content-Type: application/json"',
      '-H "Authorization: Bearer token123"',
      `-d '{"name": "Ada", "role": "admin"}'`,
    ].join(' \\\n  ');
    const EXAMPLE_URL = 'https://api.example.com/v1/users';
    // The example body as a double-quoted string literal, which most targets use.
    const EXAMPLE_BODY_LITERAL = String.raw`"{\"name\": \"Ada\", \"role\": \"admin\"}"`;

    interface SentRequest {
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string;
    }

    /**
     * Runs a generated JavaScript fetch snippet against a stand-in `fetch` and
     * reports the request it would send. The request is built with the
     * platform's own `Request`, so anything a real fetch rejects is rejected
     * here too.
     */
    async function requestSentBy(snippet: string): Promise<SentRequest> {
      let sent: Promise<SentRequest> | undefined;
      const fetchStandIn = (url: string, init: RequestInit) => {
        sent = (async () => {
          const request = new Request(url, init);
          return {
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: await request.text(),
          };
        })();
        return Promise.resolve({ text: () => Promise.resolve('') });
      };
      const quietConsole = { log: () => undefined, error: () => undefined };

      new Function('fetch', 'Headers', 'console', snippet)(fetchStandIn, Headers, quietConsole);
      if (!sent) throw new Error('The snippet never called fetch.');
      return sent;
    }

    /** Pastes a command and returns the fetch snippet once it shows `marker`. */
    async function convert(page: Page, command: string, marker: string): Promise<string> {
      await commandInput(page).fill(command);
      return codeContaining(snippetOutput(page), [marker]);
    }

    test.beforeEach(async ({ page }) => {
      await page.goto('/tools/curl-to-code/');
      await expect(commandInput(page)).toBeVisible();
    });

    test('turns a JSON POST into a fetch snippet that sends the same request, and copies it', async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      // Nothing to show or copy before a command is pasted.
      await expect(languageSelect(page)).toHaveText('JavaScript — Fetch');
      await expect(snippetOutput(page)).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy Snippet' })).toBeDisabled();

      const snippet = await convert(page, EXAMPLE_COMMAND, `fetch("${EXAMPLE_URL}", requestOptions)`);
      expect(snippet).toContain('myHeaders.append("Content-Type", "application/json");');
      expect(snippet).toContain('myHeaders.append("Authorization", "Bearer token123");');
      expect(snippet).toContain('method: "POST",');

      const sent = await requestSentBy(snippet);
      expect(sent.url).toBe(EXAMPLE_URL);
      expect(sent.method).toBe('POST');
      expect(sent.headers).toEqual({
        'content-type': 'application/json',
        authorization: 'Bearer token123',
      });
      expect(JSON.parse(sent.body)).toEqual({ name: 'Ada', role: 'admin' });
      await expect(notes(page)).toBeHidden();

      await page.getByRole('button', { name: 'Copy Snippet' }).click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await clipboardText(page)).toBe(snippet);
    });

    test('reads quoting and options the way a shell and curl do', async ({ page }) => {
      // API-docs style: -u, repeated -d, and a word that is only partly quoted.
      const stripe = [
        'curl https://api.stripe.com/v1/charges',
        '-u sk_test_abc:',
        '-d amount=2000',
        '-d currency=usd',
        '-d "metadata[order_id]"=6735',
      ].join(' \\\n  ');
      expect(await requestSentBy(await convert(page, stripe, 'api.stripe.com'))).toEqual({
        url: 'https://api.stripe.com/v1/charges',
        method: 'POST',
        headers: {
          // base64("sk_test_abc:")
          authorization: 'Basic c2tfdGVzdF9hYmM6',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'amount=2000&currency=usd&metadata[order_id]=6735',
      });

      // Browser "Copy as cURL": a $'...' body with an escaped quote, and -b for cookies.
      const fromBrowser = [
        `curl 'https://example.com/api/items?page=2'`,
        `-H 'accept: application/json, text/plain, */*'`,
        `-H 'content-type: application/json'`,
        `-b 'sid=abc; theme=dark'`,
        String.raw`--data-raw $'{"title":"It\'s here","note":"line1\\nline2"}'`,
      ].join(' \\\n  ');
      const browserRequest = await requestSentBy(
        await convert(page, fromBrowser, 'example.com/api/items')
      );
      expect(browserRequest.url).toBe('https://example.com/api/items?page=2');
      expect(browserRequest.method).toBe('POST');
      expect(browserRequest.headers).toEqual({
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        cookie: 'sid=abc; theme=dark',
      });
      expect(JSON.parse(browserRequest.body)).toEqual({ title: "It's here", note: 'line1\nline2' });

      // Escaped quotes inside double quotes, and '\'' to put a quote inside single quotes.
      const quoting = String.raw`curl -H "Content-Type: application/json" -d "{\"motto\": \"don't panic\"}" -d 'x='\''y' https://example.com/quotes`;
      expect((await requestSentBy(await convert(page, quoting, 'example.com/quotes'))).body).toBe(
        `{"motto": "don't panic"}&x='y`
      );

      // -G moves the data into the query string; a URL without a scheme is HTTP.
      const query = `curl -G --data-urlencode "q=hello world & more" -d limit=10 example.com/search`;
      const queryRequest = await requestSentBy(await convert(page, query, 'example.com/search'));
      expect(queryRequest.method).toBe('GET');
      expect(queryRequest.body).toBe('');
      const queryUrl = new URL(queryRequest.url);
      expect(queryUrl.origin + queryUrl.pathname).toBe('http://example.com/search');
      expect(Object.fromEntries(queryUrl.searchParams)).toEqual({
        q: 'hello world & more',
        limit: '10',
      });

      // Values of other options are not the URL, -I means HEAD, and a pipe ends the command.
      const noisy = `curl -sS -x http://proxy.local:8080 --connect-timeout 5 -o out.json -w '%{http_code}' -I https://example.com/health | grep 200`;
      expect(await requestSentBy(await convert(page, noisy, 'example.com/health'))).toEqual({
        url: 'https://example.com/health',
        method: 'HEAD',
        headers: {},
        body: '',
      });

      // An ID too large for a JavaScript number is sent exactly as written.
      const bigId = `curl -H 'Content-Type: application/json' -d '{"id": 12345678901234567890}' https://example.com/big`;
      expect((await requestSentBy(await convert(page, bigId, 'example.com/big'))).body).toBe(
        '{"id": 12345678901234567890}'
      );
    });

    test('writes the request in every target language', async ({ page }) => {
      await commandInput(page).fill(EXAMPLE_COMMAND);
      const output = snippetOutput(page);

      const expectations: Array<[language: string, fragments: string[]]> = [
        [
          'JavaScript — Axios',
          [
            'axios.request(config)',
            'method: "post",',
            `url: "${EXAMPLE_URL}",`,
            '"Authorization": "Bearer token123"',
            'const data = JSON.stringify({\n  "name": "Ada",\n  "role": "admin"\n});',
          ],
        ],
        [
          'Python — Requests',
          [
            'response = requests.request("POST", url, headers=headers, data=payload)',
            `url = "${EXAMPLE_URL}"`,
            '"Authorization": "Bearer token123"',
            'payload = json.dumps({\n  "name": "Ada",\n  "role": "admin"\n})',
          ],
        ],
        [
          'Go — net/http',
          [
            'req, err := http.NewRequest(method, url, payload)',
            `url := "${EXAMPLE_URL}"`,
            'method := "POST"',
            'payload := strings.NewReader(`{"name": "Ada", "role": "admin"}`)',
            'req.Header.Add("Authorization", "Bearer token123")',
          ],
        ],
        [
          'Rust — Reqwest',
          [
            `client.post("${EXAMPLE_URL}")`,
            'HeaderName::from_str("Authorization")?,',
            'HeaderValue::from_str("Bearer token123")?,',
            `.body(${EXAMPLE_BODY_LITERAL})`,
          ],
        ],
        [
          'PHP — cURL',
          [
            'CURLOPT_CUSTOMREQUEST => "POST",',
            `CURLOPT_URL => "${EXAMPLE_URL}",`,
            `CURLOPT_POSTFIELDS => ${EXAMPLE_BODY_LITERAL},`,
            '"Authorization: Bearer token123",',
          ],
        ],
        [
          'Java — HttpURLConnection',
          [
            'conn.setRequestMethod("POST");',
            `new URL("${EXAMPLE_URL}")`,
            'conn.setRequestProperty("Authorization", "Bearer token123");',
            `byte[] input = ${EXAMPLE_BODY_LITERAL}.getBytes("utf-8");`,
          ],
        ],
        [
          'Java — OkHttp',
          [
            '.method("POST", body)',
            `.url("${EXAMPLE_URL}")`,
            'MediaType.parse("application/json")',
            `RequestBody.create(mediaType, ${EXAMPLE_BODY_LITERAL})`,
            '.addHeader("Authorization", "Bearer token123")',
          ],
        ],
        [
          'C# — HttpClient',
          [
            `new HttpRequestMessage(HttpMethod.Post, "${EXAMPLE_URL}")`,
            'request.Headers.Add("Authorization", "Bearer token123");',
            `new StringContent(${EXAMPLE_BODY_LITERAL}, Encoding.UTF8, "application/json")`,
          ],
        ],
        [
          'Ruby — Net::HTTP',
          [
            'request = Net::HTTP::Post.new(uri.request_uri)',
            `URI.parse("${EXAMPLE_URL}")`,
            'request["Authorization"] = "Bearer token123"',
            `request.body = ${EXAMPLE_BODY_LITERAL}`,
          ],
        ],
        [
          'Swift — URLSession',
          [
            'request.httpMethod = "POST"',
            `URL(string: "${EXAMPLE_URL}")!`,
            'request.setValue("Bearer token123", forHTTPHeaderField: "Authorization")',
            `request.httpBody = ${EXAMPLE_BODY_LITERAL}.data(using: .utf8)`,
          ],
        ],
        [
          'Kotlin — OkHttp',
          [
            '.method("POST", body)',
            `.url("${EXAMPLE_URL}")`,
            '"application/json".toMediaType()',
            `${EXAMPLE_BODY_LITERAL}.toRequestBody(mediaType)`,
            '.addHeader("Authorization", "Bearer token123")',
          ],
        ],
        [
          'Dart — http',
          [
            'await http.post(url, headers: headers, body: body);',
            `Uri.parse("${EXAMPLE_URL}")`,
            '"Authorization": "Bearer token123"',
            `final body = ${EXAMPLE_BODY_LITERAL};`,
          ],
        ],
      ];

      for (const [language, fragments] of expectations) {
        await choose(page, languageSelect(page), language);
        await codeContaining(output, fragments);
      }

      // JSON literals have to become Python ones, or the snippet is a NameError.
      await choose(page, languageSelect(page), 'Python — Requests');
      await commandInput(page).fill(
        `curl --json '{"active": true, "deleted": false, "parent": null}' https://example.com/flags`
      );
      await codeContaining(output, [
        'url = "https://example.com/flags"',
        'payload = json.dumps({\n  "active": True,\n  "deleted": False,\n  "parent": None\n})',
        '"Content-Type": "application/json"',
        '"Accept": "application/json"',
      ]);

      // A dollar sign would start interpolation in a PHP, Kotlin or Dart double-quoted string.
      await commandInput(page).fill(
        `curl -H 'Content-Type: application/json' -d '{"query":"query($id: ID!) { user(id: $id) { name } }"}' https://example.com/graphql`
      );
      const escapedQuery = String.raw`"{\"query\":\"query(\$id: ID!) { user(id: \$id) { name } }\"}"`;
      for (const language of ['PHP — cURL', 'Kotlin — OkHttp', 'Dart — http']) {
        await choose(page, languageSelect(page), language);
        await codeContaining(output, ['example.com/graphql', escapedQuery]);
      }

      // Methods the client libraries have no shortcut for still produce a request.
      await commandInput(page).fill('curl -X PURGE https://example.com/cache');
      await choose(page, languageSelect(page), 'Rust — Reqwest');
      await codeContaining(output, [
        'client.request(reqwest::Method::from_bytes(b"PURGE")?, "https://example.com/cache")',
      ]);
      await choose(page, languageSelect(page), 'C# — HttpClient');
      await codeContaining(output, [
        'new HttpRequestMessage(new HttpMethod("PURGE"), "https://example.com/cache")',
      ]);
      await choose(page, languageSelect(page), 'Dart — http');
      await codeContaining(output, ['http.Request("PURGE", url)']);
    });

    test('says what it could not carry over, flags a missing URL, and clears', async ({ page }) => {
      const output = snippetOutput(page);

      // No URL: a placeholder is used and the user is told.
      await commandInput(page).fill('curl -X POST -H "Accept: application/json"');
      const placeholder = await requestSentBy(
        await codeContaining(output, ['https://api.example.com/endpoint'])
      );
      expect(placeholder.method).toBe('POST');
      expect(placeholder.headers).toEqual({ accept: 'application/json' });
      await expect(notes(page)).toContainText(
        'No URL found in the command, so a placeholder URL is used.'
      );

      // Multipart fields and -k cannot be expressed in the snippet.
      await commandInput(page).fill('curl -k -F "file=@photo.png" https://example.com/upload');
      const upload = await requestSentBy(await codeContaining(output, ['example.com/upload']));
      expect(upload.method).toBe('POST');
      await expect(notes(page).getByRole('listitem')).toHaveText([
        '-k/--insecure (skip TLS certificate checks) is not carried over to the code.',
        'Multipart form fields (-F) are not converted. Add them to the request body by hand.',
      ]);

      // A body read from a file is not available in the browser.
      await commandInput(page).fill('curl --data-binary @body.json https://example.com/import');
      await codeContaining(output, ['example.com/import']);
      await expect(notes(page).getByRole('listitem')).toHaveText([
        'The body is read from a file (body.json), which cannot be opened here. Replace "@body.json" with the file\'s contents.',
      ]);

      // A plain request needs no note.
      await commandInput(page).fill('curl https://example.com/plain');
      await codeContaining(output, ['example.com/plain']);
      await expect(notes(page)).toBeHidden();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(commandInput(page)).toHaveValue('');
      await expect(output).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy Snippet' })).toBeDisabled();
    });

    test('does not hand out fetch code that cannot run for a GET with a body', async ({ page }) => {
      // The form used throughout the Elasticsearch documentation.
      const search = `curl -X GET "localhost:9200/_search" -H 'Content-Type: application/json' -d '{"query":{"match_all":{}}}'`;
      const snippet = await convert(page, search, 'localhost:9200/_search');

      const outcome = await requestSentBy(snippet).then(
        () => 'sent',
        (error: unknown) => String(error)
      );
      const noted = (await notes(page).count()) > 0;

      // Either the snippet works, or the tool says that fetch cannot send this request.
      expect(
        outcome === 'sent' || noted,
        `The fetch snippet fails (${outcome}) and no note is shown.`
      ).toBe(true);
    });

    test('writes Ruby that exists for a method without its own Net::HTTP class', async ({ page }) => {
      // PURGE is how Varnish and Fastly caches are invalidated.
      await commandInput(page).fill('curl -X PURGE https://example.com/cache');
      await choose(page, languageSelect(page), 'Ruby — Net::HTTP');
      const code = await codeContaining(snippetOutput(page), ['https://example.com/cache']);

      // Net::HTTP only has classes for the standard and WebDAV methods; there is no Purge.
      expect(code).not.toContain('Net::HTTP::Purge');
      expect(code).toMatch(/["']PURGE["']/);
    });

    test('does not ask HttpURLConnection for a PATCH, which it refuses', async ({ page }) => {
      await commandInput(page).fill(
        `curl -X PATCH https://example.com/items/7 -H 'Content-Type: application/json' -d '{"name":"Widget"}'`
      );
      await choose(page, languageSelect(page), 'Java — HttpURLConnection');
      const code = await codeContaining(snippetOutput(page), ['https://example.com/items/7']);
      const noted = (await notes(page).count()) > 0;

      // setRequestMethod("PATCH") throws ProtocolException: Invalid HTTP method: PATCH.
      expect(
        !code.includes('setRequestMethod("PATCH")') || noted,
        'The snippet calls setRequestMethod("PATCH") and no note is shown.'
      ).toBe(true);
    });
  });

  // ── JSON to Code ────────────────────────────────────────────────────────────

  test.describe('JSON to Code', () => {
    const jsonInput = (page: Page) => page.getByLabel('JSON payload', { exact: true });
    const codeOutput = (page: Page) => page.getByLabel('Generated code', { exact: true });
    const languageSelect = (page: Page) => page.getByLabel('Target Language');
    const banner = (page: Page) =>
      page.getByRole('status').filter({ hasText: /Valid JSON Format|Syntax Error/ });

    // The sample the tool shows as its own example.
    const EXAMPLE_JSON = `{
  "id": 1,
  "name": "Ada Lovelace",
  "active": true,
  "roles": ["Admin", "Editor"],
  "company": {
    "name": "Analytical Engine Co",
    "address": "London"
  }
}`;

    /** Type-checks TypeScript source in strict mode and returns the error messages. */
    function typeErrors(source: string): string[] {
      const fileName = 'generated.ts';
      const options: ts.CompilerOptions = {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2020,
        types: [],
      };
      const host = ts.createCompilerHost(options);
      const readSourceFile = host.getSourceFile.bind(host);
      host.getSourceFile = (name, languageVersion, ...rest) =>
        name === fileName
          ? ts.createSourceFile(name, source, languageVersion)
          : readSourceFile(name, languageVersion, ...rest);
      host.fileExists = (name) => name === fileName || ts.sys.fileExists(name);
      host.readFile = (name) => (name === fileName ? source : ts.sys.readFile(name));

      const program = ts.createProgram([fileName], options, host);
      return ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    }

    /** The declarations of a generated file, in an order that does not matter. */
    const declarationsOf = (code: string) => code.split('\n\n').sort();

    test.beforeEach(async ({ page }) => {
      await page.goto('/tools/json-to-code/');
      await expect(jsonInput(page)).toBeVisible();
    });

    test('generates TypeScript interfaces that type-check against the pasted JSON', async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const sample = `{
  "id": 42,
  "login": "octocat",
  "site_admin": false,
  "score": 4.5,
  "plan": { "name": "pro", "private_repos": 20 },
  "repos": [
    { "id": 1, "name": "hello", "license": { "key": "mit" }, "topics": ["a", "b"] },
    { "id": 2, "name": "world", "license": null, "topics": [], "fork": true }
  ]
}`;

      await jsonInput(page).fill(sample);
      await expect(banner(page)).toHaveText('Valid JSON Format: Object with 6 keys');
      const code = await codeContaining(codeOutput(page), ['export interface RootObject {']);

      // One type per object; the two repos are merged, so "fork" is optional
      // and "license" may be null.
      expect(declarationsOf(code)).toEqual(
        declarationsOf(
          [
            'export interface RootObject {\n  id: number;\n  login: string;\n  site_admin: boolean;\n  score: number;\n  plan: Plan;\n  repos: Repo[];\n}',
            'export interface Plan {\n  name: string;\n  private_repos: number;\n}',
            'export interface Repo {\n  id: number;\n  name: string;\n  license: License | null;\n  topics: string[];\n  fork?: boolean;\n}',
            'export interface License {\n  key: string;\n}',
          ].join('\n\n')
        )
      );

      // The types accept the sample they were made from, and reject a wrong one.
      expect(typeErrors(`${code}\nexport const sample: RootObject = ${sample};\n`)).toEqual([]);
      expect(
        typeErrors(
          `${code}\nexport const wrong: Repo = { id: 1, name: "n", license: null, topics: [1] };\n`
        )
      ).toEqual(["Type 'number' is not assignable to type 'string'."]);

      await page.getByRole('button', { name: 'Copy Code' }).click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await clipboardText(page)).toBe(code);
    });

    test('merges the items of a root array into one type, in TypeScript, Zod and Go', async ({
      page,
    }) => {
      const users = `[
  { "id": 1, "name": "Ada", "score": 1 },
  { "id": 2, "email": "grace@example.com", "score": 2.5, "tags": ["admin"] }
]`;
      await page.getByLabel('Root Name').fill('Users');
      await jsonInput(page).fill(users);
      await expect(banner(page)).toHaveText('Valid JSON Format: Array with 2 items');

      const typescript = await codeContaining(codeOutput(page), ['export type Users = User[];']);
      expect(declarationsOf(typescript)).toEqual(
        declarationsOf(
          [
            'export type Users = User[];',
            'export interface User {\n  id: number;\n  name?: string;\n  score: number;\n  email?: string;\n  tags?: string[];\n}',
          ].join('\n\n')
        )
      );
      expect(typeErrors(`${typescript}\nexport const sample: Users = ${users};\n`)).toEqual([]);

      // Zod reads a const before it is declared unless nested schemas come first.
      await choose(page, languageSelect(page), 'TypeScript — Zod Schema');
      const zod = await codeContaining(codeOutput(page), [
        "import { z } from 'zod';",
        'const userSchema = z.object({\n  id: z.number().int(),\n  name: z.string().optional(),\n  score: z.number(),\n  email: z.string().optional(),\n  tags: z.array(z.string()).optional(),\n});',
        'const usersSchema = z.array(userSchema);',
      ]);
      expect(zod.indexOf('const userSchema')).toBeLessThan(zod.indexOf('const usersSchema'));

      // 1 and 2.5 together are floats; a key missing from some items is a pointer with omitempty.
      await choose(page, languageSelect(page), 'Go — struct');
      await codeContaining(codeOutput(page), [
        'type Users []User',
        [
          'type User struct {',
          '\tId int64 `json:"id"`',
          '\tName *string `json:"name,omitempty"`',
          '\tScore float64 `json:"score"`',
          '\tEmail *string `json:"email,omitempty"`',
          '\tTags []string `json:"tags,omitempty"`',
          '}',
        ].join('\n'),
      ]);
    });

    test('applies the root name and the TypeScript options', async ({ page }) => {
      const output = codeOutput(page);
      const rootName = page.getByLabel('Root Name');
      await jsonInput(page).fill('{"id": 1, "tags": ["a"]}');
      await expect(output).toHaveValue('export interface RootObject {\n  id: number;\n  tags: string[];\n}');

      await rootName.fill('api response');
      await expect(output).toHaveValue('export interface ApiResponse {\n  id: number;\n  tags: string[];\n}');
      await rootName.fill('');
      await expect(output).toHaveValue('export interface RootObject {\n  id: number;\n  tags: string[];\n}');

      await choose(page, page.getByLabel('Declaration Style'), 'type alias');
      await expect(output).toHaveValue('export type RootObject = {\n  id: number;\n  tags: string[];\n};');

      await page.getByRole('checkbox', { name: 'Export interfaces/types' }).click();
      await expect(output).toHaveValue('type RootObject = {\n  id: number;\n  tags: string[];\n};');

      await page.getByRole('checkbox', { name: 'Make properties optional (?)' }).click();
      await expect(output).toHaveValue('type RootObject = {\n  id?: number;\n  tags?: string[];\n};');

      await page.getByRole('checkbox', { name: 'Make properties readonly' }).click();
      await expect(output).toHaveValue(
        'type RootObject = {\n  readonly id?: number;\n  readonly tags?: string[];\n};'
      );

      await page.getByRole('checkbox', { name: 'Include trailing semicolons (;)' }).click();
      await expect(output).toHaveValue(
        'type RootObject = {\n  readonly id?: number\n  readonly tags?: string[]\n}'
      );

      // The options only apply to TypeScript and are put away for other languages.
      await choose(page, languageSelect(page), 'Go — struct');
      await expect(page.getByLabel('Declaration Style')).toBeHidden();
      await expect(page.getByRole('checkbox', { name: 'Make properties readonly' })).toBeHidden();
      await choose(page, languageSelect(page), 'TypeScript');
      await expect(page.getByRole('checkbox', { name: 'Make properties readonly' })).toBeChecked();
      await expect(output).toHaveValue(
        'type RootObject = {\n  readonly id?: number\n  readonly tags?: string[]\n}'
      );
    });

    test('writes the model in every other target language', async ({ page }) => {
      await jsonInput(page).fill(EXAMPLE_JSON);
      const output = codeOutput(page);

      const expectations: Array<[language: string, fragments: string[]]> = [
        [
          'TypeScript — Zod Schema',
          [
            'const companySchema = z.object({\n  name: z.string(),\n  address: z.string(),\n});\n\nconst rootObjectSchema = z.object({\n  id: z.number().int(),\n  name: z.string(),\n  active: z.boolean(),\n  roles: z.array(z.string()),\n  company: companySchema,\n});',
          ],
        ],
        [
          'Python — dataclass',
          [
            '@dataclass\nclass RootObject:\n    id: int\n    name: str\n    active: bool\n    roles: list[str]\n    company: Company',
            '@dataclass\nclass Company:\n    name: str\n    address: str',
            'from dataclasses import dataclass',
          ],
        ],
        [
          'Python — TypedDict',
          [
            // The class a field refers to is defined before the class that uses it.
            'class Company(TypedDict):\n    name: str\n    address: str\n\nclass RootObject(TypedDict):\n    id: int\n    name: str\n    active: bool\n    roles: list[str]\n    company: Company',
            'from typing import Any, TypedDict',
          ],
        ],
        [
          'Go — struct',
          [
            [
              'type RootObject struct {',
              '\tId int64 `json:"id"`',
              '\tName string `json:"name"`',
              '\tActive bool `json:"active"`',
              '\tRoles []string `json:"roles"`',
              '\tCompany Company `json:"company"`',
              '}',
            ].join('\n'),
            'type Company struct {\n\tName string `json:"name"`\n\tAddress string `json:"address"`\n}',
          ],
        ],
        [
          'Java — class',
          [
            'public class RootObject {',
            'import java.util.List;',
            '    private long id;',
            '    private boolean active;',
            '    private List<String> roles;',
            '    private Company company;',
            '    public List<String> getRoles() { return roles; }',
            '    public void setCompany(Company company) { this.company = company; }',
            'public class Company {',
          ],
        ],
        [
          'C# — class',
          [
            'public class RootObject\n{\n    public long Id { get; set; }\n    public string Name { get; set; }\n    public bool Active { get; set; }\n    public List<string> Roles { get; set; }\n    public Company Company { get; set; }\n}',
            'using System.Collections.Generic;',
            'public class Company\n{\n    public string Name { get; set; }\n    public string Address { get; set; }\n}',
          ],
        ],
        [
          'Rust — struct',
          [
            '#[derive(Debug, Serialize, Deserialize)]\npub struct RootObject {\n    pub id: i64,\n    pub name: String,\n    pub active: bool,\n    pub roles: Vec<String>,\n    pub company: Company,\n}',
            'use serde::{Deserialize, Serialize};',
            'pub struct Company {\n    pub name: String,\n    pub address: String,\n}',
          ],
        ],
        [
          'Swift — struct',
          [
            'struct RootObject: Codable {\n    let id: Int\n    let name: String\n    let active: Bool\n    let roles: [String]\n    let company: Company\n}',
            'struct Company: Codable {\n    let name: String\n    let address: String\n}',
          ],
        ],
        [
          'Kotlin — data class',
          [
            'data class RootObject(\n    val id: Long,\n    val name: String,\n    val active: Boolean,\n    val roles: List<String>,\n    val company: Company,\n)',
            'data class Company(\n    val name: String,\n    val address: String,\n)',
          ],
        ],
        [
          'Dart — class',
          [
            'class RootObject {',
            '  final List<String> roles;',
            '  final Company company;',
            '  factory RootObject.fromJson(Map<String, dynamic> json) {',
            "      id: json['id'] as int,",
            "      roles: (json['roles'] as List<dynamic>).map((e) => e as String).toList(),",
            "      company: Company.fromJson(json['company'] as Map<String, dynamic>),",
            'class Company {',
          ],
        ],
      ];

      for (const [language, fragments] of expectations) {
        await choose(page, languageSelect(page), language);
        await codeContaining(output, fragments);
      }

      // A key that is not a valid identifier is renamed, and the languages with
      // a way to say so keep pointing the renamed field at the original key.
      await jsonInput(page).fill('{"first-name": "Ada"}');
      const renamed: Array<[language: string, fragment: string]> = [
        ['Go — struct', '\tFirstName string `json:"first-name"`'],
        ['Rust — struct', '    #[serde(rename = "first-name")]\n    pub first_name: String,'],
        ['Swift — struct', '        case firstName = "first-name"'],
        ['Dart — class', "      firstName: json['first-name'] as String,"],
        ['TypeScript', "  'first-name': string;"],
      ];
      for (const [language, fragment] of renamed) {
        await choose(page, languageSelect(page), language);
        await codeContaining(output, [fragment]);
      }
    });

    test('reports invalid JSON, handles a primitive, and clears', async ({ page }) => {
      const output = codeOutput(page);
      const copy = page.getByRole('button', { name: 'Copy Code' });

      // Nothing pasted yet.
      await expect(output).toHaveValue('');
      await expect(banner(page)).toBeHidden();
      await expect(copy).toBeDisabled();

      await jsonInput(page).fill(EXAMPLE_JSON);
      await expect(banner(page)).toHaveText('Valid JSON Format: Object with 5 keys');
      await expect(copy).toBeEnabled();

      // A trailing comma: the error is shown and the stale code is not left to be copied.
      await jsonInput(page).fill('{"id": 1,}');
      await expect(banner(page)).toContainText('Syntax Error:');
      await expect(banner(page)).not.toContainText('Valid JSON Format');
      await expect(output).toHaveValue('');
      await expect(copy).toBeDisabled();

      // A root that is not an object becomes an alias instead of an empty box.
      await jsonInput(page).fill('42');
      await expect(banner(page)).toHaveText('Valid JSON Format: Primitive (number)');
      await expect(output).toHaveValue('export type RootObject = number;');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(jsonInput(page)).toHaveValue('');
      await expect(output).toHaveValue('');
      await expect(banner(page)).toBeHidden();
      await expect(copy).toBeDisabled();
    });

    test('keeps a Swift Codable struct compilable when the JSON holds a null or an empty array', async ({
      page,
    }) => {
      await jsonInput(page).fill('{"id": 1, "deletedAt": null, "tags": []}');
      await choose(page, languageSelect(page), 'Swift — struct');
      const code = await codeContaining(codeOutput(page), ['struct RootObject: Codable {']);

      // `Any` is not Codable, so a struct with an `Any` property does not conform.
      expect(code).not.toMatch(/\bAny\b/);
    });

    test('keeps renamed fields tied to their JSON key in Java, C# and Kotlin', async ({ page }) => {
      await jsonInput(page).fill('{"first-name": "Ada"}');

      for (const language of ['Java — class', 'C# — class', 'Kotlin — data class']) {
        await choose(page, languageSelect(page), language);
        const code = await codeContaining(codeOutput(page), ['RootObject']);
        // Whatever the mapping annotation is, it has to name the original key.
        expect(code, language).toContain('"first-name"');
      }
    });

    test('names the item type of a plural key with a real singular', async ({ page }) => {
      await jsonInput(page).fill(
        '{"companies":[{"id":1}],"addresses":[{"city":"Oslo"}],"categories":[{"slug":"a"}]}'
      );
      const code = await codeContaining(codeOutput(page), ['companies: ']);

      expect(code).not.toMatch(/\b(Companie|Addresse|Categorie)\b/);
    });
  });
});
