import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end flows for JSON Diff, the Unicode & Zero-Width Inspector and the
 * CSS Gradient Generator.
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

test.describe('New text tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');
  test.use({ locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] });

  // ---------------------------------------------------------------------------
  // JSON Diff
  // ---------------------------------------------------------------------------
  test.describe('JSON Diff', () => {
    const left = (page: Page) => page.getByRole('textbox', { name: 'Original (left)' });
    const right = (page: Page) => page.getByRole('textbox', { name: 'Modified (right)' });
    const summary = (page: Page) => page.getByRole('status', { name: 'Difference summary' });
    const rows = (page: Page) =>
      page.getByRole('region', { name: 'List of differences' }).getByRole('listitem');

    test('reports every kind of difference, the report and the patch, whatever the key order', async ({ page }) => {
      await openTool(page, 'json-diff', 'JSON Diff');
      await expect(
        page.getByText('Paste JSON on both sides, or load the sample, to see the differences.')
      ).toBeVisible();

      const leftText = '{"old": 1, "tags": ["a"], "name": "Ada", "age": "36"}';
      const rightText = '{"new": 2, "age": 36, "tags": ["a", "b"], "name": "Ada Lovelace"}';
      await left(page).fill(leftText);
      await right(page).fill(rightText);

      await expect(page.locator('#json-diff-left-status')).toHaveText('Valid JSON: object with 4 keys');
      // Added: /new and /tags/1. Removed: /old. Changed: /name. Type changed: /age.
      // /tags/0 is the only unchanged value, so it is counted but not listed.
      await expect(summary(page)).toHaveText('+2 added-1 removed~1 changed!1 type changed=1 unchanged');
      // The text of each row is its badge, the path, then the old and new values.
      await expect(rows(page)).toHaveText([
        '!Type changed/ageOld"36"(string)New36(number)',
        '~Changed/nameOld"Ada"New"Ada Lovelace"',
        '+Added/newNew2',
        '-Removed/oldOld1',
        '+Added/tags/1New"b"',
      ]);

      await page.getByRole('button', { name: 'Copy report' }).click();
      await expect
        .poll(() => clipboardText(page))
        .toBe(
          [
            '5 differences: 2 added, 1 removed, 1 changed, 1 type changed',
            '',
            '! /age (type changed): "36" (string) -> 36 (number)',
            '~ /name (changed): "Ada" -> "Ada Lovelace"',
            '+ /new (added): 2',
            '- /old (removed): 1',
            '+ /tags/1 (added): "b"',
          ].join('\n')
        );

      await page.getByRole('button', { name: 'Copy JSON Patch' }).click();
      await expect
        .poll(async () => JSON.parse(await clipboardText(page)))
        .toEqual([
          { op: 'replace', path: '/age', value: 36 },
          { op: 'replace', path: '/name', value: 'Ada Lovelace' },
          { op: 'add', path: '/new', value: 2 },
          { op: 'remove', path: '/old' },
          { op: 'add', path: '/tags/1', value: 'b' },
        ]);

      // Swapping the sides turns additions into removals and the other way round.
      await page.getByRole('button', { name: 'Swap sides' }).click();
      await expect(left(page)).toHaveValue(rightText);
      await expect(right(page)).toHaveValue(leftText);
      await expect(summary(page)).toHaveText('+1 added-2 removed~1 changed!1 type changed=1 unchanged');
    });

    test('array order, unchanged values and moved records follow their switches', async ({ page }) => {
      await openTool(page, 'json-diff', 'JSON Diff');
      await left(page).fill('{"tags": ["a", "b"], "id": 1}');
      await right(page).fill('{"id": 1, "tags": ["b", "a"]}');

      // By index, both tags differ.
      await expect(summary(page)).toHaveText('+0 added-0 removed~2 changed!0 type changed=1 unchanged');
      await expect(rows(page)).toHaveText([
        '~Changed/tags/0Old"a"New"b"',
        '~Changed/tags/1Old"b"New"a"',
      ]);

      await page.getByRole('switch', { name: 'Ignore array order' }).click();
      await expect(page.getByText('No differences.', { exact: true })).toBeVisible();
      await expect(summary(page)).toHaveText('+0 added-0 removed~0 changed!0 type changed=3 unchanged');
      await expect(page.getByRole('button', { name: 'Copy report' })).toHaveCount(0);

      await page.getByRole('switch', { name: 'Show unchanged values' }).click();
      await expect(rows(page)).toHaveText([
        '=Unchanged/idValue1',
        '=Unchanged/tags/0Value"a"',
        '=Unchanged/tags/1Value"b"',
      ]);

      // Records that moved are matched by content, so one edited field is one change.
      await left(page).fill('{"items": [{"id": 1, "n": "a"}, {"id": 2, "n": "b"}]}');
      await right(page).fill('{"items": [{"id": 2, "n": "B"}, {"id": 1, "n": "a"}]}');
      await page.getByRole('switch', { name: 'Show unchanged values' }).click();
      await expect(summary(page)).toHaveText('+0 added-0 removed~1 changed!0 type changed=3 unchanged');
      await expect(rows(page)).toHaveText(['~Changed/items/1/nOld"b"New"B"']);
    });

    test('points at the syntax error, waits for the empty side, and warns about long numbers', async ({ page }) => {
      await openTool(page, 'json-diff', 'JSON Diff');

      await right(page).fill('{"a": 1}');
      await expect(page.getByText('Add JSON on the empty side to see the differences.')).toBeVisible();

      // The missing comma is found on line 3, where the second property starts.
      await left(page).fill('{\n  "a": 1\n  "b": 2\n}');
      await expect(page.locator('#json-diff-left-status')).toHaveText(
        "Line 3, column 3: Expected ',' or '}' after the property value"
      );
      await expect(left(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#json-diff-right-status')).toHaveText('Valid JSON: object with 1 key');
      await expect(page.getByText('Fix the JSON marked above to compare the two documents.')).toBeVisible();
      await expect(summary(page)).toHaveCount(0);

      await left(page).fill('{"a": 1,}');
      await expect(page.locator('#json-diff-left-status')).toHaveText(
        'Line 1, column 9: Trailing comma is not allowed in JSON'
      );

      await left(page).fill('{"a": 1, "b": 2}');
      await expect(left(page)).toHaveAttribute('aria-invalid', 'false');
      await expect(summary(page)).toHaveText('+0 added-1 removed~0 changed!0 type changed=1 unchanged');

      // Both numbers round to the same 64-bit float, so they compare equal. The tool says so.
      await left(page).fill('{"id": 1234567890123456789}');
      await right(page).fill('{"id": 1234567890123456780}');
      await expect(page.getByText('No differences.', { exact: true })).toBeVisible();
      await expect(page.getByText('2 numbers have more than 15 significant digits.')).toBeVisible();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(left(page)).toHaveValue('');
      await expect(right(page)).toHaveValue('');
    });
  });

  // ---------------------------------------------------------------------------
  // Unicode & Zero-Width Inspector
  // ---------------------------------------------------------------------------
  test.describe('Unicode & Zero-Width Inspector', () => {
    const NAME = 'Unicode & Zero-Width Inspector';
    const input = (page: Page) => page.getByRole('textbox', { name: 'Text to inspect' });
    const cleaned = (page: Page) => page.getByRole('textbox', { name: 'Cleaned text' });
    const table = (page: Page) =>
      page.getByRole('table', { name: 'Code points of the text with their encodings' });
    /** The number shown under a statistics label such as "Code points". */
    const stat = (page: Page, label: string) =>
      page.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]');

    test('measures the text and shows a hidden character with its encodings', async ({ page }) => {
      await openTool(page, 'unicode-inspector', NAME);
      await expect(page.getByText('Paste some text above, or load the example', { exact: false })).toBeVisible();

      // a, a zero-width space, b, and a grinning face outside the BMP.
      await input(page).fill('a\u200Bb\u{1F600}');

      await expect(stat(page, 'UTF-16 length')).toHaveText('5');
      await expect(stat(page, 'Code points')).toHaveText('4');
      await expect(stat(page, 'Grapheme clusters')).toHaveText('4');
      await expect(stat(page, 'UTF-8 bytes')).toHaveText('9'); // 1 + 3 + 1 + 4
      await expect(stat(page, 'Invisible or suspicious')).toHaveText('1');
      await expect(page.getByRole('group', { name: 'Invisible characters by class' })).toHaveText('Zero-width1');
      const marked = page.getByRole('region', { name: 'Text with invisible characters marked' });
      await expect(marked).toHaveText('aZWSPb\u{1F600}');
      await expect(marked.getByTitle('U+200B Zero-width space')).toBeVisible();

      const dataRows = table(page).getByRole('row');
      await expect(dataRows).toHaveCount(5); // header + 4 code points
      await expect(dataRows.nth(2).getByRole('cell')).toHaveText([
        '2', 'ZWSP', 'U+200B', 'Zero-width space', 'E2 80 8B', '200B', '&ZeroWidthSpace;', '\\u200B',
      ]);
      await expect(dataRows.nth(4).getByRole('cell')).toHaveText([
        '4', '\u{1F600}', 'U+1F600', 'Other symbol (So)', 'F0 9F 98 80', 'D83D DE00', '&#x1F600;', '\\u{1F600}',
      ]);

      await page.getByRole('checkbox', { name: 'Only invisible, special and suspicious characters' }).check();
      await expect(dataRows).toHaveCount(2); // header + the zero-width space

      await input(page).fill('plain text');
      await expect(page.getByText('No invisible or suspicious characters found.')).toBeVisible();
      await expect(page.getByText('No invisible or special characters found.')).toBeVisible();
    });

    test('cleans, normalises and feeds the result back as the input', async ({ page }) => {
      await openTool(page, 'unicode-inspector', NAME);
      // A precomposed e with acute, a zero-width space and a no-break space.
      await input(page).fill('Caf\u00E9\u200B\u00A0lait');

      await expect(cleaned(page)).toHaveValue('Caf\u00E9 lait');
      await expect(page.getByText('1 invisible character removed, 1 space replaced')).toBeVisible();

      await page.getByRole('combobox', { name: 'Normalise' }).click();
      await page.getByRole('option', { name: 'NFD (canonical decomposition)' }).click();
      await expect(cleaned(page)).toHaveValue('Cafe\u0301 lait');
      await expect(page.getByText('1 invisible character removed, 1 space replaced, normalised to NFD')).toBeVisible();

      // Without the removal step the zero-width space stays, and the joiner option is unavailable.
      await page.getByRole('checkbox', { name: 'Remove invisible characters' }).uncheck();
      await expect(page.getByRole('checkbox', { name: 'Keep ZWNJ and ZWJ inside non-Latin words' })).toBeDisabled();
      await expect(cleaned(page)).toHaveValue('Cafe\u0301\u200B lait');
      await expect(page.getByText('1 space replaced, normalised to NFD')).toBeVisible();

      await page.getByRole('checkbox', { name: 'Remove invisible characters' }).check();
      await page.getByRole('button', { name: 'Use as Input' }).click();
      await expect(input(page)).toHaveValue('Cafe\u0301 lait');
      await expect(stat(page, 'Invisible or suspicious')).toHaveText('0');
      await expect(page.getByText('No invisible or suspicious characters found.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Use as Input' })).toBeDisabled();

      await page.getByRole('button', { name: 'Copy Result' }).click();
      await expect.poll(() => clipboardText(page)).toBe('Cafe\u0301 lait');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input(page)).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Clear' })).toBeDisabled();
    });

    test('the example exposes its traps, spells the hidden message and keeps the emoji intact', async ({ page }) => {
      await openTool(page, 'unicode-inspector', NAME);
      await page.getByRole('button', { name: 'Load Example' }).click();

      // Eight suspicious characters: three zero-width (space, word joiner, byte order
      // mark), a no-break space, a soft hyphen, a right-to-left override and two
      // tag characters. The two joiners and the selector in the emoji are not counted.
      await expect(stat(page, 'Invisible or suspicious')).toHaveText('8');
      await expect(page.getByText('plus 3 in emoji sequences')).toBeVisible();
      await expect(page.getByRole('group', { name: 'Invisible characters by class' })).toHaveText(
        'Zero-width3Non-standard space1Soft hyphen1Bidirectional control1Tag character2'
      );
      await expect(page.getByText('Tag characters in this text spell out hidden ASCII:')).toBeVisible();
      await expect(page.locator('code', { hasText: /^hi$/ })).toBeVisible();

      await expect(page.getByText('7 invisible characters removed, 1 space replaced')).toBeVisible();
      await expect(cleaned(page)).toHaveValue(
        [
          'Invoice number: 4821',
          'Price: \u20AC12,50',
          'Softhyphen and a wordjoiner',
          'This line starts with a byte order mark',
          'Open report fdp.exe',
          'Family: \u{1F468}\u200D\u{1F469}\u200D\u{1F467} and a heart: \u2764\uFE0F',
          'Hidden message: ',
        ].join('\n')
      );

      // The table lists the eight plus the three emoji parts.
      await page.getByRole('checkbox', { name: 'Only invisible, special and suspicious characters' }).check();
      await expect(table(page).getByRole('row')).toHaveCount(12);
      await expect(table(page).getByText('(in emoji sequence)')).toHaveCount(3);
    });
  });

  // ---------------------------------------------------------------------------
  // CSS Gradient Generator
  // ---------------------------------------------------------------------------
  test.describe('CSS Gradient Generator', () => {
    const NAME = 'CSS Gradient Generator';
    const DEFAULT_CSS = 'background: linear-gradient(135deg, #4f46e5 0%, #ec4899 100%);';
    const css = (page: Page) => page.locator('pre').filter({ hasText: /^background:/ });
    const tailwind = (page: Page) => page.locator('pre').filter({ hasText: /^bg-\[/ });
    const position = (page: Page, stop: number) =>
      page.getByRole('spinbutton', { name: `Stop ${stop} position in percent` });
    const addStop = (page: Page) => page.getByRole('button', { name: 'Add stop' });

    test('builds each gradient type, applies presets, resets and copies the code', async ({ page }) => {
      await openTool(page, 'css-gradient-generator', NAME);

      await expect(css(page)).toHaveText(DEFAULT_CSS);
      await expect(tailwind(page)).toHaveText('bg-[linear-gradient(135deg,#4f46e5_0%,#ec4899_100%)]');
      // The preview paints the same gradient; the browser spells the colours as rgb().
      await expect(page.getByRole('img', { name: 'Gradient preview' })).toHaveCSS(
        'background-image',
        'linear-gradient(135deg, rgb(79, 70, 229) 0%, rgb(236, 72, 153) 100%)'
      );

      await page.getByRole('tab', { name: 'Radial' }).click();
      await expect(css(page)).toHaveText('background: radial-gradient(circle at 50% 50%, #4f46e5 0%, #ec4899 100%);');
      await expect(page.getByRole('group', { name: 'Angle', exact: true })).toHaveCount(0);
      await page.getByRole('combobox', { name: 'Shape' }).click();
      await page.getByRole('option', { name: 'Ellipse' }).click();
      await expect(css(page)).toHaveText('background: radial-gradient(ellipse at 50% 50%, #4f46e5 0%, #ec4899 100%);');

      await page.getByRole('tab', { name: 'Conic' }).click();
      await expect(css(page)).toHaveText(
        'background: conic-gradient(from 135deg at 50% 50%, #4f46e5 0%, #ec4899 100%);'
      );

      // The angle slider answers the keyboard: Home is 0 degrees, End is 360.
      await page.getByRole('tab', { name: 'Linear' }).click();
      const angle = page.getByRole('group', { name: 'Angle', exact: true }).getByRole('slider');
      await angle.focus();
      await angle.press('Home');
      await expect(css(page)).toHaveText('background: linear-gradient(0deg, #4f46e5 0%, #ec4899 100%);');
      await angle.press('End');
      await expect(css(page)).toHaveText('background: linear-gradient(360deg, #4f46e5 0%, #ec4899 100%);');

      await page.getByRole('button', { name: 'Apply the Aurora preset' }).click();
      const aurora = 'background: linear-gradient(120deg, #12c2e9 0%, #c471ed 50%, #f64f59 100%);';
      await expect(css(page)).toHaveText(aurora);
      await page.getByRole('button', { name: 'Copy CSS' }).click();
      await expect.poll(() => clipboardText(page)).toBe(aurora);
      await page.getByRole('button', { name: 'Copy Tailwind class' }).click();
      await expect
        .poll(() => clipboardText(page))
        .toBe('bg-[linear-gradient(120deg,#12c2e9_0%,#c471ed_50%,#f64f59_100%)]');

      // Randomise keeps the type and always produces valid CSS.
      await page.getByRole('button', { name: 'Randomise' }).click();
      await expect(css(page)).toHaveText(/^background: linear-gradient\(\d+deg(, #[0-9a-f]{6} \d+%){2,4}\);$/);

      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      await expect(css(page)).toHaveText(DEFAULT_CSS);
    });

    test('adds, recolours, moves, sorts and removes colour stops', async ({ page }) => {
      await openTool(page, 'css-gradient-generator', NAME);

      // Two stops is the minimum, so neither can be removed yet.
      await expect(page.getByRole('button', { name: 'Remove Stop 1' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Remove Stop 2' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Sort by position' })).toBeDisabled();

      // The new stop sits halfway and takes the average of #4f46e5 and #ec4899.
      await addStop(page).click();
      await expect(page.getByText('3 / 10')).toBeVisible();
      await expect(css(page)).toHaveText(
        'background: linear-gradient(135deg, #4f46e5 0%, #9e47bf 50%, #ec4899 100%);'
      );

      await position(page, 2).fill('80');
      await expect(css(page)).toHaveText(
        'background: linear-gradient(135deg, #4f46e5 0%, #9e47bf 80%, #ec4899 100%);'
      );

      await page.getByRole('group', { name: 'Stop 1 colour' }).getByRole('button').click();
      await page.getByPlaceholder('#FFFFFF').fill('#112233');
      await expect(css(page)).toHaveText(
        'background: linear-gradient(135deg, #112233 0%, #9e47bf 80%, #ec4899 100%);'
      );
      await page.keyboard.press('Escape');

      // Moving a stop down swaps its place and its position with the next one.
      await page.getByRole('button', { name: 'Move Stop 1 down' }).click();
      await expect(css(page)).toHaveText(
        'background: linear-gradient(135deg, #9e47bf 0%, #112233 80%, #ec4899 100%);'
      );

      // A stop dragged past its neighbour leaves the list out of order; the CSS stays in order.
      await position(page, 1).fill('90');
      await expect(css(page)).toHaveText(
        'background: linear-gradient(135deg, #112233 80%, #9e47bf 90%, #ec4899 100%);'
      );
      await page.getByRole('button', { name: 'Sort by position' }).click();
      await expect(position(page, 1)).toHaveValue('80');
      await expect(position(page, 2)).toHaveValue('90');
      await expect(page.getByRole('button', { name: 'Sort by position' })).toBeDisabled();

      await page.getByRole('button', { name: 'Remove Stop 2' }).click();
      await expect(page.getByText('2 / 10')).toBeVisible();
      await expect(css(page)).toHaveText('background: linear-gradient(135deg, #112233 80%, #ec4899 100%);');
    });

    test('says when repeating changes nothing, clamps positions and stops at ten stops', async ({ page }) => {
      await openTool(page, 'css-gradient-generator', NAME);

      await page.getByRole('switch', { name: 'Repeating' }).click();
      await expect(css(page)).toHaveText(
        'background: repeating-linear-gradient(135deg, #4f46e5 0%, #ec4899 100%);'
      );
      await expect(page.getByText('The stops already run from 0% to 100%, so nothing repeats yet.')).toBeVisible();

      await position(page, 2).fill('20');
      await expect(css(page)).toHaveText(
        'background: repeating-linear-gradient(135deg, #4f46e5 0%, #ec4899 20%);'
      );
      await expect(page.getByText('so nothing repeats yet.', { exact: false })).toHaveCount(0);

      // Positions outside 0 to 100 are held to the range.
      await position(page, 2).fill('150');
      await expect(css(page)).toHaveText(
        'background: repeating-linear-gradient(135deg, #4f46e5 0%, #ec4899 100%);'
      );
      await position(page, 2).fill('-5');
      await expect(css(page)).toHaveText(
        'background: repeating-linear-gradient(135deg, #4f46e5 0%, #ec4899 0%);'
      );

      for (let count = 2; count < 10; count++) await addStop(page).click();
      await expect(page.getByText('10 / 10')).toBeVisible();
      await expect(addStop(page)).toBeDisabled();
      await expect(page.getByRole('spinbutton')).toHaveCount(10);
    });
  });
});
