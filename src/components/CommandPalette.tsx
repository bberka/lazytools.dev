'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Search,
  Clock,
  Star,
  ArrowRight,
  RefreshCw,
  Lock,
  Sparkles,
  FileCheck,
  Type,
  Wrench,
  ShieldCheck,
  Globe,
  Palette,
  Calculator,
  FileText,
  Image as ImageIcon,
  type LucideIcon,
} from 'lucide-react';
import { TOOLS, TAGS, searchTools } from '@/lib/utils/tools-config';
import type { Tool, ToolTag } from '@/lib/types';
import { useCommandPalette } from '@/lib/contexts/CommandPaletteContext';
import { useFavorites } from '@/lib/contexts/FavoritesContext';
import { useRecentTools } from '@/lib/contexts/RecentToolsContext';
import { getModifierKey, isModifierKey } from '@/lib/utils/keyboard';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { cn } from '@/lib/utils/cn';
import { TooltipSimple } from './ui/tooltip';

const TAG_ICONS: Record<string, LucideIcon> = {
  RefreshCw,
  Lock,
  Sparkles,
  FileCheck,
  Type,
  Wrench,
  ShieldCheck,
  Globe,
  Palette,
  Calculator,
  FileText,
  Image: ImageIcon,
};

interface TagStyle {
  bg: string;
  text: string;
  border: string;
}

const TAG_STYLES: Record<string, TagStyle> = {
  converters: {
    bg: 'bg-blue-500/10 dark:bg-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/20 dark:border-blue-500/30',
  },
  'encoders-decoders': {
    bg: 'bg-purple-500/10 dark:bg-purple-500/20',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/20 dark:border-purple-500/30',
  },
  generators: {
    bg: 'bg-green-500/10 dark:bg-green-500/20',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-500/20 dark:border-green-500/30',
  },
  'formatters-validators': {
    bg: 'bg-orange-500/10 dark:bg-orange-500/20',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-500/20 dark:border-orange-500/30',
  },
  'text-tools': {
    bg: 'bg-pink-500/10 dark:bg-pink-500/20',
    text: 'text-pink-600 dark:text-pink-400',
    border: 'border-pink-500/20 dark:border-pink-500/30',
  },
  utilities: {
    bg: 'bg-cyan-500/10 dark:bg-cyan-500/20',
    text: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-500/20 dark:border-cyan-500/30',
  },
  security: {
    bg: 'bg-red-500/10 dark:bg-red-500/20',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/20 dark:border-red-500/30',
  },
  networking: {
    bg: 'bg-indigo-500/10 dark:bg-indigo-500/20',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-500/20 dark:border-indigo-500/30',
  },
  design: {
    bg: 'bg-violet-500/10 dark:bg-violet-500/20',
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-violet-500/20 dark:border-violet-500/30',
  },
  calculators: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/20 dark:border-emerald-500/30',
  },
  'pdf-tools': {
    bg: 'bg-red-600/10 dark:bg-red-600/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-600/20 dark:border-red-600/30',
  },
  'image-tools': {
    bg: 'bg-orange-600/10 dark:bg-orange-600/20',
    text: 'text-orange-700 dark:text-orange-400',
    border: 'border-orange-600/20 dark:border-orange-600/30',
  },
};

function TagIconBadge({ tagId }: { tagId: ToolTag }) {
  const tag = TAGS[tagId];
  if (!tag) return null;
  const styles = TAG_STYLES[tagId] || {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    border: 'border-transparent',
  };
  const TagIcon = TAG_ICONS[tag.icon];

  return (
    <TooltipSimple content={tag.name}>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-md border h-6 w-6 p-1 transition-all duration-200 hover:scale-105",
          styles.bg,
          styles.text,
          styles.border
        )}
      >
        {TagIcon ? (
          <TagIcon className="h-3.5 w-3.5" />
        ) : (
          <span className="text-[9px] font-semibold">{tag.name.substring(0, 2)}</span>
        )}
      </span>
    </TooltipSimple>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const { open, setOpen } = useCommandPalette();
  const { favorites, toggleFavorite } = useFavorites();
  const { recentTools, addRecentTool, clearRecentTools } = useRecentTools();

  const [search, setSearch] = useState('');
  const modKey = getModifierKey();
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleToggleFavorite = useCallback((toolId: string) => {
    const wasFavorite = favorites.includes(toolId);
    toggleFavorite(toolId);
    toast.success(wasFavorite ? 'Removed from favorites' : 'Added to favorites');
  }, [favorites, toggleFavorite]);

  // Auto-focus search input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      // Small delay to ensure dialog is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;

    const syncSelectedTool = () => {
      const selectedItem = listRef.current?.querySelector<HTMLElement>(
        '[cmdk-item][data-selected="true"]'
      );

      setSelectedTool(selectedItem?.getAttribute('data-value') ?? null);
    };

    const frame = window.requestAnimationFrame(syncSelectedTool);
    const observer = new MutationObserver(syncSelectedTool);

    observer.observe(listRef.current, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-selected', 'hidden'],
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [open, search, recentTools.length, favorites.length]);

  // Handle keyboard shortcuts within the palette
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Escape to close
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }

      // Ctrl/Cmd+Shift+Delete to clear recents
      if (e.key === 'Delete' && e.shiftKey && isModifierKey(e)) {
        e.preventDefault();
        clearRecentTools();
        toast.success('Recent tools cleared');
        return;
      }

      // Ctrl/Cmd+Shift+F to toggle favorite on selected tool
      if (key === 'f' && e.shiftKey && isModifierKey(e) && selectedTool) {
        e.preventDefault();
        handleToggleFavorite(selectedTool);
        return;
      }

      // Ctrl/Cmd+Enter to open in new tab
      if (e.key === 'Enter' && isModifierKey(e) && selectedTool) {
        e.preventDefault();
        addRecentTool(selectedTool);
        window.open(`/tools/${selectedTool}`, '_blank');
        setOpen(false);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    open,
    selectedTool,
    setOpen,
    clearRecentTools,
    addRecentTool,
    handleToggleFavorite,
  ]);

  // Get tool data for recent tools
  const recentToolsData = useMemo(() => {
    return recentTools
      .map((id) => TOOLS.find((t) => t.id === id))
      .filter((tool): tool is Tool => Boolean(tool));
  }, [recentTools]);

  // Get tool data for favorites
  const favoriteToolsData = useMemo(() => {
    return favorites
      .map((id) => TOOLS.find((t) => t.id === id))
      .filter((tool): tool is Tool => Boolean(tool));
  }, [favorites]);

  // Group remaining tools by tag
  const groupedTools = useMemo(() => {
    const groups: Record<ToolTag, Tool[]> = {
      converters: [],
      'encoders-decoders': [],
      generators: [],
      'formatters-validators': [],
      'text-tools': [],
      utilities: [],
      security: [],
      networking: [],
      design: [],
      calculators: [],
      'pdf-tools': [],
      'image-tools': [],
    };

    // Get all tool IDs that are already in recent or favorites
    const displayedIds = new Set([...recentTools, ...favorites]);

    // Add remaining tools to groups based on all their tags
    TOOLS.forEach((tool) => {
      if (!displayedIds.has(tool.id)) {
        tool.tags.forEach((tag) => {
          if (groups[tag]) {
            groups[tag].push(tool);
          }
        });
      }
    });

    return groups;
  }, [recentTools, favorites]);

  // Get search results sorted by score
  const searchedTools = useMemo(() => {
    if (!search) return [];
    return searchTools(search);
  }, [search]);

  // Handle navigation to tool
  const handleNavigate = (toolId: string, openInNewTab: boolean = false) => {
    // Track in recent tools
    addRecentTool(toolId);

    if (openInNewTab) {
      // Open in new tab
      window.open(`/tools/${toolId}`, '_blank');
    } else {
      // Navigate in current tab using Next.js router
      router.push(`/tools/${toolId}`);
    }

    // Close palette
    setOpen(false);
  };

  const searchHeading = (
    <span className="flex items-center gap-1.5">
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span>Search Results</span>
    </span>
  );

  const recentHeading = (
    <span className="flex items-center gap-1.5">
      <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span>Recent</span>
    </span>
  );

  const favoritesHeading = (
    <span className="flex items-center gap-1.5">
      <Star className="h-3.5 w-3.5 shrink-0 text-yellow-500 fill-yellow-500/20" />
      <span>Favorites</span>
    </span>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);

        if (!nextOpen) {
          setSearch('');
          setSelectedTool(null);
        }
      }}
    >
      <DialogContent
        hideClose
        className="w-[calc(100%-1rem)] max-w-2xl gap-0 overflow-hidden border bg-popover p-0 text-popover-foreground sm:w-[calc(100%-2rem)]"
      >
        <DialogTitle className="sr-only">Command Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search for tools, utilities, and commands.
        </DialogDescription>
        <Command
          className="flex max-h-[min(80vh,36rem)] min-h-0 flex-col overflow-hidden"
          shouldFilter={false}
        >
          {/* Search Input */}
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              ref={inputRef}
              value={search}
              onValueChange={setSearch}
              placeholder="Search tools..."
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Results */}
          <Command.List
            ref={listRef}
            className="max-h-[50vh] min-h-0 overflow-y-auto p-2 scrollbar-thin md:max-h-[400px]"
            style={{
              height: 'var(--cmdk-list-height)',
              scrollPaddingBlockStart: '0.5rem',
              scrollPaddingBlockEnd: '0.5rem',
            }}
          >
              {search && searchedTools.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No tools found matching &quot;{search}&quot;
                </div>
              )}

              {/* Search Results (Custom Ordered) */}
              {search && searchedTools.length > 0 && (
                <Command.Group heading={searchHeading}>
                  {searchedTools.map((tool) => {
                    const firstTag = tool.tags[0];
                    const mainTagInfo = TAGS[firstTag];
                    const Icon = TAG_ICONS[mainTagInfo?.icon];
                    return (
                      <Command.Item
                        key={tool.id}
                        value={tool.id}
                        onSelect={() => handleNavigate(tool.id)}
                        className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                      >
                        {Icon && (
                          <Icon className={cn("mr-2 h-4 w-4 shrink-0", mainTagInfo.color)} />
                        )}
                        <span className="flex-1">{tool.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {tool.tags.map((tagId) => (
                            <TagIconBadge key={tagId} tagId={tagId} />
                          ))}
                        </div>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {/* Recent Tools Group */}
              {recentToolsData.length > 0 && !search && (
                <Command.Group heading={recentHeading}>
                  {recentToolsData.map((tool) => {
                    return (
                      <Command.Item
                        key={tool.id}
                        value={tool.id}
                        onSelect={(value: string) => handleNavigate(value)}
                        className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                      >
                        <Clock className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1">{tool.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {tool.tags.map((tagId) => (
                            <TagIconBadge key={tagId} tagId={tagId} />
                          ))}
                        </div>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {/* Favorites Group */}
              {favoriteToolsData.length > 0 && !search && (
                <Command.Group heading={favoritesHeading}>
                  {favoriteToolsData.map((tool) => {
                    return (
                      <Command.Item
                        key={tool.id}
                        value={tool.id}
                        onSelect={(value: string) => handleNavigate(value)}
                        className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                      >
                        <Star className="mr-2 h-4 w-4 fill-yellow-500 text-yellow-500 shrink-0" />
                        <span className="flex-1">{tool.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {tool.tags.map((tagId) => (
                            <TagIconBadge key={tagId} tagId={tagId} />
                          ))}
                        </div>
                        <ArrowRight className="ml-2 h-4 w-4 text-muted-foreground shrink-0" />
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {/* All Tools Grouped by Tag */}
              {!search && (Object.entries(groupedTools) as Array<[ToolTag, Tool[]]>).map(
                ([tagId, tagTools]) => {
                  if (tagTools.length === 0) return null;

                  const tag = TAGS[tagId];
                  const TagIcon = TAG_ICONS[tag.icon];
                  const heading = (
                    <span className="flex items-center gap-1.5">
                      {TagIcon && (
                        <TagIcon className={cn("h-3.5 w-3.5 shrink-0", tag.color)} />
                      )}
                      <span>{tag.name}</span>
                    </span>
                  );

                  return (
                    <Command.Group key={tagId} heading={heading}>
                      {tagTools.map((tool) => {
                        const Icon = TAG_ICONS[tag.icon];
                        return (
                          <Command.Item
                            key={`${tagId}-${tool.id}`}
                            value={tool.id}
                            onSelect={() => handleNavigate(tool.id)}
                            className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                          >
                            {Icon && (
                              <Icon className={cn("mr-2 h-4 w-4 shrink-0", tag.color)} />
                            )}
                            <span className="flex-1">{tool.name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {tool.tags.map((tId) => (
                                <TagIconBadge key={tId} tagId={tId} />
                              ))}
                            </div>
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                  );
                }
              )}
          </Command.List>

          {/* Footer with shortcuts */}
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex flex-wrap gap-3">
                <span>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                    ↑↓
                  </kbd>{' '}
                  navigate
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                    ↵
                  </kbd>{' '}
                  open
                </span>
                <span className="hidden sm:inline">
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                    {modKey}+↵
                  </kbd>{' '}
                  new tab
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                {recentToolsData.length > 0 && !search && (
                  <TooltipSimple content="Clear recent tools">
                    <button
                      type="button"
                      onClick={() => {
                        clearRecentTools();
                        toast.success('Recent tools cleared');
                      }}
                      className="hover:text-foreground transition-colors"
                      aria-label="Clear recent tools"
                    >
                      <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                        {modKey}+⇧+Del
                      </kbd>{' '}
                      clear
                    </button>
                  </TooltipSimple>
                )}
                <TooltipSimple content="Toggle favorite for focused tool">
                  <button
                    type="button"
                    onClick={() => selectedTool && handleToggleFavorite(selectedTool)}
                    className="hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Toggle favorite for focused tool"
                    disabled={!selectedTool}
                  >
                    <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                      {modKey}+⇧+F
                    </kbd>{' '}
                    favorite
                  </button>
                </TooltipSimple>
                <span>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                    esc
                  </kbd>{' '}
                  close
                </span>
              </div>
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
