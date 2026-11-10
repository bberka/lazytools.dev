'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AlertTriangle, Flame, Bomb } from 'lucide-react';
import Link from 'next/link';

export default function CrashSimulator() {
  const [crashType, setCrashType] = useState<'none' | 'render' | 'mount'>(
    typeof window !== 'undefined' && window.location.search.includes('immediate=true')
      ? 'mount'
      : 'none'
  );

  useEffect(() => {
    document.title = 'Crash Simulator | LazyTools';
  }, []);

  // Throw an error during rendering to trigger React/Next.js error boundaries
  if (crashType === 'render' || crashType === 'mount') {
    throw new Error(
      `Simulated Crash: ${
        crashType === 'mount' ? 'Immediate page mount crash' : 'User-triggered render phase crash'
      }. This error was successfully caught by the custom error boundary (error.tsx).`
    );
  }

  const triggerEventError = () => {
    setCrashType('render');
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center py-6 sm:py-10 px-4">
      <Card className="w-full max-w-lg border-border shadow-lg bg-card">
        <CardHeader className="space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20">
            <Flame className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
              Error Page Simulator
            </CardTitle>
            <CardDescription className="text-sm mt-1">
              Use this tool to test and preview the application&apos;s custom error page
              (`error.tsx`) under different crash scenarios.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="p-4 rounded-xl bg-muted/40 border border-border/50 text-xs space-y-2 leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">How React Error Boundaries Work:</p>
            <p>
              React caught errors must occur during the **render phase** or **lifecycle methods** of
              components. Errors inside event handlers do not trigger boundaries unless they force a
              re-render that crashes.
            </p>
          </div>

          <div className="space-y-3">
            {/* Immediate Crash Option */}
            <Button
              onClick={triggerEventError}
              variant="destructive"
              className="w-full gap-2 h-11 rounded-xl transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
            >
              <Bomb className="h-4 w-4" />
              Simulate Render Crash Now
            </Button>

            {/* Direct Link Immediate Crash Option */}
            <Link href="/crash?immediate=true" className="block w-full">
              <Button
                variant="outline"
                className="w-full gap-2 h-11 rounded-xl transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] border-destructive/20 hover:border-destructive/50 hover:bg-destructive/5 hover:text-destructive"
              >
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Simulate Immediate Mount Crash (Via URL)
              </Button>
            </Link>
          </div>

          <div className="border-t border-border/40 pt-4 flex justify-between items-center text-xs text-muted-foreground">
            <span>Route: `/crash`</span>
            <Link href="/" className="hover:underline text-primary">
              Return to dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
