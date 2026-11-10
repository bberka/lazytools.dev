import { readFile } from 'node:fs/promises';
import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * End-to-end flows for six networking, security and utility tools: the IPv4
 * Address Converter, IPv4 Range Expander, MAC Address Generator, Basic Auth
 * Header Generator, Open Graph Meta Generator and Keycode Info. Everything
 * runs in the page; the only request is a stubbed image for the Open Graph
 * preview.
 */

test.use({
  timezoneId: 'UTC',
  locale: 'en-US',
  permissions: ['clipboard-read', 'clipboard-write'],
});

/**
 * Opens a tool page and waits until React has hydrated it. The page is
 * prerendered, so the fields exist before they react to input; once hydrated
 * the page records itself as a recent tool, which is what is waited for.
 */
async function openTool(page: Page, slug: string, name: string) {
  const response = await page.goto(`/tools/${slug}/`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await page.waitForFunction(
    (id) => (window.localStorage.getItem('dev-toolbox:recent') ?? '').includes(id),
    slug
  );
}

/** The clipboard text. Windows hands multi-line text back with CRLF line ends. */
async function readClipboard(page: Page) {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.replace(/\r\n/g, '\n');
}

/** Clicks something that saves a file and returns its name and text. */
async function saveFrom(page: Page, trigger: Locator) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  return { name: download.suggestedFilename(), text: await readFile(await download.path(), 'utf8') };
}

/** The value shown under a label such as "First": the label's next sibling. */
function valueOf(scope: Locator | Page, label: string) {
  return scope.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]');
}

/** The RFC 7617 sample credentials, "Aladdin:open sesame". Built here so no literal token sits in the source. */
const ALADDIN_BASE64_CREDENTIALS = Buffer.from('Aladdin:open sesame').toString('base64');

/** Header builders, so no literal `Basic <credentials>` pair sits in the source. */
const basicCredentials = (credentials: string) => ['Basic', credentials].join(' ');
const basicAuthorizationHeader = (credentials: string) =>
  ['Authorization:', basicCredentials(credentials)].join(' ');

const USER_PASS = Buffer.from('user:pass').toString('base64');
const JOSE = Buffer.from('josé:pässwörd').toString('base64');

test.describe('Networking, security and utility tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // A tool that throws, or logs an error while it is used, has a defect even if its output looks right.
  let problems: string[];
  test.beforeEach(({ page }) => {
    problems = [];
    page.on('pageerror', (error) => problems.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // IPv4 Address Converter
  // ---------------------------------------------------------------------------
  test.describe('IPv4 Address Converter', () => {
    const NAME = 'IPv4 Address Converter';

    test('shows every form of an address, whichever form was typed', async ({ page }) => {
      await openTool(page, 'ipv4-converter', NAME);
      const input = page.getByRole('textbox', { name: 'IPv4 address in any format' });
      await expect(page.getByText('Enter an address to see it in every form.')).toBeVisible();

      await input.fill('192.168.1.1');
      await expect(page.getByText('Read as dotted decimal', { exact: true })).toBeVisible();
      const expected: Record<string, string> = {
        'dotted-decimal': '192.168.1.1',
        integer: '3232235777',
        hex: '0xC0A80101',
        'dotted-hex': '0xC0.0xA8.0x01.0x01',
        octal: '030052000401',
        'binary-dotted': '11000000.10101000.00000001.00000001',
        binary: '11000000101010000000000100000001',
        'mapped-ipv6': '::ffff:c0a8:101',
        'mapped-ipv6-dotted': '::ffff:192.168.1.1',
      };
      for (const [id, value] of Object.entries(expected)) {
        await expect(page.getByTestId(`ipv4-form-${id}`), id).toHaveText(value);
      }

      await page.getByRole('button', { name: 'Copy Hexadecimal', exact: true }).click();
      await expect.poll(() => readClipboard(page)).toBe('0xC0A80101');

      // The same address typed as an integer, in hex and as IPv4-mapped IPv6.
      const readings: Array<[text: string, label: string]> = [
        ['3232235777', 'Read as 32-bit integer'],
        ['0xc0a80101', 'Read as hexadecimal'],
        ['030052000401', 'Read as octal'],
        ['11000000101010000000000100000001', 'Read as binary'],
        ['::FFFF:192.168.1.1', 'Read as ipv4-mapped ipv6'],
      ];
      for (const [text, label] of readings) {
        await input.fill(text);
        await expect(page.getByText(label, { exact: true }), text).toBeVisible();
        await expect(page.getByTestId('ipv4-form-dotted-decimal'), text).toHaveText('192.168.1.1');
      }

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(input).toHaveValue('');
      await expect(page.getByText('Enter an address to see it in every form.')).toBeVisible();
    });

    test('handles the lowest and highest addresses and reports bad input', async ({ page }) => {
      await openTool(page, 'ipv4-converter', NAME);
      const input = page.getByRole('textbox', { name: 'IPv4 address in any format' });
      const problem = (message: string) => page.getByRole('alert').filter({ hasText: message });

      await input.fill('0.0.0.0');
      await expect(page.getByTestId('ipv4-form-hex')).toHaveText('0x00000000');
      await expect(page.getByTestId('ipv4-form-mapped-ipv6')).toHaveText('::ffff:0:0');

      await input.fill('255.255.255.255');
      await expect(page.getByTestId('ipv4-form-integer')).toHaveText('4294967295');
      await expect(page.getByTestId('ipv4-form-binary')).toHaveText('1'.repeat(32));

      const bad: Array<[text: string, message: string]> = [
        ['256.1.1.1', 'Each part of a dotted address must be a number from 0 to 255.'],
        ['4294967296', 'That is larger than 32 bits (4294967295 / 0xFFFFFFFF).'],
        ['2001:db8::1', 'Only IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) can be converted to IPv4.'],
        ['hello', 'Could not recognise that as an IPv4 address in any supported format.'],
      ];
      for (const [text, message] of bad) {
        await input.fill(text);
        await expect(problem(message), text).toBeVisible();
        await expect(page.getByRole('list', { name: 'Address forms' }), text).toHaveCount(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // IPv4 Range Expander
  // ---------------------------------------------------------------------------
  test.describe('IPv4 Range Expander', () => {
    const NAME = 'IPv4 Range Expander';
    const entries = (page: Page) => page.getByRole('textbox', { name: 'CIDR blocks, ranges and addresses' });

    test('expands a CIDR block, copies and saves the list, and collapses back to CIDR', async ({ page }) => {
      await openTool(page, 'ipv4-range-expander', NAME);
      const list = ['192.168.1.0', '192.168.1.1', '192.168.1.2', '192.168.1.3'];

      await entries(page).fill('192.168.1.0/30');
      await expect(valueOf(page, 'Addresses')).toHaveText('4');
      await expect(valueOf(page, 'First')).toHaveText('192.168.1.0');
      await expect(valueOf(page, 'Last')).toHaveText('192.168.1.3');
      await expect(page.getByRole('textbox', { name: 'Expanded address list' })).toHaveValue(list.join('\n'));

      await page.getByRole('button', { name: 'Copy list' }).click();
      await expect.poll(() => readClipboard(page)).toBe(list.join('\n'));
      const saved = await saveFrom(page, page.getByRole('button', { name: 'Download .txt' }));
      expect(saved).toEqual({ name: 'ipv4-addresses.txt', text: `${list.join('\n')}\n` });

      // A start - end range across an octet boundary.
      await entries(page).fill('10.0.0.254 - 10.0.1.1');
      await expect(valueOf(page, 'Addresses')).toHaveText('4');
      await expect(page.getByRole('textbox', { name: 'Expanded address list' })).toHaveValue(
        ['10.0.0.254', '10.0.0.255', '10.0.1.0', '10.0.1.1'].join('\n')
      );

      // The reverse: two neighbouring /24 blocks join into one /23.
      await page.getByRole('tab', { name: 'Collapse to CIDR' }).click();
      await entries(page).fill('192.168.0.0/24\n192.168.1.0/24');
      await expect(valueOf(page, 'CIDR blocks')).toHaveText('1');
      await expect(valueOf(page, 'Addresses covered')).toHaveText('512');
      await expect(page.getByRole('textbox', { name: 'CIDR blocks', exact: true })).toHaveValue('192.168.0.0/23');

      await entries(page).fill('10.0.0.1 - 10.0.0.6');
      await expect(page.getByRole('textbox', { name: 'CIDR blocks', exact: true })).toHaveValue(
        ['10.0.0.1/32', '10.0.0.2/31', '10.0.0.4/31', '10.0.0.6/32'].join('\n')
      );
      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(entries(page)).toHaveValue('');
    });

    test('lists exactly 65,536 addresses and refuses one block larger with a clear message', async ({ page }) => {
      await openTool(page, 'ipv4-range-expander', NAME);

      await entries(page).fill('10.1.0.0/16');
      await expect(valueOf(page, 'Addresses')).toHaveText('65,536');
      await expect(valueOf(page, 'Last')).toHaveText('10.1.255.255');
      await expect(page.getByText(/^Showing the first 1,000 addresses\. Copy and download include all 65,536\.$/)).toBeVisible();
      await page.getByRole('button', { name: 'Copy list' }).click();
      await expect.poll(async () => (await readClipboard(page)).split('\n').length).toBe(65536);

      await entries(page).fill('10.0.0.0/15');
      const refusal = page
        .getByRole('alert')
        .filter({ hasText: 'That covers 131,072 addresses. Listing is limited to 65,536 (a /16); use a smaller range.' });
      await expect(refusal).toBeVisible();
      await expect(valueOf(page, 'Addresses')).toHaveText('131,072');
      await expect(valueOf(page, 'First')).toHaveText('10.0.0.0');
      await expect(valueOf(page, 'Last')).toHaveText('10.1.255.255');
      await expect(page.getByRole('textbox', { name: 'Expanded address list' })).toHaveCount(0);

      await entries(page).fill('0.0.0.0/0');
      await expect(valueOf(page, 'Addresses')).toHaveText('4,294,967,296');

      await entries(page).fill('10.0.0.5 - 10.0.0.1');
      await expect(page.getByRole('alert').filter({ hasText: '"10.0.0.5 - 10.0.0.1" starts after it ends.' })).toBeVisible();
      await entries(page).fill('10.0.0.0/33');
      await expect(page.getByRole('alert').filter({ hasText: '"10.0.0.0/33" is not a valid CIDR block' })).toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  // MAC Address Generator
  // ---------------------------------------------------------------------------
  test.describe('MAC Address Generator', () => {
    const NAME = 'MAC Address Generator';

    test('generates addresses with the asked bits, reformats them and copies them', async ({ page }) => {
      await openTool(page, 'mac-address-generator', NAME);
      await expect(page.getByText('No addresses yet. Choose your options and press Generate.')).toBeVisible();

      await page.getByRole('spinbutton', { name: 'How many (1 to 1000)' }).fill('3');
      await page.getByRole('button', { name: 'Generate', exact: true }).click();

      const items = page.getByRole('list', { name: 'Generated MAC addresses' }).locator('code');
      await expect(items).toHaveCount(3);
      const macs = await items.allTextContents();
      for (const mac of macs) {
        expect(mac).toMatch(/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/);
        // The defaults are unicast (bit 0 clear) and locally administered (bit 1 set).
        expect(parseInt(mac.slice(0, 2), 16) & 0b11).toBe(0b10);
      }

      await page.getByRole('button', { name: 'Copy all' }).click();
      await expect.poll(() => readClipboard(page)).toBe(macs.join('\n'));

      // The same addresses are rewritten, not regenerated.
      await page.getByRole('combobox', { name: 'Format' }).click();
      await page.getByRole('option', { name: /^Cisco dot/ }).click();
      const dotted = macs.map((mac) => {
        const hex = mac.replaceAll(':', '');
        return `${hex.slice(0, 4)}.${hex.slice(4, 8)}.${hex.slice(8, 12)}`;
      });
      await expect(items).toHaveText(dotted);

      await page.getByRole('switch', { name: 'Uppercase letters' }).click();
      await expect(items).toHaveText(dotted.map((mac) => mac.toUpperCase()));

      // Multicast, universal addresses: bit 0 set, bit 1 clear.
      await page.getByRole('combobox', { name: 'Unicast or multicast' }).click();
      await page.getByRole('option', { name: /^Multicast/ }).click();
      await page.getByRole('combobox', { name: 'Local or global' }).click();
      await page.getByRole('option', { name: /^Universally administered/ }).click();
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
      for (const mac of await items.allTextContents()) {
        expect(mac).toMatch(/^[0-9A-F]{4}(\.[0-9A-F]{4}){2}$/);
        expect(parseInt(mac.slice(0, 2), 16) & 0b11).toBe(0b01);
      }

      await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
      await expect(items).toHaveCount(0);
    });

    test('checks a pasted address and rejects a bad count and bad text', async ({ page }) => {
      await openTool(page, 'mac-address-generator', NAME);
      const check = page.getByRole('textbox', { name: 'MAC address to check' });
      const result = page.getByTestId('mac-check-result');

      await check.fill('01:00:5E:00:00:FB');
      await expect(result.getByText('Valid MAC address', { exact: true })).toBeVisible();
      await expect(result.getByText('Multicast (group bit 1)', { exact: true })).toBeVisible();
      await expect(result.getByText('Universally administered (bit 0)', { exact: true })).toBeVisible();
      const forms = page.getByRole('list', { name: 'Normalized forms' }).locator('div.font-mono');
      await expect(forms).toHaveText(['01:00:5e:00:00:fb', '01-00-5e-00-00-fb', '0100.5e00.00fb', '01005e0000fb']);

      await check.fill('02-00-00-00-00-01');
      await expect(result.getByText('Unicast (group bit 0)', { exact: true })).toBeVisible();
      await expect(result.getByText('Locally administered (bit 1)', { exact: true })).toBeVisible();

      await check.fill('ff:ff:ff:ff:ff:ff');
      await expect(result.getByText('Broadcast address', { exact: true })).toBeVisible();

      await check.fill('00:1a:2b:3c:4d');
      await expect(page.getByRole('alert').filter({ hasText: 'Not a MAC address.' })).toBeVisible();
      await expect(result).toHaveCount(0);

      for (const bad of ['0', '1001']) {
        await page.getByRole('spinbutton', { name: 'How many (1 to 1000)' }).fill(bad);
        await expect(page.getByRole('alert').filter({ hasText: 'Enter a whole number from 1 to 1000.' }), bad).toBeVisible();
        await expect(page.getByRole('button', { name: 'Generate', exact: true }), bad).toBeDisabled();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Basic Auth Header Generator
  // ---------------------------------------------------------------------------
  test.describe('Basic Auth Header Generator', () => {
    const NAME = 'Basic Auth Header Generator';

    test('builds the header and snippets, masks the password and decodes a header', async ({ page }) => {
      await openTool(page, 'basic-auth-generator', NAME);
      await expect(page.getByText('Basic auth is not encryption.')).toBeVisible();
      await expect(page.getByText('Enter a username and password to build the header.')).toBeVisible();

      const password = page.getByLabel('Password', { exact: true });
      await page.getByLabel('Username', { exact: true }).fill('Aladdin');
      await password.fill('open sesame');
      await expect(password).toHaveAttribute('type', 'password');
      await expect(page.getByTestId('basic-auth-header')).toHaveText(
        basicAuthorizationHeader(ALADDIN_BASE64_CREDENTIALS)
      );

      await page.getByRole('button', { name: 'Show password', exact: true }).click();
      await expect(password).toHaveAttribute('type', 'text');
      await page.getByRole('button', { name: 'Hide password', exact: true }).click();
      await expect(password).toHaveAttribute('type', 'password');

      await page.getByRole('button', { name: 'Copy header' }).click();
      await expect
        .poll(() => readClipboard(page))
        .toBe(basicAuthorizationHeader(ALADDIN_BASE64_CREDENTIALS));
      await page.getByRole('button', { name: 'Copy value only' }).click();
      await expect
        .poll(() => readClipboard(page))
        .toBe(basicCredentials(ALADDIN_BASE64_CREDENTIALS));

      await expect(page.getByText(`curl -H '${basicAuthorizationHeader(ALADDIN_BASE64_CREDENTIALS)}' 'https://api.example.com/'`)).toBeVisible();
      await expect(page.getByText("curl -u 'Aladdin:open sesame' 'https://api.example.com/'")).toBeVisible();
      await expect(page.getByText(`http 'https://api.example.com/' 'Authorization:${basicCredentials(ALADDIN_BASE64_CREDENTIALS)}'`)).toBeVisible();
      await page.getByLabel('URL used in the snippets').fill('https://x.test/a');
      await expect(page.getByText('fetch("https://x.test/a", {', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: 'Copy fetch snippet' }).click();
      await expect
        .poll(() => readClipboard(page))
        .toBe(`fetch("https://x.test/a", {\n  headers: {\n    Authorization: "${basicCredentials(ALADDIN_BASE64_CREDENTIALS)}",\n  },\n});`);

      // Decoding a pasted header, with the password masked until it is shown.
      await page.getByRole('textbox', { name: 'Authorization header to decode' }).fill(basicAuthorizationHeader(USER_PASS));
      const decoded = page.getByTestId('basic-auth-decoded');
      await expect(valueOf(decoded, 'Username')).toHaveText('user');
      await expect(valueOf(decoded, 'Password')).toHaveText('••••');
      await page.getByRole('button', { name: 'Show decoded password' }).click();
      await expect(valueOf(decoded, 'Password')).toHaveText('pass');
      await page.getByRole('button', { name: 'Copy password' }).click();
      await expect.poll(() => readClipboard(page)).toBe('pass');
    });

    test('encodes non-ASCII text as UTF-8 and reports unusable input', async ({ page }) => {
      await openTool(page, 'basic-auth-generator', NAME);
      const header = page.getByTestId('basic-auth-header');

      await page.getByLabel('Username', { exact: true }).fill('josé');
      await page.getByLabel('Password', { exact: true }).fill('pässwörd');
      await expect(header).toHaveText(basicAuthorizationHeader(JOSE));

      await page.getByLabel('Username', { exact: true }).fill('a:b');
      await expect(page.getByRole('alert').filter({ hasText: 'A username cannot contain a colon (:)' })).toBeVisible();
      await expect(header).toHaveCount(0);

      const decode = page.getByRole('textbox', { name: 'Authorization header to decode' });
      await decode.fill(basicAuthorizationHeader(JOSE));
      await expect(valueOf(page.getByTestId('basic-auth-decoded'), 'Username')).toHaveText('josé');
      await decode.fill('Bearer abc');
      await expect(page.getByRole('alert').filter({ hasText: 'That header uses the Bearer scheme, not Basic.' })).toBeVisible();
      await decode.fill('Basic !!!');
      await expect(page.getByRole('alert').filter({ hasText: 'The token is not valid Base64.' })).toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  // Open Graph Meta Generator
  // ---------------------------------------------------------------------------
  test.describe('Open Graph Meta Generator', () => {
    const NAME = 'Open Graph Meta Generator';
    const tags = (page: Page) => page.getByRole('textbox', { name: 'Generated meta tags' });

    test('writes the tags, shows a preview and copies them', async ({ page }) => {
      await openTool(page, 'open-graph-generator', NAME);

      await page.getByLabel('Title', { exact: true }).fill('LazyTools');
      await page.getByLabel('Description', { exact: true }).fill('Fast, private tools.');
      await page.getByLabel('Page URL').fill('https://lazytools.dev/');
      await page.getByLabel('Site name').fill('LazyTools');
      await page.getByLabel('Locale').fill('en_US');
      await page.getByLabel('Twitter site handle').fill('lazytools');

      await expect(tags(page)).toHaveValue(
        [
          '<meta property="og:title" content="LazyTools" />',
          '<meta property="og:type" content="website" />',
          '<meta property="og:url" content="https://lazytools.dev/" />',
          '<meta property="og:description" content="Fast, private tools." />',
          '<meta property="og:site_name" content="LazyTools" />',
          '<meta property="og:locale" content="en_US" />',
          '<meta name="twitter:card" content="summary_large_image" />',
          '<meta name="twitter:site" content="@lazytools" />',
        ].join('\n')
      );

      const preview = page.getByTestId('og-preview');
      await expect(preview).toContainText('lazytools.dev');
      await expect(preview).toContainText('LazyTools');
      await expect(preview).toContainText('Fast, private tools.');

      await page.getByRole('combobox', { name: 'Type' }).click();
      await page.getByRole('option', { name: 'article', exact: true }).click();
      await expect(tags(page)).toHaveValue(/<meta property="og:type" content="article" \/>/);

      await page.getByRole('button', { name: 'Copy tags' }).click();
      await expect.poll(() => readClipboard(page)).toBe(await tags(page).inputValue());

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(page.getByLabel('Title', { exact: true })).toHaveValue('');
      await expect(preview).toContainText('Your page title');
    });

    test('escapes attributes, counts characters, warns and loads the image only when asked', async ({ page }) => {
      let imageRequests = 0;
      await page.route('https://img.test/og.png', async (route) => {
        imageRequests += 1;
        await route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
        });
      });
      await openTool(page, 'open-graph-generator', NAME);

      await page.getByLabel('Title', { exact: true }).fill('A "quoted" & <odd> title');
      await page.getByLabel('Description', { exact: true }).fill('x'.repeat(156));
      await expect(tags(page)).toHaveValue(/<meta property="og:title" content="A &quot;quoted&quot; &amp; &lt;odd&gt; title" \/>/);
      await expect(page.getByText('156 / 155 (1 over, may be cut off)', { exact: true })).toBeVisible();
      await expect(page.getByText('24 / 60', { exact: true })).toBeVisible();

      await page.getByLabel('Page URL').fill('/relative');
      await expect(
        page.getByRole('list', { name: 'Warnings' }).getByText('The page URL should be absolute, starting with http:// or https://.')
      ).toBeVisible();

      // The image is not requested just because a URL was typed.
      await page.getByLabel('Image URL').fill('https://img.test/og.png');
      await page.getByLabel('Image alt text').fill('A logo');
      await expect(tags(page)).toHaveValue(/<meta property="og:image:alt" content="A logo" \/>/);
      await expect(page.getByTestId('og-preview').locator('img')).toHaveCount(0);
      expect(imageRequests).toBe(0);

      await page.getByRole('switch', { name: 'Load the image in the preview' }).click();
      await expect(page.getByTestId('og-preview').locator('img')).toHaveAttribute('src', 'https://img.test/og.png');
      await expect.poll(() => imageRequests).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Keycode Info
  // ---------------------------------------------------------------------------
  test.describe('Keycode Info', () => {
    const NAME = 'Keycode Info';
    const capture = (page: Page) => page.getByRole('group', { name: 'Key capture area' });
    const details = (page: Page) => page.getByTestId('keycode-details');

    test('shows the event values and a history of the last keys', async ({ page }) => {
      await openTool(page, 'keycode-info', NAME);
      await expect(page.getByText('No keys yet.')).toBeVisible();

      await capture(page).click();
      await expect(page.getByText('Listening. Press any key.')).toBeVisible();

      await page.keyboard.press('a');
      await expect(page.getByTestId('keycode-label')).toHaveText('a');
      await expect(valueOf(details(page), 'event.key')).toHaveText('"a"');
      await expect(valueOf(details(page), 'event.code')).toHaveText('"KeyA"');
      await expect(valueOf(details(page), 'event.keyCode (deprecated)')).toHaveText('65');
      await expect(valueOf(details(page), 'event.which (deprecated)')).toHaveText('65');
      await expect(valueOf(details(page), 'event.location')).toHaveText('0 (Standard)');
      await expect(valueOf(details(page), 'Character')).toHaveText('a');

      await page.keyboard.press(' ');
      await expect(page.getByTestId('keycode-label')).toHaveText('Space');
      await expect(valueOf(details(page), 'event.code')).toHaveText('"Space"');
      await expect(valueOf(details(page), 'event.keyCode (deprecated)')).toHaveText('32');
      await expect(valueOf(details(page), 'Character')).toHaveText('(space)');

      await page.keyboard.press('ShiftRight');
      await expect(valueOf(details(page), 'event.location')).toHaveText('2 (Right)');
      await expect(valueOf(details(page), 'Character')).toHaveText('none');
      await expect(page.getByText('Shift: true', { exact: true })).toBeVisible();

      await page.keyboard.press('Control+Alt+KeyZ');
      await expect(valueOf(details(page), 'event.code')).toHaveText('"KeyZ"');
      await expect(page.getByText('Ctrl: true', { exact: true })).toBeVisible();
      await expect(page.getByText('Alt: true', { exact: true })).toBeVisible();
      await expect(page.getByText('Meta: false', { exact: true })).toBeVisible();

      // Newest first: the Z with Ctrl+Alt, then the two modifier presses, then Shift, space and a.
      const rows = page.getByRole('table', { name: 'Recent keys' }).locator('tbody tr');
      await expect(rows.first().locator('td').nth(1)).toHaveText('KeyZ');
      await expect(rows.first().locator('td').nth(3)).toHaveText('Ctrl+Alt');
      await expect(rows.last().locator('td').first()).toHaveText('a');

      await page.getByRole('button', { name: 'Copy details' }).click();
      await expect
        .poll(() => readClipboard(page))
        .toMatch(/^event\.key: "z"\nevent\.code: "KeyZ"\nevent\.keyCode: 90\nevent\.which: 90\nevent\.location: 0 \(Standard\)\nctrlKey: true\nshiftKey: false\naltKey: true/);

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(page.getByText('No keys yet.')).toBeVisible();
      await expect(details(page)).toHaveCount(0);
    });

    test('keeps only the last ten keys, lets Tab leave, and does not trigger the app shortcuts', async ({ page }) => {
      await openTool(page, 'keycode-info', NAME);
      const rows = page.getByRole('table', { name: 'Recent keys' }).locator('tbody tr');
      const compact = () => page.evaluate(() => window.localStorage.getItem('dev-toolbox:compact-mode'));

      await capture(page).click();
      for (const key of 'abcdefghijkl') await page.keyboard.press(key);
      await expect(rows).toHaveCount(10);
      await expect(rows.first().locator('td').first()).toHaveText('l');
      await expect(rows.last().locator('td').first()).toHaveText('c');

      // Alt+C toggles compact mode everywhere else; while the box has focus it is only reported.
      const before = await compact();
      await page.keyboard.press('Alt+KeyC');
      await expect(valueOf(details(page), 'event.code')).toHaveText('"KeyC"');
      await expect(page.getByText('Alt: true', { exact: true })).toBeVisible();
      expect(await compact()).toBe(before);

      // Ctrl+K would open the command palette.
      await page.keyboard.press('Control+KeyK');
      await expect(valueOf(details(page), 'event.code')).toHaveText('"KeyK"');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // Tab is reported and still moves focus on, so the box is not a keyboard trap.
      await page.keyboard.press('Tab');
      await expect(valueOf(details(page), 'event.code')).toHaveText('"Tab"');
      await expect(capture(page)).not.toBeFocused();

      // With the box out of focus the same shortcut works again.
      await page.keyboard.press('Alt+KeyC');
      await expect.poll(compact).not.toBe(before);
    });

    test('reads the Unidentified / 229 events that on-screen keyboards send', async ({ page }) => {
      await openTool(page, 'keycode-info', NAME);
      await capture(page).evaluate((element) => {
        element.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Unidentified', code: '', keyCode: 229, bubbles: true })
        );
      });
      await expect(page.getByTestId('keycode-label')).toHaveText('Unidentified');
      await expect(valueOf(details(page), 'event.keyCode (deprecated)')).toHaveText('229');
      await expect(valueOf(details(page), 'event.code')).toHaveText('""');
      await expect(valueOf(details(page), 'Character')).toHaveText('none');
    });
  });
});
