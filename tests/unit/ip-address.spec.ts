import { test, expect } from '@playwright/test';
import { ipv4ToNumber, isValidIPv6, normalizeIp, numberToIPv4, parseIPv4 } from '@/lib/tools/ip-address';

test.describe('parseIPv4', () => {
  test('reads the four octets of a dotted-decimal address', () => {
    expect(parseIPv4('192.168.1.10')).toEqual([192, 168, 1, 10]);
    expect(parseIPv4('0.0.0.0')).toEqual([0, 0, 0, 0]);
    expect(parseIPv4('255.255.255.255')).toEqual([255, 255, 255, 255]);
  });

  test('reads leading zeros as decimal, not octal', () => {
    expect(parseIPv4('010.001.000.009')).toEqual([10, 1, 0, 9]);
  });

  test('rejects octets above 255 and the wrong number of parts', () => {
    for (const text of ['256.1.1.1', '1.2.3.999', '1.2.3', '1.2.3.4.5', '1.2.3.', '.1.2.3', '1..2.3', '']) {
      expect(parseIPv4(text), text).toBeNull();
    }
  });

  // Regression: validation built on parseInt accepted all of these.
  test('rejects text that merely starts with a number', () => {
    const garbage = [
      '192.168.1.1abc',
      '192.168.1.1/24',
      '1e2.1.1.1',
      '-0.1.1.1',
      '+1.2.3.4',
      ' 1.2.3.4',
      '1. 2.3.4',
      '0x10.1.1.1',
      '1.2.3.4\n',
    ];
    for (const text of garbage) {
      expect(parseIPv4(text), JSON.stringify(text)).toBeNull();
    }
  });

  test('rejects Unicode digits and more than three digits per octet', () => {
    expect(parseIPv4('１.２.３.４')).toBeNull();
    expect(parseIPv4('0001.2.3.4')).toBeNull();
  });
});

test.describe('ipv4ToNumber and numberToIPv4', () => {
  test('convert both ways', () => {
    expect(ipv4ToNumber([192, 168, 1, 10])).toBe(3232235786);
    expect(numberToIPv4(3232235786)).toBe('192.168.1.10');
    expect(ipv4ToNumber([0, 0, 0, 0])).toBe(0);
    expect(numberToIPv4(0)).toBe('0.0.0.0');
  });

  test('stay unsigned at the top of the range', () => {
    expect(ipv4ToNumber([255, 255, 255, 255])).toBe(4294967295);
    expect(ipv4ToNumber([128, 0, 0, 0])).toBe(2147483648);
    expect(numberToIPv4(4294967295)).toBe('255.255.255.255');
  });
});

test.describe('isValidIPv6', () => {
  test('accepts full and compressed addresses', () => {
    for (const text of [
      '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      '2001:db8::1',
      '2001:4860:4860::8888',
      '::1',
      '::',
      '1::',
      'FE80::1',
      '1:2:3:4:5:6:7:8',
    ]) {
      expect(isValidIPv6(text), text).toBe(true);
    }
  });

  // Regression: the old pattern counted colons, so it turned these valid addresses down.
  test('accepts a compression at either end of seven groups and an IPv4 tail', () => {
    const valid = ['1:2:3:4:5:6:7::', '::2:3:4:5:6:7:8', '::ffff:192.0.2.1', '64:ff9b::8.8.8.8', '1:2:3:4:5:6:1.2.3.4'];
    for (const text of valid) {
      expect(isValidIPv6(text), text).toBe(true);
    }
  });

  // Regression: the old pattern let all of these through to the lookup API.
  test('rejects addresses with too few groups or a malformed compression', () => {
    const invalid = [
      ':::',
      '1:2:3',
      '1::2::3',
      ':1:2',
      '1:2:3:4:5:6:7',
      '1:2:3:4:5:6:7:8:9',
      '1:2:3:4:5:6:7:8::',
      ':1:2:3:4:5:6:7:8',
    ];
    for (const text of invalid) {
      expect(isValidIPv6(text), text).toBe(false);
    }
  });

  test('rejects bad groups, zone ids, brackets and plain IPv4', () => {
    const invalid = [
      '',
      '12345::',
      'g::1',
      'fe80::1%eth0',
      '[::1]',
      '1.2.3.4',
      '::1.2.3',
      '::ffff:1.2.3.4:5',
      '1:2:3:4:5:6:7:1.2.3.4',
      ' ::1',
    ];
    for (const text of invalid) {
      expect(isValidIPv6(text), JSON.stringify(text)).toBe(false);
    }
  });
});

test.describe('normalizeIp', () => {
  test('returns IPv4 without leading zeros and IPv6 as typed', () => {
    expect(normalizeIp('008.008.004.004')).toBe('8.8.4.4');
    expect(normalizeIp('8.8.8.8')).toBe('8.8.8.8');
    expect(normalizeIp('2001:DB8::1')).toBe('2001:DB8::1');
  });

  test('returns null for anything that is not an address', () => {
    for (const text of ['', 'example.com', '1.2.3', '8.8.8.8/32', ':::']) {
      expect(normalizeIp(text), text).toBeNull();
    }
  });
});
