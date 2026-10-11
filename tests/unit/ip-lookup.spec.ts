import { test, expect } from '@playwright/test';
import { lookupIp, type IpInfo } from '@/lib/tools/ip-lookup';
import type { FetchLike } from '@/lib/tools/network-fetch';

const ALL_FAILED = 'All IP geolocation lookup APIs failed. Please check your connection or try again later.';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A request that never answers but gives up when aborted, like the real fetch. */
const hang = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });

type Reply = Response | 'down' | 'hang';

/** A fake network: each provider host answers with what the test gives it, and "down" unless told otherwise. */
function network(replies: { ipinfo?: Reply; freeipapi?: Reply; ipapi?: Reply }) {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    urls.push(input);
    const host = new URL(input).hostname;
    const reply =
      host === 'ipinfo.io' ? replies.ipinfo : host === 'freeipapi.com' ? replies.freeipapi : replies.ipapi;
    if (reply === 'hang') return hang(init);
    if (reply === undefined || reply === 'down') throw new TypeError('Failed to fetch');
    return reply;
  };
  return { fetchImpl, urls };
}

async function infoFrom(input: string, fetchImpl: FetchLike): Promise<IpInfo> {
  const outcome = await lookupIp(input, { fetchImpl, timeoutMs: 1000 });
  if (!outcome.ok) throw new Error(`expected details, got: ${outcome.error}`);
  return outcome.info;
}

const IPINFO_GOOGLE = {
  ip: '8.8.8.8',
  hostname: 'dns.google',
  city: 'Mountain View',
  region: 'California',
  country: 'US',
  loc: '37.4056,-122.0775',
  org: 'AS15169 Google LLC',
  postal: '94043',
  timezone: 'America/Los_Angeles',
  anycast: true,
  readme: 'https://ipinfo.io/missingauth',
};

test.describe('lookupIp', () => {
  test('returns the details ipinfo.io gives for an address', async () => {
    const { fetchImpl, urls } = network({ ipinfo: json(IPINFO_GOOGLE) });

    expect(await infoFrom('8.8.8.8', fetchImpl)).toEqual({
      ip: '8.8.8.8',
      hostname: 'dns.google',
      city: 'Mountain View',
      region: 'California',
      country: 'US',
      loc: '37.4056,-122.0775',
      org: 'AS15169 Google LLC',
      postal: '94043',
      timezone: 'America/Los_Angeles',
      anycast: true,
      bogon: undefined,
    });
    expect(urls).toEqual(['https://ipinfo.io/8.8.8.8/json']);
  });

  test('asks for the caller’s own address when the input is empty or blank', async () => {
    for (const input of ['', '   ']) {
      const { fetchImpl, urls } = network({ ipinfo: json({ ip: '203.0.113.9', city: 'Springfield' }) });
      expect(await infoFrom(input, fetchImpl)).toMatchObject({ ip: '203.0.113.9', city: 'Springfield' });
      expect(urls).toEqual(['https://ipinfo.io/json']);
    }
  });

  test('trims the address and sends IPv4 without leading zeros', async () => {
    const { fetchImpl, urls } = network({ ipinfo: json({ ip: '8.8.4.4' }) });
    await infoFrom('  008.008.004.004 ', fetchImpl);
    expect(urls).toEqual(['https://ipinfo.io/8.8.4.4/json']);
  });

  test('looks up IPv6 addresses', async () => {
    const { fetchImpl, urls } = network({ ipinfo: json({ ip: '2001:4860:4860::8888', city: 'Mountain View' }) });
    expect((await infoFrom('2001:4860:4860::8888', fetchImpl)).city).toBe('Mountain View');
    expect(urls).toEqual(['https://ipinfo.io/2001:4860:4860::8888/json']);
  });

  // Regression: the old pattern rejected these valid addresses as "Invalid IP address format".
  test('accepts an IPv4-mapped IPv6 address and a trailing compression', async () => {
    for (const ip of ['::ffff:8.8.8.8', '2001:db8:1:2:3:4:5::']) {
      const { fetchImpl } = network({ ipinfo: json({ ip }) });
      expect((await infoFrom(ip, fetchImpl)).ip).toBe(ip);
    }
  });

  // Regression: the old pattern sent strings like ":::" and "1:2:3" to the API.
  test('rejects a malformed address without sending a request', async () => {
    const malformed = [':::', '1:2:3', '1::2::3', '256.1.1.1', '8.8.8', '8.8.8.8/32', 'example.com', '8.8.8.8 extra', '🙂'];
    for (const input of malformed) {
      const { fetchImpl, urls } = network({ ipinfo: json(IPINFO_GOOGLE) });
      expect(await lookupIp(input, { fetchImpl }), input).toEqual({ ok: false, error: 'Invalid IP address format' });
      expect(urls, input).toEqual([]);
    }
  });

  test('passes on a private address as a bogon', async () => {
    const { fetchImpl } = network({ ipinfo: json({ ip: '192.168.1.1', bogon: true }) });
    expect(await infoFrom('192.168.1.1', fetchImpl)).toMatchObject({ ip: '192.168.1.1', bogon: true });
  });

  test('falls back to freeipapi.com when ipinfo.io is unreachable', async () => {
    const { fetchImpl, urls } = network({
      ipinfo: 'down',
      freeipapi: json({
        ipVersion: 4,
        ipAddress: '1.1.1.1',
        latitude: -33.8688,
        longitude: 151.209,
        countryName: 'Australia',
        zipCode: '2000',
        cityName: 'Sydney',
        regionName: 'New South Wales',
        timeZone: '+10:00',
        isp: 'Cloudflare',
      }),
    });

    expect(await infoFrom('1.1.1.1', fetchImpl)).toEqual({
      ip: '1.1.1.1',
      city: 'Sydney',
      region: 'New South Wales',
      country: 'Australia',
      loc: '-33.8688,151.209',
      org: 'Cloudflare',
      postal: '2000',
      timezone: '+10:00',
    });
    expect(urls).toEqual(['https://ipinfo.io/1.1.1.1/json', 'https://freeipapi.com/api/json/1.1.1.1']);
  });

  test('falls back when ipinfo.io answers with an error status or a body that is not JSON', async () => {
    const unusable = [
      json({ error: 'rate limited' }, 429),
      new Response('<html>blocked</html>'),
      json(['not', 'an', 'object']),
    ];
    for (const ipinfo of unusable) {
      const freeipapi = json({ ipAddress: '1.1.1.1', cityName: 'Sydney' });
      const { fetchImpl, urls } = network({ ipinfo, freeipapi });
      expect((await infoFrom('1.1.1.1', fetchImpl)).city).toBe('Sydney');
      expect(urls).toHaveLength(2);
    }
  });

  test('falls back to ipapi.co last', async () => {
    const { fetchImpl, urls } = network({
      ipapi: json({
        ip: '9.9.9.9',
        city: 'Berkeley',
        region: 'California',
        country_name: 'United States',
        latitude: 37.8767,
        longitude: -122.2676,
        org: 'QUAD9-AS-1',
        postal: '94709',
        timezone: 'America/Los_Angeles',
      }),
    });

    expect(await infoFrom('9.9.9.9', fetchImpl)).toEqual({
      ip: '9.9.9.9',
      city: 'Berkeley',
      region: 'California',
      country: 'United States',
      loc: '37.8767,-122.2676',
      org: 'QUAD9-AS-1',
      postal: '94709',
      timezone: 'America/Los_Angeles',
    });
    expect(urls).toEqual([
      'https://ipinfo.io/9.9.9.9/json',
      'https://freeipapi.com/api/json/9.9.9.9',
      'https://ipapi.co/9.9.9.9/json/',
    ]);
  });

  test('uses the own-address URL of each provider', async () => {
    const { fetchImpl, urls } = network({ ipapi: json({ ip: '203.0.113.9' }) });
    await infoFrom('', fetchImpl);
    expect(urls).toEqual(['https://ipinfo.io/json', 'https://freeipapi.com/api/json', 'https://ipapi.co/json/']);
  });

  test('reports a failure when every provider fails', async () => {
    const { fetchImpl, urls } = network({});
    expect(await lookupIp('8.8.8.8', { fetchImpl })).toEqual({ ok: false, error: ALL_FAILED });
    expect(urls).toHaveLength(3);
  });

  // Regression: fetch had no deadline, so one hanging provider left the lookup loading forever
  // and the fallbacks were never reached.
  test('gives up on a provider that never answers and tries the next one', async () => {
    const { fetchImpl, urls } = network({
      ipinfo: 'hang',
      freeipapi: json({ ipAddress: '8.8.8.8', cityName: 'Mountain View' }),
    });

    const outcome = await lookupIp('8.8.8.8', { fetchImpl, timeoutMs: 20 });
    expect(outcome).toMatchObject({ ok: true, info: { ip: '8.8.8.8', city: 'Mountain View' } });
    expect(urls).toHaveLength(2);
  });

  test('reports a failure when every provider hangs', async () => {
    const { fetchImpl } = network({ ipinfo: 'hang', freeipapi: 'hang', ipapi: 'hang' });
    expect(await lookupIp('8.8.8.8', { fetchImpl, timeoutMs: 20 })).toEqual({ ok: false, error: ALL_FAILED });
  });

  // Regression: ipapi.co reports a rate limit in a 200 response, which was shown as a
  // successful lookup with nothing but the address in it.
  test('does not take an ipapi.co error body for an answer', async () => {
    const { fetchImpl } = network({
      ipapi: json({
        ip: '8.8.8.8',
        error: true,
        reason: 'RateLimited',
        message: 'Visit https://ipapi.co/ratelimited/',
      }),
    });
    expect(await lookupIp('8.8.8.8', { fetchImpl })).toEqual({ ok: false, error: ALL_FAILED });
  });

  test('reads an ipapi.co reserved-address reply as a bogon', async () => {
    const { fetchImpl } = network({
      ipapi: json({ ip: '10.0.0.1', error: true, reason: 'Reserved IP Address', reserved: true }),
    });
    expect(await infoFrom('10.0.0.1', fetchImpl)).toEqual({ ip: '10.0.0.1', bogon: true });
  });

  // Regression: coordinates were tested for truthiness, so a location on the
  // equator or the prime meridian lost its coordinates and its map link.
  test('keeps coordinates that contain a zero', async () => {
    const meridian = network({ freeipapi: json({ ipAddress: '1.2.3.4', latitude: 51.4779, longitude: 0 }) });
    expect((await infoFrom('1.2.3.4', meridian.fetchImpl)).loc).toBe('51.4779,0');

    const equator = network({ ipapi: json({ ip: '1.2.3.4', latitude: 0, longitude: 32.58 }) });
    expect((await infoFrom('1.2.3.4', equator.fetchImpl)).loc).toBe('0,32.58');
  });

  test('drops coordinates that are missing, out of range or the 0,0 placeholder', async () => {
    const cases: Array<[unknown, unknown]> = [
      [0, 0],
      [null, null],
      [undefined, 12.5],
      ['', ''],
      ['north', 'east'],
      [91, 10],
      [10, 181],
    ];
    for (const [latitude, longitude] of cases) {
      const { fetchImpl } = network({ freeipapi: json({ ipAddress: '1.2.3.4', latitude, longitude }) });
      expect((await infoFrom('1.2.3.4', fetchImpl)).loc, `${latitude},${longitude}`).toBeUndefined();
    }
  });

  test('accepts coordinates sent as text', async () => {
    const { fetchImpl } = network({ freeipapi: json({ ipAddress: '1.2.3.4', latitude: '48.85', longitude: '2.35' }) });
    expect((await infoFrom('1.2.3.4', fetchImpl)).loc).toBe('48.85,2.35');
  });

  test('drops an ipinfo.io location that is not "latitude,longitude"', async () => {
    for (const loc of ['somewhere', '12.5', '1,2,3', '95,10', '12.5,"><script>']) {
      const { fetchImpl } = network({ ipinfo: json({ ip: '8.8.8.8', loc }) });
      expect((await infoFrom('8.8.8.8', fetchImpl)).loc, loc).toBeUndefined();
    }
  });

  test('leaves out fields a provider does not know', async () => {
    const { fetchImpl } = network({
      freeipapi: json({
        ipAddress: '10.0.0.1',
        latitude: 0,
        longitude: 0,
        countryName: '-',
        cityName: '-',
        regionName: '  ',
        zipCode: '',
        timeZone: null,
      }),
    });
    expect(await infoFrom('10.0.0.1', fetchImpl)).toEqual({
      ip: '10.0.0.1',
      city: undefined,
      region: undefined,
      country: undefined,
      loc: undefined,
      org: undefined,
      postal: undefined,
      timezone: undefined,
    });
  });

  test('turns a numeric postal code into text', async () => {
    const { fetchImpl } = network({ freeipapi: json({ ipAddress: '1.2.3.4', zipCode: 94043 }) });
    expect((await infoFrom('1.2.3.4', fetchImpl)).postal).toBe('94043');
  });

  test('falls back to the requested address when a provider leaves it out', async () => {
    const { fetchImpl } = network({ ipinfo: json({ city: 'Mountain View' }) });
    expect(await infoFrom('8.8.8.8', fetchImpl)).toMatchObject({ ip: '8.8.8.8', city: 'Mountain View' });
  });

  test('does not accept an own-address answer that has no address in it', async () => {
    const { fetchImpl, urls } = network({
      ipinfo: json({ city: 'Nowhere' }),
      freeipapi: json({ ipAddress: '203.0.113.9' }),
    });
    expect((await infoFrom('', fetchImpl)).ip).toBe('203.0.113.9');
    expect(urls).toHaveLength(2);
  });

  test('stops asking further providers once the caller cancels', async () => {
    const controller = new AbortController();
    const { fetchImpl, urls } = network({ ipinfo: 'hang', freeipapi: json({ ipAddress: '8.8.8.8' }) });

    const pending = lookupIp('8.8.8.8', { fetchImpl, signal: controller.signal, timeoutMs: 60_000 });
    controller.abort();

    expect((await pending).ok).toBe(false);
    expect(urls).toEqual(['https://ipinfo.io/8.8.8.8/json']);
  });
});
