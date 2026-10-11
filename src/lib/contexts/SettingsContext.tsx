'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { preferences, usePreference } from '@/lib/preferences/client';

interface SettingsContextType {
  compactMode: boolean;
  setCompactMode: (compactMode: boolean) => void;
  fullWidth: boolean;
  setFullWidth: (fullWidth: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const compactMode = usePreference('compactMode');
  const fullWidth = usePreference('fullWidth');

  const setCompactMode = useCallback((nextCompactMode: boolean) => {
    preferences.set('compactMode', nextCompactMode);
  }, []);

  const setFullWidth = useCallback((nextFullWidth: boolean) => {
    preferences.set('fullWidth', nextFullWidth);
  }, []);

  const value = useMemo(
    () => ({ compactMode, setCompactMode, fullWidth, setFullWidth }),
    [compactMode, setCompactMode, fullWidth, setFullWidth]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}
