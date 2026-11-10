/**
 * Compound interest with optional monthly contributions.
 *
 * The model: money is added once a month, at the start or at the end of the
 * month, and interest accrues at the monthly rate that is equivalent to the
 * chosen compounding frequency, `(1 + rate / n) ^ (n / 12) - 1`. With monthly
 * compounding that is simply `rate / 12`, so 1000 at 5% for 10 years is
 * `1000 * (1 + 0.05 / 12) ^ 120 = 1647.01`. A contribution made part-way
 * through an annual compounding period therefore earns its share of interest
 * instead of waiting for the period to end.
 *
 * The balance is carried at full floating-point precision and rounded half up
 * to a whole cent only when it is reported. Reported rows are whole cents and
 * add up exactly: each year's interest is the rounded closing balance minus
 * the rounded opening balance minus that year's contributions. Nothing here
 * touches the DOM, so it runs in Node.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContributionTiming = 'start' | 'end';

export interface CompoundingOption {
  /** Compounding periods per year. */
  perYear: number;
  value: string;
  label: string;
}

export const COMPOUNDING_OPTIONS: readonly CompoundingOption[] = [
  { perYear: 1, value: 'annually', label: 'Annually' },
  { perYear: 2, value: 'semiannually', label: 'Semi-annually' },
  { perYear: 4, value: 'quarterly', label: 'Quarterly' },
  { perYear: 12, value: 'monthly', label: 'Monthly' },
  { perYear: 52, value: 'weekly', label: 'Weekly' },
  { perYear: 365, value: 'daily', label: 'Daily' },
];

export const DEFAULT_COMPOUNDING = 'monthly';

export function getCompounding(value: string): CompoundingOption {
  return (
    COMPOUNDING_OPTIONS.find((option) => option.value === value) ??
    COMPOUNDING_OPTIONS.find((option) => option.value === DEFAULT_COMPOUNDING)!
  );
}

/** What the calculator accepts. Money is in the currency's units (1000, not 100000 cents). */
export interface CompoundInput {
  principal: number;
  /** Nominal annual rate in percent, so 5 means 5%. */
  annualRatePercent: number;
  years: number;
  /** Compounding periods per year. */
  compoundsPerYear: number;
  /** Added every month. Default 0. */
  monthlyContribution?: number;
  /** Whether a contribution is made at the start or the end of its month. Default 'end'. */
  timing?: ContributionTiming;
}

export interface YearRow {
  /** 1-based year. The last row may cover fewer than 12 months. */
  year: number;
  months: number;
  /** All money values are whole cents. */
  startBalance: number;
  contributions: number;
  interest: number;
  endBalance: number;
}

export interface ChartPoint {
  year: number;
  /** Months elapsed at this point, 0 for the opening point. */
  months: number;
  balance: number;
  /** Principal plus everything contributed so far, in cents. */
  contributed: number;
}

export interface CompoundResult {
  /** Whole cents. */
  principal: number;
  monthlyContribution: number;
  annualRatePercent: number;
  years: number;
  months: number;
  compoundsPerYear: number;
  timing: ContributionTiming;
  finalBalance: number;
  totalContributed: number;
  interestEarned: number;
  rows: YearRow[];
  chart: ChartPoint[];
}

export type CompoundField = 'principal' | 'rate' | 'years' | 'contribution';
export type CompoundFieldErrors = Partial<Record<CompoundField | 'inputs', string>>;

export type CompoundOutcome =
  | { status: 'invalid'; errors: CompoundFieldErrors }
  | { status: 'ready'; result: CompoundResult };

/** The form as typed. */
export interface CompoundFields {
  principal: string;
  rate: string;
  years: string;
  compounding: string;
  contribution: string;
  timing: ContributionTiming;
}

/** `empty` means nothing has been typed yet, which is not an error. */
export type CompoundEvaluation = { status: 'empty' } | CompoundOutcome;

const COMPOUND_LIMITS = {
  maxAmount: 10_000_000_000,
  maxRatePercent: 100,
  maxYears: 100,
} as const;

// ── Calculation ───────────────────────────────────────────────────────────────

/**
 * Rounds half up to a whole cent. The value is first trimmed to 15 significant
 * digits so that floating-point noise (a true 0.125 computed as
 * 0.12499999999999999) cannot tip an exact half the wrong way.
 */
export function roundCents(dollars: number): number {
  return Math.round(Number((dollars * 100).toPrecision(15)));
}

/** The interest rate for one month that matches `perYear` compounding periods a year. */
export function monthlyGrowthRate(annualRatePercent: number, compoundsPerYear: number): number {
  const periodRate = annualRatePercent / 100 / compoundsPerYear;
  return Math.expm1((compoundsPerYear / 12) * Math.log1p(periodRate));
}

function isWholeNumber(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-6;
}

function validateInput(input: CompoundInput): CompoundFieldErrors {
  const errors: CompoundFieldErrors = {};
  const contribution = input.monthlyContribution ?? 0;

  if (!Number.isFinite(input.principal) || input.principal < 0) {
    errors.principal = 'Starting amount cannot be negative.';
  } else if (input.principal > COMPOUND_LIMITS.maxAmount) {
    errors.principal = `Starting amount can be at most ${COMPOUND_LIMITS.maxAmount.toLocaleString('en-US')}.`;
  }

  if (
    !Number.isFinite(input.annualRatePercent) ||
    input.annualRatePercent < 0 ||
    input.annualRatePercent > COMPOUND_LIMITS.maxRatePercent
  ) {
    errors.rate = `Interest rate must be between 0 and ${COMPOUND_LIMITS.maxRatePercent} percent.`;
  }

  const months = input.years * 12;
  if (!Number.isFinite(input.years) || input.years <= 0) {
    errors.years = 'Number of years must be greater than zero.';
  } else if (input.years > COMPOUND_LIMITS.maxYears) {
    errors.years = `Number of years can be at most ${COMPOUND_LIMITS.maxYears}.`;
  } else if (!isWholeNumber(months)) {
    errors.years = 'Number of years must be a whole number of months (2.5 years is 30 months).';
  }

  if (!Number.isFinite(contribution) || contribution < 0) {
    errors.contribution = 'Monthly contribution cannot be negative.';
  } else if (contribution > COMPOUND_LIMITS.maxAmount) {
    errors.contribution = `Monthly contribution can be at most ${COMPOUND_LIMITS.maxAmount.toLocaleString('en-US')}.`;
  }

  if (
    !errors.principal &&
    !errors.contribution &&
    roundCents(input.principal) === 0 &&
    roundCents(contribution) === 0
  ) {
    errors.inputs = 'Enter a starting amount or a monthly contribution.';
  }

  return errors;
}

/**
 * Grows the money month by month. Invalid input comes back as per-field
 * messages instead of an exception.
 */
export function calculateCompoundInterest(input: CompoundInput): CompoundOutcome {
  const errors = validateInput(input);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const timing = input.timing ?? 'end';
  const principal = roundCents(input.principal);
  const contribution = roundCents(input.monthlyContribution ?? 0);
  const months = Math.round(input.years * 12);
  const monthlyRate = monthlyGrowthRate(input.annualRatePercent, input.compoundsPerYear);

  const rows: YearRow[] = [];
  const chart: ChartPoint[] = [{ year: 0, months: 0, balance: principal, contributed: principal }];

  let balance = principal; // exact, in cents
  let openingCents = principal;
  let contributedCents = principal;

  for (let month = 1; month <= months; month++) {
    balance =
      timing === 'start'
        ? (balance + contribution) * (1 + monthlyRate)
        : balance * (1 + monthlyRate) + contribution;
    contributedCents += contribution;

    if (month % 12 === 0 || month === months) {
      const monthsInRow = month % 12 === 0 ? 12 : month % 12;
      const closingCents = roundCents(balance / 100);
      const yearContributions = contribution * monthsInRow;
      rows.push({
        year: Math.ceil(month / 12),
        months: monthsInRow,
        startBalance: openingCents,
        contributions: yearContributions,
        interest: closingCents - openingCents - yearContributions,
        endBalance: closingCents,
      });
      chart.push({
        year: month / 12,
        months: month,
        balance: closingCents,
        contributed: contributedCents,
      });
      openingCents = closingCents;
    }
  }

  const finalBalance = openingCents;
  return {
    status: 'ready',
    result: {
      principal,
      monthlyContribution: contribution,
      annualRatePercent: input.annualRatePercent,
      years: input.years,
      months,
      compoundsPerYear: input.compoundsPerYear,
      timing,
      finalBalance,
      totalContributed: contributedCents,
      interestEarned: finalBalance - contributedCents,
      rows,
      chart,
    },
  };
}

// ── Reading the form ──────────────────────────────────────────────────────────

const NUMBER_HINT = 'Enter a number such as 1000 or 1,000.50.';
const NUMBER_PATTERN = /^-?(\d+(\.\d*)?|\.\d+)$/;
const GROUPED_PATTERN = /^-?\d{1,3}(,\d{3})+(\.\d*)?$/;

type NumberRead = { value: number } | { error: string };

/**
 * Reads typed text as a number. Spaces are ignored and commas are accepted
 * only as thousands separators ("1,000"), so "6,5" is rejected instead of
 * silently becoming 65. A blank field is `blankError`, or 0 when `blankError`
 * is null (an optional field).
 */
function readNumber(text: string, blankError: string | null): NumberRead {
  const trimmed = text.replace(/\s+/g, '');
  if (trimmed === '') return blankError === null ? { value: 0 } : { error: blankError };
  const plain = GROUPED_PATTERN.test(trimmed) ? trimmed.replace(/,/g, '') : trimmed;
  if (!NUMBER_PATTERN.test(plain)) return { error: NUMBER_HINT };
  return { value: Number(plain) };
}

/** Calculates from the form as typed. */
export function evaluateCompoundInterest(fields: CompoundFields): CompoundEvaluation {
  if (
    [fields.principal, fields.rate, fields.years, fields.contribution].every(
      (text) => text.trim() === ''
    )
  ) {
    return { status: 'empty' };
  }

  const principal = readNumber(fields.principal, null);
  const rate = readNumber(fields.rate, 'Enter the annual interest rate (0 for no interest).');
  const years = readNumber(fields.years, 'Enter the number of years.');
  const contribution = readNumber(fields.contribution, null);

  const errors: CompoundFieldErrors = {};
  if ('error' in principal) errors.principal = principal.error;
  if ('error' in rate) errors.rate = rate.error;
  if ('error' in years) errors.years = years.error;
  if ('error' in contribution) errors.contribution = contribution.error;
  if ('error' in principal || 'error' in rate || 'error' in years || 'error' in contribution) {
    return { status: 'invalid', errors };
  }

  return calculateCompoundInterest({
    principal: principal.value,
    annualRatePercent: rate.value,
    years: years.value,
    compoundsPerYear: getCompounding(fields.compounding).perYear,
    monthlyContribution: contribution.value,
    timing: fields.timing,
  });
}

// ── Output ────────────────────────────────────────────────────────────────────

/** Formats whole cents as money: `164701` is `$1,647.01` in USD. The locale is fixed. */
export function createCentsFormatter(currencyCode: string): (cents: number) => string {
  let formatter: Intl.NumberFormat;
  try {
    formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode });
  } catch {
    formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  }
  return (cents) => formatter.format(cents / 100);
}

/** A copyable plain-text summary of the result. */
export function buildCompoundSummary(
  result: CompoundResult,
  formatMoney: (cents: number) => string
): string {
  const frequency =
    COMPOUNDING_OPTIONS.find((option) => option.perYear === result.compoundsPerYear)?.label ??
    `${result.compoundsPerYear} times a year`;
  const lines = [
    'Compound interest',
    `Starting amount: ${formatMoney(result.principal)}`,
    `Monthly contribution: ${formatMoney(result.monthlyContribution)} (${result.timing === 'start' ? 'start' : 'end'} of month)`,
    `Annual rate: ${result.annualRatePercent}% compounded ${frequency.toLowerCase()}`,
    `Years: ${result.years}`,
    '',
    `Final balance: ${formatMoney(result.finalBalance)}`,
    `Total contributed: ${formatMoney(result.totalContributed)}`,
    `Interest earned: ${formatMoney(result.interestEarned)}`,
  ];
  return lines.join('\n');
}

/** The year-by-year table as CSV, with plain decimal money values. */
export function rowsToCsv(result: CompoundResult): string {
  const dollars = (cents: number) => (cents / 100).toFixed(2);
  const lines = ['Year,Start balance,Contributions,Interest,End balance'];
  for (const row of result.rows) {
    lines.push(
      [
        row.year,
        dollars(row.startBalance),
        dollars(row.contributions),
        dollars(row.interest),
        dollars(row.endBalance),
      ].join(',')
    );
  }
  return lines.join('\n');
}

// ── Chart geometry ────────────────────────────────────────────────────────────

export interface ChartGeometry {
  /** Closed path under the balance line, for the filled area. */
  balanceArea: string;
  balanceLine: string;
  contributedLine: string;
  /** Y positions and cent values of the horizontal grid lines. */
  yTicks: Array<{ y: number; cents: number }>;
  /** X positions and year labels along the bottom. */
  xTicks: Array<{ x: number; year: number }>;
}

/** A "nice" step (1, 2, 2.5, 5 times a power of ten) that gives about `count` intervals. */
function niceStep(max: number, count: number): number {
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

const fixed = (value: number) => Number(value.toFixed(2));

/**
 * Turns the chart points into SVG paths inside a `width` by `height` box with
 * the given inner padding. The vertical axis runs from zero to a round number
 * at or above the final balance.
 */
export function buildChartGeometry(
  points: readonly ChartPoint[],
  box: { width: number; height: number; left: number; right: number; top: number; bottom: number }
): ChartGeometry {
  const { width, height, left, right, top, bottom } = box;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const lastYear = points[points.length - 1]?.year ?? 0;
  const maxCents = Math.max(1, ...points.map((point) => Math.max(point.balance, point.contributed)));
  const stepCents = niceStep(maxCents, 4);
  const axisMax = Math.ceil(maxCents / stepCents) * stepCents;

  const x = (year: number) => fixed(left + (lastYear === 0 ? 0 : (year / lastYear) * plotWidth));
  const y = (cents: number) => fixed(top + plotHeight - (cents / axisMax) * plotHeight);

  const line = (pick: (point: ChartPoint) => number) =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.year)} ${y(pick(point))}`).join(' ');

  const balanceLine = line((point) => point.balance);
  const baseline = fixed(top + plotHeight);
  const balanceArea = points.length
    ? `${balanceLine} L${x(lastYear)} ${baseline} L${x(points[0].year)} ${baseline} Z`
    : '';

  const yTicks: ChartGeometry['yTicks'] = [];
  for (let cents = 0; cents <= axisMax + 1e-6; cents += stepCents) {
    yTicks.push({ y: y(cents), cents });
  }

  // About five labels along the bottom, always on whole years.
  const wholeYears = Math.floor(lastYear);
  const yearStep = Math.max(1, Math.ceil(wholeYears / 5));
  const xTicks: ChartGeometry['xTicks'] = [];
  for (let year = 0; year <= wholeYears; year += yearStep) xTicks.push({ x: x(year), year });

  return {
    balanceArea,
    balanceLine,
    contributedLine: line((point) => point.contributed),
    yTicks,
    xTicks,
  };
}
