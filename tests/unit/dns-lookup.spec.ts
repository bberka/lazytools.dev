import { test, expect } from '@playwright/test';
import {
  describeDnsRecords,
  formatTtl,
  lookupDns,
  parseDomainName,
  sameDnsName,
  type DnsLookupResult,
  type DnsRecord,
} from '@/lib/tools/dns-lookup';
import type { FetchLike } from '@/lib/tools/network-fetch';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fake resolver that records the URLs it was asked for. */
function resolver(reply: () => Response | Promise<Response>) {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (input) => {
    urls.push(input);
    return reply();
  };
  return { fetchImpl, urls };
}

/** A request that never answers but gives up when aborted, like the real fetch. */
const hang: FetchLike = (_input, init) =>
  new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });

const nameOf = (input: string) => {
  const parsed = parseDomainName(input);
  return parsed.ok ? parsed.name : `error: ${parsed.error}`;
};

test.describe('parseDomainName', () => {
  test('accepts ordinary domain names and trims them', () => {
    expect(nameOf('example.com')).toBe('example.com');
    expect(nameOf('  www.Example.co.uk \n')).toBe('www.Example.co.uk');
    expect(nameOf('a-b.c-d.example')).toBe('a-b.c-d.example');
    expect(nameOf('xn--mnchen-3ya.de')).toBe('xn--mnchen-3ya.de');
    expect(nameOf('3com.com')).toBe('3com.com');
  });

  test('asks for a name when the input is empty or blank', () => {
    expect(nameOf('')).toBe('error: Please enter a domain name');
    expect(nameOf('   ')).toBe('error: Please enter a domain name');
  });

  // Regression: names with an underscore label were "Invalid domain name format",
  // which ruled out the DMARC, DKIM and SPF lookups the TXT type is there for.
  test('accepts service labels that start with an underscore', () => {
    expect(nameOf('_dmarc.example.com')).toBe('_dmarc.example.com');
    expect(nameOf('selector1._domainkey.example.com')).toBe('selector1._domainkey.example.com');
    expect(nameOf('_sip._tcp.example.com')).toBe('_sip._tcp.example.com');
  });

  // Regression: a fully qualified name and a top-level domain were both rejected.
  test('accepts a trailing dot and a single label', () => {
    expect(nameOf('example.com.')).toBe('example.com');
    expect(nameOf('com')).toBe('com');
    expect(nameOf('localhost')).toBe('localhost');
  });

  // Regression: internationalised names were rejected; they are queried in punycode.
  test('converts internationalised names to ASCII', () => {
    expect(nameOf('münchen.de')).toBe('xn--mnchen-3ya.de');
    expect(nameOf('例え.jp')).toBe('xn--r8jz45g.jp');
    expect(nameOf('MÜNCHEN.de.')).toBe('xn--mnchen-3ya.de');
  });

  test('rejects IP addresses and other names that end in a number', () => {
    for (const input of ['8.8.8.8', '192.168.1.10', '1234', 'example.123']) {
      expect(nameOf(input), input).toBe('error: Invalid domain name format');
    }
  });

  test('rejects malformed names', () => {
    for (const input of [
      '.',
      '..',
      '.example.com',
      'example..com',
      '-example.com',
      'example-.com',
      'exa mple.com',
      'example.com/path',
      'https://example.com',
      'user@example.com',
      'example.com:443',
      'exa$mple.com',
      'example.com..',
    ]) {
      expect(nameOf(input), input).toBe('error: Invalid domain name format');
    }
  });

  test('rejects internationalised input that is not a host name', () => {
    for (const input of ['münchen.de/pfad', 'ü@example.com', 'exa mple.ü', 'ü:80', '１.２.３.４']) {
      expect(nameOf(input), input).toBe('error: Invalid domain name format');
    }
  });

  test('enforces the length limits of a label and of a name', () => {
    const label63 = 'a'.repeat(63);
    expect(nameOf(`${label63}.com`)).toBe(`${label63}.com`);
    expect(nameOf(`${label63}a.com`)).toBe('error: Invalid domain name format');

    const name253 = `${Array(4).fill('a'.repeat(62)).join('.')}.com`;
    expect(name253).toHaveLength(255);
    expect(nameOf(name253)).toBe('error: Invalid domain name format');
    expect(nameOf(`${Array(4).fill('a'.repeat(61)).join('.')}.abcde`)).toHaveLength(253);
  });
});

test.describe('sameDnsName', () => {
  test('ignores case and a trailing dot', () => {
    expect(sameDnsName('google.com.', 'google.com')).toBe(true);
    expect(sameDnsName('WWW.Example.COM', 'www.example.com.')).toBe(true);
    expect(sameDnsName(' example.com ', 'example.com')).toBe(true);
  });

  test('tells different names apart', () => {
    expect(sameDnsName('www.example.com.', 'example.com')).toBe(false);
    expect(sameDnsName('', 'example.com')).toBe(false);
  });
});

test.describe('formatTtl', () => {
  test('shows the largest whole unit', () => {
    expect(formatTtl(0)).toBe('0s');
    expect(formatTtl(59)).toBe('59s');
    expect(formatTtl(60)).toBe('1m');
    expect(formatTtl(300)).toBe('5m');
    expect(formatTtl(3599)).toBe('59m');
    expect(formatTtl(3600)).toBe('1h');
    expect(formatTtl(86399)).toBe('23h');
    expect(formatTtl(86400)).toBe('1d');
    expect(formatTtl(604800)).toBe('7d');
  });
});

test.describe('describeDnsRecords', () => {
  const record = (type: string): DnsRecord => ({ name: 'example.com.', type, ttl: 60, data: 'x' });
  const result = (type: DnsLookupResult['type'], types: string[]): DnsLookupResult => ({
    name: 'example.com',
    type,
    records: types.map(record),
  });

  test('counts the records of the type that was asked for', () => {
    expect(describeDnsRecords(result('A', ['A']))).toBe('Found 1 A record');
    expect(describeDnsRecords(result('A', ['A', 'A', 'A']))).toBe('Found 3 A records');
  });

  // Regression: every record in the answer was counted as the requested type,
  // so an alias with one address read "Found 2 A records".
  test('counts the records of an alias chain separately', () => {
    expect(describeDnsRecords(result('A', ['CNAME', 'A']))).toBe('Found 1 A record and 1 CNAME record');
    expect(describeDnsRecords(result('AAAA', ['CNAME', 'CNAME', 'AAAA', 'AAAA']))).toBe(
      'Found 2 AAAA records and 2 CNAME records'
    );
  });

  test('says so when the answer has none of the requested type', () => {
    expect(describeDnsRecords(result('MX', ['CNAME']))).toBe('No MX records. Found 1 CNAME record');
    expect(describeDnsRecords(result('MX', []))).toBe('No MX records');
  });
});

test.describe('lookupDns', () => {
  const GOOGLE_A = {
    Status: 0,
    TC: false,
    RD: true,
    RA: true,
    AD: false,
    CD: false,
    Question: [{ name: 'google.com.', type: 1 }],
    Answer: [
      { name: 'google.com.', type: 1, TTL: 300, data: '142.250.72.14' },
      { name: 'google.com.', type: 1, TTL: 300, data: '142.250.72.46' },
    ],
  };

  test('returns the records of the answer', async () => {
    const { fetchImpl, urls } = resolver(() => json(GOOGLE_A));

    expect(await lookupDns('google.com', 'A', { fetchImpl })).toEqual({
      ok: true,
      result: {
        name: 'google.com',
        type: 'A',
        records: [
          { name: 'google.com.', type: 'A', ttl: 300, data: '142.250.72.14' },
          { name: 'google.com.', type: 'A', ttl: 300, data: '142.250.72.46' },
        ],
      },
    });
    expect(urls).toEqual(['https://dns.google/resolve?name=google.com&type=1']);
  });

  test('asks for each record type by its number', async () => {
    const numbers = { A: 1, AAAA: 28, MX: 15, TXT: 16, NS: 2, CNAME: 5, SOA: 6 } as const;
    for (const [type, number] of Object.entries(numbers)) {
      const { fetchImpl, urls } = resolver(() => json(GOOGLE_A));
      await lookupDns('google.com', type as keyof typeof numbers, { fetchImpl });
      expect(urls, type).toEqual([`https://dns.google/resolve?name=google.com&type=${number}`]);
    }
  });

  test('queries the trimmed name, in ASCII and without a trailing dot', async () => {
    const { fetchImpl, urls } = resolver(() => json(GOOGLE_A));
    const outcome = await lookupDns('  münchen.de.  ', 'A', { fetchImpl });

    expect(urls).toEqual(['https://dns.google/resolve?name=xn--mnchen-3ya.de&type=1']);
    expect(outcome).toMatchObject({ ok: true, result: { name: 'xn--mnchen-3ya.de' } });
  });

  // Regression: this name never reached the resolver because validation rejected it.
  test('looks up a DMARC record', async () => {
    const { fetchImpl, urls } = resolver(() =>
      json({ Status: 0, Answer: [{ name: '_dmarc.example.com.', type: 16, TTL: 3600, data: 'v=DMARC1; p=none' }] })
    );

    const outcome = await lookupDns('_dmarc.example.com', 'TXT', { fetchImpl });
    expect(urls).toEqual(['https://dns.google/resolve?name=_dmarc.example.com&type=16']);
    expect(outcome).toMatchObject({ ok: true, result: { records: [{ type: 'TXT', data: 'v=DMARC1; p=none' }] } });
  });

  // Regression: the CNAME record of an alias was presented as one more record of the requested type.
  test('labels each record with its own type', async () => {
    const { fetchImpl } = resolver(() =>
      json({
        Status: 0,
        Answer: [
          { name: 'www.example.com.', type: 5, TTL: 120, data: 'example.com.' },
          { name: 'example.com.', type: 1, TTL: 60, data: '93.184.216.34' },
          { name: 'example.com.', type: 46, TTL: 60, data: 'a 13 2 300 ...' },
          { name: 'example.com.', type: 65, TTL: 60, data: '1 . alpn=h2' },
        ],
      })
    );

    const outcome = await lookupDns('www.example.com', 'A', { fetchImpl });
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.result.records.map((record) => record.type)).toEqual(['CNAME', 'A', 'RRSIG', 'TYPE65']);
    expect(describeDnsRecords(outcome.result)).toBe(
      'Found 1 A record and 1 CNAME record and 1 RRSIG record and 1 TYPE65 record'
    );
  });

  test('rejects a bad name without sending a query', async () => {
    const { fetchImpl, urls } = resolver(() => json(GOOGLE_A));

    expect(await lookupDns('   ', 'A', { fetchImpl })).toEqual({ ok: false, error: 'Please enter a domain name' });
    expect(await lookupDns('not a domain', 'A', { fetchImpl })).toEqual({
      ok: false,
      error: 'Invalid domain name format',
    });
    expect(urls).toEqual([]);
  });

  test('explains a failed query by its response code', async () => {
    const messages: Array<[number, string]> = [
      [1, 'DNS query failed: the DNS server could not read the query (FORMERR)'],
      [2, 'DNS query failed: the DNS server failed to answer (SERVFAIL)'],
      [3, 'DNS query failed: the domain does not exist (NXDOMAIN)'],
      [5, 'DNS query failed: the DNS server refused the query (REFUSED)'],
      [9, 'DNS query failed with status: 9'],
    ];
    for (const [Status, error] of messages) {
      const { fetchImpl } = resolver(() => json({ Status }));
      expect(await lookupDns('nope.example', 'A', { fetchImpl }), String(Status)).toEqual({ ok: false, error });
    }
  });

  test('says so when the name exists but has no records of that type', async () => {
    const noData = [
      { Status: 0 },
      { Status: 0, Answer: [] },
      { Status: 0, Authority: [{ name: 'example.com.', type: 6, TTL: 60, data: 'ns.' }] },
    ];
    for (const body of noData) {
      const { fetchImpl } = resolver(() => json(body));
      expect(await lookupDns(' example.com ', 'MX', { fetchImpl })).toEqual({
        ok: false,
        error: 'No MX records found for example.com',
      });
    }
  });

  test('reports an HTTP error from the service', async () => {
    const { fetchImpl } = resolver(() => json({ error: 'bad request' }, 400));
    expect(await lookupDns('example.com', 'A', { fetchImpl })).toEqual({
      ok: false,
      error: 'Failed to query DNS records (HTTP 400)',
    });
  });

  test('reports a response that is not a DNS answer', async () => {
    const replies = [
      () => new Response('<html>blocked</html>'),
      () => json(['x']),
      () => json({ Status: 'ok' }),
      () => json(null),
    ];
    for (const reply of replies) {
      const { fetchImpl } = resolver(reply);
      expect(await lookupDns('example.com', 'A', { fetchImpl })).toEqual({
        ok: false,
        error: 'The DNS service returned an unexpected response',
      });
    }
  });

  test('skips answer entries that are not records', async () => {
    const { fetchImpl } = resolver(() =>
      json({
        Status: 0,
        Answer: [null, 'text', { name: 'example.com.', type: 1, TTL: 60 }, { type: 1, data: '93.184.216.34' }],
      })
    );
    expect(await lookupDns('example.com', 'A', { fetchImpl })).toEqual({
      ok: true,
      result: { name: 'example.com', type: 'A', records: [{ name: '', type: 'A', ttl: 0, data: '93.184.216.34' }] },
    });
  });

  // Regression: the query had no deadline, so a hanging resolver left the page loading forever.
  test('times out a query that never answers', async () => {
    expect(await lookupDns('example.com', 'A', { fetchImpl: hang, timeoutMs: 20 })).toEqual({
      ok: false,
      error: 'The DNS query timed out. Please try again.',
    });
  });

  test('reports a network failure in plain words', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await lookupDns('example.com', 'A', { fetchImpl })).toEqual({
      ok: false,
      error: 'Could not reach the DNS service. Please check your connection and try again.',
    });
  });

  test('settles without a result when the caller cancels', async () => {
    const controller = new AbortController();
    const pending = lookupDns('example.com', 'A', { fetchImpl: hang, signal: controller.signal, timeoutMs: 60_000 });
    controller.abort();
    expect((await pending).ok).toBe(false);
  });
});
