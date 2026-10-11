'use client';

import { useState, useCallback, useRef } from 'react';
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
import {
  decodeCertificate,
  fingerprintCertificate,
  pemFromBytes,
  type CertInfo,
  type CertificateFingerprints,
  type DistinguishedName,
  type ExtValue,
} from '@/lib/tools/certificate-decoder';

// ─── Component ────────────────────────────────────────────────────────────────

// Certificates are a few kilobytes and even a full CA bundle stays well under
// a megabyte. Anything far bigger was picked by mistake and is not read.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function CertificateDecoder() {
  const [pemText, setPemText] = useState('');
  const [fileHint, setFileHint] = useState('');
  const [cert, setCert] = useState<CertInfo | null>(null);
  const [certificateCount, setCertificateCount] = useState(1);
  const [fps, setFps] = useState<CertificateFingerprints | null>(null);
  const [error, setError] = useState('');
  const copyFp1 = useCopyToClipboard();
  const copyFp256 = useCopyToClipboard();
  const copySn = useCopyToClipboard();

  // Reading a file and computing fingerprints are asynchronous. Every input
  // that is shown takes a new number, and so does every file read; a result is
  // only used while its number is still current, so it can never land on a
  // different certificate.
  const latestRun = useRef(0);
  const latestRead = useRef(0);

  const showCertificate = useCallback((input: string | Uint8Array) => {
    const run = ++latestRun.current;
    setFps(null);
    try {
      const decoded = decodeCertificate(input);
      setCert(decoded.cert);
      setCertificateCount(decoded.certificateCount);
      setError('');
      fingerprintCertificate(decoded.der)
        .then((result) => { if (run === latestRun.current) setFps(result); })
        .catch(() => { if (run === latestRun.current) setFps(null); });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse failed');
      setCert(null);
    }
  }, []);

  const parseText = useCallback((text: string) => {
    if (!text.trim()) {
      latestRun.current += 1;
      setCert(null); setError(''); setFps(null);
      return;
    }
    showCertificate(text);
  }, [showCertificate]);

  const handleInput = (text: string) => {
    setPemText(text);
    setFileHint('');
    parseText(text);
  };

  const handleFile = async (file: File) => {
    const read = ++latestRead.current;
    const shown = latestRun.current;
    // Something newer was typed, picked or cleared while this file was being read.
    const superseded = () => read !== latestRead.current || shown !== latestRun.current;

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFileAsArrayBuffer(file));
    } catch {
      if (!superseded()) setError('Failed to read file');
      return;
    }
    if (superseded()) return;

    const pem = pemFromBytes(bytes);
    if (pem !== null) {
      setPemText(pem); setFileHint('');
      parseText(pem);
    } else {
      setPemText(''); setFileHint(`${file.name} (${file.size} bytes)`);
      showCertificate(bytes);
    }
  };

  // The picker suggests the usual certificate extensions (set on the input
  // below) but any file of a plausible size is taken: its content decides
  // whether it parses.
  const intake = useFileIntake({
    maxSize: MAX_FILE_BYTES,
    onFiles: ([file]) => handleFile(file),
    onReject: ([rejection]) => {
      latestRead.current += 1;
      setError(rejection.message);
    },
  });

  const handleClear = () => {
    latestRun.current += 1;
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
              aria-label="PEM certificate"
              rows={6}
              className="font-mono text-xs"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={intake.open}>
              <Upload className="h-4 w-4 mr-2" /> Upload File
            </Button>
            <Button variant="outline" size="sm" onClick={handleClear}>
              <Trash2 className="h-4 w-4 mr-2" /> Clear
            </Button>
            <input
              {...intake.inputProps}
              accept=".pem,.crt,.cer,.der"
              aria-label="Upload certificate file"
            />
          </div>
          {error && (
            <div role="alert" className="bg-destructive/10 text-destructive px-3 py-2 rounded text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          {cert && certificateCount > 1 && (
            <p className="text-xs text-muted-foreground">
              This input holds {certificateCount} certificates. Showing the first one.
            </p>
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
            ) : cert.isNotYetValid ? (
              <Badge variant="destructive" className="gap-1">
                <Clock className="h-3 w-3" /> Not Yet Valid
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
              <Row
                label="Not Before"
                value={fmt(cert.validFrom)}
                extra={cert.isNotYetValid ? <span className="text-destructive font-semibold text-xs ml-1">(NOT YET VALID)</span> : null}
              />
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
                    aria-label="Copy serial number"
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
                      aria-label="Copy SHA-1 fingerprint"
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
                      aria-label="Copy SHA-256 fingerprint"
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
      <span className="text-muted-foreground w-32 shrink-0 break-words">{label}</span>
      <span className="flex-1 min-w-0 break-all">
        {value}
        {extra}
      </span>
    </div>
  );
}

function NameTable({ name }: { name: DistinguishedName }) {
  if (!name.length) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <div className="space-y-1 text-sm">
      {name.map((attribute, i) => (
        <Row key={i} label={attribute.type} value={attribute.value} />
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
