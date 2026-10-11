import { test, expect } from '@playwright/test';
import {
  APP_COMMANDS,
  APP_COMMANDS_IN_ORDER,
  PALETTE_SHORTCUTS,
  detectPlatform,
  filterCommands,
  findCommandByShortcut,
  isTypingTarget,
  matchesShortcut,
  shortcutKeys,
  shortcutLabel,
  type CommandActions,
  type CommandState,
  type Platform,
  type Shortcut,
  type ShortcutEvent,
} from '@/lib/commands';
import { DEFAULT_PREFERENCES } from '@/lib/preferences/store';

const PLATFORMS: Platform[] = ['mac', 'other'];

// A key press with only the named modifiers held.
function press(key: string, held: Partial<Omit<ShortcutEvent, 'key'>> = {}): ShortcutEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...held };
}

function stateWith(changes: Partial<CommandState> = {}): CommandState {
  return { ...DEFAULT_PREFERENCES, ...changes };
}

// Stand-in for the app: records what the commands ask it to do.
function recordActions() {
  const calls: unknown[][] = [];
  const actions: CommandActions = {
    toggleTheme: () => calls.push(['toggleTheme']),
    setCompactMode: (compactMode) => calls.push(['setCompactMode', compactMode]),
    setFullWidth: (fullWidth) => calls.push(['setFullWidth', fullWidth]),
    clearRecentTools: () => calls.push(['clearRecentTools']),
    clearFavorites: () => calls.push(['clearFavorites']),
  };
  return { calls, actions };
}

// Stand-in for the focused element.
function element(tagName: string, attributes: Record<string, string> = {}) {
  return { tagName, getAttribute: (name: string) => attributes[name] ?? null };
}

function ids(commands: readonly { id: string }[]): string[] {
  return commands.map((command) => command.id);
}

test.describe('shortcut matching', () => {
  const modShiftDelete: Shortcut = { key: 'Delete', mod: true, shift: true };

  test('takes Ctrl as the command modifier off macOS', () => {
    expect(
      matchesShortcut(press('Delete', { ctrlKey: true, shiftKey: true }), modShiftDelete, 'other')
    ).toBe(true);
    expect(
      matchesShortcut(press('Delete', { metaKey: true, shiftKey: true }), modShiftDelete, 'other')
    ).toBe(false);
  });

  test('takes Cmd as the command modifier on macOS', () => {
    expect(
      matchesShortcut(press('Delete', { metaKey: true, shiftKey: true }), modShiftDelete, 'mac')
    ).toBe(true);
    expect(
      matchesShortcut(press('Delete', { ctrlKey: true, shiftKey: true }), modShiftDelete, 'mac')
    ).toBe(false);
  });

  test('accepts Ctrl or Cmd on every platform when the modifier is "either"', () => {
    const shortcut: Shortcut = { key: 'k', mod: 'either' };

    for (const platform of PLATFORMS) {
      expect(matchesShortcut(press('k', { ctrlKey: true }), shortcut, platform), platform).toBe(true);
      expect(matchesShortcut(press('k', { metaKey: true }), shortcut, platform), platform).toBe(true);
      expect(matchesShortcut(press('k'), shortcut, platform), platform).toBe(false);
    }
  });

  test('needs every modifier that is set', () => {
    expect(matchesShortcut(press('Delete', { ctrlKey: true }), modShiftDelete, 'other')).toBe(false);
    expect(matchesShortcut(press('Delete', { shiftKey: true }), modShiftDelete, 'other')).toBe(false);
    expect(matchesShortcut(press('c'), { key: 'c', alt: true }, 'other')).toBe(false);
  });

  test('ignores a modifier that is not set', () => {
    const altC: Shortcut = { key: 'c', alt: true };

    for (const platform of PLATFORMS) {
      expect(matchesShortcut(press('c', { altKey: true }), altC, platform), platform).toBe(true);
      expect(
        matchesShortcut(
          press('c', { altKey: true, ctrlKey: true, metaKey: true, shiftKey: true }),
          altC,
          platform
        ),
        platform
      ).toBe(true);
    }
  });

  test('ignores letter case', () => {
    // Caps Lock and Shift both turn the reported key into a capital
    expect(matchesShortcut(press('C', { altKey: true }), { key: 'c', alt: true }, 'other')).toBe(true);
    expect(matchesShortcut(press('delete'), { key: 'Delete' }, 'other')).toBe(true);
  });

  test('matches letter case exactly when the shortcut is case sensitive', () => {
    const shortcut: Shortcut = { key: 'k', caseSensitive: true };

    expect(matchesShortcut(press('k'), shortcut, 'other')).toBe(true);
    expect(matchesShortcut(press('k', { shiftKey: true }), shortcut, 'other')).toBe(true);
    expect(matchesShortcut(press('K'), shortcut, 'other')).toBe(false);
    expect(matchesShortcut(press('K', { shiftKey: true }), shortcut, 'other')).toBe(false);
  });

  test('does not match another key', () => {
    expect(matchesShortcut(press('x', { altKey: true }), { key: 'c', alt: true }, 'other')).toBe(false);
    expect(matchesShortcut(press('Backspace'), { key: 'Delete' }, 'other')).toBe(false);
  });

  test('does not match an event that carries no key', () => {
    // Chrome's autofill dispatches such keydown events
    const keyless = { ...press('k', { ctrlKey: true }), key: undefined } as unknown as ShortcutEvent;

    expect(matchesShortcut(keyless, PALETTE_SHORTCUTS.toggle, 'other')).toBe(false);
  });
});

test.describe('palette shortcuts', () => {
  test('toggle the palette with Ctrl+K or Cmd+K on every platform', () => {
    for (const platform of PLATFORMS) {
      expect(
        matchesShortcut(press('k', { ctrlKey: true }), PALETTE_SHORTCUTS.toggle, platform),
        platform
      ).toBe(true);
      expect(
        matchesShortcut(press('k', { metaKey: true }), PALETTE_SHORTCUTS.toggle, platform),
        platform
      ).toBe(true);
    }
  });

  test('leave a capital K and a bare k alone', () => {
    for (const platform of PLATFORMS) {
      // Ctrl+Shift+K
      expect(
        matchesShortcut(
          press('K', { ctrlKey: true, shiftKey: true }),
          PALETTE_SHORTCUTS.toggle,
          platform
        ),
        platform
      ).toBe(false);
      // Ctrl+K arriving as a capital without Shift
      expect(
        matchesShortcut(press('K', { ctrlKey: true }), PALETTE_SHORTCUTS.toggle, platform),
        platform
      ).toBe(false);
      expect(matchesShortcut(press('k'), PALETTE_SHORTCUTS.toggle, platform), platform).toBe(false);
    }
  });

  test('toggle the palette whatever else is held', () => {
    const everything = press('k', { ctrlKey: true, metaKey: true, altKey: true, shiftKey: true });

    for (const platform of PLATFORMS) {
      expect(matchesShortcut(everything, PALETTE_SHORTCUTS.toggle, platform), platform).toBe(true);
    }
  });

  test('open the highlighted tool in a new tab with the command modifier and Enter', () => {
    const { openInNewTab } = PALETTE_SHORTCUTS;

    expect(matchesShortcut(press('Enter', { ctrlKey: true }), openInNewTab, 'other')).toBe(true);
    expect(matchesShortcut(press('Enter', { metaKey: true }), openInNewTab, 'mac')).toBe(true);
    expect(matchesShortcut(press('Enter', { ctrlKey: true }), openInNewTab, 'mac')).toBe(false);
    expect(matchesShortcut(press('Enter'), openInNewTab, 'other')).toBe(false);
  });

  test('toggle the favorite with the command modifier, Shift and F', () => {
    const { toggleFavorite } = PALETTE_SHORTCUTS;

    expect(
      matchesShortcut(press('F', { ctrlKey: true, shiftKey: true }), toggleFavorite, 'other')
    ).toBe(true);
    expect(
      matchesShortcut(press('F', { metaKey: true, shiftKey: true }), toggleFavorite, 'mac')
    ).toBe(true);
    expect(matchesShortcut(press('f', { ctrlKey: true }), toggleFavorite, 'other')).toBe(false);
    expect(
      matchesShortcut(press('F', { ctrlKey: true, shiftKey: true }), toggleFavorite, 'mac')
    ).toBe(false);
  });
});

test.describe('shortcut labels', () => {
  test('name the command modifier per platform', () => {
    expect(shortcutKeys(PALETTE_SHORTCUTS.toggle, 'other')).toEqual(['Ctrl', 'K']);
    expect(shortcutKeys(PALETTE_SHORTCUTS.toggle, 'mac')).toEqual(['⌘', 'K']);
  });

  test('read as the palette footer shows them', () => {
    const clearRecents = APP_COMMANDS.clearRecentTools.shortcut;

    expect(shortcutLabel(PALETTE_SHORTCUTS.openInNewTab, 'other')).toBe('Ctrl+↵');
    expect(shortcutLabel(PALETTE_SHORTCUTS.openInNewTab, 'mac')).toBe('⌘+↵');
    expect(shortcutLabel(PALETTE_SHORTCUTS.toggleFavorite, 'other')).toBe('Ctrl+⇧+F');
    expect(shortcutLabel(PALETTE_SHORTCUTS.toggleFavorite, 'mac')).toBe('⌘+⇧+F');
    expect(shortcutLabel(clearRecents, 'other')).toBe('Ctrl+⇧+Del');
    expect(shortcutLabel(clearRecents, 'mac')).toBe('⌘+⇧+Del');
  });

  test('read as the settings dialog shows them, the same on every platform', () => {
    for (const platform of PLATFORMS) {
      expect(shortcutLabel(APP_COMMANDS.toggleCompactMode.shortcut, platform, ' + ')).toBe('Alt + C');
      expect(shortcutLabel(APP_COMMANDS.toggleFullWidth.shortcut, platform, ' + ')).toBe('Alt + W');
    }
  });

  test('list modifiers first and leave out the ones that are not set', () => {
    const everything: Shortcut = { key: 'x', mod: true, alt: true, shift: true };

    expect(shortcutKeys(everything, 'other')).toEqual(['Ctrl', 'Alt', '⇧', 'X']);
    expect(shortcutKeys({ key: 'x', mod: false, alt: false, shift: false }, 'other')).toEqual(['X']);
    expect(shortcutKeys({ key: 'Escape' }, 'mac')).toEqual(['Escape']);
  });
});

test.describe('platform detection', () => {
  test('reads Apple devices as mac and everything else as other', () => {
    const apple = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    ];
    const others = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36',
      '',
    ];

    for (const userAgent of apple) expect(detectPlatform(userAgent), userAgent).toBe('mac');
    for (const userAgent of others) expect(detectPlatform(userAgent), userAgent).toBe('other');
  });

  test('is other when there is no browser, as during server rendering', () => {
    expect(typeof window).toBe('undefined');
    expect(detectPlatform()).toBe('other');
  });

  test("defaults to this browser's user agent", () => {
    const scope = globalThis as { window?: unknown };
    scope.window = { navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } };
    try {
      expect(detectPlatform()).toBe('mac');
    } finally {
      delete scope.window;
    }
  });
});

test.describe('typing target', () => {
  test('is an input, a textarea or an editable element', () => {
    expect(isTypingTarget(element('INPUT'))).toBe(true);
    expect(isTypingTarget(element('TEXTAREA'))).toBe(true);
    expect(isTypingTarget(element('DIV', { contenteditable: 'true' }))).toBe(true);
  });

  test('is not anything else, or nothing at all', () => {
    expect(isTypingTarget(element('BODY'))).toBe(false);
    expect(isTypingTarget(element('BUTTON'))).toBe(false);
    expect(isTypingTarget(element('DIV', { contenteditable: 'false' }))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

test.describe('app commands', () => {
  test('are the five commands, in the order the palette lists them', () => {
    expect(ids(APP_COMMANDS_IN_ORDER)).toEqual([
      'toggleTheme',
      'toggleCompactMode',
      'toggleFullWidth',
      'clearRecentTools',
      'clearFavorites',
    ]);
  });

  test('each have an id of their own, under which they are filed', () => {
    const commandIds = ids(APP_COMMANDS_IN_ORDER);
    expect(new Set(commandIds).size).toBe(commandIds.length);

    for (const [key, command] of Object.entries(APP_COMMANDS)) {
      expect(command.id, key).toBe(key);
    }
  });

  test('each have a label, a status, an icon, keywords and an action', () => {
    const states = [
      stateWith(),
      stateWith({
        theme: 'light',
        compactMode: true,
        fullWidth: true,
        favorites: ['json-formatter'],
        recentTools: ['json-formatter', 'base64-converter'],
      }),
    ];

    for (const command of APP_COMMANDS_IN_ORDER) {
      for (const state of states) {
        expect(command.label(state).trim(), `${command.id}.label`).not.toBe('');
        expect(command.status(state).trim(), `${command.id}.status`).not.toBe('');
        expect(command.icon(state), `${command.id}.icon`).toBeTruthy();
      }
      expect(command.keywords.length, `${command.id}.keywords`).toBeGreaterThan(0);
      expect(typeof command.run, `${command.id}.run`).toBe('function');
    }
  });

  test('are labelled by what they would do next', () => {
    const { toggleTheme, toggleCompactMode, toggleFullWidth } = APP_COMMANDS;
    const off = stateWith({ theme: 'light', compactMode: false, fullWidth: false });
    const on = stateWith({ theme: 'dark', compactMode: true, fullWidth: true });

    expect(toggleTheme.label(off)).toBe('Switch to Dark Mode');
    expect(toggleTheme.label(on)).toBe('Switch to Light Mode');
    expect(toggleTheme.status(off)).toBe('Light');
    expect(toggleTheme.status(on)).toBe('Dark');
    expect(toggleTheme.icon(off)).not.toBe(toggleTheme.icon(on));

    expect(toggleCompactMode.label(off)).toBe('Enable Compact Mode');
    expect(toggleCompactMode.label(on)).toBe('Disable Compact Mode');
    expect(toggleCompactMode.status(off)).toBe('Disabled');
    expect(toggleCompactMode.status(on)).toBe('Enabled');

    expect(toggleFullWidth.label(off)).toBe('Enable Full Width Mode');
    expect(toggleFullWidth.label(on)).toBe('Disable Full Width Mode');
    expect(toggleFullWidth.status(off)).toBe('Disabled');
    expect(toggleFullWidth.status(on)).toBe('Enabled');
  });

  test('show how many tools a clear command would remove', () => {
    const { clearRecentTools, clearFavorites } = APP_COMMANDS;
    const empty = stateWith();
    const filled = stateWith({ favorites: ['a'], recentTools: ['a', 'b', 'c'] });

    expect(clearRecentTools.label(empty)).toBe('Clear Recent Tools');
    expect(clearRecentTools.status(empty)).toBe('Empty');
    expect(clearRecentTools.status(filled)).toBe('3 tools');

    expect(clearFavorites.label(empty)).toBe('Clear Favorites');
    expect(clearFavorites.status(empty)).toBe('Empty');
    expect(clearFavorites.status(filled)).toBe('1 tools');
  });

  test('toggling the theme asks the app to and confirms the new theme', () => {
    const dark = recordActions();
    expect(APP_COMMANDS.toggleTheme.run(stateWith({ theme: 'dark' }), dark.actions)).toBe(
      'Switched to light mode'
    );
    expect(dark.calls).toEqual([['toggleTheme']]);

    const light = recordActions();
    expect(APP_COMMANDS.toggleTheme.run(stateWith({ theme: 'light' }), light.actions)).toBe(
      'Switched to dark mode'
    );
    expect(light.calls).toEqual([['toggleTheme']]);
  });

  test('toggling compact mode flips it and confirms the new setting', () => {
    const { toggleCompactMode } = APP_COMMANDS;

    const turnOn = recordActions();
    expect(toggleCompactMode.run(stateWith({ compactMode: false }), turnOn.actions)).toBe(
      'Compact mode enabled'
    );
    expect(turnOn.calls).toEqual([['setCompactMode', true]]);

    const turnOff = recordActions();
    expect(toggleCompactMode.run(stateWith({ compactMode: true }), turnOff.actions)).toBe(
      'Compact mode disabled'
    );
    expect(turnOff.calls).toEqual([['setCompactMode', false]]);
  });

  test('toggling full width flips it and confirms the new setting', () => {
    const { toggleFullWidth } = APP_COMMANDS;

    const turnOn = recordActions();
    expect(toggleFullWidth.run(stateWith({ fullWidth: false }), turnOn.actions)).toBe(
      'Full width mode enabled'
    );
    expect(turnOn.calls).toEqual([['setFullWidth', true]]);

    const turnOff = recordActions();
    expect(toggleFullWidth.run(stateWith({ fullWidth: true }), turnOff.actions)).toBe(
      'Full width mode disabled'
    );
    expect(turnOff.calls).toEqual([['setFullWidth', false]]);
  });

  test('clearing asks the app to and confirms it', () => {
    const recents = recordActions();
    expect(
      APP_COMMANDS.clearRecentTools.run(stateWith({ recentTools: ['a'] }), recents.actions)
    ).toBe('Recent tools cleared');
    expect(recents.calls).toEqual([['clearRecentTools']]);

    const favorites = recordActions();
    expect(
      APP_COMMANDS.clearFavorites.run(stateWith({ favorites: ['a'] }), favorites.actions)
    ).toBe('Favorites cleared');
    expect(favorites.calls).toEqual([['clearFavorites']]);
  });

  test('a clear command says so when its list is already empty', () => {
    const { clearRecentTools, clearFavorites } = APP_COMMANDS;

    expect(clearRecentTools.nothingToDo(stateWith())).toBe('No recent tools to clear');
    expect(clearRecentTools.nothingToDo(stateWith({ recentTools: ['a'] }))).toBeNull();
    expect(clearFavorites.nothingToDo(stateWith())).toBe('No favorites to clear');
    expect(clearFavorites.nothingToDo(stateWith({ favorites: ['a'] }))).toBeNull();
  });

  test('only the clear commands can have nothing to do', () => {
    const withCheck = APP_COMMANDS_IN_ORDER.filter((command) => command.nothingToDo);

    expect(ids(withCheck)).toEqual(['clearRecentTools', 'clearFavorites']);
  });
});

test.describe('command search', () => {
  const state = stateWith();

  test('returns every command for a blank query', () => {
    expect(filterCommands('', state)).toEqual([...APP_COMMANDS_IN_ORDER]);
    expect(filterCommands('   ', state)).toEqual([...APP_COMMANDS_IN_ORDER]);
  });

  test('finds commands by keyword, in palette order', () => {
    expect(ids(filterCommands('theme', state))).toEqual(['toggleTheme']);
    expect(ids(filterCommands('bookmarks', state))).toEqual(['clearFavorites']);
    expect(ids(filterCommands('clear', state))).toEqual(['clearRecentTools', 'clearFavorites']);
    expect(ids(filterCommands('layout', state))).toEqual(['toggleCompactMode', 'toggleFullWidth']);
  });

  test('matches anywhere inside a keyword or the label', () => {
    // 'dark' and 'bookmarks'
    expect(ids(filterCommands('ark', state))).toEqual(['toggleTheme', 'clearFavorites']);
    expect(ids(filterCommands('recent tools', state))).toEqual(['clearRecentTools']);
  });

  test('ignores case and surrounding spaces', () => {
    expect(ids(filterCommands('  THEME ', state))).toEqual(['toggleTheme']);
    expect(ids(filterCommands('Full Width', state))).toEqual(['toggleFullWidth']);
  });

  test('matches the label the command has in the current state', () => {
    const allOff = stateWith({ compactMode: false, fullWidth: false });
    const compact = stateWith({ compactMode: true, fullWidth: false });

    expect(ids(filterCommands('disable', allOff))).toEqual([]);
    expect(ids(filterCommands('disable', compact))).toEqual(['toggleCompactMode']);
    expect(ids(filterCommands('enable', compact))).toEqual(['toggleFullWidth']);
  });

  test('returns nothing when no command matches', () => {
    expect(filterCommands('json formatter', state)).toEqual([]);
  });
});

test.describe('command shortcuts', () => {
  const anywhere = { platform: 'other', paletteOpen: false, typing: false } as const;

  test('are Alt+C, Alt+W and the command modifier with Shift and Delete', () => {
    expect(APP_COMMANDS.toggleCompactMode.shortcut).toEqual({ key: 'c', alt: true, scope: 'app' });
    expect(APP_COMMANDS.toggleFullWidth.shortcut).toEqual({ key: 'w', alt: true, scope: 'app' });
    expect(APP_COMMANDS.clearRecentTools.shortcut).toEqual({
      key: 'Delete',
      mod: true,
      shift: true,
      scope: 'palette',
    });

    const withShortcut = APP_COMMANDS_IN_ORDER.filter((command) => command.shortcut);
    expect(ids(withShortcut)).toEqual(['toggleCompactMode', 'toggleFullWidth', 'clearRecentTools']);
  });

  test('toggle the layout settings from anywhere in the app', () => {
    for (const platform of PLATFORMS) {
      for (const paletteOpen of [false, true]) {
        const context = { platform, paletteOpen, typing: false };

        expect(findCommandByShortcut(press('c', { altKey: true }), context)?.id).toBe(
          'toggleCompactMode'
        );
        expect(findCommandByShortcut(press('W', { altKey: true }), context)?.id).toBe(
          'toggleFullWidth'
        );
      }
    }
  });

  test('do not toggle the layout settings while the user is typing', () => {
    const typing = { ...anywhere, typing: true };

    expect(findCommandByShortcut(press('c', { altKey: true }), typing)).toBeUndefined();
    expect(findCommandByShortcut(press('w', { altKey: true }), typing)).toBeUndefined();
  });

  test('clear the recent tools only while the palette is open', () => {
    const keys = press('Delete', { ctrlKey: true, shiftKey: true });

    expect(findCommandByShortcut(keys, anywhere)).toBeUndefined();
    expect(findCommandByShortcut(keys, { ...anywhere, paletteOpen: true })?.id).toBe(
      'clearRecentTools'
    );
  });

  test('clear the recent tools while typing in the open palette', () => {
    const inPalette = { ...anywhere, paletteOpen: true, typing: true };

    expect(
      findCommandByShortcut(press('Delete', { ctrlKey: true, shiftKey: true }), inPalette)?.id
    ).toBe('clearRecentTools');
  });

  test('take Cmd instead of Ctrl for clearing on macOS', () => {
    const onMac = { platform: 'mac', paletteOpen: true, typing: true } as const;

    expect(
      findCommandByShortcut(press('Delete', { metaKey: true, shiftKey: true }), onMac)?.id
    ).toBe('clearRecentTools');
    expect(
      findCommandByShortcut(press('Delete', { ctrlKey: true, shiftKey: true }), onMac)
    ).toBeUndefined();
  });

  test('leave other keys alone', () => {
    const inPalette = { ...anywhere, paletteOpen: true };

    expect(findCommandByShortcut(press('c'), inPalette)).toBeUndefined();
    expect(findCommandByShortcut(press('k', { ctrlKey: true }), inPalette)).toBeUndefined();
    expect(findCommandByShortcut(press('Delete', { ctrlKey: true }), inPalette)).toBeUndefined();
    expect(findCommandByShortcut(press('Enter', { ctrlKey: true }), inPalette)).toBeUndefined();
  });
});
