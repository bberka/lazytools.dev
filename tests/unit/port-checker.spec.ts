import { test, expect } from '@playwright/test';
import type { FetchLike } from '@/lib/tools/network-fetch';
import {
  COMMON_PORTS,
  parsePortList,
  parseScanHost,
  planScan,
  probePort,
  probeUrl,
} from '@/lib/tools/port-checker';

const hostOf = (input: string) => {
  const parsed = parseScanHost(input);
  return parsed.ok ? parsed.host : `error: ${parsed.error}`;
};

const portsOf = (input: string, max?: number) => {
  const parsed = parsePortList(input, max);
  return parsed.ok ? parsed.ports : `error: ${parsed.error}`;
};

const INVALID_HOST = 'error: Invalid hostname or IP address format';
const EMPTY_LIST = 'error: Please enter valid port numbers (e.g., 80,443 or 8000-8010)';
const TOO_MANY = 'error: Please limit the scan to 50 ports maximum';
const badEntry = (entry: string) =>
  `error: "${entry}" is not a valid port or range. Use numbers from 1 to 65535 (e.g., 80,443 or 8000-8010)`;

/** A request that never answers but gives up when aborted, like the real fetch. */
const hang: FetchLike = (_input, init) =>
  new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });

test.describe('parseScanHost', () => {
  test('accepts hostnames and trims them', () => {
    expect(hostOf('localhost')).toBe('localhost');
    expect(hostOf('  example.com ')).toBe('example.com');
    expect(hostOf('my-router')).toBe('my-router');
    expect(hostOf('a.b-c.example.co.uk')).toBe('a.b-c.example.co.uk');
  });

  test('accepts IPv4 addresses', () => {
    expect(hostOf('192.168.1.1')).toBe('192.168.1.1');
    expect(hostOf('127.0.0.1')).toBe('127.0.0.1');
  });

  // Regression: a URL parser reads a leading zero as octal, so "010.0.0.1" was scanned as 8.0.0.1.
  test('returns IPv4 without leading zeros', () => {
    expect(hostOf('010.000.000.001')).toBe('10.0.0.1');
  });

  // Regression: "::1" is an IP address but was rejected as an invalid format.
  test('accepts IPv6 addresses and brackets them for a URL', () => {
    expect(hostOf('::1')).toBe('[::1]');
    expect(hostOf('[::1]')).toBe('[::1]');
    expect(hostOf('fe80::1ff:fe23:4567:890a')).toBe('[fe80::1ff:fe23:4567:890a]');
  });

  test('asks for a host when the input is empty or blank', () => {
    expect(hostOf('')).toBe('error: Please enter a hostname or IP address');
    expect(hostOf('  \t')).toBe('error: Please enter a hostname or IP address');
  });

  // Regression: these passed as hostnames, and the browser then scanned another
  // address ("1.2.3" is 1.2.0.3 to a URL parser) or rejected every request.
  test('rejects hosts that end in a number without being an IPv4 address', () => {
    for (const input of ['999.1.1.1', '256.256.256.256', '1.2.3', '1.2.3.4.5', '12345', 'host.0x10', '0x7f000001']) {
      expect(hostOf(input), input).toBe(INVALID_HOST);
    }
  });

  test('rejects malformed hosts', () => {
    for (const input of [
      'http://example.com',
      'example.com:8080',
      'example.com/path',
      'exa mple.com',
      '-example.com',
      'example-.com',
      'example..com',
      'example.com.',
      'under_score.com',
      'münchen.de',
      '[::1',
      ':::',
      `${'a'.repeat(64)}.com`,
      Array(6).fill('a'.repeat(50)).join('.'),
    ]) {
      expect(hostOf(input), input).toBe(INVALID_HOST);
    }
  });
});

test.describe('parsePortList', () => {
  test('reads single ports and ranges, sorted and without duplicates', () => {
    expect(portsOf('80')).toEqual([80]);
    expect(portsOf('443,80')).toEqual([80, 443]);
    expect(portsOf('8000-8003')).toEqual([8000, 8001, 8002, 8003]);
    expect(portsOf('443, 80, 80, 79-81, 443')).toEqual([79, 80, 81, 443]);
    expect(portsOf('1,65535')).toEqual([1, 65535]);
    expect(portsOf('5-5')).toEqual([5]);
  });

  test('ignores stray separators', () => {
    expect(portsOf(' 80,443, ')).toEqual([80, 443]);
    expect(portsOf(',,80,,')).toEqual([80]);
    expect(portsOf('80;443')).toEqual([80, 443]);
  });

  // Regression: "80 443" was read with parseInt as port 80 alone.
  test('accepts spaces between ports and around a dash', () => {
    expect(portsOf('80 443')).toEqual([80, 443]);
    expect(portsOf('80\n443\t8080')).toEqual([80, 443, 8080]);
    expect(portsOf('8000 - 8002, 22')).toEqual([22, 8000, 8001, 8002]);
  });

  test('asks for ports when the list is empty', () => {
    expect(portsOf('')).toBe(EMPTY_LIST);
    expect(portsOf('  ')).toBe(EMPTY_LIST);
    expect(portsOf(', ,')).toBe(EMPTY_LIST);
  });

  // Regression: a typo was either dropped from the scan without a word or read
  // as another port ("8O80" became port 8, "80a" port 80).
  test('reports an entry that is not a port instead of skipping it', () => {
    expect(portsOf('80,8O80,443')).toBe(badEntry('8O80'));
    expect(portsOf('80a')).toBe(badEntry('80a'));
    expect(portsOf('http')).toBe(badEntry('http'));
    expect(portsOf('80.5')).toBe(badEntry('80.5'));
    expect(portsOf('22,70000')).toBe(badEntry('70000'));
    expect(portsOf('0')).toBe(badEntry('0'));
    expect(portsOf('-80')).toBe(badEntry('-80'));
    expect(portsOf('８０')).toBe(badEntry('８０'));
  });

  test('reports a malformed or out-of-range range', () => {
    expect(portsOf('8010-8000')).toBe(badEntry('8010-8000'));
    expect(portsOf('80-')).toBe(badEntry('80-'));
    expect(portsOf('80-85-90')).toBe(badEntry('80-85-90'));
    expect(portsOf('0-10')).toBe(badEntry('0-10'));
    expect(portsOf('65530-65536')).toBe(badEntry('65530-65536'));
  });

  test('limits a scan to 50 ports', () => {
    expect(portsOf('1-50')).toHaveLength(50);
    expect(portsOf('1-51')).toBe(TOO_MANY);
    expect(portsOf('1-30,40-60')).toBe(TOO_MANY);
    expect(portsOf('1-30,21-50')).toHaveLength(50);
    expect(portsOf('1-3', 2)).toBe('error: Please limit the scan to 2 ports maximum');
  });

  // Regression: the whole range was expanded with a linear duplicate check per
  // port before the limit was looked at, which froze the page for over a second
  // per range. The bound is loose on purpose: the fixed code takes microseconds.
  test('turns down a huge range without expanding it', () => {
    const started = Date.now();
    expect(portsOf('1-65535')).toBe(TOO_MANY);
    expect(portsOf('1-65535,1-65535,1-65535')).toBe(TOO_MANY);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

test.describe('planScan', () => {
  test('scans the common ports in common mode, whatever the port field holds', () => {
    const plan = planScan('example.com', 'common', 'not ports');
    expect(plan).toEqual({ ok: true, host: 'example.com', ports: [...COMMON_PORTS] });
    expect(plan.ok && plan.ports).toHaveLength(20);
  });

  test('names the service of the custom ports it knows', () => {
    expect(planScan(' 192.168.1.1 ', 'custom', '22, 53, 9000')).toEqual({
      ok: true,
      host: '192.168.1.1',
      ports: [
        { port: 22, service: 'SSH', protocol: 'TCP' },
        { port: 53, service: 'DNS', protocol: 'TCP/UDP' },
        { port: 9000, service: 'Unknown', protocol: 'TCP' },
      ],
    });
  });

  test('reports the host problem first, then the port problem', () => {
    expect(planScan('', 'custom', '')).toEqual({ ok: false, error: 'Please enter a hostname or IP address' });
    expect(planScan('bad host', 'common', '')).toEqual({ ok: false, error: 'Invalid hostname or IP address format' });
    expect(planScan('localhost', 'custom', '')).toEqual({
      ok: false,
      error: 'Please enter valid port numbers (e.g., 80,443 or 8000-8010)',
    });
    expect(planScan('localhost', 'custom', '1-100')).toEqual({
      ok: false,
      error: 'Please limit the scan to 50 ports maximum',
    });
  });
});

test.describe('probeUrl', () => {
  test('uses HTTPS for 443 and 8443 and HTTP for every other port', () => {
    expect(probeUrl('example.com', 80)).toBe('http://example.com:80/favicon.ico');
    expect(probeUrl('example.com', 8080)).toBe('http://example.com:8080/favicon.ico');
    expect(probeUrl('example.com', 443)).toBe('https://example.com:443/favicon.ico');
    expect(probeUrl('example.com', 8443)).toBe('https://example.com:8443/favicon.ico');
    expect(probeUrl('[::1]', 3000)).toBe('http://[::1]:3000/favicon.ico');
  });
});

test.describe('probePort', () => {
  test('requests the probe URL without credentials, cache or CORS', async () => {
    const requests: Array<[string, RequestInit | undefined]> = [];
    const fetchImpl: FetchLike = async (input, init) => {
      requests.push([input, init]);
      return new Response(null);
    };

    await probePort('localhost', 3000, { fetchImpl });
    expect(requests).toHaveLength(1);
    expect(requests[0][0]).toBe('http://localhost:3000/favicon.ico');
    expect(requests[0][1]).toMatchObject({ mode: 'no-cors', cache: 'no-store', credentials: 'omit' });
    // A no-cors request may only follow redirects; any other mode makes it fail outright.
    expect(requests[0][1]?.redirect).toBeUndefined();
  });

  // Regression: a port counted as open only when /favicon.ico loaded as an image,
  // so a server answering 404, JSON or HTML was reported as filtered.
  test('reports open for any HTTP response, whatever its status', async () => {
    for (const status of [200, 204, 404, 500]) {
      const fetchImpl: FetchLike = async () => new Response(null, { status });
      expect(await probePort('localhost', 8080, { fetchImpl }), String(status)).toBe('open');
    }
    const html: FetchLike = async () => new Response('<h1>Not found</h1>', { status: 404 });
    expect(await probePort('localhost', 8080, { fetchImpl: html })).toBe('open');
  });

  test('reports filtered when the request fails', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await probePort('localhost', 22, { fetchImpl })).toBe('filtered');
  });

  test('reports filtered when nothing answers before the deadline', async () => {
    let probeSignal: AbortSignal | null | undefined;
    const fetchImpl: FetchLike = (input, init) => {
      probeSignal = init?.signal;
      return hang(input, init);
    };

    expect(await probePort('10.255.255.1', 80, { fetchImpl, timeoutMs: 20 })).toBe('filtered');
    expect(probeSignal?.aborted).toBe(true);
  });

  test('drops the request once the port has answered', async () => {
    let probeSignal: AbortSignal | null | undefined;
    const fetchImpl: FetchLike = async (_input, init) => {
      probeSignal = init?.signal;
      return new Response(null);
    };

    expect(await probePort('localhost', 80, { fetchImpl })).toBe('open');
    expect(probeSignal?.aborted).toBe(true);
  });

  // Regression: a scan could not be stopped; each probe ran its full three seconds.
  test('resolves at once when the caller cancels', async () => {
    const controller = new AbortController();
    const pending = probePort('localhost', 80, { fetchImpl: hang, signal: controller.signal, timeoutMs: 60_000 });
    controller.abort();
    expect(await pending).toBe('filtered');

    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return new Response(null);
    };
    expect(await probePort('localhost', 80, { fetchImpl, signal: controller.signal })).toBe('filtered');
    expect(called).toBe(false);
  });
});
