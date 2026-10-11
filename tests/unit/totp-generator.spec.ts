import { test, expect } from '@playwright/test';
import {
  buildOtpauthUri,
  computeTotpWindow,
  decodeBase32,
  encodeBase32,
  formatCode,
  generateSecret,
  hotp,
  secondsRemaining,
  totp,
  totpCounter,
  type TotpAlgorithm,
  type TotpOptions,
} from '@/lib/tools/totp-generator';

const encoder = new TextEncoder();
const ascii = (value: string) => encoder.encode(value);
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

// RFC 6238 Appendix B seeds: the ASCII digits "1234567890" repeated to the
// length of each hash output (20, 32 and 64 bytes).
const RFC_6238_SEEDS: Record<TotpAlgorithm, string> = {
  'SHA-1': '12345678901234567890',
  'SHA-256': '12345678901234567890123456789012',
  'SHA-512': '1234567890123456789012345678901234567890123456789012345678901234',
};

// RFC 6238 Appendix B: time in seconds -> 8-digit TOTP per algorithm.
const RFC_6238_VECTORS: Array<{ time: number } & Record<TotpAlgorithm, string>> = [
  { time: 59, 'SHA-1': '94287082', 'SHA-256': '46119246', 'SHA-512': '90693936' },
  { time: 1111111109, 'SHA-1': '07081804', 'SHA-256': '68084774', 'SHA-512': '25091201' },
  { time: 1111111111, 'SHA-1': '14050471', 'SHA-256': '67062674', 'SHA-512': '99943326' },
  { time: 1234567890, 'SHA-1': '89005924', 'SHA-256': '91819424', 'SHA-512': '93441116' },
  { time: 2000000000, 'SHA-1': '69279037', 'SHA-256': '90698825', 'SHA-512': '38618901' },
  { time: 20000000000, 'SHA-1': '65353130', 'SHA-256': '77737706', 'SHA-512': '47863826' },
];

// RFC 4226 Appendix D: the secret "12345678901234567890" with counters 0-9.
// "truncated" is the 31-bit integer before the final modulo; "hotp" is the
// published 6-digit value.
const RFC_4226_VECTORS: Array<{ counter: number; truncated: number; hotp: string }> = [
  { counter: 0, truncated: 1284755224, hotp: '755224' },
  { counter: 1, truncated: 1094287082, hotp: '287082' },
  { counter: 2, truncated: 137359152, hotp: '359152' },
  { counter: 3, truncated: 1726969429, hotp: '969429' },
  { counter: 4, truncated: 1640338314, hotp: '338314' },
  { counter: 5, truncated: 868254676, hotp: '254676' },
  { counter: 6, truncated: 1918287922, hotp: '287922' },
  { counter: 7, truncated: 82162583, hotp: '162583' },
  { counter: 8, truncated: 673399871, hotp: '399871' },
  { counter: 9, truncated: 645520489, hotp: '520489' },
];

const SHA1_OPTIONS: TotpOptions = { algorithm: 'SHA-1', digits: 6, period: 30 };

test.describe('decodeBase32', () => {
  test('decodes the RFC 4648 test vectors, padded and unpadded', () => {
    const vectors: Array<[string, string]> = [
      ['f', 'MY======'],
      ['fo', 'MZXQ===='],
      ['foo', 'MZXW6==='],
      ['foob', 'MZXW6YQ='],
      ['fooba', 'MZXW6YTB'],
      ['foobar', 'MZXW6YTBOI======'],
    ];

    for (const [plain, encoded] of vectors) {
      const padded = decodeBase32(encoded);
      expect(padded.ok).toBe(true);
      if (padded.ok) expect(text(padded.bytes)).toBe(plain);

      const unpadded = decodeBase32(encoded.replace(/=+$/, ''));
      expect(unpadded.ok).toBe(true);
      if (unpadded.ok) expect(text(unpadded.bytes)).toBe(plain);
    }
  });

  test('accepts lower and mixed case', () => {
    for (const input of ['mzxw6ytboi', 'MzXw6YtBoI']) {
      const result = decodeBase32(input);
      expect(result.ok).toBe(true);
      if (result.ok) expect(text(result.bytes)).toBe('foobar');
    }
  });

  test('ignores spaces, tabs, line breaks and hyphens between groups', () => {
    for (const input of ['MZXW 6YTB OI', 'mzxw-6ytb-oi', ' MZXW\t6YTB\nOI\r\n', 'M Z X W 6 Y T B O I']) {
      const result = decodeBase32(input);
      expect(result.ok).toBe(true);
      if (result.ok) expect(text(result.bytes)).toBe('foobar');
    }
  });

  test('handles lower case, spaces and padding together', () => {
    const result = decodeBase32('  mzxw 6ytb oi== ====  ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(text(result.bytes)).toBe('foobar');
  });

  test('decodes a typical authenticator secret', () => {
    const result = decodeBase32('JBSWY3DPEHPK3PXP');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.from(result.bytes)).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);
    }
  });

  test('ignores the unused bits left over after the last full byte', () => {
    const canonical = decodeBase32('MZXW6YTBOI');
    const sloppy = decodeBase32('MZXW6YTBOJ');
    expect(canonical.ok && sloppy.ok).toBe(true);
    if (canonical.ok && sloppy.ok) {
      expect(Array.from(sloppy.bytes)).toEqual(Array.from(canonical.bytes));
    }
  });

  test('rejects characters outside the Base32 alphabet and names the first one', () => {
    for (const bad of ['0', '1', '8', '9', '!', '_', '+', '/', 'é']) {
      const result = decodeBase32(`MZXW${bad}YTB`);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(`"${bad}"`);
    }
  });

  test('does not let case folding turn a non-Base32 letter into a valid one', () => {
    // 'ß' upper-cases to 'SS' and 'ı' to 'I'; both must stay invalid.
    expect(decodeBase32('MZXWßYTB').ok).toBe(false);
    expect(decodeBase32('MZXWıYTB').ok).toBe(false);
  });

  test('rejects empty and whitespace-only input', () => {
    for (const input of ['', '   ', '\n\t', '-- --']) {
      const result = decodeBase32(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/enter/i);
    }
  });

  test('rejects padding anywhere but the end, and input that is only padding', () => {
    for (const input of ['MZXW=6YTBOI', '=MZXW6YTB', '========']) {
      expect(decodeBase32(input).ok).toBe(false);
    }
    const middle = decodeBase32('MZXQ====MZXQ====');
    expect(middle.ok).toBe(false);
    if (!middle.ok) expect(middle.error).toMatch(/padding/i);
  });

  test('rejects padding of the wrong length', () => {
    for (const input of ['MY=', 'MY=======', 'MZXW6YTBOI=', 'MZXW6===='] ) {
      const result = decodeBase32(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/padding/i);
    }
  });

  test('rejects lengths that cannot be Base32 (1, 3 or 6 characters over a multiple of 8)', () => {
    for (const input of ['M', 'MZX', 'MZXW6Y', 'MZXW6YTBO', 'MZXW6YTBOIM', 'MZXW6YTBMZXW6Y']) {
      const result = decodeBase32(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/length/i);
    }
  });
});

test.describe('encodeBase32', () => {
  test('matches the RFC 4648 test vectors', () => {
    expect(encodeBase32(ascii(''))).toBe('');
    expect(encodeBase32(ascii('f'))).toBe('MY');
    expect(encodeBase32(ascii('fo'))).toBe('MZXQ');
    expect(encodeBase32(ascii('foo'))).toBe('MZXW6');
    expect(encodeBase32(ascii('foob'))).toBe('MZXW6YQ');
    expect(encodeBase32(ascii('fooba'))).toBe('MZXW6YTB');
    expect(encodeBase32(ascii('foobar'))).toBe('MZXW6YTBOI');
  });

  test('can add the RFC 4648 padding', () => {
    expect(encodeBase32(ascii('f'), { padded: true })).toBe('MY======');
    expect(encodeBase32(ascii('foo'), { padded: true })).toBe('MZXW6===');
    expect(encodeBase32(ascii('foobar'), { padded: true })).toBe('MZXW6YTBOI======');
    expect(encodeBase32(ascii('fooba'), { padded: true })).toBe('MZXW6YTB');
  });

  test('round-trips every length from 0 to 40 bytes', () => {
    for (let length = 0; length <= 40; length += 1) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + 11) % 256);
      const decoded = decodeBase32(encodeBase32(bytes));
      if (length === 0) {
        expect(decoded.ok).toBe(false);
      } else {
        expect(decoded.ok).toBe(true);
        if (decoded.ok) expect(Array.from(decoded.bytes)).toEqual(Array.from(bytes));
      }
    }
  });
});

test.describe('hotp (RFC 4226 Appendix D)', () => {
  const key = ascii(RFC_6238_SEEDS['SHA-1']);

  test('reproduces the 6-digit HOTP values for counters 0-9', async () => {
    for (const vector of RFC_4226_VECTORS) {
      expect(await hotp(key, vector.counter, { algorithm: 'SHA-1', digits: 6 })).toBe(vector.hotp);
    }
  });

  test('reproduces the 8-digit values from the published truncated integers', async () => {
    for (const vector of RFC_4226_VECTORS) {
      const expected = String(vector.truncated % 1e8).padStart(8, '0');
      expect(await hotp(key, vector.counter, { algorithm: 'SHA-1', digits: 8 })).toBe(expected);
    }
  });

  test('keeps leading zeros', async () => {
    // The RFC 6238 vector at t=1111111109 starts with a zero.
    const code = await totp(key, 1111111109 * 1000, { algorithm: 'SHA-1', digits: 8, period: 30 });
    expect(code).toBe('07081804');
    expect(code).toHaveLength(8);
  });

  test('uses all eight counter bytes', async () => {
    const small = await hotp(key, 1, { algorithm: 'SHA-1', digits: 8 });
    const large = await hotp(key, 2 ** 32 + 1, { algorithm: 'SHA-1', digits: 8 });
    expect(large).toMatch(/^\d{8}$/);
    expect(large).not.toBe(small);
  });

  test('rejects counters that are negative, fractional or too large', async () => {
    const options = { algorithm: 'SHA-1', digits: 6 } as const;
    await expect(hotp(key, -1, options)).rejects.toThrow(RangeError);
    await expect(hotp(key, 1.5, options)).rejects.toThrow(RangeError);
    await expect(hotp(key, Number.MAX_SAFE_INTEGER + 2, options)).rejects.toThrow(RangeError);
  });
});

test.describe('totp (RFC 6238 Appendix B)', () => {
  for (const algorithm of Object.keys(RFC_6238_SEEDS) as TotpAlgorithm[]) {
    test(`reproduces every ${algorithm} vector with 8 digits`, async () => {
      const key = ascii(RFC_6238_SEEDS[algorithm]);

      for (const vector of RFC_6238_VECTORS) {
        const code = await totp(key, vector.time * 1000, { algorithm, digits: 8, period: 30 });
        expect(code, `${algorithm} at ${vector.time}s`).toBe(vector[algorithm]);
      }
    });

    test(`gives the last six digits of the ${algorithm} vectors with 6 digits`, async () => {
      const key = ascii(RFC_6238_SEEDS[algorithm]);

      for (const vector of RFC_6238_VECTORS) {
        const code = await totp(key, vector.time * 1000, { algorithm, digits: 6, period: 30 });
        expect(code, `${algorithm} at ${vector.time}s`).toBe(vector[algorithm].slice(-6));
      }
    });
  }

  test('stays on one code for the whole 30 second window', async () => {
    const key = ascii(RFC_6238_SEEDS['SHA-1']);
    const options = { algorithm: 'SHA-1', digits: 8, period: 30 } as const;

    // 30..59 s is counter 1, so every instant matches the t=59 vector.
    for (const ms of [30_000, 30_001, 45_500, 58_999, 59_000, 59_999]) {
      expect(await totp(key, ms, options)).toBe('94287082');
    }
    expect(await totp(key, 60_000, options)).not.toBe('94287082');
    expect(await totp(key, 29_999, options)).toBe(await hotp(key, 0, options));
  });

  test('a 60 second period halves the counter', async () => {
    const key = ascii(RFC_6238_SEEDS['SHA-1']);

    // 60..119 s with a 60 s period is counter 1, the same as t=59 with 30 s.
    const code = await totp(key, 119_000, { algorithm: 'SHA-1', digits: 8, period: 60 });
    expect(code).toBe('94287082');
    expect(await totp(key, 59_000, { algorithm: 'SHA-1', digits: 8, period: 60 })).toBe(
      await hotp(key, 0, { algorithm: 'SHA-1', digits: 8 })
    );
  });
});

test.describe('totpCounter and secondsRemaining', () => {
  test('counts whole periods since the Unix epoch', () => {
    expect(totpCounter(0, 30)).toBe(0);
    expect(totpCounter(29_999, 30)).toBe(0);
    expect(totpCounter(30_000, 30)).toBe(1);
    expect(totpCounter(59_000, 30)).toBe(1);
    // The hex values are the "Value of T" column of RFC 6238 Appendix B.
    expect(totpCounter(1111111109 * 1000, 30)).toBe(0x23523ec);
    expect(totpCounter(1111111111 * 1000, 30)).toBe(0x23523ed);
    expect(totpCounter(1234567890 * 1000, 30)).toBe(0x273ef07);
    expect(totpCounter(2000000000 * 1000, 30)).toBe(0x3f940aa);
    expect(totpCounter(20000000000 * 1000, 30)).toBe(0x27bc86aa);
    expect(totpCounter(119_999, 60)).toBe(1);
  });

  test('counts the seconds left in the current window', () => {
    expect(secondsRemaining(0, 30)).toBe(30);
    expect(secondsRemaining(1_000, 30)).toBe(29);
    expect(secondsRemaining(29_000, 30)).toBe(1);
    expect(secondsRemaining(29_999, 30)).toBe(1);
    expect(secondsRemaining(30_000, 30)).toBe(30);
    expect(secondsRemaining(59_000, 60)).toBe(1);
    expect(secondsRemaining(60_000, 60)).toBe(60);
  });
});

test.describe('computeTotpWindow', () => {
  const seed = encodeBase32(ascii(RFC_6238_SEEDS['SHA-1']));
  const options8: TotpOptions = { algorithm: 'SHA-1', digits: 8, period: 30 };

  test('the RFC seed encodes to the well-known Base32 string', () => {
    expect(seed).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  test('returns the previous, current and next codes around a moment in time', async () => {
    const result = await computeTotpWindow(seed, options8, 1111111109 * 1000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Counter 0x23523EC is the t=1111111109 vector; the next window is the
    // t=1111111111 vector.
    expect(result.current).toBe('07081804');
    expect(result.next).toBe('14050471');
    expect(result.previous).toBe(
      await hotp(ascii(RFC_6238_SEEDS['SHA-1']), 0x23523ec - 1, { algorithm: 'SHA-1', digits: 8 })
    );
    expect(result.counter).toBe(0x23523ec);
    expect(result.secondsRemaining).toBe(1);
  });

  test('works for every algorithm with the RFC vectors', async () => {
    for (const algorithm of Object.keys(RFC_6238_SEEDS) as TotpAlgorithm[]) {
      const secret = encodeBase32(ascii(RFC_6238_SEEDS[algorithm]));
      for (const vector of RFC_6238_VECTORS) {
        const result = await computeTotpWindow(
          secret,
          { algorithm, digits: 8, period: 30 },
          vector.time * 1000
        );
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.current, `${algorithm} at ${vector.time}s`).toBe(vector[algorithm]);
      }
    }
  });

  test('accepts a pasted secret with lower case, spaces and padding', async () => {
    const pasted = 'gezd gnbv gy3t qojq gezd gnbv gy3t qojq';
    const result = await computeTotpWindow(pasted, options8, 59_000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.current).toBe('94287082');
      expect(result.previous).toBe('84755224');
      expect(result.secretBits).toBe(160);
    }
  });

  test('accepts the padded Base32 form of a 32-byte secret in lower case with spaces', async () => {
    // 32 bytes is 52 characters, so RFC 4648 pads it with "====".
    const secret = encodeBase32(ascii(RFC_6238_SEEDS['SHA-256']), { padded: true });
    expect(secret).toMatch(/={4}$/);

    const grouped = secret.toLowerCase().replace(/(.{4})/g, '$1 ');
    const result = await computeTotpWindow(grouped, { algorithm: 'SHA-256', digits: 8, period: 30 }, 59_000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.current).toBe('46119246');
      expect(result.secretBits).toBe(256);
    }
  });

  test('has no previous code in the very first window', async () => {
    const result = await computeTotpWindow(seed, options8, 5_000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.counter).toBe(0);
      expect(result.previous).toBeNull();
      expect(result.current).toBe('84755224');
      expect(result.secondsRemaining).toBe(25);
    }
  });

  test('previous, current and next are consecutive windows of a 60 second period', async () => {
    const options: TotpOptions = { algorithm: 'SHA-1', digits: 8, period: 60 };
    const result = await computeTotpWindow(seed, options, 119_000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.counter).toBe(1);
      expect(result.current).toBe('94287082');
      expect(result.previous).toBe('84755224');
      expect(result.next).toBe(await hotp(ascii(RFC_6238_SEEDS['SHA-1']), 2, { algorithm: 'SHA-1', digits: 8 }));
      expect(result.secondsRemaining).toBe(1);
    }
  });

  test('reports short secrets by their size in bits', async () => {
    const result = await computeTotpWindow('MZXW6YTBOI======', SHA1_OPTIONS, 59_000);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.secretBits).toBe(48);
  });

  test('returns an error result for a bad secret instead of throwing', async () => {
    for (const secret of ['', '   ', 'not base32!', 'GEZDGNB1']) {
      const result = await computeTotpWindow(secret, SHA1_OPTIONS, 59_000);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
    }
  });

  test('returns an error result for unsupported options or a bad time', async () => {
    const bad: Array<[Partial<Record<keyof TotpOptions, unknown>>, number]> = [
      [{ algorithm: 'MD5' }, 59_000],
      [{ digits: 7 }, 59_000],
      [{ digits: 0 }, 59_000],
      [{ period: 0 }, 59_000],
      [{ period: -30 }, 59_000],
      [{ period: 30.5 }, 59_000],
      [{}, Number.NaN],
      [{}, Number.POSITIVE_INFINITY],
      [{}, -1],
    ];

    for (const [override, time] of bad) {
      const result = await computeTotpWindow(seed, { ...SHA1_OPTIONS, ...override } as TotpOptions, time);
      expect(result.ok, JSON.stringify(override)).toBe(false);
    }
  });
});

test.describe('buildOtpauthUri', () => {
  test('builds the Key URI Format link with every parameter', () => {
    const result = buildOtpauthUri({
      ...SHA1_OPTIONS,
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'ACME Co',
      account: 'john@example.com',
    });

    expect(result).toEqual({
      ok: true,
      uri: 'otpauth://totp/ACME%20Co:john%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&algorithm=SHA1&digits=6&period=30',
    });
  });

  test('writes the chosen algorithm, digits and period', () => {
    const sha256 = buildOtpauthUri({
      algorithm: 'SHA-256',
      digits: 8,
      period: 60,
      secret: 'JBSWY3DPEHPK3PXP',
      account: 'alice',
    });
    const sha512 = buildOtpauthUri({
      algorithm: 'SHA-512',
      digits: 6,
      period: 30,
      secret: 'JBSWY3DPEHPK3PXP',
      account: 'alice',
    });

    expect(sha256.ok && sha256.uri).toContain('algorithm=SHA256&digits=8&period=60');
    expect(sha512.ok && sha512.uri).toContain('algorithm=SHA512&digits=6&period=30');
  });

  test('normalises the secret: upper case, no spaces, no padding', () => {
    const result = buildOtpauthUri({
      ...SHA1_OPTIONS,
      secret: 'mzxw 6ytb oi==  ====',
      account: 'alice',
    });

    expect(result.ok && result.uri).toContain('?secret=MZXW6YTBOI&');
  });

  test('uses the issuer alone, the account alone, or a default label', () => {
    const issuerOnly = buildOtpauthUri({ ...SHA1_OPTIONS, secret: 'MZXW6YTB', issuer: 'ACME' });
    const accountOnly = buildOtpauthUri({ ...SHA1_OPTIONS, secret: 'MZXW6YTB', account: 'alice' });
    const neither = buildOtpauthUri({ ...SHA1_OPTIONS, secret: 'MZXW6YTB' });
    const blanks = buildOtpauthUri({ ...SHA1_OPTIONS, secret: 'MZXW6YTB', issuer: '  ', account: '' });

    expect(issuerOnly.ok && issuerOnly.uri).toBe(
      'otpauth://totp/ACME?secret=MZXW6YTB&issuer=ACME&algorithm=SHA1&digits=6&period=30'
    );
    expect(accountOnly.ok && accountOnly.uri).toBe(
      'otpauth://totp/alice?secret=MZXW6YTB&algorithm=SHA1&digits=6&period=30'
    );
    expect(neither.ok && neither.uri).toBe(
      'otpauth://totp/Account?secret=MZXW6YTB&algorithm=SHA1&digits=6&period=30'
    );
    expect(blanks).toEqual(neither);
  });

  test('keeps colons and reserved characters out of the label and parameters', () => {
    const result = buildOtpauthUri({
      ...SHA1_OPTIONS,
      secret: 'MZXW6YTB',
      issuer: 'Acme: Prod & Co',
      account: 'ann/lee?x=1#y',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.uri).toContain('otpauth://totp/Acme%20Prod%20%26%20Co:ann%2Flee%3Fx%3D1%23y?');

    const parsed = new URL(result.uri);
    expect(parsed.searchParams.get('issuer')).toBe('Acme Prod & Co');
    expect(parsed.searchParams.get('secret')).toBe('MZXW6YTB');
    expect(parsed.searchParams.get('period')).toBe('30');
  });

  test('percent-encodes non-ASCII issuers and accounts so the link round-trips', () => {
    const result = buildOtpauthUri({
      ...SHA1_OPTIONS,
      secret: 'MZXW6YTB',
      issuer: 'Café ☕',
      account: 'élan@exemple.fr',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.uri).not.toMatch(/[^\x20-\x7e]/);
    expect(new URL(result.uri).searchParams.get('issuer')).toBe('Café ☕');
    expect(decodeURIComponent(new URL(result.uri).pathname)).toBe('/Café ☕:élan@exemple.fr');
  });

  test('refuses an invalid or empty secret with an error result', () => {
    for (const secret of ['', '   ', 'not base32', 'MZXW6Y']) {
      const result = buildOtpauthUri({ ...SHA1_OPTIONS, secret, account: 'alice' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
    }
  });

  test('refuses unsupported options with an error result', () => {
    const result = buildOtpauthUri({
      ...SHA1_OPTIONS,
      digits: 7 as never,
      secret: 'MZXW6YTB',
    });
    expect(result.ok).toBe(false);
  });

  test('the link carries the same secret that produces the codes', async () => {
    const secret = encodeBase32(ascii(RFC_6238_SEEDS['SHA-1']));
    const built = buildOtpauthUri({ ...SHA1_OPTIONS, digits: 8, secret, account: 'alice' });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const fromLink = new URL(built.uri).searchParams.get('secret') ?? '';
    const result = await computeTotpWindow(fromLink, { ...SHA1_OPTIONS, digits: 8 }, 59_000);
    expect(result.ok && result.current).toBe('94287082');
  });
});

test.describe('generateSecret', () => {
  test('makes a 160-bit secret as 32 Base32 characters', () => {
    const secret = generateSecret();

    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const decoded = decodeBase32(secret);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.bytes).toHaveLength(20);
  });

  test('can make secrets of another size', () => {
    const secret = generateSecret(32);

    expect(secret).toMatch(/^[A-Z2-7]{52}$/);
    const decoded = decodeBase32(secret);
    expect(decoded.ok && decoded.bytes.length).toBe(32);
  });

  test('is random and produces secrets that work', async () => {
    const secrets = new Set(Array.from({ length: 20 }, () => generateSecret()));
    expect(secrets.size).toBe(20);

    const result = await computeTotpWindow([...secrets][0], SHA1_OPTIONS, 59_000);
    expect(result.ok).toBe(true);
  });

  test('rejects sizes that are not a positive whole number of bytes', () => {
    for (const size of [0, -1, 1.5, Number.NaN]) {
      expect(() => generateSecret(size)).toThrow(RangeError);
    }
  });
});

test.describe('formatCode', () => {
  test('groups six digits as 3 + 3 and eight digits as 4 + 4', () => {
    expect(formatCode('123456')).toBe('123 456');
    expect(formatCode('007081')).toBe('007 081');
    expect(formatCode('07081804')).toBe('0708 1804');
  });

  test('leaves other lengths alone', () => {
    expect(formatCode('')).toBe('');
    expect(formatCode('12345')).toBe('12345');
  });
});
