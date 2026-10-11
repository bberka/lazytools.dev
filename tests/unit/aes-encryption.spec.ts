import { test, expect } from '@playwright/test';
import { decryptText, encryptText, generatePassword } from '@/lib/tools/aes-encryption';

const PASSWORD = 'correct horse battery staple';
const DECRYPT_ERROR = 'Decryption failed. Please check your password and encrypted text.';

// Made with the tool before its logic was moved into the module. It must keep
// decrypting, or text people encrypted earlier would be lost.
const LEGACY_MESSAGE = 'Legacy message: Grüße 👋';
const LEGACY_ENCRYPTED =
  'ObrNrP/IJDfriIZaLrgzIGLgRiZrruHRHmd1LGUQ/0mLr69zC0M9PehYaM5BBv4ZVYy9iBrZ6amEezVom/reFeAS8CzlbpCz';

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));

test.describe('encryptText and decryptText', () => {
  test('round-trips plain, Unicode, emoji, multi-line and whitespace-only text', async () => {
    for (const message of ['hello', 'Grüße, 世界 👋🏽', 'line one\nline two\r\n\ttabbed', '   ', 'x'.repeat(100_000)]) {
      const encrypted = await encryptText(message, PASSWORD);
      expect(await decryptText(encrypted, PASSWORD)).toBe(message);
    }
  });

  test('produces Base64 of salt, IV, ciphertext and tag', async () => {
    const encrypted = await encryptText('hello', PASSWORD);
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    // 16 bytes of salt, 12 of IV, 5 of ciphertext, 16 of GCM tag.
    expect(fromBase64(encrypted)).toHaveLength(16 + 12 + 5 + 16);
  });

  test('uses a fresh salt and IV every time', async () => {
    const first = await encryptText('hello', PASSWORD);
    const second = await encryptText('hello', PASSWORD);
    expect(first).not.toBe(second);
    expect(await decryptText(first, PASSWORD)).toBe('hello');
    expect(await decryptText(second, PASSWORD)).toBe('hello');
  });

  test('still decrypts text encrypted before the logic was extracted', async () => {
    expect(await decryptText(LEGACY_ENCRYPTED, PASSWORD)).toBe(LEGACY_MESSAGE);
  });

  test('ignores whitespace and line breaks in pasted encrypted text', async () => {
    const wrapped = `  ${LEGACY_ENCRYPTED.replace(/(.{32})/g, '$1\r\n')}\n`;
    expect(await decryptText(wrapped, PASSWORD)).toBe(LEGACY_MESSAGE);
  });

  test('treats the password exactly: case and whitespace matter', async () => {
    const encrypted = await encryptText('hello', ' Secret ');
    expect(await decryptText(encrypted, ' Secret ')).toBe('hello');
    await expect(decryptText(encrypted, 'Secret')).rejects.toThrow(DECRYPT_ERROR);
    await expect(decryptText(encrypted, ' secret ')).rejects.toThrow(DECRYPT_ERROR);
  });

  test('rejects a wrong password', async () => {
    await expect(decryptText(LEGACY_ENCRYPTED, 'wrong password')).rejects.toThrow(DECRYPT_ERROR);
  });

  test('rejects encrypted text that was changed', async () => {
    const bytes = fromBase64(LEGACY_ENCRYPTED);
    bytes[bytes.length - 1] ^= 0x01;
    await expect(decryptText(toBase64(bytes), PASSWORD)).rejects.toThrow(DECRYPT_ERROR);
  });

  test('rejects text that is not Base64, is empty or is cut off', async () => {
    for (const broken of ['not base64 at all!', '', '   ', 'AAAA', LEGACY_ENCRYPTED.slice(0, 40)]) {
      await expect(decryptText(broken, PASSWORD), JSON.stringify(broken)).rejects.toThrow(DECRYPT_ERROR);
    }
  });
});

test.describe('generatePassword', () => {
  test('returns 32 hexadecimal characters, different every time', () => {
    const first = generatePassword();
    const second = generatePassword();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(second).toMatch(/^[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
  });
});
