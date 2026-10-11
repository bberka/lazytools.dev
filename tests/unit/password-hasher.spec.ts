import { test, expect } from '@playwright/test';
import { hashPassword, verifyPassword, type Argon2Settings } from '@/lib/tools/password-hasher';

// Small costs keep the suite fast; the published vectors below use real ones.
const FAST_ARGON2: Omit<Argon2Settings, 'algorithm'> = {
  iterations: 1,
  memorySize: 1024,
  parallelism: 1,
  hashLength: 16,
};

// From the README of the Argon2 reference implementation:
//   echo -n "password" | ./argon2 somesalt -t 2 -m 16 -p 4 -l 24
const ARGON2I_REFERENCE = '$argon2i$v=19$m=65536,t=2,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

// The example hash from the Bcrypt article on Wikipedia.
const BCRYPT_REFERENCE = '$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';

test.describe('hashPassword', () => {
  test('makes a Bcrypt hash with the requested cost that verifies', async () => {
    const hash = await hashPassword('correct horse', { algorithm: 'bcrypt', rounds: 4 });
    expect(hash).toMatch(/^\$2[aby]\$04\$[./A-Za-z0-9]{53}$/);
    expect(await verifyPassword('correct horse', hash)).toEqual({ matches: true, algorithm: 'Bcrypt' });
    expect(await verifyPassword('correct horsE', hash)).toEqual({ matches: false, algorithm: 'Bcrypt' });
  });

  for (const algorithm of ['argon2id', 'argon2i', 'argon2d'] as const) {
    test(`makes an ${algorithm} hash that carries its parameters and verifies`, async () => {
      const hash = await hashPassword('correct horse', { algorithm, ...FAST_ARGON2 });
      expect(hash.startsWith(`$${algorithm}$v=19$m=1024,t=1,p=1$`)).toBe(true);
      expect(await verifyPassword('correct horse', hash)).toEqual({
        matches: true,
        algorithm: `Argon2 (${algorithm})`,
      });
      expect((await verifyPassword('wrong horse', hash)).matches).toBe(false);
    });
  }

  test('salts every hash, so the same password hashes differently each time', async () => {
    const settings = { algorithm: 'argon2id', ...FAST_ARGON2 } as const;
    expect(await hashPassword('same', settings)).not.toBe(await hashPassword('same', settings));
  });

  test('keeps Unicode, emoji and whitespace as part of the password', async () => {
    for (const password of ['pässwörd 密码 🔑', '   ', ' padded ']) {
      for (const settings of [{ algorithm: 'argon2id', ...FAST_ARGON2 }, { algorithm: 'bcrypt', rounds: 4 }] as const) {
        const hash = await hashPassword(password, settings);
        expect((await verifyPassword(password, hash)).matches, JSON.stringify(password)).toBe(true);
      }
    }

    const hash = await hashPassword(' padded ', { algorithm: 'argon2id', ...FAST_ARGON2 });
    expect((await verifyPassword('padded', hash)).matches).toBe(false);
  });

  test('rejects parameters the algorithm cannot run with', async () => {
    await expect(hashPassword('x', { algorithm: 'argon2id', ...FAST_ARGON2, memorySize: 1 })).rejects.toThrow();
  });
});

test.describe('verifyPassword', () => {
  test('agrees with the Argon2 reference implementation', async () => {
    expect(await verifyPassword('password', ARGON2I_REFERENCE)).toEqual({
      matches: true,
      algorithm: 'Argon2 (argon2i)',
    });
    expect((await verifyPassword('Password', ARGON2I_REFERENCE)).matches).toBe(false);
  });

  test('agrees with a published Bcrypt hash', async () => {
    expect(await verifyPassword('abc123xyz', BCRYPT_REFERENCE)).toEqual({ matches: true, algorithm: 'Bcrypt' });
    expect((await verifyPassword('abc123xyZ', BCRYPT_REFERENCE)).matches).toBe(false);
  });

  test('ignores whitespace around a pasted hash', async () => {
    expect((await verifyPassword('password', `  ${ARGON2I_REFERENCE}\n`)).matches).toBe(true);
  });

  // Defect: the recomputed hash string was compared with the pasted one, so a
  // correct password failed when the hash was written slightly differently.
  test('verifies an Argon2 hash written with Base64 padding or reordered parameters', async () => {
    const padded = '$argon2i$v=19$m=65536,t=2,p=4$c29tZXNhbHQ=$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';
    const reordered = '$argon2i$v=19$t=2,m=65536,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';
    expect((await verifyPassword('password', padded)).matches).toBe(true);
    expect((await verifyPassword('password', reordered)).matches).toBe(true);
    expect((await verifyPassword('wrong', reordered)).matches).toBe(false);
  });

  // Defect: a hash made by another Argon2 version was reported as "password
  // does not match" although it can never be reproduced here.
  test('refuses an Argon2 hash of an unsupported version instead of calling it a mismatch', async () => {
    const version16 = ARGON2I_REFERENCE.replace('v=19', 'v=16');
    await expect(verifyPassword('password', version16)).rejects.toThrow(/Unsupported Argon2 version: v=16/);
  });

  // Defect: a Bcrypt hash that lost characters while being copied was
  // reported as "password does not match".
  test('refuses a cut-off or malformed Bcrypt hash instead of calling it a mismatch', async () => {
    await expect(verifyPassword('abc123xyz', BCRYPT_REFERENCE.slice(0, -3))).rejects.toThrow(/Invalid Bcrypt hash/);
    await expect(verifyPassword('abc123xyz', `${BCRYPT_REFERENCE}x`)).rejects.toThrow(/Invalid Bcrypt hash/);
    await expect(verifyPassword('abc123xyz', BCRYPT_REFERENCE.replace('R9h/', 'R9h!'))).rejects.toThrow(
      /Invalid Bcrypt hash/
    );
    await expect(verifyPassword('abc123xyz', BCRYPT_REFERENCE.replace('$12$', '$99$'))).rejects.toThrow(
      /Invalid Bcrypt hash/
    );
  });

  test('explains what is wrong with a malformed Argon2 hash', async () => {
    await expect(verifyPassword('x', '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ')).rejects.toThrow(
      /Invalid Argon2 hash format/
    );
    await expect(verifyPassword('x', '$argon2x$v=19$m=1024,t=1,p=1$c29tZXNhbHQ$AAAAAAAA')).rejects.toThrow(
      /Unsupported Argon2 variant: argon2x/
    );
    await expect(verifyPassword('x', '$argon2id$19$m=1024,t=1,p=1$c29tZXNhbHQ$AAAAAAAA')).rejects.toThrow(
      /Invalid Argon2 version format/
    );
    await expect(verifyPassword('x', '$argon2id$v=19$m=1024,t=1$c29tZXNhbHQ$AAAAAAAA')).rejects.toThrow(
      /Missing Argon2 parameters/
    );
    await expect(verifyPassword('x', '$argon2id$v=19$m=1024,t=1,p=1$c29t*XNhbHQ$AAAAAAAA')).rejects.toThrow(
      /must be Base64/
    );
    await expect(verifyPassword('x', '$argon2id$v=19$m=1024,t=1,p=1$c29tZXNhbHQ$')).rejects.toThrow(/must be Base64/);
  });

  test('refuses text that is not a Bcrypt or Argon2 hash', async () => {
    for (const notAHash of ['', '   ', 'password', '5f4dcc3b5aa765d61d8327deb882cf99', '$1$salt$hash']) {
      await expect(verifyPassword('password', notAHash)).rejects.toThrow(/Unknown hash format/);
    }
  });
});
