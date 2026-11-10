'use client';

import { useMemo, useState } from 'react';
import { Download, Layers, Trash2 } from 'lucide-react';
import { ErrorNote } from './ErrorNote';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { downloadText } from '@/lib/files';
import {
  collapseToCidrs,
  expandRanges,
  MAX_EXPANDED_ADDRESSES,
} from '@/lib/tools/ipv4-range-expander';
import { CopyValueButton } from './CopyValueButton';

type Mode = 'expand' | 'collapse';

/** How many addresses are drawn in the page; the copy and download hold them all. */
const PREVIEW_LIMIT = 1000;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="break-all font-mono text-sm">{value}</div>
    </div>
  );
}

export function Ipv4RangeExpander() {
  const [mode, setMode] = useState<Mode>('expand');
  const [input, setInput] = useState('');

  const hasInput = input.trim() !== '';
  const expanded = useMemo(() => (hasInput && mode === 'expand' ? expandRanges(input) : null), [hasInput, mode, input]);
  const collapsed = useMemo(() => (hasInput && mode === 'collapse' ? collapseToCidrs(input) : null), [hasInput, mode, input]);

  const listText = expanded?.ok ? expanded.addresses.join('\n') : '';
  const blocksText = collapsed?.ok ? collapsed.blocks.join('\n') : '';

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Ranges
          </CardTitle>
          <CardDescription>
            One entry per line (or comma separated): a CIDR block such as 192.168.1.0/24, a range such as
            10.0.0.1 - 10.0.0.20, or a single address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
            <TabsList>
              <TabsTrigger value="expand">Expand to list</TabsTrigger>
              <TabsTrigger value="collapse">Collapse to CIDR</TabsTrigger>
            </TabsList>
          </Tabs>

          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={'192.168.1.0/28\n10.0.0.250 - 10.0.1.2'}
            aria-label="CIDR blocks, ranges and addresses"
            rows={6}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="none"
            className="font-mono text-sm"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {mode === 'expand'
                ? `Lists up to ${MAX_EXPANDED_ADDRESSES.toLocaleString('en-US')} addresses (a /16). A CIDR block lists its whole network, including the network and broadcast addresses.`
                : 'Merges overlapping and touching entries, then writes the fewest CIDR blocks that cover them.'}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => setInput('')} disabled={!hasInput}>
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {!hasInput && (
        <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground sm:py-8">
          Enter a CIDR block or a range to see the result.
        </p>
      )}

      {expanded && !expanded.ok && (
        <div className="space-y-3">
          <ErrorNote>{expanded.error}</ErrorNote>
          {expanded.count !== undefined && expanded.first && expanded.last && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Stat label="Addresses" value={expanded.count.toLocaleString('en-US')} />
              <Stat label="First" value={expanded.first} />
              <Stat label="Last" value={expanded.last} />
            </div>
          )}
        </div>
      )}

      {expanded?.ok && (
        <Card>
          <CardHeader>
            <CardTitle>Address list</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Stat label="Addresses" value={expanded.count.toLocaleString('en-US')} />
              <Stat label="First" value={expanded.first} />
              <Stat label="Last" value={expanded.last} />
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyValueButton text={listText} label="Copy list" showLabel />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadText(`${listText}\n`, 'ipv4-addresses.txt')}
              >
                <Download className="h-4 w-4" />
                Download .txt
              </Button>
            </div>
            <Textarea
              readOnly
              value={expanded.addresses.slice(0, PREVIEW_LIMIT).join('\n')}
              aria-label="Expanded address list"
              rows={10}
              className="font-mono text-sm"
            />
            {expanded.count > PREVIEW_LIMIT && (
              <p className="text-xs text-muted-foreground">
                Showing the first {PREVIEW_LIMIT.toLocaleString('en-US')} addresses. Copy and download include all{' '}
                {expanded.count.toLocaleString('en-US')}.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {collapsed && !collapsed.ok && <ErrorNote>{collapsed.error}</ErrorNote>}

      {collapsed?.ok && (
        <Card>
          <CardHeader>
            <CardTitle>Minimal CIDR blocks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Stat label="Addresses covered" value={collapsed.count.toLocaleString('en-US')} />
              <Stat label="CIDR blocks" value={collapsed.blocks.length.toLocaleString('en-US')} />
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyValueButton text={blocksText} label="Copy blocks" showLabel />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadText(`${blocksText}\n`, 'ipv4-cidr-blocks.txt')}
              >
                <Download className="h-4 w-4" />
                Download .txt
              </Button>
            </div>
            <Textarea
              readOnly
              value={blocksText}
              aria-label="CIDR blocks"
              rows={Math.min(Math.max(collapsed.blocks.length, 3), 14)}
              className="font-mono text-sm"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
