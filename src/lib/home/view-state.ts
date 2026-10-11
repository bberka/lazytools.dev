/**
 * Home view state: what the home page is showing (search text, selected tag,
 * favorites-only) and how far it is scrolled. It is kept for the browser
 * session, so opening a tool and coming back lands on the same view.
 *
 * This is the only module that knows the storage key names, the stored
 * formats, the defaults, and how a reset reaches a home page that is on
 * screen. It has no React and no DOM dependency. Storage is reached through
 * the `HomeViewStorage` seam, which has a `sessionStorage` adapter for the app
 * and an in-memory adapter for tests. The app's store and its React hook are
 * in `./client`.
 */

import type { ToolTag } from '@/lib/types';

export interface HomeViewState {
  searchQuery: string;
  selectedTag: ToolTag | null;
  showFavoritesOnly: boolean;
  /** How far down the page is scrolled, in whole pixels. */
  scrollY: number;
}

/**
 * Storage key of each value. Tabs that are open during a deploy hold their
 * state under these names, so they must not change.
 */
export const HOME_VIEW_STORAGE_KEYS = {
  searchQuery: 'home-search-query',
  selectedTag: 'home-selected-tag',
  showFavoritesOnly: 'home-favorites-only',
  scrollY: 'home-scroll-y',
} as const satisfies Record<keyof HomeViewState, string>;

/**
 * The view when nothing usable is stored. The server render and the first
 * client render also show it, so the static HTML hydrates without a mismatch.
 */
export const DEFAULT_HOME_VIEW_STATE: Readonly<HomeViewState> = {
  searchQuery: '',
  selectedTag: null,
  showFavoritesOnly: false,
  scrollY: 0,
};

// Storage seam

/** Where the view state is kept. Implementations must not throw. */
export interface HomeViewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Adapter for the browser's `sessionStorage`. It is safe to create and call
 * during server rendering, and when the browser blocks storage: reads then
 * find nothing and writes are dropped.
 */
export function createSessionStorage(): HomeViewStorage {
  // Looked up on every call: there is no window during server rendering, and
  // the property access itself throws when site data is blocked.
  const area = (): Storage | null => {
    try {
      return typeof window !== 'undefined' ? window.sessionStorage : null;
    } catch {
      return null;
    }
  };

  return {
    getItem(key) {
      try {
        return area()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        area()?.setItem(key, value);
      } catch {
        // Storage is full or blocked; the view is simply not remembered.
      }
    },
    removeItem(key) {
      try {
        area()?.removeItem(key);
      } catch {
        // Same as above.
      }
    },
  };
}

/** In-memory adapter for tests, optionally seeded with already stored items. */
export function createMemoryStorage(initial: Record<string, string> = {}): HomeViewStorage {
  const items = new Map(Object.entries(initial));

  return {
    getItem: (key) => items.get(key) ?? null,
    setItem(key, value) {
      items.set(key, value);
    },
    removeItem(key) {
      items.delete(key);
    },
  };
}

// Stored formats
//
// searchQuery        the text as typed
// selectedTag        the tag id, or an empty string for no tag
// showFavoritesOnly  'true' or 'false'
// scrollY            the offset in pixels, as a decimal number

// Scroll offsets are whole pixels from the top. Anything else is the top.
function toScrollOffset(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// Store

export interface HomeViewStateStore {
  /**
   * The stored view. A value that is missing or unusable, such as a tag that
   * no longer exists or a scroll offset that is not a number, reads as its
   * default.
   */
  restore(): HomeViewState;
  /** Stores the given values and leaves the others as they are. */
  save(changes: Partial<HomeViewState>): void;
  /**
   * Replaces whatever is stored with a view of one tag, from the top of the
   * page. For a page that is about to send the user to the home page.
   */
  showTag(tag: ToolTag): void;
  /**
   * Forgets the stored view, so the defaults apply again, and then tells the
   * `onReset` listeners.
   */
  reset(): void;
  /**
   * Calls `listener` on every `reset`, so a home page that is on screen can
   * go back to the defaults as well. Returns the unsubscribe function.
   */
  onReset(listener: () => void): () => void;
}

/**
 * Builds a store over the given storage. `tags` are the tags a stored
 * selection may name; any other stored tag is ignored.
 */
export function createHomeViewStateStore(
  storage: HomeViewStorage,
  tags: readonly ToolTag[]
): HomeViewStateStore {
  const knownTags = new Set<string>(tags);
  // Held as objects so the same function can listen more than once
  const resetSubscriptions = new Set<{ listener: () => void }>();

  function restore(): HomeViewState {
    const tag = storage.getItem(HOME_VIEW_STORAGE_KEYS.selectedTag);
    const scrollY = storage.getItem(HOME_VIEW_STORAGE_KEYS.scrollY);

    return {
      searchQuery:
        storage.getItem(HOME_VIEW_STORAGE_KEYS.searchQuery) ?? DEFAULT_HOME_VIEW_STATE.searchQuery,
      selectedTag: tag !== null && knownTags.has(tag) ? (tag as ToolTag) : null,
      showFavoritesOnly: storage.getItem(HOME_VIEW_STORAGE_KEYS.showFavoritesOnly) === 'true',
      scrollY: scrollY === null ? 0 : toScrollOffset(Number.parseFloat(scrollY)),
    };
  }

  function save(changes: Partial<HomeViewState>): void {
    if (changes.searchQuery !== undefined) {
      storage.setItem(HOME_VIEW_STORAGE_KEYS.searchQuery, changes.searchQuery);
    }
    if (changes.selectedTag !== undefined) {
      storage.setItem(HOME_VIEW_STORAGE_KEYS.selectedTag, changes.selectedTag ?? '');
    }
    if (changes.showFavoritesOnly !== undefined) {
      storage.setItem(HOME_VIEW_STORAGE_KEYS.showFavoritesOnly, String(changes.showFavoritesOnly));
    }
    if (changes.scrollY !== undefined) {
      storage.setItem(HOME_VIEW_STORAGE_KEYS.scrollY, String(toScrollOffset(changes.scrollY)));
    }
  }

  function showTag(tag: ToolTag): void {
    save({ ...DEFAULT_HOME_VIEW_STATE, selectedTag: tag });
  }

  function reset(): void {
    for (const key of Object.values(HOME_VIEW_STORAGE_KEYS)) {
      storage.removeItem(key);
    }
    [...resetSubscriptions].forEach((subscription) => subscription.listener());
  }

  function onReset(listener: () => void): () => void {
    const subscription = { listener };
    resetSubscriptions.add(subscription);
    return () => {
      resetSubscriptions.delete(subscription);
    };
  }

  return { restore, save, showTag, reset, onReset };
}
