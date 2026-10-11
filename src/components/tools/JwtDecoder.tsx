'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Check, Key, Trash2 } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { decodeJwt, isJwtExpired, jwtTimes, type DecodedJwt } from '@/lib/tools/jwt-decoder';

function decode(token: string): { decoded: DecodedJwt | null; error: string } {
  if (!token.trim()) return { decoded: null, error: '' };
  try {
    return { decoded: decodeJwt(token), error: '' };
  } catch (e) {
    return { decoded: null, error: e instanceof Error ? e.message : 'Invalid JWT token' };
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

export function JwtDecoder() {
  const [input, setInput] = useState('');
  // When the token was last edited: the moment its expiry is judged against.
  const [checkedAt, setCheckedAt] = useState(0);
  const copyHeader = useCopyToClipboard();
  const copyPayload = useCopyToClipboard();

  const { decoded, error } = useMemo(() => decode(input), [input]);

  const handleInputChange = (value: string) => {
    setInput(value);
    setCheckedAt(Date.now());
  };

  const handleClear = () => {
    setInput('');
  };

  const { issuedAt, expiresAt, notBefore } = jwtTimes(decoded?.payload ?? {});
  const isExpired = isJwtExpired(expiresAt, checkedAt);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            JWT Token
          </CardTitle>
          <CardDescription>Paste your JWT token here to decode</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
            aria-label="JWT token"
            rows={4}
            className="font-mono text-sm"
          />

          <Button onClick={handleClear} variant="outline" size="sm">
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>

          {error && (
            <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}
        </CardContent>
      </Card>

      {decoded && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Header</CardTitle>
              <CardDescription>Algorithm and token type</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-md font-mono text-sm overflow-x-auto scrollbar-thin">
                <pre>{JSON.stringify(decoded.header, null, 2)}</pre>
              </div>
              <Button
                onClick={() => copyHeader.copyToClipboard(JSON.stringify(decoded.header, null, 2))}
                size="sm"
                variant={copyHeader.isCopied ? "default" : "outline"}
              >
                {copyHeader.isCopied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Header
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payload</CardTitle>
              <CardDescription>Claims and data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-md font-mono text-sm overflow-x-auto scrollbar-thin">
                <pre>{JSON.stringify(decoded.payload, null, 2)}</pre>
              </div>

              {/* Show common timestamp fields in human-readable format */}
              {(issuedAt !== null || expiresAt !== null || notBefore !== null) && (
                <div className="space-y-2 text-sm">
                  <h4 className="font-semibold">Timestamps:</h4>
                  {issuedAt !== null && (
                    <div className="flex flex-wrap gap-x-2">
                      <span className="text-muted-foreground">Issued At (iat):</span>
                      <span>{formatTimestamp(issuedAt)}</span>
                    </div>
                  )}
                  {expiresAt !== null && (
                    <div className="flex flex-wrap gap-x-2">
                      <span className="text-muted-foreground">Expires At (exp):</span>
                      <span>{formatTimestamp(expiresAt)}</span>
                      {isExpired && (
                        <span className="text-destructive font-semibold">(Expired)</span>
                      )}
                    </div>
                  )}
                  {notBefore !== null && (
                    <div className="flex flex-wrap gap-x-2">
                      <span className="text-muted-foreground">Not Before (nbf):</span>
                      <span>{formatTimestamp(notBefore)}</span>
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={() => copyPayload.copyToClipboard(JSON.stringify(decoded.payload, null, 2))}
                size="sm"
                variant={copyPayload.isCopied ? "default" : "outline"}
              >
                {copyPayload.isCopied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Payload
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Signature</CardTitle>
              <CardDescription>
                Verify signature with the secret key (not decoded, base64url encoded)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted p-4 rounded-md font-mono text-sm break-all">
                {decoded.signature}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
