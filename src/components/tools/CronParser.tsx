'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { AlertCircle, Calendar, Check, Clock, Copy, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCopyToClipboard } from '@/hooks';
import {
  CRON_SEARCH_YEARS,
  DAY_NAMES,
  MONTH_NAMES,
  buildCronExpression,
  formatTimeUntil,
  nextCronRuns,
  parseCron,
  type CronBuilderMode,
  type CronTimezone,
} from '@/lib/tools/cron-expression';

interface NextRun {
  key: number;
  date: string;
  time: string;
  fromNow: string;
}

type BuilderMode = CronBuilderMode | 'custom';

const BUILDER_MODE_OPTIONS: Array<{ value: BuilderMode; label: string }> = [
  { value: 'every-minutes', label: 'Every N minutes' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom expression' },
];

const presets = [
  { value: '* * * * *', label: 'Every minute' },
  { value: '*/15 * * * *', label: 'Every 15 minutes' },
  { value: '0 * * * *', label: 'Every hour' },
  { value: '0 0 * * *', label: 'Every day at midnight' },
  { value: '0 9 * * 1-5', label: 'Every weekday at 9 AM' },
  { value: '0 0 * * 0', label: 'Every Sunday at midnight' },
  { value: '0 0 1 * *', label: 'First day of every month' },
];

const MINUTE_MS = 60_000;

/** Calls back at the start of every minute, and when the tab is shown again. */
function subscribeToMinutes(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;

  const waitForNextMinute = () => {
    timer = setTimeout(
      () => {
        onChange();
        waitForNextMinute();
      },
      MINUTE_MS - (Date.now() % MINUTE_MS) + 20
    );
  };

  waitForNextMinute();
  document.addEventListener('visibilitychange', onChange);

  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onChange);
  };
}

const getCurrentMinute = () => Math.floor(Date.now() / MINUTE_MS);
// The clock is unknown while prerendering, so the run list waits for the browser.
const getServerMinute = () => null;

function formatRun(run: Date, timezone: CronTimezone, now: Date): NextRun {
  const fromNow = formatTimeUntil(run, now);

  if (timezone === 'utc') {
    const iso = run.toISOString();
    return {
      key: run.getTime(),
      date: iso.slice(0, 10),
      time: `${iso.slice(11, 16)} UTC`,
      fromNow,
    };
  }

  return {
    key: run.getTime(),
    date: run.toLocaleDateString(),
    time: run.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    fromNow,
  };
}

export function CronParser() {
  const [manualExpression, setManualExpression] = useState('0 9 * * 1-5');
  const [builderMode, setBuilderMode] = useState<BuilderMode>('weekdays');
  const [everyMinutesInterval, setEveryMinutesInterval] = useState('15');
  const [hourlyMinute, setHourlyMinute] = useState('0');
  const [scheduleHour, setScheduleHour] = useState('9');
  const [scheduleMinute, setScheduleMinute] = useState('0');
  const [weeklyDay, setWeeklyDay] = useState('1');
  const [monthlyDay, setMonthlyDay] = useState('1');
  const [yearlyMonth, setYearlyMonth] = useState('1');
  const [yearlyDay, setYearlyDay] = useState('1');
  const [timezoneMode, setTimezoneMode] = useState<CronTimezone>('local');
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  // Ticks once a minute so the run list and its "in N minutes" never go stale.
  const currentMinute = useSyncExternalStore<number | null>(
    subscribeToMinutes,
    getCurrentMinute,
    getServerMinute
  );

  const builderExpression = useMemo(
    () =>
      builderMode === 'custom'
        ? ''
        : buildCronExpression(builderMode, {
            everyMinutesInterval,
            hourlyMinute,
            scheduleHour,
            scheduleMinute,
            weeklyDay,
            monthlyDay,
            yearlyMonth,
            yearlyDay,
          }),
    [
      builderMode,
      everyMinutesInterval,
      hourlyMinute,
      scheduleHour,
      scheduleMinute,
      weeklyDay,
      monthlyDay,
      yearlyMonth,
      yearlyDay,
    ]
  );

  // A guided schedule owns the expression until the user edits it by hand.
  const expression = builderMode === 'custom' ? manualExpression : builderExpression;

  const parsed = useMemo(() => (expression.trim() ? parseCron(expression) : null), [expression]);
  const schedule = parsed?.ok ? parsed.schedule : null;
  const error = parsed && !parsed.ok ? parsed.error : '';

  const nextRuns = useMemo(() => {
    if (!schedule || currentMinute === null) return null;
    const now = new Date(currentMinute * MINUTE_MS);
    return nextCronRuns(schedule, { after: now, timezone: timezoneMode }).map((run) =>
      formatRun(run, timezoneMode, now)
    );
  }, [schedule, currentMinute, timezoneMode]);

  const handleBuilderModeChange = (mode: BuilderMode) => {
    if (mode === 'custom') {
      // Keep what the guided schedule produced as the starting point.
      setManualExpression(expression);
    }
    setBuilderMode(mode);
  };

  const handleManualExpressionChange = (value: string) => {
    setBuilderMode('custom');
    setManualExpression(value);
  };

  const handleClear = () => handleManualExpressionChange('');

  const activePreset = presets.some((preset) => preset.value === expression) ? expression : '';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Cron Builder
          </CardTitle>
          <CardDescription>
            Build a cron expression with guided scheduling options, or switch to manual mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="cron-schedule-type" className="text-sm font-medium">
                Schedule type
              </label>
              <Select
                value={builderMode}
                onValueChange={(value) => handleBuilderModeChange(value as BuilderMode)}
              >
                <SelectTrigger id="cron-schedule-type">
                  <SelectValue placeholder="Select a schedule type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {BUILDER_MODE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {builderMode === 'every-minutes' && (
              <div className="space-y-2">
                <label htmlFor="cron-interval" className="text-sm font-medium">
                  Interval (minutes)
                </label>
                <Input
                  id="cron-interval"
                  type="number"
                  min="1"
                  max="59"
                  value={everyMinutesInterval}
                  onChange={(event) => setEveryMinutesInterval(event.target.value)}
                  className="font-mono"
                />
              </div>
            )}

            {builderMode === 'hourly' && (
              <div className="space-y-2">
                <label htmlFor="cron-hourly-minute" className="text-sm font-medium">
                  Minute of the hour
                </label>
                <Input
                  id="cron-hourly-minute"
                  type="number"
                  min="0"
                  max="59"
                  value={hourlyMinute}
                  onChange={(event) => setHourlyMinute(event.target.value)}
                  className="font-mono"
                />
              </div>
            )}

            {(builderMode === 'daily' ||
              builderMode === 'weekdays' ||
              builderMode === 'weekly' ||
              builderMode === 'monthly' ||
              builderMode === 'yearly') && (
              <>
                <div className="space-y-2">
                  <label htmlFor="cron-hour" className="text-sm font-medium">
                    Hour
                  </label>
                  <Input
                    id="cron-hour"
                    type="number"
                    min="0"
                    max="23"
                    value={scheduleHour}
                    onChange={(event) => setScheduleHour(event.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="cron-minute" className="text-sm font-medium">
                    Minute
                  </label>
                  <Input
                    id="cron-minute"
                    type="number"
                    min="0"
                    max="59"
                    value={scheduleMinute}
                    onChange={(event) => setScheduleMinute(event.target.value)}
                    className="font-mono"
                  />
                </div>
              </>
            )}

            {builderMode === 'weekly' && (
              <div className="space-y-2">
                <label htmlFor="cron-weekday" className="text-sm font-medium">
                  Day of week
                </label>
                <Select value={weeklyDay} onValueChange={setWeeklyDay}>
                  <SelectTrigger id="cron-weekday">
                    <SelectValue placeholder="Select weekday" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {DAY_NAMES.map((day, index) => (
                        <SelectItem key={day} value={String(index)}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}

            {builderMode === 'monthly' && (
              <div className="space-y-2">
                <label htmlFor="cron-month-day" className="text-sm font-medium">
                  Day of month
                </label>
                <Input
                  id="cron-month-day"
                  type="number"
                  min="1"
                  max="31"
                  value={monthlyDay}
                  onChange={(event) => setMonthlyDay(event.target.value)}
                  className="font-mono"
                />
              </div>
            )}

            {builderMode === 'yearly' && (
              <>
                <div className="space-y-2">
                  <label htmlFor="cron-year-month" className="text-sm font-medium">
                    Month
                  </label>
                  <Select value={yearlyMonth} onValueChange={setYearlyMonth}>
                    <SelectTrigger id="cron-year-month">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {MONTH_NAMES.map((month, index) => (
                          <SelectItem key={month} value={String(index + 1)}>
                            {month}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="cron-year-day" className="text-sm font-medium">
                    Day
                  </label>
                  <Input
                    id="cron-year-day"
                    type="number"
                    min="1"
                    max="31"
                    value={yearlyDay}
                    onChange={(event) => setYearlyDay(event.target.value)}
                    className="font-mono"
                  />
                </div>
              </>
            )}
          </div>

          {builderMode !== 'custom' && (
            <div className="rounded-md border bg-muted/30 px-4 py-3">
              <div className="text-sm font-medium">Generated expression</div>
              <div className="mt-1 font-mono text-sm">{builderExpression || '-'}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Cron Expression
          </CardTitle>
          <CardDescription>Enter or refine a 5-field cron expression manually.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={expression}
                onChange={(event) => handleManualExpressionChange(event.target.value)}
                placeholder="0 9 * * 1-5"
                className="flex-1 font-mono"
                aria-label="Cron expression"
                aria-invalid={error ? true : undefined}
                spellCheck={false}
              />
              <Button
                onClick={() => copyToClipboard(expression)}
                variant={isCopied ? 'default' : 'outline'}
                size="sm"
                disabled={!expression}
                aria-label={isCopied ? 'Expression copied' : 'Copy expression'}
              >
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button
                onClick={handleClear}
                variant="outline"
                size="sm"
                aria-label="Clear expression"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-xs text-muted-foreground sm:grid-cols-3 lg:grid-cols-5">
              <div>
                Minute
                <br />
                (0-59)
              </div>
              <div>
                Hour
                <br />
                (0-23)
              </div>
              <div>
                Day
                <br />
                (1-31)
              </div>
              <div>
                Month
                <br />
                (1-12)
              </div>
              <div>
                Weekday
                <br />
                (0-6)
              </div>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <strong>Error:</strong> {error}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="cron-preset" className="text-sm font-medium">
              Quick presets
            </label>
            {/* Controlled, so it stops naming a preset once the expression moves on. */}
            <Select
              value={activePreset}
              onValueChange={(value) => value && handleManualExpressionChange(value)}
            >
              <SelectTrigger id="cron-preset">
                <SelectValue placeholder="Select a preset..." />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {presets.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md bg-muted p-4">
            <div className="mb-2 text-sm font-medium">Supported characters</div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>
                <code className="rounded bg-background px-1 py-0.5">*</code> - Any value
              </div>
              <div>
                <code className="rounded bg-background px-1 py-0.5">,</code> - Value list
              </div>
              <div>
                <code className="rounded bg-background px-1 py-0.5">-</code> - Range
              </div>
              <div>
                <code className="rounded bg-background px-1 py-0.5">/</code> - Step values
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {schedule && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Description
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg">{schedule.description}</p>
          </CardContent>
        </Card>
      )}

      {schedule && (
        <Card>
          <CardHeader>
            <CardTitle>Breakdown</CardTitle>
            <CardDescription>Cron expression components</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-sm font-medium">Minute</div>
                <div className="rounded bg-muted p-2 font-mono text-sm">
                  {schedule.parts.minute}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">Hour</div>
                <div className="rounded bg-muted p-2 font-mono text-sm">{schedule.parts.hour}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">Day of Month</div>
                <div className="rounded bg-muted p-2 font-mono text-sm">
                  {schedule.parts.dayOfMonth}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">Month</div>
                <div className="rounded bg-muted p-2 font-mono text-sm">{schedule.parts.month}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">Day of Week</div>
                <div className="rounded bg-muted p-2 font-mono text-sm">
                  {schedule.parts.dayOfWeek}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {nextRuns && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Next Scheduled Runs</CardTitle>
              <CardDescription>
                Upcoming execution times ({timezoneMode === 'utc' ? 'UTC' : 'your local time'})
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">UTC Mode</span>
              <Switch
                checked={timezoneMode === 'utc'}
                onCheckedChange={(checked) => setTimezoneMode(checked ? 'utc' : 'local')}
                aria-label="Toggle UTC timezone mode"
              />
            </div>
          </CardHeader>
          <CardContent>
            {nextRuns.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground sm:py-6">
                No runs in the next {CRON_SEARCH_YEARS} years. This combination of day and month
                never occurs.
              </p>
            ) : (
              <div className="space-y-2">
                {nextRuns.map((run) => (
                  <div
                    key={run.key}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="space-y-1">
                      <div className="font-medium">{run.date}</div>
                      <div className="text-sm text-muted-foreground">{run.time}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">{run.fromNow}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
