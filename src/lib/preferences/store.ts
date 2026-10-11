/**
 * Preferences store: the user's theme, favorites, recent tools and layout
 * settings, persisted in the browser.
 *
 * This is the only module that knows the storage key names, the stored
 * formats, the defaults, and the rules for favorites and recent tools. It has
 * no React and no DOM dependency. Storage is reached through the
 * `PreferenceStorage` seam, which has a `localStorage` adapter for the app and
 * an in-memory adapter for tests. React reads the store through
 * `usePreference` in `./client`.
 */

export type Theme = 'light' | 'dark';

export interface Preferences {
  theme: Theme;
  favorites: string[]; // Tool IDs, in the order they were added
  recentTools: string[]; // Tool IDs, most recent first
  compactMode: boolean;
  fullWidth: boolean;
}

export type PreferenceKey = keyof Preferences;

/**
 * Storage key of each preference. Existing users' data lives under these
 * names, so they must not change.
 */
export const PREFERENCE_STORAGE_KEYS = {
  theme: 'dev-toolbox:theme',
  favorites: 'dev-toolbox:favorites',
  recentTools: 'dev-toolbox:recent',
  compactMode: 'dev-toolbox:compact-mode',
  fullWidth: 'dev-toolbox:full-width',
} as const satisfies Record<PreferenceKey, string>;

/**
 * Value of each preference when nothing usable is stored. The server render
 * and the first client render also use these, so the static HTML always
 * hydrates without a mismatch.
 *
 * Theme: `dark` applies to that first render, to a stored value that is
 * neither `light` nor `dark`, and to a browser whose storage cannot be read.
 * A first-time visitor does not get it. The inline script in `app/layout.tsx`
 * runs before React, picks the theme from `prefers-color-scheme` and writes it
 * to storage, so the store reads the system preference from then on.
 */
export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  theme: 'dark',
  favorites: [],
  recentTools: [],
  compactMode: false,
  fullWidth: false,
};

/** How many recent tools are kept. */
export const MAX_RECENT_TOOLS = 5;

// Storage seam

/** Where preferences are persisted. Implementations must not throw. */
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /**
   * Calls `listener` when another document, such as another tab, changes a
   * key. The key is `null` when the whole storage was cleared. Returns the
   * unsubscribe function.
   */
  subscribe(listener: (key: string | null) => void): () => void;
}

/**
 * Adapter for the browser's `localStorage`. It is safe to create and call
 * during server rendering, and when the browser blocks storage: reads then
 * find nothing and writes are dropped.
 */
export function createBrowserStorage(): PreferenceStorage {
  // Looked up on every call: there is no window during server rendering, and
  // the property access itself throws when site data is blocked.
  const area = (): Storage | null => {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
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
        // Storage is full or blocked; the store keeps the value in memory.
      }
    },
    removeItem(key) {
      try {
        area()?.removeItem(key);
      } catch {
        // Same as above.
      }
    },
    subscribe(listener) {
      if (typeof window === 'undefined') return () => {};

      // The browser fires `storage` only in the other documents of the origin.
      const handleStorageChange = (e: StorageEvent) => listener(e.key);
      window.addEventListener('storage', handleStorageChange);
      return () => window.removeEventListener('storage', handleStorageChange);
    },
  };
}

export interface MemoryPreferenceStorage extends PreferenceStorage {
  /** Stores (or with `null`, removes) a key the way another tab would. */
  writeFromOtherTab(key: string, value: string | null): void;
  /** Empties the storage the way another tab calling `clear()` would. */
  clearFromOtherTab(): void;
}

/** In-memory adapter for tests, optionally seeded with already stored items. */
export function createMemoryStorage(
  initial: Record<string, string> = {}
): MemoryPreferenceStorage {
  const items = new Map(Object.entries(initial));
  const listeners = new Set<(key: string | null) => void>();
  const tell = (key: string | null) => [...listeners].forEach((listener) => listener(key));

  return {
    getItem: (key) => items.get(key) ?? null,
    setItem(key, value) {
      items.set(key, value);
    },
    removeItem(key) {
      items.delete(key);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    writeFromOtherTab(key, value) {
      if (value === null) {
        items.delete(key);
      } else {
        items.set(key, value);
      }
      tell(key);
    },
    clearFromOtherTab() {
      items.clear();
      tell(null);
    },
  };
}

// Stored formats

interface PreferenceFormat<T> {
  /** Reads stored text. Returns undefined when it holds no usable value. */
  parse(raw: string): T | undefined;
  serialize(value: T): string;
  isEqual(a: T, b: T): boolean;
}

const themeFormat: PreferenceFormat<Theme> = {
  parse: (raw) => (raw === 'light' || raw === 'dark' ? raw : undefined),
  serialize: (value) => value,
  isEqual: (a, b) => a === b,
};

// Stored as 'true' or 'false'. Anything else reads as off.
const flagFormat: PreferenceFormat<boolean> = {
  parse: (raw) => raw === 'true',
  serialize: (value) => String(value),
  isEqual: (a, b) => a === b,
};

// Stored as a JSON array of tool IDs. Entries that are not strings are dropped.
const toolIdListFormat: PreferenceFormat<string[]> = {
  parse(raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : undefined;
    } catch {
      return undefined;
    }
  },
  serialize: (value) => JSON.stringify(value),
  isEqual: (a, b) => a.length === b.length && a.every((id, index) => id === b[index]),
};

const FORMATS: { [K in PreferenceKey]: PreferenceFormat<Preferences[K]> } = {
  theme: themeFormat,
  favorites: toolIdListFormat,
  recentTools: toolIdListFormat,
  compactMode: flagFormat,
  fullWidth: flagFormat,
};

const PREFERENCE_KEYS = Object.keys(PREFERENCE_STORAGE_KEYS) as PreferenceKey[];

// One preference's link to storage.
interface StoredValue<T> {
  get(): T;
  set(next: T): void;
  reset(): void;
}

function createStoredValue<T>(
  storage: PreferenceStorage,
  storageKey: string,
  format: PreferenceFormat<T>,
  fallback: T
): StoredValue<T> {
  // The text last seen in storage and the value it stands for. Storage stays
  // the source of truth: the cached value is returned only while the stored
  // text is unchanged. That gives callers a stable reference, and it lets a
  // write the storage dropped still hold for the rest of the session.
  let cached: { raw: string | null; value: T } | undefined;

  function get(): T {
    const raw = storage.getItem(storageKey);
    if (cached && cached.raw === raw) return cached.value;

    const stored = raw === null ? undefined : format.parse(raw);
    const next = stored === undefined ? fallback : stored;

    // Keep the previous reference when the content did not change.
    const previous = cached ? cached.value : fallback;
    const value = format.isEqual(previous, next) ? previous : next;
    cached = { raw, value };
    return value;
  }

  // Pairs the value with whatever storage holds after a write. If the write
  // was dropped the text is unchanged, so `get` keeps returning this value.
  function remember(value: T): void {
    cached = { raw: storage.getItem(storageKey), value };
  }

  return {
    get,
    set(next) {
      const previous = get();
      const value = format.isEqual(previous, next) ? previous : next;
      storage.setItem(storageKey, format.serialize(value));
      remember(value);
    },
    reset() {
      storage.removeItem(storageKey);
      remember(fallback);
    },
  };
}

// Store

export interface PreferencesStore {
  /**
   * Current value of a preference: what is stored, or the default. The same
   * reference is returned until the value changes, and it must not be mutated.
   */
  get<K extends PreferenceKey>(key: K): Preferences[K];
  /** Stores a value and tells the subscribers of `key`. */
  set<K extends PreferenceKey>(key: K, value: Preferences[K]): void;
  /** Removes the stored value, so the default applies again. */
  reset(key: PreferenceKey): void;
  /**
   * Calls `listener` after every write to `key` in this tab and every change
   * to it from another tab. Returns the unsubscribe function.
   */
  subscribe(key: PreferenceKey, listener: () => void): () => void;
  /** Adds the tool to favorites, or removes it if it is already there. */
  toggleFavorite(toolId: string): void;
  /**
   * Puts the tool at the front of the recent tools. The list holds each tool
   * once and keeps the `MAX_RECENT_TOOLS` most recent.
   */
  addRecentTool(toolId: string): void;
}

export function createPreferencesStore(storage: PreferenceStorage): PreferencesStore {
  const link = <K extends PreferenceKey>(key: K) =>
    createStoredValue(
      storage,
      PREFERENCE_STORAGE_KEYS[key],
      FORMATS[key],
      DEFAULT_PREFERENCES[key]
    );
  const values: { [K in PreferenceKey]: StoredValue<Preferences[K]> } = {
    theme: link('theme'),
    favorites: link('favorites'),
    recentTools: link('recentTools'),
    compactMode: link('compactMode'),
    fullWidth: link('fullWidth'),
  };

  const subscriptions = new Set<{ key: PreferenceKey; listener: () => void }>();
  let stopListeningToStorage: (() => void) | null = null;

  // A null key means every preference.
  function notify(key: PreferenceKey | null): void {
    [...subscriptions].forEach((subscription) => {
      if (key === null || subscription.key === key) subscription.listener();
    });
  }

  function handleExternalChange(storageKey: string | null): void {
    if (storageKey === null) {
      notify(null);
      return;
    }

    const key = PREFERENCE_KEYS.find((name) => PREFERENCE_STORAGE_KEYS[name] === storageKey);
    if (key) notify(key);
  }

  function get<K extends PreferenceKey>(key: K): Preferences[K] {
    return values[key].get();
  }

  function set<K extends PreferenceKey>(key: K, value: Preferences[K]): void {
    values[key].set(value);
    notify(key);
  }

  function reset(key: PreferenceKey): void {
    values[key].reset();
    notify(key);
  }

  function subscribe(key: PreferenceKey, listener: () => void): () => void {
    const subscription = { key, listener };
    subscriptions.add(subscription);
    if (!stopListeningToStorage) {
      stopListeningToStorage = storage.subscribe(handleExternalChange);
    }

    return () => {
      subscriptions.delete(subscription);
      if (subscriptions.size === 0 && stopListeningToStorage) {
        stopListeningToStorage();
        stopListeningToStorage = null;
      }
    };
  }

  function toggleFavorite(toolId: string): void {
    const favorites = get('favorites');
    set(
      'favorites',
      favorites.includes(toolId)
        ? favorites.filter((id) => id !== toolId)
        : [...favorites, toolId]
    );
  }

  function addRecentTool(toolId: string): void {
    const others = get('recentTools').filter((id) => id !== toolId);
    set('recentTools', [toolId, ...others].slice(0, MAX_RECENT_TOOLS));
  }

  return { get, set, reset, subscribe, toggleFavorite, addRecentTool };
}
