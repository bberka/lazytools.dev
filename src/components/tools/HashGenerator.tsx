'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Copy, Check, Upload, FileText, X, File, ShieldAlert, CheckCircle2, Trash2 } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { useFileIntake } from '@/hooks/useFileIntake';
import { formatBytes, readFileAsArrayBuffer, type FormatBytesOptions } from '@/lib/files';
import {
  EMPTY_HASHES,
  HASH_ALGORITHMS,
  computeHashes,
  findMatchingAlgorithm,
  type HashAlgorithm,
  type HashSet,
} from '@/lib/tools/hash-generator';

const SIZE_FORMAT: FormatBytesOptions = { fixed: true, byteUnit: 'B' };

export function HashGenerator() {
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [input, setInput] = useState('');
  const [hashes, setHashes] = useState<HashSet>(EMPTY_HASHES);
  const [copiedHash, setCopiedHash] = useState<HashAlgorithm | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Hash comparison state
  const [compareHash, setCompareHash] = useState('');

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  // Hashing is asynchronous. Every new input, clear or mode switch takes a new
  // number, and a run only shows its result while its number is still current,
  // so a slow earlier run cannot overwrite a newer one.
  const latestRun = useRef(0);

  const handleCopy = async (algorithm: HashAlgorithm) => {
    setCopiedHash(algorithm);
    await copyToClipboard(hashes[algorithm]);
  };

  const handleTextChange = async (text: string) => {
    const run = ++latestRun.current;
    setInput(text);
    setError('');
    if (!text) { setHashes(EMPTY_HASHES); return; }
    try {
      const results = await computeHashes(text);
      if (run === latestRun.current) setHashes(results);
    } catch (err) {
      if (run !== latestRun.current) return;
      setHashes(EMPTY_HASHES);
      setError(err instanceof Error ? err.message : 'Failed to compute hashes');
    }
  };

  const clearText = () => {
    void handleTextChange('');
    setCompareHash('');
  };

  const processFile = useCallback(async (f: File) => {
    const run = ++latestRun.current;
    setFile(f);
    setHashes(EMPTY_HASHES);
    setError('');
    setLoading(true);
    try {
      const buffer = await readFileAsArrayBuffer(f);
      const results = await computeHashes(buffer);
      if (run === latestRun.current) setHashes(results);
    } catch (err) {
      if (run === latestRun.current) setError(err instanceof Error ? err.message : 'Failed to read file');
    } finally {
      if (run === latestRun.current) setLoading(false);
    }
  }, []);

  const intake = useFileIntake({ onFiles: ([f]) => processFile(f) });

  const clearFile = () => {
    latestRun.current += 1;
    setFile(null);
    setHashes(EMPTY_HASHES);
    setCompareHash('');
    setError('');
    setLoading(false);
    intake.reset();
  };

  const switchMode = (m: 'text' | 'file') => {
    latestRun.current += 1;
    setMode(m);
    setHashes(EMPTY_HASHES);
    setCompareHash('');
    setError('');
    setLoading(false);
    if (m === 'text') { setFile(null); intake.reset(); }
    else { setInput(''); }
  };

  // Check if comparison hash matches any calculated algorithm
  const matchingAlgorithm = useMemo(
    () => findMatchingAlgorithm(hashes, compareHash),
    [compareHash, hashes]
  );

  const hasAnyHash = HASH_ALGORITHMS.some((a) => hashes[a]);

  return (
    <div className="space-y-6">
      <Tabs value={mode} onValueChange={(val) => switchMode(val as 'text' | 'file')} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="text" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Text
          </TabsTrigger>
          <TabsTrigger value="file" className="flex items-center gap-2">
            <File className="h-4 w-4" />
            File Checksum
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === 'text' ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Input</CardTitle>
              <CardDescription>Hashes update in real time</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={clearText} disabled={!input}>
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </CardHeader>
          <CardContent>
            <Textarea
              value={input}
              onChange={(e) => handleTextChange((e.target as HTMLTextAreaElement).value)}
              placeholder="Enter text to hash..."
              aria-label="Text to hash"
              rows={6}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>File</CardTitle>
            <CardDescription>Drop a file or click to select — hashed entirely in browser</CardDescription>
          </CardHeader>
          <CardContent>
            {file ? (
              <div className="flex items-center gap-3 p-4 rounded-md border bg-muted">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{formatBytes(file.size, SIZE_FORMAT)}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={clearFile} aria-label="Remove file">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                {...intake.dropzoneProps}
                className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-md p-6 sm:p-10 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${intake.isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'}`}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Drop file here or click to browse</p>
                <input {...intake.inputProps} aria-label="Select file to hash" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && (
        <div role="status" className="text-sm text-muted-foreground px-1">Computing hashes...</div>
      )}

      {/* Checksum Comparison Card */}
      {hasAnyHash && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              Compare Checksum
            </CardTitle>
            <CardDescription className="text-xs">
              Paste an expected hash string (MD5, SHA-1, SHA-256 etc.) to verify matching outputs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={compareHash}
              onChange={(e) => setCompareHash((e.target as HTMLInputElement).value)}
              placeholder="Paste checksum here..."
              aria-label="Expected checksum"
              className="font-mono text-sm bg-background"
            />
            {compareHash.trim() && (
              <div role="status" className="flex items-center gap-2 text-sm mt-1">
                {matchingAlgorithm ? (
                  <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-medium">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Checksum verified! Matches {matchingAlgorithm} hash.
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-500 font-medium">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    No match found in computed hashes.
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Calculated Output List */}
      <div className="space-y-3">
        {HASH_ALGORITHMS.map((algorithm) => {
          const isMatch = matchingAlgorithm === algorithm;
          const justCopied = isCopied && copiedHash === algorithm;
          return (
            <Card
              key={algorithm}
              className={isMatch ? 'border-green-500/50 bg-green-500/5 dark:bg-green-500/10 transition-colors' : 'transition-colors'}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{algorithm}</CardTitle>
                  {isMatch && (
                    <span className="rounded-full bg-green-500/20 text-green-700 dark:text-green-300 px-2 py-0.5 text-xs font-semibold">
                      Match Verified
                    </span>
                  )}
                </div>
                <Button
                  variant={justCopied ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => handleCopy(algorithm)}
                  disabled={!hashes[algorithm]}
                  aria-label={justCopied ? `${algorithm} hash copied` : `Copy ${algorithm} hash`}
                >
                  {justCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="p-3 rounded-md bg-muted font-mono text-sm break-all">
                  {hashes[algorithm] || (hasAnyHash ? '-' : <span className="text-muted-foreground">—</span>)}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
