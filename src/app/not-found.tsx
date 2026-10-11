'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useCommandPalette } from '@/lib/contexts/CommandPaletteContext';
import { homeViewState } from '@/lib/home/client';
import { TAGS_IN_ORDER } from '@/lib/tags';
import type { ToolTag } from '@/lib/types';
import { cn } from '@/lib/utils/cn';
import {
  Home,
  ArrowLeft,
  Search,
  HelpCircle,
  Compass,
} from 'lucide-react';

export default function NotFound() {
  const router = useRouter();
  const { toggle } = useCommandPalette();

  useEffect(() => {
    document.title = 'Page Not Found | LazyTools';
  }, []);

  const handleTagClick = (tagId: ToolTag) => {
    homeViewState.showTag(tagId);
    router.push('/');
  };

  return (
    <div className="relative flex min-h-[75vh] flex-col items-center justify-center px-4 py-12 md:py-16 overflow-hidden">
      {/* Decorative background glows */}
      <div className="absolute inset-0 -z-10 flex items-center justify-center opacity-30 dark:opacity-20">
        <div className="h-[300px] w-[300px] rounded-full bg-primary/20 blur-[80px]" />
        <div className="h-[250px] w-[250px] rounded-full bg-blue-500/10 blur-[60px] translate-x-12 -translate-y-12" />
      </div>

      <div className="w-full max-w-3xl text-center space-y-8">
        {/* Animated 404 Illustration */}
        <div className="relative inline-flex items-center justify-center">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary to-blue-500 opacity-20 blur-xl animate-pulse" />
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-border bg-card shadow-xl">
            <HelpCircle className="h-14 w-14 text-muted-foreground" />
          </div>
        </div>

        {/* Text Heading */}
        <div className="space-y-3">
          <h1 className="text-6xl font-black tracking-tight sm:text-7xl bg-gradient-to-r from-foreground via-muted-foreground to-foreground bg-clip-text text-transparent">
            404
          </h1>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Lost in Code?</h2>
          <p className="mx-auto max-w-lg text-muted-foreground text-sm sm:text-base">
            The tool or page you are looking for does not exist, has been renamed, or moved. Let&apos;s get you back on track.
          </p>
        </div>

        {/* Main Navigation Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md mx-auto">
          <Link href="/" className="w-full sm:w-auto">
            <Button variant="default" className="w-full h-11 px-6 gap-2 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]">
              <Home className="h-4 w-4" />
              Go Home
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={toggle}
            className="w-full sm:w-auto h-11 px-6 gap-2 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] border-primary/20 hover:border-primary/50 bg-primary/5 hover:bg-primary/10"
          >
            <Search className="h-4 w-4" />
            Search Tools
          </Button>
          <Button
            variant="ghost"
            onClick={() => window.history.back()}
            className="w-full sm:w-auto h-11 px-6 gap-2 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
        </div>

        {/* Tag Shortcuts Section */}
        <div className="pt-6 border-t border-border/40 space-y-5">
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            <Compass className="h-4 w-4 text-primary" />
            <span>Browse Tool Tags</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {TAGS_IN_ORDER.map((tag) => {
              const Icon = tag.icon;
              const styles = tag.tile;

              return (
                <button
                  key={tag.id}
                  onClick={() => handleTagClick(tag.id)}
                  className={cn(
                    'group flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all duration-300 hover:scale-[1.03] active:scale-[0.97]',
                    styles.border,
                    styles.bg,
                    styles.hover,
                    styles.glow
                  )}
                >
                  <div className={cn('p-2.5 rounded-xl bg-background border border-border/50 mb-2 transition-transform duration-300 group-hover:scale-110 shadow-sm', styles.text)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold tracking-tight leading-tight group-hover:text-foreground">
                    {tag.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
