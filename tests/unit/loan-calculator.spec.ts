import { test, expect } from '@playwright/test';
import {
  CURRENCIES,
  buildLoanSummary,
  calculateLoan,
  createMoneyFormatter,
  evaluateLoan,
  formatMonths,
  getCurrency,
  groupScheduleByYear,
  scheduleToCsv,
  type LoanFields,
  type LoanInput,
  type LoanResult,
} from '@/lib/tools/loan-calculator';

function ready(input: LoanInput): LoanResult {
  const outcome = calculateLoan(input);
  if (outcome.status !== 'ready') {
    throw new Error(`expected a result, got errors: ${JSON.stringify(outcome.errors)}`);
  }
  return outcome.result;
}

function errorsOf(input: LoanInput) {
  const outcome = calculateLoan(input);
  if (outcome.status !== 'invalid') throw new Error('expected validation errors');
  return outcome.errors;
}

const MORTGAGE: LoanInput = {
  amount: 200_000,
  annualRatePercent: 6,
  term: 30,
  termUnit: 'years',
};

const FIELDS: LoanFields = { amount: '200000', rate: '6', term: '30', termUnit: 'years', extra: '' };

/** Every loan the invariants below are checked on, including awkward ones. */
const LOANS: LoanInput[] = [
  MORTGAGE,
  { amount: 100_000, annualRatePercent: 5, term: 15, termUnit: 'years' },
  { amount: 250_000, annualRatePercent: 4.5, term: 30, termUnit: 'years', extraPayment: 150 },
  { amount: 12_345.67, annualRatePercent: 7.89, term: 47, termUnit: 'months' },
  { amount: 10_000, annualRatePercent: 0, term: 3, termUnit: 'years' },
  { amount: 999.99, annualRatePercent: 29.99, term: 7, termUnit: 'months', extraPayment: 33.33 },
  { amount: 1_000_000, annualRatePercent: 0.01, term: 40, termUnit: 'years' },
  { amount: 0.01, annualRatePercent: 5, term: 30, termUnit: 'years' },
  { amount: 5, annualRatePercent: 0, term: 360, termUnit: 'months' },
  { amount: 1_500_000, annualRatePercent: 1.75, term: 25, termUnit: 'years', fractionDigits: 0 },
  { amount: 80_000, annualRatePercent: 100, term: 100, termUnit: 'years' },
  { amount: 50_000, annualRatePercent: 8, term: 1, termUnit: 'months' },
];

test.describe('monthly payment against published figures', () => {
  // The standard fixed-rate payment table, in cents.
  const published: Array<[LoanInput, number]> = [
    [MORTGAGE, 119_910],
    [{ amount: 100_000, annualRatePercent: 5, term: 15, termUnit: 'years' }, 79_079],
    [{ amount: 250_000, annualRatePercent: 4.5, term: 30, termUnit: 'years' }, 126_671],
    [{ amount: 300_000, annualRatePercent: 3.5, term: 30, termUnit: 'years' }, 134_713],
    [{ amount: 1_000_000, annualRatePercent: 7, term: 20, termUnit: 'years' }, 775_299],
  ];

  for (const [input, cents] of published) {
    test(`${input.amount} at ${input.annualRatePercent}% over ${input.term} ${input.termUnit}`, () => {
      expect(ready(input).monthlyPayment).toBe(cents);
    });
  }

  test('200,000 at 6% over 30 years is 1,199.10 a month for 360 payments', () => {
    const result = ready(MORTGAGE);
    expect(createMoneyFormatter('USD')(result.monthlyPayment)).toBe('$1,199.10');
    expect(result.paymentCount).toBe(360);
    expect(result.termMonths).toBe(360);
  });

  test('the first two rows match the amortization table', () => {
    const [first, second] = ready(MORTGAGE).schedule;
    expect(first).toEqual({
      month: 1,
      payment: 119_910,
      principal: 19_910,
      interest: 100_000,
      balance: 19_980_090,
    });
    expect(second).toEqual({
      month: 2,
      payment: 119_910,
      principal: 20_010,
      interest: 99_900,
      balance: 19_960_080,
    });
  });

  test('total interest is within a dollar of the unrounded 231,676.38', () => {
    const { totalInterest, totalPaid } = ready(MORTGAGE);
    expect(Math.abs(totalInterest - 23_167_638)).toBeLessThanOrEqual(100);
    expect(totalPaid).toBe(20_000_000 + totalInterest);
  });

  test('a term of 30 years and a term of 360 months are the same loan', () => {
    const years = ready(MORTGAGE);
    const months = ready({ ...MORTGAGE, term: 360, termUnit: 'months' });
    expect(months).toEqual(years);
  });

  test('a fractional number of years that is a whole number of months works', () => {
    const result = ready({ ...MORTGAGE, term: 2.5 });
    expect(result.termMonths).toBe(30);
    expect(result.paymentCount).toBe(30);
  });

  test('the payment grows with the rate and with the amount', () => {
    const payments = [3, 4, 5, 6, 7].map(
      (rate) => ready({ ...MORTGAGE, annualRatePercent: rate }).monthlyPayment
    );
    expect(payments).toEqual([...payments].sort((a, b) => a - b));
    expect(ready({ ...MORTGAGE, amount: 300_000 }).monthlyPayment).toBeGreaterThan(
      ready(MORTGAGE).monthlyPayment
    );
  });
});

test.describe('zero interest', () => {
  test('12,000 over 12 months is 1,000 a month with no interest', () => {
    const result = ready({ amount: 12_000, annualRatePercent: 0, term: 12, termUnit: 'months' });
    expect(result.monthlyPayment).toBe(100_000);
    expect(result.totalInterest).toBe(0);
    expect(result.totalPaid).toBe(1_200_000);
    expect(result.paymentCount).toBe(12);
    expect(result.schedule.every((row) => row.interest === 0 && row.payment === 100_000)).toBe(true);
  });

  test('an amount that does not divide evenly puts the odd cents in the last payment', () => {
    const result = ready({ amount: 10_000, annualRatePercent: 0, term: 36, termUnit: 'months' });
    expect(result.monthlyPayment).toBe(27_778);
    expect(result.finalPayment).toBe(1_000_000 - 35 * 27_778);
    expect(result.totalInterest).toBe(0);
    expect(result.totalPaid).toBe(1_000_000);
    expect(result.schedule[35].balance).toBe(0);
  });
});

test.describe('extra payments', () => {
  test('shorten the term and save interest', () => {
    const base = ready(MORTGAGE);
    const withExtra = ready({ ...MORTGAGE, extraPayment: 200 });
    expect(withExtra.monthlyPayment).toBe(base.monthlyPayment);
    expect(withExtra.paymentCount).toBeLessThan(base.paymentCount);
    expect(withExtra.totalInterest).toBeLessThan(base.totalInterest);
    expect(withExtra.savings).toEqual({
      baselinePaymentCount: base.paymentCount,
      baselineTotalInterest: base.totalInterest,
      monthsSaved: base.paymentCount - withExtra.paymentCount,
      interestSaved: base.totalInterest - withExtra.totalInterest,
    });
  });

  test('pay the loan off when the closed-form payoff time says they should', () => {
    // n = -ln(1 - A*r / (P + E)) / ln(1 + r), with the unrounded payment.
    const r = 0.06 / 12;
    const regular = (200_000 * r) / (1 - (1 + r) ** -360);
    const months = -Math.log(1 - (200_000 * r) / (regular + 200)) / Math.log(1 + r);
    const withExtra = ready({ ...MORTGAGE, extraPayment: 200 });
    expect(Math.abs(withExtra.paymentCount - months)).toBeLessThan(1.5);
    expect(withExtra.paymentCount).toBeLessThan(360);
  });

  test('a bigger extra payment saves more', () => {
    const small = ready({ ...MORTGAGE, extraPayment: 100 });
    const large = ready({ ...MORTGAGE, extraPayment: 500 });
    expect(large.paymentCount).toBeLessThan(small.paymentCount);
    expect(large.savings!.interestSaved).toBeGreaterThan(small.savings!.interestSaved);
  });

  test('every payment is the regular payment plus the extra, except the last', () => {
    const result = ready({ ...MORTGAGE, extraPayment: 200 });
    const steady = result.schedule.slice(0, -1);
    expect(steady.every((row) => row.payment === result.monthlyPayment + 20_000)).toBe(true);
    expect(result.finalPayment).toBeLessThanOrEqual(result.monthlyPayment + 20_000);
  });

  test('an extra payment bigger than the loan pays it off in one payment', () => {
    const result = ready({ ...MORTGAGE, extraPayment: 500_000 });
    expect(result.paymentCount).toBe(1);
    expect(result.schedule[0].interest).toBe(100_000);
    expect(result.finalPayment).toBe(20_000_000 + 100_000);
    expect(result.savings!.monthsSaved).toBe(359);
  });

  test('no extra payment means no savings figure', () => {
    expect(ready(MORTGAGE).savings).toBeNull();
    expect(ready({ ...MORTGAGE, extraPayment: 0 }).savings).toBeNull();
  });

  test('extra payments with zero interest save months but no interest', () => {
    const result = ready({
      amount: 12_000,
      annualRatePercent: 0,
      term: 12,
      termUnit: 'months',
      extraPayment: 500,
    });
    expect(result.paymentCount).toBe(8);
    expect(result.savings).toMatchObject({ monthsSaved: 4, interestSaved: 0 });
  });
});

test.describe('schedule invariants', () => {
  for (const input of LOANS) {
    const label = `${input.amount} at ${input.annualRatePercent}% over ${input.term} ${input.termUnit}${
      input.extraPayment ? ` + ${input.extraPayment}` : ''
    }${input.fractionDigits === 0 ? ' (whole units)' : ''}`;

    test(`${label}: the last balance is exactly zero`, () => {
      const { schedule } = ready(input);
      expect(schedule[schedule.length - 1].balance).toBe(0);
      expect(schedule.slice(0, -1).every((row) => row.balance > 0)).toBe(true);
    });

    test(`${label}: schedule totals equal the summary`, () => {
      const result = ready(input);
      const sum = (pick: (row: LoanResult['schedule'][number]) => number) =>
        result.schedule.reduce((total, row) => total + pick(row), 0);
      expect(sum((row) => row.principal)).toBe(result.amount);
      expect(sum((row) => row.interest)).toBe(result.totalInterest);
      expect(sum((row) => row.payment)).toBe(result.totalPaid);
      expect(result.totalPaid).toBe(result.amount + result.totalInterest);
      expect(result.paymentCount).toBe(result.schedule.length);
      expect(result.finalPayment).toBe(result.schedule[result.schedule.length - 1].payment);
    });

    test(`${label}: every row balances and the balance only falls`, () => {
      const result = ready(input);
      // Collect the months that break a rule so a failure names them, without one assertion per row.
      const broken: number[] = [];
      let balance = result.amount;
      result.schedule.forEach((row, index) => {
        const sound =
          row.month === index + 1 &&
          row.payment === row.principal + row.interest &&
          row.principal >= 0 &&
          row.interest >= 0 &&
          row.balance === balance - row.principal &&
          [row.payment, row.principal, row.interest, row.balance].every(Number.isInteger);
        if (!sound) broken.push(row.month);
        balance = row.balance;
      });
      expect(broken).toEqual([]);
    });

    test(`${label}: never runs past the agreed term`, () => {
      const result = ready(input);
      expect(result.paymentCount).toBeLessThanOrEqual(result.termMonths);
    });
  }

  test('the final payment is within a few cents of the regular one', () => {
    const result = ready(MORTGAGE);
    expect(Math.abs(result.finalPayment - result.monthlyPayment)).toBeLessThan(200);
  });

  test('a payment that only just covers the interest leaves the principal to the final payment', () => {
    // 30% over 100 years: the annuity payment is interest to the last cent, so nothing amortizes
    // until the closing payment, which still brings the balance to exactly zero.
    const result = ready({ amount: 80_000, annualRatePercent: 30, term: 100, termUnit: 'years' });
    expect(result.schedule[0].principal).toBe(0);
    expect(result.finalPayment).toBe(8_200_000);
    expect(result.schedule[result.schedule.length - 1].balance).toBe(0);
    expect(result.totalPaid).toBe(result.amount + result.totalInterest);
  });

  test('a tiny loan still ends instead of looping', () => {
    const result = ready({ amount: 0.01, annualRatePercent: 0, term: 30, termUnit: 'years' });
    expect(result.paymentCount).toBe(1);
    expect(result.totalPaid).toBe(1);
  });
});

test.describe('whole-unit currencies', () => {
  const yen: LoanInput = {
    amount: 1_500_000,
    annualRatePercent: 1.75,
    term: 25,
    termUnit: 'years',
    fractionDigits: 0,
  };

  test('work in whole yen, so the payment has no fraction', () => {
    const result = ready(yen);
    expect(result.fractionDigits).toBe(0);
    expect(result.amount).toBe(1_500_000);
    expect(Number.isInteger(result.monthlyPayment)).toBe(true);
    const asDollars = ready({ ...yen, fractionDigits: 2 });
    expect(Math.abs(result.monthlyPayment * 100 - asDollars.monthlyPayment)).toBeLessThanOrEqual(50);
  });

  test('evaluateLoan picks the digits from the currency', () => {
    const outcome = evaluateLoan({ ...FIELDS, amount: '1500000', rate: '1.75', term: '25' }, 'JPY');
    expect(outcome.status).toBe('ready');
    if (outcome.status === 'ready') expect(outcome.result.fractionDigits).toBe(0);
  });
});

test.describe('validation', () => {
  test('rejects a missing, zero or negative amount', () => {
    expect(errorsOf({ ...MORTGAGE, amount: 0 }).amount).toMatch(/greater than zero/);
    expect(errorsOf({ ...MORTGAGE, amount: -5 }).amount).toMatch(/greater than zero/);
    expect(errorsOf({ ...MORTGAGE, amount: Number.NaN }).amount).toBeDefined();
    expect(errorsOf({ ...MORTGAGE, amount: 0.001 }).amount).toBeDefined();
  });

  test('rejects an amount above the limit', () => {
    expect(errorsOf({ ...MORTGAGE, amount: 10_000_000_001 }).amount).toMatch(/at most 10,000,000,000/);
  });

  test('rejects a rate below 0 or above 100', () => {
    expect(errorsOf({ ...MORTGAGE, annualRatePercent: -0.1 }).rate).toMatch(/between 0 and 100/);
    expect(errorsOf({ ...MORTGAGE, annualRatePercent: 100.5 }).rate).toMatch(/between 0 and 100/);
    expect(errorsOf({ ...MORTGAGE, annualRatePercent: Number.POSITIVE_INFINITY }).rate).toBeDefined();
  });

  test('rejects a term that is zero, negative, fractional in months, or too long', () => {
    expect(errorsOf({ ...MORTGAGE, term: 0 }).term).toMatch(/greater than zero/);
    expect(errorsOf({ ...MORTGAGE, term: -3 }).term).toMatch(/greater than zero/);
    expect(errorsOf({ ...MORTGAGE, term: 2.1 }).term).toMatch(/whole number of months/);
    expect(errorsOf({ ...MORTGAGE, term: 18.5, termUnit: 'months' }).term).toMatch(/whole number/);
    expect(errorsOf({ ...MORTGAGE, term: 101 }).term).toMatch(/at most 100 years/);
    expect(errorsOf({ ...MORTGAGE, term: 1201, termUnit: 'months' }).term).toMatch(/at most 100 years/);
  });

  test('accepts the limits themselves', () => {
    expect(calculateLoan({ ...MORTGAGE, term: 100 }).status).toBe('ready');
    expect(calculateLoan({ ...MORTGAGE, term: 1, termUnit: 'months' }).status).toBe('ready');
    expect(calculateLoan({ ...MORTGAGE, annualRatePercent: 100 }).status).toBe('ready');
    expect(calculateLoan({ ...MORTGAGE, amount: 10_000_000_000 }).status).toBe('ready');
  });

  test('rejects a negative extra payment', () => {
    expect(errorsOf({ ...MORTGAGE, extraPayment: -1 }).extra).toMatch(/cannot be negative/);
  });

  test('reports every bad field at once', () => {
    const errors = errorsOf({
      amount: -1,
      annualRatePercent: 500,
      term: 0,
      termUnit: 'years',
      extraPayment: -2,
    });
    expect(Object.keys(errors).sort()).toEqual(['amount', 'extra', 'rate', 'term']);
  });
});

test.describe('typed input', () => {
  const evaluate = (changes: Partial<LoanFields>, currency?: string) =>
    evaluateLoan({ ...FIELDS, ...changes }, currency);

  test('a filled form is calculated', () => {
    const outcome = evaluate({});
    expect(outcome.status).toBe('ready');
    if (outcome.status === 'ready') expect(outcome.result.monthlyPayment).toBe(119_910);
  });

  test('an untouched form is empty, not an error', () => {
    expect(evaluate({ amount: '', rate: '', term: '', extra: '' }).status).toBe('empty');
    expect(evaluate({ amount: ' ', rate: '', term: '', extra: '  ' }).status).toBe('empty');
  });

  test('a half-filled form names the missing fields', () => {
    const outcome = evaluate({ amount: '', rate: '' });
    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') {
      expect(Object.keys(outcome.errors).sort()).toEqual(['amount', 'rate']);
      expect(outcome.errors.amount).toMatch(/Enter the loan amount/);
    }
  });

  test('an interest rate of 0 is a valid entry, a blank one is not', () => {
    expect(evaluate({ rate: '0' }).status).toBe('ready');
    expect(evaluate({ rate: '' }).status).toBe('invalid');
  });

  test('accepts thousands separators and surrounding spaces', () => {
    const outcome = evaluate({ amount: ' 200,000 ', extra: '1 000' });
    expect(outcome.status).toBe('ready');
    if (outcome.status === 'ready') {
      expect(outcome.result.amount).toBe(20_000_000);
      expect(outcome.result.extraPayment).toBe(100_000);
    }
  });

  test('accepts a leading or trailing decimal point', () => {
    expect(evaluate({ rate: '.5' }).status).toBe('ready');
    expect(evaluate({ rate: '5.' }).status).toBe('ready');
  });

  test('rejects text that is not a plain number', () => {
    for (const bad of ['abc', '1e5', '12abc', '1,5', '1.2.3', '0x10', 'Infinity', '--5', '6%']) {
      const outcome = evaluate({ rate: bad });
      expect(outcome.status, bad).toBe('invalid');
      if (outcome.status === 'invalid') expect(outcome.errors.rate, bad).toMatch(/Use a period/);
    }
  });

  test('a decimal comma is never read as a thousands separator', () => {
    const outcome = evaluate({ rate: '6,5' });
    expect(outcome.status).toBe('invalid');
  });

  test('range errors from the calculation come back on the right field', () => {
    const outcome = evaluate({ amount: '-100', term: '0' });
    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') {
      expect(Object.keys(outcome.errors).sort()).toEqual(['amount', 'term']);
    }
  });

  test('an optional extra payment may be left blank', () => {
    const outcome = evaluate({ extra: '' });
    expect(outcome.status === 'ready' && outcome.result.savings).toBeNull();
  });

  test('the term unit is honoured', () => {
    const outcome = evaluate({ term: '24', termUnit: 'months' });
    expect(outcome.status === 'ready' && outcome.result.paymentCount).toBe(24);
  });
});

test.describe('schedule by year', () => {
  test('folds 360 months into 30 years whose totals match the schedule', () => {
    const { schedule, totalInterest, totalPaid, amount } = ready(MORTGAGE);
    const years = groupScheduleByYear(schedule);
    expect(years).toHaveLength(30);
    expect(years.map((year) => year.year)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(years.every((year) => year.months === 12)).toBe(true);
    expect(years.reduce((sum, year) => sum + year.interest, 0)).toBe(totalInterest);
    expect(years.reduce((sum, year) => sum + year.payment, 0)).toBe(totalPaid);
    expect(years.reduce((sum, year) => sum + year.principal, 0)).toBe(amount);
    expect(years[29].balance).toBe(0);
  });

  test('a year ends on the balance of its twelfth month', () => {
    const { schedule } = ready(MORTGAGE);
    const years = groupScheduleByYear(schedule);
    expect(years[0].balance).toBe(schedule[11].balance);
    expect(years[1].balance).toBe(schedule[23].balance);
  });

  test('the last year is short when the term is not a whole number of years', () => {
    const { schedule } = ready({ amount: 20_000, annualRatePercent: 5, term: 30, termUnit: 'months' });
    const years = groupScheduleByYear(schedule);
    expect(years.map((year) => year.months)).toEqual([12, 12, 6]);
    expect(years[2].balance).toBe(0);
  });

  test('an empty schedule has no years', () => {
    expect(groupScheduleByYear([])).toEqual([]);
  });
});

test.describe('CSV export', () => {
  test('has a header, one line per payment and ends on a zero balance', () => {
    const csv = scheduleToCsv(ready(MORTGAGE));
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Month,Payment,Principal,Interest,Balance');
    expect(lines).toHaveLength(361);
    expect(lines[1]).toBe('1,1199.10,199.10,1000.00,199800.90');
    expect(lines[2]).toBe('2,1199.10,200.10,999.00,199600.80');
    expect(lines[360].split(',')[0]).toBe('360');
    expect(lines[360].endsWith(',0.00')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  test('amounts have no symbols or thousands separators', () => {
    const csv = scheduleToCsv(ready(MORTGAGE));
    for (const line of csv.trimEnd().split('\r\n').slice(1)) {
      expect(line).toMatch(/^\d+(,\d+\.\d{2}){4}$/);
    }
  });

  test('whole-unit currencies are written without decimals', () => {
    const csv = scheduleToCsv(
      ready({ amount: 1_200, annualRatePercent: 0, term: 12, termUnit: 'months', fractionDigits: 0 })
    );
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[1]).toBe('1,100,100,0,1100');
    expect(lines[12]).toBe('12,100,100,0,0');
  });

  test('values add up to the summary when read back', () => {
    const result = ready({ ...MORTGAGE, extraPayment: 250 });
    const rows = scheduleToCsv(result)
      .trimEnd()
      .split('\r\n')
      .slice(1)
      .map((line) => line.split(',').map(Number));
    const paid = rows.reduce((sum, row) => sum + Math.round(row[1] * 100), 0);
    expect(paid).toBe(result.totalPaid);
  });
});

test.describe('summary text', () => {
  const usd = createMoneyFormatter('USD');

  test('lists the figures', () => {
    const result = ready(MORTGAGE);
    const text = buildLoanSummary(result, usd);
    expect(text).toContain('Loan amount: $200,000.00');
    expect(text).toContain('Interest rate: 6% per year');
    expect(text).toContain('Term: 30 years (360 monthly payments)');
    expect(text).toContain('Monthly payment: $1,199.10');
    expect(text).toContain('Number of payments: 360');
    expect(text).toContain(`Total interest: ${usd(result.totalInterest)}`);
    expect(text).toContain(`Total paid: ${usd(result.totalPaid)}`);
    expect(text).not.toContain('Time saved');
  });

  test('adds the savings when there is an extra payment', () => {
    const result = ready({ ...MORTGAGE, extraPayment: 200 });
    const text = buildLoanSummary(result, usd);
    expect(text).toContain('Extra monthly payment: $200.00');
    expect(text).toContain('Monthly payment with extra: $1,399.10');
    expect(text).toContain(`Time saved: ${formatMonths(result.savings!.monthsSaved)}`);
    expect(text).toContain(`Interest saved: ${usd(result.savings!.interestSaved)}`);
    expect(text).toContain(`Paid off in: ${formatMonths(result.paymentCount)}`);
  });
});

test.describe('formatting', () => {
  test('formatMonths writes years and months', () => {
    expect(formatMonths(0)).toBe('0 months');
    expect(formatMonths(1)).toBe('1 month');
    expect(formatMonths(5)).toBe('5 months');
    expect(formatMonths(12)).toBe('1 year');
    expect(formatMonths(18)).toBe('1 year 6 months');
    expect(formatMonths(360)).toBe('30 years');
    expect(formatMonths(361)).toBe('30 years 1 month');
  });

  test('money formatter uses the currency digits', () => {
    expect(createMoneyFormatter('USD')(119_910)).toBe('$1,199.10');
    expect(createMoneyFormatter('USD')(5)).toBe('$0.05');
    expect(createMoneyFormatter('JPY')(1_199)).toBe('¥1,199');
    expect(createMoneyFormatter('EUR')(123_456_789)).toBe('€1,234,567.89');
  });

  test('every offered currency can be formatted, and an unknown code falls back to USD', () => {
    expect(CURRENCIES.map((currency) => currency.code)).toEqual([
      'USD',
      'EUR',
      'GBP',
      'TRY',
      'JPY',
      'CAD',
      'AUD',
      'INR',
    ]);
    for (const { code } of CURRENCIES) {
      expect(createMoneyFormatter(code)(123_456)).toMatch(/1,234|123,456/);
    }
    expect(getCurrency('XXX').code).toBe('USD');
    expect(getCurrency('JPY').fractionDigits).toBe(0);
  });
});
