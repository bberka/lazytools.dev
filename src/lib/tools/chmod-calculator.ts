/**
 * Chmod calculator logic: converts a Unix file mode between the permission
 * grid, octal ("755", "4755") and symbolic ("rwxr-xr-x", "rwsr-xr-x") forms,
 * builds the matching chmod commands and explains the mode in plain language.
 *
 * A mode is a plain number in 0..0o7777: the low nine bits are the
 * owner/group/others rwx triples and the next three are setuid, setgid and
 * sticky. Everything here is pure, so it runs in Node and in the browser.
 */

export type PermissionClass = 'owner' | 'group' | 'others';
export type PermissionBit = 'read' | 'write' | 'execute';
export type SpecialBit = 'setuid' | 'setgid' | 'sticky';

export const PERMISSION_CLASSES: readonly PermissionClass[] = ['owner', 'group', 'others'];
export const PERMISSION_BITS: readonly PermissionBit[] = ['read', 'write', 'execute'];
export const SPECIAL_BITS: readonly SpecialBit[] = ['setuid', 'setgid', 'sticky'];

/** Every bit a chmod mode can carry: rwxrwxrwx plus setuid, setgid and sticky. */
export const MODE_MASK = 0o7777;

const PERMISSION_MASKS: Record<PermissionClass, Record<PermissionBit, number>> = {
  owner: { read: 0o400, write: 0o200, execute: 0o100 },
  group: { read: 0o040, write: 0o020, execute: 0o010 },
  others: { read: 0o004, write: 0o002, execute: 0o001 },
};

const SPECIAL_MASKS: Record<SpecialBit, number> = {
  setuid: 0o4000,
  setgid: 0o2000,
  sticky: 0o1000,
};

export type ParseResult = { ok: true; mode: number } | { ok: false; error: string };

function fail(error: string): ParseResult {
  return { ok: false, error };
}

/** Keeps a mode inside 12 bits; anything that is not a finite number becomes 0. */
function normalize(mode: number): number {
  return Number.isFinite(mode) ? Math.trunc(mode) & MODE_MASK : 0;
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

export function hasPermission(mode: number, who: PermissionClass, bit: PermissionBit): boolean {
  return (normalize(mode) & PERMISSION_MASKS[who][bit]) !== 0;
}

export function withPermission(
  mode: number,
  who: PermissionClass,
  bit: PermissionBit,
  on: boolean
): number {
  const mask = PERMISSION_MASKS[who][bit];
  return on ? normalize(mode) | mask : normalize(mode) & ~mask;
}

export function hasSpecial(mode: number, bit: SpecialBit): boolean {
  return (normalize(mode) & SPECIAL_MASKS[bit]) !== 0;
}

export function withSpecial(mode: number, bit: SpecialBit, on: boolean): number {
  const mask = SPECIAL_MASKS[bit];
  return on ? normalize(mode) | mask : normalize(mode) & ~mask;
}

// ---------------------------------------------------------------------------
// Octal
// ---------------------------------------------------------------------------

/** Three digits, or four when any of setuid, setgid or sticky is set. */
export function formatOctal(mode: number): string {
  const value = normalize(mode);
  return value > 0o777 ? value.toString(8).padStart(4, '0') : value.toString(8).padStart(3, '0');
}

export function parseOctal(input: string): ParseResult {
  const text = input.trim();
  if (text === '') return fail('Enter 3 or 4 octal digits, for example 755 or 4755.');

  const badDigit = /[89]/.exec(text);
  if (badDigit && /^[0-9]+$/.test(text)) {
    return fail(`Octal digits run from 0 to 7, but "${badDigit[0]}" was found.`);
  }
  if (!/^[0-7]+$/.test(text)) {
    return fail('Use only the digits 0 to 7, for example 755 or 4755.');
  }
  if (text.length < 3 || text.length > 4) {
    return fail(`Use 3 or 4 octal digits (got ${text.length}), for example 755 or 4755.`);
  }
  return { ok: true, mode: parseInt(text, 8) };
}

// ---------------------------------------------------------------------------
// Symbolic
// ---------------------------------------------------------------------------

interface SymbolicTriple {
  who: PermissionClass;
  /** Index of the first character of this triple in the nine-character string. */
  offset: number;
  /** s for owner and group, t for others. */
  specialChar: 's' | 't';
  special: SpecialBit;
}

const SYMBOLIC_TRIPLES: readonly SymbolicTriple[] = [
  { who: 'owner', offset: 0, specialChar: 's', special: 'setuid' },
  { who: 'group', offset: 3, specialChar: 's', special: 'setgid' },
  { who: 'others', offset: 6, specialChar: 't', special: 'sticky' },
];

/** File type characters `ls -l` prints in front of the nine permission characters. */
const FILE_TYPE_CHARS = '-dlcbps';

/** Nine characters such as rwxr-xr-x, using s/S and t/T for the special bits. */
export function formatSymbolic(mode: number): string {
  return SYMBOLIC_TRIPLES.map(({ who, specialChar, special }) => {
    const read = hasPermission(mode, who, 'read') ? 'r' : '-';
    const write = hasPermission(mode, who, 'write') ? 'w' : '-';
    const execute = hasPermission(mode, who, 'execute');
    let last: string;
    if (hasSpecial(mode, special)) {
      last = execute ? specialChar : specialChar.toUpperCase();
    } else {
      last = execute ? 'x' : '-';
    }
    return read + write + last;
  }).join('');
}

/**
 * Parses nine characters (rwxr-xr-x) or the ten `ls -l` prints with a leading
 * file type (drwxr-xr-x). Position 3 and 6 accept x, s, S or -; position 9
 * accepts x, t, T or -. s/t mean the special bit and execute are both set;
 * S/T mean the special bit is set without execute.
 */
export function parseSymbolic(input: string): ParseResult {
  const text = input.trim();
  if (text === '') return fail('Enter 9 characters such as rwxr-xr-x.');

  let body = text;
  if (text.length === 10) {
    if (!FILE_TYPE_CHARS.includes(text[0])) {
      return fail(
        `Found 10 characters, so the first must be a file type from ls -l (one of ${FILE_TYPE_CHARS}), but it is "${text[0]}".`
      );
    }
    body = text.slice(1);
  }
  if (body.length !== 9) {
    return fail(
      `Use 9 characters such as rwxr-xr-x, or 10 with a leading file type (got ${text.length}).`
    );
  }

  let mode = 0;
  for (const { who, offset, specialChar, special } of SYMBOLIC_TRIPLES) {
    const read = body[offset];
    const write = body[offset + 1];
    const last = body[offset + 2];

    if (read !== 'r' && read !== '-') {
      return fail(`Character ${offset + 1} must be r or -, but it is "${read}".`);
    }
    if (write !== 'w' && write !== '-') {
      return fail(`Character ${offset + 2} must be w or -, but it is "${write}".`);
    }
    const upper = specialChar.toUpperCase();
    if (last !== 'x' && last !== '-' && last !== specialChar && last !== upper) {
      return fail(
        `Character ${offset + 3} must be x, ${specialChar}, ${upper} or -, but it is "${last}".`
      );
    }

    mode = withPermission(mode, who, 'read', read === 'r');
    mode = withPermission(mode, who, 'write', write === 'w');
    mode = withPermission(mode, who, 'execute', last === 'x' || last === specialChar);
    mode = withSpecial(mode, special, last === specialChar || last === upper);
  }
  return { ok: true, mode };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Characters a shell leaves alone in a word, plus the glob and expansion ones people type. */
const SHELL_SAFE = /^[\w@%+=:,./~*?$[\]{}-]+$/;

/** Quotes a file name for a POSIX shell only when it needs it. */
export function quoteShellArg(name: string): string {
  if (SHELL_SAFE.test(name)) return name;
  return `'${name.replace(/'/g, `'\\''`)}'`;
}

/** chmod's `u=rwx,g=rx,o=rx` clauses. s and t are added to the class they belong to. */
function symbolicClauses(mode: number): string {
  const prefixes: Record<PermissionClass, string> = { owner: 'u', group: 'g', others: 'o' };
  return SYMBOLIC_TRIPLES.map(({ who, specialChar, special }) => {
    let letters = '';
    if (hasPermission(mode, who, 'read')) letters += 'r';
    if (hasPermission(mode, who, 'write')) letters += 'w';
    if (hasPermission(mode, who, 'execute')) letters += 'x';
    if (hasSpecial(mode, special)) letters += specialChar;
    return `${prefixes[who]}=${letters}`;
  }).join(',');
}

export interface ChmodCommands {
  numeric: string;
  symbolic: string;
}

/**
 * The same mode as two chmod commands. `target` is used as typed apart from
 * quoting: blank becomes "file", and a name starting with "-" gets a "--".
 */
export function chmodCommands(mode: number, target = 'file'): ChmodCommands {
  const trimmed = target.trim();
  const quoted = quoteShellArg(trimmed === '' ? 'file' : trimmed);
  const operand = trimmed.startsWith('-') ? `-- ${quoted}` : quoted;
  return {
    numeric: `chmod ${formatOctal(mode)} ${operand}`,
    symbolic: `chmod ${symbolicClauses(mode)} ${operand}`,
  };
}

// ---------------------------------------------------------------------------
// Explanation
// ---------------------------------------------------------------------------

export interface ClassExplanation {
  who: PermissionClass;
  label: string;
  /** Completes the sentence "<label> ...", for example "can read and execute but cannot write". */
  summary: string;
}

export interface ModeExplanation {
  classes: ClassExplanation[];
  /** One sentence per special bit that is set. */
  special: string[];
  /** Things worth a second look: world-writable files, S/T forms, writable setuid programs. */
  warnings: string[];
}

const CLASS_LABELS: Record<PermissionClass, string> = {
  owner: 'Owner (user)',
  group: 'Group',
  others: 'Others (everyone else)',
};

function joinWords(words: string[], conjunction: 'and' | 'or'): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} ${conjunction} ${words[words.length - 1]}`;
}

function describeAccess(read: boolean, write: boolean, execute: boolean): string {
  const allowed: string[] = [];
  const denied: string[] = [];
  (read ? allowed : denied).push('read');
  (write ? allowed : denied).push('write');
  (execute ? allowed : denied).push('execute');

  if (allowed.length === 0) return 'has no access';
  if (denied.length === 0) return 'can read, write and execute';
  return `can ${joinWords(allowed, 'and')} but cannot ${joinWords(denied, 'or')}`;
}

const SPECIAL_DESCRIPTIONS: Record<SpecialBit, string> = {
  setuid:
    'Setuid: when the file is run, it runs with the privileges of the file owner instead of the person who started it.',
  setgid:
    "Setgid: when the file is run, it runs with the privileges of the file's group. On a directory, new files inherit the directory's group.",
  sticky:
    'Sticky bit: in a directory, only the file owner, the directory owner or root can delete or rename the files inside it (as in /tmp).',
};

export function explainMode(mode: number): ModeExplanation {
  const classes = PERMISSION_CLASSES.map((who) => ({
    who,
    label: CLASS_LABELS[who],
    summary: describeAccess(
      hasPermission(mode, who, 'read'),
      hasPermission(mode, who, 'write'),
      hasPermission(mode, who, 'execute')
    ),
  }));

  const special = SPECIAL_BITS.filter((bit) => hasSpecial(mode, bit)).map(
    (bit) => SPECIAL_DESCRIPTIONS[bit]
  );

  const warnings: string[] = [];
  const setuid = hasSpecial(mode, 'setuid');
  const setgid = hasSpecial(mode, 'setgid');
  const sticky = hasSpecial(mode, 'sticky');

  if (hasPermission(mode, 'others', 'write') && !sticky) {
    warnings.push('World-writable: any user on the system can change this. That is rarely what you want.');
  }
  if (setuid && !hasPermission(mode, 'owner', 'execute')) {
    warnings.push(
      'Setuid is set but the owner has no execute permission (shown as S), which is unusual.'
    );
  }
  if (setgid && !hasPermission(mode, 'group', 'execute')) {
    warnings.push(
      'Setgid is set but the group has no execute permission (shown as S), which is unusual.'
    );
  }
  if (sticky && !hasPermission(mode, 'others', 'execute')) {
    warnings.push(
      'Sticky bit is set but others have no execute permission (shown as T), which is unusual.'
    );
  }
  const writableByGroup = hasPermission(mode, 'group', 'write');
  const writableByOthers = hasPermission(mode, 'others', 'write');
  if ((setuid && (writableByGroup || writableByOthers)) || (setgid && writableByOthers)) {
    warnings.push(
      'Setuid or setgid together with write access for other users lets them replace a program that runs with elevated privileges.'
    );
  }

  return { classes, special, warnings };
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export interface ModePreset {
  octal: string;
  mode: number;
  label: string;
  note: string;
}

function preset(octal: string, label: string, note: string): ModePreset {
  return { octal, mode: parseInt(octal, 8), label, note };
}

export const PRESETS: readonly ModePreset[] = [
  preset(
    '644',
    'Regular file',
    'Owner can edit; everyone else can only read. The usual default for files.'
  ),
  preset(
    '755',
    'Program or directory',
    'Owner has full access; everyone else can read and run or enter. The usual default for directories and scripts.'
  ),
  preset(
    '600',
    'Private file',
    'Only the owner can read and write. Typical for SSH keys and files with secrets.'
  ),
  preset(
    '700',
    'Private program or directory',
    'Only the owner has any access. Typical for ~/.ssh and personal scripts.'
  ),
  preset(
    '775',
    'Group-shared',
    'Owner and group have full access; others can read and enter. Common for shared project directories.'
  ),
  preset(
    '777',
    'Open to everyone',
    'Everyone can read, write and execute. Avoid it: any user can change the file.'
  ),
  preset(
    '400',
    'Read-only',
    'Only the owner can read, and nobody can write. Typical for private keys and certificates.'
  ),
];

export function findPreset(mode: number): ModePreset | undefined {
  const value = normalize(mode);
  return PRESETS.find((candidate) => candidate.mode === value);
}
