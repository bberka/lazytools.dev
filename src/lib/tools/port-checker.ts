/**
 * Port scanner logic: checks the host and the port list, decides what to scan
 * and probes one port.
 *
 * A browser cannot open raw sockets, so a probe is an HTTP request to the
 * port. An answer of any kind proves the port is open. No answer proves
 * nothing: the port may be closed, firewalled, speaking another protocol, or
 * the browser may have refused to send the request (mixed content, ports it
 * blocks). Those all come back as "filtered".
 *
 * The `fetch` to use is an option, so the module is tested in Node with a fake
 * and never needs the network there.
 */

import { isValidIPv6, parseIPv4 } from './ip-address';
import { defaultFetch, withDeadline, type FetchLike } from './network-fetch';

export interface PortTarget {
  port: number;
  service: string;
  protocol: string;
}

export const COMMON_PORTS: readonly PortTarget[] = [
  { port: 21, service: 'FTP', protocol: 'TCP' },
  { port: 22, service: 'SSH', protocol: 'TCP' },
  { port: 23, service: 'Telnet', protocol: 'TCP' },
  { port: 25, service: 'SMTP', protocol: 'TCP' },
  { port: 53, service: 'DNS', protocol: 'TCP/UDP' },
  { port: 80, service: 'HTTP', protocol: 'TCP' },
  { port: 110, service: 'POP3', protocol: 'TCP' },
  { port: 143, service: 'IMAP', protocol: 'TCP' },
  { port: 443, service: 'HTTPS', protocol: 'TCP' },
  { port: 465, service: 'SMTPS', protocol: 'TCP' },
  { port: 587, service: 'SMTP (Submission)', protocol: 'TCP' },
  { port: 993, service: 'IMAPS', protocol: 'TCP' },
  { port: 995, service: 'POP3S', protocol: 'TCP' },
  { port: 3306, service: 'MySQL', protocol: 'TCP' },
  { port: 3389, service: 'RDP', protocol: 'TCP' },
  { port: 5432, service: 'PostgreSQL', protocol: 'TCP' },
  { port: 6379, service: 'Redis', protocol: 'TCP' },
  { port: 8080, service: 'HTTP Proxy', protocol: 'TCP' },
  { port: 8443, service: 'HTTPS Alt', protocol: 'TCP' },
  { port: 27017, service: 'MongoDB', protocol: 'TCP' },
];

export const MAX_CUSTOM_PORTS = 50;
export const PROBE_TIMEOUT_MS = 3000;

export type ScanMode = 'common' | 'custom';
export type ProbeResult = 'open' | 'filtered';

export type ScanHostResult = { ok: true; host: string } | { ok: false; error: string };
export type PortListResult = { ok: true; ports: number[] } | { ok: false; error: string };
export type ScanPlan = { ok: true; host: string; ports: PortTarget[] } | { ok: false; error: string };

export interface ProbeOptions {
  /** Cancels the probe, which then resolves at once. After aborting, ignore the result. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** The `fetch` to use. Defaults to the global one. */
  fetchImpl?: FetchLike;
}

const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

// A last label that is a number, decimal or hex. URL parsers read such a host
// as an IPv4 address, so "1.2.3" would be scanned as 1.2.0.3.
const NUMERIC_LABEL = /^(?:\d+|0x[0-9a-f]*)$/i;

const MAX_HOST_LENGTH = 253;
const MAX_PORT = 65535;

// Ports probed over TLS. Every other port is probed over plain HTTP.
const HTTPS_PORTS: ReadonlySet<number> = new Set([443, 8443]);

/**
 * Checks a host as typed and returns the form that goes into a URL: an IPv4
 * address without leading zeros, an IPv6 address in brackets, or the hostname.
 */
export function parseScanHost(input: string): ScanHostResult {
  const typed = input.trim();
  if (!typed) return { ok: false, error: 'Please enter a hostname or IP address' };

  const octets = parseIPv4(typed);
  if (octets) return { ok: true, host: octets.join('.') };

  const unbracketed = typed.startsWith('[') && typed.endsWith(']') ? typed.slice(1, -1) : typed;
  if (isValidIPv6(unbracketed)) return { ok: true, host: `[${unbracketed}]` };

  const labels = typed.split('.');
  const isHostname =
    typed.length <= MAX_HOST_LENGTH &&
    labels.every((label) => HOST_LABEL.test(label)) &&
    !NUMERIC_LABEL.test(labels[labels.length - 1]);

  return isHostname ? { ok: true, host: typed } : { ok: false, error: 'Invalid hostname or IP address format' };
}

/**
 * Reads a list of ports and ranges ("80, 443, 8000-8010") into sorted, unique
 * port numbers. Entries are separated by commas or spaces. One bad entry fails
 * the whole list, so a typo is reported rather than quietly left out of the scan.
 */
export function parsePortList(input: string, maxPorts = MAX_CUSTOM_PORTS): PortListResult {
  const tooMany: PortListResult = { ok: false, error: `Please limit the scan to ${maxPorts} ports maximum` };

  // "8000 - 8010" is one range, so spaces around a dash go before the list is split.
  const entries = input
    .replace(/\s*-\s*/g, '-')
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (entries.length === 0) {
    return { ok: false, error: 'Please enter valid port numbers (e.g., 80,443 or 8000-8010)' };
  }

  const ports = new Set<number>();
  for (const entry of entries) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(entry);
    const start = match ? Number(match[1]) : NaN;
    const end = match ? Number(match[2] ?? match[1]) : NaN;
    if (!(start >= 1 && end <= MAX_PORT && start <= end)) {
      return {
        ok: false,
        error: `"${entry}" is not a valid port or range. Use numbers from 1 to ${MAX_PORT} (e.g., 80,443 or 8000-8010)`,
      };
    }

    // Checked before the range is expanded, so "1-65535" is turned down without building it.
    if (end - start + 1 > maxPorts) return tooMany;
    for (let port = start; port <= end; port++) ports.add(port);
    if (ports.size > maxPorts) return tooMany;
  }

  return { ok: true, ports: [...ports].sort((a, b) => a - b) };
}

/**
 * Decides what a scan covers: the host to probe and the ports, each with the
 * service usually found on it. Bad input comes back as `{ ok: false, error }`
 * with a message that can be shown as it is.
 */
export function planScan(hostInput: string, mode: ScanMode, portsInput: string): ScanPlan {
  const host = parseScanHost(hostInput);
  if (!host.ok) return host;

  if (mode === 'common') return { ok: true, host: host.host, ports: [...COMMON_PORTS] };

  const list = parsePortList(portsInput);
  if (!list.ok) return list;

  return {
    ok: true,
    host: host.host,
    ports: list.ports.map(
      (port) => COMMON_PORTS.find((common) => common.port === port) ?? { port, service: 'Unknown', protocol: 'TCP' }
    ),
  };
}

/** The URL a probe requests. `host` is a host from `parseScanHost`. */
export function probeUrl(host: string, port: number): string {
  const scheme = HTTPS_PORTS.has(port) ? 'https' : 'http';
  return `${scheme}://${host}:${port}/favicon.ico`;
}

/**
 * Probes one port. Resolves "open" when the port answers the request with any
 * HTTP response, whatever its status or content, and "filtered" when there is
 * no answer before the deadline or the request fails. It does not reject.
 */
export async function probePort(host: string, port: number, options: ProbeOptions = {}): Promise<ProbeResult> {
  const { signal, timeoutMs = PROBE_TIMEOUT_MS, fetchImpl = defaultFetch } = options;

  try {
    // `no-cors` lets the request go to any origin. The response is opaque, but
    // getting one at all is the answer. Redirects must stay on "follow": the
    // only redirect mode a no-cors request is allowed.
    await withDeadline(
      (requestSignal) =>
        fetchImpl(probeUrl(host, port), {
          mode: 'no-cors',
          cache: 'no-store',
          credentials: 'omit',
          signal: requestSignal,
        }),
      { timeoutMs, signal }
    );
    return 'open';
  } catch {
    return 'filtered';
  }
}
