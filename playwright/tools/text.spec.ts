import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * End-to-end flows for the text tools: Case Converter, Word Counter, Find and
 * Replace, Regex Tester, Text Diff, List Converter and Lorem Ipsum Generator.
 *
 * Expected values are worked out by hand from what each tool promises, not
 * taken from the implementation.
 */

/**
 * Opens a tool page and waits until it reacts to input.
 *
 * The export ships server-rendered HTML, so the controls are on screen before
 * React owns them, and a click made in that gap does nothing. The tool page
 * records itself as recently used from an effect, which only runs once the
 * page has hydrated.
 */
async function openTool(page: Page, slug: string, name: string) {
  await page.goto(`/tools/${slug}/`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('dev-toolbox:recent') ?? ''))
    .toContain(`"${slug}"`);
}

type Paint = 'none' | 'red' | 'green' | 'yellow' | 'other' | 'unparsed';

/**
 * The text of each element and the colour painted behind it, which is the only
 * way these tools mark a match or a change.
 */
async function paints(elements: Locator): Promise<Array<{ text: string; paint: Paint }>> {
  return elements.evaluateAll((nodes) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('No 2D canvas to resolve colours with');
    }

    return nodes.map((node) => {
      // The canvas turns whatever colour syntax the browser reports into RGBA.
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = 'rgb(1, 2, 3)';
      context.fillStyle = getComputedStyle(node).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;

      let paint: 'none' | 'red' | 'green' | 'yellow' | 'other' | 'unparsed' = 'other';
      if (r === 1 && g === 2 && b === 3) paint = 'unparsed';
      else if (a < 8) paint = 'none';
      else if (r > 150 && g > 150 && b < 130) paint = 'yellow';
      else if (r > g + 60 && r > b + 60) paint = 'red';
      else if (g > r + 60 && g > b + 40) paint = 'green';

      return { text: (node as HTMLElement).innerText.replace(/\u00a0/g, ' '), paint };
    });
  });
}

/** What a paste would give. Windows hands line breaks back as CR LF. */
async function clipboardText(page: Page): Promise<string> {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.replace(/\r\n/g, '\n');
}

/** Makes every copy fail the way a browser without clipboard permission does. */
async function blockClipboard(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as { copyAttempts: number };
    state.copyAttempts = 0;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => {
          state.copyAttempts += 1;
          return Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'));
        },
      },
    });
  });
}

/** Resolves once a blocked copy has been tried and the page has painted again. */
async function blockedCopySettled(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { copyAttempts: number }).copyAttempts))
    .toBe(1);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

async function chooseOption(page: Page, combobox: Locator, option: string) {
  await combobox.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  // The list fades out; until it has gone its options are still on the page.
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(combobox).toHaveText(option);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('Text tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  test.use({ locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] });

  let pageErrors: string[] = [];

  test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
  });

  test.afterEach(() => {
    expect(pageErrors, 'uncaught errors on the page').toEqual([]);
  });

  // ---------------------------------------------------------------------------
  test.describe('Case Converter', () => {
    const CASES = [
      { label: 'camelCase', example: 'helloWorldExample', fox: 'quickBrownFox' },
      { label: 'PascalCase', example: 'HelloWorldExample', fox: 'QuickBrownFox' },
      { label: 'snake_case', example: 'hello_world_example', fox: 'quick_brown_fox' },
      { label: 'kebab-case', example: 'hello-world-example', fox: 'quick-brown-fox' },
      { label: 'UPPERCASE', example: 'HELLO WORLD EXAMPLE', fox: 'QUICK BROWN FOX' },
      { label: 'lowercase', example: 'hello world example', fox: 'quick brown fox' },
      { label: 'Title Case', example: 'Hello World Example', fox: 'Quick Brown Fox' },
      { label: 'Sentence case', example: 'Hello world example', fox: 'Quick brown fox' },
      { label: 'dot.case', example: 'hello.world.example', fox: 'quick.brown.fox' },
      { label: 'CONSTANT_CASE', example: 'HELLO_WORLD_EXAMPLE', fox: 'QUICK_BROWN_FOX' },
    ];

    /**
     * A result card reads, top to bottom: the case name, "Example: ...", the
     * converted text and its Copy button. Nothing ties the converted text to
     * its case name for assistive technology, so the reading order is all
     * there is to assert on.
     */
    const card = (label: string, example: string, result: string, button = 'Copy') =>
      `${label}Example: ${example}${result}${button}`;

    // Each button is named "Copy <case>", so it can be told from the other nine.
    const copyButtons = (page: Page) => page.getByRole('button', { name: /^Copy / });

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'case-converter', 'Case Converter');
    });

    test('converts a phrase into all ten cases', async ({ page }) => {
      const input = page.getByRole('textbox', { name: 'Text to convert' });
      const main = page.getByRole('main');

      // The phrase the tool documents its examples with must give those examples.
      await input.fill('Hello World Example');
      for (const { label, example } of CASES) {
        await expect(main).toContainText(card(label, example, example));
      }

      await input.fill('quick brown fox');
      for (const { label, example, fox } of CASES) {
        await expect(main).toContainText(card(label, example, fox));
      }
      await expect(copyButtons(page)).toHaveCount(10);
    });

    test('re-cases identifiers, sentences, accents and multi-line text', async ({ page }) => {
      const input = page.getByRole('textbox', { name: 'Text to convert' });
      const main = page.getByRole('main');

      // An identifier that mixes an acronym, camel humps, "_" and "-".
      await input.fill('XMLHttpRequest_status-code');
      await expect(main).toContainText(
        card('camelCase', 'helloWorldExample', 'xmlHttpRequestStatusCode')
      );
      await expect(main).toContainText(
        card('PascalCase', 'HelloWorldExample', 'XmlHttpRequestStatusCode')
      );
      await expect(main).toContainText(
        card('snake_case', 'hello_world_example', 'xml_http_request_status_code')
      );
      await expect(main).toContainText(
        card('kebab-case', 'hello-world-example', 'xml-http-request-status-code')
      );
      await expect(main).toContainText(
        card('dot.case', 'hello.world.example', 'xml.http.request.status.code')
      );
      await expect(main).toContainText(
        card('CONSTANT_CASE', 'HELLO_WORLD_EXAMPLE', 'XML_HTTP_REQUEST_STATUS_CODE')
      );
      await expect(main).toContainText(
        card('UPPERCASE', 'HELLO WORLD EXAMPLE', 'XMLHTTPREQUEST_STATUS-CODE')
      );
      await expect(main).toContainText(
        card('lowercase', 'hello world example', 'xmlhttprequest_status-code')
      );

      // Several sentences: each one starts with a capital.
      await input.fill('HELLO THERE. HOW ARE YOU? fine, thanks!');
      await expect(main).toContainText(
        card('Sentence case', 'Hello world example', 'Hello there. How are you? Fine, thanks!')
      );
      await expect(main).toContainText(
        card('Title Case', 'Hello World Example', 'Hello There. How Are You? Fine, Thanks!')
      );
      await expect(main).toContainText(
        card('camelCase', 'helloWorldExample', 'helloThereHowAreYouFineThanks')
      );

      // Leading spaces do not turn the first word into a capitalised one.
      await input.fill('  hello world');
      await expect(main).toContainText(card('camelCase', 'helloWorldExample', 'helloWorld'));
      await expect(main).toContainText(card('PascalCase', 'HelloWorldExample', 'HelloWorld'));

      // Accented letters are letters, not word breaks.
      await input.fill('crème brûlée');
      await expect(main).toContainText(card('camelCase', 'helloWorldExample', 'crèmeBrûlée'));
      await expect(main).toContainText(card('snake_case', 'hello_world_example', 'crème_brûlée'));
      await expect(main).toContainText(card('CONSTANT_CASE', 'HELLO_WORLD_EXAMPLE', 'CRÈME_BRÛLÉE'));
      await expect(main).toContainText(card('Title Case', 'Hello World Example', 'Crème Brûlée'));

      // The prose cases keep line breaks on screen.
      await input.fill('first line\nsecond line');
      const upper = page.getByText(/^FIRST LINE\s+SECOND LINE$/);
      await expect(upper).toBeVisible();
      expect(await upper.innerText()).toBe('FIRST LINE\nSECOND LINE');
    });

    test('shows an empty result for text without words and the empty state when cleared', async ({
      page,
    }) => {
      const input = page.getByRole('textbox', { name: 'Text to convert' });

      await expect(page.getByText('Enter some text above to see conversions')).toBeVisible();
      await expect(copyButtons(page)).toHaveCount(0);

      // Punctuation has no words to join, so the six naming cases are empty
      // and the four prose cases keep the text as it is.
      await input.fill('--- !!!');
      const prose = ['UPPERCASE', 'lowercase', 'Title Case', 'Sentence case'];
      for (const { label, example } of CASES) {
        await expect(page.getByRole('main')).toContainText(
          card(label, example, prose.includes(label) ? '--- !!!' : 'Empty result')
        );
      }
      await expect(page.getByText('Empty result')).toHaveCount(6);
      const buttons = copyButtons(page);
      await expect(buttons).toHaveCount(10);
      await expect(buttons.nth(0)).toBeDisabled(); // camelCase
      await expect(buttons.nth(3)).toBeDisabled(); // kebab-case
      await expect(buttons.nth(4)).toBeEnabled(); // UPPERCASE
      await expect(buttons.nth(9)).toBeDisabled(); // CONSTANT_CASE

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input).toHaveValue('');
      await expect(page.getByText('Enter some text above to see conversions')).toBeVisible();
      await expect(page.getByText('Empty result')).toHaveCount(0);
    });

    test('copies one result and marks only that button as copied', async ({ page }) => {
      await page.getByRole('textbox', { name: 'Text to convert' }).fill('quick brown fox');

      await page.getByRole('button', { name: 'Copy snake_case', exact: true }).click();

      await expect(page.getByRole('button', { name: 'Copied!' })).toHaveCount(1);
      await expect(
        page.getByRole('button', { name: 'Copied! snake_case', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('main')).toContainText(
        'snake_caseExample: hello_world_examplequick_brown_foxCopied!'
      );
      await expect(copyButtons(page)).toHaveCount(9);
      expect(await clipboardText(page)).toBe('quick_brown_fox');
    });

    test('does not claim a copy that the clipboard refused', async ({ page }) => {
      await blockClipboard(page);
      await openTool(page, 'case-converter', 'Case Converter');
      await page.getByRole('textbox', { name: 'Text to convert' }).fill('quick brown fox');

      await copyButtons(page).first().click();
      await blockedCopySettled(page);

      // No false success, and (checked after every test) no uncaught error.
      await expect(page.getByRole('button', { name: 'Copied!' })).toHaveCount(0);
      await expect(copyButtons(page)).toHaveCount(10);
    });

    test('tells the user when the clipboard refused the copy', async ({ page }) => {
      await blockClipboard(page);
      await openTool(page, 'case-converter', 'Case Converter');
      await page.getByRole('textbox', { name: 'Text to convert' }).fill('quick brown fox');

      await copyButtons(page).first().click();
      await blockedCopySettled(page);

      await expect(
        page.getByRole('main').getByText(/fail|could ?n.t|could not|unable|blocked|denied/i)
      ).toBeVisible();
    });

    test('names each Copy button after the case it copies', async ({ page }) => {
      await page.getByRole('textbox', { name: 'Text to convert' }).fill('quick brown fox');
      await expect(page.getByRole('button', { name: /copy/i })).toHaveCount(10);

      for (const { label } of CASES) {
        await expect(
          page.getByRole('button', { name: new RegExp(`[Cc]opy.*${escapeRegExp(label)}`) })
        ).toHaveCount(1);
      }
    });
  });

  // ---------------------------------------------------------------------------
  test.describe('Word Counter', () => {
    const SAMPLE =
      'The quick brown fox jumps over the lazy dog. It barked twice!\n\n' +
      'Second paragraph has 3 numbers: 10, 20 and 30.';

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'word-counter', 'Word Counter');
    });

    test('counts words, characters, sentences, paragraphs and lines', async ({ page }) => {
      const main = page.getByRole('main');

      await page.getByRole('textbox', { name: 'Text to count' }).fill(SAMPLE);

      // 12 + 9 words; 61 + 2 + 46 characters of which 21 are whitespace.
      await expect(main).toContainText(
        'Words21Characters109No Spaces88Sentences3Paragraphs2Lines3'
      );
      // 21 words at 200 wpm = 6.3 s, at 130 wpm = 9.7 s; 83 letters and digits / 21.
      await expect(main).toContainText(
        'Read Time6 secSpeak Time10 secAvg Word Length4.0 charsLongest Wordparagraph'
      );

      // Without "3", "10", "20" and "30": 17 words, 76 letters.
      await page.getByRole('checkbox', { name: 'Count numbers as words' }).click();
      await expect(main).toContainText(
        'Words17Characters109No Spaces88Sentences3Paragraphs2Lines3'
      );
      await expect(main).toContainText(
        'Read Time5 secSpeak Time8 secAvg Word Length4.5 charsLongest Wordparagraph'
      );
    });

    test('formats long texts with thousands separators and minutes', async ({ page }) => {
      const main = page.getByRole('main');
      const words = Array.from({ length: 400 }, () => 'lorem').join(' ');

      await page.getByRole('textbox', { name: 'Text to count' }).fill(words);

      // 400 * 5 letters + 399 spaces.
      await expect(main).toContainText(
        'Words400Characters2,399No Spaces2,000Sentences1Paragraphs1Lines1'
      );
      // 400 / 200 = 2 min; 400 / 130 = 3.077 min = 3 min 5 sec.
      await expect(main).toContainText(
        'Read Time2 minSpeak Time3 min 5 secAvg Word Length5.0 charsLongest Wordlorem'
      );
    });

    test('starts empty, counts an emoji once and ignores bare punctuation', async ({ page }) => {
      const main = page.getByRole('main');
      const input = page.getByRole('textbox', { name: 'Text to count' });
      const zeroCounts = 'Words0Characters0No Spaces0Sentences0Paragraphs0Lines0';
      const zeroInsights = 'Read Time0 secSpeak Time0 secAvg Word Length0.0 charsLongest Word—';

      await expect(main).toContainText(zeroCounts);
      await expect(main).toContainText(zeroInsights);
      await expect(page.getByRole('button', { name: 'Copy Text' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Clear' })).toBeDisabled();

      // A thumbs-up with a skin tone is one character on screen.
      await input.fill('Go \u{1F44D}\u{1F3FD}!');
      await expect(main).toContainText('Words1Characters5No Spaces4Sentences1Paragraphs1Lines1');

      // So is an "e" followed by a combining accent.
      await input.fill('café');
      await expect(main).toContainText('Words1Characters4No Spaces4Sentences1Paragraphs1Lines1');
      // A family (three people joined into one emoji) and a flag: two characters.
      await input.fill('\u{1F468}‍\u{1F469}‍\u{1F467} \u{1F1E9}\u{1F1EA}');
      await expect(main).toContainText('Words0Characters3No Spaces2Sentences0Paragraphs1Lines1');

      await input.fill('...');
      await expect(main).toContainText('Words0Characters3No Spaces3Sentences0Paragraphs1Lines1');
      await expect(main).toContainText(zeroInsights);

      // A single letter is a sentence; a sentence can end inside a quote; and
      // a full-width full stop ends one without a space after it.
      await input.fill('A');
      await expect(main).toContainText('Words1Characters1No Spaces1Sentences1Paragraphs1Lines1');
      await input.fill('He said "Stop." Then he left.');
      await expect(main).toContainText('Words6Characters29No Spaces24Sentences2Paragraphs1Lines1');
      await input.fill('こんにちは。さようなら。');
      await expect(main).toContainText('Words2Characters12No Spaces12Sentences2Paragraphs1Lines1');

      await input.fill('One two.');
      await page.getByRole('button', { name: 'Copy Text' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await clipboardText(page)).toBe('One two.');
      // The button goes back to its label a couple of seconds later.
      await expect(page.getByRole('button', { name: 'Copy Text' })).toBeVisible();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input).toHaveValue('');
      await expect(main).toContainText(zeroCounts);
    });

    test('counts a decimal, a price, an e-mail address and a URL as one word each', async ({
      page,
    }) => {
      const main = page.getByRole('main');
      const input = page.getByRole('textbox', { name: 'Text to count' });

      // Pi | is | 3.14 | and | costs | $1,299.99
      await input.fill('Pi is 3.14 and costs $1,299.99');
      await expect(main).toContainText('Words6Characters30');

      // Mail | ada@example.com | or | visit | https://example.com/docs | today
      await input.fill('Mail ada@example.com or visit https://example.com/docs today');
      await expect(main).toContainText('Words6Characters60');
    });
  });

  // ---------------------------------------------------------------------------
  test.describe('Find and Replace', () => {
    test.beforeEach(async ({ page }) => {
      await openTool(page, 'find-replace', 'Find and Replace');
    });

    test('replaces literal text and follows the case, first-only and apply options', async ({
      page,
    }) => {
      const input = page.getByRole('textbox', { name: 'Input text' });
      const result = page.getByRole('textbox', { name: 'Result' });

      await input.fill('The cat sat on the mat. The Cat ran.');
      await page.getByRole('textbox', { name: 'Find', exact: true }).fill('cat');
      await page.getByRole('textbox', { name: 'Replace With' }).fill('dog');

      // Not case sensitive by default, and every match is replaced.
      await expect(page.getByText('Matches: 2')).toBeVisible();
      await expect(page.getByText('Replacements: 2')).toBeVisible();
      await expect(page.getByText('Output chars: 36')).toBeVisible();
      await expect(result).toHaveValue('The dog sat on the mat. The dog ran.');
      await expect(page.getByText('Matched text is highlighted below.')).toBeVisible();
      expect(await paints(page.getByText('cat', { exact: true }))).toEqual([
        { text: 'cat', paint: 'yellow' },
      ]);
      expect(await paints(page.getByText('Cat', { exact: true }))).toEqual([
        { text: 'Cat', paint: 'yellow' },
      ]);

      await page.getByRole('checkbox', { name: 'Case sensitive' }).click();
      await expect(page.getByText('Matches: 1')).toBeVisible();
      await expect(page.getByText('Replacements: 1')).toBeVisible();
      await expect(result).toHaveValue('The dog sat on the mat. The Cat ran.');
      await page.getByRole('checkbox', { name: 'Case sensitive' }).click();

      // First match only: both are still found, one is replaced.
      await page.getByRole('checkbox', { name: 'Replace all' }).click();
      await expect(page.getByText('Matches: 2')).toBeVisible();
      await expect(page.getByText('Replacements: 1')).toBeVisible();
      await expect(result).toHaveValue('The dog sat on the mat. The Cat ran.');

      // Applying moves the result into the input, where one "Cat" is left.
      await page.getByRole('button', { name: 'Apply to Input' }).click();
      await expect(input).toHaveValue('The dog sat on the mat. The Cat ran.');
      await expect(page.getByText('Matches: 1')).toBeVisible();
      await expect(result).toHaveValue('The dog sat on the mat. The dog ran.');

      await page.getByRole('button', { name: 'Apply to Input' }).click();
      await expect(input).toHaveValue('The dog sat on the mat. The dog ran.');
      await expect(page.getByText('Matches: 0')).toBeVisible();
      await expect(page.getByText('No matches found in the current input.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Apply to Input' })).toBeDisabled();
    });

    test('matches whole words, regex groups and literal special characters', async ({ page }) => {
      const input = page.getByRole('textbox', { name: 'Input text' });
      const find = page.getByRole('textbox', { name: 'Find', exact: true });
      const replace = page.getByRole('textbox', { name: 'Replace With' });
      const result = page.getByRole('textbox', { name: 'Result' });

      // Whole word skips "concatenate", and knows that "é" and "s" are letters.
      await input.fill('cat concatenate cat. Un café noir, deux cafés.');
      await find.fill('cat');
      await replace.fill('dog');
      await expect(page.getByText('Matches: 3')).toBeVisible();
      await page.getByRole('checkbox', { name: 'Whole word' }).click();
      await expect(page.getByText('Matches: 2')).toBeVisible();
      await expect(result).toHaveValue('dog concatenate dog. Un café noir, deux cafés.');

      await find.fill('café');
      await replace.fill('thé');
      await expect(page.getByText('Matches: 1')).toBeVisible();
      await expect(result).toHaveValue('cat concatenate cat. Un thé noir, deux cafés.');

      // "caf" is not a word of its own in "café" or "cafés".
      await find.fill('caf');
      await expect(page.getByText('Matches: 0')).toBeVisible();
      await expect(result).toHaveValue('cat concatenate cat. Un café noir, deux cafés.');
      await page.getByRole('checkbox', { name: 'Whole word' }).click();
      await expect(page.getByText('Matches: 2')).toBeVisible();

      // Regex with capture groups: ISO dates to day/month/year.
      await input.fill('Due 2026-05-03 and 2027-12-31.');
      await page.getByRole('checkbox', { name: 'Use regex' }).click();
      await expect(find).toHaveAttribute('placeholder', 'Enter regex pattern...');
      await find.fill('(\\d{4})-(\\d{2})-(\\d{2})');
      await replace.fill('$3/$2/$1');
      await expect(page.getByText('Matches: 2')).toBeVisible();
      await expect(result).toHaveValue('Due 03/05/2026 and 31/12/2027.');

      // The same search as plain text finds nothing and changes nothing.
      await page.getByRole('checkbox', { name: 'Use regex' }).click();
      await expect(page.getByText('Matches: 0')).toBeVisible();
      await expect(page.getByText('No matches found in the current input.')).toBeVisible();
      await expect(result).toHaveValue('Due 2026-05-03 and 2027-12-31.');

      // Plain text: ".", "$" and "$&" mean themselves.
      await input.fill('Price: $5.00 (was $6.00, not $5x00)');
      await find.fill('$5.00');
      await replace.fill('$&');
      await expect(page.getByText('Matches: 1')).toBeVisible();
      await expect(result).toHaveValue('Price: $& (was $6.00, not $5x00)');

      // The output length is in characters as read: one emoji is one.
      await input.fill('ok');
      await find.fill('ok');
      await replace.fill('\u{1F44D}\u{1F3FD}');
      await expect(result).toHaveValue('\u{1F44D}\u{1F3FD}');
      await expect(page.getByText('Output chars: 1')).toBeVisible();
    });

    test('reports an invalid regex, leaves the text alone and clears everything', async ({
      page,
    }) => {
      const input = page.getByRole('textbox', { name: 'Input text' });
      const find = page.getByRole('textbox', { name: 'Find', exact: true });
      const result = page.getByRole('textbox', { name: 'Result' });

      await expect(page.getByText('Enter a search value to highlight matches.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Copy Result' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Apply to Input' })).toBeDisabled();

      await input.fill('a (b) c');
      await page.getByRole('checkbox', { name: 'Use regex' }).click();
      await find.fill('(');

      await expect(page.getByText(/Error:.*Unterminated group/)).toBeVisible();
      await expect(page.getByText('Matches: 0')).toBeVisible();
      await expect(page.getByText('Replacements: 0')).toBeVisible();
      await expect(result).toHaveValue('a (b) c');
      await expect(page.getByRole('button', { name: 'Apply to Input' })).toBeDisabled();

      // Completing the pattern clears the error.
      await find.fill('\\((\\w)\\)');
      await page.getByRole('textbox', { name: 'Replace With' }).fill('[$1]');
      await expect(page.getByText('Error:')).toHaveCount(0);
      await expect(result).toHaveValue('a [b] c');

      await page.getByRole('button', { name: 'Copy Result' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await clipboardText(page)).toBe('a [b] c');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input).toHaveValue('');
      await expect(find).toHaveValue('');
      await expect(page.getByRole('textbox', { name: 'Replace With' })).toHaveValue('');
      await expect(result).toHaveValue('');
      await expect(page.getByRole('checkbox', { name: 'Use regex' })).not.toBeChecked();
      await expect(page.getByRole('checkbox', { name: 'Replace all' })).toBeChecked();
      await expect(page.getByText('Enter a search value to highlight matches.')).toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  test.describe('Regex Tester', () => {
    test.beforeEach(async ({ page }) => {
      await openTool(page, 'regex-tester', 'Regex Tester');
    });

    test('lists matches with their index and capture groups and follows the flags', async ({
      page,
    }) => {
      const main = page.getByRole('main');
      const pattern = page.getByRole('textbox', { name: 'Regex pattern' });
      const text = page.getByRole('textbox', { name: 'Test string' });

      await pattern.fill('(\\w+)@(\\w+)\\.com');
      await text.fill('Contact ada@example.com or bob@test.com today');

      await expect(page.getByText('Matches (2)')).toBeVisible();
      await expect(page.getByText('Found 2 matches')).toBeVisible();
      // "Contact " is 8 characters; the second address starts 19 further on.
      await expect(main).toContainText(
        'Match 1Index: 8ada@example.comCapture GroupsGroup 1: adaGroup 2: example'
      );
      await expect(main).toContainText(
        'Match 2Index: 27bob@test.comCapture GroupsGroup 1: bobGroup 2: test'
      );
      // The preview comes first on the page and paints the match.
      expect(await paints(page.getByText('ada@example.com', { exact: true }).first())).toEqual([
        { text: 'ada@example.com', paint: 'yellow' },
      ]);
      expect(await paints(page.getByText('Contact', { exact: true }))).toEqual([
        { text: 'Contact ', paint: 'none' },
      ]);

      // Without the global flag only the first match is reported.
      await expect(main).toContainText('//gGuided recipe');
      await page.getByRole('checkbox', { name: 'Global (g)' }).click();
      await expect(page.getByText('Matches (1)')).toBeVisible();
      await expect(page.getByText('Found 1 match', { exact: true })).toBeVisible();
      await expect(page.getByText('Match 2')).toHaveCount(0);
      await page.getByRole('checkbox', { name: 'Global (g)' }).click();

      await pattern.fill('hello');
      await text.fill('Hello HELLO hello');
      await expect(page.getByText('Matches (1)')).toBeVisible();
      await expect(page.getByText('Index: 12')).toBeVisible();
      // The flag's label text toggles it too.
      await page.getByText('Case Insensitive (i)').click();
      await expect(page.getByRole('checkbox', { name: 'Case Insensitive (i)' })).toBeChecked();
      await expect(page.getByText('Matches (3)')).toBeVisible();
      await expect(main).toContainText('//giGuided recipe');

      await pattern.fill('^\\w+');
      await text.fill('one\ntwo\nthree');
      await expect(page.getByText('Matches (1)')).toBeVisible();
      await page.getByRole('checkbox', { name: 'Multiline (m)' }).click();
      await expect(page.getByText('Matches (3)')).toBeVisible();
      await expect(main).toContainText('//gmiGuided recipe');

      // The dot stops at a line break unless Dot All is on.
      await pattern.fill('one.two');
      await expect(page.getByText('Matches (0)')).toBeVisible();
      await expect(page.getByText('No matches found')).toBeVisible();
      await page.getByRole('checkbox', { name: 'Dot All (s)' }).click();
      await expect(page.getByText('Matches (1)')).toBeVisible();
      await expect(page.getByText('Any character, including newline')).toBeVisible();
    });

    test('reports an invalid pattern and survives patterns that match nothing', async ({
      page,
    }) => {
      const pattern = page.getByRole('textbox', { name: 'Regex pattern' });
      const text = page.getByRole('textbox', { name: 'Test string' });

      await text.fill('a\u{1F600}b');
      await pattern.fill('(');
      await expect(page.getByText(/Error:.*Unterminated group/)).toBeVisible();
      await expect(pattern).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByText('Pattern Explanation')).toHaveCount(0);
      await expect(page.getByText(/^Matches \(/)).toHaveCount(0);

      // An empty match at every position: before "a", the emoji, "b" and at
      // the end. With the Unicode flag the emoji is one position, without it
      // its two halves are one each. This combination used to hang the page.
      await pattern.fill('x*');
      await expect(page.getByText('Error:')).toHaveCount(0);
      await expect(pattern).toHaveAttribute('aria-invalid', 'false');
      await expect(page.getByText('Matches (5)')).toBeVisible();
      await page.getByRole('checkbox', { name: 'Unicode (u)' }).click();
      await expect(page.getByText('Matches (4)')).toBeVisible();
      await expect(page.getByText('Found 4 matches')).toBeVisible();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(pattern).toHaveValue('');
      await expect(text).toHaveValue('');
      await expect(page.getByText(/^Matches \(/)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Copy pattern' })).toBeDisabled();
    });

    test('builds a pattern from tokens, explains it and copies it', async ({ page }) => {
      const main = page.getByRole('main');
      const pattern = page.getByRole('textbox', { name: 'Regex pattern' });

      await page.getByRole('button', { name: 'Digit (\\d)', exact: true }).click();
      await page.getByRole('button', { name: 'One or more (+)', exact: true }).click();
      await expect(pattern).toHaveValue('\\d+');

      await expect(page.getByText('Pattern Explanation')).toBeVisible();
      await expect(main).toContainText(
        '\\dCharacter ClassAny digit character (0-9)+QuantifierRepeat preceding element 1 or more times'
      );

      await page.getByRole('textbox', { name: 'Test string' }).fill('a1b22c333');
      await expect(page.getByText('Matches (3)')).toBeVisible();
      await expect(main).toContainText('Match 1Index: 11');
      await expect(main).toContainText('Match 2Index: 322');
      await expect(main).toContainText('Match 3Index: 6333');

      await page.getByRole('button', { name: 'Copy pattern' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await clipboardText(page)).toBe('\\d+');
    });

    test('explains lookbehinds, backreferences, bracket sets and literal braces', async ({
      page,
    }) => {
      const main = page.getByRole('main');

      // Not after "a": "b" twice, then "]" or "c" one or more times, then "d{e}".
      await page.getByRole('textbox', { name: 'Regex pattern' }).fill('(?<!a)(b)\\1[\\]c]+d{e}');
      await page.getByRole('textbox', { name: 'Test string' }).fill('bb]cd{e} abb]cd{e}');

      await expect(page.getByText('Error:')).toHaveCount(0);
      await expect(page.getByText('Matches (1)')).toBeVisible();
      await expect(main).toContainText('Match 1Index: 0bb]cd{e}Capture GroupsGroup 1: b');

      await expect(page.getByText('Pattern Explanation')).toBeVisible();
      // Each row reads: token, category, description.
      await expect(main).toContainText(/\(\?<!Group[\w ]*negative lookbehind/);
      await expect(main).toContainText(/\\1Group\s*Backreference/);
      await expect(main).toContainText('[\\]c]Character Class');
      await expect(main).toContainText('{LiteralLiteral character "{"');
      await expect(main).not.toContainText('{e}Quantifier');

      // An emoji in the pattern is one literal, not two halves.
      await page.getByRole('textbox', { name: 'Regex pattern' }).fill('\u{1F600}');
      await page.getByRole('textbox', { name: 'Test string' }).fill('a\u{1F600}b');
      await expect(page.getByText('Matches (1)')).toBeVisible();
      await expect(main).toContainText('\u{1F600}LiteralLiteral character "\u{1F600}"');
      await expect(main).toContainText('Match 1Index: 1\u{1F600}');
    });

    test('loads every guided recipe with a sample it matches', async ({ page }) => {
      const pattern = page.getByRole('textbox', { name: 'Regex pattern' });
      const text = page.getByRole('textbox', { name: 'Test string' });
      const recipe = page.getByRole('combobox', { name: 'Guided recipe' });

      await expect(recipe).toHaveText('Start from a common pattern...');

      const samples = [
        ['Email address', 'ada@example.com'],
        ['HTTP / HTTPS URL', 'https://example.com/docs?id=1'],
        ['International phone', '+14155550123'],
        ['ISO date', '2026-05-03'],
        ['Strong password check', 'Stronger123'],
        ['8-char hex token', 'DEADBEEF'],
      ];
      for (const [label, sample] of samples) {
        await chooseOption(page, recipe, label);
        await expect(text).toHaveValue(sample);
        await expect(pattern).not.toHaveValue('');
        await expect(page.getByText('Matches (1)')).toBeVisible();
        await expect(page.getByText('Found 1 match', { exact: true })).toBeVisible();
      }

      await chooseOption(page, recipe, 'ISO date');
      await expect(pattern).toHaveValue('^\\d{4}-\\d{2}-\\d{2}$');
      await expect(page.getByText('Repeat preceding element: exactly 4 times')).toBeVisible();

      // A sample that is not a date no longer matches.
      await text.fill('03/05/2026');
      await expect(page.getByText('Matches (0)')).toBeVisible();

      // Once the pattern is edited it is no longer that recipe.
      await page.getByRole('button', { name: 'Digit (\\d)', exact: true }).click();
      await expect(pattern).toHaveValue('^\\d{4}-\\d{2}-\\d{2}$\\d');
      await expect(recipe).toHaveText('Start from a common pattern...');
    });

    test('picks a guided recipe with the keyboard', async ({ page }) => {
      const recipe = page.getByRole('combobox', { name: 'Guided recipe' });

      await recipe.focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: 'Email address' })).toBeVisible();
      await expect(page.getByRole('option')).toHaveCount(6);

      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');

      await expect(page.getByRole('option')).toHaveCount(0);
      await expect(recipe).toHaveText('HTTP / HTTPS URL');
      await expect(page.getByRole('textbox', { name: 'Test string' })).toHaveValue(
        'https://example.com/docs?id=1'
      );
      await expect(page.getByText('Matches (1)')).toBeVisible();
    });

    test('exposes the recipe choices as a listbox', async ({ page }) => {
      await page.getByRole('combobox', { name: 'Guided recipe' }).click();
      await expect(page.getByRole('option')).toHaveCount(6);

      await expect(page.getByRole('listbox')).toBeVisible();
      await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(6);
    });
  });

  // ---------------------------------------------------------------------------
  test.describe('Text Diff', () => {
    /**
     * The lines of the "Original" or "Modified" column. The columns have no
     * role or accessible name, so the only handle is the caption above them.
     */
    const column = (page: Page, caption: 'Original' | 'Modified') =>
      page.getByText(caption, { exact: true }).locator('xpath=following-sibling::div[1]');

    const rows = (page: Page, caption: 'Original' | 'Modified') =>
      paints(column(page, caption).locator('xpath=./div'));

    const pressed = (page: Page, name: string) =>
      page.getByRole('button', { name, exact: true, pressed: true });

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'text-diff', 'Text Diff Visualizer');
    });

    test('lines up changed, added and unchanged lines side by side and inline', async ({
      page,
    }) => {
      // The second line is indented: the columns must keep the leading spaces.
      await page.getByRole('textbox', { name: 'Original text' }).fill('alpha\n  beta\ngamma\n');
      await page
        .getByRole('textbox', { name: 'Modified text' })
        .fill('alpha\n  BETA\ngamma\ndelta\n');

      await expect(pressed(page, 'Lines')).toBeVisible();
      await expect(pressed(page, 'Side by Side')).toBeVisible();
      await expect(page.getByText('Side-by-side comparison')).toBeVisible();

      // Removed lines sit beside a grey gap on the right, added ones beside a
      // gap on the left.
      expect(await rows(page, 'Original')).toEqual([
        { text: 'alpha', paint: 'none' },
        { text: '  beta', paint: 'red' },
        { text: ' ', paint: 'other' },
        { text: 'gamma', paint: 'none' },
        { text: ' ', paint: 'other' },
      ]);
      expect(await rows(page, 'Modified')).toEqual([
        { text: 'alpha', paint: 'none' },
        { text: ' ', paint: 'other' },
        { text: '  BETA', paint: 'green' },
        { text: 'gamma', paint: 'none' },
        { text: 'delta', paint: 'green' },
      ]);

      await page.getByRole('button', { name: 'Inline', exact: true }).click();
      await expect(pressed(page, 'Inline')).toBeVisible();
      await expect(page.getByText('Inline comparison')).toBeVisible();
      await expect(page.getByText('Original', { exact: true })).toHaveCount(0);

      const inline = async (line: string) =>
        (await paints(page.getByText(line, { exact: true }))).map(({ paint }) => paint);
      expect(await inline('alpha')).toEqual(['none']);
      expect(await inline('beta')).toEqual(['red']);
      expect(await inline('BETA')).toEqual(['green']);
      expect(await inline('gamma')).toEqual(['none']);
      expect(await inline('delta')).toEqual(['green']);
    });

    test('marks changed words inside a line', async ({ page }) => {
      await page.getByRole('textbox', { name: 'Original text' }).fill('the quick brown fox');
      await page.getByRole('textbox', { name: 'Modified text' }).fill('the slow brown dog');
      await page.getByRole('button', { name: 'Words', exact: true }).click();
      await expect(pressed(page, 'Words')).toBeVisible();

      // Each column keeps its own sentence whole and marks only its own words.
      await expect(column(page, 'Original')).toHaveText('the quick brown fox');
      await expect(column(page, 'Modified')).toHaveText('the slow brown dog');
      expect(await paints(column(page, 'Original').locator('span'))).toEqual([
        { text: 'the ', paint: 'none' },
        { text: 'quick', paint: 'red' },
        { text: ' brown ', paint: 'none' },
        { text: 'fox', paint: 'red' },
      ]);
      expect(await paints(column(page, 'Modified').locator('span'))).toEqual([
        { text: 'the ', paint: 'none' },
        { text: 'slow', paint: 'green' },
        { text: ' brown ', paint: 'none' },
        { text: 'dog', paint: 'green' },
      ]);

      await page.getByRole('button', { name: 'Inline', exact: true }).click();
      await expect(page.getByRole('main')).toContainText('the quickslow brown foxdog');
      expect(await paints(page.getByText('quick', { exact: true }))).toEqual([
        { text: 'quick', paint: 'red' },
      ]);
      expect(await paints(page.getByText('slow', { exact: true }))).toEqual([
        { text: 'slow', paint: 'green' },
      ]);

      // A change on one line leaves the line breaks around it where they were.
      await page.getByRole('button', { name: 'Side by Side', exact: true }).click();
      await page.getByRole('textbox', { name: 'Original text' }).fill('one two\nthree four');
      await page.getByRole('textbox', { name: 'Modified text' }).fill('one 2\nthree four');
      await expect(column(page, 'Modified')).toContainText('one 2');
      expect(await column(page, 'Original').innerText()).toBe('one two\nthree four');
      expect(await column(page, 'Modified').innerText()).toBe('one 2\nthree four');
    });

    test('shows a changed last line in both columns', async ({ page }) => {
      // Neither text ends with a line break, as typed text rarely does.
      await page.getByRole('textbox', { name: 'Original text' }).fill('hello\nworld');
      await page.getByRole('textbox', { name: 'Modified text' }).fill('hello\nthere');
      await expect(page.getByText('Side-by-side comparison')).toBeVisible();

      expect(await rows(page, 'Original')).toEqual([
        { text: 'hello', paint: 'none' },
        { text: 'world', paint: 'red' },
        { text: ' ', paint: 'other' },
      ]);
      expect(await rows(page, 'Modified')).toEqual([
        { text: 'hello', paint: 'none' },
        { text: ' ', paint: 'other' },
        { text: 'there', paint: 'green' },
      ]);
    });

    test('puts a removed and an added last line on separate lines in the inline view', async ({
      page,
    }) => {
      await page.getByRole('textbox', { name: 'Original text' }).fill('hello\nworld');
      await page.getByRole('textbox', { name: 'Modified text' }).fill('hello\nthere');
      await page.getByRole('button', { name: 'Inline', exact: true }).click();
      await expect(page.getByText('Inline comparison')).toBeVisible();

      const removed = page.getByText('world', { exact: true });
      const added = page.getByText('there', { exact: true });
      // The removed part carries the line break that keeps the added part below it.
      const trimmed = async (locator: typeof removed) =>
        (await paints(locator)).map((part) => ({ ...part, text: part.text.trimEnd() }));
      expect(await trimmed(removed)).toEqual([{ text: 'world', paint: 'red' }]);
      expect(await trimmed(added)).toEqual([{ text: 'there', paint: 'green' }]);

      const removedBox = await removed.boundingBox();
      const addedBox = await added.boundingBox();
      expect(removedBox).not.toBeNull();
      expect(addedBox).not.toBeNull();
      // "there" belongs on the line below "world", not right after it.
      expect(addedBox!.y).toBeGreaterThanOrEqual(removedBox!.y + removedBox!.height);
    });

    test('says when there is nothing to compare or nothing different', async ({ page }) => {
      const original = page.getByRole('textbox', { name: 'Original text' });
      const modified = page.getByRole('textbox', { name: 'Modified text' });

      await expect(page.getByText('Enter text in both fields to see the diff')).toBeVisible();
      expect(await rows(page, 'Original')).toEqual([]);

      await original.fill('same\ntext');
      await modified.fill('same\ntext');
      await expect(page.getByText('No differences found', { exact: true })).toBeVisible();
      expect(await rows(page, 'Modified')).toEqual([
        { text: 'same', paint: 'none' },
        { text: 'text', paint: 'none' },
      ]);

      // Only the spacing differs: a change by line, not by word.
      await modified.fill('same\n  text');
      await expect(page.getByText('Side-by-side comparison')).toBeVisible();
      await page.getByRole('button', { name: 'Words', exact: true }).click();
      await expect(
        page.getByText('No differences found (the word diff ignores whitespace)')
      ).toBeVisible();
      await page.getByRole('button', { name: 'Lines', exact: true }).click();

      // One side empty: everything on the other side is removed.
      await modified.fill('');
      expect(await rows(page, 'Original')).toEqual([
        { text: 'same', paint: 'red' },
        { text: 'text', paint: 'red' },
      ]);
      expect(await rows(page, 'Modified')).toEqual([
        { text: ' ', paint: 'other' },
        { text: ' ', paint: 'other' },
      ]);

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(original).toHaveValue('');
      await expect(modified).toHaveValue('');
      await expect(page.getByText('Enter text in both fields to see the diff')).toBeVisible();
    });

    test('keeps the last line unchanged when a line is added after it', async ({ page }) => {
      // Typed text rarely ends with a line break.
      await page.getByRole('textbox', { name: 'Original text' }).fill('alpha\nbeta');
      await page.getByRole('textbox', { name: 'Modified text' }).fill('alpha\nbeta\ngamma');
      await expect(page.getByText('Side-by-side comparison')).toBeVisible();

      expect(await rows(page, 'Original')).toEqual([
        { text: 'alpha', paint: 'none' },
        { text: 'beta', paint: 'none' },
        { text: ' ', paint: 'other' },
      ]);
      expect(await rows(page, 'Modified')).toEqual([
        { text: 'alpha', paint: 'none' },
        { text: 'beta', paint: 'none' },
        { text: 'gamma', paint: 'green' },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  test.describe('List Converter', () => {
    const output = (page: Page, name: string) => page.getByRole('textbox', { name });

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'list-converter', 'List Converter');
    });

    test('writes a list out in every format', async ({ page }) => {
      await page.getByRole('textbox', { name: 'List items' }).fill('apple\nbanana\ncherry');

      await expect(page.getByText('Items count: 3')).toBeVisible();
      await expect(output(page, 'Comma-separated output')).toHaveValue('apple, banana, cherry');
      await expect(output(page, 'Single-quoted output')).toHaveValue(
        "'apple', 'banana', 'cherry'"
      );
      await expect(output(page, 'Double-quoted output')).toHaveValue(
        '"apple", "banana", "cherry"'
      );
      await expect(output(page, 'JSON array output')).toHaveValue(
        '[\n  "apple",\n  "banana",\n  "cherry"\n]'
      );
      await expect(output(page, 'SQL IN clause output')).toHaveValue(
        "IN ('apple', 'banana', 'cherry')"
      );
      await expect(output(page, 'Custom delimited output')).toHaveValue('apple|banana|cherry');

      await page.getByRole('textbox', { name: 'Output delimiter' }).fill(' - ');
      await expect(output(page, 'Custom delimited output')).toHaveValue('apple - banana - cherry');

      await page.getByRole('button', { name: 'Copy SQL IN Clause', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toHaveCount(1);
      expect(await clipboardText(page)).toBe("IN ('apple', 'banana', 'cherry')");
    });

    test('splits on the chosen delimiter and cleans, sorts and re-cases the items', async ({
      page,
    }) => {
      const input = page.getByRole('textbox', { name: 'List items' });
      const csv = output(page, 'Comma-separated output');
      const delimiter = page.getByRole('combobox', { name: 'Input Delimiter' });

      // One line is one item until the comma is chosen.
      await input.fill(' pear , Apple,,apple, banana ');
      await expect(page.getByText('Items count: 1')).toBeVisible();
      await chooseOption(page, delimiter, 'Comma (,)');
      await expect(page.getByText('Items count: 4')).toBeVisible();
      await expect(csv).toHaveValue('pear, Apple, apple, banana');

      // "Apple" and "apple" are different until the case is unified.
      await page.getByRole('checkbox', { name: 'Remove Duplicates' }).click();
      await expect(page.getByText('Items count: 4')).toBeVisible();
      await chooseOption(page, page.getByRole('combobox', { name: 'Case conversion' }), 'lowercase');
      await expect(page.getByText('Items count: 3')).toBeVisible();
      await expect(csv).toHaveValue('pear, apple, banana');

      await chooseOption(page, page.getByRole('combobox', { name: 'Sorting' }), 'A - Z');
      await expect(csv).toHaveValue('apple, banana, pear');
      await chooseOption(page, page.getByRole('combobox', { name: 'Sorting' }), 'Z - A');
      await expect(csv).toHaveValue('pear, banana, apple');
      await chooseOption(page, page.getByRole('combobox', { name: 'Case conversion' }), 'UPPERCASE');
      await expect(csv).toHaveValue('PEAR, BANANA, APPLE');

      // Back to the raw items: untrimmed, then with the empty one kept.
      await chooseOption(page, page.getByRole('combobox', { name: 'Sorting' }), 'None');
      await chooseOption(page, page.getByRole('combobox', { name: 'Case conversion' }), 'None');
      await page.getByRole('checkbox', { name: 'Remove Duplicates' }).click();
      await page.getByRole('checkbox', { name: 'Trim Whitespace' }).click();
      await expect(output(page, 'Double-quoted output')).toHaveValue(
        '" pear ", " Apple", "apple", " banana "'
      );
      await page.getByRole('checkbox', { name: 'Remove Empty Items' }).click();
      await expect(page.getByText('Items count: 5')).toBeVisible();
      await expect(output(page, 'Double-quoted output')).toHaveValue(
        '" pear ", " Apple", "", "apple", " banana "'
      );

      await input.fill('a;b;c');
      await chooseOption(page, delimiter, 'Semicolon (;)');
      await expect(csv).toHaveValue('a, b, c');

      await input.fill('x\ty\tz');
      await chooseOption(page, delimiter, 'Tab');
      await expect(csv).toHaveValue('x, y, z');

      // A custom delimiter splits nothing until it has been typed.
      await input.fill('one::two::three');
      await chooseOption(page, delimiter, 'Custom Character');
      await expect(page.getByText('Items count: 1')).toBeVisible();
      await page.getByRole('textbox', { name: 'Custom input delimiter' }).fill('::');
      await expect(page.getByText('Items count: 3')).toBeVisible();
      await expect(csv).toHaveValue('one, two, three');

      await chooseOption(page, delimiter, 'Newline (Line-break)');
      await expect(page.getByRole('textbox', { name: 'Custom input delimiter' })).toHaveCount(0);
      await expect(page.getByText('Items count: 1')).toBeVisible();
    });

    test('escapes quotes and backslashes for each format', async ({ page }) => {
      await page
        .getByRole('textbox', { name: 'List items' })
        .fill('O\'Brien\nsay "hi"\nC:\\new');

      await expect(page.getByText('Items count: 3')).toBeVisible();
      await expect(output(page, 'Single-quoted output')).toHaveValue(
        "'O\\'Brien', 'say \"hi\"', 'C:\\\\new'"
      );
      await expect(output(page, 'Double-quoted output')).toHaveValue(
        '"O\'Brien", "say \\"hi\\"", "C:\\\\new"'
      );
      await expect(output(page, 'JSON array output')).toHaveValue(
        '[\n  "O\'Brien",\n  "say \\"hi\\"",\n  "C:\\\\new"\n]'
      );
      // SQL doubles the quote and leaves the backslash alone.
      await expect(output(page, 'SQL IN clause output')).toHaveValue(
        "IN ('O''Brien', 'say \"hi\"', 'C:\\new')"
      );
      await expect(output(page, 'Custom delimited output')).toHaveValue(
        'O\'Brien|say "hi"|C:\\new'
      );

      // Split on commas, the second item spans two lines: the quoted formats
      // write the line break as an escape instead of breaking the literal.
      await page.getByRole('textbox', { name: 'List items' }).fill('a,b\nc');
      await chooseOption(page, page.getByRole('combobox', { name: 'Input Delimiter' }), 'Comma (,)');
      await expect(page.getByText('Items count: 2')).toBeVisible();
      await expect(output(page, 'Single-quoted output')).toHaveValue("'a', 'b\\nc'");
      await expect(output(page, 'Double-quoted output')).toHaveValue('"a", "b\\nc"');
      await expect(output(page, 'JSON array output')).toHaveValue('[\n  "a",\n  "b\\nc"\n]');
    });

    test('shows the empty state for no input and for input with no items', async ({ page }) => {
      const input = page.getByRole('textbox', { name: 'List items' });
      const emptyState = page.getByText('Enter list items above to see converted formats');

      await expect(emptyState).toBeVisible();
      await expect(page.getByText('Items count: 0')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Clear' })).toBeDisabled();
      await expect(output(page, 'Comma-separated output')).toHaveCount(0);

      // Blank lines only: trimmed and removed, so still nothing to convert.
      await input.fill('   \n  \n');
      await expect(emptyState).toBeVisible();
      await expect(page.getByText('Items count: 0')).toBeVisible();

      await input.fill('solo');
      await expect(emptyState).toHaveCount(0);
      await expect(output(page, 'JSON array output')).toHaveValue('[\n  "solo"\n]');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input).toHaveValue('');
      await expect(emptyState).toBeVisible();
    });

    test('quotes an item that contains a comma in the CSV output', async ({ page }) => {
      await page.getByRole('textbox', { name: 'List items' }).fill('Doe, Jane\nSmith, John');

      await expect(page.getByText('Items count: 2')).toBeVisible();
      // Unquoted, the two names would read back as four fields.
      await expect(output(page, 'Comma-separated output')).toHaveValue(
        '"Doe, Jane", "Smith, John"'
      );
    });

    test('names each Copy button after the format it copies', async ({ page }) => {
      await page.getByRole('textbox', { name: 'List items' }).fill('apple\nbanana');
      await expect(page.getByRole('button', { name: /copy/i })).toHaveCount(6);

      const formats = [
        /copy.*(csv|comma)/i,
        /copy.*single/i,
        /copy.*double/i,
        /copy.*json/i,
        /copy.*sql/i,
        /copy.*custom/i,
      ];
      for (const format of formats) {
        await expect(page.getByRole('button', { name: format })).toHaveCount(1);
      }
    });
  });

  // ---------------------------------------------------------------------------
  test.describe('Lorem Ipsum Generator', () => {
    const OPENING = 'Lorem ipsum dolor sit amet';
    // A capitalised run of lower-case Latin words closed by a full stop.
    const SENTENCE = /^[A-Z][a-z]*(?: [a-z]+)*\.$/;

    // The generated text sits in a <pre> with no role or accessible name.
    const generated = (page: Page) => page.locator('pre');

    const sentencesOf = (text: string) => text.match(/[^.]+\./g)?.map((s) => s.trim()) ?? [];

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'lorem-ipsum', 'Lorem Ipsum Generator');
    });

    test('generates paragraphs, plain and wrapped in <p> tags', async ({ page }) => {
      await expect(page.getByRole('combobox', { name: 'Type' })).toHaveText('Paragraphs');
      await expect(page.getByRole('spinbutton', { name: 'Count' })).toHaveValue('3');
      await expect(generated(page)).toHaveCount(0);

      await page.getByRole('button', { name: 'Generate' }).click();
      await expect(generated(page)).toBeVisible();

      const paragraphs = (await generated(page).innerText()).split('\n\n');
      expect(paragraphs).toHaveLength(3);
      expect(paragraphs[0].startsWith(`${OPENING} `) || paragraphs[0].startsWith(`${OPENING}.`)).toBe(
        true
      );
      // Only the first paragraph gets the classic opening.
      expect(paragraphs.slice(1).filter((paragraph) => paragraph.startsWith(OPENING))).toEqual([]);
      for (const paragraph of paragraphs) {
        const sentences = sentencesOf(paragraph);
        expect(sentences.length).toBeGreaterThanOrEqual(2);
        expect(sentences.join(' ')).toBe(paragraph);
        for (const sentence of sentences) {
          expect(sentence).toMatch(SENTENCE);
        }
      }

      await page.getByRole('checkbox', { name: 'Wrap in HTML <p> tags' }).click();
      await page.getByRole('spinbutton', { name: 'Count' }).fill('5');
      await page.getByRole('button', { name: 'Generate' }).click();
      await expect(generated(page)).toContainText('</p>');

      const blocks = (await generated(page).innerText()).split('\n\n');
      expect(blocks).toHaveLength(5);
      expect(blocks[0].startsWith(`<p>${OPENING}`)).toBe(true);
      for (const block of blocks) {
        expect(block).toMatch(/^<p>[A-Z][A-Za-z .]*\.<\/p>$/);
      }
    });

    test('generates an exact number of words and sentences', async ({ page }) => {
      const type = page.getByRole('combobox', { name: 'Type' });
      const count = page.getByRole('spinbutton', { name: 'Count' });
      const opening = page.getByRole('checkbox', { name: 'Start with "Lorem ipsum..."' });

      await chooseOption(page, type, 'Words');
      // <p> tags only make sense for paragraphs.
      await expect(page.getByRole('checkbox', { name: 'Wrap in HTML <p> tags' })).toHaveCount(0);

      // Fewer words than the opening has: the opening is cut, not the count.
      await count.fill('4');
      await page.getByRole('button', { name: 'Generate' }).click();
      await expect(generated(page)).toHaveText('Lorem ipsum dolor sit');

      await count.fill('12');
      await page.getByRole('button', { name: 'Generate' }).click();
      await expect(generated(page)).toContainText(`${OPENING} `);
      const withOpening = (await generated(page).innerText()).split(' ');
      expect(withOpening).toHaveLength(12);
      expect(withOpening.slice(0, 5).join(' ')).toBe(OPENING);

      await opening.click();
      await expect(opening).not.toBeChecked();
      await page.getByRole('button', { name: 'Generate' }).click();
      await expect(generated(page)).toHaveText(/^[a-z]+(?: [a-z]+){11}$/);

      await chooseOption(page, type, 'Sentences');
      await count.fill('3');
      await page.getByRole('button', { name: 'Generate' }).click();
      await expect(generated(page)).toHaveText(/^[A-Z]/);
      const plain = await generated(page).innerText();
      expect(sentencesOf(plain)).toHaveLength(3);
      for (const sentence of sentencesOf(plain)) {
        expect(sentence).toMatch(SENTENCE);
      }

      await opening.click();
      await page.getByRole('button', { name: 'Generate' }).click();
      await expect(generated(page)).toHaveText(new RegExp(`^${OPENING}`));
      expect(sentencesOf(await generated(page).innerText())).toHaveLength(3);
    });

    test('picks the type with the keyboard', async ({ page }) => {
      const type = page.getByRole('combobox', { name: 'Type' });

      await type.focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option')).toHaveText(['Paragraphs', 'Sentences', 'Words']);
      await expect(page.getByRole('option', { name: 'Paragraphs' })).toHaveAttribute(
        'aria-selected',
        'true'
      );

      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');

      await expect(page.getByRole('option')).toHaveCount(0);
      await expect(type).toHaveText('Words');

      await page.getByRole('spinbutton', { name: 'Count' }).fill('2');
      await page.getByRole('button', { name: 'Generate' }).click();
      await expect(generated(page)).toHaveText('Lorem ipsum');
    });

    test('brings an out-of-range count back into range', async ({ page }) => {
      const count = page.getByRole('spinbutton', { name: 'Count' });
      const generate = page.getByRole('button', { name: 'Generate' });

      await chooseOption(page, page.getByRole('combobox', { name: 'Type' }), 'Words');

      await count.fill('-5');
      await generate.click();
      await expect(count).toHaveValue('1');
      await expect(generated(page)).toHaveText('Lorem');

      await count.fill('0');
      await generate.click();
      await expect(count).toHaveValue('1');
      await expect(generated(page)).toHaveText('Lorem');

      await count.fill('');
      await generate.click();
      await expect(count).toHaveValue('1');
      await expect(generated(page)).toHaveText('Lorem');

      // The most the tool gives is 1000.
      await count.fill('5000');
      await generate.click();
      await expect(count).toHaveValue('1000');
      await expect(generated(page)).toContainText(`${OPENING} `);
      expect((await generated(page).innerText()).split(' ')).toHaveLength(1000);
    });

    test('copies and clears the output', async ({ page }) => {
      await page.getByRole('button', { name: 'Generate' }).click();
      await expect(generated(page)).toContainText(OPENING);
      const text = await generated(page).innerText();

      await page.getByRole('button', { name: 'Copy output' }).click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(await clipboardText(page)).toBe(text);

      // Generating again gives new text, not the same block.
      await page.getByRole('button', { name: 'Generate' }).click();
      await expect(generated(page)).not.toHaveText(text, { useInnerText: true });
      await expect(generated(page)).toContainText(OPENING);

      await page.getByRole('button', { name: 'Clear output' }).click();
      await expect(generated(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Clear output' })).toHaveCount(0);
    });
  });
});
