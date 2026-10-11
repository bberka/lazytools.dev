/**
 * IP lookup logic: checks the address, asks a public geolocation API about it
 * and turns the answer into one shape whichever API replied.
 *
 * Three providers are tried in order, each with its own deadline, and the
 * first usable answer wins. The `fetch` to use is an option, so the module is
 * tested in Node with a fake and never needs the network there.
 */

import { normalizeIp } from './ip-address';
import { fetchJson, isJsonObject, type FetchLike } from './network-fetch';

export interface IpInfo {
  ip: string;
  city?: string;
  region?: string;
  country?: string;
  /** "latitude,longitude" */
  loc?: string;
  /** ISP or organisation */
  org?: string;
  postal?: string;
  timezone?: string;
  hostname?: string;
  anycast?: boolean;
  /** A private or reserved address, which has no location. */
  bogon?: boolean;
}

export type IpLookupOutcome = { ok: true; info: IpInfo } | { ok: false; error: string };

export interface IpLookupOptions {
  /** Cancels the lookup. After aborting, ignore the outcome. */
  signal?: AbortSignal;
  /** How long each provider gets before the next one is tried. */
  timeoutMs?: number;
  /** The `fetch` to use. Defaults to the global one. */
  fetchImpl?: FetchLike;
}

type Json = Record<string, unknown>;

interface Provider {
  /** The URL for one address, or for the caller's own address when `ip` is empty. */
  url: (ip: string) => string;
  /** The provider's answer as `IpInfo`, or null when the answer is not usable. */
  read: (data: Json, ip: string) => IpInfo | null;
}

const PROVIDER_TIMEOUT_MS = 8_000;

const ALL_PROVIDERS_FAILED =
  'All IP geolocation lookup APIs failed. Please check your connection or try again later.';

/** A non-empty display value. Providers write "-" for fields they do not know. */
function text(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed !== '-' ? trimmed : undefined;
}

function coordinate(value: unknown, limit: number): number | null {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

/**
 * "latitude,longitude" when both are real coordinates. A zero is a valid
 * latitude or longitude on its own; both zero is how providers say "unknown".
 */
function coordinates(latitude: unknown, longitude: unknown): string | undefined {
  const lat = coordinate(latitude, 90);
  const lng = coordinate(longitude, 180);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) return undefined;
  return `${lat},${lng}`;
}

const PROVIDERS: readonly Provider[] = [
  {
    url: (ip) => (ip ? `https://ipinfo.io/${ip}/json` : 'https://ipinfo.io/json'),
    read: (data, ip) => {
      const address = text(data.ip) ?? ip;
      if (!address) return null;

      const loc = text(data.loc);
      const [latitude, longitude, ...rest] = loc?.split(',') ?? [];
      return {
        ip: address,
        city: text(data.city),
        region: text(data.region),
        country: text(data.country),
        loc: rest.length === 0 && coordinates(latitude, longitude) ? loc : undefined,
        org: text(data.org),
        postal: text(data.postal),
        timezone: text(data.timezone),
        hostname: text(data.hostname),
        anycast: data.anycast === true ? true : undefined,
        bogon: data.bogon === true ? true : undefined,
      };
    },
  },
  {
    url: (ip) => (ip ? `https://freeipapi.com/api/json/${ip}` : 'https://freeipapi.com/api/json'),
    read: (data, ip) => {
      const address = text(data.ipAddress) ?? text(data.ip) ?? ip;
      if (!address) return null;

      return {
        ip: address,
        city: text(data.cityName),
        region: text(data.regionName),
        country: text(data.countryName),
        loc: coordinates(data.latitude, data.longitude),
        org: text(data.isp) ?? text(data.organization),
        postal: text(data.zipCode),
        timezone: text(data.timeZone),
      };
    },
  },
  {
    url: (ip) => (ip ? `https://ipapi.co/${ip}/json/` : 'https://ipapi.co/json/'),
    read: (data, ip) => {
      const address = text(data.ip) ?? ip;
      if (!address) return null;

      // ipapi.co reports problems in a 200 response. A reserved address is an
      // answer; anything else (rate limit, bad request) is a failed lookup.
      if (data.error === true) {
        const reserved = data.reserved === true || /reserved/i.test(text(data.reason) ?? '');
        return reserved ? { ip: address, bogon: true } : null;
      }

      return {
        ip: address,
        city: text(data.city),
        region: text(data.region),
        country: text(data.country_name),
        loc: coordinates(data.latitude, data.longitude),
        org: text(data.org),
        postal: text(data.postal),
        timezone: text(data.timezone),
      };
    },
  },
];

/**
 * Looks up geolocation and network details for an address.
 *
 * `input` is an IPv4 or IPv6 address as typed, or an empty string for the
 * caller's own public address. Resolves with the details, or with a message
 * that can be shown as it is; it does not reject.
 */
export async function lookupIp(input: string, options: IpLookupOptions = {}): Promise<IpLookupOutcome> {
  const { signal, timeoutMs = PROVIDER_TIMEOUT_MS, fetchImpl } = options;

  const typed = input.trim();
  const ip = typed ? normalizeIp(typed) : '';
  if (ip === null) return { ok: false, error: 'Invalid IP address format' };

  for (const provider of PROVIDERS) {
    if (signal?.aborted) break;

    try {
      const response = await fetchJson(provider.url(ip), { signal, timeoutMs, fetchImpl });
      if (response.ok && isJsonObject(response.data)) {
        const info = provider.read(response.data, ip);
        if (info) return { ok: true, info };
      }
    } catch {
      // Unreachable, timed out or blocked: the next provider gets its turn.
    }
  }

  return { ok: false, error: ALL_PROVIDERS_FAILED };
}
