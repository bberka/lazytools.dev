'use client';

import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { preferences, usePreference } from '@/lib/preferences/client';
import type { Theme } from '@/lib/preferences/store';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = usePreference('theme');

  // Keep the <html> class in step with every theme change, including ones
  // made in another tab. The first paint is handled by the inline script in
  // layout.tsx, so nothing is applied on mount.
  useEffect(
    () =>
      preferences.subscribe('theme', () => {
        document.documentElement.classList.toggle('dark', preferences.get('theme') === 'dark');
      }),
    []
  );

  const setTheme = useCallback((newTheme: Theme) => {
    preferences.set('theme', newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
