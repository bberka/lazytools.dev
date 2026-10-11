import DOMPurify from 'dompurify';

// Keeps pasted Markdown from running code in the app. The parser lets raw HTML
// through (`html: true`), so an `<img onerror>`, a `javascript:` link or an
// `<iframe>` in the source would otherwise land in the page with the app's own
// origin. This is the one place the preview markup is cleaned; both Markdown
// previews call it, and nothing derived from what the user typed should reach
// `dangerouslySetInnerHTML` without it.
//
// It needs a DOM, so like `./dom` it is for the browser. The prerendered page
// never calls it with anything but the sample document (see `trusted`).

const PREVIEW_CONFIG = {
  // KaTeX writes its readable source as <semantics><annotation encoding="...">,
  // and markdown-it-texmath wraps each formula in <eq> or <eqn>. DOMPurify
  // drops all four by default; losing them would leave the TeX source as stray
  // text inside the MathML. They are inert elements.
  ADD_TAGS: ['semantics', 'annotation', 'eq', 'eqn'],
  ADD_ATTR: ['encoding'],
  // A <style> element is not scoped to the preview: it would restyle the app.
  // Inline `style` attributes stay, KaTeX positions every glyph with them.
  // Highlighted code, tables, images, links and `data-*` attributes (the
  // `data-source-line` that scroll sync reads) all pass under the defaults.
  FORBID_TAGS: ['style'],
};

/**
 * The preview markup for `html` with scripts, event handlers, `javascript:`
 * URLs and other active content removed.
 *
 * `trusted` is markup the app ships itself, such as the sample document a tool
 * starts with. When `html` is exactly that, it is returned untouched, so the
 * statically prerendered page (which has no DOM to sanitise with) and the first
 * client render produce the same markup. Anything else is sanitised.
 *
 * Without a DOM nothing can be checked, so everything other than `trusted`
 * comes back empty rather than unclean.
 */
export function sanitizePreviewHtml(html: string, trusted?: string): string {
  if (trusted !== undefined && html === trusted) return html;
  if (!DOMPurify.isSupported) return '';
  return DOMPurify.sanitize(html, PREVIEW_CONFIG);
}
