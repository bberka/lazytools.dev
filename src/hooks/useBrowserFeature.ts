import { useSyncExternalStore } from 'react';

const subscribeToNothing = () => () => {};

/**
 * Whether the browser has a feature that never appears or disappears while the page is open
 * (an API, a codec, a permission surface). The prerendered page cannot know the browser, so
 * `assumedOnServer` stands in for it there and for the first client render; the real answer
 * follows once the page is live. A `useState` initializer would give a first client render
 * that differs from the prerendered HTML.
 */
export function useBrowserFeature(detect: () => boolean, assumedOnServer: boolean): boolean {
  return useSyncExternalStore(subscribeToNothing, detect, () => assumedOnServer);
}
