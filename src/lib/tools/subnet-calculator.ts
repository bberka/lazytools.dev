/**
 * Subnet calculator logic: from an IPv4 address and a prefix length, works out
 * the masks, the network and broadcast addresses, the usable host range, the
 * host counts and what kind of address it is.
 *
 * Addresses are handled as unsigned 32-bit numbers. Everything here is pure,
 * so it runs in Node and in the browser.
 */

import { ipv4ToNumber, numberToIPv4, parseIPv4, type IPv4Octets } from './ip-address';

export interface SubnetInfo {
  /** The address in dotted decimal, without leading zeros. */
  ipAddress: string;
  cidr: number;
  subnetMask: string;
  wildcardMask: string;
  networkAddress: string;
  broadcastAddress: string;
  firstUsableIP: string;
  lastUsableIP: string;
  totalHosts: number;
  usableHosts: number;
  ipClass: string;
  ipType: string;
  binarySubnetMask: string;
}

export type SubnetResult = { ok: true; info: SubnetInfo } | { ok: false; error: string };

function fail(error: string): SubnetResult {
  return { ok: false, error };
}

/** The mask with `prefix` leading one bits, as an unsigned 32-bit number. */
function maskFor(prefix: number): number {
  // JavaScript shifts by the count modulo 32, so `<< 32` is `<< 0` and a /0
  // would come out as 255.255.255.255 instead of 0.0.0.0.
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

function parsePrefix(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const prefix = Number(trimmed);
  return prefix <= 32 ? prefix : null;
}

function toBinary(address: number): string {
  return numberToIPv4(address)
    .split('.')
    .map((octet) => Number(octet).toString(2).padStart(8, '0'))
    .join('.');
}

// Classes are defined by the leading bits of the first octet, so 0 and 127
// belong to class A even though both are reserved.
function ipClassOf(firstOctet: number): string {
  if (firstOctet <= 127) return 'A';
  if (firstOctet <= 191) return 'B';
  if (firstOctet <= 223) return 'C';
  if (firstOctet <= 239) return 'D (Multicast)';
  return 'E (Reserved)';
}

// Special-purpose blocks, most specific first. An address in none of them is public.
const SPECIAL_BLOCKS: ReadonlyArray<readonly [network: IPv4Octets, prefix: number, label: string]> = [
  [[255, 255, 255, 255], 32, 'Broadcast'],
  [[0, 0, 0, 0], 8, 'Current network'],
  [[10, 0, 0, 0], 8, 'Private (Class A)'],
  [[100, 64, 0, 0], 10, 'Shared address space (CGNAT)'],
  [[127, 0, 0, 0], 8, 'Loopback'],
  [[169, 254, 0, 0], 16, 'APIPA (Link-local)'],
  [[172, 16, 0, 0], 12, 'Private (Class B)'],
  [[192, 0, 2, 0], 24, 'Documentation (TEST-NET-1)'],
  [[192, 168, 0, 0], 16, 'Private (Class C)'],
  [[198, 18, 0, 0], 15, 'Benchmarking'],
  [[198, 51, 100, 0], 24, 'Documentation (TEST-NET-2)'],
  [[203, 0, 113, 0], 24, 'Documentation (TEST-NET-3)'],
  [[224, 0, 0, 0], 4, 'Multicast'],
  [[240, 0, 0, 0], 4, 'Reserved'],
];

function ipTypeOf(address: number): string {
  for (const [network, prefix, label] of SPECIAL_BLOCKS) {
    if ((address & maskFor(prefix)) >>> 0 === ipv4ToNumber(network)) return label;
  }
  return 'Public';
}

/**
 * Calculates the subnet an address belongs to.
 *
 * `ipInput` is a dotted-decimal IPv4 address. It may carry its own prefix
 * (`192.168.1.10/26`), which then wins over `cidrInput`. `cidrInput` is the
 * prefix length, 0 to 32, as typed or as a number. Bad input comes back as
 * `{ ok: false, error }` with a message that can be shown as it is.
 */
export function calculateSubnet(ipInput: string, cidrInput: string | number): SubnetResult {
  const text = ipInput.trim();
  if (!text) return fail('Please enter an IP address');

  const slash = text.indexOf('/');
  const address = slash === -1 ? text : text.slice(0, slash).trim();
  const prefixText = slash === -1 ? String(cidrInput) : text.slice(slash + 1);

  const octets = parseIPv4(address);
  if (!octets) return fail('Invalid IPv4 address format');

  const cidr = parsePrefix(prefixText);
  if (cidr === null) return fail('CIDR must be between 0 and 32');

  const ip = ipv4ToNumber(octets);
  const mask = maskFor(cidr);
  const wildcard = ~mask >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | wildcard) >>> 0;

  // A /31 is a point-to-point link where both addresses are hosts (RFC 3021)
  // and a /32 is a single host, so neither loses a network or broadcast address.
  const everyAddressUsable = cidr >= 31;
  const totalHosts = 2 ** (32 - cidr);

  return {
    ok: true,
    info: {
      ipAddress: octets.join('.'),
      cidr,
      subnetMask: numberToIPv4(mask),
      wildcardMask: numberToIPv4(wildcard),
      networkAddress: numberToIPv4(network),
      broadcastAddress: numberToIPv4(broadcast),
      firstUsableIP: numberToIPv4(everyAddressUsable ? network : network + 1),
      lastUsableIP: numberToIPv4(everyAddressUsable ? broadcast : broadcast - 1),
      totalHosts,
      usableHosts: everyAddressUsable ? totalHosts : totalHosts - 2,
      ipClass: ipClassOf(octets[0]),
      ipType: ipTypeOf(ip),
      binarySubnetMask: toBinary(mask),
    },
  };
}
