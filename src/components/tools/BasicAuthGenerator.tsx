'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { CircleAlert, Eye, EyeOff, KeyRound, ShieldAlert, Trash2, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  buildSnippets,
  decodeBasicAuth,
  DEFAULT_SNIPPET_URL,
  encodeBasicAuth,
} from '@/lib/tools/basic-auth-generator';
import { CopyValueButton } from './CopyValueButton';

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function ShowHideButton({ shown, onToggle, what }: { shown: boolean; onToggle: () => void; what: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onToggle}
      aria-label={shown ? `Hide ${what}` : `Show ${what}`}
      aria-pressed={shown}
    >
      {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </Button>
  );
}

export function BasicAuthGenerator() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [url, setUrl] = useState(DEFAULT_SNIPPET_URL);

  const [headerInput, setHeaderInput] = useState('');
  const [showDecoded, setShowDecoded] = useState(false);

  const hasCredentials = username !== '' || password !== '';
  const encoded = useMemo(() => (hasCredentials ? encodeBasicAuth(username, password) : null), [hasCredentials, username, password]);
  const snippets = useMemo(() => (encoded?.ok ? buildSnippets(username, password, url) : []), [encoded, username, password, url]);
  const decoded = useMemo(() => (headerInput.trim() === '' ? null : decodeBasicAuth(headerInput)), [headerInput]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm sm:p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p>
          <strong>Basic auth is not encryption.</strong> The header is only Base64, which anyone can reverse, so send
          it over HTTPS and never share it. Everything here runs in your browser; nothing is uploaded.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Build a header
          </CardTitle>
          <CardDescription>Credentials are UTF-8 encoded, then Base64 encoded (RFC 7617).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="basic-auth-username" className="text-sm font-medium">
                Username
              </label>
              <Input
                id="basic-auth-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="user"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="basic-auth-password" className="text-sm font-medium">
                Password
              </label>
              <div className="flex gap-2">
                <Input
                  id="basic-auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="password"
                />
                <ShowHideButton shown={showPassword} onToggle={() => setShowPassword((value) => !value)} what="password" />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setUsername('');
                setPassword('');
              }}
              disabled={!hasCredentials}
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>

          {encoded && !encoded.ok && <ErrorNote>{encoded.error}</ErrorNote>}

          {!encoded && (
            <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground sm:py-6">
              Enter a username and password to build the header.
            </p>
          )}

          {encoded?.ok && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Authorization header</span>
                  <div className="flex flex-wrap gap-2">
                    <CopyValueButton text={encoded.header} label="Copy header" showLabel />
                    <CopyValueButton text={encoded.headerValue} label="Copy value only" showLabel />
                  </div>
                </div>
                <code
                  data-testid="basic-auth-header"
                  className="block break-all rounded-md bg-muted p-3 font-mono text-sm"
                >
                  {encoded.header}
                </code>
              </div>

              <div className="space-y-2">
                <label htmlFor="basic-auth-url" className="text-sm font-medium">
                  URL used in the snippets
                </label>
                <Input
                  id="basic-auth-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="font-mono"
                />
              </div>

              <div className="space-y-3">
                {snippets.map((snippet) => (
                  <div key={snippet.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {snippet.label}
                      </span>
                      <CopyValueButton text={snippet.code} label={`Copy ${snippet.label} snippet`} />
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs sm:text-sm">
                      {snippet.code}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Unlock className="h-5 w-5 text-primary" />
            Decode a header
          </CardTitle>
          <CardDescription>
            Paste an Authorization header, a &quot;Basic ...&quot; value or just the Base64 token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={headerInput}
            onChange={(event) => setHeaderInput(event.target.value)}
            placeholder="Authorization: Basic dXNlcjpwYXNz"
            aria-label="Authorization header to decode"
            rows={3}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="none"
            className="break-all font-mono text-sm"
          />
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setHeaderInput('')} disabled={headerInput === ''}>
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>

          {decoded && !decoded.ok && <ErrorNote>{decoded.error}</ErrorNote>}

          {decoded?.ok && (
            <dl className="divide-y rounded-lg border" data-testid="basic-auth-decoded">
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <dt className="text-xs font-medium text-muted-foreground">Username</dt>
                  <dd className="break-all font-mono text-sm">{decoded.username || <em className="text-muted-foreground">empty</em>}</dd>
                </div>
                <CopyValueButton text={decoded.username} label="Copy username" />
              </div>
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <dt className="text-xs font-medium text-muted-foreground">Password</dt>
                  <dd className="break-all font-mono text-sm">
                    {decoded.password === '' ? (
                      <em className="text-muted-foreground">empty</em>
                    ) : showDecoded ? (
                      decoded.password
                    ) : (
                      '•'.repeat(Math.min(decoded.password.length, 24))
                    )}
                  </dd>
                </div>
                <ShowHideButton shown={showDecoded} onToggle={() => setShowDecoded((value) => !value)} what="decoded password" />
                <CopyValueButton text={decoded.password} label="Copy password" />
              </div>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
