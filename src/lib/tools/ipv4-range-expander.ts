/**
 * Expands IPv4 CIDR blocks and `start - end` ranges into address lists, and
 * collapses lists and ranges back into the fewest CIDR blocks.
 */

import { ipv4ToNumber, numberToIPv4, parseIPv4 } from './ip-address';

/** The most addresses one expansion will list: a /16. */
export const MAX_EXPANDED_ADDRESSES = 65536;

/** An inclusive run of addresses, as unsigned 32-bit numbers. */
export interface AddressRange {
  start: number;
  end: number;
}

type ParseResult = { ok: true; ranges: AddressRange[] } | { ok: false; error: string };


function readAddress(text: string): number | null {
  const octets = parseIPv4(text);
  return octets ? ipv4ToNumber(octets) : null;
}

/** One entry: an address, `a.b.c.d/len`, `start - end`, or `start - 10` for the last octet. */
function parseItem(item: string): AddressRange | string {
  const slash = item.indexOf('/');
  if (slash !== -1) {
    const address = readAddress(item.slice(0, slash).trim());
    const lengthText = item.slice(slash + 1).trim();
    if (address === null || !/^\d{1,2}$/.test(lengthText) || Number(lengthText) > 32) {
      return `"${item}" is not a valid CIDR block (use a.b.c.d/0 to a.b.c.d/32).`;
    }
    const size = 2 ** (32 - Number(lengthText));
    const start = Math.floor(address / size) * size;
    return { start, end: start + size - 1 };
  }

  const dash = item.indexOf('-');
  if (dash !== -1) {
    const start = readAddress(item.slice(0, dash).trim());
    const endText = item.slice(dash + 1).trim();
    // "10.0.0.1-20" keeps the first three octets of the start address.
    const end =
      start !== null && /^\d{1,3}$/.test(endText)
        ? readAddress(`${numberToIPv4(start).split('.').slice(0, 3).join('.')}.${endText}`)
        : readAddress(endText);
    if (start === null || end === null) return `"${item}" is not a valid address range.`;
    if (start > end) return `"${item}" starts after it ends.`;
    return { start, end };
  }

  const address = readAddress(item);
  if (address === null) return `"${item}" is not a valid IPv4 address, range or CIDR block.`;
  return { start: address, end: address };
}

/** Reads entries separated by new lines, commas or semicolons. */
export function parseRanges(input: string): ParseResult {
  const ranges: AddressRange[] = [];
  const lines = input.split(/[\n,;]+/);

  for (const line of lines) {
    const item = line.trim();
    if (item === '') continue;
    const parsed = parseItem(item);
    if (typeof parsed === 'string') return { ok: false, error: parsed };
    ranges.push(parsed);
  }

  if (ranges.length === 0) return { ok: false, error: 'Enter a CIDR block, a range or a list of addresses.' };
  return { ok: true, ranges };
}

/** Sorts the ranges and joins those that overlap or touch. */
export function mergeRanges(ranges: readonly AddressRange[]): AddressRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: AddressRange[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** The fewest CIDR blocks that cover exactly this range. */
export function rangeToCidrs({ start, end }: AddressRange): string[] {
  const blocks: string[] = [];
  let current = start;

  while (current <= end) {
    // The biggest block that begins at `current` is set by its lowest set bit.
    let size = current === 0 ? 2 ** 32 : (current & -current) >>> 0;
    while (size > end - current + 1) size /= 2;
    blocks.push(`${numberToIPv4(current)}/${32 - Math.log2(size)}`);
    current += size;
  }
  return blocks;
}

export type ExpandResult =
  | { ok: true; count: number; first: string; last: string; addresses: string[] }
  | { ok: false; error: string; count?: number; first?: string; last?: string };

/** Lists every address in the entries, without duplicates, lowest first. */
export function expandRanges(input: string, cap = MAX_EXPANDED_ADDRESSES): ExpandResult {
  const parsed = parseRanges(input);
  if (!parsed.ok) return parsed;

  const merged = mergeRanges(parsed.ranges);
  const count = merged.reduce((total, range) => total + (range.end - range.start + 1), 0);
  const first = numberToIPv4(merged[0].start);
  const last = numberToIPv4(merged[merged.length - 1].end);

  if (count > cap) {
    return {
      ok: false,
      error: `That covers ${count.toLocaleString('en-US')} addresses. Listing is limited to ${cap.toLocaleString('en-US')} (a /16); use a smaller range.`,
      count,
      first,
      last,
    };
  }

  const addresses: string[] = [];
  for (const range of merged) {
    for (let value = range.start; value <= range.end; value++) addresses.push(numberToIPv4(value));
  }
  return { ok: true, count, first, last, addresses };
}

export type CollapseResult =
  | { ok: true; count: number; blocks: string[] }
  | { ok: false; error: string };

/** The fewest CIDR blocks that cover all the entries together. */
export function collapseToCidrs(input: string): CollapseResult {
  const parsed = parseRanges(input);
  if (!parsed.ok) return parsed;

  const merged = mergeRanges(parsed.ranges);
  const count = merged.reduce((total, range) => total + (range.end - range.start + 1), 0);
  return { ok: true, count, blocks: merged.flatMap(rangeToCidrs) };
}

