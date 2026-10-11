'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Star } from 'lucide-react';

import { TagFilter } from './TagFilter';
import { FavoriteButton } from './FavoriteButton';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { toolCatalog } from '@/lib/catalog';
import { useHomeViewState } from '@/lib/home/client';
import {
  countGridColumns,
  isArrowKey,
  moveSelection,
  NO_SELECTION,
} from '@/lib/home/grid-navigation';
import { TAGS } from '@/lib/tags';
import { useFavorites } from '@/lib/contexts/FavoritesContext';
import { useSettings } from '@/lib/contexts/SettingsContext';
import { cn } from '@/lib/utils/cn';
import type { Tool } from '@/lib/types';

export function HomeContent() {
  const router = useRouter();
  const { favorites } = useFavorites();
  const { compactMode } = useSettings();
  const {
    searchQuery,
    selectedTag,
    showFavoritesOnly,
    setSearchQuery,
    clearSearch,
    selectTag,
    toggleFavoritesOnly,
  } = useHomeViewState();
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(NO_SELECTION);
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset selection when search query or filters change
  useEffect(() => {
    setSelectedSearchIndex(NO_SELECTION);
  }, [searchQuery, selectedTag, showFavoritesOnly]);

  const filteredTools = useMemo(
    () =>
      toolCatalog.filter({
        query: searchQuery,
        tag: selectedTag,
        onlyFavorites: showFavoritesOnly ? favorites : null,
      }),
    [favorites, searchQuery, selectedTag, showFavoritesOnly]
  );

  const groupedTools = useMemo(
    () => toolCatalog.groupByTag(filteredTools),
    [filteredTools]
  );

  const favoriteTools = useMemo(
    () => toolCatalog.byIds(favorites, { order: 'catalog' }),
    [favorites]
  );

  // The tag sections with the keyboard index of each one's first card. A tool
  // with several tags is rendered in each of its sections, so cards are
  // numbered by where they are on the page, not by tool.
  const tagSections = useMemo(
    () =>
      groupedTools.map((group, index) => ({
        ...group,
        firstIndex: groupedTools
          .slice(0, index)
          .reduce((count, previous) => count + previous.tools.length, 0),
      })),
    [groupedTools]
  );

  // The cards the arrow keys move through, as the grids they are rendered in:
  // one grid for search results and favorites, one per section under a tag.
  // Keyboard navigation is off while the page shows the whole catalog.
  const keyboardSections = useMemo<Tool[][]>(() => {
    if (searchQuery || showFavoritesOnly) return [filteredTools];
    if (selectedTag) return tagSections.map((section) => section.tools);
    return [];
  }, [filteredTools, searchQuery, selectedTag, showFavoritesOnly, tagSections]);

  // Read from the rendered grid, so it always matches the breakpoints in ToolGrid
  const getGridColumns = () => {
    const grid = contentRef.current?.querySelector('[data-tool-grid]');
    return grid ? countGridColumns(window.getComputedStyle(grid).gridTemplateColumns) : 1;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const keyboardTools = keyboardSections.flat();
    if (keyboardTools.length === 0) return;

    if (isArrowKey(e.key)) {
      e.preventDefault();
      const nextIndex = moveSelection(selectedSearchIndex, e.key, {
        sections: keyboardSections.map((tools) => tools.length),
        columns: getGridColumns(),
      });
      setSelectedSearchIndex(nextIndex);

      if (nextIndex !== NO_SELECTION) {
        contentRef.current
          ?.querySelector(`[data-keyboard-index="${nextIndex}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      } else if (selectedSearchIndex !== NO_SELECTION) {
        // Moved out of the cards, back to the search box
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (e.key === 'Enter') {
      const tool = keyboardTools[selectedSearchIndex];
      if (tool) {
        e.preventDefault();
        router.push(`/tools/${tool.id}`);
      }
    } else if (e.key === 'Escape') {
      setSelectedSearchIndex(NO_SELECTION);
      clearSearch();
    }
  };

  return (
    <div
      ref={contentRef}
      className={cn(compactMode ? 'space-y-4 sm:space-y-5' : 'space-y-6 sm:space-y-8')}
    >
      <div className="flex justify-center">
        <div className="relative w-full max-w-2xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-11 pl-10 text-base sm:h-10 sm:text-sm"
          />
        </div>
      </div>

      <div className="flex justify-center">
        <TagFilter
          selectedTag={selectedTag}
          showFavoritesOnly={showFavoritesOnly}
          favoritesCount={favorites.length}
          onTagChange={selectTag}
          onFavoritesToggle={toggleFavoritesOnly}
        />
      </div>

      {searchQuery && (
        <section>
          <h2
            className={cn(
              'mb-3 font-bold sm:mb-4 text-muted-foreground',
              compactMode ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
            )}
          >
            {showFavoritesOnly ? 'Search Results in Favorites' : 'Search Results'} ({filteredTools.length})
          </h2>
          {filteredTools.length > 0 ? (
            <ToolGrid compactMode={compactMode}>
              {filteredTools.map((tool, index) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  compactMode={compactMode}
                  keyboardIndex={index}
                  isActive={selectedSearchIndex === index}
                />
              ))}
            </ToolGrid>
          ) : (
            <EmptyState
              title="No tools matched your search"
              description="Try a different search query."
            />
          )}
        </section>
      )}

      {favoriteTools.length > 0 &&
        !selectedTag &&
        !showFavoritesOnly &&
        !searchQuery && (
          <section>
            <h2
              className={cn(
                'mb-3 flex items-center gap-2 font-bold sm:mb-4',
                compactMode ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
              )}
            >
              <Star className="h-6 w-6 fill-yellow-500 text-yellow-500" />
              Favorites
            </h2>
            <ToolGrid compactMode={compactMode}>
              {favoriteTools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} compactMode={compactMode} />
              ))}
            </ToolGrid>
          </section>
        )}

      {!showFavoritesOnly && !searchQuery && (
        <div className={cn(compactMode ? 'space-y-4 sm:space-y-5' : 'space-y-6 sm:space-y-8')}>
          {tagSections.map(
            ({ tag: tagId, tools: tagTools, firstIndex }) => {
              const tag = TAGS[tagId];
              const Icon = tag.icon;

              return (
                <section key={tagId}>
                  <h2
                    className={cn(
                      'mb-3 font-bold sm:mb-4 flex items-center gap-2.5',
                      compactMode ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl',
                      tag.color
                    )}
                  >
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
                    <span>{tag.name}</span>
                  </h2>
                  <ToolGrid compactMode={compactMode}>
                    {tagTools.map((tool, index) => (
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        compactMode={compactMode}
                        keyboardIndex={firstIndex + index}
                        isActive={selectedSearchIndex === firstIndex + index}
                      />
                    ))}
                  </ToolGrid>
                </section>
              );
            }
          )}
        </div>
      )}

      {showFavoritesOnly && !searchQuery && (
        <section>
          {filteredTools.length > 0 ? (
            <ToolGrid compactMode={compactMode}>
              {filteredTools.map((tool, index) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  compactMode={compactMode}
                  keyboardIndex={index}
                  isActive={selectedSearchIndex === index}
                />
              ))}
            </ToolGrid>
          ) : (
            <EmptyState
              icon={<Star className="mx-auto mb-4 h-12 w-12 opacity-50" />}
              title="No favorite tools yet"
              description="Click the star on any tool to add it to favorites."
            />
          )}
        </section>
      )}

      {filteredTools.length === 0 && !showFavoritesOnly && !searchQuery && (
        <EmptyState
          title="No tools matched your filters"
          description="Try a different search or tag."
        />
      )}
    </div>
  );
}

function ToolGrid({
  compactMode,
  children,
}: {
  compactMode: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-tool-grid
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1920px]:grid-cols-6',
        compactMode ? 'gap-2' : 'gap-4'
      )}
    >
      <AnimatePresence mode="popLayout">
        {children}
      </AnimatePresence>
    </div>
  );
}

function ToolCard({
  tool,
  compactMode,
  keyboardIndex,
  isActive,
}: {
  tool: Tool;
  compactMode: boolean;
  /** The card's place in arrow-key navigation, where it takes part in it. */
  keyboardIndex?: number;
  isActive?: boolean;
}) {
  const primaryTag = TAGS[tool.tags[0]];
  const IconComponent = primaryTag.icon;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.92, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 10 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="h-full"
      data-tool-id={tool.id}
      data-keyboard-index={keyboardIndex}
    >
      <Link href={`/tools/${tool.id}`} className="group block h-full">
        <Card className={cn(
          "h-full transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:hover:shadow-[0_8px_30px_rgba(139,92,246,0.15)]",
          isActive && "-translate-y-1.5 border-primary shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(139,92,246,0.15)] bg-primary/[0.01] dark:bg-primary/[0.03]",
          compactMode && "flex flex-col justify-center"
        )}>
          <CardHeader
            className={cn(compactMode ? 'p-2 sm:p-4' : 'p-3 sm:p-5')}
          >
            <div className={cn("flex justify-between gap-3", compactMode ? "items-center" : "items-start")}>
              <div className={cn("flex min-w-0 flex-1", compactMode ? "items-center gap-2" : "items-start gap-3")}>
                <div className={cn(
                  "flex shrink-0 items-center justify-center bg-secondary/80 transition-all duration-300 group-hover:scale-110",
                  compactMode ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl",
                  isActive && "scale-110",
                  primaryTag.color
                )}>
                  <IconComponent className={cn(compactMode ? "h-4 w-4" : "h-5 w-5")} />
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                  <CardTitle
                    className={cn(
                      'transition-colors group-hover:text-primary font-bold tracking-tight break-words',
                      isActive && 'text-primary',
                      compactMode ? 'text-sm leading-snug' : 'text-base'
                    )}
                  >
                    {tool.name}
                  </CardTitle>
                </div>
              </div>
              <FavoriteButton toolId={tool.id} variant="card" />
            </div>
            {!compactMode && (
              <CardDescription className="mt-2 text-xs line-clamp-2 leading-relaxed">
                {tool.description}
              </CardDescription>
            )}
          </CardHeader>
        </Card>
      </Link>
    </motion.div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="py-12 text-center text-muted-foreground">
      {icon}
      <p>{title}</p>
      <p className="mt-2 text-sm">{description}</p>
    </div>
  );
}
