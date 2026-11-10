/** Small helpers for tools that read and write multi-line text and typed numbers. */

const LINE_BREAK = /\r\n|\r|\n/;
const NUMBER_PATTERN = /^-?(\d+(\.\d*)?|\.\d+)$/;
const GROUPED_PATTERN = /^-?\d{1,3}(,\d{3})+(\.\d*)?$/;

/** Splits into lines. One trailing line break does not start another line. */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split(LINE_BREAK);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** The line ending the text uses, so a result can keep it. CRLF wins when any line has it. */
export function lineEnding(text: string): '\r\n' | '\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** "1 item", "2 items". Pass `many` when the plural is not `one` plus "s". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

export type TypedNumber = { value: number } | { error: string };

/**
 * Makes a reader for typed number fields. Spaces are ignored and commas are accepted
 * only as thousands separators ("1,000"), so "6,5" is rejected instead of
 * silently becoming 65. A blank field is `blankError`, or 0 when `blankError`
 * is null (an optional field). Anything else that is not a number is `hint`.
 */
export function numberReader(hint: string) {
  return (text: string, blankError: string | null): TypedNumber => {
    const trimmed = text.replace(/\s+/g, '');
    if (trimmed === '') return blankError === null ? { value: 0 } : { error: blankError };
    const plain = GROUPED_PATTERN.test(trimmed) ? trimmed.replace(/,/g, '') : trimmed;
    if (!NUMBER_PATTERN.test(plain)) return { error: hint };
    return { value: Number(plain) };
  };
}
