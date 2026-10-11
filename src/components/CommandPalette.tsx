'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Search,
  Clock,
  Star,
  ArrowRight,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { toolCatalog } from '@/lib/catalog';
import {
  APP_COMMANDS,
  PALETTE_SHORTCUTS,
  detectPlatform,
  filterCommands,
  findCommandByShortcut,
  isTypingTarget,
  matchesShortcut,
  shortcutLabel,
  type AppCommand,
} from '@/lib/commands';
import { useAppCommands } from '@/lib/commands/client';
import { TAGS } from '@/lib/tags';
import type { Tool, ToolTag } from '@/lib/types';
import { useCommandPalette } from '@/lib/contexts/CommandPaletteContext';
import { useFavorites } from '@/lib/contexts/FavoritesContext';
import { useRecentTools } from '@/lib/contexts/RecentToolsContext';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { cn } from '@/lib/utils/cn';
import { TooltipSimple } from './ui/tooltip';

// One row of the list: a tool to open or a command to run
interface PaletteRow {
  key: string;
  /** What cmdk selects and highlights the row by. */
  value: string;
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  /** Shown at the end of the row. */
  detail: React.ReactNode;
  onSelect: () => void;
}

interface PaletteSection {
  key: string;
  heading: React.ReactNode;
  rows: PaletteRow[];
}

function TagIconBadge({ tagId }: { tagId: ToolTag }) {
  const tag = TAGS[tagId];
  const styles = tag.badge;
  const TagIcon = tag.icon;

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
        <TagIcon className="h-3.5 w-3.5" />
      </span>
    </TooltipSimple>
  );
}

function SectionHeading({
  icon: Icon,
  iconClassName,
  children,
}: {
  icon: LucideIcon;
  iconClassName: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon className={cn('h-3.5 w-3.5 shrink-0', iconClassName)} />
      <span>{children}</span>
    </span>
  );
}

function PaletteItem({ row }: { row: PaletteRow }) {
  const Icon = row.icon;

  return (
    <Command.Item
      value={row.value}
      onSelect={row.onSelect}
      className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
    >
      <Icon className={cn('mr-2 h-4 w-4 shrink-0', row.iconClassName)} />
      <span className="flex-1">{row.label}</span>
      {row.detail}
    </Command.Item>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const { open, setOpen, toggle } = useCommandPalette();
  const { favorites, toggleFavorite } = useFavorites();
  const { recentTools, addRecentTool } = useRecentTools();
  const commands = useAppCommands();

  const [search, setSearch] = useState('');
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const platform = detectPlatform();

  // Auto-focus search input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      // Small delay to ensure dialog is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  // cmdk runs uncontrolled here, and uncontrolled it reports its selection to
  // no callback, so the value of the highlighted row is read from cmdk's DOM.
  //
  // Known gap: on opening, this runs before the dialog's portal has mounted
  // the list, finds no list and returns. Tracking starts once the search text
  // or the number of recents or favorites changes.
  useEffect(() => {
    if (!open || !listRef.current) return;

    const syncSelectedValue = () => {
      const selectedItem = listRef.current?.querySelector<HTMLElement>(
        '[cmdk-item][data-selected="true"]'
      );

      setSelectedValue(selectedItem?.getAttribute('data-value') ?? null);
    };

    const frame = window.requestAnimationFrame(syncSelectedValue);
    const observer = new MutationObserver(syncSelectedValue);

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

  // Get tool data for recent tools
  const recentToolsData = useMemo(
    () => toolCatalog.byIds(recentTools),
    [recentTools]
  );

  // Get tool data for favorites
  const favoriteToolsData = useMemo(
    () => toolCatalog.byIds(favorites),
    [favorites]
  );

  // Group remaining tools by tag
  const groupedTools = useMemo(() => {
    // Get all tool IDs that are already in recent or favorites
    const displayedIds = new Set([...recentTools, ...favorites]);

    return toolCatalog.groupByTag(
      toolCatalog.discoverable().filter((tool) => !displayedIds.has(tool.id))
    );
  }, [recentTools, favorites]);

  // Get search results sorted by score
  const searchedTools = useMemo(() => {
    if (!search) return [];
    return toolCatalog.search(search);
  }, [search]);

  // Every command without a search, the matching ones with one
  const listedCommands = useMemo(
    () => filterCommands(search, commands.state),
    [search, commands.state]
  );

  const openTool = (toolId: string, inNewTab = false) => {
    // Track in recent tools
    addRecentTool(toolId);

    if (inNewTab) {
      window.open(`/tools/${toolId}`, '_blank');
    } else {
      // Navigate in current tab using Next.js router
      router.push(`/tools/${toolId}`);
    }

    // Close palette
    setOpen(false);
  };

  const handleToggleFavorite = (toolId: string) => {
    const wasFavorite = favorites.includes(toolId);
    toggleFavorite(toolId);
    toast.success(wasFavorite ? 'Removed from favorites' : 'Added to favorites');
  };

  const selectCommand = (command: AppCommand) => {
    const nothingToDo = command.nothingToDo?.(commands.state);
    if (nothingToDo) {
      toast.info(nothingToDo);
      return;
    }

    toast.success(commands.run(command));
    setOpen(false);
  };

  const toolRow = (
    tool: Tool,
    look: { key?: string; icon: LucideIcon; iconClassName: string; arrow?: boolean }
  ): PaletteRow => ({
    key: look.key ?? tool.id,
    value: tool.id,
    icon: look.icon,
    iconClassName: look.iconClassName,
    label: tool.name,
    detail: (
      <>
        <div className="flex items-center gap-1 shrink-0">
          {tool.tags.map((tagId) => (
            <TagIconBadge key={tagId} tagId={tagId} />
          ))}
        </div>
        {look.arrow && (
          <ArrowRight className="ml-2 h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </>
    ),
    onSelect: () => openTool(tool.id),
  });

  const commandRow = (command: AppCommand): PaletteRow => ({
    key: command.id,
    // A tool id is a slug and has no colon, so this is never one
    value: `command:${command.id}`,
    icon: command.icon(commands.state),
    iconClassName: 'text-muted-foreground',
    label: command.label(commands.state),
    detail: (
      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
        {command.status(commands.state)}
      </span>
    ),
    onSelect: () => selectCommand(command),
  });

  const commandsSection: PaletteSection = {
    key: search ? 'search-commands' : 'commands',
    heading: (
      <SectionHeading icon={Settings} iconClassName="text-muted-foreground">
        Settings & Commands
      </SectionHeading>
    ),
    rows: listedCommands.map(commandRow),
  };

  // With a search: the matching tools, best match first, then the matching
  // commands. Without one: recents, favorites, every other tool under its
  // tags, then all commands. A section with no rows is left out.
  const sections: PaletteSection[] = (
    search
      ? [
          {
            key: 'search-tools',
            heading: (
              <SectionHeading icon={Search} iconClassName="text-muted-foreground">
                Search Results
              </SectionHeading>
            ),
            rows: searchedTools.map((tool) => {
              const mainTag = TAGS[tool.tags[0]];
              return toolRow(tool, { icon: mainTag.icon, iconClassName: mainTag.color });
            }),
          },
          commandsSection,
        ]
      : [
          {
            key: 'recent',
            heading: (
              <SectionHeading icon={Clock} iconClassName="text-muted-foreground">
                Recent
              </SectionHeading>
            ),
            rows: recentToolsData.map((tool) =>
              toolRow(tool, { icon: Clock, iconClassName: 'text-muted-foreground' })
            ),
          },
          {
            key: 'favorites',
            heading: (
              <SectionHeading icon={Star} iconClassName="text-yellow-500 fill-yellow-500/20">
                Favorites
              </SectionHeading>
            ),
            rows: favoriteToolsData.map((tool) =>
              toolRow(tool, {
                icon: Star,
                iconClassName: 'fill-yellow-500 text-yellow-500',
                arrow: true,
              })
            ),
          },
          ...groupedTools.map(({ tag: tagId, tools: tagTools }) => {
            const tag = TAGS[tagId];
            return {
              key: `tag-${tagId}`,
              heading: (
                <SectionHeading icon={tag.icon} iconClassName={tag.color}>
                  {tag.name}
                </SectionHeading>
              ),
              rows: tagTools.map((tool) =>
                toolRow(tool, {
                  key: `${tagId}-${tool.id}`,
                  icon: tag.icon,
                  iconClassName: tag.color,
                })
              ),
            };
          }),
          commandsSection,
        ]
  ).filter((section) => section.rows.length > 0);

  // The tool on the highlighted row. A tool row's value is the tool's id and a
  // command row's value is no tool's id, so this is null for a command.
  const selectedTool = (selectedValue && toolCatalog.get(selectedValue)?.tool) || null;

  // The app's one global keydown listener. It handles the shortcut that opens
  // the palette, the shortcuts of the app commands and, while the palette is
  // open, the keys that act on the highlighted row.
  const handleKeyDown = (event: KeyboardEvent) => {
    if (matchesShortcut(event, PALETTE_SHORTCUTS.toggle, platform)) {
      event.preventDefault();
      toggle();
      return;
    }

    const command = findCommandByShortcut(event, {
      platform,
      paletteOpen: open,
      typing: isTypingTarget(document.activeElement),
    });
    if (command) {
      event.preventDefault();
      const message = commands.run(command);
      // An app-wide shortcut repeats while its keys are held, flipping the
      // setting each time. The id makes each toast replace the one before it.
      toast.success(message, command.shortcut?.scope === 'app' ? { id: command.id } : undefined);
      return;
    }

    if (!open) return;

    // Escape to close
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }

    // Only a tool can be a favorite or open in a tab, so these leave the key
    // alone while a command is highlighted
    if (!selectedTool) return;

    if (matchesShortcut(event, PALETTE_SHORTCUTS.toggleFavorite, platform)) {
      event.preventDefault();
      handleToggleFavorite(selectedTool.id);
      return;
    }

    // Known gap: cmdk handles Enter first, whatever modifier is held. It opens
    // the tool in this tab, which closes the palette before this is reached.
    if (matchesShortcut(event, PALETTE_SHORTCUTS.openInNewTab, platform)) {
      event.preventDefault();
      openTool(selectedTool.id, true);
    }
  };

  // The listener is added once and always calls the handler of the latest
  // render, so it sees the current selection without being added again.
  const handleKeyDownRef = useRef(handleKeyDown);
  useEffect(() => {
    handleKeyDownRef.current = handleKeyDown;
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKeyDownRef.current(event);

    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);

        if (!nextOpen) {
          setSearch('');
          setSelectedValue(null);
        }
      }}
    >
      <DialogContent
        hideClose
        className="w-[calc(100%-1rem)] max-w-2xl gap-0 overflow-hidden rounded-xl sm:rounded-xl border bg-popover p-0 text-popover-foreground sm:w-[calc(100%-2rem)]"
      >
        <DialogTitle className="sr-only">Command Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search for tools, utilities, and commands.
        </DialogDescription>
        <Command
          className="flex max-h-[min(80vh,36rem)] min-h-[330px] flex-col overflow-hidden md:min-h-[400px]"
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
            className="flex-1 overflow-y-auto p-2 scrollbar-thin"
            style={{
              scrollPaddingBlockStart: '0.5rem',
              scrollPaddingBlockEnd: '0.5rem',
            }}
          >
            {search && sections.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No tools or commands found matching &quot;{search}&quot;
              </div>
            )}

            {sections.map((section) => (
              <Command.Group key={section.key} heading={section.heading}>
                {section.rows.map((row) => (
                  <PaletteItem key={row.key} row={row} />
                ))}
              </Command.Group>
            ))}
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
                    {shortcutLabel(PALETTE_SHORTCUTS.openInNewTab, platform)}
                  </kbd>{' '}
                  new tab
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                {recentToolsData.length > 0 && !search && (
                  <TooltipSimple content="Clear recent tools">
                    <button
                      type="button"
                      onClick={() => toast.success(commands.run(APP_COMMANDS.clearRecentTools))}
                      className="hover:text-foreground transition-colors"
                      aria-label="Clear recent tools"
                    >
                      <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                        {shortcutLabel(APP_COMMANDS.clearRecentTools.shortcut, platform)}
                      </kbd>{' '}
                      clear
                    </button>
                  </TooltipSimple>
                )}
                <TooltipSimple content="Toggle favorite for focused tool">
                  <button
                    type="button"
                    onClick={() => selectedTool && handleToggleFavorite(selectedTool.id)}
                    className="hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Toggle favorite for focused tool"
                    disabled={!selectedTool}
                  >
                    <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                      {shortcutLabel(PALETTE_SHORTCUTS.toggleFavorite, platform)}
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
