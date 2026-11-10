import { test, expect } from '@playwright/test';
import { toolCatalog } from '../src/lib/catalog';
import {
  exerciseTool,
  findHoverOnlyControls,
  findHorizontalOverflow,
  findSmallTargets,
  format,
  waitForHydration,
  watchErrors,
} from './support/layout';

// Layout guard. Every tool page (hidden ones too), the home page, the command
// palette and the settings dialog are loaded at a phone, a tablet and a desktop
// profile. The checks that ship with this file:
//
//   - the page has an h1 and raises no page error or console error
//   - nothing pushes the page wider than the viewport. The app shell clips
//     horizontal overflow (overflow-x-clip), so scrollWidth alone cannot see
//     it: every visible element is also checked against the viewport edges,
//     unless a real scroll container (overflow auto/scroll/hidden) holds it
//   - on touch profiles every interactive control meets the WCAG 2.5.8 target
//     size minimum of 24x24 CSS px, or the spacing exception (a 24px circle
//     centred on it touches no other target). Inline links in running text
//     are exempt, as the criterion says.

interface Profile {
  name: string;
  viewport: { width: number; height: number };
  touch: boolean;
}

const PROFILES: Profile[] = [
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'tablet', viewport: { width: 820, height: 1180 }, touch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, touch: false },
];

for (const profile of PROFILES) {
  test.describe(`Layout: ${profile.name} ${profile.viewport.width}x${profile.viewport.height}`, () => {
    test.use({
      viewport: profile.viewport,
      hasTouch: profile.touch,
      isMobile: profile.name === 'phone',
    });

    test.beforeEach(async ({}, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'Layout is verified on Chromium');
    });

    // Every registry entry gets a route, hidden ones included
    for (const tool of toolCatalog.all()) {
      test(`tool page fits: ${tool.id}`, async ({ page }) => {
        const errors = watchErrors(page);
        const response = await page.goto(`/tools/${tool.id}`);
        expect(response?.status()).toBe(200);
        // A preview pane can render the user's own "# heading" as another h1, so
        // the page heading is the first one in main.
        await expect(page.locator('main h1').first()).toContainText(tool.name);
        await waitForHydration(page);

        const scroll = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scroll.scrollWidth, 'page scrolls horizontally').toBeLessThanOrEqual(scroll.clientWidth + 1);

        const overflow = await findHorizontalOverflow(page);
        expect(overflow, `elements wider than the viewport:\n${format(overflow)}`).toEqual([]);

        if (profile.touch) {
          const small = await findSmallTargets(page, 'main');
          expect(small, `touch targets under 24x24:\n${format(small)}`).toEqual([]);
          const hoverOnly = await findHoverOnlyControls(page, 'main');
          expect(hoverOnly, `controls invisible without hover:\n${format(hoverOnly)}`).toEqual([]);
        }

        expect(errors, 'page and console errors').toEqual([]);
      });

      test(`tool page fits with content: ${tool.id}`, async ({ page }) => {
        const errors = watchErrors(page);
        await page.goto(`/tools/${tool.id}`);
        await waitForHydration(page);
        await exerciseTool(page);

        const overflow = await findHorizontalOverflow(page);
        expect(overflow, `elements wider than the viewport:\n${format(overflow)}`).toEqual([]);
        if (profile.touch) {
          const small = await findSmallTargets(page, 'main');
          expect(small, `touch targets under 24x24:\n${format(small)}`).toEqual([]);
          const hoverOnly = await findHoverOnlyControls(page, 'main');
          expect(hoverOnly, `controls invisible without hover:\n${format(hoverOnly)}`).toEqual([]);
        }
        expect(errors, 'page and console errors').toEqual([]);
      });
    }

    test('home page fits', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await waitForHydration(page);

      const scroll = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth + 1);
      const overflow = await findHorizontalOverflow(page);
      expect(overflow, format(overflow)).toEqual([]);

      if (profile.touch) {
        const small = await findSmallTargets(page, 'body');
        expect(small, `touch targets under 24x24:\n${format(small)}`).toEqual([]);
      }
      expect(errors).toEqual([]);
    });

    test('command palette opens, fits and closes', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/');
      await waitForHydration(page);

      const trigger = page.getByRole('button', { name: 'Search command palette' });
      await trigger.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('combobox')).toBeVisible();

      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(profile.viewport.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(profile.viewport.height + 1);

      const overflow = await findHorizontalOverflow(page);
      expect(overflow, format(overflow)).toEqual([]);
      if (profile.touch) {
        const small = await findSmallTargets(page, '[role=dialog]');
        expect(small, `touch targets under 24x24:\n${format(small)}`).toEqual([]);
      }

      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();

      // Tapping outside closes it too
      await trigger.click();
      await expect(dialog).toBeVisible();
      await page.mouse.click(2, profile.viewport.height - 2);
      await expect(dialog).toBeHidden();
      expect(errors).toEqual([]);
    });

    test('settings dialog opens, fits and closes', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/');
      await waitForHydration(page);

      const trigger = page.getByRole('button', { name: 'Open settings' });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Settings' });
      await expect(dialog).toBeVisible();

      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(profile.viewport.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(profile.viewport.height + 1);

      const overflow = await findHorizontalOverflow(page);
      expect(overflow, format(overflow)).toEqual([]);
      if (profile.touch) {
        const small = await findSmallTargets(page, '[role=dialog]');
        expect(small, `touch targets under 24x24:\n${format(small)}`).toEqual([]);
      }

      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();

      await trigger.click();
      await expect(dialog).toBeVisible();
      await page.mouse.click(2, profile.viewport.height - 2);
      await expect(dialog).toBeHidden();
      expect(errors).toEqual([]);
    });
  });
}
