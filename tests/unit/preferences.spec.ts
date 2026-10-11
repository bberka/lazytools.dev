import { test, expect } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { preferences, usePreference } from '@/lib/preferences/client';
import {
  createBrowserStorage,
  createMemoryStorage,
  createPreferencesStore,
  DEFAULT_PREFERENCES,
  MAX_RECENT_TOOLS,
  PREFERENCE_STORAGE_KEYS,
  type PreferenceKey,
  type PreferenceStorage,
} from '@/lib/preferences/store';

// What existing users already have in localStorage. Written out here on
// purpose, independent of the module, so a renamed key fails a test.
const NAMESPACE = 'dev-toolbox';
const STORED = {
  theme: `${NAMESPACE}:theme`,
  favorites: `${NAMESPACE}:favorites`,
  recentTools: `${NAMESPACE}:recent`,
  compactMode: `${NAMESPACE}:compact-mode`,
  fullWidth: `${NAMESPACE}:full-width`,
};

const ALL_KEYS = Object.keys(STORED) as PreferenceKey[];

// Stand-in for the parts of `window` the browser adapter touches.
function createFakeWindow(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const handlers = new Set<(event: { key: string | null }) => void>();

  return {
    items,
    handlers,
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        items.set(key, value);
      },
      removeItem: (key: string) => {
        items.delete(key);
      },
    },
    addEventListener(type: string, handler: (event: { key: string | null }) => void) {
      if (type === 'storage') handlers.add(handler);
    },
    removeEventListener(type: string, handler: (event: { key: string | null }) => void) {
      if (type === 'storage') handlers.delete(handler);
    },
    // What the browser does in this tab after another tab changed `key`.
    dispatchStorageEvent(key: string | null) {
      [...handlers].forEach((handler) => handler({ key }));
    },
  };
}

function withWindow<T>(fakeWindow: object, run: () => T): T {
  const scope = globalThis as { window?: unknown };
  const hadWindow = 'window' in scope;
  const original = scope.window;
  scope.window = fakeWindow;
  try {
    return run();
  } finally {
    if (hadWindow) {
      scope.window = original;
    } else {
      delete scope.window;
    }
  }
}

test.describe('preferences store: stored data', () => {
  test('keeps the storage key names existing users already have', () => {
    expect(PREFERENCE_STORAGE_KEYS).toEqual(STORED);
  });

  test('returns the defaults when storage is empty, without writing anything', () => {
    const storage = createMemoryStorage();
    const store = createPreferencesStore(storage);

    expect(store.get('theme')).toBe('dark');
    expect(store.get('favorites')).toEqual([]);
    expect(store.get('recentTools')).toEqual([]);
    expect(store.get('compactMode')).toBe(false);
    expect(store.get('fullWidth')).toBe(false);

    for (const key of ALL_KEYS) {
      expect(store.get(key)).toBe(DEFAULT_PREFERENCES[key]);
      expect(storage.getItem(STORED[key])).toBeNull();
    }
  });

  test('reads what earlier versions of the app stored', () => {
    const store = createPreferencesStore(
      createMemoryStorage({
        [STORED.theme]: 'light',
        [STORED.favorites]: '["json-formatter","base64-encoder"]',
        [STORED.recentTools]: '["uuid-generator","json-formatter"]',
        [STORED.compactMode]: 'true',
        [STORED.fullWidth]: 'false',
      })
    );

    expect(store.get('theme')).toBe('light');
    expect(store.get('favorites')).toEqual(['json-formatter', 'base64-encoder']);
    expect(store.get('recentTools')).toEqual(['uuid-generator', 'json-formatter']);
    expect(store.get('compactMode')).toBe(true);
    expect(store.get('fullWidth')).toBe(false);
  });

  test('round-trips every preference in the stored format', () => {
    const storage = createMemoryStorage();
    const store = createPreferencesStore(storage);

    store.set('theme', 'light');
    store.set('favorites', ['json-formatter', 'base64-encoder']);
    store.set('recentTools', ['uuid-generator']);
    store.set('compactMode', true);
    store.set('fullWidth', true);

    expect(storage.getItem(STORED.theme)).toBe('light');
    expect(storage.getItem(STORED.favorites)).toBe('["json-formatter","base64-encoder"]');
    expect(storage.getItem(STORED.recentTools)).toBe('["uuid-generator"]');
    expect(storage.getItem(STORED.compactMode)).toBe('true');
    expect(storage.getItem(STORED.fullWidth)).toBe('true');

    // A second store on the same storage is the next page load.
    const reloaded = createPreferencesStore(storage);
    expect(reloaded.get('theme')).toBe('light');
    expect(reloaded.get('favorites')).toEqual(['json-formatter', 'base64-encoder']);
    expect(reloaded.get('recentTools')).toEqual(['uuid-generator']);
    expect(reloaded.get('compactMode')).toBe(true);
    expect(reloaded.get('fullWidth')).toBe(true);

    store.set('theme', 'dark');
    store.set('compactMode', false);
    expect(storage.getItem(STORED.theme)).toBe('dark');
    expect(storage.getItem(STORED.compactMode)).toBe('false');
    expect(reloaded.get('theme')).toBe('dark');
    expect(reloaded.get('compactMode')).toBe(false);
  });

  test('reset removes the stored value so the default applies again', () => {
    const storage = createMemoryStorage({
      [STORED.recentTools]: '["uuid-generator"]',
      [STORED.theme]: 'light',
    });
    const store = createPreferencesStore(storage);

    store.reset('recentTools');
    store.reset('theme');

    expect(storage.getItem(STORED.recentTools)).toBeNull();
    expect(store.get('recentTools')).toEqual([]);
    expect(storage.getItem(STORED.theme)).toBeNull();
    expect(store.get('theme')).toBe('dark');
  });
});

test.describe('preferences store: corrupt stored values', () => {
  test('falls back to the default for values it cannot use', () => {
    const cases: Array<[key: PreferenceKey, raw: string]> = [
      ['theme', 'blue'],
      ['theme', ''],
      ['theme', '"light"'],
      ['favorites', '{not json'],
      ['favorites', ''],
      ['favorites', '{"json-formatter":true}'],
      ['favorites', '"json-formatter"'],
      ['favorites', 'null'],
      ['recentTools', '[1, 2'],
      ['recentTools', '42'],
      ['compactMode', 'yes'],
      ['compactMode', '1'],
      ['fullWidth', 'TRUE'],
    ];

    for (const [key, raw] of cases) {
      const store = createPreferencesStore(createMemoryStorage({ [STORED[key]]: raw }));
      expect(store.get(key), `${key} stored as ${JSON.stringify(raw)}`).toEqual(
        DEFAULT_PREFERENCES[key]
      );
    }
  });

  test('keeps the usable tool IDs of a partly damaged list', () => {
    const store = createPreferencesStore(
      createMemoryStorage({
        [STORED.favorites]: '["json-formatter", 7, null, {"id":"x"}, "base64-encoder"]',
      })
    );

    expect(store.get('favorites')).toEqual(['json-formatter', 'base64-encoder']);
  });

  test('writes a clean value over a corrupt one', () => {
    const storage = createMemoryStorage({
      [STORED.favorites]: '{not json',
      [STORED.recentTools]: '"oops"',
      [STORED.compactMode]: 'yes',
    });
    const store = createPreferencesStore(storage);

    store.toggleFavorite('json-formatter');
    store.addRecentTool('uuid-generator');
    store.set('compactMode', true);

    expect(storage.getItem(STORED.favorites)).toBe('["json-formatter"]');
    expect(storage.getItem(STORED.recentTools)).toBe('["uuid-generator"]');
    expect(storage.getItem(STORED.compactMode)).toBe('true');
  });
});

test.describe('preferences store: favorites', () => {
  test('toggle adds a tool at the end and removes it when toggled again', () => {
    const storage = createMemoryStorage();
    const store = createPreferencesStore(storage);

    store.toggleFavorite('json-formatter');
    store.toggleFavorite('base64-encoder');
    expect(store.get('favorites')).toEqual(['json-formatter', 'base64-encoder']);

    store.toggleFavorite('json-formatter');
    expect(store.get('favorites')).toEqual(['base64-encoder']);
    expect(storage.getItem(STORED.favorites)).toBe('["base64-encoder"]');

    store.toggleFavorite('json-formatter');
    expect(store.get('favorites')).toEqual(['base64-encoder', 'json-formatter']);
  });

  test('removing a favorite leaves the others in order', () => {
    const store = createPreferencesStore(
      createMemoryStorage({ [STORED.favorites]: '["a","b","c"]' })
    );

    store.toggleFavorite('b');

    expect(store.get('favorites')).toEqual(['a', 'c']);
  });

  test('clearing stores an empty list', () => {
    const storage = createMemoryStorage({ [STORED.favorites]: '["a","b"]' });
    const store = createPreferencesStore(storage);

    store.set('favorites', []);

    expect(store.get('favorites')).toEqual([]);
    expect(storage.getItem(STORED.favorites)).toBe('[]');
  });

  test('does not change a list it handed out earlier', () => {
    const store = createPreferencesStore(createMemoryStorage({ [STORED.favorites]: '["a"]' }));
    const before = store.get('favorites');

    store.toggleFavorite('b');
    store.toggleFavorite('a');

    expect(before).toEqual(['a']);
    expect(store.get('favorites')).toEqual(['b']);
  });
});

test.describe('preferences store: recent tools', () => {
  test('lists the most recent tool first', () => {
    const store = createPreferencesStore(createMemoryStorage());

    store.addRecentTool('a');
    store.addRecentTool('b');
    store.addRecentTool('c');

    expect(store.get('recentTools')).toEqual(['c', 'b', 'a']);
  });

  test('moves a tool that is opened again to the front instead of repeating it', () => {
    const storage = createMemoryStorage({ [STORED.recentTools]: '["c","b","a"]' });
    const store = createPreferencesStore(storage);

    store.addRecentTool('a');

    expect(store.get('recentTools')).toEqual(['a', 'c', 'b']);
    expect(storage.getItem(STORED.recentTools)).toBe('["a","c","b"]');
  });

  test('keeps only the most recent tools, dropping the oldest', () => {
    const storage = createMemoryStorage();
    const store = createPreferencesStore(storage);
    expect(MAX_RECENT_TOOLS).toBe(5);

    for (const toolId of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      store.addRecentTool(toolId);
    }

    expect(store.get('recentTools')).toEqual(['g', 'f', 'e', 'd', 'c']);
    expect(storage.getItem(STORED.recentTools)).toBe('["g","f","e","d","c"]');

    // Reopening a listed tool reorders the list without dropping anything.
    store.addRecentTool('d');
    expect(store.get('recentTools')).toEqual(['d', 'g', 'f', 'e', 'c']);
  });
});

test.describe('preferences store: subscribers', () => {
  test('tells the subscribers of a preference when it is written', () => {
    const store = createPreferencesStore(createMemoryStorage());
    const seen: string[][] = [];
    store.subscribe('favorites', () => seen.push(store.get('favorites')));

    store.toggleFavorite('a');
    store.toggleFavorite('b');
    store.set('favorites', []);

    expect(seen).toEqual([['a'], ['a', 'b'], []]);
  });

  test('covers every way of writing', () => {
    const store = createPreferencesStore(createMemoryStorage());
    const calls: string[] = [];
    for (const key of ALL_KEYS) {
      store.subscribe(key, () => calls.push(key));
    }

    store.set('theme', 'light');
    store.set('compactMode', true);
    store.set('fullWidth', true);
    store.toggleFavorite('a');
    store.addRecentTool('a');
    store.reset('recentTools');

    expect(calls).toEqual([
      'theme',
      'compactMode',
      'fullWidth',
      'favorites',
      'recentTools',
      'recentTools',
    ]);
  });

  test('stops telling a subscriber once it unsubscribes', () => {
    const store = createPreferencesStore(createMemoryStorage());
    let staying = 0;
    let leaving = 0;
    store.subscribe('theme', () => staying++);
    const unsubscribe = store.subscribe('theme', () => leaving++);

    store.set('theme', 'light');
    unsubscribe();
    unsubscribe();
    store.set('theme', 'dark');

    expect(staying).toBe(2);
    expect(leaving).toBe(1);
  });

  test('returns the same reference until the value changes', () => {
    const storage = createMemoryStorage({ [STORED.recentTools]: '["a","b"]' });
    const store = createPreferencesStore(storage);

    // useSyncExternalStore re-renders forever if a snapshot is not stable.
    const first = store.get('recentTools');
    expect(store.get('recentTools')).toBe(first);

    // Opening the tool that is already first changes nothing.
    store.addRecentTool('a');
    expect(store.get('recentTools')).toBe(first);

    // Neither does another tab storing the same list again.
    storage.writeFromOtherTab(STORED.recentTools, '[ "a", "b" ]');
    expect(store.get('recentTools')).toBe(first);

    store.addRecentTool('b');
    expect(store.get('recentTools')).not.toBe(first);
    expect(store.get('recentTools')).toEqual(['b', 'a']);
  });

  test('an empty stored list is the default itself', () => {
    const store = createPreferencesStore(createMemoryStorage({ [STORED.favorites]: '[]' }));

    expect(store.get('favorites')).toBe(DEFAULT_PREFERENCES.favorites);
  });
});

test.describe('preferences store: changes from another tab', () => {
  test('picks up the new value and tells the subscribers of that preference', () => {
    const storage = createMemoryStorage({ [STORED.favorites]: '["a"]' });
    const store = createPreferencesStore(storage);
    const calls: string[] = [];
    for (const key of ALL_KEYS) {
      store.subscribe(key, () => calls.push(key));
    }
    expect(store.get('favorites')).toEqual(['a']);

    storage.writeFromOtherTab(STORED.favorites, '["a","b"]');
    expect(calls).toEqual(['favorites']);
    expect(store.get('favorites')).toEqual(['a', 'b']);

    storage.writeFromOtherTab(STORED.theme, 'light');
    storage.writeFromOtherTab(STORED.compactMode, 'true');
    storage.writeFromOtherTab(STORED.fullWidth, 'true');
    storage.writeFromOtherTab(STORED.recentTools, '["c"]');
    expect(calls).toEqual(['favorites', 'theme', 'compactMode', 'fullWidth', 'recentTools']);
    expect(store.get('theme')).toBe('light');
    expect(store.get('compactMode')).toBe(true);
    expect(store.get('fullWidth')).toBe(true);
    expect(store.get('recentTools')).toEqual(['c']);
  });

  test('falls back to the default when the other tab removes the value', () => {
    const storage = createMemoryStorage({ [STORED.recentTools]: '["a"]' });
    const store = createPreferencesStore(storage);
    let calls = 0;
    store.subscribe('recentTools', () => calls++);
    expect(store.get('recentTools')).toEqual(['a']);

    storage.writeFromOtherTab(STORED.recentTools, null);

    expect(calls).toBe(1);
    expect(store.get('recentTools')).toEqual([]);
  });

  test('ignores keys that are not preferences', () => {
    const storage = createMemoryStorage();
    const store = createPreferencesStore(storage);
    let calls = 0;
    for (const key of ALL_KEYS) {
      store.subscribe(key, () => calls++);
    }

    storage.writeFromOtherTab('home-search-query', 'json');
    storage.writeFromOtherTab(`${NAMESPACE}:tool:json-formatter`, '{}');

    expect(calls).toBe(0);
  });

  test('tells every subscriber when the other tab clears the storage', () => {
    const storage = createMemoryStorage({
      [STORED.theme]: 'light',
      [STORED.favorites]: '["a"]',
    });
    const store = createPreferencesStore(storage);
    const calls: string[] = [];
    for (const key of ALL_KEYS) {
      store.subscribe(key, () => calls.push(key));
    }
    expect(store.get('theme')).toBe('light');

    storage.clearFromOtherTab();

    expect(calls.sort()).toEqual([...ALL_KEYS].sort());
    expect(store.get('theme')).toBe('dark');
    expect(store.get('favorites')).toEqual([]);
  });

  test('listens to the storage only while it has subscribers', () => {
    const memory = createMemoryStorage();
    let listening = 0;
    const storage: PreferenceStorage = {
      ...memory,
      subscribe(listener) {
        listening++;
        const stop = memory.subscribe(listener);
        return () => {
          listening--;
          stop();
        };
      },
    };
    const store = createPreferencesStore(storage);
    expect(listening).toBe(0);

    const stopTheme = store.subscribe('theme', () => {});
    const stopFavorites = store.subscribe('favorites', () => {});
    expect(listening).toBe(1);

    stopTheme();
    expect(listening).toBe(1);
    stopFavorites();
    expect(listening).toBe(0);

    store.subscribe('theme', () => {});
    expect(listening).toBe(1);
  });

  test('two tabs build on each other instead of overwriting', () => {
    const storage = createMemoryStorage();
    const tabA = createPreferencesStore(storage);
    const tabB = createPreferencesStore(storage);
    expect(tabB.get('favorites')).toEqual([]);

    // No storage event has reached tab B yet when it makes its own change.
    tabA.toggleFavorite('a');
    tabB.toggleFavorite('b');

    expect(tabB.get('favorites')).toEqual(['a', 'b']);
    expect(tabA.get('favorites')).toEqual(['a', 'b']);
  });
});

test.describe('preferences store: storage that drops writes', () => {
  test('keeps the change for the session and still tells subscribers', () => {
    const storage: PreferenceStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      subscribe: () => () => {},
    };
    const store = createPreferencesStore(storage);
    let calls = 0;
    store.subscribe('theme', () => calls++);

    store.set('theme', 'light');
    store.set('compactMode', true);
    store.toggleFavorite('a');
    store.toggleFavorite('b');
    store.addRecentTool('a');

    expect(calls).toBe(1);
    expect(store.get('theme')).toBe('light');
    expect(store.get('compactMode')).toBe(true);
    expect(store.get('favorites')).toEqual(['a', 'b']);
    expect(store.get('recentTools')).toEqual(['a']);

    store.reset('recentTools');
    expect(store.get('recentTools')).toEqual([]);
  });
});

test.describe('browser storage adapter', () => {
  test('is inert where there is no window, as during the static build', () => {
    expect(typeof window).toBe('undefined');
    const storage = createBrowserStorage();
    const store = createPreferencesStore(storage);

    expect(storage.getItem(STORED.theme)).toBeNull();
    expect(() => storage.setItem(STORED.theme, 'light')).not.toThrow();
    expect(() => storage.removeItem(STORED.theme)).not.toThrow();
    expect(() => storage.subscribe(() => {})()).not.toThrow();
    expect(store.get('theme')).toBe('dark');
    expect(store.get('favorites')).toEqual([]);
  });

  test('reads and writes window.localStorage', () => {
    const fakeWindow = createFakeWindow({ [STORED.theme]: 'light' });

    withWindow(fakeWindow, () => {
      const store = createPreferencesStore(createBrowserStorage());
      expect(store.get('theme')).toBe('light');

      store.set('compactMode', true);
      store.addRecentTool('json-formatter');
      expect(fakeWindow.items.get(STORED.compactMode)).toBe('true');
      expect(fakeWindow.items.get(STORED.recentTools)).toBe('["json-formatter"]');

      store.reset('recentTools');
      expect(fakeWindow.items.has(STORED.recentTools)).toBe(false);
    });
  });

  test('relays storage events from other tabs and stops when unsubscribed', () => {
    const fakeWindow = createFakeWindow();

    withWindow(fakeWindow, () => {
      const store = createPreferencesStore(createBrowserStorage());
      const seen: boolean[] = [];
      const unsubscribe = store.subscribe('fullWidth', () => seen.push(store.get('fullWidth')));
      expect(fakeWindow.handlers.size).toBe(1);

      fakeWindow.items.set(STORED.fullWidth, 'true');
      fakeWindow.dispatchStorageEvent(STORED.fullWidth);
      fakeWindow.items.set(STORED.theme, 'light');
      fakeWindow.dispatchStorageEvent(STORED.theme);
      expect(seen).toEqual([true]);

      fakeWindow.items.clear();
      fakeWindow.dispatchStorageEvent(null);
      expect(seen).toEqual([true, false]);

      unsubscribe();
      expect(fakeWindow.handlers.size).toBe(0);
    });
  });

  test('survives a browser that blocks or fills localStorage', () => {
    const blocked = {
      get localStorage(): never {
        throw new Error('SecurityError: access is denied for this document');
      },
      addEventListener() {},
      removeEventListener() {},
    };
    const full = {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
      addEventListener() {},
      removeEventListener() {},
    };

    for (const fakeWindow of [blocked, full]) {
      withWindow(fakeWindow, () => {
        const store = createPreferencesStore(createBrowserStorage());

        expect(store.get('theme')).toBe('dark');
        expect(() => store.set('theme', 'light')).not.toThrow();
        expect(() => store.toggleFavorite('a')).not.toThrow();
        expect(() => store.reset('recentTools')).not.toThrow();
        expect(store.get('theme')).toBe('light');
        expect(store.get('favorites')).toEqual(['a']);
      });
    }
  });
});

test.describe('usePreference', () => {
  function Probe() {
    const theme = usePreference('theme');
    const favorites = usePreference('favorites');
    const compactMode = usePreference('compactMode');
    return createElement('p', null, `${theme}|${favorites.join(',')}|${compactMode}`);
  }

  test('renders the defaults on the server whatever the browser has stored', () => {
    const fakeWindow = createFakeWindow({
      [STORED.theme]: 'light',
      [STORED.favorites]: '["json-formatter"]',
      [STORED.compactMode]: 'true',
    });

    withWindow(fakeWindow, () => {
      // The app's store does see the stored values here...
      expect(preferences.get('theme')).toBe('light');
      expect(preferences.get('favorites')).toEqual(['json-formatter']);
      expect(preferences.get('compactMode')).toBe(true);

      // ...but the markup must match what the static build produced.
      expect(renderToStaticMarkup(createElement(Probe))).toBe('<p>dark||false</p>');
    });
  });
});
