import { SOURCE_LINE_ATTRIBUTE } from './index';

// Browser-only companions to the Markdown renderer. They read layout and the
// live document, so they are kept apart from `./index`, which runs anywhere.

/**
 * Zero-based source line of the rendered block that contains `target`, or
 * null when no enclosing block carries one.
 */
export function sourceLineAt(target: Element): number | null {
  const block = target.closest(`[${SOURCE_LINE_ATTRIBUTE}]`);
  const line = Number.parseInt(block?.getAttribute(SOURCE_LINE_ATTRIBUTE) ?? '', 10);
  return Number.isNaN(line) ? null : line;
}

/**
 * Text of the first heading in a rendered fragment, or an empty string when
 * there is none. Used as the title of exported documents.
 */
export function firstHeadingText(html: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = doc.querySelector('h1, h2, h3, h4, h5, h6');
    return heading?.textContent?.trim() || '';
  } catch {
    return '';
  }
}

// Styles that decide where text wraps inside a textarea. Copying them onto a
// hidden block lets the browser lay the same text out where it can be measured.
const TEXT_LAYOUT_PROPERTIES = [
  'direction',
  'box-sizing',
  'width',
  'height',
  'overflow-x',
  'overflow-y',
  'border-width',
  'border-style',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'text-transform',
  'word-spacing',
  'letter-spacing',
  'line-height',
  'text-indent',
];

// Distance in pixels from the top of the textarea's content to the caret at `offset`.
function caretTop(textarea: HTMLTextAreaElement, offset: number): number {
  if (typeof window === 'undefined') return 0;
  const styles = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');

  TEXT_LAYOUT_PROPERTIES.forEach((property) => {
    mirror.style.setProperty(property, styles.getPropertyValue(property));
  });

  mirror.style.position = 'absolute';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordBreak = 'break-word';
  mirror.style.width = `${textarea.clientWidth}px`;

  mirror.appendChild(document.createTextNode(textarea.value.substring(0, offset)));

  const marker = document.createElement('span');
  marker.textContent = '|';
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  document.body.removeChild(mirror);

  return top;
}

/**
 * Puts the caret at character `offset` in `textarea` and scrolls both the
 * textarea and the page so that position sits about a third of the way down.
 */
export function scrollTextareaToOffset(textarea: HTMLTextAreaElement, offset: number): void {
  textarea.focus();
  textarea.setSelectionRange(offset, offset);

  const caretOffset = caretTop(textarea, offset);
  const isScrollable = textarea.scrollHeight > textarea.clientHeight;

  if (isScrollable) {
    const targetScrollTop = Math.max(0, caretOffset - textarea.clientHeight / 3);
    try {
      textarea.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    } catch {
      textarea.scrollTop = targetScrollTop;
    }
  }

  setTimeout(() => {
    const textareaRect = textarea.getBoundingClientRect();
    const caretDocTop = window.scrollY + textareaRect.top + (caretOffset - textarea.scrollTop);

    window.scrollTo({
      top: Math.max(0, caretDocTop - window.innerHeight / 3),
      behavior: 'smooth',
    });
  }, 50);
}
