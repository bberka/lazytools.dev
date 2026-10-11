import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Date and time tools, driven in a real browser: Unix Timestamp Converter,
 * Timezone Converter, Age Calculator and Date Difference Calculator.
 *
 * Every test pins the browser to America/New_York (a zone with daylight
 * saving) and the en-US locale, and fixes the clock, so "today", "now" and
 * every formatted string are the same on any machine and any day.
 *
 * Expected values are worked out by hand from the calendar and the zone
 * rules, not by calling the tools' own logic.
 */

// 22:45:30 on Saturday 15 March 2025 in New York (EDT, UTC-4). In UTC it is
// already Sunday the 16th, so a tool that takes "today" from UTC is caught.
const FIXED_NOW = new Date('2025-03-16T02:45:30Z');
const FIXED_NOW_SECONDS = '1742093130';

/**
 * Asserts on the text of the tool as it is laid out on screen: a label and
 * the value under it read as "label value". Letter case is ignored because
 * some labels are upper-cased by CSS.
 */
async function expectShown(page: Page, text: string) {
  await expect(page.getByRole('main')).toContainText(text, {
    useInnerText: true,
    ignoreCase: true,
  });
}

/**
 * The exported page is plain HTML until React takes it over, and a control
 * ignores input before that. Tools that change visibly once they are live are
 * waited on through that change; this is for the one that does not.
 */
async function waitUntilLive(control: Locator) {
  await expect
    .poll(() =>
      control.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith('__reactProps'))
      )
    )
    .toBe(true);
}

function dateField(page: Page, group: string): Locator {
  return page.getByRole('group', { name: group }).getByPlaceholder('YYYY-MM-DD');
}

async function setDate(page: Page, group: string, value: string) {
  const field = dateField(page, group);
  await field.fill(value);
  await expect(field).toHaveValue(value);
}

/**
 * The button that opens the calendar of a date field. It is the only button
 * in the group; it is named "Open calendar".
 */
function calendarButton(page: Page, group: string): Locator {
  return page.getByRole('group', { name: group }).getByRole('button');
}

const hourList = (page: Page) => page.getByRole('combobox', { name: 'Hour', exact: true });
const minuteList = (page: Page) => page.getByRole('combobox', { name: 'Minute', exact: true });

/** Picks a value from the hour or the minute list. */
async function pickFromList(list: Locator, value: string) {
  const page = list.page();
  await list.click();
  await page.getByRole('option', { name: value, exact: true }).click();
  // The list fades out; wait until it is gone before touching the next one.
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(list).toHaveText(value);
}

async function allowClipboard(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
}

async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

test.describe('Date and time tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');
  test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

  // No flow may throw or log an error, which is also how a hydration mismatch
  // between the exported HTML and the visitor's clock would show up.
  let problems: string[] = [];

  test.beforeEach(({ page }) => {
    problems = [];
    page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console: ${message.text()}`);
    });
  });

  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Unix Timestamp Converter
  // -------------------------------------------------------------------------
  test.describe('Unix Timestamp Converter', () => {
    const timestampField = (page: Page) => page.getByRole('textbox', { name: 'Timestamp' });
    const unitList = (page: Page) => page.getByRole('combobox', { name: 'Unit' });

    async function open(page: Page) {
      await page.goto('/tools/timestamp-converter');
      await waitUntilLive(timestampField(page));
    }

    async function chooseUnit(page: Page, unit: 'Seconds' | 'Milliseconds') {
      await unitList(page).click();
      await page.getByRole('option', { name: unit, exact: true }).click();
      await expect(unitList(page)).toHaveText(unit);
    }

    test('converts a typed timestamp to a date, a time and all four formats', async ({ page }) => {
      // Exactly one day after 1700000000.
      await page.clock.setFixedTime(new Date('2023-11-15T22:13:20Z'));
      await open(page);
      await expect(unitList(page)).toHaveText('Seconds');

      // Typed key by key: the field must not rewrite what is being typed.
      await timestampField(page).pressSequentially('1700000000');
      await expect(timestampField(page)).toHaveValue('1700000000');

      // 2023-11-14T22:13:20Z is 17:13:20 in New York (EST, UTC-5).
      await expect(dateField(page, 'Date / Time')).toHaveValue('2023-11-14');
      await expect(hourList(page)).toHaveText('17');
      await expect(minuteList(page)).toHaveText('13');

      await expectShown(page, 'ISO 8601 Copy 2023-11-14T22:13:20.000Z');
      await expectShown(page, 'Local Copy 11/14/2023, 5:13:20 PM');
      await expectShown(page, 'UTC Copy Tue, 14 Nov 2023 22:13:20 GMT');
      await expectShown(page, 'Relative Copy 1 day ago');

      // Milliseconds: the same moment, written in the other unit.
      await chooseUnit(page, 'Milliseconds');
      await expect(timestampField(page)).toHaveValue('1700000000000');
      await expectShown(page, 'ISO 8601 Copy 2023-11-14T22:13:20.000Z');

      await timestampField(page).fill('1700000000123');
      await expectShown(page, 'ISO 8601 Copy 2023-11-14T22:13:20.123Z');
      await expect(dateField(page, 'Date / Time')).toHaveValue('2023-11-14');

      await allowClipboard(page);
      const copyIso = page.getByRole('button', { name: 'Copy ISO 8601' });
      await copyIso.click();
      await expect(copyIso).toHaveText('Copied');
      expect(await readClipboard(page)).toBe('2023-11-14T22:13:20.123Z');
    });

    test('converts a date and time to a timestamp, and Now and Clear work', async ({ page }) => {
      await page.clock.setFixedTime(FIXED_NOW);
      await open(page);

      // The date is typed as digits only; the field adds the dashes. Midnight
      // on 4 July 2024 in New York (EDT, UTC-4) is 04:00 UTC.
      await dateField(page, 'Date / Time').pressSequentially('20240704');
      await expect(dateField(page, 'Date / Time')).toHaveValue('2024-07-04');
      await expect(timestampField(page)).toHaveValue('1720065600');

      // 09:30 is 13:30 UTC.
      await pickFromList(hourList(page), '09');
      await pickFromList(minuteList(page), '30');
      await expect(timestampField(page)).toHaveValue('1720099800');
      await expectShown(page, 'ISO 8601 Copy 2024-07-04T13:30:00.000Z');
      await expectShown(page, 'Local Copy 7/4/2024, 9:30:00 AM');
      await expectShown(page, 'UTC Copy Thu, 04 Jul 2024 13:30:00 GMT');

      // Now is the clock to the second, not the start of the minute, and the
      // date is the local one.
      await page.getByRole('button', { name: 'Now' }).click();
      await expect(timestampField(page)).toHaveValue(FIXED_NOW_SECONDS);
      await expect(dateField(page, 'Date / Time')).toHaveValue('2025-03-15');
      await expect(hourList(page)).toHaveText('22');
      await expect(minuteList(page)).toHaveText('45');
      await expectShown(page, 'ISO 8601 Copy 2025-03-16T02:45:30.000Z');
      await expectShown(page, 'Local Copy 3/15/2025, 10:45:30 PM');
      await expectShown(page, 'Relative Copy now');

      await chooseUnit(page, 'Milliseconds');
      await expect(timestampField(page)).toHaveValue(`${FIXED_NOW_SECONDS}000`);

      // A day picked from the calendar keeps the time: 22:45 on 20 March in
      // New York is 02:45 UTC on the 21st.
      await calendarButton(page, 'Date / Time').click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Thursday, March 20th, 2025' })
        .click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(dateField(page, 'Date / Time')).toHaveValue('2025-03-20');
      await expect(hourList(page)).toHaveText('22');
      await expect(timestampField(page)).toHaveValue('1742525100000');
      await expectShown(page, 'ISO 8601 Copy 2025-03-21T02:45:00.000Z');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(timestampField(page)).toHaveValue('');
      await expect(dateField(page, 'Date / Time')).toHaveValue('');
      await expect(hourList(page)).toHaveText('00');
      await expect(minuteList(page)).toHaveText('00');
      await expect(unitList(page)).toHaveText('Milliseconds');
      await expect(page.getByText('ISO 8601')).toHaveCount(0);
      await expect(page.getByText('Relative')).toHaveCount(0);
    });

    test('rejects text that is not one number and shows no result for it', async ({ page }) => {
      await page.clock.setFixedTime(FIXED_NOW);
      await open(page);

      await timestampField(page).fill('12-34');
      await expect(page.getByText('Enter the timestamp as a single number.')).toBeVisible();
      await expect(timestampField(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByText('ISO 8601')).toHaveCount(0);
      await expect(dateField(page, 'Date / Time')).toHaveValue('');

      // Far beyond what a date can hold (the limit is 8.64e12 seconds).
      await timestampField(page).fill('99999999999999');
      await expect(
        page.getByText('This timestamp is outside the range of dates that can be shown.')
      ).toBeVisible();
      await expect(page.getByText('ISO 8601')).toHaveCount(0);

      // Letters cannot be entered at all.
      await timestampField(page).fill('abc12x');
      await expect(timestampField(page)).toHaveValue('12');

      // A valid number clears the error again. Zero is the epoch, which is
      // 19:00 the evening before in New York.
      await timestampField(page).fill('0');
      await expect(page.getByText(/outside the range|single number/)).toHaveCount(0);
      await expect(timestampField(page)).not.toHaveAttribute('aria-invalid', 'true');
      await expectShown(page, 'ISO 8601 Copy 1970-01-01T00:00:00.000Z');
      await expect(dateField(page, 'Date / Time')).toHaveValue('1969-12-31');
      await expect(hourList(page)).toHaveText('19');

      // One second before the epoch.
      await timestampField(page).fill('-1');
      await expectShown(page, 'ISO 8601 Copy 1969-12-31T23:59:59.000Z');
      await expectShown(page, 'Local Copy 12/31/1969, 6:59:59 PM');

      // Emptying the field by hand empties the other side and the results.
      await timestampField(page).fill('');
      await expect(dateField(page, 'Date / Time')).toHaveValue('');
      await expect(hourList(page)).toHaveText('00');
      await expect(page.getByText('ISO 8601')).toHaveCount(0);
    });

    test('keeps the seconds of a timestamp and survives a unit mix-up', async ({ page }) => {
      await page.clock.setFixedTime(FIXED_NOW);
      await open(page);

      // 1640995215 is 15 seconds past midnight UTC on 1 January 2022: the
      // date side only shows 19:00 but the timestamp and results keep the :15.
      await timestampField(page).fill('1640995215');
      await expect(dateField(page, 'Date / Time')).toHaveValue('2021-12-31');
      await expect(hourList(page)).toHaveText('19');
      await expect(minuteList(page)).toHaveText('00');
      await expect(timestampField(page)).toHaveValue('1640995215');
      await expectShown(page, 'ISO 8601 Copy 2022-01-01T00:00:15.000Z');

      // Half a second more survives a change of unit; whole seconds drop it.
      await timestampField(page).fill('1640995215.5');
      await expectShown(page, 'ISO 8601 Copy 2022-01-01T00:00:15.500Z');
      await chooseUnit(page, 'Milliseconds');
      await expect(timestampField(page)).toHaveValue('1640995215500');
      await chooseUnit(page, 'Seconds');
      await expect(timestampField(page)).toHaveValue('1640995215');

      // A millisecond timestamp pasted while the unit is still Seconds...
      await timestampField(page).fill('1640995215000');
      await expect(timestampField(page)).toHaveValue('1640995215000');
      // ...is read correctly once the unit is switched.
      await chooseUnit(page, 'Milliseconds');
      await expect(timestampField(page)).toHaveValue('1640995215000');
      await expectShown(page, 'ISO 8601 Copy 2022-01-01T00:00:15.000Z');
      await expect(dateField(page, 'Date / Time')).toHaveValue('2021-12-31');

      // Changing the day by keyboard keeps the hour and the minute: 19:00 on
      // 30 December 2021 in New York is midnight UTC on the 31st. While the
      // date is incomplete there is nothing to show.
      await dateField(page, 'Date / Time').press('End');
      await dateField(page, 'Date / Time').press('Backspace');
      await expect(dateField(page, 'Date / Time')).toHaveValue('2021-12-3');
      await expect(timestampField(page)).toHaveValue('');
      await expect(page.getByText('ISO 8601')).toHaveCount(0);
      await dateField(page, 'Date / Time').pressSequentially('0');
      await expect(dateField(page, 'Date / Time')).toHaveValue('2021-12-30');
      await expect(hourList(page)).toHaveText('19');
      await expect(timestampField(page)).toHaveValue('1640908800000');
      await expectShown(page, 'ISO 8601 Copy 2021-12-31T00:00:00.000Z');
    });

    test('handles both daylight saving changes of the local zone', async ({ page }) => {
      await page.clock.setFixedTime(FIXED_NOW);
      await open(page);

      // 5 November 2023, 01:30 happens twice in New York. 1699165800 is the
      // second one (EST, 06:30 UTC) and must not be moved to the first.
      await timestampField(page).fill('1699165800');
      await expect(dateField(page, 'Date / Time')).toHaveValue('2023-11-05');
      await expect(hourList(page)).toHaveText('01');
      await expect(minuteList(page)).toHaveText('30');
      await expect(timestampField(page)).toHaveValue('1699165800');
      await expectShown(page, 'ISO 8601 Copy 2023-11-05T06:30:00.000Z');

      // 10 March 2024, 02:30 does not exist in New York: clocks jump from
      // 02:00 to 03:00. The fields must show where the time landed.
      await page.getByRole('button', { name: 'Clear' }).click();
      await setDate(page, 'Date / Time', '2024-03-10');
      await pickFromList(minuteList(page), '30');
      await hourList(page).click();
      await page.getByRole('option', { name: '02', exact: true }).click();
      await expect(hourList(page)).toHaveText('03');
      await expect(timestampField(page)).toHaveValue('1710055800');
      await expectShown(page, 'ISO 8601 Copy 2024-03-10T07:30:00.000Z');
      await expectShown(page, 'Local Copy 3/10/2024, 3:30:00 AM');
    });

    test('keeps the relative time moving without disturbing an open list', async ({ page }) => {
      await page.clock.install({ time: new Date('2025-03-16T01:00:00Z') });
      await open(page);
      await page.clock.pauseAt(FIXED_NOW);

      await page.getByRole('button', { name: 'Now' }).click();
      await expect(timestampField(page)).toHaveValue(FIXED_NOW_SECONDS);
      await expectShown(page, 'Relative Copy now');

      await page.clock.runFor(5_000);
      await expectShown(page, 'Relative Copy 5 seconds ago');

      // The hour list is driven by keyboard while the card keeps ticking: it
      // opens on 22 and three presses of ArrowUp reach 19.
      await hourList(page).focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option')).toHaveCount(24);
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      await page.clock.runFor(3_000);
      await expectShown(page, 'Relative Copy 8 seconds ago');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      await expect(hourList(page)).toHaveText('19');

      // 19:45:00 in New York is 23:45:00 UTC, 3 hours and 38 seconds back.
      await expect(timestampField(page)).toHaveValue('1742082300');
      await expectShown(page, 'ISO 8601 Copy 2025-03-15T23:45:00.000Z');
      await expectShown(page, 'Relative Copy 3 hours ago');
    });
  });

  // -------------------------------------------------------------------------
  // Timezone Converter
  // -------------------------------------------------------------------------
  test.describe('Timezone Converter', () => {
    const from = (page: Page) => page.getByRole('button', { name: /^From / });
    const to = (page: Page) => page.getByRole('button', { name: /^To / });

    async function chooseZone(page: Page, side: 'From' | 'To', query: string, label: string) {
      await page.getByRole('button', { name: new RegExp(`^${side} `) }).click();
      await page.getByRole('combobox', { name: `Search ${side} time zones` }).fill(query);
      await page.getByRole('option', { name: label, exact: true }).click();
      await expect(page.getByRole('button', { name: `${side} ${label}`, exact: true })).toBeVisible();
      await expect(page.getByRole('listbox')).toHaveCount(0);
    }

    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(FIXED_NOW);
      await page.goto('/tools/timezone-converter');
      // The form mounts again with the visitor's zone and clock once hydrated.
      await expect(from(page)).toHaveText('America/New York');
    });

    test('starts on the local zone and clock and converts them to UTC', async ({ page }) => {
      await expect(to(page)).toHaveText('UTC');
      await expect(dateField(page, 'Date and time')).toHaveValue('2025-03-15');
      await expect(hourList(page)).toHaveText('22');
      await expect(minuteList(page)).toHaveText('45');

      // 22:45 EDT (UTC-4) on Saturday is 02:45 UTC on Sunday.
      await expectShown(
        page,
        'Converted Time America/New_York → UTC Sunday, March 16, 2025 at 2:45:00 AM UTC'
      );
      await expectShown(page, 'Source time Saturday, March 15, 2025 at 10:45:00 PM EDT GMT-4');
      await expectShown(page, 'Target input format 2025-03-16T02:45');
      await expectShown(
        page,
        'UTC reference Sunday, March 16, 2025 at 2:45:00 AM UTC 2025-03-16T02:45:00.000Z'
      );
    });

    test('converts between two searched zones across midnight, copies and swaps', async ({
      page,
    }) => {
      // The date is typed over the old one as digits; the time must stay.
      await dateField(page, 'Date and time').press('Control+A');
      await dateField(page, 'Date and time').pressSequentially('20240115');
      await expect(dateField(page, 'Date and time')).toHaveValue('2024-01-15');
      await expect(hourList(page)).toHaveText('22');
      await expect(minuteList(page)).toHaveText('45');
      await pickFromList(hourList(page), '09');
      await pickFromList(minuteList(page), '00');

      await chooseZone(page, 'From', 'tokyo', 'Asia/Tokyo');
      await chooseZone(page, 'To', 'los angeles', 'America/Los Angeles');

      // 09:00 in Tokyo (UTC+9) is 00:00 UTC, which is 16:00 the day before in
      // Los Angeles (PST, UTC-8).
      await expectShown(
        page,
        'Converted Time Asia/Tokyo → America/Los_Angeles Sunday, January 14, 2024 at 4:00:00 PM PST'
      );
      await expectShown(page, 'Source time Monday, January 15, 2024 at 9:00:00 AM GMT+9 GMT+9');
      await expectShown(page, 'Target input format 2024-01-14T16:00 GMT-8');
      await expectShown(
        page,
        'UTC reference Monday, January 15, 2024 at 12:00:00 AM UTC 2024-01-15T00:00:00.000Z'
      );

      await allowClipboard(page);
      await page.getByRole('button', { name: 'Copy result' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await readClipboard(page)).toBe('2024-01-14T16:00');

      // Swapping keeps the moment: the form now holds the Los Angeles time.
      await page.getByRole('button', { name: 'Swap time zones' }).click();
      await expect(from(page)).toHaveText('America/Los Angeles');
      await expect(to(page)).toHaveText('Asia/Tokyo');
      await expect(dateField(page, 'Date and time')).toHaveValue('2024-01-14');
      await expect(hourList(page)).toHaveText('16');
      await expect(minuteList(page)).toHaveText('00');
      await expectShown(
        page,
        'Converted Time America/Los_Angeles → Asia/Tokyo Monday, January 15, 2024 at 9:00:00 AM GMT+9'
      );
      await expectShown(page, 'Target input format 2024-01-15T09:00 GMT+9');
    });

    test('searches the zone list and picks zones with the keyboard', async ({ page }) => {
      const search = page.getByRole('combobox', { name: 'Search To time zones' });
      const options = page.getByRole('listbox').getByRole('option');
      const idOf = async (zone: string) =>
        (await page.getByRole('option', { name: zone, exact: true }).getAttribute('id')) ?? 'none';

      // ArrowDown on the button opens the list of common zones, highlighted
      // on the current one.
      await to(page).focus();
      await page.keyboard.press('ArrowDown');
      await expect(search).toBeFocused();
      await expect(options).toHaveCount(37);
      await expect(page.getByRole('option', { name: 'UTC', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(search).toHaveAttribute('aria-activedescendant', await idOf('UTC'));

      // UTC is first: ArrowUp wraps to the last zone, two ArrowDowns then
      // land on the second one, and Enter selects it.
      await page.keyboard.press('ArrowUp');
      await expect(search).toHaveAttribute('aria-activedescendant', await idOf('Pacific/Honolulu'));
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await expect(search).toHaveAttribute('aria-activedescendant', await idOf('America/New York'));
      await page.keyboard.press('Enter');
      await expect(to(page)).toHaveText('America/New York');
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(to(page)).toBeFocused();

      await to(page).click();
      // Spaces match underscores.
      await search.fill('new york');
      await expect(options).toHaveText(['America/New York']);

      // Zones the browser lists under an older name, or not at all.
      await search.fill('kolkata');
      await expect(options).toHaveText(['Asia/Kolkata']);
      await search.fill('utc');
      await expect(page.getByRole('option', { name: 'UTC', exact: true })).toBeVisible();

      // A zone where the query starts a word comes before one that only
      // contains it (Antarctica/Vostok).
      await search.fill('tok');
      await expect(options.first()).toHaveText('Asia/Tokyo');
      await expect(page.getByRole('option', { name: 'Antarctica/Vostok' })).toBeVisible();

      await search.fill('zzzz');
      await expect(page.getByText('No matching time zones')).toBeVisible();
      await expect(options).toHaveCount(0);

      // Escape closes the list and keeps the zone; the search starts over.
      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(to(page)).toHaveText('America/New York');
      await to(page).click();
      await expect(search).toHaveValue('');
      await expect(options).toHaveCount(37);

      // Enter picks the first match of a search.
      await search.fill('brisbane');
      await expect(options).toHaveText(['Australia/Brisbane']);
      await page.keyboard.press('Enter');
      await expect(to(page)).toHaveText('Australia/Brisbane');

      // 22:45 EDT is 02:45 UTC, which is 12:45 the next day in Brisbane (UTC+10).
      await expectShown(page, 'Target input format 2025-03-16T12:45 GMT+10');
    });

    test('reports a local time that daylight saving skips, and a date that does not exist', async ({
      page,
    }) => {
      // 02:30 on 10 March 2024 does not exist in New York.
      await setDate(page, 'Date and time', '2024-03-10');
      await pickFromList(hourList(page), '02');
      await pickFromList(minuteList(page), '30');

      await expect(
        page.getByText(
          'This local time is invalid or ambiguous in the selected source time zone. Try a different minute.'
        )
      ).toBeVisible();
      await expectShown(page, 'Converted Time Adjust the date, time, or zone selection. -');
      await expect(page.getByRole('button', { name: 'Copy result' })).toBeDisabled();
      await expect(page.getByText('Source time', { exact: true })).toHaveCount(0);

      // One hour later it exists again: 03:30 EDT is 07:30 UTC.
      await pickFromList(hourList(page), '03');
      await expect(page.getByText(/invalid or ambiguous/)).toHaveCount(0);
      await expectShown(page, 'Target input format 2024-03-10T07:30');

      // 30 February is not a date.
      await setDate(page, 'Date and time', '2024-02-30');
      await expect(page.getByText('Enter a valid date and time.')).toBeVisible();
      await expectShown(page, 'Converted Time Adjust the date, time, or zone selection. -');
      await expect(page.getByRole('button', { name: 'Copy result' })).toBeDisabled();
    });

    test('Clear returns to the empty state and picking a time starts from today', async ({
      page,
    }) => {
      await chooseZone(page, 'From', 'tokyo', 'Asia/Tokyo');
      await page.getByRole('button', { name: 'Clear' }).click();

      await expect(dateField(page, 'Date and time')).toHaveValue('');
      await expect(from(page)).toHaveText('America/New York');
      await expect(to(page)).toHaveText('UTC');
      await expect(hourList(page)).toHaveText('00');
      await expect(minuteList(page)).toHaveText('00');
      await expectShown(page, 'Converted Time Choose a date and time to convert. -');
      await expect(page.getByText('Enter a valid date and time.')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Copy result' })).toBeDisabled();

      // Today is the local 15th, not the 16th that UTC has reached.
      await pickFromList(hourList(page), '08');
      await expect(dateField(page, 'Date and time')).toHaveValue('2025-03-15');
      // 08:00 EDT is 12:00 UTC.
      await expectShown(page, 'Target input format 2025-03-15T12:00');
    });

    test('Now gives the current moment whatever the source zone is', async ({ page }) => {
      await chooseZone(page, 'From', 'tokyo', 'Asia/Tokyo');
      await page.getByRole('button', { name: 'Now' }).click();

      // The clock reads 02:45:30 UTC on 16 March, which is 11:45 in Tokyo.
      await expect(dateField(page, 'Date and time')).toHaveValue('2025-03-16');
      await expect(hourList(page)).toHaveText('11');
      await expect(minuteList(page)).toHaveText('45');
      await expectShown(
        page,
        'UTC reference Sunday, March 16, 2025 at 2:45:00 AM UTC 2025-03-16T02:45:00.000Z'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Age Calculator
  // -------------------------------------------------------------------------
  test.describe('Age Calculator', () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(FIXED_NOW);
      await page.goto('/tools/age-calculator');
      // "Age at" is filled with the visitor's local date once hydrated.
      await expect(dateField(page, 'Age at')).toHaveValue('2025-03-15');
    });

    test('calculates the age today for the default birth date and copies it', async ({ page }) => {
      await expect(dateField(page, 'Birth date')).toHaveValue('1990-06-15');

      // 15 June 1990 to 15 March 2025: 34 years and 9 months to the day,
      // 12,692 days (1,813 whole weeks), 417 months. 92 days to 15 June.
      await expectShown(
        page,
        'Result From June 15, 1990 to March 15, 2025 34 years, 9 months, 0 days ' +
          'Total months 417 Total weeks 1,813 Total days 12,692 ' +
          'Next birthday June 15, 2025 Turns 35 in 92 days'
      );

      await allowClipboard(page);
      await page.getByRole('button', { name: 'Copy result' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await readClipboard(page)).toBe('34 years, 9 months, 0 days');
    });

    test('handles short months, singular units and a 29 February birthday', async ({ page }) => {
      // 31 January to 1 March 2023: one month takes it to 28 February, then
      // one day. 29 days in all.
      await setDate(page, 'Age at', '2023-03-01');
      await setDate(page, 'Birth date', '2023-01-31');
      await expectShown(
        page,
        'Result From January 31, 2023 to March 1, 2023 0 years, 1 month, 1 day ' +
          'Total months 1 Total weeks 4 Total days 29 ' +
          'Next birthday January 31, 2024 Turns 1 in 336 days'
      );

      // Born 29 February 2000, seen on 28 February 2023: 8,400 days old, and
      // the age goes up the next day, 1 March, as 2023 has no 29 February.
      await setDate(page, 'Birth date', '2000-02-29');
      await setDate(page, 'Age at', '2023-02-28');
      await expectShown(
        page,
        '22 years, 11 months, 30 days Total months 275 Total weeks 1,200 Total days 8,400 ' +
          'Next birthday March 1, 2023 Turns 23 in 1 day'
      );
      await expect(page.getByText('Turns 23 in 1 days')).toHaveCount(0);

      // In a leap year the birthday is the 29th itself.
      await setDate(page, 'Age at', '2024-02-01');
      await expectShown(page, '23 years, 11 months, 3 days Total months 287');
      await expectShown(page, 'Next birthday February 29, 2024 Turns 24 in 28 days');
    });

    test('picks dates from the calendar, which blocks days after the comparison date', async ({
      page,
    }) => {
      const calendar = page.getByRole('dialog');

      await calendarButton(page, 'Age at').click();
      await expect(calendar.getByRole('grid', { name: 'March 2025' })).toBeVisible();
      await expect(
        calendar.getByRole('button', { name: 'Today, Saturday, March 15th, 2025, selected' })
      ).toBeVisible();
      await calendar.getByRole('button', { name: 'Monday, March 10th, 2025' }).click();
      await expect(calendar).toHaveCount(0);
      await expect(dateField(page, 'Age at')).toHaveValue('2025-03-10');

      // Five days earlier than today: 34 years, 8 months (to 15 February) and
      // 13 + 10 days; 12,687 days in all and 97 to the birthday.
      await expectShown(
        page,
        'Result From June 15, 1990 to March 10, 2025 34 years, 8 months, 23 days ' +
          'Total months 416 Total weeks 1,812 Total days 12,687 ' +
          'Next birthday June 15, 2025 Turns 35 in 97 days'
      );

      // Nobody is born after the day the age is asked for. The calendar opens on the
      // month of the date in the field, so the field is first moved into March 2025.
      await setDate(page, 'Birth date', '2025-03-01');
      await calendarButton(page, 'Birth date').click();
      await expect(calendar.getByRole('grid', { name: 'March 2025' })).toBeVisible();
      await expect(
        calendar.getByRole('button', { name: 'Tuesday, March 11th, 2025' })
      ).toBeDisabled();
      await calendar.getByRole('button', { name: 'Go to the Previous Month' }).click();
      await calendar.getByRole('button', { name: 'Monday, February 10th, 2025' }).click();
      await expect(calendar).toHaveCount(0);
      await expect(dateField(page, 'Birth date')).toHaveValue('2025-02-10');
      await expectShown(
        page,
        'Result From February 10, 2025 to March 10, 2025 0 years, 1 month, 0 days ' +
          'Total months 1 Total weeks 4 Total days 28'
      );
    });

    test('shows errors for impossible input and an empty state after Clear', async ({ page }) => {
      await setDate(page, 'Birth date', '2030-01-01');
      await expect(
        page.getByText('The comparison date cannot be earlier than the birth date.')
      ).toBeVisible();
      await expectShown(page, 'Result Fix the selected dates to continue. -');
      await expect(page.getByRole('button', { name: 'Copy result' })).toBeDisabled();
      await expect(page.getByText('Total days', { exact: true })).toHaveCount(0);

      // 30 February is not a date.
      await setDate(page, 'Birth date', '2023-02-30');
      await expect(page.getByText('Enter valid calendar dates.')).toBeVisible();
      await expectShown(page, 'Result Fix the selected dates to continue. -');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(dateField(page, 'Birth date')).toHaveValue('');
      await expect(dateField(page, 'Age at')).toHaveValue('2025-03-15');
      await expectShown(
        page,
        'Result Choose a birth date and comparison date to calculate an age. -'
      );
      await expect(page.getByText('Enter valid calendar dates.')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Copy result' })).toBeDisabled();

      // A first-century birth year is a real year, not 19xx. Year 50 to 2025
      // is 1,975 years with 479 leap days: 1975 x 365 + 479 = 721,354 days.
      await setDate(page, 'Birth date', '0050-03-15');
      await expectShown(
        page,
        'Result From March 15, 50 to March 15, 2025 1975 years, 0 months, 0 days ' +
          'Total months 23,700 Total weeks 103,050 Total days 721,354'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Date Difference Calculator
  // -------------------------------------------------------------------------
  test.describe('Date Difference Calculator', () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(FIXED_NOW);
      await page.goto('/tools/date-difference-calculator');
      // The end date is filled with the visitor's local date once hydrated.
      await expect(dateField(page, 'End date')).toHaveValue('2025-03-15');
    });

    test('calculates the difference from the default start date to today and copies it', async ({
      page,
    }) => {
      await expect(dateField(page, 'Start date')).toHaveValue('2024-01-01');

      // 1 January 2024 to 15 March 2025: 366 + 31 + 28 + 14 = 439 days.
      await expectShown(
        page,
        'Result January 1, 2024 to March 15, 2025 1 year, 2 months, 14 days ' +
          'Total months 14 Total weeks 62 Total days 439'
      );

      await allowClipboard(page);
      await page.getByRole('button', { name: 'Copy result' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await readClipboard(page)).toBe('1 year, 2 months, 14 days');
    });

    test('handles short months, equal dates, a century and first-century years', async ({
      page,
    }) => {
      // 31 January to 1 March in a leap year: one month reaches 29 February.
      await setDate(page, 'Start date', '2024-01-31');
      await setDate(page, 'End date', '2024-03-01');
      await expectShown(
        page,
        'Result January 31, 2024 to March 1, 2024 0 years, 1 month, 1 day ' +
          'Total months 1 Total weeks 4 Total days 30'
      );

      // The same day.
      await setDate(page, 'Start date', '2024-03-01');
      await expectShown(
        page,
        'Result March 1, 2024 to March 1, 2024 0 years, 0 months, 0 days ' +
          'Total months 0 Total weeks 0 Total days 0'
      );

      // A whole century without a leap day in 1900: 36,524 days.
      await setDate(page, 'Start date', '1900-01-01');
      await setDate(page, 'End date', '2000-01-01');
      await expectShown(
        page,
        '100 years, 0 months, 0 days Total months 1,200 Total weeks 5,217 Total days 36,524'
      );

      // Years below 100 are real years, not 19xx. Year 50 is not a leap year.
      await setDate(page, 'Start date', '0050-01-01');
      await setDate(page, 'End date', '0051-01-01');
      await expectShown(
        page,
        'Result January 1, 50 to January 1, 51 1 year, 0 months, 0 days ' +
          'Total months 12 Total weeks 52 Total days 365'
      );
    });

    test('picks an end date from the calendar, which blocks days before the start', async ({
      page,
    }) => {
      const calendar = page.getByRole('dialog');
      await setDate(page, 'Start date', '2025-03-05');

      await calendarButton(page, 'End date').click();
      await expect(calendar.getByRole('grid', { name: 'March 2025' })).toBeVisible();
      await expect(
        calendar.getByRole('button', { name: 'Tuesday, March 4th, 2025' })
      ).toBeDisabled();
      await calendar.getByRole('button', { name: 'Go to the Next Month' }).click();
      await calendar.getByRole('button', { name: 'Saturday, April 5th, 2025' }).click();
      await expect(calendar).toHaveCount(0);

      await expect(dateField(page, 'End date')).toHaveValue('2025-04-05');
      await expectShown(
        page,
        'Result March 5, 2025 to April 5, 2025 0 years, 1 month, 0 days ' +
          'Total months 1 Total weeks 4 Total days 31'
      );

      // The start cannot be moved past the end either.
      await calendarButton(page, 'Start date').click();
      await calendar.getByRole('button', { name: 'Go to the Next Month' }).click();
      await expect(
        calendar.getByRole('button', { name: 'Sunday, April 6th, 2025' })
      ).toBeDisabled();
      await expect(
        calendar.getByRole('button', { name: 'Saturday, April 5th, 2025' })
      ).toBeEnabled();
    });

    test('shows errors for impossible input and an empty state after Clear', async ({ page }) => {
      await setDate(page, 'Start date', '2026-01-01');
      await expect(
        page.getByText('The end date cannot be earlier than the start date.')
      ).toBeVisible();
      await expectShown(page, 'Result Adjust the selected dates to continue. -');
      await expect(page.getByRole('button', { name: 'Copy result' })).toBeDisabled();
      await expect(page.getByText('Total days', { exact: true })).toHaveCount(0);

      // There is no month 13.
      await setDate(page, 'Start date', '2023-13-01');
      await expect(page.getByText('Enter valid calendar dates.')).toBeVisible();
      await expectShown(page, 'Result Adjust the selected dates to continue. -');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(dateField(page, 'Start date')).toHaveValue('');
      await expect(dateField(page, 'End date')).toHaveValue('2025-03-15');
      await expectShown(page, 'Result Choose both dates to calculate the difference. -');
      await expect(page.getByText('Enter valid calendar dates.')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Copy result' })).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Controls the tools share
  // -------------------------------------------------------------------------
  test.describe('Date field and time lists shared by the tools', () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(FIXED_NOW);
    });

    test('the calendar opens on the month of the date in the field', async ({ page }) => {
      await page.goto('/tools/age-calculator');
      await expect(dateField(page, 'Age at')).toHaveValue('2025-03-15');
      await expect(dateField(page, 'Birth date')).toHaveValue('1990-06-15');

      await calendarButton(page, 'Birth date').click();
      const calendar = page.getByRole('dialog');
      await expect(calendar.getByRole('grid', { name: 'June 1990' })).toBeVisible();
      await expect(
        calendar.getByRole('button', { name: 'Friday, June 15th, 1990, selected' })
      ).toBeVisible();
    });

    test('the button that opens the calendar has an accessible name', async ({ page }) => {
      await page.goto('/tools/date-difference-calculator');
      await expect(dateField(page, 'End date')).toHaveValue('2025-03-15');

      for (const group of ['Start date', 'End date']) {
        await expect(
          page.getByRole('group', { name: group }).getByRole('button', { name: /calendar|date/i })
        ).toBeVisible();
      }
    });

    test('the hour and the minute are shown in full', async ({ page }) => {
      /** True when some text inside the control is wider than the box it is clipped to. */
      const isCutOff = (list: Locator) =>
        list.evaluate((control) =>
          [control, ...control.querySelectorAll<HTMLElement>('*')].some(
            (element) => element instanceof HTMLElement && element.scrollWidth > element.clientWidth
          )
        );

      await page.goto('/tools/timezone-converter');
      await expect(page.getByRole('button', { name: /^From / })).toHaveText('America/New York');
      await expect(minuteList(page)).toHaveText('45');
      expect(await isCutOff(minuteList(page))).toBe(false);

      await page.goto('/tools/timestamp-converter');
      await expect(hourList(page)).toHaveText('00');
      expect(await isCutOff(hourList(page))).toBe(false);
      expect(await isCutOff(minuteList(page))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // The exported HTML, before any script runs
  // -------------------------------------------------------------------------
  test.describe('Exported HTML', () => {
    test.use({ javaScriptEnabled: false });

    test('carries no build-time date, clock or zone', async ({ page }) => {
      await page.goto('/tools/age-calculator');
      await expect(dateField(page, 'Age at')).toHaveValue('');
      await expectShown(
        page,
        'Result Choose a birth date and comparison date to calculate an age. -'
      );

      await page.goto('/tools/date-difference-calculator');
      await expect(dateField(page, 'End date')).toHaveValue('');
      await expectShown(page, 'Result Choose both dates to calculate the difference. -');

      await page.goto('/tools/timezone-converter');
      await expect(dateField(page, 'Date and time')).toHaveValue('');
      await expect(page.getByRole('button', { name: /^From / })).toHaveText('UTC');
      await expect(page.getByRole('button', { name: /^To / })).toHaveText('UTC');
      await expect(hourList(page)).toHaveText('00');
      await expectShown(page, 'Converted Time Choose a date and time to convert. -');

      await page.goto('/tools/timestamp-converter');
      await expect(page.getByRole('textbox', { name: 'Timestamp' })).toHaveValue('');
      await expect(dateField(page, 'Date / Time')).toHaveValue('');
      await expect(page.getByText('ISO 8601')).toHaveCount(0);
    });
  });
});
