/**
 * IP address parsing shared by the networking tools (subnet calculator, IP
 * lookup, port scanner). Everything here is pure, so it runs in Node and in
 * the browser.
 */

export type IPv4Octets = readonly [number, number, number, number];

/**
 * Reads a dotted-decimal IPv4 address. Each of the four parts must be one to
 * three digits and at most 255, so signs, spaces, a `/prefix` and trailing text
 * are all rejected. Leading zeros are read as decimal: `010.1.1.1` is 10.1.1.1.
 */
export function parseIPv4(text: string): IPv4Octets | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  if (!octets.every((octet) => octet <= 255)) return null;
  return [octets[0], octets[1], octets[2], octets[3]];
}

/** The address as an unsigned 32-bit number. */
export function ipv4ToNumber(octets: IPv4Octets): number {
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

/** Dotted-decimal form of an unsigned 32-bit number. */
export function numberToIPv4(value: number): string {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join('.');
}

/**
 * Whether the text is an IPv6 address: eight groups of one to four hex digits,
 * with at most one `::` standing for one or more zero groups, and optionally a
 * dotted IPv4 tail in place of the last two groups (`::ffff:192.0.2.1`). Zone
 * ids (`%eth0`) and brackets are not part of the address and are rejected.
 */
export function isValidIPv6(text: string): boolean {
  let address = text;

  if (address.includes('.')) {
    const tailStart = address.lastIndexOf(':') + 1;
    if (tailStart === 0 || !parseIPv4(address.slice(tailStart))) return false;
    address = `${address.slice(0, tailStart)}0:0`;
  }

  const halves = address.split('::');
  if (halves.length > 2) return false;

  const groups = halves.flatMap((half) => (half === '' ? [] : half.split(':')));
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return false;

  return halves.length === 2 ? groups.length <= 7 : groups.length === 8;
}

/**
 * The address ready to use, or null when the text is neither IPv4 nor IPv6.
 * IPv4 comes back without leading zeros; IPv6 comes back as typed.
 */
export function normalizeIp(text: string): string | null {
  const octets = parseIPv4(text);
  if (octets) return octets.join('.');
  return isValidIPv6(text) ? text : null;
}
