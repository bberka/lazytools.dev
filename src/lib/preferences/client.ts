'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  createBrowserStorage,
  createPreferencesStore,
  DEFAULT_PREFERENCES,
  type PreferenceKey,
  type Preferences,
} from './store';

/** The app's preferences, persisted in this browser's `localStorage`. */
export const preferences = createPreferencesStore(createBrowserStorage());

/**
 * Subscribes a component to one preference.
 *
 * The server render and the first client render both return the default, so
 * the static HTML hydrates without a mismatch. React re-renders with the
 * stored value right after hydration, and again on every later change,
 * including changes made in another tab.
 */
export function usePreference<K extends PreferenceKey>(key: K): Preferences[K] {
  const subscribe = useCallback(
    (onChange: () => void) => preferences.subscribe(key, onChange),
    [key]
  );

  return useSyncExternalStore(
    subscribe,
    () => preferences.get(key),
    () => DEFAULT_PREFERENCES[key]
  );
}
