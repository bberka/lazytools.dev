'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Copy, Check, Server, Loader2, Search } from 'lucide-react';
import { useCopyToClipboard, useActionButton } from '@/hooks';
import { TooltipSimple } from '../ui/tooltip';
import {
  DNS_RECORD_TYPES,
  describeDnsRecords,
  formatTtl,
  lookupDns,
  sameDnsName,
  type DnsLookupResult,
  type DnsRecordType,
} from '@/lib/tools/dns-lookup';

export function DnsLookup() {
  const [domain, setDomain] = useState('');
  const [recordType, setRecordType] = useState<DnsRecordType>('A');
  // Holds the name and type that were queried, so the results keep describing
  // that lookup while the fields above are edited for the next one.
  const [dnsResult, setDnsResult] = useState<DnsLookupResult | null>(null);
  const [error, setError] = useState('');
  const [lastCopied, setLastCopied] = useState<string | null>(null);

  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const { executeAction: executeLookup, isLoading } = useActionButton();

  // The lookup in flight, so that Clear and leaving the page can cancel it.
  const activeLookup = useRef<AbortController | null>(null);

  useEffect(() => () => activeLookup.current?.abort(), []);

  // The check mark follows the hook's status: it shows only after a copy that
  // worked, and the hook's one timer takes it away again.
  const copiedItem = isCopied ? lastCopied : null;

  const lookupDNS = async () => {
    activeLookup.current?.abort();
    const controller = new AbortController();
    activeLookup.current = controller;

    setError('');
    setDnsResult(null);

    // Using Google's DNS-over-HTTPS API
    const outcome = await lookupDns(domain, recordType, { signal: controller.signal });
    if (controller.signal.aborted) return;

    if (outcome.ok) {
      setDnsResult(outcome.result);
    } else {
      setError(outcome.error);
    }
  };

  const handleLookup = async () => {
    await executeLookup(lookupDNS);
  };

  const handleCopy = (text: string, itemId: string) => {
    if (!text) return;
    setLastCopied(itemId);
    void copyToClipboard(text);
  };

  const handleClear = () => {
    activeLookup.current?.abort();
    setDomain('');
    setDnsResult(null);
    setError('');
  };

  const copyAllRecords = () => {
    if (!dnsResult) return;
    const text = dnsResult.records.map(r => r.data).join('\n');
    handleCopy(text, 'all-records');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            DNS Records Lookup
          </CardTitle>
          <CardDescription>
            Query DNS records for any domain
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="text"
              value={domain}
              onChange={(e) => setDomain((e.target as HTMLInputElement).value)}
              placeholder="e.g., google.com"
              aria-label="Domain name"
              className="flex-1 font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading) {
                  handleLookup();
                }
              }}
            />
            <Select value={recordType} onValueChange={(value) => setRecordType(value as DnsRecordType)}>
              <SelectTrigger className="w-full sm:w-32" aria-label="Record Type">
                <SelectValue placeholder="Record type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {DNS_RECORD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleLookup} disabled={isLoading || !domain}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Looking up...
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              Lookup DNS
            </>
          )}
        </Button>
        <Button variant="outline" onClick={handleClear}>
          Clear
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Results */}
      {dnsResult && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>DNS Records</CardTitle>
              <CardDescription>{describeDnsRecords(dnsResult)}</CardDescription>
            </div>
            <TooltipSimple content="Copy all records">
              <Button
                variant="ghost"
                size="icon"
                onClick={copyAllRecords}
                aria-label="Copy all records"
              >
                {copiedItem === 'all-records' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </TooltipSimple>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dnsResult.records.map((record, index) => (
                <div
                  key={index}
                  className="p-3 rounded-md bg-muted border border-input space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {/* An alias answers with its CNAME records as well; those are marked as such. */}
                        {record.type !== dnsResult.type && (
                          <span className="rounded bg-background px-1.5 py-0.5 text-xs font-medium">
                            {record.type}
                          </span>
                        )}
                        <span className="text-xs font-medium text-muted-foreground">
                          TTL: {formatTtl(record.ttl)}
                        </span>
                      </div>
                      <code className="block p-2 rounded bg-background font-mono text-sm break-all">
                        {record.data}
                      </code>
                    </div>
                    <TooltipSimple content="Copy record">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(record.data, `record-${index}`)}
                        aria-label="Copy record"
                        className="shrink-0"
                      >
                        {copiedItem === `record-${index}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipSimple>
                  </div>
                  {record.name && !sameDnsName(record.name, dnsResult.name) && (
                    <div className="text-xs text-muted-foreground">
                      Name: {record.name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Record Type Information */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 sm:pt-6">
          <div className="flex items-start gap-3">
            <div className="text-primary">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="text-sm space-y-2">
              <p className="font-medium">DNS Record Types</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li><strong>A</strong> - IPv4 address records</li>
                <li><strong>AAAA</strong> - IPv6 address records</li>
                <li><strong>MX</strong> - Mail exchange servers</li>
                <li><strong>TXT</strong> - Text records (SPF, DKIM, etc.)</li>
                <li><strong>NS</strong> - Nameserver records</li>
                <li><strong>CNAME</strong> - Canonical name (alias) records</li>
                <li><strong>SOA</strong> - Start of authority records</li>
              </ul>
              <p className="text-muted-foreground mt-2">
                Uses Google DNS-over-HTTPS for secure queries
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
