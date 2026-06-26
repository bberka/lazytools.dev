'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { TooltipSimple } from '../ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Input } from '../ui/input';
import { Copy, Check, Lock, Unlock, ArrowLeftRight, Trash2, KeyRound, Loader2 } from 'lucide-react';
import { useCopyToClipboard, useActionButton } from '@/hooks';

type Mode = 'encrypt' | 'decrypt';

export function AesEncryption() {
  const [mode, setMode] = useState<Mode>('encrypt');
  const [input, setInput] = useState('');
  const [password, setPassword] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const { executeAction: executeEncrypt, isLoading: isEncrypting } = useActionButton();
  const { executeAction: executeDecrypt, isLoading: isDecrypting } = useActionButton();

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const toArrayBuffer = (view: Uint8Array): ArrayBuffer => {
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    return copy.buffer;
  };

  const deriveKey = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: toArrayBuffer(salt),
        iterations: 100000,
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  };

  const encryptText = async () => {
    setError('');
    if (!input.trim()) {
      setError('Please enter text to encrypt');
      setOutput('');
      return;
    }
    if (!password.trim()) {
      setError('Please enter a password');
      setOutput('');
      return;
    }

    try {
      // Generate random salt and IV
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Derive key from password
      const key = await deriveKey(password, salt);

      // Encrypt the text
      const encoder = new TextEncoder();
      const data = encoder.encode(input);
      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(iv),
        },
        key,
        data
      );

      // Combine salt, IV, and encrypted data
      const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encrypted), salt.length + iv.length);

      // Convert to base64
      const result = arrayBufferToBase64(combined.buffer);
      setOutput(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Encryption failed');
      setOutput('');
    }
  };

  const decryptText = async () => {
    setError('');
    if (!input.trim()) {
      setError('Please enter text to decrypt');
      setOutput('');
      return;
    }
    if (!password.trim()) {
      setError('Please enter a password');
      setOutput('');
      return;
    }

    try {
      // Decode base64
      const combined = new Uint8Array(base64ToArrayBuffer(input));

      // Extract salt, IV, and encrypted data
      const salt = combined.slice(0, 16);
      const iv = combined.slice(16, 28);
      const encrypted = combined.slice(28);

      // Derive key from password
      const key = await deriveKey(password, salt);

      // Decrypt the data
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(iv),
        },
        key,
        toArrayBuffer(encrypted)
      );

      // Convert to text
      const decoder = new TextDecoder();
      const result = decoder.decode(decrypted);
      setOutput(result);
    } catch (err) {
      setError(
        'Decryption failed. Please check your password and encrypted text.'
      );
      setOutput('');
    }
  };

  const handleEncrypt = async () => {
    await executeEncrypt(encryptText);
  };

  const handleDecrypt = async () => {
    await executeDecrypt(decryptText);
  };

  const handleProcess = async () => {
    if (mode === 'encrypt') {
      await handleEncrypt();
    } else {
      await handleDecrypt();
    }
  };

  const handleSwapMode = () => {
    setMode(mode === 'encrypt' ? 'decrypt' : 'encrypt');
    setInput(output);
    setOutput('');
    setError('');
  };

  const handleCopy = async () => {
    await copyToClipboard(output);
  };

  const handleClear = () => {
    setInput('');
    setPassword('');
    setOutput('');
    setError('');
  };

  const handleGeneratePassword = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const randomPassword = Array.from(array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 32);
    setPassword(randomPassword);
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
            setOutput('');
            setError('');
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
              type="password"
              value={password}
              onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
              placeholder="Enter password..."
              className="flex-1"
            />
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
            onChange={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            placeholder={
              mode === 'encrypt'
                ? 'Enter text here...'
                : 'Paste encrypted text here...'
            }
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
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
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
