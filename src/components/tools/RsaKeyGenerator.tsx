'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { TooltipSimple } from '../ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Copy, Check, KeyRound, Download, Loader2 } from 'lucide-react';
import { useCopyToClipboard, useActionButton } from '@/hooks';
import { downloadText } from '@/lib/files';
import {
  generateRsaKeyPair,
  rsaKeyFileName,
  type RsaKeyFormat,
  type RsaKeyPair,
  type RsaKeySize,
} from '@/lib/tools/rsa-key-generator';

type KeySize = RsaKeySize;
type KeyFormat = RsaKeyFormat;

export function RsaKeyGenerator() {
  const [keySize, setKeySize] = useState<KeySize>(2048);
  const [keyFormat, setKeyFormat] = useState<KeyFormat>('PEM');
  const [keyPair, setKeyPair] = useState<RsaKeyPair | null>(null);
  const [error, setError] = useState('');

  // One copy state per key, so copying one key never ends the other's feedback early.
  const copyPublic = useCopyToClipboard();
  const copyPrivate = useCopyToClipboard();
  const { executeAction, isLoading } = useActionButton();

  const generateKeyPair = async () => {
    setError('');

    try {
      setKeyPair(await generateRsaKeyPair(keySize, keyFormat));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate key pair');
      setKeyPair(null);
    }
  };

  const handleGenerate = async () => {
    await executeAction(generateKeyPair);
  };

  const handleCopyPublic = async () => {
    if (keyPair?.publicKey) {
      await copyPublic.copyToClipboard(keyPair.publicKey);
    }
  };

  const handleCopyPrivate = async () => {
    if (keyPair?.privateKey) {
      await copyPrivate.copyToClipboard(keyPair.privateKey);
    }
  };

  // The file is named after the format the keys on screen were generated in,
  // which need not be the format selected right now.
  const handleDownloadPublic = () => {
    if (keyPair?.publicKey) {
      downloadText(keyPair.publicKey, rsaKeyFileName('public', keyPair.format));
    }
  };

  const handleDownloadPrivate = () => {
    if (keyPair?.privateKey) {
      downloadText(keyPair.privateKey, rsaKeyFileName('private', keyPair.format));
    }
  };

  return (
    <div className="space-y-6">
      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Key Generation Settings
          </CardTitle>
          <CardDescription>Configure your RSA key pair parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Key Size (bits)</label>
              <Select
                value={keySize.toString()}
                onValueChange={(value) => {
                  const numValue = parseInt(value, 10);
                  if (!isNaN(numValue)) {
                    setKeySize(numValue as KeySize);
                  }
                }}
              >
                <SelectTrigger aria-label="Key Size">
                  <SelectValue placeholder="Key size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="2048">2048 bits (Fast)</SelectItem>
                    <SelectItem value="3072">3072 bits (Recommended)</SelectItem>
                    <SelectItem value="4096">4096 bits (Maximum Security)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Key Format</label>
              <Select
                value={keyFormat}
                onValueChange={(value) => {
                  if (value === 'PEM' || value === 'PKCS8' || value === 'JWK') {
                    setKeyFormat(value as KeyFormat);
                  }
                }}
              >
                <SelectTrigger aria-label="Key Format">
                  <SelectValue placeholder="Key format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="PEM">PEM (Standard)</SelectItem>
                    <SelectItem value="PKCS8">PKCS#8 (Base64)</SelectItem>
                    <SelectItem value="JWK">JWK (JSON)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            className="w-full sm:w-auto"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4 mr-2" />
                Generate Key Pair
              </>
            )}
          </Button>

          {error && (
            <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Public Key */}
      {keyPair && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>Public Key</CardTitle>
                <CardDescription className="mt-1">
                  Share this key for encryption
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <TooltipSimple content="Copy public key">
                  <Button
                    variant={copyPublic.isCopied ? 'default' : 'ghost'}
                    size="icon"
                    onClick={handleCopyPublic}
                    aria-label="Copy public key"
                  >
                    {copyPublic.isCopied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipSimple>
                <TooltipSimple content="Download public key">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDownloadPublic}
                    aria-label="Download public key"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipSimple>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="w-full min-h-[150px] p-3 rounded-md bg-muted font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all border border-input">
                {keyPair.publicKey}
              </pre>
            </CardContent>
          </Card>

          {/* Private Key */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-destructive">Private Key</CardTitle>
                <CardDescription className="mt-1">
                  Keep this secret! Never share it.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <TooltipSimple content="Copy private key">
                  <Button
                    variant={copyPrivate.isCopied ? 'default' : 'ghost'}
                    size="icon"
                    onClick={handleCopyPrivate}
                    aria-label="Copy private key"
                  >
                    {copyPrivate.isCopied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipSimple>
                <TooltipSimple content="Download private key">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDownloadPrivate}
                    aria-label="Download private key"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipSimple>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="w-full min-h-[150px] p-3 rounded-md bg-destructive/5 font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all border border-destructive/20">
                {keyPair.privateKey}
              </pre>
            </CardContent>
          </Card>

          {/* Security Notice */}
          <Card className="border-yellow-500/20 bg-yellow-500/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="text-yellow-600 dark:text-yellow-500">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="text-sm space-y-1">
                  <p className="font-medium">Security Notice</p>
                  <p className="text-muted-foreground">
                    This key pair is generated entirely in your browser. Never share your private key.
                    Store it securely and consider using a password manager or encrypted storage.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
