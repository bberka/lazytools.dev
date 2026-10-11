'use client';

import { useId, useMemo, useState, useSyncExternalStore } from 'react';
import { CalendarRange, Check, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { useCopyToClipboard } from '@/hooks';
import { formatLongDate, parseDateInput, toDateInputValue } from '@/lib/tools/calendar-date';
import {
  calendarDifference,
  formatCount,
  formatDuration,
  type CalendarDifference,
} from '@/lib/tools/date-difference';

function getTodayValue(): string {
  return toDateInputValue(new Date());
}

const noSubscription = () => () => {};

function DateDifferenceForm({ initialEndDate }: { initialEndDate: string }) {
  const id = useId();
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState(initialEndDate);
  const copyResult = useCopyToClipboard();

  const result = useMemo(() => {
    if (!startDate || !endDate) {
      return {
        value: '',
        detail: 'Choose both dates to calculate the difference.',
        error: '',
        breakdown: null as CalendarDifference | null,
      };
    }

    const parsedStartDate = parseDateInput(startDate);
    const parsedEndDate = parseDateInput(endDate);

    if (!parsedStartDate || !parsedEndDate) {
      return {
        value: '',
        detail: '',
        error: 'Enter valid calendar dates.',
        breakdown: null as CalendarDifference | null,
      };
    }

    if (parsedEndDate < parsedStartDate) {
      return {
        value: '',
        detail: '',
        error: 'The end date cannot be earlier than the start date.',
        breakdown: null as CalendarDifference | null,
      };
    }

    const breakdown = calendarDifference(startDate, endDate);

    if (!breakdown) {
      return {
        value: '',
        detail: '',
        error: 'Unable to calculate the difference for the selected dates.',
        breakdown: null as CalendarDifference | null,
      };
    }

    return {
      value: formatDuration(breakdown),
      detail: `${formatLongDate(startDate)} to ${formatLongDate(endDate)}`,
      error: '',
      breakdown,
    };
  }, [endDate, startDate]);

  const handleClear = () => {
    setStartDate('');
    setEndDate(getTodayValue());
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Date Difference Calculator</CardTitle>
          <CardDescription>
            Compare two dates and see the exact calendar difference plus total days, weeks, and months.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div role="group" aria-labelledby={`${id}-start`}>
              <span id={`${id}-start`} className="mb-2 block text-sm font-medium">
                Start date
              </span>
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                disabled={(date) => {
                  if (!endDate) return false;
                  const [y, m, d] = endDate.split('-').map(Number);
                  return date > new Date(y, m - 1, d);
                }}
                error={!parseDateInput(startDate) && !!startDate}
              />
            </div>
            <div role="group" aria-labelledby={`${id}-end`}>
              <span id={`${id}-end`} className="mb-2 block text-sm font-medium">
                End date
              </span>
              <DatePicker
                value={endDate}
                onChange={setEndDate}
                disabled={(date) => {
                  if (!startDate) return false;
                  const [y, m, d] = startDate.split('-').map(Number);
                  return date < new Date(y, m - 1, d);
                }}
                error={!parseDateInput(endDate) && !!endDate}
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
          <CardDescription>
            {result.error ? 'Adjust the selected dates to continue.' : result.detail}
          </CardDescription>
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
                  <CalendarRange className="h-3.5 w-3.5" />
                  Notes
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Calendar difference uses exact year/month/day boundaries rather than just dividing by 30 or 365.
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function DateDifferenceCalculator() {
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
    <DateDifferenceForm key="local" initialEndDate={today} />
  ) : (
    <DateDifferenceForm key="static" initialEndDate="" />
  );
}
