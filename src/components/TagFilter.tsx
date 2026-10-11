'use client';

import { Star } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { toolCatalog } from '@/lib/catalog';
import { TAGS_IN_ORDER } from '@/lib/tags';
import type { ToolTag } from '@/lib/types';
import { cn } from '@/lib/utils/cn';

interface TagFilterProps {
  selectedTag: ToolTag | null;
  showFavoritesOnly: boolean;
  favoritesCount: number;
  onTagChange: (tag: ToolTag | null) => void;
  onFavoritesToggle: () => void;
}

export function TagFilter({
  selectedTag,
  showFavoritesOnly,
  favoritesCount,
  onTagChange,
  onFavoritesToggle,
}: TagFilterProps) {
  return (
    <div className="flex w-full flex-wrap justify-center gap-2.5 sm:gap-3">
      <Button
        variant="outline"
        onClick={onFavoritesToggle}
        className={cn(
          'h-11 px-4 gap-2 text-sm rounded-xl font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]',
          showFavoritesOnly
            ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 shadow-sm hover:bg-yellow-500/15 dark:hover:bg-yellow-500/25 hover:text-yellow-600 dark:hover:text-yellow-400 hover:border-yellow-500/50 dark:hover:border-yellow-500/50'
            : 'hover:bg-yellow-500/5 dark:hover:bg-yellow-500/10 hover:border-yellow-500/20 hover:text-yellow-600 dark:hover:text-yellow-400'
        )}
      >
        <Star
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-300',
            showFavoritesOnly ? 'fill-yellow-500 text-yellow-500 scale-110' : 'text-yellow-500'
          )}
        />
        <span>Favorites</span>
        <Badge
          variant="secondary"
          className={cn(
            'ml-0.5 rounded-md px-1.5 py-0 text-[10px] font-bold transition-colors duration-300',
            showFavoritesOnly
              ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {favoritesCount}
        </Badge>
      </Button>

      {TAGS_IN_ORDER.map((tag) => {
        const toolCount = toolCatalog.filter({ tag: tag.id }).length;
        const isSelected = selectedTag === tag.id;
        const Icon = tag.icon;
        const styles = tag.chip;

        return (
          <Button
            key={tag.id}
            variant="outline"
            onClick={() => onTagChange(isSelected ? null : tag.id)}
            className={cn(
              'h-11 px-4 gap-2 text-sm rounded-xl font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]',
              isSelected
                ? cn(
                    styles.bgSelected,
                    styles.borderSelected,
                    styles.textSelected,
                    styles.textHover,
                    styles.bgActiveHover,
                    'shadow-sm font-semibold'
                  )
                : cn(
                    styles.bgHover,
                    styles.textHover,
                    styles.borderHover
                  )
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4 shrink-0 transition-transform duration-300',
                isSelected ? 'scale-110' : '',
                isSelected ? styles.textSelected : tag.color
              )}
            />
            <span>{tag.name}</span>
            <Badge
              variant="secondary"
              className={cn(
                'ml-0.5 rounded-md px-1.5 py-0 text-[10px] font-bold transition-colors duration-300',
                isSelected
                  ? cn(styles.bgSelected, styles.textSelected)
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {toolCount}
            </Badge>
          </Button>
        );
      })}
    </div>
  );
}
