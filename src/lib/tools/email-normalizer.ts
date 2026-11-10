/**
 * Email Normalizer logic.
 *
 * `normalizeEmails` reads a batch of addresses, checks each one, writes it in
 * a canonical form and marks addresses that end up identical. The validity
 * check is a syntax check (a dot-atom local part and a hostname domain); it
 * cannot tell whether a mailbox exists. Quoted local parts and IP-literal
 * domains are not supported and count as invalid. Pure functions, no DOM.
 */

import { encodeDomain } from '@/lib/tools/punycode-converter';

export interface EmailOptions {
  /** Lower-case the part before the @. The domain is always lower-cased. */
  lowercaseLocal: boolean;
  /** For gmail.com and googlemail.com: remove dots and the +tag, and use gmail.com. */
  gmailRules: boolean;
  /** Remove the +tag from addresses at every other domain. */
  stripPlusTags: boolean;
  /** Write an international domain in ASCII (bücher.de becomes xn--bcher-kva.de). */
  idnToAscii: boolean;
  /** Leave repeated addresses out of the output list. */
  removeDuplicates: boolean;
}

export const DEFAULT_OPTIONS: EmailOptions = {
  lowercaseLocal: true,
  gmailRules: true,
  stripPlusTags: false,
  idnToAscii: true,
  removeDuplicates: true,
};

export interface EmailEntry {
  /** 1-based position of the address in the batch. */
  position: number;
  /** The address as found, without a display name or a mailto: prefix. */
  original: string;
  /** The canonical address; '' when the address is not valid. */
  normalized: string;
  valid: boolean;
  /** Why the address is not valid; '' when it is. */
  reason: string;
  /** Position of the first address with the same normalized form, or null. */
  duplicateOf: number | null;
}

export interface EmailStats {
  total: number;
  valid: number;
  invalid: number;
  unique: number;
  duplicates: number;
  /** Valid addresses whose normalized form differs from what was typed. */
  changed: number;
}

export interface EmailResult {
  entries: EmailEntry[];
  /** Normalized valid addresses, one per line, without repeats if asked. */
  output: string;
  stats: EmailStats;
}

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/** Splits a pasted batch into addresses. Newlines, commas and semicolons separate them. */
export function parseEntries(text: string): string[] {
  const entries: string[] = [];
  for (const part of text.split(/[\r\n,;]+/)) {
    let value = part.trim();
    // "Ada Lovelace <ada@example.com>" is the address in the brackets.
    const bracketed = /<([^<>]*)>/.exec(value);
    if (bracketed) value = bracketed[1].trim();
    value = value.replace(/^mailto:/i, '').trim();
    if (value !== '') entries.push(value);
  }
  return entries;
}

const LOCAL_ATOM = /^[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+$/u;
const DOMAIN_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function localProblem(local: string): string | null {
  if (local === '') return 'Empty local part';
  if (Array.from(local).length > 64) return 'Local part is longer than 64 characters';
  if (!local.split('.').every((atom) => LOCAL_ATOM.test(atom)))
    return 'Invalid characters or dots in local part';
  return null;
}

function domainProblem(domain: string): string | null {
  if (domain === '') return 'Empty domain';
  if (!domain.includes('.')) return 'Domain needs a dot, like example.com';
  let ascii: string;
  try {
    ascii = encodeDomain(domain).toLowerCase();
  } catch {
    return 'Invalid domain';
  }
  if (ascii.length > 253) return 'Domain is longer than 253 characters';
  const labels = ascii.split('.');
  if (!labels.every((label) => DOMAIN_LABEL.test(label))) return 'Invalid domain';
  const tld = labels[labels.length - 1];
  if (tld.length < 2 || /^[0-9]+$/.test(tld)) return 'Invalid domain';
  return null;
}

/** Why the address is not valid, or null when its syntax is fine. */
export function emailProblem(address: string): string | null {
  const at = address.indexOf('@');
  if (at === -1) return 'Missing @';
  if (address.indexOf('@', at + 1) !== -1) return 'More than one @';
  const problem = localProblem(address.slice(0, at)) ?? domainProblem(address.slice(at + 1));
  if (problem) return problem;
  if (address.length > 254) return 'Address is longer than 254 characters';
  return null;
}

/**
 * The canonical form of one address. Call it for addresses that passed
 * `emailProblem`; it makes no validity checks of its own.
 */
export function normalizeAddress(address: string, options: EmailOptions): string {
  const at = address.lastIndexOf('@');
  let local = address.slice(0, at);
  let domain = address
    .slice(at + 1)
    .normalize('NFC')
    .toLowerCase();

  if (options.idnToAscii) domain = encodeDomain(domain);
  if (options.lowercaseLocal) local = local.toLowerCase();

  if (options.gmailRules && GMAIL_DOMAINS.has(domain)) {
    local = local.split('+')[0].replace(/\./g, '');
    domain = 'gmail.com';
  } else if (options.stripPlusTags) {
    const plus = local.indexOf('+');
    // "+tag@example.com" has nothing before the tag, so it is left alone.
    if (plus > 0) local = local.slice(0, plus);
  }

  return `${local}@${domain}`;
}

export function normalizeEmails(text: string, options: EmailOptions): EmailResult {
  const firstSeen = new Map<string, number>();
  const entries: EmailEntry[] = parseEntries(text).map((original, index) => {
    const position = index + 1;
    let problem = emailProblem(original);
    let normalized = '';
    if (!problem) {
      normalized = normalizeAddress(original, options);
      // Gmail rules can leave nothing before the @ ("+tag@gmail.com").
      problem = emailProblem(normalized);
      if (problem) normalized = '';
    }
    if (problem) {
      return {
        position,
        original,
        normalized: '',
        valid: false,
        reason: problem,
        duplicateOf: null,
      };
    }
    const first = firstSeen.get(normalized);
    if (first === undefined) firstSeen.set(normalized, position);
    return { position, original, normalized, valid: true, reason: '', duplicateOf: first ?? null };
  });

  const valid = entries.filter((entry) => entry.valid);
  const duplicates = valid.filter((entry) => entry.duplicateOf !== null).length;
  const listed = options.removeDuplicates
    ? valid.filter((entry) => entry.duplicateOf === null)
    : valid;

  return {
    entries,
    output: listed.map((entry) => entry.normalized).join('\n'),
    stats: {
      total: entries.length,
      valid: valid.length,
      invalid: entries.length - valid.length,
      unique: valid.length - duplicates,
      duplicates,
      changed: valid.filter((entry) => entry.normalized !== entry.original).length,
    },
  };
}

export const EXAMPLE_TEXT = [
  'John.Doe+newsletter@Gmail.com',
  'johndoe@googlemail.com',
  'Ada Lovelace <ADA@Example.COM>',
  'info@Bücher.de',
  'not-an-email',
  'ada@example.com',
  'name@',
].join('\n');
