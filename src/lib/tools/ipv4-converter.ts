/**
 * Converts an IPv4 address between its common spellings: dotted decimal, a
 * 32-bit integer, hex, octal, binary and the IPv4-mapped IPv6 form. Any of
 * them can be the input; the format is detected from how it is written.
 */

import { isValidIPv6, ipv4ToNumber, numberToIPv4, parseIPv4 } from './ip-address';

export type IPv4Format =
  | 'dotted-decimal'
  | 'integer'
  | 'hex'
  | 'dotted-hex'
  | 'octal'
  | 'binary'
  | 'mapped-ipv6';

export const IPV4_FORMAT_LABELS: Record<IPv4Format, string> = {
  'dotted-decimal': 'Dotted decimal',
  integer: '32-bit integer',
  hex: 'Hexadecimal',
  'dotted-hex': 'Dotted hexadecimal',
  octal: 'Octal',
  binary: 'Binary',
  'mapped-ipv6': 'IPv4-mapped IPv6',
};

export interface IPv4Form {
  id: string;
  label: string;
  value: string;
}

export type IPv4ConversionResult =
  | { ok: true; format: IPv4Format; value: number; forms: IPv4Form[] }
  | { ok: false; error: string };

const MAX_VALUE = 0xffffffff;

type ReadResult = { ok: true; format: IPv4Format; value: number } | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/**
 * The eight 16-bit groups of an IPv6 address, or null when the text is not one.
 * A dotted IPv4 tail takes the place of the last two groups.
 */
export function expandIPv6(text: string): number[] | null {
  if (!isValidIPv6(text)) return null;

  let address = text;
  if (address.includes('.')) {
    const tailStart = address.lastIndexOf(':') + 1;
    const octets = parseIPv4(address.slice(tailStart));
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    address = `${address.slice(0, tailStart)}${high}:${low}`;
  }

  const [head, tail] = address.split('::');
  const headGroups = head ? head.split(':') : [];
  let groups = headGroups;
  if (tail !== undefined) {
    const tailGroups = tail ? tail.split(':') : [];
    const zeros = Array<string>(8 - headGroups.length - tailGroups.length).fill('0');
    groups = [...headGroups, ...zeros, ...tailGroups];
  }
  return groups.map((group) => parseInt(group, 16));
}

function readMappedIPv6(text: string): ReadResult {
  const groups = expandIPv6(text);
  if (!groups) return fail('That is not a valid IPv6 address.');

  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (!mapped) {
    return fail('Only IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) can be converted to IPv4.');
  }
  return { ok: true, format: 'mapped-ipv6', value: ((groups[6] << 16) | groups[7]) >>> 0 };
}

function readDotted(text: string): ReadResult {
  const parts = text.split('.');
  if (parts.length !== 4) return fail('A dotted address needs exactly four parts.');

  // Dotted hex: every part is written 0x..
  if (parts.every((part) => /^0x/i.test(part))) {
    const values = parts.map((part) => (/^0x[0-9a-f]{1,2}$/i.test(part) ? parseInt(part, 16) : NaN));
    if (values.some(Number.isNaN)) return fail('Each hex part must be 0x00 to 0xFF.');
    return {
      ok: true,
      format: 'dotted-hex',
      value: ipv4ToNumber([values[0], values[1], values[2], values[3]]),
    };
  }

  // Dotted binary: four groups of exactly eight bits.
  if (parts.every((part) => /^[01]{8}$/.test(part))) {
    const value = parts.reduce((total, part) => total * 256 + parseInt(part, 2), 0);
    return { ok: true, format: 'binary', value };
  }

  const octets = parseIPv4(text);
  if (!octets) return fail('Each part of a dotted address must be a number from 0 to 255.');
  return { ok: true, format: 'dotted-decimal', value: ipv4ToNumber(octets) };
}

function readNumber(text: string): ReadResult {
  // A prefix names the base outright.
  const prefixed = /^0([xbo])(.*)$/i.exec(text);
  if (prefixed) {
    const base = ({ x: 16, b: 2, o: 8 } as const)[prefixed[1].toLowerCase() as 'x' | 'b' | 'o'];
    const digits = prefixed[2];
    const pattern = base === 16 ? /^[0-9a-f]+$/i : base === 2 ? /^[01]+$/ : /^[0-7]+$/;
    if (pattern.test(digits)) {
      const value = parseInt(digits, base);
      if (value > MAX_VALUE) return fail('That is larger than 32 bits (4294967295 / 0xFFFFFFFF).');
      const format: IPv4Format = base === 16 ? 'hex' : base === 2 ? 'binary' : 'octal';
      return { ok: true, format, value };
    }
    // "0bad" is bare hex, not a bad binary number; only 0x is always a prefix.
    if (base === 16) return fail(`"${text}" has digits that are not hexadecimal.`);
  }

  // 32 bare 0s and 1s are a binary address; no decimal integer is that long.
  if (/^[01]{32}$/.test(text)) {
    return { ok: true, format: 'binary', value: parseInt(text, 2) };
  }

  // Hex without a prefix needs a letter, otherwise it is a decimal integer.
  if (/^[0-9a-f]{1,8}$/i.test(text) && /[a-f]/i.test(text)) {
    return { ok: true, format: 'hex', value: parseInt(text, 16) };
  }

  if (/^\d+$/.test(text)) {
    // A leading zero is the classic C spelling of octal (inet_aton).
    if (text.length > 1 && text.startsWith('0')) {
      if (!/^[0-7]+$/.test(text)) return fail('A number with a leading 0 is octal and uses digits 0 to 7.');
      const value = parseInt(text, 8);
      if (value > MAX_VALUE) return fail('That is larger than 32 bits (4294967295 / 0xFFFFFFFF).');
      return { ok: true, format: 'octal', value };
    }
    const value = Number(text);
    if (value > MAX_VALUE) return fail('That is larger than 32 bits (4294967295 / 0xFFFFFFFF).');
    return { ok: true, format: 'integer', value };
  }

  return fail('Could not recognise that as an IPv4 address in any supported format.');
}

/** Reads an address written in any supported format and works out its number. */
export function readIPv4(input: string): ReadResult {
  const text = input.trim();
  if (text === '') return fail('Enter an address to convert.');

  if (text.includes(':')) return readMappedIPv6(text);
  if (text.includes('.')) return readDotted(text);
  return readNumber(text);
}

function hex(value: number, width: number): string {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

/** Every spelling of the address that has this 32-bit value. */
export function formatIPv4(value: number): IPv4Form[] {
  const octets = [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
  const dotted = numberToIPv4(value);
  const bits = value.toString(2).padStart(32, '0');
  const high = (value >>> 16).toString(16);
  const low = (value & 0xffff).toString(16);

  return [
    { id: 'dotted-decimal', label: 'Dotted decimal', value: dotted },
    { id: 'integer', label: '32-bit integer', value: String(value) },
    { id: 'hex', label: 'Hexadecimal', value: `0x${hex(value, 8)}` },
    { id: 'dotted-hex', label: 'Dotted hexadecimal', value: octets.map((o) => `0x${hex(o, 2)}`).join('.') },
    { id: 'octal', label: 'Octal', value: `0${value.toString(8)}` },
    { id: 'binary-dotted', label: 'Binary (dotted)', value: octets.map((o) => o.toString(2).padStart(8, '0')).join('.') },
    { id: 'binary', label: 'Binary (32 bits)', value: bits },
    { id: 'mapped-ipv6', label: 'IPv4-mapped IPv6', value: `::ffff:${high}:${low}` },
    { id: 'mapped-ipv6-dotted', label: 'IPv4-mapped IPv6 (dotted)', value: `::ffff:${dotted}` },
  ];
}

/** Detects the format of the input and returns every form of the address. */
export function convertIPv4(input: string): IPv4ConversionResult {
  const read = readIPv4(input);
  if (!read.ok) return read;
  return { ok: true, format: read.format, value: read.value, forms: formatIPv4(read.value) };
}
