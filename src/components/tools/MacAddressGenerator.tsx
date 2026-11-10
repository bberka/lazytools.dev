'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { CircleAlert, Download, Network, RefreshCw, ScanLine, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { downloadText } from '@/lib/files';
import {
  DEFAULT_MAC_OPTIONS,
  generateMacs,
  MAC_FORMAT_LABELS,
  MAX_MAC_COUNT,
  parseMac,
  parseMacCount,
  type MacCast,
  type MacFormat,
  type MacScope,
} from '@/lib/tools/mac-address-generator';
import { CopyValueButton } from './CopyValueButton';

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

export function MacAddressGenerator() {
  const [countText, setCountText] = useState(String(DEFAULT_MAC_OPTIONS.count));
  const [format, setFormat] = useState<MacFormat>(DEFAULT_MAC_OPTIONS.format);
  const [uppercase, setUppercase] = useState(DEFAULT_MAC_OPTIONS.uppercase);
  const [cast, setCast] = useState<MacCast>(DEFAULT_MAC_OPTIONS.cast);
  const [scope, setScope] = useState<MacScope>(DEFAULT_MAC_OPTIONS.scope);
  const [macs, setMacs] = useState<string[]>([]);

  const [checkInput, setCheckInput] = useState('');

  const count = parseMacCount(countText);
  const check = useMemo(
    () => (checkInput.trim() === '' ? null : parseMac(checkInput, uppercase)),
    [checkInput, uppercase]
  );

  const handleGenerate = () => {
    if (count === null) return;
    setMacs(generateMacs({ count, format, uppercase, cast, scope }));
  };

  // The batch is reformatted when the format or case changes, so the same
  // addresses are not thrown away. The bytes are read back from the text.
  const reformat = (nextFormat: MacFormat, nextUppercase: boolean) => {
    setMacs((current) =>
      current.map((mac) => {
        const parsed = parseMac(mac, nextUppercase);
        return parsed.ok ? parsed.info.formats[nextFormat] : mac;
      })
    );
  };

  const text = macs.join('\n');

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Generate MAC Addresses
          </CardTitle>
          <CardDescription>
            Random addresses from the browser&apos;s secure random source. Nothing leaves this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="mac-count" label={`How many (1 to ${MAX_MAC_COUNT})`}>
              <Input
                id="mac-count"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_MAC_COUNT}
                value={countText}
                onChange={(event) => setCountText(event.target.value)}
                aria-invalid={count === null}
                className={
                  count === null ? 'border-destructive focus-visible:ring-destructive' : ''
                }
              />
            </Field>
            <Field id="mac-format" label="Format">
              <Select
                value={format}
                onValueChange={(value) => {
                  setFormat(value as MacFormat);
                  reformat(value as MacFormat, uppercase);
                }}
              >
                <SelectTrigger id="mac-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MAC_FORMAT_LABELS) as MacFormat[]).map((id) => (
                    <SelectItem key={id} value={id}>
                      {MAC_FORMAT_LABELS[id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="mac-cast" label="Unicast or multicast">
              <Select value={cast} onValueChange={(value) => setCast(value as MacCast)}>
                <SelectTrigger id="mac-cast">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unicast">Unicast (multicast bit 0)</SelectItem>
                  <SelectItem value="multicast">Multicast (multicast bit 1)</SelectItem>
                  <SelectItem value="any">Random</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="mac-scope" label="Local or global">
              <Select value={scope} onValueChange={(value) => setScope(value as MacScope)}>
                <SelectTrigger id="mac-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Locally administered (bit 1)</SelectItem>
                  <SelectItem value="global">Universally administered (bit 0)</SelectItem>
                  <SelectItem value="any">Random</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex items-center justify-between gap-3">
            <label htmlFor="mac-uppercase" className="text-sm font-medium">
              Uppercase letters
            </label>
            <Switch
              id="mac-uppercase"
              checked={uppercase}
              onCheckedChange={(value) => {
                setUppercase(value);
                reformat(format, value);
              }}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Locally administered unicast addresses (the default) are the ones meant for virtual
            machines, containers and tests. A &quot;global&quot; address is only a random one in the
            universal range: its first three bytes are not a registered vendor prefix.
          </p>

          {count === null && (
            <div
              role="alert"
              className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Enter a whole number from 1 to {MAX_MAC_COUNT}.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleGenerate} disabled={count === null}>
              <RefreshCw className="h-4 w-4" />
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generated addresses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {macs.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground sm:py-8">
              No addresses yet. Choose your options and press Generate.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <CopyValueButton text={text} label="Copy all" showLabel />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadText(`${text}\n`, 'mac-addresses.txt')}
                >
                  <Download className="h-4 w-4" />
                  Download .txt
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setMacs([])}>
                  <Trash2 className="h-4 w-4" />
                  Clear
                </Button>
              </div>
              <ul
                aria-label="Generated MAC addresses"
                className="max-h-80 divide-y overflow-auto rounded-lg border"
              >
                {macs.map((mac, index) => (
                  <li key={`${index}-${mac}`} className="flex items-center gap-2 px-3 py-1.5">
                    <code className="min-w-0 flex-1 break-all font-mono text-sm">{mac}</code>
                    <CopyValueButton text={mac} label={`Copy ${mac}`} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            Check a MAC address
          </CardTitle>
          <CardDescription>
            Paste an address to see its format, the two flag bits and the other ways to write it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={checkInput}
              onChange={(event) => setCheckInput(event.target.value)}
              placeholder="00:1A:2B:3C:4D:5E"
              aria-label="MAC address to check"
              aria-invalid={check?.ok === false}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="none"
              className="flex-1 font-mono"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setCheckInput('')}
              disabled={checkInput === ''}
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>

          {check && !check.ok && (
            <div
              role="alert"
              className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{check.error}</span>
            </div>
          )}

          {check?.ok && (
            <div className="space-y-3" data-testid="mac-check-result">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Valid MAC address</Badge>
                <Badge variant="outline">{MAC_FORMAT_LABELS[check.info.format]}</Badge>
                <Badge variant="outline">
                  {check.info.multicast ? 'Multicast (group bit 1)' : 'Unicast (group bit 0)'}
                </Badge>
                <Badge variant="outline">
                  {check.info.locallyAdministered
                    ? 'Locally administered (bit 1)'
                    : 'Universally administered (bit 0)'}
                </Badge>
                {check.info.broadcast && <Badge variant="outline">Broadcast address</Badge>}
              </div>
              <ul aria-label="Normalized forms" className="divide-y rounded-lg border">
                {(Object.keys(MAC_FORMAT_LABELS) as MacFormat[]).map((id) => (
                  <li key={id} className="flex items-center gap-2 px-3 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-muted-foreground">
                        {MAC_FORMAT_LABELS[id].split(' (')[0]}
                      </div>
                      <div className="break-all font-mono text-sm">{check.info.formats[id]}</div>
                    </div>
                    <CopyValueButton
                      text={check.info.formats[id]}
                      label={`Copy ${MAC_FORMAT_LABELS[id].split(' (')[0]} form`}
                    />
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                The vendor is not looked up: that needs a large registry, and this tool stays small
                and offline.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
