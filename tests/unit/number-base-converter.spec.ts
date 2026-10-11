import { test, expect } from '@playwright/test';
import { convertNumberBase, type NumberBase } from '@/lib/tools/number-base-converter';

const ok = (binary: string, octal: string, decimal: string, hex: string) => ({
  status: 'ok',
  values: { binary, octal, decimal, hex },
});

const errorOf = (input: string, base: NumberBase): string => {
  const result = convertNumberBase(input, base);

  return result.status === 'error' ? result.error : `not an error: ${result.status}`;
};

test.describe('convertNumberBase', () => {
  test('converts from every base to all four', () => {
    const expected = ok('11111111', '377', '255', 'FF');

    expect(convertNumberBase('255', 'decimal')).toEqual(expected);
    expect(convertNumberBase('11111111', 'binary')).toEqual(expected);
    expect(convertNumberBase('377', 'octal')).toEqual(expected);
    expect(convertNumberBase('FF', 'hex')).toEqual(expected);
  });

  test('reads hexadecimal in either case and writes it in upper case', () => {
    expect(convertNumberBase('dead', 'hex')).toEqual(
      ok('1101111010101101', '157255', '57005', 'DEAD')
    );
    expect(convertNumberBase('DeAd', 'hex')).toEqual(convertNumberBase('dead', 'hex'));
  });

  test('converts zero and ignores leading zeros', () => {
    expect(convertNumberBase('0', 'decimal')).toEqual(ok('0', '0', '0', '0'));
    expect(convertNumberBase('0007', 'decimal')).toEqual(ok('111', '7', '7', '7'));
  });

  test('keeps the sign of a negative number in every base', () => {
    expect(convertNumberBase('-10', 'decimal')).toEqual(ok('-1010', '-12', '-10', '-A'));
    expect(convertNumberBase('-ff', 'hex')).toEqual(ok('-11111111', '-377', '-255', '-FF'));
    expect(convertNumberBase('\u221210', 'decimal')).toEqual(ok('-1010', '-12', '-10', '-A'));
    expect(convertNumberBase('+7', 'decimal')).toEqual(ok('111', '7', '7', '7'));
    expect(convertNumberBase('-0', 'decimal')).toEqual(ok('0', '0', '0', '0'));
  });

  // Only blank text counted as empty, so spaces alone showed
  // "Invalid input for selected base".
  test('treats blank text as empty', () => {
    expect(convertNumberBase('', 'decimal')).toEqual({ status: 'empty' });
    expect(convertNumberBase('   ', 'hex')).toEqual({ status: 'empty' });
    expect(convertNumberBase(' 42\n', 'decimal')).toEqual(ok('101010', '52', '42', '2A'));
  });

  test('accepts the prefix of the chosen base', () => {
    expect(convertNumberBase('0xFF', 'hex')).toEqual(ok('11111111', '377', '255', 'FF'));
    expect(convertNumberBase('0XFF', 'hex')).toEqual(ok('11111111', '377', '255', 'FF'));
    expect(convertNumberBase('-0x10', 'hex')).toEqual(ok('-10000', '-20', '-16', '-10'));
  });

  // parseInt stopped at the letter and returned 0 for these.
  test('accepts the binary and octal prefixes too', () => {
    expect(convertNumberBase('0b1010', 'binary')).toEqual(ok('1010', '12', '10', 'A'));
    expect(convertNumberBase('0o17', 'octal')).toEqual(ok('1111', '17', '15', 'F'));
  });

  test('reads the prefix of another base as digits where they are digits', () => {
    // 0b1 is the hexadecimal number B1.
    expect(convertNumberBase('0b1', 'hex')).toEqual(ok('10110001', '261', '177', 'B1'));
    expect(errorOf('0x10', 'decimal')).toContain('"x" is not a valid decimal digit');
  });

  // parseInt stopped at the space: "1111 0000" converted as 15.
  test('reads digits grouped with spaces or underscores', () => {
    expect(convertNumberBase('1111 0000', 'binary')).toEqual(ok('11110000', '360', '240', 'F0'));
    expect(convertNumberBase('ff_ff', 'hex')).toEqual(
      ok('1111111111111111', '177777', '65535', 'FFFF')
    );
  });

  // parseInt converted the digits before the first bad one: octal 129 came
  // out as 10, binary 102 as 2 and decimal 12abc as 12, with no error.
  test('refuses a digit that does not belong to the base', () => {
    expect(convertNumberBase('129', 'octal')).toEqual({
      status: 'error',
      error: '"9" is not a valid octal digit. Octal uses the digits 0 to 7.',
    });
    expect(convertNumberBase('102', 'binary')).toEqual({
      status: 'error',
      error: '"2" is not a valid binary digit. Binary uses only 0 and 1.',
    });
    expect(convertNumberBase('12abc', 'decimal')).toEqual({
      status: 'error',
      error: '"a" is not a valid decimal digit. Decimal uses the digits 0 to 9.',
    });
    expect(convertNumberBase('fg', 'hex')).toEqual({
      status: 'error',
      error:
        '"g" is not a valid hexadecimal digit. Hexadecimal uses the digits 0 to 9 and the letters A to F.',
    });
  });

  // 1.5 converted as 1.
  test('refuses fractions', () => {
    expect(errorOf('1.5', 'decimal')).toBe('Only whole numbers can be converted.');
    expect(errorOf('1,000', 'decimal')).toBe('Only whole numbers can be converted.');
    expect(errorOf('a.b', 'hex')).toBe('Only whole numbers can be converted.');
  });

  test('refuses a sign or prefix with no digits', () => {
    expect(errorOf('-', 'decimal')).toBe('Enter at least one decimal digit.');
    expect(errorOf('0x', 'hex')).toBe('Enter at least one hexadecimal digit.');
    expect(errorOf('--5', 'decimal')).toContain('"-" is not a valid decimal digit');
  });

  // Numbers went through a double, so anything above 2^53 came out wrong.
  test('converts numbers beyond 2^53 exactly', () => {
    expect(convertNumberBase('9007199254740993', 'decimal')).toEqual(
      ok(
        `1${'0'.repeat(52)}1`,
        `4${'0'.repeat(16)}1`,
        '9007199254740993',
        '20000000000001'
      )
    );
    expect(convertNumberBase('FFFFFFFFFFFFFFFF', 'hex')).toEqual(
      ok('1'.repeat(64), `1${'7'.repeat(21)}`, '18446744073709551615', 'FFFFFFFFFFFFFFFF')
    );
  });

  // The decimal result of a large number was written as "1e+21".
  test('writes large numbers out in full', () => {
    const result = convertNumberBase('1000000000000000000000', 'decimal');

    expect(result.status).toBe('ok');

    if (result.status === 'ok') {
      expect(result.values.decimal).toBe('1000000000000000000000');
      expect(result.values.hex).toBe('3635C9ADC5DEA00000');
    }
  });

  test('round-trips a long value through every base', () => {
    const start = '123456789012345678901234567890';
    const first = convertNumberBase(start, 'decimal');

    expect(first.status).toBe('ok');

    if (first.status === 'ok') {
      for (const base of ['binary', 'octal', 'hex'] as const) {
        const back = convertNumberBase(first.values[base], base);

        expect(back.status === 'ok' ? back.values.decimal : back.status, base).toBe(start);
      }
    }
  });
});
