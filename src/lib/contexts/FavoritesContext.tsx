'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { preferences, usePreference } from '@/lib/preferences/client';

interface FavoritesContextType {
  favorites: string[];
  toggleFavorite: (toolId: string) => void;
  isFavorite: (toolId: string) => boolean;
  clearFavorites: () => void;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(
  undefined
);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const favorites = usePreference('favorites');

  const toggleFavorite = useCallback((toolId: string) => {
    preferences.toggleFavorite(toolId);
  }, []);

  const isFavorite = useCallback(
    (toolId: string) => favorites.includes(toolId),
    [favorites]
  );

  const clearFavorites = useCallback(() => {
    preferences.set('favorites', []);
  }, []);

  const value = useMemo(
    () => ({
      favorites,
      toggleFavorite,
      isFavorite,
      clearFavorites,
    }),
    [favorites, toggleFavorite, isFavorite, clearFavorites]
  );

  return (
    <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within FavoritesProvider');
  }
  return context;
}
