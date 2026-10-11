import { Layers, Maximize2, Moon, Sun, Trash2, type LucideIcon } from 'lucide-react';
import type { Preferences } from '@/lib/preferences/store';

// App commands are what the user can do to the app itself, as opposed to
// opening a tool: switch the theme, change the layout, clear stored lists.
// Each one is defined once here with its label, search keywords, shortcut,
// action and confirmation message. The command palette lists and runs them,
// the settings dialog runs them and shows their shortcuts, and the one global
// keydown listener, which the command palette owns, dispatches their shortcuts.
//
// This file has no React and no DOM dependency. `./client` connects the
// commands to the app's contexts.

// Shortcuts

export type Platform = 'mac' | 'other';

/**
 * The platform the user agent reports. Defaults to this browser's, and is
 * 'other' when there is none, as during server rendering.
 */
export function detectPlatform(
  userAgent: string | undefined = typeof window === 'undefined'
    ? undefined
    : window.navigator.userAgent
): Platform {
  return userAgent !== undefined && /Mac|iPod|iPhone|iPad/.test(userAgent) ? 'mac' : 'other';
}

/**
 * A key combination. A modifier that is set must be held. One that is not set
 * does not matter: the shortcut matches with it held or not.
 */
export interface Shortcut {
  /**
   * `KeyboardEvent.key` of the main key, such as 'k' or 'Delete'. Letter case
   * is ignored unless `caseSensitive` is set.
   */
  key: string;
  caseSensitive?: boolean;
  /**
   * The platform's command modifier: Cmd on macOS, Ctrl elsewhere. 'either'
   * is held when Cmd or Ctrl is, whatever the platform.
   */
  mod?: boolean | 'either';
  alt?: boolean;
  shift?: boolean;
}

/** The parts of a `KeyboardEvent` that a shortcut is matched against. */
export type ShortcutEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
>;

/** Whether a key press is this shortcut on this platform. */
export function matchesShortcut(
  event: ShortcutEvent,
  shortcut: Shortcut,
  platform: Platform
): boolean {
  // Chrome's autofill dispatches keydown events that carry no key.
  if (typeof event.key !== 'string') return false;

  const keyMatches = shortcut.caseSensitive
    ? event.key === shortcut.key
    : event.key.toLowerCase() === shortcut.key.toLowerCase();
  if (!keyMatches) return false;

  const platformMod = platform === 'mac' ? event.metaKey : event.ctrlKey;
  const modHeld = shortcut.mod === 'either' ? event.ctrlKey || event.metaKey : platformMod;

  return (
    (!shortcut.mod || modHeld) &&
    (!shortcut.alt || event.altKey) &&
    (!shortcut.shift || event.shiftKey)
  );
}

// How a key is written for the user when it is not simply its own name
const KEY_LABELS: Record<string, string> = {
  Enter: '↵',
  Delete: 'Del',
};

/** The keys of a shortcut as the user reads them, modifiers first. */
export function shortcutKeys(shortcut: Shortcut, platform: Platform): string[] {
  const keys: string[] = [];
  if (shortcut.mod) keys.push(platform === 'mac' ? '⌘' : 'Ctrl');
  if (shortcut.alt) keys.push('Alt');
  if (shortcut.shift) keys.push('⇧');

  const { key } = shortcut;
  keys.push(KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key));
  return keys;
}

/** A shortcut as one piece of text, such as 'Ctrl+⇧+Del' or 'Alt + C'. */
export function shortcutLabel(shortcut: Shortcut, platform: Platform, separator = '+'): string {
  return shortcutKeys(shortcut, platform).join(separator);
}

/**
 * Whether the user is typing into this element. Pass the focused one:
 * `document.activeElement`.
 */
export function isTypingTarget(
  element: Pick<Element, 'tagName' | 'getAttribute'> | null
): boolean {
  if (!element) return false;

  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.getAttribute('contenteditable') === 'true'
  );
}

/**
 * Shortcuts of the command palette itself. Opening a tool or marking it as a
 * favorite acts on the row the palette has highlighted, so these are handled
 * by the palette and are not commands.
 */
export const PALETTE_SHORTCUTS = {
  /**
   * Opens or closes the palette, from anywhere and also while typing. Ctrl+K
   * and Cmd+K both do it on every platform. Only a lower-case k counts: with
   * Shift the key is K, and Ctrl+Shift+K belongs to the browser (Firefox opens
   * its console with it).
   */
  toggle: { key: 'k', caseSensitive: true, mod: 'either' },
  /** Opens the highlighted tool in a new tab. */
  openInNewTab: { key: 'Enter', mod: true },
  /** Adds the highlighted tool to the favorites, or removes it. */
  toggleFavorite: { key: 'f', mod: true, shift: true },
} as const satisfies Record<string, Shortcut>;

// Commands

export type CommandId =
  | 'toggleTheme'
  | 'toggleCompactMode'
  | 'toggleFullWidth'
  | 'clearRecentTools'
  | 'clearFavorites';

/** What the commands read: the user's preferences as they are now. */
export type CommandState = Readonly<Preferences>;

/** What the commands do to the app. `./client` supplies the app's own. */
export interface CommandActions {
  toggleTheme(): void;
  setCompactMode(compactMode: boolean): void;
  setFullWidth(fullWidth: boolean): void;
  clearRecentTools(): void;
  clearFavorites(): void;
}

export interface CommandShortcut extends Shortcut {
  /**
   * Where the shortcut works. 'app' is anywhere, except while the user is
   * typing in a field. 'palette' is only while the command palette is open,
   * typing or not.
   */
  scope: 'app' | 'palette';
}

export interface AppCommand {
  id: CommandId;
  /** Name of the command as the palette lists it. */
  label(state: CommandState): string;
  /** A word or two on what the command would act on, shown beside the label. */
  status(state: CommandState): string;
  icon(state: CommandState): LucideIcon;
  /** Further words the palette search finds the command by. */
  keywords: readonly string[];
  shortcut?: CommandShortcut;
  /**
   * The message that explains why the command has nothing to act on, or null
   * when it has. A surface that presents the command asks first: the palette
   * shows the message instead of running it, and the settings dialog disables
   * its button. `run` does not check.
   */
  nothingToDo?(state: CommandState): string | null;
  /** Performs the command and returns the message that confirms it. */
  run(state: CommandState, actions: CommandActions): string;
}

// Which commands are sure to have a shortcut or a nothing-to-do check, so that
// code naming one of them need not test for it
type WithShortcut = Required<Pick<AppCommand, 'shortcut'>>;
type WithCheck = Required<Pick<AppCommand, 'nothingToDo'>>;

// Declaration order is the order the palette lists them in (see APP_COMMANDS_IN_ORDER)
export const APP_COMMANDS: Record<CommandId, AppCommand> & {
  toggleCompactMode: WithShortcut;
  toggleFullWidth: WithShortcut;
  clearRecentTools: WithShortcut & WithCheck;
  clearFavorites: WithCheck;
} = {
  toggleTheme: {
    id: 'toggleTheme',
    label: ({ theme }) => (theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'),
    status: ({ theme }) => (theme === 'dark' ? 'Dark' : 'Light'),
    icon: ({ theme }) => (theme === 'dark' ? Sun : Moon),
    keywords: ['theme', 'dark', 'light', 'mode', 'toggle', 'switch', 'appearance', 'color'],
    run({ theme }, actions) {
      actions.toggleTheme();
      return `Switched to ${theme === 'dark' ? 'light' : 'dark'} mode`;
    },
  },
  toggleCompactMode: {
    id: 'toggleCompactMode',
    label: ({ compactMode }) => (compactMode ? 'Disable Compact Mode' : 'Enable Compact Mode'),
    status: ({ compactMode }) => (compactMode ? 'Enabled' : 'Disabled'),
    icon: () => Layers,
    keywords: ['compact', 'mode', 'size', 'toggle', 'layout', 'spacing', 'appearance'],
    shortcut: { key: 'c', alt: true, scope: 'app' },
    run({ compactMode }, actions) {
      actions.setCompactMode(!compactMode);
      return `Compact mode ${compactMode ? 'disabled' : 'enabled'}`;
    },
  },
  toggleFullWidth: {
    id: 'toggleFullWidth',
    label: ({ fullWidth }) => (fullWidth ? 'Disable Full Width Mode' : 'Enable Full Width Mode'),
    status: ({ fullWidth }) => (fullWidth ? 'Enabled' : 'Disabled'),
    icon: () => Maximize2,
    keywords: ['full', 'width', 'mode', 'toggle', 'layout', 'expand', 'appearance'],
    shortcut: { key: 'w', alt: true, scope: 'app' },
    run({ fullWidth }, actions) {
      actions.setFullWidth(!fullWidth);
      return `Full width mode ${fullWidth ? 'disabled' : 'enabled'}`;
    },
  },
  clearRecentTools: {
    id: 'clearRecentTools',
    label: () => 'Clear Recent Tools',
    status: ({ recentTools }) => (recentTools.length > 0 ? `${recentTools.length} tools` : 'Empty'),
    icon: () => Trash2,
    keywords: ['clear', 'recent', 'tools', 'delete', 'history', 'reset'],
    shortcut: { key: 'Delete', mod: true, shift: true, scope: 'palette' },
    nothingToDo: ({ recentTools }) =>
      recentTools.length === 0 ? 'No recent tools to clear' : null,
    run(_state, actions) {
      actions.clearRecentTools();
      return 'Recent tools cleared';
    },
  },
  clearFavorites: {
    id: 'clearFavorites',
    label: () => 'Clear Favorites',
    status: ({ favorites }) => (favorites.length > 0 ? `${favorites.length} tools` : 'Empty'),
    icon: () => Trash2,
    keywords: ['clear', 'favorites', 'bookmarks', 'delete', 'reset'],
    nothingToDo: ({ favorites }) => (favorites.length === 0 ? 'No favorites to clear' : null),
    run(_state, actions) {
      actions.clearFavorites();
      return 'Favorites cleared';
    },
  },
};

/** Every command once, in the order the palette lists them. */
export const APP_COMMANDS_IN_ORDER: readonly AppCommand[] = Object.values(APP_COMMANDS);

/**
 * The commands whose label or keywords contain the query, in palette order.
 * A blank query returns them all.
 *
 * This is a plain substring match, not the tool catalog's scoring: the five
 * commands keep their fixed order, so there is nothing to rank.
 */
export function filterCommands(query: string, state: CommandState): AppCommand[] {
  const cleanQuery = query.trim().toLowerCase();

  return APP_COMMANDS_IN_ORDER.filter(
    (command) =>
      command.label(state).toLowerCase().includes(cleanQuery) ||
      command.keywords.some((keyword) => keyword.toLowerCase().includes(cleanQuery))
  );
}

/** Where a key was pressed, as far as command shortcuts care. */
export interface ShortcutContext {
  platform: Platform;
  paletteOpen: boolean;
  /** Whether the user is typing in a field (see `isTypingTarget`). */
  typing: boolean;
}

/** The command whose shortcut this key press triggers here, if there is one. */
export function findCommandByShortcut(
  event: ShortcutEvent,
  context: ShortcutContext
): AppCommand | undefined {
  return APP_COMMANDS_IN_ORDER.find(({ shortcut }) => {
    if (!shortcut || !matchesShortcut(event, shortcut, context.platform)) return false;
    return shortcut.scope === 'palette' ? context.paletteOpen : !context.typing;
  });
}
