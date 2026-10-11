/**
 * The three percentage calculations of the Percentage Calculator, from the
 * text of its two fields to the text of its result.
 */

import { formatNumber, readNumber, type NumberStyle } from '@/lib/tools/calculator-numbers';

export type PercentageMode = 'percent-of' | 'what-percent' | 'percent-change';

export interface PercentageResult {
  /** The answer, ready to show and to copy. Empty when there is none. */
  value: string;
  /** The calculation written out, or a prompt while a field is still empty. */
  detail: string;
  /** Why there is no answer. Empty when there is one or a field is still empty. */
  error: string;
}

// Two decimals, as a percentage is usually read, but a small answer keeps two
// significant digits instead of showing as 0.00.
const RESULT_STYLE: NumberStyle = {
  minFractionDigits: 2,
  maxFractionDigits: 2,
  minSignificantDigits: 2,
};

// The operands are repeated as typed rather than rounded to two decimals, so
// the calculation in the detail line stays true.
const OPERAND_STYLE: NumberStyle = {
  minFractionDigits: 2,
  maxFractionDigits: 10,
  minSignificantDigits: 3,
};

const formatOperand = (value: number) => formatNumber(value, OPERAND_STYLE);

const failure = (error: string): PercentageResult => ({ value: '', detail: '', error });

/**
 * Calculates one mode from the two field texts:
 * - `percent-of`: x% of y
 * - `what-percent`: x is what percent of y
 * - `percent-change`: the change from x to y, relative to the size of x
 */
export function calculatePercentage(mode: PercentageMode, x: string, y: string): PercentageResult {
  const xField = readNumber(x);
  const yField = readNumber(y);

  if (xField.kind === 'invalid' || yField.kind === 'invalid') {
    return failure('Enter plain numbers such as 1250 or 12.5.');
  }

  if (xField.kind === 'empty' || yField.kind === 'empty') {
    return {
      value: '',
      detail: 'Enter numbers in both fields to calculate.',
      error: '',
    };
  }

  const xValue = xField.value;
  const yValue = yField.value;

  if (mode === 'what-percent' && yValue === 0) {
    return failure('Result is undefined because the second value cannot be zero in this mode.');
  }

  if (mode === 'percent-change' && xValue === 0) {
    return failure('Percentage change is undefined when the starting value is zero.');
  }

  const calculated =
    mode === 'percent-of'
      ? (xValue / 100) * yValue
      : mode === 'what-percent'
        ? (xValue / yValue) * 100
        : // Divided by the size of the starting value, so a rise from a
          // negative start is reported as an increase.
          ((yValue - xValue) / Math.abs(xValue)) * 100;

  if (!Number.isFinite(calculated)) {
    return failure('The result is too large to calculate.');
  }

  const answer = formatNumber(calculated, RESULT_STYLE);

  switch (mode) {
    case 'percent-of':
      return {
        value: answer,
        detail: `${formatOperand(xValue)}% of ${formatOperand(yValue)} = ${answer}`,
        error: '',
      };
    case 'what-percent':
      return {
        value: `${answer}%`,
        detail: `${formatOperand(xValue)} is ${answer}% of ${formatOperand(yValue)}`,
        error: '',
      };
    case 'percent-change':
      return {
        value: `${answer}%`,
        detail: `Change from ${formatOperand(xValue)} to ${formatOperand(yValue)} = ${answer}%`,
        error: '',
      };
  }
}
