/**
 * Arrow-key navigation over the home page's tool cards.
 *
 * The cards are laid out as one or more sections, one below the other. Each
 * section is a grid that fills row by row and wraps at the same number of
 * columns. Cards are numbered in reading order across all sections: with
 * sections of 3 and 4 cards, the second section holds cards 3 to 6.
 *
 * Everything here is plain arithmetic on that layout. The component reads the
 * layout off the page and applies the result.
 */

/** No card is selected: the keyboard is still in the search box. */
export const NO_SELECTION = -1;

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

const ARROW_KEYS: readonly string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export function isArrowKey(key: string): key is ArrowKey {
  return ARROW_KEYS.includes(key);
}

export interface GridLayout {
  /** Number of cards in each section, in the order the sections are rendered. */
  sections: readonly number[];
  /** Cards per row. Every section wraps at the same count. */
  columns: number;
}

/**
 * The card an arrow key moves the selection to, or `NO_SELECTION`.
 *
 * - From no selection, Down enters the cards at the first one. The other keys
 *   do nothing.
 * - Left and Right step through the cards in reading order, across sections.
 *   Right stops at the last card. Left from the first card leaves the cards.
 * - Up and Down keep the column. Where the row they move to is shorter, they
 *   land on its last card. Down from the last row of a section enters the
 *   first row of the next one, and Up from the first row enters the last row
 *   of the one before.
 * - Up from the very first row leaves the cards. Down from the very last row
 *   moves to the last card.
 *
 * A `current` that is not a card of the layout counts as no selection.
 */
export function moveSelection(current: number, key: ArrowKey, layout: GridLayout): number {
  const sizes = layout.sections.filter((size) => size > 0);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const columns = Math.max(1, Math.floor(layout.columns) || 1);

  const isSelected = Number.isInteger(current) && current >= 0 && current < total;
  if (!isSelected) {
    return key === 'ArrowDown' && total > 0 ? 0 : NO_SELECTION;
  }

  if (key === 'ArrowRight') return Math.min(current + 1, total - 1);
  if (key === 'ArrowLeft') return current > 0 ? current - 1 : NO_SELECTION;

  // Find the section holding the current card
  let section = 0;
  let start = 0;
  while (current >= start + sizes[section]) {
    start += sizes[section];
    section++;
  }
  const size = sizes[section];
  const position = current - start;
  const column = position % columns;
  const lastRowStartOf = (count: number) => count - 1 - ((count - 1) % columns);

  if (key === 'ArrowDown') {
    if (position + columns < size) return current + columns;

    const isOnLastRow = position >= lastRowStartOf(size);
    const isLastSection = section === sizes.length - 1;
    if (!isOnLastRow || isLastSection) return start + size - 1;

    const nextStart = start + size;
    return nextStart + Math.min(column, sizes[section + 1] - 1);
  }

  // ArrowUp
  if (position >= columns) return current - columns;
  if (section === 0) return NO_SELECTION;

  const previousSize = sizes[section - 1];
  const previousStart = start - previousSize;
  return previousStart + Math.min(lastRowStartOf(previousSize) + column, previousSize - 1);
}

/**
 * Number of columns in a grid, from its computed `grid-template-columns`.
 *
 * For a grid that is on screen the browser reports one size per column, such
 * as `272px 272px 272px`, so the count always follows the CSS that laid the
 * cards out. A `repeat()` the browser left unresolved and named lines are
 * understood too. Returns 1 when the value names no columns.
 */
export function countGridColumns(template: string): number {
  // Split on the spaces between tracks, not the ones inside brackets
  const tokens: string[] = [];
  let depth = 0;
  let token = '';
  for (const char of `${template} `) {
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth--;

    if (depth === 0 && /\s/.test(char)) {
      if (token) tokens.push(token);
      token = '';
    } else {
      token += char;
    }
  }

  let count = 0;
  for (const track of tokens) {
    if (track === 'none' || track.startsWith('[')) continue;

    const repeat = /^repeat\(\s*(\d+)\s*,(.*)\)$/s.exec(track);
    count += repeat ? Number(repeat[1]) * countGridColumns(repeat[2]) : 1;
  }

  return Math.max(1, count);
}
