// AES Encryption logic: password-based text encryption with AES-256-GCM. No
// React and no DOM, so it runs in the browser and in Node. WebCrypto comes
// from `globalThis.crypto`.
//
// The encrypted text is Base64 of `salt (16 bytes) | IV (12 bytes) |
// ciphertext and GCM tag`. The key is derived from the password with
// PBKDF2-SHA-256. Text encrypted by earlier versions of the tool uses this
// same layout, so none of these numbers may change.

const SALT_BYTES = 16;
const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const PBKDF2_ITERATIONS = 100000;

const DECRYPT_ERROR = 'Decryption failed. Please check your password and encrypted text.';

type Bytes = Uint8Array<ArrayBuffer>;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64: string): Bytes {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Bytes): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts `plaintext` under `password` and returns the result as Base64. A
 * fresh random salt and IV are used every time, so encrypting the same text
 * twice gives two different results; both decrypt to the same text.
 */
export async function encryptText(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));

  const combined = new Uint8Array(SALT_BYTES + IV_BYTES + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, SALT_BYTES);
  combined.set(new Uint8Array(encrypted), SALT_BYTES + IV_BYTES);
  return bytesToBase64(combined);
}

/**
 * Decrypts text produced by `encryptText`. Whitespace and line breaks in the
 * Base64 are ignored. Throws an `Error` with a message for the user when the
 * text is not valid, was changed, or the password is wrong; AES-GCM cannot
 * tell these apart, so there is one message for all of them.
 */
export async function decryptText(encryptedBase64: string, password: string): Promise<string> {
  try {
    const combined = base64ToBytes(encryptedBase64.replace(/\s+/g, ''));
    if (combined.length < SALT_BYTES + IV_BYTES + GCM_TAG_BYTES) {
      throw new Error('Encrypted text is too short');
    }

    const salt = combined.slice(0, SALT_BYTES);
    const iv = combined.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
    const key = await deriveKey(password, salt);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      combined.slice(SALT_BYTES + IV_BYTES)
    );
    return new TextDecoder().decode(decrypted);
  } catch (cause) {
    throw new Error(DECRYPT_ERROR, { cause });
  }
}

/** A random password of 32 hexadecimal characters (128 bits). */
export function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}
