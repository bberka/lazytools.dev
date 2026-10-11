// Certificate Decoder logic: read an X.509 certificate from PEM text or DER
// bytes and describe it. No React and no DOM, so it runs in the browser and in
// Node. Nothing is verified: no signature check, no chain building. Only the
// fingerprints need WebCrypto (`globalThis.crypto`).

// ── Model ─────────────────────────────────────────────────────────────────────

/** One attribute of a distinguished name. `type` is a short name (CN, O, OU) or a dotted OID. */
export interface NameAttribute {
  type: string;
  value: string;
}

/** A subject or issuer, in the order the certificate stores it. A type may repeat (OU, DC). */
export type DistinguishedName = NameAttribute[];

export type ExtValue =
  | { kind: 'list'; items: string[] }
  | { kind: 'bc'; isCA: boolean; pathLen?: number }
  | { kind: 'aia'; ocsp?: string; caIssuers?: string }
  | { kind: 'text'; value: string }
  | { kind: 'raw'; hex: string };

export interface CertExtension {
  oid: string;
  name: string;
  critical: boolean;
  value: ExtValue;
}

export interface CertInfo {
  version: number;
  serialNumber: string;
  sigAlg: string;
  issuer: DistinguishedName;
  validFrom: Date;
  validTo: Date;
  subject: DistinguishedName;
  pkAlg: string;
  pkBits?: number;
  pkCurve?: string;
  extensions: CertExtension[];
  /** The validity period is over. */
  isExpired: boolean;
  /** The validity period has not started yet. */
  isNotYetValid: boolean;
  /** Subject and issuer are the same name. The signature is not checked. */
  isSelfSigned: boolean;
}

export interface DecodedCertificate {
  cert: CertInfo;
  /** Exactly the certificate's DER bytes: what its fingerprints are computed over. */
  der: Uint8Array;
  /** How many certificates the input held. Only the first one is decoded. */
  certificateCount: number;
}

export interface CertificateFingerprints {
  sha1: string;
  sha256: string;
}

/** A problem with the input, worded for the user. Anything else is a bug or a broken structure. */
class CertificateError extends Error {}

const NOT_A_CERTIFICATE = 'This is not a valid X.509 certificate. It may be incomplete or damaged.';

// ── ASN.1 DER parser ──────────────────────────────────────────────────────────

interface Asn1Node {
  tagByte: number;
  tag: number;
  cls: number;
  constructed: boolean;
  bytes: Uint8Array;
  children: Asn1Node[];
}

const MAX_DEPTH = 64;

function readNode(buf: Uint8Array, start: number, depth = 0): [Asn1Node, number] {
  let pos = start;
  const next = () => {
    if (pos >= buf.length) throw new Error('Unexpected end of DER data');
    return buf[pos++];
  };

  const tagByte = next();
  const cls = (tagByte >> 6) & 0x3;
  const constructed = !!(tagByte & 0x20);
  let tag = tagByte & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    for (;;) {
      const b = next();
      tag = (tag << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
  }

  const lb = next();
  let len: number;
  if (lb < 0x80) {
    len = lb;
  } else {
    const n = lb & 0x7f;
    if (n === 0) throw new Error('Indefinite length not supported');
    if (n > 6) throw new Error('Length field too large');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + next();
  }

  const end = pos + len;
  if (end > buf.length) throw new Error('Value extends beyond buffer');
  const bytes = buf.subarray(pos, end);
  const children: Asn1Node[] = [];
  if (constructed) {
    if (depth >= MAX_DEPTH) throw new Error('DER data is nested too deeply');
    let cp = 0;
    while (cp < bytes.length) {
      const [child, childEnd] = readNode(bytes, cp, depth + 1);
      children.push(child);
      cp = childEnd;
    }
  }
  return [{ tagByte, tag, cls, constructed, bytes, children }, end];
}

/** The node at `index`, or an error: the structure is not the one a certificate has. */
function child(node: Asn1Node | undefined, index: number): Asn1Node {
  const found = node?.children[index];
  if (!found) throw new CertificateError(NOT_A_CERTIFICATE);
  return found;
}

// ── OID table ─────────────────────────────────────────────────────────────────

const OID_RSA = '1.2.840.113549.1.1.1';
const OID_RSA_PSS = '1.2.840.113549.1.1.10';
const OID_EC = '1.2.840.10045.2.1';

const OID_MAP: Record<string, string> = {
  '2.5.4.3': 'CN', '2.5.4.4': 'SN', '2.5.4.5': 'serialNumber',
  '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.9': 'street',
  '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.12': 'title',
  '2.5.4.15': 'businessCategory', '2.5.4.17': 'postalCode',
  '2.5.4.41': 'name', '2.5.4.42': 'givenName', '2.5.4.97': 'organizationIdentifier',
  '0.9.2342.19200300.100.1.1': 'UID', '0.9.2342.19200300.100.1.25': 'DC',
  '1.2.840.113549.1.9.1': 'emailAddress',
  [OID_RSA]: 'RSA',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.113549.1.1.14': 'sha224WithRSAEncryption',
  [OID_RSA_PSS]: 'RSASSA-PSS',
  [OID_EC]: 'EC',
  '1.2.840.10045.4.3.1': 'ecdsa-with-SHA224',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
  '1.3.101.112': 'Ed25519', '1.3.101.113': 'Ed448',
  '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521', '1.3.132.0.10': 'secp256k1',
  '2.5.29.14': 'subjectKeyIdentifier',
  '2.5.29.15': 'keyUsage',
  '2.5.29.17': 'subjectAltName',
  '2.5.29.18': 'issuerAltName',
  '2.5.29.19': 'basicConstraints',
  '2.5.29.31': 'cRLDistributionPoints',
  '2.5.29.32': 'certificatePolicies',
  '2.5.29.35': 'authorityKeyIdentifier',
  '2.5.29.37': 'extKeyUsage',
  '1.3.6.1.5.5.7.1.1': 'authorityInfoAccess',
  '1.3.6.1.4.1.11129.2.4.2': 'CT Precertificate SCTs',
  '1.3.6.1.5.5.7.3.1': 'TLS Server Auth',
  '1.3.6.1.5.5.7.3.2': 'TLS Client Auth',
  '1.3.6.1.5.5.7.3.3': 'Code Signing',
  '1.3.6.1.5.5.7.3.4': 'Email Protection',
  '1.3.6.1.5.5.7.3.8': 'Timestamping',
  '1.3.6.1.5.5.7.3.9': 'OCSP Signing',
  '1.3.6.1.5.5.7.48.1': 'OCSP',
  '1.3.6.1.5.5.7.48.2': 'caIssuers',
};

/** Field size of the named curves. A point's encoded length only gives it rounded up to whole bytes. */
const EC_CURVE_BITS: Record<string, number> = {
  '1.2.840.10045.3.1.7': 256,
  '1.3.132.0.34': 384,
  '1.3.132.0.35': 521,
  '1.3.132.0.10': 256,
};

function decodeOid(bytes: Uint8Array): string {
  const arcs: number[] = [];
  let acc = 0;
  for (let i = 0; i < bytes.length; i++) {
    acc = acc * 128 + (bytes[i] & 0x7f);
    if (bytes[i] & 0x80) continue;
    if (arcs.length === 0) {
      // The first number packs the first two arcs. Only arc 2 can be followed
      // by a second arc of 40 or more.
      const first = Math.min(Math.floor(acc / 40), 2);
      arcs.push(first, acc - first * 40);
    } else {
      arcs.push(acc);
    }
    acc = 0;
  }
  return arcs.join('.');
}

function oidName(oid: string): string {
  return OID_MAP[oid] ?? oid;
}

// ── Primitive decoders ────────────────────────────────────────────────────────

function latin1(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return text;
}

function utf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function decodeString(node: Asn1Node): string {
  const { tagByte, bytes } = node;
  // TeletexString: in practice Latin-1. Decoding it as UTF-8 loses every accented letter.
  if (tagByte === 0x14) return latin1(bytes);
  // BMPString (UTF-16BE) and UniversalString (UTF-32BE).
  if (tagByte === 0x1e || tagByte === 0x1c) {
    const width = tagByte === 0x1e ? 2 : 4;
    let text = '';
    for (let i = 0; i + width <= bytes.length; i += width) {
      let code = 0;
      for (let j = 0; j < width; j++) code = code * 256 + bytes[i + j];
      text += code <= 0x10ffff ? String.fromCodePoint(code) : '�';
    }
    return text;
  }
  return utf8(bytes);
}

const UTC_TIME = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/;
const GENERALIZED_TIME = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:[.,]\d+)?Z$/;

function decodeTime(node: Asn1Node): Date {
  const text = latin1(node.bytes);
  const match = node.tagByte === 0x17 ? UTC_TIME.exec(text) : node.tagByte === 0x18 ? GENERALIZED_TIME.exec(text) : null;
  if (!match) throw new CertificateError('The certificate has a validity date that cannot be read.');

  let year = Number(match[1]);
  // UTCTime has a two-digit year: 50-99 are 19xx, 00-49 are 20xx (RFC 5280).
  if (node.tagByte === 0x17) year += year >= 50 ? 1900 : 2000;

  const date = new Date(Date.UTC(2000, 0, 1, Number(match[4]), Number(match[5]), Number(match[6] ?? 0)));
  date.setUTCFullYear(year, Number(match[2]) - 1, Number(match[3]));
  return date;
}

function toHex(bytes: Uint8Array, sep = ':'): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(sep);
}

function decodeSerial(bytes: Uint8Array): string {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0x00) start++;
  return toHex(bytes.subarray(start));
}

/** Size of an unsigned big-endian integer in bits, leading zeros not counted. */
function bitLength(bytes: Uint8Array): number {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0x00) start++;
  if (start >= bytes.length || bytes[start] === 0) return 0;
  return (bytes.length - start - 1) * 8 + (32 - Math.clz32(bytes[start]));
}

// ── Name parsing ──────────────────────────────────────────────────────────────

function parseName(node: Asn1Node): DistinguishedName {
  const name: DistinguishedName = [];
  for (const rdn of node.children) {
    for (const atv of rdn.children) {
      if (atv.children.length >= 2) {
        name.push({ type: oidName(decodeOid(atv.children[0].bytes)), value: decodeString(atv.children[1]) });
      }
    }
  }
  return name;
}

const NAME_ORDER = ['CN', 'O', 'OU', 'L', 'ST', 'C'];

/** One line for a name: the familiar attributes first, then the rest in certificate order. */
function nameToStr(name: DistinguishedName): string {
  const parts: string[] = [];
  for (const type of NAME_ORDER) {
    for (const attribute of name) if (attribute.type === type) parts.push(`${type}=${attribute.value}`);
  }
  for (const attribute of name) {
    if (!NAME_ORDER.includes(attribute.type)) parts.push(`${attribute.type}=${attribute.value}`);
  }
  return parts.join(', ');
}

// ── Extensions ────────────────────────────────────────────────────────────────

const KEY_USAGE_BITS = [
  'Digital Signature', 'Non-Repudiation', 'Key Encipherment',
  'Data Encipherment', 'Key Agreement', 'Key Cert Sign',
  'CRL Sign', 'Encipher Only', 'Decipher Only',
];

function parseKeyUsage(bitStrBytes: Uint8Array): ExtValue {
  if (bitStrBytes.length < 2) return { kind: 'list', items: [] };
  const unused = bitStrBytes[0];
  const items: string[] = [];
  for (let bi = 1; bi < bitStrBytes.length; bi++) {
    for (let bit = 7; bit >= 0; bit--) {
      if (bi === bitStrBytes.length - 1 && bit < unused) continue;
      const pos = (bi - 1) * 8 + (7 - bit);
      if ((bitStrBytes[bi] & (1 << bit)) && pos < KEY_USAGE_BITS.length) {
        items.push(KEY_USAGE_BITS[pos]);
      }
    }
  }
  return { kind: 'list', items };
}

function parseSan(extBytes: Uint8Array): ExtValue {
  const [seq] = readNode(extBytes, 0);
  const items: string[] = [];
  for (const gn of seq.children) {
    if (gn.cls !== 2) continue;
    switch (gn.tag) {
      case 1: items.push(`email: ${utf8(gn.bytes)}`); break;
      case 2: items.push(`DNS: ${utf8(gn.bytes)}`); break;
      // directoryName is explicitly tagged: the Name sits one level down.
      case 4: items.push(`dir: ${gn.children[0] ? nameToStr(parseName(gn.children[0])) : ''}`); break;
      case 6: items.push(`URI: ${utf8(gn.bytes)}`); break;
      case 7:
        if (gn.bytes.length === 4) items.push(`IP: ${gn.bytes.join('.')}`);
        else if (gn.bytes.length === 16) {
          const h = toHex(gn.bytes, '');
          items.push(`IP: ${(h.match(/.{4}/g) ?? []).join(':')}`);
        }
        break;
      default: items.push(`[${gn.tag}]: ${toHex(gn.bytes, '').slice(0, 40)}`);
    }
  }
  return { kind: 'list', items };
}

function parseBasicConstraints(extBytes: Uint8Array): ExtValue {
  const [seq] = readNode(extBytes, 0);
  let isCA = false;
  let pathLen: number | undefined;
  for (const c of seq.children) {
    if (c.tagByte === 0x01) isCA = c.bytes[0] !== 0;
    else if (c.tagByte === 0x02) { pathLen = 0; for (const b of c.bytes) pathLen = pathLen * 256 + b; }
  }
  return { kind: 'bc', isCA, pathLen };
}

function parseEku(extBytes: Uint8Array): ExtValue {
  const [seq] = readNode(extBytes, 0);
  return { kind: 'list', items: seq.children.map((n) => oidName(decodeOid(n.bytes))) };
}

function parseAia(extBytes: Uint8Array): ExtValue {
  const [seq] = readNode(extBytes, 0);
  let ocsp: string | undefined, caIssuers: string | undefined;
  for (const ad of seq.children) {
    if (ad.children.length >= 2) {
      const oid = decodeOid(ad.children[0].bytes);
      const loc = utf8(ad.children[1].bytes);
      if (oid === '1.3.6.1.5.5.7.48.1') ocsp = loc;
      if (oid === '1.3.6.1.5.5.7.48.2') caIssuers = loc;
    }
  }
  return { kind: 'aia', ocsp, caIssuers };
}

function parseSkid(extBytes: Uint8Array): ExtValue {
  const [oct] = readNode(extBytes, 0);
  return { kind: 'text', value: toHex(oct.bytes) };
}

function parseAkid(extBytes: Uint8Array): ExtValue {
  const [seq] = readNode(extBytes, 0);
  for (const c of seq.children) {
    if (c.tag === 0 && c.cls === 2) return { kind: 'text', value: toHex(c.bytes) };
  }
  return { kind: 'raw', hex: toHex(seq.bytes, '').slice(0, 64) };
}

function parseCrlDp(extBytes: Uint8Array): ExtValue {
  const [seq] = readNode(extBytes, 0);
  const urls: string[] = [];
  for (const dp of seq.children) {
    const dpField = dp.children[0];
    if (!dpField || dpField.tag !== 0 || dpField.cls !== 2) continue;
    const dpName = dpField.children[0];
    if (!dpName || dpName.tag !== 0 || dpName.cls !== 2) continue;
    for (const gn of dpName.children) {
      if (gn.tag === 6 && gn.cls === 2) urls.push(utf8(gn.bytes));
    }
  }
  return { kind: 'list', items: urls };
}

function parseExtensionValue(oid: string, extBytes: Uint8Array): ExtValue {
  try {
    switch (oid) {
      case '2.5.29.15': { const [bs] = readNode(extBytes, 0); return parseKeyUsage(bs.bytes); }
      case '2.5.29.17': return parseSan(extBytes);
      case '2.5.29.19': return parseBasicConstraints(extBytes);
      case '2.5.29.37': return parseEku(extBytes);
      case '1.3.6.1.5.5.7.1.1': return parseAia(extBytes);
      case '2.5.29.14': return parseSkid(extBytes);
      case '2.5.29.35': return parseAkid(extBytes);
      case '2.5.29.31': return parseCrlDp(extBytes);
      default: return { kind: 'raw', hex: toHex(extBytes, '').slice(0, 80) + (extBytes.length > 40 ? '…' : '') };
    }
  } catch {
    return { kind: 'raw', hex: toHex(extBytes, '').slice(0, 80) };
  }
}

// ── Certificate ───────────────────────────────────────────────────────────────

function parseCert(cert: Asn1Node, now: number): CertInfo {
  if (cert.tagByte !== 0x30 || cert.children.length < 3) throw new CertificateError(NOT_A_CERTIFICATE);

  const tbs = cert.children[0];
  const sigAlgNode = cert.children[1];

  let fi = 0;

  let version = 1;
  if (tbs.children[fi]?.tagByte === 0xa0) {
    version = child(tbs.children[fi++], 0).bytes[0] + 1;
  }

  const serial = child(tbs, fi++);
  if (serial.tagByte !== 0x02) throw new CertificateError(NOT_A_CERTIFICATE);
  const serialNumber = decodeSerial(serial.bytes);
  fi++; // inner sig alg

  const issuer = parseName(child(tbs, fi++));

  const validity = child(tbs, fi++);
  const validFrom = decodeTime(child(validity, 0));
  const validTo = decodeTime(child(validity, 1));

  const subject = parseName(child(tbs, fi++));

  const spki = child(tbs, fi++);
  const pkAlgSeq = child(spki, 0);
  const pkOid = decodeOid(child(pkAlgSeq, 0).bytes);
  const pkBytes = child(spki, 1).bytes;
  let pkBits: number | undefined;
  let pkCurve: string | undefined;

  if (pkOid === OID_RSA || pkOid === OID_RSA_PSS) {
    try {
      // BIT STRING content: one byte of unused-bit count, then RSAPublicKey.
      const [rsaSeq] = readNode(pkBytes.subarray(1), 0);
      pkBits = bitLength(rsaSeq.children[0].bytes) || undefined;
    } catch { /* ignore */ }
  } else if (pkOid === OID_EC) {
    const curveOid = pkAlgSeq.children[1] ? decodeOid(pkAlgSeq.children[1].bytes) : '';
    if (curveOid) pkCurve = oidName(curveOid);
    if (EC_CURVE_BITS[curveOid]) {
      pkBits = EC_CURVE_BITS[curveOid];
    } else if (pkBytes.length > 2 && pkBytes[1] === 0x04) {
      pkBits = Math.round(((pkBytes.length - 2) / 2) * 8);
    }
  }

  const sigAlg = oidName(decodeOid(child(sigAlgNode, 0).bytes));

  const extensions: CertExtension[] = [];
  while (fi < tbs.children.length) {
    const field = tbs.children[fi++];
    if (field.tagByte !== 0xa3) continue;
    for (const extNode of child(field, 0).children) {
      let ei = 0;
      const oid = decodeOid(child(extNode, ei++).bytes);
      let critical = false;
      if (extNode.children[ei]?.tagByte === 0x01) {
        critical = extNode.children[ei++].bytes[0] !== 0;
      }
      const extBytes = child(extNode, ei).bytes;
      extensions.push({ oid, name: oidName(oid), critical, value: parseExtensionValue(oid, extBytes) });
    }
    break;
  }

  return {
    version, serialNumber, sigAlg,
    issuer, validFrom, validTo, subject,
    pkAlg: oidName(pkOid), pkBits, pkCurve,
    extensions,
    isExpired: validTo.getTime() < now,
    isNotYetValid: validFrom.getTime() > now,
    isSelfSigned: nameToStr(subject) === nameToStr(issuer),
  };
}

// ── PEM ───────────────────────────────────────────────────────────────────────

const PEM_MARKER = '-----BEGIN';
// A block's body ends at its END line, or at the next dash when the END line is missing.
const PEM_BLOCK = /-----BEGIN ([^-\r\n]+)-----([^-]*)(?:-----END [^-\r\n]+-----)?/g;
const CERTIFICATE_LABELS = ['CERTIFICATE', 'X509 CERTIFICATE', 'TRUSTED CERTIFICATE'];

function describeBlock(label: string): string {
  if (label.includes('PRIVATE KEY')) return 'a private key';
  if (label.includes('CERTIFICATE REQUEST')) return 'a certificate signing request (CSR)';
  if (label.includes('PUBLIC KEY')) return 'a public key';
  if (label.includes('PKCS7') || label === 'CMS') return 'a PKCS#7 bundle';
  if (label.includes('CRL')) return 'a certificate revocation list';
  return `a "${label}" block`;
}

/** The DER bytes of the first certificate block in `pem`, and how many certificate blocks there are. */
function pemToDer(pem: string): { der: Uint8Array; certificateCount: number } {
  const blocks = Array.from(pem.matchAll(PEM_BLOCK), (match) => ({ label: match[1].trim(), body: match[2] }));
  if (blocks.length === 0) {
    throw new CertificateError('Expected a PEM certificate starting with -----BEGIN CERTIFICATE-----');
  }

  const certificates = blocks.filter((block) => CERTIFICATE_LABELS.includes(block.label));
  if (certificates.length === 0) {
    throw new CertificateError(
      `This is ${describeBlock(blocks[0].label)}, not a certificate. Paste a block that starts with -----BEGIN CERTIFICATE-----.`
    );
  }

  let binary: string;
  try {
    binary = atob(certificates[0].body.replace(/\s+/g, ''));
  } catch {
    throw new CertificateError('The certificate is not valid Base64. It may be incomplete or damaged.');
  }

  const der = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i);
  return { der, certificateCount: certificates.length };
}

// ── Interface ─────────────────────────────────────────────────────────────────

/**
 * The text of a certificate file when it is PEM, or null when it is binary
 * (DER). Lets a caller show an uploaded PEM file as text.
 */
export function pemFromBytes(bytes: Uint8Array): string | null {
  const text = utf8(bytes);
  return text.includes(PEM_MARKER) ? text : null;
}

/**
 * Decodes an X.509 certificate from PEM text or from the bytes of a
 * certificate file, PEM or DER.
 *
 * PEM input may hold more than the certificate: text around the block (an
 * `openssl x509 -text` dump, "Bag Attributes") is skipped, and of several
 * certificates (a chain) the first is decoded and the rest are counted.
 *
 * `now` is the moment the validity period is judged at, in milliseconds.
 *
 * Throws an `Error` with a message for the user when the input is not a
 * certificate.
 */
export function decodeCertificate(input: string | Uint8Array, now: number = Date.now()): DecodedCertificate {
  const pem = typeof input === 'string' ? input : pemFromBytes(input);
  const source = pem === null ? { der: input as Uint8Array, certificateCount: 1 } : pemToDer(pem);

  try {
    const [node, end] = readNode(source.der, 0);
    // Bytes after the certificate (a second DER structure, a stray newline)
    // are not part of it and must not end up in the fingerprint.
    return {
      cert: parseCert(node, now),
      der: source.der.subarray(0, end),
      certificateCount: source.certificateCount,
    };
  } catch (error) {
    if (error instanceof CertificateError) throw error;
    throw new CertificateError(NOT_A_CERTIFICATE);
  }
}

/** SHA-1 and SHA-256 fingerprints of a certificate's DER bytes, as upper-case hex pairs joined by colons. */
export async function fingerprintCertificate(der: Uint8Array): Promise<CertificateFingerprints> {
  const [sha1, sha256] = await Promise.all([
    crypto.subtle.digest('SHA-1', der as Uint8Array<ArrayBuffer>),
    crypto.subtle.digest('SHA-256', der as Uint8Array<ArrayBuffer>),
  ]);
  return { sha1: toHex(new Uint8Array(sha1)), sha256: toHex(new Uint8Array(sha256)) };
}
