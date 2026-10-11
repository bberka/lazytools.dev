import { STATUS_CODE_ENTRIES, type StatusCodeEntry } from './http-status-codes-data';

// Logic for the HTTP Status Codes reference: the table of codes, how a code
// maps to its class, and the search the page runs on every keystroke. No
// React and no DOM, so it runs in Node as well as in the browser.

export type StatusClass = '1xx' | '2xx' | '3xx' | '4xx' | '5xx';

/** A class to filter by, or `'all'` for no filtering. */
export type StatusClassFilter = StatusClass | 'all';

export interface StatusClassInfo {
  id: StatusClass;
  label: string;
  summary: string;
}

export interface HttpStatusCode extends StatusCodeEntry {
  statusClass: StatusClass;
}

/** The five classes, ordered by their first digit. */
export const STATUS_CLASSES: readonly StatusClassInfo[] = [
  { id: '1xx', label: 'Informational', summary: 'The request was received and the process is continuing.' },
  { id: '2xx', label: 'Successful', summary: 'The request was received, understood and accepted.' },
  { id: '3xx', label: 'Redirection', summary: 'Further action is needed to complete the request.' },
  { id: '4xx', label: 'Client Error', summary: 'The request contains an error or cannot be fulfilled.' },
  { id: '5xx', label: 'Server Error', summary: 'The server failed to fulfil a valid request.' },
];

/** The class of a status code, or null for anything outside 100-599. */
export function statusClassOf(code: number): StatusClass | null {
  if (!Number.isInteger(code) || code < 100 || code > 599) return null;
  return STATUS_CLASSES[Math.floor(code / 100) - 1].id;
}

/** Every code in the table, in ascending order, each with its class. */
export const HTTP_STATUS_CODES: readonly HttpStatusCode[] = STATUS_CODE_ENTRIES.flatMap((entry) => {
  const statusClass = statusClassOf(entry.code);
  return statusClass ? [{ ...entry, statusClass }] : [];
}).sort((a, b) => a.code - b.code);

export function getStatusCode(code: number): HttpStatusCode | undefined {
  return HTTP_STATUS_CODES.find((entry) => entry.code === code);
}

/** The text copied for a code, for example `404 Not Found`. */
export function formatStatusLine(entry: Pick<HttpStatusCode, 'code' | 'phrase'>): string {
  return `${entry.code} ${entry.phrase}`;
}

export function countByClass(entries: readonly HttpStatusCode[]): Record<StatusClass, number> {
  const counts: Record<StatusClass, number> = { '1xx': 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  for (const entry of entries) counts[entry.statusClass] += 1;
  return counts;
}

// Lower case, and drop apostrophes so "im a teapot" finds "I'm a teapot".
function normalise(text: string): string {
  return text.toLowerCase().replace(/['’]/g, '');
}

const SEARCH_INDEX = HTTP_STATUS_CODES.map((entry) => ({
  entry,
  code: String(entry.code),
  text: normalise(`${entry.phrase} ${entry.description}`),
}));

const DIGITS = /^\d+$/;
const CLASS_TERM = /^[1-5]xx$/;

/**
 * Search the table. The query is split on whitespace and every term must
 * match:
 *  - a number matches the start of the code, so `40` finds 400 to 409;
 *  - `4xx` and its siblings match a whole class;
 *  - anything else matches as part of the phrase or description, ignoring case.
 * An empty query matches everything. `statusClass` narrows the result to one
 * class. Results stay in ascending code order.
 */
export function searchStatusCodes(
  query: string,
  statusClass: StatusClassFilter = 'all',
): HttpStatusCode[] {
  const terms = normalise(query).split(/\s+/).filter(Boolean);

  return SEARCH_INDEX.filter(({ entry, code, text }) => {
    if (statusClass !== 'all' && entry.statusClass !== statusClass) return false;
    return terms.every((term) => {
      if (DIGITS.test(term)) return code.startsWith(term);
      if (CLASS_TERM.test(term)) return entry.statusClass === term;
      return text.includes(term);
    });
  }).map(({ entry }) => entry);
}
