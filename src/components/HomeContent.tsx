'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
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
  Star,
  type LucideIcon,
} from 'lucide-react';

import { TagFilter } from './TagFilter';
import { FavoriteButton } from './FavoriteButton';
import { SearchBar } from './SearchBar';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { TAGS, filterTools, TOOLS } from '@/lib/utils/tools-config';
import { useFavorites } from '@/lib/contexts/FavoritesContext';
import { useSettings } from '@/lib/contexts/SettingsContext';
import { cn } from '@/lib/utils/cn';
import type { Tool, ToolTag } from '@/lib/types';

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

export function HomeContent() {
  const router = useRouter();
  const { favorites } = useFavorites();
  const { compactMode } = useSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<ToolTag | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(-1);

  // Reset selection when search query or filters change
  useEffect(() => {
    setSelectedSearchIndex(-1);
  }, [searchQuery, selectedTag, showFavoritesOnly]);

  const getGridColumns = () => {
    if (typeof window === 'undefined') return 1;
    const width = window.innerWidth;
    if (width >= 1920) return 6;
    if (width >= 1536) return 5;
    if (width >= 1280) return 4;
    if (width >= 1024) return 3;
    if (width >= 640) return 2;
    return 1;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredTools.length === 0) return;

    // Only navigate via keyboard when search or filter is active
    const isFlatList = !!(searchQuery || showFavoritesOnly || selectedTag);
    if (!isFlatList) return;

    const cols = getGridColumns();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSearchIndex((prev) => {
        if (prev === -1) {
          const nextIndex = 0;
          const activeElement = document.querySelector(`[data-tool-id="${filteredTools[nextIndex].id}"]`);
          activeElement?.scrollIntoView({ block: 'nearest' });
          return nextIndex;
        }
        const nextIndex = Math.min(prev + cols, filteredTools.length - 1);
        const activeElement = document.querySelector(`[data-tool-id="${filteredTools[nextIndex].id}"]`);
        activeElement?.scrollIntoView({ block: 'nearest' });
        return nextIndex;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSearchIndex((prev) => {
        if (prev === -1) return -1;
        const nextIndex = prev - cols;
        if (nextIndex < 0) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return -1;
        }
        const activeElement = document.querySelector(`[data-tool-id="${filteredTools[nextIndex].id}"]`);
        activeElement?.scrollIntoView({ block: 'nearest' });
        return nextIndex;
      });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSelectedSearchIndex((prev) => {
        if (prev === -1) return -1;
        const nextIndex = Math.min(prev + 1, filteredTools.length - 1);
        const activeElement = document.querySelector(`[data-tool-id="${filteredTools[nextIndex].id}"]`);
        activeElement?.scrollIntoView({ block: 'nearest' });
        return nextIndex;
      });
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSelectedSearchIndex((prev) => {
        if (prev === -1) return -1;
        const nextIndex = prev - 1;
        if (nextIndex < 0) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return -1;
        }
        const activeElement = document.querySelector(`[data-tool-id="${filteredTools[nextIndex].id}"]`);
        activeElement?.scrollIntoView({ block: 'nearest' });
        return nextIndex;
      });
    } else if (e.key === 'Enter') {
      if (selectedSearchIndex >= 0 && selectedSearchIndex < filteredTools.length) {
        e.preventDefault();
        const tool = filteredTools[selectedSearchIndex];
        router.push(`/tools/${tool.id}`);
      }
    } else if (e.key === 'Escape') {
      setSelectedSearchIndex(-1);
      setSearchQuery('');
    }
  };

  const filteredTools = useMemo(
    () =>
      filterTools(searchQuery, selectedTag, showFavoritesOnly, favorites),
    [favorites, searchQuery, selectedTag, showFavoritesOnly]
  );

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

    filteredTools.forEach((tool) => {
      tool.tags.forEach((tag) => {
        if (groups[tag]) {
          groups[tag].push(tool);
        }
      });
    });

    return groups;
  }, [filteredTools]);

  const favoriteTools = useMemo(
    () => TOOLS.filter((tool) => favorites.includes(tool.id)),
    [favorites]
  );

  const isInitializedRef = useRef(false);
  const hasRestoredScrollRef = useRef(false);
  const savedScrollPositionRef = useRef<number | null>(null);

  // Load state from sessionStorage on mount
  useEffect(() => {
    try {
      const savedSearch = sessionStorage.getItem('home-search-query');
      const savedTag = sessionStorage.getItem('home-selected-tag');
      const savedFavoritesOnly = sessionStorage.getItem('home-favorites-only');
      const savedScroll = sessionStorage.getItem('home-scroll-y');

      if (savedSearch !== null) setSearchQuery(savedSearch);
      if (savedTag !== null) {
        setSelectedTag(savedTag ? (savedTag as ToolTag) : null);
      }
      if (savedFavoritesOnly !== null) {
        setShowFavoritesOnly(savedFavoritesOnly === 'true');
      }

      if (savedScroll !== null) {
        const scrollY = parseInt(savedScroll, 10);
        if (scrollY > 0) {
          savedScrollPositionRef.current = scrollY;
        }
      }
    } catch (e) {
      console.error('Failed to restore home page state:', e);
    } finally {
      isInitializedRef.current = true;
    }
  }, []);

  // Save states to sessionStorage when they change
  useEffect(() => {
    if (!isInitializedRef.current) return;
    try {
      sessionStorage.setItem('home-search-query', searchQuery);
      sessionStorage.setItem('home-selected-tag', selectedTag || '');
      sessionStorage.setItem('home-favorites-only', showFavoritesOnly.toString());
    } catch (e) {}
  }, [searchQuery, selectedTag, showFavoritesOnly]);

  // Restore scroll position when list is rendered and page height matches
  useEffect(() => {
    if (!isInitializedRef.current || hasRestoredScrollRef.current) return;
    if (savedScrollPositionRef.current === null) {
      hasRestoredScrollRef.current = true;
      return;
    }

    const scrollY = savedScrollPositionRef.current;

    const tryScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll >= scrollY) {
        window.scrollTo({
          top: scrollY,
          behavior: 'instant' as ScrollBehavior,
        });
        hasRestoredScrollRef.current = true;
        return true;
      }
      return false;
    };

    // Try immediately
    if (tryScroll()) return;

    // If page is not tall enough yet, poll on animation frames for up to 2 seconds (120 frames)
    let frameId: number;
    let frames = 0;
    const loop = () => {
      frames++;
      if (tryScroll() || frames > 120) {
        hasRestoredScrollRef.current = true;
        return;
      }
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(frameId);
  }, [filteredTools]);

  // Track window scroll position (only after scroll has been restored)
  useEffect(() => {
    const handleScroll = () => {
      if (!isInitializedRef.current || !hasRestoredScrollRef.current) return;
      try {
        sessionStorage.setItem('home-scroll-y', window.scrollY.toString());
      } catch (e) {}
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Listen to reset events (e.g. clicking the main logo)
  useEffect(() => {
    const handleReset = () => {
      setSearchQuery('');
      setSelectedTag(null);
      setShowFavoritesOnly(false);
      try {
        sessionStorage.setItem('home-scroll-y', '0');
      } catch (e) {}
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.addEventListener('reset-home-state', handleReset);
    return () => {
      window.removeEventListener('reset-home-state', handleReset);
    };
  }, []);

  const handleFavoritesToggle = () => {
    const nextShowFavorites = !showFavoritesOnly;
    setShowFavoritesOnly(nextShowFavorites);
    if (nextShowFavorites) {
      setSelectedTag(null);
    }
    try {
      sessionStorage.setItem('home-scroll-y', '0');
    } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleTagChange = (tag: ToolTag | null) => {
    setSelectedTag(tag);
    if (tag) {
      setShowFavoritesOnly(false);
    }
    try {
      sessionStorage.setItem('home-scroll-y', '0');
    } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    try {
      sessionStorage.setItem('home-scroll-y', '0');
    } catch (e) {}
  };

  return (
    <div className={cn(compactMode ? 'space-y-4 sm:space-y-5' : 'space-y-6 sm:space-y-8')}>
      <div className="flex justify-center">
        <SearchBar value={searchQuery} onSearch={handleSearchChange} onKeyDown={handleKeyDown} />
      </div>

      <div className="flex justify-center">
        <TagFilter
          selectedTag={selectedTag}
          showFavoritesOnly={showFavoritesOnly}
          favoritesCount={favorites.length}
          onTagChange={handleTagChange}
          onFavoritesToggle={handleFavoritesToggle}
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
          {(Object.entries(groupedTools) as Array<[ToolTag, Tool[]]>).map(
            ([tagId, tagTools]) => {
              if (tagTools.length === 0) return null;

              const tag = TAGS[tagId];
              const Icon = TAG_ICONS[tag.icon];

              return (
                <section key={tagId}>
                  <h2
                    className={cn(
                      'mb-3 font-bold sm:mb-4 flex items-center gap-2.5',
                      compactMode ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl',
                      tag.color
                    )}
                  >
                    {Icon && <Icon className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />}
                    <span>{tag.name}</span>
                  </h2>
                  <ToolGrid compactMode={compactMode}>
                    {tagTools.map((tool) => {
                      const globalIndex = filteredTools.findIndex((t) => t.id === tool.id);
                      return (
                        <ToolCard
                          key={tool.id}
                          tool={tool}
                          compactMode={compactMode}
                          isActive={selectedSearchIndex === globalIndex}
                        />
                      );
                    })}
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
  isActive,
}: {
  tool: Tool;
  compactMode: boolean;
  isActive?: boolean;
}) {
  const toolTags = tool.tags.map((tagId) => TAGS[tagId]).filter(Boolean);
  const primaryTag = toolTags[0];
  const IconComponent = primaryTag ? TAG_ICONS[primaryTag.icon] : null;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.92, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 10 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="h-full"
      data-tool-id={tool.id}
    >
      <Link href={`/tools/${tool.id}`} className="group block h-full">
        <Card className={cn(
          "h-full transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:hover:shadow-[0_8px_30px_rgba(139,92,246,0.15)]",
          isActive && "-translate-y-1.5 border-primary shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(139,92,246,0.15)] bg-primary/[0.01] dark:bg-primary/[0.03]",
          compactMode && "flex flex-col justify-center"
        )}>
          <CardHeader
            className={cn(compactMode ? 'p-3' : 'p-4 sm:p-5')}
          >
            <div className={cn("flex justify-between gap-3", compactMode ? "items-center" : "items-start")}>
              <div className={cn("flex min-w-0 flex-1", compactMode ? "items-center gap-2" : "items-start gap-3")}>
                {IconComponent && (
                  <div className={cn(
                    "flex shrink-0 items-center justify-center bg-secondary/80 transition-all duration-300 group-hover:scale-110",
                    compactMode ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl",
                    isActive && "scale-110",
                    primaryTag.color
                  )}>
                    <IconComponent className={cn(compactMode ? "h-4 w-4" : "h-5 w-5")} />
                  </div>
                )}
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
