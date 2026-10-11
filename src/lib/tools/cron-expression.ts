/**
 * Five-field cron expressions (minute, hour, day of month, month, day of
 * week): validation, a plain-English description, the upcoming run times, and
 * the expression a guided schedule stands for.
 *
 * Supported syntax per field: `*`, a number, a list (`1,15`), a range (`1-5`)
 * and a step after a slash on any of them (every 15th value, `10-40/10`,
 * `5/15`). Names such as `MON` or `JAN` and macros such as `@daily` are not
 * supported.
 *
 * Nothing here reads the clock or touches the DOM: the caller passes the
 * moment to count from, so the same input always gives the same answer.
 */

export const DAY_NAMES: readonly string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// ── Types ─────────────────────────────────────────────────────────────────────

/** The five fields exactly as written. */
export interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

export type CronTimezone = 'local' | 'utc';

interface FieldSpec {
  key: keyof CronParts;
  label: string;
  min: number;
  max: number;
}

/** One comma-separated piece of a field, already resolved to numbers. */
interface Segment {
  kind: 'any' | 'value' | 'range';
  start: number;
  end: number;
  step: number;
}

interface CronField {
  text: string;
  spec: FieldSpec;
  segments: Segment[];
  /** Every value the field allows, ascending. */
  values: number[];
}

/** A valid expression. Build one with `parseCron`. */
export interface CronSchedule {
  parts: CronParts;
  description: string;
  /** Resolved fields, for `nextCronRuns`. Not meant to be read by callers. */
  fields: Record<keyof CronParts, CronField>;
}

export type CronParseResult =
  | { ok: true; schedule: CronSchedule }
  | { ok: false; error: string };

// ── Parsing ───────────────────────────────────────────────────────────────────

const FIELD_SPECS: readonly FieldSpec[] = [
  { key: 'minute', label: 'Minute', min: 0, max: 59 },
  { key: 'hour', label: 'Hour', min: 0, max: 23 },
  { key: 'dayOfMonth', label: 'Day of month', min: 1, max: 31 },
  { key: 'month', label: 'Month', min: 1, max: 12 },
  { key: 'dayOfWeek', label: 'Day of week', min: 0, max: 6 },
];

class CronSyntaxError extends Error {}

/** Plain decimal digits only: `Number()` would also take "", "1e1" and "0x1f". */
function parseInteger(text: string): number | null {
  return /^\d+$/.test(text) ? Number(text) : null;
}

function parseField(text: string, spec: FieldSpec): CronField {
  const { label, min, max } = spec;
  const inRange = (value: number) => value >= min && value <= max;
  const segments: Segment[] = [];

  for (const piece of text.split(',')) {
    if (!piece) {
      throw new CronSyntaxError(`${label} contains an empty segment.`);
    }

    const stepParts = piece.split('/');
    if (stepParts.length > 2) {
      throw new CronSyntaxError(`${label} has an invalid step value.`);
    }

    const [base, stepText] = stepParts;
    let step = 1;
    if (stepText !== undefined) {
      const parsedStep = parseInteger(stepText);
      if (parsedStep === null || parsedStep <= 0) {
        throw new CronSyntaxError(`${label} step must be a positive integer.`);
      }
      step = parsedStep;
    }

    if (base === '*') {
      segments.push({ kind: 'any', start: min, end: max, step });
      continue;
    }

    if (base.includes('-')) {
      const bounds = base.split('-');
      const start = bounds.length === 2 ? parseInteger(bounds[0]) : null;
      const end = bounds.length === 2 ? parseInteger(bounds[1]) : null;
      if (start === null || end === null || !inRange(start) || !inRange(end)) {
        throw new CronSyntaxError(`${label} range must stay between ${min} and ${max}.`);
      }
      if (start > end) {
        throw new CronSyntaxError(`${label} range must start at or before its end.`);
      }
      segments.push({ kind: 'range', start, end, step });
      continue;
    }

    const value = parseInteger(base);
    if (value === null || !inRange(value)) {
      throw new CronSyntaxError(`${label} must stay between ${min} and ${max}.`);
    }
    // A step on a single value ("5/15") counts from that value to the end of the field.
    segments.push(
      stepText === undefined
        ? { kind: 'value', start: value, end: value, step: 1 }
        : { kind: 'range', start: value, end: max, step }
    );
  }

  const values = new Set<number>();
  for (const segment of segments) {
    for (let value = segment.start; value <= segment.end; value += segment.step) {
      values.add(value);
    }
  }

  return { text, spec, segments, values: Array.from(values).sort((a, b) => a - b) };
}

/**
 * Validates an expression and describes it. The error text is ready to show
 * to the user.
 */
export function parseCron(expression: string): CronParseResult {
  const texts = expression.trim().split(/\s+/);

  if (texts.length !== 5) {
    return {
      ok: false,
      error:
        'Cron expression must have exactly 5 fields: minute hour day-of-month month day-of-week.',
    };
  }

  try {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = FIELD_SPECS.map((spec, index) =>
      parseField(texts[index], spec)
    );
    const fields = { minute, hour, dayOfMonth, month, dayOfWeek };
    return {
      ok: true,
      schedule: {
        parts: {
          minute: minute.text,
          hour: hour.text,
          dayOfMonth: dayOfMonth.text,
          month: month.text,
          dayOfWeek: dayOfWeek.text,
        },
        description: describe(fields),
        fields,
      },
    };
  } catch (error) {
    if (error instanceof CronSyntaxError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

/**
 * Cron's day rule: when both day fields are restricted, a day matching either
 * one runs. A field that starts with `*` counts as unrestricted, so then both
 * must match.
 */
function runsOnEitherDayField(fields: CronSchedule['fields']): boolean {
  return !fields.dayOfMonth.text.startsWith('*') && !fields.dayOfWeek.text.startsWith('*');
}

// ── Description ───────────────────────────────────────────────────────────────

type FieldShape =
  | { kind: 'all' }
  // A star with a step.
  | { kind: 'step'; step: number }
  // One stepped range: `a-b/n` or `a/n`.
  | { kind: 'steppedRange'; step: number; start: number; end: number }
  // One unstepped range: `a-b`.
  | { kind: 'range'; start: number; end: number }
  // Anything else: values, or a mix of values and ranges.
  | { kind: 'list'; values: number[] | null };

function shapeOf(field: CronField): FieldShape {
  const { min, max } = field.spec;

  if (field.values.length === max - min + 1) {
    return { kind: 'all' };
  }
  // "*/45" in the hour field only ever matches hour 0: describe what it does.
  if (field.values.length === 1) {
    return { kind: 'list', values: field.values };
  }

  if (field.segments.length === 1) {
    const [segment] = field.segments;
    if (segment.kind === 'any') {
      return { kind: 'step', step: segment.step };
    }
    if (segment.step > 1) {
      return { kind: 'steppedRange', step: segment.step, start: segment.start, end: segment.end };
    }
    return { kind: 'range', start: segment.start, end: segment.end };
  }

  const onlyValues = field.segments.every((segment) => segment.kind === 'value');
  return { kind: 'list', values: onlyValues ? field.values : null };
}

function ordinal(value: number): string {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][value % 10] ?? 'th';
  return `${value}${suffix}`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "1, 15 and 20 through 25" for the pieces of a list-shaped field. */
function listText(field: CronField, format: (value: number) => string): string {
  const shape = shapeOf(field);
  if (shape.kind === 'list' && shape.values) {
    return joinList(shape.values.map(format));
  }

  return joinList(
    field.segments.map((segment) => {
      if (segment.kind === 'value') return format(segment.start);
      const span = `${format(segment.start)} through ${format(segment.end)}`;
      return segment.step > 1 ? `every ${ordinal(segment.step)} from ${span}` : span;
    })
  );
}

const pad = (value: number) => String(value).padStart(2, '0');

function describeTime(minute: CronField, hour: CronField): string {
  const minuteShape = shapeOf(minute);
  const hourShape = shapeOf(hour);

  // A handful of fixed times reads best as clock times.
  if (
    minuteShape.kind === 'list' &&
    hourShape.kind === 'list' &&
    minuteShape.values &&
    hourShape.values &&
    minuteShape.values.length * hourShape.values.length <= 4
  ) {
    const minutes = minuteShape.values;
    const times = hourShape.values.flatMap((h) => minutes.map((m) => `${pad(h)}:${pad(m)}`));
    return `at ${joinList(times)}`;
  }

  let minutePhrase: string;
  // "at minute 5 of hour 9" but "every 5 minutes during hour 9".
  let joiner = 'during';

  switch (minuteShape.kind) {
    case 'all':
      minutePhrase = 'every minute';
      break;
    case 'step':
      minutePhrase = `every ${minuteShape.step} minutes`;
      break;
    case 'steppedRange':
      minutePhrase = `every ${minuteShape.step} minutes from minute ${minuteShape.start} through ${minuteShape.end}`;
      break;
    default: {
      const single = minute.values.length === 1;
      minutePhrase = `at ${single ? 'minute' : 'minutes'} ${listText(minute, String)}`;
      joiner = 'of';
    }
  }

  switch (hourShape.kind) {
    case 'all':
      return joiner === 'of' ? `${minutePhrase} of every hour` : minutePhrase;
    case 'step':
      return `${minutePhrase} ${joiner} every ${ordinal(hourShape.step)} hour`;
    case 'steppedRange':
      return `${minutePhrase} ${joiner} every ${ordinal(hourShape.step)} hour from ${hourShape.start} through ${hourShape.end}`;
    default: {
      const single = hour.values.length === 1;
      return `${minutePhrase} ${joiner} ${single ? 'hour' : 'hours'} ${listText(hour, String)}`;
    }
  }
}

function describeDayOfMonth(field: CronField): string {
  const shape = shapeOf(field);
  switch (shape.kind) {
    case 'all':
      return '';
    case 'step':
      return `on every ${ordinal(shape.step)} day of the month`;
    case 'steppedRange':
      return `on every ${ordinal(shape.step)} day of the month from day ${shape.start} through ${shape.end}`;
    default: {
      const single = field.values.length === 1;
      return `on ${single ? 'day' : 'days'} ${listText(field, String)} of the month`;
    }
  }
}

function describeMonth(field: CronField): string {
  const name = (value: number) => MONTH_NAMES[value - 1];
  const shape = shapeOf(field);
  switch (shape.kind) {
    case 'all':
      return '';
    case 'step':
      return `in every ${ordinal(shape.step)} month`;
    case 'steppedRange':
      return `in every ${ordinal(shape.step)} month from ${name(shape.start)} through ${name(shape.end)}`;
    default:
      return `in ${listText(field, name)}`;
  }
}

function describeDayOfWeek(field: CronField): string {
  const name = (value: number) => DAY_NAMES[value];
  const shape = shapeOf(field);
  switch (shape.kind) {
    case 'all':
      return '';
    case 'step':
      return `on every ${ordinal(shape.step)} day of the week`;
    case 'steppedRange':
      return `on every ${ordinal(shape.step)} day of the week from ${name(shape.start)} through ${name(shape.end)}`;
    case 'range':
      return shape.start === 1 && shape.end === 5
        ? 'on weekdays'
        : `from ${name(shape.start)} through ${name(shape.end)}`;
    default:
      return `on ${listText(field, name)}`;
  }
}

function describe(fields: CronSchedule['fields']): string {
  const day = describeDayOfMonth(fields.dayOfMonth);
  const month = describeMonth(fields.month);
  const weekday = describeDayOfWeek(fields.dayOfWeek);
  const time = describeTime(fields.minute, fields.hour);

  // When either day field is enough, one that allows every day ("1-31") makes
  // the other one moot: the schedule runs daily.
  const phrases = runsOnEitherDayField(fields)
    ? [time, day && weekday ? `${day} or ${weekday}` : '', month]
    : [time, day, month, weekday];

  return phrases.filter(Boolean).join(', ');
}

// ── Upcoming runs ─────────────────────────────────────────────────────────────

/** How far ahead to look before deciding a schedule has no more runs. */
export const CRON_SEARCH_YEARS = 100;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * The moments a wall-clock time falls on: one in UTC, and in local time none
 * when a daylight-saving jump skips it or two when clocks go back and it
 * happens twice. Like Vixie cron, a job with a wildcard minute or hour
 * (`repeats`) runs on both occurrences, so an every-15-minutes job keeps its
 * rhythm through the repeated hour; any other job runs once, on the first.
 */
function instantsAt(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: CronTimezone,
  repeats: boolean
): Date[] {
  if (timezone === 'utc') {
    return [new Date(Date.UTC(year, month - 1, day, hour, minute))];
  }

  const isThatTime = (date: Date) =>
    date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute;

  // The Date constructor takes the first occurrence of a repeated time. For a
  // skipped time it quietly moves to another hour, which is caught here.
  const first = new Date(year, month - 1, day, hour, minute);
  if (!isThatTime(first)) return [];
  if (!repeats) return [first];

  // Clocks go back by an hour, or by half an hour in a few places.
  const second = [30, 60]
    .map((minutes) => new Date(first.getTime() + minutes * 60_000))
    .find(isThatTime);
  return second ? [first, second] : [first];
}

export interface NextCronRunsOptions {
  /** Runs strictly later than this moment are returned. */
  after: Date;
  /** How many runs to return at most. Default 5. */
  count?: number;
  /** Whether the fields are read in the device's time zone or in UTC. Default local. */
  timezone?: CronTimezone;
}

/**
 * The next times the schedule runs, soonest first. Fewer than `count` (down to
 * none, for a date such as February 30) come back when the schedule runs out
 * within `CRON_SEARCH_YEARS`.
 */
export function nextCronRuns(schedule: CronSchedule, options: NextCronRunsOptions): Date[] {
  const { after, count = 5, timezone = 'local' } = options;
  const { fields } = schedule;
  const utc = timezone === 'utc';

  const months = new Set(fields.month.values);
  const monthDays = new Set(fields.dayOfMonth.values);
  const weekDays = new Set(fields.dayOfWeek.values);
  const eitherDay = runsOnEitherDayField(fields);
  const repeats = fields.minute.text.startsWith('*') || fields.hour.text.startsWith('*');

  // Walk the calendar a day at a time; only matching days cost a Date.
  let year = utc ? after.getUTCFullYear() : after.getFullYear();
  let month = (utc ? after.getUTCMonth() : after.getMonth()) + 1;
  let day = utc ? after.getUTCDate() : after.getDate();
  let weekDay = utc ? after.getUTCDay() : after.getDay();
  const lastYear = year + CRON_SEARCH_YEARS;

  const runs: Date[] = [];

  while (runs.length < count && year <= lastYear) {
    const monthLength = daysInMonth(year, month);

    if (!months.has(month)) {
      // Skip the rest of this month.
      weekDay = (weekDay + monthLength - day + 1) % 7;
      day = monthLength;
    } else {
      const onMonthDay = monthDays.has(day);
      const onWeekDay = weekDays.has(weekDay);

      if (eitherDay ? onMonthDay || onWeekDay : onMonthDay && onWeekDay) {
        for (const hour of fields.hour.values) {
          // The second pass through a repeated hour comes after its first, so
          // the hour's runs are put in order before they are taken.
          const hourRuns = fields.minute.values
            .flatMap((minute) => instantsAt(year, month, day, hour, minute, timezone, repeats))
            .sort((a, b) => a.getTime() - b.getTime());
          for (const run of hourRuns) {
            if (run.getTime() > after.getTime() && runs.length < count) {
              runs.push(run);
            }
          }
          if (runs.length >= count) break;
        }
      }
      weekDay = (weekDay + 1) % 7;
    }

    day += 1;
    if (day > monthLength) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }

  return runs;
}

/** "in 3 hours" for a moment that lies ahead of `now`, in whole units. */
export function formatTimeUntil(target: Date, now: Date): string {
  const minutes = Math.floor((target.getTime() - now.getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`;
  if (hours > 0) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  if (minutes > 0) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  return 'in less than a minute';
}

// ── Guided builder ────────────────────────────────────────────────────────────

export type CronBuilderMode =
  | 'every-minutes'
  | 'hourly'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'yearly';

/** The builder's inputs as typed. An empty one falls back to its default. */
export interface CronBuilderValues {
  everyMinutesInterval: string;
  hourlyMinute: string;
  scheduleHour: string;
  scheduleMinute: string;
  weeklyDay: string;
  monthlyDay: string;
  yearlyMonth: string;
  yearlyDay: string;
}

/**
 * A typed number as a cron value: blank becomes the fallback and "09" becomes
 * "9". Anything else is passed through so `parseCron` can explain what is
 * wrong with it.
 */
function builderNumber(raw: string, fallback: string): string {
  const text = raw.trim();
  if (!text) return fallback;
  return /^\d+$/.test(text) ? String(Number(text)) : text;
}

/** The expression a guided schedule stands for. */
export function buildCronExpression(mode: CronBuilderMode, values: CronBuilderValues): string {
  const minute = builderNumber(values.scheduleMinute, '0');
  const hour = builderNumber(values.scheduleHour, '0');

  switch (mode) {
    case 'every-minutes':
      return `*/${builderNumber(values.everyMinutesInterval, '1')} * * * *`;
    case 'hourly':
      return `${builderNumber(values.hourlyMinute, '0')} * * * *`;
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekdays':
      return `${minute} ${hour} * * 1-5`;
    case 'weekly':
      return `${minute} ${hour} * * ${builderNumber(values.weeklyDay, '1')}`;
    case 'monthly':
      return `${minute} ${hour} ${builderNumber(values.monthlyDay, '1')} * *`;
    case 'yearly':
      return `${minute} ${hour} ${builderNumber(values.yearlyDay, '1')} ${builderNumber(values.yearlyMonth, '1')} *`;
  }
}
