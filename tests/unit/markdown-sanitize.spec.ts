import { test, expect } from '@playwright/test';
import { sanitizePreviewHtml } from '@/lib/markdown/sanitize';

// The sanitiser itself needs a DOM, so what it removes and what it keeps are
// checked in a browser (playwright/tools/documents.spec.ts). What can be
// pinned here is how it behaves where there is no DOM: the statically
// prerendered page.
test.describe('sanitizePreviewHtml without a DOM', () => {
  const SAMPLE = '<h1 data-source-line="0">Title</h1>\n<p data-source-line="2">Text</p>\n';

  test('returns the trusted sample as it is, so prerender and hydration match', () => {
    expect(sanitizePreviewHtml(SAMPLE, SAMPLE)).toBe(SAMPLE);
  });

  test('returns nothing for markup it cannot check, rather than markup it did not clean', () => {
    const hostile = '<img src="x" onerror="alert(1)">';

    expect(sanitizePreviewHtml(hostile)).toBe('');
    expect(sanitizePreviewHtml(hostile, SAMPLE)).toBe('');
    expect(sanitizePreviewHtml(SAMPLE + hostile, SAMPLE)).toBe('');
  });

  test('does not take an empty trusted value for a match', () => {
    expect(sanitizePreviewHtml('', '')).toBe('');
    expect(sanitizePreviewHtml('<p>x</p>', '')).toBe('');
  });
});
