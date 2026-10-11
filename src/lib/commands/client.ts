'use client';

import { useCallback, useMemo } from 'react';
import { useFavorites } from '@/lib/contexts/FavoritesContext';
import { useRecentTools } from '@/lib/contexts/RecentToolsContext';
import { useSettings } from '@/lib/contexts/SettingsContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { preferences } from '@/lib/preferences/client';
import type { AppCommand, CommandState } from './index';

export interface AppCommandRunner {
  /** What the commands see in this render: for labels, status and `nothingToDo`. */
  state: CommandState;
  /**
   * Performs a command and returns the message that confirms it. Showing the
   * message is up to the caller.
   */
  run(command: AppCommand): string;
}

/** Connects the app commands to the app's contexts. */
export function useAppCommands(): AppCommandRunner {
  const { theme, toggleTheme } = useTheme();
  const { compactMode, setCompactMode, fullWidth, setFullWidth } = useSettings();
  const { favorites, clearFavorites } = useFavorites();
  const { recentTools, clearRecentTools } = useRecentTools();

  const state = useMemo(
    () => ({ theme, compactMode, fullWidth, favorites, recentTools }),
    [theme, compactMode, fullWidth, favorites, recentTools]
  );

  const run = useCallback(
    (command: AppCommand) =>
      command.run(
        // Read from the store, not from render state, so a toggle is right
        // even when its shortcut repeats before React has re-rendered.
        {
          theme: preferences.get('theme'),
          compactMode: preferences.get('compactMode'),
          fullWidth: preferences.get('fullWidth'),
          favorites: preferences.get('favorites'),
          recentTools: preferences.get('recentTools'),
        },
        { toggleTheme, setCompactMode, setFullWidth, clearRecentTools, clearFavorites }
      ),
    [toggleTheme, setCompactMode, setFullWidth, clearRecentTools, clearFavorites]
  );

  return useMemo(() => ({ state, run }), [state, run]);
}
