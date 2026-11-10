import type { Page } from '@playwright/test';

// Console noise that is not a defect of the page:
//   - "Failed to load resource" is the browser reporting a 404 or a blocked
//     request. Tools that fetch from public APIs (the network and lookup tools)
//     fail in the sandboxed test run, which has no network, and handle it in
//     their own error state, so it says nothing about the layout.
const BENIGN_CONSOLE = [
  /Failed to load resource/i,
  /ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|CONNECTION|BLOCKED)/i,
];

export interface Offender {
  selector: string;
  detail: string;
}

/** Waits until React has attached to the header controls: the page is prerendered. */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('header button');
    return !!button && Object.keys(button).some((key) => key.startsWith('__reactFiber$'));
  });
}

export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (BENIGN_CONSOLE.some((pattern) => pattern.test(text))) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

/** Elements that stick out past the left or right edge of the viewport. */
export async function findHorizontalOverflow(page: Page): Promise<Offender[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: { selector: string; detail: string }[] = [];

    const describe = (el: Element) => {
      const id = el.id ? `#${el.id}` : '';
      const cls =
        typeof el.className === 'string'
          ? el.className.trim().split(/\s+/).slice(0, 3).join('.')
          : '';
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
      return `${el.tagName.toLowerCase()}${id}${cls ? '.' + cls : ''} "${text}"`;
    };

    // The app shell wrapper clips overflow on purpose, so it must not count as
    // a container that makes the overflow acceptable.
    const shell = document.body.querySelector(':scope > div.overflow-x-clip');

    const isScroller = (el: Element) => {
      if (el === shell) return false;
      const x = getComputedStyle(el).overflowX;
      return x === 'auto' || x === 'scroll' || x === 'hidden';
    };

    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (el.closest('[data-sonner-toaster], nextjs-portal')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      if (rect.right <= vw + 1 && rect.left >= -1) continue;
      if (style.position === 'fixed') continue;

      let held = false;
      for (
        let parent = el.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        if (isScroller(parent)) {
          held = true;
          break;
        }
      }
      if (held) continue;

      // Report the outermost offender only: a wide parent drags its children along.
      const parent = el.parentElement;
      if (parent && parent !== document.body) {
        const pr = parent.getBoundingClientRect();
        if (pr.right > vw + 1 || pr.left < -1) continue;
      }
      out.push({
        selector: describe(el),
        detail: `left ${Math.round(rect.left)} right ${Math.round(rect.right)} of ${vw}`,
      });
    }
    return out.slice(0, 8);
  });
}

/** Interactive controls under `root` that fail the WCAG 2.5.8 target size. */
export async function findSmallTargets(page: Page, rootSelector: string): Promise<Offender[]> {
  return page.evaluate((rootSel) => {
    const MIN = 24;
    const root = document.querySelector(rootSel);
    if (!root) return [];

    const selector = [
      'a[href]',
      'button',
      'input:not([type=hidden])',
      'select',
      'textarea',
      'summary',
      '[role=button]',
      '[role=checkbox]',
      '[role=switch]',
      '[role=tab]',
      '[role=combobox]',
      '[role=slider]',
      '[role=menuitem]',
      '[role=option]',
      '[role=radio]',
    ].join(',');

    interface Target {
      el: Element;
      rect: DOMRect;
    }

    const isVisible = (el: Element) => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)
        return false;
      if (el.closest('[aria-hidden=true], [inert], [data-sonner-toaster], nextjs-portal'))
        return false;
      const rect = el.getBoundingClientRect();
      // sr-only and offscreen helper inputs
      if (rect.width <= 1 || rect.height <= 1) return false;
      return true;
    };

    const targets: Target[] = [];
    for (const el of Array.from(root.querySelectorAll(selector))) {
      if (!isVisible(el)) continue;
      if ((el as HTMLButtonElement).disabled) continue;
      targets.push({ el, rect: el.getBoundingClientRect() });
    }

    // Inline links in a sentence are exempt: the link is inline and its
    // paragraph holds other text around it.
    const isInlineLink = (el: Element) => {
      if (el.tagName !== 'A') return false;
      if (getComputedStyle(el).display !== 'inline') return false;
      const parent = el.parentElement;
      if (!parent) return false;
      const own = (el.textContent ?? '').trim().length;
      const all = (parent.textContent ?? '').trim().length;
      return all > own + 8;
    };

    const describe = (el: Element) => {
      const label =
        el.getAttribute('aria-label') ??
        (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
      const cls =
        typeof el.className === 'string'
          ? el.className.trim().split(/\s+/).slice(0, 3).join('.')
          : '';
      const type = el.getAttribute('type') ?? el.getAttribute('role') ?? '';
      return `${el.tagName.toLowerCase()}${type ? `[${type}]` : ''}.${cls} "${label}"`;
    };

    // The clickable area of a control may be its <label>.
    const effectiveRect = (target: Target) => {
      const label = target.el.closest('label');
      if (
        label &&
        (target.el.tagName === 'INPUT' || target.el.getAttribute('role') === 'checkbox')
      ) {
        const lr = label.getBoundingClientRect();
        if (lr.width >= MIN && lr.height >= MIN) return lr;
      }
      return target.rect;
    };

    const circleTouches = (cx: number, cy: number, r: number, rect: DOMRect) => {
      const nx = Math.max(rect.left, Math.min(cx, rect.right));
      const ny = Math.max(rect.top, Math.min(cy, rect.bottom));
      return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
    };

    const out: { selector: string; detail: string }[] = [];
    for (const target of targets) {
      const rect = effectiveRect(target);
      if (rect.width >= MIN - 0.5 && rect.height >= MIN - 0.5) continue;
      if (isInlineLink(target.el)) continue;

      // Spacing exception: a 24px circle on the target's centre touches no other target.
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const crowded = targets.some(
        (other) =>
          other !== target &&
          !other.el.contains(target.el) &&
          !target.el.contains(other.el) &&
          circleTouches(cx, cy, MIN / 2, other.rect)
      );
      if (!crowded) continue;

      out.push({
        selector: describe(target.el),
        detail: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      });
    }
    return out.slice(0, 8);
  }, rootSelector);
}

/**
 * Controls that are see-through on a touch screen. A control that appears only
 * on :hover is unreachable there, because a touch profile reports
 * (hover: none). Elements the page hides from assistive tech on purpose, such as
 * the hidden inputs behind custom checkboxes, are left out.
 */
export async function findHoverOnlyControls(page: Page, rootSelector: string): Promise<Offender[]> {
  return page.evaluate((rootSel) => {
    const root = document.querySelector(rootSel);
    if (!root) return [];
    const out: { selector: string; detail: string }[] = [];
    const selector =
      'a[href], button, input:not([type=hidden]):not([type=file]), select, textarea, [role=button], [role=checkbox], [role=switch], [role=tab]';
    for (const el of Array.from(root.querySelectorAll(selector))) {
      if (el.closest('[aria-hidden=true], [inert]')) continue;
      if ((el as HTMLButtonElement).disabled) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      let opacity = 1;
      for (
        let node: Element | null = el;
        node && node !== document.body;
        node = node.parentElement
      ) {
        opacity *= Number(getComputedStyle(node).opacity);
      }
      if (opacity >= 0.1) continue;
      const label =
        el.getAttribute('aria-label') ??
        (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
      out.push({
        selector: `${el.tagName.toLowerCase()} "${label}"`,
        detail: `opacity ${opacity.toFixed(2)}`,
      });
    }
    return out.slice(0, 8);
  }, rootSelector);
}

export function format(offenders: Offender[]) {
  return offenders.map((o) => `${o.selector} (${o.detail})`).join('\n');
}

// A long word with no break opportunity, as pasted tokens, URLs and hashes are.
// Layouts that survive an empty page often break on this.
const LONG_TOKEN = 'Lorem'.padEnd(220, 'x');
const LONG_TEXT = `${LONG_TOKEN}\nhttps://example.com/${'path'.padEnd(160, 'y')}?a=1&b=2\nThe quick brown fox jumps over the lazy dog 12345`;

// Buttons that run a tool's main action. Clicking only these keeps the walk
// away from downloads, deletions and navigation.
const ACTION_BUTTON =
  /^(generate|calculate|convert|format|encode|decode|parse|analy[sz]e|run|test|hash|validate|minify|beautify|compare|check|build|simulate|extract|preview|sort|transform|evaluate|escape|unescape|inspect|lookup|look up|diff|decrypt|encrypt|sign|verify|apply|add|new|try)\b/i;

/**
 * Puts long content into a tool and walks its main controls, so the layout is
 * checked with results, errors and every tab showing and not only the empty
 * state. Returns how many things it touched.
 */
export async function exerciseTool(page: Page): Promise<number> {
  let touched = 0;

  const fields = page.locator(
    'main textarea:not([readonly]):not([disabled]), main input:not([readonly]):not([disabled]):is([type=text],[type=search],[type=url],[type=email],[type=tel],:not([type]))'
  );
  const fieldCount = Math.min(await fields.count(), 6);
  for (let i = 0; i < fieldCount; i++) {
    const field = fields.nth(i);
    if (!(await field.isVisible())) continue;
    if (await field.getAttribute('maxlength')) continue;
    const tag = await field.evaluate((el) => el.tagName);
    await field.fill(tag === 'TEXTAREA' ? LONG_TEXT : LONG_TOKEN).catch(() => undefined);
    touched++;
  }

  const actions = page.locator('main button:not([disabled])').filter({ hasText: ACTION_BUTTON });
  const actionCount = Math.min(await actions.count(), 4);
  for (let i = 0; i < actionCount; i++) {
    const button = actions.nth(i);
    if (!(await button.isVisible())) continue;
    await button.click({ timeout: 2000 }).catch(() => undefined);
    touched++;
  }

  const tabs = page.locator('main [role=tab]');
  const tabCount = Math.min(await tabs.count(), 12);
  for (let i = 0; i < tabCount; i++) {
    const tab = tabs.nth(i);
    if (!(await tab.isVisible())) continue;
    await tab.click({ timeout: 2000 }).catch(() => undefined);
    touched++;
  }

  // Let debounced processing and lazy chunks settle
  await page.waitForTimeout(400);
  return touched;
}
