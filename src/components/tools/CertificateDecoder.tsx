'use client';

import { useState, useCallback } from 'react';
import {
  Shield, Upload, Trash2, AlertTriangle, CheckCircle,
  Clock, KeyRound, Lock, FileCode, Copy, Check,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useCopyToClipboard } from '@/hooks';
import { useFileIntake } from '@/hooks/useFileIntake';
import { readFileAsArrayBuffer } from '@/lib/files';

// ─── ASN.1 DER parser ────────────────────────────────────────────────────────

interface Asn1Node {
  tagByte: number;
  tag: number;
  cls: number;
  constructed: boolean;
  bytes: Uint8Array;
  children: Asn1Node[];
}

function readNode(buf: Uint8Array, pos: number): [Asn1Node, number] {
  if (pos >= buf.length) throw new Error('Unexpected end of DER data');
  const tagByte = buf[pos++];
  const cls = (tagByte >> 6) & 0x3;
  const constructed = !!(tagByte & 0x20);
  let tag = tagByte & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    while (pos < buf.length) {
      const b = buf[pos++];
      tag = (tag << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
  }
  const lb = buf[pos++];
  let len: number;
  if (lb < 0x80) {
    len = lb;
  } else {
    const n = lb & 0x7f;
    if (n === 0) throw new Error('Indefinite length not supported');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[pos++];
  }
  const end = pos + len;
  if (end > buf.length) throw new Error('Value extends beyond buffer');
  const bytes = buf.slice(pos, end);
  const children: Asn1Node[] = [];
  if (constructed) {
    let cp = 0;
    while (cp < bytes.length) {
      const [child, childEnd] = readNode(bytes, cp);
      children.push(child);
      cp = childEnd;
    }
  }
  return [{ tagByte, tag, cls, constructed, bytes, children }, end];
}

function parseAsn1(buf: Uint8Array): Asn1Node {
  const [node] = readNode(buf, 0);
  return node;
}

// ─── OID table ───────────────────────────────────────────────────────────────

const OID_MAP: Record<string, string> = {
  '2.5.4.3': 'CN', '2.5.4.4': 'SN', '2.5.4.5': 'serialNumber',
  '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.9': 'street',
  '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.12': 'title',
  '2.5.4.15': 'businessCategory', '2.5.4.17': 'postalCode',
  '2.5.4.41': 'name', '2.5.4.42': 'givenName', '2.5.4.97': 'organizationIdentifier',
  '0.9.2342.19200300.100.1.1': 'UID', '0.9.2342.19200300.100.1.25': 'DC',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.113549.1.1.14': 'sha224WithRSAEncryption',
  '1.2.840.113549.1.1.10': 'RSASSA-PSS',
  '1.2.840.10045.2.1': 'EC',
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

function decodeOid(bytes: Uint8Array): string {
  if (!bytes.length) return '';
  const parts: number[] = [];
  parts.push(Math.floor(bytes[0] / 40));
  parts.push(bytes[0] % 40);
  let acc = 0;
  for (let i = 1; i < bytes.length; i++) {
    acc = acc * 128 + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) { parts.push(acc); acc = 0; }
  }
  return parts.join('.');
}

function oidName(oid: string): string {
  return OID_MAP[oid] ?? oid;
}

// ─── Primitive decoders ───────────────────────────────────────────────────────

function decodeStr(tagByte: number, bytes: Uint8Array): string {
  try {
    if (tagByte === 0x1e) return new TextDecoder('utf-16be').decode(bytes);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return Array.from(bytes).map(b => String.fromCharCode(b)).join('');
  }
}

function decodeTime(tagByte: number, bytes: Uint8Array): Date {
  const s = new TextDecoder().decode(bytes);
  if (tagByte === 0x17) {
    const yy = s.slice(0, 2);
    const year = parseInt(yy, 10) >= 50 ? `19${yy}` : `20${yy}`;
    return new Date(`${year}-${s.slice(2, 4)}-${s.slice(4, 6)}T${s.slice(6, 8)}:${s.slice(8, 10)}:${s.slice(10, 12)}Z`);
  }
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`);
}

function toHex(bytes: Uint8Array, sep = ':'): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(sep);
}

function decodeSerial(bytes: Uint8Array): string {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0x00) start++;
  return toHex(bytes.slice(start));
}

// ─── Name parsing ─────────────────────────────────────────────────────────────

function parseName(node: Asn1Node): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rdn of node.children) {
    for (const atv of rdn.children) {
      if (atv.children.length >= 2) {
        const oid = decodeOid(atv.children[0].bytes);
        result[oidName(oid)] = decodeStr(atv.children[1].tagByte, atv.children[1].bytes);
      }
    }
  }
  return result;
}

function nameToStr(name: Record<string, string>): string {
  const order = ['CN', 'O', 'OU', 'L', 'ST', 'C'];
  const parts: string[] = [];
  for (const k of order) if (name[k]) parts.push(`${k}=${name[k]}`);
  for (const [k, v] of Object.entries(name)) if (!order.includes(k)) parts.push(`${k}=${v}`);
  return parts.join(', ');
}

// ─── Extension value types ────────────────────────────────────────────────────

type ExtValue =
  | { kind: 'list'; items: string[] }
  | { kind: 'bc'; isCA: boolean; pathLen?: number }
  | { kind: 'aia'; ocsp?: string; caIssuers?: string }
  | { kind: 'text'; value: string }
  | { kind: 'raw'; hex: string };

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
      case 1: items.push(`email: ${new TextDecoder().decode(gn.bytes)}`); break;
      case 2: items.push(`DNS: ${new TextDecoder().decode(gn.bytes)}`); break;
      case 4: items.push(`dir: ${nameToStr(parseName(gn))}`); break;
      case 6: items.push(`URI: ${new TextDecoder().decode(gn.bytes)}`); break;
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
  return { kind: 'list', items: seq.children.map(n => oidName(decodeOid(n.bytes))) };
}

function parseAia(extBytes: Uint8Array): ExtValue {
  const [seq] = readNode(extBytes, 0);
  let ocsp: string | undefined, caIssuers: string | undefined;
  for (const ad of seq.children) {
    if (ad.children.length >= 2) {
      const oid = decodeOid(ad.children[0].bytes);
      const loc = new TextDecoder().decode(ad.children[1].bytes);
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
      if (gn.tag === 6 && gn.cls === 2) urls.push(new TextDecoder().decode(gn.bytes));
    }
  }
  return { kind: 'list', items: urls };
}

// ─── Certificate model ────────────────────────────────────────────────────────

interface CertExtension {
  oid: string;
  name: string;
  critical: boolean;
  value: ExtValue;
}

interface CertInfo {
  version: number;
  serialNumber: string;
  sigAlg: string;
  issuer: Record<string, string>;
  validFrom: Date;
  validTo: Date;
  subject: Record<string, string>;
  pkAlg: string;
  pkBits?: number;
  pkCurve?: string;
  extensions: CertExtension[];
  isExpired: boolean;
  isSelfSigned: boolean;
}

function parseCert(der: Uint8Array): CertInfo {
  const cert = parseAsn1(der);
  if (cert.children.length < 3) throw new Error('Invalid certificate structure');

  const tbs = cert.children[0];
  const sigAlgNode = cert.children[1];

  let fi = 0;

  let version = 1;
  if (tbs.children[fi]?.tagByte === 0xa0) {
    version = tbs.children[fi++].children[0].bytes[0] + 1;
  }

  const serialNumber = decodeSerial(tbs.children[fi++].bytes);
  fi++; // inner sig alg

  const issuer = parseName(tbs.children[fi++]);

  const validity = tbs.children[fi++];
  const validFrom = decodeTime(validity.children[0].tagByte, validity.children[0].bytes);
  const validTo = decodeTime(validity.children[1].tagByte, validity.children[1].bytes);

  const subject = parseName(tbs.children[fi++]);

  const spki = tbs.children[fi++];
  const pkAlgSeq = spki.children[0];
  const pkOid = decodeOid(pkAlgSeq.children[0].bytes);
  let pkBits: number | undefined;
  let pkCurve: string | undefined;

  if (pkOid === '1.2.840.113549.1.1.1') {
    try {
      const rsaDer = spki.children[1].bytes.slice(1);
      const [rsaSeq] = readNode(rsaDer, 0);
      const n = rsaSeq.children[0].bytes;
      const s = n[0] === 0x00 ? 1 : 0;
      pkBits = (n.length - s) * 8;
    } catch { /* ignore */ }
  } else if (pkOid === '1.2.840.10045.2.1') {
    if (pkAlgSeq.children.length >= 2) {
      pkCurve = oidName(decodeOid(pkAlgSeq.children[1].bytes));
    }
    const pkBytes = spki.children[1].bytes;
    if (pkBytes.length > 2 && pkBytes[1] === 0x04) {
      pkBits = Math.round(((pkBytes.length - 2) / 2) * 8);
    }
  }

  const sigAlg = oidName(decodeOid(sigAlgNode.children[0].bytes));

  const extensions: CertExtension[] = [];
  while (fi < tbs.children.length) {
    const field = tbs.children[fi++];
    if (field.tagByte !== 0xa3) continue;
    for (const extNode of field.children[0].children) {
      let ei = 0;
      const oid = decodeOid(extNode.children[ei++].bytes);
      let critical = false;
      if (extNode.children[ei]?.tagByte === 0x01) {
        critical = extNode.children[ei++].bytes[0] !== 0;
      }
      const extBytes = extNode.children[ei].bytes;

      let value: ExtValue;
      try {
        switch (oid) {
          case '2.5.29.15': { const [bs] = readNode(extBytes, 0); value = parseKeyUsage(bs.bytes); break; }
          case '2.5.29.17': value = parseSan(extBytes); break;
          case '2.5.29.19': value = parseBasicConstraints(extBytes); break;
          case '2.5.29.37': value = parseEku(extBytes); break;
          case '1.3.6.1.5.5.7.1.1': value = parseAia(extBytes); break;
          case '2.5.29.14': value = parseSkid(extBytes); break;
          case '2.5.29.35': value = parseAkid(extBytes); break;
          case '2.5.29.31': value = parseCrlDp(extBytes); break;
          default: value = { kind: 'raw', hex: toHex(extBytes, '').slice(0, 80) + (extBytes.length > 40 ? '…' : '') };
        }
      } catch {
        value = { kind: 'raw', hex: toHex(extBytes, '').slice(0, 80) };
      }

      extensions.push({ oid, name: OID_MAP[oid] ?? oid, critical, value });
    }
    break;
  }

  const now = Date.now();
  return {
    version, serialNumber, sigAlg,
    issuer, validFrom, validTo, subject,
    pkAlg: oidName(pkOid), pkBits, pkCurve,
    extensions,
    isExpired: validTo.getTime() < now,
    isSelfSigned: nameToStr(subject) === nameToStr(issuer),
  };
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function computeFingerprints(der: Uint8Array) {
  const buf = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer;
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-1', buf),
    crypto.subtle.digest('SHA-256', buf),
  ]);
  const hex = (buf: ArrayBuffer) =>
    Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  return { sha1: hex(a), sha256: hex(b) };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CertificateDecoder() {
  const [pemText, setPemText] = useState('');
  const [fileHint, setFileHint] = useState('');
  const [cert, setCert] = useState<CertInfo | null>(null);
  const [fps, setFps] = useState<{ sha1: string; sha256: string } | null>(null);
  const [error, setError] = useState('');
  const copyFp1 = useCopyToClipboard();
  const copyFp256 = useCopyToClipboard();
  const copySn = useCopyToClipboard();

  const processDer = useCallback((der: Uint8Array) => {
    const parsed = parseCert(der);
    setCert(parsed);
    setError('');
    computeFingerprints(der).then(setFps).catch(() => setFps(null));
  }, []);

  const parseText = useCallback((text: string) => {
    const t = text.trim();
    if (!t) { setCert(null); setError(''); setFps(null); return; }
    try {
      if (!t.includes('-----BEGIN')) throw new Error('Expected a PEM certificate starting with -----BEGIN CERTIFICATE-----');
      processDer(pemToDer(t));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse failed');
      setCert(null); setFps(null);
    }
  }, [processDer]);

  const handleInput = (text: string) => {
    setPemText(text);
    setFileHint('');
    parseText(text);
  };

  const handleFile = async (file: File) => {
    let buf: ArrayBuffer;
    try {
      buf = await readFileAsArrayBuffer(file);
    } catch {
      setError('Failed to read file');
      return;
    }

    const bytes = new Uint8Array(buf);
    const head = new TextDecoder('ascii', { fatal: false }).decode(bytes.slice(0, 27));
    if (head.startsWith('-----BEGIN')) {
      const pem = new TextDecoder().decode(bytes);
      setPemText(pem); setFileHint('');
      parseText(pem);
    } else {
      setPemText(''); setFileHint(`${file.name} (${file.size} bytes)`);
      try { processDer(bytes); }
      catch (err) { setError(err instanceof Error ? err.message : 'Parse failed'); setCert(null); }
    }
  };

  // The picker suggests the usual certificate extensions (set on the input
  // below) but any file is taken: its content decides whether it parses.
  const intake = useFileIntake({ onFiles: ([file]) => handleFile(file) });

  const handleClear = () => {
    setPemText(''); setFileHint(''); setCert(null); setError(''); setFps(null);
  };

  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZoneName: 'short',
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Certificate Input
          </CardTitle>
          <CardDescription>Paste a PEM certificate or upload a .pem / .crt / .cer / .der file</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fileHint ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded text-sm">
              <FileCode className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-xs">{fileHint}</span>
            </div>
          ) : (
            <Textarea
              value={pemText}
              onChange={e => handleInput((e.target as HTMLTextAreaElement).value)}
              placeholder={'-----BEGIN CERTIFICATE-----\nMIIF...\n-----END CERTIFICATE-----'}
              rows={6}
              className="font-mono text-xs"
            />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={intake.open}>
              <Upload className="h-4 w-4 mr-2" /> Upload File
            </Button>
            <Button variant="outline" size="sm" onClick={handleClear}>
              <Trash2 className="h-4 w-4 mr-2" /> Clear
            </Button>
            <input
              {...intake.inputProps}
              accept=".pem,.crt,.cer,.der,.p7b"
              aria-label="Upload certificate file"
            />
          </div>
          {error && (
            <div className="bg-destructive/10 text-destructive px-3 py-2 rounded text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {cert && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            {cert.isExpired ? (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Expired
              </Badge>
            ) : (
              <Badge className="gap-1 bg-green-600 hover:bg-green-700">
                <CheckCircle className="h-3 w-3" /> Valid
              </Badge>
            )}
            {cert.isSelfSigned && (
              <Badge variant="secondary" className="gap-1">
                <Shield className="h-3 w-3" /> Self-Signed
              </Badge>
            )}
            <Badge variant="outline">v{cert.version}</Badge>
            <Badge variant="outline">{cert.sigAlg}</Badge>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Subject</CardTitle>
            </CardHeader>
            <CardContent>
              <NameTable name={cert.subject} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Issuer</CardTitle>
            </CardHeader>
            <CardContent>
              <NameTable name={cert.issuer} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" /> Validity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Not Before" value={fmt(cert.validFrom)} />
              <Row
                label="Not After"
                value={fmt(cert.validTo)}
                extra={cert.isExpired ? <span className="text-destructive font-semibold text-xs ml-1">(EXPIRED)</span> : null}
              />
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 items-start pt-1">
                <span className="text-muted-foreground w-32 shrink-0 text-sm">Serial Number</span>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <code className="font-mono text-xs break-all">{cert.serialNumber}</code>
                  <Button
                    size="sm"
                    variant={copySn.isCopied ? 'default' : 'outline'}
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => copySn.copyToClipboard(cert.serialNumber)}
                  >
                    {copySn.isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4" /> Public Key
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Algorithm" value={cert.pkAlg} />
              {cert.pkBits && <Row label="Key Size" value={`${cert.pkBits} bits`} />}
              {cert.pkCurve && <Row label="Curve" value={cert.pkCurve} />}
            </CardContent>
          </Card>

          {cert.extensions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileCode className="h-4 w-4" /> Extensions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cert.extensions.map(ext => (
                  <div key={ext.oid}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{ext.name}</span>
                      {ext.critical && (
                        <Badge variant="destructive" className="text-xs py-0 px-1 h-4">critical</Badge>
                      )}
                    </div>
                    <ExtValueView value={ext.value} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {fps && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-4 w-4" /> Fingerprints
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs mb-1">SHA-1</div>
                  <div className="flex items-start gap-2">
                    <code className="font-mono text-xs break-all flex-1">{fps.sha1}</code>
                    <Button
                      size="sm"
                      variant={copyFp1.isCopied ? 'default' : 'outline'}
                      className="h-6 w-6 p-0 shrink-0"
                      onClick={() => copyFp1.copyToClipboard(fps.sha1)}
                    >
                      {copyFp1.isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">SHA-256</div>
                  <div className="flex items-start gap-2">
                    <code className="font-mono text-xs break-all flex-1">{fps.sha256}</code>
                    <Button
                      size="sm"
                      variant={copyFp256.isCopied ? 'default' : 'outline'}
                      className="h-6 w-6 p-0 shrink-0"
                      onClick={() => copyFp256.copyToClipboard(fps.sha256)}
                    >
                      {copyFp256.isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({
  label, value, extra,
}: {
  label: string;
  value: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className="flex-1 min-w-0 break-all">
        {value}
        {extra}
      </span>
    </div>
  );
}

function NameTable({ name }: { name: Record<string, string> }) {
  if (!Object.keys(name).length) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <div className="space-y-1 text-sm">
      {Object.entries(name).map(([k, v]) => (
        <Row key={k} label={k} value={v} />
      ))}
    </div>
  );
}

function ExtValueView({ value }: { value: ExtValue }) {
  if (value.kind === 'list') {
    if (!value.items.length) return <span className="text-muted-foreground text-sm">—</span>;
    return (
      <ul className="space-y-0.5 pl-2">
        {value.items.map((item, i) => (
          <li key={i} className="font-mono text-xs text-foreground">{item}</li>
        ))}
      </ul>
    );
  }
  if (value.kind === 'bc') {
    return (
      <div className="text-sm space-y-0.5">
        <div><span className="text-muted-foreground">CA: </span>{value.isCA ? 'Yes' : 'No'}</div>
        {value.pathLen !== undefined && (
          <div><span className="text-muted-foreground">Path Length: </span>{value.pathLen}</div>
        )}
      </div>
    );
  }
  if (value.kind === 'aia') {
    return (
      <div className="text-sm space-y-0.5 break-all">
        {value.ocsp && <div><span className="text-muted-foreground">OCSP: </span><span className="font-mono text-xs">{value.ocsp}</span></div>}
        {value.caIssuers && <div><span className="text-muted-foreground">CA Issuers: </span><span className="font-mono text-xs">{value.caIssuers}</span></div>}
      </div>
    );
  }
  if (value.kind === 'text') {
    return <code className="font-mono text-xs break-all">{value.value}</code>;
  }
  return <code className="font-mono text-xs text-muted-foreground break-all">{value.hex}</code>;
}
