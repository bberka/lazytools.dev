// RSA Key Pair Generator logic. No React and no DOM, so it runs in the browser
// and in Node. WebCrypto comes from `globalThis.crypto`.

export const RSA_KEY_SIZES = [2048, 3072, 4096] as const;
export type RsaKeySize = (typeof RSA_KEY_SIZES)[number];

export const RSA_KEY_FORMATS = ['PEM', 'PKCS8', 'JWK'] as const;
/**
 * How the keys are written out:
 * - `PEM`: SPKI (public) and PKCS#8 (private) between BEGIN/END lines;
 * - `PKCS8`: the same bytes as bare Base64, without the lines;
 * - `JWK`: JSON Web Keys, pretty-printed.
 */
export type RsaKeyFormat = (typeof RSA_KEY_FORMATS)[number];

export interface RsaKeyPair {
  publicKey: string;
  privateKey: string;
  /** The format and size this pair was made with, whatever the settings say now. */
  format: RsaKeyFormat;
  bits: RsaKeySize;
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function toPem(base64: string, label: 'PUBLIC KEY' | 'PRIVATE KEY'): string {
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

/**
 * Generates an RSA-OAEP (SHA-256) key pair of `bits` bits and writes both keys
 * out in `format`. The keys never leave the machine: generation and export
 * both happen in WebCrypto.
 */
export async function generateRsaKeyPair(bits: RsaKeySize, format: RsaKeyFormat): Promise<RsaKeyPair> {
  const keys = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: bits,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  if (format === 'JWK') {
    const [publicJwk, privateJwk] = await Promise.all([
      crypto.subtle.exportKey('jwk', keys.publicKey),
      crypto.subtle.exportKey('jwk', keys.privateKey),
    ]);
    return {
      publicKey: JSON.stringify(publicJwk, null, 2),
      privateKey: JSON.stringify(privateJwk, null, 2),
      format,
      bits,
    };
  }

  const [spki, pkcs8] = await Promise.all([
    crypto.subtle.exportKey('spki', keys.publicKey),
    crypto.subtle.exportKey('pkcs8', keys.privateKey),
  ]);
  const publicBase64 = bytesToBase64(spki);
  const privateBase64 = bytesToBase64(pkcs8);

  return format === 'PEM'
    ? { publicKey: toPem(publicBase64, 'PUBLIC KEY'), privateKey: toPem(privateBase64, 'PRIVATE KEY'), format, bits }
    : { publicKey: publicBase64, privateKey: privateBase64, format, bits };
}

/** The download name for one key of a pair: `public_key.pem`, `private_key.json`. */
export function rsaKeyFileName(kind: 'public' | 'private', format: RsaKeyFormat): string {
  return `${kind}_key.${format === 'JWK' ? 'json' : 'pem'}`;
}
