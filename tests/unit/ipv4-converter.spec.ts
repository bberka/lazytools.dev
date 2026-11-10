import { describe, expect, test } from 'vite-plus/test';
import {
  convertIPv4,
  expandIPv6,
  readIPv4,
  type IPv4ConversionResult,
} from '@/lib/tools/ipv4-converter';

function forms(input: string): Record<string, string> {
  const result = convertIPv4(input);
  if (!result.ok) throw new Error(`expected a conversion for ${input}, got: ${result.error}`);
  return Object.fromEntries(result.forms.map((form) => [form.id, form.value]));
}

function errorOf(input: string): string {
  const result: IPv4ConversionResult = convertIPv4(input);
  if (result.ok) throw new Error(`expected an error for ${input}`);
  return result.error;
}

describe('convertIPv4 forms', () => {
  test('writes 192.168.1.1 in every form', () => {
    expect(forms('192.168.1.1')).toEqual({
      'dotted-decimal': '192.168.1.1',
      integer: '3232235777',
      hex: '0xC0A80101',
      'dotted-hex': '0xC0.0xA8.0x01.0x01',
      octal: '030052000401',
      'binary-dotted': '11000000.10101000.00000001.00000001',
      binary: '11000000101010000000000100000001',
      'mapped-ipv6': '::ffff:c0a8:101',
      'mapped-ipv6-dotted': '::ffff:192.168.1.1',
    });
  });

  test('handles the lowest address', () => {
    expect(forms('0.0.0.0')).toEqual({
      'dotted-decimal': '0.0.0.0',
      integer: '0',
      hex: '0x00000000',
      'dotted-hex': '0x00.0x00.0x00.0x00',
      octal: '00',
      'binary-dotted': '00000000.00000000.00000000.00000000',
      binary: '00000000000000000000000000000000',
      'mapped-ipv6': '::ffff:0:0',
      'mapped-ipv6-dotted': '::ffff:0.0.0.0',
    });
  });

  test('handles the highest address', () => {
    expect(forms('255.255.255.255')).toEqual({
      'dotted-decimal': '255.255.255.255',
      integer: '4294967295',
      hex: '0xFFFFFFFF',
      'dotted-hex': '0xFF.0xFF.0xFF.0xFF',
      octal: '037777777777',
      'binary-dotted': '11111111.11111111.11111111.11111111',
      binary: '11111111111111111111111111111111',
      'mapped-ipv6': '::ffff:ffff:ffff',
      'mapped-ipv6-dotted': '::ffff:255.255.255.255',
    });
  });

  test('reports the detected format and the number', () => {
    const result = convertIPv4('127.0.0.1');
    expect(result.ok && result.format).toBe('dotted-decimal');
    expect(result.ok && result.value).toBe(2130706433);
  });
});

describe('readIPv4 detection', () => {
  test('reads dotted decimal, ignoring surrounding space', () => {
    expect(readIPv4('  10.0.0.1 ')).toEqual({
      ok: true,
      format: 'dotted-decimal',
      value: 167772161,
    });
  });

  test('reads a decimal integer', () => {
    expect(readIPv4('3232235777')).toEqual({ ok: true, format: 'integer', value: 3232235777 });
    expect(readIPv4('0')).toEqual({ ok: true, format: 'integer', value: 0 });
    expect(readIPv4('4294967295')).toEqual({ ok: true, format: 'integer', value: 4294967295 });
  });

  test('reads hex with and without the 0x prefix', () => {
    expect(readIPv4('0xC0A80101')).toEqual({ ok: true, format: 'hex', value: 3232235777 });
    expect(readIPv4('0xc0a80101')).toEqual({ ok: true, format: 'hex', value: 3232235777 });
    expect(readIPv4('C0A80101')).toEqual({ ok: true, format: 'hex', value: 3232235777 });
    expect(readIPv4('0x7f000001')).toEqual({ ok: true, format: 'hex', value: 2130706433 });
    expect(readIPv4('0bad')).toEqual({ ok: true, format: 'hex', value: 0xbad });
  });

  test('reads dotted hex', () => {
    expect(readIPv4('0xC0.0xA8.0x01.0x01')).toEqual({
      ok: true,
      format: 'dotted-hex',
      value: 3232235777,
    });
    expect(errorOf('0xC0.0xA8.0x01.0x100')).toContain('0x00 to 0xFF');
  });

  test('reads octal with a leading 0 or a 0o prefix', () => {
    expect(readIPv4('030052000401')).toEqual({ ok: true, format: 'octal', value: 3232235777 });
    expect(readIPv4('0o30052000401')).toEqual({ ok: true, format: 'octal', value: 3232235777 });
    expect(readIPv4('037777777777')).toEqual({ ok: true, format: 'octal', value: 4294967295 });
    expect(errorOf('089')).toContain('octal');
  });

  test('reads binary as 32 bits, dotted groups or a 0b prefix', () => {
    const bits = '11000000101010000000000100000001';
    expect(readIPv4(bits)).toEqual({ ok: true, format: 'binary', value: 3232235777 });
    expect(readIPv4('11000000.10101000.00000001.00000001')).toEqual({
      ok: true,
      format: 'binary',
      value: 3232235777,
    });
    expect(readIPv4(`0b${bits}`)).toEqual({ ok: true, format: 'binary', value: 3232235777 });
    expect(readIPv4('0b101')).toEqual({ ok: true, format: 'binary', value: 5 });
  });

  test('reads IPv4-mapped IPv6 in hex and dotted form', () => {
    expect(readIPv4('::ffff:c0a8:101')).toEqual({
      ok: true,
      format: 'mapped-ipv6',
      value: 3232235777,
    });
    expect(readIPv4('::FFFF:192.168.1.1')).toEqual({
      ok: true,
      format: 'mapped-ipv6',
      value: 3232235777,
    });
    expect(readIPv4('0:0:0:0:0:ffff:ffff:ffff')).toEqual({
      ok: true,
      format: 'mapped-ipv6',
      value: 4294967295,
    });
    expect(readIPv4('::ffff:0:0')).toEqual({ ok: true, format: 'mapped-ipv6', value: 0 });
  });
});

describe('convertIPv4 errors', () => {
  test('asks for input when it is empty', () => {
    expect(errorOf('')).toBe('Enter an address to convert.');
    expect(errorOf('   ')).toBe('Enter an address to convert.');
  });

  test('rejects dotted addresses with a bad part', () => {
    expect(errorOf('256.1.1.1')).toContain('0 to 255');
    expect(errorOf('1.2.3')).toContain('four parts');
    expect(errorOf('1.2.3.4.5')).toContain('four parts');
    expect(errorOf('1.2.3.x')).toContain('0 to 255');
  });

  test('rejects numbers beyond 32 bits', () => {
    expect(errorOf('4294967296')).toContain('larger than 32 bits');
    expect(errorOf('0x100000000')).toContain('larger than 32 bits');
    expect(errorOf('040000000000')).toContain('larger than 32 bits');
  });

  test('rejects IPv6 that is not IPv4-mapped', () => {
    expect(errorOf('2001:db8::1')).toContain('IPv4-mapped');
    expect(errorOf('::1')).toContain('IPv4-mapped');
    expect(errorOf('::ffff:1:2:3')).toContain('IPv4-mapped');
    expect(errorOf('1::2::3')).toContain('not a valid IPv6');
    expect(errorOf('1:2:3')).toContain('not a valid IPv6');
  });

  test('rejects text that is no address at all', () => {
    expect(errorOf('hello')).toContain('Could not recognise');
    expect(errorOf('-1')).toContain('Could not recognise');
    expect(errorOf('0xZZ')).toContain('not hexadecimal');
  });
});

describe('expandIPv6', () => {
  test('fills in the zero groups', () => {
    expect(expandIPv6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(expandIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIPv6('2001:db8::ff00:42:8329')).toEqual([
      0x2001, 0xdb8, 0, 0, 0, 0xff00, 0x42, 0x8329,
    ]);
    expect(expandIPv6('1::')).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
  });

  test('turns a dotted tail into two groups', () => {
    expect(expandIPv6('::ffff:192.168.1.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0101]);
  });

  test('returns null for invalid text', () => {
    expect(expandIPv6('1:2:3')).toBeNull();
    expect(expandIPv6('1::2::3')).toBeNull();
  });
});
