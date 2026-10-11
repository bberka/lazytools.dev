import { test, expect } from '@playwright/test';
import { calculateSubnet, type SubnetInfo } from '@/lib/tools/subnet-calculator';

function subnet(ip: string, cidr: string | number): SubnetInfo {
  const result = calculateSubnet(ip, cidr);
  if (!result.ok) throw new Error(`expected a subnet for ${ip}/${cidr}, got: ${result.error}`);
  return result.info;
}

function errorOf(ip: string, cidr: string | number): string {
  const result = calculateSubnet(ip, cidr);
  if (result.ok) throw new Error(`expected an error for ${ip}/${cidr}`);
  return result.error;
}

test.describe('calculateSubnet', () => {
  test('works out every field of an ordinary /24', () => {
    expect(subnet('192.168.1.10', '24')).toEqual({
      ipAddress: '192.168.1.10',
      cidr: 24,
      subnetMask: '255.255.255.0',
      wildcardMask: '0.0.0.255',
      networkAddress: '192.168.1.0',
      broadcastAddress: '192.168.1.255',
      firstUsableIP: '192.168.1.1',
      lastUsableIP: '192.168.1.254',
      totalHosts: 256,
      usableHosts: 254,
      ipClass: 'C',
      ipType: 'Private (Class C)',
      binarySubnetMask: '11111111.11111111.11111111.00000000',
    });
  });

  test('handles prefixes that do not fall on an octet boundary', () => {
    expect(subnet('10.20.30.40', 20)).toMatchObject({
      subnetMask: '255.255.240.0',
      wildcardMask: '0.0.15.255',
      networkAddress: '10.20.16.0',
      broadcastAddress: '10.20.31.255',
      firstUsableIP: '10.20.16.1',
      lastUsableIP: '10.20.31.254',
      totalHosts: 4096,
      usableHosts: 4094,
      binarySubnetMask: '11111111.11111111.11110000.00000000',
    });

    expect(subnet('172.16.5.130', 30)).toMatchObject({
      subnetMask: '255.255.255.252',
      networkAddress: '172.16.5.128',
      broadcastAddress: '172.16.5.131',
      firstUsableIP: '172.16.5.129',
      lastUsableIP: '172.16.5.130',
      totalHosts: 4,
      usableHosts: 2,
    });
  });

  test('stays unsigned in the upper half of the address space', () => {
    expect(subnet('200.100.50.25', 1)).toMatchObject({
      subnetMask: '128.0.0.0',
      wildcardMask: '127.255.255.255',
      networkAddress: '128.0.0.0',
      broadcastAddress: '255.255.255.255',
      firstUsableIP: '128.0.0.1',
      lastUsableIP: '255.255.255.254',
      totalHosts: 2147483648,
      usableHosts: 2147483646,
    });
  });

  // Regression: `0xffffffff << 32` is a shift by 0, so /0 got the mask 255.255.255.255
  // and a "network" of just the address itself.
  test('gives /0 the mask 0.0.0.0 and the whole address space', () => {
    expect(subnet('10.1.2.3', 0)).toMatchObject({
      cidr: 0,
      subnetMask: '0.0.0.0',
      wildcardMask: '255.255.255.255',
      networkAddress: '0.0.0.0',
      broadcastAddress: '255.255.255.255',
      firstUsableIP: '0.0.0.1',
      lastUsableIP: '255.255.255.254',
      totalHosts: 4294967296,
      usableHosts: 4294967294,
      binarySubnetMask: '00000000.00000000.00000000.00000000',
    });
  });

  // Regression: the range was always network+1 to broadcast-1, which for a /31
  // came out backwards (first 10.0.0.1, last 10.0.0.0).
  test('treats both addresses of a /31 as usable, in order', () => {
    expect(subnet('10.0.0.0', 31)).toMatchObject({
      networkAddress: '10.0.0.0',
      broadcastAddress: '10.0.0.1',
      firstUsableIP: '10.0.0.0',
      lastUsableIP: '10.0.0.1',
      totalHosts: 2,
      usableHosts: 2,
    });
    expect(subnet('10.0.0.1', 31)).toMatchObject({ firstUsableIP: '10.0.0.0', lastUsableIP: '10.0.0.1' });
  });

  // Regression: for a /32 the range pointed at the two neighbours of the host
  // (192.168.1.2 and 192.168.1.0), and wrapped around at either end of the address space.
  test('treats the single address of a /32 as the usable range', () => {
    expect(subnet('192.168.1.1', 32)).toMatchObject({
      subnetMask: '255.255.255.255',
      wildcardMask: '0.0.0.0',
      networkAddress: '192.168.1.1',
      broadcastAddress: '192.168.1.1',
      firstUsableIP: '192.168.1.1',
      lastUsableIP: '192.168.1.1',
      totalHosts: 1,
      usableHosts: 1,
    });
    expect(subnet('255.255.255.255', 32)).toMatchObject({
      firstUsableIP: '255.255.255.255',
      lastUsableIP: '255.255.255.255',
    });
    expect(subnet('0.0.0.0', 32)).toMatchObject({ firstUsableIP: '0.0.0.0', lastUsableIP: '0.0.0.0' });
  });

  test('accepts the prefix as a number or as typed text', () => {
    expect(subnet('192.168.1.10', 24).cidr).toBe(24);
    expect(subnet('192.168.1.10', ' 24 ').cidr).toBe(24);
    expect(subnet('  192.168.1.10  ', '8').networkAddress).toBe('192.0.0.0');
  });

  // Regression: "192.168.1.10/26" passed validation as an address and was shown as "192.168.1.10/26/24".
  test('uses a prefix written after the address in place of the separate one', () => {
    expect(subnet('192.168.1.10/26', '24')).toMatchObject({
      ipAddress: '192.168.1.10',
      cidr: 26,
      subnetMask: '255.255.255.192',
      networkAddress: '192.168.1.0',
      broadcastAddress: '192.168.1.63',
    });
    expect(subnet('10.0.0.1 / 8', '').cidr).toBe(8);
    expect(errorOf('192.168.1.10/', '24')).toBe('CIDR must be between 0 and 32');
    expect(errorOf('192.168.1.10/33', '24')).toBe('CIDR must be between 0 and 32');
    expect(errorOf('192.168.1.10/24/8', '24')).toBe('CIDR must be between 0 and 32');
  });

  test('reports the address without leading zeros', () => {
    expect(subnet('192.168.001.010', 24)).toMatchObject({ ipAddress: '192.168.1.10', networkAddress: '192.168.1.0' });
  });

  test('asks for an address when the input is empty or blank', () => {
    expect(errorOf('', '24')).toBe('Please enter an IP address');
    expect(errorOf('   \t ', '24')).toBe('Please enter an IP address');
  });

  // Regression: parseInt-based validation accepted these and calculated a subnet for them.
  test('rejects text that is not a dotted-decimal IPv4 address', () => {
    const notAddresses = [
      '192.168.1.1abc',
      '1e2.1.1.1',
      '-0.1.1.1',
      '1.2.3',
      '1.2.3.4.5',
      '256.1.1.1',
      'example.com',
      '::1',
      '１.２.３.４',
      '🙂',
    ];
    for (const ip of notAddresses) {
      expect(errorOf(ip, '24'), ip).toBe('Invalid IPv4 address format');
    }
  });

  test('rejects a prefix that is not a whole number from 0 to 32', () => {
    for (const cidr of ['', ' ', 'abc', '33', '-1', '24.5', '1e1', '0x10', '+8']) {
      expect(errorOf('192.168.1.10', cidr), JSON.stringify(cidr)).toBe('CIDR must be between 0 and 32');
    }
    expect(errorOf('192.168.1.10', 33)).toBe('CIDR must be between 0 and 32');
    expect(errorOf('192.168.1.10', -1)).toBe('CIDR must be between 0 and 32');
    expect(errorOf('192.168.1.10', 24.5)).toBe('CIDR must be between 0 and 32');
    expect(errorOf('192.168.1.10', NaN)).toBe('CIDR must be between 0 and 32');
  });

  test('names the address class by the first octet', () => {
    const classes: Array<[string, string]> = [
      ['1.1.1.1', 'A'],
      ['126.255.255.255', 'A'],
      ['128.0.0.1', 'B'],
      ['191.255.0.1', 'B'],
      ['192.0.0.1', 'C'],
      ['223.255.255.1', 'C'],
      ['224.0.0.1', 'D (Multicast)'],
      ['239.255.255.255', 'D (Multicast)'],
      ['240.0.0.1', 'E (Reserved)'],
      ['255.255.255.255', 'E (Reserved)'],
    ];
    for (const [ip, ipClass] of classes) {
      expect(subnet(ip, 24).ipClass, ip).toBe(ipClass);
    }
  });

  // Regression: first octets 0 and 127 were reported as class "Unknown".
  test('puts 0.x.x.x and 127.x.x.x in class A', () => {
    expect(subnet('127.0.0.1', 8).ipClass).toBe('A');
    expect(subnet('0.0.0.0', 8).ipClass).toBe('A');
  });

  test('names the kind of address', () => {
    const types: Array<[string, string]> = [
      ['8.8.8.8', 'Public'],
      ['10.255.0.1', 'Private (Class A)'],
      ['172.16.0.1', 'Private (Class B)'],
      ['172.31.255.254', 'Private (Class B)'],
      ['172.15.0.1', 'Public'],
      ['172.32.0.1', 'Public'],
      ['192.168.0.1', 'Private (Class C)'],
      ['192.169.0.1', 'Public'],
      ['127.0.0.1', 'Loopback'],
      ['169.254.10.10', 'APIPA (Link-local)'],
      ['224.0.0.251', 'Multicast'],
      ['239.255.255.250', 'Multicast'],
      ['0.0.0.0', 'Current network'],
      ['255.255.255.255', 'Broadcast'],
    ];
    for (const [ip, ipType] of types) {
      expect(subnet(ip, 24).ipType, ip).toBe(ipType);
    }
  });

  // Regression: everything outside the private, loopback, link-local and
  // multicast blocks was called "Public", including class E, which the same
  // result labelled "E (Reserved)".
  test('does not call reserved and special-purpose addresses public', () => {
    const types: Array<[string, string]> = [
      ['240.0.0.1', 'Reserved'],
      ['255.255.255.254', 'Reserved'],
      ['0.1.2.3', 'Current network'],
      ['100.64.0.1', 'Shared address space (CGNAT)'],
      ['100.127.255.254', 'Shared address space (CGNAT)'],
      ['100.63.255.255', 'Public'],
      ['100.128.0.0', 'Public'],
      ['192.0.2.55', 'Documentation (TEST-NET-1)'],
      ['198.51.100.7', 'Documentation (TEST-NET-2)'],
      ['203.0.113.200', 'Documentation (TEST-NET-3)'],
      ['198.18.0.1', 'Benchmarking'],
      ['198.19.255.255', 'Benchmarking'],
      ['198.20.0.0', 'Public'],
    ];
    for (const [ip, ipType] of types) {
      expect(subnet(ip, 24).ipType, ip).toBe(ipType);
    }
  });
});
