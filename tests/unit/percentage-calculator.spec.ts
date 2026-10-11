import { test, expect } from '@playwright/test';
import { calculatePercentage } from '@/lib/tools/percentage-calculator';

test.describe('calculatePercentage', () => {
  test('calculates X% of Y', () => {
    expect(calculatePercentage('percent-of', '20', '150')).toEqual({
      value: '30.00',
      detail: '20.00% of 150.00 = 30.00',
      error: '',
    });
  });

  test('calculates what percent X is of Y', () => {
    expect(calculatePercentage('what-percent', '30', '60')).toEqual({
      value: '50.00%',
      detail: '30.00 is 50.00% of 60.00',
      error: '',
    });
  });

  test('calculates the percentage change from X to Y', () => {
    expect(calculatePercentage('percent-change', '100', '120')).toEqual({
      value: '20.00%',
      detail: 'Change from 100.00 to 120.00 = 20.00%',
      error: '',
    });
    expect(calculatePercentage('percent-change', '100', '80').value).toBe('-20.00%');
    expect(calculatePercentage('percent-change', '50', '50').value).toBe('0.00%');
  });

  test('reads thousands separators and surrounding spaces', () => {
    expect(calculatePercentage('percent-of', ' 10 ', '1,250')).toEqual({
      value: '125.00',
      detail: '10.00% of 1,250.00 = 125.00',
      error: '',
    });
  });

  test('rounds an ordinary result to two decimals', () => {
    expect(calculatePercentage('what-percent', '1', '3').value).toBe('33.33%');
    expect(calculatePercentage('percent-of', '7', '100').value).toBe('7.00');
  });

  test('prompts while a field is empty or only has a sign', () => {
    const prompt = { value: '', detail: 'Enter numbers in both fields to calculate.', error: '' };

    expect(calculatePercentage('percent-of', '', '')).toEqual(prompt);
    expect(calculatePercentage('percent-of', '20', '   ')).toEqual(prompt);
    expect(calculatePercentage('what-percent', '-', '60')).toEqual(prompt);
  });

  test('reports text that is not a number', () => {
    const invalid = { value: '', detail: '', error: 'Enter plain numbers such as 1250 or 12.5.' };

    expect(calculatePercentage('percent-of', 'abc', '150')).toEqual(invalid);
    expect(calculatePercentage('percent-of', '20', '50%')).toEqual(invalid);
    // An invalid field is reported even while the other one is still empty.
    expect(calculatePercentage('percent-of', 'abc', '')).toEqual(invalid);
  });

  // "1,5" used to be read as 15, giving 30.00 here, and a lone "," as 0.
  test('reads a decimal comma as a decimal', () => {
    expect(calculatePercentage('percent-of', '1,5', '200')).toEqual({
      value: '3.00',
      detail: '1.50% of 200.00 = 3.00',
      error: '',
    });
    expect(calculatePercentage('percent-of', ',', '150')).toEqual({
      value: '',
      detail: 'Enter numbers in both fields to calculate.',
      error: '',
    });
  });

  test('reports a zero divisor', () => {
    expect(calculatePercentage('what-percent', '30', '0')).toEqual({
      value: '',
      detail: '',
      error: 'Result is undefined because the second value cannot be zero in this mode.',
    });
    expect(calculatePercentage('percent-change', '0', '120')).toEqual({
      value: '',
      detail: '',
      error: 'Percentage change is undefined when the starting value is zero.',
    });
    // Zero is fine where nothing is divided by it.
    expect(calculatePercentage('percent-of', '0', '150').value).toBe('0.00');
    expect(calculatePercentage('what-percent', '0', '60').value).toBe('0.00%');
  });

  // The change was divided by the signed starting value, so a rise from -50
  // to 50 came out as -200%.
  test('reports a rise from a negative starting value as an increase', () => {
    expect(calculatePercentage('percent-change', '-50', '50')).toEqual({
      value: '200.00%',
      detail: 'Change from -50.00 to 50.00 = 200.00%',
      error: '',
    });
    expect(calculatePercentage('percent-change', '-100', '-150').value).toBe('-50.00%');
    expect(calculatePercentage('percent-change', '-100', '-50').value).toBe('50.00%');
  });

  // Every result was cut to two decimals, so 1 of 100,000 showed as 0.00%.
  test('keeps a small result instead of rounding it to zero', () => {
    expect(calculatePercentage('what-percent', '1', '100000')).toEqual({
      value: '0.001%',
      detail: '1.00 is 0.001% of 100,000.00',
      error: '',
    });
    expect(calculatePercentage('percent-of', '0.001', '5').value).toBe('0.00005');
  });

  // The operands were rounded to two decimals too: 0.125% of 200 was shown
  // as "0.13% of 200.00 = 0.25".
  test('repeats the operands as typed in the detail line', () => {
    expect(calculatePercentage('percent-of', '0.125', '200')).toEqual({
      value: '0.25',
      detail: '0.125% of 200.00 = 0.25',
      error: '',
    });
    expect(calculatePercentage('what-percent', '33.3333', '100').detail).toBe(
      '33.3333 is 33.33% of 100.00'
    );
  });

  // 0% of -5 is negative zero, which Intl writes as "-0.00".
  test('never shows a signed zero', () => {
    expect(calculatePercentage('percent-of', '0', '-5').value).toBe('0.00');
    expect(calculatePercentage('what-percent', '0', '-5').value).toBe('0.00%');
    expect(calculatePercentage('percent-of', '0', '-5').detail).toBe('0.00% of -5.00 = 0.00');
  });

  test('reports a result too large to calculate', () => {
    expect(calculatePercentage('percent-of', '1e300', '1e300')).toEqual({
      value: '',
      detail: '',
      error: 'The result is too large to calculate.',
    });
  });

  test('writes a very large result in exponent form', () => {
    expect(calculatePercentage('percent-of', '100', '1e30').value).toBe('1e+30');
  });
});
