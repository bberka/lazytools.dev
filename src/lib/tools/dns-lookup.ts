/**
 * DNS lookup logic: checks the name, queries Google's DNS-over-HTTPS JSON API
 * and turns the answer into records the page can show, or into a message that
 * says what went wrong.
 *
 * The `fetch` to use is an option, so the module is tested in Node with a fake
 * and never needs the network there.
 */

import {
  fetchJson,
  isJsonObject,
  RequestTimeoutError,
  type FetchLike,
  type JsonResponse,
} from './network-fetch';

export const DNS_RECORD_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA'] as const;
export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

export interface DnsRecord {
  /** The owner name as the resolver returned it, usually with a trailing dot. */
  name: string;
  /** The record's own type, which is not always the one asked for: an alias answers with CNAME records too. */
  type: string;
  /** Time to live in seconds. */
  ttl: number;
  data: string;
}

export interface DnsLookupResult {
  /** The name that was queried, in ASCII form and without a trailing dot. */
  name: string;
  /** The record type that was asked for. */
  type: DnsRecordType;
  /** Every record in the answer, in the resolver's order. */
  records: DnsRecord[];
}

export type DnsLookupOutcome = { ok: true; result: DnsLookupResult } | { ok: false; error: string };
export type DomainNameResult = { ok: true; name: string } | { ok: false; error: string };

export interface DnsLookupOptions {
  /** Cancels the lookup. After aborting, ignore the outcome. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** The `fetch` to use. Defaults to the global one. */
  fetchImpl?: FetchLike;
}

const TYPE_NUMBERS: Record<DnsRecordType, number> = {
  A: 1,
  AAAA: 28,
  MX: 15,
  TXT: 16,
  NS: 2,
  CNAME: 5,
  SOA: 6,
};

// Types that can turn up in an answer without being one of the types on offer.
const OTHER_TYPE_NAMES: Record<number, string> = {
  12: 'PTR',
  33: 'SRV',
  39: 'DNAME',
  46: 'RRSIG',
  257: 'CAA',
};

// Response codes of a failed query (RFC 1035 and RFC 2136).
const STATUS_MESSAGES: Record<number, string> = {
  1: 'the DNS server could not read the query (FORMERR)',
  2: 'the DNS server failed to answer (SERVFAIL)',
  3: 'the domain does not exist (NXDOMAIN)',
  4: 'the DNS server does not support this query (NOTIMP)',
  5: 'the DNS server refused the query (REFUSED)',
};

const INVALID_NAME = 'Invalid domain name format';
const MAX_NAME_LENGTH = 253;

// Letters, digits and hyphens, plus the underscore that service names such as
// _dmarc and _domainkey start with. A label cannot begin or end with a hyphen.
const LABEL = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/i;

// Characters that would make the URL parser read the text as something other than a host.
const NOT_A_HOST = /[\s/\\?#@:%[\]]/;

function typeName(type: unknown): string {
  const known = DNS_RECORD_TYPES.find((name) => TYPE_NUMBERS[name] === type);
  if (known) return known;
  return typeof type === 'number' ? (OTHER_TYPE_NAMES[type] ?? `TYPE${type}`) : 'Unknown';
}

/** Converts an internationalised name to its ASCII (punycode) form, or null when it has none. */
function toAscii(name: string): string | null {
  if (NOT_A_HOST.test(name)) return null;
  try {
    return new URL(`http://${name}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Checks a domain name as typed and returns the form to query: trimmed, in
 * ASCII, without the trailing dot of a fully qualified name. Service labels
 * (`_dmarc.example.com`), single labels (`com`) and internationalised names
 * are accepted; an IP address is not a domain name.
 */
export function parseDomainName(input: string): DomainNameResult {
  const typed = input.trim();
  if (!typed) return { ok: false, error: 'Please enter a domain name' };

  const withoutRootDot = typed.endsWith('.') ? typed.slice(0, -1) : typed;
  // Plain ASCII is checked as it is; anything else has to convert to punycode first.
  const name = /^[ -~]*$/.test(withoutRootDot) ? withoutRootDot : toAscii(withoutRootDot);
  if (!name || name.length > MAX_NAME_LENGTH) return { ok: false, error: INVALID_NAME };

  const labels = name.split('.');
  const lastLabel = labels[labels.length - 1];
  // No top-level domain is a number, so a numeric last label means an IP address or a typo.
  if (!labels.every((label) => LABEL.test(label)) || /^\d+$/.test(lastLabel)) {
    return { ok: false, error: INVALID_NAME };
  }

  return { ok: true, name };
}

/** Whether two DNS names are the same name: case and a trailing dot do not count. */
export function sameDnsName(a: string, b: string): boolean {
  const normalize = (name: string) => name.trim().toLowerCase().replace(/\.$/, '');
  return normalize(a) === normalize(b);
}

/** A TTL in its largest whole unit: 45s, 5m, 2h, 1d. */
export function formatTtl(ttl: number): string {
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)}m`;
  if (ttl < 86400) return `${Math.floor(ttl / 3600)}h`;
  return `${Math.floor(ttl / 86400)}d`;
}

/**
 * One line saying what the answer holds, by record type, with the type that
 * was asked for first: "Found 2 A records", "Found 1 A record and 1 CNAME
 * record", "No MX records. Found 1 CNAME record".
 */
export function describeDnsRecords(result: DnsLookupResult): string {
  const counts = new Map<string, number>();
  for (const record of result.records) {
    counts.set(record.type, (counts.get(record.type) ?? 0) + 1);
  }

  const phrase = (type: string) => {
    const count = counts.get(type) ?? 0;
    return `${count} ${type} record${count !== 1 ? 's' : ''}`;
  };
  const others = [...counts.keys()].filter((type) => type !== result.type).map(phrase);

  if (!counts.has(result.type)) {
    const none = `No ${result.type} records`;
    return others.length > 0 ? `${none}. Found ${others.join(' and ')}` : none;
  }
  return `Found ${[phrase(result.type), ...others].join(' and ')}`;
}

function readRecords(answer: unknown): DnsRecord[] {
  if (!Array.isArray(answer)) return [];

  return answer.flatMap((entry): DnsRecord[] => {
    if (!isJsonObject(entry) || typeof entry.data !== 'string') return [];
    return [
      {
        name: typeof entry.name === 'string' ? entry.name : '',
        type: typeName(entry.type),
        ttl: typeof entry.TTL === 'number' && Number.isFinite(entry.TTL) ? entry.TTL : 0,
        data: entry.data,
      },
    ];
  });
}

/**
 * Looks up the records of one type for a domain name.
 *
 * `input` is the name as typed. Resolves with the records, or with a message
 * that can be shown as it is; it does not reject.
 */
export async function lookupDns(
  input: string,
  type: DnsRecordType,
  options: DnsLookupOptions = {}
): Promise<DnsLookupOutcome> {
  const fail = (error: string): DnsLookupOutcome => ({ ok: false, error });

  const parsed = parseDomainName(input);
  if (!parsed.ok) return fail(parsed.error);
  const { name } = parsed;

  let response: JsonResponse;
  try {
    response = await fetchJson(
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${TYPE_NUMBERS[type]}`,
      options
    );
  } catch (error) {
    return fail(
      error instanceof RequestTimeoutError
        ? 'The DNS query timed out. Please try again.'
        : 'Could not reach the DNS service. Please check your connection and try again.'
    );
  }

  if (!response.ok) return fail(`Failed to query DNS records (HTTP ${response.status})`);

  const { data } = response;
  if (!isJsonObject(data) || typeof data.Status !== 'number') {
    return fail('The DNS service returned an unexpected response');
  }

  if (data.Status !== 0) {
    const reason = STATUS_MESSAGES[data.Status];
    return fail(reason ? `DNS query failed: ${reason}` : `DNS query failed with status: ${data.Status}`);
  }

  const records = readRecords(data.Answer);
  if (records.length === 0) return fail(`No ${type} records found for ${input.trim()}`);

  return { ok: true, result: { name, type, records } };
}
