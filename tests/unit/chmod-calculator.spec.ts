import { test, expect } from '@playwright/test';
import {
  MODE_MASK,
  PERMISSION_BITS,
  PERMISSION_CLASSES,
  PRESETS,
  SPECIAL_BITS,
  chmodCommands,
  explainMode,
  findPreset,
  formatOctal,
  formatSymbolic,
  hasPermission,
  hasSpecial,
  parseOctal,
  parseSymbolic,
  quoteShellArg,
  withPermission,
  withSpecial,
} from '@/lib/tools/chmod-calculator';

// Worked figures. The first group is the everyday set from the chmod(1) man
// page and the GNU coreutils manual (numeric modes: 4000 setuid, 2000 setgid,
// 1000 restricted deletion / sticky, then 400/200/100 for the owner and so on).
// The second group is what `ls -l` really prints for well-known system paths:
//   /usr/bin/passwd  -rwsr-xr-x  (4755)
//   /usr/bin/wall    -rwxr-sr-x  (2755)
//   /tmp             drwxrwxrwt  (1777)
const PLAIN_VECTORS: Array<[octal: string, symbolic: string]> = [
  ['000', '---------'],
  ['400', 'r--------'],
  ['600', 'rw-------'],
  ['644', 'rw-r--r--'],
  ['664', 'rw-rw-r--'],
  ['700', 'rwx------'],
  ['744', 'rwxr--r--'],
  ['750', 'rwxr-x---'],
  ['755', 'rwxr-xr-x'],
  ['775', 'rwxrwxr-x'],
  ['777', 'rwxrwxrwx'],
  ['111', '--x--x--x'],
  ['222', '-w--w--w-'],
  ['444', 'r--r--r--'],
  ['421', 'r---w---x'],
];

const SPECIAL_VECTORS: Array<[octal: string, symbolic: string]> = [
  ['4755', 'rwsr-xr-x'], // setuid, owner can execute: lowercase s
  ['4644', 'rwSr--r--'], // setuid, owner cannot execute: uppercase S
  ['2755', 'rwxr-sr-x'], // setgid, group can execute: lowercase s
  ['2644', 'rw-r-Sr--'], // setgid, group cannot execute: uppercase S
  ['1777', 'rwxrwxrwt'], // sticky, others can execute: lowercase t
  ['1666', 'rw-rw-rwT'], // sticky, others cannot execute: uppercase T
  ['7777', 'rwsrwsrwt'], // all three special bits, everything executable
  ['7000', '--S--S--T'], // all three special bits, nothing executable
  ['6755', 'rwsr-sr-x'], // setuid + setgid
  ['4000', '--S------'], // setuid alone
  ['2000', '-----S---'], // setgid alone
  ['1000', '--------T'], // sticky alone
];

test.describe('octal to symbolic', () => {
  for (const [octal, symbolic] of [...PLAIN_VECTORS, ...SPECIAL_VECTORS]) {
    test(`${octal} is ${symbolic}`, () => {
      const parsed = parseOctal(octal);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(formatSymbolic(parsed.mode)).toBe(symbolic);
    });
  }

  test('a leading zero means no special bits', () => {
    const parsed = parseOctal('0755');
    expect(parsed).toEqual({ ok: true, mode: 0o755 });
  });

  test('surrounding whitespace is ignored', () => {
    expect(parseOctal('  644\n')).toEqual({ ok: true, mode: 0o644 });
  });
});

test.describe('symbolic to octal', () => {
  for (const [octal, symbolic] of [...PLAIN_VECTORS, ...SPECIAL_VECTORS]) {
    test(`${symbolic} is ${octal}`, () => {
      const parsed = parseSymbolic(symbolic);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.mode).toBe(parseInt(octal, 8));
      expect(formatOctal(parsed.mode)).toBe(octal);
    });
  }

  test('accepts the file type character that ls -l puts in front', () => {
    expect(parseSymbolic('-rwxr-xr-x')).toEqual({ ok: true, mode: 0o755 });
    expect(parseSymbolic('drwxrwxrwt')).toEqual({ ok: true, mode: 0o1777 });
    expect(parseSymbolic('lrwxrwxrwx')).toEqual({ ok: true, mode: 0o777 });
    expect(parseSymbolic('-rwsr-xr-x')).toEqual({ ok: true, mode: 0o4755 });
  });

  test('surrounding whitespace is ignored', () => {
    expect(parseSymbolic(' rwxr-xr-x ')).toEqual({ ok: true, mode: 0o755 });
  });
});

test.describe('formatting', () => {
  test('octal is three digits without special bits and four with them', () => {
    expect(formatOctal(0o644)).toBe('644');
    expect(formatOctal(0)).toBe('000');
    expect(formatOctal(0o7)).toBe('007');
    expect(formatOctal(0o4755)).toBe('4755');
    expect(formatOctal(0o1000)).toBe('1000');
  });

  test('values outside 12 bits are masked rather than thrown on', () => {
    expect(MODE_MASK).toBe(0o7777);
    expect(formatOctal(0o17755)).toBe('7755');
    expect(formatSymbolic(Number.NaN)).toBe('---------');
  });
});

test.describe('checkbox grid', () => {
  test('each of the nine bits maps to its own octal value', () => {
    const expected = {
      owner: { read: 0o400, write: 0o200, execute: 0o100 },
      group: { read: 0o040, write: 0o020, execute: 0o010 },
      others: { read: 0o004, write: 0o002, execute: 0o001 },
    };
    for (const who of PERMISSION_CLASSES) {
      for (const bit of PERMISSION_BITS) {
        const mode = withPermission(0, who, bit, true);
        expect(mode, `${who} ${bit}`).toBe(expected[who][bit]);
        expect(hasPermission(mode, who, bit)).toBe(true);
        // and only that one box is ticked
        const ticked = PERMISSION_CLASSES.flatMap((w) =>
          PERMISSION_BITS.filter((b) => hasPermission(mode, w, b)).map((b) => `${w} ${b}`)
        );
        expect(ticked).toEqual([`${who} ${bit}`]);
      }
    }
  });

  test('the three special bits map to 4000, 2000 and 1000', () => {
    expect(withSpecial(0, 'setuid', true)).toBe(0o4000);
    expect(withSpecial(0, 'setgid', true)).toBe(0o2000);
    expect(withSpecial(0, 'sticky', true)).toBe(0o1000);
    expect([...SPECIAL_BITS]).toEqual(['setuid', 'setgid', 'sticky']);
  });

  test('ticking and unticking leaves every other bit alone', () => {
    const start = 0o4755;
    expect(withPermission(start, 'group', 'write', true)).toBe(0o4775);
    expect(withPermission(start, 'owner', 'execute', false)).toBe(0o4655);
    expect(withPermission(start, 'others', 'read', false)).toBe(0o4751);
    expect(withSpecial(start, 'setuid', false)).toBe(0o755);
    expect(withSpecial(start, 'sticky', true)).toBe(0o5755);
    expect(hasSpecial(0o5755, 'setuid')).toBe(true);
    expect(hasSpecial(0o5755, 'setgid')).toBe(false);
    expect(hasSpecial(0o5755, 'sticky')).toBe(true);
  });

  test('setting a bit that is already set is a no-op', () => {
    expect(withPermission(0o755, 'owner', 'read', true)).toBe(0o755);
    expect(withPermission(0o755, 'others', 'write', false)).toBe(0o755);
    expect(withSpecial(0o1777, 'sticky', true)).toBe(0o1777);
  });

  test('building 755 box by box gives the same mode as typing it', () => {
    let mode = 0;
    for (const who of PERMISSION_CLASSES) {
      mode = withPermission(mode, who, 'read', true);
      mode = withPermission(mode, who, 'execute', true);
    }
    mode = withPermission(mode, 'owner', 'write', true);
    expect(mode).toBe(0o755);
    expect(formatSymbolic(mode)).toBe('rwxr-xr-x');
  });
});

test.describe('round trips', () => {
  test('every one of the 4096 modes survives octal, symbolic and grid conversion', () => {
    const failures: string[] = [];
    for (let mode = 0; mode <= MODE_MASK; mode++) {
      const viaOctal = parseOctal(formatOctal(mode));
      if (!viaOctal.ok || viaOctal.mode !== mode) failures.push(`octal ${mode.toString(8)}`);

      const viaSymbolic = parseSymbolic(formatSymbolic(mode));
      if (!viaSymbolic.ok || viaSymbolic.mode !== mode) failures.push(`symbolic ${mode.toString(8)}`);

      let rebuilt = 0;
      for (const who of PERMISSION_CLASSES) {
        for (const bit of PERMISSION_BITS) {
          rebuilt = withPermission(rebuilt, who, bit, hasPermission(mode, who, bit));
        }
      }
      for (const bit of SPECIAL_BITS) {
        rebuilt = withSpecial(rebuilt, bit, hasSpecial(mode, bit));
      }
      if (rebuilt !== mode) failures.push(`grid ${mode.toString(8)}`);
    }
    expect(failures).toEqual([]);
  });

  test('symbolic output is always nine characters from the allowed alphabet', () => {
    const shape = /^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/;
    const failures: string[] = [];
    for (let mode = 0; mode <= MODE_MASK; mode++) {
      if (!shape.test(formatSymbolic(mode))) failures.push(mode.toString(8));
    }
    expect(failures).toEqual([]);
  });
});

test.describe('invalid octal', () => {
  const bad = [
    '',
    '   ',
    '7',
    '75',
    '75555',
    '00755',
    '758',
    '888',
    '7a5',
    'abc',
    '-755',
    '+755',
    '7 55',
    '0x1ed',
    '1e3',
    '7.5',
    'rwx',
    '١٢٣', // non-ASCII digits
  ];
  for (const input of bad) {
    test(`rejects ${JSON.stringify(input)} with a message`, () => {
      const result = parseOctal(input);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.length).toBeGreaterThan(5);
    });
  }

  test('says which digit is out of range', () => {
    const result = parseOctal('789');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('8');
  });

  test('says how many digits it got when the length is wrong', () => {
    const result = parseOctal('75');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/3 or 4/);
  });
});

test.describe('invalid symbolic', () => {
  const bad = [
    '',
    '   ',
    'rwx',
    'rwxr-xr-', // too short
    'rwxr-xr-xx', // 10 characters, but the first is not a file type
    'rwxr-xr-x-', // too long
    '-rwxr-xr-xx', // 11 characters
    'RWXR-XR-X', // upper case r/w/x
    'rwXr-xr-x',
    'rwxr-xr-s', // s is not valid in the others slot
    'rwxr-xr-S',
    'rwtr-xr-x', // t is not valid in the owner slot
    'rwxr-Tr-x', // T is not valid in the group slot
    'xwr------', // letters in the wrong slots
    'rwzr-xr-x',
    'r-xr-xr-q',
    'rwx rwx rwx',
    '755',
    'u=rwx,g=rx,o=rx',
    'zrwxr-xr-x', // unknown file type character
  ];
  for (const input of bad) {
    test(`rejects ${JSON.stringify(input)} with a message`, () => {
      const result = parseSymbolic(input);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.length).toBeGreaterThan(5);
    });
  }

  test('names the position and the allowed characters', () => {
    const result = parseSymbolic('rwxr-xr-s');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('9');
      expect(result.error).toContain('t');
    }
  });

  test('never throws, whatever the input', () => {
    const odd = ['\u0000', '\n', 'rwxr-xr-x\n\n', '💥💥💥💥💥💥💥💥💥', 'a'.repeat(5000)];
    for (const input of odd) {
      expect(() => parseSymbolic(input)).not.toThrow();
      expect(() => parseOctal(input)).not.toThrow();
    }
  });
});

test.describe('commands', () => {
  test('755 on a plain file name', () => {
    expect(chmodCommands(0o755)).toEqual({
      numeric: 'chmod 755 file',
      symbolic: 'chmod u=rwx,g=rx,o=rx file',
    });
  });

  test('644 and 600', () => {
    expect(chmodCommands(0o644, 'notes.txt')).toEqual({
      numeric: 'chmod 644 notes.txt',
      symbolic: 'chmod u=rw,g=r,o=r notes.txt',
    });
    expect(chmodCommands(0o600).symbolic).toBe('chmod u=rw,g=,o= file');
  });

  test('no permissions at all clears every class', () => {
    expect(chmodCommands(0)).toEqual({
      numeric: 'chmod 000 file',
      symbolic: 'chmod u=,g=,o= file',
    });
  });

  test('special bits use four digits and s or t letters', () => {
    expect(chmodCommands(0o4755)).toEqual({
      numeric: 'chmod 4755 file',
      symbolic: 'chmod u=rwxs,g=rx,o=rx file',
    });
    expect(chmodCommands(0o2755).symbolic).toBe('chmod u=rwx,g=rxs,o=rx file');
    expect(chmodCommands(0o1777)).toEqual({
      numeric: 'chmod 1777 file',
      symbolic: 'chmod u=rwx,g=rwx,o=rwxt file',
    });
  });

  test('setuid without execute is s alone, matching the capital S form', () => {
    // rwSr--r-- : owner rw, setuid, no owner execute
    expect(chmodCommands(0o4644).symbolic).toBe('chmod u=rws,g=r,o=r file');
    expect(chmodCommands(0o1666).symbolic).toBe('chmod u=rw,g=rw,o=rwt file');
  });

  test('every command pair describes the same mode', () => {
    // Re-read the symbolic command the way chmod does: each class is set to
    // exactly the letters listed, and s/t add the special bit for that class.
    const failures: string[] = [];
    for (let mode = 0; mode <= MODE_MASK; mode++) {
      const commands = chmodCommands(mode);
      if (parseInt(commands.numeric.split(' ')[1], 8) !== mode) failures.push(`numeric ${mode.toString(8)}`);
      const [, clauses] = commands.symbolic.split(' ');
      let rebuilt = 0;
      for (const clause of clauses.split(',')) {
        const [who, letters] = clause.split('=');
        const shift = { u: 6, g: 3, o: 0 }[who as 'u' | 'g' | 'o'];
        if (letters.includes('r')) rebuilt |= 0o4 << shift;
        if (letters.includes('w')) rebuilt |= 0o2 << shift;
        if (letters.includes('x')) rebuilt |= 0o1 << shift;
        if (who === 'u' && letters.includes('s')) rebuilt |= 0o4000;
        if (who === 'g' && letters.includes('s')) rebuilt |= 0o2000;
        if (who === 'o' && letters.includes('t')) rebuilt |= 0o1000;
      }
      if (rebuilt !== mode) failures.push(`symbolic ${mode.toString(8)}`);
    }
    expect(failures).toEqual([]);
  });

  test('file names are quoted only when the shell needs it', () => {
    expect(quoteShellArg('file')).toBe('file');
    expect(quoteShellArg('src/app/run.sh')).toBe('src/app/run.sh');
    expect(quoteShellArg('*.sh')).toBe('*.sh');
    expect(quoteShellArg('~/bin/tool')).toBe('~/bin/tool');
    expect(quoteShellArg('my file.txt')).toBe("'my file.txt'");
    expect(quoteShellArg("it's")).toBe("'it'\\''s'");
    expect(quoteShellArg('a;rm -rf x')).toBe("'a;rm -rf x'");
    expect(quoteShellArg('$(whoami)')).toBe("'$(whoami)'");
  });

  test('a blank target falls back to "file"', () => {
    expect(chmodCommands(0o755, '').numeric).toBe('chmod 755 file');
    expect(chmodCommands(0o755, '   ').symbolic).toBe('chmod u=rwx,g=rx,o=rx file');
  });

  test('a target that starts with a dash is protected with --', () => {
    expect(chmodCommands(0o644, '-weird').numeric).toBe('chmod 644 -- -weird');
    expect(chmodCommands(0o644, '-weird').symbolic).toBe('chmod u=rw,g=r,o=r -- -weird');
  });

  test('a target with spaces is quoted inside the command', () => {
    expect(chmodCommands(0o755, 'my script.sh').numeric).toBe("chmod 755 'my script.sh'");
  });
});

test.describe('explanation', () => {
  test('755 in plain language', () => {
    const explained = explainMode(0o755);
    expect(explained.classes.map((c) => c.who)).toEqual(['owner', 'group', 'others']);
    expect(explained.classes[0].summary).toBe('can read, write and execute');
    expect(explained.classes[1].summary).toBe('can read and execute but cannot write');
    expect(explained.classes[2].summary).toBe('can read and execute but cannot write');
    expect(explained.special).toEqual([]);
    expect(explained.warnings).toEqual([]);
  });

  test('600 and 000', () => {
    const private600 = explainMode(0o600);
    expect(private600.classes[0].summary).toBe('can read and write but cannot execute');
    expect(private600.classes[1].summary).toBe('has no access');
    expect(private600.classes[2].summary).toBe('has no access');
    expect(explainMode(0).classes.every((c) => c.summary === 'has no access')).toBe(true);
  });

  test('single permissions read naturally', () => {
    expect(explainMode(0o400).classes[0].summary).toBe('can read but cannot write or execute');
    expect(explainMode(0o200).classes[0].summary).toBe('can write but cannot read or execute');
    expect(explainMode(0o100).classes[0].summary).toBe('can execute but cannot read or write');
  });

  test('777 warns that it is world-writable', () => {
    const explained = explainMode(0o777);
    expect(explained.warnings).toHaveLength(1);
    expect(explained.warnings[0]).toMatch(/world-writable/i);
  });

  test('sticky world-writable directories like /tmp do not warn', () => {
    const explained = explainMode(0o1777);
    expect(explained.warnings).toEqual([]);
    expect(explained.special).toHaveLength(1);
    expect(explained.special[0]).toMatch(/sticky/i);
  });

  test('special bits are described when set', () => {
    const explained = explainMode(0o6755);
    expect(explained.special).toHaveLength(2);
    expect(explained.special[0]).toMatch(/setuid/i);
    expect(explained.special[1]).toMatch(/setgid/i);
  });

  test('capital S and T are flagged as missing execute', () => {
    expect(explainMode(0o4644).warnings.join(' ')).toMatch(/setuid.*no execute/i);
    expect(explainMode(0o2644).warnings.join(' ')).toMatch(/setgid.*no execute/i);
    expect(explainMode(0o1666).warnings.join(' ')).toMatch(/sticky.*no execute/i);
    expect(explainMode(0o4755).warnings).toEqual([]);
  });

  test('setuid with group or world write is flagged', () => {
    expect(explainMode(0o4775).warnings.join(' ')).toMatch(/elevated/i);
    expect(explainMode(0o4757).warnings.join(' ')).toMatch(/elevated/i);
    expect(explainMode(0o4755).warnings).toEqual([]);
  });

  test('never throws and always describes all three classes', () => {
    const failures: string[] = [];
    for (let mode = 0; mode <= MODE_MASK; mode++) {
      const explained = explainMode(mode);
      const complete =
        explained.classes.length === 3 && explained.classes.every((entry) => entry.summary.length > 0);
      if (!complete) failures.push(mode.toString(8));
    }
    expect(failures).toEqual([]);
  });
});

test.describe('presets', () => {
  test('cover 644, 755, 600, 700, 775, 777 and 400 in that order', () => {
    expect(PRESETS.map((p) => p.octal)).toEqual(['644', '755', '600', '700', '775', '777', '400']);
  });

  test('every preset mode agrees with its octal text and carries a description', () => {
    for (const preset of PRESETS) {
      expect(preset.mode).toBe(parseInt(preset.octal, 8));
      expect(formatOctal(preset.mode)).toBe(preset.octal);
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.note.length).toBeGreaterThan(0);
    }
  });

  test('findPreset matches by mode and returns undefined otherwise', () => {
    expect(findPreset(0o755)?.octal).toBe('755');
    expect(findPreset(0o400)?.octal).toBe('400');
    expect(findPreset(0o4755)).toBeUndefined();
    expect(findPreset(0o641)).toBeUndefined();
  });
});
