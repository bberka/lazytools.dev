// Password Hasher logic: hash a password with Bcrypt or Argon2 and check a
// password against an existing hash string. No React and no DOM, so it runs in
// the browser and in Node. The hashing libraries are loaded on first use.

export const ARGON2_VARIANTS = ['argon2id', 'argon2i', 'argon2d'] as const;
export type Argon2Variant = (typeof ARGON2_VARIANTS)[number];

export type PasswordHashAlgorithm = 'bcrypt' | Argon2Variant;

export interface BcryptSettings {
  algorithm: 'bcrypt';
  /** Cost factor: the hash runs 2^rounds iterations. */
  rounds: number;
}

export interface Argon2Settings {
  algorithm: Argon2Variant;
  /** Time cost. */
  iterations: number;
  /** Memory cost in KiB. */
  memorySize: number;
  /** Number of lanes. */
  parallelism: number;
  /** Length of the derived hash in bytes. */
  hashLength: number;
}

export type PasswordHashSettings = BcryptSettings | Argon2Settings;

export interface PasswordVerification {
  matches: boolean;
  /** The scheme read from the hash string, ready to show: "Bcrypt" or "Argon2 (argon2id)". */
  algorithm: string;
}

const ARGON2_SALT_BYTES = 16;
/** The only Argon2 version the hashing library implements (1.3). */
const ARGON2_VERSION = 19;

// A Bcrypt hash is exactly "$2a$", a two-digit cost, "$", then 22 characters of
// salt and 31 of hash in Bcrypt's own Base64 alphabet: 60 characters in all.
const BCRYPT_HASH = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/;

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/** Decodes Base64 with or without padding, in the standard or the URL-safe alphabet. */
function base64ToBytes(text: string): Uint8Array {
  const standard = text.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!standard || !/^[A-Za-z0-9+/]+$/.test(standard) || standard.length % 4 === 1) {
    throw new Error('Invalid Argon2 hash: the salt and the hash must be Base64.');
  }
  const binary = atob(standard.padEnd(standard.length + ((4 - (standard.length % 4)) % 4), '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface ParsedArgon2 {
  variant: Argon2Variant;
  memorySize: number;
  iterations: number;
  parallelism: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

function parseArgon2Hash(encoded: string): ParsedArgon2 {
  const parts = encoded.split('$');
  // Expected parts: ['', variant, version, params, salt, hash]
  if (parts.length !== 6 || parts[0] !== '') {
    throw new Error('Invalid Argon2 hash format. Expected: $argon2id$v=19$m=...,t=...,p=...$salt$hash');
  }

  const variant = ARGON2_VARIANTS.find((name) => name === parts[1]);
  if (!variant) {
    throw new Error(`Unsupported Argon2 variant: ${parts[1]}`);
  }

  const version = /^v=(\d+)$/.exec(parts[2]);
  if (!version) {
    throw new Error('Invalid Argon2 version format.');
  }
  // A hash made by another version can never be reproduced here, so saying
  // "does not match" would be wrong.
  if (Number(version[1]) !== ARGON2_VERSION) {
    throw new Error(`Unsupported Argon2 version: v=${version[1]}. Only v=${ARGON2_VERSION} hashes can be verified.`);
  }

  const params: Record<string, number> = {};
  for (const param of parts[3].split(',')) {
    const [key, value] = param.split('=');
    if (key && value && /^\d+$/.test(value)) {
      params[key] = Number(value);
    }
  }

  if (params.m === undefined || params.t === undefined || params.p === undefined) {
    throw new Error('Missing Argon2 parameters (m, t, or p).');
  }

  return {
    variant,
    memorySize: params.m,
    iterations: params.t,
    parallelism: params.p,
    salt: base64ToBytes(parts[4]),
    hash: base64ToBytes(parts[5]),
  };
}

async function argon2(
  variant: Argon2Variant,
  options: {
    password: string;
    salt: Uint8Array;
    iterations: number;
    memorySize: number;
    parallelism: number;
    hashLength: number;
    outputType: 'encoded' | 'hex';
  }
): Promise<string> {
  const { argon2id, argon2i, argon2d } = await import('hash-wasm');
  if (variant === 'argon2id') return argon2id(options);
  if (variant === 'argon2i') return argon2i(options);
  return argon2d(options);
}

/**
 * Hashes `password` and returns the hash string in Modular Crypt Format
 * (`$2b$10$...` or `$argon2id$v=19$...`). A fresh random salt is used every
 * time, so hashing the same password twice gives two different strings. The
 * password is used exactly as given; whitespace is part of it.
 */
export async function hashPassword(password: string, settings: PasswordHashSettings): Promise<string> {
  if (settings.algorithm === 'bcrypt') {
    const { default: bcrypt } = await import('bcryptjs');
    const salt = await bcrypt.genSalt(settings.rounds);
    return bcrypt.hash(password, salt);
  }

  return argon2(settings.algorithm, {
    password,
    salt: crypto.getRandomValues(new Uint8Array(ARGON2_SALT_BYTES)),
    iterations: settings.iterations,
    memorySize: settings.memorySize,
    parallelism: settings.parallelism,
    hashLength: settings.hashLength,
    outputType: 'encoded',
  });
}

/**
 * Checks `password` against a Bcrypt or Argon2 hash string; the scheme and its
 * parameters are read from the string. Throws an `Error` with a message for
 * the user when the string is not a hash this can check: an unknown scheme, a
 * cut-off or malformed hash, an unsupported Argon2 version. A well-formed hash
 * of a different password is not an error; it gives `matches: false`.
 */
export async function verifyPassword(password: string, hash: string): Promise<PasswordVerification> {
  const encoded = hash.trim();

  if (encoded.startsWith('$argon2')) {
    const parsed = parseArgon2Hash(encoded);
    // Comparing the hash bytes, not the whole string, keeps a hash that
    // another tool wrote with Base64 padding or reordered parameters valid.
    const recomputed = await argon2(parsed.variant, {
      password,
      salt: parsed.salt,
      iterations: parsed.iterations,
      memorySize: parsed.memorySize,
      parallelism: parsed.parallelism,
      hashLength: parsed.hash.length,
      outputType: 'hex',
    });
    return { matches: recomputed === toHex(parsed.hash), algorithm: `Argon2 (${parsed.variant})` };
  }

  if (/^\$2[aby]\$/.test(encoded)) {
    const cost = BCRYPT_HASH.exec(encoded);
    if (!cost || Number(cost[1]) < 4 || Number(cost[1]) > 31) {
      throw new Error(
        'Invalid Bcrypt hash. A Bcrypt hash is 60 characters long, for example $2b$10$ followed by 53 more characters.'
      );
    }
    const { default: bcrypt } = await import('bcryptjs');
    return { matches: await bcrypt.compare(password, encoded), algorithm: 'Bcrypt' };
  }

  throw new Error('Unknown hash format. Please provide a valid Bcrypt or Argon2 hash string.');
}
