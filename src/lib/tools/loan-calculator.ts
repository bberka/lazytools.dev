/**
 * Fixed-rate loan repayment: the monthly payment, the full amortization
 * schedule, and what an extra monthly payment saves.
 *
 * Every money value in a result is a whole number of the currency's smallest
 * unit ("minor units": cents for USD, whole yen for JPY), so rows add up
 * exactly and the final payment can bring the balance to exactly zero. The
 * regular payment is the textbook annuity payment rounded to the nearest
 * minor unit, each month's interest is rounded the same way, and the last
 * payment takes up whatever the rounding left over. Nothing here touches the
 * DOM, so it runs in Node.
 */

// ── Currencies ────────────────────────────────────────────────────────────────

export interface Currency {
  /** ISO 4217 code, as understood by `Intl.NumberFormat`. */
  code: string;
  name: string;
  /** Digits after the decimal point in the currency's smallest unit. */
  fractionDigits: 0 | 2;
}

export const CURRENCIES: readonly Currency[] = [
  { code: 'USD', name: 'US Dollar', fractionDigits: 2 },
  { code: 'EUR', name: 'Euro', fractionDigits: 2 },
  { code: 'GBP', name: 'British Pound', fractionDigits: 2 },
  { code: 'TRY', name: 'Turkish Lira', fractionDigits: 2 },
  { code: 'JPY', name: 'Japanese Yen', fractionDigits: 0 },
  { code: 'CAD', name: 'Canadian Dollar', fractionDigits: 2 },
  { code: 'AUD', name: 'Australian Dollar', fractionDigits: 2 },
  { code: 'INR', name: 'Indian Rupee', fractionDigits: 2 },
];

export const DEFAULT_CURRENCY = 'USD';

/** The currency with this code; an unknown code falls back to USD. */
export function getCurrency(code: string): Currency {
  return CURRENCIES.find((currency) => currency.code === code) ?? CURRENCIES[0];
}

/**
 * Formats a minor-unit amount as money: `119910` is `$1,199.10` in USD and
 * `1199` is `¥1,199` in JPY. The locale is fixed so the text is the same on
 * the server and in the browser.
 */
export function createMoneyFormatter(currencyCode: string): (minor: number) => string {
  const { code, fractionDigits } = getCurrency(currencyCode);
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const unit = 10 ** fractionDigits;
  return (minor) => formatter.format(minor / unit);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type TermUnit = 'years' | 'months';

/** What the calculator accepts, with amounts as plain numbers in the currency (200000, not 20000000). */
export interface LoanInput {
  amount: number;
  /** Nominal annual rate in percent, so 6 means 6%. Interest compounds monthly. */
  annualRatePercent: number;
  term: number;
  termUnit: TermUnit;
  /** Paid on top of every regular payment. Default 0. */
  extraPayment?: number;
  /** Decimals of the currency's smallest unit: 2 for most, 0 for JPY. Default 2. */
  fractionDigits?: 0 | 2;
}

export interface ScheduleRow {
  /** 1-based payment number. */
  month: number;
  /** Everything paid this month: principal plus interest, extra payment included. */
  payment: number;
  principal: number;
  interest: number;
  /** What is still owed after this payment. */
  balance: number;
}

export interface ExtraPaymentSavings {
  /** Payments the loan would take with no extra payment. */
  baselinePaymentCount: number;
  baselineTotalInterest: number;
  monthsSaved: number;
  interestSaved: number;
}

export interface LoanResult {
  fractionDigits: 0 | 2;
  annualRatePercent: number;
  /** The agreed term, which the extra payment can cut short. */
  termMonths: number;
  /** Loan amount. */
  amount: number;
  /** The extra payment added to every regular payment (0 when there is none). */
  extraPayment: number;
  /** The regular payment, without any extra payment. */
  monthlyPayment: number;
  /** Month-by-month rows of the schedule that includes the extra payment. */
  schedule: ScheduleRow[];
  paymentCount: number;
  totalInterest: number;
  /** Principal plus interest, which is also the sum of every payment. */
  totalPaid: number;
  /** The last payment, adjusted to clear the balance. */
  finalPayment: number;
  /** Null when there is no extra payment. */
  savings: ExtraPaymentSavings | null;
}

export type LoanField = 'amount' | 'rate' | 'term' | 'extra';
export type LoanFieldErrors = Partial<Record<LoanField, string>>;

export type LoanOutcome =
  | { status: 'invalid'; errors: LoanFieldErrors }
  | { status: 'ready'; result: LoanResult };

/** The form as typed. */
export interface LoanFields {
  amount: string;
  rate: string;
  term: string;
  termUnit: TermUnit;
  extra: string;
}

/** `empty` means nothing has been typed yet, which is not an error. */
export type LoanEvaluation = { status: 'empty' } | LoanOutcome;

export const LOAN_LIMITS = {
  maxAmount: 10_000_000_000,
  maxRatePercent: 100,
  maxTermMonths: 1200,
} as const;

// ── Calculation ───────────────────────────────────────────────────────────────

/**
 * Rounds half up. The value is first rounded to six decimals so that
 * floating-point noise (a true 99999.5 computed as 99999.49999999999) cannot
 * tip an exact half the wrong way.
 */
function roundHalfUp(value: number): number {
  return Math.round(Math.round(value * 1e6) / 1e6);
}

function toMinor(amount: number, fractionDigits: 0 | 2): number {
  return roundHalfUp(amount * 10 ** fractionDigits);
}

/** The term in months. Not rounded: 2.1 years is 25.2, which validation rejects. */
function termInMonths(term: number, unit: TermUnit): number {
  return unit === 'years' ? term * 12 : term;
}

function isWholeNumber(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-6;
}

/** Rounded annuity payment in minor units, never below one unit so a tiny loan still ends. */
function regularPayment(principal: number, monthlyRate: number, termMonths: number): number {
  let exact = principal / termMonths;
  if (monthlyRate > 0) {
    // principal * r / (1 - (1 + r)^-n), through log1p/expm1 so a tiny rate does not cancel to zero.
    const annuity = (principal * monthlyRate) / -Math.expm1(-termMonths * Math.log1p(monthlyRate));
    if (Number.isFinite(annuity)) exact = annuity;
  }
  return Math.max(1, roundHalfUp(exact));
}

/**
 * Pays the loan off month by month. A payment never exceeds what is owed, and
 * the payment for the last agreed month (or any month after it) clears the
 * balance whatever it is, so the loop always ends with a balance of exactly 0.
 */
function amortize(
  principal: number,
  monthlyRate: number,
  termMonths: number,
  payment: number,
  extra: number
): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let balance = principal;
  for (let month = 1; balance > 0; month++) {
    const interest = roundHalfUp(balance * monthlyRate);
    const owed = balance + interest;
    const paid = month >= termMonths ? owed : Math.min(payment + extra, owed);
    balance = owed - paid;
    rows.push({ month, payment: paid, principal: paid - interest, interest, balance });
  }
  return rows;
}

function sumInterest(rows: readonly ScheduleRow[]): number {
  return rows.reduce((sum, row) => sum + row.interest, 0);
}

function validateInput(input: LoanInput, fractionDigits: 0 | 2): LoanFieldErrors {
  const errors: LoanFieldErrors = {};
  const { amount, annualRatePercent, term, termUnit } = input;
  const extra = input.extraPayment ?? 0;

  if (!Number.isFinite(amount) || toMinor(amount, fractionDigits) < 1) {
    errors.amount = 'Loan amount must be greater than zero.';
  } else if (amount > LOAN_LIMITS.maxAmount) {
    errors.amount = `Loan amount can be at most ${LOAN_LIMITS.maxAmount.toLocaleString('en-US')}.`;
  }

  if (
    !Number.isFinite(annualRatePercent) ||
    annualRatePercent < 0 ||
    annualRatePercent > LOAN_LIMITS.maxRatePercent
  ) {
    errors.rate = `Interest rate must be between 0 and ${LOAN_LIMITS.maxRatePercent} percent.`;
  }

  const months = termInMonths(term, termUnit);
  if (!Number.isFinite(term) || term <= 0) {
    errors.term = 'Loan term must be greater than zero.';
  } else if (!isWholeNumber(months)) {
    errors.term =
      termUnit === 'years'
        ? 'Loan term must be a whole number of months (2.5 years is 30 months).'
        : 'Loan term in months must be a whole number.';
  } else if (Math.round(months) > LOAN_LIMITS.maxTermMonths) {
    errors.term = `Loan term can be at most ${LOAN_LIMITS.maxTermMonths / 12} years (${LOAN_LIMITS.maxTermMonths.toLocaleString('en-US')} months).`;
  } else if (Math.round(months) < 1) {
    errors.term = 'Loan term must be at least one month.';
  }

  if (!Number.isFinite(extra) || extra < 0) {
    errors.extra = 'Extra payment cannot be negative.';
  } else if (extra > LOAN_LIMITS.maxAmount) {
    errors.extra = `Extra payment can be at most ${LOAN_LIMITS.maxAmount.toLocaleString('en-US')}.`;
  }

  return errors;
}

/**
 * Works out the repayment of a fixed-rate loan. Invalid input comes back as
 * per-field messages instead of an exception.
 */
export function calculateLoan(input: LoanInput): LoanOutcome {
  const fractionDigits = input.fractionDigits ?? 2;
  const errors = validateInput(input, fractionDigits);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const amount = toMinor(input.amount, fractionDigits);
  const extraPayment = toMinor(input.extraPayment ?? 0, fractionDigits);
  const termMonths = Math.round(termInMonths(input.term, input.termUnit));
  const monthlyRate = input.annualRatePercent / 1200;

  const monthlyPayment = regularPayment(amount, monthlyRate, termMonths);
  const schedule = amortize(amount, monthlyRate, termMonths, monthlyPayment, extraPayment);
  const totalInterest = sumInterest(schedule);

  let savings: ExtraPaymentSavings | null = null;
  if (extraPayment > 0) {
    const baseline = amortize(amount, monthlyRate, termMonths, monthlyPayment, 0);
    const baselineTotalInterest = sumInterest(baseline);
    savings = {
      baselinePaymentCount: baseline.length,
      baselineTotalInterest,
      monthsSaved: baseline.length - schedule.length,
      interestSaved: baselineTotalInterest - totalInterest,
    };
  }

  return {
    status: 'ready',
    result: {
      fractionDigits,
      annualRatePercent: input.annualRatePercent,
      termMonths,
      amount,
      extraPayment,
      monthlyPayment,
      schedule,
      paymentCount: schedule.length,
      totalInterest,
      totalPaid: amount + totalInterest,
      finalPayment: schedule[schedule.length - 1].payment,
      savings,
    },
  };
}

// ── Typed input ───────────────────────────────────────────────────────────────

const NUMBER_HINT = 'Enter a number such as 6.5. Use a period for decimals.';
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

/** Calculates the loan from the form as typed, for the given currency code. */
export function evaluateLoan(
  fields: LoanFields,
  currencyCode: string = DEFAULT_CURRENCY
): LoanEvaluation {
  if ([fields.amount, fields.rate, fields.term, fields.extra].every((text) => text.trim() === '')) {
    return { status: 'empty' };
  }

  const amount = readNumber(fields.amount, 'Enter the loan amount.');
  const rate = readNumber(fields.rate, 'Enter the annual interest rate (0 for no interest).');
  const term = readNumber(fields.term, 'Enter the loan term.');
  const extra = readNumber(fields.extra, null);

  const errors: LoanFieldErrors = {};
  if ('error' in amount) errors.amount = amount.error;
  if ('error' in rate) errors.rate = rate.error;
  if ('error' in term) errors.term = term.error;
  if ('error' in extra) errors.extra = extra.error;
  if ('error' in amount || 'error' in rate || 'error' in term || 'error' in extra) {
    return { status: 'invalid', errors };
  }

  return calculateLoan({
    amount: amount.value,
    annualRatePercent: rate.value,
    term: term.value,
    termUnit: fields.termUnit,
    extraPayment: extra.value,
    fractionDigits: getCurrency(currencyCode).fractionDigits,
  });
}

// ── Schedule views and exports ────────────────────────────────────────────────

export interface YearRow {
  /** 1-based year of the loan. */
  year: number;
  /** Payments made in the year; fewer than 12 in the last year. */
  months: number;
  payment: number;
  principal: number;
  interest: number;
  /** What is still owed at the end of the year. */
  balance: number;
}

/** Folds the monthly schedule into one row per loan year. */
export function groupScheduleByYear(schedule: readonly ScheduleRow[]): YearRow[] {
  const years: YearRow[] = [];
  for (const row of schedule) {
    const year = Math.ceil(row.month / 12);
    let current = years[years.length - 1];
    if (!current || current.year !== year) {
      current = { year, months: 0, payment: 0, principal: 0, interest: 0, balance: 0 };
      years.push(current);
    }
    current.months += 1;
    current.payment += row.payment;
    current.principal += row.principal;
    current.interest += row.interest;
    current.balance = row.balance;
  }
  return years;
}

/** A minor-unit amount as plain decimal text, with no symbol or separators: `119910` is `1199.10`. */
function toDecimalText(minor: number, fractionDigits: 0 | 2): string {
  if (fractionDigits === 0) return String(minor);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** The monthly schedule as CSV: a header row, then one row per payment, amounts as plain decimals. */
export function scheduleToCsv(result: LoanResult): string {
  const lines = ['Month,Payment,Principal,Interest,Balance'];
  for (const row of result.schedule) {
    lines.push(
      [row.payment, row.principal, row.interest, row.balance].reduce(
        (line, minor) => `${line},${toDecimalText(minor, result.fractionDigits)}`,
        String(row.month)
      )
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** A length of time in months as words: `30 years`, `1 year 6 months`, `5 months`. */
export function formatMonths(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
  if (rest > 0 || years === 0) parts.push(`${rest} ${rest === 1 ? 'month' : 'months'}`);
  return parts.join(' ');
}

/** A few lines of plain text for sharing, using `formatMoney` for every amount. */
export function buildLoanSummary(
  result: LoanResult,
  formatMoney: (minor: number) => string
): string {
  const lines = [
    'Loan summary',
    `Loan amount: ${formatMoney(result.amount)}`,
    `Interest rate: ${result.annualRatePercent}% per year`,
    `Term: ${formatMonths(result.termMonths)} (${result.termMonths} monthly payments)`,
    `Monthly payment: ${formatMoney(result.monthlyPayment)}`,
  ];
  if (result.savings) {
    lines.push(
      `Extra monthly payment: ${formatMoney(result.extraPayment)}`,
      `Monthly payment with extra: ${formatMoney(result.monthlyPayment + result.extraPayment)}`
    );
  }
  lines.push(
    `Number of payments: ${result.paymentCount}`,
    `Final payment: ${formatMoney(result.finalPayment)}`,
    `Total interest: ${formatMoney(result.totalInterest)}`,
    `Total paid: ${formatMoney(result.totalPaid)}`
  );
  if (result.savings) {
    lines.push(
      `Paid off in: ${formatMonths(result.paymentCount)}`,
      `Time saved: ${formatMonths(result.savings.monthsSaved)}`,
      `Interest saved: ${formatMoney(result.savings.interestSaved)}`
    );
  }
  return lines.join('\n');
}
