'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCopyToClipboard } from '@/hooks';
import {
  Bot,
  Check,
  CircleAlert,
  Cog,
  Copy,
  Globe,
  Info,
  Layers,
  Monitor,
  MonitorSmartphone,
  ScanSearch,
  Smartphone,
  Terminal,
  Trash2,
} from 'lucide-react';
import {
  CLIENT_KIND_LABELS,
  DEVICE_TYPE_LABELS,
  USER_AGENT_SAMPLES,
  isRecognised,
  parseUserAgent,
  readClientHints,
  resultToJson,
  type ClientHints,
  type NameVersion,
  type ParsedUserAgent,
} from '@/lib/tools/user-agent-parser';

function Unknown() {
  return <span className="font-normal italic text-muted-foreground">unknown</span>;
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-1.5 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{value ?? <Unknown />}</dd>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-3 sm:p-4">
      <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h3>
      <dl>{children}</dl>
    </div>
  );
}

function NameVersionRows({ value }: { value: NameVersion }) {
  return (
    <>
      <Row label="Name" value={value.name} />
      <Row label="Version" value={value.version} />
    </>
  );
}

/** "Chrome 126.0.0.0 on Windows 10 or 11", using only the parts that are known. */
function summarise(result: ParsedUserAgent): string {
  const join = (value: NameVersion) => [value.name, value.version].filter(Boolean).join(' ');
  const client = join(result.browser) || 'Unknown client';
  const os = join(result.os);
  return os ? `${client} on ${os}` : client;
}

function ClientHintsPanel({ hints }: { hints: ClientHints | null }) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        This browser&apos;s client hints
      </h3>
      {hints ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {hints.brands.length === 0 ? (
              <span className="text-muted-foreground">No brands reported.</span>
            ) : (
              hints.brands.map((entry) => (
                <Badge
                  key={`${entry.brand}-${entry.version}`}
                  variant={entry.placeholder ? 'outline' : 'secondary'}
                  className={entry.placeholder ? 'text-muted-foreground' : undefined}
                  title={entry.placeholder ? 'A made-up brand that browsers add so sites cannot rely on the list' : undefined}
                >
                  {entry.brand} {entry.version}
                </Badge>
              ))
            )}
          </div>
          <dl>
            <Row label="Mobile" value={hints.mobile === null ? null : hints.mobile ? 'Yes' : 'No'} />
            <Row label="Platform" value={hints.platform} />
          </dl>
        </>
      ) : (
        <p className="text-muted-foreground">
          This browser does not expose navigator.userAgentData (Firefox and Safari do not), so only the User-Agent
          string above is available.
        </p>
      )}
    </div>
  );
}

export function UserAgentParser() {
  const [input, setInput] = useState('');
  const [sampleId, setSampleId] = useState('');
  // Null until "Use my browser's" is clicked; `hintsChecked` tells "not asked yet" from "not supported".
  const [hints, setHints] = useState<ClientHints | null>(null);
  const [hintsChecked, setHintsChecked] = useState(false);

  const copyJson = useCopyToClipboard();

  const outcome = useMemo(() => parseUserAgent(input), [input]);
  const json = useMemo(() => (outcome.ok ? resultToJson(outcome.result) : ''), [outcome]);

  const handleInputChange = (value: string) => {
    setInput(value);
    setSampleId('');
  };

  const handleSample = (id: string) => {
    const sample = USER_AGENT_SAMPLES.find((entry) => entry.id === id);
    if (!sample) return;
    setInput(sample.userAgent);
    setSampleId(id);
    setHints(null);
    setHintsChecked(false);
  };

  // navigator is only touched here, in the click handler, so prerendering never sees it.
  const handleUseMine = () => {
    setInput(navigator.userAgent);
    setSampleId('');
    setHints(readClientHints((navigator as Navigator & { userAgentData?: unknown }).userAgentData));
    setHintsChecked(true);
  };

  const handleClear = () => {
    setInput('');
    setSampleId('');
    setHints(null);
    setHintsChecked(false);
  };

  const result = outcome.ok ? outcome.result : null;
  const failure = outcome.ok ? null : outcome;

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-5">
      {/* Left panel: input */}
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanSearch className="h-5 w-5 text-primary" />
              User-Agent String
            </CardTitle>
            <CardDescription>
              Paste a User-Agent header, load a sample, or read the one your browser sends.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="ua-sample" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sample user agents
              </label>
              <Select value={sampleId} onValueChange={handleSample}>
                <SelectTrigger id="ua-sample">
                  <SelectValue placeholder="Choose a sample..." />
                </SelectTrigger>
                <SelectContent>
                  {USER_AGENT_SAMPLES.map((sample) => (
                    <SelectItem key={sample.id} value={sample.id}>
                      {sample.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="ua-input" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                User-Agent
              </label>
              <Textarea
                id="ua-input"
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ..."
                rows={5}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
                className="break-all font-mono text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleUseMine} variant="outline" size="sm">
                <Monitor className="mr-2 h-4 w-4" />
                Use my browser&apos;s
              </Button>
              <Button onClick={handleClear} variant="outline" size="sm" disabled={!input && !hintsChecked}>
                <Trash2 className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>

            {hintsChecked && <ClientHintsPanel hints={hints} />}
          </CardContent>
        </Card>
      </div>

      {/* Right panel: result */}
      <div className="space-y-4 lg:col-span-3">
        {result ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <MonitorSmartphone className="h-5 w-5 text-primary" />
                  Parsed result
                </CardTitle>
                <Button
                  onClick={() => copyJson.copyToClipboard(json)}
                  variant={copyJson.isCopied ? 'default' : 'outline'}
                  size="sm"
                  className="h-8"
                >
                  {copyJson.isCopied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                  {copyJson.isCopied ? 'Copied' : 'Copy JSON'}
                </Button>
              </div>
              <CardDescription className="break-words">{summarise(result)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{CLIENT_KIND_LABELS[result.kind]}</Badge>
                <Badge variant="outline">{DEVICE_TYPE_LABELS[result.device.type]}</Badge>
              </div>

              {!isRecognised(result) && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Nothing in this string matched a known browser, engine, operating system or device. Check that
                    you pasted the whole header value.
                  </span>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Panel
                  title={result.kind === 'bot' ? 'Bot' : result.kind === 'http-client' ? 'Client' : 'Browser'}
                  icon={
                    result.kind === 'bot' ? (
                      <Bot className="h-4 w-4" />
                    ) : result.kind === 'http-client' ? (
                      <Terminal className="h-4 w-4" />
                    ) : (
                      <Globe className="h-4 w-4" />
                    )
                  }
                >
                  <NameVersionRows value={result.browser} />
                </Panel>

                <Panel title="Rendering engine" icon={<Cog className="h-4 w-4" />}>
                  <NameVersionRows value={result.engine} />
                </Panel>

                <Panel title="Operating system" icon={<Layers className="h-4 w-4" />}>
                  <NameVersionRows value={result.os} />
                </Panel>

                <Panel title="Device" icon={<Smartphone className="h-4 w-4" />}>
                  <Row
                    label="Type"
                    value={result.device.type === 'unknown' ? null : DEVICE_TYPE_LABELS[result.device.type]}
                  />
                  <Row label="Vendor" value={result.device.vendor} />
                  <Row label="Model" value={result.device.model} />
                  <Row label="CPU architecture" value={result.cpu.architecture} />
                </Panel>
              </div>

              {result.notes.length > 0 && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Info className="h-4 w-4" />
                    Good to know
                  </h3>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    {result.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="ua-json"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  JSON
                </label>
                <Textarea
                  id="ua-json"
                  readOnly
                  value={json}
                  className="h-40 bg-muted/30 font-mono text-xs sm:h-56"
                />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex h-full items-center justify-center py-4 text-muted-foreground sm:py-8">
            <CardContent className="text-center">
              {failure?.code === 'empty' ? (
                <p>Paste a User-Agent string, pick a sample, or use your own browser&apos;s to see it parsed.</p>
              ) : (
                <p role="alert" className="flex items-center justify-center gap-2 text-destructive">
                  <CircleAlert className="h-4 w-4 shrink-0" />
                  {failure?.error}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
