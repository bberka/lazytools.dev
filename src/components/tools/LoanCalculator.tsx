'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, Download, Info, Landmark, PiggyBank, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { Switch } from '@/components/ui/switch';
import { useCopyToClipboard } from '@/hooks';
import { cn } from '@/lib/utils';
import { downloadText } from '@/lib/files';
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  buildLoanSummary,
  createMoneyFormatter,
  evaluateLoan,
  formatMonths,
  groupScheduleByYear,
  scheduleToCsv,
  type LoanFieldErrors,
  type TermUnit,
} from '@/lib/tools/loan-calculator';

const termUnitOptions = [
  { value: 'years', label: 'Years' },
  { value: 'months', label: 'Months' },
] as const;

const INVALID_INPUT = 'border-destructive focus-visible:ring-destructive';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <div id={id} role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-card p-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-mono text-base font-semibold sm:text-lg">{value}</dd>
      {detail && <dd className="mt-0.5 text-xs text-muted-foreground">{detail}</dd>}
    </div>
  );
}

export function LoanCalculator() {
  const [amount, setAmount] = useState('200000');
  const [rate, setRate] = useState('6');
  const [term, setTerm] = useState('30');
  const [termUnit, setTermUnit] = useState<TermUnit>('years');
  const [extra, setExtra] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [groupByYear, setGroupByYear] = useState(false);
  const copySummary = useCopyToClipboard();

  const evaluation = useMemo(
    () => evaluateLoan({ amount, rate, term, termUnit, extra }, currency),
    [amount, rate, term, termUnit, extra, currency]
  );
  const formatMoney = useMemo(() => createMoneyFormatter(currency), [currency]);

  const result = evaluation.status === 'ready' ? evaluation.result : null;
  const errors: LoanFieldErrors = evaluation.status === 'invalid' ? evaluation.errors : {};
  const years = useMemo(
    () => (result && groupByYear ? groupScheduleByYear(result.schedule) : []),
    [result, groupByYear]
  );

  const handleClear = () => {
    setAmount('');
    setRate('');
    setTerm('');
    setExtra('');
  };

  const handleDownload = () => {
    if (!result) return;
    try {
      downloadText(scheduleToCsv(result), 'loan-amortization-schedule.csv', 'text/csv;charset=utf-8');
      toast.success('Schedule downloaded');
    } catch {
      toast.error('Could not download the schedule');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" />
              Loan details
            </CardTitle>
            <CardDescription>
              Fixed-rate loan with monthly payments. Results update as you type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="loan-currency" className="text-sm font-medium">
                  Currency
                </label>
                <Select value={currency} onValueChange={(value) => setCurrency(value)}>
                  <SelectTrigger id="loan-currency" className="h-9">
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
                <label htmlFor="loan-amount" className="text-sm font-medium">
                  Loan amount ({currency})
                </label>
                <Input
                  id="loan-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="200000"
                  className={cn('font-mono', errors.amount && INVALID_INPUT)}
                  aria-invalid={Boolean(errors.amount)}
                  aria-describedby={errors.amount ? 'loan-amount-error' : undefined}
                />
                <FieldError id="loan-amount-error" message={errors.amount} />
              </div>

              <div className="space-y-2">
                <label htmlFor="loan-rate" className="text-sm font-medium">
                  Annual interest rate (%)
                </label>
                <Input
                  id="loan-rate"
                  type="text"
                  inputMode="decimal"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  placeholder="6"
                  className={cn('font-mono', errors.rate && INVALID_INPUT)}
                  aria-invalid={Boolean(errors.rate)}
                  aria-describedby={errors.rate ? 'loan-rate-error' : undefined}
                />
                <FieldError id="loan-rate-error" message={errors.rate} />
              </div>

              <div className="space-y-2">
                <label htmlFor="loan-term" className="text-sm font-medium">
                  Loan term
                </label>
                <div className="flex gap-2">
                  <Input
                    id="loan-term"
                    type="text"
                    inputMode="decimal"
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    placeholder="30"
                    className={cn('min-w-0 flex-1 font-mono', errors.term && INVALID_INPUT)}
                    aria-invalid={Boolean(errors.term)}
                    aria-describedby={errors.term ? 'loan-term-error' : undefined}
                  />
                  <Select value={termUnit} onValueChange={(value) => setTermUnit(value as TermUnit)}>
                    <SelectTrigger aria-label="Term unit" className="h-9 w-28 shrink-0">
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {termUnitOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <FieldError id="loan-term-error" message={errors.term} />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="loan-extra" className="text-sm font-medium">
                  Extra monthly payment ({currency}, optional)
                </label>
                <Input
                  id="loan-extra"
                  type="text"
                  inputMode="decimal"
                  value={extra}
                  onChange={(event) => setExtra(event.target.value)}
                  placeholder="0"
                  className={cn('font-mono', errors.extra && INVALID_INPUT)}
                  aria-invalid={Boolean(errors.extra)}
                  aria-describedby={errors.extra ? 'loan-extra-error' : undefined}
                />
                <FieldError id="loan-extra-error" message={errors.extra} />
              </div>
            </div>

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
            <CardTitle>Repayment</CardTitle>
            <CardDescription>
              {result
                ? `${formatMoney(result.amount)} at ${result.annualRatePercent}% over ${formatMonths(result.termMonths)}`
                : 'Monthly payment, total interest and what an extra payment saves.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result && (
              <div className="flex items-start gap-2 rounded-md border border-dashed px-4 py-4 text-sm text-muted-foreground sm:py-8">
                {evaluation.status === 'invalid' ? (
                  <>
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <span>Fix the highlighted fields to see the repayment.</span>
                  </>
                ) : (
                  <>
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Enter a loan amount, interest rate and term to see the repayment.</span>
                  </>
                )}
              </div>
            )}

            {result && (
              <>
                <div className="rounded-md bg-muted p-3 sm:p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Monthly payment
                  </div>
                  <div className="mt-1 break-words font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
                    {formatMoney(result.monthlyPayment)}
                  </div>
                  {result.savings && (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {formatMoney(result.monthlyPayment + result.extraPayment)} a month with the
                      extra payment
                    </div>
                  )}
                </div>

                <dl className="grid gap-3 sm:grid-cols-3">
                  <Stat label="Total interest" value={formatMoney(result.totalInterest)} />
                  <Stat label="Total paid" value={formatMoney(result.totalPaid)} />
                  <Stat
                    label="Payments"
                    value={String(result.paymentCount)}
                    detail={formatMonths(result.paymentCount)}
                  />
                </dl>

                {result.savings && (
                  <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3 sm:p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <PiggyBank className="h-4 w-4 text-primary" />
                      What the extra payment saves
                    </div>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <Stat
                        label="Time saved"
                        value={formatMonths(result.savings.monthsSaved)}
                        detail={`Paid off in ${formatMonths(result.paymentCount)} instead of ${formatMonths(result.savings.baselinePaymentCount)}`}
                      />
                      <Stat
                        label="Interest saved"
                        value={formatMoney(result.savings.interestSaved)}
                        detail={`${formatMoney(result.totalInterest)} instead of ${formatMoney(result.savings.baselineTotalInterest)}`}
                      />
                    </dl>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  The last payment is {formatMoney(result.finalPayment)}, which clears the remaining
                  balance. Estimates only: fees, insurance and a lender&apos;s own rounding can
                  change the real figures.
                </p>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => copySummary.copyToClipboard(buildLoanSummary(result, formatMoney))}
                    variant={copySummary.isCopied ? 'default' : 'outline'}
                  >
                    {copySummary.isCopied ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        {copySummary.isError ? 'Copy failed, try again' : 'Copy summary'}
                      </>
                    )}
                  </Button>
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

      {result && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1.5">
                <CardTitle>Amortization schedule</CardTitle>
                <CardDescription>
                  {groupByYear
                    ? 'Totals for each year of the loan.'
                    : 'Every monthly payment split into principal and interest.'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="loan-group-by-year"
                  checked={groupByYear}
                  onCheckedChange={setGroupByYear}
                />
                <label htmlFor="loan-group-by-year" className="text-sm font-medium">
                  Group by year
                </label>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div
              role="region"
              aria-label="Amortization schedule table"
              tabIndex={0}
              className="max-h-96 overflow-auto rounded-md border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <table className="w-full min-w-[28rem] border-collapse text-xs sm:text-sm">
                <caption className="sr-only">
                  {groupByYear ? 'Loan payments totalled by year' : 'Loan payments by month'}
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky top-0 bg-muted px-3 py-2 text-left font-medium text-muted-foreground"
                    >
                      {groupByYear ? 'Year' : 'Month'}
                    </th>
                    <th
                      scope="col"
                      className="sticky top-0 bg-muted px-3 py-2 text-right font-medium text-muted-foreground"
                    >
                      Payment
                    </th>
                    <th
                      scope="col"
                      className="sticky top-0 bg-muted px-3 py-2 text-right font-medium text-muted-foreground"
                    >
                      Principal
                    </th>
                    <th
                      scope="col"
                      className="sticky top-0 bg-muted px-3 py-2 text-right font-medium text-muted-foreground"
                    >
                      Interest
                    </th>
                    <th
                      scope="col"
                      className="sticky top-0 bg-muted px-3 py-2 text-right font-medium text-muted-foreground"
                    >
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {groupByYear
                    ? years.map((row) => (
                        <tr key={row.year} className="border-t">
                          <th scope="row" className="px-3 py-1.5 text-left font-normal">
                            Year {row.year}
                            {row.months < 12 && (
                              <span className="ml-1 text-muted-foreground">({row.months} mo)</span>
                            )}
                          </th>
                          <td className="px-3 py-1.5 text-right">{formatMoney(row.payment)}</td>
                          <td className="px-3 py-1.5 text-right">{formatMoney(row.principal)}</td>
                          <td className="px-3 py-1.5 text-right">{formatMoney(row.interest)}</td>
                          <td className="px-3 py-1.5 text-right">{formatMoney(row.balance)}</td>
                        </tr>
                      ))
                    : result.schedule.map((row) => (
                        <tr key={row.month} className="border-t">
                          <th scope="row" className="px-3 py-1.5 text-left font-normal">
                            {row.month}
                          </th>
                          <td className="px-3 py-1.5 text-right">{formatMoney(row.payment)}</td>
                          <td className="px-3 py-1.5 text-right">{formatMoney(row.principal)}</td>
                          <td className="px-3 py-1.5 text-right">{formatMoney(row.interest)}</td>
                          <td className="px-3 py-1.5 text-right">{formatMoney(row.balance)}</td>
                        </tr>
                      ))}
                </tbody>
                <tfoot className="font-mono font-semibold tabular-nums">
                  <tr className="border-t-2 bg-muted/50">
                    <th scope="row" className="px-3 py-2 text-left">
                      Total
                    </th>
                    <td className="px-3 py-2 text-right">{formatMoney(result.totalPaid)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(result.amount)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(result.totalInterest)}</td>
                    <td className="px-3 py-2 text-right">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
