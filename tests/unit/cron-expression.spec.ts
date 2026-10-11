import { test, expect } from '@playwright/test';
import {
  buildCronExpression,
  formatTimeUntil,
  nextCronRuns,
  parseCron,
  type CronBuilderValues,
  type CronSchedule,
  type CronTimezone,
} from '@/lib/tools/cron-expression';

function schedule(expression: string): CronSchedule {
  const result = parseCron(expression);
  if (!result.ok) throw new Error(`expected "${expression}" to be valid, got: ${result.error}`);
  return result.schedule;
}

function errorOf(expression: string): string {
  const result = parseCron(expression);
  if (result.ok) throw new Error(`expected "${expression}" to be rejected`);
  return result.error;
}

const describe = (expression: string) => schedule(expression).description;

/** Upcoming runs in UTC as ISO minutes, e.g. "2026-03-02T09:00". */
function utcRuns(expression: string, after: string, count = 5): string[] {
  return nextCronRuns(schedule(expression), {
    after: new Date(after),
    count,
    timezone: 'utc',
  }).map((run) => run.toISOString().slice(0, 16));
}

test.describe('parseCron', () => {
  test('keeps the five fields as written', () => {
    expect(schedule('  */15   0-6 1,15 * 1-5 ').parts).toEqual({
      minute: '*/15',
      hour: '0-6',
      dayOfMonth: '1,15',
      month: '*',
      dayOfWeek: '1-5',
    });
  });

  test('accepts every supported form', () => {
    for (const expression of [
      '* * * * *',
      '0 0 1 1 0',
      '59 23 31 12 6',
      '*/5 */2 */3 */4 */2',
      '0-30/10 9-17 1-15 1-6 1-5',
      '0,15,30,45 0,12 1,15 3,6,9,12 0,6',
      '5/15 * * * *',
      '09 09 01 01 *',
    ]) {
      expect(parseCron(expression).ok, expression).toBe(true);
    }
  });

  test('asks for exactly five fields', () => {
    const message =
      'Cron expression must have exactly 5 fields: minute hour day-of-month month day-of-week.';
    expect(errorOf('')).toBe(message);
    expect(errorOf('   ')).toBe(message);
    expect(errorOf('* * * *')).toBe(message);
    expect(errorOf('* * * * * *')).toBe(message);
    expect(errorOf('@daily')).toBe(message);
  });

  test('rejects values outside each field', () => {
    expect(errorOf('60 * * * *')).toBe('Minute must stay between 0 and 59.');
    expect(errorOf('* 24 * * *')).toBe('Hour must stay between 0 and 23.');
    expect(errorOf('* * 0 * *')).toBe('Day of month must stay between 1 and 31.');
    expect(errorOf('* * 32 * *')).toBe('Day of month must stay between 1 and 31.');
    expect(errorOf('* * * 13 *')).toBe('Month must stay between 1 and 12.');
    expect(errorOf('* * * * 7')).toBe('Day of week must stay between 0 and 6.');
    expect(errorOf('* * * JAN *')).toBe('Month must stay between 1 and 12.');
  });

  test('rejects bad ranges, steps and lists', () => {
    expect(errorOf('0-60 * * * *')).toBe('Minute range must stay between 0 and 59.');
    expect(errorOf('30-10 * * * *')).toBe('Minute range must start at or before its end.');
    expect(errorOf('*/0 * * * *')).toBe('Minute step must be a positive integer.');
    expect(errorOf('*/x * * * *')).toBe('Minute step must be a positive integer.');
    expect(errorOf('*/5/2 * * * *')).toBe('Minute has an invalid step value.');
    expect(errorOf('1,,2 * * * *')).toBe('Minute contains an empty segment.');
    expect(errorOf('1, * * * *')).toBe('Minute contains an empty segment.');
  });

  // Number('') is 0 and Number('1e1') is 10, so these used to pass as valid.
  test('rejects half-written fields instead of reading them as zero', () => {
    expect(errorOf('-5 * * * *')).toBe('Minute range must stay between 0 and 59.');
    expect(errorOf('5- * * * *')).toBe('Minute range must stay between 0 and 59.');
    expect(errorOf('1-2-3 * * * *')).toBe('Minute range must stay between 0 and 59.');
    expect(errorOf('/5 * * * *')).toBe('Minute must stay between 0 and 59.');
    expect(errorOf('*/ * * * *')).toBe('Minute step must be a positive integer.');
    expect(errorOf('5/ * * * *')).toBe('Minute step must be a positive integer.');
    expect(errorOf('1e1 * * * *')).toBe('Minute must stay between 0 and 59.');
    expect(errorOf('0x1f * * * *')).toBe('Minute must stay between 0 and 59.');
    expect(errorOf('1.0 * * * *')).toBe('Minute must stay between 0 and 59.');
    expect(errorOf('+5 * * * *')).toBe('Minute must stay between 0 and 59.');
  });
});

test.describe('description', () => {
  test('describes the presets', () => {
    expect(describe('* * * * *')).toBe('every minute');
    expect(describe('*/15 * * * *')).toBe('every 15 minutes');
    expect(describe('0 * * * *')).toBe('at minute 0 of every hour');
    expect(describe('0 0 * * *')).toBe('at 00:00');
    expect(describe('0 9 * * 1-5')).toBe('at 09:00, on weekdays');
    expect(describe('0 0 * * 0')).toBe('at 00:00, on Sunday');
    expect(describe('0 0 1 * *')).toBe('at 00:00, on day 1 of the month');
  });

  test('describes single values in every field', () => {
    expect(describe('30 14 15 6 *')).toBe('at 14:30, on day 15 of the month, in June');
    expect(describe('* 9 * * *')).toBe('every minute during hour 9');
  });

  // These used to come out as raw syntax: "at */2:00", "at 09:0,30", "at 9-17:00".
  test('describes steps, lists and ranges in the time fields', () => {
    expect(describe('0 */2 * * *')).toBe('at minute 0 of every 2nd hour');
    expect(describe('0,30 9 * * *')).toBe('at 09:00 and 09:30');
    expect(describe('0 9-17 * * *')).toBe('at minute 0 of hours 9 through 17');
    expect(describe('*/5 9-17 * * *')).toBe('every 5 minutes during hours 9 through 17');
    expect(describe('0 0,6,12,18 * * *')).toBe('at 00:00, 06:00, 12:00 and 18:00');
    expect(describe('0,15,30,45 9,17 * * *')).toBe('at minutes 0, 15, 30 and 45 of hours 9 and 17');
    expect(describe('10-40/10 * * * *')).toBe('every 10 minutes from minute 10 through 40');
    expect(describe('*/10 */3 * * *')).toBe('every 10 minutes during every 3rd hour');
  });

  test('describes steps, lists and ranges in the date fields', () => {
    expect(describe('0 0 1,15 * *')).toBe('at 00:00, on days 1 and 15 of the month');
    expect(describe('0 0 */2 * *')).toBe('at 00:00, on every 2nd day of the month');
    expect(describe('0 0 1-7 * *')).toBe('at 00:00, on days 1 through 7 of the month');
    expect(describe('0 0 1 1,4,7,10 *')).toBe(
      'at 00:00, on day 1 of the month, in January, April, July and October'
    );
    expect(describe('0 0 1 1-6 *')).toBe('at 00:00, on day 1 of the month, in January through June');
    expect(describe('0 0 1 */3 *')).toBe('at 00:00, on day 1 of the month, in every 3rd month');
    expect(describe('0 0 * * 1-3')).toBe('at 00:00, from Monday through Wednesday');
    expect(describe('0 0 * * 0,6')).toBe('at 00:00, on Sunday and Saturday');
    expect(describe('0 0 * * 1,3-5')).toBe('at 00:00, on Monday and Wednesday through Friday');
    expect(describe('0 0 * * */2')).toBe('at 00:00, on every 2nd day of the week');
    expect(describe('0 0 * * 1-5/2')).toBe(
      'at 00:00, on every 2nd day of the week from Monday through Friday'
    );
  });

  test('describes a step that only ever hits one value as that value', () => {
    expect(describe('*/90 * * * *')).toBe('at minute 0 of every hour');
  });

  test('says "or" when both day fields are restricted', () => {
    expect(describe('0 0 13 * 5')).toBe('at 00:00, on day 13 of the month or on Friday');
    expect(describe('0 0 13 6 5')).toBe('at 00:00, on day 13 of the month or on Friday, in June');
  });

  test('describes what runs when one day field allows every day without a star', () => {
    // Either field is enough and 1-31 matches every day, so Monday adds nothing.
    expect(describe('0 0 1-31 * 1')).toBe('at 00:00');
    expect(utcRuns('0 0 1-31 * 1', '2026-03-01T00:00:00Z', 3)).toEqual([
      '2026-03-02T00:00',
      '2026-03-03T00:00',
      '2026-03-04T00:00',
    ]);
    // With a star both must match, and the description says so.
    expect(describe('0 0 * * 1')).toBe('at 00:00, on Monday');
    expect(describe('0 0 */2 * 1')).toBe('at 00:00, on every 2nd day of the month, on Monday');
  });
});

test.describe('nextCronRuns', () => {
  test('returns the next runs strictly after the given moment', () => {
    expect(utcRuns('*/15 * * * *', '2026-03-02T09:15:00Z', 3)).toEqual([
      '2026-03-02T09:30',
      '2026-03-02T09:45',
      '2026-03-02T10:00',
    ]);
    // Part-way through a minute, that minute is already gone.
    expect(utcRuns('* * * * *', '2026-03-02T09:15:30Z', 2)).toEqual([
      '2026-03-02T09:16',
      '2026-03-02T09:17',
    ]);
  });

  test('defaults to five runs', () => {
    const runs = nextCronRuns(schedule('0 * * * *'), {
      after: new Date('2026-03-02T09:15:00Z'),
      timezone: 'utc',
    });
    expect(runs).toHaveLength(5);
  });

  test('follows weekdays across a weekend', () => {
    // 2026-03-06 is a Friday.
    expect(utcRuns('0 9 * * 1-5', '2026-03-06T10:00:00Z', 3)).toEqual([
      '2026-03-09T09:00',
      '2026-03-10T09:00',
      '2026-03-11T09:00',
    ]);
  });

  test('crosses month and year ends', () => {
    expect(utcRuns('0 0 1 * *', '2026-11-15T00:00:00Z', 3)).toEqual([
      '2026-12-01T00:00',
      '2027-01-01T00:00',
      '2027-02-01T00:00',
    ]);
    expect(utcRuns('59 23 31 * *', '2026-01-31T23:59:00Z', 3)).toEqual([
      '2026-03-31T23:59',
      '2026-05-31T23:59',
      '2026-07-31T23:59',
    ]);
  });

  // The old search stopped after 366 days, so a yearly schedule listed one run.
  test('finds five runs of a yearly schedule', () => {
    expect(utcRuns('0 9 1 1 *', '2026-10-11T12:00:00Z')).toEqual([
      '2027-01-01T09:00',
      '2028-01-01T09:00',
      '2029-01-01T09:00',
      '2030-01-01T09:00',
      '2031-01-01T09:00',
    ]);
  });

  test('finds leap days years apart, including across 2100', () => {
    expect(utcRuns('0 0 29 2 *', '2026-10-11T12:00:00Z', 3)).toEqual([
      '2028-02-29T00:00',
      '2032-02-29T00:00',
      '2036-02-29T00:00',
    ]);
    expect(utcRuns('0 0 29 2 *', '2096-03-01T00:00:00Z', 1)).toEqual(['2104-02-29T00:00']);
  });

  test('returns nothing for a date that never occurs', () => {
    expect(utcRuns('0 0 30 2 *', '2026-10-11T12:00:00Z')).toEqual([]);
    expect(utcRuns('0 0 31 4,6,9,11 *', '2026-10-11T12:00:00Z')).toEqual([]);
  });

  // "5/15" was accepted but then ran at minute 5 only.
  test('counts a step on a single value from that value to the end of the field', () => {
    expect(utcRuns('5/15 * * * *', '2026-03-02T09:00:00Z', 5)).toEqual([
      '2026-03-02T09:05',
      '2026-03-02T09:20',
      '2026-03-02T09:35',
      '2026-03-02T09:50',
      '2026-03-02T10:05',
    ]);
  });

  test('applies steps to ranges and to the whole field', () => {
    expect(utcRuns('10-40/10 12 * * *', '2026-03-02T00:00:00Z', 5)).toEqual([
      '2026-03-02T12:10',
      '2026-03-02T12:20',
      '2026-03-02T12:30',
      '2026-03-02T12:40',
      '2026-03-03T12:10',
    ]);
    expect(utcRuns('0 */8 * * *', '2026-03-02T00:00:00Z', 4)).toEqual([
      '2026-03-02T08:00',
      '2026-03-02T16:00',
      '2026-03-03T00:00',
      '2026-03-03T08:00',
    ]);
  });

  // Cron runs on a day matching either field; the old check wanted both, so
  // "13 or Friday" only ever ran on Friday the 13th.
  test('runs when either day field matches if both are restricted', () => {
    // March 2026: Fridays are the 6th, 13th, 20th and 27th.
    expect(utcRuns('0 0 13 * 5', '2026-03-01T00:00:00Z', 5)).toEqual([
      '2026-03-06T00:00',
      '2026-03-13T00:00',
      '2026-03-20T00:00',
      '2026-03-27T00:00',
      '2026-04-03T00:00',
    ]);
    expect(utcRuns('0 0 1,15 * 1', '2026-03-01T00:00:00Z', 4)).toEqual([
      '2026-03-02T00:00',
      '2026-03-09T00:00',
      '2026-03-15T00:00',
      '2026-03-16T00:00',
    ]);
  });

  test('requires both day fields when one of them starts with a star', () => {
    // Odd days of the month that are also Mondays.
    expect(utcRuns('0 0 */2 * 1', '2026-03-01T00:00:00Z', 3)).toEqual([
      '2026-03-09T00:00',
      '2026-03-23T00:00',
      '2026-04-13T00:00',
    ]);
    expect(utcRuns('0 0 13 * *', '2026-03-01T00:00:00Z', 2)).toEqual([
      '2026-03-13T00:00',
      '2026-04-13T00:00',
    ]);
  });

  test('reads the fields in local time by default', () => {
    // Noon is never skipped or repeated by a daylight-saving change.
    const after = new Date(2026, 2, 2, 8, 0);
    const runs = nextCronRuns(schedule('30 12 * * *'), { after, count: 3 });

    expect(runs.map((run) => run.getTime())).toEqual([
      new Date(2026, 2, 2, 12, 30).getTime(),
      new Date(2026, 2, 3, 12, 30).getTime(),
      new Date(2026, 2, 4, 12, 30).getTime(),
    ]);
  });

  test('keeps runs in order and on the schedule in either time zone', () => {
    const after = new Date('2026-01-01T00:00:00Z');
    const zones: CronTimezone[] = ['local', 'utc'];

    for (const timezone of zones) {
      const runs = nextCronRuns(schedule('15 3 * * 0'), { after, count: 60, timezone });
      expect(runs).toHaveLength(60);

      runs.forEach((run, index) => {
        const utc = timezone === 'utc';
        expect(utc ? run.getUTCDay() : run.getDay()).toBe(0);
        expect(utc ? run.getUTCHours() : run.getHours()).toBe(3);
        expect(utc ? run.getUTCMinutes() : run.getMinutes()).toBe(15);
        expect(run.getTime()).toBeGreaterThan((runs[index - 1] ?? after).getTime());
      });
    }
  });
});

test.describe('formatTimeUntil', () => {
  const now = new Date('2026-03-02T09:00:00Z');
  const inMs = (ms: number) => formatTimeUntil(new Date(now.getTime() + ms), now);
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;

  test('uses the largest whole unit', () => {
    expect(inMs(MINUTE)).toBe('in 1 minute');
    expect(inMs(59 * MINUTE)).toBe('in 59 minutes');
    expect(inMs(HOUR)).toBe('in 1 hour');
    expect(inMs(23 * HOUR + 59 * MINUTE)).toBe('in 23 hours');
    expect(inMs(24 * HOUR)).toBe('in 1 day');
    expect(inMs(400 * 24 * HOUR)).toBe('in 400 days');
  });

  // A run 30 seconds away has not happened yet, so it is not "now".
  test('does not call a run that is still ahead "now"', () => {
    expect(inMs(30_000)).toBe('in less than a minute');
  });
});

test.describe('buildCronExpression', () => {
  const values: CronBuilderValues = {
    everyMinutesInterval: '15',
    hourlyMinute: '30',
    scheduleHour: '9',
    scheduleMinute: '5',
    weeklyDay: '3',
    monthlyDay: '12',
    yearlyMonth: '7',
    yearlyDay: '4',
  };

  test('builds each schedule type', () => {
    expect(buildCronExpression('every-minutes', values)).toBe('*/15 * * * *');
    expect(buildCronExpression('hourly', values)).toBe('30 * * * *');
    expect(buildCronExpression('daily', values)).toBe('5 9 * * *');
    expect(buildCronExpression('weekdays', values)).toBe('5 9 * * 1-5');
    expect(buildCronExpression('weekly', values)).toBe('5 9 * * 3');
    expect(buildCronExpression('monthly', values)).toBe('5 9 12 * *');
    expect(buildCronExpression('yearly', values)).toBe('5 9 4 7 *');
  });

  // The inputs used to snap back to a default the moment they were emptied,
  // so retyping "14" over an emptied hour produced "014".
  test('falls back to a default for a blank input and drops leading zeros', () => {
    const blank: CronBuilderValues = {
      everyMinutesInterval: '',
      hourlyMinute: ' ',
      scheduleHour: '',
      scheduleMinute: '',
      weeklyDay: '',
      monthlyDay: '',
      yearlyMonth: '',
      yearlyDay: '',
    };
    expect(buildCronExpression('every-minutes', blank)).toBe('*/1 * * * *');
    expect(buildCronExpression('hourly', blank)).toBe('0 * * * *');
    expect(buildCronExpression('yearly', blank)).toBe('0 0 1 1 *');
    expect(buildCronExpression('daily', { ...values, scheduleHour: '014' })).toBe('5 14 * * *');
  });

  test('passes a bad number through so the parser can explain it', () => {
    const expression = buildCronExpression('daily', { ...values, scheduleHour: '25' });
    expect(expression).toBe('5 25 * * *');
    expect(errorOf(expression)).toBe('Hour must stay between 0 and 23.');
    expect(errorOf(buildCronExpression('every-minutes', { ...values, everyMinutesInterval: '-5' }))).toBe(
      'Minute step must be a positive integer.'
    );
  });
});
