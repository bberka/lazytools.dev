import { describe, expect, test } from 'vite-plus/test';
import {
  DEFAULT_OPTIONS,
  EXAMPLE_TEXT,
  emailProblem,
  normalizeAddress,
  normalizeEmails,
  parseEntries,
  type EmailOptions,
} from '@/lib/tools/email-normalizer';

// Expected values are worked out by hand from the rules in the module header.
// Punycode forms: bücher -> bcher-kva and münchen -> mnchen-3ya (RFC 3492 style).

const normalize = (address: string, changes: Partial<EmailOptions> = {}) =>
  normalizeAddress(address, { ...DEFAULT_OPTIONS, ...changes });
const run = (text: string, changes: Partial<EmailOptions> = {}) =>
  normalizeEmails(text, { ...DEFAULT_OPTIONS, ...changes });

describe('parseEntries', () => {
  test('splits on newlines, commas and semicolons, in any mix, and skips blanks', () => {
    expect(parseEntries('a@x.com;B@X.com, c@x.com\r\n\r\n d@x.com \n')).toEqual([
      'a@x.com',
      'B@X.com',
      'c@x.com',
      'd@x.com',
    ]);
  });

  test('takes the address out of a display name and drops mailto:', () => {
    expect(parseEntries('Ada Lovelace <Ada@X.com>')).toEqual(['Ada@X.com']);
    expect(parseEntries('<ada@x.com>')).toEqual(['ada@x.com']);
    expect(parseEntries('mailto:D@x.com')).toEqual(['D@x.com']);
    expect(parseEntries('MAILTO:d@x.com')).toEqual(['d@x.com']);
  });

  test('empty input has no entries', () => {
    expect(parseEntries('')).toEqual([]);
    expect(parseEntries(' \r\n ; , ')).toEqual([]);
  });
});

describe('emailProblem', () => {
  test('accepts ordinary addresses, plus tags, quotes characters and international letters', () => {
    for (const address of [
      'user@example.com',
      'first.last+tag@sub.example.co.uk',
      "o'brien@example.com",
      'a_b-c@example.org',
      'üser@example.com',
      'info@bücher.de',
      'info@xn--bcher-kva.de',
      'x@a-b.io',
    ]) {
      expect(emailProblem(address), address).toBeNull();
    }
  });

  test('says what is wrong', () => {
    expect(emailProblem('plainaddress')).toBe('Missing @');
    expect(emailProblem('a@@b.com')).toBe('More than one @');
    expect(emailProblem('a@b@c.com')).toBe('More than one @');
    expect(emailProblem('@x.com')).toBe('Empty local part');
    expect(emailProblem('a@')).toBe('Empty domain');
    expect(emailProblem('a@b')).toBe('Domain needs a dot, like example.com');
    expect(emailProblem('a..b@x.com')).toBe('Invalid characters or dots in local part');
    expect(emailProblem('.a@x.com')).toBe('Invalid characters or dots in local part');
    expect(emailProblem('a.@x.com')).toBe('Invalid characters or dots in local part');
    expect(emailProblem('a b@x.com')).toBe('Invalid characters or dots in local part');
    expect(emailProblem('"a b"@x.com')).toBe('Invalid characters or dots in local part');
    expect(emailProblem('a@-x.com')).toBe('Invalid domain');
    expect(emailProblem('a@x-.com')).toBe('Invalid domain');
    expect(emailProblem('a@x..com')).toBe('Invalid domain');
    expect(emailProblem('a@x.com.')).toBe('Invalid domain');
    expect(emailProblem('a@x_y.com')).toBe('Invalid domain');
    expect(emailProblem('a@x.c')).toBe('Invalid domain');
    expect(emailProblem('a@192.168.0.1')).toBe('Invalid domain');
  });

  test('length limits', () => {
    expect(emailProblem(`${'a'.repeat(64)}@x.com`)).toBeNull();
    expect(emailProblem(`${'a'.repeat(65)}@x.com`)).toBe('Local part is longer than 64 characters');
    expect(emailProblem(`a@${'b'.repeat(63)}.com`)).toBeNull();
    expect(emailProblem(`a@${'b'.repeat(64)}.com`)).toBe('Invalid domain');
    const longDomain = `${'b'.repeat(60)}.`.repeat(5) + 'com';
    expect(emailProblem(`a@${longDomain}`)).toBe('Domain is longer than 253 characters');
  });
});

describe('normalizeAddress', () => {
  test('lower-cases the domain always and the local part by default', () => {
    expect(normalize('User@EXAMPLE.COM')).toBe('user@example.com');
    expect(normalize('User@EXAMPLE.COM', { lowercaseLocal: false })).toBe('User@example.com');
  });

  test('Gmail: removes dots and the +tag, and googlemail becomes gmail', () => {
    expect(normalize('John.Doe+News@Gmail.com')).toBe('johndoe@gmail.com');
    expect(normalize('a.b@googlemail.com')).toBe('ab@gmail.com');
    expect(normalize('a.b.c+x+y@GMAIL.COM')).toBe('abc@gmail.com');
    expect(normalize('John.Doe+News@Gmail.com', { gmailRules: false })).toBe(
      'john.doe+news@gmail.com'
    );
    expect(normalize('a.b@googlemail.com', { gmailRules: false })).toBe('a.b@googlemail.com');
  });

  test('Gmail rules leave other providers alone', () => {
    expect(normalize('first.last+tag@example.com')).toBe('first.last+tag@example.com');
    expect(normalize('a.b@mygmail.com')).toBe('a.b@mygmail.com');
  });

  test('plus tags of other providers are removed only when asked', () => {
    expect(normalize('user+tag@example.com', { stripPlusTags: true })).toBe('user@example.com');
    expect(normalize('user+a+b@example.com', { stripPlusTags: true })).toBe('user@example.com');
    expect(normalize('user+tag@example.com')).toBe('user+tag@example.com');
    expect(normalize('+tag@example.com', { stripPlusTags: true })).toBe('+tag@example.com');
    expect(normalize('first.last+x@example.com', { stripPlusTags: true })).toBe(
      'first.last@example.com'
    );
  });

  test('international domains are written in ASCII, or left alone', () => {
    expect(normalize('info@bücher.de')).toBe('info@xn--bcher-kva.de');
    expect(normalize('Info@MÜNCHEN.de')).toBe('info@xn--mnchen-3ya.de');
    expect(normalize('info@bücher.de', { idnToAscii: false })).toBe('info@bücher.de');
    expect(normalize('info@Bücher.de')).toBe('info@xn--bcher-kva.de');
    expect(normalize('info@xn--bcher-kva.de')).toBe('info@xn--bcher-kva.de');
  });
});

describe('normalizeEmails', () => {
  test('finds duplicates after normalization and keeps the first one', () => {
    const result = run('A.B@gmail.com\nab+x@gmail.com\nab@googlemail.com\nc@x.com');
    expect(result.entries.map((entry) => entry.normalized)).toEqual([
      'ab@gmail.com',
      'ab@gmail.com',
      'ab@gmail.com',
      'c@x.com',
    ]);
    expect(result.entries.map((entry) => entry.duplicateOf)).toEqual([null, 1, 1, null]);
    expect(result.output).toBe('ab@gmail.com\nc@x.com');
    expect(result.stats).toEqual({
      total: 4,
      valid: 4,
      invalid: 0,
      unique: 2,
      duplicates: 2,
      changed: 3,
    });
  });

  test('can keep the repeats in the output', () => {
    expect(run('A@x.com\na@x.com', { removeDuplicates: false }).output).toBe('a@x.com\na@x.com');
    expect(run('A@x.com\na@x.com').output).toBe('a@x.com');
  });

  test('with the local part case kept, A@x.com and a@x.com differ', () => {
    const result = run('A@x.com\na@x.com', { lowercaseLocal: false });
    expect(result.stats.duplicates).toBe(0);
    expect(result.output).toBe('A@x.com\na@x.com');
  });

  test('invalid addresses are reported, not normalized, and never count as duplicates', () => {
    const result = run('bad\nbad\na@x.com');
    expect(
      result.entries.map((entry) => [
        entry.valid,
        entry.reason,
        entry.normalized,
        entry.duplicateOf,
      ])
    ).toEqual([
      [false, 'Missing @', '', null],
      [false, 'Missing @', '', null],
      [true, '', 'a@x.com', null],
    ]);
    expect(result.output).toBe('a@x.com');
    expect(result.stats).toEqual({
      total: 3,
      valid: 1,
      invalid: 2,
      unique: 1,
      duplicates: 0,
      changed: 0,
    });
  });

  test('an address that Gmail rules would empty is invalid', () => {
    const result = run('+tag@gmail.com');
    expect(result.entries[0]).toMatchObject({
      valid: false,
      reason: 'Empty local part',
      normalized: '',
    });
    expect(run('...@gmail.com').entries[0].valid).toBe(false);
  });

  test('mixed separators, CRLF, display names and mailto: in one batch', () => {
    const result = run('a@x.com;B@X.com, c@x.com\r\n\r\nmailto:D@x.com\r\nAda <ADA@x.com>');
    expect(result.entries.map((entry) => entry.original)).toEqual([
      'a@x.com',
      'B@X.com',
      'c@x.com',
      'D@x.com',
      'ADA@x.com',
    ]);
    expect(result.output).toBe('a@x.com\nb@x.com\nc@x.com\nd@x.com\nada@x.com');
    expect(result.entries.map((entry) => entry.position)).toEqual([1, 2, 3, 4, 5]);
  });

  test('empty input gives nothing', () => {
    const result = run('');
    expect(result.entries).toEqual([]);
    expect(result.output).toBe('');
    expect(result.stats).toEqual({
      total: 0,
      valid: 0,
      invalid: 0,
      unique: 0,
      duplicates: 0,
      changed: 0,
    });
  });

  test('international letters in the local part are valid and lower-cased', () => {
    expect(run('Üser@Example.com').output).toBe('üser@example.com');
  });

  test('the example text', () => {
    const result = run(EXAMPLE_TEXT);
    expect(result.output).toBe('johndoe@gmail.com\nada@example.com\ninfo@xn--bcher-kva.de');
    expect(result.entries.map((entry) => entry.reason)).toEqual([
      '',
      '',
      '',
      '',
      'Missing @',
      '',
      'Empty domain',
    ]);
    expect(result.entries.map((entry) => entry.duplicateOf)).toEqual([
      null,
      1,
      null,
      null,
      null,
      3,
      null,
    ]);
    expect(result.stats).toEqual({
      total: 7,
      valid: 5,
      invalid: 2,
      unique: 3,
      duplicates: 2,
      changed: 4,
    });
  });
});
