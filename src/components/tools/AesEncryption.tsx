'use client';

import { useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { TooltipSimple } from '../ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Input } from '../ui/input';
import { Copy, Check, Lock, Unlock, ArrowLeftRight, Trash2, KeyRound, Loader2, Eye, EyeOff } from 'lucide-react';
import { useCopyToClipboard, useActionButton } from '@/hooks';
import { decryptText, encryptText, generatePassword } from '@/lib/tools/aes-encryption';

type Mode = 'encrypt' | 'decrypt';

export function AesEncryption() {
  const [mode, setMode] = useState<Mode>('encrypt');
  const [input, setInput] = useState('');
  const [password, setPassword] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const { executeAction: executeEncrypt, isLoading: isEncrypting } = useActionButton();
  const { executeAction: executeDecrypt, isLoading: isDecrypting } = useActionButton();

  // Key derivation takes a moment. Every run takes a new number, and anything
  // that makes its result outdated (edited input or password, another mode,
  // Clear) moves the number on, so a finished run only shows its result while
  // it is still the latest.
  const latestRun = useRef(0);

  // The output and the error belong to the input and password they came from.
  const discardResult = () => {
    latestRun.current += 1;
    setOutput('');
    setError('');
  };

  const runCipher = async (cipher: (text: string, password: string) => Promise<string>, emptyInput: string) => {
    const run = ++latestRun.current;
    setError('');
    if (!input.trim()) {
      setError(emptyInput);
      setOutput('');
      return;
    }
    if (!password.trim()) {
      setError('Please enter a password');
      setOutput('');
      return;
    }

    try {
      const result = await cipher(input, password);
      if (run === latestRun.current) setOutput(result);
    } catch (err) {
      if (run !== latestRun.current) return;
      setError(err instanceof Error ? err.message : 'Encryption failed');
      setOutput('');
    }
  };

  const encrypt = () => runCipher(encryptText, 'Please enter text to encrypt');

  const decrypt = () => runCipher(decryptText, 'Please enter text to decrypt');

  const handleEncrypt = async () => {
    await executeEncrypt(encrypt);
  };

  const handleDecrypt = async () => {
    await executeDecrypt(decrypt);
  };

  const handleProcess = async () => {
    if (mode === 'encrypt') {
      await handleEncrypt();
    } else {
      await handleDecrypt();
    }
  };

  const handleSwapMode = () => {
    latestRun.current += 1;
    setMode(mode === 'encrypt' ? 'decrypt' : 'encrypt');
    setInput(output);
    setOutput('');
    setError('');
  };

  const handleCopy = async () => {
    await copyToClipboard(output);
  };

  const handleClear = () => {
    latestRun.current += 1;
    setInput('');
    setPassword('');
    setShowPassword(false);
    setOutput('');
    setError('');
  };

  const handleGeneratePassword = () => {
    setPassword(generatePassword());
    // A generated password nobody has seen cannot be written down, and text
    // encrypted with it could never be decrypted again. Show it.
    setShowPassword(true);
    discardResult();
  };

  const isLoading = isEncrypting || isDecrypting;

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <Tabs
          value={mode}
          onValueChange={(val) => {
            setMode(val as Mode);
            discardResult();
          }}
          className="flex-1 w-full"
        >
          <TabsList className="grid w-full grid-cols-2 h-auto">
            <TabsTrigger value="encrypt" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Encrypt
            </TabsTrigger>
            <TabsTrigger value="decrypt" className="flex items-center gap-2">
              <Unlock className="h-4 w-4" />
              Decrypt
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {output && (
          <TooltipSimple content="Swap input/output">
            <Button variant="ghost" size="icon" onClick={handleSwapMode} aria-label="Swap input/output">
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
          </TooltipSimple>
        )}
      </div>

      {/* Password Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Password
          </CardTitle>
          <CardDescription>
            Enter a strong password for {mode === 'encrypt' ? 'encryption' : 'decryption'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword((e.target as HTMLInputElement).value);
                discardResult();
              }}
              placeholder="Enter password..."
              aria-label="Password"
              className={showPassword ? 'flex-1 font-mono' : 'flex-1'}
            />
            <TooltipSimple content={showPassword ? 'Hide password' : 'Show password'}>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowPassword((shown) => !shown)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </TooltipSimple>
            <TooltipSimple content="Generate random password">
              <Button
                variant="outline"
                size="icon"
                onClick={handleGeneratePassword}
                aria-label="Generate random password"
              >
                <KeyRound className="h-4 w-4" />
              </Button>
            </TooltipSimple>
          </div>
          <p className="text-xs text-muted-foreground">
            Uses AES-256-GCM encryption with PBKDF2 key derivation (100,000 iterations)
          </p>
        </CardContent>
      </Card>

      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle>Input</CardTitle>
          <CardDescription>
            {mode === 'encrypt'
              ? 'Enter plain text to encrypt'
              : 'Enter encrypted text to decrypt (Base64)'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={input}
            onChange={(e) => {
              setInput((e.target as HTMLTextAreaElement).value);
              discardResult();
            }}
            placeholder={
              mode === 'encrypt'
                ? 'Enter text here...'
                : 'Paste encrypted text here...'
            }
            aria-label={mode === 'encrypt' ? 'Text to encrypt' : 'Encrypted text to decrypt'}
            rows={6}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleProcess} disabled={isLoading || !input || !password}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {mode === 'encrypt' ? 'Encrypting...' : 'Decrypting...'}
            </>
          ) : (
            <>
              {mode === 'encrypt' ? (
                <Lock className="h-4 w-4 mr-2" />
              ) : (
                <Unlock className="h-4 w-4 mr-2" />
              )}
              {mode === 'encrypt' ? 'Encrypt' : 'Decrypt'}
            </>
          )}
        </Button>
        <Button variant="outline" onClick={handleClear}>
          <Trash2 className="h-4 w-4 mr-2" />
          Clear
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Output */}
      {output && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Output</CardTitle>
              <CardDescription>
                {mode === 'encrypt'
                  ? `Encrypted text (${output.length} characters)`
                  : `Decrypted text (${output.length} characters)`}
              </CardDescription>
            </div>
            <TooltipSimple content={isCopied ? 'Copied!' : 'Copy to clipboard'}>
              <Button
                variant={isCopied ? 'default' : 'ghost'}
                size="icon"
                onClick={handleCopy}
                aria-label={isCopied ? 'Copied!' : 'Copy to clipboard'}
              >
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </TooltipSimple>
          </CardHeader>
          <CardContent>
            <pre className="w-full min-h-[100px] p-3 rounded-md bg-muted font-mono text-sm overflow-x-auto scrollbar-thin whitespace-pre-wrap break-all border border-input">
              {output}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Security Notice */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="text-blue-600 dark:text-blue-500">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-sm space-y-1">
              <p className="font-medium">Security Information</p>
              <p className="text-muted-foreground">
                All encryption happens in your browser. Your password and data never leave your device.
                Store your password securely - it cannot be recovered if lost.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
