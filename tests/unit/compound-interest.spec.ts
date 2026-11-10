import { describe, expect, test } from 'vite-plus/test';
import {
  COMPOUNDING_OPTIONS,
  buildChartGeometry,
  buildCompoundSummary,
  calculateCompoundInterest,
  createCentsFormatter,
  evaluateCompoundInterest,
  getCompounding,
  monthlyGrowthRate,
  roundCents,
  rowsToCsv,
  type CompoundFields,
  type CompoundInput,
  type CompoundResult,
} from '@/lib/tools/compound-interest';

function ready(input: CompoundInput): CompoundResult {
  const outcome = calculateCompoundInterest(input);
  if (outcome.status !== 'ready') {
    throw new Error(`expected a result, got errors: ${JSON.stringify(outcome.errors)}`);
  }
  return outcome.result;
}

function errorsOf(input: CompoundInput) {
  const outcome = calculateCompoundInterest(input);
  if (outcome.status !== 'invalid') throw new Error('expected validation errors');
  return outcome.errors;
}

const base: CompoundInput = {
  principal: 1000,
  annualRatePercent: 5,
  years: 10,
  compoundsPerYear: 12,
};

describe('roundCents', () => {
  test('rounds half up and ignores floating-point noise', () => {
    expect(roundCents(1647.0094976902803)).toBe(164701);
    expect(roundCents(0.125)).toBe(13);
    expect(roundCents(1.005)).toBe(101); // 1.005 * 100 is 100.49999999999999 in floating point
    expect(roundCents(0)).toBe(0);
  });
});

describe('monthlyGrowthRate', () => {
  test('monthly compounding is rate / 12', () => {
    expect(monthlyGrowthRate(12, 12)).toBeCloseTo(0.01, 12);
  });

  test('annual compounding grows exactly the annual rate over twelve months', () => {
    expect((1 + monthlyGrowthRate(5, 1)) ** 12).toBeCloseTo(1.05, 12);
  });
});

describe('calculateCompoundInterest, no contributions', () => {
  test('1000 at 5% for 10 years compounded monthly is 1647.01', () => {
    const result = ready(base);
    // 1000 * (1 + 0.05 / 12) ^ 120 = 1647.0094977
    expect(result.finalBalance).toBe(164701);
    expect(result.totalContributed).toBe(100000);
    expect(result.interestEarned).toBe(64701);
  });

  test('other compounding frequencies match the closed form', () => {
    const final = (compoundsPerYear: number) => ready({ ...base, compoundsPerYear }).finalBalance;
    expect(final(1)).toBe(162889); // 1.05 ^ 10 = 1.628894627
    expect(final(2)).toBe(163862); // 1.025 ^ 20 = 1.638616440
    expect(final(4)).toBe(164362); // 1.0125 ^ 40 = 1.643619463
    expect(final(12)).toBe(164701);
    expect(final(52)).toBe(164833); // (1 + 0.05 / 52) ^ 520 = 1.648325245
    expect(final(365)).toBe(164866); // (1 + 0.05 / 365) ^ 3650 = 1.648664814
  });

  test('annual compounding builds an exact year by year table', () => {
    const result = ready({ principal: 100, annualRatePercent: 10, years: 3, compoundsPerYear: 1 });
    expect(result.rows).toEqual([
      {
        year: 1,
        months: 12,
        startBalance: 10000,
        contributions: 0,
        interest: 1000,
        endBalance: 11000,
      },
      {
        year: 2,
        months: 12,
        startBalance: 11000,
        contributions: 0,
        interest: 1100,
        endBalance: 12100,
      },
      {
        year: 3,
        months: 12,
        startBalance: 12100,
        contributions: 0,
        interest: 1210,
        endBalance: 13310,
      },
    ]);
    expect(result.finalBalance).toBe(13310);
  });

  test('a zero rate earns nothing', () => {
    const result = ready({ ...base, annualRatePercent: 0 });
    expect(result.finalBalance).toBe(100000);
    expect(result.interestEarned).toBe(0);
  });
});

describe('calculateCompoundInterest, with contributions', () => {
  test('100 a month at 5% for 10 years, paid at the end of the month, is 15528.23', () => {
    // 100 * ((1 + 0.05 / 12) ^ 120 - 1) / (0.05 / 12) = 15528.2279
    const result = ready({ ...base, principal: 0, monthlyContribution: 100 });
    expect(result.finalBalance).toBe(1552823);
    expect(result.totalContributed).toBe(1200000);
    expect(result.interestEarned).toBe(352823);
  });

  test('paid at the start of the month the annuity is worth (1 + i) times more', () => {
    // 15528.2279 * (1 + 0.05 / 12) = 15592.9289
    const result = ready({ ...base, principal: 0, monthlyContribution: 100, timing: 'start' });
    expect(result.finalBalance).toBe(1559293);
  });

  test('principal and contributions add up: 1000 plus 100 a month is 17175.24', () => {
    const result = ready({ ...base, monthlyContribution: 100 });
    expect(result.finalBalance).toBe(1717524);
    expect(result.totalContributed).toBe(1300000);
    expect(result.interestEarned).toBe(417524);
  });

  test('1 year of 100 a month at 12% compounded monthly: 1268.25 at the end, 1280.93 at the start', () => {
    const input = {
      principal: 0,
      annualRatePercent: 12,
      years: 1,
      compoundsPerYear: 12,
      monthlyContribution: 100,
    };
    expect(ready(input).finalBalance).toBe(126825); // 100 * (1.01 ^ 12 - 1) / 0.01 = 1268.2503
    expect(ready({ ...input, timing: 'start' }).finalBalance).toBe(128093); // 1268.2503 * 1.01
  });

  test('a zero rate with contributions is plain addition', () => {
    const result = ready({
      principal: 500,
      annualRatePercent: 0,
      years: 5,
      compoundsPerYear: 12,
      monthlyContribution: 50,
    });
    expect(result.finalBalance).toBe(350000);
    expect(result.totalContributed).toBe(350000);
    expect(result.interestEarned).toBe(0);
  });

  test('contributions are rounded to whole cents', () => {
    const result = ready({
      ...base,
      annualRatePercent: 0,
      years: 1,
      principal: 0,
      monthlyContribution: 10.005,
    });
    expect(result.monthlyContribution).toBe(1001);
    expect(result.totalContributed).toBe(12012);
  });
});

describe('table and chart', () => {
  const result = ready({ ...base, monthlyContribution: 100 });

  test('every row adds up exactly and rows chain together', () => {
    expect(result.rows).toHaveLength(10);
    let opening = result.principal;
    for (const row of result.rows) {
      expect(row.startBalance).toBe(opening);
      expect(row.startBalance + row.contributions + row.interest).toBe(row.endBalance);
      expect(row.contributions).toBe(120000);
      opening = row.endBalance;
    }
    expect(opening).toBe(result.finalBalance);
    expect(result.rows.reduce((sum, row) => sum + row.interest, 0)).toBe(result.interestEarned);
  });

  test('the first year of 1000 plus 100 a month at 5% earns 79.05', () => {
    // 1000 * (1.05116190 - 1) = 51.16 on the principal, 100 * (1.05116190 - 1) / (0.05 / 12) = 1227.89 - 1200 = 27.89 on deposits
    const first = result.rows[0];
    expect(first.endBalance).toBe(227905);
    expect(first.interest).toBe(7905);
  });

  test('chart points start at the principal and end at the final balance', () => {
    expect(result.chart).toHaveLength(11);
    expect(result.chart[0]).toEqual({ year: 0, months: 0, balance: 100000, contributed: 100000 });
    const last = result.chart[result.chart.length - 1];
    expect(last.year).toBe(10);
    expect(last.balance).toBe(result.finalBalance);
    expect(last.contributed).toBe(result.totalContributed);
  });

  test('a partial last year is reported with its months', () => {
    const partial = ready({
      principal: 1000,
      annualRatePercent: 12,
      years: 1.5,
      compoundsPerYear: 12,
    });
    expect(partial.months).toBe(18);
    expect(partial.rows).toHaveLength(2);
    expect(partial.rows[1].months).toBe(6);
    // 1000 * (1 + 0.12 / 12) ^ 18 = 1196.1475
    expect(partial.finalBalance).toBe(119615);
    expect(partial.chart[partial.chart.length - 1].year).toBe(1.5);
  });
});

describe('chart geometry', () => {
  const box = { width: 600, height: 300, left: 50, right: 10, top: 10, bottom: 30 };

  test('places the first point bottom-left of the plot and scales to a round axis', () => {
    const geometry = buildChartGeometry(
      [
        { year: 0, months: 0, balance: 0, contributed: 0 },
        { year: 1, months: 12, balance: 100000, contributed: 100000 },
      ],
      box
    );
    // 1000.00 is the largest value, so the axis runs 0 to 1000 in steps of 250.
    expect(geometry.yTicks.map((tick) => tick.cents)).toEqual([0, 25000, 50000, 75000, 100000]);
    expect(geometry.yTicks[0].y).toBe(270);
    expect(geometry.yTicks[4].y).toBe(10);
    expect(geometry.balanceLine).toBe('M50 270 L590 10');
    expect(geometry.balanceArea).toBe('M50 270 L590 10 L590 270 L50 270 Z');
    expect(geometry.xTicks).toEqual([
      { x: 50, year: 0 },
      { x: 590, year: 1 },
    ]);
  });

  test('labels about five whole years along the axis', () => {
    const points = Array.from({ length: 31 }, (_, year) => ({
      year,
      months: year * 12,
      balance: 100 * year,
      contributed: 100 * year,
    }));
    const years = buildChartGeometry(points, box).xTicks.map((tick) => tick.year);
    expect(years).toEqual([0, 6, 12, 18, 24, 30]);
  });
});

describe('validation', () => {
  test('rejects negative and out-of-range numbers per field', () => {
    expect(errorsOf({ ...base, principal: -1 }).principal).toBe(
      'Starting amount cannot be negative.'
    );
    expect(errorsOf({ ...base, annualRatePercent: 101 }).rate).toBe(
      'Interest rate must be between 0 and 100 percent.'
    );
    expect(errorsOf({ ...base, annualRatePercent: -0.1 }).rate).toBeDefined();
    expect(errorsOf({ ...base, years: 0 }).years).toBe(
      'Number of years must be greater than zero.'
    );
    expect(errorsOf({ ...base, years: 101 }).years).toBe('Number of years can be at most 100.');
    expect(errorsOf({ ...base, monthlyContribution: -5 }).contribution).toBe(
      'Monthly contribution cannot be negative.'
    );
    expect(errorsOf({ ...base, principal: 1e11 }).principal).toContain('at most 10,000,000,000');
  });

  test('years must come to a whole number of months', () => {
    expect(errorsOf({ ...base, years: 2.51 }).years).toContain('whole number of months');
    expect(ready({ ...base, years: 2.5 }).months).toBe(30);
    expect(ready({ ...base, years: 0.5 }).months).toBe(6);
  });

  test('needs a starting amount or a contribution', () => {
    expect(errorsOf({ ...base, principal: 0 }).inputs).toBe(
      'Enter a starting amount or a monthly contribution.'
    );
    expect(ready({ ...base, principal: 0, monthlyContribution: 1 }).finalBalance).toBeGreaterThan(
      0
    );
  });

  test('the longest term of 100 years completes', () => {
    const result = ready({ ...base, years: 100 });
    expect(result.rows).toHaveLength(100);
    expect(Number.isFinite(result.finalBalance)).toBe(true);
  });
});

describe('evaluateCompoundInterest', () => {
  const fields: CompoundFields = {
    principal: '1,000',
    rate: '5',
    years: '10',
    compounding: 'monthly',
    contribution: '',
    timing: 'end',
  };

  test('reads the form as typed', () => {
    const outcome = evaluateCompoundInterest(fields);
    expect(outcome.status).toBe('ready');
    if (outcome.status === 'ready') expect(outcome.result.finalBalance).toBe(164701);
  });

  test('nothing typed is empty, not an error', () => {
    expect(evaluateCompoundInterest({ ...fields, principal: '', rate: '', years: '' })).toEqual({
      status: 'empty',
    });
  });

  test('a blank required field and a bad number are reported on their field', () => {
    const outcome = evaluateCompoundInterest({ ...fields, rate: '', years: '1e3x' });
    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') {
      expect(outcome.errors.rate).toBe('Enter the annual interest rate (0 for no interest).');
      expect(outcome.errors.years).toBe('Enter a number such as 1000 or 1,000.50.');
    }
  });

  test('a comma that is not a thousands separator is rejected instead of misread', () => {
    const outcome = evaluateCompoundInterest({ ...fields, rate: '5,5' });
    expect(outcome.status).toBe('invalid');
  });

  test('an unknown compounding value falls back to monthly', () => {
    expect(getCompounding('nonsense').perYear).toBe(12);
    expect(COMPOUNDING_OPTIONS.map((option) => option.perYear)).toEqual([1, 2, 4, 12, 52, 365]);
  });
});

describe('output', () => {
  const result = ready({ ...base, monthlyContribution: 100 });
  const money = createCentsFormatter('USD');

  test('formats money from cents', () => {
    expect(money(164701)).toBe('$1,647.01');
    expect(money(0)).toBe('$0.00');
    expect(createCentsFormatter('NOT-A-CURRENCY')(100)).toBe('$1.00');
  });

  test('summary lists the inputs and the three results', () => {
    expect(buildCompoundSummary(result, money)).toBe(
      [
        'Compound interest',
        'Starting amount: $1,000.00',
        'Monthly contribution: $100.00 (end of month)',
        'Annual rate: 5% compounded monthly',
        'Years: 10',
        '',
        'Final balance: $17,175.24',
        'Total contributed: $13,000.00',
        'Interest earned: $4,175.24',
      ].join('\n')
    );
  });

  test('csv has a header and one line per year', () => {
    const csv = rowsToCsv(
      ready({ principal: 100, annualRatePercent: 10, years: 2, compoundsPerYear: 1 })
    ).split('\n');
    expect(csv).toEqual([
      'Year,Start balance,Contributions,Interest,End balance',
      '1,100.00,0.00,10.00,110.00',
      '2,110.00,0.00,11.00,121.00',
    ]);
  });
});
