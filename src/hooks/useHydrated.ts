import { useSyncExternalStore } from 'react';

const subscribeToNothing = () => () => {};

/**
 * False for the prerendered HTML and the first client render, true afterwards.
 * Use it to keep browser-only values (clock, platform, locale) out of the
 * static export without an effect that sets state.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}
