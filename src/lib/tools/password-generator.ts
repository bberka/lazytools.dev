// Password Generator logic: random passwords, PIN codes and word passphrases.
// No React and no DOM, so it runs in the browser and in Node. Randomness comes
// from WebCrypto (`globalThis.crypto`) unless a caller passes its own source.

/** A uniformly distributed integer in `[0, maxExclusive)`. */
export type RandomInt = (maxExclusive: number) => number;

/**
 * Builds a `RandomInt` on top of a source of random 32-bit unsigned integers.
 *
 * `value % max` alone favours the low results whenever `max` does not divide
 * 2^32. Values from the incomplete last stretch of the 32-bit range are thrown
 * away and drawn again instead, which makes every result equally likely.
 */
export function createRandomInt(nextUint32: () => number): RandomInt {
  return (maxExclusive) => {
    if (!(maxExclusive > 1)) return 0;
    const max = Math.floor(maxExclusive);
    const limit = Math.floor(0x100000000 / max) * max;
    let value = nextUint32();
    while (value >= limit) value = nextUint32();
    return value % max;
  };
}

/** `RandomInt` backed by the cryptographically secure generator of the platform. */
export const secureRandomInt: RandomInt = createRandomInt(() => crypto.getRandomValues(new Uint32Array(1))[0]);

// ── Settings ──────────────────────────────────────────────────────────────────

export type GenerationMode = 'random' | 'pin' | 'passphrase';

export interface RandomPasswordSettings {
  mode: 'random';
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  special: boolean;
  /** Leave out the look-alike characters 0, O, l, 1, i and I. */
  excludeAmbiguous: boolean;
  /** Put at least one character of every enabled set into the password. */
  requireEachSet: boolean;
  /** Most characters of a set the password may hold. Omit for no limit. */
  maxUppercase?: number;
  maxLowercase?: number;
  maxNumbers?: number;
  maxSpecial?: number;
}

export interface PinSettings {
  mode: 'pin';
  /** Number of digits. */
  length: number;
  /** Digits per hyphen-separated group. */
  groupSize: number;
}

export const PASSPHRASE_SEPARATORS = ['hyphen', 'space', 'dot', 'underscore'] as const;
export type PassphraseSeparator = (typeof PASSPHRASE_SEPARATORS)[number];

export interface PassphraseSettings {
  mode: 'passphrase';
  wordCount: number;
  separator: PassphraseSeparator;
  capitalize: boolean;
  /** Append a three-digit number. */
  appendNumber: boolean;
  /** Append one symbol. */
  appendSymbol: boolean;
}

export type GeneratorSettings = RandomPasswordSettings | PinSettings | PassphraseSettings;

/** A generated value, or the reason the settings cannot produce one. */
export type Generated = { ok: true; value: string } | { ok: false; error: string };

// ── Character data ────────────────────────────────────────────────────────────

const CHARACTER_GROUPS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  special: '!@#$%^&*()_+-=[]{}|;:,.<>?',
} as const;

const AMBIGUOUS_PATTERN = /[0Ol1iI]/g;

const PASSPHRASE_SYMBOLS = ['!', '@', '#', '$', '%', '&'];

const PASSPHRASE_WORDS = [
  'anchor', 'april', 'arrow', 'atom', 'autumn', 'beacon', 'berry', 'beyond', 'binary', 'breeze',
  'cactus', 'cannon', 'carbon', 'castle', 'cedar', 'circle', 'cloud', 'cobalt', 'coffee', 'comet',
  'coral', 'cosmos', 'crystal', 'dawn', 'delta', 'desert', 'drift', 'echo', 'ember', 'falcon',
  'feather', 'forest', 'fossil', 'galaxy', 'garden', 'glacier', 'golden', 'harbor', 'hazel', 'helium',
  'horizon', 'island', 'jungle', 'lantern', 'legend', 'lilac', 'lotus', 'lunar', 'marble', 'matrix',
  'meadow', 'meteor', 'mint', 'monsoon', 'nebula', 'nickel', 'nova', 'oasis', 'ocean', 'onyx',
  'orchid', 'paper', 'pearl', 'pepper', 'phoenix', 'pioneer', 'planet', 'prism', 'quantum', 'quartz',
  'radar', 'raven', 'rocket', 'saffron', 'sailor', 'shadow', 'signal', 'silver', 'solar', 'sonic',
  'spruce', 'summit', 'sunset', 'thunder', 'timber', 'topaz', 'torrent', 'valley', 'velvet', 'violet',
  'voyage', 'willow', 'winter', 'wisdom', 'zenith',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** `value` as a whole number within `[min, max]`. Anything that is not a number becomes `min`. */
export function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/** The character a passphrase separator stands for. */
export function separatorCharacter(separator: string): string {
  if (separator === 'space') return ' ';
  if (separator === 'dot') return '.';
  if (separator === 'underscore') return '_';
  return '-';
}

/** How many characters of each kind `value` holds. Whitespace is not counted. */
export function countCharacterTypes(value: string) {
  return {
    uppercase: (value.match(/[A-Z]/g) ?? []).length,
    lowercase: (value.match(/[a-z]/g) ?? []).length,
    numbers: (value.match(/\d/g) ?? []).length,
    special: (value.match(/[^A-Za-z0-9\s]/g) ?? []).length,
  };
}

function pick<T>(items: ArrayLike<T>, randomInt: RandomInt): T {
  return items[randomInt(items.length)];
}

function shuffle<T>(items: T[], randomInt: RandomInt): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

// ── Generators ────────────────────────────────────────────────────────────────

function generateRandomPassword(settings: RandomPasswordSettings, randomInt: RandomInt): Generated {
  const length = clampInteger(settings.length, 0, Number.MAX_SAFE_INTEGER);
  const limit = (max: number | undefined) => (max === undefined ? length : clampInteger(max, 0, length));
  const withoutAmbiguous = (chars: string) =>
    settings.excludeAmbiguous ? chars.replace(AMBIGUOUS_PATTERN, '') : chars;

  const sets = [
    {
      enabled: settings.uppercase,
      chars: withoutAmbiguous(CHARACTER_GROUPS.uppercase),
      max: limit(settings.maxUppercase),
      used: 0,
    },
    {
      enabled: settings.lowercase,
      chars: withoutAmbiguous(CHARACTER_GROUPS.lowercase),
      max: limit(settings.maxLowercase),
      used: 0,
    },
    {
      enabled: settings.numbers,
      chars: withoutAmbiguous(CHARACTER_GROUPS.numbers),
      max: limit(settings.maxNumbers),
      used: 0,
    },
    {
      enabled: settings.special,
      chars: CHARACTER_GROUPS.special,
      max: limit(settings.maxSpecial),
      used: 0,
    },
  ].filter((set) => set.enabled && set.chars.length > 0 && set.max > 0);

  if (sets.length === 0) {
    return { ok: false, error: 'Enable at least one character set with a max count above zero.' };
  }

  if (settings.requireEachSet && sets.length > length) {
    return { ok: false, error: 'Length is too short to include every enabled character set.' };
  }

  const totalCapacity = sets.reduce((sum, set) => sum + set.max, 0);
  if (totalCapacity < length) {
    return { ok: false, error: 'Increase the max counts or reduce the password length.' };
  }

  const chars: string[] = [];

  if (settings.requireEachSet) {
    for (const set of sets) {
      chars.push(pick(set.chars, randomInt));
      set.used += 1;
    }
  }

  while (chars.length < length) {
    const availableSets = sets.filter((set) => set.used < set.max);
    if (availableSets.length === 0) {
      return { ok: false, error: 'The current limits cannot fill the requested length.' };
    }

    const chosenSet = pick(availableSets, randomInt);
    chars.push(pick(chosenSet.chars, randomInt));
    chosenSet.used += 1;
  }

  return { ok: true, value: shuffle(chars, randomInt).join('') };
}

function generatePin(settings: PinSettings, randomInt: RandomInt): Generated {
  // A group of zero digits would never use up the length.
  const groupSize = clampInteger(settings.groupSize, 1, Number.MAX_SAFE_INTEGER);
  const groups: string[] = [];
  let remaining = clampInteger(settings.length, 0, Number.MAX_SAFE_INTEGER);

  while (remaining > 0) {
    const size = Math.min(groupSize, remaining);
    let segment = '';
    for (let index = 0; index < size; index += 1) {
      segment += pick(CHARACTER_GROUPS.numbers, randomInt);
    }
    groups.push(segment);
    remaining -= size;
  }

  return { ok: true, value: groups.join('-') };
}

function generatePassphrase(settings: PassphraseSettings, randomInt: RandomInt): Generated {
  const words = Array.from({ length: clampInteger(settings.wordCount, 0, Number.MAX_SAFE_INTEGER) }, () => {
    const word = pick(PASSPHRASE_WORDS, randomInt);
    return settings.capitalize ? `${word[0].toUpperCase()}${word.slice(1)}` : word;
  });

  const separator = separatorCharacter(settings.separator);
  let value = words.join(separator);

  if (settings.appendNumber) {
    value += `${separator}${100 + randomInt(900)}`;
  }

  if (settings.appendSymbol) {
    value += `${separator}${pick(PASSPHRASE_SYMBOLS, randomInt)}`;
  }

  return { ok: true, value };
}

/**
 * Generates a password, PIN or passphrase for `settings`.
 *
 * Settings that cannot be satisfied (no character set left, limits too low
 * for the length) give `{ ok: false, error }` with a sentence for the user
 * rather than a value. `randomInt` is the source of randomness; the default is
 * cryptographically secure.
 */
export function generatePassword(settings: GeneratorSettings, randomInt: RandomInt = secureRandomInt): Generated {
  if (settings.mode === 'pin') return generatePin(settings, randomInt);
  if (settings.mode === 'passphrase') return generatePassphrase(settings, randomInt);
  return generateRandomPassword(settings, randomInt);
}
