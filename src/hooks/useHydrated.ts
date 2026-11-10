import { useBrowserFeature } from './useBrowserFeature';

/**
 * False for the prerendered HTML and the first client render, true afterwards.
 * Use it to keep browser-only values (clock, platform, locale) out of the
 * static export without an effect that sets state.
 */
export function useHydrated(): boolean {
  return useBrowserFeature(() => true, false);
}
