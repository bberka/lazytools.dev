import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Browser flows for the calculator and number tools: Percentage Calculator,
 * Unit Converter, BMI Calculator, Currency Converter, Roman Numeral Converter
 * and Number Base Converter.
 *
 * Expected values are worked out by hand from the definitions (1 lb is
 * 0.45359237 kg, 1 mi is 1609.344 m, BMI is kg / m^2 and so on), not taken
 * from the tools' own modules. The Currency Converter never reaches the real
 * rate service: every request to it is answered by a stub.
 */

// The tool page records itself as recently used from an effect, so this entry
// appearing means React has hydrated the prerendered page. Typing before that
// would be lost.
const RECENT_TOOLS_KEY = 'dev-toolbox:recent';

async function openTool(page: Page, slug: string, name: string) {
  const response = await page.goto(`/tools/${slug}/`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await page.waitForFunction(
    ([key, id]) => (window.localStorage.getItem(key) ?? '').includes(id),
    [RECENT_TOOLS_KEY, slug] as const
  );
}

/** Picks an option of one of the app's dropdowns, found by its label. */
async function choose(page: Page, label: string, option: string) {
  const trigger = page.getByRole('combobox', { name: label, exact: true });
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(trigger).toHaveText(option);
  // The list fades out; the next dropdown must not open while it is still there.
  await expect(page.getByRole('option')).toHaveCount(0);
}

/**
 * The tool's error messages. Scoped to the page content because Next.js keeps
 * its own, empty, role="alert" route announcer at the end of the document.
 */
function alerts(page: Page) {
  return page.getByRole('main').getByRole('alert');
}

/** The element whose whole text is `text`: a result value, a detail line, a tile. */
function shown(page: Page, text: string) {
  return page.getByText(text, { exact: true });
}

async function clipboardText(page: Page) {
  return page.evaluate(() => navigator.clipboard.readText());
}

test.describe('Calculator and number tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // Anything the page throws or logs as an error fails the test that caused it.
  // Failed resource loads are left out: the currency tests fail requests on purpose.
  let pageProblems: string[] = [];

  test.beforeEach(async ({ page, context }) => {
    pageProblems = [];
    page.on('pageerror', (error) => pageProblems.push(`uncaught: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
        pageProblems.push(`console.error: ${message.text()}`);
      }
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test.afterEach(() => {
    expect(pageProblems, 'errors thrown or logged by the page').toEqual([]);
  });

  // ---------------------------------------------------------------------------
  test.describe('Percentage Calculator', () => {
    test.beforeEach(async ({ page }) => {
      await openTool(page, 'percentage-calculator', 'Percentage Calculator');
    });

    test('calculates X% of Y and copies the answer', async ({ page }) => {
      const x = page.getByRole('textbox', { name: 'X', exact: true });
      const y = page.getByRole('textbox', { name: 'Y', exact: true });

      // The example it opens with: 20% of 150.
      await expect(x).toHaveValue('20');
      await expect(y).toHaveValue('150');
      await expect(shown(page, '30.00')).toBeVisible();
      await expect(shown(page, '20.00% of 150.00 = 30.00')).toBeVisible();

      await x.fill('12.5');
      await y.fill('1250');
      await expect(shown(page, '156.25')).toBeVisible();
      await expect(shown(page, '12.50% of 1,250.00 = 156.25')).toBeVisible();

      await page.getByRole('button', { name: 'Copy result' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await clipboardText(page)).toBe('156.25');
    });

    test('calculates "what percent" and percentage change, loading an example per mode', async ({
      page,
    }) => {
      await choose(page, 'Mode', 'X is what % of Y');
      const x = page.getByRole('textbox', { name: 'X', exact: true });
      const y = page.getByRole('textbox', { name: 'Y', exact: true });
      await expect(x).toHaveValue('30');
      await expect(y).toHaveValue('60');
      await expect(shown(page, '50.00%')).toBeVisible();

      await x.fill('45');
      await y.fill('180');
      await expect(shown(page, '25.00%')).toBeVisible();
      await expect(shown(page, '45.00 is 25.00% of 180.00')).toBeVisible();

      // A small share is not rounded away to 0.00%.
      await x.fill('1');
      await y.fill('100000');
      await expect(shown(page, '0.001%')).toBeVisible();

      await choose(page, 'Mode', '% change from X to Y');
      const oldValue = page.getByRole('textbox', { name: 'Old value' });
      const newValue = page.getByRole('textbox', { name: 'New value' });
      await expect(oldValue).toHaveValue('100');
      await expect(newValue).toHaveValue('120');
      await expect(shown(page, '20.00%')).toBeVisible();

      await oldValue.fill('200');
      await newValue.fill('150');
      await expect(shown(page, '-25.00%')).toBeVisible();
      await expect(shown(page, 'Change from 200.00 to 150.00 = -25.00%')).toBeVisible();

      // From -50 up to 50 is a rise of twice the size of the start.
      await oldValue.fill('-50');
      await newValue.fill('50');
      await expect(shown(page, '200.00%')).toBeVisible();
    });

    test('reads decimal commas and thousands, and reports input it cannot use', async ({
      page,
    }) => {
      const x = page.getByRole('textbox', { name: 'X', exact: true });
      const y = page.getByRole('textbox', { name: 'Y', exact: true });
      const copy = page.getByRole('button', { name: 'Copy result' });

      await x.fill('1,5');
      await y.fill('200');
      await expect(shown(page, '3.00')).toBeVisible();

      await x.fill('10');
      await y.fill('1,250');
      await expect(shown(page, '125.00')).toBeVisible();

      // An eighth of a percent stays an eighth in the calculation written out.
      await x.fill('0.125');
      await y.fill('200');
      await expect(shown(page, '0.25')).toBeVisible();
      await expect(shown(page, '0.125% of 200.00 = 0.25')).toBeVisible();

      await y.fill('abc');
      await expect(alerts(page)).toHaveText('Enter plain numbers such as 1250 or 12.5.');
      await expect(shown(page, '-')).toBeVisible();
      await expect(shown(page, 'Adjust the input values to continue.')).toBeVisible();
      await expect(copy).toBeDisabled();

      // A hex literal is not a number someone typed into a percentage field.
      await y.fill('0x10');
      await expect(alerts(page)).toHaveText('Enter plain numbers such as 1250 or 12.5.');

      // 1e300% of 1e300 does not fit a double.
      await x.fill('1e300');
      await y.fill('1e300');
      await expect(alerts(page)).toHaveText('The result is too large to calculate.');
      await expect(shown(page, '-')).toBeVisible();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(x).toHaveValue('');
      await expect(y).toHaveValue('');
      await expect(alerts(page)).toHaveCount(0);
      await expect(shown(page, '-')).toBeVisible();
      await expect(shown(page, 'Enter numbers in both fields to calculate.')).toBeVisible();
      await expect(copy).toBeDisabled();

      await choose(page, 'Mode', 'X is what % of Y');
      await y.fill('0');
      await expect(alerts(page)).toHaveText(
        'Result is undefined because the second value cannot be zero in this mode.'
      );
      await expect(shown(page, '-')).toBeVisible();

      await choose(page, 'Mode', '% change from X to Y');
      await page.getByRole('textbox', { name: 'Old value' }).fill('0');
      await expect(alerts(page)).toHaveText(
        'Percentage change is undefined when the starting value is zero.'
      );
      await expect(shown(page, '-')).toBeVisible();
    });

    test('does not report an error while a grouped number is still being typed', async ({
      page,
    }) => {
      const y = page.getByRole('textbox', { name: 'Y', exact: true });
      await y.fill('');

      // 20% of one million, typed the way the tool itself writes it.
      for (const typedSoFar of ['1', '1,', '1,0', '1,00', '1,000', '1,000,', '1,000,0', '1,000,00']) {
        await test.step(`after typing "${typedSoFar}"`, async () => {
          await y.pressSequentially(typedSoFar.slice(-1));
          await expect(y).toHaveValue(typedSoFar);
          await expect(alerts(page)).toHaveCount(0);
          await expect(shown(page, 'Adjust the input values to continue.')).toHaveCount(0);
        });
      }

      await y.pressSequentially('0');
      await expect(shown(page, '200,000.00')).toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  test.describe('Unit Converter', () => {
    test.beforeEach(async ({ page }) => {
      await openTool(page, 'unit-converter', 'Unit Converter');
    });

    test('converts a length, swaps the units and copies the result', async ({ page }) => {
      const value = page.getByRole('textbox', { name: 'Value' });

      // The example it opens with: 1 m = 1 / 0.3048 ft.
      await expect(value).toHaveValue('1');
      await expect(shown(page, '3.2808399 ft')).toBeVisible();
      await expect(shown(page, '1 m = 3.2808399 ft')).toBeVisible();
      await expect(shown(page, 'Base unit for length: meter')).toBeVisible();

      // 5 km = 5000 / 1609.344 mi = 3.106855961...
      await value.fill('5');
      await choose(page, 'From', 'Kilometer (km)');
      await choose(page, 'To', 'Mile (mi)');
      await expect(shown(page, '3.10685596 mi')).toBeVisible();
      await expect(shown(page, '5 km = 3.10685596 mi')).toBeVisible();

      // 5 mi = 5 * 1.609344 km.
      await page.getByRole('button', { name: 'Swap units' }).click();
      await expect(page.getByRole('combobox', { name: 'From', exact: true })).toHaveText('Mile (mi)');
      await expect(page.getByRole('combobox', { name: 'To', exact: true })).toHaveText(
        'Kilometer (km)'
      );
      await expect(shown(page, '8.04672 km')).toBeVisible();

      await page.getByRole('button', { name: 'Copy result' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await clipboardText(page)).toBe('8.04672 km');
    });

    test('converts in every other category', async ({ page }) => {
      const value = page.getByRole('textbox', { name: 'Value' });

      // Changing category starts from the first two units of the new one.
      await choose(page, 'Category', 'Weight');
      await expect(page.getByRole('combobox', { name: 'From', exact: true })).toHaveText(
        'Milligram (mg)'
      );
      await expect(page.getByRole('combobox', { name: 'To', exact: true })).toHaveText('Gram (g)');
      await expect(shown(page, 'Base unit for weight: kilogram')).toBeVisible();
      await expect(shown(page, '1 mg = 0.001 g')).toBeVisible();

      const conversions: ReadonlyArray<{
        category: string;
        value: string;
        from: string;
        to: string;
        result: string;
      }> = [
        // 150 * 0.45359237
        { category: 'Weight', value: '150', from: 'Pound (lb)', to: 'Kilogram (kg)', result: '68.0388555 kg' },
        { category: 'Temperature', value: '100', from: 'Celsius (°C)', to: 'Fahrenheit (°F)', result: '212 °F' },
        { category: 'Temperature', value: '98.6', from: 'Fahrenheit (°F)', to: 'Celsius (°C)', result: '37 °C' },
        { category: 'Temperature', value: '0', from: 'Celsius (°C)', to: 'Kelvin (K)', result: '273.15 K' },
        // 10,000 / 4,046.8564224
        { category: 'Area', value: '1', from: 'Hectare (ha)', to: 'Acre (ac)', result: '2.47105381 ac' },
        // A US gallon is 3.785411784 L; eight decimals are shown.
        { category: 'Volume', value: '1', from: 'Gallon (gal)', to: 'Liter (L)', result: '3.78541178 L' },
        // 60 * 1.609344
        { category: 'Speed', value: '60', from: 'Mile / Hour (mph)', to: 'Kilometer / Hour (km/h)', result: '96.56064 km/h' },
        { category: 'Time', value: '1', from: 'Week (wk)', to: 'Hour (h)', result: '168 h' },
        // 2^30 bytes in units of 10^6
        { category: 'Data', value: '1', from: 'Gibibyte (GiB)', to: 'Megabyte (MB)', result: '1,073.741824 MB' },
        // A very small result is written out instead of rounding to 0.
        { category: 'Data', value: '1', from: 'Byte (B)', to: 'Terabyte (TB)', result: '0.000000000001 TB' },
      ];

      for (const conversion of conversions) {
        await test.step(`${conversion.value} ${conversion.from} to ${conversion.to}`, async () => {
          await choose(page, 'Category', conversion.category);
          await value.fill(conversion.value);
          await choose(page, 'From', conversion.from);
          await choose(page, 'To', conversion.to);
          await expect(shown(page, conversion.result)).toBeVisible();
        });
      }
    });

    test('reports invalid, impossible and overflowing values', async ({ page }) => {
      const value = page.getByRole('textbox', { name: 'Value' });
      const copy = page.getByRole('button', { name: 'Copy result' });

      await value.fill('abc');
      await expect(alerts(page)).toHaveText('Enter a plain number such as 1250 or 12.5.');
      await expect(shown(page, '-')).toBeVisible();
      await expect(shown(page, 'Adjust the input values to continue.')).toBeVisible();
      await expect(copy).toBeDisabled();

      // A decimal comma: one and a half meters.
      await value.fill('1,5');
      await choose(page, 'To', 'Centimeter (cm)');
      await expect(alerts(page)).toHaveCount(0);
      await expect(shown(page, '150 cm')).toBeVisible();

      await value.fill('-0');
      await expect(shown(page, '0 cm')).toBeVisible();
      await expect(shown(page, '0 m = 0 cm')).toBeVisible();

      // 1e308 km in millimeters is beyond what a double can hold.
      await value.fill('1e308');
      await choose(page, 'From', 'Kilometer (km)');
      await choose(page, 'To', 'Millimeter (mm)');
      await expect(alerts(page)).toHaveText('The result is too large to calculate.');
      await expect(shown(page, '-')).toBeVisible();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(value).toHaveValue('');
      await expect(alerts(page)).toHaveCount(0);
      await expect(shown(page, '-')).toBeVisible();
      await expect(shown(page, 'Enter a number and choose units to convert.')).toBeVisible();
      await expect(copy).toBeDisabled();

      // Nothing is colder than absolute zero, which itself converts to 0 K.
      await choose(page, 'Category', 'Temperature');
      await choose(page, 'To', 'Kelvin (K)');
      await value.fill('-300');
      await expect(alerts(page)).toHaveText(
        'That is below absolute zero (-273.15 °C, -459.67 °F, 0 K).'
      );
      await expect(shown(page, '-')).toBeVisible();

      await value.fill('-273.15');
      await expect(alerts(page)).toHaveCount(0);
      await expect(shown(page, '0 K')).toBeVisible();
    });

    test('writes the typed value out in full beside the result', async ({ page }) => {
      await page.getByRole('textbox', { name: 'Value' }).fill('1.123456789');
      await choose(page, 'To', 'Millimeter (mm)');
      await expect(shown(page, '1,123.456789 mm')).toBeVisible();
      await expect(shown(page, '1.123456789 m = 1,123.456789 mm')).toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  test.describe('BMI Calculator', () => {
    test.beforeEach(async ({ page }) => {
      await openTool(page, 'bmi-calculator', 'BMI Calculator');
    });

    test('calculates a metric BMI with its category and copies it', async ({ page }) => {
      const weight = page.getByRole('textbox', { name: 'Weight (kg)' });
      const height = page.getByRole('textbox', { name: 'Height (cm)' });

      // The example it opens with: 72 / 1.75^2 = 23.51.
      await expect(weight).toHaveValue('72');
      await expect(height).toHaveValue('175');
      await expect(shown(page, '23.5 kg/m²')).toBeVisible();
      await expect(shown(page, 'Category')).toBeVisible();
      await expect(shown(page, 'Healthy Weight')).toBeVisible();
      await expect(shown(page, 'Range: 18.5 to less than 25')).toBeVisible();
      await expect(shown(page, 'BMI = weight (kg) / height (m)^2')).toBeVisible();

      // 95 / 1.8^2 = 29.32.
      await weight.fill('95');
      await height.fill('180');
      await expect(shown(page, '29.3 kg/m²')).toBeVisible();
      await expect(shown(page, 'Overweight')).toBeVisible();
      await expect(shown(page, 'Range: 25 to less than 30')).toBeVisible();

      await page.getByRole('button', { name: 'Copy BMI' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await clipboardText(page)).toBe('29.3');
    });

    test('places each CDC category at its threshold', async ({ page }) => {
      const weight = page.getByRole('textbox', { name: 'Weight (kg)' });
      const height = page.getByRole('textbox', { name: 'Height (cm)' });

      // At 2 m the BMI is a quarter of the weight, so the thresholds are exact.
      await height.fill('200');

      const thresholds: ReadonlyArray<{ kg: string; bmi: string; category: string; range: string }> = [
        { kg: '72', bmi: '18.0', category: 'Underweight', range: 'Below 18.5' },
        { kg: '74', bmi: '18.5', category: 'Healthy Weight', range: '18.5 to less than 25' },
        { kg: '100', bmi: '25.0', category: 'Overweight', range: '25 to less than 30' },
        { kg: '120', bmi: '30.0', category: 'Class 1 Obesity', range: '30 to less than 35' },
        { kg: '140', bmi: '35.0', category: 'Class 2 Obesity', range: '35 to less than 40' },
        { kg: '160', bmi: '40.0', category: 'Class 3 Obesity', range: '40 or greater' },
      ];

      for (const threshold of thresholds) {
        await test.step(`${threshold.kg} kg at 2 m is ${threshold.category}`, async () => {
          await weight.fill(threshold.kg);
          await expect(shown(page, `${threshold.bmi} kg/m²`)).toBeVisible();
          await expect(shown(page, threshold.category)).toBeVisible();
          await expect(shown(page, `Range: ${threshold.range}`)).toBeVisible();
        });
      }

      // 76.44 / 1.75^2 = 24.96 is displayed as 25.0; the category beside it
      // has to be the one that 25.0 belongs to.
      await height.fill('175');
      await weight.fill('76.44');
      await expect(shown(page, '25.0 kg/m²')).toBeVisible();
      await expect(shown(page, 'Overweight')).toBeVisible();
    });

    test('calculates from US customary units', async ({ page }) => {
      await choose(page, 'Units', 'US Customary (lb, ft, in)');
      const weight = page.getByRole('textbox', { name: 'Weight (lb)' });
      const feet = page.getByRole('textbox', { name: 'Height (ft)' });
      const inches = page.getByRole('textbox', { name: 'Height (in)' });

      // The example it opens with: 703 * 159 / 69^2 = 23.48.
      await expect(weight).toHaveValue('159');
      await expect(feet).toHaveValue('5');
      await expect(inches).toHaveValue('9');
      await expect(shown(page, '23.5 kg/m²')).toBeVisible();
      await expect(shown(page, 'Healthy Weight')).toBeVisible();

      // 703 * 200 / 72^2 = 27.12.
      await weight.fill('200');
      await feet.fill('6');
      await inches.fill('0');
      await expect(shown(page, '27.1 kg/m²')).toBeVisible();
      await expect(shown(page, 'Overweight')).toBeVisible();

      await feet.fill('0');
      await expect(alerts(page)).toHaveText('Height must be greater than zero.');
      await expect(shown(page, '-')).toBeVisible();

      await feet.fill('');
      await expect(alerts(page)).toHaveCount(0);
      await expect(shown(page, 'Enter weight, feet, and inches to calculate BMI.')).toBeVisible();

      // The metric fields keep what they held.
      await choose(page, 'Units', 'Metric (kg, cm)');
      await expect(page.getByRole('textbox', { name: 'Weight (kg)' })).toHaveValue('72');
      await expect(shown(page, '23.5 kg/m²')).toBeVisible();
    });

    test('reports values it cannot use and clears to an empty state', async ({ page }) => {
      const weight = page.getByRole('textbox', { name: 'Weight (kg)' });
      const height = page.getByRole('textbox', { name: 'Height (cm)' });
      const copy = page.getByRole('button', { name: 'Copy BMI' });

      await weight.fill('0');
      await expect(alerts(page)).toHaveText('Weight and height must be greater than zero.');
      await expect(shown(page, '-')).toBeVisible();
      await expect(shown(page, 'Adjust the input values to continue.')).toBeVisible();
      await expect(shown(page, 'Category')).toHaveCount(0);
      await expect(copy).toBeDisabled();

      await weight.fill('abc');
      await expect(alerts(page)).toHaveText(
        'Enter weight and height as plain numbers such as 72 or 72.5.'
      );
      await expect(shown(page, '-')).toBeVisible();

      // A decimal comma: 72.5 / 1.75^2 = 23.67.
      await weight.fill('72,5');
      await expect(alerts(page)).toHaveCount(0);
      await expect(shown(page, '23.7 kg/m²')).toBeVisible();

      // A height so small that the division overflows.
      await height.fill('1e-200');
      await expect(alerts(page)).toHaveText('Those values are too extreme to calculate a BMI.');
      await expect(shown(page, '-')).toBeVisible();
      await expect(shown(page, 'Category')).toHaveCount(0);

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(weight).toHaveValue('');
      await expect(height).toHaveValue('');
      await expect(alerts(page)).toHaveCount(0);
      await expect(shown(page, '-')).toBeVisible();
      await expect(shown(page, 'Enter weight and height to calculate BMI.')).toBeVisible();
      await expect(shown(page, 'Category')).toHaveCount(0);
      await expect(copy).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  test.describe('Currency Converter', () => {
    const RATE_SERVICE = 'https://api.frankfurter.dev/**';

    interface RateCall {
      /** Path of the request, for example /v2/rate/USD/EUR. */
      path: string;
      /** The date query parameter, or null for the latest rate. */
      date: string | null;
    }

    /**
     * Answers every request to the rate service with `reply` and returns the
     * list the calls are recorded in. Nothing reaches the real service. Every
     * test installs its stub before it opens the page.
     */
    async function stubRateService(
      page: Page,
      reply: (route: Route, call: RateCall) => Promise<unknown> | unknown
    ) {
      const calls: RateCall[] = [];

      await page.unroute(RATE_SERVICE);
      await page.route(RATE_SERVICE, async (route) => {
        const url = new URL(route.request().url());
        const call = { path: url.pathname, date: url.searchParams.get('date') };
        calls.push(call);
        await reply(route, call);
      });

      return calls;
    }

    const convertButton = (page: Page) => page.getByRole('button', { name: 'Convert', exact: true });
    // The text field of the date picker is named after its group ("Reference date"),
    // but the placeholder is the shortest way to it.
    const dateField = (page: Page) => page.getByPlaceholder('YYYY-MM-DD');

    const openConverter = (page: Page) =>
      openTool(page, 'currency-converter', 'Currency Converter');

    test.describe('with today pinned to June 15, 2026', () => {
      test.beforeEach(async ({ page }) => {
        // So the calendar, the future-date rule and "today" are the same on every run.
        await page.clock.setFixedTime(new Date('2026-06-15T12:00:00'));
      });

      test('converts at the fetched rate and shows the pair, the rate and its date', async ({
        page,
      }) => {
        const calls = await stubRateService(page, (route) =>
          route.fulfill({ json: { date: '2026-06-12', base: 'USD', quote: 'EUR', rate: 0.92 } })
        );
        await openConverter(page);

        // Nothing is fetched or shown until Convert is pressed.
        await expect(shown(page, 'Run a conversion to see the latest result.')).toBeVisible();
        await expect(shown(page, '-')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Copy result' })).toBeDisabled();
        expect(calls).toEqual([]);

        await page.getByRole('textbox', { name: 'Amount' }).fill('250');
        await convertButton(page).click();

        // 250 * 0.92
        await expect(shown(page, '230.00 EUR')).toBeVisible();
        await expect(shown(page, 'Reference date: June 12, 2026')).toBeVisible();
        await expect(shown(page, '250.00 USD = 230.00 EUR')).toBeVisible();
        await expect(shown(page, '1 USD = 0.92 EUR')).toBeVisible();
        await expect(shown(page, '$ to €')).toBeVisible();
        expect(calls).toEqual([{ path: '/v2/rate/USD/EUR', date: null }]);

        await page.getByRole('button', { name: 'Copy result' }).click();
        await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
        expect(await clipboardText(page)).toBe('230.00 EUR');
      });

      test('asks for the chosen pair, and for the reversed pair after a swap', async ({ page }) => {
        const rates: Record<string, Record<string, unknown>> = {
          '/v2/rate/GBP/JPY': { date: '2026-06-12', base: 'GBP', quote: 'JPY', rate: 190.5 },
          '/v2/rate/JPY/GBP': { date: '2026-06-12', base: 'JPY', quote: 'GBP', rate: 0.00525 },
          '/v2/rate/IDR/USD': { date: '2026-06-12', base: 'IDR', quote: 'USD', rate: 0.000056 },
        };
        const calls = await stubRateService(page, (route, call) =>
          call.path in rates ? route.fulfill({ json: rates[call.path] }) : route.fulfill({ status: 404 })
        );
        await openConverter(page);
        const amount = page.getByRole('textbox', { name: 'Amount' });

        await choose(page, 'From', 'GBP · British Pound');
        await choose(page, 'To', 'JPY · Japanese Yen');
        // A decimal comma: one and a half pounds.
        await amount.fill('1,5');
        await convertButton(page).click();

        // 1.5 * 190.5
        await expect(shown(page, '285.75 JPY')).toBeVisible();
        await expect(shown(page, '1.50 GBP = 285.75 JPY')).toBeVisible();
        await expect(shown(page, '1 GBP = 190.50 JPY')).toBeVisible();
        await expect(shown(page, '£ to ¥')).toBeVisible();

        // Swapping changes the form, not the conversion already on screen.
        await page.getByRole('button', { name: 'Swap currencies' }).click();
        await expect(page.getByRole('combobox', { name: 'From', exact: true })).toHaveText(
          'JPY · Japanese Yen'
        );
        await expect(page.getByRole('combobox', { name: 'To', exact: true })).toHaveText(
          'GBP · British Pound'
        );
        await expect(shown(page, '285.75 JPY')).toBeVisible();
        await expect(shown(page, '£ to ¥')).toBeVisible();

        await amount.fill('2000');
        await convertButton(page).click();

        // 2000 * 0.00525
        await expect(shown(page, '10.50 GBP')).toBeVisible();
        await expect(shown(page, '2,000.00 JPY = 10.50 GBP')).toBeVisible();
        await expect(shown(page, '1 JPY = 0.00525 GBP')).toBeVisible();
        await expect(shown(page, '¥ to £')).toBeVisible();

        // A rate far below one cent is not rounded away.
        await choose(page, 'From', 'IDR · Indonesian Rupiah');
        await choose(page, 'To', 'USD · US Dollar');
        await amount.fill('1');
        await convertButton(page).click();
        await expect(shown(page, '0.000056 USD')).toBeVisible();
        await expect(shown(page, '1.00 IDR = 0.000056 USD')).toBeVisible();
        await expect(shown(page, '1 IDR = 0.000056 USD')).toBeVisible();
        await expect(shown(page, 'Rp to $')).toBeVisible();

        expect(calls.map((call) => call.path)).toEqual([
          '/v2/rate/GBP/JPY',
          '/v2/rate/JPY/GBP',
          '/v2/rate/IDR/USD',
        ]);
      });

      test('sends a reference date that was typed or picked from the calendar', async ({ page }) => {
        const calls = await stubRateService(page, (route, call) =>
          route.fulfill({ json: { date: call.date, base: 'USD', quote: 'EUR', rate: 0.9123 } })
        );
        await openConverter(page);

        // Typed as digits; the field adds the dashes.
        await dateField(page).click();
        await dateField(page).pressSequentially('20240115');
        await expect(dateField(page)).toHaveValue('2024-01-15');
        await convertButton(page).click();

        // 100 * 0.9123
        await expect(shown(page, '91.23 EUR')).toBeVisible();
        await expect(shown(page, 'Reference date: January 15, 2024')).toBeVisible();
        await expect(shown(page, '1 USD = 0.9123 EUR')).toBeVisible();

        await dateField(page).fill('');
        await page.getByRole('group', { name: 'Reference date' }).getByRole('button').click();
        const calendar = page.getByRole('dialog');
        await expect(calendar.getByRole('grid', { name: 'June 2026' })).toBeVisible();
        // Days after today cannot be picked.
        await expect(calendar.getByRole('button', { name: 'Tuesday, June 16th, 2026' })).toBeDisabled();
        await calendar.getByRole('button', { name: 'Wednesday, June 10th, 2026' }).click();
        await expect(calendar).toBeHidden();
        await expect(dateField(page)).toHaveValue('2026-06-10');

        await convertButton(page).click();
        await expect(shown(page, 'Reference date: June 10, 2026')).toBeVisible();
        expect(calls).toEqual([
          { path: '/v2/rate/USD/EUR', date: '2024-01-15' },
          { path: '/v2/rate/USD/EUR', date: '2026-06-10' },
        ]);
      });

      test('rejects a bad amount or date, and converts a currency to itself, without a request', async ({
        page,
      }) => {
        const calls = await stubRateService(page, (route) => route.abort());
        await openConverter(page);
        const amount = page.getByRole('textbox', { name: 'Amount' });

        const rejected: ReadonlyArray<{ amount: string; date: string; error: string }> = [
          { amount: '', date: '', error: 'Enter a valid amount to convert.' },
          { amount: 'abc', date: '', error: 'Enter a valid amount to convert.' },
          { amount: '-5', date: '', error: 'Amount cannot be negative.' },
          // The day after the pinned today.
          { amount: '100', date: '2026-06-16', error: 'Reference date cannot be in the future.' },
          { amount: '100', date: '2026-02-31', error: 'Enter a valid reference date as YYYY-MM-DD.' },
          { amount: '100', date: '2026-02', error: 'Enter a valid reference date as YYYY-MM-DD.' },
        ];

        for (const attempt of rejected) {
          await test.step(`amount "${attempt.amount}", date "${attempt.date}"`, async () => {
            await amount.fill(attempt.amount);
            await dateField(page).fill(attempt.date);
            await convertButton(page).click();
            await expect(alerts(page)).toHaveText(attempt.error);
            await expect(shown(page, '-')).toBeVisible();
            await expect(convertButton(page)).toBeEnabled();
          });
        }

        // The same currency on both sides: rate 1, dated today.
        await amount.fill('100');
        await dateField(page).fill('');
        await choose(page, 'To', 'USD · US Dollar');
        await convertButton(page).click();
        await expect(alerts(page)).toHaveCount(0);
        await expect(shown(page, '100.00 USD')).toBeVisible();
        await expect(shown(page, '100.00 USD = 100.00 USD')).toBeVisible();
        await expect(shown(page, '1 USD = 1.00 USD')).toBeVisible();
        await expect(shown(page, 'Reference date: June 15, 2026')).toBeVisible();

        expect(calls).toEqual([]);
      });

      test('explains a failed request and recovers on the next one', async ({ page }) => {
        const failures: ReadonlyArray<{
          name: string;
          date: string;
          reply: (route: Route) => Promise<unknown>;
          error: string;
        }> = [
          {
            name: 'the network fails',
            date: '',
            reply: (route) => route.abort('connectionrefused'),
            error:
              'Could not get a rate from the exchange rate service. Check your connection and try again.',
          },
          {
            name: 'the pair is unknown',
            date: '',
            reply: (route) => route.fulfill({ status: 404, json: { message: 'not found' } }),
            error: 'No exchange rate is available for this currency pair.',
          },
          {
            name: 'the date has no rate',
            date: '2024-01-15',
            reply: (route) => route.fulfill({ status: 404, json: { message: 'not found' } }),
            error: 'No exchange rate is available for January 15, 2024.',
          },
          {
            name: 'the service reports its own error',
            date: '',
            reply: (route) =>
              route.fulfill({ status: 503, json: { message: 'Service is warming up' } }),
            error: 'Service is warming up',
          },
          {
            name: 'the service fails without a message',
            date: '',
            reply: (route) =>
              route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>Oops</h1>' }),
            error: 'Failed to fetch exchange rate.',
          },
          {
            name: 'the reply has no rate',
            date: '',
            reply: (route) =>
              route.fulfill({ json: { date: '2026-06-12', base: 'USD', quote: 'EUR' } }),
            error: 'The exchange rate service sent an unexpected response.',
          },
          {
            name: 'the reply is not JSON',
            date: '',
            reply: (route) =>
              route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Hello</h1>' }),
            error:
              'Could not get a rate from the exchange rate service. Check your connection and try again.',
          },
        ];

        await stubRateService(page, failures[0].reply);
        await openConverter(page);
        const amount = page.getByRole('textbox', { name: 'Amount' });

        for (const failure of failures) {
          await test.step(failure.name, async () => {
            await stubRateService(page, failure.reply);
            await amount.fill('100');
            await dateField(page).fill(failure.date);
            await convertButton(page).click();
            await expect(alerts(page)).toHaveText(failure.error);
            await expect(shown(page, '-')).toBeVisible();
            await expect(shown(page, 'Run a conversion to see the latest result.')).toBeVisible();
            await expect(convertButton(page)).toBeEnabled();
            await expect(page.getByRole('button', { name: 'Copy result' })).toBeDisabled();
          });
        }

        await stubRateService(page, (route) =>
          route.fulfill({ json: { date: '2026-06-12', base: 'USD', quote: 'EUR', rate: 0.5 } })
        );
        await dateField(page).fill('');
        await convertButton(page).click();
        await expect(shown(page, '50.00 EUR')).toBeVisible();
        await expect(alerts(page)).toHaveCount(0);
      });

      test('Clear resets the form and abandons a conversion that is still on its way', async ({
        page,
      }) => {
        let release = () => {};
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        let answered = () => {};
        const handled = new Promise<void>((resolve) => {
          answered = resolve;
        });

        const calls = await stubRateService(page, async (route) => {
          await held;
          // The page has given up on this request by now, so answering may fail.
          await route
            .fulfill({ json: { date: '2026-06-12', base: 'GBP', quote: 'EUR', rate: 1.17 } })
            .catch(() => {});
          answered();
        });
        await openConverter(page);

        const amount = page.getByRole('textbox', { name: 'Amount' });
        await amount.fill('250');
        await choose(page, 'From', 'GBP · British Pound');
        await dateField(page).fill('2024-01-15');
        await convertButton(page).click();
        await expect(page.getByRole('button', { name: 'Converting...' })).toBeDisabled();

        await page.getByRole('button', { name: 'Clear' }).click();
        release();
        await handled;

        // Back to the idle, default form, and the late reply is not shown in it.
        await expect(convertButton(page)).toBeEnabled();
        await expect(amount).toHaveValue('');
        await expect(dateField(page)).toHaveValue('');
        await expect(page.getByRole('combobox', { name: 'From', exact: true })).toHaveText(
          'USD · US Dollar'
        );
        await expect(page.getByRole('combobox', { name: 'To', exact: true })).toHaveText(
          'EUR · Euro'
        );
        await expect(shown(page, '-')).toBeVisible();
        await expect(shown(page, 'Run a conversion to see the latest result.')).toBeVisible();
        await expect(alerts(page)).toHaveCount(0);
        expect(calls).toEqual([{ path: '/v2/rate/GBP/EUR', date: '2024-01-15' }]);
      });

      test('names the reference date field and its calendar button', async ({ page }) => {
        await stubRateService(page, (route) => route.abort());
        await openConverter(page);

        await expect(page.getByRole('textbox', { name: 'Reference date' })).toBeVisible();
        await expect(
          page.getByRole('group', { name: 'Reference date' }).getByRole('button')
        ).toHaveAccessibleName(/\S/);
      });
    });

    test('gives up on a rate request that is never answered', async ({ page }) => {
      // Timers run on a clock the test can move, so the wait takes no real time.
      await page.clock.install({ time: new Date('2026-06-15T12:00:00') });
      const calls = await stubRateService(page, () => {
        // Never answered.
      });
      await openConverter(page);

      await convertButton(page).click();
      await expect(page.getByRole('button', { name: 'Converting...' })).toBeDisabled();
      expect(calls).toHaveLength(1);

      await page.clock.fastForward(15_000);

      await expect(alerts(page)).toHaveText(
        'The exchange rate service took too long to respond. Try again.'
      );
      await expect(convertButton(page)).toBeEnabled();
      await expect(shown(page, '-')).toBeVisible();

      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });
  });

  // ---------------------------------------------------------------------------
  test.describe('Roman Numeral Converter', () => {
    const decimalField = (page: Page) =>
      page.getByRole('spinbutton', { name: 'Decimal Number (1 - 3999)' });
    const romanField = (page: Page) => page.getByRole('textbox', { name: 'Roman Numeral', exact: true });

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'roman-numeral-converter', 'Roman Numeral Converter');
    });

    test('writes a decimal number as a Roman numeral', async ({ page }) => {
      const numerals: ReadonlyArray<readonly [string, string]> = [
        ['1994', 'MCMXCIV'],
        ['2024', 'MMXXIV'],
        ['444', 'CDXLIV'],
        ['4', 'IV'],
        ['1', 'I'],
        ['3999', 'MMMCMXCIX'],
        // Leading zeros do not change the number.
        ['007', 'VII'],
      ];

      for (const [decimal, roman] of numerals) {
        await test.step(`${decimal} is ${roman}`, async () => {
          await decimalField(page).fill(decimal);
          await expect(romanField(page)).toHaveValue(roman);
          await expect(alerts(page)).toHaveCount(0);
        });
      }

      await decimalField(page).fill('1994');
      await page.getByRole('button', { name: 'Copy Roman numeral' }).click();
      await expect(page.getByRole('button', { name: 'Roman numeral copied' })).toBeVisible();
      expect(await clipboardText(page)).toBe('MCMXCIV');
    });

    test('reads a Roman numeral back into a decimal number', async ({ page }) => {
      // Lower case is accepted and shown in upper case.
      await romanField(page).fill('mcmxciv');
      await expect(romanField(page)).toHaveValue('MCMXCIV');
      await expect(decimalField(page)).toHaveValue('1994');

      await romanField(page).fill('XLII');
      await expect(decimalField(page)).toHaveValue('42');

      await romanField(page).fill('MMMCMXCIX');
      await expect(decimalField(page)).toHaveValue('3999');

      // U+216B, the single character for twelve, is spelled out.
      await romanField(page).fill('Ⅻ');
      await expect(romanField(page)).toHaveValue('XII');
      await expect(decimalField(page)).toHaveValue('12');

      // Characters that are not Roman numeral letters are dropped as typed.
      await romanField(page).fill('X 1V!');
      await expect(romanField(page)).toHaveValue('XV');
      await expect(decimalField(page)).toHaveValue('15');

      await page.getByRole('button', { name: 'Copy decimal number' }).click();
      await expect(page.getByRole('button', { name: 'Decimal number copied' })).toBeVisible();
      expect(await clipboardText(page)).toBe('15');
    });

    test('reports numbers out of range and malformed numerals', async ({ page }) => {
      await decimalField(page).fill('1994');
      await expect(romanField(page)).toHaveValue('MCMXCIV');

      for (const outOfRange of ['0', '4000', '1.5', '-5']) {
        await test.step(`decimal ${outOfRange}`, async () => {
          await decimalField(page).fill(outOfRange);
          await expect(alerts(page)).toHaveText('Enter an integer between 1 and 3999.');
          await expect(romanField(page)).toHaveValue('');
          await expect(page.getByRole('button', { name: 'Copy decimal number' })).toHaveCount(0);
        });
      }

      for (const malformed of ['IIII', 'VX', 'IC', 'MMMM']) {
        await test.step(`numeral ${malformed}`, async () => {
          await romanField(page).fill(malformed);
          await expect(alerts(page)).toHaveText('Invalid Roman numeral syntax.');
          await expect(decimalField(page)).toHaveValue('');
          await expect(page.getByRole('button', { name: 'Copy Roman numeral' })).toHaveCount(0);
        });
      }

      await page.getByRole('button', { name: 'Clear Inputs' }).click();
      await expect(alerts(page)).toHaveCount(0);
      await expect(decimalField(page)).toHaveValue('');
      await expect(romanField(page)).toHaveValue('');
    });

    test('reports text in the decimal field that is not a number', async ({ page }) => {
      await decimalField(page).fill('12');
      await expect(romanField(page)).toHaveValue('XII');

      // A slip of the finger; the field now shows "12-".
      await decimalField(page).pressSequentially('-');
      await expect(romanField(page)).toHaveValue('');
      await expect(alerts(page)).toHaveText('Enter an integer between 1 and 3999.');
    });
  });

  // ---------------------------------------------------------------------------
  test.describe('Number Base Converter', () => {
    const BASE_TITLES = {
      binary: 'Binary (Base 2)',
      octal: 'Octal (Base 8)',
      decimal: 'Decimal (Base 10)',
      hex: 'Hexadecimal (Base 16)',
    } as const;

    type BaseValues = Record<keyof typeof BASE_TITLES, string>;

    /**
     * Each result card has a copy button named after its base, so copying is
     * how a value is tied to the base it is shown under.
     */
    async function expectBases(page: Page, expected: BaseValues) {
      for (const base of Object.keys(BASE_TITLES) as Array<keyof typeof BASE_TITLES>) {
        const title = BASE_TITLES[base];
        await page.getByRole('button', { name: `Copy ${title}` }).click();
        await expect(page.getByRole('button', { name: `${title} copied` })).toBeVisible();
        expect(await clipboardText(page), title).toBe(expected[base]);
      }
    }

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'number-base-converter', 'Number Base Converter');
    });

    test('converts a decimal number to all four bases', async ({ page }) => {
      await expect(page.getByRole('combobox', { name: 'Base' })).toHaveText('Decimal (10)');
      // Empty until something is typed.
      await expect(shown(page, '-')).toHaveCount(4);

      await page.getByRole('textbox', { name: 'Value' }).fill('255');

      await expect(shown(page, '11111111')).toBeVisible();
      await expect(shown(page, '377')).toBeVisible();
      await expect(shown(page, '255')).toBeVisible();
      await expect(shown(page, 'FF')).toBeVisible();
      await expectBases(page, { binary: '11111111', octal: '377', decimal: '255', hex: 'FF' });
    });

    test('converts from binary, octal and hexadecimal, exactly and with signs', async ({ page }) => {
      const value = page.getByRole('textbox', { name: 'Value' });

      await choose(page, 'Base', 'Hexadecimal (16)');
      await value.fill('deadbeef');
      await expectBases(page, {
        binary: '11011110101011011011111011101111',
        octal: '33653337357',
        decimal: '3735928559',
        hex: 'DEADBEEF',
      });

      // 2^64 - 1 does not fit a double; every digit still has to be right.
      await value.fill('FFFFFFFFFFFFFFFF');
      await expectBases(page, {
        binary: '1'.repeat(64),
        octal: `1${'7'.repeat(21)}`,
        decimal: '18446744073709551615',
        hex: 'FFFFFFFFFFFFFFFF',
      });

      await value.fill('0x1F');
      await expectBases(page, { binary: '11111', octal: '37', decimal: '31', hex: '1F' });

      // Digits grouped with a space, and the 0b prefix.
      await choose(page, 'Base', 'Binary (2)');
      await value.fill('1111 0000');
      await expectBases(page, { binary: '11110000', octal: '360', decimal: '240', hex: 'F0' });
      await value.fill('0b1010');
      await expectBases(page, { binary: '1010', octal: '12', decimal: '10', hex: 'A' });

      await choose(page, 'Base', 'Octal (8)');
      await value.fill('755');
      await expectBases(page, { binary: '111101101', octal: '755', decimal: '493', hex: '1ED' });
      await value.fill('0o17');
      await expectBases(page, { binary: '1111', octal: '17', decimal: '15', hex: 'F' });

      await choose(page, 'Base', 'Decimal (10)');
      await value.fill('-255');
      await expectBases(page, {
        binary: '-11111111',
        octal: '-377',
        decimal: '-255',
        hex: '-FF',
      });
    });

    test('reports digits the base does not have and empties the results', async ({ page }) => {
      const value = page.getByRole('textbox', { name: 'Value' });

      await value.fill('255');
      await expect(shown(page, 'FF')).toBeVisible();

      // The value is kept when the base changes, and 2 and 5 are not binary digits.
      await choose(page, 'Base', 'Binary (2)');
      await expect(value).toHaveValue('255');
      await expect(alerts(page)).toHaveText(
        '"2" is not a valid binary digit. Binary uses only 0 and 1.'
      );
      await expect(shown(page, '-')).toHaveCount(4);
      for (const title of Object.values(BASE_TITLES)) {
        await expect(page.getByRole('button', { name: `Copy ${title}` })).toBeDisabled();
      }

      await choose(page, 'Base', 'Octal (8)');
      await value.fill('129');
      await expect(alerts(page)).toHaveText(
        '"9" is not a valid octal digit. Octal uses the digits 0 to 7.'
      );
      await expect(shown(page, '-')).toHaveCount(4);

      await choose(page, 'Base', 'Hexadecimal (16)');
      await value.fill('12G');
      await expect(alerts(page)).toHaveText(
        '"G" is not a valid hexadecimal digit. Hexadecimal uses the digits 0 to 9 and the letters A to F.'
      );

      await choose(page, 'Base', 'Decimal (10)');
      await value.fill('12abc');
      await expect(alerts(page)).toHaveText(
        '"a" is not a valid decimal digit. Decimal uses the digits 0 to 9.'
      );
      await value.fill('1.5');
      await expect(alerts(page)).toHaveText('Only whole numbers can be converted.');
      await expect(shown(page, '-')).toHaveCount(4);

      // Only spaces is the same as nothing typed.
      await value.fill('   ');
      await expect(alerts(page)).toHaveCount(0);
      await expect(shown(page, '-')).toHaveCount(4);

      await value.fill('42');
      await expect(shown(page, '101010')).toBeVisible();
      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(value).toHaveValue('');
      await expect(alerts(page)).toHaveCount(0);
      await expect(shown(page, '-')).toHaveCount(4);
    });
  });

  // ---------------------------------------------------------------------------
  test.describe('On a phone-width screen', () => {
    test.use({ viewport: { width: 360, height: 740 } });

    /** How far the page can be scrolled sideways, in pixels. */
    const sidewaysScroll = (page: Page) =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );

    test('no tool scrolls sideways when its values get long', async ({ page }) => {
      await test.step('Percentage Calculator', async () => {
        await openTool(page, 'percentage-calculator', 'Percentage Calculator');
        await page.getByRole('textbox', { name: 'X', exact: true }).fill('12345678901234');
        await page.getByRole('textbox', { name: 'Y', exact: true }).fill('100');
        // 12,345,678,901,234% of 100
        await expect(shown(page, '12,345,678,901,234.00')).toBeVisible();
        expect(await sidewaysScroll(page)).toBe(0);
      });

      await test.step('Unit Converter', async () => {
        await openTool(page, 'unit-converter', 'Unit Converter');
        await page.getByRole('textbox', { name: 'Value' }).fill('12345678901234');
        await choose(page, 'To', 'Millimeter (mm)');
        await expect(shown(page, '12,345,678,901,234,000 mm')).toBeVisible();
        expect(await sidewaysScroll(page)).toBe(0);
      });

      await test.step('BMI Calculator', async () => {
        await openTool(page, 'bmi-calculator', 'BMI Calculator');
        await choose(page, 'Units', 'US Customary (lb, ft, in)');
        // 12,345,678,901,234 kg at 1 m
        await choose(page, 'Units', 'Metric (kg, cm)');
        await page.getByRole('textbox', { name: 'Weight (kg)' }).fill('12345678901234');
        await page.getByRole('textbox', { name: 'Height (cm)' }).fill('100');
        await expect(shown(page, '12,345,678,901,234.0 kg/m²')).toBeVisible();
        expect(await sidewaysScroll(page)).toBe(0);
      });

      await test.step('Currency Converter', async () => {
        await page.route('https://api.frankfurter.dev/**', (route) =>
          route.fulfill({ json: { date: '2026-06-12', base: 'USD', quote: 'EUR', rate: 0.5 } })
        );
        await openTool(page, 'currency-converter', 'Currency Converter');
        await page.getByRole('textbox', { name: 'Amount' }).fill('24691357802468');
        await page.getByRole('button', { name: 'Convert', exact: true }).click();
        await expect(shown(page, '12,345,678,901,234.00 EUR')).toBeVisible();
        expect(await sidewaysScroll(page)).toBe(0);
      });

      await test.step('Roman Numeral Converter', async () => {
        await openTool(page, 'roman-numeral-converter', 'Roman Numeral Converter');
        // The longest numeral there is.
        await page.getByRole('spinbutton', { name: 'Decimal Number (1 - 3999)' }).fill('3888');
        await expect(page.getByRole('textbox', { name: 'Roman Numeral', exact: true })).toHaveValue(
          'MMMDCCCLXXXVIII'
        );
        expect(await sidewaysScroll(page)).toBe(0);
      });

      await test.step('Number Base Converter', async () => {
        await openTool(page, 'number-base-converter', 'Number Base Converter');
        await choose(page, 'Base', 'Hexadecimal (16)');
        await page.getByRole('textbox', { name: 'Value' }).fill('F'.repeat(64));
        // 256 binary digits in one unbroken run.
        await expect(shown(page, '1'.repeat(256))).toBeVisible();
        expect(await sidewaysScroll(page)).toBe(0);
      });
    });
  });
});
