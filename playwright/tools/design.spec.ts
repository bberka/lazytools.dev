import { readFile } from 'node:fs/promises';
import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * End-to-end flows for the design tools: Color Picker, Color Contrast Checker,
 * Glassmorphism Generator, CSS Box Shadow Generator, SVG Path Editor and CSS
 * Clamp Calculator.
 *
 * Expected values are worked out by hand from what is typed in (the arithmetic
 * is in the comments); none of them come from the tools' own modules.
 */

/**
 * Opens a tool page and waits until React has hydrated `control`. The page is
 * prerendered, so its controls are on screen before they respond to input.
 */
async function openTool(page: Page, slug: string, heading: string, control: Locator): Promise<void> {
  const response = await page.goto(`/tools/${slug}/`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await expect
    .poll(() =>
      control.evaluate((element) => Object.keys(element).some((key) => key.startsWith('__reactProps$')))
    )
    .toBe(true);
}

/**
 * The shared Slider primitive gives its thumb no accessible name, so a slider
 * cannot be found by role and name. It is found through the caption shown
 * beside it instead: the innermost block that holds both.
 */
function sliderBeside(page: Page, caption: string, within: Locator = page.locator('main')): Locator {
  return within
    .locator('div')
    .filter({ has: page.getByText(caption, { exact: true }) })
    .filter({ has: page.getByRole('slider') })
    .last()
    .getByRole('slider');
}

/** Sets a slider with the keyboard: `keys` are pressed in order on its thumb. */
async function pressOn(slider: Locator, ...keys: string[]): Promise<void> {
  await slider.focus();
  for (const key of keys) await slider.press(key);
}

/**
 * Clicks a copy button and checks what landed on the clipboard. Line ends are
 * normalised because Windows hands clipboard text back with CRLF. The click is
 * repeated if something else wrote to the clipboard in between.
 */
async function expectCopies(
  page: Page,
  button: Locator,
  expected: string | ((text: string) => void)
): Promise<void> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await expect(async () => {
    await button.click();
    const text = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    if (typeof expected === 'string') expect(text).toBe(expected);
    else expected(text);
  }).toPass({ timeout: 15_000 });
}

/** Picks an option from one of the app's select menus. */
async function choose(page: Page, select: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: select, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  // The list fades out; wait for it to go so the next menu is the only one open.
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Presses a mouse button in the middle of `target` and releases it `dx`, `dy` px away. */
async function dragBy(
  page: Page,
  target: Locator,
  dx: number,
  dy: number,
  button: 'left' | 'right' = 'left'
): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('Nothing to drag: the target is not on screen');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up({ button });
}

/**
 * Drags from the middle of a colour square out past one of its corners. The
 * square clamps the pointer to its edge, so this lands exactly on the corner.
 */
async function dragPastCorner(
  page: Page,
  square: Locator,
  corner: 'top-right' | 'bottom-left'
): Promise<void> {
  await square.scrollIntoViewIfNeeded();
  const box = await square.boundingBox();
  if (!box) throw new Error('The colour square is not on screen');
  const outside = 30;
  const end =
    corner === 'top-right'
      ? { x: box.x + box.width + outside, y: Math.max(0, box.y - outside) }
      : { x: Math.max(0, box.x - outside), y: box.y + box.height + outside };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
}

/** The text of a block exactly as generated, line breaks included. */
async function expectExactText(block: Locator, expected: string): Promise<void> {
  await expect.poll(() => block.textContent()).toBe(expected);
}

test.describe('Design tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // No flow may throw: an uncaught error on the page fails the test that caused it.
  let pageErrors: string[] = [];
  test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
  });
  test.afterEach(() => {
    expect(pageErrors, 'uncaught errors on the page').toEqual([]);
  });

  // ── Color Picker ────────────────────────────────────────────────────────────

  test.describe('Color Picker', () => {
    const hexField = (page: Page) => page.getByRole('textbox', { name: 'HEX color' });
    // The large swatch: its caption is followed by the hex of the colour in use.
    const selected = (page: Page) =>
      page.getByText('Selected color', { exact: true }).locator('xpath=following-sibling::p');
    const open = (page: Page) => openTool(page, 'color-picker', 'Color Picker', hexField(page));

    test.beforeEach(async ({ page }) => {
      await open(page);
    });

    test('a HEX typed by hand drives the copy values, the tints and shades and the theme', async ({ page }) => {
      const hex = hexField(page);
      await hex.press('ControlOrMeta+a');
      await hex.pressSequentially('#336699');
      await expect(hex).toHaveValue('#336699');
      await expect(selected(page)).toHaveText('#336699');

      // (51, 102, 153): lightness (153 + 51) / 510 = 40%, saturation 102 / 204 = 50%,
      // hue 60 * ((51 - 102) / 102 + 4) = 210 degrees.
      await expect(page.getByText('rgb(51, 102, 153)', { exact: true })).toBeVisible();
      await expect(page.getByText('hsl(210, 50%, 40%)', { exact: true })).toBeVisible();
      await expect(page.getByText('--color-picked: #336699;', { exact: true })).toBeVisible();

      // Shades scale each channel by 0.6 / 0.8 / 0.9; tints move it 10 / 20 / 40%
      // of the way to 255. Shade 40 is (30.6, 61.2, 91.8) = #1F3D5C, and so on.
      for (const swatch of [
        'Use Shade 40 #1F3D5C',
        'Use Shade 20 #29527A',
        'Use Shade 10 #2E5C8A',
        'Use Base #336699',
        'Use Tint 10 #4775A3',
        'Use Tint 20 #5C85AD',
        'Use Tint 40 #85A3C2',
      ]) {
        await expect(page.getByRole('button', { name: swatch, exact: true })).toBeVisible();
      }

      await expectCopies(page, page.getByRole('button', { name: 'Copy HEX', exact: true }), '#336699');
      await expectCopies(page, page.getByRole('button', { name: 'Copy RGB', exact: true }), 'rgb(51, 102, 153)');

      // The theme is exported as space-separated HSL; its primary is the picked colour.
      await expectCopies(
        page,
        page.getByRole('button', { name: 'Copy --primary', exact: true }),
        '--primary: 210 50% 40%;'
      );
      await expectCopies(page, page.getByRole('button', { name: 'Copy CSS', exact: true }), (css) => {
        expect(css).toMatch(/^:root \{\n(?: {2}--[a-z-]+: \d+ \d+% \d+%;\n){12}\}$/);
        expect(css).toContain('\n  --primary: 210 50% 40%;\n');
      });
      await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();

      // Three-digit shorthand is read as typed and written out in full on leaving the field.
      await hex.fill('#0af');
      await expect(selected(page)).toHaveText('#00AAFF');
      await hex.blur();
      await expect(hex).toHaveValue('#00AAFF');
    });

    test('the picker square and hue slider pick the colour under the pointer and keep the hue through black', async ({
      page,
    }) => {
      const hex = hexField(page);
      const hue = page.getByRole('slider', { name: 'Hue' });
      const square = page.getByRole('slider', { name: 'Saturation and brightness' });

      // Home is 0 degrees and each Page Up adds 30: green sits at 120.
      await pressOn(hue, 'Home', 'PageUp', 'PageUp', 'PageUp', 'PageUp');
      await expect(hue).toHaveAttribute('aria-valuenow', '120');
      await expect(page.getByText('120deg', { exact: true })).toBeVisible();

      // The top-right corner of the square is the pure hue.
      await dragPastCorner(page, square, 'top-right');
      await expect(square).toHaveAttribute('aria-valuetext', 'Saturation 100%, brightness 100%');
      await expect(hex).toHaveValue('#00FF00');

      // Black has no hue of its own; the slider must stay where it was put.
      await dragPastCorner(page, square, 'bottom-left');
      await expect(hex).toHaveValue('#000000');
      await expect(hue).toHaveAttribute('aria-valuenow', '120');

      // The hue can still be turned while the colour is black, and is used on the way back.
      await pressOn(hue, 'PageUp', 'PageUp');
      await expect(hue).toHaveAttribute('aria-valuenow', '180');
      await expect(hex).toHaveValue('#000000');
      await dragPastCorner(page, square, 'top-right');
      await expect(hex).toHaveValue('#00FFFF');

      // The channel sliders have no accessible name; they are found by their captions.
      await pressOn(sliderBeside(page, 'Green'), 'Home');
      await expect(hex).toHaveValue('#0000FF');
      await expect(page.getByText('rgb(0, 0, 255)', { exact: true })).toBeVisible();
      await expect(hue).toHaveAttribute('aria-valuenow', '240');
      await pressOn(sliderBeside(page, 'Red'), 'End');
      await expect(hex).toHaveValue('#FF00FF');
      await expect(selected(page)).toHaveText('#FF00FF');

      // Arrow keys walk the square a percent at a time: 99% saturation of pure
      // magenta lifts green from 0 to 255 * 0.01 = 2.55, which is 3.
      await pressOn(square, 'ArrowLeft');
      await expect(square).toHaveAttribute('aria-valuetext', 'Saturation 99%, brightness 100%');
      await expect(hex).toHaveValue('#FF03FF');
    });

    test('an unreadable HEX is reported and the colour in use is kept; swatches can be saved, reused and cleared', async ({
      page,
    }) => {
      const hex = hexField(page);

      await hex.fill('#12');
      await expect(page.getByRole('status')).toHaveText('Enter a valid HEX color, such as #3B82F6 or #0AF.');
      await expect(hex).toHaveAttribute('aria-invalid', 'true');
      // Still the starting blue.
      await expect(selected(page)).toHaveText('#3B82F6');
      await expect(page.getByText('rgb(59, 130, 246)', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Use preset #EF4444' }).click();
      await expect(page.getByRole('status')).toHaveCount(0);
      await expect(hex).toHaveValue('#EF4444');
      await expect(hex).toHaveAttribute('aria-invalid', 'false');

      await page.getByRole('button', { name: 'Save Swatch' }).click();
      await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
      const saved = page.getByRole('button', { name: 'Use saved swatch #EF4444' });
      await expect(saved).toBeVisible();

      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Reset Done' })).toBeVisible();
      await expect(hex).toHaveValue('#3B82F6');

      await saved.click();
      await expect(selected(page)).toHaveText('#EF4444');
      // 40% of the way from (239, 68, 68) to white is (245.4, 142.8, 142.8).
      await page.getByRole('button', { name: 'Use Tint 40 #F58F8F' }).click();
      await expect(hex).toHaveValue('#F58F8F');

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(page.getByRole('button', { name: /^Use saved swatch/ })).toHaveCount(0);
      await expect(page.getByText('Saved Swatches', { exact: true })).toHaveCount(0);
    });

    test('Pick From Screen applies the EyeDropper colour and reports a cancelled pick', async ({ page }) => {
      // Headless Chromium cannot show the real screen picker, so the API is stood
      // in for: the first pick returns orange, the second is cancelled.
      await page.addInitScript(() => {
        let picks = 0;
        Object.assign(window, {
          EyeDropper: class {
            open() {
              picks += 1;
              return picks === 1
                ? Promise.resolve({ sRGBHex: '#ff8800' })
                : Promise.reject(new DOMException('The user canceled the selection.', 'AbortError'));
            }
          },
        });
      });
      await open(page);

      const pick = page.getByRole('button', { name: 'Pick a color from the screen' });
      await pick.click();
      await expect(pick).toHaveText('Picked');
      await expect(hexField(page)).toHaveValue('#FF8800');
      await expect(page.getByText('rgb(255, 136, 0)', { exact: true })).toBeVisible();

      await pick.click();
      await expect(page.getByRole('status')).toHaveText('Color picking was canceled or blocked by the browser.');
      await expect(hexField(page)).toHaveValue('#FF8800');
    });

    test('letters typed into the middle of the HEX field go where the caret is', async ({ page }) => {
      const hex = hexField(page);

      // Select the "3B" of #3B82F6 and type over it.
      await hex.focus();
      await hex.press('Home');
      await hex.press('ArrowRight');
      await hex.press('Shift+ArrowRight');
      await hex.press('Shift+ArrowRight');
      await page.keyboard.type('ab');

      await expect(hex).toHaveValue('#AB82F6');
      await expect(selected(page)).toHaveText('#AB82F6');
    });

    test('on a desktop-width screen the picker sits beside the selected colour', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });

      const swatch = await page.getByText('Selected color', { exact: true }).boundingBox();
      const square = await page.getByRole('slider', { name: 'Saturation and brightness' }).boundingBox();
      if (!swatch || !square) throw new Error('The picker card is not on screen');

      // The first column is at least 290px wide, so the square starts well to the right of it.
      expect(square.x).toBeGreaterThan(swatch.x + 250);
    });
  });

  // ── Color Contrast Checker ──────────────────────────────────────────────────

  test.describe('Color Contrast Checker', () => {
    const foreground = (page: Page) => page.getByRole('textbox', { name: 'Foreground color HEX' });
    const background = (page: Page) => page.getByRole('textbox', { name: 'Background color HEX' });
    const ratio = (page: Page) => page.getByText(/^\d+\.\d{2}:1$/);
    const sample = (page: Page) => page.getByText('Normal text (16px)', { exact: true });

    interface Verdict {
      ratio: string;
      level: 'AAA' | 'AA' | 'AA Large' | 'Fail';
      /** Normal text against 4.5:1 and 7:1, large text against 3:1 and 4.5:1. */
      normalAA: boolean;
      normalAAA: boolean;
      largeAA: boolean;
      largeAAA: boolean;
    }

    async function expectVerdict(page: Page, verdict: Verdict): Promise<void> {
      await expect(ratio(page)).toHaveText(verdict.ratio);
      await expect(ratio(page).locator('xpath=following-sibling::div')).toHaveText(verdict.level);

      // Each check is a row: its threshold, then "Pass" or "Fail" for screen readers.
      const row = (label: string) => page.getByText(label, { exact: true }).locator('xpath=..');
      const word = (pass: boolean) => (pass ? 'Pass' : 'Fail');
      await expect(row('AA (4.5:1)')).toHaveText(`AA (4.5:1)${word(verdict.normalAA)}`);
      await expect(row('AAA (7:1)')).toHaveText(`AAA (7:1)${word(verdict.normalAAA)}`);
      await expect(row('AA (3:1)')).toHaveText(`AA (3:1)${word(verdict.largeAA)}`);
      await expect(row('AAA (4.5:1)')).toHaveText(`AAA (4.5:1)${word(verdict.largeAAA)}`);
    }

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'color-contrast-checker', 'Color Contrast Checker', foreground(page));
    });

    test('known colour pairs get their WCAG ratio, level and the four checks', async ({ page }) => {
      // Black on white is the largest ratio there is.
      await expectVerdict(page, {
        ratio: '21.00:1',
        level: 'AAA',
        normalAA: true,
        normalAAA: true,
        largeAA: true,
        largeAAA: true,
      });

      // #0066CC on white: luminance 0.1386, so 1.05 / 0.1886 = 5.57.
      await foreground(page).fill('#0066CC');
      await expectVerdict(page, {
        ratio: '5.57:1',
        level: 'AA',
        normalAA: true,
        normalAAA: false,
        largeAA: true,
        largeAAA: true,
      });
      await expect(sample(page)).toHaveCSS('color', 'rgb(0, 102, 204)');
      await expect(sample(page).locator('xpath=..')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

      // The well-known pair either side of AA on white: #767676 is 4.54, #777777 is 4.48.
      await foreground(page).fill('#767676');
      await expectVerdict(page, {
        ratio: '4.54:1',
        level: 'AA',
        normalAA: true,
        normalAAA: false,
        largeAA: true,
        largeAAA: true,
      });
      await foreground(page).fill('#777777');
      await expectVerdict(page, {
        ratio: '4.48:1',
        level: 'AA Large',
        normalAA: false,
        normalAAA: false,
        largeAA: true,
        largeAAA: false,
      });

      // The same colour twice has no contrast at all.
      await background(page).fill('#777777');
      await expectVerdict(page, {
        ratio: '1.00:1',
        level: 'Fail',
        normalAA: false,
        normalAAA: false,
        largeAA: false,
        largeAAA: false,
      });

      // Swapping changes which colour is the text, not the ratio.
      await foreground(page).fill('#0066CC');
      await background(page).fill('#FFFFFF');
      await page.getByRole('button', { name: 'Swap Colors' }).click();
      await expect(foreground(page)).toHaveValue('#FFFFFF');
      await expect(background(page)).toHaveValue('#0066CC');
      await expect(ratio(page)).toHaveText('5.57:1');
      await expect(sample(page)).toHaveCSS('color', 'rgb(255, 255, 255)');
      await expect(sample(page).locator('xpath=..')).toHaveCSS('background-color', 'rgb(0, 102, 204)');

      await page.getByRole('button', { name: 'Reset to Default' }).click();
      await expect(foreground(page)).toHaveValue('#000000');
      await expect(background(page)).toHaveValue('#FFFFFF');
      await expect(ratio(page)).toHaveText('21.00:1');
    });

    test('a ratio just under a threshold is never shown as meeting it', async ({ page }) => {
      // On white: #0078D7 is 4.4989, #0099FF is 2.9998 and #01681E is 6.9996.
      // Rounded to two places each would read as the threshold it misses.
      await foreground(page).fill('#0078D7');
      await expectVerdict(page, {
        ratio: '4.49:1',
        level: 'AA Large',
        normalAA: false,
        normalAAA: false,
        largeAA: true,
        largeAAA: false,
      });

      await foreground(page).fill('#0099FF');
      await expectVerdict(page, {
        ratio: '2.99:1',
        level: 'Fail',
        normalAA: false,
        normalAAA: false,
        largeAA: false,
        largeAAA: false,
      });

      await foreground(page).fill('#01681E');
      await expectVerdict(page, {
        ratio: '6.99:1',
        level: 'AA',
        normalAA: true,
        normalAAA: false,
        largeAA: true,
        largeAAA: true,
      });
    });

    test('short and hash-less HEX are read, and an unreadable colour gets an error instead of a verdict', async ({
      page,
    }) => {
      await foreground(page).fill('#FFF');
      await background(page).fill('#000');
      await expect(ratio(page)).toHaveText('21.00:1');
      await expect(sample(page)).toHaveCSS('color', 'rgb(255, 255, 255)');
      await expect(sample(page).locator('xpath=..')).toHaveCSS('background-color', 'rgb(0, 0, 0)');

      // No hash: still measured, and still painted in the preview.
      await foreground(page).fill('0066CC');
      await background(page).fill('fff');
      await expect(ratio(page)).toHaveText('5.57:1');
      await expect(sample(page)).toHaveCSS('color', 'rgb(0, 102, 204)');
      await expect(sample(page).locator('xpath=..')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

      await foreground(page).fill('#12');
      await expect(page.getByRole('status')).toHaveText(
        'Enter the foreground as a HEX color, such as #1E293B or #FFF.'
      );
      await expect(ratio(page)).toHaveCount(0);
      await expect(foreground(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(background(page)).toHaveAttribute('aria-invalid', 'false');

      await background(page).fill('white');
      await expect(page.getByRole('status')).toHaveText(
        'Enter the foreground and background as a HEX color, such as #1E293B or #FFF.'
      );

      // A ready-made pair brings the verdict back.
      await page.getByRole('button', { name: 'Blue/White' }).click();
      await expect(page.getByRole('status')).toHaveCount(0);
      await expect(foreground(page)).toHaveValue('#0066CC');
      await expect(ratio(page)).toHaveText('5.57:1');
    });

    test('the colour popover feeds the checker from a preset swatch and from typed RGB', async ({ page }) => {
      // The popover trigger has no name of its own: it is announced as the colour it shows.
      await page.getByRole('button', { name: '#000000' }).click();
      const popover = page.getByRole('dialog');

      // #EF4444 on white: luminance 0.2290, so 1.05 / 0.2790 = 3.76.
      await popover.getByRole('button', { name: '#ef4444' }).click();
      await expect(foreground(page)).toHaveValue(/^#ef4444$/i);
      await expectVerdict(page, {
        ratio: '3.76:1',
        level: 'AA Large',
        normalAA: false,
        normalAAA: false,
        largeAA: true,
        largeAAA: false,
      });

      await popover.getByPlaceholder('255, 255, 255').fill('0, 102, 204');
      await expect(foreground(page)).toHaveValue(/^#0066cc$/i);
      await expect(ratio(page)).toHaveText('5.57:1');
      await expect(sample(page)).toHaveCSS('color', 'rgb(0, 102, 204)');

      await page.keyboard.press('Escape');
      await expect(popover).toBeHidden();
    });

    test('the colour popover picks the colour under the pointer', async ({ page }) => {
      test.fixme(
        true,
        'ui/color-picker.tsx paints a saturation/brightness (HSV) square but reads the pointer as HSL saturation/lightness: the pure-red corner picks #FFFFFF'
      );
      await page.getByRole('button', { name: '#000000' }).click();
      const popover = page.getByRole('dialog');

      // Black has hue 0, so the square runs from white (top left) to pure red
      // (top right) with black along the bottom.
      await expect(popover.getByRole('slider', { name: 'Hue' })).toHaveValue('0');
      // The square has no role or name; its crosshair cursor is the only handle on it.
      await dragPastCorner(page, popover.locator('.cursor-crosshair'), 'top-right');

      await expect(foreground(page)).toHaveValue(/^#ff0000$/i);
    });
  });

  // ── Glassmorphism Generator ─────────────────────────────────────────────────

  test.describe('Glassmorphism Generator', () => {
    // The generated code is a <pre>, which has no role to find it by.
    const code = (page: Page) => page.locator('pre');
    // The preview card is the nearest styled block around the mock credit card.
    const card = (page: Page) =>
      page.getByText('Premium Platinum', { exact: true }).locator('xpath=ancestor::div[@style][1]');
    const overlayHex = (page: Page) => page.getByRole('textbox', { name: 'Background overlay color HEX' });
    const preset = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

    // "Frosted Light", the starting point, as its controls read: 15% white,
    // 16px blur at 100% saturation, a 1px 25% white border, 16px corners and a
    // 0 / 8 / 24 / 0 shadow of 10% black.
    const FROSTED_CSS = [
      '.glass-card {',
      '  background: rgba(255, 255, 255, 0.15);',
      '  backdrop-filter: blur(16px) saturate(100%);',
      '  -webkit-backdrop-filter: blur(16px) saturate(100%);',
      '  border: 1px solid rgba(255, 255, 255, 0.25);',
      '  border-radius: 16px;',
      '  box-shadow: 0px 8px 24px 0px rgba(0, 0, 0, 0.1);',
      '}',
    ].join('\n');

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'glassmorphism-generator', 'Glassmorphism Generator', overlayHex(page));
    });

    test('the controls drive the CSS, Tailwind and React code and the preview card', async ({ page }) => {
      await expectExactText(code(page), FROSTED_CSS);
      await expect(card(page)).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.15)');

      // Overlay: #336699 is (51, 102, 153), at 40%.
      const overlay = overlayHex(page);
      await overlay.press('ControlOrMeta+a');
      await overlay.pressSequentially('#336699');
      const overlaySection = page
        .locator('div')
        .filter({ has: page.getByRole('heading', { name: 'Background Overlay', exact: true }) })
        .last();
      await pressOn(sliderBeside(page, 'OPACITY', overlaySection), 'Home', 'PageUp', 'PageUp', 'PageUp', 'PageUp');
      await expect(overlaySection.getByText('40%', { exact: true })).toBeVisible();

      // Filters to their maximum: 40px blur, 200% saturation.
      await pressOn(sliderBeside(page, 'BACKDROP BLUR'), 'End');
      await pressOn(sliderBeside(page, 'SATURATION'), 'End');
      await expect(page.getByText('40px', { exact: true })).toBeVisible();
      await expect(page.getByText('200%', { exact: true })).toBeVisible();

      // No border, four different corners, a shadow moved up and to the left.
      await page.getByRole('switch', { name: 'Enable glass border' }).click();
      await expect(page.getByRole('textbox', { name: 'Border color HEX' })).toHaveCount(0);
      await page.getByRole('checkbox', { name: 'Split Corners' }).click();
      await page.getByRole('spinbutton', { name: 'Top Left radius' }).fill('30');
      await page.getByRole('spinbutton', { name: 'Top Right radius' }).fill('8');
      await page.getByRole('spinbutton', { name: 'Bottom Right radius' }).fill('12');
      await page.getByRole('spinbutton', { name: 'Bottom Left radius' }).fill('0');
      await page.getByRole('spinbutton', { name: 'Shadow offset X' }).fill('-5');
      await page.getByRole('spinbutton', { name: 'Shadow offset Y' }).fill('12');

      await expectExactText(
        code(page),
        [
          '.glass-card {',
          '  background: rgba(51, 102, 153, 0.4);',
          '  backdrop-filter: blur(40px) saturate(200%);',
          '  -webkit-backdrop-filter: blur(40px) saturate(200%);',
          '  border-radius: 30px 8px 12px 0px;',
          '  box-shadow: -5px 12px 24px 0px rgba(0, 0, 0, 0.1);',
          '}',
        ].join('\n')
      );

      // The preview is styled the same way (it eases into the new values).
      await expect(card(page)).toHaveCSS('background-color', 'rgba(51, 102, 153, 0.4)');
      await expect(card(page)).toHaveCSS('backdrop-filter', 'blur(40px) saturate(2)');
      await expect(card(page)).toHaveCSS('border-top-style', 'none');
      await expect(card(page)).toHaveCSS('border-top-left-radius', '30px');
      await expect(card(page)).toHaveCSS('border-top-right-radius', '8px');
      await expect(card(page)).toHaveCSS('border-bottom-right-radius', '12px');
      await expect(card(page)).toHaveCSS('border-bottom-left-radius', '0px');
      await expect(card(page)).toHaveCSS('box-shadow', 'rgba(0, 0, 0, 0.1) -5px 12px 24px 0px');

      // Tailwind: arbitrary values without spaces, the backdrop (not the content)
      // saturated, and a JSX comment to go with the JSX className.
      await page.getByRole('tab', { name: 'Tailwind' }).click();
      await expectExactText(
        code(page),
        [
          '<div className="bg-[rgba(51,102,153,0.4)] backdrop-blur-[40px] backdrop-saturate-[200%] rounded-tl-[30px] rounded-tr-[8px] rounded-br-[12px] rounded-bl-[0px] shadow-[-5px_12px_24px_0px_rgba(0,0,0,0.1)]">',
          '  {/* Card Content */}',
          '</div>',
        ].join('\n')
      );

      await page.getByRole('tab', { name: 'React' }).click();
      const react = [
        'const glassStyle = {',
        '  background: "rgba(51, 102, 153, 0.4)",',
        '  backdropFilter: "blur(40px) saturate(200%)",',
        '  WebkitBackdropFilter: "blur(40px) saturate(200%)",',
        '  border: "none",',
        '  borderRadius: "30px 8px 12px 0px",',
        '  boxShadow: "-5px 12px 24px 0px rgba(0, 0, 0, 0.1)"',
        '};',
        '',
        '// Usage:',
        '// <div style={glassStyle}>Card</div>',
      ].join('\n');
      await expectExactText(code(page), react);
      await expectCopies(page, page.getByRole('button', { name: 'Copy code' }), react);
    });

    test('a preset replaces every setting, the shadow can be switched off, and reset returns to Frosted Light', async ({
      page,
    }) => {
      await expect(preset(page, 'Frosted Light')).toHaveAttribute('aria-pressed', 'true');

      // Neon Glow, as its controls then read: #ec4899 (236, 72, 153) at 10%, 12px
      // blur at 150%, a 1.5px #f43f5e (244, 63, 94) border at 40%, 24px corners
      // and a 0 / 4 / 25 / 2 shadow of 15% #ec4899.
      await preset(page, 'Neon Glow').click();
      await expect(preset(page, 'Neon Glow')).toHaveAttribute('aria-pressed', 'true');
      await expect(preset(page, 'Frosted Light')).toHaveAttribute('aria-pressed', 'false');
      await expect(overlayHex(page)).toHaveValue('#ec4899');
      await expect(page.getByRole('textbox', { name: 'Border color HEX' })).toHaveValue('#f43f5e');
      await expect(page.getByText('1.5px', { exact: true })).toBeVisible();
      await expectExactText(
        code(page),
        [
          '.glass-card {',
          '  background: rgba(236, 72, 153, 0.1);',
          '  backdrop-filter: blur(12px) saturate(150%);',
          '  -webkit-backdrop-filter: blur(12px) saturate(150%);',
          '  border: 1.5px solid rgba(244, 63, 94, 0.4);',
          '  border-radius: 24px;',
          '  box-shadow: 0px 4px 25px 2px rgba(236, 72, 153, 0.15);',
          '}',
        ].join('\n')
      );

      // Without its shadow the card no longer matches the preset.
      await page.getByRole('switch', { name: 'Enable drop shadow' }).click();
      await expect(page.getByRole('textbox', { name: 'Shadow color HEX' })).toHaveCount(0);
      await expect(preset(page, 'Neon Glow')).toHaveAttribute('aria-pressed', 'false');
      await expect(card(page)).toHaveCSS('box-shadow', 'none');
      await page.getByRole('tab', { name: 'Tailwind' }).click();
      await expectExactText(
        code(page),
        [
          '<div className="bg-[rgba(236,72,153,0.1)] backdrop-blur-[12px] backdrop-saturate-[150%] border-[1.5px] border-[rgba(244,63,94,0.4)] rounded-[24px]">',
          '  {/* Card Content */}',
          '</div>',
        ].join('\n')
      );

      await page.getByRole('button', { name: 'Reset Styles to Frosted Light' }).click();
      await expect(preset(page, 'Frosted Light')).toHaveAttribute('aria-pressed', 'true');
      // White and black use Tailwind's named colours; 100% saturation needs no utility.
      await expectExactText(
        code(page),
        [
          '<div className="bg-white/[0.15] backdrop-blur-[16px] border-[1px] border-white/[0.25] rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]">',
          '  {/* Card Content */}',
          '</div>',
        ].join('\n')
      );
      await page.getByRole('tab', { name: 'CSS' }).click();
      await expectExactText(code(page), FROSTED_CSS);

      // The mock-up inside the card and the backdrop behind it can be switched.
      await page.getByRole('button', { name: 'Login form mockup' }).click();
      await expect(page.getByText('Welcome Back', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'sunset gradient' }).click();
      await expect(page.getByRole('button', { name: 'sunset gradient' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'drifting blobs' })).toHaveAttribute('aria-pressed', 'false');
    });

    test('a half-typed or unreadable colour never reaches the preview or the code', async ({ page }) => {
      const overlay = overlayHex(page);

      // "#ff00" is not a colour yet (as CSS it would be a transparent yellow).
      await overlay.fill('#ff00');
      await expect(overlay).toHaveAttribute('aria-invalid', 'true');
      await expectExactText(code(page), FROSTED_CSS);
      await expect(card(page)).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.15)');

      // Leaving the field puts the colour in use back.
      await overlay.blur();
      await expect(overlay).toHaveValue('#ffffff');
      await expect(overlay).toHaveAttribute('aria-invalid', 'false');

      // The popover accepts "none" for other tools; the glass needs a real colour.
      // Its trigger is announced only as the colour it shows; the overlay's comes first.
      await page.getByRole('button', { name: '#ffffff' }).first().click();
      const popover = page.getByRole('dialog');
      await popover.getByPlaceholder('#FFFFFF').fill('none');
      await expectExactText(code(page), FROSTED_CSS);

      // A swatch from the popover does land: #ef4444 is (239, 68, 68).
      await popover.getByRole('button', { name: '#ef4444' }).click();
      await expect(overlay).toHaveValue(/^#ef4444$/i);
      await expectExactText(code(page), FROSTED_CSS.replace('rgba(255, 255, 255, 0.15)', 'rgba(239, 68, 68, 0.15)'));
      await expect(card(page)).toHaveCSS('background-color', 'rgba(239, 68, 68, 0.15)');
    });

    test('on a desktop-width screen the controls sit beside the playground', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });

      const playground = await page.getByText('Live Playground', { exact: true }).boundingBox();
      const controls = await page.getByText('Customize Effect', { exact: true }).boundingBox();
      if (!playground || !controls) throw new Error('The generator is not on screen');

      // "Drag sliders on the right": the panel is the second column, level with the playground.
      expect(controls.x).toBeGreaterThan(playground.x + 300);
      expect(Math.abs(controls.y - playground.y)).toBeLessThan(100);
    });
  });

  // ── CSS Box Shadow Generator ────────────────────────────────────────────────

  test.describe('CSS Box Shadow Generator', () => {
    // The CSS is a <pre> and the Tailwind class a plain block; neither has a role.
    const css = (page: Page) => page.locator('pre');
    const utility = (page: Page) => page.getByText(/^shadow-/);
    // The box being styled is the nearest styled block around its caption; the canvas is its parent.
    const box = (page: Page) =>
      page.getByText('Target Box', { exact: true }).locator('xpath=ancestor::div[@style][1]');
    const canvas = (page: Page) => box(page).locator('xpath=..');
    const layer = (page: Page, name: RegExp) => page.getByRole('button', { name });
    const shadowHex = (page: Page) => page.getByRole('textbox', { name: 'Shadow color HEX' });

    // The two starting layers, as their rows read: "Main Shadow" 0 / 8 / 16 / -4
    // at 15% black and "Ambient Occlusion" 0 / 2 / 4 / -2 at 10% black.
    const MAIN = '0px 8px 16px -4px rgba(0, 0, 0, 0.15)';
    const AMBIENT = '0px 2px 4px -2px rgba(0, 0, 0, 0.1)';
    const DEFAULT_CSS = `box-shadow: ${MAIN},\n  ${AMBIENT};`;
    const DEFAULT_UTILITY = 'shadow-[0px_8px_16px_-4px_rgba(0,0,0,0.15),0px_2px_4px_-2px_rgba(0,0,0,0.1)]';

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'box-shadow-generator', 'CSS Box Shadow Generator', shadowHex(page));
    });

    test('editing the selected layer rebuilds the CSS value, the Tailwind class and the preview', async ({
      page,
    }) => {
      await expectExactText(css(page), DEFAULT_CSS);
      await expect(utility(page)).toHaveText(DEFAULT_UTILITY);
      await expect(box(page)).toHaveCSS(
        'box-shadow',
        'rgba(0, 0, 0, 0.15) 0px 8px 16px -4px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px'
      );
      await expect(layer(page, /^Main Shadow/)).toHaveAttribute('aria-pressed', 'true');

      // Turn Main Shadow into an inset #336699 (51, 102, 153) shadow: X to its
      // maximum 100, Y to its minimum -100, blur 0 + 2 * 10, spread to its minimum -50.
      const colour = shadowHex(page);
      await colour.press('ControlOrMeta+a');
      await colour.pressSequentially('#336699');
      await page.getByRole('switch', { name: 'Inset shadow' }).click();
      await pressOn(sliderBeside(page, 'Offset X'), 'End');
      await pressOn(sliderBeside(page, 'Offset Y'), 'Home');
      await pressOn(sliderBeside(page, 'Blur Radius'), 'Home', 'PageUp', 'PageUp');
      await pressOn(sliderBeside(page, 'Spread Radius'), 'Home');
      await pressOn(sliderBeside(page, 'Opacity'), 'End');

      await expectExactText(
        css(page),
        `box-shadow: inset 100px -100px 20px -50px rgba(51, 102, 153, 1),\n  ${AMBIENT};`
      );
      await expect(utility(page)).toHaveText(
        'shadow-[inset_100px_-100px_20px_-50px_rgba(51,102,153,1),0px_2px_4px_-2px_rgba(0,0,0,0.1)]'
      );
      await expect(box(page)).toHaveCSS(
        'box-shadow',
        'rgb(51, 102, 153) 100px -100px 20px -50px inset, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px'
      );
      await expect(layer(page, /^Main Shadow inset 100px -100px 20px -50px$/)).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      // 100% - 4 * 10 - 3 = 57%, which must print as 0.57 and nothing longer.
      await pressOn(sliderBeside(page, 'Opacity'), 'PageDown', 'PageDown', 'PageDown', 'PageDown');
      await pressOn(sliderBeside(page, 'Opacity'), 'ArrowLeft', 'ArrowLeft', 'ArrowLeft');
      await expect(page.getByText('57%', { exact: true })).toBeVisible();
      const editedCss = `box-shadow: inset 100px -100px 20px -50px rgba(51, 102, 153, 0.57),\n  ${AMBIENT};`;
      const editedUtility =
        'shadow-[inset_100px_-100px_20px_-50px_rgba(51,102,153,0.57),0px_2px_4px_-2px_rgba(0,0,0,0.1)]';
      await expectExactText(css(page), editedCss);
      await expect(utility(page)).toHaveText(editedUtility);

      // A quick colour replaces the layer colour: #EF4444 is (239, 68, 68).
      await page.getByRole('button', { name: 'Select color #EF4444' }).click();
      await expect(colour).toHaveValue('#EF4444');
      await expect(utility(page)).toHaveText(editedUtility.replace('51,102,153', '239,68,68'));

      // Renaming shows in the layer list and the panel title.
      await page.getByRole('textbox', { name: 'Layer name' }).fill('Glow');
      await expect(layer(page, /^Glow inset/)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText('Properties: Glow', { exact: true })).toBeVisible();

      const finalCss = editedCss.replace('51, 102, 153', '239, 68, 68');
      await expectCopies(page, page.getByRole('button', { name: 'Copy CSS' }), finalCss);
      await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
      await expectCopies(
        page,
        page.getByRole('button', { name: 'Copy Class' }),
        editedUtility.replace('51,102,153', '239,68,68')
      );
    });

    test('layers can be hidden per row, added, reordered, walked with the arrow keys and deleted', async ({
      page,
    }) => {
      // Every row's buttons carry the same names, so rows are addressed by position.
      const hide = page.getByRole('button', { name: 'Hide Layer' });
      const show = page.getByRole('button', { name: 'Show Layer' });

      // Main Shadow is selected; the eye on the second row must hide the second layer.
      await hide.nth(1).click();
      await expectExactText(css(page), `box-shadow: ${MAIN};`);
      await expect(utility(page)).toHaveText('shadow-[0px_8px_16px_-4px_rgba(0,0,0,0.15)]');
      await expect(box(page)).toHaveCSS('box-shadow', 'rgba(0, 0, 0, 0.15) 0px 8px 16px -4px');

      // With every layer hidden there is no shadow at all.
      await hide.click();
      await expectExactText(css(page), 'box-shadow: none;');
      await expect(utility(page)).toHaveText('shadow-none');
      await expect(box(page)).toHaveCSS('box-shadow', 'none');
      await show.first().click();
      await show.click();
      await expectExactText(css(page), DEFAULT_CSS);

      // A new layer goes to the end of the list, selected: 0 / 4 / 8 / 0 at 15% black.
      const ADDED = '0px 4px 8px 0px rgba(0, 0, 0, 0.15)';
      await page.getByRole('button', { name: 'Add Layer' }).click();
      await expect(layer(page, /^Shadow Layer 3 0px 4px 8px 0px$/)).toHaveAttribute('aria-pressed', 'true');
      await expectExactText(css(page), `box-shadow: ${MAIN},\n  ${AMBIENT},\n  ${ADDED};`);

      // Moved up twice it is painted first.
      const moveUp = page.getByRole('button', { name: 'Move Layer Up' });
      await moveUp.nth(2).click();
      await moveUp.nth(1).click();
      await expect(moveUp.first()).toBeDisabled();
      await expectExactText(css(page), `box-shadow: ${ADDED},\n  ${MAIN},\n  ${AMBIENT};`);
      await expect(utility(page)).toHaveText(
        'shadow-[0px_4px_8px_0px_rgba(0,0,0,0.15),0px_8px_16px_-4px_rgba(0,0,0,0.15),0px_2px_4px_-2px_rgba(0,0,0,0.1)]'
      );

      // Arrow keys walk the list, taking the selection and the focus with them.
      await layer(page, /^Shadow Layer 3/).focus();
      await page.keyboard.press('ArrowDown');
      await expect(layer(page, /^Main Shadow/)).toHaveAttribute('aria-pressed', 'true');
      await expect(layer(page, /^Main Shadow/)).toBeFocused();
      await expect(page.getByText('Properties: Main Shadow', { exact: true })).toBeVisible();
      await page.keyboard.press('ArrowUp');
      await expect(layer(page, /^Shadow Layer 3/)).toHaveAttribute('aria-pressed', 'true');

      // Deleting the selected layer selects the first one left; the last layer stays.
      const remove = page.getByRole('button', { name: 'Delete Layer' });
      await remove.first().click();
      await expect(layer(page, /^Main Shadow/)).toHaveAttribute('aria-pressed', 'true');
      await expectExactText(css(page), DEFAULT_CSS);
      await remove.first().click();
      await expectExactText(css(page), `box-shadow: ${AMBIENT};`);
      await expect(page.getByText('Properties: Ambient Occlusion', { exact: true })).toBeVisible();
      await expect(remove).toHaveCount(1);
      await expect(remove).toBeDisabled();
    });

    test('dragging the box moves the selected layer; other gestures, bad colours and the canvas controls leave the shadow alone', async ({
      page,
    }) => {
      // 12px right and 6px up from an offset of 0 / 8.
      await dragBy(page, box(page), 12, -6);
      const dragged = `box-shadow: 12px 2px 16px -4px rgba(0, 0, 0, 0.15),\n  ${AMBIENT};`;
      await expectExactText(css(page), dragged);
      await expect(layer(page, /^Main Shadow 12px 2px 16px -4px$/)).toBeVisible();

      // Only the main button drags.
      await dragBy(page, box(page), 30, 30, 'right');
      await page.keyboard.press('Escape');
      await expectExactText(css(page), dragged);

      // Offsets stop at the slider's limit of 100.
      await dragBy(page, box(page), 150, 0);
      const clamped = `box-shadow: 100px 2px 16px -4px rgba(0, 0, 0, 0.15),\n  ${AMBIENT};`;
      await expectExactText(css(page), clamped);

      // A colour name is not a HEX colour: the shadow keeps its colour and the field recovers.
      const colour = shadowHex(page);
      await colour.fill('red');
      await expect(colour).toHaveAttribute('aria-invalid', 'true');
      await expectExactText(css(page), clamped);
      await colour.blur();
      await expect(colour).toHaveValue('#000000');

      // The canvas backdrop buttons are on the canvas but do not drag.
      await page.getByRole('button', { name: 'Canvas: Dark' }).click();
      await expect(page.getByRole('button', { name: 'Canvas: Dark' })).toHaveAttribute('aria-pressed', 'true');
      await expect(canvas(page)).toHaveCSS('background-color', 'rgb(15, 23, 42)');
      await expectExactText(css(page), clamped);

      // Neither does the custom colour popover: #22c55e is (34, 197, 94).
      await page.getByRole('button', { name: '#E2E8F0' }).click();
      const popover = page.getByRole('dialog');
      await popover.getByRole('button', { name: '#22c55e' }).click();
      await expect(canvas(page)).toHaveCSS('background-color', 'rgb(34, 197, 94)');
      await expect(page.getByRole('button', { name: 'Canvas: Dark' })).toHaveAttribute('aria-pressed', 'false');
      // The popover's colour square has no role or name; its crosshair cursor is the only handle on it.
      await dragBy(page, popover.locator('.cursor-crosshair'), 30, 20);
      await expectExactText(css(page), clamped);
      await page.keyboard.press('Escape');
      await expect(popover).toBeHidden();

      // Reset puts everything back, the custom canvas colour included.
      await page.getByRole('button', { name: 'Reset Workspace' }).click();
      await expectExactText(css(page), DEFAULT_CSS);
      await expect(utility(page)).toHaveText(DEFAULT_UTILITY);
      await expect(canvas(page)).toHaveCSS('background-color', 'rgb(248, 250, 252)');
      await expect(page.getByRole('button', { name: 'Canvas: Light' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: '#E2E8F0' })).toBeVisible();
    });

    test('on a desktop-width screen the canvas sits beside the controls', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });

      const layers = await page.getByText('Shadow Layers', { exact: true }).boundingBox();
      const preview = await page.getByText('Interactive Canvas', { exact: true }).boundingBox();
      if (!layers || !preview) throw new Error('The generator is not on screen');

      // The canvas is the second column, level with the first control card.
      expect(preview.x).toBeGreaterThan(layers.x + 300);
      expect(Math.abs(preview.y - layers.y)).toBeLessThan(100);
    });
  });

  // ── SVG Path Editor ─────────────────────────────────────────────────────────

  test.describe('SVG Path Editor', () => {
    const pathData = (page: Page) => page.getByRole('textbox', { name: 'SVG path data' });
    // The optimized path is a <pre>, which has no role to find it by.
    const optimized = (page: Page) => page.locator('pre');
    const preview = (page: Page) => page.getByRole('img', { name: 'Path preview' });
    // A figure in the analysis card is the block under its caption.
    const figure = (page: Page, caption: string) =>
      page.getByText(caption, { exact: true }).locator('xpath=following-sibling::div');
    const drawnLength = (page: Page) =>
      preview(page)
        .locator('path')
        .evaluate((path: SVGPathElement) => path.getTotalLength());

    async function downloadSvg(page: Page): Promise<{ name: string; text: string }> {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download SVG' }).click(),
      ]);
      return { name: download.suggestedFilename(), text: await readFile(await download.path(), 'utf8') };
    }

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'svg-path-editor', 'SVG Path Editor/Optimizer', pathData(page));
    });

    test('analyses a path and shortens it without changing what it draws', async ({ page }) => {
      // The starting square, "M 10 10 H 90 V 90 H 10 L 10 10": 30 characters, 21
      // once the optional spaces go, which is 9 / 30 = 30.0% smaller.
      await expect(optimized(page)).toHaveText('M10 10H90V90H10L10 10');
      await expect(page.getByText('21 characters (30.0% smaller)', { exact: true })).toBeVisible();
      await expect(figure(page, 'Total Commands')).toHaveText('5');
      await expect(figure(page, 'Path Length')).toHaveText('30 characters');
      await expect(figure(page, 'Command Types')).toHaveText('4');
      await expect(page.getByText('H: 2', { exact: true })).toBeVisible();

      // Trailing zeros, leading zeros and a plus sign: 33 characters in, 20 out
      // (13 / 33 = 39.4%), and every decimal point that matters still there.
      const verbose = 'M 10.50 20.0 L 0.5 -0.25 L +5 5 Z';
      const short = 'M10.5 20L.5-.25L5 5Z';
      await pathData(page).fill(verbose);
      await expect(optimized(page)).toHaveText(short);
      await expect(page.getByText('20 characters (39.4% smaller)', { exact: true })).toBeVisible();
      await expect(figure(page, 'Total Commands')).toHaveText('4');
      await expect(figure(page, 'Path Length')).toHaveText('33 characters');
      await expect(figure(page, 'Command Types')).toHaveText('3');
      for (const count of ['M: 1', 'L: 2', 'Z: 1']) {
        await expect(page.getByText(count, { exact: true })).toBeVisible();
      }
      await expect(preview(page).locator('path')).toHaveAttribute('d', verbose);
      const lengthBefore = await drawnLength(page);

      await expectCopies(page, page.getByRole('button', { name: 'Copy optimized path' }), short);

      // "Use" swaps the short form in; the browser draws the same outline from it.
      await page.getByRole('button', { name: 'Use optimized path' }).click();
      await expect(pathData(page)).toHaveValue(short);
      await expect(preview(page).locator('path')).toHaveAttribute('d', short);
      await expect(page.getByText('20 characters (0.0% smaller)', { exact: true })).toBeVisible();
      await expect(figure(page, 'Path Length')).toHaveText('20 characters');
      expect(lengthBefore).toBeGreaterThan(40);
      expect(await drawnLength(page)).toBeCloseTo(lengthBefore, 3);

      // A number that starts with a point needs no space after one that already has a point.
      await pathData(page).fill('M 1.5 .5 l -.5 .5');
      await expect(optimized(page)).toHaveText('M1.5.5l-.5.5');

      // Curves and an arc: commas and spaces go, the arc's two flags stay apart.
      await pathData(page).fill(
        'M10,10 C 20,20 40,20 50,10 S 80,0 90,10 Q 100 20 110 10 T 130 10 A 5 5 0 0 1 140 20 z'
      );
      await expect(optimized(page)).toHaveText(
        'M10 10C20 20 40 20 50 10S80 0 90 10Q100 20 110 10T130 10A5 5 0 0 1 140 20z'
      );
      await expect(figure(page, 'Total Commands')).toHaveText('7');
      await expect(figure(page, 'Command Types')).toHaveText('7');
    });

    test('downloads the path as a standalone SVG with the chosen viewBox, stroke and fill', async ({ page }) => {
      const viewBox = page.getByRole('textbox', { name: 'ViewBox' });
      const stroke = page.getByRole('textbox', { name: 'Stroke Color' });

      await pathData(page).fill('M 100 100 L 300 100 L 200 300 z');
      await viewBox.fill('0 0 400 400');
      await page.getByRole('spinbutton', { name: 'Stroke Width' }).fill('3.5');
      await stroke.fill('#ff0000');
      await page.getByRole('textbox', { name: 'Fill Color' }).fill('#00ff00');

      await expect(preview(page)).toHaveAttribute('viewBox', '0 0 400 400');
      const drawn = preview(page).locator('path');
      await expect(drawn).toHaveAttribute('stroke', '#ff0000');
      await expect(drawn).toHaveAttribute('stroke-width', '3.5');
      await expect(drawn).toHaveAttribute('fill', '#00ff00');

      const file = await downloadSvg(page);
      expect(file.name).toBe('path.svg');
      expect(file.text).toBe(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">\n' +
          '  <path d="M 100 100 L 300 100 L 200 300 z" stroke="#ff0000" stroke-width="3.5" fill="#00ff00"/>\n' +
          '</svg>'
      );

      // A quote, an ampersand or an angle bracket in a field must not break the file.
      await stroke.fill('a"b&c<d');
      const awkward = await downloadSvg(page);
      expect(awkward.text).toContain('stroke="a&quot;b&amp;c&lt;d"');
      const parsed = await page.evaluate((xml) => {
        const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
        return {
          wellFormed: doc.querySelector('parsererror') === null,
          stroke: doc.querySelector('path')?.getAttribute('stroke'),
        };
      }, awkward.text);
      expect(parsed).toEqual({ wellFormed: true, stroke: 'a"b&c<d' });

      // A viewBox that is not four numbers is called out and left out of the file.
      await stroke.fill('#000000');
      await viewBox.fill('0 0 100');
      await expect(page.getByText('ViewBox needs four numbers: min-x min-y width height.')).toBeVisible();
      await expect(viewBox).toHaveAttribute('aria-invalid', 'true');
      const noViewBox = await downloadSvg(page);
      expect(noViewBox.text).toBe(
        '<svg xmlns="http://www.w3.org/2000/svg">\n' +
          '  <path d="M 100 100 L 300 100 L 200 300 z" stroke="#000000" stroke-width="3.5" fill="#00ff00"/>\n' +
          '</svg>'
      );
    });

    test('unreadable path data is reported, and an empty editor offers nothing to download', async ({ page }) => {
      const error = page.getByRole('status');

      await pathData(page).fill('hello world');
      await expect(error).toHaveText('Error: Path data must start with a move command (M or m).');
      await expect(pathData(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(optimized(page)).toHaveCount(0);
      await expect(page.getByText('Optimized Path', { exact: true })).toHaveCount(0);

      // The "L" is the 9th character and has one number where it needs two.
      await pathData(page).fill('M 10 10 L 20');
      await expect(error).toHaveText('Error: Command "L" at character 9 takes 2 numbers at a time, but has 1.');

      // The "2" is the 17th character, where an arc's large-arc flag goes.
      await pathData(page).fill('M 10 10 A 5 5 0 2 1 20 20');
      await expect(error).toHaveText('Error: Arc flags must be 0 or 1, but found "2" at character 17.');
      await expect(optimized(page)).toHaveCount(0);

      // Corrected, the error goes and the path is optimized again.
      await pathData(page).fill('M 10 10 A 5 5 0 0 1 20 20');
      await expect(error).toHaveCount(0);
      await expect(pathData(page)).toHaveAttribute('aria-invalid', 'false');
      await expect(optimized(page)).toHaveText('M10 10A5 5 0 0 1 20 20');

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(pathData(page)).toHaveValue('');
      await expect(error).toHaveCount(0);
      await expect(preview(page)).toHaveCount(0);
      await expect(page.getByText('Path Analysis', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Download SVG' })).toBeDisabled();

      // Spaces alone are not a path either.
      await pathData(page).fill('   ');
      await expect(page.getByRole('button', { name: 'Download SVG' })).toBeDisabled();
      await expect(preview(page)).toHaveCount(0);
    });
  });

  // ── CSS Clamp Calculator ────────────────────────────────────────────────────

  test.describe('CSS Clamp Calculator', () => {
    const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
    // The value of one "Generated Outputs" box is the block after its header row.
    const output = (page: Page, label: string) =>
      page.getByRole('button', { name: `Copy ${label}`, exact: true }).locator('xpath=../following-sibling::div');
    const graph = (page: Page) =>
      page.getByRole('img', { name: 'Graph of the computed size across viewport widths' });
    // The simulator slider has no accessible name; it is the only slider on the page.
    const simulator = (page: Page) => page.getByRole('slider');

    interface Outputs {
      clamp: string;
      css: string;
      tailwind: string;
      scss: string;
    }

    /** The four forms of one clamp() value: bare, CSS rule, Tailwind class (no spaces) and Sass variable. */
    function forms(clamp: string, property = 'font-size', utility = 'text-'): Outputs {
      return {
        clamp,
        css: `${property}: ${clamp};`,
        tailwind: `${utility}[${utility ? '' : `${property}:`}${clamp.replace(/ /g, '')}]`,
        scss: `$${property}-fluid: ${clamp};`,
      };
    }

    async function expectOutputs(page: Page, expected: Outputs): Promise<void> {
      await expect(output(page, 'Clamp Function')).toHaveText(expected.clamp);
      await expect(output(page, 'Full CSS Rule')).toHaveText(expected.css);
      await expect(output(page, 'Tailwind Class')).toHaveText(expected.tailwind);
      await expect(output(page, 'SCSS / Sass')).toHaveText(expected.scss);
    }

    async function setRange(page: Page, minSize: string, maxSize: string, minViewport: string, maxViewport: string) {
      await field(page, 'Min size').fill(minSize);
      await field(page, 'Max size').fill(maxSize);
      await field(page, 'Min viewport width').fill(minViewport);
      await field(page, 'Max viewport width').fill(maxViewport);
    }

    // 16px at 320px to 32px at 1200px, in rem with a 16px root: the size grows
    // 16px over 880px, 1.8182vw, and would be 16 - 320 * 16 / 880 = 10.1818px
    // (0.6364rem) at a 0px viewport.
    const DEFAULTS: Outputs = {
      clamp: 'clamp(1rem, 0.6364rem + 1.8182vw, 2rem)',
      css: 'font-size: clamp(1rem, 0.6364rem + 1.8182vw, 2rem);',
      tailwind: 'text-[clamp(1rem,0.6364rem+1.8182vw,2rem)]',
      scss: '$font-size-fluid: clamp(1rem, 0.6364rem + 1.8182vw, 2rem);',
    };

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'clamp-calculator', 'CSS Clamp Calculator', field(page, 'Min size'));
    });

    test('turns two sizes at two viewport widths into clamp() and its CSS, Tailwind and Sass forms', async ({
      page,
    }) => {
      await expectOutputs(page, DEFAULTS);
      // At the simulated 800px: 16 + (480 / 880) * 16 = 24.73px, 1.545rem.
      await expect(page.getByText('24.73px / 1.545rem', { exact: true })).toBeVisible();

      // 20px at 400px to 40px at 1200px: 20px over 800px is 2.5vw, and
      // 20 - 400 * 0.025 = 10px at a 0px viewport.
      await choose(page, 'Output unit', 'px');
      await setRange(page, '20', '40', '400', '1200');
      await expectOutputs(page, {
        clamp: 'clamp(20px, 10px + 2.5vw, 40px)',
        css: 'font-size: clamp(20px, 10px + 2.5vw, 40px);',
        tailwind: 'text-[clamp(20px,10px+2.5vw,40px)]',
        scss: '$font-size-fluid: clamp(20px, 10px + 2.5vw, 40px);',
      });

      // The simulator follows the same line and stops at both ends:
      // 800px gives 10 + 20 = 30px, 200px is held at 20px, 2000px at 40px.
      await expect(page.getByText('30px / 1.875rem', { exact: true })).toBeVisible();
      await expect(page.getByText('Fluid Typography', { exact: true })).toHaveCSS('font-size', '30px');
      await pressOn(simulator(page), 'Home');
      await expect(page.getByText('200px', { exact: true })).toBeVisible();
      await expect(page.getByText('20px / 1.25rem', { exact: true })).toBeVisible();
      await pressOn(simulator(page), 'End');
      await expect(page.getByText('2000px', { exact: true })).toBeVisible();
      await expect(page.getByText('40px / 2.5rem', { exact: true })).toBeVisible();
      await expect(page.getByText('Fluid Typography', { exact: true })).toHaveCSS('font-size', '40px');

      // The same range in rem: every px figure divided by 16.
      await choose(page, 'Output unit', 'rem (Recommended)');
      const inRem = forms('clamp(1.25rem, 0.625rem + 2.5vw, 2.5rem)');
      await expectOutputs(page, inRem);
      await expectCopies(page, page.getByRole('button', { name: 'Copy Clamp Function', exact: true }), inRem.clamp);
      await expectCopies(page, page.getByRole('button', { name: 'Copy Full CSS Rule', exact: true }), inRem.css);
      await expectCopies(page, page.getByRole('button', { name: 'Copy Tailwind Class', exact: true }), inRem.tailwind);
      await expectCopies(page, page.getByRole('button', { name: 'Copy SCSS / Sass', exact: true }), inRem.scss);

      // The graph spans 200px to 1400px (a quarter of the range on each side)
      // across 420 of its 500 units, starting 60 in. A click a quarter of the
      // way along is 500px, where the size is 10 + 12.5 = 22.5px.
      const chart = graph(page);
      await chart.scrollIntoViewIfNeeded();
      const area = await chart.boundingBox();
      if (!area) throw new Error('The graph is not on screen');
      await chart.click({ position: { x: (area.width * (60 + 105)) / 500, y: area.height / 2 } });
      const width = Number(
        (await page.getByText('Simulated Screen Width', { exact: true }).locator('xpath=following-sibling::*').innerText()).replace('px', '')
      );
      // Allow a pixel or two for where the click lands.
      expect(width).toBeGreaterThanOrEqual(497);
      expect(width).toBeLessThanOrEqual(503);
      const size = Math.round((10 + width * 0.025) * 100) / 100;
      await expect(page.getByText(new RegExp(`^${String(size).replace('.', '\\.')}px / `))).toBeVisible();
    });

    test('reads rem inputs, a decimal comma and a custom base size, and names the property in every output', async ({
      page,
    }) => {
      // 1rem to 3rem between 20rem and 80rem with a 10px root is 10px to 30px
      // over 200px to 800px: 20 / 600 = 3.3333vw, and 10 - 200 / 30 = 3.3333px,
      // which is 0.3333rem of that root.
      for (const unit of ['Min size unit', 'Max size unit', 'Min viewport width unit', 'Max viewport width unit']) {
        await choose(page, unit, 'rem');
      }
      await setRange(page, '1', '3', '20', '80');
      await field(page, 'Base font size in px').fill('10');
      await expectOutputs(page, forms('clamp(1rem, 0.3333rem + 3.3333vw, 3rem)'));
      // The graph is labelled in px: 200px to 800px, 10px to 30px.
      await expect(graph(page)).toContainText('200px');
      await expect(graph(page)).toContainText('800px');
      await expect(graph(page)).toContainText('10px');
      await expect(graph(page)).toContainText('30px');

      await page.getByRole('button', { name: 'Reset Defaults' }).click();
      await expectOutputs(page, DEFAULTS);
      await expect(page.getByRole('combobox', { name: 'Min size unit', exact: true })).toHaveText('px');
      await expect(field(page, 'Base font size in px')).toHaveValue('16');

      // "1,5" is one and a half: 24px to 48px over 320px to 1280px is 2.5vw,
      // and 24 - 320 * 0.025 = 16px, 1rem.
      await choose(page, 'Min size unit', 'rem');
      await choose(page, 'Max size unit', 'rem');
      await setRange(page, '1,5', '3', '320', '1280');
      await expectOutputs(page, forms('clamp(1.5rem, 1rem + 2.5vw, 3rem)'));

      // Other properties: the rule and the Sass variable take the name, and
      // Tailwind its own utility, or an arbitrary property where it has none.
      await page.getByRole('button', { name: 'Reset Defaults' }).click();
      await choose(page, 'Output unit', 'px');
      await setRange(page, '20', '40', '400', '1200');
      const clamp = 'clamp(20px, 10px + 2.5vw, 40px)';
      await choose(page, 'CSS property', 'padding');
      await expectOutputs(page, forms(clamp, 'padding', 'p-'));
      await choose(page, 'CSS property', 'gap');
      await expectOutputs(page, forms(clamp, 'gap', 'gap-'));
      await choose(page, 'CSS property', 'Custom Property...');
      await field(page, 'Custom property name').fill('border-radius');
      await expectOutputs(page, {
        clamp,
        css: `border-radius: ${clamp};`,
        tailwind: '[border-radius:clamp(20px,10px+2.5vw,40px)]',
        scss: `$border-radius-fluid: ${clamp};`,
      });

      // A size that shrinks as the screen grows: 40px at 400px down to 20px at
      // 1200px is -2.5vw from 50px. The bounds are still smallest first.
      await choose(page, 'CSS property', 'font-size');
      await setRange(page, '40', '20', '400', '1200');
      await expectOutputs(page, forms('clamp(20px, 50px - 2.5vw, 40px)'));

      // Negative sizes (a negative margin): -40px to -20px is 2.5vw from -50px.
      await choose(page, 'CSS property', 'margin');
      await setRange(page, '-40', '-20', '400', '1200');
      await expectOutputs(page, forms('clamp(-40px, 2.5vw - 50px, -20px)', 'margin', 'm-'));
      await expect(page.getByText('-30px / -1.875rem', { exact: true })).toBeVisible();
    });

    test('says what is wrong instead of computing from bad input', async ({ page }) => {
      const error = page.getByRole('status');
      const blank: Outputs = { clamp: '-', css: '-', tailwind: '-', scss: '-' };

      // A unit typed into the number is not silently dropped.
      await field(page, 'Min size').fill('16px');
      await expect(error).toHaveText('Please enter valid numbers in all fields to compute.');
      await expectOutputs(page, blank);
      await expect(page.getByRole('button', { name: 'Copy Clamp Function', exact: true })).toBeDisabled();
      await expect(graph(page)).toHaveCount(0);
      await expect(simulator(page)).toHaveCount(0);

      await field(page, 'Min size').fill('16');
      await expect(error).toHaveCount(0);
      await expectOutputs(page, DEFAULTS);
      await expect(graph(page)).toBeVisible();

      // A line needs two different viewport widths.
      await field(page, 'Max viewport width').fill('320');
      await expect(error).toHaveText('Min and Max viewports cannot be equal.');
      await expectOutputs(page, blank);

      await field(page, 'Max viewport width').fill('1200');
      await field(page, 'Min viewport width').fill('-320');
      await expect(error).toHaveText('Viewport widths cannot be negative.');
      await expectOutputs(page, blank);

      // rem cannot be converted with a root size of zero.
      await field(page, 'Min viewport width').fill('320');
      await field(page, 'Base font size in px').fill('0');
      await expect(error).toHaveText('Base font size must be a number above zero.');
      await expectOutputs(page, blank);

      await page.getByRole('button', { name: 'Clear All' }).click();
      for (const name of ['Min size', 'Max size', 'Min viewport width', 'Max viewport width']) {
        await expect(field(page, name)).toHaveValue('');
      }

      await page.getByRole('button', { name: 'Reset Defaults' }).click();
      await expect(error).toHaveCount(0);
      await expect(field(page, 'Base font size in px')).toHaveValue('16');
      await expectOutputs(page, DEFAULTS);
    });
  });

  // ── Shared controls ─────────────────────────────────────────────────────────

  test('every slider in the design tools has an accessible name', async ({ page }) => {
    test.fixme(
      true,
      'ui/slider.tsx puts no aria-label or aria-labelledby on the Radix thumb, so every slider in these tools is announced as just "slider"'
    );
    const tools: Array<[slug: string, heading: string]> = [
      ['color-picker', 'Color Picker'],
      ['glassmorphism-generator', 'Glassmorphism Generator'],
      ['box-shadow-generator', 'CSS Box Shadow Generator'],
      ['clamp-calculator', 'CSS Clamp Calculator'],
    ];

    for (const [slug, heading] of tools) {
      const sliders = page.locator('main').getByRole('slider');
      await openTool(page, slug, heading, sliders.first());
      for (const slider of await sliders.all()) {
        await expect(slider, `a slider on /tools/${slug}`).toHaveAccessibleName(/\S/);
      }
    }
  });
});
