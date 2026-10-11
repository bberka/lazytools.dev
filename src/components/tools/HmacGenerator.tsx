'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCopyToClipboard } from '@/hooks';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Info,
  KeyRound,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  HMAC_ALGORITHMS,
  computeHmac,
  encodeDigest,
  verifySignature,
  type HmacAlgorithm,
  type HmacRequest,
  type HmacResult,
  type KeyEncoding,
  type SignatureEncoding,
} from '@/lib/tools/hmac-generator';

const KEY_PLACEHOLDERS: Record<KeyEncoding, string> = {
  utf8: 'Secret key text',
  hex: 'e.g. 4a656665',
  base64: 'e.g. SmVmZQ==',
};

const ENCODING_LABELS: Record<SignatureEncoding, string> = {
  hex: 'hex',
  base64: 'Base64',
  base64url: 'Base64URL',
};

interface Outcome {
  request: HmacRequest;
  result: HmacResult;
}

function OutputRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-semibold">{label}</span>
          {hint && <span className="ml-2 text-xs text-muted-foreground">{hint}</span>}
        </div>
        <Button
          onClick={() => copyToClipboard(value)}
          variant={isCopied ? 'default' : 'outline'}
          size="sm"
          className="h-8 shrink-0"
          aria-label={`Copy ${label} HMAC`}
        >
          {isCopied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
          {isCopied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="select-all break-all rounded-md bg-muted p-3 font-mono text-xs sm:text-sm">{value}</div>
    </div>
  );
}

export function HmacGenerator() {
  const [message, setMessage] = useState('');
  const [key, setKey] = useState('');
  const [keyEncoding, setKeyEncoding] = useState<KeyEncoding>('utf8');
  const [algorithm, setAlgorithm] = useState<HmacAlgorithm>('SHA-256');
  const [uppercaseHex, setUppercaseHex] = useState(false);
  const [expected, setExpected] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const messageId = useId();
  const keyId = useId();
  const keyErrorId = useId();
  const algorithmId = useId();
  const uppercaseId = useId();
  const expectedId = useId();

  const hasInput = message !== '' || key !== '';
  const request = useMemo<HmacRequest | null>(
    () => (hasInput ? { message, key, keyEncoding, algorithm } : null),
    [hasInput, message, key, keyEncoding, algorithm]
  );

  // HMAC is cheap, so it recomputes on every change. A result that arrives after
  // the inputs changed again is dropped.
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    void computeHmac(request).then((result) => {
      if (!cancelled) setOutcome({ request, result });
    });
    return () => {
      cancelled = true;
    };
  }, [request]);

  const result = request ? (outcome?.result ?? null) : null;
  const digest = result?.ok ? result.digest : null;
  const keyError = result && !result.ok ? result.error : null;

  const verification = useMemo(() => (digest ? verifySignature(digest, expected) : null), [digest, expected]);

  const handleClear = () => {
    setMessage('');
    setKey('');
    setExpected('');
    setOutcome(null);
  };

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-5">
      {/* Left panel: message, key, algorithm */}
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Message and Key
            </CardTitle>
            <CardDescription>The HMAC updates as you type. Nothing leaves your browser.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor={messageId} className="text-sm font-medium">
                Message (UTF-8 text)
              </label>
              <Textarea
                id={messageId}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter the message to sign..."
                rows={6}
                spellCheck={false}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor={keyId} className="text-sm font-medium">
                Secret key
              </label>
              <Tabs value={keyEncoding} onValueChange={(value) => setKeyEncoding(value as KeyEncoding)}>
                <TabsList aria-label="Key format" className="grid h-auto w-full grid-cols-3">
                  <TabsTrigger value="utf8" className="py-1.5">
                    UTF-8 text
                  </TabsTrigger>
                  <TabsTrigger value="hex" className="py-1.5">
                    Hex
                  </TabsTrigger>
                  <TabsTrigger value="base64" className="py-1.5">
                    Base64
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Input
                id={keyId}
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={KEY_PLACEHOLDERS[keyEncoding]}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={keyError ? true : undefined}
                aria-describedby={keyError ? keyErrorId : undefined}
                className={`font-mono text-sm ${keyError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              />
              {keyError ? (
                <div id={keyErrorId} role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{keyError}</span>
                </div>
              ) : result?.ok ? (
                <p className="text-xs text-muted-foreground">
                  {result.keyBytes === 0
                    ? 'Empty key. HMAC treats it as zero bytes.'
                    : `Key: ${result.keyBytes} ${result.keyBytes === 1 ? 'byte' : 'bytes'}`}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label htmlFor={algorithmId} className="text-sm font-medium">
                Hash algorithm
              </label>
              <Select value={algorithm} onValueChange={(value) => setAlgorithm(value as HmacAlgorithm)}>
                <SelectTrigger id={algorithmId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HMAC_ALGORITHMS.map((name) => (
                    <SelectItem key={name} value={name}>
                      {`HMAC-${name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleClear} variant="outline" size="sm" disabled={!hasInput && !expected}>
                <Trash2 className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right panel: outputs and verification */}
      <div className="space-y-4 lg:col-span-3">
        {digest ? (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">HMAC-{algorithm}</CardTitle>
              <div className="flex items-center gap-2">
                <Switch id={uppercaseId} checked={uppercaseHex} onCheckedChange={setUppercaseHex} />
                <label htmlFor={uppercaseId} className="cursor-pointer text-sm font-medium">
                  Uppercase hex
                </label>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <OutputRow
                label="Hex"
                hint={`${digest.length * 2} characters`}
                value={encodeDigest(digest, 'hex', uppercaseHex)}
              />
              <OutputRow label="Base64" value={encodeDigest(digest, 'base64')} />
              <OutputRow label="Base64URL" hint="no padding" value={encodeDigest(digest, 'base64url')} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground sm:py-12">
              {keyError
                ? 'Fix the key to see the HMAC.'
                : request
                  ? 'Computing...'
                  : 'Enter a message and a key to compute the HMAC.'}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Verify a Signature
            </CardTitle>
            <CardDescription>
              Paste the expected HMAC as hex, Base64 or Base64URL. It is compared in constant time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label htmlFor={expectedId} className="text-sm font-medium">
                Expected signature
              </label>
              <Input
                id={expectedId}
                type="text"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                placeholder="Paste the signature to check..."
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="font-mono text-sm"
              />
            </div>

            <div aria-live="polite" className="text-sm">
              {!verification || verification.status === 'empty' ? (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0" />
                  {digest
                    ? 'Paste a signature to compare it with the HMAC above.'
                    : 'Compute an HMAC first, then paste a signature to compare.'}
                </p>
              ) : verification.status === 'match' ? (
                <p className="flex items-start gap-1.5 font-medium text-green-600 dark:text-green-400">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Match. The signature equals the HMAC (read as {ENCODING_LABELS[verification.encoding]}).</span>
                </p>
              ) : verification.status === 'mismatch' ? (
                <div className="space-y-1">
                  <p className="flex items-start gap-1.5 font-medium text-destructive">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Mismatch. The signature does not equal the HMAC.</span>
                  </p>
                  {verification.detail && <p className="pl-6 text-xs text-muted-foreground">{verification.detail}</p>}
                </div>
              ) : (
                <p className="flex items-start gap-1.5 font-medium text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{verification.error}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
