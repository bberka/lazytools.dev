/**
 * Adult Body Mass Index for the BMI Calculator: from the text of the weight
 * and height fields to the BMI and its CDC screening category.
 */

import { formatNumber, readNumber } from '@/lib/tools/calculator-numbers';

export type BmiUnitSystem = 'metric' | 'us';

export type BmiCategoryId =
  | 'underweight'
  | 'healthy'
  | 'overweight'
  | 'obesity-1'
  | 'obesity-2'
  | 'obesity-3';

export interface BmiCategory {
  id: BmiCategoryId;
  label: string;
  /** The BMI range of the category, in words. */
  detail: string;
}

/** The fields of both unit systems as typed; only the chosen system is read. */
export interface BmiInput {
  unitSystem: BmiUnitSystem;
  weightKg: string;
  heightCm: string;
  weightLb: string;
  heightFeet: string;
  heightInches: string;
}

export interface BmiResult {
  /** The BMI to one decimal. Empty when there is none. */
  bmi: string;
  category: BmiCategory | null;
  /** Why there is no BMI. Empty when there is one or a field is still empty. */
  error: string;
  /** The formula, or a prompt while a field is still empty. */
  detail: string;
}

const KG_PER_POUND = 0.45359237;
const METERS_PER_INCH = 0.0254;
const INCHES_PER_FOOT = 12;

/** The CDC adult category for a BMI. Each range includes its lower bound. */
export function getBmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) {
    return { id: 'underweight', label: 'Underweight', detail: 'Below 18.5' };
  }

  if (bmi < 25) {
    return { id: 'healthy', label: 'Healthy Weight', detail: '18.5 to less than 25' };
  }

  if (bmi < 30) {
    return { id: 'overweight', label: 'Overweight', detail: '25 to less than 30' };
  }

  if (bmi < 35) {
    return { id: 'obesity-1', label: 'Class 1 Obesity', detail: '30 to less than 35' };
  }

  if (bmi < 40) {
    return { id: 'obesity-2', label: 'Class 2 Obesity', detail: '35 to less than 40' };
  }

  return { id: 'obesity-3', label: 'Class 3 Obesity', detail: '40 or greater' };
}

const prompt = (detail: string): BmiResult => ({ bmi: '', category: null, error: '', detail });
const failure = (error: string): BmiResult => ({ bmi: '', category: null, error, detail: '' });

const INVALID_NUMBER = 'Enter weight and height as plain numbers such as 72 or 72.5.';

/** Calculates the BMI and its category from the fields of the chosen unit system. */
export function calculateBmi(input: BmiInput): BmiResult {
  let weightKg: number;
  let heightMeters: number;

  if (input.unitSystem === 'metric') {
    const weight = readNumber(input.weightKg);
    const height = readNumber(input.heightCm);

    if (weight.kind === 'invalid' || height.kind === 'invalid') {
      return failure(INVALID_NUMBER);
    }

    if (weight.kind === 'empty' || height.kind === 'empty') {
      return prompt('Enter weight and height to calculate BMI.');
    }

    if (weight.value <= 0 || height.value <= 0) {
      return failure('Weight and height must be greater than zero.');
    }

    weightKg = weight.value;
    heightMeters = height.value / 100;
  } else {
    const weight = readNumber(input.weightLb);
    const feet = readNumber(input.heightFeet);
    const inches = readNumber(input.heightInches);

    if (weight.kind === 'invalid' || feet.kind === 'invalid' || inches.kind === 'invalid') {
      return failure(INVALID_NUMBER);
    }

    if (weight.kind === 'empty' || feet.kind === 'empty' || inches.kind === 'empty') {
      return prompt('Enter weight, feet, and inches to calculate BMI.');
    }

    if (weight.value <= 0 || feet.value < 0 || inches.value < 0) {
      return failure('Weight and height values must be valid positive numbers.');
    }

    const totalInches = feet.value * INCHES_PER_FOOT + inches.value;

    if (totalInches <= 0) {
      return failure('Height must be greater than zero.');
    }

    weightKg = weight.value * KG_PER_POUND;
    heightMeters = totalInches * METERS_PER_INCH;
  }

  const exact = weightKg / (heightMeters * heightMeters);

  if (!Number.isFinite(exact)) {
    return failure('Those values are too extreme to calculate a BMI.');
  }

  // The category is read from the BMI as displayed, to one decimal, so the
  // two cannot disagree: 24.96 shows as 25.0 and is in the range from 25.
  const bmi = Number(exact.toFixed(1));

  return {
    bmi: formatNumber(bmi, { minFractionDigits: 1, maxFractionDigits: 1 }),
    category: getBmiCategory(bmi),
    error: '',
    detail: 'BMI = weight (kg) / height (m)^2',
  };
}
