'use client';

import { useMemo, useState } from 'react';
import { Binary, CircleAlert, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { convertIPv4, IPV4_FORMAT_LABELS } from '@/lib/tools/ipv4-converter';
import { CopyValueButton } from './CopyValueButton';

const EXAMPLES = ['192.168.1.1', '3232235777', '0xC0A80101', '::ffff:192.168.1.1'];

export function Ipv4Converter() {
  const [input, setInput] = useState('');

  const hasInput = input.trim() !== '';
  const result = useMemo(() => (hasInput ? convertIPv4(input) : null), [hasInput, input]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Binary className="h-5 w-5 text-primary" />
            IPv4 Address
          </CardTitle>
          <CardDescription>
            Type an address in any form: dotted decimal, integer, hex (0x), octal, binary or IPv4-mapped IPv6.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="e.g. 192.168.1.1 or 3232235777 or 0xC0A80101"
              aria-label="IPv4 address in any format"
              aria-invalid={result?.ok === false}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="none"
              className="flex-1 font-mono"
            />
            <Button type="button" variant="outline" onClick={() => setInput('')} disabled={!hasInput}>
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Try:</span>
            {EXAMPLES.map((example) => (
              <Button
                key={example}
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 font-mono"
                onClick={() => setInput(example)}
              >
                {example}
              </Button>
            ))}
          </div>

          {result && !result.ok && (
            <div
              role="alert"
              className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{result.error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {result?.ok && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              All forms
              <Badge variant="secondary">Read as {IPV4_FORMAT_LABELS[result.format].toLowerCase()}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul aria-label="Address forms" className="divide-y rounded-lg border">
              {result.forms.map((form) => (
                <li key={form.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-muted-foreground">{form.label}</div>
                    <div className="break-all font-mono text-sm" data-testid={`ipv4-form-${form.id}`}>
                      {form.value}
                    </div>
                  </div>
                  <CopyValueButton text={form.value} label={`Copy ${form.label}`} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!result && (
        <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground sm:py-8">
          Enter an address to see it in every form.
        </p>
      )}
    </div>
  );
}
