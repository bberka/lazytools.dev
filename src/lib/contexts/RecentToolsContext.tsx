'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { preferences, usePreference } from '@/lib/preferences/client';

interface RecentToolsContextType {
  recentTools: string[];
  addRecentTool: (toolId: string) => void;
  clearRecentTools: () => void;
}

const RecentToolsContext = createContext<RecentToolsContextType | undefined>(
  undefined
);

export function RecentToolsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const recentTools = usePreference('recentTools');

  const addRecentTool = useCallback((toolId: string) => {
    preferences.addRecentTool(toolId);
  }, []);

  const clearRecentTools = useCallback(() => {
    preferences.reset('recentTools');
  }, []);

  const value = useMemo(
    () => ({ recentTools, addRecentTool, clearRecentTools }),
    [recentTools, addRecentTool, clearRecentTools]
  );

  return (
    <RecentToolsContext.Provider value={value}>{children}</RecentToolsContext.Provider>
  );
}

export function useRecentTools() {
  const context = useContext(RecentToolsContext);
  if (!context) {
    throw new Error('useRecentTools must be used within RecentToolsProvider');
  }
  return context;
}
