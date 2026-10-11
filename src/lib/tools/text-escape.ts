/**
 * Escaping and unescaping text for the places it gets pasted into: a
 * JavaScript or JSON string literal, HTML, XML, a CSV field, a SQL string
 * literal and a regular expression.
 *
 * Every mode reads its input in a single pass, so an escaped backslash is
 * never mistaken for the start of the next escape (`C:\\new` unescapes to
 * `C:\new`, not to a line break). Unescaping is lenient: text with nothing to
 * unescape comes back unchanged. Only JSON reports an error, for a backslash
 * that does not start a JSON escape.
 *
 * Everything here is pure and runs in Node.
 */

import { decodeHtmlEntities, encodeHtmlEntities } from './html-encoder';

export type EscapeMode = 'javascript' | 'json' | 'html' | 'xml' | 'csv' | 'sql' | 'regex';

// ── JavaScript ────────────────────────────────────────────────────────────────

const JS_ESCAPES: Record<string, string> = {
  '\\': '\\\\',
  "'": "\\'",
  '"': '\\"',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f',
};

const JS_UNESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
  "'": "'",
  '"': '"',
  '`': '`',
  '\\': '\\',
};

function escapeJavaScript(text: string): string {
  // Inside a character class \b is the backspace character, not a word boundary.
  return text.replace(/[\\'"\n\r\t\b\f]/g, (character) => JS_ESCAPES[character]);
}

function unescapeJavaScript(text: string): string {
  return text.replace(
    /\\(?:u\{([0-9a-fA-F]{1,6})\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|(\r\n|[\s\S]))/g,
    (sequence: string, braced?: string, unicode?: string, byte?: string, single?: string) => {
      if (braced !== undefined) {
        const codePoint = parseInt(braced, 16);
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : sequence;
      }
      if (unicode !== undefined) return String.fromCharCode(parseInt(unicode, 16));
      if (byte !== undefined) return String.fromCharCode(parseInt(byte, 16));
      // A backslash at the end of a line continues the string on the next one.
      if (single === '\n' || single === '\r\n') return '';
      // An unknown escape is left as it was typed.
      return (single !== undefined && JS_UNESCAPES[single]) || sequence;
    }
  );
}

// ── JSON ──────────────────────────────────────────────────────────────────────

const JSON_UNESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

function escapeJson(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

function unescapeJson(text: string): string {
  return text.replace(
    /\\(?:u([0-9a-fA-F]{4})|(["\\/bfnrt]))|\\/g,
    (sequence: string, unicode: string | undefined, simple: string | undefined, offset: number) => {
      if (unicode !== undefined) return String.fromCharCode(parseInt(unicode, 16));
      if (simple !== undefined) return JSON_UNESCAPES[simple];
      const shown = text.slice(offset, offset + 2);
      throw new Error(`Invalid JSON escape sequence "${shown}" at position ${offset + 1}.`);
    }
  );
}

// ── XML ───────────────────────────────────────────────────────────────────────

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

const XML_UNESCAPES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => XML_ESCAPES[character]);
}

function unescapeXml(text: string): string {
  return text.replace(
    /&(?:#x([0-9a-fA-F]+)|#([0-9]+)|(amp|lt|gt|quot|apos));/g,
    (reference: string, hex?: string, decimal?: string, name?: string) => {
      if (name !== undefined) return XML_UNESCAPES[name];
      const codePoint = hex !== undefined ? parseInt(hex, 16) : parseInt(decimal ?? '', 10);
      const isCharacter =
        codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff);
      return isCharacter ? String.fromCodePoint(codePoint) : reference;
    }
  );
}

// ── CSV, SQL, regular expressions ─────────────────────────────────────────────

function escapeCsv(text: string): string {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function unescapeCsv(text: string): string {
  const quoted = text.length >= 2 && text.startsWith('"') && text.endsWith('"');
  return quoted ? text.slice(1, -1).replace(/""/g, '"') : text;
}

// ── Interface ─────────────────────────────────────────────────────────────────

/** Escapes text for the given target. Empty text stays empty. */
export function escapeText(text: string, mode: EscapeMode): string {
  switch (mode) {
    case 'javascript':
      return escapeJavaScript(text);
    case 'json':
      return escapeJson(text);
    case 'html':
      return encodeHtmlEntities(text);
    case 'xml':
      return escapeXml(text);
    case 'csv':
      return escapeCsv(text);
    case 'sql':
      return text.replace(/'/g, "''");
    case 'regex':
      return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * Reverses `escapeText`.
 *
 * @throws Error in JSON mode when a backslash does not start a JSON escape.
 */
export function unescapeText(text: string, mode: EscapeMode): string {
  switch (mode) {
    case 'javascript':
      return unescapeJavaScript(text);
    case 'json':
      return unescapeJson(text);
    case 'html':
      return decodeHtmlEntities(text);
    case 'xml':
      return unescapeXml(text);
    case 'csv':
      return unescapeCsv(text);
    case 'sql':
      return text.replace(/''/g, "'");
    case 'regex':
      return text.replace(/\\([.*+?^${}()|[\]\\])/g, '$1');
  }
}

export type EscapeDirection = 'escape' | 'unescape';

/**
 * What the tool shows for an input: the converted text, or the reason it
 * could not be converted. Never throws. Whitespace is converted like any
 * other text, so a lone tab or line break escapes to `\t` or `\n`.
 */
export function convertEscape(
  text: string,
  mode: EscapeMode,
  direction: EscapeDirection
): { output: string; error: string } {
  try {
    return {
      output: direction === 'escape' ? escapeText(text, mode) : unescapeText(text, mode),
      error: '',
    };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : 'Failed to convert text' };
  }
}
