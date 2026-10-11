'use client';

import { useId, useMemo, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { ArrowRightLeft, Check, Clock3, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCopyToClipboard } from '@/hooks';
import { toDateInputValue } from '@/lib/tools/calendar-date';
import {
  COMMON_TIME_ZONES,
  convertTimeZone,
  listTimeZones,
  resolveLocalTimeZone,
  searchTimeZones,
  timeZoneLabel,
  toTimeZoneOptions,
  type TimeZoneOption,
} from '@/lib/tools/timezone-converter';
import { cn } from '@/lib/utils/cn';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const COMMON_TIME_ZONE_OPTIONS = toTimeZoneOptions(COMMON_TIME_ZONES);

type Defaults = {
  timeZone: string;
  date: string;
  hour: string;
  minute: string;
};

// What the static HTML is built with: no clock and no local zone.
const STATIC_DEFAULTS: Defaults = { timeZone: 'UTC', date: '', hour: '00', minute: '00' };

function getLocalDefaults(): Defaults {
  const now = new Date();

  return {
    timeZone: resolveLocalTimeZone(),
    date: toDateInputValue(now),
    hour: String(now.getHours()).padStart(2, '0'),
    minute: String(now.getMinutes()).padStart(2, '0'),
  };
}

const noSubscription = () => () => {};

function TimeZonePicker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (timeZone: string) => void;
  options: TimeZoneOption[];
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const filteredOptions = useMemo(
    () => (search.trim() ? searchTimeZones(options, search) : COMMON_TIME_ZONE_OPTIONS),
    [search, options]
  );
  const activeIndex = Math.min(highlightedIndex, filteredOptions.length - 1);
  const optionId = (index: number) => `${id}-option-${index}`;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    setSearch('');
    // Start on the current zone when it is in the list that opens.
    setHighlightedIndex(
      Math.max(0, COMMON_TIME_ZONE_OPTIONS.findIndex((option) => option.value === value))
    );
  };

  const select = (timeZone: string) => {
    onChange(timeZone);
    handleOpenChange(false);
  };

  const scrollToOption = (index: number) => {
    document.getElementById(optionId(index))?.scrollIntoView({ block: 'nearest' });
  };

  const highlight = (index: number) => {
    setHighlightedIndex(index);
    scrollToOption(index);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    // Enter that confirms an input-method composition is not a selection.
    if (filteredOptions.length === 0 || event.nativeEvent.isComposing) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        highlight(activeIndex + 1 >= filteredOptions.length ? 0 : activeIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        highlight(activeIndex - 1 < 0 ? filteredOptions.length - 1 : activeIndex - 1);
        break;
      case 'Enter':
        event.preventDefault();
        select(filteredOptions[activeIndex].value);
        break;
      default:
        break;
    }
  };

  return (
    <div>
      <span id={`${id}-label`} className="mb-2 block text-sm font-medium">
        {label}
      </span>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id={`${id}-trigger`}
            variant="outline"
            className="w-full justify-start text-left font-normal truncate"
            aria-labelledby={`${id}-label ${id}-trigger`}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                handleOpenChange(true);
              }
            }}
          >
            <span className="truncate">{timeZoneLabel(value)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-full max-w-none overflow-hidden p-0"
          align="start"
          onKeyDown={handleKeyDown}
          onOpenAutoFocus={() => scrollToOption(activeIndex)}
        >
          <div className="border-b p-1">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlightedIndex(0);
              }}
              placeholder="Search time zones..."
              className="h-9"
              autoFocus
              role="combobox"
              aria-label={`Search ${label} time zones`}
              aria-expanded
              aria-controls={`${id}-list`}
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            />
          </div>
          <ScrollArea className="h-60">
            <div id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="p-1">
              {filteredOptions.map((option, index) => (
                <button
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={value === option.value}
                  tabIndex={-1}
                  className={cn(
                    'flex w-full cursor-default items-center truncate rounded-sm px-2 py-1.5 text-sm outline-none',
                    value === option.value && 'font-medium',
                    index === activeIndex && 'bg-accent text-accent-foreground'
                  )}
                  type="button"
                  onClick={() => select(option.value)}
                  onMouseMove={() => setHighlightedIndex(index)}
                >
                  {option.label}
                </button>
              ))}
              {filteredOptions.length === 0 && (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">No matching time zones</div>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Converter({ defaults }: { defaults: Defaults }) {
  const id = useId();
  const [sourceTimeZone, setSourceTimeZone] = useState(defaults.timeZone);
  const [targetTimeZone, setTargetTimeZone] = useState('UTC');
  const [date, setDate] = useState(defaults.date);
  const [hour, setHour] = useState(defaults.hour);
  const [minute, setMinute] = useState(defaults.minute);
  const copyResult = useCopyToClipboard();

  const timeZoneOptions = useMemo(
    () => toTimeZoneOptions(listTimeZones(undefined, [defaults.timeZone])),
    [defaults.timeZone]
  );

  const conversion = useMemo(
    () => convertTimeZone(date ? `${date}T${hour}:${minute}` : '', sourceTimeZone, targetTimeZone),
    [date, hour, minute, sourceTimeZone, targetTimeZone]
  );

  const converted = conversion.status === 'ok' ? conversion : null;
  const error =
    conversion.status === 'invalid'
      ? 'Enter a valid date and time.'
      : conversion.status === 'nonexistent'
        ? 'This local time is invalid or ambiguous in the selected source time zone. Try a different minute.'
        : '';
  const detail = converted
    ? `${sourceTimeZone} → ${targetTimeZone}`
    : conversion.status === 'empty'
      ? 'Choose a date and time to convert.'
      : '';

  const setDateTime = (now: Date) => {
    setDate(toDateInputValue(now));
    setHour(String(now.getHours()).padStart(2, '0'));
    setMinute(String(now.getMinutes()).padStart(2, '0'));
  };

  // Picking a time before any date starts from today.
  const ensureDate = () => {
    if (!date) setDate(toDateInputValue(new Date()));
  };

  const handleSwap = () => {
    setSourceTimeZone(targetTimeZone);
    setTargetTimeZone(sourceTimeZone);

    if (converted) {
      setDate(converted.targetInputValue.slice(0, 10));
      setHour(converted.targetInputValue.slice(11, 13));
      setMinute(converted.targetInputValue.slice(14, 16));
    }
  };

  const handleClear = () => {
    setDate('');
    setHour('00');
    setMinute('00');
    setSourceTimeZone(defaults.timeZone);
    setTargetTimeZone('UTC');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Timezone Converter</CardTitle>
          <CardDescription>
            Convert a local date and time between IANA time zones using browser-side formatting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div role="group" aria-labelledby={`${id}-datetime`}>
            <span id={`${id}-datetime`} className="mb-2 block text-sm font-medium">
              Date and time
            </span>
            <div className="flex flex-wrap gap-2 items-center">
              <DatePicker value={date} onChange={setDate} className="w-40" />
              <div className="flex items-center gap-1">
                <Select
                  value={hour}
                  onValueChange={(nextHour: string) => {
                    ensureDate();
                    setHour(nextHour);
                  }}
                >
                  <SelectTrigger className="w-18" aria-label="Hour">
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
                  value={minute}
                  onValueChange={(nextMinute: string) => {
                    ensureDate();
                    setMinute(nextMinute);
                  }}
                >
                  <SelectTrigger className="w-18" aria-label="Minute">
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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
            <TimeZonePicker
              label="From"
              value={sourceTimeZone}
              onChange={setSourceTimeZone}
              options={timeZoneOptions}
            />

            <div className="flex justify-center lg:pb-0.5">
              <Button
                onClick={handleSwap}
                variant="outline"
                size="icon"
                aria-label="Swap time zones"
                className="h-11 w-full sm:w-11 lg:h-10 lg:w-10"
              >
                <ArrowRightLeft className="h-4 w-4" />
              </Button>
            </div>

            <TimeZonePicker
              label="To"
              value={targetTimeZone}
              onChange={setTargetTimeZone}
              options={timeZoneOptions}
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDateTime(new Date())} variant="outline">
              <Clock3 className="mr-2 h-4 w-4" />
              Now
            </Button>
            <Button onClick={handleClear} variant="outline">
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
            <Button
              onClick={() => copyResult.copyToClipboard(converted?.targetInputValue ?? '')}
              variant={copyResult.isCopied ? 'default' : 'outline'}
              disabled={!converted}
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
          <CardTitle>Converted Time</CardTitle>
          <CardDescription>{error ? 'Adjust the date, time, or zone selection.' : detail}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted p-4 font-mono text-xl font-semibold tracking-tight sm:text-2xl">
            {converted?.value || '-'}
          </div>

          {converted && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-md border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Source time
                </div>
                <div className="mt-1 font-semibold">{converted.sourceFormatted}</div>
                <div className="mt-1 text-sm text-muted-foreground">{converted.sourceOffset}</div>
              </div>
              <div className="rounded-md border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Target input format
                </div>
                <div className="mt-1 font-mono text-base font-semibold">
                  {converted.targetInputValue}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{converted.targetOffset}</div>
              </div>
              <div className="rounded-md border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  UTC reference
                </div>
                <div className="mt-1 font-semibold">{converted.utcFormatted}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {converted.utcDate.toISOString()}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function TimezoneConverter() {
  // The page is exported as static HTML at build time. Rendering the build
  // machine's clock and zone into it gives every visitor stale values and a
  // hydration mismatch, so the HTML and the first client render use fixed
  // defaults and the form is mounted again with local ones once hydrated.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  );
  const [localDefaults] = useState(getLocalDefaults);

  return hydrated ? (
    <Converter key="local" defaults={localDefaults} />
  ) : (
    <Converter key="static" defaults={STATIC_DEFAULTS} />
  );
}
