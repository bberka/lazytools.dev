'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import { toast } from 'sonner';
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

  // Keyboard shortcut listener for Alt + W (Full Width) and Alt + C (Compact Mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.altKey &&
        !(
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement ||
          document.activeElement?.getAttribute('contenteditable') === 'true'
        )
      ) {
        const key = e.key.toLowerCase();
        if (key === 'w') {
          e.preventDefault();
          // Read from the store, not from render state, so the toggle is right
          // even when the key repeats before React has re-rendered.
          const next = !preferences.get('fullWidth');
          setFullWidth(next);
          toast.success(next ? 'Full width mode enabled' : 'Full width mode disabled', {
            id: 'full-width-toggle',
          });
        } else if (key === 'c') {
          e.preventDefault();
          const next = !preferences.get('compactMode');
          setCompactMode(next);
          toast.success(next ? 'Compact mode enabled' : 'Compact mode disabled', {
            id: 'compact-mode-toggle',
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setFullWidth, setCompactMode]);

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
