/**
 * Lookup and search over the MIME types table in `mime-types-data`. Nothing
 * here touches the DOM, so it runs in Node.
 */

import { MIME_ENTRIES, type MimeCategory, type MimeEntry } from '@/lib/tools/mime-types-data';

export { MIME_ENTRIES, type MimeCategory, type MimeEntry };

export const MIME_CATEGORIES: ReadonlyArray<{ id: MimeCategory; label: string }> = [
  { id: 'web', label: 'Web' },
  { id: 'text', label: 'Text' },
  { id: 'data', label: 'Data' },
  { id: 'code', label: 'Code' },
  { id: 'image', label: 'Image' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'font', label: 'Font' },
  { id: 'document', label: 'Document' },
  { id: 'archive', label: 'Archive' },
  { id: 'binary', label: 'Binary' },
];

export type MimeCategoryFilter = MimeCategory | 'all';

/** Matches `type/subtype` as written in the table. */
export const MIME_TYPE_PATTERN = /^[a-z]+\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

const BY_EXTENSION = new Map(MIME_ENTRIES.map((entry) => [entry.ext, entry]));

/**
 * The extension in a file name or extension: `photo.JPG`, `.jpg`, `*.jpg` and
 * `jpg` all give `jpg`, and `archive.tar.gz` gives `gz`. Returns '' when there
 * is none.
 */
export function extensionOf(text: string): string {
  const trimmed = text.trim().toLowerCase().replace(/^\*+/, '');
  const dot = trimmed.lastIndexOf('.');
  return dot === -1 ? trimmed : trimmed.slice(dot + 1);
}

/** The entry for a file name or extension, or undefined. */
export function lookupByExtension(text: string): MimeEntry | undefined {
  const ext = extensionOf(text);
  return ext === '' ? undefined : BY_EXTENSION.get(ext);
}

/**
 * Drops parameters and case from a Content-Type value:
 * `Text/HTML; charset=UTF-8` gives `text/html`.
 */
export function normalizeMimeType(text: string): string {
  return text.split(';')[0].trim().toLowerCase();
}

/** Every entry served as this type, in table order. */
export function lookupByType(text: string): MimeEntry[] {
  const type = normalizeMimeType(text);
  return type === '' ? [] : MIME_ENTRIES.filter((entry) => entry.type === type);
}

function score(entry: MimeEntry, query: string, bare: string): number {
  if (entry.ext === bare) return 100;
  if (entry.type === query) return 90;
  if (entry.ext.startsWith(bare) && bare !== '') return 80;
  if (entry.type.startsWith(query)) return 70;
  if (entry.type.includes(query)) return 50;
  if (entry.note?.toLowerCase().includes(query)) return 20;
  return 0;
}

/**
 * Entries matching the text, best first, optionally limited to one category.
 * The text can be an extension (`png`, `.png`, `photo.png`), a MIME type or a
 * piece of one (`image/`, `svg+xml`). An exact extension comes first, then an exact type, then
 * prefixes, then substrings; equal matches stay in alphabetical order. Empty
 * text lists everything.
 */
export function searchMimeTypes(text: string, category: MimeCategoryFilter = 'all'): MimeEntry[] {
  const inCategory = MIME_ENTRIES.filter((entry) => category === 'all' || entry.category === category);
  const query = text.trim().toLowerCase();
  if (query === '') return [...inCategory];

  const bare = extensionOf(query);
  return inCategory
    .map((entry) => ({ entry, points: score(entry, normalizeMimeType(query), bare) }))
    .filter(({ points }) => points > 0)
    .sort((a, b) => b.points - a.points)
    .map(({ entry }) => entry);
}

/** How many of the entries are in each category. */
export function countByCategory(entries: readonly MimeEntry[]): Record<MimeCategory, number> {
  const counts = Object.fromEntries(MIME_CATEGORIES.map((category) => [category.id, 0])) as Record<
    MimeCategory,
    number
  >;
  for (const entry of entries) counts[entry.category]++;
  return counts;
}

/** The header line for an entry: `Content-Type: image/png`. */
export function contentTypeHeader(entry: MimeEntry): string {
  return `Content-Type: ${entry.type}`;
}
