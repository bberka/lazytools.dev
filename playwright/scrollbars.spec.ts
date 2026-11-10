import { expect, test } from '@playwright/test';

// Scrollbars are styled once in globals.css: thin, no track fill and no arrow
// buttons, on every scroll container including textareas and the page.
test.describe('Scrollbars', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Checked through the Chromium pseudo-elements'
  );

  test('a textarea gets a thin scrollbar without arrow buttons', async ({ page }) => {
    await page.goto('/tools/json-formatter/');
    const input = page.getByRole('textbox', { name: 'JSON input' });
    await expect(input).toBeVisible();
    await input.fill(
      JSON.stringify(
        Array.from({ length: 80 }, (_, id) => ({ id })),
        null,
        2
      )
    );

    const metrics = await input.evaluate((element) => {
      const button = getComputedStyle(element, '::-webkit-scrollbar-button');
      const track = getComputedStyle(element, '::-webkit-scrollbar-track');
      return {
        scrolls: element.scrollHeight > element.clientHeight,
        gutter: (element as HTMLElement).offsetWidth - element.clientWidth,
        buttonDisplay: button.display,
        trackFill: track.backgroundColor,
      };
    });

    expect(metrics.scrolls).toBe(true);
    // 8px bar plus the textarea's 1px borders
    expect(metrics.gutter).toBeLessThanOrEqual(10);
    expect(metrics.buttonDisplay).toBe('none');
    expect(metrics.trackFill).toBe('rgba(0, 0, 0, 0)');
  });
});
