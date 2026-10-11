'use client';

import { useEffect, useId, useState } from 'react';
import { Check, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
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
  changeUnit,
  createConverterState,
  describeInstant,
  editDateTime,
  editTimestamp,
  formatRelativeTime,
  showInstant,
  type ConverterState,
  type TimestampUnit,
} from '@/lib/tools/timestamp-converter';

const unitOptions = [
  { value: 'seconds', label: 'Seconds' },
  { value: 'milliseconds', label: 'Milliseconds' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function ResultCard({ title, value }: { title: string; value: string }) {
  const copy = useCopyToClipboard();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-lg">{title}</CardTitle>
        <Button
          type="button"
          onClick={() => copy.copyToClipboard(value)}
          variant={copy.isCopied ? 'default' : 'outline'}
          size="sm"
          aria-label={`Copy ${title}`}
        >
          {copy.isCopied ? (
            <Check className="mr-1 h-3.5 w-3.5" />
          ) : (
            <Copy className="mr-1 h-3.5 w-3.5" />
          )}
          {copy.isCopied ? 'Copied' : 'Copy'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="p-3 rounded-md bg-muted font-mono text-sm break-all">{value}</div>
      </CardContent>
    </Card>
  );
}

/**
 * The relative time, kept moving while it is on screen. `since` is the clock
 * reading taken when the moment was entered. The ticking lives in this card
 * so it does not re-render the form: a re-render resets the keyboard
 * highlight of an open hour or minute list.
 */
function RelativeTimeCard({ instant, since }: { instant: number; since: number }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <ResultCard title="Relative" value={formatRelativeTime(instant, Math.max(since, tick))} />
  );
}

export function TimestampConverter() {
  const id = useId();
  const [state, setState] = useState(createConverterState);
  const [editedAt, setEditedAt] = useState(0);

  // Every edit is applied to the latest state. The date picker reports each
  // value it is handed back as a change, and such an echo is only recognised
  // as no change when it is compared with the state that caused it.
  const apply = (edit: (current: ConverterState) => ConverterState) => {
    setEditedAt(Date.now());
    setState(edit);
  };

  const handleNow = () => {
    const now = Date.now();
    apply((current) => showInstant(current, now));
  };

  const { instant } = state;
  const results = instant === null ? null : describeInstant(instant);
  const dateIncomplete = state.date !== '' && instant === null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Unix Timestamp Converter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor={`${id}-unit`} className="text-sm font-medium mb-2 block">
              Unit
            </label>
            <Select
              value={state.unit}
              onValueChange={(unit: TimestampUnit) =>
                apply((current) => changeUnit(current, unit))
              }
            >
              <SelectTrigger id={`${id}-unit`} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {unitOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label htmlFor={`${id}-timestamp`} className="text-sm font-medium mb-2 block">
                Timestamp
              </label>
              <Input
                id={`${id}-timestamp`}
                type="text"
                value={state.timestamp}
                onChange={(e) => {
                  const raw = e.target.value;
                  apply((current) => editTimestamp(current, raw));
                }}
                placeholder={state.unit === 'seconds' ? '1640995200' : '1640995200000'}
                className="font-mono"
                aria-invalid={state.error ? true : undefined}
                aria-describedby={state.error ? `${id}-error` : undefined}
              />
            </div>

            <div role="group" aria-labelledby={`${id}-datetime`}>
              <span id={`${id}-datetime`} className="text-sm font-medium mb-2 block">
                Date / Time
              </span>
              <div className="flex flex-wrap gap-2 items-center">
                <DatePicker
                  value={state.date}
                  onChange={(date) => apply((current) => editDateTime(current, { date }))}
                  className="w-40"
                  error={dateIncomplete}
                />
                <div className="flex items-center gap-1">
                  <Select
                    value={state.hour}
                    onValueChange={(hour: string) =>
                      apply((current) => editDateTime(current, { hour }))
                    }
                  >
                    <SelectTrigger className="w-18 gap-1 px-2" aria-label="Hour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectGroup>
                        {HOURS.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <span className="font-medium text-muted-foreground">:</span>
                  <Select
                    value={state.minute}
                    onValueChange={(minute: string) =>
                      apply((current) => editDateTime(current, { minute }))
                    }
                  >
                    <SelectTrigger className="w-18 gap-1 px-2" aria-label="Minute">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectGroup>
                        {MINUTES.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {state.error && (
            <div
              id={`${id}-error`}
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {state.error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleNow} variant="outline" size="sm">Now</Button>
            <Button
              onClick={() => apply((current) => createConverterState(current.unit))}
              variant="outline"
              size="sm"
            >
              <Trash2 className="h-4 w-4 mr-2" />Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {results && instant !== null && (
        <div className="space-y-4">
          <ResultCard title="ISO 8601" value={results.iso} />
          <ResultCard title="Local" value={results.local} />
          <ResultCard title="UTC" value={results.utc} />
          <RelativeTimeCard instant={instant} since={editedAt} />
        </div>
      )}
    </div>
  );
}
