'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home, Terminal, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import '@/styles/globals.css';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const [showStack, setShowStack] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error('Captured critical root layout crash:', error);
  }, [error]);

  const copyToClipboard = async () => {
    try {
      const errorDetails = {
        message: error.message,
        name: error.name,
        digest: error.digest,
        stack: error.stack,
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        timestamp: new Date().toISOString(),
      };

      await navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }
  };

  const handleReportIssue = () => {
    copyToClipboard();
    const title = encodeURIComponent(`Critical Root Crash: ${error.message.substring(0, 50)}`);
    const body = encodeURIComponent(
      `### Describe the bug\nA critical root-level crash occurred.\n\n### Error Details\n` +
      `* **Message**: ${error.message}\n` +
      `* **Digest**: ${error.digest || 'N/A'}\n` +
      `* **URL**: ${typeof window !== 'undefined' ? window.location.href : 'unknown'}\n\n` +
      `*(Stack trace has been copied to your clipboard, please paste it here)*`
    );
    window.open(`https://github.com/bberka/lazytools.dev/issues/new?title=${title}&body=${body}`, '_blank');
  };

  return (
    <html lang="en">
      <head>
        <title>Critical Application Error | LazyTools</title>
      </head>
      <body className="bg-background text-foreground font-sans antialiased min-h-screen">
        <Script
          id="theme-preloader-error"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('dev-toolbox:theme') ||
                    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        <div className="relative flex min-h-screen flex-col items-center justify-center p-4 overflow-hidden">
          {/* Glowing background meshes */}
          <div className="absolute inset-0 -z-10 flex items-center justify-center opacity-30 dark:opacity-20">
            <div className="h-[350px] w-[350px] rounded-full bg-red-500/20 blur-[90px]" />
            <div className="h-[250px] w-[250px] rounded-full bg-yellow-500/10 blur-[70px] translate-x-16" />
          </div>

          <div className="w-full max-w-2xl px-4 py-8">
            <Card className="border-destructive/30 shadow-2xl bg-card/75 backdrop-blur-lg overflow-hidden">
              <div className="h-1.5 w-full bg-gradient-to-r from-red-500 via-destructive to-red-500 animate-pulse" />

              <CardHeader className="space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive border border-destructive/20 shadow-inner">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold tracking-tight">Critical System Failure</CardTitle>
                  <CardDescription className="text-sm mt-1">
                    The core application framework failed to initialize correctly.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Error Box */}
                <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/10 text-destructive/90 text-sm font-mono overflow-x-auto scrollbar-thin whitespace-pre-wrap">
                  <span className="font-bold">Error:</span> {error.message || 'System crash details unavailable.'}
                </div>

                {/* Core Navigation Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={reset}
                    variant="default"
                    className="flex-1 gap-2 h-11 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Restart Application
                  </Button>
                  <Button
                    onClick={handleReportIssue}
                    variant="outline"
                    className="flex-1 gap-2 h-11 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] border-input hover:border-destructive/30 hover:text-destructive hover:bg-destructive/5"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    Report Issue
                  </Button>
                  <Button
                    onClick={() => {
                      if (typeof window !== 'undefined') window.location.href = '/';
                    }}
                    variant="ghost"
                    className="flex-1 gap-2 h-11 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Home className="h-4 w-4" />
                    Go Home
                  </Button>
                </div>

                {/* Stack Trace Toggle */}
                {error.stack && (
                  <div className="border-t border-border/40 pt-4">
                    <button
                      onClick={() => setShowStack(!showStack)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      aria-expanded={showStack}
                    >
                      {showStack ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      <Terminal className="h-3.5 w-3.5" />
                      <span>{showStack ? 'Hide technical details' : 'Show technical details'}</span>
                    </button>

                    {showStack && (
                      <div className="relative mt-3 rounded-xl border bg-muted/50 p-4 font-mono text-[11px] leading-relaxed text-muted-foreground shadow-inner">
                        <button
                          onClick={copyToClipboard}
                          className="absolute right-3 top-3 p-1.5 rounded-lg border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200"
                          aria-label="Copy Stack Trace"
                          title="Copy Stack Trace"
                        >
                          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <div className="overflow-x-auto max-h-60 scrollbar-thin pr-10 whitespace-pre">
                          <div className="text-foreground font-semibold mb-1">{error.name}: {error.message}</div>
                          {error.stack}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </body>
    </html>
  );
}
