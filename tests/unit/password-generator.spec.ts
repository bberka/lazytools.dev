import { test, expect } from '@playwright/test';
import {
  clampInteger,
  countCharacterTypes,
  createRandomInt,
  generatePassword,
  secureRandomInt,
  separatorCharacter,
  type Generated,
  type RandomInt,
  type RandomPasswordSettings,
} from '@/lib/tools/password-generator';

const ALL_SETS: RandomPasswordSettings = {
  mode: 'random',
  length: 16,
  uppercase: true,
  lowercase: true,
  numbers: true,
  special: true,
  excludeAmbiguous: false,
  requireEachSet: true,
};

const SPECIAL = '!@#$%^&*()_+-=[]{}|;:,.<>?';

/** The generated value; fails the test when generation reported an error. */
function valueOf(result: Generated): string {
  if (!result.ok) throw new Error(`Expected a value, got the error: ${result.error}`);
  return result.value;
}

function errorOf(result: Generated): string {
  if (result.ok) throw new Error(`Expected an error, got the value: ${result.value}`);
  return result.error;
}

/** A repeatable stand-in for the secure generator, so a failure can be reproduced. */
function seededRandomInt(seed: number): RandomInt {
  let state = seed >>> 0;
  return createRandomInt(() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  });
}

/** A source that replays `values` and fails the test when it runs dry. */
function replay(values: number[]): () => number {
  const queue = [...values];
  return () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('Random source ran dry');
    return next;
  };
}

test.describe('createRandomInt', () => {
  test('maps a 32-bit value into the range', () => {
    const randomInt = createRandomInt(replay([0, 9, 10, 25]));
    expect([randomInt(10), randomInt(10), randomInt(10), randomInt(10)]).toEqual([0, 9, 0, 5]);
  });

  // Defect: `value % max` was used as it came, which favours the low results
  // whenever max does not divide 2^32. 2^32 = 429496729 * 10 + 6, so the top
  // six values must be drawn again; before, 4294967295 gave 5.
  test('draws again instead of folding the incomplete top of the range', () => {
    const source = replay([4294967295, 4294967290, 4294967289, 7]);
    const randomInt = createRandomInt(source);
    expect(randomInt(10)).toBe(9); // 4294967289 is the last value of a complete stretch
    expect(randomInt(10)).toBe(7);
  });

  test('accepts every value when the range divides 2^32', () => {
    const randomInt = createRandomInt(replay([4294967295, 4294967295]));
    expect(randomInt(16)).toBe(15);
    expect(randomInt(256)).toBe(255);
  });

  test('returns 0 without drawing for a range of one or less', () => {
    const randomInt = createRandomInt(replay([]));
    expect([randomInt(1), randomInt(0), randomInt(-5), randomInt(Number.NaN)]).toEqual([0, 0, 0, 0]);
  });

  test('the secure generator stays inside the range and reaches all of it', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(secureRandomInt(6));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

test.describe('generatePassword: random passwords', () => {
  test('has the requested length and only characters of the enabled sets', () => {
    for (const length of [4, 16, 64, 256]) {
      const password = valueOf(generatePassword({ ...ALL_SETS, length }, seededRandomInt(length)));
      expect(password).toHaveLength(length);
      expect(Array.from(password).every((char) => /[A-Za-z0-9]/.test(char) || SPECIAL.includes(char))).toBe(true);
    }

    const lettersOnly = valueOf(
      generatePassword({ ...ALL_SETS, numbers: false, special: false, length: 200 }, seededRandomInt(1))
    );
    expect(lettersOnly).toMatch(/^[A-Za-z]{200}$/);
  });

  test('contains every enabled set when asked to, even at the shortest length', () => {
    for (let seed = 0; seed < 200; seed++) {
      const counts = countCharacterTypes(valueOf(generatePassword({ ...ALL_SETS, length: 4 }, seededRandomInt(seed))));
      expect(counts).toEqual({ uppercase: 1, lowercase: 1, numbers: 1, special: 1 });
    }
  });

  test('never uses the look-alike characters when they are excluded', () => {
    for (let seed = 0; seed < 50; seed++) {
      const password = valueOf(
        generatePassword({ ...ALL_SETS, length: 256, excludeAmbiguous: true }, seededRandomInt(seed))
      );
      expect(password).not.toMatch(/[0Ol1iI]/);
    }
  });

  test('respects the maximum count of each set', () => {
    for (let seed = 0; seed < 100; seed++) {
      const password = valueOf(
        generatePassword(
          { ...ALL_SETS, length: 24, maxUppercase: 2, maxNumbers: 3, maxSpecial: 1 },
          seededRandomInt(seed)
        )
      );
      const counts = countCharacterTypes(password);
      expect(password).toHaveLength(24);
      expect(counts.uppercase).toBeLessThanOrEqual(2);
      expect(counts.numbers).toBeLessThanOrEqual(3);
      expect(counts.special).toBeLessThanOrEqual(1);
      expect(counts.uppercase + counts.lowercase + counts.numbers + counts.special).toBe(24);
    }
  });

  test('fills the length exactly when the limits leave no slack', () => {
    const password = valueOf(
      generatePassword(
        { ...ALL_SETS, length: 8, maxUppercase: 2, maxLowercase: 2, maxNumbers: 2, maxSpecial: 2 },
        seededRandomInt(3)
      )
    );
    expect(countCharacterTypes(password)).toEqual({ uppercase: 2, lowercase: 2, numbers: 2, special: 2 });
  });

  test('a maximum of zero switches the set off; one above the length means no limit', () => {
    const noDigits = valueOf(generatePassword({ ...ALL_SETS, length: 100, maxNumbers: 0 }, seededRandomInt(5)));
    expect(noDigits).not.toMatch(/\d/);
    expect(valueOf(generatePassword({ ...ALL_SETS, length: 8, maxLowercase: 500 }, seededRandomInt(5)))).toHaveLength(8);
  });

  test('explains settings that cannot produce a password', () => {
    const none = { ...ALL_SETS, uppercase: false, lowercase: false, numbers: false, special: false };
    expect(errorOf(generatePassword(none))).toBe('Enable at least one character set with a max count above zero.');
    expect(errorOf(generatePassword({ ...ALL_SETS, lowercase: false, numbers: false, special: false, maxUppercase: 0 }))).toBe(
      'Enable at least one character set with a max count above zero.'
    );
    expect(errorOf(generatePassword({ ...ALL_SETS, length: 3 }))).toBe(
      'Length is too short to include every enabled character set.'
    );
    expect(
      errorOf(generatePassword({ ...ALL_SETS, length: 20, maxUppercase: 2, maxLowercase: 2, maxNumbers: 2, maxSpecial: 2 }))
    ).toBe('Increase the max counts or reduce the password length.');
  });

  // Hardening: an error used to be told apart from a password by looking for
  // words such as "Enable" in the text, so nothing may leak between the two.
  test('a password is reported as a value whatever characters it holds', () => {
    const lettersOnly = { ...ALL_SETS, numbers: false, special: false, requireEachSet: false, length: 6 };
    // Picks the upper-case set, then E, then the lower-case set for n, a, b, l, e.
    const letters = [0, 4, 1, 13, 1, 0, 1, 1, 1, 11, 1, 4];
    const noShuffle = [5, 4, 3, 2, 1];
    const password = generatePassword(lettersOnly, createRandomInt(replay([...letters, ...noShuffle])));
    expect(password).toEqual({ ok: true, value: 'Enable' });
  });

  test('uses the secure generator by default and does not repeat itself', () => {
    const first = valueOf(generatePassword({ ...ALL_SETS, length: 32 }));
    const second = valueOf(generatePassword({ ...ALL_SETS, length: 32 }));
    expect(first).toHaveLength(32);
    expect(first).not.toBe(second);
  });
});

test.describe('generatePassword: PIN codes', () => {
  test('groups the digits with hyphens and keeps the digit count', () => {
    const random = seededRandomInt(11);
    expect(valueOf(generatePassword({ mode: 'pin', length: 6, groupSize: 3 }, random))).toMatch(/^\d{3}-\d{3}$/);
    expect(valueOf(generatePassword({ mode: 'pin', length: 4, groupSize: 3 }, random))).toMatch(/^\d{3}-\d$/);
    expect(valueOf(generatePassword({ mode: 'pin', length: 4, groupSize: 6 }, random))).toMatch(/^\d{4}$/);
    expect(valueOf(generatePassword({ mode: 'pin', length: 24, groupSize: 2 }, random))).toMatch(/^\d{2}(-\d{2}){11}$/);
  });

  test('uses every digit', () => {
    const digits = new Set(valueOf(generatePassword({ mode: 'pin', length: 600, groupSize: 600 }, seededRandomInt(2))));
    expect(digits.size).toBe(10);
  });

  test('does not hang on a group size of zero', () => {
    expect(valueOf(generatePassword({ mode: 'pin', length: 3, groupSize: 0 }, seededRandomInt(2)))).toMatch(
      /^\d-\d-\d$/
    );
  });
});

test.describe('generatePassword: passphrases', () => {
  const base = {
    mode: 'passphrase',
    wordCount: 4,
    separator: 'hyphen',
    capitalize: true,
    appendNumber: true,
    appendSymbol: false,
  } as const;

  test('joins capitalized words and a three-digit number', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(valueOf(generatePassword(base, seededRandomInt(seed)))).toMatch(/^([A-Z][a-z]+-){4}[1-9]\d{2}$/);
    }
  });

  test('applies the separator, the case and the suffixes that were chosen', () => {
    const random = seededRandomInt(9);
    expect(
      valueOf(generatePassword({ ...base, separator: 'space', capitalize: false, appendNumber: false }, random))
    ).toMatch(/^[a-z]+( [a-z]+){3}$/);
    expect(valueOf(generatePassword({ ...base, separator: 'dot', appendSymbol: true }, random))).toMatch(
      /^([A-Z][a-z]+\.){4}\d{3}\.[!@#$%&]$/
    );
    expect(
      valueOf(generatePassword({ ...base, wordCount: 12, separator: 'underscore', appendNumber: false }, random))
    ).toMatch(/^[A-Z][a-z]+(_[A-Z][a-z]+){11}$/);
  });
});

test.describe('helpers', () => {
  test('countCharacterTypes counts each kind and ignores whitespace', () => {
    expect(countCharacterTypes('Ab1! cD2?')).toEqual({ uppercase: 2, lowercase: 2, numbers: 2, special: 2 });
    expect(countCharacterTypes('')).toEqual({ uppercase: 0, lowercase: 0, numbers: 0, special: 0 });
    expect(countCharacterTypes('é🙂').special).toBeGreaterThan(0);
  });

  test('separatorCharacter maps the separator names', () => {
    expect(['hyphen', 'space', 'dot', 'underscore', 'anything else'].map(separatorCharacter)).toEqual([
      '-',
      ' ',
      '.',
      '_',
      '-',
    ]);
  });

  test('clampInteger floors, bounds and survives non-numbers', () => {
    expect(clampInteger(5.9, 0, 10)).toBe(5);
    expect(clampInteger(-3, 0, 10)).toBe(0);
    expect(clampInteger(99, 0, 10)).toBe(10);
    expect(clampInteger(Number.NaN, 2, 10)).toBe(2);
    expect(clampInteger(Number.POSITIVE_INFINITY, 2, 10)).toBe(2);
  });
});
