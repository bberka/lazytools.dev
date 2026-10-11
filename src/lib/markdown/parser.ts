import MarkdownIt, { type Options, type PluginSimple } from 'markdown-it';

// The one place MarkdownIt is configured for the Markdown tools.
//
// This file depends on markdown-it alone. A tool that only needs the token
// stream (Markdown to DOCX) imports it directly and stays clear of the
// highlight.js and KaTeX weight that `@/lib/markdown` adds for the preview.

// Decides how source text splits into blocks and inline runs. Every parser
// handed out below is built from these, so the tools read one dialect.
const SYNTAX: Options = {
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
};

export type MarkdownToken = ReturnType<MarkdownIt['parse']>[number];

export interface MarkdownParser {
  /** Block tokens for `source`; inline runs hang off them as `children`. */
  parse(source: string): MarkdownToken[];
  /** `source` as an HTML fragment. */
  render(source: string): string;
}

export interface MarkdownExtensions {
  /** Turns the body of a fenced block into its complete `<pre>` markup. */
  highlight?: (code: string, language: string) => string;
  /** Rules layered on top of the shared syntax, applied in order. */
  plugins?: readonly PluginSimple[];
}

/**
 * Builds a parser for the shared Markdown syntax.
 *
 * With no extensions the result is the plain structural parser. Extensions
 * may change how tokens render or add new token types, but the base syntax
 * options are fixed here and cannot be overridden by a caller.
 */
export function createMarkdownParser(extensions: MarkdownExtensions = {}): MarkdownParser {
  const { highlight, plugins = [] } = extensions;
  const markdown = new MarkdownIt(highlight ? { ...SYNTAX, highlight } : SYNTAX);

  plugins.forEach((plugin) => markdown.use(plugin));

  return {
    parse: (source) => markdown.parse(source, {}),
    render: (source) => markdown.render(source),
  };
}
