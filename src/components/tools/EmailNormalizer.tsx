'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Check, Copy, Mail, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useCopyToClipboard } from '@/hooks';
import { cn } from '@/lib/utils';
import {
  DEFAULT_OPTIONS,
  EXAMPLE_TEXT,
  normalizeEmails,
  type EmailEntry,
  type EmailOptions,
} from '@/lib/tools/email-normalizer';

const MAX_ROWS = 500;

function StatusBadge({ entry }: { entry: EmailEntry }) {
  if (!entry.valid) {
    return (
      <Badge variant="destructive" className="whitespace-normal font-normal">
        Invalid: {entry.reason}
      </Badge>
    );
  }
  if (entry.duplicateOf !== null) {
    return (
      <Badge variant="secondary" className="font-normal">
        Duplicate of #{entry.duplicateOf}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-normal">
      Valid
    </Badge>
  );
}

export function EmailNormalizer() {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<EmailOptions>(DEFAULT_OPTIONS);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const deferredText = useDeferredValue(text);
  const result = useMemo(() => normalizeEmails(deferredText, options), [deferredText, options]);

  const update = <K extends keyof EmailOptions>(key: K, value: EmailOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  const hasText = text.length > 0;
  const { stats } = result;
  const shown = result.entries.slice(0, MAX_ROWS);

  const statTiles = [
    { label: 'Addresses', value: stats.total },
    { label: 'Valid', value: stats.valid },
    { label: 'Invalid', value: stats.invalid, alert: stats.invalid > 0 },
    { label: 'Unique', value: stats.unique },
    { label: 'Duplicates', value: stats.duplicates },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Email Addresses
          </CardTitle>
          <CardDescription>
            One address per line, or separated by commas or semicolons. A name in front, like Ada &lt;ada@example.com&gt;,
            is fine. Nothing leaves your browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste addresses here..."
            aria-label="Email addresses"
            rows={8}
            spellCheck={false}
            className="font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setText(EXAMPLE_TEXT)} variant="outline" size="sm">
              Load Example
            </Button>
            <Button onClick={() => setText('')} variant="outline" size="sm" disabled={!hasText}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rules</CardTitle>
          <CardDescription>The domain is always lower-cased, because domain names ignore case.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <Checkbox
            label="Lower-case the part before the @"
            checked={options.lowercaseLocal}
            onCheckedChange={(checked) => update('lowercaseLocal', checked)}
          />
          <Checkbox
            label="Gmail: remove dots and +tag, googlemail.com becomes gmail.com"
            checked={options.gmailRules}
            onCheckedChange={(checked) => update('gmailRules', checked)}
          />
          <Checkbox
            label="Remove +tag at other providers too"
            checked={options.stripPlusTags}
            onCheckedChange={(checked) => update('stripPlusTags', checked)}
          />
          <Checkbox
            label="Write international domains in ASCII (punycode)"
            checked={options.idnToAscii}
            onCheckedChange={(checked) => update('idnToAscii', checked)}
          />
          <Checkbox
            label="Leave duplicates out of the result"
            checked={options.removeDuplicates}
            onCheckedChange={(checked) => update('removeDuplicates', checked)}
          />
        </CardContent>
      </Card>

      {!hasText ? (
        <Card className="flex items-center justify-center py-6 text-muted-foreground sm:py-12">
          <CardContent className="text-center text-sm">
            Paste some addresses above, or load the example, to normalize them.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Result</CardTitle>
              <CardDescription>Valid addresses in their normalized form, one per line.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3" role="group" aria-label="Summary">
                {statTiles.map((tile) => (
                  <div key={tile.label} className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">{tile.label}</div>
                    <div className={cn('text-xl font-semibold tabular-nums', tile.alert && 'text-destructive')}>
                      {tile.value.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
              <Textarea
                readOnly
                value={result.output}
                aria-label="Normalized addresses"
                rows={6}
                spellCheck={false}
                className="bg-muted/30 font-mono text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => copyToClipboard(result.output)}
                  disabled={!result.output}
                  size="sm"
                  variant={isCopied ? 'default' : 'outline'}
                >
                  {isCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {isCopied ? 'Copied' : 'Copy Result'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {result.entries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
                <CardDescription>Each address with its normalized form and what was found.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
                    <caption className="sr-only">Addresses with their normalized form and status</caption>
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        {['#', 'Address', 'Normalized', 'Status'].map((heading) => (
                          <th key={heading} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((entry) => (
                        <tr key={entry.position} className="border-t align-top">
                          <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{entry.position}</td>
                          <td className="break-all px-3 py-1.5 font-mono">{entry.original}</td>
                          <td className="break-all px-3 py-1.5 font-mono">{entry.valid ? entry.normalized : ''}</td>
                          <td className="px-3 py-1.5">
                            <StatusBadge entry={entry} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.entries.length > MAX_ROWS && (
                  <p className="text-xs text-muted-foreground" role="status">
                    Showing the first {MAX_ROWS.toLocaleString()} of {result.entries.length.toLocaleString()} rows. The result
                    above covers all of them.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
