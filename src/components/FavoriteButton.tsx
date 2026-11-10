'use client';

import { Star } from 'lucide-react';
import { Button } from './ui/button';
import { useFavorites } from '@/lib/contexts/FavoritesContext';
import { TooltipSimple } from './ui/tooltip';

interface FavoriteButtonProps {
  toolId: string;
  variant?: 'icon' | 'card';
  onToggle?: (isFavorite: boolean) => void;
}

export function FavoriteButton({ toolId, variant = 'icon', onToggle }: FavoriteButtonProps) {
  const { toggleFavorite, isFavorite } = useFavorites();
  const isFav = isFavorite(toolId);

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const nextValue = !isFav;
    toggleFavorite(toolId);
    onToggle?.(nextValue);
  };

  if (variant === 'card') {
    return (
      <TooltipSimple content={isFav ? 'Remove from favorites' : 'Add to favorites'}>
        <button
          type="button"
          onClick={handleToggle}
          className="rounded p-1 transition-colors hover:bg-accent group/star"
          aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star
            className={
              isFav
                ? 'size-5 fill-yellow-500 text-yellow-500 transition-all'
                : 'size-5 text-muted-foreground transition-all group-hover/star:text-yellow-500'
            }
          />
        </button>
      </TooltipSimple>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      className="gap-2"
      aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Star
        className={
          isFav
            ? 'h-4 w-4 fill-yellow-500 text-yellow-500 transition-all'
            : 'h-4 w-4 text-muted-foreground transition-all'
        }
      />
      <span>{isFav ? 'Favorited' : 'Add to Favorites'}</span>
    </Button>
  );
}
