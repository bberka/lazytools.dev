/**
 * Generates random MAC addresses and reads pasted ones. The two low bits of
 * the first byte carry the address type: bit 0 is the multicast (group) bit
 * and bit 1 is the locally administered (universal/local) bit.
 */

export type MacFormat = 'colon' | 'hyphen' | 'dot' | 'none';
export type MacCast = 'unicast' | 'multicast' | 'any';
export type MacScope = 'local' | 'global' | 'any';

export const MAC_FORMAT_LABELS: Record<MacFormat, string> = {
  colon: 'Colon (00:1a:2b:3c:4d:5e)',
  hyphen: 'Hyphen (00-1a-2b-3c-4d-5e)',
  dot: 'Cisco dot (001a.2b3c.4d5e)',
  none: 'No separator (001a2b3c4d5e)',
};

export const MAX_MAC_COUNT = 1000;

const MULTICAST_BIT = 0x01;
const LOCAL_BIT = 0x02;

export interface MacOptions {
  count: number;
  format: MacFormat;
  uppercase: boolean;
  cast: MacCast;
  scope: MacScope;
}

export const DEFAULT_MAC_OPTIONS: MacOptions = {
  count: 5,
  format: 'colon',
  uppercase: false,
  cast: 'unicast',
  scope: 'local',
};

/** Writes six bytes in the chosen format. */
export function formatMac(bytes: ArrayLike<number>, format: MacFormat, uppercase: boolean): string {
  const pairs = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  let text: string;
  switch (format) {
    case 'colon':
      text = pairs.join(':');
      break;
    case 'hyphen':
      text = pairs.join('-');
      break;
    case 'dot':
      text = [pairs[0] + pairs[1], pairs[2] + pairs[3], pairs[4] + pairs[5]].join('.');
      break;
    case 'none':
      text = pairs.join('');
      break;
  }
  return uppercase ? text.toUpperCase() : text;
}

/** Sets the multicast and local bits of a first byte as asked. 'any' leaves a bit as it is. */
export function applyMacFlags(firstByte: number, cast: MacCast, scope: MacScope): number {
  let byte = firstByte;
  if (cast === 'unicast') byte &= ~MULTICAST_BIT;
  if (cast === 'multicast') byte |= MULTICAST_BIT;
  if (scope === 'global') byte &= ~LOCAL_BIT;
  if (scope === 'local') byte |= LOCAL_BIT;
  return byte & 0xff;
}

/** Turns a requested count into a whole number from 1 to the maximum, or null. */
export function parseMacCount(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const count = Number(text.trim());
  return count >= 1 && count <= MAX_MAC_COUNT ? count : null;
}

/** Fills the array with random bytes. */
export type RandomFill = (bytes: Uint8Array) => void;

const cryptoFill: RandomFill = (bytes) => {
  crypto.getRandomValues(bytes);
};

/** Random MAC addresses in the requested format. `fill` can be swapped for tests. */
export function generateMacs(options: MacOptions, fill: RandomFill = cryptoFill): string[] {
  const count = Math.min(Math.max(Math.floor(options.count), 1), MAX_MAC_COUNT);
  const macs: string[] = [];

  for (let index = 0; index < count; index++) {
    const bytes = new Uint8Array(6);
    fill(bytes);
    bytes[0] = applyMacFlags(bytes[0], options.cast, options.scope);
    macs.push(formatMac(bytes, options.format, options.uppercase));
  }
  return macs;
}

export interface MacInfo {
  /** The format the text was written in. */
  format: MacFormat;
  bytes: number[];
  /** True when the multicast (group) bit is set. */
  multicast: boolean;
  /** True when the locally administered bit is set. */
  locallyAdministered: boolean;
  broadcast: boolean;
  formats: Record<MacFormat, string>;
}

export type MacParseResult = { ok: true; info: MacInfo } | { ok: false; error: string };

function toBytes(hexDigits: string): number[] {
  return Array.from({ length: 6 }, (_, index) =>
    parseInt(hexDigits.slice(index * 2, index * 2 + 2), 16)
  );
}

/** Reads a MAC address in any of the four formats. Separators cannot be mixed. */
export function parseMac(input: string, uppercase = false): MacParseResult {
  const text = input.trim();
  if (text === '') return { ok: false, error: 'Enter a MAC address to check.' };

  let format: MacFormat;
  let digits: string;

  if (/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(text)) {
    format = 'colon';
    digits = text.replaceAll(':', '');
  } else if (/^[0-9a-f]{2}(-[0-9a-f]{2}){5}$/i.test(text)) {
    format = 'hyphen';
    digits = text.replaceAll('-', '');
  } else if (/^[0-9a-f]{4}(\.[0-9a-f]{4}){2}$/i.test(text)) {
    format = 'dot';
    digits = text.replaceAll('.', '');
  } else if (/^[0-9a-f]{12}$/i.test(text)) {
    format = 'none';
    digits = text;
  } else {
    return {
      ok: false,
      error:
        'Not a MAC address. Use 6 bytes as aa:bb:cc:dd:ee:ff, aa-bb-cc-dd-ee-ff, aabb.ccdd.eeff or aabbccddeeff.',
    };
  }

  const bytes = toBytes(digits);
  return {
    ok: true,
    info: {
      format,
      bytes,
      multicast: (bytes[0] & MULTICAST_BIT) !== 0,
      locallyAdministered: (bytes[0] & LOCAL_BIT) !== 0,
      broadcast: bytes.every((byte) => byte === 0xff),
      formats: {
        colon: formatMac(bytes, 'colon', uppercase),
        hyphen: formatMac(bytes, 'hyphen', uppercase),
        dot: formatMac(bytes, 'dot', uppercase),
        none: formatMac(bytes, 'none', uppercase),
      },
    },
  };
}
