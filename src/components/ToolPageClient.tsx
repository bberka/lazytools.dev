'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from '@/components/FavoriteButton';
import { useRecentTools } from '@/lib/contexts/RecentToolsContext';
import type { Tool } from '@/lib/types';
import { useSettings } from '@/lib/contexts/SettingsContext';
import { cn } from '@/lib/utils';

export function ToolPageClient({
  children,
  tool,
}: {
  children: ReactNode;
  tool: Tool;
}) {
  const { addRecentTool } = useRecentTools();
  const lastTrackedToolIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastTrackedToolIdRef.current === tool.id) {
      return;
    }

    lastTrackedToolIdRef.current = tool.id;
    addRecentTool(tool.id);
  }, [addRecentTool, tool.id]);

  const { fullWidth } = useSettings();

  return (
    <div
      className={cn(
        'tool-page mx-auto space-y-4 sm:space-y-6',
        fullWidth ? 'max-w-none' : 'max-w-6xl'
      )}
    >
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between sm:pb-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <Link href="/" scroll={false} className="shrink-0">
            <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-10 sm:w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="break-words text-xl font-bold sm:text-3xl">
              {tool.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              {tool.description}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 justify-end pb-1 sm:pb-0">
          <FavoriteButton toolId={tool.id} variant="icon" />
        </div>
      </div>

      {children}
    </div>
  );
}
