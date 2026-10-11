'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { Radar, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useActionButton } from '@/hooks';
import { planScan, probePort, type ScanMode } from '@/lib/tools/port-checker';

interface PortResult {
  port: number;
  service: string;
  status: 'open' | 'closed' | 'filtered' | 'checking';
  protocol?: string;
}

export function PortChecker() {
  const [hostname, setHostname] = useState('');
  const [customPorts, setCustomPorts] = useState('');
  const [scanResults, setScanResults] = useState<PortResult[]>([]);
  const [error, setError] = useState('');
  const [scanMode, setScanMode] = useState<ScanMode>('common');

  const { executeAction: executeScan, isLoading } = useActionButton();

  const hostnameId = useId();
  const customPortsId = useId();

  // The scan in flight, so that Clear and leaving the page can stop it.
  const activeScan = useRef<AbortController | null>(null);

  useEffect(() => () => activeScan.current?.abort(), []);

  const scanPorts = async () => {
    activeScan.current?.abort();
    const controller = new AbortController();
    activeScan.current = controller;

    setError('');
    setScanResults([]);

    const plan = planScan(hostname, scanMode, customPorts);
    if (!plan.ok) {
      setError(plan.error);
      return;
    }

    setScanResults(plan.ports.map((target) => ({ ...target, status: 'checking' as const })));

    // Scan ports sequentially to avoid overwhelming the browser
    for (const target of plan.ports) {
      const status = await probePort(plan.host, target.port, { signal: controller.signal });
      if (controller.signal.aborted) return;

      setScanResults((prev) =>
        prev.map((p) =>
          p.port === target.port
            ? { ...p, status }
            : p
        )
      );
    }
  };

  const handleScan = async () => {
    await executeScan(scanPorts);
  };

  const handleClear = () => {
    activeScan.current?.abort();
    setHostname('');
    setCustomPorts('');
    setScanResults([]);
    setError('');
  };

  const openPorts = scanResults.filter((r) => r.status === 'open').length;
  const closedPorts = scanResults.filter((r) => r.status === 'closed').length;
  const filteredPorts = scanResults.filter((r) => r.status === 'filtered').length;
  const checkingPorts = scanResults.filter((r) => r.status === 'checking').length;

  return (
    <div className="space-y-4">
      {/* Warning */}
      <Card className="border-yellow-500/20 bg-yellow-500/5">
        <CardContent className="pt-4 sm:pt-6">
          <div className="flex items-start gap-3">
            <div className="text-yellow-600 dark:text-yellow-500">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="text-sm space-y-2">
              <p className="font-medium">Browser Limitations</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>This tool has limited capabilities due to browser security restrictions</li>
                <li>Only HTTP/HTTPS ports can be reliably checked</li>
                <li>Most ports will show as &quot;filtered&quot; rather than definitively open/closed</li>
                <li>For comprehensive port scanning, use dedicated tools like nmap</li>
                <li>Only scan systems you own or have permission to test</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mode Selection */}
      <div className="flex gap-2">
        <Button
          variant={scanMode === 'common' ? 'default' : 'outline'}
          onClick={() => setScanMode('common')}
          aria-pressed={scanMode === 'common'}
          className="flex-1 sm:flex-none"
        >
          Common Ports
        </Button>
        <Button
          variant={scanMode === 'custom' ? 'default' : 'outline'}
          onClick={() => setScanMode('custom')}
          aria-pressed={scanMode === 'custom'}
          className="flex-1 sm:flex-none"
        >
          Custom Ports
        </Button>
      </div>

      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radar className="h-5 w-5" />
            Port Scanner
          </CardTitle>
          <CardDescription>
            Check if ports are open on a target host
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <label htmlFor={hostnameId} className="text-sm font-medium mb-2 block">Hostname or IP Address</label>
              <Input
                id={hostnameId}
                type="text"
                value={hostname}
                onChange={(e) => setHostname((e.target as HTMLInputElement).value)}
                placeholder="e.g., localhost, 192.168.1.1, example.com"
                className="font-mono"
              />
            </div>

            {scanMode === 'custom' && (
              <div>
                <label htmlFor={customPortsId} className="text-sm font-medium mb-2 block">
                  Ports (comma-separated or ranges)
                </label>
                <Input
                  id={customPortsId}
                  type="text"
                  value={customPorts}
                  onChange={(e) => setCustomPorts((e.target as HTMLInputElement).value)}
                  placeholder="e.g., 80,443,8000-8010"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum 50 ports per scan
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleScan} disabled={isLoading || !hostname}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Radar className="h-4 w-4 mr-2" />
              Scan Ports
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

      {/* Progress */}
      {scanResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Scan Progress</CardTitle>
            <CardDescription>
              {checkingPorts > 0
                ? `Scanning... ${scanResults.length - checkingPorts}/${scanResults.length} ports checked`
                : `Scan complete - ${scanResults.length} ports scanned`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-500">
                  {openPorts}
                </div>
                <div className="text-sm text-muted-foreground">Open</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600 dark:text-red-500">
                  {closedPorts}
                </div>
                <div className="text-sm text-muted-foreground">Closed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-500">
                  {filteredPorts}
                </div>
                <div className="text-sm text-muted-foreground">Filtered</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-500">
                  {checkingPorts}
                </div>
                <div className="text-sm text-muted-foreground">Checking</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {scanResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Scan Results</CardTitle>
            <CardDescription>Port status and service information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scanResults.map((result) => (
                <div
                  key={result.port}
                  className="flex items-center justify-between p-3 rounded-md border border-input"
                >
                  <div className="flex items-center gap-3">
                    {result.status === 'open' && (
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-500" />
                    )}
                    {result.status === 'closed' && (
                      <XCircle className="h-5 w-5 text-red-600 dark:text-red-500" />
                    )}
                    {result.status === 'filtered' && (
                      <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                    )}
                    {result.status === 'checking' && (
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-500" />
                    )}
                    <div>
                      <div className="font-medium">
                        Port {result.port} <span className="text-muted-foreground">- {result.service}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {result.protocol}
                      </div>
                    </div>
                  </div>
                  <div>
                    <span
                      className={`text-sm font-medium ${
                        result.status === 'open'
                          ? 'text-green-600 dark:text-green-500'
                          : result.status === 'closed'
                          ? 'text-red-600 dark:text-red-500'
                          : result.status === 'filtered'
                          ? 'text-yellow-600 dark:text-yellow-500'
                          : 'text-blue-600 dark:text-blue-500'
                      }`}
                    >
                      {result.status.charAt(0).toUpperCase() + result.status.slice(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground px-1">
        <span><CheckCircle className="inline h-3.5 w-3.5 text-green-600 dark:text-green-500 mr-1" /><strong>Open</strong> – Port responded</span>
        <span><XCircle className="inline h-3.5 w-3.5 text-red-600 dark:text-red-500 mr-1" /><strong>Closed</strong> – Connection refused</span>
        <span><AlertCircle className="inline h-3.5 w-3.5 text-yellow-600 dark:text-yellow-500 mr-1" /><strong>Filtered</strong> – No response / blocked</span>
        <span><Loader2 className="inline h-3.5 w-3.5 text-blue-600 dark:text-blue-500 mr-1" /><strong>Checking</strong> – Testing port</span>
      </div>
    </div>
  );
}
