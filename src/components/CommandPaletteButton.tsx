'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from './ui/button';
import { useCommandPalette } from '@/lib/contexts/CommandPaletteContext';
import { getModifierKey } from '@/lib/utils/keyboard';

export function CommandPaletteButton() {
  const { toggle } = useCommandPalette();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(handle);
  }, []);

  const modifierKey = mounted ? getModifierKey() : 'Ctrl';

  return (
    <Button
      variant="outline"
      className="gap-2 bg-background/30 hover:bg-background/80 border-border/40 hover:border-primary/40 hover:text-primary transition-all duration-300 shadow-sm"
      onClick={toggle}
      aria-label="Search command palette"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">Search</span>
      <kbd
        aria-hidden="true"
        className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border/40 bg-muted/50 px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex"
      >
        <span className="text-xs">{modifierKey}</span>K
      </kbd>
    </Button>
  );
}
