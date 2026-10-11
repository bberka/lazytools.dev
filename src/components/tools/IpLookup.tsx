'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { Copy, Check, MapPin, Loader2, Search, Globe, Wifi } from 'lucide-react';
import { useCopyToClipboard, useActionButton } from '@/hooks';
import { TooltipSimple } from '../ui/tooltip';
import { lookupIp, type IpInfo } from '@/lib/tools/ip-lookup';

export function IpLookup() {
  const [ipAddress, setIpAddress] = useState('');
  const [ipInfo, setIpInfo] = useState<IpInfo | null>(null);
  const [error, setError] = useState('');
  const [lastCopied, setLastCopied] = useState<string | null>(null);

  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const { executeAction: executeLookup, isLoading } = useActionButton();

  // The lookup in flight, so that Clear and leaving the page can cancel it.
  const activeLookup = useRef<AbortController | null>(null);

  useEffect(() => () => activeLookup.current?.abort(), []);

  // The check mark follows the hook's status: it shows only after a copy that
  // worked, and the hook's one timer takes it away again.
  const copiedField = isCopied ? lastCopied : null;

  // `query` is passed in, not read from state: "My IP" clears the field and
  // looks up in the same click, before the cleared value has been rendered.
  const lookupIP = async (query: string) => {
    activeLookup.current?.abort();
    const controller = new AbortController();
    activeLookup.current = controller;

    setError('');
    setIpInfo(null);

    const outcome = await lookupIp(query, { signal: controller.signal });
    if (controller.signal.aborted) return;

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }

    if (outcome.info.bogon) {
      setError('This is a private/reserved IP address (bogon)');
    }
    setIpInfo(outcome.info);
  };

  const handleLookup = async () => {
    await executeLookup(() => lookupIP(ipAddress));
  };

  const handleCopy = (text: string, fieldId: string) => {
    if (!text) return;
    setLastCopied(fieldId);
    void copyToClipboard(text);
  };

  const handleClear = () => {
    activeLookup.current?.abort();
    setIpAddress('');
    setIpInfo(null);
    setError('');
  };

  const handleGetMyIP = async () => {
    setIpAddress('');
    await executeLookup(() => lookupIP(''));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            IP Address Lookup
          </CardTitle>
          <CardDescription>
            Enter an IP address to lookup or leave empty to check your current IP
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress((e.target as HTMLInputElement).value)}
              placeholder="e.g., 8.8.8.8 or leave empty for your IP"
              aria-label="IP address"
              className="flex-1 font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading) {
                  handleLookup();
                }
              }}
            />
            <Button onClick={handleGetMyIP} variant="outline" disabled={isLoading}>
              <Wifi className="h-4 w-4 mr-2" />
              My IP
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleLookup} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Looking up...
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              Lookup IP
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
      {ipInfo && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>IP Information</CardTitle>
              <CardDescription>Geolocation and network details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* IP Address */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">IP Address</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded-md bg-muted font-mono text-sm break-all">
                      {ipInfo.ip}
                    </code>
                    <TooltipSimple content="Copy IP">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(ipInfo.ip, 'ip')}
                        aria-label="Copy IP"
                      >
                        {copiedField === 'ip' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipSimple>
                  </div>
                </div>

                {/* Hostname */}
                {ipInfo.hostname && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Hostname</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 rounded-md bg-muted font-mono text-sm break-all">
                        {ipInfo.hostname}
                      </code>
                      <TooltipSimple content="Copy hostname">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopy(ipInfo.hostname!, 'hostname')}
                          aria-label="Copy hostname"
                        >
                          {copiedField === 'hostname' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </TooltipSimple>
                    </div>
                  </div>
                )}

                {/* City */}
                {ipInfo.city && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">City</label>
                    <div className="p-2 rounded-md bg-muted text-sm">
                      {ipInfo.city}
                    </div>
                  </div>
                )}

                {/* Region */}
                {ipInfo.region && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Region</label>
                    <div className="p-2 rounded-md bg-muted text-sm">
                      {ipInfo.region}
                    </div>
                  </div>
                )}

                {/* Country */}
                {ipInfo.country && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Country</label>
                    <div className="p-2 rounded-md bg-muted text-sm">
                      {ipInfo.country}
                    </div>
                  </div>
                )}

                {/* Postal Code */}
                {ipInfo.postal && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Postal Code</label>
                    <div className="p-2 rounded-md bg-muted text-sm">
                      {ipInfo.postal}
                    </div>
                  </div>
                )}

                {/* Location (Coordinates) */}
                {ipInfo.loc && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Location</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 rounded-md bg-muted font-mono text-sm">
                        {ipInfo.loc}
                      </code>
                      <TooltipSimple content="Copy coordinates">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopy(ipInfo.loc!, 'location')}
                          aria-label="Copy coordinates"
                        >
                          {copiedField === 'location' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </TooltipSimple>
                    </div>
                  </div>
                )}

                {/* Timezone */}
                {ipInfo.timezone && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Timezone</label>
                    <div className="p-2 rounded-md bg-muted text-sm">
                      {ipInfo.timezone}
                    </div>
                  </div>
                )}

                {/* Organization/ISP */}
                {ipInfo.org && (
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Organization (ISP)</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 rounded-md bg-muted font-mono text-sm break-all">
                        {ipInfo.org}
                      </code>
                      <TooltipSimple content="Copy organization">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopy(ipInfo.org!, 'organization')}
                          aria-label="Copy organization"
                        >
                          {copiedField === 'organization' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </TooltipSimple>
                    </div>
                  </div>
                )}
              </div>

              {/* Map Link */}
              {ipInfo.loc && (
                <div className="mt-4 pt-4 border-t">
                  <a
                    href={`https://www.google.com/maps?q=${ipInfo.loc}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Globe className="h-4 w-4" />
                    View on Google Maps
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Information Card */}
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
              <p className="font-medium">About IP Lookup</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Uses the ipinfo.io API for geolocation data, with freeipapi.com and ipapi.co as fallbacks</li>
                <li>Leave the input empty to check your current public IP</li>
                <li>Private IP addresses (10.x.x.x, 192.168.x.x, etc.) will show limited information</li>
                <li>Supports both IPv4 and IPv6 addresses</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
