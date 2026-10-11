import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * End-to-end flows for the networking tools: IP Address Lookup, DNS Records
 * Lookup, Subnet Calculator and Port Scanner.
 *
 * Nothing here reaches a real service. The lookup APIs are stubbed with
 * `page.route`, on top of a catch-all route that aborts every other request
 * leaving the app's own origin.
 *
 * The Port Scanner is the exception to `page.route`, see `stubProbes`.
 */

const CORS_HEADERS = { 'access-control-allow-origin': '*' };

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    headers: CORS_HEADERS,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Aborts every request that leaves the app's own origin and returns the list
 * of the URLs it turned away. Call it before a test adds its own stubs: routes
 * added later take precedence.
 */
async function blockExternalRequests(page: Page, baseURL: string | undefined) {
  const appOrigin = new URL(baseURL ?? 'http://localhost:3000').origin;
  const blocked: string[] = [];
  await page.route(
    (url) => url.origin !== appOrigin,
    (route) => {
      blocked.push(route.request().url());
      return route.abort();
    }
  );
  return blocked;
}

/**
 * Opens a tool page and waits until React has hydrated it. The page is
 * prerendered, so the fields exist before they react to input; once hydrated
 * the page records itself as a recent tool, which is what is waited for.
 */
async function openTool(page: Page, slug: string, name: string) {
  await page.goto(`/tools/${slug}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await page.waitForFunction(
    (id) => (window.localStorage.getItem('dev-toolbox:recent') ?? '').includes(id),
    slug
  );
}

/** The tool's own error box. Next's route announcer is an alert too, so the text is matched. */
function errorAlert(page: Page) {
  return page.getByRole('alert').filter({ hasText: /^Error:/ });
}

/**
 * The value shown next to a result label such as "City". The result labels are
 * not tied to their values in the markup, so the value is the label's next
 * sibling.
 */
function valueOf(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]');
}

/** The clipboard text. Windows hands multi-line text back with CRLF line ends. */
async function readClipboard(page: Page) {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.replace(/\r\n/g, '\n');
}

test.describe('Network tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // ---------------------------------------------------------------------------
  // IP Address Lookup
  // ---------------------------------------------------------------------------
  test.describe('IP Address Lookup', () => {
    const GOOGLE_DNS = {
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
    };

    test.beforeEach(async ({ page, baseURL }) => {
      await blockExternalRequests(page, baseURL);
    });

    test('looks up an address and shows its location and network details', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      const requested: string[] = [];
      await page.route('https://ipinfo.io/**', (route) => {
        requested.push(route.request().url());
        return fulfillJson(route, GOOGLE_DNS);
      });

      await openTool(page, 'ip-lookup', 'IP Address Lookup');
      await page.getByRole('textbox', { name: 'IP address' }).fill('8.8.8.8');
      await page.getByRole('button', { name: 'Lookup IP' }).click();

      await expect(page.getByText('IP Information', { exact: true })).toBeVisible();
      await expect(valueOf(page, 'IP Address')).toHaveText('8.8.8.8');
      await expect(valueOf(page, 'Hostname')).toHaveText('dns.google');
      await expect(valueOf(page, 'City')).toHaveText('Mountain View');
      await expect(valueOf(page, 'Region')).toHaveText('California');
      await expect(valueOf(page, 'Country')).toHaveText('US');
      await expect(valueOf(page, 'Postal Code')).toHaveText('94043');
      await expect(valueOf(page, 'Location')).toHaveText('37.4056,-122.0775');
      await expect(valueOf(page, 'Timezone')).toHaveText('America/Los_Angeles');
      await expect(valueOf(page, 'Organization (ISP)')).toHaveText('AS15169 Google LLC');
      await expect(page.getByRole('link', { name: 'View on Google Maps' })).toHaveAttribute(
        'href',
        'https://www.google.com/maps?q=37.4056,-122.0775'
      );
      await expect(errorAlert(page)).toHaveCount(0);
      expect(requested).toEqual(['https://ipinfo.io/8.8.8.8/json']);

      await page.getByRole('button', { name: 'Copy organization' }).click();
      await expect.poll(() => readClipboard(page)).toBe('AS15169 Google LLC');
      await page.getByRole('button', { name: 'Copy coordinates' }).click();
      await expect.poll(() => readClipboard(page)).toBe('37.4056,-122.0775');
      await page.getByRole('button', { name: 'Copy hostname' }).click();
      await expect.poll(() => readClipboard(page)).toBe('dns.google');
      await page.getByRole('button', { name: 'Copy IP' }).click();
      await expect.poll(() => readClipboard(page)).toBe('8.8.8.8');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByText('IP Information', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: 'IP address' })).toHaveValue('');
    });

    test('"My IP" looks up the visitor, not the address left in the field', async ({ page }) => {
      const requested: string[] = [];
      await page.route('https://ipinfo.io/**', (route) => {
        const { pathname } = new URL(route.request().url());
        requested.push(pathname);
        return fulfillJson(
          route,
          pathname === '/json'
            ? { ip: '203.0.113.7', city: 'Lisbon', region: 'Lisbon', country: 'PT', loc: '38.7167,-9.1333' }
            : GOOGLE_DNS
        );
      });

      await openTool(page, 'ip-lookup', 'IP Address Lookup');
      const field = page.getByRole('textbox', { name: 'IP address' });
      await field.fill('8.8.8.8');
      await page.getByRole('button', { name: 'My IP' }).click();

      await expect(valueOf(page, 'IP Address')).toHaveText('203.0.113.7');
      await expect(valueOf(page, 'City')).toHaveText('Lisbon');
      await expect(valueOf(page, 'Country')).toHaveText('PT');
      await expect(field).toHaveValue('');
      expect(requested).toEqual(['/json']);
    });

    test('pressing Enter looks up an IPv6 address', async ({ page }) => {
      const requested: string[] = [];
      await page.route('https://ipinfo.io/**', (route) => {
        requested.push(route.request().url());
        return fulfillJson(route, {
          ip: '2001:4860:4860::8888',
          hostname: 'dns.google',
          city: 'Mountain View',
          country: 'US',
          loc: '37.4056,-122.0775',
          org: 'AS15169 Google LLC',
        });
      });

      await openTool(page, 'ip-lookup', 'IP Address Lookup');
      const field = page.getByRole('textbox', { name: 'IP address' });
      await field.fill('2001:4860:4860::8888');
      await field.press('Enter');

      await expect(valueOf(page, 'IP Address')).toHaveText('2001:4860:4860::8888');
      await expect(valueOf(page, 'Hostname')).toHaveText('dns.google');
      expect(requested).toEqual(['https://ipinfo.io/2001:4860:4860::8888/json']);
    });

    test('rejects text that is not an IP address without calling any API', async ({ page }) => {
      const requested: string[] = [];
      for (const host of ['ipinfo.io', 'freeipapi.com', 'ipapi.co']) {
        await page.route(`https://${host}/**`, (route) => {
          requested.push(route.request().url());
          return route.abort();
        });
      }

      await openTool(page, 'ip-lookup', 'IP Address Lookup');
      const field = page.getByRole('textbox', { name: 'IP address' });
      const lookup = page.getByRole('button', { name: 'Lookup IP' });

      for (const invalid of ['999.1.1.1', '8.8.8', 'example.com', '1:2:3', '8.8.8.8/24']) {
        await field.fill(invalid);
        await lookup.click();
        await expect(errorAlert(page), invalid).toHaveText('Error: Invalid IP address format');
        await expect(page.getByText('IP Information', { exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Clear' }).click();
        await expect(errorAlert(page)).toHaveCount(0);
      }

      expect(requested).toEqual([]);
    });

    test('flags a private address and shows no location for it', async ({ page }) => {
      await page.route('https://ipinfo.io/**', (route) =>
        fulfillJson(route, { ip: '192.168.1.1', bogon: true })
      );

      await openTool(page, 'ip-lookup', 'IP Address Lookup');
      await page.getByRole('textbox', { name: 'IP address' }).fill('192.168.1.1');
      await page.getByRole('button', { name: 'Lookup IP' }).click();

      await expect(errorAlert(page)).toHaveText('Error: This is a private/reserved IP address (bogon)');
      await expect(valueOf(page, 'IP Address')).toHaveText('192.168.1.1');
      await expect(page.getByText('City', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'View on Google Maps' })).toHaveCount(0);
    });

    test('falls back to the second provider when the first one fails', async ({ page }) => {
      const order: string[] = [];
      await page.route('https://ipinfo.io/**', (route) => {
        order.push('ipinfo.io');
        return fulfillJson(route, { status: 429, error: { title: 'Rate limit exceeded' } }, 429);
      });
      await page.route('https://freeipapi.com/**', (route) => {
        order.push(route.request().url());
        return fulfillJson(route, {
          ipAddress: '1.1.1.1',
          cityName: 'Sydney',
          regionName: 'New South Wales',
          countryName: 'Australia',
          latitude: -33.8688,
          longitude: 151.2093,
          zipCode: '2000',
          timeZone: '+10:00',
          isp: 'Cloudflare, Inc.',
        });
      });

      await openTool(page, 'ip-lookup', 'IP Address Lookup');
      await page.getByRole('textbox', { name: 'IP address' }).fill('1.1.1.1');
      await page.getByRole('button', { name: 'Lookup IP' }).click();

      await expect(valueOf(page, 'IP Address')).toHaveText('1.1.1.1');
      await expect(valueOf(page, 'City')).toHaveText('Sydney');
      await expect(valueOf(page, 'Region')).toHaveText('New South Wales');
      await expect(valueOf(page, 'Country')).toHaveText('Australia');
      await expect(valueOf(page, 'Postal Code')).toHaveText('2000');
      await expect(valueOf(page, 'Location')).toHaveText('-33.8688,151.2093');
      await expect(valueOf(page, 'Timezone')).toHaveText('+10:00');
      await expect(valueOf(page, 'Organization (ISP)')).toHaveText('Cloudflare, Inc.');
      await expect(page.getByRole('link', { name: 'View on Google Maps' })).toHaveAttribute(
        'href',
        'https://www.google.com/maps?q=-33.8688,151.2093'
      );
      await expect(errorAlert(page)).toHaveCount(0);
      expect(order).toEqual(['ipinfo.io', 'https://freeipapi.com/api/json/1.1.1.1']);
    });

    test('falls back to the third provider and keeps a location on the equator', async ({ page }) => {
      const order: string[] = [];
      await page.route('https://ipinfo.io/**', (route) => {
        order.push('ipinfo.io');
        return route.abort('connectionrefused');
      });
      await page.route('https://freeipapi.com/**', (route) => {
        order.push('freeipapi.com');
        return route.fulfill({ status: 500, headers: CORS_HEADERS, contentType: 'text/html', body: '<h1>Oops</h1>' });
      });
      await page.route('https://ipapi.co/**', (route) => {
        order.push(route.request().url());
        return fulfillJson(route, {
          ip: '41.210.128.1',
          city: 'Kampala',
          region: 'Central Region',
          country_name: 'Uganda',
          latitude: 0,
          longitude: 32.5822,
          org: 'UGANDA-TELECOM',
          postal: null,
          timezone: 'Africa/Kampala',
        });
      });

      await openTool(page, 'ip-lookup', 'IP Address Lookup');
      await page.getByRole('textbox', { name: 'IP address' }).fill('41.210.128.1');
      await page.getByRole('button', { name: 'Lookup IP' }).click();

      await expect(valueOf(page, 'IP Address')).toHaveText('41.210.128.1');
      await expect(valueOf(page, 'City')).toHaveText('Kampala');
      await expect(valueOf(page, 'Country')).toHaveText('Uganda');
      await expect(valueOf(page, 'Location')).toHaveText('0,32.5822');
      await expect(valueOf(page, 'Timezone')).toHaveText('Africa/Kampala');
      await expect(valueOf(page, 'Organization (ISP)')).toHaveText('UGANDA-TELECOM');
      await expect(page.getByText('Postal Code', { exact: true })).toHaveCount(0);
      expect(order).toEqual(['ipinfo.io', 'freeipapi.com', 'https://ipapi.co/41.210.128.1/json/']);
    });

    test('reports a failed lookup when every provider fails', async ({ page }) => {
      await page.route('https://ipinfo.io/**', (route) => route.abort('internetdisconnected'));
      await page.route('https://freeipapi.com/**', (route) =>
        route.fulfill({ status: 200, headers: CORS_HEADERS, contentType: 'text/html', body: '<html>blocked</html>' })
      );
      // ipapi.co reports a rate limit inside an HTTP 200 body.
      await page.route('https://ipapi.co/**', (route) =>
        fulfillJson(route, { error: true, reason: 'RateLimited', message: 'Visit ipapi.co/ratelimited/' })
      );

      await openTool(page, 'ip-lookup', 'IP Address Lookup');
      await page.getByRole('textbox', { name: 'IP address' }).fill('8.8.4.4');
      await page.getByRole('button', { name: 'Lookup IP' }).click();

      await expect(errorAlert(page)).toHaveText(
        'Error: All IP geolocation lookup APIs failed. Please check your connection or try again later.'
      );
      await expect(page.getByText('IP Information', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Lookup IP' })).toBeEnabled();
    });

    test('gives up on a provider that never answers and uses the next one', async ({ page }) => {
      await page.clock.install();

      let hanging = 0;
      await page.route('https://ipinfo.io/**', () => {
        // Never answered: the connection stays open.
        hanging += 1;
      });
      await page.route('https://freeipapi.com/**', (route) =>
        fulfillJson(route, { ipAddress: '9.9.9.9', cityName: 'Berkeley', countryName: 'United States' })
      );

      await openTool(page, 'ip-lookup', 'IP Address Lookup');
      await page.getByRole('textbox', { name: 'IP address' }).fill('9.9.9.9');
      await page.getByRole('button', { name: 'Lookup IP' }).click();

      await expect(page.getByRole('button', { name: 'Looking up...' })).toBeDisabled();
      await expect.poll(() => hanging).toBe(1);
      await expect(page.getByText('IP Information', { exact: true })).toHaveCount(0);

      // Each provider gets eight seconds.
      await page.clock.fastForward(8_000);

      await expect(valueOf(page, 'IP Address')).toHaveText('9.9.9.9');
      await expect(valueOf(page, 'City')).toHaveText('Berkeley');
      await expect(page.getByRole('button', { name: 'Lookup IP' })).toBeEnabled();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });

    test('Clear cancels a lookup that is still running', async ({ page }) => {
      const called: string[] = [];
      let release: (() => void) | undefined;
      await page.route('https://ipinfo.io/**', async (route) => {
        called.push('ipinfo.io');
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await fulfillJson(route, GOOGLE_DNS).catch(() => undefined);
      });
      for (const host of ['freeipapi.com', 'ipapi.co']) {
        await page.route(`https://${host}/**`, (route) => {
          called.push(host);
          return route.abort();
        });
      }

      await openTool(page, 'ip-lookup', 'IP Address Lookup');
      await page.getByRole('textbox', { name: 'IP address' }).fill('8.8.8.8');
      await page.getByRole('button', { name: 'Lookup IP' }).click();
      await expect(page.getByRole('button', { name: 'Looking up...' })).toBeDisabled();
      await expect.poll(() => called).toEqual(['ipinfo.io']);

      const cancelled = page.waitForEvent('requestfailed', (request) => request.url().startsWith('https://ipinfo.io/'));
      await page.getByRole('button', { name: 'Clear' }).click();
      await cancelled;

      await expect(page.getByRole('button', { name: 'Lookup IP' })).toBeEnabled();
      await expect(page.getByRole('textbox', { name: 'IP address' })).toHaveValue('');
      release?.();

      await expect(errorAlert(page)).toHaveCount(0);
      await expect(page.getByText('IP Information', { exact: true })).toHaveCount(0);
      // The cancelled lookup must not carry on to the fallback providers.
      expect(called).toEqual(['ipinfo.io']);
    });
  });

  // ---------------------------------------------------------------------------
  // DNS Records Lookup
  // ---------------------------------------------------------------------------
  test.describe('DNS Records Lookup', () => {
    interface DnsQuery {
      name: string | null;
      type: string | null;
    }

    test.beforeEach(async ({ page, baseURL }) => {
      await blockExternalRequests(page, baseURL);
    });

    /** Stubs Google's DNS-over-HTTPS endpoint and records what was asked. */
    async function stubDns(page: Page, answer: (query: DnsQuery) => unknown) {
      const queries: DnsQuery[] = [];
      await page.route('https://dns.google/resolve**', (route) => {
        const { searchParams } = new URL(route.request().url());
        const query = { name: searchParams.get('name'), type: searchParams.get('type') };
        queries.push(query);
        return fulfillJson(route, answer(query));
      });
      return queries;
    }

    function resultsCard(page: Page) {
      // Title -> title block -> card header -> card.
      return page.getByText('DNS Records', { exact: true }).locator('xpath=../../..');
    }

    async function chooseRecordType(page: Page, type: string) {
      await page.getByRole('combobox', { name: 'Record Type' }).click();
      await page.getByRole('option', { name: type, exact: true }).click();
      await expect(page.getByRole('combobox', { name: 'Record Type' })).toHaveText(type);
    }

    test('looks up A records and copies them', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const queries = await stubDns(page, () => ({
        Status: 0,
        Question: [{ name: 'example.com.', type: 1 }],
        Answer: [
          { name: 'example.com.', type: 1, TTL: 300, data: '93.184.216.34' },
          { name: 'example.com.', type: 1, TTL: 45, data: '93.184.216.35' },
        ],
      }));

      await openTool(page, 'dns-lookup', 'DNS Records Lookup');
      const lookup = page.getByRole('button', { name: 'Lookup DNS' });
      await expect(lookup).toBeDisabled();

      await page.getByRole('textbox', { name: 'Domain name' }).fill('example.com');
      await expect(page.getByRole('combobox', { name: 'Record Type' })).toHaveText('A');
      await lookup.click();

      const card = resultsCard(page);
      await expect(card.getByText('Found 2 A records', { exact: true })).toBeVisible();
      await expect(card.getByText('93.184.216.34', { exact: true })).toBeVisible();
      await expect(card.getByText('93.184.216.35', { exact: true })).toBeVisible();
      await expect(card.getByText(/^TTL: /)).toHaveText(['TTL: 5m', 'TTL: 45s']);
      // Both records belong to the name that was asked for, so neither repeats it.
      await expect(card.getByText(/^Name:/)).toHaveCount(0);
      await expect(errorAlert(page)).toHaveCount(0);
      expect(queries).toEqual([{ name: 'example.com', type: '1' }]);

      await expect(card.getByRole('button', { name: 'Copy record' })).toHaveCount(2);
      await card.getByRole('button', { name: 'Copy record' }).nth(1).click();
      await expect.poll(() => readClipboard(page)).toBe('93.184.216.35');
      await card.getByRole('button', { name: 'Copy all records' }).click();
      await expect.poll(() => readClipboard(page)).toBe('93.184.216.34\n93.184.216.35');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByText('DNS Records', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: 'Domain name' })).toHaveValue('');
    });

    test('asks the resolver for each record type by its number', async ({ page }) => {
      // The numbers DNS assigns to the types on offer (RFC 1035, RFC 3596).
      const TYPE_NUMBERS: Record<string, string> = {
        A: '1',
        AAAA: '28',
        MX: '15',
        TXT: '16',
        NS: '2',
        CNAME: '5',
        SOA: '6',
      };
      const queries = await stubDns(page, ({ type }) => ({
        Status: 0,
        Answer: [{ name: 'example.com.', type: Number(type), TTL: 7200, data: `record of type ${type}` }],
      }));

      await openTool(page, 'dns-lookup', 'DNS Records Lookup');
      const recordType = page.getByRole('combobox', { name: 'Record Type' });
      await recordType.click();
      await expect(page.getByRole('option')).toHaveText(Object.keys(TYPE_NUMBERS));
      await page.keyboard.press('Escape');
      await expect(page.getByRole('option')).toHaveCount(0);

      await page.getByRole('textbox', { name: 'Domain name' }).fill('example.com');
      for (const [type, number] of Object.entries(TYPE_NUMBERS)) {
        await chooseRecordType(page, type);
        await page.getByRole('button', { name: 'Lookup DNS' }).click();
        await expect(resultsCard(page).getByText(`record of type ${number}`, { exact: true })).toBeVisible();
        await expect(resultsCard(page).getByText(`Found 1 ${type} record`, { exact: true })).toBeVisible();
        await expect(resultsCard(page).getByText('TTL: 2h', { exact: true })).toBeVisible();
      }

      expect(queries).toEqual(Object.values(TYPE_NUMBERS).map((type) => ({ name: 'example.com', type })));
    });

    test('picks a record type with the keyboard and keeps describing the lookup that ran', async ({ page }) => {
      const queries = await stubDns(page, () => ({
        Status: 0,
        Answer: [{ name: 'example.com.', type: 15, TTL: 3600, data: '10 mail.example.com.' }],
      }));

      await openTool(page, 'dns-lookup', 'DNS Records Lookup');
      const recordType = page.getByRole('combobox', { name: 'Record Type' });
      await recordType.focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: 'A', exact: true })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: 'AAAA', exact: true })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: 'MX', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(recordType).toHaveText('MX');

      const domain = page.getByRole('textbox', { name: 'Domain name' });
      await domain.fill('example.com');
      await domain.press('Enter');

      const card = resultsCard(page);
      await expect(card.getByText('Found 1 MX record', { exact: true })).toBeVisible();
      await expect(card.getByText('10 mail.example.com.', { exact: true })).toBeVisible();
      await expect(card.getByText('TTL: 1h', { exact: true })).toBeVisible();
      expect(queries).toEqual([{ name: 'example.com', type: '15' }]);

      // Picking another type for the next lookup must not relabel the results on screen.
      await chooseRecordType(page, 'TXT');
      await expect(card.getByText('Found 1 MX record', { exact: true })).toBeVisible();
      expect(queries).toHaveLength(1);
    });

    test('marks the CNAME records in an alias answer', async ({ page }) => {
      const queries = await stubDns(page, () => ({
        Status: 0,
        Answer: [
          { name: 'www.example.com.', type: 5, TTL: 120, data: 'example.com.' },
          { name: 'example.com.', type: 1, TTL: 86400, data: '93.184.216.34' },
        ],
      }));

      await openTool(page, 'dns-lookup', 'DNS Records Lookup');
      await page.getByRole('textbox', { name: 'Domain name' }).fill('www.example.com');
      await page.getByRole('button', { name: 'Lookup DNS' }).click();

      const card = resultsCard(page);
      await expect(card.getByText('Found 1 A record and 1 CNAME record', { exact: true })).toBeVisible();
      await expect(card.getByText('CNAME', { exact: true })).toHaveCount(1);
      await expect(card.getByText('example.com.', { exact: true })).toBeVisible();
      await expect(card.getByText('93.184.216.34', { exact: true })).toBeVisible();
      await expect(card.getByText(/^TTL: /)).toHaveText(['TTL: 2m', 'TTL: 1d']);
      // Only the address record belongs to a name other than the one asked for.
      await expect(card.getByText(/^Name:/)).toHaveText(['Name: example.com.']);
      expect(queries).toEqual([{ name: 'www.example.com', type: '1' }]);
    });

    test('accepts service labels, international names and a trailing dot', async ({ page }) => {
      const queries = await stubDns(page, ({ name }) => ({
        Status: 0,
        Answer: [{ name: `${name}.`, type: 16, TTL: 600, data: `"v=DMARC1; p=reject" for ${name}` }],
      }));

      await openTool(page, 'dns-lookup', 'DNS Records Lookup');
      await chooseRecordType(page, 'TXT');
      const domain = page.getByRole('textbox', { name: 'Domain name' });
      const lookup = page.getByRole('button', { name: 'Lookup DNS' });

      await domain.fill('_dmarc.example.com');
      await lookup.click();
      await expect(
        resultsCard(page).getByText('"v=DMARC1; p=reject" for _dmarc.example.com', { exact: true })
      ).toBeVisible();
      await expect(resultsCard(page).getByText('Found 1 TXT record', { exact: true })).toBeVisible();
      await expect(resultsCard(page).getByText('TTL: 10m', { exact: true })).toBeVisible();

      await domain.fill('  example.org.  ');
      await lookup.click();
      await expect(resultsCard(page).getByText('"v=DMARC1; p=reject" for example.org', { exact: true })).toBeVisible();

      // An international name is queried in its ASCII (punycode) form.
      await domain.fill('münchen.de');
      await lookup.click();
      await expect(
        resultsCard(page).getByText('"v=DMARC1; p=reject" for xn--mnchen-3ya.de', { exact: true })
      ).toBeVisible();

      expect(queries).toEqual([
        { name: '_dmarc.example.com', type: '16' },
        { name: 'example.org', type: '16' },
        { name: 'xn--mnchen-3ya.de', type: '16' },
      ]);
      await expect(errorAlert(page)).toHaveCount(0);
    });

    test('rejects text that is not a domain name without querying', async ({ page }) => {
      const queries = await stubDns(page, () => ({ Status: 0, Answer: [] }));

      await openTool(page, 'dns-lookup', 'DNS Records Lookup');
      const domain = page.getByRole('textbox', { name: 'Domain name' });
      const lookup = page.getByRole('button', { name: 'Lookup DNS' });

      for (const invalid of ['exa mple.com', 'https://example.com', '-example.com', 'example..com', '192.168.1.1']) {
        await domain.fill(invalid);
        await lookup.click();
        await expect(errorAlert(page), invalid).toHaveText('Error: Invalid domain name format');
        await page.getByRole('button', { name: 'Clear' }).click();
        await expect(errorAlert(page)).toHaveCount(0);
      }

      await domain.fill('   ');
      await domain.press('Enter');
      await expect(errorAlert(page)).toHaveText('Error: Please enter a domain name');

      await expect(page.getByText('DNS Records', { exact: true })).toHaveCount(0);
      expect(queries).toEqual([]);
    });

    test('explains a domain that does not exist and a type with no records', async ({ page }) => {
      await stubDns(page, ({ name }) =>
        name === 'missing.example'
          ? { Status: 3, Authority: [{ name: 'example.', type: 6, TTL: 900, data: 'a.iana-servers.net.' }] }
          : { Status: 0, Authority: [{ name: 'example.com.', type: 6, TTL: 900, data: 'ns.icann.org.' }] }
      );

      await openTool(page, 'dns-lookup', 'DNS Records Lookup');
      const domain = page.getByRole('textbox', { name: 'Domain name' });
      const lookup = page.getByRole('button', { name: 'Lookup DNS' });

      await domain.fill('missing.example');
      await lookup.click();
      await expect(errorAlert(page)).toHaveText('Error: DNS query failed: the domain does not exist (NXDOMAIN)');
      await expect(page.getByText('DNS Records', { exact: true })).toHaveCount(0);

      await chooseRecordType(page, 'AAAA');
      await domain.fill('example.com');
      await lookup.click();
      await expect(errorAlert(page)).toHaveText('Error: No AAAA records found for example.com');
      await expect(page.getByText('DNS Records', { exact: true })).toHaveCount(0);
    });

    test('reports a resolver that cannot be reached or answers with an error', async ({ page }) => {
      let mode: 'offline' | 'http-500' | 'not-json' = 'offline';
      await page.route('https://dns.google/resolve**', (route) => {
        if (mode === 'offline') return route.abort('internetdisconnected');
        if (mode === 'http-500') return fulfillJson(route, { error: 'backend' }, 500);
        return route.fulfill({ status: 200, headers: CORS_HEADERS, contentType: 'text/html', body: '<html></html>' });
      });

      await openTool(page, 'dns-lookup', 'DNS Records Lookup');
      await page.getByRole('textbox', { name: 'Domain name' }).fill('example.com');
      const lookup = page.getByRole('button', { name: 'Lookup DNS' });

      await lookup.click();
      await expect(errorAlert(page)).toHaveText(
        'Error: Could not reach the DNS service. Please check your connection and try again.'
      );

      mode = 'http-500';
      await lookup.click();
      await expect(errorAlert(page)).toHaveText('Error: Failed to query DNS records (HTTP 500)');

      mode = 'not-json';
      await lookup.click();
      await expect(errorAlert(page)).toHaveText('Error: The DNS service returned an unexpected response');
      await expect(lookup).toBeEnabled();
    });

    test('times out when the resolver never answers', async ({ page }) => {
      await page.clock.install();

      let hanging = 0;
      await page.route('https://dns.google/resolve**', () => {
        hanging += 1;
      });

      await openTool(page, 'dns-lookup', 'DNS Records Lookup');
      await page.getByRole('textbox', { name: 'Domain name' }).fill('example.com');
      await page.getByRole('button', { name: 'Lookup DNS' }).click();

      await expect(page.getByRole('button', { name: 'Looking up...' })).toBeDisabled();
      await expect.poll(() => hanging).toBe(1);

      await page.clock.fastForward(10_000);

      await expect(errorAlert(page)).toHaveText('Error: The DNS query timed out. Please try again.');
      await expect(page.getByRole('button', { name: 'Lookup DNS' })).toBeEnabled();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });

    test('Clear cancels a lookup that is still running', async ({ page }) => {
      let hanging = 0;
      await page.route('https://dns.google/resolve**', () => {
        hanging += 1;
      });

      await openTool(page, 'dns-lookup', 'DNS Records Lookup');
      await page.getByRole('textbox', { name: 'Domain name' }).fill('example.com');
      await page.getByRole('button', { name: 'Lookup DNS' }).click();
      await expect(page.getByRole('button', { name: 'Looking up...' })).toBeDisabled();
      await expect.poll(() => hanging).toBe(1);

      const cancelled = page.waitForEvent('requestfailed', (request) =>
        request.url().startsWith('https://dns.google/')
      );
      await page.getByRole('button', { name: 'Clear' }).click();
      await cancelled;

      // The button is idle again (and off, because the field is empty) and nothing is reported.
      await expect(page.getByRole('button', { name: 'Lookup DNS' })).toBeDisabled();
      await expect(page.getByRole('textbox', { name: 'Domain name' })).toHaveValue('');
      await expect(errorAlert(page)).toHaveCount(0);
      await expect(page.getByText('DNS Records', { exact: true })).toHaveCount(0);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });
  });

  // ---------------------------------------------------------------------------
  // Subnet Calculator
  // ---------------------------------------------------------------------------
  test.describe('Subnet Calculator', () => {
    interface Expected {
      ip: string;
      mask: string;
      wildcard: string;
      binary: string;
      network: string;
      broadcast: string;
      first: string;
      last: string;
      total: string;
      usable: string;
      ipClass: string;
      ipType: string;
    }

    let blocked: string[];

    test.beforeEach(async ({ page, baseURL }) => {
      blocked = await blockExternalRequests(page, baseURL);
    });

    // The calculator works in the browser alone: it must not ask any other host for anything.
    test.afterEach(() => {
      expect(blocked).toEqual([]);
    });

    async function expectSubnet(page: Page, expected: Expected) {
      await expect(page.getByText('Network Information', { exact: true })).toBeVisible();
      await expect(valueOf(page, 'IP Address')).toHaveText(expected.ip);
      await expect(valueOf(page, 'Subnet Mask')).toHaveText(expected.mask);
      await expect(valueOf(page, 'Wildcard Mask')).toHaveText(expected.wildcard);
      await expect(valueOf(page, 'Binary Subnet Mask')).toHaveText(expected.binary);
      await expect(valueOf(page, 'Network Address')).toHaveText(expected.network);
      await expect(valueOf(page, 'Broadcast Address')).toHaveText(expected.broadcast);
      await expect(valueOf(page, 'First Usable IP')).toHaveText(expected.first);
      await expect(valueOf(page, 'Last Usable IP')).toHaveText(expected.last);
      await expect(valueOf(page, 'Total Hosts')).toHaveText(expected.total);
      await expect(valueOf(page, 'Usable Hosts')).toHaveText(expected.usable);
      await expect(valueOf(page, 'IP Class')).toHaveText(expected.ipClass);
      await expect(valueOf(page, 'IP Type')).toHaveText(expected.ipType);
      await expect(errorAlert(page)).toHaveCount(0);
    }

    test('calculates a /24 and copies the results', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openTool(page, 'subnet-calculator', 'Subnet Calculator');

      const calculate = page.getByRole('button', { name: 'Calculate' });
      await expect(calculate).toBeDisabled();
      await expect(page.getByRole('spinbutton', { name: 'CIDR prefix length' })).toHaveValue('24');

      await page.getByRole('textbox', { name: 'IP address' }).fill('192.168.1.10');
      await calculate.click();

      await expectSubnet(page, {
        ip: '192.168.1.10/24',
        mask: '255.255.255.0',
        wildcard: '0.0.0.255',
        binary: '11111111.11111111.11111111.00000000',
        network: '192.168.1.0',
        broadcast: '192.168.1.255',
        first: '192.168.1.1',
        last: '192.168.1.254',
        total: '256',
        usable: '254',
        ipClass: 'C',
        ipType: 'Private (Class C)',
      });

      const copies: Array<[button: string, copied: string]> = [
        ['Copy IP/CIDR', '192.168.1.10/24'],
        ['Copy subnet mask', '255.255.255.0'],
        ['Copy wildcard mask', '0.0.0.255'],
        ['Copy binary mask', '11111111.11111111.11111111.00000000'],
        ['Copy network address', '192.168.1.0'],
        ['Copy broadcast address', '192.168.1.255'],
        ['Copy first IP', '192.168.1.1'],
        ['Copy last IP', '192.168.1.254'],
      ];
      for (const [button, copied] of copies) {
        await page.getByRole('button', { name: button }).click();
        await expect.poll(() => readClipboard(page), button).toBe(copied);
      }

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByText('Network Information', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Host Range', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: 'IP address' })).toHaveValue('');
      await expect(calculate).toBeDisabled();
    });

    test('calculates other prefix lengths, including /0, /31 and /32', async ({ page }) => {
      await openTool(page, 'subnet-calculator', 'Subnet Calculator');
      const ip = page.getByRole('textbox', { name: 'IP address' });
      const cidr = page.getByRole('spinbutton', { name: 'CIDR prefix length' });

      await ip.fill('172.16.50.100');
      await cidr.fill('20');
      await cidr.press('Enter');
      await expectSubnet(page, {
        ip: '172.16.50.100/20',
        mask: '255.255.240.0',
        wildcard: '0.0.15.255',
        binary: '11111111.11111111.11110000.00000000',
        network: '172.16.48.0',
        broadcast: '172.16.63.255',
        first: '172.16.48.1',
        last: '172.16.63.254',
        total: '4,096',
        usable: '4,094',
        ipClass: 'B',
        ipType: 'Private (Class B)',
      });

      // A point-to-point link: both addresses are hosts (RFC 3021).
      await ip.fill('10.0.0.5');
      await cidr.fill('31');
      await page.getByRole('button', { name: 'Calculate' }).click();
      await expectSubnet(page, {
        ip: '10.0.0.5/31',
        mask: '255.255.255.254',
        wildcard: '0.0.0.1',
        binary: '11111111.11111111.11111111.11111110',
        network: '10.0.0.4',
        broadcast: '10.0.0.5',
        first: '10.0.0.4',
        last: '10.0.0.5',
        total: '2',
        usable: '2',
        ipClass: 'A',
        ipType: 'Private (Class A)',
      });

      // A single host.
      await ip.fill('8.8.4.4');
      await cidr.fill('32');
      await page.getByRole('button', { name: 'Calculate' }).click();
      await expectSubnet(page, {
        ip: '8.8.4.4/32',
        mask: '255.255.255.255',
        wildcard: '0.0.0.0',
        binary: '11111111.11111111.11111111.11111111',
        network: '8.8.4.4',
        broadcast: '8.8.4.4',
        first: '8.8.4.4',
        last: '8.8.4.4',
        total: '1',
        usable: '1',
        ipClass: 'A',
        ipType: 'Public',
      });

      // The whole address space.
      await ip.fill('127.0.0.1');
      await cidr.fill('0');
      await page.getByRole('button', { name: 'Calculate' }).click();
      await expectSubnet(page, {
        ip: '127.0.0.1/0',
        mask: '0.0.0.0',
        wildcard: '255.255.255.255',
        binary: '00000000.00000000.00000000.00000000',
        network: '0.0.0.0',
        broadcast: '255.255.255.255',
        first: '0.0.0.1',
        last: '255.255.255.254',
        total: '4,294,967,296',
        usable: '4,294,967,294',
        ipClass: 'A',
        ipType: 'Loopback',
      });
    });

    test('takes a prefix typed after the address and updates the fields to match', async ({ page }) => {
      await openTool(page, 'subnet-calculator', 'Subnet Calculator');
      const ip = page.getByRole('textbox', { name: 'IP address' });
      const cidr = page.getByRole('spinbutton', { name: 'CIDR prefix length' });

      await ip.fill('192.168.1.130/26');
      await ip.press('Enter');

      await expectSubnet(page, {
        ip: '192.168.1.130/26',
        mask: '255.255.255.192',
        wildcard: '0.0.0.63',
        binary: '11111111.11111111.11111111.11000000',
        network: '192.168.1.128',
        broadcast: '192.168.1.191',
        first: '192.168.1.129',
        last: '192.168.1.190',
        total: '64',
        usable: '62',
        ipClass: 'C',
        ipType: 'Private (Class C)',
      });
      await expect(ip).toHaveValue('192.168.1.130');
      await expect(cidr).toHaveValue('26');
    });

    test('names the class and the kind of each address', async ({ page }) => {
      await openTool(page, 'subnet-calculator', 'Subnet Calculator');
      const ip = page.getByRole('textbox', { name: 'IP address' });

      const addresses: Array<[address: string, ipClass: string, ipType: string]> = [
        ['8.8.8.8', 'A', 'Public'],
        ['0.0.0.0', 'A', 'Current network'],
        ['100.64.0.1', 'A', 'Shared address space (CGNAT)'],
        ['169.254.10.20', 'B', 'APIPA (Link-local)'],
        // One past the end of 172.16.0.0/12.
        ['172.32.0.1', 'B', 'Public'],
        ['192.0.2.1', 'C', 'Documentation (TEST-NET-1)'],
        ['224.0.0.251', 'D (Multicast)', 'Multicast'],
        ['240.0.0.1', 'E (Reserved)', 'Reserved'],
        ['255.255.255.255', 'E (Reserved)', 'Broadcast'],
      ];
      for (const [address, ipClass, ipType] of addresses) {
        await ip.fill(address);
        await ip.press('Enter');
        await expect(valueOf(page, 'IP Address'), address).toHaveText(`${address}/24`);
        await expect(valueOf(page, 'IP Class'), address).toHaveText(ipClass);
        await expect(valueOf(page, 'IP Type'), address).toHaveText(ipType);
      }
    });

    test('rejects a malformed address or prefix and clears the stale result', async ({ page }) => {
      await openTool(page, 'subnet-calculator', 'Subnet Calculator');
      const ip = page.getByRole('textbox', { name: 'IP address' });
      const cidr = page.getByRole('spinbutton', { name: 'CIDR prefix length' });
      const calculate = page.getByRole('button', { name: 'Calculate' });

      await ip.fill('10.1.2.3');
      await calculate.click();
      await expect(valueOf(page, 'Network Address')).toHaveText('10.1.2.0');

      for (const invalid of ['192.168.1.256', '192.168.1', '192.168.1.1abc', '1e2.1.1.1', '-0.1.1.1', 'example.com']) {
        await ip.fill(invalid);
        await calculate.click();
        await expect(errorAlert(page), invalid).toHaveText('Error: Invalid IPv4 address format');
        await expect(page.getByText('Network Information', { exact: true })).toHaveCount(0);
      }

      await ip.fill('10.1.2.3');
      for (const invalid of ['33', '-1', '24.5', '']) {
        await cidr.fill(invalid);
        await calculate.click();
        await expect(errorAlert(page), `prefix "${invalid}"`).toHaveText('Error: CIDR must be between 0 and 32');
        await expect(page.getByText('Network Information', { exact: true })).toHaveCount(0);
      }

      // A valid prefix clears the error again.
      await cidr.fill('8');
      await calculate.click();
      await expect(errorAlert(page)).toHaveCount(0);
      await expect(valueOf(page, 'Network Address')).toHaveText('10.0.0.0');
      await expect(valueOf(page, 'Broadcast Address')).toHaveText('10.255.255.255');
      await expect(valueOf(page, 'Usable Hosts')).toHaveText('16,777,214');
    });
  });

  // ---------------------------------------------------------------------------
  // Port Scanner
  // ---------------------------------------------------------------------------
  test.describe('Port Scanner', () => {
    type ProbeAnswer = number | 'refuse' | 'hang';

    interface ProbeLog {
      /** Every probe the page made, as scheme://host:port/path, in order. */
      probes: string[];
      /** The probes that were cancelled before they were answered. */
      cancelled: string[];
    }

    const HOST = 'scanme.test';

    /** The row for one port: "Port 80 - HTTP", its protocol and its status. */
    function portRow(page: Page, port: number) {
      // Port line -> text column -> icon and text -> row.
      return page.getByText(new RegExp(`^Port ${port} - `)).locator('xpath=../../..');
    }

    function progressCard(page: Page) {
      // Title -> card header -> card.
      return page.getByText('Scan Progress', { exact: true }).locator('xpath=../..');
    }

    /**
     * Answers the scanner's probes inside the page and records them.
     *
     * A probe is a request for `/favicon.ico`, and those cannot be stubbed with
     * `page.route`: as soon as any route is installed, Playwright aborts every
     * request for a URL ending in `/favicon.ico` without reporting it. So
     * `fetch` is wrapped instead. A request to another origin never reaches the
     * network; it is settled by port from `answers`: a status code is answered
     * with that status, 'hang' is left unanswered, and 'refuse' (the default)
     * fails like a refused connection.
     */
    async function stubProbes(page: Page, answers: Record<number, ProbeAnswer> = {}) {
      await page.addInitScript((byPort) => {
        const log: { probes: string[]; cancelled: string[] } = { probes: [], cancelled: [] };
        Object.assign(window, { __probeLog: log });

        const realFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
          if (url.origin === window.location.origin) return realFetch(input, init);

          const port = url.port || (url.protocol === 'https:' ? '443' : '80');
          const probe = `${url.protocol}//${url.hostname}:${port}${url.pathname}`;
          log.probes.push(probe);

          const answer = byPort[Number(port)] ?? 'refuse';
          const signal = init?.signal;
          return new Promise<Response>((resolve, reject) => {
            let settled = false;
            const cancel = () => {
              if (settled) return;
              settled = true;
              log.cancelled.push(probe);
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            };
            if (signal?.aborted) return cancel();
            signal?.addEventListener('abort', cancel, { once: true });

            if (answer === 'hang') return;
            settled = true;
            if (answer === 'refuse') reject(new TypeError('Failed to fetch'));
            else resolve(new Response(null, { status: answer }));
          });
        };
      }, answers);

      return () => page.evaluate(() => (window as unknown as { __probeLog: ProbeLog }).__probeLog);
    }

    test.describe('with the probes answered in the page', () => {
      test.beforeEach(async ({ page, baseURL }) => {
        await blockExternalRequests(page, baseURL);
      });

      test('scans the common ports and reports the ones that answer as open', async ({ page }) => {
        // Any HTTP answer proves the port is open, whatever its status.
        const probeLog = await stubProbes(page, { 80: 200, 443: 500, 8080: 404 });

        await openTool(page, 'port-checker', 'Port Scanner');
        await expect(page.getByRole('button', { name: 'Common Ports' })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByRole('button', { name: 'Custom Ports' })).toHaveAttribute('aria-pressed', 'false');
        const scan = page.getByRole('button', { name: 'Scan Ports' });
        await expect(scan).toBeDisabled();

        await page.getByLabel('Hostname or IP Address').fill(HOST);
        await scan.click();

        await expect(page.getByText('Scan complete - 20 ports scanned', { exact: true })).toBeVisible();
        await expect(progressCard(page)).toHaveText(/3\s*Open\s*0\s*Closed\s*17\s*Filtered\s*0\s*Checking$/);
        await expect(page.getByText(/^Port \d+ - /)).toHaveText([
          'Port 21 - FTP',
          'Port 22 - SSH',
          'Port 23 - Telnet',
          'Port 25 - SMTP',
          'Port 53 - DNS',
          'Port 80 - HTTP',
          'Port 110 - POP3',
          'Port 143 - IMAP',
          'Port 443 - HTTPS',
          'Port 465 - SMTPS',
          'Port 587 - SMTP (Submission)',
          'Port 993 - IMAPS',
          'Port 995 - POP3S',
          'Port 3306 - MySQL',
          'Port 3389 - RDP',
          'Port 5432 - PostgreSQL',
          'Port 6379 - Redis',
          'Port 8080 - HTTP Proxy',
          'Port 8443 - HTTPS Alt',
          'Port 27017 - MongoDB',
        ]);

        await expect(portRow(page, 80)).toHaveText(/^Port 80 - HTTP\s*TCP\s*Open$/);
        await expect(portRow(page, 443)).toHaveText(/^Port 443 - HTTPS\s*TCP\s*Open$/);
        await expect(portRow(page, 8080)).toHaveText(/^Port 8080 - HTTP Proxy\s*TCP\s*Open$/);
        await expect(portRow(page, 22)).toHaveText(/^Port 22 - SSH\s*TCP\s*Filtered$/);
        await expect(portRow(page, 53)).toHaveText(/^Port 53 - DNS\s*TCP\/UDP\s*Filtered$/);
        await expect(portRow(page, 8443)).toHaveText(/^Port 8443 - HTTPS Alt\s*TCP\s*Filtered$/);
        await expect(portRow(page, 27017)).toHaveText(/^Port 27017 - MongoDB\s*TCP\s*Filtered$/);
        await expect(errorAlert(page)).toHaveCount(0);
        await expect(scan).toBeEnabled();

        // One probe per port, in order; the TLS ports over https and the rest over http.
        const { probes } = await probeLog();
        expect(probes).toEqual(
          [21, 22, 23, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 3306, 3389, 5432, 6379, 8080, 8443, 27017].map(
            (port) => `${port === 443 || port === 8443 ? 'https' : 'http'}://${HOST}:${port}/favicon.ico`
          )
        );
      });

      test('scans a custom list of ports and ranges, one port at a time', async ({ page }) => {
        await page.clock.install();
        const probeLog = await stubProbes(page, { 80: 500, 8001: 'hang', 8002: 200 });

        await openTool(page, 'port-checker', 'Port Scanner');
        await page.getByRole('button', { name: 'Custom Ports' }).click();
        await expect(page.getByRole('button', { name: 'Custom Ports' })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByText('Maximum 50 ports per scan', { exact: true })).toBeVisible();

        await page.getByLabel('Hostname or IP Address').fill(HOST);
        // Out of order, with a duplicate, a range, and a space instead of a comma.
        await page.getByLabel('Ports (comma-separated or ranges)').fill('8000-8002, 80 8000,5432');
        await page.getByRole('button', { name: 'Scan Ports' }).click();

        // The scan goes port by port in ascending order and waits on the port that does not answer.
        await expect(page.getByText('Scanning... 3/5 ports checked', { exact: true })).toBeVisible();
        await expect(progressCard(page)).toHaveText(/1\s*Open\s*0\s*Closed\s*2\s*Filtered\s*2\s*Checking$/);
        await expect(page.getByText(/^Port \d+ - /)).toHaveText([
          'Port 80 - HTTP',
          'Port 5432 - PostgreSQL',
          'Port 8000 - Unknown',
          'Port 8001 - Unknown',
          'Port 8002 - Unknown',
        ]);
        await expect(portRow(page, 80)).toHaveText(/^Port 80 - HTTP\s*TCP\s*Open$/);
        await expect(portRow(page, 5432)).toHaveText(/^Port 5432 - PostgreSQL\s*TCP\s*Filtered$/);
        await expect(portRow(page, 8000)).toHaveText(/^Port 8000 - Unknown\s*TCP\s*Filtered$/);
        await expect(portRow(page, 8001)).toHaveText(/^Port 8001 - Unknown\s*TCP\s*Checking$/);
        await expect(portRow(page, 8002)).toHaveText(/^Port 8002 - Unknown\s*TCP\s*Checking$/);
        await expect(page.getByRole('button', { name: 'Scanning...' })).toBeDisabled();
        expect((await probeLog()).cancelled).toEqual([]);

        // A port that has not answered after three seconds counts as filtered.
        await page.clock.fastForward(3_000);

        await expect(page.getByText('Scan complete - 5 ports scanned', { exact: true })).toBeVisible();
        await expect(progressCard(page)).toHaveText(/2\s*Open\s*0\s*Closed\s*3\s*Filtered\s*0\s*Checking$/);
        await expect(portRow(page, 8001)).toHaveText(/^Port 8001 - Unknown\s*TCP\s*Filtered$/);
        await expect(portRow(page, 8002)).toHaveText(/^Port 8002 - Unknown\s*TCP\s*Open$/);
        await expect(page.getByRole('button', { name: 'Scan Ports' })).toBeEnabled();

        expect(await probeLog()).toEqual({
          probes: [80, 5432, 8000, 8001, 8002].map((port) => `http://${HOST}:${port}/favicon.ico`),
          // The request that ran out of time is dropped, not left open.
          cancelled: [`http://${HOST}:8001/favicon.ico`],
        });
      });

      test('probes an IPv6 address in brackets and an IPv4 address without leading zeros', async ({ page }) => {
        const probeLog = await stubProbes(page, { 8080: 200 });

        await openTool(page, 'port-checker', 'Port Scanner');
        await page.getByRole('button', { name: 'Custom Ports' }).click();
        const host = page.getByLabel('Hostname or IP Address');
        await page.getByLabel('Ports (comma-separated or ranges)').fill('8080');

        const addresses: Array<[typed: string, probed: string]> = [
          ['::1', '[::1]'],
          ['[2001:db8::1]', '[2001:db8::1]'],
          // A URL parser would read 010.0.0.1 as octal, which is 8.0.0.1.
          ['010.0.0.1', '10.0.0.1'],
        ];
        for (const [index, [typed, probed]] of addresses.entries()) {
          await host.fill(typed);
          await page.getByRole('button', { name: 'Scan Ports' }).click();
          await expect
            .poll(async () => (await probeLog()).probes, typed)
            .toEqual(addresses.slice(0, index + 1).map(([, address]) => `http://${address}:8080/favicon.ico`));
          await expect(page.getByText('Scan complete - 1 ports scanned', { exact: true }), typed).toBeVisible();
          await expect(portRow(page, 8080), typed).toHaveText(/^Port 8080 - HTTP Proxy\s*TCP\s*Open$/);
          await expect(errorAlert(page), typed).toHaveCount(0);
        }
      });

      test('rejects a bad host or port list without probing anything', async ({ page }) => {
        const probeLog = await stubProbes(page);

        await openTool(page, 'port-checker', 'Port Scanner');
        const host = page.getByLabel('Hostname or IP Address');
        const scan = page.getByRole('button', { name: 'Scan Ports' });

        for (const invalid of ['not a host', 'http://example.com', '999.1.1.1', '1.2.3', 'exa_mple.com']) {
          await host.fill(invalid);
          await scan.click();
          await expect(errorAlert(page), invalid).toHaveText('Error: Invalid hostname or IP address format');
          await expect(page.getByText('Scan Progress', { exact: true })).toHaveCount(0);
        }

        await page.getByRole('button', { name: 'Custom Ports' }).click();
        const ports = page.getByLabel('Ports (comma-separated or ranges)');
        await host.fill(HOST);

        await scan.click();
        await expect(errorAlert(page)).toHaveText(
          'Error: Please enter valid port numbers (e.g., 80,443 or 8000-8010)'
        );

        const badEntries: Array<[typed: string, reported: string]> = [
          ['80,8O80', '8O80'],
          ['80a', '80a'],
          ['0', '0'],
          ['443,65536', '65536'],
          ['9000-8000', '9000-8000'],
        ];
        for (const [typed, reported] of badEntries) {
          await ports.fill(typed);
          await scan.click();
          await expect(errorAlert(page), typed).toHaveText(
            `Error: "${reported}" is not a valid port or range. Use numbers from 1 to 65535 (e.g., 80,443 or 8000-8010)`
          );
        }

        for (const tooMany of ['1-65535', '1000-1050', '1-30,40-70']) {
          await ports.fill(tooMany);
          await scan.click();
          await expect(errorAlert(page), tooMany).toHaveText('Error: Please limit the scan to 50 ports maximum');
        }

        await expect(page.getByText('Scan Progress', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Scan Results', { exact: true })).toHaveCount(0);
        await expect(scan).toBeEnabled();
        expect((await probeLog()).probes).toEqual([]);

        // Exactly fifty ports is within the limit.
        await ports.fill('1000-1049');
        await scan.click();
        await expect(page.getByText('Scan complete - 50 ports scanned', { exact: true })).toBeVisible();
        await expect(progressCard(page)).toHaveText(/0\s*Open\s*0\s*Closed\s*50\s*Filtered\s*0\s*Checking$/);
        await expect(errorAlert(page)).toHaveCount(0);
        expect((await probeLog()).probes).toHaveLength(50);
      });

      test('Clear stops a scan that is still running', async ({ page }) => {
        const probeLog = await stubProbes(page, { 8080: 'hang', 8081: 200, 8082: 200 });

        await openTool(page, 'port-checker', 'Port Scanner');
        await page.getByRole('button', { name: 'Custom Ports' }).click();
        await page.getByLabel('Hostname or IP Address').fill(HOST);
        await page.getByLabel('Ports (comma-separated or ranges)').fill('8080-8082');
        await page.getByRole('button', { name: 'Scan Ports' }).click();

        await expect(page.getByText('Scanning... 0/3 ports checked', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Scanning...' })).toBeDisabled();
        await expect.poll(async () => (await probeLog()).probes).toEqual([`http://${HOST}:8080/favicon.ico`]);

        await page.getByRole('button', { name: 'Clear' }).click();

        await expect(page.getByText('Scan Progress', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Scan Results', { exact: true })).toHaveCount(0);
        await expect(page.getByLabel('Hostname or IP Address')).toHaveValue('');
        await expect(page.getByLabel('Ports (comma-separated or ranges)')).toHaveValue('');
        // Idle again, and off because the host field is empty.
        await expect(page.getByRole('button', { name: 'Scan Ports' })).toBeDisabled();
        // The probe in flight was cancelled and the remaining ports were never requested.
        expect(await probeLog()).toEqual({
          probes: [`http://${HOST}:8080/favicon.ico`],
          cancelled: [`http://${HOST}:8080/favicon.ico`],
        });
      });
    });

    test.describe('over real HTTP on the loopback interface', () => {
      /**
       * A throwaway HTTP server on 127.0.0.1 that gives every request to
       * `answer`, and counts them.
       */
      async function startServer(answer: NonNullable<Parameters<typeof createServer>[1]>) {
        let requests = 0;
        const server: Server = createServer((request, response) => {
          requests += 1;
          answer(request, response);
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        return {
          port: (server.address() as AddressInfo).port,
          requests: () => requests,
          close: () =>
            new Promise<void>((resolve) => {
              server.close(() => resolve());
              server.closeAllConnections();
            }),
        };
      }

      // No route may be installed here: with one, Playwright would abort the
      // probes (see `stubProbes`). The only hosts the page is pointed at are
      // 127.0.0.1 servers this test starts, and the app's own server.
      test('reports ports that answer as open, whatever the answer, and the rest as filtered', async ({
        page,
        baseURL,
      }) => {
        const appPort = Number(new URL(baseURL ?? 'http://localhost:3000').port);

        // A web server with no favicon, an API that answers in JSON, and a
        // service that accepts the connection and never answers.
        const notFound = await startServer((_, response) => {
          response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end('<!DOCTYPE html><html><body><h1>404 Not Found</h1></body></html>');
        });
        const api = await startServer((_, response) => {
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end('{"error":"internal"}');
        });
        const silent = await startServer(() => undefined);

        try {
          await page.clock.install();
          await openTool(page, 'port-checker', 'Port Scanner');
          await page.getByRole('button', { name: 'Custom Ports' }).click();
          await page.getByLabel('Hostname or IP Address').fill('127.0.0.1');
          // Port 22 is one Chromium refuses to send HTTP to, so no connection is ever made to it.
          await page
            .getByLabel('Ports (comma-separated or ranges)')
            .fill(`22, ${appPort}, ${notFound.port}, ${api.port}, ${silent.port}`);
          await page.getByRole('button', { name: 'Scan Ports' }).click();

          // The scan stops at the silent port until its three seconds are up.
          await expect.poll(() => silent.requests()).toBe(1);
          await expect(portRow(page, silent.port)).toHaveText(/TCP\s*Checking$/);
          await page.clock.fastForward(3_000);

          await expect(page.getByText('Scan complete - 5 ports scanned', { exact: true })).toBeVisible();
          await expect(progressCard(page)).toHaveText(/3\s*Open\s*0\s*Closed\s*2\s*Filtered\s*0\s*Checking$/);
          await expect(portRow(page, 22)).toHaveText(/^Port 22 - SSH\s*TCP\s*Filtered$/);
          await expect(portRow(page, appPort)).toHaveText(new RegExp(`^Port ${appPort} - Unknown\\s*TCP\\s*Open$`));
          await expect(portRow(page, notFound.port)).toHaveText(/ - Unknown\s*TCP\s*Open$/);
          await expect(portRow(page, api.port)).toHaveText(/ - Unknown\s*TCP\s*Open$/);
          await expect(portRow(page, silent.port)).toHaveText(/ - Unknown\s*TCP\s*Filtered$/);
          await expect(errorAlert(page)).toHaveCount(0);

          expect(notFound.requests()).toBe(1);
          expect(api.requests()).toBe(1);
        } finally {
          await Promise.all([notFound.close(), api.close(), silent.close()]);
        }
      });
    });
  });
});

test('DEBUG explore', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text()); });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.route('https://ipinfo.io/**', (route) => {
    console.log('IPINFO', new URL(route.request().url()).pathname);
    return fulfillJson(route, { ip: '8.8.8.8', hostname: 'dns.google', city: 'Mountain View', region: 'California', country: 'US', loc: '37.4056,-122.0775', org: 'AS15169 Google LLC', postal: '94043', timezone: 'America/Los_Angeles' });
  });
  await page.route('https://dns.google/resolve**', (route) => fulfillJson(route, { Status: 0, Answer: [
    { name: 'www.example.com.', type: 5, TTL: 120, data: 'example.com.' },
    { name: 'example.com.', type: 1, TTL: 86400, data: '93.184.216.34' } ] }));

  for (const [w, h, tag] of [[1280, 900, 'desktop'], [390, 844, 'mobile']] as const) {
    await page.setViewportSize({ width: w, height: h });

    await openTool(page, 'ip-lookup', 'IP Address Lookup');
    await page.getByRole('button', { name: 'Lookup IP' }).click();
    await expect(page.getByText('IP Information', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`ip-${tag}.png`), fullPage: true });

    await openTool(page, 'dns-lookup', 'DNS Records Lookup');
    await page.getByRole('textbox', { name: 'Domain name' }).fill('www.example.com');
    await page.getByRole('button', { name: 'Lookup DNS' }).click();
    await expect(page.getByText('DNS Records', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`dns-${tag}.png`), fullPage: true });

    await openTool(page, 'subnet-calculator', 'Subnet Calculator');
    await page.getByRole('textbox', { name: 'IP address' }).fill('192.168.1.10');
    const cidr = page.getByRole('spinbutton', { name: 'CIDR prefix length' });
    await cidr.fill('1e1');
    await page.getByRole('button', { name: 'Calculate' }).click();
    console.log('SUBNET 1e1 ->', await page.getByRole('alert').filter({ hasText: /^Error:/ }).allInnerTexts());
    await cidr.fill('24');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.getByText('Network Information', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`subnet-${tag}.png`), fullPage: true });

    await openTool(page, 'port-checker', 'Port Scanner');
    await page.getByLabel('Hostname or IP Address').fill('scanme.test');
    await page.getByLabel('Hostname or IP Address').press('Enter');
    console.log('PORT after Enter: progress cards =', await page.getByText('Scan Progress', { exact: true }).count());
    await page.getByRole('button', { name: 'Scan Ports' }).click();
    await expect(page.getByText(/Scan complete/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`port-${tag}.png`), fullPage: true });
  }
  console.log('OUT', testInfo.outputDir);
});
