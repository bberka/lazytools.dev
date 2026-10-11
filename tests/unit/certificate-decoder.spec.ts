import { test, expect } from '@playwright/test';
import {
  decodeCertificate,
  fingerprintCertificate,
  pemFromBytes,
  type CertInfo,
  type DistinguishedName,
  type ExtValue,
} from '@/lib/tools/certificate-decoder';

// ── Real certificates ─────────────────────────────────────────────────────────
// Both were made with OpenSSL 3.5; the values they are checked against below
// come from `openssl x509 -noout -text -serial -fingerprint`, not from this code.

/** RSA 2048, self-signed, valid 2024-01-01 to 2034-01-01, with every extension the tool decodes. */
const LEAF_PEM = `-----BEGIN CERTIFICATE-----
MIIFyjCCBLKgAwIBAgIJAKGyw9Tl9gcYMA0GCSqGSIb3DQEBCwUAMIHYMRMwEQYK
CZImiZPyLGQBGRYDY29tMRcwFQYKCZImiZPyLGQBGRYHZXhhbXBsZTELMAkGA1UE
BhMCREUxDzANBgNVBAgMBkJheWVybjERMA8GA1UEBwwITcO8bmNoZW4xFTATBgNV
BAoMDEV4YW1wbGUgR21iSDERMA8GA1UECwwIUGxhdGZvcm0xETAPBgNVBAsMCFNl
Y3VyaXR5MRgwFgYDVQQDDA93d3cuZXhhbXBsZS5jb20xIDAeBgkqhkiG9w0BCQEW
EWFkbWluQGV4YW1wbGUuY29tMB4XDTI0MDEwMTAwMDAwMFoXDTM0MDEwMTAwMDAw
MFowgdgxEzARBgoJkiaJk/IsZAEZFgNjb20xFzAVBgoJkiaJk/IsZAEZFgdleGFt
cGxlMQswCQYDVQQGEwJERTEPMA0GA1UECAwGQmF5ZXJuMREwDwYDVQQHDAhNw7xu
Y2hlbjEVMBMGA1UECgwMRXhhbXBsZSBHbWJIMREwDwYDVQQLDAhQbGF0Zm9ybTER
MA8GA1UECwwIU2VjdXJpdHkxGDAWBgNVBAMMD3d3dy5leGFtcGxlLmNvbTEgMB4G
CSqGSIb3DQEJARYRYWRtaW5AZXhhbXBsZS5jb20wggEiMA0GCSqGSIb3DQEBAQUA
A4IBDwAwggEKAoIBAQCx4+27C7cmaoTFMgeU0RcVe4QFlXWG1BcERiRWuJh9xAFB
RjPdyHfJCazoWn02wuKgkxGryNPuA+ZY9leESKsOgYYxtiU6dFaDbydQV/Rrp4e8
NGCavbxpPbr7lLotVQ3sTnE8NQlj/OeqsdI5q513+v1Wof7Sn1j4DUjzSk5YZdvs
qSTird+/EVjx8wP83rCwqmxuavzARu7Q3uVNFuoz4/p69vNXy2ziVx28BMK9JjqM
WHoUotYpet9LH1s8ddpCXsacnNcG2vUmZBFMeVt6LbyN5uMulST9cQWqRz32L523
kQTdeveDGECMKWwXYFSGbNM6biw923c4N4NXJdnXAgMBAAGjggGTMIIBjzAMBgNV
HRMBAf8EAjAAMA4GA1UdDwEB/wQEAwIFoDAdBgNVHSUEFjAUBggrBgEFBQcDAQYI
KwYBBQUHAwIwHQYDVR0OBBYEFMj4qQ1D8bHopI/irO3+E5YgDrymMIGhBgNVHREE
gZkwgZaCD3d3dy5leGFtcGxlLmNvbYILZXhhbXBsZS5jb22HBMAAAgqHECABDbgA
AAAAAAAAAAAAAAGBEWFkbWluQGV4YW1wbGUuY29thhZodHRwczovL2V4YW1wbGUu
Y29tL2lkpDMwMTEVMBMGA1UECgwMRXhhbXBsZSBHbWJIMRgwFgYDVQQDDA9EaXJl
Y3RvcnkgRW50cnkwXQYIKwYBBQUHAQEEUTBPMCMGCCsGAQUFBzABhhdodHRwOi8v
b2NzcC5leGFtcGxlLmNvbTAoBggrBgEFBQcwAoYcaHR0cDovL2NhLmV4YW1wbGUu
Y29tL2NhLmNydDAuBgNVHR8EJzAlMCOgIaAfhh1odHRwOi8vY3JsLmV4YW1wbGUu
Y29tL2NhLmNybDANBgkqhkiG9w0BAQsFAAOCAQEAJv4p/2R7nce0Ot8dol3iLYYw
ksqGjE8/eZ64pbgaRaWznuBOnW8aQq9RWS7O5ICyWvIf5N3qOoeZ0gfZePV7NK6P
91hmbEVL+k4iJ9crS8REkEG4V/EA1R+KmosTGUDBhPrdgW1kO+Kpf5TYEFmZ4NvF
Yx1w9/iaFZsOMhltvMiNRXlPnw/ky6CFkIUhfOQ/qMj9G8CnAis7vJyp2GxWZAYb
BHI7p/wROtZw83BmHVAnUpaelU2ryo1yJ0FbY+bQecZrbPaeATOHaiUYjrbpWeWV
FPHqYTOMRmsk0v1i6TeGedtjoBXZPcKFGcZwQ6+S9Qq09Jabgb88AggrxSaahQ==
-----END CERTIFICATE-----`;

const LEAF_SHA1 = '1F:B6:11:D7:74:80:31:50:74:41:1B:45:63:90:C0:A8:F3:EC:33:D7';
const LEAF_SHA256 =
  'A7:59:3A:B9:27:81:00:1D:D2:A2:AC:6E:92:9E:92:C5:E1:25:A7:C6:AA:1F:40:82:1E:CA:97:81:AD:26:1B:42';

/** EC P-521 CA, self-signed, valid 2020-01-01 to 2021-01-01. */
const CA_PEM = `-----BEGIN CERTIFICATE-----
MIICSjCCAaygAwIBAgIUacXgI+wmvykk/9c0ZjM7zOyGnlowCgYIKoZIzj0EAwMw
PjELMAkGA1UEBhMCVVMxEjAQBgNVBAoMCVRlc3QgUm9vdDEbMBkGA1UEAwwSVGVz
dCBSb290IENBIFAtNTIxMB4XDTIwMDEwMTAwMDAwMFoXDTIxMDEwMTAwMDAwMFow
PjELMAkGA1UEBhMCVVMxEjAQBgNVBAoMCVRlc3QgUm9vdDEbMBkGA1UEAwwSVGVz
dCBSb290IENBIFAtNTIxMIGbMBAGByqGSM49AgEGBSuBBAAjA4GGAAQAjnmGRLY9
IeVJ1ae4WF1HjXLy/p6xo8GciJVhZRakP6RQr3S9i3Yey/AmJps6dn8BmBxr5zrq
dr4zkclOsooHmnEAcm/nG0RPmRXMZX3HIWbg1rcPeXqKF+utSk1xxeE2vZOkX+tW
Aez6bkzWTAZRtfhJEkEDnUqsw8ZF/Ux+Nzuvts2jRTBDMBIGA1UdEwEB/wQIMAYB
Af8CAQAwDgYDVR0PAQH/BAQDAgEGMB0GA1UdDgQWBBSdc2yx6AY791TxmKW3OhYK
AcXX4TAKBggqhkjOPQQDAwOBiwAwgYcCQXsuEscpT9RTNOmCzA0RUB9LsRHVElaA
6MO91k/MojWJCex0inJZPnKqbA+3vlTTsNOYAjOoO7DnBX1lZsfNEwZXAkIB/tTZ
oWf6fVf7AsyKoz5avKKVxJjtpdHw31hG5cDWTAqWLD0KCzvFmO1hfuUeXTuiCzgm
BhzFVHP0GjwZjf/Vph0=
-----END CERTIFICATE-----`;

const CA_SHA1 = '25:07:65:03:1B:8E:42:2B:52:AC:54:9D:97:F6:F9:16:25:53:C3:01';
const CA_SHA256 =
  '6F:5E:AB:65:BE:04:0B:E3:48:E1:0E:0D:D6:9C:9B:EB:BF:18:90:BB:AE:C7:B0:AA:68:6E:7B:A1:38:5E:59:88';

const IN_2026 = Date.UTC(2026, 5, 1);
const NOT_A_CERTIFICATE = /not a valid X\.509 certificate/;

const pemBody = (pem: string) => pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
const pemToBytes = (pem: string) => Uint8Array.from(atob(pemBody(pem)), (char) => char.charCodeAt(0));

function extension(cert: CertInfo, name: string): ExtValue {
  const found = cert.extensions.find((ext) => ext.name === name);
  if (!found) throw new Error(`No ${name} extension`);
  return found.value;
}

const nameText = (name: DistinguishedName) => name.map((attribute) => `${attribute.type}=${attribute.value}`);

// ── A small DER writer, for certificates OpenSSL will not make ────────────────
// The decoder never checks the signature, so a hand-built structure is enough
// to exercise one field at a time.

type Part = Uint8Array | number[];

function tlv(tag: number, ...parts: Part[]): Uint8Array {
  const body = parts.flatMap((part) => Array.from(part));
  const length =
    body.length < 0x80
      ? [body.length]
      : body.length < 0x100
        ? [0x81, body.length]
        : [0x82, body.length >> 8, body.length & 0xff];
  return Uint8Array.from([tag, ...length, ...body]);
}

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const seq = (...parts: Part[]) => tlv(0x30, ...parts);
const set = (...parts: Part[]) => tlv(0x31, ...parts);
const explicit = (tag: number, ...parts: Part[]) => tlv(0xa0 + tag, ...parts);
const integer = (...bytes: number[]) => tlv(0x02, bytes);
const utf8String = (text: string) => tlv(0x0c, new TextEncoder().encode(text));
const utcTime = (text: string) => tlv(0x17, ascii(text));
const generalizedTime = (text: string) => tlv(0x18, ascii(text));
const bitString = (...bytes: number[]) => tlv(0x03, [0, ...bytes]);

function oid(dotted: string): Uint8Array {
  const [first, second, ...rest] = dotted.split('.').map(Number);
  const base128 = (value: number) => {
    const digits = [value & 0x7f];
    for (let v = value >>> 7; v > 0; v >>>= 7) digits.unshift((v & 0x7f) | 0x80);
    return digits;
  };
  return tlv(0x06, [first * 40 + second, ...rest].flatMap(base128));
}

const attribute = (type: string, value: Uint8Array) => set(seq(oid(type), value));
const CN = '2.5.4.3';

interface CertificateParts {
  subject?: Uint8Array;
  issuer?: Uint8Array;
  notBefore?: Uint8Array;
  notAfter?: Uint8Array;
  extensions?: Uint8Array[];
}

function buildCertificate(parts: CertificateParts = {}): Uint8Array {
  const signatureAlgorithm = seq(oid('1.2.840.113549.1.1.11'), tlv(0x05));
  const name = seq(attribute(CN, utf8String('Hand Built')));
  const tbs = seq(
    explicit(0, integer(2)),
    integer(0x01, 0x02),
    signatureAlgorithm,
    parts.issuer ?? name,
    seq(parts.notBefore ?? utcTime('240101000000Z'), parts.notAfter ?? utcTime('340101000000Z')),
    parts.subject ?? name,
    seq(seq(oid('1.3.101.112')), bitString(...new Array<number>(32).fill(7))),
    ...(parts.extensions ? [explicit(3, seq(...parts.extensions))] : [])
  );
  return seq(tbs, signatureAlgorithm, bitString(0xde, 0xad));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('decodeCertificate: an RSA certificate', () => {
  const { cert, der, certificateCount } = decodeCertificate(LEAF_PEM, IN_2026);

  test('reads the fields OpenSSL reports', () => {
    expect(certificateCount).toBe(1);
    expect(cert.version).toBe(3);
    expect(cert.serialNumber).toBe('A1:B2:C3:D4:E5:F6:07:18');
    expect(cert.sigAlg).toBe('sha256WithRSAEncryption');
    expect(cert.validFrom.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(cert.validTo.toISOString()).toBe('2034-01-01T00:00:00.000Z');
    expect(cert.pkAlg).toBe('RSA');
    expect(cert.pkBits).toBe(2048);
    expect(cert.pkCurve).toBeUndefined();
    expect(cert.isSelfSigned).toBe(true);
    expect(der).toHaveLength(1486);
  });

  // Defect: a name was kept as one value per attribute type, so of several
  // OU or DC entries only the last one was shown.
  test('keeps every attribute of a name, repeated types included, in certificate order', () => {
    const expected = [
      'DC=com',
      'DC=example',
      'C=DE',
      'ST=Bayern',
      'L=München',
      'O=Example GmbH',
      'OU=Platform',
      'OU=Security',
      'CN=www.example.com',
      'emailAddress=admin@example.com',
    ];
    expect(nameText(cert.subject)).toEqual(expected);
    expect(nameText(cert.issuer)).toEqual(expected);
  });

  test('decodes the extensions', () => {
    expect(cert.extensions.map((ext) => [ext.name, ext.critical])).toEqual([
      ['basicConstraints', true],
      ['keyUsage', true],
      ['extKeyUsage', false],
      ['subjectKeyIdentifier', false],
      ['subjectAltName', false],
      ['authorityInfoAccess', false],
      ['cRLDistributionPoints', false],
    ]);
    expect(extension(cert, 'basicConstraints')).toEqual({ kind: 'bc', isCA: false, pathLen: undefined });
    expect(extension(cert, 'keyUsage')).toEqual({ kind: 'list', items: ['Digital Signature', 'Key Encipherment'] });
    expect(extension(cert, 'extKeyUsage')).toEqual({ kind: 'list', items: ['TLS Server Auth', 'TLS Client Auth'] });
    expect(extension(cert, 'subjectKeyIdentifier')).toEqual({
      kind: 'text',
      value: 'C8:F8:A9:0D:43:F1:B1:E8:A4:8F:E2:AC:ED:FE:13:96:20:0E:BC:A6',
    });
    expect(extension(cert, 'authorityInfoAccess')).toEqual({
      kind: 'aia',
      ocsp: 'http://ocsp.example.com',
      caIssuers: 'http://ca.example.com/ca.crt',
    });
    expect(extension(cert, 'cRLDistributionPoints')).toEqual({
      kind: 'list',
      items: ['http://crl.example.com/ca.crl'],
    });
  });

  // Defect (last entry): a directory name in the SAN list was read one level
  // too high and always came out empty.
  test('decodes every kind of subject alternative name', () => {
    expect(extension(cert, 'subjectAltName')).toEqual({
      kind: 'list',
      items: [
        'DNS: www.example.com',
        'DNS: example.com',
        'IP: 192.0.2.10',
        'IP: 2001:0DB8:0000:0000:0000:0000:0000:0001',
        'email: admin@example.com',
        'URI: https://example.com/id',
        'dir: CN=Directory Entry, O=Example GmbH',
      ],
    });
  });

  test('fingerprints match OpenSSL', async () => {
    expect(await fingerprintCertificate(der)).toEqual({ sha1: LEAF_SHA1, sha256: LEAF_SHA256 });
  });
});

test.describe('decodeCertificate: an EC certificate', () => {
  const { cert, der } = decodeCertificate(CA_PEM, IN_2026);

  test('reads the fields OpenSSL reports', async () => {
    expect(cert.serialNumber).toBe('69:C5:E0:23:EC:26:BF:29:24:FF:D7:34:66:33:3B:CC:EC:86:9E:5A');
    expect(cert.sigAlg).toBe('ecdsa-with-SHA384');
    expect(nameText(cert.subject)).toEqual(['C=US', 'O=Test Root', 'CN=Test Root CA P-521']);
    expect(cert.pkAlg).toBe('EC');
    expect(cert.pkCurve).toBe('P-521');
    expect(extension(cert, 'basicConstraints')).toEqual({ kind: 'bc', isCA: true, pathLen: 0 });
    expect(extension(cert, 'keyUsage')).toEqual({ kind: 'list', items: ['Key Cert Sign', 'CRL Sign'] });
    expect(await fingerprintCertificate(der)).toEqual({ sha1: CA_SHA1, sha256: CA_SHA256 });
  });

  // Defect: the size was taken from the encoded point, which is padded to
  // whole bytes, so a P-521 key was reported as 528 bits.
  test('reports a P-521 key as 521 bits', () => {
    expect(cert.pkBits).toBe(521);
  });
});

test.describe('decodeCertificate: validity', () => {
  test('is valid inside the period', () => {
    const { cert } = decodeCertificate(LEAF_PEM, IN_2026);
    expect([cert.isExpired, cert.isNotYetValid]).toEqual([false, false]);
  });

  test('is expired after the period', () => {
    expect(decodeCertificate(CA_PEM, IN_2026).cert.isExpired).toBe(true);
    expect(decodeCertificate(LEAF_PEM, Date.UTC(2034, 0, 1, 0, 0, 1)).cert.isExpired).toBe(true);
  });

  // Defect: only the end of the period was checked, so a certificate whose
  // period had not begun was shown as valid.
  test('is not yet valid before the period', () => {
    const { cert } = decodeCertificate(LEAF_PEM, Date.UTC(2023, 11, 31, 23, 59, 59));
    expect([cert.isExpired, cert.isNotYetValid]).toEqual([false, true]);
  });

  test('judges against the current time by default', () => {
    const { cert } = decodeCertificate(CA_PEM);
    expect(cert.isExpired).toBe(true);
  });

  test('reads two-digit years the way RFC 5280 says', () => {
    const { cert } = decodeCertificate(
      buildCertificate({ notBefore: utcTime('500101000000Z'), notAfter: utcTime('491231235959Z') })
    );
    expect(cert.validFrom.toISOString()).toBe('1950-01-01T00:00:00.000Z');
    expect(cert.validTo.toISOString()).toBe('2049-12-31T23:59:59.000Z');
  });

  test('reads GeneralizedTime, including the "no expiry" date', () => {
    const { cert } = decodeCertificate(
      buildCertificate({ notBefore: generalizedTime('20500228120000Z'), notAfter: generalizedTime('99991231235959Z') }),
      IN_2026
    );
    expect(cert.validFrom.toISOString()).toBe('2050-02-28T12:00:00.000Z');
    expect(cert.validTo.toISOString()).toBe('9999-12-31T23:59:59.000Z');
    expect(cert.isNotYetValid).toBe(true);
  });

  // Defect: an unreadable date became "Invalid Date" next to a green Valid badge.
  test('refuses a certificate whose validity dates cannot be read', () => {
    expect(() => decodeCertificate(buildCertificate({ notAfter: utcTime('not a date') }))).toThrow(
      /validity date that cannot be read/
    );
  });
});

test.describe('decodeCertificate: names and identifiers', () => {
  // Defect: TeletexString values were decoded as UTF-8, which turned every
  // accented letter into a replacement character.
  test('decodes Teletex, BMP and Universal strings', () => {
    const { cert } = decodeCertificate(
      buildCertificate({
        subject: seq(
          attribute(CN, tlv(0x14, [0x43, 0x61, 0x66, 0xe9])),
          attribute('2.5.4.10', tlv(0x1e, [0x00, 0x5a, 0x00, 0x6f, 0x00, 0xeb])),
          attribute('2.5.4.11', tlv(0x1c, [0x00, 0x01, 0xf5, 0x11]))
        ),
      })
    );
    expect(nameText(cert.subject)).toEqual(['CN=Café', 'O=Zoë', 'OU=🔑']);
    expect(cert.isSelfSigned).toBe(false);
  });

  test('shows an attribute it has no name for by its OID', () => {
    const { cert } = decodeCertificate(
      buildCertificate({ subject: seq(attribute('1.3.6.1.4.1.311.60.2.1.3', utf8String('US'))) })
    );
    expect(nameText(cert.subject)).toEqual(['1.3.6.1.4.1.311.60.2.1.3=US']);
  });

  // Defect: an OID under arc 2 whose second number is 40 or more was split wrongly.
  test('decodes OIDs whose second arc is 40 or more', () => {
    const { cert } = decodeCertificate(
      buildCertificate({ extensions: [seq(oid('2.999.3'), tlv(0x04, [0x05, 0x00]))] })
    );
    expect(cert.extensions).toEqual([
      { oid: '2.999.3', name: '2.999.3', critical: false, value: { kind: 'raw', hex: '0500' } },
    ]);
  });

  test('reads a certificate without extensions', () => {
    const { cert } = decodeCertificate(buildCertificate());
    expect(cert.extensions).toEqual([]);
    expect(cert.pkAlg).toBe('Ed25519');
    expect(cert.pkBits).toBeUndefined();
    expect(cert.serialNumber).toBe('01:02');
  });
});

test.describe('decodeCertificate: input formats', () => {
  // Defect: every PEM block was glued together before decoding, so a chain
  // either failed to decode or got fingerprints computed over all of it.
  test('decodes the first certificate of a chain and counts the rest', async () => {
    const chain = decodeCertificate(`${LEAF_PEM}\n${CA_PEM}\n`, IN_2026);
    expect(chain.certificateCount).toBe(2);
    expect(chain.cert.serialNumber).toBe('A1:B2:C3:D4:E5:F6:07:18');
    expect(await fingerprintCertificate(chain.der)).toEqual({ sha1: LEAF_SHA1, sha256: LEAF_SHA256 });

    const reversed = decodeCertificate(`${CA_PEM}\n${LEAF_PEM}`, IN_2026);
    expect(reversed.certificateCount).toBe(2);
    expect(await fingerprintCertificate(reversed.der)).toEqual({ sha1: CA_SHA1, sha256: CA_SHA256 });
  });

  // Defect: text around the block went into the Base64 decoder with it.
  test('skips text before and after the PEM block', () => {
    const wrapped = [
      'Bag Attributes',
      '    friendlyName: www.example.com',
      'subject=CN = www.example.com',
      'issuer=CN = www.example.com',
      LEAF_PEM,
      'trailing notes',
    ].join('\n');
    expect(decodeCertificate(wrapped, IN_2026).cert.serialNumber).toBe('A1:B2:C3:D4:E5:F6:07:18');
  });

  test('accepts Windows line endings, one-line PEM and a missing END line', () => {
    const crlf = LEAF_PEM.replace(/\n/g, '\r\n');
    const oneLine = LEAF_PEM.replace(/\n/g, ' ');
    const noEnd = LEAF_PEM.replace('-----END CERTIFICATE-----', '');
    for (const pem of [crlf, oneLine, noEnd, `\n\n  ${LEAF_PEM}  \n`]) {
      expect(decodeCertificate(pem, IN_2026).cert.pkBits).toBe(2048);
    }
  });

  test('decodes DER bytes', async () => {
    const { cert, der } = decodeCertificate(pemToBytes(CA_PEM), IN_2026);
    expect(cert.pkCurve).toBe('P-521');
    expect(await fingerprintCertificate(der)).toEqual({ sha1: CA_SHA1, sha256: CA_SHA256 });
  });

  // Defect: the fingerprint covered the whole file, trailing bytes included.
  test('leaves bytes after the certificate out of the fingerprint', async () => {
    const der = pemToBytes(CA_PEM);
    const padded = new Uint8Array(der.length + 3);
    padded.set(der);
    padded.set([0x0d, 0x0a, 0x00], der.length);

    const decoded = decodeCertificate(padded, IN_2026);
    expect(decoded.der).toHaveLength(der.length);
    expect(await fingerprintCertificate(decoded.der)).toEqual({ sha1: CA_SHA1, sha256: CA_SHA256 });
  });

  // Defect: a PEM file was only recognised when its very first bytes were
  // the BEGIN line.
  test('recognises a PEM file that starts with a byte-order mark or other text', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(LEAF_PEM)]);
    const withPreamble = new TextEncoder().encode(`Bag Attributes\n    localKeyID: 01\n${LEAF_PEM}\n`);
    for (const bytes of [withBom, withPreamble]) {
      expect(pemFromBytes(bytes)).toContain('-----BEGIN CERTIFICATE-----');
      expect(decodeCertificate(bytes, IN_2026).cert.serialNumber).toBe('A1:B2:C3:D4:E5:F6:07:18');
    }
    expect(pemFromBytes(pemToBytes(LEAF_PEM))).toBeNull();
  });
});

test.describe('decodeCertificate: input that is not a certificate', () => {
  test('asks for PEM when the text has no PEM block', () => {
    for (const text of ['', '   ', 'hello', pemBody(LEAF_PEM), '-----BEGIN']) {
      expect(() => decodeCertificate(text), JSON.stringify(text.slice(0, 20))).toThrow(
        'Expected a PEM certificate starting with -----BEGIN CERTIFICATE-----'
      );
    }
  });

  // Defect: other PEM objects were pushed through the certificate parser and
  // failed with messages such as "Cannot read properties of undefined".
  test('names the PEM object it was given instead', () => {
    const block = (label: string) => `-----BEGIN ${label}-----\nMIIBVAIBADANBgkq\n-----END ${label}-----`;
    expect(() => decodeCertificate(block('PRIVATE KEY'))).toThrow(/This is a private key, not a certificate/);
    expect(() => decodeCertificate(block('RSA PRIVATE KEY'))).toThrow(/This is a private key, not a certificate/);
    expect(() => decodeCertificate(block('CERTIFICATE REQUEST'))).toThrow(/certificate signing request \(CSR\)/);
    expect(() => decodeCertificate(block('PUBLIC KEY'))).toThrow(/This is a public key, not a certificate/);
    expect(() => decodeCertificate(block('PKCS7'))).toThrow(/This is a PKCS#7 bundle, not a certificate/);
    expect(() => decodeCertificate(block('X509 CRL'))).toThrow(/certificate revocation list/);
    expect(() => decodeCertificate(block('DH PARAMETERS'))).toThrow(/This is a "DH PARAMETERS" block/);
  });

  test('finds the certificate among other PEM objects', () => {
    const bundle = `-----BEGIN PRIVATE KEY-----\nMIIBVAIBADANBgkq\n-----END PRIVATE KEY-----\n${CA_PEM}`;
    const decoded = decodeCertificate(bundle, IN_2026);
    expect(decoded.certificateCount).toBe(1);
    expect(decoded.cert.pkCurve).toBe('P-521');
  });

  test('reports damaged Base64', () => {
    const damaged = LEAF_PEM.replace('MIIFyjCC', 'MIIF*jCC');
    expect(() => decodeCertificate(damaged)).toThrow(/not valid Base64/);
  });

  test('reports a certificate that was cut off, in a sentence', () => {
    const lines = LEAF_PEM.split('\n');
    const cutOff = [...lines.slice(0, 12), lines[lines.length - 1]].join('\n');
    expect(() => decodeCertificate(cutOff)).toThrow(NOT_A_CERTIFICATE);
    expect(() => decodeCertificate(pemToBytes(CA_PEM).subarray(0, 200))).toThrow(NOT_A_CERTIFICATE);
  });

  test('reports bytes and structures that are not a certificate', () => {
    const emptyBlock = '-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----';
    const notASequence = tlv(0x04, [1, 2, 3]);
    const tooFewParts = seq(seq(), seq());
    const hollow = seq(seq(), seq(), bitString(0));
    const csrLike = seq(seq(integer(0), seq(), seq(), explicit(0)), seq(), bitString(0));
    const inputs = [
      emptyBlock,
      new Uint8Array(0),
      new Uint8Array([1, 2, 3, 4]),
      notASequence,
      tooFewParts,
      hollow,
      csrLike,
    ];
    for (const input of inputs) {
      expect(() => decodeCertificate(input)).toThrow(NOT_A_CERTIFICATE);
    }
  });

  test('does not overflow the stack on deeply nested data', () => {
    let nested = seq();
    for (let i = 0; i < 500; i++) nested = seq(nested);
    expect(() => decodeCertificate(nested)).toThrow(NOT_A_CERTIFICATE);
  });
});
