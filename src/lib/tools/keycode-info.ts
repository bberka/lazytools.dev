/**
 * Describes a keyboard event: the values scripts read (`key`, `code`,
 * `keyCode`, `which`, `location`), the modifier keys held, and the character
 * the key produced. Pure, so it takes the few event fields it needs.
 */

export interface KeyEventLike {
  key: string;
  code: string;
  keyCode: number;
  which: number;
  location: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

export const KEY_LOCATIONS: Record<number, string> = {
  0: 'Standard',
  1: 'Left',
  2: 'Right',
  3: 'Numpad',
};

export interface KeyInfo {
  key: string;
  code: string;
  keyCode: number;
  which: number;
  location: number;
  locationName: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  repeat: boolean;
  /** The text the key types, or null for keys that type nothing (Shift, F5, Enter...). */
  character: string | null;
  /** The key as a person would name it: a space is "Space", a letter is the letter. */
  label: string;
  /** Modifier names in the order Ctrl, Alt, Shift, Meta. */
  modifiers: string[];
}

/** The text a key types: a single character, but not "Dead" or other named keys. */
function typedCharacter(key: string): string | null {
  return Array.from(key).length === 1 ? key : null;
}

export function describeKey(event: KeyEventLike): KeyInfo {
  const character = typedCharacter(event.key);
  const modifiers = [
    event.ctrlKey ? 'Ctrl' : null,
    event.altKey ? 'Alt' : null,
    event.shiftKey ? 'Shift' : null,
    event.metaKey ? 'Meta' : null,
  ].filter((name): name is string => name !== null);

  let label = event.key;
  if (event.key === ' ') label = 'Space';
  else if (event.key === '') label = '(empty)';

  return {
    key: event.key,
    code: event.code,
    keyCode: event.keyCode,
    which: event.which,
    location: event.location,
    locationName: KEY_LOCATIONS[event.location] ?? `Unknown (${event.location})`,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
    repeat: event.repeat,
    character,
    label,
    modifiers,
  };
}

/** Puts the newest entry first and keeps at most `limit` entries. */
export function pushHistory<T>(history: readonly T[], entry: T, limit = 10): T[] {
  return [entry, ...history].slice(0, limit);
}

/** The event as text for copying, one value per line. */
export function keyInfoText(info: KeyInfo): string {
  return [
    `event.key: ${JSON.stringify(info.key)}`,
    `event.code: ${JSON.stringify(info.code)}`,
    `event.keyCode: ${info.keyCode}`,
    `event.which: ${info.which}`,
    `event.location: ${info.location} (${info.locationName})`,
    `ctrlKey: ${info.ctrl}`,
    `shiftKey: ${info.shift}`,
    `altKey: ${info.alt}`,
    `metaKey: ${info.meta}`,
    `repeat: ${info.repeat}`,
  ].join('\n');
}
