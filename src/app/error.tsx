'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AlertCircle, RefreshCw, Home, Terminal, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorProps) {
  const [showStack, setShowStack] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Captured application crash:', error);
    document.title = 'Application Error | LazyTools';
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
      toast.success('Error details copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy error details');
    }
  };

  const handleReportIssue = () => {
    copyToClipboard();
    // Redirect to GitHub issues page if URL is configured, otherwise just let the copy toast handle it
    const title = encodeURIComponent(`Crash Report: ${error.message.substring(0, 50)}`);
    const body = encodeURIComponent(
      `### Describe the bug\nA crash occurred in the application.\n\n### Error Details\n` +
      `* **Message**: ${error.message}\n` +
      `* **Digest**: ${error.digest || 'N/A'}\n` +
      `* **URL**: ${typeof window !== 'undefined' ? window.location.href : 'unknown'}\n\n` +
      `*(Stack trace has been copied to your clipboard, please paste it here)*`
    );
    window.open(`https://github.com/bberka/lazytools.dev/issues/new?title=${title}&body=${body}`, '_blank');
  };

  return (
    <div className="relative flex min-h-[60vh] flex-col items-center justify-center py-6 sm:py-10">
      {/* Subtle glow background */}
      <div className="absolute inset-0 -z-10 flex items-center justify-center opacity-20">
        <div className="h-[250px] w-[250px] rounded-full bg-destructive/20 blur-[80px]" />
      </div>

      <Card className="w-full max-w-2xl border-destructive/20 shadow-xl overflow-hidden bg-card/60 backdrop-blur-md">
        <div className="h-1.5 w-full bg-gradient-to-r from-destructive/60 via-destructive to-destructive/60 animate-pulse" />

        <CardHeader className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive border border-destructive/20">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">Something Went Wrong</CardTitle>
            <CardDescription className="text-sm mt-1">
              An unexpected error occurred while rendering this page or tool.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Error Message Box */}
          <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/10 text-destructive/90 text-sm font-medium">
            <span className="font-bold">Error:</span> {error.message || 'An unknown runtime error crashed the component.'}
          </div>

          {/* Core Navigation Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={reset}
              variant="default"
              className="flex-1 gap-2 h-11 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
            <Button
              onClick={handleReportIssue}
              variant="outline"
              className="flex-1 gap-2 h-11 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] border-input hover:border-destructive/30 hover:text-destructive hover:bg-destructive/5"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              Report & Copy Log
            </Button>
            <Link href="/" className="flex-1">
              <Button
                variant="ghost"
                className="w-full gap-2 h-11 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Home className="h-4 w-4" />
                Go Home
              </Button>
            </Link>
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
  );
}
