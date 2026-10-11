import { test, expect } from '@playwright/test';
import { calculateBmi, getBmiCategory, type BmiInput } from '@/lib/tools/bmi-calculator';

const BLANK: BmiInput = {
  unitSystem: 'metric',
  weightKg: '',
  heightCm: '',
  weightLb: '',
  heightFeet: '',
  heightInches: '',
};

const metric = (weightKg: string, heightCm: string) =>
  calculateBmi({ ...BLANK, unitSystem: 'metric', weightKg, heightCm });

const us = (weightLb: string, heightFeet: string, heightInches: string) =>
  calculateBmi({ ...BLANK, unitSystem: 'us', weightLb, heightFeet, heightInches });

test.describe('getBmiCategory', () => {
  test('includes the lower bound of each CDC range', () => {
    expect(getBmiCategory(18.4).id).toBe('underweight');
    expect(getBmiCategory(18.5).id).toBe('healthy');
    expect(getBmiCategory(24.9).id).toBe('healthy');
    expect(getBmiCategory(25).id).toBe('overweight');
    expect(getBmiCategory(29.9).id).toBe('overweight');
    expect(getBmiCategory(30).id).toBe('obesity-1');
    expect(getBmiCategory(34.9).id).toBe('obesity-1');
    expect(getBmiCategory(35).id).toBe('obesity-2');
    expect(getBmiCategory(39.9).id).toBe('obesity-2');
    expect(getBmiCategory(40).id).toBe('obesity-3');
  });

  test('names the category and its range', () => {
    expect(getBmiCategory(22)).toEqual({
      id: 'healthy',
      label: 'Healthy Weight',
      detail: '18.5 to less than 25',
    });
  });
});

test.describe('calculateBmi', () => {
  test('calculates from metric units', () => {
    expect(metric('72', '175')).toEqual({
      bmi: '23.5',
      category: { id: 'healthy', label: 'Healthy Weight', detail: '18.5 to less than 25' },
      error: '',
      detail: 'BMI = weight (kg) / height (m)^2',
    });
  });

  test('calculates from US customary units', () => {
    const result = us('159', '5', '9');

    expect(result.bmi).toBe('23.5');
    expect(result.category?.id).toBe('healthy');
    expect(result.error).toBe('');
  });

  test('gives the same BMI for the same person in either system', () => {
    // 6 ft 0 in is 182.88 cm, and 200 lb is 90.718474 kg.
    expect(us('200', '6', '0').bmi).toBe(metric('90.718474', '182.88').bmi);
    // Height given entirely in inches.
    expect(us('200', '0', '72').bmi).toBe(us('200', '6', '0').bmi);
  });

  test('reads only the fields of the chosen unit system', () => {
    const result = calculateBmi({
      unitSystem: 'metric',
      weightKg: '72',
      heightCm: '175',
      weightLb: 'abc',
      heightFeet: '-1',
      heightInches: '',
    });

    expect(result.bmi).toBe('23.5');
  });

  // The category was read from the unrounded BMI: 24.96 showed as 25.0 next
  // to "Healthy Weight, 18.5 to less than 25".
  test('puts the BMI in the category its displayed value belongs to', () => {
    const upper = metric('76.44', '175');

    expect(upper.bmi).toBe('25.0');
    expect(upper.category?.id).toBe('overweight');

    const lower = metric('56.6', '175');

    expect(lower.bmi).toBe('18.5');
    expect(lower.category?.id).toBe('healthy');

    // Just below the rounding point nothing changes.
    const below = metric('76.4', '175');

    expect(below.bmi).toBe('24.9');
    expect(below.category?.id).toBe('healthy');
  });

  test('prompts while a field is empty', () => {
    expect(metric('', '175')).toEqual({
      bmi: '',
      category: null,
      error: '',
      detail: 'Enter weight and height to calculate BMI.',
    });
    expect(us('159', '5', '')).toEqual({
      bmi: '',
      category: null,
      error: '',
      detail: 'Enter weight, feet, and inches to calculate BMI.',
    });
  });

  test('reports zero and negative measurements', () => {
    expect(metric('0', '175').error).toBe('Weight and height must be greater than zero.');
    expect(metric('72', '-175').error).toBe('Weight and height must be greater than zero.');
    expect(us('159', '5', '-1').error).toBe(
      'Weight and height values must be valid positive numbers.'
    );
    expect(us('0', '5', '9').error).toBe('Weight and height values must be valid positive numbers.');
    expect(us('159', '0', '0').error).toBe('Height must be greater than zero.');
  });

  test('reports text that is not a number', () => {
    const invalid = {
      bmi: '',
      category: null,
      error: 'Enter weight and height as plain numbers such as 72 or 72.5.',
      detail: '',
    };

    expect(metric('abc', '175')).toEqual(invalid);
    expect(us('159', 'five', '9')).toEqual(invalid);
  });

  // "72,5" used to be read as 725 kg, a BMI of 236.7.
  test('reads a decimal comma as a decimal', () => {
    expect(metric('72,5', '175').bmi).toBe(metric('72.5', '175').bmi);
    expect(metric('72,5', '175').bmi).toBe('23.7');
  });

  // The quotient overflowed to Infinity and was shown as "∞ kg/m²".
  test('reports measurements too extreme to divide', () => {
    expect(metric('1e308', '1e-200')).toEqual({
      bmi: '',
      category: null,
      error: 'Those values are too extreme to calculate a BMI.',
      detail: '',
    });
  });
});
