/**
 * Percent-encoding for one URL component (a query value, a path segment).
 *
 * These are `encodeURIComponent` and `decodeURIComponent` with errors a
 * person can act on: the built-ins only say "URI malformed", these say what
 * is wrong and where.
 *
 * Everything here is pure and runs in Node.
 */

/**
 * Percent-encodes everything except letters, digits and `- _ . ! ~ * ' ( )`.
 *
 * @throws Error when the text holds half of a surrogate pair, which has no UTF-8 form.
 */
export function encodeUrlComponent(text: string): string {
  try {
    return encodeURIComponent(text);
  } catch {
    throw new Error(
      'The text contains a broken character (half of a surrogate pair) that cannot be URL-encoded.'
    );
  }
}

/**
 * Reverses percent-encoding. A `+` stays a plus sign, as in `decodeURIComponent`.
 *
 * @throws Error pointing at the first `%` that is not followed by two hex
 * digits, or at the first run of escapes that is not valid UTF-8.
 */
export function decodeUrlComponent(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    const stray = /%(?![0-9a-fA-F]{2})/.exec(text);
    if (stray) {
      const shown = text.slice(stray.index, stray.index + 3);
      throw new Error(
        `Invalid percent-encoding "${shown}" at position ${stray.index + 1}. A "%" must be followed by two hex digits; write a literal percent sign as %25.`
      );
    }

    // Every escape is well formed, so some run of them is not UTF-8.
    for (const run of text.matchAll(/(?:%[0-9a-fA-F]{2})+/g)) {
      try {
        decodeURIComponent(run[0]);
      } catch {
        throw new Error(`"${run[0]}" at position ${(run.index ?? 0) + 1} is not valid UTF-8.`);
      }
    }

    throw new Error('The text is not valid percent-encoding.');
  }
}

export type UrlCodecMode = 'encode' | 'decode';

/**
 * What the tool shows for an input: the converted text, or the reason it
 * could not be converted. Never throws. Whitespace is converted like any
 * other text, so a lone space encodes to `%20`.
 */
export function convertUrlComponent(text: string, mode: UrlCodecMode): { output: string; error: string } {
  try {
    return {
      output: mode === 'encode' ? encodeUrlComponent(text) : decodeUrlComponent(text),
      error: '',
    };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : 'Conversion failed' };
  }
}
