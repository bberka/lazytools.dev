/**
 * Text diff logic: compares two texts by line or by word and shapes the result
 * for the inline and the side-by-side views. Pure, so it runs in Node and in
 * the browser.
 */

import { diffLines, diffWords } from 'diff';

export type DiffMode = 'lines' | 'words';
export type DiffChange = 'added' | 'removed' | 'unchanged';

/** A stretch of text that is in both texts, or only in one of them. */
export interface DiffSegment {
  text: string;
  change: DiffChange;
}

/** One line in a side-by-side column; `empty` pads the side that has no line. */
export interface DiffCell {
  text: string;
  kind: DiffChange | 'empty';
}

export interface DiffRow {
  left: DiffCell;
  right: DiffCell;
}

/**
 * The differences in reading order. By line every segment is a run of whole
 * lines, each ending in its line break; a break missing at the very end of
 * either text is not a difference. By word, whitespace-only differences are
 * ignored and shared text is given with the modified text's spacing.
 */
export function diffText(original: string, modified: string, mode: DiffMode): DiffSegment[] {
  if (!original && !modified) {
    return [];
  }

  const changes =
    mode === 'lines'
      ? diffLines(original, modified, { ignoreNewlineAtEof: true })
      : diffWords(original, modified);

  const segments = changes.map<DiffSegment>((change) => ({
    text: change.value,
    change: change.added ? 'added' : change.removed ? 'removed' : 'unchanged',
  }));

  if (mode === 'words') {
    return segments;
  }

  // Only the last line of a text can lack its break. Where another segment
  // follows, give the line one, or the inline view runs the two together.
  return segments.map((segment, index) =>
    index < segments.length - 1 && !segment.text.endsWith('\n')
      ? { ...segment, text: `${segment.text}\n` }
      : segment
  );
}

/** True when the comparison found something added or removed. */
export function hasChanges(segments: readonly DiffSegment[]): boolean {
  return segments.some((segment) => segment.change !== 'unchanged');
}

/**
 * The segments that belong to one of the two texts: what is shared plus what
 * only that side has. For a pane that shows one text with its changes marked.
 */
export function segmentsOf(
  segments: readonly DiffSegment[],
  side: 'original' | 'modified'
): DiffSegment[] {
  const otherSide: DiffChange = side === 'original' ? 'added' : 'removed';
  return segments.filter((segment) => segment.change !== otherSide);
}

/** "a\nb\n" is two lines: the last "\n" ends line two, it does not start a third. */
function toLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

const EMPTY_CELL: DiffCell = { text: '', kind: 'empty' };

/**
 * Line-by-line rows for two columns, from a diff made by line. A removed line
 * sits on the left beside a padding cell, an added line on the right, and an
 * unchanged line on both sides.
 */
export function toSideBySideRows(segments: readonly DiffSegment[]): DiffRow[] {
  const rows: DiffRow[] = [];

  for (const { text, change } of segments) {
    for (const line of toLines(text)) {
      const cell: DiffCell = { text: line, kind: change };
      rows.push({
        left: change === 'added' ? EMPTY_CELL : cell,
        right: change === 'removed' ? EMPTY_CELL : cell,
      });
    }
  }

  return rows;
}
