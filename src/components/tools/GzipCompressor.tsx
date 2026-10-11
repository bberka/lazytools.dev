'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Copy, Check, Trash2, ArrowLeftRight, FolderArchive, FolderOpen } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { formatBytes, type FormatBytesOptions } from '@/lib/files';
import { runGzip, sizeChangeLabel, type GzipMode } from '@/lib/tools/gzip-compressor';

const SIZE_FORMAT: FormatBytesOptions = { fixed: true, byteUnit: 'B' };

export function GzipCompressor() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [mode, setMode] = useState<GzipMode>('compress');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ inputSize: number; outputSize: number } | null>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  // Each run takes a number; a result is only shown while its number is still the latest.
  const runId = useRef(0);
  useEffect(
    () => () => {
      runId.current += 1;
    },
    []
  );

  /** Drops the result on show and makes any run still in flight a stale one. */
  const resetResult = () => {
    runId.current += 1;
    setOutput('');
    setError('');
    setStats(null);
    setLoading(false);
  };

  const handleProcess = async () => {
    if (!input.trim()) return;
    const id = ++runId.current;
    setLoading(true);
    setError('');
    setStats(null);
    try {
      const result = await runGzip(mode, input);
      if (id !== runId.current) return;
      setOutput(result.output);
      setStats({ inputSize: result.inputSize, outputSize: result.outputSize });
    } catch (err) {
      if (id !== runId.current) return;
      setError(err instanceof Error ? err.message : 'Operation failed');
      setOutput('');
    }
    setLoading(false);
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    // The result belonged to the previous input.
    if (output || error || stats || loading) resetResult();
  };

  const handleSwap = () => {
    setInput(output);
    setMode(mode === 'compress' ? 'decompress' : 'compress');
    resetResult();
  };

  const handleClear = () => {
    setInput('');
    resetResult();
  };

  const sizeChange = stats && mode === 'compress' ? sizeChangeLabel(stats.inputSize, stats.outputSize) : null;

  return (
    <div className="space-y-6">
      <Tabs
        value={mode}
        onValueChange={(val) => {
          setMode(val as GzipMode);
          resetResult();
        }}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="compress" className="flex items-center gap-2">
            <FolderArchive className="h-4 w-4" />
            Compress
          </TabsTrigger>
          <TabsTrigger value="decompress" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Decompress
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Input</CardTitle>
          <CardDescription>
            {mode === 'compress' ? 'Enter text to compress' : 'Paste Base64-encoded GZip data'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={mode === 'compress' ? 'Type or paste text here...' : 'Paste Base64 GZip string here...'}
            aria-label={mode === 'compress' ? 'Text to compress' : 'Base64-encoded GZip data'}
            rows={8}
            className="font-mono"
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleProcess} disabled={!input.trim() || loading}>
          {loading ? 'Processing...' : mode === 'compress' ? 'Compress' : 'Decompress'}
        </Button>
        <Button onClick={handleSwap} disabled={!output} variant="outline">
          <ArrowLeftRight className="h-4 w-4 mr-2" />
          Swap
        </Button>
        <Button onClick={handleClear} variant="outline">
          <Trash2 className="h-4 w-4 mr-2" />
          Clear
        </Button>
      </div>

      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {stats && (
        <div className="bg-muted rounded-md px-4 py-3 text-sm flex flex-wrap gap-4">
          <span>Input: <strong>{formatBytes(stats.inputSize, SIZE_FORMAT)}</strong></span>
          <span>Output: <strong>{formatBytes(stats.outputSize, SIZE_FORMAT)}</strong></span>
          {sizeChange !== null && (
            <span>Ratio: <strong>{sizeChange}</strong></span>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Output</CardTitle>
          <CardDescription>
            {mode === 'compress' ? 'Base64-encoded GZip result' : 'Decompressed text'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Textarea
              value={output}
              readOnly
              placeholder="Output will appear here after processing..."
              aria-label={mode === 'compress' ? 'Base64-encoded GZip result' : 'Decompressed text'}
              rows={8}
              className="font-mono"
            />
            <Button
              onClick={() => copyToClipboard(output)}
              disabled={!output}
              size="sm"
              variant={isCopied ? 'default' : 'outline'}
            >
              {isCopied ? (
                <><Check className="h-4 w-4 mr-2" />Copied!</>
              ) : (
                <><Copy className="h-4 w-4 mr-2" />Copy</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
