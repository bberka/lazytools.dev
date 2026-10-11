'use client';

import { useState, type KeyboardEvent } from 'react';
import { Button } from '../ui/button';
import { TooltipSimple } from '../ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { Copy, Check, Network, Calculator } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { calculateSubnet, type SubnetInfo } from '@/lib/tools/subnet-calculator';

export function SubnetCalculator() {
  const [ipInput, setIpInput] = useState('');
  const [cidrInput, setCidrInput] = useState('24');
  const [subnetInfo, setSubnetInfo] = useState<SubnetInfo | null>(null);
  const [error, setError] = useState('');
  const [lastCopied, setLastCopied] = useState<string | null>(null);

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  // The check mark follows the hook's status: it shows only after a copy that
  // worked, and the hook's one timer takes it away again.
  const copiedField = isCopied ? lastCopied : null;

  const calculate = () => {
    const result = calculateSubnet(ipInput, cidrInput);

    if (!result.ok) {
      setSubnetInfo(null);
      setError(result.error);
      return;
    }

    setError('');
    setSubnetInfo(result.info);

    // A prefix typed after the address ("10.0.0.1/8") was used in place of the
    // CIDR field, so the fields are brought in line with the result.
    if (ipInput.includes('/')) {
      setIpInput(result.info.ipAddress);
      setCidrInput(String(result.info.cidr));
    }
  };

  const handleEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && ipInput) {
      calculate();
    }
  };

  const handleCopy = (text: string, fieldId: string) => {
    if (!text) return;
    setLastCopied(fieldId);
    void copyToClipboard(text);
  };

  const handleClear = () => {
    setIpInput('');
    setCidrInput('24');
    setSubnetInfo(null);
    setError('');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Subnet Calculator
          </CardTitle>
          <CardDescription>
            Calculate subnet information from IP address and CIDR notation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="text"
              value={ipInput}
              onChange={(e) => setIpInput((e.target as HTMLInputElement).value)}
              onKeyDown={handleEnter}
              placeholder="e.g., 192.168.1.1"
              aria-label="IP address"
              className="flex-1 font-mono"
            />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">/</span>
              <Input
                type="number"
                value={cidrInput}
                onChange={(e) => setCidrInput((e.target as HTMLInputElement).value)}
                onKeyDown={handleEnter}
                placeholder="24"
                min="0"
                max="32"
                aria-label="CIDR prefix length"
                className="w-20 font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={calculate} disabled={!ipInput}>
          <Calculator className="h-4 w-4 mr-2" />
          Calculate
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
      {subnetInfo && (
        <div className="space-y-4">
          {/* Network Information */}
          <Card>
            <CardHeader>
              <CardTitle>Network Information</CardTitle>
              <CardDescription>IP and subnet details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* IP Address */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">IP Address</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded-md bg-muted font-mono text-sm">
                      {subnetInfo.ipAddress}/{subnetInfo.cidr}
                    </code>
                    <TooltipSimple content="Copy IP/CIDR">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(`${subnetInfo.ipAddress}/${subnetInfo.cidr}`, 'ip-cidr')}
                        aria-label="Copy IP/CIDR"
                      >
                        {copiedField === 'ip-cidr' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipSimple>
                  </div>
                </div>

                {/* Subnet Mask */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Subnet Mask</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded-md bg-muted font-mono text-sm">
                      {subnetInfo.subnetMask}
                    </code>
                    <TooltipSimple content="Copy subnet mask">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(subnetInfo.subnetMask, 'subnet-mask')}
                        aria-label="Copy subnet mask"
                      >
                        {copiedField === 'subnet-mask' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipSimple>
                  </div>
                </div>

                {/* Wildcard Mask */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Wildcard Mask</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded-md bg-muted font-mono text-sm">
                      {subnetInfo.wildcardMask}
                    </code>
                    <TooltipSimple content="Copy wildcard mask">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(subnetInfo.wildcardMask, 'wildcard-mask')}
                        aria-label="Copy wildcard mask"
                      >
                        {copiedField === 'wildcard-mask' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipSimple>
                  </div>
                </div>

                {/* Binary Subnet Mask */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Binary Subnet Mask
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded-md bg-muted font-mono text-xs break-all">
                      {subnetInfo.binarySubnetMask}
                    </code>
                    <TooltipSimple content="Copy binary mask">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(subnetInfo.binarySubnetMask, 'binary-mask')}
                        aria-label="Copy binary mask"
                      >
                        {copiedField === 'binary-mask' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipSimple>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Host Information */}
          <Card>
            <CardHeader>
              <CardTitle>Host Range</CardTitle>
              <CardDescription>Network and usable IP addresses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Network Address */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">
                    Network Address
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded-md bg-muted font-mono text-sm">
                      {subnetInfo.networkAddress}
                    </code>
                    <TooltipSimple content="Copy network address">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(subnetInfo.networkAddress, 'network-address')}
                        aria-label="Copy network address"
                      >
                        {copiedField === 'network-address' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipSimple>
                  </div>
                </div>

                {/* Broadcast Address */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">
                    Broadcast Address
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded-md bg-muted font-mono text-sm">
                      {subnetInfo.broadcastAddress}
                    </code>
                    <TooltipSimple content="Copy broadcast address">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(subnetInfo.broadcastAddress, 'broadcast-address')}
                        aria-label="Copy broadcast address"
                      >
                        {copiedField === 'broadcast-address' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipSimple>
                  </div>
                </div>

                {/* First Usable IP */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">
                    First Usable IP
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded-md bg-muted font-mono text-sm">
                      {subnetInfo.firstUsableIP}
                    </code>
                    <TooltipSimple content="Copy first IP">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(subnetInfo.firstUsableIP, 'first-ip')}
                        aria-label="Copy first IP"
                      >
                        {copiedField === 'first-ip' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipSimple>
                  </div>
                </div>

                {/* Last Usable IP */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">
                    Last Usable IP
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded-md bg-muted font-mono text-sm">
                      {subnetInfo.lastUsableIP}
                    </code>
                    <TooltipSimple content="Copy last IP">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(subnetInfo.lastUsableIP, 'last-ip')}
                        aria-label="Copy last IP"
                      >
                        {copiedField === 'last-ip' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipSimple>
                  </div>
                </div>

                {/* Total Hosts */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Total Hosts</label>
                  <div className="p-2 rounded-md bg-muted text-sm font-mono">
                    {subnetInfo.totalHosts.toLocaleString()}
                  </div>
                </div>

                {/* Usable Hosts */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Usable Hosts</label>
                  <div className="p-2 rounded-md bg-muted text-sm font-mono">
                    {subnetInfo.usableHosts.toLocaleString()}
                  </div>
                </div>

                {/* IP Class */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">IP Class</label>
                  <div className="p-2 rounded-md bg-muted text-sm">{subnetInfo.ipClass}</div>
                </div>

                {/* IP Type */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">IP Type</label>
                  <div className="p-2 rounded-md bg-muted text-sm">{subnetInfo.ipType}</div>
                </div>
              </div>
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
              <p className="font-medium">About Subnetting</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>CIDR notation (e.g., /24) represents the number of network bits</li>
                <li>Common CIDR values: /8 (16.7M hosts), /16 (65K hosts), /24 (254 hosts)</li>
                <li>Network address is the first IP in the range</li>
                <li>Broadcast address is the last IP in the range</li>
                <li>Usable hosts = Total hosts - 2 (excluding network and broadcast)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
