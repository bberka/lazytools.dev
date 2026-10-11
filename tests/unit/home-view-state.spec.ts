import { test, expect } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { homeViewState, useHomeViewState } from '@/lib/home/client';
import {
  countGridColumns,
  isArrowKey,
  moveSelection,
  NO_SELECTION,
  type ArrowKey,
} from '@/lib/home/grid-navigation';
import {
  createHomeViewStateStore,
  createMemoryStorage,
  createSessionStorage,
  DEFAULT_HOME_VIEW_STATE,
  HOME_VIEW_STORAGE_KEYS,
  type HomeViewState,
} from '@/lib/home/view-state';
import type { ToolTag } from '@/lib/types';

// What open tabs already have in sessionStorage. Written out here on purpose,
// independent of the module, so a renamed key fails a test.
const STORED = {
  searchQuery: 'home-search-query',
  selectedTag: 'home-selected-tag',
  showFavoritesOnly: 'home-favorites-only',
  scrollY: 'home-scroll-y',
};

const ALL_STORED_KEYS = Object.values(STORED);

// The tags the stores in these tests accept
const KNOWN_TAGS: ToolTag[] = ['converters', 'text-tools', 'security'];

const DEFAULTS: HomeViewState = {
  searchQuery: '',
  selectedTag: null,
  showFavoritesOnly: false,
  scrollY: 0,
};

// A view with every value away from its default
const BUSY_VIEW: HomeViewState = {
  searchQuery: 'json',
  selectedTag: 'text-tools',
  showFavoritesOnly: true,
  scrollY: 640,
};

const BUSY_STORAGE = {
  [STORED.searchQuery]: 'json',
  [STORED.selectedTag]: 'text-tools',
  [STORED.showFavoritesOnly]: 'true',
  [STORED.scrollY]: '640',
};

// Stand-in for the parts of `window` the browser adapter touches.
function createFakeWindow(initial: Record<string, string> = {}) {
  const sessionItems = new Map(Object.entries(initial));
  const localItems = new Map<string, string>();
  const area = (items: Map<string, string>) => ({
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  });

  return {
    sessionItems,
    localItems,
    sessionStorage: area(sessionItems),
    localStorage: area(localItems),
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

test.describe('home view state: stored data', () => {
  test('keeps the storage key names open tabs already hold', () => {
    expect(HOME_VIEW_STORAGE_KEYS).toEqual(STORED);
  });

  test('restores the defaults when storage is empty, without writing anything', () => {
    const storage = createMemoryStorage();
    const store = createHomeViewStateStore(storage, KNOWN_TAGS);

    expect(store.restore()).toEqual(DEFAULTS);
    expect(DEFAULT_HOME_VIEW_STATE).toEqual(DEFAULTS);
    for (const key of ALL_STORED_KEYS) {
      expect(storage.getItem(key), key).toBeNull();
    }
  });

  test('restores what the home page stored before this module existed', () => {
    const store = createHomeViewStateStore(
      createMemoryStorage({
        [STORED.searchQuery]: 'json',
        [STORED.selectedTag]: 'text-tools',
        [STORED.showFavoritesOnly]: 'false',
        // window.scrollY.toString() on a zoomed page
        [STORED.scrollY]: '812.7999877929688',
      }),
      KNOWN_TAGS
    );

    expect(store.restore()).toEqual({
      searchQuery: 'json',
      selectedTag: 'text-tools',
      showFavoritesOnly: false,
      scrollY: 812,
    });
  });

  test('restores favorites-only with no tag, stored as an empty string', () => {
    const store = createHomeViewStateStore(
      createMemoryStorage({
        [STORED.searchQuery]: '',
        [STORED.selectedTag]: '',
        [STORED.showFavoritesOnly]: 'true',
      }),
      KNOWN_TAGS
    );

    expect(store.restore()).toEqual({ ...DEFAULTS, showFavoritesOnly: true });
  });

  test('round-trips a saved view, also through a new store on the same storage', () => {
    const storage = createMemoryStorage();
    const store = createHomeViewStateStore(storage, KNOWN_TAGS);

    store.save(BUSY_VIEW);

    expect(store.restore()).toEqual(BUSY_VIEW);
    expect(createHomeViewStateStore(storage, KNOWN_TAGS).restore()).toEqual(BUSY_VIEW);
  });

  test('stores each value in the format open tabs already use', () => {
    const storage = createMemoryStorage();
    const store = createHomeViewStateStore(storage, KNOWN_TAGS);

    store.save(BUSY_VIEW);
    expect(storage.getItem(STORED.searchQuery)).toBe('json');
    expect(storage.getItem(STORED.selectedTag)).toBe('text-tools');
    expect(storage.getItem(STORED.showFavoritesOnly)).toBe('true');
    expect(storage.getItem(STORED.scrollY)).toBe('640');

    store.save(DEFAULTS);
    expect(storage.getItem(STORED.searchQuery)).toBe('');
    expect(storage.getItem(STORED.selectedTag)).toBe('');
    expect(storage.getItem(STORED.showFavoritesOnly)).toBe('false');
    expect(storage.getItem(STORED.scrollY)).toBe('0');
  });

  test('saves the values it is given and leaves the others as they are', () => {
    const storage = createMemoryStorage(BUSY_STORAGE);
    const store = createHomeViewStateStore(storage, KNOWN_TAGS);

    store.save({ scrollY: 300 });
    expect(store.restore()).toEqual({ ...BUSY_VIEW, scrollY: 300 });

    store.save({ searchQuery: '', scrollY: 0 });
    expect(store.restore()).toEqual({ ...BUSY_VIEW, searchQuery: '', scrollY: 0 });

    store.save({ selectedTag: null });
    expect(store.restore()).toEqual({
      searchQuery: '',
      selectedTag: null,
      showFavoritesOnly: true,
      scrollY: 0,
    });

    store.save({});
    expect(storage.getItem(STORED.showFavoritesOnly)).toBe('true');
  });

  test('keeps a scroll offset as whole pixels from the top', () => {
    const storage = createMemoryStorage();
    const store = createHomeViewStateStore(storage, KNOWN_TAGS);

    store.save({ scrollY: 123.9 });
    expect(storage.getItem(STORED.scrollY)).toBe('123');
    expect(store.restore().scrollY).toBe(123);

    for (const offset of [-5, Number.NaN, Number.POSITIVE_INFINITY, 0]) {
      store.save({ scrollY: 99 });
      store.save({ scrollY: offset });
      expect(store.restore().scrollY, String(offset)).toBe(0);
    }
  });
});

test.describe('home view state: unusable stored values', () => {
  test('ignores a stored tag that is not one of the known tags', () => {
    const unknown = [
      'no-such-tag',
      'Text-Tools',
      ' text-tools',
      'text-tools ',
      'null',
      // Names every object has; a lookup in a plain record would find them
      'constructor',
      'toString',
      '__proto__',
    ];

    for (const raw of unknown) {
      const store = createHomeViewStateStore(
        createMemoryStorage({ ...BUSY_STORAGE, [STORED.selectedTag]: raw }),
        KNOWN_TAGS
      );

      expect(store.restore(), raw).toEqual({ ...BUSY_VIEW, selectedTag: null });
    }
  });

  test('ignores a stored tag that has left the taxonomy', () => {
    const storage = createMemoryStorage({ [STORED.selectedTag]: 'security' });

    expect(createHomeViewStateStore(storage, KNOWN_TAGS).restore().selectedTag).toBe('security');
    expect(createHomeViewStateStore(storage, ['converters']).restore().selectedTag).toBeNull();
    expect(createHomeViewStateStore(storage, []).restore().selectedTag).toBeNull();
  });

  test('reads anything but "true" as favorites-only off', () => {
    for (const raw of ['false', '', 'TRUE', 'True', '1', 'yes', ' true']) {
      const store = createHomeViewStateStore(
        createMemoryStorage({ ...BUSY_STORAGE, [STORED.showFavoritesOnly]: raw }),
        KNOWN_TAGS
      );

      expect(store.restore(), JSON.stringify(raw)).toEqual({
        ...BUSY_VIEW,
        showFavoritesOnly: false,
      });
    }
  });

  test('reads an unusable scroll offset as the top of the page', () => {
    for (const raw of ['', 'abc', 'NaN', '-40', '-0.5', '0', 'Infinity', '-Infinity', 'px12']) {
      const store = createHomeViewStateStore(
        createMemoryStorage({ ...BUSY_STORAGE, [STORED.scrollY]: raw }),
        KNOWN_TAGS
      );

      expect(store.restore(), JSON.stringify(raw)).toEqual({ ...BUSY_VIEW, scrollY: 0 });
    }
  });

  test('falls back value by value when everything stored is unusable', () => {
    const store = createHomeViewStateStore(
      createMemoryStorage({
        [STORED.selectedTag]: 'no-such-tag',
        [STORED.showFavoritesOnly]: 'maybe',
        [STORED.scrollY]: 'far',
      }),
      KNOWN_TAGS
    );

    expect(store.restore()).toEqual(DEFAULTS);
  });
});

test.describe('home view state: reset', () => {
  test('clears all four values, the selected tag included', () => {
    const storage = createMemoryStorage(BUSY_STORAGE);
    const store = createHomeViewStateStore(storage, KNOWN_TAGS);
    expect(store.restore()).toEqual(BUSY_VIEW);

    store.reset();

    expect(storage.getItem('home-selected-tag')).toBeNull();
    for (const key of ALL_STORED_KEYS) {
      expect(storage.getItem(key), key).toBeNull();
    }
    expect(store.restore()).toEqual(DEFAULTS);
  });

  test('leaves other keys in the storage alone', () => {
    const storage = createMemoryStorage({
      ...BUSY_STORAGE,
      'home-selected-category': 'converters',
      'some-tool:draft': 'text',
    });

    createHomeViewStateStore(storage, KNOWN_TAGS).reset();

    expect(storage.getItem('home-selected-category')).toBe('converters');
    expect(storage.getItem('some-tool:draft')).toBe('text');
  });

  test('tells its listeners once the stored view is gone', () => {
    const store = createHomeViewStateStore(createMemoryStorage(BUSY_STORAGE), KNOWN_TAGS);
    const seen: HomeViewState[] = [];
    store.onReset(() => seen.push(store.restore()));

    store.reset();

    expect(seen).toEqual([DEFAULTS]);
  });

  test('tells every listener on every reset, until it unsubscribes', () => {
    const store = createHomeViewStateStore(createMemoryStorage(), KNOWN_TAGS);
    const calls: string[] = [];
    const stopFirst = store.onReset(() => calls.push('first'));
    store.onReset(() => calls.push('second'));

    store.reset();
    expect(calls).toEqual(['first', 'second']);

    stopFirst();
    stopFirst();
    store.reset();
    expect(calls).toEqual(['first', 'second', 'second']);
  });

  test('counts the same function subscribed twice as two listeners', () => {
    const store = createHomeViewStateStore(createMemoryStorage(), KNOWN_TAGS);
    let calls = 0;
    const listener = () => calls++;
    const stopOne = store.onReset(listener);
    store.onReset(listener);

    store.reset();
    expect(calls).toBe(2);

    stopOne();
    store.reset();
    expect(calls).toBe(3);
  });

  test('does not tell listeners about saves', () => {
    const store = createHomeViewStateStore(createMemoryStorage(), KNOWN_TAGS);
    let calls = 0;
    store.onReset(() => calls++);

    store.save(BUSY_VIEW);
    store.showTag('security');

    expect(calls).toBe(0);
  });

  test('a save after a reset starts again from the defaults', () => {
    const store = createHomeViewStateStore(createMemoryStorage(BUSY_STORAGE), KNOWN_TAGS);

    store.reset();
    store.save({ searchQuery: 'base64' });

    expect(store.restore()).toEqual({ ...DEFAULTS, searchQuery: 'base64' });
  });
});

test.describe('home view state: sending the user to a tag', () => {
  test('replaces the stored view with the tag alone, from the top of the page', () => {
    const storage = createMemoryStorage({
      [STORED.searchQuery]: 'json',
      [STORED.selectedTag]: 'text-tools',
      [STORED.showFavoritesOnly]: 'true',
      [STORED.scrollY]: '640',
    });
    const store = createHomeViewStateStore(storage, KNOWN_TAGS);

    store.showTag('security');

    expect(store.restore()).toEqual({
      searchQuery: '',
      selectedTag: 'security',
      showFavoritesOnly: false,
      scrollY: 0,
    });
  });

  test('stores what the not-found page used to write by hand', () => {
    const storage = createMemoryStorage();

    createHomeViewStateStore(storage, KNOWN_TAGS).showTag('converters');

    expect(storage.getItem('home-selected-tag')).toBe('converters');
    expect(storage.getItem('home-search-query')).toBe('');
    expect(storage.getItem('home-favorites-only')).toBe('false');
    expect(storage.getItem('home-scroll-y')).toBe('0');
  });
});

test.describe('home view state: browser storage', () => {
  test('reads and writes sessionStorage, not localStorage', () => {
    const fakeWindow = createFakeWindow({ [STORED.searchQuery]: 'json' });

    withWindow(fakeWindow, () => {
      const store = createHomeViewStateStore(createSessionStorage(), KNOWN_TAGS);
      expect(store.restore()).toEqual({ ...DEFAULTS, searchQuery: 'json' });

      store.save({ selectedTag: 'security', scrollY: 250 });
      expect(fakeWindow.sessionItems.get(STORED.selectedTag)).toBe('security');
      expect(fakeWindow.sessionItems.get(STORED.scrollY)).toBe('250');

      store.reset();
      expect([...fakeWindow.sessionItems.keys()]).toEqual([]);
      expect([...fakeWindow.localItems.keys()]).toEqual([]);
    });
  });

  test('finds nothing and drops writes when there is no window', () => {
    expect(typeof window).toBe('undefined');
    const store = createHomeViewStateStore(createSessionStorage(), KNOWN_TAGS);
    let resets = 0;
    store.onReset(() => resets++);

    store.save(BUSY_VIEW);
    store.showTag('security');
    expect(store.restore()).toEqual(DEFAULTS);

    store.reset();
    expect(resets).toBe(1);
  });

  test('carries on when the browser blocks storage', () => {
    const blocked = () => {
      throw new Error('The operation is insecure.');
    };
    const noAccess = {
      get sessionStorage(): Storage {
        return blocked();
      },
    };
    const noOperations = {
      sessionStorage: { getItem: blocked, setItem: blocked, removeItem: blocked },
    };

    for (const fakeWindow of [noAccess, noOperations]) {
      withWindow(fakeWindow, () => {
        const store = createHomeViewStateStore(createSessionStorage(), KNOWN_TAGS);
        let resets = 0;
        store.onReset(() => resets++);

        store.save(BUSY_VIEW);
        store.showTag('security');
        expect(store.restore()).toEqual(DEFAULTS);

        // The page on screen is still told to go back to the defaults
        store.reset();
        expect(resets).toBe(1);
      });
    }
  });
});

test.describe("home view state: the app's store", () => {
  test('is safe to load and call during server rendering', () => {
    expect(typeof window).toBe('undefined');

    expect(homeViewState.restore()).toEqual(DEFAULTS);
    homeViewState.save({ searchQuery: 'json' });
    homeViewState.showTag('converters');
    homeViewState.reset();
    expect(homeViewState.restore()).toEqual(DEFAULTS);
  });

  test('accepts every tag of the app', () => {
    const fakeWindow = createFakeWindow();

    withWindow(fakeWindow, () => {
      homeViewState.showTag('pdf-tools');
      expect(homeViewState.restore().selectedTag).toBe('pdf-tools');

      fakeWindow.sessionItems.set(STORED.selectedTag, 'no-such-tag');
      expect(homeViewState.restore().selectedTag).toBeNull();
    });
  });

  test('renders the defaults first even when a view is stored', () => {
    // Restoring during render would make the client's first render differ
    // from the static HTML. The stored view is applied after mount instead.
    const fakeWindow = createFakeWindow({
      [STORED.searchQuery]: 'json',
      [STORED.selectedTag]: 'text-tools',
      [STORED.showFavoritesOnly]: 'true',
      [STORED.scrollY]: '640',
    });

    function Probe() {
      const view = useHomeViewState();
      return createElement('output', {
        'data-query': view.searchQuery,
        'data-tag': String(view.selectedTag),
        'data-favorites': String(view.showFavoritesOnly),
      });
    }

    withWindow(fakeWindow, () => {
      expect(homeViewState.restore()).toEqual({
        searchQuery: 'json',
        selectedTag: 'text-tools',
        showFavoritesOnly: true,
        scrollY: 640,
      });
      expect(renderToStaticMarkup(createElement(Probe))).toBe(
        '<output data-query="" data-tag="null" data-favorites="false"></output>'
      );
    });
  });
});

const ARROWS: ArrowKey[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const COLUMN_COUNTS = [1, 2, 3, 4];

const move = (current: number, key: ArrowKey, sections: number[], columns: number) =>
  moveSelection(current, key, { sections, columns });

// The rules the home page followed while it only knew one flat grid. The
// search results and the favorites list are still one grid and must keep them.
function moveInFlatGrid(current: number, key: ArrowKey, count: number, columns: number): number {
  if (current === -1) return key === 'ArrowDown' ? 0 : -1;

  switch (key) {
    case 'ArrowDown':
      return Math.min(current + columns, count - 1);
    case 'ArrowUp':
      return current - columns < 0 ? -1 : current - columns;
    case 'ArrowRight':
      return Math.min(current + 1, count - 1);
    case 'ArrowLeft':
      return current - 1 < 0 ? -1 : current - 1;
  }
}

test.describe('grid navigation: one grid', () => {
  test('uses -1 for no selection', () => {
    expect(NO_SELECTION).toBe(-1);
  });

  for (const columns of COLUMN_COUNTS) {
    test(`${columns} column(s): only Down enters the cards, at the first one`, () => {
      expect(move(NO_SELECTION, 'ArrowDown', [10], columns)).toBe(0);
      expect(move(NO_SELECTION, 'ArrowUp', [10], columns)).toBe(NO_SELECTION);
      expect(move(NO_SELECTION, 'ArrowLeft', [10], columns)).toBe(NO_SELECTION);
      expect(move(NO_SELECTION, 'ArrowRight', [10], columns)).toBe(NO_SELECTION);
    });

    test(`${columns} column(s): Left and Right step in reading order and stop at the ends`, () => {
      expect(move(0, 'ArrowLeft', [10], columns)).toBe(NO_SELECTION);
      expect(move(0, 'ArrowRight', [10], columns)).toBe(1);
      expect(move(9, 'ArrowRight', [10], columns)).toBe(9);
      expect(move(9, 'ArrowLeft', [10], columns)).toBe(8);

      // Across the end of a row
      expect(move(columns - 1, 'ArrowRight', [10], columns)).toBe(columns);
      expect(move(columns, 'ArrowLeft', [10], columns)).toBe(columns - 1);
    });

    test(`${columns} column(s): Up leaves the cards from anywhere in the first row`, () => {
      for (let card = 0; card < columns; card++) {
        expect(move(card, 'ArrowUp', [10], columns), `card ${card}`).toBe(NO_SELECTION);
      }
      expect(move(columns, 'ArrowUp', [10], columns)).toBe(0);
      expect(move(9, 'ArrowUp', [10], columns)).toBe(9 - columns);
    });

    test(`${columns} column(s): Down keeps the column and ends on the last card`, () => {
      expect(move(0, 'ArrowDown', [10], columns)).toBe(columns);
      expect(move(9 - columns, 'ArrowDown', [10], columns)).toBe(9);
      // Nothing straight below: the last card, also from the last card itself
      expect(move(8, 'ArrowDown', [10], columns)).toBe(9);
      expect(move(9, 'ArrowDown', [10], columns)).toBe(9);
    });

    test(`${columns} column(s): moves exactly as the flat grid always did`, () => {
      for (let count = 1; count <= 13; count++) {
        for (let current = -1; current < count; current++) {
          for (const key of ARROWS) {
            expect(
              move(current, key, [count], columns),
              `${key} from ${current} of ${count}`
            ).toBe(moveInFlatGrid(current, key, count, columns));
          }
        }
      }
    });
  }

  test('3 columns, 8 cards: a short last row', () => {
    // 0 1 2
    // 3 4 5
    // 6 7
    expect(move(1, 'ArrowDown', [8], 3)).toBe(4);
    expect(move(4, 'ArrowDown', [8], 3)).toBe(7);
    expect(move(5, 'ArrowDown', [8], 3)).toBe(7);
    expect(move(6, 'ArrowDown', [8], 3)).toBe(7);
    expect(move(7, 'ArrowUp', [8], 3)).toBe(4);
    expect(move(6, 'ArrowUp', [8], 3)).toBe(3);
    expect(move(2, 'ArrowRight', [8], 3)).toBe(3);
    expect(move(6, 'ArrowLeft', [8], 3)).toBe(5);
  });

  test('1 column: Down and Right both step to the next card', () => {
    expect(move(2, 'ArrowDown', [5], 1)).toBe(3);
    expect(move(2, 'ArrowRight', [5], 1)).toBe(3);
    expect(move(2, 'ArrowUp', [5], 1)).toBe(1);
    expect(move(2, 'ArrowLeft', [5], 1)).toBe(1);
    expect(move(0, 'ArrowUp', [5], 1)).toBe(NO_SELECTION);
    expect(move(4, 'ArrowDown', [5], 1)).toBe(4);
  });

  test('a single card', () => {
    for (const columns of COLUMN_COUNTS) {
      expect(move(0, 'ArrowDown', [1], columns)).toBe(0);
      expect(move(0, 'ArrowRight', [1], columns)).toBe(0);
      expect(move(0, 'ArrowUp', [1], columns)).toBe(NO_SELECTION);
      expect(move(0, 'ArrowLeft', [1], columns)).toBe(NO_SELECTION);
    }
  });
});

test.describe('grid navigation: sections', () => {
  // The Text Tools tag on a wide screen: Converters, Text Tools, PDF Tools.
  // A tool with several tags is a card in each of its sections.
  //
  //  0  1  2
  //
  //  3  4  5  6
  //  7  8  9 10
  // 11
  //
  // 12 13
  const SECTIONS = [3, 9, 2];

  test('Down crosses into the next section in the same column', () => {
    expect(move(0, 'ArrowDown', SECTIONS, 4)).toBe(3);
    expect(move(1, 'ArrowDown', SECTIONS, 4)).toBe(4);
    expect(move(2, 'ArrowDown', SECTIONS, 4)).toBe(5);
    expect(move(11, 'ArrowDown', SECTIONS, 4)).toBe(12);
  });

  test('Down inside a section stays in it until its last row', () => {
    expect(move(3, 'ArrowDown', SECTIONS, 4)).toBe(7);
    expect(move(7, 'ArrowDown', SECTIONS, 4)).toBe(11);
    // Nothing straight below in this section: its last card
    expect(move(8, 'ArrowDown', SECTIONS, 4)).toBe(11);
    expect(move(10, 'ArrowDown', SECTIONS, 4)).toBe(11);
  });

  test('Down from the last row of the last section moves to the last card', () => {
    expect(move(12, 'ArrowDown', SECTIONS, 4)).toBe(13);
    expect(move(13, 'ArrowDown', SECTIONS, 4)).toBe(13);
  });

  test('Up crosses into the last row of the section before', () => {
    expect(move(12, 'ArrowUp', SECTIONS, 4)).toBe(11);
    expect(move(3, 'ArrowUp', SECTIONS, 4)).toBe(0);
    expect(move(5, 'ArrowUp', SECTIONS, 4)).toBe(2);
    // That row is shorter than the column asks for: its last card
    expect(move(13, 'ArrowUp', SECTIONS, 4)).toBe(11);
    expect(move(6, 'ArrowUp', SECTIONS, 4)).toBe(2);
  });

  test('Up inside a section moves one row, and leaves the cards from the top', () => {
    expect(move(11, 'ArrowUp', SECTIONS, 4)).toBe(7);
    expect(move(9, 'ArrowUp', SECTIONS, 4)).toBe(5);
    expect(move(0, 'ArrowUp', SECTIONS, 4)).toBe(NO_SELECTION);
    expect(move(2, 'ArrowUp', SECTIONS, 4)).toBe(NO_SELECTION);
  });

  test('Left and Right cross sections in reading order', () => {
    expect(move(2, 'ArrowRight', SECTIONS, 4)).toBe(3);
    expect(move(3, 'ArrowLeft', SECTIONS, 4)).toBe(2);
    expect(move(11, 'ArrowRight', SECTIONS, 4)).toBe(12);
    expect(move(12, 'ArrowLeft', SECTIONS, 4)).toBe(11);
    expect(move(13, 'ArrowRight', SECTIONS, 4)).toBe(13);
    expect(move(0, 'ArrowLeft', SECTIONS, 4)).toBe(NO_SELECTION);
  });

  test('Down then Up comes back to the same card between full rows', () => {
    // 0 1      0 1 2
    // 2 3      3 4 5
    //
    // 4 5      6 7 8
    // 6 7      9 10 11
    for (const [sections, columns] of [
      [[4, 4], 2],
      [[6, 6], 3],
    ] as const) {
      const total = sections[0] + sections[1];
      for (let card = 0; card < total - columns; card++) {
        const below = move(card, 'ArrowDown', [...sections], columns);
        expect(below, `Down from ${card}`).toBe(card + columns);
        expect(move(below, 'ArrowUp', [...sections], columns), `Up from ${below}`).toBe(card);
      }
    }
  });

  for (const columns of COLUMN_COUNTS) {
    test(`${columns} column(s): Right walks every card once, in order`, () => {
      const visited: number[] = [];
      let card = move(NO_SELECTION, 'ArrowDown', SECTIONS, columns);
      while (visited.at(-1) !== card) {
        visited.push(card);
        card = move(card, 'ArrowRight', SECTIONS, columns);
      }

      expect(visited).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    });

    test(`${columns} column(s): Down reaches the last card and Up leaves from there`, () => {
      const down: number[] = [];
      let card = move(NO_SELECTION, 'ArrowDown', SECTIONS, columns);
      while (down.at(-1) !== card) {
        down.push(card);
        card = move(card, 'ArrowDown', SECTIONS, columns);
      }
      expect(down[0]).toBe(0);
      expect(down.at(-1)).toBe(13);
      expect(down).toEqual([...down].sort((a, b) => a - b));

      const up: number[] = [];
      while (card !== NO_SELECTION) {
        up.push(card);
        card = move(card, 'ArrowUp', SECTIONS, columns);
      }
      expect(up[0]).toBe(13);
      expect(up).toEqual([...up].sort((a, b) => b - a));
      expect(new Set(up).size).toBe(up.length);
    });

    test(`${columns} column(s): never selects a card that is not there`, () => {
      for (let current = -1; current < 14; current++) {
        for (const key of ARROWS) {
          const next = move(current, key, SECTIONS, columns);
          expect(Number.isInteger(next), `${key} from ${current}`).toBe(true);
          expect(next, `${key} from ${current}`).toBeGreaterThanOrEqual(NO_SELECTION);
          expect(next, `${key} from ${current}`).toBeLessThan(14);
        }
      }
    });
  }

  test('1 column: sections make no difference', () => {
    for (let current = -1; current < 14; current++) {
      for (const key of ARROWS) {
        expect(move(current, key, SECTIONS, 1), `${key} from ${current}`).toBe(
          moveInFlatGrid(current, key, 14, 1)
        );
      }
    }
  });
});

test.describe('grid navigation: unusual input', () => {
  test('selects nothing when there are no cards', () => {
    for (const sections of [[], [0], [0, 0]]) {
      for (const key of ARROWS) {
        expect(move(NO_SELECTION, key, sections, 3)).toBe(NO_SELECTION);
        expect(move(0, key, sections, 3)).toBe(NO_SELECTION);
      }
    }
  });

  test('skips sections without cards', () => {
    for (let current = -1; current < 5; current++) {
      for (const key of ARROWS) {
        expect(move(current, key, [0, 2, 0, 3, 0], 2), `${key} from ${current}`).toBe(
          move(current, key, [2, 3], 2)
        );
      }
    }
    // 0 1
    //
    // 2 3
    // 4
    expect(move(1, 'ArrowDown', [0, 2, 0, 3, 0], 2)).toBe(3);
    expect(move(2, 'ArrowUp', [0, 2, 0, 3, 0], 2)).toBe(0);
  });

  test('treats a selection that is not a card as no selection', () => {
    for (const current of [5, 99, -2, 1.5, Number.NaN]) {
      expect(move(current, 'ArrowDown', [5], 2), String(current)).toBe(0);
      expect(move(current, 'ArrowUp', [5], 2), String(current)).toBe(NO_SELECTION);
      expect(move(current, 'ArrowLeft', [5], 2), String(current)).toBe(NO_SELECTION);
      expect(move(current, 'ArrowRight', [5], 2), String(current)).toBe(NO_SELECTION);
    }
  });

  test('treats a column count below one as one column', () => {
    for (const columns of [0, -3, Number.NaN, 0.4]) {
      expect(move(2, 'ArrowDown', [6], columns), String(columns)).toBe(3);
      expect(move(2, 'ArrowUp', [6], columns), String(columns)).toBe(1);
    }
    expect(move(1, 'ArrowDown', [6], 2.9)).toBe(3);
  });
});

test.describe('grid navigation: reading the columns off the page', () => {
  test('counts the column sizes the browser reports for a rendered grid', () => {
    expect(countGridColumns('1200px')).toBe(1);
    expect(countGridColumns('592px 592px')).toBe(2);
    expect(countGridColumns('389.328px 389.328px 389.328px')).toBe(3);
    expect(countGridColumns('288px 288px 288px 288px')).toBe(4);
    expect(countGridColumns('300px 300px 300px 300px 300px 300px')).toBe(6);
    expect(countGridColumns('  100px   100px  ')).toBe(2);
  });

  test('counts a track list the browser left unresolved', () => {
    expect(countGridColumns('repeat(4, minmax(0px, 1fr))')).toBe(4);
    expect(countGridColumns('repeat(2, 100px 200px)')).toBe(4);
    expect(countGridColumns('100px repeat(3, 1fr) 100px')).toBe(5);
    expect(countGridColumns('minmax(0px, 1fr) minmax(0px, 1fr)')).toBe(2);
  });

  test('does not count named lines', () => {
    expect(countGridColumns('[full-start] 100px [content-start content-end] 200px [full-end]')).toBe(2);
  });

  test('falls back to one column when the value names none', () => {
    expect(countGridColumns('none')).toBe(1);
    expect(countGridColumns('')).toBe(1);
    expect(countGridColumns('   ')).toBe(1);
  });

  test('knows the four arrow keys', () => {
    for (const key of ARROWS) {
      expect(isArrowKey(key), key).toBe(true);
    }
    for (const key of ['Enter', 'Escape', 'Tab', 'a', ' ', 'arrowup', 'Up', '']) {
      expect(isArrowKey(key), JSON.stringify(key)).toBe(false);
    }
  });
});
