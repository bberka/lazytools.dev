import { describe, expect, test } from 'vite-plus/test';
import {
  applyMacFlags,
  DEFAULT_MAC_OPTIONS,
  formatMac,
  generateMacs,
  MAX_MAC_COUNT,
  parseMac,
  parseMacCount,
  type MacInfo,
  type MacOptions,
} from '@/lib/tools/mac-address-generator';

/** A fill that writes the same six bytes every time. */
const fillWith =
  (...values: number[]) =>
  (bytes: Uint8Array) =>
    bytes.set(values);

function info(text: string): MacInfo {
  const result = parseMac(text);
  if (!result.ok) throw new Error(`expected ${text} to parse, got: ${result.error}`);
  return result.info;
}

const options = (overrides: Partial<MacOptions>): MacOptions => ({
  ...DEFAULT_MAC_OPTIONS,
  ...overrides,
});

describe('formatMac', () => {
  const bytes = [0x00, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e];

  test('writes every format', () => {
    expect(formatMac(bytes, 'colon', false)).toBe('00:1a:2b:3c:4d:5e');
    expect(formatMac(bytes, 'hyphen', false)).toBe('00-1a-2b-3c-4d-5e');
    expect(formatMac(bytes, 'dot', false)).toBe('001a.2b3c.4d5e');
    expect(formatMac(bytes, 'none', false)).toBe('001a2b3c4d5e');
  });

  test('upper-cases only when asked', () => {
    expect(formatMac(bytes, 'colon', true)).toBe('00:1A:2B:3C:4D:5E');
    expect(formatMac(bytes, 'dot', true)).toBe('001A.2B3C.4D5E');
  });

  test('pads single-digit bytes', () => {
    expect(formatMac([0, 1, 2, 3, 4, 5], 'colon', false)).toBe('00:01:02:03:04:05');
    expect(formatMac([255, 255, 255, 255, 255, 255], 'none', true)).toBe('FFFFFFFFFFFF');
  });
});

describe('applyMacFlags', () => {
  test('clears the multicast bit for unicast and sets it for multicast', () => {
    expect(applyMacFlags(0xff, 'unicast', 'any')).toBe(0xfe);
    expect(applyMacFlags(0x00, 'multicast', 'any')).toBe(0x01);
  });

  test('sets the local bit for local and clears it for global', () => {
    expect(applyMacFlags(0x00, 'any', 'local')).toBe(0x02);
    expect(applyMacFlags(0xff, 'any', 'global')).toBe(0xfd);
  });

  test('leaves a bit alone for any', () => {
    expect(applyMacFlags(0xa5, 'any', 'any')).toBe(0xa5);
    expect(applyMacFlags(0xa4, 'any', 'any')).toBe(0xa4);
  });

  test('combines both flags without touching the other bits', () => {
    expect(applyMacFlags(0xff, 'unicast', 'global')).toBe(0xfc);
    expect(applyMacFlags(0x00, 'multicast', 'local')).toBe(0x03);
    expect(applyMacFlags(0xa8, 'unicast', 'local')).toBe(0xaa);
  });
});

describe('generateMacs', () => {
  test('applies the flags to the random first byte', () => {
    const fill = fillWith(0xff, 1, 2, 3, 4, 5);
    expect(generateMacs(options({ count: 1, cast: 'unicast', scope: 'local' }), fill)).toEqual([
      'fe:01:02:03:04:05',
    ]);
    expect(generateMacs(options({ count: 1, cast: 'unicast', scope: 'global' }), fill)).toEqual([
      'fc:01:02:03:04:05',
    ]);
    expect(
      generateMacs(
        options({ count: 1, cast: 'multicast', scope: 'global' }),
        fillWith(0, 1, 2, 3, 4, 5)
      )
    ).toEqual(['01:01:02:03:04:05']);
    expect(generateMacs(options({ count: 1, cast: 'any', scope: 'any' }), fill)).toEqual([
      'ff:01:02:03:04:05',
    ]);
  });

  test('formats the output', () => {
    const fill = fillWith(0x00, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e);
    const base = options({ count: 2, cast: 'any', scope: 'any' });
    expect(generateMacs({ ...base, format: 'hyphen', uppercase: true }, fill)).toEqual([
      '00-1A-2B-3C-4D-5E',
      '00-1A-2B-3C-4D-5E',
    ]);
    expect(generateMacs({ ...base, format: 'dot', count: 1 }, fill)).toEqual(['001a.2b3c.4d5e']);
  });

  test('clamps the count', () => {
    expect(generateMacs(options({ count: 0 }))).toHaveLength(1);
    expect(generateMacs(options({ count: 5000 }))).toHaveLength(MAX_MAC_COUNT);
  });

  test('uses crypto and always produces valid addresses with the asked bits', () => {
    const macs = generateMacs(options({ count: 200, cast: 'unicast', scope: 'local' }));
    expect(new Set(macs).size).toBeGreaterThan(190);
    for (const mac of macs) {
      expect(mac).toMatch(/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/);
      const parsed = info(mac);
      expect(parsed.multicast).toBe(false);
      expect(parsed.locallyAdministered).toBe(true);
    }
  });
});

describe('parseMacCount', () => {
  test('accepts 1 to 1000 only', () => {
    expect(parseMacCount('1')).toBe(1);
    expect(parseMacCount(' 1000 ')).toBe(1000);
    expect(parseMacCount('0')).toBeNull();
    expect(parseMacCount('1001')).toBeNull();
    expect(parseMacCount('')).toBeNull();
    expect(parseMacCount('2.5')).toBeNull();
    expect(parseMacCount('-3')).toBeNull();
  });
});

describe('parseMac', () => {
  test('reads a global unicast address in colon form', () => {
    expect(info('00:1A:2B:3C:4D:5E')).toEqual({
      format: 'colon',
      bytes: [0x00, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e],
      multicast: false,
      locallyAdministered: false,
      broadcast: false,
      formats: {
        colon: '00:1a:2b:3c:4d:5e',
        hyphen: '00-1a-2b-3c-4d-5e',
        dot: '001a.2b3c.4d5e',
        none: '001a2b3c4d5e',
      },
    });
  });

  test('detects the hyphen, dot and bare formats', () => {
    expect(info('00-1A-2B-3C-4D-5E').format).toBe('hyphen');
    expect(info('001a.2b3c.4d5e').format).toBe('dot');
    expect(info('001A2B3C4D5E').format).toBe('none');
    expect(info('001A2B3C4D5E').bytes).toEqual([0, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e]);
  });

  test('can write the normalised forms in upper case', () => {
    const result = parseMac('00:1a:2b:3c:4d:5e', true);
    expect(result.ok && result.info.formats.dot).toBe('001A.2B3C.4D5E');
  });

  test('reads the multicast bit (the lowest bit of the first byte)', () => {
    expect(info('01:00:5e:00:00:fb')).toMatchObject({
      multicast: true,
      locallyAdministered: false,
    });
    expect(info('03:00:00:00:00:00')).toMatchObject({ multicast: true, locallyAdministered: true });
  });

  test('reads the locally administered bit (the second-lowest bit)', () => {
    expect(info('02:00:00:00:00:01')).toMatchObject({
      multicast: false,
      locallyAdministered: true,
    });
    expect(info('fe:ff:ff:ff:ff:ff')).toMatchObject({
      multicast: false,
      locallyAdministered: true,
    });
    expect(info('fc:00:00:00:00:00')).toMatchObject({
      multicast: false,
      locallyAdministered: false,
    });
  });

  test('spots the broadcast address', () => {
    expect(info('ff:ff:ff:ff:ff:ff')).toMatchObject({
      multicast: true,
      locallyAdministered: true,
      broadcast: true,
    });
    expect(info('ff:ff:ff:ff:ff:fe').broadcast).toBe(false);
  });

  test('handles the all-zero address', () => {
    expect(info('00:00:00:00:00:00')).toMatchObject({
      multicast: false,
      locallyAdministered: false,
      broadcast: false,
    });
  });

  test('ignores surrounding space', () => {
    expect(info('  aa:bb:cc:dd:ee:ff \n').bytes).toEqual([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
  });

  test('rejects text that is not a MAC address', () => {
    expect(parseMac('')).toEqual({ ok: false, error: 'Enter a MAC address to check.' });
    for (const bad of [
      '00:1a:2b:3c:4d',
      '00:1a:2b:3c:4d:5e:6f',
      '00:1a:2b:3c:4d:5g',
      '00:1a-2b:3c-4d:5e',
      '001a.2b3c',
      '001a2b3c4d5',
      '001a2b3c4d5e0',
      '0:1:2:3:4:5',
      'hello',
    ]) {
      const result = parseMac(bad);
      expect(result.ok, bad).toBe(false);
    }
  });
});
