'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { TooltipSimple } from '../ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Slider } from '../ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Copy, Check, Shield, Loader2, CheckCircle, XCircle, Info, RefreshCw } from 'lucide-react';
import { useCopyToClipboard, useActionButton } from '@/hooks';

type Algorithm = 'bcrypt' | 'argon2id' | 'argon2i' | 'argon2d';
type Mode = 'hash' | 'verify';

// Helper to convert base64 to Uint8Array (handling padding and base64url characters)
function base64ToUint8Array(base64String: string): Uint8Array {
  let padded = base64String;
  while (padded.length % 4 !== 0) {
    padded += '=';
  }
  padded = padded.replace(/-/g, '+').replace(/_/g, '/');
  
  const binaryString = window.atob(padded);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

interface ParsedArgon2 {
  algorithm: 'argon2id' | 'argon2i' | 'argon2d';
  version: number;
  memorySize: number;
  iterations: number;
  parallelism: number;
  salt: Uint8Array;
  hashLength: number;
}

function parseArgon2Hash(hash: string): ParsedArgon2 {
  const parts = hash.trim().split('$');
  // Expected parts: ['', algorithm, version, params, salt, hash]
  if (parts.length < 6) {
    throw new Error('Invalid Argon2 hash format. Expected: $argon2id$v=19$m=...,t=...,p=...$salt$hash');
  }

  const algorithm = parts[1];
  if (algorithm !== 'argon2id' && algorithm !== 'argon2i' && algorithm !== 'argon2d') {
    throw new Error(`Unsupported Argon2 variant: ${algorithm}`);
  }

  const versionPart = parts[2];
  if (!versionPart.startsWith('v=')) {
    throw new Error('Invalid Argon2 version format.');
  }
  const version = parseInt(versionPart.split('=')[1], 10);

  const paramsPart = parts[3];
  const params: Record<string, number> = {};
  paramsPart.split(',').forEach((param) => {
    const [key, val] = param.split('=');
    if (key && val) {
      params[key] = parseInt(val, 10);
    }
  });

  if (typeof params.m === 'undefined' || typeof params.t === 'undefined' || typeof params.p === 'undefined') {
    throw new Error('Missing Argon2 parameters (m, t, or p).');
  }

  const saltBase64 = parts[4];
  const hashBase64 = parts[5];

  const salt = base64ToUint8Array(saltBase64);
  const hashBytes = base64ToUint8Array(hashBase64);
  const hashLength = hashBytes.length;

  return {
    algorithm,
    version,
    memorySize: params.m,
    iterations: params.t,
    parallelism: params.p,
    salt,
    hashLength,
  };
}

export function PasswordHasher() {
  const [mode, setMode] = useState<Mode>('hash');
  const [algorithm, setAlgorithm] = useState<Algorithm>('argon2id');
  const [input, setInput] = useState('');
  const [hash, setHash] = useState('');
  
  // Bcrypt settings
  const [rounds, setRounds] = useState(10);

  // Argon2 settings
  const [iterations, setIterations] = useState(3);
  const [memorySize, setMemorySize] = useState(65536); // KiB
  const [parallelism, setParallelism] = useState(4);
  const [hashLength, setHashLength] = useState(32); // Bytes

  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);
  const [detectedAlgorithm, setDetectedAlgorithm] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const { executeAction: executeHash, isLoading: isHashing } = useActionButton();
  const { executeAction: executeVerify, isLoading: isVerifying } = useActionButton();

  const pathname = usePathname();
  const router = useRouter();

  // Client-side redirect if accessed via /tools/bcrypt-hasher
  useEffect(() => {
    if (pathname && pathname.endsWith('/bcrypt-hasher')) {
      router.replace('/tools/password-hasher');
    }
  }, [pathname, router]);

  // Clean state when changing modes or algorithms
  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setVerifyResult(null);
    setDetectedAlgorithm(null);
    setError('');
    if (newMode === 'hash') {
      setHash('');
    } else {
      setInput('');
    }
  };

  const generateHash = async () => {
    setError('');
    if (!input.trim()) {
      setError('Please enter text to hash');
      setHash('');
      return;
    }

    try {
      if (algorithm === 'bcrypt') {
        const { default: bcrypt } = await import('bcryptjs');
        const salt = await bcrypt.genSalt(rounds);
        const hashedPassword = await bcrypt.hash(input, salt);
        setHash(hashedPassword);
      } else {
        const { argon2id, argon2i, argon2d } = await import('hash-wasm');
        
        // Generate a cryptographically secure random 16-byte salt
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        
        const options = {
          password: input,
          salt,
          iterations,
          memorySize,
          parallelism,
          hashLength,
          outputType: 'encoded' as const,
        };

        let hashedPassword = '';
        if (algorithm === 'argon2id') {
          hashedPassword = await argon2id(options);
        } else if (algorithm === 'argon2i') {
          hashedPassword = await argon2i(options);
        } else if (algorithm === 'argon2d') {
          hashedPassword = await argon2d(options);
        }
        
        setHash(hashedPassword);
      }
      setVerifyResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hashing failed');
      setHash('');
    }
  };

  const verifyHash = async () => {
    setError('');
    setVerifyResult(null);
    setDetectedAlgorithm(null);

    if (!input.trim()) {
      setError('Please enter password to verify');
      return;
    }
    if (!hash.trim()) {
      setError('Please enter hash to verify against');
      return;
    }

    const cleanHash = hash.trim();

    try {
      if (cleanHash.startsWith('$argon2')) {
        const parsed = parseArgon2Hash(cleanHash);
        setDetectedAlgorithm(`Argon2 (${parsed.algorithm})`);

        const options = {
          password: input,
          salt: parsed.salt,
          iterations: parsed.iterations,
          memorySize: parsed.memorySize,
          parallelism: parsed.parallelism,
          hashLength: parsed.hashLength,
          outputType: 'encoded' as const,
        };

        let recomputed = '';
        if (parsed.algorithm === 'argon2id') {
          const { argon2id } = await import('hash-wasm');
          recomputed = await argon2id(options);
        } else if (parsed.algorithm === 'argon2i') {
          const { argon2i } = await import('hash-wasm');
          recomputed = await argon2i(options);
        } else if (parsed.algorithm === 'argon2d') {
          const { argon2d } = await import('hash-wasm');
          recomputed = await argon2d(options);
        }

        setVerifyResult(recomputed === cleanHash);
      } else if (
        cleanHash.startsWith('$2a$') ||
        cleanHash.startsWith('$2b$') ||
        cleanHash.startsWith('$2y$')
      ) {
        setDetectedAlgorithm('Bcrypt');
        const { default: bcrypt } = await import('bcryptjs');
        const isValid = await bcrypt.compare(input, cleanHash);
        setVerifyResult(isValid);
      } else {
        setError('Unknown hash format. Please provide a valid Bcrypt or Argon2 hash string.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid hash format or verification failed');
    }
  };

  const handleHash = async () => {
    await executeHash(generateHash);
  };

  const handleVerify = async () => {
    await executeVerify(verifyHash);
  };

  const handleCopy = async () => {
    await copyToClipboard(hash);
  };

  const handleClear = () => {
    setInput('');
    setHash('');
    setVerifyResult(null);
    setDetectedAlgorithm(null);
    setError('');
  };

  const isLoading = isHashing || isVerifying;

  return (
    <div className="space-y-6">
      {/* Mode Selector */}
      <Tabs value={mode} onValueChange={(val) => handleModeChange(val as Mode)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="hash" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Hash Password
          </TabsTrigger>
          <TabsTrigger value="verify" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Verify Password
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Configuration Settings (only in hash mode) */}
      {mode === 'hash' && (
        <Card className="border border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Configuration Parameters
            </CardTitle>
            <CardDescription>Adjust the strength and performance factors</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Hashing Algorithm</label>
                <Select
                  value={algorithm}
                  onValueChange={(val) => {
                    setAlgorithm(val as Algorithm);
                    setHash('');
                    setError('');
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Algorithm" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="argon2id">Argon2id (Recommended)</SelectItem>
                    <SelectItem value="argon2i">Argon2i</SelectItem>
                    <SelectItem value="argon2d">Argon2d</SelectItem>
                    <SelectItem value="bcrypt">Bcrypt</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {algorithm === 'bcrypt' ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium">Cost Factor (Rounds): {rounds}</label>
                    <span className="text-xs text-muted-foreground">2^{rounds} iterations</span>
                  </div>
                  <div className="pt-2">
                    <Slider
                      value={rounds}
                      onChange={(value) => setRounds(value)}
                      min={4}
                      max={15}
                      step={1}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium">Iterations (Time Cost): {iterations}</label>
                    <span className="text-xs text-muted-foreground">Recommended: 3+</span>
                  </div>
                  <div className="pt-2">
                    <Slider
                      value={iterations}
                      onChange={(value) => setIterations(value)}
                      min={1}
                      max={10}
                      step={1}
                    />
                  </div>
                </div>
              )}
            </div>

            {algorithm !== 'bcrypt' && (
              <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t border-border">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Memory Size</label>
                  <Select
                    value={memorySize.toString()}
                    onValueChange={(val) => setMemorySize(Number(val))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Memory" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="16384">16 MiB (16,384 KiB)</SelectItem>
                      <SelectItem value="32768">32 MiB (32,768 KiB)</SelectItem>
                      <SelectItem value="65536">64 MiB (65,536 KiB) *</SelectItem>
                      <SelectItem value="131072">128 MiB (131,072 KiB)</SelectItem>
                      <SelectItem value="262144">256 MiB (262,144 KiB)</SelectItem>
                      <SelectItem value="524288">512 MiB (524,288 KiB)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Memory hard parameter</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Parallelism (Threads)</label>
                  <Select
                    value={parallelism.toString()}
                    onValueChange={(val) => setParallelism(Number(val))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Threads" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Thread</SelectItem>
                      <SelectItem value="2">2 Threads</SelectItem>
                      <SelectItem value="4">4 Threads *</SelectItem>
                      <SelectItem value="8">8 Threads</SelectItem>
                      <SelectItem value="12">12 Threads</SelectItem>
                      <SelectItem value="16">16 Threads</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Number of parallel lanes</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Hash Output Length</label>
                  <Select
                    value={hashLength.toString()}
                    onValueChange={(val) => setHashLength(Number(val))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Length" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="16">16 Bytes (128-bit)</SelectItem>
                      <SelectItem value="24">24 Bytes (192-bit)</SelectItem>
                      <SelectItem value="32">32 Bytes (256-bit) *</SelectItem>
                      <SelectItem value="48">48 Bytes (384-bit)</SelectItem>
                      <SelectItem value="64">64 Bytes (512-bit)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Size of derived key</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Input */}
      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold">
            {mode === 'hash' ? 'Plaintext Password' : 'Password to Verify'}
          </CardTitle>
          <CardDescription>
            {mode === 'hash'
              ? 'Enter the password to hash locally'
              : 'Enter the password to verify against the hash'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter password..."
            className="font-mono text-sm tracking-wide bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary"
          />
        </CardContent>
      </Card>

      {/* Hash Input (verify mode) */}
      {mode === 'verify' && (
        <Card className="border border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Target Hash String</CardTitle>
            <CardDescription>
              Supports Bcrypt (starts with $2a$, $2b$, $2y$) or Argon2 (starts with $argon2)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              placeholder="Paste Bcrypt or Argon2 hash here..."
              rows={3}
              className="font-mono text-sm leading-relaxed bg-background border border-input focus-visible:ring-1 focus-visible:ring-primary resize-none"
            />
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {mode === 'hash' ? (
          <Button onClick={handleHash} disabled={isLoading || !input} className="shadow-sm">
            {isHashing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Hashing...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-2" />
                Generate Hash
              </>
            )}
          </Button>
        ) : (
          <Button onClick={handleVerify} disabled={isLoading || !input || !hash} className="shadow-sm">
            {isVerifying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Verify Password
              </>
            )}
          </Button>
        )}
        <Button variant="outline" onClick={handleClear} className="shadow-sm">
          Clear
        </Button>
      </div>

      {/* Error Output */}
      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 px-4 py-3 rounded-md text-sm font-medium flex items-center gap-2">
          <XCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Hash Output (hash mode) */}
      {mode === 'hash' && hash && (
        <Card className="border border-border bg-card shadow-sm animate-in fade-in-50 duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-lg font-bold">Hash Output</CardTitle>
              <CardDescription>{hash.length} characters (Modular Crypt Format)</CardDescription>
            </div>
            <TooltipSimple content={isCopied ? 'Copied!' : 'Copy to clipboard'}>
              <Button
                variant={isCopied ? 'default' : 'ghost'}
                size="icon"
                onClick={handleCopy}
                aria-label="Copy hash output"
                className="h-9 w-9 transition-all duration-200"
              >
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </TooltipSimple>
          </CardHeader>
          <CardContent>
            <pre className="w-full min-h-[60px] p-4 rounded-md bg-muted font-mono text-sm overflow-x-auto scrollbar-thin whitespace-pre-wrap break-all border border-input leading-relaxed selection:bg-primary/20">
              {hash}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Verification Result (verify mode) */}
      {mode === 'verify' && verifyResult !== null && (
        <Card
          className={`border shadow-sm transition-all duration-200 animate-in fade-in-50 ${
            verifyResult
              ? 'border-green-500/20 bg-green-500/5 dark:bg-green-950/10'
              : 'border-red-500/20 bg-red-500/5 dark:bg-red-950/10'
          }`}
        >
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div
                className={
                  verifyResult
                    ? 'text-green-600 dark:text-green-500'
                    : 'text-red-600 dark:text-red-500'
                }
              >
                {verifyResult ? (
                  <CheckCircle className="h-6 w-6" />
                ) : (
                  <XCircle className="h-6 w-6" />
                )}
              </div>
              <div className="space-y-1">
                <p className="font-bold text-base">
                  {verifyResult ? 'Password Matches!' : 'Password Does Not Match'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {verifyResult
                    ? 'The password matches the provided hash.'
                    : 'The password does not match the provided hash.'}
                </p>
                {detectedAlgorithm && (
                  <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted border border-border">
                    <Info className="h-3 w-3" />
                    Detected: <span className="font-semibold text-foreground">{detectedAlgorithm}</span>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Information Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border border-blue-500/20 bg-blue-500/5 dark:bg-blue-950/10 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="text-blue-600 dark:text-blue-500">
                <Info className="h-5 w-5" />
              </div>
              <div className="text-sm space-y-2">
                <p className="font-bold text-blue-900 dark:text-blue-400">About Argon2</p>
                <p className="text-muted-foreground leading-relaxed">
                  Argon2 is the winner of the Password Hashing Competition (PHC) and is the current industry-standard recommendation.
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs leading-relaxed">
                  <li><strong className="text-foreground">Argon2id:</strong> Hybrid mode. Safe against both side-channel attacks and GPU cracking.</li>
                  <li><strong className="text-foreground">Argon2i:</strong> Designed to prevent side-channel timing attacks (ideal for keys).</li>
                  <li><strong className="text-foreground">Argon2d:</strong> Maximizes GPU cracking resistance (good for cryptocurrency).</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-orange-500/20 bg-orange-500/5 dark:bg-orange-950/10 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="text-orange-600 dark:text-orange-500">
                <Shield className="h-5 w-5" />
              </div>
              <div className="text-sm space-y-2">
                <p className="font-bold text-orange-900 dark:text-orange-400">About Bcrypt</p>
                <p className="text-muted-foreground leading-relaxed">
                  Bcrypt is a highly robust password hashing function based on the Blowfish cipher. It has been battle-tested since 1999.
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs leading-relaxed">
                  <li>Automatically handles salting internally.</li>
                  <li>Uses an adaptive work factor (cost) to scale over time.</li>
                  <li>Max password length is traditionally 72 bytes.</li>
                  <li>Hashed locally inside your browser via WebAssembly/JS.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
