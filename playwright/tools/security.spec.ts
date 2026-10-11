import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  constants,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  pbkdf2Sync,
  privateDecrypt,
  publicEncrypt,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';

// End-to-end flows of the security tools: Hash Generator, Password Hasher,
// AES Encryption, RSA Key Pair Generator, Certificate Decoder and Password
// Generator. Expected values come from outside the tools: published test
// vectors, Node's own crypto module, and OpenSSL for the certificates.

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openTool(page: Page, slug: string, name: string) {
  // The export is static HTML that React takes over once its scripts have
  // loaded. Anything typed before that is lost, so wait for the network to
  // go quiet rather than for the markup alone.
  await page.goto(`/tools/${slug}/`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

async function allowClipboard(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
}

const clipboardText = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** Presses a copy button and returns what it put on the clipboard. */
async function copyWith(page: Page, button: Locator): Promise<string> {
  const nothingYet = '<nothing copied yet>';
  await page.evaluate((text) => navigator.clipboard.writeText(text), nothingYet);
  await button.click();
  await expect.poll(() => clipboardText(page)).not.toBe(nothingYet);
  // The Windows clipboard hands multi-line text back with CRLF line ends.
  return (await clipboardText(page)).replace(/\r\n/g, '\n');
}

/** Picks an option of one of the app's select menus. */
async function choose(page: Page, select: string, option: string) {
  await page.getByRole('combobox', { name: select, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Saves the file a button downloads and returns its name and text. */
async function downloadWith(page: Page, button: Locator): Promise<{ name: string; text: string }> {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return { name: download.suggestedFilename(), text: await readFile(await download.path(), 'utf8') };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HASH_ALGORITHMS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;

/** Digests of the UTF-8 text "hello world". */
const HELLO_WORLD: Record<(typeof HASH_ALGORITHMS)[number], string> = {
  MD5: '5eb63bbbe01eeed093cb22bb8f5acdc3',
  'SHA-1': '2aae6c35c94fcfb415dbe95f408b9ce91ee846ed',
  'SHA-256': 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
  'SHA-384':
    'fdbd8e75a67f29f701a4e040385e2e23986303ea10239211af907fcbb83578b3e417cb71ce646efd0819dd8c088de1bd',
  'SHA-512':
    '309ecc489c12d6eb4cc40f50c902f2b4d0ed77ee511a7c7a9bcd3ca86d4cd86f989dd35bc5ff499670da34255b45b0cfd830e81f605dcf7dc5542e93ae9cd76f',
};

/** Digests of the 256 bytes 0x00..0xFF: a file that is not valid text in any encoding. */
const ALL_BYTES: Record<(typeof HASH_ALGORITHMS)[number], string> = {
  MD5: 'e2c865db4162bed963bfaa9ef6ac18f0',
  'SHA-1': '4916d6bdb7f78e6803698cab32d1586ea457dfc8',
  'SHA-256': '40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880',
  'SHA-384':
    'ffdaebff65ed05cf400f0221c4ccfb4b2104fb6a51f87e40be6c4309386bfdec2892e9179b34632331a59592737db5c5',
  'SHA-512':
    '1e7b80bc8edc552c8feeb2780e111477e5bc70465fac1a77b29b35980c3f0ce4a036a6c9462036824bd56801e62af7e9feba5c22ed8a5af877bf7de117dcac6d',
};

/** The MD5 test suite of RFC 1321, appendix A.5. */
const RFC_1321: [text: string, md5: string][] = [
  ['a', '0cc175b9c0f1b6a831c399e269772661'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'],
  ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
  ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
  [
    '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
    '57edf4a22be3c955ac49da2e2107b67a',
  ],
];

/**
 * Password hashes that other implementations published: the Bcrypt one is from
 * the OpenBSD / John the Ripper test set, the Argon2 ones from the reference
 * implementation (its README and its test suite).
 */
const PUBLISHED_HASHES = [
  {
    password: 'U*U',
    hash: '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW',
    scheme: 'Bcrypt',
  },
  {
    password: 'password',
    hash: '$argon2i$v=19$m=65536,t=2,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG',
    scheme: 'Argon2 (argon2i)',
  },
  {
    password: 'password',
    hash: '$argon2id$v=19$m=65536,t=2,p=1$c29tZXNhbHQ$CTFhFdXPJO1aFaMaO6Mm5c8y7cJHAph8ArZWb2GRPPc',
    scheme: 'Argon2 (argon2id)',
  },
];

/**
 * "Grüße aus Köln — meet at 09:30 ☕" encrypted under the password below with
 * Node's crypto module: PBKDF2-SHA-256 (100,000 rounds) and AES-256-GCM, laid
 * out as salt (16 bytes) | IV (12 bytes) | ciphertext | tag, in Base64.
 */
const AES_PASSWORD = 'correct horse battery staple';
const AES_PLAINTEXT = 'Grüße aus Köln — meet at 09:30 ☕';
const AES_CIPHERTEXT =
  'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaG3DBMEqqJnPU9p88X3ag712QCi8PtQmJ9xC3nzF18IMPKEs+N5bV6eoRpKUkeT+p6ipTCVzBef4=';

/** Decrypts what the AES tool produced, without any of the tool's code. */
function decryptOutsideTheTool(base64: string, password: string): string {
  const data = Buffer.from(base64, 'base64');
  const key = pbkdf2Sync(password, data.subarray(0, 16), 100_000, 32, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(16, 28));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(28, data.length - 16)), decipher.final()]).toString('utf8');
}

// The certificates were made with OpenSSL 3.5 for this spec; every expected
// value below is what `openssl x509 -text -fingerprint` prints for them.

/** RSA 2048, self-signed, valid from 2024 to 2099, serial 0xA1B2C3D4E5F607. 1155 bytes of DER. */
const RSA_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIEfzCCA2egAwIBAgIIAKGyw9Tl9gcwDQYJKoZIhvcNAQELBQAwgY0xCzAJBgNV
BAYTAlVTMRMwEQYDVQQIDApDYWxpZm9ybmlhMRYwFAYDVQQHDA1TYW4gRnJhbmNp
c2NvMRQwEgYDVQQKDAtFeGFtcGxlIE9yZzERMA8GA1UECwwIUGxhdGZvcm0xETAP
BgNVBAsMCFNlY3VyaXR5MRUwEwYDVQQDDAxleGFtcGxlLnRlc3QwIBcNMjQwMTAx
MDAwMDAwWhgPMjA5OTEyMzEyMzU5NTlaMIGNMQswCQYDVQQGEwJVUzETMBEGA1UE
CAwKQ2FsaWZvcm5pYTEWMBQGA1UEBwwNU2FuIEZyYW5jaXNjbzEUMBIGA1UECgwL
RXhhbXBsZSBPcmcxETAPBgNVBAsMCFBsYXRmb3JtMREwDwYDVQQLDAhTZWN1cml0
eTEVMBMGA1UEAwwMZXhhbXBsZS50ZXN0MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A
MIIBCgKCAQEAt9+o80KbYZPa2rSndY4Y3H1XZ7FXUBRyqL8G7IC18Pqrf7lMvm7J
CnbX1G9yYhtqdIsXtPJ4YUePFz9AoXwwWiRUqNmPOBITP3cMLaqqgKXWeEBAKzgx
ZwPdjFfmTSfyWrsT2NUZAbTUettaXRQ0nZ8lf2HZi0Mn1z+8bxnD4iLDb1VBmb4N
+11CyEwkbEpc4bLRSjwSMXqwU/uqBV6uVGM3Dg92q0D6xt7I4QB87mY0wtXUi0z8
tm7HjdOR5x8wzoPAMWJRH4RGRxabF8Ksg4WJviTPvkmHRjGvMFVkhuSoMxZ+nXgW
kk7EVTMn58h7sY32+SDZuRg5vf8L/Wn0vwIDAQABo4HeMIHbMB0GA1UdDgQWBBSn
WIQuhFwXz/013unpDy+sYm8NFzAfBgNVHSMEGDAWgBSnWIQuhFwXz/013unpDy+s
Ym8NFzBcBgNVHREEVTBTggxleGFtcGxlLnRlc3SCEHd3dy5leGFtcGxlLnRlc3SH
BMAAAgqBEmFkbWluQGV4YW1wbGUudGVzdIYXaHR0cHM6Ly9leGFtcGxlLnRlc3Qv
aWQwDgYDVR0PAQH/BAQDAgWgMB0GA1UdJQQWMBQGCCsGAQUFBwMBBggrBgEFBQcD
AjAMBgNVHRMBAf8EAjAAMA0GCSqGSIb3DQEBCwUAA4IBAQAC2HKzYBT0PdDEqUEE
UshwVg5RIF7FBnBAoARXK4EBRQwV2euGGqfM90jQXnUzd+XLmyHUKEQxbvO5erWa
2c9iFGZOR2PLzuzqZasOjSeEHMX9k05M+r+RtQbHIClSTNigWpAA1M8p/50epwN5
SN2Fpof368ZFfNfKhFcNzKqTR1YuJJu7hUYJXbqZ6Wtd6IGy1t6Oq5Ki+/QQjhk3
C6U/y5ZEmUZ5OB8KbR7wNH1oANIX8B2htKXw3bq9B3G6w6iorjXSdrEeWAihauEv
DnoJs3Rh1PjYiwi9eHL5wbdOQ+5kaACwfJHRtdXqYPRcwBEuX4yXuntWMhZ9Bfhg
JhKk
-----END CERTIFICATE-----
`;
const RSA_CERTIFICATE_SHA1 = 'C9:EF:B0:6D:D1:18:5C:72:F3:DB:59:8B:BA:CE:F1:F7:C0:22:2F:CA';
const RSA_CERTIFICATE_SHA256 =
  'DB:5D:26:EB:79:79:93:05:CE:2A:88:49:48:DD:E8:40:58:B9:5E:4F:08:83:1B:95:EB:FE:EE:83:50:DE:FA:EE';

/** EC P-256 leaf issued by the root below, valid only during 2020: expired. */
const EXPIRED_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIC9TCCAlagAwIBAgIFAQIDBAUwCgYIKoZIzj0EAwIwYDEUMBIGCgmSJomT8ixk
ARkWBHRlc3QxFzAVBgoJkiaJk/IsZAEZFgdleGFtcGxlMRYwFAYDVQQKDA1FeGFt
cGxlIFRydXN0MRcwFQYDVQQDDA5GdXR1cmUgUm9vdCBDQTAeFw0yMDAxMDEwMDAw
MDBaFw0yMTAxMDExMjAwMDBaMEMxCzAJBgNVBAYTAkRFMRUwEwYDVQQKDAxNw7xs
bGVyIEdtYkgxHTAbBgNVBAMMFGV4cGlyZWQuZXhhbXBsZS50ZXN0MFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAECUqZPDxzzp5bRmWXUwhlvDL7leNhMKBNLX2hZqDC
hxciBpHHbyfVfQ71agaYG8XgFMVbYenwfnd9inGLbFSRW6OCARgwggEUMAkGA1Ud
EwQCMAAwHQYDVR0OBBYEFNT3MsDDsc69vCT9bwz+9RyEqenhMB8GA1UdIwQYMBaA
FGiuH9jD7jgp4dyJh2HFtqzqkxpnMGEGCCsGAQUFBwEBBFUwUzAkBggrBgEFBQcw
AYYYaHR0cDovL29jc3AuZXhhbXBsZS50ZXN0MCsGCCsGAQUFBzAChh9odHRwOi8v
Y2EuZXhhbXBsZS50ZXN0L3Jvb3QuY3J0MDEGA1UdHwQqMCgwJqAkoCKGIGh0dHA6
Ly9jcmwuZXhhbXBsZS50ZXN0L3Jvb3QuY3JsMDEGA1UdEQQqMCiCFGV4cGlyZWQu
ZXhhbXBsZS50ZXN0hxAgAQ24AAAAAAAAAAAAAAABMAoGCCqGSM49BAMCA4GMADCB
iAJCALNC6ON6wkksWBNHicWvzc2Dv8PcaNqqC1aRqxrf4vRFUpLMMFzjgXabw7t5
dW8r1aVSFp8fucwNLvYoqLCRQyzIAkIA5bBv5aL7ljx9deAw1/BXcIDInZLARIfI
92i7dMg8mRJTfeJiyXIDqkeCun+wACeS1AJuy5udH75AmlJEhx80g/8=
-----END CERTIFICATE-----
`;
const EXPIRED_CERTIFICATE_SHA1 = '31:2B:2B:F9:7F:41:20:5D:5E:04:56:C0:A9:BF:4E:05:A1:64:7E:A9';
const EXPIRED_CERTIFICATE_SHA256 =
  'ED:EA:DA:B0:D7:55:2D:58:74:27:59:25:AE:0E:82:1E:A1:D8:41:31:AB:6B:77:B6:83:A8:5D:BE:54:D3:3A:22';

/** EC P-521 self-signed CA, valid from 2090 to 2095: not valid yet. */
const FUTURE_ROOT_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIICoTCCAgKgAwIBAgIBfzAKBggqhkjOPQQDBDBgMRQwEgYKCZImiZPyLGQBGRYE
dGVzdDEXMBUGCgmSJomT8ixkARkWB2V4YW1wbGUxFjAUBgNVBAoMDUV4YW1wbGUg
VHJ1c3QxFzAVBgNVBAMMDkZ1dHVyZSBSb290IENBMCIYDzIwOTAwMTAxMDAwMDAw
WhgPMjA5NTAxMDEwMDAwMDBaMGAxFDASBgoJkiaJk/IsZAEZFgR0ZXN0MRcwFQYK
CZImiZPyLGQBGRYHZXhhbXBsZTEWMBQGA1UECgwNRXhhbXBsZSBUcnVzdDEXMBUG
A1UEAwwORnV0dXJlIFJvb3QgQ0EwgZswEAYHKoZIzj0CAQYFK4EEACMDgYYABABY
jDRsZZRwz7BU8NvFmuJl+8HDi4RMnooyOKpGsC6+m4fOl/nXWCxQdiSsdq6PolVc
4f334M/DrHhyyvV0q2SvawG1f6siJS5tXKYzAVJG4SIl/xk9EDBI3/ZAgV5GNX46
Bf06PiJyyf0bFTdlD5a+fei6G7cb3nofkfLBv0ynWTrcpKNmMGQwHQYDVR0OBBYE
FGiuH9jD7jgp4dyJh2HFtqzqkxpnMB8GA1UdIwQYMBaAFGiuH9jD7jgp4dyJh2HF
tqzqkxpnMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYDVR0PAQH/BAQDAgEGMAoGCCqG
SM49BAMEA4GMADCBiAJCAUO3QSv78XkqBQ6glTL35oLhDROHgQNgsujIsU3RQhJl
PhSkBeVDCAK7zNnxPqULvHFlaOe+PdGboj7eRbnjAfRJAkIBlvP2dCm8536dyOJD
q2p0flB9GoDzmPbwrXu0KpgNawQMPiRWT8I/YZ9iu1Mab4zJ6oTX60gnv4zvF1Fk
dYSfXZ8=
-----END CERTIFICATE-----
`;
const FUTURE_ROOT_CERTIFICATE_SHA256 =
  'EC:31:E0:C8:28:26:C4:39:34:2D:8D:F7:03:6B:AB:9C:82:70:1D:E0:8B:0F:EA:15:84:1A:8B:AA:A1:F5:67:31';

/** The binary (DER) form of a PEM certificate. */
function derOf(pem: string): Buffer {
  return Buffer.from(pem.replace(/-----[A-Z ]+-----/g, ''), 'base64');
}

// ── Specs ─────────────────────────────────────────────────────────────────────

test.describe('Security tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // The certificate decoder prints dates in the visitor's locale and time zone.
  test.use({ locale: 'en-US', timezoneId: 'UTC' });

  // ── Hash Generator ──────────────────────────────────────────────────────────

  test.describe('Hash Generator', () => {
    test('digests typed text with every algorithm and copies each digest', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'hash-generator', 'Hash Generator');

      // Nothing to copy before there is input.
      for (const algorithm of HASH_ALGORITHMS) {
        await expect(page.getByRole('button', { name: `Copy ${algorithm} hash`, exact: true })).toBeDisabled();
      }

      await page.getByRole('textbox', { name: 'Text to hash' }).fill('hello world');

      for (const algorithm of HASH_ALGORITHMS) {
        await expect(page.getByText(HELLO_WORLD[algorithm], { exact: true })).toBeVisible();
        // The copy button of an algorithm copies that algorithm's digest.
        const copied = await copyWith(page, page.getByRole('button', { name: `Copy ${algorithm} hash`, exact: true }));
        expect(copied).toBe(HELLO_WORLD[algorithm]);
        await expect(page.getByRole('button', { name: `${algorithm} hash copied`, exact: true })).toBeVisible();
      }

      // Text outside ASCII is hashed as UTF-8.
      await page.getByRole('textbox', { name: 'Text to hash' }).fill('héllo wörld 👋');
      await expect(page.getByText('b310e3a0c99a7c40f07be8e041862df6', { exact: true })).toBeVisible();
      await expect(
        page.getByText('395591396b4fe97051476ba48689cd98b5cd16e0fe66892f7f92173b9bd50c27', { exact: true })
      ).toBeVisible();
      await expect(page.getByText(HELLO_WORLD.MD5, { exact: true })).toBeHidden();
    });

    test('computes MD5 correctly for the RFC 1321 suite and around every block boundary', async ({ page }) => {
      await openTool(page, 'hash-generator', 'Hash Generator');
      const input = page.getByRole('textbox', { name: 'Text to hash' });

      for (const [text, md5] of RFC_1321) {
        await input.fill(text);
        await expect(page.getByText(md5, { exact: true })).toBeVisible();
      }

      // MD5 pads to 64-byte blocks with 8 bytes of length at the end, so the
      // lengths around 56 and 64 (and their multiples) are where it goes wrong.
      for (const length of [55, 56, 57, 63, 64, 65, 119, 120, 121, 128, 1000]) {
        const text = 'a'.repeat(length);
        await input.fill(text);
        await expect(
          page.getByText(createHash('md5').update(text).digest('hex'), { exact: true }),
          `MD5 of ${length} characters`
        ).toBeVisible();
        await expect(
          page.getByText(createHash('sha512').update(text).digest('hex'), { exact: true }),
          `SHA-512 of ${length} characters`
        ).toBeVisible();
      }
    });

    test('verifies a pasted checksum and clears back to the empty state', async ({ page }) => {
      await openTool(page, 'hash-generator', 'Hash Generator');
      const main = page.getByRole('main');
      const input = page.getByRole('textbox', { name: 'Text to hash' });
      const expected = page.getByRole('textbox', { name: 'Expected checksum' });

      // The comparison only exists once there is something to compare with.
      await expect(expected).toBeHidden();
      await input.fill('hello world');

      // Checksums are published in either case and get copied with spaces around them.
      await expected.fill(`  ${HELLO_WORLD['SHA-256'].toUpperCase()}  `);
      await expect(main.getByRole('status')).toHaveText('Checksum verified! Matches SHA-256 hash.');
      await expect(main.getByText('Match Verified')).toHaveCount(1);

      await expected.fill(HELLO_WORLD.MD5);
      await expect(main.getByRole('status')).toHaveText('Checksum verified! Matches MD5 hash.');

      // One wrong digit is not a match.
      await expected.fill(`${HELLO_WORLD['SHA-256'].slice(0, -1)}0`);
      await expect(main.getByRole('status')).toHaveText('No match found in computed hashes.');
      await expect(main.getByText('Match Verified')).toHaveCount(0);

      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(input).toHaveValue('');
      await expect(expected).toBeHidden();
      await expect(page.getByText(HELLO_WORLD['SHA-256'], { exact: true })).toBeHidden();
      for (const algorithm of HASH_ALGORITHMS) {
        await expect(page.getByRole('button', { name: `Copy ${algorithm} hash`, exact: true })).toBeDisabled();
      }
    });

    test('hashes an uploaded binary file byte for byte', async ({ page }) => {
      await openTool(page, 'hash-generator', 'Hash Generator');
      await page.getByRole('tab', { name: 'File Checksum' }).click();

      await page.getByLabel('Select file to hash').setInputFiles({
        name: 'all-bytes.bin',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from(Array.from({ length: 256 }, (_, index) => index)),
      });

      await expect(page.getByText('all-bytes.bin', { exact: true })).toBeVisible();
      await expect(page.getByText('256 B', { exact: true })).toBeVisible();
      for (const algorithm of HASH_ALGORITHMS) {
        await expect(page.getByText(ALL_BYTES[algorithm], { exact: true }), algorithm).toBeVisible();
      }

      await page.getByRole('textbox', { name: 'Expected checksum' }).fill(ALL_BYTES['SHA-1']);
      await expect(page.getByRole('main').getByRole('status')).toHaveText('Checksum verified! Matches SHA-1 hash.');

      // Removing the file brings the drop area back and forgets the digests.
      await page.getByRole('button', { name: 'Remove file' }).click();
      await expect(page.getByRole('button', { name: 'Drop file here or click to browse' })).toBeVisible();
      await expect(page.getByText(ALL_BYTES.MD5, { exact: true })).toBeHidden();
      await expect(page.getByRole('textbox', { name: 'Expected checksum' })).toBeHidden();

      // An empty file is a valid input with well-known digests.
      await page.getByLabel('Select file to hash').setInputFiles({
        name: 'empty.txt',
        mimeType: 'text/plain',
        buffer: Buffer.alloc(0),
      });
      await expect(page.getByText('empty.txt', { exact: true })).toBeVisible();
      await expect(page.getByText('d41d8cd98f00b204e9800998ecf8427e', { exact: true })).toBeVisible();
      await expect(
        page.getByText('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', { exact: true })
      ).toBeVisible();

      // Going back to text leaves the file and its digests behind.
      await page.getByRole('tab', { name: 'Text', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Text to hash' })).toHaveValue('');
      await expect(page.getByText('d41d8cd98f00b204e9800998ecf8427e', { exact: true })).toBeHidden();
    });

    test('hashes a file dropped onto the drop area', async ({ page }) => {
      await openTool(page, 'hash-generator', 'Hash Generator');
      await page.getByRole('tab', { name: 'File Checksum' }).click();

      const dataTransfer = await page.evaluateHandle(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['hello world'], 'dropped.txt', { type: 'text/plain' }));
        return transfer;
      });
      await page
        .getByRole('button', { name: 'Drop file here or click to browse' })
        .dispatchEvent('drop', { dataTransfer });

      await expect(page.getByText('dropped.txt', { exact: true })).toBeVisible();
      await expect(page.getByText('11 B', { exact: true })).toBeVisible();
      await expect(page.getByText(HELLO_WORLD.MD5, { exact: true })).toBeVisible();
      await expect(page.getByText(HELLO_WORLD['SHA-512'], { exact: true })).toBeVisible();
    });
  });

  // ── Password Hasher ─────────────────────────────────────────────────────────

  test.describe('Password Hasher', () => {
    test('hashes with Bcrypt at the chosen cost and verifies the result', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'password-hasher', 'Password Hasher');
      const main = page.getByRole('main');

      await expect(page.getByRole('button', { name: 'Generate Hash' })).toBeDisabled();

      await choose(page, 'Hashing Algorithm', 'Bcrypt');
      await expect(main.getByText('Cost Factor (Rounds): 10')).toBeVisible();

      // The cost slider has no accessible name, so it is found as the only slider.
      const cost = page.getByRole('slider');
      await cost.focus();
      await cost.press('Home');
      await expect(main.getByText('Cost Factor (Rounds): 4')).toBeVisible();
      await cost.press('ArrowRight');
      await expect(main.getByText('Cost Factor (Rounds): 5')).toBeVisible();
      await expect(main.getByText('2^5 iterations')).toBeVisible();

      const password = 'correct horse battery staple';
      await page.getByRole('textbox', { name: 'Plaintext password' }).fill(password);
      await page.getByRole('button', { name: 'Generate Hash' }).click();

      await expect(main.getByText('60 characters (Modular Crypt Format)')).toBeVisible();
      const hash = await copyWith(page, page.getByRole('button', { name: 'Copy hash output' }));
      expect(hash).toMatch(/^\$2[aby]\$05\$[./A-Za-z0-9]{53}$/);
      await expect(main.getByText(hash, { exact: true })).toBeVisible();

      // A second run salts differently.
      await page.getByRole('textbox', { name: 'Plaintext password' }).fill(`${password}!`);
      await expect(main.getByText(hash, { exact: true })).toBeHidden();
      await page.getByRole('textbox', { name: 'Plaintext password' }).fill(password);
      await page.getByRole('button', { name: 'Generate Hash' }).click();
      await expect(main.getByText('60 characters (Modular Crypt Format)')).toBeVisible();
      const secondHash = await copyWith(page, page.getByRole('button', { name: 'Copy hash output' }));
      expect(secondHash).toMatch(/^\$2[aby]\$05\$[./A-Za-z0-9]{53}$/);
      expect(secondHash).not.toBe(hash);

      // Both verify against the password they were made from, and only against it.
      await page.getByRole('tab', { name: 'Verify Password' }).click();
      for (const candidate of [hash, secondHash]) {
        await page.getByRole('textbox', { name: 'Password to verify' }).fill(password);
        await page.getByRole('textbox', { name: 'Target hash string' }).fill(candidate);
        await page.getByRole('button', { name: 'Verify Password' }).click();
        await expect(main.getByText('Password Matches!', { exact: true })).toBeVisible();
        await expect(main.getByText('Detected: Bcrypt')).toBeVisible();

        await page.getByRole('textbox', { name: 'Password to verify' }).fill('Correct horse battery staple');
        await expect(main.getByText('Password Matches!', { exact: true })).toBeHidden();
        await page.getByRole('button', { name: 'Verify Password' }).click();
        await expect(main.getByText('Password Does Not Match', { exact: true })).toBeVisible();
      }
    });

    test('verifies hashes published by other Bcrypt and Argon2 implementations', async ({ page }) => {
      await openTool(page, 'password-hasher', 'Password Hasher');
      const main = page.getByRole('main');
      await page.getByRole('tab', { name: 'Verify Password' }).click();

      const verify = page.getByRole('button', { name: 'Verify Password' });
      await expect(verify).toBeDisabled();

      for (const { password, hash, scheme } of PUBLISHED_HASHES) {
        await page.getByRole('textbox', { name: 'Password to verify' }).fill(password);
        await page.getByRole('textbox', { name: 'Target hash string' }).fill(hash);
        await verify.click();
        await expect(main.getByText('Password Matches!', { exact: true }), scheme).toBeVisible({ timeout: 20_000 });
        await expect(main.getByText(`Detected: ${scheme}`)).toBeVisible();

        await page.getByRole('textbox', { name: 'Password to verify' }).fill(`${password} `);
        await verify.click();
        await expect(main.getByText('Password Does Not Match', { exact: true }), scheme).toBeVisible({ timeout: 20_000 });
        await expect(main.getByText(`Detected: ${scheme}`)).toBeVisible();
      }
    });

    test('hashes with Argon2 using the selected parameters', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'password-hasher', 'Password Hasher');
      const main = page.getByRole('main');
      const copy = page.getByRole('button', { name: 'Copy hash output' });
      const base64 = '[A-Za-z0-9+/]';

      await page.getByRole('textbox', { name: 'Plaintext password' }).fill('  spaces are part of it  ');
      await page.getByRole('button', { name: 'Generate Hash' }).click();
      await expect(copy).toBeVisible({ timeout: 20_000 });

      // Defaults: Argon2id, 64 MiB, 3 passes, 4 lanes, 16-byte salt, 32-byte hash.
      const defaults = await copyWith(page, copy);
      expect(defaults).toMatch(new RegExp(`^\\$argon2id\\$v=19\\$m=65536,t=3,p=4\\$${base64}{22}\\$${base64}{43}$`));
      await expect(main.getByText(`${defaults.length} characters (Modular Crypt Format)`)).toBeVisible();

      // Changing a setting discards the hash made with the old one.
      await choose(page, 'Hashing Algorithm', 'Argon2i');
      await expect(copy).toBeHidden();
      await choose(page, 'Memory Size', '16 MiB (16,384 KiB)');
      await choose(page, 'Parallelism (Threads)', '1 Thread');
      await choose(page, 'Hash Output Length', '16 Bytes (128-bit)');
      const passes = page.getByRole('slider');
      await passes.focus();
      await passes.press('Home');
      await expect(main.getByText('Iterations (Time Cost): 1')).toBeVisible();

      await page.getByRole('button', { name: 'Generate Hash' }).click();
      await expect(copy).toBeVisible({ timeout: 20_000 });
      const tuned = await copyWith(page, copy);
      expect(tuned).toMatch(new RegExp(`^\\$argon2i\\$v=19\\$m=16384,t=1,p=1\\$${base64}{22}\\$${base64}{22}$`));

      // The tool accepts its own output, whitespace in the password included.
      await page.getByRole('tab', { name: 'Verify Password' }).click();
      await page.getByRole('textbox', { name: 'Target hash string' }).fill(defaults);
      await page.getByRole('textbox', { name: 'Password to verify' }).fill('  spaces are part of it  ');
      await page.getByRole('button', { name: 'Verify Password' }).click();
      await expect(main.getByText('Password Matches!', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(main.getByText('Detected: Argon2 (argon2id)')).toBeVisible();

      await page.getByRole('textbox', { name: 'Password to verify' }).fill('spaces are part of it');
      await page.getByRole('button', { name: 'Verify Password' }).click();
      await expect(main.getByText('Password Does Not Match', { exact: true })).toBeVisible({ timeout: 20_000 });
    });

    test('explains a hash it cannot check instead of calling it a mismatch', async ({ page }) => {
      await openTool(page, 'password-hasher', 'Password Hasher');
      const main = page.getByRole('main');
      await page.getByRole('tab', { name: 'Verify Password' }).click();
      await page.getByRole('textbox', { name: 'Password to verify' }).fill('password');

      const target = page.getByRole('textbox', { name: 'Target hash string' });
      const verify = page.getByRole('button', { name: 'Verify Password' });
      const alert = main.getByRole('alert');

      // Not a password hash at all.
      await target.fill('5f4dcc3b5aa765d61d8327deb882cf99');
      await verify.click();
      await expect(alert).toHaveText('Unknown hash format. Please provide a valid Bcrypt or Argon2 hash string.');

      // A Bcrypt hash that lost its last character while being copied.
      await target.fill(PUBLISHED_HASHES[0].hash.slice(0, -1));
      await expect(alert).toBeHidden();
      await verify.click();
      await expect(alert).toContainText('Invalid Bcrypt hash');
      await expect(main.getByText('Password Does Not Match', { exact: true })).toBeHidden();

      // Argon2 1.0 hashes cannot be reproduced by an Argon2 1.3 implementation.
      await target.fill(PUBLISHED_HASHES[1].hash.replace('v=19', 'v=16'));
      await verify.click();
      await expect(alert).toContainText('Unsupported Argon2 version: v=16');
      await expect(main.getByText('Password Does Not Match', { exact: true })).toBeHidden();

      // Clear empties both fields and the message.
      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(target).toHaveValue('');
      await expect(page.getByRole('textbox', { name: 'Password to verify' })).toHaveValue('');
      await expect(alert).toBeHidden();
      await expect(verify).toBeDisabled();
    });

    test('the old Bcrypt Hasher address opens the Password Hasher', async ({ page }) => {
      await page.goto('/tools/bcrypt-hasher/', { waitUntil: 'networkidle' });
      await expect(page).toHaveURL(/\/tools\/password-hasher\/?$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Password Hasher' })).toBeVisible();
    });
  });

  // ── AES Encryption ──────────────────────────────────────────────────────────

  test.describe('AES Encryption', () => {
    test('encrypts text and decrypts it again after swapping', async ({ page }) => {
      await openTool(page, 'aes-encryption', 'AES Encryption/Decryption');
      const main = page.getByRole('main');
      const encrypt = page.getByRole('button', { name: 'Encrypt', exact: true });

      // Nothing to do without a password and a text.
      await expect(encrypt).toBeDisabled();
      await page.getByLabel('Password', { exact: true }).fill('s3cret passphrase');
      await expect(encrypt).toBeDisabled();
      await page.getByRole('textbox', { name: 'Text to encrypt' }).fill('Attack at dawn');
      await encrypt.click();

      // 16 bytes of salt, 12 of IV, 14 of text and a 16-byte tag are 58 bytes: 80 Base64 characters.
      await expect(main.getByText('Encrypted text (80 characters)')).toBeVisible();

      await page.getByRole('button', { name: 'Swap input/output' }).click();
      await expect(page.getByRole('tab', { name: 'Decrypt' })).toHaveAttribute('aria-selected', 'true');
      const ciphertext = page.getByRole('textbox', { name: 'Encrypted text to decrypt' });
      await expect(ciphertext).toHaveValue(/^[A-Za-z0-9+/]{78}==$/);
      expect(await ciphertext.inputValue()).not.toContain('Attack');

      await page.getByRole('button', { name: 'Decrypt', exact: true }).click();
      await expect(main.getByText('Decrypted text (14 characters)')).toBeVisible();
      await expect(main.getByText('Attack at dawn', { exact: true })).toBeVisible();
    });

    test('is compatible with AES-256-GCM and PBKDF2 outside the tool', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'aes-encryption', 'AES Encryption/Decryption');
      const main = page.getByRole('main');

      // What the tool encrypts can be decrypted elsewhere.
      await page.getByLabel('Password', { exact: true }).fill(AES_PASSWORD);
      await page.getByRole('textbox', { name: 'Text to encrypt' }).fill(AES_PLAINTEXT);
      await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
      await expect(main.getByText('Encrypted text (112 characters)')).toBeVisible();
      const first = await copyWith(page, page.getByRole('button', { name: 'Copy to clipboard' }));
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
      expect(decryptOutsideTheTool(first, AES_PASSWORD)).toBe(AES_PLAINTEXT);

      // The same text never encrypts to the same output twice.
      await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
      await expect.poll(() => copyWith(page, page.getByRole('button', { name: /Copy to clipboard|Copied!/ }))).not.toBe(first);

      // What was encrypted elsewhere can be decrypted by the tool, line breaks and all.
      await page.getByRole('tab', { name: 'Decrypt' }).click();
      await expect(main.getByText(/Encrypted text \(\d+ characters\)/)).toBeHidden();
      const wrapped = (AES_CIPHERTEXT.match(/.{1,40}/g) ?? []).join('\n');
      await page.getByRole('textbox', { name: 'Encrypted text to decrypt' }).fill(`${wrapped}\n`);
      await page.getByRole('button', { name: 'Decrypt', exact: true }).click();
      await expect(main.getByText(AES_PLAINTEXT, { exact: true })).toBeVisible();
      await expect(main.getByText(`Decrypted text (${AES_PLAINTEXT.length} characters)`)).toBeVisible();
    });

    test('refuses a wrong password or damaged text and drops stale results', async ({ page }) => {
      await openTool(page, 'aes-encryption', 'AES Encryption/Decryption');
      const main = page.getByRole('main');
      const alert = main.getByRole('alert');
      const failure = 'Error: Decryption failed. Please check your password and encrypted text.';

      await page.getByRole('tab', { name: 'Decrypt' }).click();
      const password = page.getByLabel('Password', { exact: true });
      const input = page.getByRole('textbox', { name: 'Encrypted text to decrypt' });
      const decrypt = page.getByRole('button', { name: 'Decrypt', exact: true });

      // Wrong password.
      await password.fill(`${AES_PASSWORD}!`);
      await input.fill(AES_CIPHERTEXT);
      await decrypt.click();
      await expect(alert).toHaveText(failure);
      await expect(main.getByText(/Decrypted text/)).toBeHidden();

      // Right password: the error goes, the text appears.
      await password.fill(AES_PASSWORD);
      await expect(alert).toBeHidden();
      await decrypt.click();
      await expect(main.getByText(AES_PLAINTEXT, { exact: true })).toBeVisible();

      // One changed character fails authentication; the old result must not stay.
      const flipped = AES_CIPHERTEXT.replace('3DBMEqq', '3DBMEqr');
      expect(flipped).not.toBe(AES_CIPHERTEXT);
      await input.fill(flipped);
      await expect(main.getByText(AES_PLAINTEXT, { exact: true })).toBeHidden();
      await decrypt.click();
      await expect(alert).toHaveText(failure);

      // Text that is not Base64, and Base64 that is too short to hold anything.
      for (const garbage of ['this is not encrypted text!', 'aGVsbG8=']) {
        await input.fill(garbage);
        await expect(alert).toBeHidden();
        await decrypt.click();
        await expect(alert).toHaveText(failure);
      }

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(input).toHaveValue('');
      await expect(password).toHaveValue('');
      await expect(alert).toBeHidden();
      await expect(decrypt).toBeDisabled();
    });

    test('shows a generated password so it can be kept', async ({ page }) => {
      await openTool(page, 'aes-encryption', 'AES Encryption/Decryption');
      const password = page.getByLabel('Password', { exact: true });

      await expect(password).toHaveAttribute('type', 'password');
      await page.getByRole('button', { name: 'Generate random password' }).click();
      await expect(password).toHaveAttribute('type', 'text');
      await expect(password).toHaveValue(/^[0-9a-f]{32}$/);
      const generated = await password.inputValue();

      await page.getByRole('button', { name: 'Hide password' }).click();
      await expect(password).toHaveAttribute('type', 'password');
      await expect(password).toHaveValue(generated);
      await page.getByRole('button', { name: 'Show password' }).click();
      await expect(password).toHaveAttribute('type', 'text');

      // Another press makes another password.
      await page.getByRole('button', { name: 'Generate random password' }).click();
      await expect(password).toHaveValue(/^[0-9a-f]{32}$/);
      await expect(password).not.toHaveValue(generated);
    });
  });

  // ── RSA Key Pair Generator ──────────────────────────────────────────────────

  test.describe('RSA Key Pair Generator', () => {
    test('generates a 2048-bit PEM pair whose halves belong together', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'rsa-key-generator', 'RSA Key Pair Generator');
      const main = page.getByRole('main');

      // Nothing is shown before the first run.
      await expect(page.getByRole('button', { name: 'Copy public key' })).toBeHidden();
      await expect(page.getByRole('combobox', { name: 'Key Size' })).toHaveText('2048 bits (Fast)');
      await expect(page.getByRole('combobox', { name: 'Key Format' })).toHaveText('PEM (Standard)');

      await page.getByRole('button', { name: 'Generate Key Pair' }).click();
      await expect(page.getByRole('button', { name: 'Copy public key' })).toBeVisible({ timeout: 30_000 });

      const publicPem = await copyWith(page, page.getByRole('button', { name: 'Copy public key' }));
      const privatePem = await copyWith(page, page.getByRole('button', { name: 'Copy private key' }));
      expect(publicPem).toMatch(/^-----BEGIN PUBLIC KEY-----\n([A-Za-z0-9+/=]{1,64}\n)+-----END PUBLIC KEY-----$/);
      expect(privatePem).toMatch(/^-----BEGIN PRIVATE KEY-----\n([A-Za-z0-9+/=]{1,64}\n)+-----END PRIVATE KEY-----$/);
      await expect(main.getByText('-----BEGIN PUBLIC KEY-----')).toBeVisible();
      await expect(main.getByText('-----BEGIN PRIVATE KEY-----')).toBeVisible();

      // Node reads both keys, and they are what the settings asked for.
      const publicKey = createPublicKey(publicPem);
      const privateKey = createPrivateKey(privatePem);
      expect(publicKey.asymmetricKeyType).toBe('rsa');
      expect(publicKey.asymmetricKeyDetails?.modulusLength).toBe(2048);
      expect(publicKey.asymmetricKeyDetails?.publicExponent).toBe(BigInt(65537));
      expect(privateKey.asymmetricKeyDetails?.modulusLength).toBe(2048);

      // The public key is the public half of the private key.
      const derived = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
      expect(derived.trim()).toBe(publicPem.trim());

      // What one encrypts (RSA-OAEP, SHA-256) the other decrypts.
      const oaep = { padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' };
      const sealed = publicEncrypt({ key: publicKey, ...oaep }, Buffer.from('lazytools'));
      expect(privateDecrypt({ key: privateKey, ...oaep }, sealed).toString()).toBe('lazytools');

      // A second run makes a different pair.
      await page.getByRole('button', { name: 'Generate Key Pair' }).click();
      await expect
        .poll(() => copyWith(page, page.getByRole('button', { name: 'Copy public key' })), { timeout: 30_000 })
        .not.toBe(publicPem);
    });

    test('downloads the keys under the format they were generated in', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'rsa-key-generator', 'RSA Key Pair Generator');

      await page.getByRole('button', { name: 'Generate Key Pair' }).click();
      await expect(page.getByRole('button', { name: 'Download public key' })).toBeVisible({ timeout: 30_000 });

      const publicFile = await downloadWith(page, page.getByRole('button', { name: 'Download public key' }));
      expect(publicFile.name).toBe('public_key.pem');
      expect(publicFile.text).toBe(await copyWith(page, page.getByRole('button', { name: 'Copy public key' })));
      expect(createPublicKey(publicFile.text).asymmetricKeyDetails?.modulusLength).toBe(2048);

      const privateFile = await downloadWith(page, page.getByRole('button', { name: 'Download private key' }));
      expect(privateFile.name).toBe('private_key.pem');
      expect(privateFile.text).toBe(await copyWith(page, page.getByRole('button', { name: 'Copy private key' })));

      // Changing the format select does not rename the PEM keys still on screen.
      await choose(page, 'Key Format', 'JWK (JSON)');
      const stillPem = await downloadWith(page, page.getByRole('button', { name: 'Download public key' }));
      expect(stillPem.name).toBe('public_key.pem');
      expect(stillPem.text).toBe(publicFile.text);

      // A new run in JWK gives JSON files.
      await page.getByRole('button', { name: 'Generate Key Pair' }).click();
      await expect(page.getByRole('main').getByText('"kty": "RSA"').first()).toBeVisible({ timeout: 30_000 });

      const publicJwkFile = await downloadWith(page, page.getByRole('button', { name: 'Download public key' }));
      expect(publicJwkFile.name).toBe('public_key.json');
      const publicJwk = JSON.parse(publicJwkFile.text);
      expect(publicJwk).toMatchObject({ kty: 'RSA', e: 'AQAB', alg: 'RSA-OAEP-256', key_ops: ['encrypt'] });
      expect(Buffer.from(publicJwk.n, 'base64url')).toHaveLength(256);
      expect(publicJwk).not.toHaveProperty('d');

      const privateJwkFile = await downloadWith(page, page.getByRole('button', { name: 'Download private key' }));
      expect(privateJwkFile.name).toBe('private_key.json');
      const privateJwk = JSON.parse(privateJwkFile.text);
      expect(privateJwk).toMatchObject({ kty: 'RSA', e: 'AQAB', n: publicJwk.n, key_ops: ['decrypt'] });
      for (const member of ['d', 'p', 'q', 'dp', 'dq', 'qi']) {
        expect(privateJwk[member], member).toMatch(/^[A-Za-z0-9_-]+$/);
      }
      expect(createPrivateKey({ key: privateJwk, format: 'jwk' }).asymmetricKeyDetails?.modulusLength).toBe(2048);
    });

    test('generates a 3072-bit pair as bare Base64', async ({ page }) => {
      test.setTimeout(90_000);
      await allowClipboard(page);
      await openTool(page, 'rsa-key-generator', 'RSA Key Pair Generator');

      await choose(page, 'Key Size', '3072 bits (Recommended)');
      await choose(page, 'Key Format', 'PKCS#8 (Base64)');
      await page.getByRole('button', { name: 'Generate Key Pair' }).click();
      await expect(page.getByRole('button', { name: 'Copy public key' })).toBeVisible({ timeout: 60_000 });

      const publicBase64 = await copyWith(page, page.getByRole('button', { name: 'Copy public key' }));
      const privateBase64 = await copyWith(page, page.getByRole('button', { name: 'Copy private key' }));
      expect(publicBase64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(privateBase64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);

      const publicKey = createPublicKey({ key: Buffer.from(publicBase64, 'base64'), format: 'der', type: 'spki' });
      const privateKey = createPrivateKey({ key: Buffer.from(privateBase64, 'base64'), format: 'der', type: 'pkcs8' });
      expect(publicKey.asymmetricKeyDetails?.modulusLength).toBe(3072);
      expect(privateKey.asymmetricKeyDetails?.modulusLength).toBe(3072);
      expect(
        createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).equals(Buffer.from(publicBase64, 'base64'))
      ).toBe(true);
    });
  });

  // ── Certificate Decoder ─────────────────────────────────────────────────────

  test.describe('Certificate Decoder', () => {
    test('decodes a pasted RSA certificate', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'certificate-decoder', 'Certificate Decoder');
      const main = page.getByRole('main');

      await page.getByRole('textbox', { name: 'PEM certificate' }).fill(RSA_CERTIFICATE);

      // Read in the order a screen reader does: badges, subject, issuer, validity.
      await expect(main).toMatchAriaSnapshot(`
        - text: /^Valid Self-Signed v3 sha256WithRSAEncryption Subject C US ST California L San Francisco O Example Org OU Platform OU Security CN example\\.test Issuer C US ST California L San Francisco O Example Org OU Platform OU Security CN example\\.test Validity Not Before Jan 01, 2024, 12:00:00\\sAM UTC Not After Dec 31, 2099, 11:59:59\\sPM UTC Serial Number/
        - code: A1:B2:C3:D4:E5:F6:07
        - button "Copy serial number"
        - text: Public Key Algorithm RSA Key Size 2048 bits Extensions subjectKeyIdentifier
        - code: A7:58:84:2E:84:5C:17:CF:FD:35:DE:E9:E9:0F:2F:AC:62:6F:0D:17
        - text: authorityKeyIdentifier
        - code: A7:58:84:2E:84:5C:17:CF:FD:35:DE:E9:E9:0F:2F:AC:62:6F:0D:17
        - text: subjectAltName
        - list:
          - listitem: "DNS: example.test"
          - listitem: "DNS: www.example.test"
          - listitem: "IP: 192.0.2.10"
          - listitem: "email: admin@example.test"
          - listitem: "URI: https://example.test/id"
        - text: keyUsage critical
        - list:
          - listitem: Digital Signature
          - listitem: Key Encipherment
        - text: extKeyUsage
        - list:
          - listitem: TLS Server Auth
          - listitem: TLS Client Auth
        - text: "basicConstraints critical CA: No Fingerprints SHA-1"
        - code: ${RSA_CERTIFICATE_SHA1}
        - button "Copy SHA-1 fingerprint"
        - text: SHA-256
        - code: ${RSA_CERTIFICATE_SHA256}
        - button "Copy SHA-256 fingerprint"
      `);
      await expect(main.getByText('Expired')).toBeHidden();

      expect(await copyWith(page, page.getByRole('button', { name: 'Copy serial number' }))).toBe('A1:B2:C3:D4:E5:F6:07');
      expect(await copyWith(page, page.getByRole('button', { name: 'Copy SHA-256 fingerprint' }))).toBe(
        RSA_CERTIFICATE_SHA256
      );

      // Clear returns to the empty state.
      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByRole('textbox', { name: 'PEM certificate' })).toHaveValue('');
      await expect(main.getByText(RSA_CERTIFICATE_SHA1)).toBeHidden();
      await expect(main.getByText('Self-Signed')).toBeHidden();
    });

    test('reads the first certificate of a chain and judges validity periods', async ({ page }) => {
      await openTool(page, 'certificate-decoder', 'Certificate Decoder');
      const main = page.getByRole('main');
      const input = page.getByRole('textbox', { name: 'PEM certificate' });

      // A leaf followed by its issuer, with the text OpenSSL puts around the blocks.
      await input.fill(
        `subject=C = DE, O = Müller GmbH, CN = expired.example.test\n${EXPIRED_CERTIFICATE}\nsubject=CN = Future Root CA\n${FUTURE_ROOT_CERTIFICATE}`
      );

      await expect(main.getByText('This input holds 2 certificates. Showing the first one.')).toBeVisible();
      await expect(main).toMatchAriaSnapshot(`
        - text: /^Expired v3 ecdsa-with-SHA256 Subject C DE O Müller GmbH CN expired\\.example\\.test Issuer DC test DC example O Example Trust CN Future Root CA Validity Not Before Jan 01, 2020, 12:00:00\\sAM UTC Not After Jan 01, 2021, 12:00:00\\sPM UTC ?\\(EXPIRED\\) Serial Number$/
        - code: 01:02:03:04:05
        - button "Copy serial number"
        - text: "Public Key Algorithm EC Key Size 256 bits Curve P-256 Extensions basicConstraints CA: No subjectKeyIdentifier"
        - code: D4:F7:32:C0:C3:B1:CE:BD:BC:24:FD:6F:0C:FE:F5:1C:84:A9:E9:E1
        - text: authorityKeyIdentifier
        - code: 68:AE:1F:D8:C3:EE:38:29:E1:DC:89:87:61:C5:B6:AC:EA:93:1A:67
        - text: "authorityInfoAccess OCSP: http://ocsp.example.test CA Issuers: http://ca.example.test/root.crt cRLDistributionPoints"
        - list:
          - listitem: http://crl.example.test/root.crl
        - text: subjectAltName
        - list:
          - listitem: "DNS: expired.example.test"
          - listitem: /IP. 2001:0?[Dd][Bb]8:(:|(0{1,4}:){5})0{0,3}1/
        - text: Fingerprints SHA-1
        - code: ${EXPIRED_CERTIFICATE_SHA1}
        - button "Copy SHA-1 fingerprint"
        - text: SHA-256
        - code: ${EXPIRED_CERTIFICATE_SHA256}
      `);
      // The issuer is a different name, so this is not self-signed.
      await expect(main.getByText('Self-Signed')).toBeHidden();

      // The root on its own: a CA whose validity has not started.
      await input.fill(FUTURE_ROOT_CERTIFICATE);
      await expect(main.getByText('This input holds 2 certificates.')).toBeHidden();
      await expect(main).toMatchAriaSnapshot(`
        - text: /^Not Yet Valid Self-Signed v3 ecdsa-with-SHA512 Subject DC test DC example O Example Trust CN Future Root CA Issuer DC test DC example O Example Trust CN Future Root CA Validity Not Before Jan 01, 2090, 12:00:00\\sAM UTC ?\\(NOT YET VALID\\) Not After Jan 01, 2095, 12:00:00\\sAM UTC Serial Number$/
        - code: 7F
        - button "Copy serial number"
        - text: Public Key Algorithm EC Key Size 521 bits Curve P-521 Extensions subjectKeyIdentifier
        - code: 68:AE:1F:D8:C3:EE:38:29:E1:DC:89:87:61:C5:B6:AC:EA:93:1A:67
        - text: authorityKeyIdentifier
        - code: 68:AE:1F:D8:C3:EE:38:29:E1:DC:89:87:61:C5:B6:AC:EA:93:1A:67
        - text: "basicConstraints critical CA: Yes Path Length: 1 keyUsage critical"
        - list:
          - listitem: Key Cert Sign
          - listitem: CRL Sign
        - text: Fingerprints SHA-1
        - code: CC:AF:42:CA:44:47:6E:01:80:E8:CC:2A:7D:6A:A7:2A:FF:7B:E2:D1
        - button "Copy SHA-1 fingerprint"
        - text: SHA-256
        - code: ${FUTURE_ROOT_CERTIFICATE_SHA256}
      `);
    });

    test('decodes uploaded DER and PEM files', async ({ page }) => {
      await openTool(page, 'certificate-decoder', 'Certificate Decoder');
      const main = page.getByRole('main');
      const upload = page.getByLabel('Upload certificate file');
      const der = derOf(RSA_CERTIFICATE);
      expect(der).toHaveLength(1155);

      // Binary certificate: the text box gives way to the file's name and size.
      await upload.setInputFiles({ name: 'example.der', mimeType: 'application/x-x509-ca-cert', buffer: der });
      await expect(main.getByText('example.der (1155 bytes)')).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'PEM certificate' })).toBeHidden();
      await expect(main.getByText('example.test', { exact: true })).toHaveCount(2);
      await expect(main.getByText('2048 bits')).toBeVisible();
      await expect(main.getByText(RSA_CERTIFICATE_SHA1)).toBeVisible();
      await expect(main.getByText(RSA_CERTIFICATE_SHA256)).toBeVisible();

      // Bytes after the certificate are not part of its fingerprint.
      await upload.setInputFiles({
        name: 'padded.cer',
        mimeType: 'application/pkix-cert',
        buffer: Buffer.concat([der, Buffer.from('\n\n')]),
      });
      await expect(main.getByText('padded.cer (1157 bytes)')).toBeVisible();
      await expect(main.getByText(RSA_CERTIFICATE_SHA1)).toBeVisible();
      await expect(main.getByText(RSA_CERTIFICATE_SHA256)).toBeVisible();

      // A PEM file with a byte-order mark and text before the block shows up as text.
      await upload.setInputFiles({
        name: 'leaf.pem',
        mimeType: 'application/x-pem-file',
        buffer: Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from(`Bag Attributes\n    friendlyName: expired leaf\n${EXPIRED_CERTIFICATE}`),
        ]),
      });
      await expect(page.getByRole('textbox', { name: 'PEM certificate' })).toHaveValue(/friendlyName: expired leaf/);
      await expect(main.getByText('padded.cer (1157 bytes)')).toBeHidden();
      await expect(main.getByText('expired.example.test', { exact: true })).toBeVisible();
      await expect(main.getByText(EXPIRED_CERTIFICATE_SHA256)).toBeVisible();
      await expect(main.getByText(RSA_CERTIFICATE_SHA256)).toBeHidden();

      // A file that is no certificate is reported, with nothing decoded left over.
      await upload.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('just some notes') });
      await expect(main.getByRole('alert')).toHaveText(
        'This is not a valid X.509 certificate. It may be incomplete or damaged.'
      );
      await expect(main.getByText(EXPIRED_CERTIFICATE_SHA256)).toBeHidden();
      await expect(main.getByText('Fingerprints', { exact: true })).toBeHidden();
    });

    test('explains input that is not a certificate', async ({ page }) => {
      await openTool(page, 'certificate-decoder', 'Certificate Decoder');
      const main = page.getByRole('main');
      const input = page.getByRole('textbox', { name: 'PEM certificate' });
      const alert = main.getByRole('alert');

      await input.fill('hello, is this a certificate?');
      await expect(alert).toHaveText('Expected a PEM certificate starting with -----BEGIN CERTIFICATE-----');

      // Other PEM blocks are named for what they are. The bodies are placeholders, not keys.
      await input.fill('-----BEGIN PRIVATE KEY-----\nbm90IGEgcmVhbCBrZXk=\n-----END PRIVATE KEY-----');
      await expect(alert).toHaveText(
        'This is a private key, not a certificate. Paste a block that starts with -----BEGIN CERTIFICATE-----.'
      );
      await input.fill('-----BEGIN CERTIFICATE REQUEST-----\nbm90IGEgcmVhbCBDU1I=\n-----END CERTIFICATE REQUEST-----');
      await expect(alert).toContainText('This is a certificate signing request (CSR), not a certificate.');

      // A certificate cut off half way through.
      const lines = RSA_CERTIFICATE.trim().split('\n');
      await input.fill(lines.slice(0, 12).join('\n'));
      await expect(alert).toHaveText('This is not a valid X.509 certificate. It may be incomplete or damaged.');
      await expect(main.getByText('Fingerprints', { exact: true })).toBeHidden();

      // A good certificate replaces the message; emptying the box removes everything.
      await input.fill(RSA_CERTIFICATE);
      await expect(alert).toBeHidden();
      await expect(main.getByText(RSA_CERTIFICATE_SHA1)).toBeVisible();
      await input.fill('');
      await expect(main.getByText(RSA_CERTIFICATE_SHA1)).toBeHidden();
      await expect(alert).toBeHidden();
    });
  });

  // ── Password Generator ──────────────────────────────────────────────────────

  test.describe('Password Generator', () => {
    const copyPassword = (page: Page) => copyWith(page, page.getByRole('button', { name: 'Copy password' }));
    const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

    test('generates a 16-character password from all four sets and describes it', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'password-generator', 'Password Generator');
      const main = page.getByRole('main');

      await expect(main.getByText('Length: 16')).toBeVisible();
      await expect(main.getByText(/^Estimated entropy: \d+ bits$/)).toBeVisible();

      const first = await copyPassword(page);
      expect(first).toMatch(/^[A-Za-z0-9!@#$%^&*()_+\-=[\]{}|;:,.<>?]{16}$/);
      // "Force at least one char from each enabled set" is on by default.
      expect(count(first, /[A-Z]/g)).toBeGreaterThan(0);
      expect(count(first, /[a-z]/g)).toBeGreaterThan(0);
      expect(count(first, /[0-9]/g)).toBeGreaterThan(0);
      expect(count(first, /[^A-Za-z0-9]/g)).toBeGreaterThan(0);
      await expect(main.getByText(first, { exact: true })).toBeVisible();

      // The four counters describe the password on screen.
      await expect(main).toMatchAriaSnapshot(`
        - paragraph: Uppercase
        - paragraph: "${count(first, /[A-Z]/g)}"
        - paragraph: Lowercase
        - paragraph: "${count(first, /[a-z]/g)}"
        - paragraph: Numbers
        - paragraph: "${count(first, /[0-9]/g)}"
        - paragraph: Special
        - paragraph: "${count(first, /[^A-Za-z0-9]/g)}"
      `);

      await page.getByRole('button', { name: 'Generate now' }).click();
      await expect(main.getByText(first, { exact: true })).toBeHidden();
      const second = await copyPassword(page);
      expect(second).toHaveLength(16);
      expect(second).not.toBe(first);
      await expect(main.getByText(second, { exact: true })).toBeVisible();
    });

    test('honours length, character sets, the ambiguous filter and per-type limits', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'password-generator', 'Password Generator');
      const main = page.getByRole('main');
      // The length slider has no accessible name; it is the only slider in this mode.
      const length = page.getByRole('slider');

      // Longest: 256 characters, none of them a look-alike once those are excluded.
      await length.focus();
      await length.press('End');
      await expect(main.getByText('Length: 256')).toBeVisible();
      await page.getByRole('checkbox', { name: 'Exclude ambiguous characters (0, O, l, 1, i, I)' }).check();
      const long = await copyPassword(page);
      expect(long).toHaveLength(256);
      expect(long).not.toMatch(/[0Ol1iI]/);

      // Only the enabled sets are used.
      await page.getByRole('checkbox', { name: 'Lowercase (a-z)' }).uncheck();
      await page.getByRole('checkbox', { name: 'Special (!@#$...)' }).uncheck();
      expect(await copyPassword(page)).toMatch(/^[A-HJ-NP-Z2-9]{256}$/);
      await page.getByRole('checkbox', { name: 'Numbers (0-9)' }).uncheck();
      expect(await copyPassword(page)).toMatch(/^[A-HJ-NP-Z]{256}$/);

      // Shortest: 4 characters, one from each set when all four are on.
      await page.getByRole('checkbox', { name: 'Exclude ambiguous characters (0, O, l, 1, i, I)' }).uncheck();
      for (const set of ['Lowercase (a-z)', 'Numbers (0-9)', 'Special (!@#$...)']) {
        await page.getByRole('checkbox', { name: set }).check();
      }
      await length.focus();
      await length.press('Home');
      await expect(main.getByText('Length: 4')).toBeVisible();
      const short = await copyPassword(page);
      expect(short).toHaveLength(4);
      expect([/[A-Z]/g, /[a-z]/g, /[0-9]/g, /[^A-Za-z0-9]/g].map((set) => count(short, set))).toEqual([1, 1, 1, 1]);

      // A limit caps one type: with letters only and at most one capital, 15 of 16 are lower case.
      for (let step = 4; step < 16; step += 1) await length.press('ArrowRight');
      await expect(main.getByText('Length: 16')).toBeVisible();
      await page.getByRole('checkbox', { name: 'Numbers (0-9)' }).uncheck();
      await page.getByRole('checkbox', { name: 'Special (!@#$...)' }).uncheck();
      await expect(page.getByRole('spinbutton', { name: 'Max uppercase count' })).toBeDisabled();
      await page.getByRole('checkbox', { name: 'Max uppercase' }).check();
      await page.getByRole('spinbutton', { name: 'Max uppercase count' }).fill('1');
      const capped = await copyPassword(page);
      expect(capped).toMatch(/^[A-Za-z]{16}$/);
      expect(count(capped, /[A-Z]/g)).toBe(1);

      // Limits that cannot fill the length are explained, and there is nothing to copy.
      await page.getByRole('checkbox', { name: 'Lowercase (a-z)' }).uncheck();
      await expect(main.getByText('Increase the max counts or reduce the password length.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Copy password' })).toBeDisabled();
      await expect(main.getByText(capped, { exact: true })).toBeHidden();

      // So is having no character set at all.
      await page.getByRole('checkbox', { name: 'Uppercase (A-Z)' }).uncheck();
      await expect(main.getByText('Enable at least one character set with a max count above zero.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Copy password' })).toBeDisabled();
      await expect(main.getByText(/Estimated entropy/)).toBeHidden();

      // Turning a set back on recovers.
      await page.getByRole('checkbox', { name: 'Numbers (0-9)' }).check();
      expect(await copyPassword(page)).toMatch(/^[0-9]{16}$/);
    });

    test('generates grouped PIN codes', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'password-generator', 'Password Generator');
      const main = page.getByRole('main');

      await choose(page, 'Generation mode', 'PIN code');
      await expect(main.getByText('PIN length: 6')).toBeVisible();
      await expect(main.getByText('Digits per group: 3')).toBeVisible();
      expect(await copyPassword(page)).toMatch(/^\d{3}-\d{3}$/);

      // Two unnamed sliders: length first, group size second.
      const pinLength = page.getByRole('slider').first();
      const groupSize = page.getByRole('slider').nth(1);

      await pinLength.focus();
      await pinLength.press('End');
      await expect(main.getByText('PIN length: 24')).toBeVisible();
      expect(await copyPassword(page)).toMatch(/^(\d{3}-){7}\d{3}$/);

      await groupSize.focus();
      await groupSize.press('End');
      await expect(main.getByText('Digits per group: 6')).toBeVisible();
      expect(await copyPassword(page)).toMatch(/^(\d{6}-){3}\d{6}$/);

      // A last group may be shorter: 7 digits in groups of 6.
      await pinLength.focus();
      await pinLength.press('Home');
      await expect(main.getByText('PIN length: 4')).toBeVisible();
      expect(await copyPassword(page)).toMatch(/^\d{4}$/);
      for (let step = 0; step < 3; step += 1) await pinLength.press('ArrowRight');
      await expect(main.getByText('PIN length: 7')).toBeVisible();
      expect(await copyPassword(page)).toMatch(/^\d{6}-\d$/);

      // The counters of the random mode do not apply to a PIN.
      await expect(main.getByText('Uppercase', { exact: true })).toBeHidden();
    });

    test('generates passphrases with the chosen separator and suffixes', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'password-generator', 'Password Generator');
      const main = page.getByRole('main');

      await choose(page, 'Generation mode', 'Recovery-style passphrase');
      await expect(main.getByText('Word count: 4')).toBeVisible();

      // Defaults: four capitalised words, hyphens, a three-digit number at the end.
      expect(await copyPassword(page)).toMatch(/^([A-Z][a-z]+-){4}[1-9]\d{2}$/);
      await expect(main).toMatchAriaSnapshot(`
        - paragraph: Words
        - paragraph: "4"
        - paragraph: Separator
        - paragraph: "-"
        - paragraph: Suffixes
        - paragraph: "123"
      `);

      await choose(page, 'Separator', 'Dot');
      await page.getByRole('checkbox', { name: 'Capitalize each word' }).uncheck();
      await page.getByRole('checkbox', { name: 'Append a 3-digit suffix' }).uncheck();
      expect(await copyPassword(page)).toMatch(/^[a-z]+(\.[a-z]+){3}$/);

      await page.getByRole('checkbox', { name: 'Append a symbol suffix' }).check();
      expect(await copyPassword(page)).toMatch(/^[a-z]+(\.[a-z]+){3}\.[!@#$%&]$/);

      // Twelve words separated by spaces.
      await choose(page, 'Separator', 'Space');
      await page.getByRole('checkbox', { name: 'Append a symbol suffix' }).uncheck();
      const words = page.getByRole('slider');
      await words.focus();
      await words.press('End');
      await expect(main.getByText('Word count: 12')).toBeVisible();
      expect(await copyPassword(page)).toMatch(/^[a-z]+( [a-z]+){11}$/);
      await expect(main).toMatchAriaSnapshot(`
        - paragraph: Words
        - paragraph: "12"
        - paragraph: Separator
        - paragraph: space
      `);
    });

    test('with auto-generate off, keeps the output until asked for a new one', async ({ page }) => {
      await allowClipboard(page);
      await openTool(page, 'password-generator', 'Password Generator');
      const main = page.getByRole('main');

      const kept = await copyPassword(page);
      await page.getByRole('switch', { name: 'Auto-generate' }).click();
      await expect(page.getByRole('switch', { name: 'Auto-generate' })).not.toBeChecked();
      await expect(main.getByText(kept, { exact: true })).toBeVisible();

      // Settings change, the output does not, and it is still described as what it is.
      await page.getByRole('checkbox', { name: 'Special (!@#$...)' }).uncheck();
      await page.getByRole('checkbox', { name: 'Numbers (0-9)' }).uncheck();
      await choose(page, 'Generation mode', 'PIN code');
      await expect(main.getByText(kept, { exact: true })).toBeVisible();
      expect(await copyPassword(page)).toBe(kept);
      await expect(main).toMatchAriaSnapshot(`
        - paragraph: Uppercase
        - paragraph: "${count(kept, /[A-Z]/g)}"
        - paragraph: Lowercase
        - paragraph: "${count(kept, /[a-z]/g)}"
        - paragraph: Numbers
        - paragraph: "${count(kept, /[0-9]/g)}"
        - paragraph: Special
        - paragraph: "${count(kept, /[^A-Za-z0-9]/g)}"
      `);

      // "Generate now" applies the settings as they are now.
      await page.getByRole('button', { name: 'Generate now' }).click();
      await expect(main.getByText(kept, { exact: true })).toBeHidden();
      expect(await copyPassword(page)).toMatch(/^\d{3}-\d{3}$/);
      await expect(main.getByText('Uppercase', { exact: true })).toBeHidden();

      // Back on, the output follows the settings again.
      await page.getByRole('switch', { name: 'Auto-generate' }).click();
      await choose(page, 'Generation mode', 'Random password');
      expect(await copyPassword(page)).toMatch(/^[A-Za-z]{16}$/);
    });
  });
});
