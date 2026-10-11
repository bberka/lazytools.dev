import { createHmac } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import QRCode from 'qrcode';

/**
 * Browser flows for the three new crypto tools: HMAC Generator, JWT Creator &
 * Signer and TOTP Code Generator.
 *
 * Expected values come from published test vectors, not from the tools' own
 * modules:
 *   - HMAC: RFC 4231 test cases 1, 2 and 6, and RFC 2202 test case 2 (SHA-1).
 *   - JWT: the RFC 7515 appendix A.1 token and key, and the jwt.io sample token.
 *   - TOTP: the RFC 6238 appendix B table and the RFC 4226 appendix D codes.
 * The few values no RFC lists (an empty key, HS384/HS512 tokens, a token with
 * random claims) were worked out with Node's own crypto module, which shares
 * no code with the tools.
 *
 * The clock is fixed wherever the result depends on the time.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Opens a tool page and waits until it reacts to input. The export ships
 * prerendered HTML, so the fields are on screen before React owns them and
 * text typed in that gap is lost. The tool page records itself as recently
 * used from an effect, which only runs once the page has hydrated.
 */
async function openTool(page: Page, slug: string, name: string) {
  const response = await page.goto(`/tools/${slug}/`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('dev-toolbox:recent') ?? ''))
    .toContain(slug);
}

/** Picks an option of one of the app's dropdowns, found by its label. */
async function choose(page: Page, label: string, option: string) {
  const trigger = page.getByRole('combobox', { name: label, exact: true });
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(trigger).toHaveText(option);
  // The list fades out; the next dropdown must not open while it is still there.
  await expect(page.getByRole('option')).toHaveCount(0);
}

/** Switches one of the format tab strips and waits for it to take. */
async function pickTab(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

const readClipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** Presses a copy button and checks what landed on the clipboard. */
async function expectCopies(page: Page, button: Locator, expected: string) {
  await expect(async () => {
    await button.click();
    expect(await readClipboard(page)).toBe(expected);
  }).toPass({ timeout: 10_000 });
}

/**
 * Narrows the window to a phone and checks that nothing in the tool sticks out
 * sideways, which is what long unbroken output (digests, tokens, links) tends
 * to do. The page clips overflow instead of scrolling, so each element's box
 * is measured; content inside a sideways-scrolling box is allowed to be wide.
 */
async function expectFitsPhone(page: Page) {
  const desktop = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 740 });
  await expect
    .poll(() =>
      page.getByRole('main').evaluate((main) => {
        const limit = document.documentElement.clientWidth;
        const scrollsSideways = (start: Element | null) => {
          for (let node = start; node && node !== main; node = node.parentElement) {
            const overflowX = getComputedStyle(node).overflowX;
            if (overflowX === 'auto' || overflowX === 'scroll') return true;
          }
          return false;
        };
        const sticking: string[] = [];
        for (const element of main.querySelectorAll('*')) {
          const box = element.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          if (box.left >= -1 && box.right <= limit + 1) continue;
          if (scrollsSideways(element.parentElement)) continue;
          const text = (element.textContent ?? '').trim().slice(0, 40);
          sticking.push(`<${element.tagName.toLowerCase()}> "${text}" spans ${Math.round(box.left)}..${Math.round(box.right)}`);
        }
        return sticking;
      })
    )
    .toEqual([]);
  if (desktop) await page.setViewportSize(desktop);
}

const base64Url = (text: string) => Buffer.from(text, 'utf8').toString('base64url');
const fromBase64Url = (text: string) => Buffer.from(text, 'base64url').toString('utf8');

// ---------------------------------------------------------------------------
// Published vectors
// ---------------------------------------------------------------------------

// RFC 4231 test case 2 (and RFC 2202 test case 2 for SHA-1).
const JEFE_MESSAGE = 'what do ya want for nothing?';
const JEFE_HMAC = {
  'SHA-1': 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79',
  'SHA-256': '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
  'SHA-384':
    'af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649',
  'SHA-512':
    '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
} as const;

// RFC 4231 test case 1: key is twenty 0x0b bytes, data "Hi There".
const HI_THERE_KEY_HEX = '0b'.repeat(20);
const HI_THERE_KEY_BASE64 = 'CwsLCwsLCwsLCwsLCwsLCwsLCws=';
const HI_THERE_SHA256 = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';

// RFC 4231 test case 6: a 131-byte key, longer than the hash block.
const LONG_KEY_HEX = 'aa'.repeat(131);
const LONG_KEY_MESSAGE = 'Test Using Larger Than Block-Size Key - Hash Key First';
const LONG_KEY_SHA256 = '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54';

// Not in an RFC; from Node's crypto.createHmac('sha256', key).
const EMPTY_KEY_ABC_SHA256 = 'fd7adb152c05ef80dccf50a1fa4c05d5a3ec6da95575fc312ae7c5d091836351';
const KEY_EMPTY_MESSAGE_SHA256 = '5d5d139563c95b5967b9bd9a8c9b233a9dedb45072794cd232dc1b74832607d0';

// RFC 7515 appendix A.1.
const RFC7515_KEY = 'AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow';
const RFC7515_TOKEN =
  'eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9' +
  '.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ' +
  '.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC7515_EXP = 1300819380; // 2011-03-22T18:43:00Z

// The sample token jwt.io has shown for years: HS256, secret "your-256-bit-secret".
const JWT_IO_SECRET = 'your-256-bit-secret';
const JWT_IO_PAYLOAD = '{"sub":"1234567890","name":"John Doe","iat":1516239022}';
const JWT_IO_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ' +
  '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

// The tool's starting payload {"sub":"1234567890","name":"Test User"} under the
// jwt.io secret, signed with Node's crypto for each algorithm.
const STARTING_PAYLOAD_SEGMENT = 'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciJ9';
const STARTING_TOKENS = {
  HS256: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${STARTING_PAYLOAD_SEGMENT}.fhmKwGJQt-KgGcjEjeZz9Ghy79_95R2FsMBtVl2YVuo`,
  HS384: `eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9.${STARTING_PAYLOAD_SEGMENT}.mCshtE7NcNAVuZaRdW3ng4G1eyTbvm_4_ooiImL_NM7xQ5HGjgqbEZi4ZdkW9d1Q`,
  HS512: `eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.${STARTING_PAYLOAD_SEGMENT}.DA1PZlKqagnEhD5Am4ojOWslUQwiwmZnS9Z0TxHYlrX3F4MV5BpCytqlZKgGd767aux-g2mAdFt0hFTuS6nV8g`,
} as const;

// RFC 6238 appendix B. Each hash has its own seed: the ASCII digits
// "1234567890" repeated to 20, 32 and 64 bytes, given here as Base32.
const TOTP_SEED_SHA1 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const TOTP_SEED_SHA256 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA====';
const TOTP_SEED_SHA512 =
  'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA=';

test.describe('New crypto tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // No flow may throw or log an error; a hydration mismatch shows up this way too.
  let problems: string[] = [];

  test.beforeEach(async ({ context, page }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    problems = [];
    page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
    });
  });

  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // HMAC Generator
  // -------------------------------------------------------------------------

  test.describe('HMAC Generator', () => {
    const open = (page: Page) => openTool(page, 'hmac-generator', 'HMAC Generator');
    const message = (page: Page) => page.getByRole('textbox', { name: 'Message (UTF-8 text)' });
    const key = (page: Page) => page.getByRole('textbox', { name: 'Secret key' });

    test('computes RFC 4231 test case 2 in every hash and output encoding', async ({ page }) => {
      await open(page);
      const main = page.getByRole('main');

      await expect(main.getByText('Enter a message and a key to compute the HMAC.')).toBeVisible();
      await expect(main.getByRole('button', { name: 'Clear' })).toBeDisabled();

      // Typed key by key: the HMAC is recomputed on every keystroke and the last one wins.
      await message(page).pressSequentially(JEFE_MESSAGE);
      await key(page).pressSequentially('Jefe');
      await expect(main.getByText('Key: 4 bytes', { exact: true })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Hash algorithm' })).toHaveText('HMAC-SHA-256');

      for (const algorithm of ['SHA-256', 'SHA-1', 'SHA-384', 'SHA-512'] as const) {
        if (algorithm !== 'SHA-256') await choose(page, 'Hash algorithm', `HMAC-${algorithm}`);

        const hex = JEFE_HMAC[algorithm];
        const digest = Buffer.from(hex, 'hex');
        await expect(main.getByText(hex, { exact: true })).toBeVisible();
        await expect(main.getByText(`${hex.length} characters`, { exact: true })).toBeVisible();
        await expect(main.getByText(digest.toString('base64'), { exact: true })).toBeVisible();
        await expect(main.getByText(digest.toString('base64url'), { exact: true })).toBeVisible();
      }

      // The longest output, 128 hex characters, still fits a phone.
      await expectFitsPhone(page);

      // SHA-1 is the vector whose Base64 form needs both alphabets: "/" becomes "_".
      await choose(page, 'Hash algorithm', 'HMAC-SHA-1');
      await expect(main.getByText('7/zfauXrL6LSdBbV8YTfnCWafHk=', { exact: true })).toBeVisible();
      await expect(main.getByText('7_zfauXrL6LSdBbV8YTfnCWafHk', { exact: true })).toBeVisible();

      // Each row copies its own value, and the button says so.
      await choose(page, 'Hash algorithm', 'HMAC-SHA-256');
      const sha256 = JEFE_HMAC['SHA-256'];
      await expect(main.getByText(sha256, { exact: true })).toBeVisible();
      const copyHex = main.getByRole('button', { name: 'Copy Hex HMAC' });
      await expectCopies(page, copyHex, sha256);
      await expect(copyHex).toHaveText('Copied');
      await expectCopies(
        page,
        main.getByRole('button', { name: 'Copy Base64 HMAC' }),
        'W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM='
      );
      await expectCopies(
        page,
        main.getByRole('button', { name: 'Copy Base64URL HMAC' }),
        'W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM'
      );

      // Upper case changes the hex row only.
      await page.getByRole('switch', { name: 'Uppercase hex' }).click();
      await expect(main.getByText(sha256.toUpperCase(), { exact: true })).toBeVisible();
      await expect(main.getByText(sha256, { exact: true })).toHaveCount(0);
      await expect(main.getByText('W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM=', { exact: true })).toBeVisible();
      await expectCopies(page, copyHex, sha256.toUpperCase());
    });

    test('reads hex, Base64, oversized and empty keys, and explains a bad key', async ({ page }) => {
      await open(page);
      const main = page.getByRole('main');
      const keyError = main.getByRole('alert');

      // RFC 4231 test case 1 with the key typed as hex.
      await message(page).fill('Hi There');
      await pickTab(page, 'Hex');
      await key(page).fill(HI_THERE_KEY_HEX);
      await expect(main.getByText(HI_THERE_SHA256, { exact: true })).toBeVisible();
      await expect(main.getByText('Key: 20 bytes', { exact: true })).toBeVisible();

      // Text that is not hex: the HMAC goes away and the field says why.
      await key(page).fill('Jefe');
      await expect(keyError).toHaveText('Invalid hex: "J" is not a hex digit.');
      await expect(key(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(key(page)).toHaveAccessibleDescription('Invalid hex: "J" is not a hex digit.');
      await expect(main.getByText('Fix the key to see the HMAC.')).toBeVisible();
      await expect(main.getByText('Compute an HMAC first, then paste a signature to compare.')).toBeVisible();
      await expect(main.getByRole('button', { name: 'Copy Hex HMAC' })).toHaveCount(0);

      await key(page).fill('0b0b0');
      await expect(keyError).toHaveText('Invalid hex: 5 digits is odd, each byte needs two.');

      // A leading 0x and spaces between bytes are fine.
      await key(page).fill(`0x${HI_THERE_KEY_HEX.replace(/(.{8})/g, '$1 ')}`);
      await expect(keyError).toHaveCount(0);
      await expect(main.getByText(HI_THERE_SHA256, { exact: true })).toBeVisible();
      await expect(main.getByText('Key: 20 bytes', { exact: true })).toBeVisible();

      // The same key as Base64. Emptying the field first puts a different HMAC
      // on screen, so the expected one can only come from the Base64 key.
      await pickTab(page, 'Base64');
      await key(page).fill('');
      await expect(main.getByText('Empty key. HMAC treats it as zero bytes.')).toBeVisible();
      await expect(main.getByText(HI_THERE_SHA256, { exact: true })).toHaveCount(0);
      await key(page).fill(HI_THERE_KEY_BASE64);
      await expect(main.getByText(HI_THERE_SHA256, { exact: true })).toBeVisible();
      await expect(main.getByText('Key: 20 bytes', { exact: true })).toBeVisible();

      // Padding is optional, but padding that is there has to fit.
      await key(page).fill('CwsLCws=');
      await expect(main.getByText('Key: 5 bytes', { exact: true })).toBeVisible();
      await key(page).fill('CwsLCws==');
      await expect(keyError).toHaveText('Invalid Base64: the padding does not fit the length.');
      await key(page).fill('CwsLCws');
      await expect(keyError).toHaveCount(0);
      await expect(main.getByText('Key: 5 bytes', { exact: true })).toBeVisible();

      // RFC 4231 test case 6: a key longer than the hash block is hashed first.
      await pickTab(page, 'Hex');
      await key(page).fill(LONG_KEY_HEX);
      await message(page).fill(LONG_KEY_MESSAGE);
      await expect(main.getByText(LONG_KEY_SHA256, { exact: true })).toBeVisible();
      await expect(main.getByText('Key: 131 bytes', { exact: true })).toBeVisible();

      // An empty key is allowed (WebCrypto itself refuses to import one).
      await pickTab(page, 'UTF-8 text');
      await key(page).fill('');
      await message(page).fill('abc');
      await expect(main.getByText('Empty key. HMAC treats it as zero bytes.')).toBeVisible();
      await expect(main.getByText(EMPTY_KEY_ABC_SHA256, { exact: true })).toBeVisible();

      // So is an empty message, as long as there is a key.
      await key(page).fill('key');
      await message(page).fill('');
      await expect(main.getByText('Key: 3 bytes', { exact: true })).toBeVisible();
      await expect(main.getByText(KEY_EMPTY_MESSAGE_SHA256, { exact: true })).toBeVisible();
    });

    test('checks a pasted signature in hex, Base64 and Base64URL, then clears', async ({ page }) => {
      await open(page);
      const main = page.getByRole('main');
      const expected = page.getByRole('textbox', { name: 'Expected signature' });
      const sha256 = JEFE_HMAC['SHA-256'];

      await expect(main.getByText('Compute an HMAC first, then paste a signature to compare.')).toBeVisible();

      await message(page).fill(JEFE_MESSAGE);
      await key(page).fill('Jefe');
      await expect(main.getByText('Paste a signature to compare it with the HMAC above.')).toBeVisible();

      await expected.fill(sha256);
      await expect(main.getByText('Match. The signature equals the HMAC (read as hex).')).toBeVisible();

      // One hex digit off.
      await expected.fill(`${sha256.slice(0, -1)}4`);
      await expect(main.getByText('Mismatch. The signature does not equal the HMAC.')).toBeVisible();
      await expect(main.getByText(/Decoded to/)).toHaveCount(0);

      // Upper case and grouped the way a terminal might print it.
      await expected.fill(sha256.toUpperCase().replace(/(.{8})/g, '$1 '));
      await expect(main.getByText('Match. The signature equals the HMAC (read as hex).')).toBeVisible();

      await expected.fill('W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM=');
      await expect(main.getByText('Match. The signature equals the HMAC (read as Base64).')).toBeVisible();

      // A SHA-1 signature against a SHA-256 HMAC: the size is the giveaway.
      await expected.fill(JEFE_HMAC['SHA-1']);
      await expect(main.getByText('Mismatch. The signature does not equal the HMAC.')).toBeVisible();
      await expect(main.getByText('Decoded to 20 bytes, but this HMAC is 32 bytes.')).toBeVisible();

      await expected.fill('not a signature!');
      await expect(main.getByText('Not valid hex, Base64 or Base64URL.')).toBeVisible();

      // The verdict follows the HMAC: the SHA-1 signature matches once SHA-1 is chosen.
      await expected.fill('7_zfauXrL6LSdBbV8YTfnCWafHk');
      await expect(main.getByText('Mismatch. The signature does not equal the HMAC.')).toBeVisible();
      await choose(page, 'Hash algorithm', 'HMAC-SHA-1');
      await expect(main.getByText('Match. The signature equals the HMAC (read as Base64URL).')).toBeVisible();
      await key(page).fill('Jefe!');
      await expect(main.getByText('Mismatch. The signature does not equal the HMAC.')).toBeVisible();

      await main.getByRole('button', { name: 'Clear' }).click();
      await expect(message(page)).toHaveValue('');
      await expect(key(page)).toHaveValue('');
      await expect(expected).toHaveValue('');
      await expect(main.getByText('Enter a message and a key to compute the HMAC.')).toBeVisible();
      await expect(main.getByText('Compute an HMAC first, then paste a signature to compare.')).toBeVisible();
      await expect(main.getByRole('button', { name: 'Clear' })).toBeDisabled();
    });

    test('describes a one-byte signature in the singular', async ({ page }) => {
      await open(page);
      const main = page.getByRole('main');
      await message(page).fill(JEFE_MESSAGE);
      await key(page).fill('Jefe');
      await page.getByRole('textbox', { name: 'Expected signature' }).fill('ab');
      await expect(main.getByText('Mismatch. The signature does not equal the HMAC.')).toBeVisible();
      await expect(main.getByText('Decoded to 1 byte, but this HMAC is 32 bytes.')).toBeVisible();
    });
  });

  // -------------------------------------------------------------------------
  // JWT Creator & Signer
  // -------------------------------------------------------------------------

  test.describe('JWT Creator & Signer', () => {
    const open = (page: Page) => openTool(page, 'jwt-signer', 'JWT Creator & Signer');
    const secret = (page: Page) => page.getByRole('textbox', { name: 'Secret', exact: true });
    const header = (page: Page) => page.getByRole('textbox', { name: 'Header JSON' });
    const payload = (page: Page) => page.getByRole('textbox', { name: 'Payload JSON' });
    const pasted = (page: Page) => page.getByRole('textbox', { name: 'Token to verify' });

    const INVALID_SIGNATURE =
      'The signature does not match this token and secret. Check the secret, its encoding, and that the token is unchanged.';

    test('signs the jwt.io sample token, HS384 and HS512, and with the RFC 7515 key', async ({ page }) => {
      await open(page);
      const main = page.getByRole('main');
      const copyToken = main.getByRole('button', { name: 'Copy token' });

      await expect(main.getByRole('status')).toHaveText('Enter a secret to sign the token.');
      await expect(copyToken).toBeDisabled();
      await expect(main.getByRole('button', { name: 'Use signed token' })).toBeDisabled();

      // The starting header and payload, under each algorithm. The header follows the menu.
      await secret(page).fill(JWT_IO_SECRET);
      await expect(main.getByText(STARTING_TOKENS.HS256, { exact: true })).toBeVisible();
      await expect(main.getByText('Key length: 19 bytes. RFC 7518 requires at least 32 for HS256.')).toBeVisible();
      await expect(main.getByRole('list', { name: 'Warnings' }).getByRole('listitem')).toHaveText([
        'Warning: The secret is 19 bytes. RFC 7518 requires at least 32 bytes for HS256.',
      ]);

      for (const [algorithm, minimum] of [
        ['HS384', 48],
        ['HS512', 64],
      ] as const) {
        await choose(page, 'Algorithm', algorithm);
        expect(JSON.parse(await header(page).inputValue())).toEqual({ alg: algorithm, typ: 'JWT' });
        await expect(main.getByText(STARTING_TOKENS[algorithm], { exact: true })).toBeVisible();
        await expect(main.getByRole('list', { name: 'Warnings' }).getByRole('listitem')).toHaveText([
          `Warning: The secret is 19 bytes. RFC 7518 requires at least ${minimum} bytes for ${algorithm}.`,
        ]);
      }

      // The jwt.io sample.
      await choose(page, 'Algorithm', 'HS256');
      await payload(page).fill(JWT_IO_PAYLOAD);
      await expect(main.getByText(JWT_IO_TOKEN, { exact: true })).toBeVisible();
      await expect(main.getByRole('listitem').filter({ hasText: 'Header' })).toContainText('36 chars');
      await expect(main.getByRole('listitem').filter({ hasText: 'Payload' })).toContainText('74 chars');
      await expect(main.getByRole('listitem').filter({ hasText: 'Signature' })).toContainText('43 chars');
      await expect(main.getByRole('definition')).toHaveText(['2018-01-18T01:30:22.000Z (UTC)']);

      await expectCopies(page, copyToken, JWT_IO_TOKEN);
      await expect(main.getByRole('button', { name: 'Copied' })).toBeVisible();

      // The RFC 7515 A.1 key, pasted as the Base64URL text the RFC prints, with
      // the RFC's header and payload. The tool signs the JSON without the line
      // breaks the RFC keeps, so the token is the compact form of the same
      // claims: member order kept, whitespace gone.
      await pickTab(page, 'Base64');
      await secret(page).fill(RFC7515_KEY);
      await expect(main.getByText('Key length: 64 bytes. RFC 7518 requires at least 32 for HS256.')).toBeVisible();
      await header(page).fill('{"typ":"JWT",\n "alg":"HS256"}');
      await payload(page).fill('{"iss":"joe",\n "exp":1300819380,\n "http://example.com/is_root":true}');

      const compactHeader = base64Url('{"typ":"JWT","alg":"HS256"}');
      const compactPayload = base64Url('{"iss":"joe","exp":1300819380,"http://example.com/is_root":true}');
      await expect(
        main.getByText(`${compactHeader}.${compactPayload}.lliDzOlRAdGUCfCHCPx_uisb6ZfZ1LRQa0OJLeYTTpY`, {
          exact: true,
        })
      ).toBeVisible();
      // 2011 is long gone, and a 64-byte key is long enough.
      await expect(main.getByRole('list', { name: 'Warnings' }).getByRole('listitem')).toHaveText([
        'Warning: "exp" is in the past, so verifiers will reject this token as expired.',
      ]);

      // A long token, on screen and in the verify box, still fits a phone.
      await main.getByRole('button', { name: 'Use signed token' }).click();
      await expect(main.getByText('Expired', { exact: true })).toBeVisible();
      await expectFitsPhone(page);
    });

    test('verifies the RFC 7515 A.1 token before and after it expires, and rejects bad tokens', async ({
      page,
    }) => {
      // Ten minutes before the token's exp.
      await page.clock.setFixedTime(new Date((RFC7515_EXP - 600) * 1000));
      await open(page);
      const main = page.getByRole('main');
      const verdict = (label: string) => main.getByText(label, { exact: true });

      await expect(main.getByText('Paste a token above to check its signature and expiry.')).toBeVisible();

      // No secret yet.
      await pasted(page).fill(RFC7515_TOKEN);
      await expect(verdict('Check the secret')).toBeVisible();
      await expect(main.getByText('Enter a secret.', { exact: true })).toBeVisible();

      await pickTab(page, 'Base64');
      await secret(page).fill(RFC7515_KEY);
      await expect(verdict('Valid')).toBeVisible();
      await expect(main.getByText('The signature is valid (HS256). It expires in 10 minutes.')).toBeVisible();

      // The same characters taken as text are a different key.
      await pickTab(page, 'UTF-8 text');
      await expect(verdict('Invalid signature')).toBeVisible();
      await expect(main.getByText(INVALID_SIGNATURE)).toBeVisible();
      await pickTab(page, 'Base64');
      await expect(verdict('Valid')).toBeVisible();

      // A token whose payload was edited after signing.
      const [headerSegment, , signatureSegment] = RFC7515_TOKEN.split('.');
      const forgedPayload = base64Url('{"iss":"mallory","exp":1300819380,"http://example.com/is_root":true}');
      await pasted(page).fill(`${headerSegment}.${forgedPayload}.${signatureSegment}`);
      await expect(verdict('Invalid signature')).toBeVisible();

      // An hour after exp. Pasting again makes the tool look at the clock again;
      // a leading "Bearer " is accepted.
      await page.clock.setFixedTime(new Date((RFC7515_EXP + 3600) * 1000));
      await pasted(page).fill(`Bearer ${RFC7515_TOKEN}`);
      await expect(verdict('Expired')).toBeVisible();
      await expect(
        main.getByText('The signature is valid, but the token expired 1 hour ago (2011-03-22T18:43:00.000Z).')
      ).toBeVisible();

      // Not a JWT at all.
      await pasted(page).fill('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0');
      await expect(verdict('Malformed token')).toBeVisible();
      await expect(main.getByText('A JWT has 3 parts separated by dots, but this has 2.')).toBeVisible();

      // {"alg":"none"} must never verify.
      await pasted(page).fill(`${base64Url('{"alg":"none"}')}.${base64Url('{"sub":"1"}')}.`);
      await expect(verdict('Unsupported algorithm')).toBeVisible();
      await expect(
        main.getByText('The algorithm "none" is not supported here. This tool checks HS256, HS384 and HS512 only.')
      ).toBeVisible();

      await main.getByRole('button', { name: 'Clear' }).click();
      await expect(pasted(page)).toHaveValue('');
      await expect(main.getByText('Paste a token above to check its signature and expiry.')).toBeVisible();
    });

    test('names the broken field instead of signing', async ({ page }) => {
      await open(page);
      const main = page.getByRole('main');
      const status = main.getByRole('status');
      const copyToken = main.getByRole('button', { name: 'Copy token' });

      await secret(page).fill('s3cret');
      await expect(copyToken).toBeEnabled();

      // Header: broken JSON, the wrong alg, no alg.
      await header(page).fill('{"alg":"HS256"');
      await expect(status).toHaveText('Fix the header JSON to create a token.');
      await expect(header(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(header(page)).toHaveAccessibleDescription(/^Invalid JSON: /);
      await expect(copyToken).toBeDisabled();
      await expect(main.getByRole('button', { name: 'Use signed token' })).toBeDisabled();

      await header(page).fill('{"alg":"HS512","typ":"JWT"}');
      await expect(header(page)).toHaveAccessibleDescription(
        'The header says alg "HS512" but HS256 is selected. Change the algorithm menu or the header.'
      );
      await expect(status).toHaveText('Fix the header JSON to create a token.');

      await header(page).fill('{"typ":"JWT"}');
      await expect(header(page)).toHaveAccessibleDescription(
        'The header needs "alg": "HS256" to match the selected algorithm.'
      );

      await header(page).fill('{"alg":"HS256","typ":"JWT"}');
      await expect(header(page)).toHaveAttribute('aria-invalid', 'false');
      await expect(copyToken).toBeEnabled();

      // Payload: valid JSON that is not an object, then nothing at all.
      await payload(page).fill('[1, 2]');
      await expect(status).toHaveText('Fix the payload JSON to create a token.');
      await expect(payload(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(payload(page)).toHaveAccessibleDescription('Must be a JSON object, like {"key": "value"}.');
      await expect(main.getByText('Fix the payload JSON to use these buttons.')).toBeVisible();
      for (const name of ['Set iat (now)', 'Set nbf (now)', 'Set jti (random)', 'Set exp (now + duration)']) {
        await expect(main.getByRole('button', { name })).toBeDisabled();
      }

      await payload(page).fill('');
      await expect(payload(page)).toHaveAccessibleDescription('Enter a JSON object.');

      await payload(page).fill('{"sub":"a"}');
      await expect(payload(page)).toHaveAttribute('aria-invalid', 'false');
      await expect(main.getByRole('button', { name: 'Set iat (now)' })).toBeEnabled();
      await expect(copyToken).toBeEnabled();

      // Secret: text that is not Base64 while Base64 is chosen, then no secret.
      await pickTab(page, 'Base64');
      await secret(page).fill('not base64!!');
      await expect(status).toHaveText('The secret is not valid Base64.');
      await expect(secret(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(secret(page)).toHaveAccessibleDescription('The secret is not valid Base64.');
      await expect(copyToken).toBeDisabled();

      await secret(page).fill('');
      await expect(status).toHaveText('Enter a secret to sign the token.');
      await expect(secret(page)).toHaveAttribute('aria-invalid', 'false');
    });

    test('quick claims follow the clock, the signed token verifies, and reset restores the start', async ({
      page,
    }) => {
      const NOW = 1768478400; // 2026-01-15T12:00:00Z
      await page.clock.setFixedTime(new Date(NOW * 1000));
      await open(page);
      const main = page.getByRole('main');

      await secret(page).fill('quick-claims-secret');
      await main.getByRole('button', { name: 'Set iat (now)' }).click();
      await main.getByRole('button', { name: 'Set nbf (now)' }).click();
      await expect(page.getByRole('combobox', { name: 'Expiry duration' })).toHaveText('1 hour');
      await choose(page, 'Expiry duration', '5 minutes');
      await main.getByRole('button', { name: 'Set exp (now + duration)' }).click();
      await main.getByRole('button', { name: 'Set jti (random)' }).click();

      const claims = {
        sub: '1234567890',
        name: 'Test User',
        iat: NOW,
        nbf: NOW,
        exp: NOW + 300,
        jti: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      };
      await expect.poll(async () => JSON.parse(await payload(page).inputValue())).toEqual(claims);
      await expect(main.getByRole('term')).toHaveText(['iat', 'nbf', 'exp']);
      await expect(main.getByRole('definition')).toHaveText([
        '2026-01-15T12:00:00.000Z (UTC)',
        '2026-01-15T12:00:00.000Z (UTC)',
        '2026-01-15T12:05:00.000Z (UTC)',
      ]);

      // The token on screen is the one that is copied, it carries exactly the
      // claims in the editor, and its signature is HMAC-SHA-256 of the first
      // two segments (checked here with Node's crypto).
      const copyToken = main.getByRole('button', { name: 'Copy token' });
      await copyToken.click();
      await expect(main.getByRole('button', { name: 'Copied' })).toBeVisible();
      const token = await readClipboard(page);
      await expect(main.getByText(token, { exact: true })).toBeVisible();

      const segments = token.split('.');
      expect(segments).toHaveLength(3);
      expect(fromBase64Url(segments[0])).toBe('{"alg":"HS256","typ":"JWT"}');
      expect(fromBase64Url(segments[1])).toBe(JSON.stringify(JSON.parse(await payload(page).inputValue())));
      expect(segments[2]).toBe(
        createHmac('sha256', 'quick-claims-secret').update(`${segments[0]}.${segments[1]}`).digest('base64url')
      );

      await main.getByRole('button', { name: 'Use signed token' }).click();
      await expect(pasted(page)).toHaveValue(token);
      await expect(main.getByText('Valid', { exact: true })).toBeVisible();
      await expect(main.getByText('The signature is valid (HS256). It expires in 5 minutes.')).toBeVisible();

      // A random secret is 32 bytes of Base64 for HS256, and the token signed
      // with the old secret no longer verifies.
      await main.getByRole('button', { name: 'Generate random secret' }).click();
      await expect(secret(page)).toHaveValue(/^[A-Za-z0-9+/]{43}=$/);
      await expect(page.getByRole('tab', { name: 'Base64', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(main.getByText('Key length: 32 bytes. RFC 7518 requires at least 32 for HS256.')).toBeVisible();
      await expect(main.getByText('Invalid signature', { exact: true })).toBeVisible();

      await main.getByRole('button', { name: 'Reset all' }).click();
      await expect(secret(page)).toHaveValue('');
      await expect(page.getByRole('tab', { name: 'UTF-8 text', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(JSON.parse(await payload(page).inputValue())).toEqual({ sub: '1234567890', name: 'Test User' });
      expect(JSON.parse(await header(page).inputValue())).toEqual({ alg: 'HS256', typ: 'JWT' });
      await expect(page.getByRole('combobox', { name: 'Expiry duration' })).toHaveText('1 hour');
      await expect(pasted(page)).toHaveValue('');
      await expect(main.getByRole('status')).toHaveText('Enter a secret to sign the token.');
      await expect(main.getByText('Paste a token above to check its signature and expiry.')).toBeVisible();
      await expect(main.getByRole('definition')).toHaveCount(0);
    });

    test('a quick claim leaves the other claims exactly as typed', async ({ page }) => {
      await page.clock.setFixedTime(new Date(1768478400 * 1000));
      await open(page);
      const main = page.getByRole('main');

      await secret(page).fill('s3cret');
      await payload(page).fill('{"order_id": 12345678901234567890}');
      // Signing alone keeps the number: the token carries it digit for digit.
      await expect(
        main.getByText(new RegExp(`\\.${base64Url('{"order_id":12345678901234567890}')}\\.`))
      ).toBeVisible();

      await main.getByRole('button', { name: 'Set iat (now)' }).click();
      await expect(payload(page)).toHaveValue(/"iat": 1768478400/);
      await expect(payload(page)).toHaveValue(/12345678901234567890/);
    });

    test('a token that expires while it is on screen stops being reported as valid', async ({ page }) => {
      await page.clock.setFixedTime(new Date((RFC7515_EXP - 600) * 1000));
      await open(page);
      const main = page.getByRole('main');

      await pickTab(page, 'Base64');
      await secret(page).fill(RFC7515_KEY);
      await pasted(page).fill(RFC7515_TOKEN);
      await expect(main.getByText('Valid', { exact: true })).toBeVisible();
      await expect(main.getByText('The signature is valid (HS256). It expires in 10 minutes.')).toBeVisible();

      // Nothing is edited; only the device clock moves past exp.
      await page.clock.setFixedTime(new Date((RFC7515_EXP + 3600) * 1000));
      await expect(main.getByText('Expired', { exact: true })).toBeVisible();
      await expect(main.getByText('Valid', { exact: true })).toHaveCount(0);
    });
  });

  // -------------------------------------------------------------------------
  // TOTP Code Generator
  // -------------------------------------------------------------------------

  test.describe('TOTP Code Generator', () => {
    const open = (page: Page) => openTool(page, 'totp-generator', 'TOTP Code Generator');
    const secret = (page: Page) => page.getByRole('textbox', { name: 'Base32 secret' });

    /** "287082" as the page shows it: "287 082", or "0708 1804" for eight digits. */
    const spaced = (code: string) => `${code.slice(0, code.length / 2)} ${code.slice(code.length / 2)}`;

    /**
     * Checks the codes on screen and which slot each one is in. The slots are
     * told apart by their copy buttons, which copy the code without the space.
     */
    async function expectCodes(page: Page, codes: { previous?: string | null; current: string; next?: string }) {
      const main = page.getByRole('main');
      await expect(main.getByText(spaced(codes.current), { exact: true })).toBeVisible();
      await expectCopies(page, main.getByRole('button', { name: 'Copy current code' }), codes.current);
      if (codes.next !== undefined) {
        await expect(main.getByText(spaced(codes.next), { exact: true })).toBeVisible();
        await expectCopies(page, main.getByRole('button', { name: 'Copy next code' }), codes.next);
      }
      if (codes.previous === null) {
        await expect(main.getByRole('button', { name: 'Copy previous code' })).toBeDisabled();
      } else if (codes.previous !== undefined) {
        await expect(main.getByText(spaced(codes.previous), { exact: true })).toBeVisible();
        await expectCopies(page, main.getByRole('button', { name: 'Copy previous code' }), codes.previous);
      }
    }

    /**
     * How many modules of the QR picture on the page differ from the QR code
     * of `text`. The picture is read back pixel by pixel; the symbol's edges
     * are found from its own dark pixels (the three finder patterns reach the
     * corners), so nothing is assumed about the margin or the scale.
     */
    async function qrDifferences(page: Page, text: string): Promise<number> {
      const picture = await page
        .getByRole('img', { name: 'QR code for the otpauth link' })
        .evaluate(async (node) => {
          const image = node as HTMLImageElement;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('No 2D canvas');
          context.drawImage(image, 0, 0);
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
          let dark = '';
          for (let i = 0; i < data.length; i += 4) dark += data[i] < 128 ? '1' : '0';
          return { width: canvas.width, height: canvas.height, dark };
        });

      const isDark = (x: number, y: number) => picture.dark[y * picture.width + x] === '1';
      let left = picture.width;
      let right = -1;
      let top = picture.height;
      let bottom = -1;
      for (let y = 0; y < picture.height; y++) {
        for (let x = 0; x < picture.width; x++) {
          if (!isDark(x, y)) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
      if (right < 0) return Number.POSITIVE_INFINITY;

      // The error-correction level is the tool's choice; any of the four is a
      // QR code of the text, so the best match counts.
      let fewest = Number.POSITIVE_INFINITY;
      for (const errorCorrectionLevel of ['L', 'M', 'Q', 'H'] as const) {
        const { modules } = QRCode.create(text, { errorCorrectionLevel });
        const stepX = (right - left + 1) / modules.size;
        const stepY = (bottom - top + 1) / modules.size;
        let differences = 0;
        for (let row = 0; row < modules.size; row++) {
          for (let column = 0; column < modules.size; column++) {
            const x = Math.floor(left + (column + 0.5) * stepX);
            const y = Math.floor(top + (row + 0.5) * stepY);
            if (isDark(x, y) !== Boolean(modules.get(row, column))) differences += 1;
          }
        }
        fewest = Math.min(fewest, differences);
      }
      return fewest;
    }

    test('shows the RFC 4226 codes for the RFC seed and moves on when the window ends', async ({ page }) => {
      // Five seconds after the epoch: the very first 30 second window (counter 0).
      await page.clock.setFixedTime(new Date(5_000));
      await open(page);
      const main = page.getByRole('main');
      const countdown = main.getByRole('progressbar', { name: 'Time until the code changes' });

      await expect(main.getByText('Enter a Base32 secret or generate a random one to see codes.')).toBeVisible();
      await expect(main.getByText('Enter a secret to build the link and QR code.')).toBeVisible();
      await expect(main.getByRole('button', { name: 'Copy secret' })).toBeDisabled();

      await secret(page).fill(TOTP_SEED_SHA1);
      await expect(main.getByText('Changes in 25 seconds', { exact: true })).toBeVisible();
      await expect(countdown).toHaveAttribute('aria-valuenow', '25');
      await expect(countdown).toHaveAttribute('aria-valuemax', '30');
      // RFC 4226 appendix D, counters 0 and 1. Nothing comes before counter 0.
      await expectCodes(page, { previous: null, current: '755224', next: '287082' });
      // A 160-bit secret gets no weak-secret note.
      await expect(main.getByText(/This secret is only/)).toHaveCount(0);

      // 59 seconds: the last second of counter 1 (RFC 6238 lists 94287082 here, in eight digits).
      await page.clock.setFixedTime(new Date(59_000));
      await expect(main.getByText('Changes in 1 second', { exact: true })).toBeVisible();
      await expect(countdown).toHaveAttribute('aria-valuenow', '1');
      await expectCodes(page, { previous: '755224', current: '287082', next: '359152' });

      // One second later the next code has taken over, without touching the page.
      await page.clock.setFixedTime(new Date(60_000));
      await expect(main.getByText('Changes in 30 seconds', { exact: true })).toBeVisible();
      await expect(main.getByText('969 429', { exact: true })).toBeVisible();
      await expectCodes(page, { previous: '287082', current: '359152', next: '969429' });
    });

    test('matches the RFC 6238 table for SHA-1, SHA-256 and SHA-512, and honours a 60 second period', async ({
      page,
    }) => {
      // 2005-03-18T01:58:29Z, a row of the RFC table and the last second of its window.
      await page.clock.setFixedTime(new Date(1111111109 * 1000));
      await open(page);
      const main = page.getByRole('main');

      await secret(page).fill(TOTP_SEED_SHA1);
      await choose(page, 'Code length', '8 digits');
      await expect(
        main.getByText(/Many authenticator apps, including Google Authenticator, ignore these settings/)
      ).toBeVisible();
      // The RFC's next row, 1111111111, is the following window.
      await expectCodes(page, { current: '07081804', next: '14050471' });
      await expect(main.getByText('Changes in 1 second', { exact: true })).toBeVisible();

      // SHA-256 with its 32-byte seed, pasted with the "=" padding Base32 gives it.
      await secret(page).fill(TOTP_SEED_SHA256);
      await choose(page, 'Algorithm', 'SHA-256');
      await expectCodes(page, { current: '68084774', next: '67062674' });

      // SHA-512 with its 64-byte seed.
      await secret(page).fill(TOTP_SEED_SHA512);
      await choose(page, 'Algorithm', 'SHA-512');
      await expectCodes(page, { current: '25091201', next: '99943326' });

      // Two seconds on, in the next window.
      await page.clock.setFixedTime(new Date(1111111111 * 1000));
      await expect(main.getByText('Changes in 29 seconds', { exact: true })).toBeVisible();
      await expectCodes(page, { previous: '25091201', current: '99943326' });

      // A 60 second period halves the counter: at 2222222219 it is 37037036,
      // the counter the RFC's 1111111109 row has with 30 second steps, so the
      // same two SHA-1 codes are due. The seed is typed the way people paste
      // secrets: lower case, in groups, with a hyphen.
      await secret(page).fill('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq');
      await choose(page, 'Algorithm', 'SHA-1 (most apps)');
      await choose(page, 'Period', '60 seconds');
      await page.clock.setFixedTime(new Date(2222222219 * 1000));
      await expect(main.getByText('Changes in 1 second', { exact: true })).toBeVisible();
      await expect(main.getByText('The code refreshes by itself when its 60 second window ends.')).toBeVisible();
      await expect(main.getByRole('progressbar', { name: 'Time until the code changes' })).toHaveAttribute(
        'aria-valuemax',
        '60'
      );
      await expectCodes(page, { current: '07081804', next: '14050471' });
    });

    test('builds an otpauth link and a QR code that encodes it', async ({ page }) => {
      await page.clock.setFixedTime(new Date(1111111109 * 1000));
      await open(page);
      const main = page.getByRole('main');
      const qr = main.getByRole('img', { name: 'QR code for the otpauth link' });
      const copyLink = main.getByRole('button', { name: 'Copy otpauth link' });

      // The placeholder secret, typed as the placeholder shows it. It decodes
      // to ten bytes, which is short enough for the weak-secret note.
      await secret(page).fill('jbsw y3dp ehpk 3pxp');
      await expect(
        main.getByText(
          'This secret is only 80 bits. RFC 4226 asks for at least 128 bits, and 160 bits is the usual size. Fine for testing, weak for real use.'
        )
      ).toBeVisible();

      const bareLink = 'otpauth://totp/Account?secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30';
      await expect(main.getByText(bareLink, { exact: true })).toBeVisible();
      await expect(qr).toBeVisible();
      await expect.poll(() => qrDifferences(page, bareLink)).toBe(0);
      // The comparison can tell two links apart.
      expect(await qrDifferences(page, bareLink.replace('JBSW', 'KBSW'))).toBeGreaterThan(0);

      await page.getByRole('textbox', { name: 'Issuer (optional)' }).fill('Example Inc');
      await page.getByRole('textbox', { name: 'Account (optional)' }).fill('alice@example.com');
      await expect(main.getByText(/^otpauth:\/\/totp\/Example%20Inc:alice/)).toBeVisible();

      await copyLink.click();
      await expect.poll(() => readClipboard(page)).toContain('issuer=');
      const link = await readClipboard(page);
      await expect(main.getByText(link, { exact: true })).toBeVisible();

      // Google's Key URI Format: otpauth://totp/Issuer:account?secret=...&issuer=...
      const parsed = new URL(link);
      expect(parsed.protocol).toBe('otpauth:');
      expect(parsed.host).toBe('totp');
      expect(decodeURIComponent(parsed.pathname)).toBe('/Example Inc:alice@example.com');
      expect(Object.fromEntries(parsed.searchParams)).toEqual({
        secret: 'JBSWY3DPEHPK3PXP',
        issuer: 'Example Inc',
        algorithm: 'SHA1',
        digits: '6',
        period: '30',
      });

      // The picture is redrawn for the new link.
      await expect.poll(() => qrDifferences(page, link)).toBe(0);
      expect(await qrDifferences(page, bareLink)).toBeGreaterThan(0);

      // The options travel in the link too.
      await choose(page, 'Algorithm', 'SHA-512');
      await choose(page, 'Code length', '8 digits');
      await choose(page, 'Period', '60 seconds');
      await expect(main.getByText(/&algorithm=SHA512&digits=8&period=60$/)).toBeVisible();

      // The link, the QR picture and an eight digit code still fit a phone.
      await expect(main.getByText(/^\d{4} \d{4}$/)).toHaveCount(3);
      await expectFitsPhone(page);
    });

    test('explains a bad secret, generates a random one, and clears', async ({ page }) => {
      await page.clock.setFixedTime(new Date(1111111109 * 1000));
      await open(page);
      const main = page.getByRole('main');
      const secretError = main.getByRole('alert');

      // 0, 1, 8 and 9 are not Base32 digits.
      await secret(page).fill('JBSWY3DPEHPK3PX1');
      await expect(secretError).toHaveText(
        '"1" is not a Base32 character. Base32 uses the letters A-Z and the digits 2-7.'
      );
      await expect(secret(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(secret(page)).toHaveAccessibleDescription(
        '"1" is not a Base32 character. Base32 uses the letters A-Z and the digits 2-7.'
      );
      await expect(main.getByText('Fix the secret above to see codes.')).toBeVisible();
      await expect(main.getByText('Fix the secret above to build the link.')).toBeVisible();
      await expect(main.getByRole('button', { name: 'Copy current code' })).toHaveCount(0);
      await expect(main.getByRole('img', { name: 'QR code for the otpauth link' })).toHaveCount(0);

      // Three characters cannot be whole bytes.
      await secret(page).fill('ABC');
      await expect(secretError).toHaveText(
        '3 characters are not a valid Base32 length. Check for missing or extra characters.'
      );

      await secret(page).fill('GEZD=GNB');
      await expect(secretError).toHaveText('Padding "=" is only allowed at the end of a Base32 secret.');

      // Only spaces is the same as nothing: no error, the empty state.
      await secret(page).fill('   ');
      await expect(secretError).toHaveCount(0);
      await expect(main.getByText('Enter a Base32 secret or generate a random one to see codes.')).toBeVisible();
      await expect(main.getByRole('button', { name: 'Copy secret' })).toBeDisabled();

      // A random secret is 20 bytes: 32 Base32 characters, new each time.
      await main.getByRole('button', { name: 'Generate random secret' }).click();
      await expect(secret(page)).toHaveValue(/^[A-Z2-7]{32}$/);
      const first = await secret(page).inputValue();
      await expect(
        main.getByText(`otpauth://totp/Account?secret=${first}&algorithm=SHA1&digits=6&period=30`, { exact: true })
      ).toBeVisible();
      await expect(main.getByText(/^\d{3} \d{3}$/)).toHaveCount(3);
      await expect(main.getByText(/This secret is only/)).toHaveCount(0);

      await main.getByRole('button', { name: 'Generate random secret' }).click();
      await expect(secret(page)).not.toHaveValue(first);
      const second = await secret(page).inputValue();
      expect(second).toMatch(/^[A-Z2-7]{32}$/);

      await expectCopies(page, main.getByRole('button', { name: 'Copy secret' }), second);
      await expect(main.getByRole('button', { name: 'Copied' })).toBeVisible();

      // Clear empties the fields and puts the options back.
      await choose(page, 'Period', '60 seconds');
      await choose(page, 'Code length', '8 digits');
      await page.getByRole('textbox', { name: 'Issuer (optional)' }).fill('Example Inc');
      await main.getByRole('button', { name: 'Clear' }).click();
      await expect(secret(page)).toHaveValue('');
      await expect(page.getByRole('textbox', { name: 'Issuer (optional)' })).toHaveValue('');
      await expect(page.getByRole('combobox', { name: 'Period' })).toHaveText('30 seconds');
      await expect(page.getByRole('combobox', { name: 'Code length' })).toHaveText('6 digits');
      await expect(main.getByText('Enter a Base32 secret or generate a random one to see codes.')).toBeVisible();
      await expect(main.getByText('Enter a secret to build the link and QR code.')).toBeVisible();
    });
  });
});
