'use client';

import { useId, useMemo, useState, useSyncExternalStore } from 'react';
import { CalendarDays, Check, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { useCopyToClipboard } from '@/hooks';
import { formatLongDate, parseDateInput, toDateInputValue } from '@/lib/tools/calendar-date';
import {
  calculateAge,
  formatCount,
  formatDuration,
  type AgeBreakdown,
} from '@/lib/tools/date-difference';

function getTodayValue(): string {
  return toDateInputValue(new Date());
}

const noSubscription = () => () => {};

function AgeForm({ initialTargetDate }: { initialTargetDate: string }) {
  const id = useId();
  const [birthDate, setBirthDate] = useState('1990-06-15');
  const [targetDate, setTargetDate] = useState(initialTargetDate);
  const copyResult = useCopyToClipboard();

  const result = useMemo(() => {
    if (!birthDate || !targetDate) {
      return {
        value: '',
        error: '',
        detail: 'Choose a birth date and comparison date to calculate an age.',
        breakdown: null as AgeBreakdown | null,
      };
    }

    const parsedBirthDate = parseDateInput(birthDate);
    const parsedTargetDate = parseDateInput(targetDate);

    if (!parsedBirthDate || !parsedTargetDate) {
      return {
        value: '',
        error: 'Enter valid calendar dates.',
        detail: '',
        breakdown: null as AgeBreakdown | null,
      };
    }

    if (parsedTargetDate < parsedBirthDate) {
      return {
        value: '',
        error: 'The comparison date cannot be earlier than the birth date.',
        detail: '',
        breakdown: null as AgeBreakdown | null,
      };
    }

    const breakdown = calculateAge(birthDate, targetDate);

    if (!breakdown) {
      return {
        value: '',
        error: 'Unable to calculate age for the selected dates.',
        detail: '',
        breakdown: null as AgeBreakdown | null,
      };
    }

    return {
      value: formatDuration(breakdown),
      error: '',
      detail: `From ${formatLongDate(birthDate)} to ${formatLongDate(targetDate)}`,
      breakdown,
    };
  }, [birthDate, targetDate]);

  const handleClear = () => {
    setBirthDate('');
    setTargetDate(getTodayValue());
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Age Calculator</CardTitle>
          <CardDescription>
            Calculate exact age between two dates, plus total days and the next birthday.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div role="group" aria-labelledby={`${id}-birth`}>
              <span id={`${id}-birth`} className="mb-2 block text-sm font-medium">
                Birth date
              </span>
              <DatePicker
                aria-labelledby={`${id}-birth`}
                value={birthDate}
                onChange={setBirthDate}
                disabled={(date) => {
                  if (!targetDate) return false;
                  const [y, m, d] = targetDate.split('-').map(Number);
                  return date > new Date(y, m - 1, d);
                }}
                error={!parseDateInput(birthDate) && !!birthDate}
              />
            </div>
            <div role="group" aria-labelledby={`${id}-target`}>
              <span id={`${id}-target`} className="mb-2 block text-sm font-medium">
                Age at
              </span>
              <DatePicker
                aria-labelledby={`${id}-target`}
                value={targetDate}
                onChange={setTargetDate}
                disabled={(date) => {
                  if (!birthDate) return false;
                  const [y, m, d] = birthDate.split('-').map(Number);
                  return date < new Date(y, m - 1, d);
                }}
                error={!parseDateInput(targetDate) && !!targetDate}
              />
            </div>
          </div>

          {result.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {result.error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleClear} variant="outline">
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
            <Button
              onClick={() => copyResult.copyToClipboard(result.value)}
              variant={copyResult.isCopied ? 'default' : 'outline'}
              disabled={!result.value}
            >
              {copyResult.isCopied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy result
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Result</CardTitle>
          <CardDescription>{result.error ? 'Fix the selected dates to continue.' : result.detail}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted p-4 font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
            {result.value || '-'}
          </div>

          {result.breakdown && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total months
                </div>
                <div className="mt-1 font-mono text-lg font-semibold">
                  {formatCount(result.breakdown.totalMonths)}
                </div>
              </div>
              <div className="rounded-md border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total weeks
                </div>
                <div className="mt-1 font-mono text-lg font-semibold">
                  {formatCount(result.breakdown.totalWeeks)}
                </div>
              </div>
              <div className="rounded-md border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total days
                </div>
                <div className="mt-1 font-mono text-lg font-semibold">
                  {formatCount(result.breakdown.totalDays)}
                </div>
              </div>
              <div className="rounded-md border bg-card p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Next birthday
                </div>
                <div className="mt-1 font-semibold">{result.breakdown.nextBirthdayLabel}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Turns {result.breakdown.nextBirthdayAge} in {formatCount(result.breakdown.nextBirthdayDaysAway)} day
                  {result.breakdown.nextBirthdayDaysAway === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AgeCalculator() {
  // The page is exported as static HTML at build time. "Today" rendered into
  // it would be the build date: stale for every visitor and a hydration
  // mismatch. The HTML and the first client render leave the date empty, and
  // the form is mounted again with the visitor's date once hydrated.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  );
  const [today] = useState(getTodayValue);

  return hydrated ? (
    <AgeForm key="local" initialTargetDate={today} />
  ) : (
    <AgeForm key="static" initialTargetDate="" />
  );
}
