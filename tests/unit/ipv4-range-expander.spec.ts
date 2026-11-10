import { describe, expect, test } from 'vite-plus/test';
import {
  collapseToCidrs,
  expandRanges,
  mergeRanges,
  parseRanges,
  rangeToCidrs,
  MAX_EXPANDED_ADDRESSES,
} from '@/lib/tools/ipv4-range-expander';

function expanded(input: string, cap?: number) {
  const result = expandRanges(input, cap);
  if (!result.ok) throw new Error(`expected a list for ${input}, got: ${result.error}`);
  return result;
}

function expandError(input: string, cap?: number) {
  const result = expandRanges(input, cap);
  if (result.ok) throw new Error(`expected an error for ${input}`);
  return result;
}

function blocks(input: string): string[] {
  const result = collapseToCidrs(input);
  if (!result.ok) throw new Error(`expected CIDR blocks for ${input}, got: ${result.error}`);
  return result.blocks;
}

describe('expandRanges', () => {
  test('lists a /30 including its network and broadcast addresses', () => {
    expect(expanded('192.168.1.0/30')).toEqual({
      ok: true,
      count: 4,
      first: '192.168.1.0',
      last: '192.168.1.3',
      addresses: ['192.168.1.0', '192.168.1.1', '192.168.1.2', '192.168.1.3'],
    });
  });

  test('lists a /31 as two addresses', () => {
    expect(expanded('10.0.0.0/31').addresses).toEqual(['10.0.0.0', '10.0.0.1']);
  });

  test('lists a /32 as one address', () => {
    expect(expanded('172.16.5.9/32')).toMatchObject({
      count: 1,
      first: '172.16.5.9',
      last: '172.16.5.9',
    });
  });

  test('moves a host address in a CIDR block back to its network', () => {
    expect(expanded('10.0.0.77/30').addresses).toEqual([
      '10.0.0.76',
      '10.0.0.77',
      '10.0.0.78',
      '10.0.0.79',
    ]);
  });

  test('lists a start - end range across an octet boundary', () => {
    const result = expanded('10.0.0.250 - 10.0.1.2');
    expect(result.count).toBe(9);
    expect(result.addresses).toEqual([
      '10.0.0.250',
      '10.0.0.251',
      '10.0.0.252',
      '10.0.0.253',
      '10.0.0.254',
      '10.0.0.255',
      '10.0.1.0',
      '10.0.1.1',
      '10.0.1.2',
    ]);
  });

  test('accepts a range without spaces and a last-octet shorthand', () => {
    expect(expanded('10.0.0.1-10.0.0.3').addresses).toEqual(['10.0.0.1', '10.0.0.2', '10.0.0.3']);
    expect(expanded('10.0.0.8 - 10').addresses).toEqual(['10.0.0.8', '10.0.0.9', '10.0.0.10']);
  });

  test('lists a single address', () => {
    expect(expanded('0.0.0.0')).toMatchObject({ count: 1, first: '0.0.0.0', last: '0.0.0.0' });
    expect(expanded('255.255.255.255')).toMatchObject({ count: 1, first: '255.255.255.255' });
  });

  test('joins several lines and removes duplicates, lowest address first', () => {
    const result = expanded('10.0.0.2\n10.0.0.0/30, 10.0.0.9; 10.0.0.9');
    expect(result.count).toBe(5);
    expect(result.addresses).toEqual(['10.0.0.0', '10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.9']);
  });

  test('allows exactly the cap and refuses one more', () => {
    expect(MAX_EXPANDED_ADDRESSES).toBe(65536);
    const atCap = expanded('10.1.0.0/16');
    expect(atCap.count).toBe(65536);
    expect(atCap.addresses).toHaveLength(65536);
    expect(atCap.first).toBe('10.1.0.0');
    expect(atCap.last).toBe('10.1.255.255');
    expect(atCap.addresses[65535]).toBe('10.1.255.255');

    const over = expandError('10.0.0.0 - 10.1.0.0');
    expect(over.count).toBe(65537);
    expect(over.error).toBe(
      'That covers 65,537 addresses. Listing is limited to 65,536 (a /16); use a smaller range.'
    );
  });

  test('reports the size of a block far over the cap without listing it', () => {
    const everything = expandError('0.0.0.0/0');
    expect(everything).toMatchObject({
      count: 4294967296,
      first: '0.0.0.0',
      last: '255.255.255.255',
    });
    expect(everything.error).toContain('4,294,967,296');

    expect(expandError('10.0.0.0/15')).toMatchObject({
      count: 131072,
      first: '10.0.0.0',
      last: '10.1.255.255',
    });
  });

  test('honours a smaller cap', () => {
    expect(expandError('10.0.0.0/29', 4).count).toBe(8);
    expect(expanded('10.0.0.0/30', 4).count).toBe(4);
  });

  test('rejects bad input with a message naming the entry', () => {
    expect(expandError('').error).toBe('Enter a CIDR block, a range or a list of addresses.');
    expect(expandError('  \n ,').error).toBe('Enter a CIDR block, a range or a list of addresses.');
    expect(expandError('10.0.0.0/33').error).toContain('"10.0.0.0/33" is not a valid CIDR block');
    expect(expandError('10.0.0/24').error).toContain('not a valid CIDR block');
    expect(expandError('10.0.0.1/').error).toContain('not a valid CIDR block');
    expect(expandError('10.0.0.5 - 10.0.0.1').error).toBe(
      '"10.0.0.5 - 10.0.0.1" starts after it ends.'
    );
    expect(expandError('10.0.0.1 - banana').error).toContain('not a valid address range');
    expect(expandError('10.0.0.1\n300.1.1.1').error).toBe(
      '"300.1.1.1" is not a valid IPv4 address, range or CIDR block.'
    );
  });
});

describe('rangeToCidrs', () => {
  test('writes a whole space as /0', () => {
    expect(rangeToCidrs({ start: 0, end: 0xffffffff })).toEqual(['0.0.0.0/0']);
  });

  test('writes the last two addresses as a /31', () => {
    expect(rangeToCidrs({ start: 0xfffffffe, end: 0xffffffff })).toEqual(['255.255.255.254/31']);
  });

  test('splits an unaligned range into the fewest blocks', () => {
    // 10.0.0.1 to 10.0.0.6 is 1, 2-3, 4-5, 6.
    expect(rangeToCidrs({ start: 167772161, end: 167772166 })).toEqual([
      '10.0.0.1/32',
      '10.0.0.2/31',
      '10.0.0.4/31',
      '10.0.0.6/32',
    ]);
  });
});

describe('collapseToCidrs', () => {
  test('keeps a single CIDR block as it is', () => {
    expect(blocks('192.168.1.0/24')).toEqual(['192.168.1.0/24']);
    expect(blocks('10.0.0.9/32')).toEqual(['10.0.0.9/32']);
    expect(blocks('10.0.0.8/31')).toEqual(['10.0.0.8/31']);
  });

  test('joins two neighbouring blocks into one', () => {
    expect(blocks('192.168.0.0/24\n192.168.1.0/24')).toEqual(['192.168.0.0/23']);
  });

  test('does not join blocks that only look adjacent', () => {
    // 192.168.1.0/24 and 192.168.2.0/24 touch but do not share a /23 boundary.
    expect(blocks('192.168.1.0/24, 192.168.2.0/24')).toEqual(['192.168.1.0/24', '192.168.2.0/24']);
  });

  test('turns a list of consecutive addresses into one block', () => {
    expect(blocks('10.0.0.0\n10.0.0.1\n10.0.0.2\n10.0.0.3')).toEqual(['10.0.0.0/30']);
  });

  test('covers 10.0.0.1 - 10.0.0.254 with fourteen blocks', () => {
    expect(blocks('10.0.0.1 - 10.0.0.254')).toEqual([
      '10.0.0.1/32',
      '10.0.0.2/31',
      '10.0.0.4/30',
      '10.0.0.8/29',
      '10.0.0.16/28',
      '10.0.0.32/27',
      '10.0.0.64/26',
      '10.0.0.128/26',
      '10.0.0.192/27',
      '10.0.0.224/28',
      '10.0.0.240/29',
      '10.0.0.248/30',
      '10.0.0.252/31',
      '10.0.0.254/32',
    ]);
  });

  test('handles the whole address space with no cap', () => {
    expect(collapseToCidrs('0.0.0.0 - 255.255.255.255')).toEqual({
      ok: true,
      count: 4294967296,
      blocks: ['0.0.0.0/0'],
    });
  });

  test('absorbs a block that lies inside another', () => {
    expect(blocks('10.0.0.0/8, 10.5.0.0/16, 10.9.9.9')).toEqual(['10.0.0.0/8']);
  });

  test('reports parse errors', () => {
    expect(collapseToCidrs('nope')).toEqual({
      ok: false,
      error: '"nope" is not a valid IPv4 address, range or CIDR block.',
    });
    expect(collapseToCidrs('')).toEqual({
      ok: false,
      error: 'Enter a CIDR block, a range or a list of addresses.',
    });
  });
});

describe('parseRanges and mergeRanges', () => {
  test('reads each kind of entry into numbers', () => {
    expect(parseRanges('1.0.0.0/8\n2.2.2.2\n3.0.0.1 - 3.0.0.5')).toEqual({
      ok: true,
      ranges: [
        { start: 16777216, end: 33554431 },
        { start: 33686018, end: 33686018 },
        { start: 50331649, end: 50331653 },
      ],
    });
  });

  test('merges overlapping and touching ranges but not separated ones', () => {
    expect(
      mergeRanges([
        { start: 10, end: 20 },
        { start: 5, end: 9 },
        { start: 15, end: 18 },
        { start: 22, end: 30 },
      ])
    ).toEqual([
      { start: 5, end: 20 },
      { start: 22, end: 30 },
    ]);
  });
});
