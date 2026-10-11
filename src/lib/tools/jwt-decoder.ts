/**
 * Reading a JSON Web Token: splits it, decodes the header and the payload,
 * and picks out the time claims. Nothing is verified; the signature is
 * returned as it came.
 *
 * A token is accepted the way it tends to arrive from a log, a terminal or an
 * `Authorization` header: surrounding and embedded whitespace and a leading
 * `Bearer ` are ignored.
 *
 * Everything here is pure and runs in Node.
 */

import { base64ToBytes } from './base64-converter';

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** The third segment, still base64url encoded. */
  signature: string;
}

function decodeSegment(segment: string, label: 'header' | 'payload'): Record<string, unknown> {
  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(segment));
  } catch {
    throw new Error(`Invalid base64url encoding in the ${label}.`);
  }

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error(`The ${label} is not valid JSON.`);
  }

  // JSON.parse also returns null, numbers, strings and arrays; none of them is a set of claims.
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`The ${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

/**
 * Decodes a signed JWT (three dot-separated base64url segments).
 *
 * @throws Error with a message for the user when the token is malformed.
 */
export function decodeJwt(token: string): DecodedJwt {
  const compact = token.replace(/^\s*Bearer\s+/i, '').replace(/\s+/g, '');
  const parts = compact.split('.');

  if (parts.length === 5) {
    throw new Error(
      'This looks like an encrypted token (JWE, 5 parts). Its content cannot be read without the key.'
    );
  }
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format. Expected 3 parts separated by dots.');
  }

  const [header, payload, signature] = parts;
  return {
    header: decodeSegment(header, 'header'),
    payload: decodeSegment(payload, 'payload'),
    signature,
  };
}

export interface JwtTimes {
  /** `iat` in seconds since the Unix epoch, or null when absent or not a number. */
  issuedAt: number | null;
  /** `exp`, likewise. */
  expiresAt: number | null;
  /** `nbf`, likewise. */
  notBefore: number | null;
}

function numericClaim(payload: Record<string, unknown>, name: string): number | null {
  const value = payload[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The registered time claims of a payload. Zero is a real time, not a missing one. */
export function jwtTimes(payload: Record<string, unknown>): JwtTimes {
  return {
    issuedAt: numericClaim(payload, 'iat'),
    expiresAt: numericClaim(payload, 'exp'),
    notBefore: numericClaim(payload, 'nbf'),
  };
}

/** Whether a token with this `exp` has expired at `now` (milliseconds, as from `Date.now()`). */
export function isJwtExpired(expiresAt: number | null, now: number): boolean {
  return expiresAt !== null && expiresAt < now / 1000;
}
