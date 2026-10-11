import { test, expect } from '@playwright/test';
import { generateRsaKeyPair, rsaKeyFileName, type RsaKeyPair } from '@/lib/tools/rsa-key-generator';

const OAEP = { name: 'RSA-OAEP', hash: 'SHA-256' } as const;

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const fromBase64Url = (text: string) => fromBase64(text.replace(/-/g, '+').replace(/_/g, '/'));

/** The Base64 body of a PEM block, after checking its BEGIN/END lines and 64-column wrapping. */
function pemBody(pem: string, label: string): string {
  const lines = pem.split('\n');
  expect(lines[0]).toBe(`-----BEGIN ${label}-----`);
  expect(lines[lines.length - 1]).toBe(`-----END ${label}-----`);
  const body = lines.slice(1, -1);
  for (const line of body.slice(0, -1)) expect(line).toHaveLength(64);
  expect(body[body.length - 1].length).toBeGreaterThan(0);
  expect(body[body.length - 1].length).toBeLessThanOrEqual(64);
  return body.join('');
}

/** Encrypts with the public key and decrypts with the private one: the pair belongs together. */
async function roundTrip(publicKey: CryptoKey, privateKey: CryptoKey): Promise<string> {
  const message = new TextEncoder().encode('round trip 🔐');
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, message);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, encrypted));
}

async function importDer(pair: { publicDer: Uint8Array<ArrayBuffer>; privateDer: Uint8Array<ArrayBuffer> }) {
  const publicKey = await crypto.subtle.importKey('spki', pair.publicDer, OAEP, true, ['encrypt']);
  const privateKey = await crypto.subtle.importKey('pkcs8', pair.privateDer, OAEP, true, ['decrypt']);
  return { publicKey, privateKey };
}

const modulusBits = (key: CryptoKey) => (key.algorithm as RsaHashedKeyAlgorithm).modulusLength;

test.describe('generateRsaKeyPair', () => {
  test('PEM: SPKI and PKCS#8 blocks that import and work as a pair', async () => {
    const pair = await generateRsaKeyPair(2048, 'PEM');
    expect(pair.format).toBe('PEM');
    expect(pair.bits).toBe(2048);

    const keys = await importDer({
      publicDer: fromBase64(pemBody(pair.publicKey, 'PUBLIC KEY')),
      privateDer: fromBase64(pemBody(pair.privateKey, 'PRIVATE KEY')),
    });
    expect(modulusBits(keys.publicKey)).toBe(2048);
    expect(await roundTrip(keys.publicKey, keys.privateKey)).toBe('round trip 🔐');
  });

  test('PKCS8: the same keys as bare Base64 without BEGIN/END lines', async () => {
    const pair = await generateRsaKeyPair(2048, 'PKCS8');
    expect(pair.format).toBe('PKCS8');
    expect(pair.publicKey).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(pair.privateKey).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);

    const keys = await importDer({
      publicDer: fromBase64(pair.publicKey),
      privateDer: fromBase64(pair.privateKey),
    });
    expect(await roundTrip(keys.publicKey, keys.privateKey)).toBe('round trip 🔐');
  });

  test('JWK: pretty-printed JSON Web Keys that import and work as a pair', async () => {
    const pair = await generateRsaKeyPair(2048, 'JWK');
    expect(pair.format).toBe('JWK');
    expect(pair.publicKey).toContain('\n  "');

    const publicJwk = JSON.parse(pair.publicKey) as JsonWebKey;
    const privateJwk = JSON.parse(pair.privateKey) as JsonWebKey;
    expect(publicJwk.kty).toBe('RSA');
    expect(publicJwk.e).toBe('AQAB');
    expect(fromBase64Url(publicJwk.n ?? '')).toHaveLength(256);
    // The public key must not carry any private part.
    expect(publicJwk.d).toBeUndefined();
    expect(privateJwk.d).toBeTruthy();
    expect(privateJwk.n).toBe(publicJwk.n);

    const publicKey = await crypto.subtle.importKey('jwk', publicJwk, OAEP, true, ['encrypt']);
    const privateKey = await crypto.subtle.importKey('jwk', privateJwk, OAEP, true, ['decrypt']);
    expect(await roundTrip(publicKey, privateKey)).toBe('round trip 🔐');
  });

  test('honours the requested key size', async () => {
    const pair = await generateRsaKeyPair(3072, 'PKCS8');
    expect(pair.bits).toBe(3072);
    const publicKey = await crypto.subtle.importKey('spki', fromBase64(pair.publicKey), OAEP, true, ['encrypt']);
    expect(modulusBits(publicKey)).toBe(3072);
  });

  test('makes a different pair every time', async () => {
    const [first, second] = await Promise.all([generateRsaKeyPair(2048, 'PKCS8'), generateRsaKeyPair(2048, 'PKCS8')]);
    expect(first.publicKey).not.toBe(second.publicKey);
    expect(first.privateKey).not.toBe(second.privateKey);
  });
});

test.describe('rsaKeyFileName', () => {
  test('names the files after the key and its format', () => {
    expect(rsaKeyFileName('public', 'PEM')).toBe('public_key.pem');
    expect(rsaKeyFileName('private', 'PEM')).toBe('private_key.pem');
    expect(rsaKeyFileName('public', 'PKCS8')).toBe('public_key.pem');
    expect(rsaKeyFileName('private', 'JWK')).toBe('private_key.json');
  });

  // Defect: the download took its extension from the format selected at that
  // moment, so changing the selection after generating saved PEM text as
  // .json and JWK text as .pem. The pair now carries the format it was made in.
  test('a pair is named by the format it was generated in', async () => {
    const pem: RsaKeyPair = await generateRsaKeyPair(2048, 'PEM');
    const jwk: RsaKeyPair = await generateRsaKeyPair(2048, 'JWK');
    expect(rsaKeyFileName('public', pem.format)).toBe('public_key.pem');
    expect(pem.publicKey.startsWith('-----BEGIN PUBLIC KEY-----')).toBe(true);
    expect(rsaKeyFileName('private', jwk.format)).toBe('private_key.json');
    expect(() => JSON.parse(jwk.privateKey)).not.toThrow();
  });
});
