import { test, expect } from '@playwright/test';
import { buildStandaloneHtml } from '@/lib/markdown';
import { PAGE_FORMATS_MM, escapeHtml, previewPageSize } from '@/lib/tools/document-export';

test.describe('paper sizes', () => {
  test('lists portrait sizes, short side first', () => {
    expect(PAGE_FORMATS_MM.A4).toEqual([210, 297]);
    expect(PAGE_FORMATS_MM.Letter).toEqual([215.9, 279.4]);
    expect(PAGE_FORMATS_MM.Legal).toEqual([215.9, 355.6]);
    for (const [width, height] of Object.values(PAGE_FORMATS_MM)) {
      expect(width).toBeLessThan(height);
    }
  });
});

test.describe('preview page size', () => {
  test('is as wide as the paper and one page tall', () => {
    // The numbers both converters showed before the sizes were shared.
    expect(previewPageSize('A4', 'portrait')).toEqual({ width: 794, minHeight: 1123 });
    expect(previewPageSize('Letter', 'portrait')).toEqual({ width: 816, minHeight: 1056 });
    expect(previewPageSize('Legal', 'portrait')).toEqual({ width: 816, minHeight: 1344 });
  });

  test('turns the page for landscape', () => {
    expect(previewPageSize('A4', 'landscape')).toEqual({ width: 1123, minHeight: 794 });
    expect(previewPageSize('Letter', 'landscape')).toEqual({ width: 1056, minHeight: 816 });

    const { width, minHeight } = previewPageSize('Legal', 'landscape');
    expect(width).toBeGreaterThan(minHeight);
  });
});

test.describe('escaping text for HTML', () => {
  test('escapes the characters HTML gives a meaning to', () => {
    expect(escapeHtml(`<b class="x">Tom & Jerry's</b>`)).toBe(
      '&lt;b class=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/b&gt;'
    );
  });

  test('escapes an ampersand once, also in front of an entity', () => {
    expect(escapeHtml('&lt; &amp;')).toBe('&amp;lt; &amp;amp;');
  });

  test('leaves other text alone', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml('Plain title 2024 – naïve café 😀')).toBe('Plain title 2024 – naïve café 😀');
  });

  test('keeps a title inside the <title> of an exported document', () => {
    // A heading such as "# The `</title>` element" used to end the title
    // early; the rest of the heading then landed in the document.
    const title = 'The </title><script>alert(1)</script> element & more';
    const html = buildStandaloneHtml({
      bodyHtml: '<p>body</p>',
      title: escapeHtml(title),
      theme: 'light',
      backgroundColor: '#ffffff',
    });

    expect(html.split('</title>')).toHaveLength(2);
    expect(html).not.toContain('<script>');
    expect(html).toContain(
      '<title>The &lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt; element &amp; more</title>'
    );
  });
});
