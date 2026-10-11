'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCopyToClipboard } from '@/hooks';
import { downloadText } from '@/lib/files';
import { cn } from '@/lib/utils/cn';
import {
  MAX_COUNT,
  decodeUlid,
  formatRelativeTime,
  generateUlids,
  parseCount,
  parseTimestampInput,
  ulidToUuid,
  uuidToUlid,
} from '@/lib/tools/ulid-generator';
import {
  ArrowLeftRight,
  CalendarClock,
  Check,
  CircleAlert,
  CircleCheck,
  Copy,
  Dices,
  Download,
  Info,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';

/** The example ULID from the ULID specification. */
const EXAMPLE_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

type LetterCase = 'upper' | 'lower';
type ConvertSource = 'ulid' | 'uuid';

interface CopyButtonProps {
  text: string;
  /** Accessible name; also the visible text when `showLabel` is set. */
  label: string;
  showLabel?: boolean;
  className?: string;
}

function CopyButton({ text, label, showLabel = false, className }: CopyButtonProps) {
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  return (
    <Button
      type="button"
      variant={showLabel ? 'outline' : 'ghost'}
      size={showLabel ? 'sm' : 'icon'}
      className={showLabel ? className : cn('h-8 w-8 shrink-0', className)}
      onClick={() => copyToClipboard(text)}
      aria-label={showLabel ? undefined : label}
      disabled={!text}
    >
      {isCopied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
      {showLabel && (isCopied ? 'Copied' : label)}
    </Button>
  );
}

function ErrorNote({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div
      id={id}
      className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive sm:text-sm"
    >
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
  copyLabel,
}: {
  label: string;
  value: string;
  mono?: boolean;
  /** Adds a copy button with this accessible name. */
  copyLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-2.5">
      <div className="min-w-0 space-y-0.5">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`break-all text-sm ${mono ? 'font-mono' : ''}`}>{value}</div>
      </div>
      {copyLabel && <CopyButton text={value} label={copyLabel} />}
    </div>
  );
}

export function UlidGenerator() {
  // Generator options
  const [countText, setCountText] = useState('5');
  const [monotonic, setMonotonic] = useState(false);
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [timeText, setTimeText] = useState('');
  const [letterCase, setLetterCase] = useState<LetterCase>('upper');

  // Generator output
  const [ulids, setUlids] = useState<string[]>([]);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Decoder
  const [decodeInput, setDecodeInput] = useState('');
  // The clock reading from when the input last changed, kept in state so render stays pure.
  const [decodeNow, setDecodeNow] = useState(0);

  // ULID <-> UUID converter: whichever box was typed in is the source.
  const [convertSource, setConvertSource] = useState<ConvertSource>('ulid');
  const [convertText, setConvertText] = useState('');

  const countResult = useMemo(() => parseCount(countText), [countText]);
  const timeResult = useMemo(
    () => (useCustomTime ? parseTimestampInput(timeText) : null),
    [useCustomTime, timeText]
  );
  const canGenerate = countResult.ok && (timeResult === null || timeResult.ok);

  const decoded = useMemo(
    () => (decodeInput.trim() ? decodeUlid(decodeInput) : null),
    [decodeInput]
  );

  const converted = useMemo(() => {
    if (!convertText.trim()) return null;
    return convertSource === 'ulid' ? ulidToUuid(convertText) : uuidToUlid(convertText);
  }, [convertSource, convertText]);
  const convertedValue = converted?.ok ? converted.value : '';
  const ulidBoxValue = convertSource === 'ulid' ? convertText : convertedValue;
  const uuidBoxValue = convertSource === 'uuid' ? convertText : convertedValue;
  const convertError = converted && !converted.ok ? converted.error : null;

  const handleGenerate = () => {
    if (!countResult.ok || (timeResult && !timeResult.ok)) return;

    const result = generateUlids({
      count: countResult.value,
      monotonic,
      timestamp: timeResult?.ok ? timeResult.value : undefined,
      lowercase: letterCase === 'lower',
    });

    if (result.ok) {
      setUlids(result.value);
      setGenerateError(null);
    } else {
      setUlids([]);
      setGenerateError(result.error);
    }
  };

  const handleClearResults = () => {
    setUlids([]);
    setGenerateError(null);
  };

  const handleCaseChange = (value: LetterCase) => {
    setLetterCase(value);
    // Case is only how the letters are written, so the list on screen follows it.
    setUlids((current) =>
      current.map((ulid) => (value === 'lower' ? ulid.toLowerCase() : ulid.toUpperCase()))
    );
  };

  const handleCustomTimeToggle = (checked: boolean) => {
    setUseCustomTime(checked);
    if (checked && !timeText.trim()) setTimeText(String(Date.now()));
  };

  const handleDownload = () => {
    downloadText(`${ulids.join('\n')}\n`, 'ulids.txt');
    toast.success(`Saved ${ulids.length} ${ulids.length === 1 ? 'ULID' : 'ULIDs'} to ulids.txt`);
  };

  const handleDecodeChange = (value: string) => {
    setDecodeInput(value);
    setDecodeNow(Date.now());
  };

  const handleConvertChange = (source: ConvertSource, value: string) => {
    setConvertSource(source);
    setConvertText(value);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-5">
        {/* Options */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Options
            </CardTitle>
            <CardDescription>
              26 characters: a 48-bit millisecond timestamp, then 80 random bits. They sort by time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="ulid-count" className="text-sm font-medium">
                  How many (1 to {MAX_COUNT})
                </label>
                <Input
                  id="ulid-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_COUNT}
                  value={countText}
                  onChange={(e) => setCountText(e.target.value)}
                  aria-invalid={!countResult.ok}
                  aria-describedby={countResult.ok ? undefined : 'ulid-count-error'}
                  className={countResult.ok ? '' : 'border-destructive focus-visible:ring-destructive'}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="ulid-case" className="text-sm font-medium">
                  Letter case
                </label>
                <Select value={letterCase} onValueChange={(value) => handleCaseChange(value as LetterCase)}>
                  <SelectTrigger id="ulid-case">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upper">UPPERCASE</SelectItem>
                    <SelectItem value="lower">lowercase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!countResult.ok && <ErrorNote id="ulid-count-error">{countResult.error}</ErrorNote>}

            <div className="flex items-start justify-between gap-3 border-t pt-4">
              <div className="space-y-0.5">
                <label htmlFor="ulid-monotonic" className="text-sm font-medium">
                  Monotonic mode
                </label>
                <p className="text-xs text-muted-foreground">
                  In the same millisecond the random part counts up by one, so a batch always sorts in
                  creation order.
                </p>
              </div>
              <Switch id="ulid-monotonic" checked={monotonic} onCheckedChange={setMonotonic} />
            </div>

            <div className="space-y-3 border-t pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <label htmlFor="ulid-custom-time" className="text-sm font-medium">
                    Custom timestamp
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Use a fixed time instead of the clock. Handy for backfills and tests.
                  </p>
                </div>
                <Switch
                  id="ulid-custom-time"
                  checked={useCustomTime}
                  onCheckedChange={handleCustomTimeToggle}
                />
              </div>

              {useCustomTime && (
                <div className="space-y-2">
                  <label htmlFor="ulid-time" className="text-xs font-medium text-muted-foreground">
                    Unix milliseconds or an ISO 8601 date
                  </label>
                  <Input
                    id="ulid-time"
                    value={timeText}
                    onChange={(e) => setTimeText(e.target.value)}
                    placeholder="1469918176385 or 2016-07-30T22:36:16.385Z"
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={timeResult !== null && !timeResult.ok}
                    aria-describedby="ulid-time-note"
                    className={`font-mono text-sm ${
                      timeResult !== null && !timeResult.ok
                        ? 'border-destructive focus-visible:ring-destructive'
                        : ''
                    }`}
                  />
                  {timeResult?.ok ? (
                    <p id="ulid-time-note" className="text-xs text-muted-foreground">
                      Reads as {new Date(timeResult.value).toISOString()}
                    </p>
                  ) : (
                    timeResult && <ErrorNote id="ulid-time-note">{timeResult.error}</ErrorNote>
                  )}
                </div>
              )}
            </div>

            <Button onClick={handleGenerate} disabled={!canGenerate} className="w-full">
              <Dices className="h-4 w-4" />
              Generate
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              Generated ULIDs
            </CardTitle>
            <CardDescription>
              {ulids.length > 0
                ? `${ulids.length} ${ulids.length === 1 ? 'ULID' : 'ULIDs'}. The timestamp part is highlighted.`
                : 'Your ULIDs appear here.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {generateError && <ErrorNote>{generateError}</ErrorNote>}

            {ulids.length === 0 ? (
              !generateError && (
                <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-6 text-center text-muted-foreground sm:py-12">
                  <Dices className="h-8 w-8 stroke-[1.5]" />
                  <p className="text-sm font-medium">No ULIDs yet</p>
                  <p className="text-xs">Pick your options and press Generate.</p>
                </div>
              )
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={ulids.join('\n')} label="Copy all" showLabel />
                  <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="h-4 w-4" />
                    Download .txt
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleClearResults}>
                    <Trash2 className="h-4 w-4" />
                    Clear
                  </Button>
                </div>

                <ul
                  aria-label="Generated ULIDs"
                  className="max-h-96 divide-y overflow-y-auto rounded-md border bg-muted/30"
                >
                  {ulids.map((ulid, index) => (
                    <li key={index} className="flex items-center justify-between gap-2 py-1 pl-3 pr-1">
                      <span className="min-w-0 break-all font-mono text-sm">
                        <span className="text-primary">{ulid.slice(0, 10)}</span>
                        {ulid.slice(10)}
                      </span>
                      <CopyButton text={ulid} label={`Copy ${ulid}`} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Decoder */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Decode a ULID
            </CardTitle>
            <CardDescription>
              Check that a ULID is valid and read the time and random part inside it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="ulid-decode" className="text-sm font-medium">
                ULID
              </label>
              <Input
                id="ulid-decode"
                value={decodeInput}
                onChange={(e) => handleDecodeChange(e.target.value)}
                placeholder={EXAMPLE_ULID}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={decoded !== null && !decoded.ok}
                className={`font-mono text-sm ${
                  decoded !== null && !decoded.ok ? 'border-destructive focus-visible:ring-destructive' : ''
                }`}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDecodeChange(EXAMPLE_ULID)}
                >
                  Try an example
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDecodeChange('')}
                  disabled={!decodeInput}
                >
                  <Trash2 className="h-4 w-4" />
                  Clear
                </Button>
              </div>
            </div>

            <div aria-live="polite">
              {decoded === null && (
                <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground sm:py-8">
                  Paste a ULID to decode it.
                </p>
              )}
              {decoded && !decoded.ok && <ErrorNote>{decoded.error}</ErrorNote>}
              {decoded?.ok && (
                <div className="rounded-md border px-3">
                  <div className="flex items-center gap-1.5 border-b py-2.5 text-sm font-medium text-primary">
                    <CircleCheck className="h-4 w-4" />
                    Valid ULID
                  </div>
                  <div className="divide-y">
                    <DetailRow
                      label="Timestamp (ISO 8601, UTC)"
                      value={decoded.value.iso}
                      mono
                      copyLabel="Copy ISO timestamp"
                    />
                    <DetailRow
                      label="Local time"
                      value={new Date(decoded.value.timestamp).toLocaleString(undefined, {
                        dateStyle: 'full',
                        timeStyle: 'long',
                      })}
                    />
                    <DetailRow
                      label="Relative time"
                      value={formatRelativeTime(decoded.value.timestamp, decodeNow)}
                    />
                    <DetailRow
                      label="Unix milliseconds"
                      value={String(decoded.value.timestamp)}
                      mono
                      copyLabel="Copy Unix milliseconds"
                    />
                    <DetailRow
                      label="Random part (80 bits, hex)"
                      value={decoded.value.randomHex}
                      mono
                      copyLabel="Copy random part"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ULID <-> UUID */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-primary" />
              ULID and UUID
            </CardTitle>
            <CardDescription>Both hold 128 bits. Type in either box to convert to the other.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="ulid-convert-ulid" className="text-sm font-medium">
                ULID
              </label>
              <div className="relative">
                <Input
                  id="ulid-convert-ulid"
                  value={ulidBoxValue}
                  onChange={(e) => handleConvertChange('ulid', e.target.value)}
                  placeholder={EXAMPLE_ULID}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={convertSource === 'ulid' && convertError !== null}
                  className={`pr-10 font-mono text-sm ${
                    convertSource === 'ulid' && convertError
                      ? 'border-destructive focus-visible:ring-destructive'
                      : ''
                  }`}
                />
                {ulidBoxValue && (
                  <CopyButton
                    text={ulidBoxValue}
                    label="Copy ULID"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                  />
                )}
              </div>
              {convertSource === 'ulid' && convertError && <ErrorNote>{convertError}</ErrorNote>}
            </div>

            <div className="space-y-2">
              <label htmlFor="ulid-convert-uuid" className="text-sm font-medium">
                UUID
              </label>
              <div className="relative">
                <Input
                  id="ulid-convert-uuid"
                  value={uuidBoxValue}
                  onChange={(e) => handleConvertChange('uuid', e.target.value)}
                  placeholder="01563e3a-b5d3-d676-4c61-efb99302bd5b"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={convertSource === 'uuid' && convertError !== null}
                  className={`pr-10 font-mono text-sm ${
                    convertSource === 'uuid' && convertError
                      ? 'border-destructive focus-visible:ring-destructive'
                      : ''
                  }`}
                />
                {uuidBoxValue && (
                  <CopyButton
                    text={uuidBoxValue}
                    label="Copy UUID"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                  />
                )}
              </div>
              {convertSource === 'uuid' && convertError && <ErrorNote>{convertError}</ErrorNote>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  The same bytes in UUID layout, with the timestamp in the first six. No UUID version or
                  variant bits are set, so it is not a v4 or v7 UUID.
                </span>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleConvertChange('ulid', '')}
                disabled={!convertText}
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
