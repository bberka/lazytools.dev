'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CommandPaletteButton } from './CommandPaletteButton';
import { SettingsDialog } from './SettingsDialog';
import { Button } from './ui/button';
import { InstallDialog } from './InstallDialog';
import { Download } from 'lucide-react';
import { useSettings } from '@/lib/contexts/SettingsContext';
import { cn } from '@/lib/utils';

export function Header() {
  const { fullWidth } = useSettings();
  const [isInstallOpen, setIsInstallOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI__;
  const showInstall = isMounted && !isTauri;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/60 backdrop-blur-md transition-all duration-300">
      <div
        className={cn(
          fullWidth ? 'w-full max-w-none px-4 sm:px-6 lg:px-8' : 'container',
          'flex h-14 items-center justify-between gap-3 sm:h-16'
        )}
      >
        <Link
          href="/"
          onClick={() => {
            try {
              sessionStorage.removeItem('home-search-query');
              sessionStorage.removeItem('home-selected-category');
              sessionStorage.removeItem('home-favorites-only');
              sessionStorage.removeItem('home-scroll-y');
              window.dispatchEvent(new CustomEvent('reset-home-state'));
            } catch (e) {}
          }}
          className="min-w-0 flex items-center gap-2 group"
        >
          <span className="text-xl font-extrabold tracking-tight sm:text-2xl bg-gradient-to-r from-primary via-purple-600 to-indigo-500 bg-clip-text text-transparent transition-all duration-300 group-hover:scale-105 transform origin-left">
            LazyTools
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {showInstall && (
            <>
              <Button
                variant="outline"
                className="gap-2 bg-background/30 hover:bg-background/80 border-border/40 hover:border-primary/40 hover:text-primary transition-all duration-300 shadow-sm"
                onClick={() => setIsInstallOpen(true)}
                aria-label="Install or Download application"
              >
                <Download className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Install</span>
              </Button>
              <InstallDialog isOpen={isInstallOpen} onClose={() => setIsInstallOpen(false)} />
            </>
          )}
          <CommandPaletteButton />
          <SettingsDialog />
        </div>
      </div>
    </header>
  );
}
