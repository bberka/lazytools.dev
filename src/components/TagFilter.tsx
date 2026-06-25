'use client';

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
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { TAGS, getToolsByTag } from '@/lib/utils/tools-config';
import type { ToolTag } from '@/lib/types';
import { cn } from '@/lib/utils/cn';

interface TagFilterProps {
  selectedTag: ToolTag | null;
  showFavoritesOnly: boolean;
  favoritesCount: number;
  onTagChange: (tag: ToolTag | null) => void;
  onFavoritesToggle: () => void;
}

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

interface StyleSet {
  borderSelected: string;
  bgSelected: string;
  bgHover: string;
  textSelected: string;
  textHover: string;
  borderHover: string;
  bgActiveHover: string;
}

const TAG_STYLES: Record<string, StyleSet> = {
  converters: {
    borderSelected: 'border-blue-500/50 dark:border-blue-400/50',
    bgSelected: 'bg-blue-500/10 dark:bg-blue-500/20',
    bgHover: 'hover:bg-blue-500/5 dark:hover:bg-blue-500/10',
    textSelected: 'text-blue-600 dark:text-blue-400',
    textHover: 'hover:text-blue-600 dark:hover:text-blue-400',
    borderHover: 'hover:border-blue-500/30 dark:hover:border-blue-400/30',
    bgActiveHover: 'hover:bg-blue-500/15 dark:hover:bg-blue-500/25',
  },
  'encoders-decoders': {
    borderSelected: 'border-purple-500/50 dark:border-purple-400/50',
    bgSelected: 'bg-purple-500/10 dark:bg-purple-500/20',
    bgHover: 'hover:bg-purple-500/5 dark:hover:bg-purple-500/10',
    textSelected: 'text-purple-600 dark:text-purple-400',
    textHover: 'hover:text-purple-600 dark:hover:text-purple-400',
    borderHover: 'hover:border-purple-500/30 dark:hover:border-purple-400/30',
    bgActiveHover: 'hover:bg-purple-500/15 dark:hover:bg-purple-500/25',
  },
  generators: {
    borderSelected: 'border-green-500/50 dark:border-green-400/50',
    bgSelected: 'bg-green-500/10 dark:bg-green-500/20',
    bgHover: 'hover:bg-green-500/5 dark:hover:bg-green-500/10',
    textSelected: 'text-green-600 dark:text-green-400',
    textHover: 'hover:text-green-600 dark:hover:text-green-400',
    borderHover: 'hover:border-green-500/30 dark:hover:border-green-400/30',
    bgActiveHover: 'hover:bg-green-500/15 dark:hover:bg-green-500/25',
  },
  'formatters-validators': {
    borderSelected: 'border-orange-500/50 dark:border-orange-400/50',
    bgSelected: 'bg-orange-500/10 dark:bg-orange-500/20',
    bgHover: 'hover:bg-orange-500/5 dark:hover:bg-orange-500/10',
    textSelected: 'text-orange-600 dark:text-orange-400',
    textHover: 'hover:text-orange-600 dark:hover:text-orange-400',
    borderHover: 'hover:border-orange-500/30 dark:hover:border-orange-400/30',
    bgActiveHover: 'hover:bg-orange-500/15 dark:hover:bg-orange-500/25',
  },
  'text-tools': {
    borderSelected: 'border-pink-500/50 dark:border-pink-400/50',
    bgSelected: 'bg-pink-500/10 dark:bg-pink-500/20',
    bgHover: 'hover:bg-pink-500/5 dark:hover:bg-pink-500/10',
    textSelected: 'text-pink-600 dark:text-pink-400',
    textHover: 'hover:text-pink-600 dark:hover:text-pink-400',
    borderHover: 'hover:border-pink-500/30 dark:hover:border-pink-400/30',
    bgActiveHover: 'hover:bg-pink-500/15 dark:hover:bg-pink-500/25',
  },
  utilities: {
    borderSelected: 'border-cyan-500/50 dark:border-cyan-400/50',
    bgSelected: 'bg-cyan-500/10 dark:bg-cyan-500/20',
    bgHover: 'hover:bg-cyan-500/5 dark:hover:bg-cyan-500/10',
    textSelected: 'text-cyan-600 dark:text-cyan-400',
    textHover: 'hover:text-cyan-600 dark:hover:text-cyan-400',
    borderHover: 'hover:border-cyan-500/30 dark:hover:border-cyan-400/30',
    bgActiveHover: 'hover:bg-cyan-500/15 dark:hover:bg-cyan-500/25',
  },
  security: {
    borderSelected: 'border-red-500/50 dark:border-red-400/50',
    bgSelected: 'bg-red-500/10 dark:bg-red-500/20',
    bgHover: 'hover:bg-red-500/5 dark:hover:bg-red-500/10',
    textSelected: 'text-red-600 dark:text-red-400',
    textHover: 'hover:text-red-600 dark:hover:text-red-400',
    borderHover: 'hover:border-red-500/30 dark:hover:border-red-400/30',
    bgActiveHover: 'hover:bg-red-500/15 dark:hover:bg-red-500/25',
  },
  networking: {
    borderSelected: 'border-indigo-500/50 dark:border-indigo-400/50',
    bgSelected: 'bg-indigo-500/10 dark:bg-indigo-500/20',
    bgHover: 'hover:bg-indigo-500/5 dark:hover:bg-indigo-500/10',
    textSelected: 'text-indigo-600 dark:text-indigo-400',
    textHover: 'hover:text-indigo-600 dark:hover:text-indigo-400',
    borderHover: 'hover:border-indigo-500/30 dark:hover:border-indigo-400/30',
    bgActiveHover: 'hover:bg-indigo-500/15 dark:hover:bg-indigo-500/25',
  },
  design: {
    borderSelected: 'border-violet-500/50 dark:border-violet-400/50',
    bgSelected: 'bg-violet-500/10 dark:bg-violet-500/20',
    bgHover: 'hover:bg-violet-500/5 dark:hover:bg-violet-500/10',
    textSelected: 'text-violet-600 dark:text-violet-400',
    textHover: 'hover:text-violet-600 dark:hover:text-violet-400',
    borderHover: 'hover:border-violet-500/30 dark:hover:border-violet-400/30',
    bgActiveHover: 'hover:bg-violet-500/15 dark:hover:bg-violet-500/25',
  },
  calculators: {
    borderSelected: 'border-emerald-500/50 dark:border-emerald-400/50',
    bgSelected: 'bg-emerald-500/10 dark:bg-emerald-500/20',
    bgHover: 'hover:bg-emerald-500/5 dark:hover:bg-emerald-500/10',
    textSelected: 'text-emerald-600 dark:text-emerald-400',
    textHover: 'hover:text-emerald-600 dark:hover:text-emerald-400',
    borderHover: 'hover:border-emerald-500/30 dark:hover:border-emerald-400/30',
    bgActiveHover: 'hover:bg-emerald-500/15 dark:hover:bg-emerald-500/25',
  },
  'pdf-tools': {
    borderSelected: 'border-red-600/50 dark:border-red-500/50',
    bgSelected: 'bg-red-600/10 dark:bg-red-600/20',
    bgHover: 'hover:bg-red-600/5 dark:hover:bg-red-600/10',
    textSelected: 'text-red-700 dark:text-red-400',
    textHover: 'hover:text-red-700 dark:hover:text-red-400',
    borderHover: 'hover:border-red-600/30 dark:hover:border-red-500/30',
    bgActiveHover: 'hover:bg-red-600/15 dark:hover:bg-red-600/25',
  },
  'image-tools': {
    borderSelected: 'border-orange-600/50 dark:border-orange-500/50',
    bgSelected: 'bg-orange-600/10 dark:bg-orange-600/20',
    bgHover: 'hover:bg-orange-600/5 dark:hover:bg-orange-600/10',
    textSelected: 'text-orange-700 dark:text-orange-400',
    textHover: 'hover:text-orange-700 dark:hover:text-orange-400',
    borderHover: 'hover:border-orange-600/30 dark:hover:border-orange-500/30',
    bgActiveHover: 'hover:bg-orange-600/15 dark:hover:bg-orange-600/25',
  },
};

export function TagFilter({
  selectedTag,
  showFavoritesOnly,
  favoritesCount,
  onTagChange,
  onFavoritesToggle,
}: TagFilterProps) {
  const tags = Object.values(TAGS);

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

      {tags.map((tag) => {
        const toolCount = getToolsByTag(tag.id).length;
        const isSelected = selectedTag === tag.id;
        const Icon = TAG_ICONS[tag.icon];
        const styles = TAG_STYLES[tag.id] || {
          borderSelected: 'border-primary/50',
          bgSelected: 'bg-primary/10',
          bgHover: 'hover:bg-primary/5',
          textSelected: 'text-primary',
          textHover: 'hover:text-primary',
          borderHover: 'hover:border-primary/30',
          bgActiveHover: 'hover:bg-primary/15',
        };

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
            {Icon && (
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0 transition-transform duration-300',
                  isSelected ? 'scale-110' : '',
                  isSelected ? styles.textSelected : tag.color
                )}
              />
            )}
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
