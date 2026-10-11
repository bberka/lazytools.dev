'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, Dices, Info, KeyRound, Loader2, QrCode, Timer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCopyToClipboard } from '@/hooks';
import { cn } from '@/lib/utils';
import {
  DEFAULT_TOTP_OPTIONS,
  MIN_SECRET_BITS,
  buildOtpauthUri,
  computeTotpWindow,
  decodeBase32,
  formatCode,
  generateSecret,
  secondsRemaining,
  totpCounter,
  type TotpAlgorithm,
  type TotpDigits,
  type TotpOptions,
  type TotpWindowResult,
} from '@/lib/tools/totp-generator';

const ALGORITHM_OPTIONS: Array<{ value: TotpAlgorithm; label: string }> = [
  { value: 'SHA-1', label: 'SHA-1 (most apps)' },
  { value: 'SHA-256', label: 'SHA-256' },
  { value: 'SHA-512', label: 'SHA-512' },
];

const DIGIT_OPTIONS: Array<{ value: TotpDigits; label: string }> = [
  { value: 6, label: '6 digits' },
  { value: 8, label: '8 digits' },
];

const PERIOD_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 30, label: '30 seconds' },
  { value: 60, label: '60 seconds' },
];

// How close to the end of a window the countdown bar turns to the warning colour.
const WARNING_SECONDS = 5;

type ComputedCodes = { key: string; result: TotpWindowResult };
type RenderedQr = { uri: string; dataUrl: string | null };

function CopyIconButton({ text, label }: { text: string; label: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      aria-label={label}
      title={label}
      disabled={!text}
      onClick={() => copyToClipboard(text)}
    >
      {isCopied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

export function TotpGenerator() {
  const [secret, setSecret] = useState('');
  const [algorithm, setAlgorithm] = useState<TotpAlgorithm>(DEFAULT_TOTP_OPTIONS.algorithm);
  const [digits, setDigits] = useState<TotpDigits>(DEFAULT_TOTP_OPTIONS.digits);
  const [period, setPeriod] = useState<number>(DEFAULT_TOTP_OPTIONS.period);
  const [issuer, setIssuer] = useState('');
  const [account, setAccount] = useState('');

  // Unix time in whole seconds. Null until the first tick after mounting, so the
  // statically prerendered page never shows a clock reading from build time.
  const [nowSeconds, setNowSeconds] = useState<number | null>(null);
  const [codes, setCodes] = useState<ComputedCodes | null>(null);
  const [qr, setQr] = useState<RenderedQr | null>(null);

  const secretCopy = useCopyToClipboard();

  const options = useMemo<TotpOptions>(() => ({ algorithm, digits, period }), [algorithm, digits, period]);

  const hasSecret = secret.trim() !== '';
  const secretCheck = useMemo(() => (hasSecret ? decodeBase32(secret) : null), [hasSecret, secret]);
  const secretIsValid = secretCheck?.ok === true;

  // Tick four times a second so the code changes within a quarter of a second of
  // its window ending. State only changes when the second does.
  useEffect(() => {
    const tick = () => setNowSeconds(Math.floor(Date.now() / 1000));
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);

  const counter = nowSeconds === null ? null : totpCounter(nowSeconds * 1000, period);
  const codesKey = `${algorithm}|${digits}|${period}|${secret}`;

  // The codes only change when the counter, secret or options do, not every tick.
  useEffect(() => {
    if (!secretIsValid || counter === null) return;

    let cancelled = false;
    computeTotpWindow(secret, options, counter * period * 1000).then((result) => {
      if (!cancelled) setCodes({ key: codesKey, result });
    });
    return () => {
      cancelled = true;
    };
  }, [secretIsValid, counter, secret, options, period, codesKey]);

  const otpauth = useMemo(
    () => (hasSecret ? buildOtpauthUri({ ...options, secret, issuer, account }) : null),
    [hasSecret, options, secret, issuer, account]
  );
  const uri = otpauth?.ok ? otpauth.uri : null;

  // The qrcode library is only fetched once there is a link to draw.
  useEffect(() => {
    if (!uri) return;

    let cancelled = false;
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 2, width: 256 }))
      .then(
        (dataUrl) => {
          if (!cancelled) setQr({ uri, dataUrl });
        },
        () => {
          if (!cancelled) setQr({ uri, dataUrl: null });
        }
      );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const currentCodes = codes?.key === codesKey && codes.result.ok ? codes.result : null;
  const codeError =
    secretCheck && !secretCheck.ok
      ? secretCheck.error
      : codes?.key === codesKey && !codes.result.ok && secretIsValid
        ? codes.result.error
        : null;

  const remaining = nowSeconds === null ? null : secondsRemaining(nowSeconds * 1000, period);
  const usesNonDefaultOptions =
    algorithm !== DEFAULT_TOTP_OPTIONS.algorithm ||
    digits !== DEFAULT_TOTP_OPTIONS.digits ||
    period !== DEFAULT_TOTP_OPTIONS.period;

  const handleGenerateSecret = () => {
    setSecret(generateSecret());
  };

  const handleClear = () => {
    setSecret('');
    setAlgorithm(DEFAULT_TOTP_OPTIONS.algorithm);
    setDigits(DEFAULT_TOTP_OPTIONS.digits);
    setPeriod(DEFAULT_TOTP_OPTIONS.period);
    setIssuer('');
    setAccount('');
    setCodes(null);
    setQr(null);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Secret and Options
          </CardTitle>
          <CardDescription>
            Paste a Base32 secret, or generate a random one, to get time-based one-time codes (RFC 6238).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="totp-secret" className="text-sm font-medium">
              Base32 secret
            </label>
            <Input
              id="totp-secret"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="e.g. JBSW Y3DP EHPK 3PXP"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? 'totp-secret-error' : undefined}
              className={codeError ? 'border-destructive font-mono focus-visible:ring-destructive' : 'font-mono'}
            />
            {codeError && (
              <div
                id="totp-secret-error"
                role="alert"
                className="flex items-start gap-1.5 text-xs text-destructive"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{codeError}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Letters A-Z and digits 2-7. Lower case, spaces, hyphens and trailing = padding are fine.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label htmlFor="totp-algorithm" className="text-sm font-medium">
                Algorithm
              </label>
              <Select value={algorithm} onValueChange={(value) => setAlgorithm(value as TotpAlgorithm)}>
                <SelectTrigger id="totp-algorithm">
                  <SelectValue placeholder="Choose algorithm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ALGORITHM_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="totp-digits" className="text-sm font-medium">
                Code length
              </label>
              <Select
                value={String(digits)}
                onValueChange={(value) => setDigits(value === '8' ? 8 : 6)}
              >
                <SelectTrigger id="totp-digits">
                  <SelectValue placeholder="Choose length" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {DIGIT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="totp-period" className="text-sm font-medium">
                Period
              </label>
              <Select
                value={String(period)}
                onValueChange={(value) => setPeriod(value === '60' ? 60 : 30)}
              >
                <SelectTrigger id="totp-period">
                  <SelectValue placeholder="Choose period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PERIOD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          {usesNonDefaultOptions && (
            <p className="text-xs text-muted-foreground">
              Many authenticator apps, including Google Authenticator, ignore these settings and always use
              SHA-1, 6 digits and 30 seconds. Check that your app supports the ones you pick.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleGenerateSecret}>
              <Dices className="mr-2 h-4 w-4" />
              Generate random secret
            </Button>
            <Button
              type="button"
              variant={secretCopy.isCopied ? 'default' : 'outline'}
              disabled={!hasSecret}
              onClick={() => secretCopy.copyToClipboard(secret.trim())}
            >
              {secretCopy.isCopied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy secret
                </>
              )}
            </Button>
            <Button type="button" variant="outline" onClick={handleClear}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary" />
            One-Time Codes
          </CardTitle>
          <CardDescription>
            The code refreshes by itself when its {period} second window ends.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasSecret || !secretIsValid ? (
            <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground sm:py-10">
              <Timer className="mx-auto mb-3 h-10 w-10 opacity-50" />
              {hasSecret
                ? 'Fix the secret above to see codes.'
                : 'Enter a Base32 secret or generate a random one to see codes.'}
            </div>
          ) : (
            <>
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-center sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Current code
                </p>
                <div className="flex items-center justify-center gap-2">
                  <span
                    className={cn(
                      'font-mono text-3xl font-semibold tabular-nums tracking-wider sm:text-5xl sm:tracking-widest',
                      !currentCodes && 'text-muted-foreground'
                    )}
                    data-testid="totp-current-code"
                  >
                    {currentCodes ? formatCode(currentCodes.current) : digits === 8 ? '---- ----' : '--- ---'}
                  </span>
                  <CopyIconButton text={currentCodes?.current ?? ''} label="Copy current code" />
                </div>

                <div className="mx-auto max-w-sm space-y-1.5">
                  <div
                    role="progressbar"
                    aria-label="Time until the code changes"
                    aria-valuemin={0}
                    aria-valuemax={period}
                    aria-valuenow={remaining ?? 0}
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={cn(
                        'h-full rounded-full bg-primary',
                        remaining !== null && remaining <= WARNING_SECONDS && 'bg-destructive'
                      )}
                      style={{ width: `${remaining === null ? 0 : (remaining / period) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {remaining === null ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Starting the clock...
                      </span>
                    ) : (
                      `Changes in ${remaining} ${remaining === 1 ? 'second' : 'seconds'}`
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
                <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Previous code
                    </p>
                    <p className="break-all font-mono text-lg tabular-nums tracking-wider sm:text-xl">
                      {currentCodes?.previous ? formatCode(currentCodes.previous) : '-'}
                    </p>
                  </div>
                  <CopyIconButton text={currentCodes?.previous ?? ''} label="Copy previous code" />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Next code
                    </p>
                    <p className="break-all font-mono text-lg tabular-nums tracking-wider sm:text-xl">
                      {currentCodes ? formatCode(currentCodes.next) : '-'}
                    </p>
                  </div>
                  <CopyIconButton text={currentCodes?.next ?? ''} label="Copy next code" />
                </div>
              </div>

              {currentCodes && currentCodes.secretBits < MIN_SECRET_BITS && (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    This secret is only {currentCodes.secretBits} bits. RFC 4226 asks for at least{' '}
                    {MIN_SECRET_BITS} bits, and 160 bits is the usual size. Fine for testing, weak for real use.
                  </span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Authenticator Link and QR Code
          </CardTitle>
          <CardDescription>
            Add an issuer and account name, then scan the QR code with an authenticator app to import the secret.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="totp-issuer" className="text-sm font-medium">
                Issuer (optional)
              </label>
              <Input
                id="totp-issuer"
                value={issuer}
                onChange={(event) => setIssuer(event.target.value)}
                placeholder="e.g. Example Inc"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="totp-account" className="text-sm font-medium">
                Account (optional)
              </label>
              <Input
                id="totp-account"
                value={account}
                onChange={(event) => setAccount(event.target.value)}
                placeholder="e.g. alice@example.com"
                autoComplete="off"
              />
            </div>
          </div>

          {uri ? (
            <div className="grid gap-4 sm:gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">otpauth:// link</span>
                  <CopyIconButton text={uri} label="Copy otpauth link" />
                </div>
                <div
                  className="break-all rounded-md border bg-muted/30 p-3 font-mono text-xs"
                  data-testid="totp-otpauth-uri"
                >
                  {uri}
                </div>
                <p className="text-xs text-muted-foreground">
                  With no issuer or account the label reads &ldquo;Account&rdquo;. The link contains your secret,
                  so treat it like a password.
                </p>
              </div>

              <div className="flex items-center justify-center md:justify-end">
                {qr ? (
                  qr.dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qr.dataUrl}
                      alt="QR code for the otpauth link"
                      width={256}
                      height={256}
                      className={cn(
                        'h-auto w-full max-w-[256px] rounded-md border bg-white',
                        qr.uri !== uri && 'opacity-50'
                      )}
                    />
                  ) : (
                    <div
                      role="alert"
                      className="flex max-w-[256px] items-start gap-1.5 text-xs text-destructive"
                    >
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>The QR code could not be drawn. Try a shorter issuer or account name.</span>
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Drawing QR code...
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground sm:py-10">
              <QrCode className="mx-auto mb-3 h-10 w-10 opacity-50" />
              {hasSecret && otpauth && !otpauth.ok
                ? 'Fix the secret above to build the link.'
                : 'Enter a secret to build the link and QR code.'}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-start gap-2 py-4 text-sm text-muted-foreground sm:py-6">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Codes are calculated in your browser with the Web Crypto API, using your device clock. The secret is
            never sent anywhere or stored, so it is gone when you leave this page. If a code is rejected, check
            that your device clock is correct.
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
