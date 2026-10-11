'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCopyToClipboard } from '@/hooks';
import { cn } from '@/lib/utils';
import {
  Ban,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Copy,
  Dices,
  FileKey,
  Hourglass,
  KeyRound,
  RotateCcw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import {
  EXPIRY_PRESETS,
  JWT_ALGORITHMS,
  decodeSecret,
  describeTimeClaims,
  generateJti,
  generateRandomSecret,
  isJwtAlgorithm,
  minimumSecretBytes,
  parseJsonObject,
  setJsonMember,
  signJwt,
  unixSeconds,
  validateHeader,
  validatePayload,
  verifyJwt,
  type JwtAlgorithm,
  type JwtParts,
  type SecretEncoding,
  type SignField,
  type VerifyStatus,
} from '@/lib/tools/jwt-signer';

const DEFAULT_ALGORITHM: JwtAlgorithm = 'HS256';
const DEFAULT_HEADER = '{\n  "alg": "HS256",\n  "typ": "JWT"\n}';
const DEFAULT_PAYLOAD = '{\n  "sub": "1234567890",\n  "name": "Test User"\n}';
const DEFAULT_EXPIRY = '3600';

type StatusTone = 'good' | 'bad' | 'neutral';

const STATUS_PRESENTATION: Record<
  VerifyStatus,
  { label: string; tone: StatusTone; Icon: LucideIcon }
> = {
  valid: { label: 'Valid', tone: 'good', Icon: CircleCheck },
  'invalid-signature': { label: 'Invalid signature', tone: 'bad', Icon: CircleX },
  malformed: { label: 'Malformed token', tone: 'bad', Icon: TriangleAlert },
  expired: { label: 'Expired', tone: 'bad', Icon: Clock },
  'not-yet-valid': { label: 'Not valid yet', tone: 'bad', Icon: Hourglass },
  'unsupported-algorithm': { label: 'Unsupported algorithm', tone: 'bad', Icon: Ban },
  'invalid-secret': { label: 'Check the secret', tone: 'neutral', Icon: KeyRound },
  'crypto-error': { label: 'Could not verify', tone: 'neutral', Icon: TriangleAlert },
};

const TONE_CLASSES: Record<StatusTone, { panel: string; icon: string }> = {
  good: { panel: 'border-primary/40 bg-primary/5', icon: 'text-primary' },
  bad: { panel: 'border-destructive/40 bg-destructive/5', icon: 'text-destructive' },
  neutral: { panel: 'border-border bg-muted/40', icon: 'text-muted-foreground' },
};

// The three token parts differ by underline style and a text label as well as
// by colour, so they stay distinguishable without relying on colour.
const PART_STYLES: Record<keyof JwtParts, { label: string; token: string; legend: string }> = {
  header: {
    label: 'Header',
    token: 'text-primary underline decoration-solid decoration-2 underline-offset-4',
    legend: 'underline decoration-solid decoration-2 underline-offset-4',
  },
  payload: {
    label: 'Payload',
    token: 'text-foreground underline decoration-dashed decoration-2 underline-offset-4',
    legend: 'underline decoration-dashed decoration-2 underline-offset-4',
  },
  signature: {
    label: 'Signature',
    token: 'text-muted-foreground underline decoration-dotted decoration-2 underline-offset-4',
    legend: 'underline decoration-dotted decoration-2 underline-offset-4',
  },
};

const PART_STYLE_LIST: Array<[keyof JwtParts, (typeof PART_STYLES)[keyof JwtParts]]> = [
  ['header', PART_STYLES.header],
  ['payload', PART_STYLES.payload],
  ['signature', PART_STYLES.signature],
];

const SECTION_LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground';

/**
 * Runs an async computation whenever `inputs` changes and returns its result,
 * or null while the answer for the current inputs is still pending. `inputs`
 * must be a memoised object and `compute` a stable function.
 */
function useAsyncResult<I, R>(inputs: I, compute: (inputs: I) => Promise<R>): R | null {
  const [state, setState] = useState<{ inputs: I; result: R } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void compute(inputs).then((result) => {
      if (!cancelled) setState({ inputs, result });
    });
    return () => {
      cancelled = true;
    };
  }, [inputs, compute]);

  return state !== null && state.inputs === inputs ? state.result : null;
}

/** What the token area says when nothing could be signed. */
function signFailureMessage(failure: { field: SignField; error: string }, secretEmpty: boolean) {
  if (failure.field === 'secret') {
    return secretEmpty ? 'Enter a secret to sign the token.' : failure.error;
  }
  if (failure.field === 'crypto') return failure.error;
  return `Fix the ${failure.field} JSON to create a token.`;
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-xs text-destructive">
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

function TokenView({ parts }: { parts: JwtParts }) {
  return (
    <div className="space-y-3">
      <p className="break-all rounded-md border bg-muted/40 p-3 font-mono text-sm leading-relaxed">
        <span className={PART_STYLES.header.token}>{parts.header}</span>
        <span>.</span>
        <span className={PART_STYLES.payload.token}>{parts.payload}</span>
        <span>.</span>
        <span className={PART_STYLES.signature.token}>{parts.signature}</span>
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {PART_STYLE_LIST.map(([part, style]) => (
          <li key={part} className="flex items-center gap-1.5">
            <span className={style.legend}>{style.label}</span>
            <span>{parts[part].length} chars</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function JwtSigner() {
  const [algorithm, setAlgorithm] = useState<JwtAlgorithm>(DEFAULT_ALGORITHM);
  const [headerText, setHeaderText] = useState(DEFAULT_HEADER);
  const [payloadText, setPayloadText] = useState(DEFAULT_PAYLOAD);
  const [secret, setSecret] = useState('');
  const [secretEncoding, setSecretEncoding] = useState<SecretEncoding>('utf8');
  const [expiry, setExpiry] = useState(DEFAULT_EXPIRY);
  const [verifyToken, setVerifyToken] = useState('');

  const copyToken = useCopyToClipboard();

  const headerError = useMemo(() => validateHeader(headerText, algorithm), [headerText, algorithm]);
  const payloadError = useMemo(() => validatePayload(payloadText), [payloadText]);
  const secretCheck = useMemo(() => decodeSecret(secret, secretEncoding), [secret, secretEncoding]);
  const timeClaims = useMemo(() => {
    const parsed = parseJsonObject(payloadText);
    return parsed.ok ? describeTimeClaims(parsed.value) : [];
  }, [payloadText]);

  const signInputs = useMemo(
    () => ({ header: headerText, payload: payloadText, secret, secretEncoding, algorithm }),
    [headerText, payloadText, secret, secretEncoding, algorithm]
  );
  const verifyInputs = useMemo(
    () => ({ token: verifyToken, secret, secretEncoding }),
    [verifyToken, secret, secretEncoding]
  );
  const signed = useAsyncResult(signInputs, signJwt);
  const verified = useAsyncResult(verifyInputs, verifyJwt);

  const signedToken = signed?.ok ? signed.token : '';

  const handleAlgorithmChange = (value: string) => {
    if (!isJwtAlgorithm(value)) return;
    setAlgorithm(value);
    // The header follows the menu. A header that is not valid JSON is left for
    // the user to fix; the error under it says so.
    const next = setJsonMember(headerText, 'alg', value);
    if (next.ok) setHeaderText(next.value);
  };

  const addClaim = (claim: string, value: unknown) => {
    const next = setJsonMember(payloadText, claim, value);
    if (next.ok) setPayloadText(next.value);
  };

  const handleRandomSecret = () => {
    setSecret(generateRandomSecret(algorithm));
    setSecretEncoding('base64');
  };

  const handleReset = () => {
    setAlgorithm(DEFAULT_ALGORITHM);
    setHeaderText(DEFAULT_HEADER);
    setPayloadText(DEFAULT_PAYLOAD);
    setSecret('');
    setSecretEncoding('utf8');
    setExpiry(DEFAULT_EXPIRY);
    setVerifyToken('');
  };

  const verifyBlank = verifyToken.trim() === '';
  const verifyView = verified ? STATUS_PRESENTATION[verified.status] : null;
  const verifyTone = verifyView ? TONE_CLASSES[verifyView.tone] : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Nothing leaves your browser.</span> Tokens
          are signed and checked on this page with WebCrypto. Your header, payload, secret and tokens
          are never uploaded or saved. This tool is for testing authorization flows, so use
          throwaway secrets rather than production keys.
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <div className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                Algorithm &amp; Secret
              </CardTitle>
              <CardDescription>
                The header&apos;s alg follows the algorithm. The same secret signs and verifies.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="jwt-algorithm" className={SECTION_LABEL_CLASS}>
                  Algorithm
                </label>
                <Select value={algorithm} onValueChange={handleAlgorithmChange}>
                  <SelectTrigger id="jwt-algorithm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JWT_ALGORITHMS.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="jwt-secret" className={SECTION_LABEL_CLASS}>
                    Secret
                  </label>
                  <Tabs
                    value={secretEncoding}
                    onValueChange={(value) => setSecretEncoding(value as SecretEncoding)}
                  >
                    <TabsList className="h-auto" aria-label="Secret encoding">
                      <TabsTrigger value="utf8" className="px-3 py-1.5 text-xs">
                        UTF-8 text
                      </TabsTrigger>
                      <TabsTrigger value="base64" className="px-3 py-1.5 text-xs">
                        Base64
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <Input
                  id="jwt-secret"
                  type="text"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={
                    secretEncoding === 'base64' ? 'Base64 or Base64URL key' : 'Type a test secret'
                  }
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="font-mono"
                  aria-invalid={secret !== '' && !secretCheck.ok}
                  aria-describedby="jwt-secret-note"
                />
                <div id="jwt-secret-note" className="space-y-1 text-xs text-muted-foreground">
                  {secret !== '' && !secretCheck.ok ? (
                    <FieldError id="jwt-secret-error" message={secretCheck.error} />
                  ) : secretCheck.ok ? (
                    <p>
                      Key length: {secretCheck.value.length} byte
                      {secretCheck.value.length === 1 ? '' : 's'}. RFC 7518 requires at least{' '}
                      {minimumSecretBytes(algorithm)} for {algorithm}.
                    </p>
                  ) : (
                    <p>
                      RFC 7518 requires at least {minimumSecretBytes(algorithm)} bytes for{' '}
                      {algorithm}.
                    </p>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleRandomSecret}>
                  <Dices className="h-4 w-4" />
                  Generate random secret
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Header</CardTitle>
              <CardDescription>A JSON object. Its alg must match the algorithm.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                rows={5}
                spellCheck={false}
                className="font-mono text-sm"
                aria-label="Header JSON"
                aria-invalid={headerError !== null}
                aria-describedby={headerError ? 'jwt-header-error' : undefined}
              />
              {headerError && <FieldError id="jwt-header-error" message={headerError} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payload</CardTitle>
              <CardDescription>
                The claims, as a JSON object. Times are seconds since 1970.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  rows={8}
                  spellCheck={false}
                  className="font-mono text-sm"
                  aria-label="Payload JSON"
                  aria-invalid={payloadError !== null}
                  aria-describedby={payloadError ? 'jwt-payload-error' : undefined}
                />
                {payloadError && <FieldError id="jwt-payload-error" message={payloadError} />}
              </div>

              <div className="space-y-2">
                <p className={SECTION_LABEL_CLASS}>Quick claims</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={payloadError !== null}
                    onClick={() => addClaim('iat', unixSeconds())}
                  >
                    Set iat (now)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={payloadError !== null}
                    onClick={() => addClaim('nbf', unixSeconds())}
                  >
                    Set nbf (now)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={payloadError !== null}
                    onClick={() => addClaim('jti', generateJti())}
                  >
                    Set jti (random)
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={expiry} onValueChange={setExpiry}>
                    <SelectTrigger className="h-8 w-36 text-xs" aria-label="Expiry duration">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_PRESETS.map((preset) => (
                        <SelectItem key={preset.seconds} value={String(preset.seconds)}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={payloadError !== null}
                    onClick={() => addClaim('exp', unixSeconds() + Number(expiry))}
                  >
                    Set exp (now + duration)
                  </Button>
                </div>
                {payloadError && (
                  <p className="text-xs text-muted-foreground">
                    Fix the payload JSON to use these buttons.
                  </p>
                )}
              </div>

              {timeClaims.length > 0 && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border bg-muted/40 p-3 text-xs">
                  {timeClaims.map(({ claim, iso }) => (
                    <div key={claim} className="contents">
                      <dt className="font-mono font-semibold">{claim}</dt>
                      <dd className="font-mono text-muted-foreground">{iso} (UTC)</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileKey className="h-5 w-5 text-primary" />
                Signed Token
              </CardTitle>
              <CardDescription>Updates as you type. Copy it into your test client.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {signed === null ? (
                <p className="py-4 text-center text-sm text-muted-foreground sm:py-8" role="status">
                  Signing...
                </p>
              ) : signed.ok ? (
                <>
                  <TokenView parts={signed.parts} />
                  {signed.warnings.length > 0 && (
                    <ul className="space-y-1 text-xs text-muted-foreground" aria-label="Warnings">
                      {signed.warnings.map((warning) => (
                        <li key={warning} className="flex items-start gap-1.5">
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            <span className="font-medium text-foreground">Warning: </span>
                            {warning}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p
                  className="rounded-md border border-dashed py-4 text-center text-sm text-muted-foreground sm:py-8"
                  role="status"
                >
                  {signFailureMessage(signed, secret === '')}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={copyToken.isCopied ? 'default' : 'outline'}
                  disabled={!signedToken}
                  onClick={() => copyToken.copyToClipboard(signedToken)}
                >
                  {copyToken.isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copyToken.isCopied ? 'Copied' : 'Copy token'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4" />
                  Reset all
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Verify a Token
              </CardTitle>
              <CardDescription>
                Checks a pasted token against the secret and encoding set in Algorithm &amp; Secret.
                The algorithm comes from the token&apos;s header, and exp and nbf use this device&apos;s clock.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                rows={5}
                spellCheck={false}
                placeholder="Paste a JWT to check, for example eyJhbGciOiJIUzI1NiIs..."
                className="break-all font-mono text-sm"
                aria-label="Token to verify"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!signedToken}
                  onClick={() => setVerifyToken(signedToken)}
                >
                  Use signed token
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={verifyBlank}
                  onClick={() => setVerifyToken('')}
                >
                  <Trash2 className="h-4 w-4" />
                  Clear
                </Button>
              </div>

              <div aria-live="polite">
                {verifyBlank ? (
                  <p className="rounded-md border border-dashed py-4 text-center text-sm text-muted-foreground sm:py-8">
                    Paste a token above to check its signature and expiry.
                  </p>
                ) : verified && verifyView && verifyTone ? (
                  <div
                    className={cn('flex items-start gap-3 rounded-md border p-3', verifyTone.panel)}
                    data-status={verified.status}
                  >
                    <verifyView.Icon className={cn('mt-0.5 h-5 w-5 shrink-0', verifyTone.icon)} />
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">{verifyView.label}</p>
                      <p className="text-muted-foreground">{verified.message}</p>
                    </div>
                  </div>
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground sm:py-8">
                    Checking...
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
