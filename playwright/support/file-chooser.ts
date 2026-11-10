import type { FileChooser, Page } from '@playwright/test';

/**
 * Runs `trigger` (a click or a key press that opens the file picker) and
 * returns the file chooser it opened.
 *
 * `page.waitForEvent('filechooser')` only starts intercepting the dialog once
 * Playwright has told the browser to, and it sends that without waiting for an
 * answer. A trigger fired straight after can open the real dialog before the
 * interception is on, and the event is lost: the test then times out waiting
 * for a chooser the page did open. Under load that is about one run in ten. A
 * round trip to the page first guarantees the interception is in place.
 */
export async function openFileChooser(
  page: Page,
  trigger: () => Promise<unknown>,
  options: { timeout?: number } = {}
): Promise<FileChooser> {
  const chooser = page.waitForEvent('filechooser', options);
  // Nobody awaits this promise if the trigger throws first.
  chooser.catch(() => undefined);
  await page.evaluate(() => undefined);
  await trigger();
  return chooser;
}
