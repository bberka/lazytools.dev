import { test, expect } from '@playwright/test';
import {
  CURRENCIES,
  convertCurrency,
  formatAmount,
  formatRate,
  formatRateDate,
  getCurrencySymbol,
  isIsoDate,
  localIsoDate,
  type ConversionRequest,
  type FetchRate,
} from '@/lib/tools/currency-converter';

const TODAY = '2026-10-11';

const request = (overrides: Partial<ConversionRequest> = {}): ConversionRequest => ({
  amount: '100',
  from: 'USD',
  to: 'EUR',
  date: '',
  ...overrides,
});

/** A rate service that answers every request the same way and records the URLs. */
function service(status: number, body: unknown) {
  const urls: string[] = [];
  const fetch: FetchRate = async (url) => {
    urls.push(url);

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (body instanceof Error) {
          throw body;
        }

        return body;
      },
    };
  };

  return { fetch, urls };
}

/** A rate service that never answers; it only fails once the request is aborted. */
const silentService: FetchRate = (_url, { signal }) =>
  new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });

const RATE = { date: '2026-10-09', base: 'USD', quote: 'EUR', rate: 0.89149 };

test.describe('convertCurrency', () => {
  test('converts at the latest rate when no date is given', async () => {
    const { fetch, urls } = service(200, RATE);
    const outcome = await convertCurrency(request(), { fetch, today: TODAY });

    expect(urls).toEqual(['https://api.frankfurter.dev/v2/rate/USD/EUR']);
    expect(outcome.status).toBe('converted');

    if (outcome.status === 'converted') {
      expect(outcome.conversion).toMatchObject({
        amount: 100,
        base: 'USD',
        quote: 'EUR',
        rate: 0.89149,
        date: '2026-10-09',
      });
      expect(outcome.conversion.convertedAmount).toBeCloseTo(89.149, 10);
    }
  });

  test('asks for the rate of the reference date', async () => {
    const { fetch, urls } = service(200, { ...RATE, date: '2026-10-04' });

    await convertCurrency(request({ date: '2026-10-04' }), { fetch, today: TODAY });

    expect(urls).toEqual(['https://api.frankfurter.dev/v2/rate/USD/EUR?date=2026-10-04']);
  });

  test('accepts today as the reference date', async () => {
    const { fetch, urls } = service(200, RATE);
    const outcome = await convertCurrency(request({ date: TODAY }), { fetch, today: TODAY });

    expect(outcome.status).toBe('converted');
    expect(urls).toHaveLength(1);
  });

  test('reads thousands separators in the amount', async () => {
    const { fetch } = service(200, { ...RATE, rate: 2 });
    const outcome = await convertCurrency(request({ amount: '1,250.50' }), { fetch, today: TODAY });

    expect(outcome).toMatchObject({
      status: 'converted',
      conversion: { amount: 1250.5, convertedAmount: 2501 },
    });
  });

  // "1,5" used to be converted as 15.
  test('reads a decimal comma in the amount as a decimal', async () => {
    const { fetch } = service(200, { ...RATE, rate: 2 });
    const outcome = await convertCurrency(request({ amount: '1,5' }), { fetch, today: TODAY });

    expect(outcome).toMatchObject({
      status: 'converted',
      conversion: { amount: 1.5, convertedAmount: 3 },
    });
  });

  test('converts a currency to itself without a request', async () => {
    const { fetch, urls } = service(200, RATE);
    const latest = await convertCurrency(request({ to: 'USD' }), { fetch, today: TODAY });
    const dated = await convertCurrency(request({ to: 'USD', date: '2026-01-02' }), {
      fetch,
      today: TODAY,
    });

    expect(urls).toEqual([]);
    expect(latest).toEqual({
      status: 'converted',
      conversion: {
        amount: 100,
        convertedAmount: 100,
        base: 'USD',
        quote: 'USD',
        rate: 1,
        date: TODAY,
      },
    });
    expect(dated).toMatchObject({ conversion: { date: '2026-01-02' } });
  });

  test('refuses an amount that is missing, not a number or negative', async () => {
    const { fetch, urls } = service(200, RATE);
    const options = { fetch, today: TODAY };

    for (const amount of ['', '   ', 'abc', '100 USD']) {
      expect(await convertCurrency(request({ amount }), options), amount).toEqual({
        status: 'failed',
        error: 'Enter a valid amount to convert.',
      });
    }

    expect(await convertCurrency(request({ amount: '-5' }), options)).toEqual({
      status: 'failed',
      error: 'Amount cannot be negative.',
    });
    expect(urls).toEqual([]);
  });

  test('refuses an amount whose conversion overflows', async () => {
    const { fetch } = service(200, { ...RATE, rate: 17875 });

    expect(await convertCurrency(request({ amount: '1e308' }), { fetch, today: TODAY })).toEqual({
      status: 'failed',
      error: 'That amount is too large to convert.',
    });
  });

  test('converts an amount of zero', async () => {
    const { fetch } = service(200, RATE);

    expect(await convertCurrency(request({ amount: '0' }), { fetch, today: TODAY })).toMatchObject({
      status: 'converted',
      conversion: { amount: 0, convertedAmount: 0 },
    });
  });

  // A date typed past the picker's limit went to the service, which answered
  // 404 "not found".
  test('refuses a reference date in the future without a request', async () => {
    const { fetch, urls } = service(200, RATE);
    const outcome = await convertCurrency(request({ date: '2026-10-12' }), { fetch, today: TODAY });

    expect(outcome).toEqual({ status: 'failed', error: 'Reference date cannot be in the future.' });
    expect(urls).toEqual([]);
  });

  // A date still being typed, or one that does not exist, went to the service,
  // which answered 422 "invalid date".
  test('refuses a reference date that is not a real date without a request', async () => {
    const { fetch, urls } = service(200, RATE);

    for (const date of ['yesterday', '2026-1', '2026-13-01', '2026-02-31', '2025-02-29']) {
      expect(
        await convertCurrency(request({ date }), { fetch, today: TODAY }),
        date
      ).toEqual({ status: 'failed', error: 'Enter a valid reference date as YYYY-MM-DD.' });
    }

    expect(urls).toEqual([]);
  });

  test('passes on the message of a refused request', async () => {
    const { fetch } = service(422, { status: 422, message: 'invalid currency: XXX' });

    expect(await convertCurrency(request({ to: 'XXX' }), { fetch, today: TODAY })).toEqual({
      status: 'failed',
      error: 'invalid currency: XXX',
    });
  });

  test('reports a refused request that carries no readable message', async () => {
    const expected = { status: 'failed', error: 'Failed to fetch exchange rate.' };
    const notJson = service(500, new SyntaxError('Unexpected token <'));
    const noMessage = service(503, { status: 503 });

    expect(await convertCurrency(request(), { fetch: notJson.fetch, today: TODAY })).toEqual(expected);
    expect(await convertCurrency(request(), { fetch: noMessage.fetch, today: TODAY })).toEqual(expected);
  });

  // The service's own text for this was shown as the whole error: "not found".
  test('explains a date the service has no rate for', async () => {
    const { fetch } = service(404, { status: 404, message: 'not found' });

    expect(await convertCurrency(request({ date: '1990-01-01' }), { fetch, today: TODAY })).toEqual({
      status: 'failed',
      error: 'No exchange rate is available for January 1, 1990.',
    });
    expect(await convertCurrency(request(), { fetch, today: TODAY })).toEqual({
      status: 'failed',
      error: 'No exchange rate is available for this currency pair.',
    });
  });

  // A reply without a usable rate was multiplied anyway and shown as "NaN EUR".
  test('refuses a reply without a usable rate', async () => {
    const expected = {
      status: 'failed',
      error: 'The exchange rate service sent an unexpected response.',
    };

    for (const body of [{}, null, { ...RATE, rate: '0.89' }, { ...RATE, rate: 0 }, { ...RATE, rate: null }]) {
      const { fetch } = service(200, body);

      expect(
        await convertCurrency(request(), { fetch, today: TODAY }),
        JSON.stringify(body)
      ).toEqual(expected);
    }
  });

  test('falls back to the request when a reply names no pair or date', async () => {
    const { fetch } = service(200, { rate: 0.5 });
    const outcome = await convertCurrency(request({ date: '2026-10-04' }), { fetch, today: TODAY });

    expect(outcome).toEqual({
      status: 'converted',
      conversion: {
        amount: 100,
        convertedAmount: 50,
        base: 'USD',
        quote: 'EUR',
        rate: 0.5,
        date: '2026-10-04',
      },
    });
  });

  // The browser's own text was shown: "Failed to fetch", "Load failed".
  test('reports a network failure in plain words', async () => {
    const offline: FetchRate = async () => {
      throw new TypeError('Load failed');
    };

    expect(await convertCurrency(request(), { fetch: offline, today: TODAY })).toEqual({
      status: 'failed',
      error:
        'Could not get a rate from the exchange rate service. Check your connection and try again.',
    });
  });

  test('reports a successful reply whose body is not JSON', async () => {
    const { fetch } = service(200, new SyntaxError('Unexpected token <'));
    const outcome = await convertCurrency(request(), { fetch, today: TODAY });

    expect(outcome.status).toBe('failed');
  });

  // The request had no time limit, so the button stayed on "Converting...".
  test('gives up when the service does not answer in time', async () => {
    const outcome = await convertCurrency(request(), {
      fetch: silentService,
      today: TODAY,
      timeoutMs: 10,
    });

    expect(outcome).toEqual({
      status: 'failed',
      error: 'The exchange rate service took too long to respond. Try again.',
    });
  });

  test('is cancelled by the caller while waiting', async () => {
    const controller = new AbortController();
    const pending = convertCurrency(request(), {
      fetch: silentService,
      today: TODAY,
      signal: controller.signal,
    });

    controller.abort();

    expect(await pending).toEqual({ status: 'cancelled' });
  });

  test('makes no request once the caller has already cancelled', async () => {
    const { fetch, urls } = service(200, RATE);
    const controller = new AbortController();

    controller.abort();

    expect(
      await convertCurrency(request(), { fetch, today: TODAY, signal: controller.signal })
    ).toEqual({ status: 'cancelled' });
    expect(urls).toEqual([]);
  });

  // Clearing the form while a rate was on its way brought the result back.
  test('drops a reply that arrives after the caller cancelled', async () => {
    const controller = new AbortController();
    const late: FetchRate = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        controller.abort();
        return RATE;
      },
    });

    expect(
      await convertCurrency(request(), { fetch: late, today: TODAY, signal: controller.signal })
    ).toEqual({ status: 'cancelled' });
  });
});

test.describe('currency formatting', () => {
  test('formats an amount with two to four decimals', () => {
    expect(formatAmount(100)).toBe('100.00');
    expect(formatAmount(89.149)).toBe('89.149');
    expect(formatAmount(1234567.891234)).toBe('1,234,567.8912');
    expect(formatAmount(0)).toBe('0.00');
  });

  // One rupiah is 0.000056 USD; four decimals showed it as 0.0001.
  test('keeps four significant digits of an amount below 1', () => {
    expect(formatAmount(0.000056)).toBe('0.000056');
    expect(formatAmount(0.00056)).toBe('0.00056');
    expect(formatAmount(0.061234)).toBe('0.06123');
    expect(formatAmount(0.5)).toBe('0.50');
  });

  test('formats a rate with two to six decimals', () => {
    expect(formatRate(1)).toBe('1.00');
    expect(formatRate(0.89149)).toBe('0.89149');
    expect(formatRate(17875.123456789)).toBe('17,875.123457');
    expect(formatRate(0.000056)).toBe('0.000056');
    expect(formatRate(0.0000123456)).toBe('0.00001235');
  });

  test('writes a rate date in words and leaves other text alone', () => {
    expect(formatRateDate('2026-10-04')).toBe('October 4, 2026');
    expect(formatRateDate('2024-02-29')).toBe('February 29, 2024');
    expect(formatRateDate('garbage')).toBe('garbage');
  });

  test('writes a local date as YYYY-MM-DD', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(localIsoDate(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });

  test('recognises real calendar dates only', () => {
    expect(isIsoDate('2026-10-04')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2025-02-29')).toBe(false);
    expect(isIsoDate('2026-02-31')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-5')).toBe(false);
    expect(isIsoDate('2026-10')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

test.describe('currency list', () => {
  test('has unique three-letter codes', () => {
    const codes = CURRENCIES.map((currency) => currency.code);

    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[A-Z]{3}$/.test(code))).toBe(true);
  });

  test('looks a symbol up and falls back to the code', () => {
    expect(getCurrencySymbol('EUR')).toBe('€');
    expect(getCurrencySymbol('XYZ')).toBe('XYZ');
  });
});
