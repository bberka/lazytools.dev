'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Copy, Check, Trash2, ArrowLeftRight, FolderArchive, FolderOpen } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { formatBytes, type FormatBytesOptions } from '@/lib/files';

async function compress(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return btoa(String.fromCharCode(...result));
}

async function decompress(base64: string): Promise<string> {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(result);
}

const SIZE_FORMAT: FormatBytesOptions = { fixed: true, byteUnit: 'B' };

export function GzipCompressor() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [mode, setMode] = useState<'compress' | 'decompress'>('compress');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ inputSize: number; outputSize: number } | null>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const handleProcess = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    setStats(null);
    try {
      const result = mode === 'compress' ? await compress(input) : await decompress(input);
      setOutput(result);
      setStats({ inputSize: new TextEncoder().encode(input).length, outputSize: new TextEncoder().encode(result).length });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
      setOutput('');
    } finally {
      setLoading(false);
    }
  };

  const handleSwap = () => {
    setInput(output);
    setOutput('');
    setMode(mode === 'compress' ? 'decompress' : 'compress');
    setStats(null);
    setError('');
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setError('');
    setStats(null);
  };

  const compressionRatio =
    stats && mode === 'compress' && stats.inputSize > 0
      ? ((1 - stats.outputSize / stats.inputSize) * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-6">
      <Tabs
        value={mode}
        onValueChange={(val) => {
          setMode(val as 'compress' | 'decompress');
          setOutput('');
          setError('');
          setStats(null);
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
            onChange={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            placeholder={mode === 'compress' ? 'Type or paste text here...' : 'Paste Base64 GZip string here...'}
            rows={8}
            className="font-mono"
          />
        </CardContent>
      </Card>

      <div className="flex gap-2">
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
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {stats && (
        <div className="bg-muted rounded-md px-4 py-3 text-sm flex flex-wrap gap-4">
          <span>Input: <strong>{formatBytes(stats.inputSize, SIZE_FORMAT)}</strong></span>
          <span>Output: <strong>{formatBytes(stats.outputSize, SIZE_FORMAT)}</strong></span>
          {compressionRatio !== null && (
            <span>Ratio: <strong>{compressionRatio}% smaller</strong></span>
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
