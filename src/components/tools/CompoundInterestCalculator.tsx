'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Download, Info, Trash2, TrendingUp } from 'lucide-react';
import { Stat } from './Stat';
import { FieldError } from './FieldError';
import { toast } from 'sonner';
import { CopyButton } from '@/components/CopyButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { downloadText } from '@/lib/files';
import { CURRENCIES, DEFAULT_CURRENCY } from '@/lib/tools/loan-calculator';
import {
  COMPOUNDING_OPTIONS,
  DEFAULT_COMPOUNDING,
  buildChartGeometry,
  buildCompoundSummary,
  createCentsFormatter,
  evaluateCompoundInterest,
  rowsToCsv,
  type CompoundFieldErrors,
  type ContributionTiming,
} from '@/lib/tools/compound-interest';

const INVALID_INPUT = 'border-destructive focus-visible:ring-destructive';

const TIMING_OPTIONS: ReadonlyArray<{ value: ContributionTiming; label: string }> = [
  { value: 'end', label: 'End of each month' },
  { value: 'start', label: 'Start of each month' },
];

const CHART_BOX = { width: 640, height: 280, left: 64, right: 16, top: 12, bottom: 32 };

export function CompoundInterestCalculator() {
  const [principal, setPrincipal] = useState('1000');
  const [rate, setRate] = useState('5');
  const [years, setYears] = useState('10');
  const [compounding, setCompounding] = useState(DEFAULT_COMPOUNDING);
  const [contribution, setContribution] = useState('');
  const [timing, setTiming] = useState<ContributionTiming>('end');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  const evaluation = useMemo(
    () => evaluateCompoundInterest({ principal, rate, years, compounding, contribution, timing }),
    [principal, rate, years, compounding, contribution, timing]
  );
  const formatMoney = useMemo(() => createCentsFormatter(currency), [currency]);

  const result = evaluation.status === 'ready' ? evaluation.result : null;
  const errors: CompoundFieldErrors = evaluation.status === 'invalid' ? evaluation.errors : {};
  const geometry = useMemo(
    () => (result ? buildChartGeometry(result.chart, CHART_BOX) : null),
    [result]
  );

  const handleClear = () => {
    setPrincipal('');
    setRate('');
    setYears('');
    setContribution('');
  };

  const handleDownload = () => {
    if (!result) return;
    try {
      downloadText(rowsToCsv(result), 'compound-interest-by-year.csv', 'text/csv;charset=utf-8');
      toast.success('Table downloaded');
    } catch {
      toast.error('Could not download the table');
    }
  };

  const plotRight = CHART_BOX.width - CHART_BOX.right;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Savings details
            </CardTitle>
            <CardDescription>
              Interest on interest, with optional monthly deposits. Results update as you type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="ci-currency" className="text-sm font-medium">
                  Currency
                </label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="ci-currency" className="h-9">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {CURRENCIES.map((option) => (
                        <SelectItem key={option.code} value={option.code}>
                          {option.code} - {option.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label htmlFor="ci-principal" className="text-sm font-medium">
                  Starting amount ({currency})
                </label>
                <Input
                  id="ci-principal"
                  type="text"
                  inputMode="decimal"
                  value={principal}
                  onChange={(event) => setPrincipal(event.target.value)}
                  placeholder="1000"
                  className={cn('font-mono', (errors.principal || errors.inputs) && INVALID_INPUT)}
                  aria-invalid={Boolean(errors.principal || errors.inputs)}
                  aria-describedby={errors.principal ? 'ci-principal-error' : undefined}
                />
                <FieldError id="ci-principal-error" message={errors.principal} />
              </div>

              <div className="space-y-2">
                <label htmlFor="ci-rate" className="text-sm font-medium">
                  Annual interest rate (%)
                </label>
                <Input
                  id="ci-rate"
                  type="text"
                  inputMode="decimal"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  placeholder="5"
                  className={cn('font-mono', errors.rate && INVALID_INPUT)}
                  aria-invalid={Boolean(errors.rate)}
                  aria-describedby={errors.rate ? 'ci-rate-error' : undefined}
                />
                <FieldError id="ci-rate-error" message={errors.rate} />
              </div>

              <div className="space-y-2">
                <label htmlFor="ci-years" className="text-sm font-medium">
                  Years
                </label>
                <Input
                  id="ci-years"
                  type="text"
                  inputMode="decimal"
                  value={years}
                  onChange={(event) => setYears(event.target.value)}
                  placeholder="10"
                  className={cn('font-mono', errors.years && INVALID_INPUT)}
                  aria-invalid={Boolean(errors.years)}
                  aria-describedby={errors.years ? 'ci-years-error' : undefined}
                />
                <FieldError id="ci-years-error" message={errors.years} />
              </div>

              <div className="space-y-2">
                <label htmlFor="ci-compounding" className="text-sm font-medium">
                  Compounding
                </label>
                <Select value={compounding} onValueChange={setCompounding}>
                  <SelectTrigger id="ci-compounding" className="h-9">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {COMPOUNDING_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label htmlFor="ci-contribution" className="text-sm font-medium">
                  Monthly contribution ({currency}, optional)
                </label>
                <Input
                  id="ci-contribution"
                  type="text"
                  inputMode="decimal"
                  value={contribution}
                  onChange={(event) => setContribution(event.target.value)}
                  placeholder="0"
                  className={cn('font-mono', errors.contribution && INVALID_INPUT)}
                  aria-invalid={Boolean(errors.contribution)}
                  aria-describedby={errors.contribution ? 'ci-contribution-error' : undefined}
                />
                <FieldError id="ci-contribution-error" message={errors.contribution} />
              </div>

              <div className="space-y-2">
                <label htmlFor="ci-timing" className="text-sm font-medium">
                  Contributions are made
                </label>
                <Select
                  value={timing}
                  onValueChange={(value) => setTiming(value as ContributionTiming)}
                >
                  <SelectTrigger id="ci-timing" className="h-9">
                    <SelectValue placeholder="Select timing" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {TIMING_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <FieldError id="ci-inputs-error" message={errors.inputs} />

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleClear} variant="outline" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Growth</CardTitle>
            <CardDescription>
              {result
                ? `${formatMoney(result.principal)} at ${result.annualRatePercent}% for ${result.years} ${result.years === 1 ? 'year' : 'years'}`
                : 'Final balance, total deposits and interest earned.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result && (
              <div className="flex items-start gap-2 rounded-md border border-dashed px-4 py-4 text-sm text-muted-foreground sm:py-8">
                {evaluation.status === 'invalid' ? (
                  <>
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <span>Fix the highlighted fields to see the growth.</span>
                  </>
                ) : (
                  <>
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Enter a starting amount, an interest rate and a number of years.</span>
                  </>
                )}
              </div>
            )}

            {result && (
              <>
                <div className="rounded-md bg-muted p-3 sm:p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Final balance
                  </div>
                  <div
                    data-testid="ci-final-balance"
                    className="mt-1 break-words font-mono text-2xl font-semibold tracking-tight sm:text-3xl"
                  >
                    {formatMoney(result.finalBalance)}
                  </div>
                </div>

                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Stat label="Total contributed" value={formatMoney(result.totalContributed)} />
                  <Stat label="Interest earned" value={formatMoney(result.interestEarned)} />
                </dl>

                <p className="text-xs text-muted-foreground">
                  Deposits are made monthly, and interest accrues at the monthly rate equivalent to
                  the chosen compounding. Estimates only: taxes, fees and inflation are not
                  included.
                </p>

                <div className="flex flex-wrap gap-2">
                  <CopyButton
                    text={buildCompoundSummary(result, formatMoney)}
                    label="Copy summary"
                    errorLabel="Copy failed, try again"
                  />
                  <Button onClick={handleDownload} variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Download CSV
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {result && geometry && (
        <Card>
          <CardHeader>
            <CardTitle>Balance over time</CardTitle>
            <CardDescription>The balance compared with the money you put in.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <svg
              role="img"
              aria-label={`Growth chart: the balance grows from ${formatMoney(result.principal)} to ${formatMoney(result.finalBalance)} over ${result.years} years, against ${formatMoney(result.totalContributed)} contributed.`}
              viewBox={`0 0 ${CHART_BOX.width} ${CHART_BOX.height}`}
              className="h-auto w-full"
            >
              {geometry.yTicks.map((tick) => (
                <g key={tick.cents}>
                  <line
                    x1={CHART_BOX.left}
                    x2={plotRight}
                    y1={tick.y}
                    y2={tick.y}
                    className="stroke-border"
                    strokeWidth={1}
                  />
                  <text
                    x={CHART_BOX.left - 8}
                    y={tick.y + 4}
                    textAnchor="end"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {new Intl.NumberFormat('en-US', {
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(tick.cents / 100)}
                  </text>
                </g>
              ))}
              {geometry.xTicks.map((tick) => (
                <text
                  key={tick.year}
                  x={tick.x}
                  y={CHART_BOX.height - 10}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {tick.year}
                </text>
              ))}
              <path d={geometry.balanceArea} className="fill-primary/15" />
              <path
                d={geometry.contributedLine}
                fill="none"
                strokeWidth={2}
                strokeDasharray="5 4"
                className="stroke-muted-foreground"
              />
              <path
                d={geometry.balanceLine}
                fill="none"
                strokeWidth={2.5}
                strokeLinejoin="round"
                className="stroke-primary"
              />
            </svg>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 bg-primary" />
                Balance
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-muted-foreground" />
                Total contributed
              </span>
              <span>Horizontal axis: years</span>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Year by year</CardTitle>
            <CardDescription>
              Opening balance, deposits, interest and closing balance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              role="region"
              aria-label="Year by year table"
              tabIndex={0}
              className="max-h-96 overflow-auto rounded-md border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <table className="w-full min-w-[28rem] border-collapse text-xs sm:text-sm">
                <caption className="sr-only">Balance by year</caption>
                <thead>
                  <tr>
                    {['Year', 'Start', 'Contributions', 'Interest', 'End balance'].map(
                      (heading, index) => (
                        <th
                          key={heading}
                          scope="col"
                          className={cn(
                            'sticky top-0 bg-muted px-3 py-2 font-medium text-muted-foreground',
                            index === 0 ? 'text-left' : 'text-right'
                          )}
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {result.rows.map((row) => (
                    <tr key={row.year} className="border-t">
                      <th scope="row" className="px-3 py-1.5 text-left font-normal">
                        {row.year}
                        {row.months < 12 && (
                          <span className="ml-1 text-muted-foreground">({row.months} mo)</span>
                        )}
                      </th>
                      <td className="px-3 py-1.5 text-right">{formatMoney(row.startBalance)}</td>
                      <td className="px-3 py-1.5 text-right">{formatMoney(row.contributions)}</td>
                      <td className="px-3 py-1.5 text-right">{formatMoney(row.interest)}</td>
                      <td className="px-3 py-1.5 text-right">{formatMoney(row.endBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
