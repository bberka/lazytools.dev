import { test, expect } from '@playwright/test';
import {
  FUNCTION_NAMES,
  MAX_SOURCE_LENGTH,
  evaluateExpression,
  formatResult,
  type AngleMode,
  type Variables,
} from '@/lib/tools/math-evaluator';

function value(source: string, angle: AngleMode = 'rad', variables: Variables = {}): number {
  const result = evaluateExpression(source, { angle, variables });
  if (!result.ok) throw new Error(`"${source}" failed: ${result.error.message}`);
  return result.value;
}

function shown(source: string, angle: AngleMode = 'rad', variables: Variables = {}): string {
  return formatResult(value(source, angle, variables));
}

function failure(source: string, angle: AngleMode = 'rad', variables: Variables = {}) {
  const result = evaluateExpression(source, { angle, variables });
  if (result.ok) throw new Error(`"${source}" should have failed but gave ${result.value}`);
  return result.error;
}

test.describe('operators and precedence', () => {
  test('multiplication binds tighter than addition', () => {
    expect(value('2 + 3 * 4')).toBe(14);
    expect(value('(2 + 3) * 4')).toBe(20);
    expect(value('10 - 4 - 3')).toBe(3); // left to right
    expect(value('100 / 5 / 4')).toBe(5);
  });

  test('power is right-associative and binds tighter than unary minus', () => {
    expect(value('2 ^ 3 ^ 2')).toBe(512); // 2 ^ 9
    expect(value('-2 ^ 2')).toBe(-4);
    expect(value('(-2) ^ 2')).toBe(4);
    expect(value('2 ^ -2')).toBe(0.25);
    expect(value('2 ** 10')).toBe(1024);
    expect(value('2 * 3 ^ 2')).toBe(18);
  });

  test('unary minus and plus stack', () => {
    expect(value('--5')).toBe(5);
    expect(value('-+-5')).toBe(5);
    expect(value('3 - -2')).toBe(5);
    expect(value('2 * -3')).toBe(-6);
  });

  test('% is the remainder and takes the sign of the left side', () => {
    expect(value('10 % 3')).toBe(1);
    expect(value('-10 % 3')).toBe(-1);
    expect(value('5.5 % 2')).toBe(1.5);
    expect(value('2 + 10 % 4 * 3')).toBe(8); // 2 + (10 % 4) * 3
  });

  test('numbers accept a leading dot, a trailing dot and exponents', () => {
    expect(value('.5 + 5.')).toBe(5.5);
    expect(value('1.5e3')).toBe(1500);
    expect(value('2E-2')).toBe(0.02);
    expect(value('1e3 + 1')).toBe(1001);
  });

  test('unicode operators are understood', () => {
    expect(value('6 × 7')).toBe(42);
    expect(value('9 ÷ 3')).toBe(3);
    expect(value('5 − 8')).toBe(-3);
  });

  test('negative zero never shows', () => {
    expect(Object.is(value('-0'), 0)).toBe(true);
    expect(shown('0 * -5')).toBe('0');
  });
});

test.describe('constants and functions', () => {
  test('pi and e', () => {
    expect(value('pi')).toBe(Math.PI);
    expect(value('e')).toBe(Math.E);
    expect(shown('pi')).toBe('3.14159265359');
    expect(shown('e')).toBe('2.71828182846');
    expect(shown('PI * 2')).toBe('6.28318530718');
  });

  test('roots, powers and logarithms', () => {
    expect(value('sqrt(144)')).toBe(12);
    expect(value('cbrt(27)')).toBe(3);
    expect(value('pow(2, 10)')).toBe(1024);
    expect(value('log(1000)')).toBe(3);
    expect(value('log2(8)')).toBe(3);
    expect(value('ln(e)')).toBe(1);
    expect(shown('exp(1)')).toBe('2.71828182846');
  });

  test('rounding functions, with halves rounded away from zero', () => {
    expect(value('floor(-1.5)')).toBe(-2);
    expect(value('ceil(-1.5)')).toBe(-1);
    expect(value('round(2.5)')).toBe(3);
    expect(value('round(-2.5)')).toBe(-3);
    expect(value('round(2.4)')).toBe(2);
    expect(value('abs(-7.25)')).toBe(7.25);
  });

  test('min and max take any number of arguments', () => {
    expect(value('min(3)')).toBe(3);
    expect(value('min(3, -1, 2)')).toBe(-1);
    expect(value('max(1, 9, 4, 7)')).toBe(9);
    expect(value('max(1, min(5, 8) * 2)')).toBe(10);
  });

  test('function and constant names are case-insensitive', () => {
    expect(value('SQRT(9) + Max(1, 2)')).toBe(5);
  });

  test('every documented function is listed', () => {
    expect([...FUNCTION_NAMES].sort()).toEqual(
      [
        'abs',
        'acos',
        'asin',
        'atan',
        'cbrt',
        'ceil',
        'cos',
        'exp',
        'floor',
        'ln',
        'log',
        'log2',
        'max',
        'min',
        'pow',
        'round',
        'sin',
        'sqrt',
        'tan',
      ].sort()
    );
  });
});

test.describe('angle mode', () => {
  test('degrees', () => {
    expect(value('sin(30)', 'deg')).toBe(0.5);
    expect(value('sin(90)', 'deg')).toBe(1);
    expect(value('sin(180)', 'deg')).toBe(0);
    expect(value('sin(-90)', 'deg')).toBe(-1);
    expect(value('cos(60)', 'deg')).toBe(0.5);
    expect(value('cos(90)', 'deg')).toBe(0);
    expect(value('cos(180)', 'deg')).toBe(-1);
    expect(value('sin(390)', 'deg')).toBe(0.5);
    expect(shown('tan(45)', 'deg')).toBe('1');
    expect(shown('sin(45)', 'deg')).toBe('0.707106781187');
    expect(shown('asin(0.5)', 'deg')).toBe('30');
    expect(shown('acos(0)', 'deg')).toBe('90');
    expect(shown('atan(1)', 'deg')).toBe('45');
  });

  test('radians', () => {
    expect(value('sin(0)')).toBe(0);
    expect(value('sin(pi)')).toBe(0); // 1.2e-16 snapped to zero
    expect(shown('sin(pi / 2)')).toBe('1');
    expect(shown('cos(pi)')).toBe('-1');
    expect(shown('cos(pi / 2)')).toBe('0');
    expect(shown('atan(1) * 4')).toBe('3.14159265359');
    expect(shown('asin(1)')).toBe('1.57079632679');
  });

  test('tan is undefined where cosine is zero', () => {
    expect(failure('tan(90)', 'deg').message).toBe('tan is undefined for this angle at position 1');
    expect(failure('tan(pi / 2)').message).toBe('tan is undefined for this angle at position 1');
    expect(failure('tan(270)', 'deg').message).toContain('undefined');
  });
});

test.describe('variables', () => {
  test('assignment returns the name and value without needing an existing variable', () => {
    const result = evaluateExpression('x = 3 * 4');
    expect(result).toEqual({ ok: true, value: 12, assignment: { name: 'x', value: 12 } });
  });

  test('variables are read from the options, names are lowercase', () => {
    expect(value('x * 2 + Y', 'rad', { x: 3, y: 1 })).toBe(7);
    expect(value('2 * ans', 'rad', { ans: 21 })).toBe(42);
  });

  test('an assignment can use earlier variables', () => {
    expect(evaluateExpression('area = pi * r ^ 2', { variables: { r: 2 } })).toEqual({
      ok: true,
      value: 4 * Math.PI,
      assignment: { name: 'area', value: 4 * Math.PI },
    });
  });

  test('constants, functions and ans cannot be assigned', () => {
    expect(failure('pi = 3').message).toBe(
      '"pi" is a constant and cannot be assigned at position 1'
    );
    expect(failure('e = 1').message).toContain('constant');
    expect(failure('sqrt = 2').message).toContain('function');
    expect(failure('ans = 2').message).toContain('set automatically');
  });

  test('names that exist on every JavaScript object are not variables', () => {
    expect(failure('constructor').message).toBe('Unknown name "constructor" at position 1');
    expect(failure('toString + 1').message).toContain('Unknown name');
    expect(failure('hasOwnProperty(1)').message).toContain('Unknown function');
  });
});

test.describe('errors carry a position', () => {
  test('unknown names and functions', () => {
    expect(failure('1 + foo')).toEqual({
      message: 'Unknown name "foo" at position 5',
      index: 4,
      length: 3,
    });
    expect(failure('2 * foo(3)')).toEqual({
      message: 'Unknown function "foo" at position 5',
      index: 4,
      length: 3,
    });
  });

  test('a function name without parentheses', () => {
    expect(failure('sqrt + 1').message).toBe('"sqrt" is a function; write sqrt(...) at position 1');
  });

  test('unexpected characters', () => {
    expect(failure('2 # 3')).toEqual({
      message: 'Unexpected "#" at position 3',
      index: 2,
      length: 1,
    });
    expect(failure('.')).toEqual({ message: 'Unexpected "." at position 1', index: 0, length: 1 });
  });

  test('parentheses', () => {
    expect(failure('(1 + 2').message).toBe('Missing ")" at position 7');
    expect(failure('1 + 2)')).toEqual({
      message: 'Unmatched ")" at position 6',
      index: 5,
      length: 1,
    });
    expect(failure('()').message).toBe('Empty parentheses at position 1');
    expect(failure('max(1, 2').message).toBe('Missing ")" at position 9');
    expect(failure('max(1 2)').message).toContain(
      'Expected "," or ")" but found "2" at position 7'
    );
  });

  test('missing operands', () => {
    expect(failure('1 +').message).toBe('The expression ends too early at position 4');
    expect(failure('* 2').message).toBe('Unexpected "*" at position 1');
    expect(failure('2 * * 3').message).toBe('Unexpected "*" at position 5');
    expect(failure('5 %').message).toBe('The expression ends too early at position 4');
  });

  test('two operands in a row suggest an operator', () => {
    expect(failure('2 3').message).toBe(
      'Unexpected "3"; put an operator such as * before it at position 3'
    );
    expect(failure('2x', 'rad', { x: 1 }).message).toContain('put an operator such as * before it');
    expect(failure('(1)(2)').message).toContain('put an operator');
    expect(failure('1.2.3').message).toContain('Unexpected ".3"');
  });

  test('a stray equals sign', () => {
    expect(failure('1 = 2').message).toBe(
      'Unexpected "="; only "name = expression" can assign at position 3'
    );
    expect(failure('x = y = 2', 'rad', { y: 1 }).message).toContain('Unexpected "="');
  });

  test('wrong number of arguments', () => {
    expect(failure('sqrt()').message).toBe('sqrt expects 1 argument, got 0 at position 1');
    expect(failure('pow(2)').message).toBe('pow expects 2 arguments, got 1 at position 1');
    expect(failure('sin(1, 2)').message).toBe('sin expects 1 argument, got 2 at position 1');
    expect(failure('min()').message).toBe('min expects at least 1 argument, got 0 at position 1');
    expect(failure('1 + sqrt(1, 2)')).toMatchObject({ index: 4, length: 10 });
  });

  test('empty input', () => {
    expect(failure('').message).toBe('Enter an expression');
    expect(failure('   ').message).toBe('Enter an expression');
  });

  test('the position counts from the real start even after spaces', () => {
    expect(failure('   4 / 0')).toMatchObject({
      message: 'Division by zero at position 6',
      index: 5,
    });
  });
});

test.describe('domain and range errors', () => {
  test('division and remainder by zero', () => {
    expect(failure('1 / 0')).toEqual({
      message: 'Division by zero at position 3',
      index: 2,
      length: 1,
    });
    expect(failure('1 / (2 - 2)').message).toBe('Division by zero at position 3');
    expect(failure('5 % 0').message).toBe('Remainder of division by zero at position 3');
    expect(failure('0 ^ -1').message).toBe(
      'Zero cannot be raised to a negative power at position 3'
    );
  });

  test('square roots, logarithms and inverse trig outside their domain', () => {
    expect(failure('sqrt(-4)').message).toBe('sqrt of a negative number at position 1');
    expect(failure('ln(0)').message).toBe('ln needs a positive number at position 1');
    expect(failure('log(-1)').message).toBe('log needs a positive number at position 1');
    expect(failure('log2(0)').message).toBe('log2 needs a positive number at position 1');
    expect(failure('asin(2)').message).toBe('asin needs a value between -1 and 1 at position 1');
    expect(failure('acos(-1.5)').message).toContain('acos needs a value');
    expect(value('sqrt(0)')).toBe(0);
  });

  test('a negative base with a fractional exponent', () => {
    expect(failure('(-8) ^ 0.5').message).toBe(
      'A negative number cannot be raised to a fractional power at position 6'
    );
    expect(value('(-8) ^ 3')).toBe(-512);
  });

  test('overflow', () => {
    expect(failure('2 ^ 2000').message).toBe('The result is too large or undefined at position 3');
    expect(failure('10 ^ 308 * 10').message).toContain('too large');
    expect(failure('1e999').message).toBe('Number is too large at position 1');
  });
});

test.describe('safety limits', () => {
  test('does not execute JavaScript', () => {
    expect(failure('alert(1)').message).toContain('Unknown function');
    expect(failure('process.exit()').message).toContain('Unexpected');
    expect(failure('1; 2').message).toContain('Unexpected ";"');
    expect(failure('this').message).toContain('Unknown name');
    expect(failure('[1]').message).toContain('Unexpected "["');
    expect(failure('`1`').message).toContain('Unexpected');
  });

  test('deeply nested input is refused instead of overflowing the stack', () => {
    const nested = `${'('.repeat(200)}1${')'.repeat(200)}`;
    expect(failure(nested).message).toContain('nested too deeply');
    expect(failure('-'.repeat(200) + '1').message).toContain('nested too deeply');
    expect(value(`${'('.repeat(50)}7${')'.repeat(50)}`)).toBe(7);
  });

  test('very long input is refused', () => {
    expect(failure('1+'.repeat(MAX_SOURCE_LENGTH)).message).toContain(
      'longer than 1000 characters'
    );
    expect(value('1+'.repeat(400) + '1')).toBe(401);
  });
});

test.describe('formatResult', () => {
  test('hides floating-point noise using 12 significant digits', () => {
    expect(shown('0.1 + 0.2')).toBe('0.3');
    expect(shown('1 / 3')).toBe('0.333333333333');
    expect(shown('2 / 3')).toBe('0.666666666667');
    expect(shown('0.1 * 3')).toBe('0.3');
    expect(shown('1.1 * 1.1')).toBe('1.21');
    expect(shown('sqrt(2)')).toBe('1.41421356237');
    expect(shown('100 / 3')).toBe('33.3333333333');
  });

  test('keeps whole numbers exact up to 2^53', () => {
    expect(formatResult(2 ** 50)).toBe('1125899906842624');
    expect(formatResult(9007199254740991)).toBe('9007199254740991');
    expect(formatResult(-42)).toBe('-42');
    expect(formatResult(0)).toBe('0');
  });

  test('uses exponent notation for huge and tiny values', () => {
    expect(formatResult(2 ** 60)).toBe('1.15292150461e+18');
    expect(formatResult(1e20)).toBe('1e+20');
    expect(formatResult(1.5e-7)).toBe('1.5e-7');
    expect(formatResult(-2.5e30)).toBe('-2.5e+30');
    expect(formatResult(0.000001)).toBe('0.000001');
    expect(formatResult(0.0001234)).toBe('0.0001234');
  });

  test('non-finite values print as they are', () => {
    expect(formatResult(Infinity)).toBe('Infinity');
    expect(formatResult(NaN)).toBe('NaN');
  });
});
