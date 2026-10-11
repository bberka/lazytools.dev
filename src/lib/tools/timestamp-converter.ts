/**
 * Unix timestamp converter logic.
 *
 * The tool has two sides that describe one moment: a timestamp field, and a
 * date with an hour and a minute in the runtime's time zone. `ConverterState`
 * holds both sides plus the exact moment they stand for, and every edit is a
 * function from one state to the next. The moment is kept on its own because
 * the date side only has minute precision: a typed timestamp keeps its
 * seconds and milliseconds in the results.
 *
 * The local-time helpers read the runtime's time zone through `Date`; the
 * current time is always passed in.
 */

import { formatDateInput, parseDateInput } from './calendar-date';

export type TimestampUnit = 'seconds' | 'milliseconds';

/** The largest distance from the epoch a `Date` can hold, in milliseconds. */
const MAX_INSTANT = 8.64e15;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Timestamp text
// ---------------------------------------------------------------------------

export type ParsedTimestamp =
  /** Nothing to convert yet: blank, or only a sign or decimal point so far. */
  | { kind: 'empty' }
  | { kind: 'invalid'; error: string }
  | { kind: 'instant'; ms: number };

/**
 * Reads timestamp text as a moment in epoch milliseconds. The whole text has
 * to be one number: "12-34" and "1.2.3" are invalid rather than read as 12
 * and 1.2. Seconds may carry a decimal part.
 */
export function parseTimestamp(text: string, unit: TimestampUnit): ParsedTimestamp {
  const trimmed = text.trim();

  if (/^-?\.?$/.test(trimmed)) {
    return { kind: 'empty' };
  }

  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    return { kind: 'invalid', error: 'Enter the timestamp as a single number.' };
  }

  const value = Number(trimmed);
  const ms = unit === 'seconds' ? Math.round(value * 1000) : Math.trunc(value);

  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_INSTANT) {
    return {
      kind: 'invalid',
      error: 'This timestamp is outside the range of dates that can be shown.',
    };
  }

  // `|| 0` turns -0 into 0.
  return { kind: 'instant', ms: ms || 0 };
}

/** The timestamp of a moment in `unit`; seconds are rounded down. */
export function formatTimestamp(ms: number, unit: TimestampUnit): string {
  return String(unit === 'seconds' ? Math.floor(ms / 1000) : ms);
}

// ---------------------------------------------------------------------------
// Local date and time
// ---------------------------------------------------------------------------

export interface LocalDateTime {
  /** `YYYY-MM-DD`, or what has been typed of it so far. */
  date: string;
  /** "00" to "23". */
  hour: string;
  /** "00" to "59". */
  minute: string;
}

/**
 * The wall-clock date, hour and minute of a moment in the runtime's time
 * zone. Returns null when the year is outside 0001 to 9999, which a
 * `YYYY-MM-DD` date field cannot hold.
 */
export function toLocalDateTime(ms: number): LocalDateTime | null {
  const date = new Date(ms);
  const year = date.getFullYear();

  if (Number.isNaN(year) || year < 1 || year > 9999) {
    return null;
  }

  return {
    date: formatDateInput(year, date.getMonth() + 1, date.getDate()),
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
  };
}

/**
 * The moment a wall-clock date, hour and minute happen in the runtime's time
 * zone, at zero seconds. Returns null when they do not form a real date and
 * time. A time the zone skips when daylight saving starts moves to the time
 * the clocks jump to.
 */
export function fromLocalDateTime({ date, hour, minute }: LocalDateTime): number | null {
  const day = parseDateInput(date);
  const hours = /^\d{2}$/.test(hour) ? Number(hour) : NaN;
  const minutes = /^\d{2}$/.test(minute) ? Number(minute) : NaN;

  if (!day || !(hours <= 23) || !(minutes <= 59)) {
    return null;
  }

  // Start from noon so setting the date cannot land in a skipped hour, and
  // use setFullYear because the Date constructor reads years 0 to 99 as 19xx.
  const local = new Date(2000, 0, 1, 12);
  local.setFullYear(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  local.setHours(hours, minutes, 0, 0);

  const ms = local.getTime();
  return Number.isNaN(ms) ? null : ms;
}

// ---------------------------------------------------------------------------
// Converter state
// ---------------------------------------------------------------------------

export interface ConverterState extends LocalDateTime {
  unit: TimestampUnit;
  /** The timestamp field, as typed. */
  timestamp: string;
  /** The moment both sides stand for, in epoch milliseconds; null when there is none. */
  instant: number | null;
  /** Why the timestamp field gives no moment; empty when it is fine or blank. */
  error: string;
}

const BLANK_DATE_TIME: LocalDateTime = { date: '', hour: '00', minute: '00' };

export function createConverterState(unit: TimestampUnit = 'seconds'): ConverterState {
  return { unit, timestamp: '', ...BLANK_DATE_TIME, instant: null, error: '' };
}

/**
 * The timestamp field changed to `raw`. Characters that cannot be part of a
 * number are dropped. The date side follows the new moment, and is emptied
 * when the text gives none, or gives one the date field cannot show.
 */
export function editTimestamp(state: ConverterState, raw: string): ConverterState {
  const timestamp = raw.replace(/[^\d.-]/g, '');
  const parsed = parseTimestamp(timestamp, state.unit);

  if (parsed.kind !== 'instant') {
    return {
      ...state,
      timestamp,
      ...BLANK_DATE_TIME,
      instant: null,
      error: parsed.kind === 'invalid' ? parsed.error : '',
    };
  }

  return {
    ...state,
    timestamp,
    ...(toLocalDateTime(parsed.ms) ?? BLANK_DATE_TIME),
    instant: parsed.ms,
    error: '',
  };
}

/**
 * The date, hour or minute changed. The timestamp follows, and is emptied
 * while the date is incomplete or not a real date.
 *
 * A change that leaves all three as they are returns the same state. The
 * date field reports every value it is given back as a change, so without
 * this a typed timestamp would be rewritten to the start of its minute.
 */
export function editDateTime(
  state: ConverterState,
  change: Partial<LocalDateTime>
): ConverterState {
  const next: LocalDateTime = {
    date: change.date ?? state.date,
    hour: change.hour ?? state.hour,
    minute: change.minute ?? state.minute,
  };

  if (next.date === state.date && next.hour === state.hour && next.minute === state.minute) {
    return state;
  }

  const ms = fromLocalDateTime(next);

  if (ms === null) {
    return { ...state, ...next, timestamp: '', instant: null, error: '' };
  }

  return {
    ...state,
    // Read the fields back so a skipped local time shows where it landed.
    ...(toLocalDateTime(ms) ?? next),
    timestamp: formatTimestamp(ms, state.unit),
    instant: ms,
    error: '',
  };
}

/**
 * Puts a moment on both sides, at the precision of the state's unit. Used
 * for "now".
 */
export function showInstant(state: ConverterState, ms: number): ConverterState {
  return editTimestamp(state, formatTimestamp(ms, state.unit));
}

/**
 * Switches between seconds and milliseconds. A moment the date side shows is
 * kept and its timestamp rewritten in the new unit. Text that gives no such
 * moment is read again in the new unit, which is what fixes a millisecond
 * timestamp pasted while the unit was seconds.
 */
export function changeUnit(state: ConverterState, unit: TimestampUnit): ConverterState {
  if (unit === state.unit) {
    return state;
  }

  const next = { ...state, unit };

  if (state.timestamp === '') {
    return next;
  }

  if (state.instant !== null && state.date !== '') {
    return showInstant(next, state.instant);
  }

  return editTimestamp(next, state.timestamp);
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function count(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

/** "5 minutes ago", "2 days from now", or "now" within the same second. */
export function formatRelativeTime(ms: number, now: number): string {
  const diff = now - ms;
  const secs = Math.floor(Math.abs(diff) / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (secs === 0) {
    return 'now';
  }

  const suffix = diff > 0 ? 'ago' : 'from now';

  if (days > 0) return `${count(days, 'day')} ${suffix}`;
  if (hrs > 0) return `${count(hrs, 'hour')} ${suffix}`;
  if (mins > 0) return `${count(mins, 'minute')} ${suffix}`;
  return `${count(secs, 'second')} ${suffix}`;
}

export interface InstantDescription {
  iso: string;
  /** In the runtime's locale and time zone. */
  local: string;
  utc: string;
}

export function describeInstant(ms: number): InstantDescription {
  const date = new Date(ms);

  return {
    iso: date.toISOString(),
    local: date.toLocaleString(),
    utc: date.toUTCString(),
  };
}
