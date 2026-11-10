import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end flows for the Text Sorter & Deduplicator, Slug Generator, NATO
 * Phonetic Alphabet, Numeronym Generator, Email Normalizer and Markdown Table
 * Generator.
 *
 * Expected values are worked out by hand from what each tool promises, not
 * taken from the implementation.
 */

/**
 * Opens a tool page and waits until it reacts to input. The export ships
 * server-rendered HTML, so the controls exist before React owns them; the tool
 * page records itself as recently used from an effect, which only runs once it
 * has hydrated.
 */
async function openTool(page: Page, slug: string, name: string) {
  await page.goto(`/tools/${slug}/`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('dev-toolbox:recent') ?? ''))
    .toContain(`"${slug}"`);
}

/** What a paste would give. Windows hands line breaks back as CR LF. */
async function clipboardText(page: Page): Promise<string> {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.replace(/\r\n/g, '\n');
}

test.describe('New text tools, part 2', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');
  test.use({ locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] });

  // ---------------------------------------------------------------------------
  // Text Sorter & Deduplicator
  // ---------------------------------------------------------------------------
  test.describe('Text Sorter & Deduplicator', () => {
    const NAME = 'Text Sorter & Deduplicator';
    const input = (page: Page) => page.getByRole('textbox', { name: 'Lines to sort' });
    const output = (page: Page) => page.getByRole('textbox', { name: 'Sorted lines' });
    const summary = (page: Page) => page.getByRole('status', { name: 'Summary' });

    test('sorts, removes duplicates and empty lines, and counts what it removed', async ({
      page,
    }) => {
      await openTool(page, 'text-sorter-deduplicator', NAME);
      await expect(summary(page)).toHaveText('Add some lines above to see the result.');
      await expect(page.getByRole('button', { name: 'Copy Result' })).toBeDisabled();

      await page.getByRole('button', { name: 'Load Example' }).click();
      // banana twice and one empty line go; the rest is in dictionary order,
      // lower case before upper case for the same word.
      await expect(output(page)).toHaveValue(
        ['apple', 'Apple', 'banana', 'cherry', 'Cherry', 'file10.txt', 'file2.txt'].join('\n')
      );
      await expect(summary(page)).toHaveText(
        '7 lines from 9 lines. 1 duplicate and 1 empty line removed.'
      );

      await page.getByRole('combobox', { name: 'Sort order' }).click();
      await page.getByRole('option', { name: 'Natural (file2 before file10)' }).click();
      await expect(output(page)).toHaveValue(
        ['apple', 'Apple', 'banana', 'cherry', 'Cherry', 'file2.txt', 'file10.txt'].join('\n')
      );

      // Ignoring case keeps the first spelling: Apple (line 2) and Cherry (line 3) win.
      await page.getByRole('combobox', { name: 'Sort order' }).click();
      await page.getByRole('option', { name: 'A to Z' }).click();
      await page.getByRole('checkbox', { name: 'Ignore case when comparing' }).check();
      await expect(output(page)).toHaveValue(
        ['Apple', 'banana', 'cherry', 'file10.txt', 'file2.txt'].join('\n')
      );
      await expect(summary(page)).toHaveText(
        '5 lines from 9 lines. 3 duplicates and 1 empty line removed.'
      );

      await page.getByRole('button', { name: 'Copy Result' }).click();
      await expect
        .poll(() => clipboardText(page))
        .toBe(['Apple', 'banana', 'cherry', 'file10.txt', 'file2.txt'].join('\n'));

      await page.getByRole('button', { name: 'Use as Input' }).click();
      await expect(input(page)).toHaveValue(
        ['Apple', 'banana', 'cherry', 'file10.txt', 'file2.txt'].join('\n')
      );
      await expect(page.getByRole('button', { name: 'Use as Input' })).toBeDisabled();
    });

    test('numeric order, shuffle, whitespace-only lines and the empty state', async ({ page }) => {
      await openTool(page, 'text-sorter-deduplicator', NAME);

      await input(page).fill('10\n9\n-3\nabc\n  \n2.5');
      await page.getByRole('combobox', { name: 'Sort order' }).click();
      await page.getByRole('option', { name: 'Numeric, smallest first' }).click();
      // Lines without a leading number come last; the blank line is dropped.
      await expect(output(page)).toHaveValue(['-3', '2.5', '9', '10', 'abc'].join('\n'));
      await expect(summary(page)).toHaveText(
        '5 lines from 6 lines. 0 duplicates and 1 empty line removed.'
      );

      await page.getByRole('combobox', { name: 'Sort order' }).click();
      await page.getByRole('option', { name: 'Shortest first' }).click();
      // Lengths are 10:2, 9:1, -3:2, abc:3, 2.5:3. Equal lengths keep their input order.
      await expect(output(page)).toHaveValue(['9', '10', '-3', 'abc', '2.5'].join('\n'));

      await input(page).fill('1\n2\n3\n4\n5\n6');
      await page.getByRole('combobox', { name: 'Sort order' }).click();
      await page.getByRole('option', { name: 'Shuffle' }).click();
      await expect(page.getByRole('button', { name: 'Shuffle again' })).toBeVisible();
      for (let i = 0; i < 2; i++) {
        const shuffled = (await output(page).inputValue()).split('\n');
        expect([...shuffled].sort()).toEqual(['1', '2', '3', '4', '5', '6']);
        await page.getByRole('button', { name: 'Shuffle again' }).click();
      }

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input(page)).toHaveValue('');
      await expect(output(page)).toHaveValue('');
      await expect(summary(page)).toHaveText('Add some lines above to see the result.');
    });
  });

  // ---------------------------------------------------------------------------
  // Slug Generator
  // ---------------------------------------------------------------------------
  test.describe('Slug Generator', () => {
    const NAME = 'Slug Generator';
    const input = (page: Page) => page.getByRole('textbox', { name: 'Text to slugify' });
    const slug = (page: Page) => page.getByRole('textbox', { name: 'Slug', exact: true });
    const status = (page: Page) => page.getByRole('status', { name: 'Slug summary' });

    test('builds a slug and follows the separator, accent, stopword and length options', async ({
      page,
    }) => {
      await openTool(page, 'slugify', NAME);
      await expect(status(page)).toHaveText('Type a title above to see its slug.');
      await expect(page.getByRole('button', { name: 'Copy Slug' })).toBeDisabled();

      await input(page).fill('Hello, World! Işık Şişli');
      await expect(slug(page)).toHaveValue('hello-world-isik-sisli');
      await expect(status(page)).toHaveText('22 characters');

      await page.getByRole('combobox', { name: 'Separator' }).click();
      await page.getByRole('option', { name: 'Underscore ( _ )' }).click();
      await expect(slug(page)).toHaveValue('hello_world_isik_sisli');

      await page.getByRole('combobox', { name: 'Separator' }).click();
      await page.getByRole('option', { name: 'Hyphen ( - )' }).click();
      await input(page).fill('Straße Müller');
      await expect(slug(page)).toHaveValue('strasse-muller');
      await page.getByRole('combobox', { name: 'Accented letters' }).click();
      await page.getByRole('option', { name: 'German spelling' }).click();
      await expect(slug(page)).toHaveValue('strasse-mueller');
      await page.getByRole('combobox', { name: 'Accented letters' }).click();
      await page.getByRole('option', { name: 'Keep letters as typed' }).click();
      await expect(slug(page)).toHaveValue('straße-müller');
      await page.getByRole('combobox', { name: 'Accented letters' }).click();
      await page.getByRole('option', { name: 'Plain letters' }).click();

      await input(page).fill('The Quick Brown Fox of the Year');
      await expect(slug(page)).toHaveValue('the-quick-brown-fox-of-the-year');
      await page.getByRole('checkbox', { name: 'Remove stopwords (a, the, of, and...)' }).check();
      await expect(slug(page)).toHaveValue('quick-brown-fox-year');

      // 11 characters fit "quick-brown"; adding "-fox" would make 15.
      await page.getByRole('spinbutton', { name: 'Maximum length' }).fill('11');
      await expect(slug(page)).toHaveValue('quick-brown');
      await page.getByRole('spinbutton', { name: 'Maximum length' }).fill('');
      await expect(slug(page)).toHaveValue('quick-brown-fox-year');

      await page.getByRole('checkbox', { name: 'Lower case' }).uncheck();
      await input(page).fill('Hello World');
      await expect(slug(page)).toHaveValue('Hello-World');

      await page.getByRole('button', { name: 'Copy Slug' }).click();
      await expect.poll(() => clipboardText(page)).toBe('Hello-World');
    });

    test('one slug per line, blank lines, and text with nothing to keep', async ({ page }) => {
      await openTool(page, 'slugify', NAME);

      await page.getByRole('checkbox', { name: 'One slug per line' }).check();
      await input(page).fill('First Post\n\nSecond   Post!');
      await expect(slug(page)).toHaveValue('first-post\n\nsecond-post');
      await expect(status(page)).toHaveText('2 slugs');

      await input(page).fill('!!! \u{1F600}');
      await expect(slug(page)).toHaveValue('');
      await expect(status(page)).toHaveText('No letters or digits to make a slug from.');
      await expect(page.getByRole('button', { name: 'Copy Slug' })).toBeDisabled();

      await page.getByRole('button', { name: 'Load Example' }).click();
      await expect(slug(page)).toHaveValue('the-quick-brown-fox-strasse-isik-cagris-cafe');
      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input(page)).toHaveValue('');
      await expect(status(page)).toHaveText('Type a title above to see its slug.');
    });
  });

  // ---------------------------------------------------------------------------
  // NATO Phonetic Alphabet
  // ---------------------------------------------------------------------------
  test.describe('NATO Phonetic Alphabet', () => {
    const NAME = 'NATO Phonetic Alphabet';
    const spellInput = (page: Page) => page.getByRole('textbox', { name: 'Text to spell' });
    const spelling = (page: Page) => page.getByRole('textbox', { name: 'NATO spelling' });
    const codeInput = (page: Page) => page.getByRole('textbox', { name: 'Code words to read' });
    const decoded = (page: Page) => page.getByRole('textbox', { name: 'Decoded text' });

    test('spells text with ICAO digits, offers plain digits, and lists the reference tables', async ({
      page,
    }) => {
      await openTool(page, 'nato-alphabet', NAME);

      await spellInput(page).fill('Hello World 42');
      await expect(spelling(page)).toHaveValue(
        'Hotel Echo Lima Lima Oscar / Whiskey Oscar Romeo Lima Delta / Fower Too'
      );

      await page.getByRole('combobox', { name: 'Digits' }).click();
      await page.getByRole('option', { name: 'Plain (One, Two, Three, Four, Five, Nine)' }).click();
      await expect(spelling(page)).toHaveValue(
        'Hotel Echo Lima Lima Oscar / Whiskey Oscar Romeo Lima Delta / Four Two'
      );

      await page.getByRole('combobox', { name: 'Letter case' }).click();
      await page.getByRole('option', { name: 'Upper case (ALFA)' }).click();
      await spellInput(page).fill('x9');
      await expect(spelling(page)).toHaveValue('X-RAY NINE');

      await page.getByRole('button', { name: 'Copy Result' }).click();
      await expect.poll(() => clipboardText(page)).toBe('X-RAY NINE');

      const letters = page.getByRole('table', { name: 'NATO phonetic alphabet letters' });
      await expect(letters.getByRole('row')).toHaveCount(27); // header + 26 letters
      await expect(letters.getByRole('row').nth(10).getByRole('cell')).toHaveText([
        'J',
        'Juliett',
        'JEW-LEE-ETT',
      ]);
      const digits = page.getByRole('table', { name: 'ICAO digit pronunciations' });
      await expect(digits.getByRole('row').nth(10).getByRole('cell')).toHaveText([
        '9',
        'Niner',
        'NIN-ER',
      ]);
    });

    test('decodes code words, swaps direction, and handles characters without a code word', async ({
      page,
    }) => {
      await openTool(page, 'nato-alphabet', NAME);

      await page.getByRole('tab', { name: 'NATO to Text' }).click();
      await codeInput(page).fill('Hotel India / alfa wun / juliet WHISKY niner !');
      await expect(decoded(page)).toHaveValue('HI A1 JW9!');

      await page.getByRole('checkbox', { name: 'Keep words that are not code words' }).uncheck();
      await expect(decoded(page)).toHaveValue('HI A1 JW9');
      await page.getByRole('checkbox', { name: 'Lower-case result' }).check();
      await expect(decoded(page)).toHaveValue('hi a1 jw9');

      await page.getByRole('tab', { name: 'Text to NATO' }).click();
      await page.getByRole('checkbox', { name: 'Keep characters without a code word' }).uncheck();
      await spellInput(page).fill('Hi! ç');
      await expect(spelling(page)).toHaveValue('Hotel India / Charlie');

      // Use as Input and Swap feeds the spelling back in as the text to decode.
      await page.getByRole('button', { name: 'Use as Input and Swap' }).click();
      await expect(page.getByRole('tab', { name: 'NATO to Text' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(codeInput(page)).toHaveValue('Hotel India / Charlie');
      await expect(decoded(page)).toHaveValue('hi c');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(codeInput(page)).toHaveValue('');
      await expect(decoded(page)).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy Result' })).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // Numeronym Generator
  // ---------------------------------------------------------------------------
  test.describe('Numeronym Generator', () => {
    const NAME = 'Numeronym Generator';
    const input = (page: Page) => page.getByRole('textbox', { name: 'Text to abbreviate' });
    const output = (page: Page) => page.getByRole('textbox', { name: 'Numeronyms' });

    test('shortens the well-known words and follows the minimum length', async ({ page }) => {
      await openTool(page, 'numeronym-generator', NAME);
      await expect(page.getByRole('button', { name: 'Copy Result' })).toBeDisabled();

      await page.getByRole('button', { name: 'Load Example' }).click();
      await expect(output(page)).toHaveValue(['i18n', 'l10n', 'a11y', 'K8s', 'o11y'].join('\n'));

      await input(page).fill('The internationalization of Kubernetes, again!');
      await expect(output(page)).toHaveValue('The i18n of K8s, a3n!');

      const minimum = page.getByRole('spinbutton', { name: 'Minimum length' });
      await minimum.fill('6');
      await expect(output(page)).toHaveValue('The i18n of K8s, again!');
      // 3 is the lowest value that makes sense; anything below it acts as 3.
      await minimum.fill('1');
      await expect(output(page)).toHaveValue('T1e i18n of K8s, a3n!');

      await page.getByRole('checkbox', { name: 'Lower case result' }).check();
      await expect(output(page)).toHaveValue('t1e i18n of k8s, a3n!');

      await page.getByRole('button', { name: 'Copy Result' }).click();
      await expect.poll(() => clipboardText(page)).toBe('t1e i18n of k8s, a3n!');
    });

    test('counts characters rather than code units, shortens whole lines, and keeps numbers', async ({
      page,
    }) => {
      await openTool(page, 'numeronym-generator', NAME);

      // R, e plus an accent, s, u, m, e plus an accent: six characters, four between the ends.
      await input(page).fill('Résumé');
      await expect(output(page)).toHaveValue('R4é');

      // Mathematical script letters take two UTF-16 units each but count once.
      await input(page).fill('\u{1D49C}bcd\u{1D4B5}');
      await expect(output(page)).toHaveValue('\u{1D49C}3\u{1D4B5}');

      await input(page).fill('Year 2024 and abc123def');
      await expect(output(page)).toHaveValue('Y2r 2024 and a7f');

      await page.getByRole('combobox', { name: 'Shorten' }).click();
      await page.getByRole('option', { name: 'Each line as one word' }).click();
      await input(page).fill('Hello, World!\nab');
      // HelloWorld has 10 letters, so 8 sit between H and d. "ab" is too short.
      await expect(output(page)).toHaveValue('H8d\nab');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input(page)).toHaveValue('');
      await expect(output(page)).toHaveValue('');
    });
  });

  // ---------------------------------------------------------------------------
  // Email Normalizer
  // ---------------------------------------------------------------------------
  test.describe('Email Normalizer', () => {
    const NAME = 'Email Normalizer';
    const input = (page: Page) => page.getByRole('textbox', { name: 'Email addresses' });
    const output = (page: Page) => page.getByRole('textbox', { name: 'Normalized addresses' });
    const details = (page: Page) =>
      page.getByRole('table', { name: 'Addresses with their normalized form and status' });
    const GMAIL = 'Gmail: remove dots and +tag, googlemail.com becomes gmail.com';

    test('normalizes a batch, reports validity and duplicates, and follows the rules', async ({
      page,
    }) => {
      await openTool(page, 'email-normalizer', NAME);
      await expect(
        page.getByText('Paste some addresses above, or load the example, to normalize them.')
      ).toBeVisible();

      await page.getByRole('button', { name: 'Load Example' }).click();
      await expect(output(page)).toHaveValue(
        ['johndoe@gmail.com', 'ada@example.com', 'info@xn--bcher-kva.de'].join('\n')
      );
      await expect(page.getByRole('group', { name: 'Summary' })).toHaveText(
        'Addresses7Valid5Invalid2Unique3Duplicates2'
      );

      const rows = details(page).getByRole('row');
      await expect(rows).toHaveCount(8); // header + 7 addresses
      await expect(rows.nth(1).getByRole('cell')).toHaveText([
        '1',
        'John.Doe+newsletter@Gmail.com',
        'johndoe@gmail.com',
        'Valid',
      ]);
      await expect(rows.nth(2).getByRole('cell')).toHaveText([
        '2',
        'johndoe@googlemail.com',
        'johndoe@gmail.com',
        'Duplicate of #1',
      ]);
      await expect(rows.nth(3).getByRole('cell')).toHaveText([
        '3',
        'ADA@Example.COM',
        'ada@example.com',
        'Valid',
      ]);
      await expect(rows.nth(5).getByRole('cell')).toHaveText([
        '5',
        'not-an-email',
        '',
        'Invalid: Missing @',
      ]);
      await expect(rows.nth(7).getByRole('cell')).toHaveText([
        '7',
        'name@',
        '',
        'Invalid: Empty domain',
      ]);

      await page.getByRole('button', { name: 'Copy Result' }).click();
      await expect
        .poll(() => clipboardText(page))
        .toBe(['johndoe@gmail.com', 'ada@example.com', 'info@xn--bcher-kva.de'].join('\n'));

      // Without the Gmail rules the two Gmail addresses are different people.
      await page.getByRole('checkbox', { name: GMAIL }).uncheck();
      await expect(output(page)).toHaveValue(
        [
          'john.doe+newsletter@gmail.com',
          'johndoe@googlemail.com',
          'ada@example.com',
          'info@xn--bcher-kva.de',
        ].join('\n')
      );
      await expect(page.getByRole('group', { name: 'Summary' })).toHaveText(
        'Addresses7Valid5Invalid2Unique4Duplicates1'
      );

      await page
        .getByRole('checkbox', { name: 'Write international domains in ASCII (punycode)' })
        .uncheck();
      await expect(output(page)).toHaveValue(
        [
          'john.doe+newsletter@gmail.com',
          'johndoe@googlemail.com',
          'ada@example.com',
          'info@bücher.de',
        ].join('\n')
      );

      await page.getByRole('checkbox', { name: 'Leave duplicates out of the result' }).uncheck();
      await expect(output(page)).toHaveValue(
        [
          'john.doe+newsletter@gmail.com',
          'johndoe@googlemail.com',
          'ada@example.com',
          'info@bücher.de',
          'ada@example.com',
        ].join('\n')
      );
    });

    test('plus tags at other providers, mixed separators, and a batch with nothing valid', async ({
      page,
    }) => {
      await openTool(page, 'email-normalizer', NAME);

      await input(page).fill('Ana+news@Example.com;ana@example.com, <mailto:ANA+x@example.com>');
      await expect(output(page)).toHaveValue(
        'ana+news@example.com\nana@example.com\nana+x@example.com'
      );

      await page.getByRole('checkbox', { name: 'Remove +tag at other providers too' }).check();
      await expect(output(page)).toHaveValue('ana@example.com');
      await expect(page.getByRole('group', { name: 'Summary' })).toHaveText(
        'Addresses3Valid3Invalid0Unique1Duplicates2'
      );

      await input(page).fill('nope\na@@b.com');
      await expect(output(page)).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy Result' })).toBeDisabled();
      await expect(details(page).getByRole('row').nth(2).getByRole('cell').last()).toHaveText(
        'Invalid: More than one @'
      );

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input(page)).toHaveValue('');
      await expect(
        page.getByText('Paste some addresses above, or load the example, to normalize them.')
      ).toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  // Markdown Table Generator
  // ---------------------------------------------------------------------------
  test.describe('Markdown Table Generator', () => {
    const NAME = 'Markdown Table Generator';
    const markdown = (page: Page) => page.getByRole('textbox', { name: 'Markdown table' });
    const cell = (page: Page, row: number, column: number) =>
      page.getByRole('textbox', { name: `Row ${row} column ${column}`, exact: true });
    const header = (page: Page, column: number) =>
      page.getByRole('textbox', { name: `Header ${column}`, exact: true });

    const SAMPLE_PADDED = [
      '| Name  | Role       | Score |',
      '| :---- | ---------- | ----: |',
      '| Ada   | Engineer   |    95 |',
      '| Linus | Maintainer |    88 |',
    ].join('\n');

    test('edits cells, alignment, rows and columns and copies the padded or compact Markdown', async ({
      page,
    }) => {
      await openTool(page, 'markdown-table-generator', NAME);
      await expect(markdown(page)).toHaveValue(SAMPLE_PADDED);
      await expect(page.getByText('3 columns, 2 rows below the header.')).toBeVisible();

      await cell(page, 1, 2).fill('Pilot');
      await page.getByRole('combobox', { name: 'Column 2 alignment' }).click();
      await page.getByRole('option', { name: 'Center' }).click();
      await expect(markdown(page)).toHaveValue(
        [
          '| Name  |    Role    | Score |',
          '| :---- | :--------: | ----: |',
          '| Ada   |   Pilot    |    95 |',
          '| Linus | Maintainer |    88 |',
        ].join('\n')
      );

      await page.getByRole('button', { name: 'Add row' }).click();
      await page.getByRole('button', { name: 'Add column' }).click();
      await expect(page.getByText('4 columns, 3 rows below the header.')).toBeVisible();
      await header(page, 4).fill('Tag');
      await cell(page, 3, 1).fill('Grace');
      await expect(markdown(page)).toHaveValue(
        [
          '| Name  |    Role    | Score | Tag |',
          '| :---- | :--------: | ----: | --- |',
          '| Ada   |   Pilot    |    95 |     |',
          '| Linus | Maintainer |    88 |     |',
          '| Grace |            |       |     |',
        ].join('\n')
      );

      await page.getByRole('button', { name: 'Remove column 4' }).click();
      await page.getByRole('button', { name: 'Remove row 3' }).click();
      await page.getByRole('button', { name: 'Remove row 2' }).click();
      await expect(page.getByText('3 columns, 1 row below the header.')).toBeVisible();

      await page.getByRole('checkbox', { name: 'Pad columns so the raw text lines up' }).uncheck();
      const compact = [
        '| Name | Role | Score |',
        '| :-- | :-: | --: |',
        '| Ada | Pilot | 95 |',
      ].join('\n');
      await expect(markdown(page)).toHaveValue(compact);

      await page.getByRole('button', { name: 'Copy Markdown' }).click();
      await expect.poll(() => clipboardText(page)).toBe(compact);
    });

    test('imports CSV with quoting, escapes pipes, and clears down to an empty state', async ({
      page,
    }) => {
      await openTool(page, 'markdown-table-generator', NAME);

      await page.getByRole('button', { name: 'Load Example' }).click();
      await page.getByRole('button', { name: 'Import into table' }).click();
      await expect(page.getByText('Imported 2 rows and 3 columns.')).toBeVisible();
      await expect(markdown(page)).toHaveValue(
        [
          '| Item         | Quantity | Price |',
          '| ------------ | -------- | ----- |',
          '| Apple        | 3        | 1.20  |',
          '| Fig \\| dried | 12       | 0.45  |',
        ].join('\n')
      );
      await expect(cell(page, 2, 1)).toHaveValue('Fig | dried');

      await page.getByRole('checkbox', { name: 'Escape pipes inside cells' }).uncheck();
      await expect(markdown(page)).toHaveValue(
        [
          '| Item        | Quantity | Price |',
          '| ----------- | -------- | ----- |',
          '| Apple       | 3        | 1.20  |',
          '| Fig | dried | 12       | 0.45  |',
        ].join('\n')
      );
      await page.getByRole('checkbox', { name: 'Escape pipes inside cells' }).check();

      // Semicolons are found automatically, and a quoted cell may hold a line break.
      await page.getByRole('textbox', { name: 'CSV or TSV to import' }).fill('a;b\n1;"x\ny"');
      await page.getByRole('checkbox', { name: 'First row is the header' }).uncheck();
      await page.getByRole('button', { name: 'Import into table' }).click();
      await expect(page.getByText('Imported 2 rows and 2 columns.')).toBeVisible();
      await expect(header(page, 1)).toHaveValue('Column 1');
      await expect(markdown(page)).toHaveValue(
        [
          '| Column 1 | Column 2 |',
          '| -------- | -------- |',
          '| a        | b        |',
          '| 1        | x<br>y   |',
        ].join('\n')
      );

      await page.getByRole('button', { name: 'Clear table' }).click();
      await expect(markdown(page)).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Copy Markdown' })).toBeDisabled();
      await expect(cell(page, 1, 1)).toHaveValue('');

      await page.getByRole('button', { name: 'Clear input' }).click();
      await expect(page.getByRole('button', { name: 'Import into table' })).toBeDisabled();
    });
  });
});
