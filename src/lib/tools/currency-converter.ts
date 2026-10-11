/**
 * Currency conversion for the Currency Converter: validating the form,
 * fetching one reference rate from Frankfurter, and formatting the result.
 *
 * The network, the clock and cancellation are arguments, so tests run without
 * any of them. `convertCurrency` never throws; every failure comes back as an
 * outcome with a message that can be shown as it is.
 */

import { formatNumber, readNumber } from '@/lib/tools/calculator-numbers';

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
}

export const CURRENCIES: readonly CurrencyOption[] = [
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kc' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'ILS', name: 'Israeli New Shekel', symbol: '₪' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'ISK', name: 'Icelandic Krona', symbol: 'kr' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zl' },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
];

/** The symbol of a currency, or the code itself when the currency is not listed. */
export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find((currency) => currency.code === code)?.symbol ?? code;
}

export interface CurrencyConversion {
  amount: number;
  convertedAmount: number;
  base: string;
  quote: string;
  /** How much of `quote` one unit of `base` buys. */
  rate: number;
  /** The date the rate was published for, as YYYY-MM-DD. */
  date: string;
}

export type ConversionOutcome =
  | { status: 'converted'; conversion: CurrencyConversion }
  | { status: 'failed'; error: string }
  /** The caller's signal was aborted; there is nothing to show. */
  | { status: 'cancelled' };

export interface ConversionRequest {
  /** The amount field as typed. */
  amount: string;
  from: string;
  to: string;
  /** Reference date as YYYY-MM-DD, or empty for the latest rate. */
  date: string;
}

/** The part of `fetch` this module uses. */
export type FetchRate = (
  url: string,
  init: { signal: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ConversionOptions {
  fetch: FetchRate;
  /** Today's date as YYYY-MM-DD; see `localIsoDate`. */
  today: string;
  /** Aborting this abandons the request. */
  signal?: AbortSignal;
  /** How long to wait for the rate service. Default: `RATE_TIMEOUT_MS`. */
  timeoutMs?: number;
}

export const RATE_TIMEOUT_MS = 15_000;

const RATE_ENDPOINT = 'https://api.frankfurter.dev/v2/rate';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A date in the local time zone as YYYY-MM-DD, the format of the date field. */
export function localIsoDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
}

/** Whether the text is a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  // Some engines roll February 31 over into March instead of refusing it.
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A YYYY-MM-DD date in words ("October 4, 2026"); other text is returned as it is. */
export function formatRateDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * An amount of money: two to four decimals. An amount below 1 keeps four
 * significant digits, so one Indonesian rupiah reads 0.000056 USD and not
 * 0.0001.
 */
export function formatAmount(value: number): string {
  return formatNumber(value, {
    minFractionDigits: 2,
    maxFractionDigits: 4,
    minSignificantDigits: 4,
  });
}

/** An exchange rate: two to six decimals, and four significant digits below 1. */
export function formatRate(value: number): string {
  return formatNumber(value, {
    minFractionDigits: 2,
    maxFractionDigits: 6,
    minSignificantDigits: 4,
  });
}

const failed = (error: string): ConversionOutcome => ({ status: 'failed', error });

function rateUrl(request: ConversionRequest): string {
  const pair = `${encodeURIComponent(request.from)}/${encodeURIComponent(request.to)}`;
  const query = request.date ? `?${new URLSearchParams({ date: request.date })}` : '';

  return `${RATE_ENDPOINT}/${pair}${query}`;
}

async function readErrorMessage(response: { json(): Promise<unknown> }): Promise<string> {
  try {
    const data = (await response.json()) as { message?: unknown } | null;
    return typeof data?.message === 'string' ? data.message : '';
  } catch {
    // An error page that is not JSON carries no message to pass on.
    return '';
  }
}

/**
 * Converts the typed amount at the reference rate of the given date, or at
 * the latest rate when the date is empty. Converting a currency to itself
 * needs no rate and makes no request.
 */
export async function convertCurrency(
  request: ConversionRequest,
  options: ConversionOptions
): Promise<ConversionOutcome> {
  const { fetch: fetchRate, today, signal, timeoutMs = RATE_TIMEOUT_MS } = options;
  const amountField = readNumber(request.amount);

  if (amountField.kind !== 'number') {
    return failed('Enter a valid amount to convert.');
  }

  const amount = amountField.value;

  if (amount < 0) {
    return failed('Amount cannot be negative.');
  }

  if (request.date) {
    if (!isIsoDate(request.date)) {
      return failed('Enter a valid reference date as YYYY-MM-DD.');
    }

    // ISO dates sort as text.
    if (request.date > today) {
      return failed('Reference date cannot be in the future.');
    }
  }

  if (request.from === request.to) {
    return {
      status: 'converted',
      conversion: {
        amount,
        convertedAmount: amount,
        base: request.from,
        quote: request.to,
        rate: 1,
        date: request.date || today,
      },
    };
  }

  if (signal?.aborted) {
    return { status: 'cancelled' };
  }

  // One controller serves both the caller's cancellation and the timeout.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel);

  try {
    const response = await fetchRate(rateUrl(request), { signal: controller.signal });
    const message = response.ok ? '' : await readErrorMessage(response);
    const data = response.ok
      ? ((await response.json()) as Partial<Record<string, unknown>> | null)
      : null;

    // A reply that arrives after the caller gave up is not shown.
    if (signal?.aborted) {
      return { status: 'cancelled' };
    }

    if (!response.ok) {
      if (response.status === 404) {
        return failed(
          request.date
            ? `No exchange rate is available for ${formatRateDate(request.date)}.`
            : 'No exchange rate is available for this currency pair.'
        );
      }

      return failed(message || 'Failed to fetch exchange rate.');
    }

    const rate = data?.rate;

    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      return failed('The exchange rate service sent an unexpected response.');
    }

    const convertedAmount = amount * rate;

    if (!Number.isFinite(convertedAmount)) {
      return failed('That amount is too large to convert.');
    }

    return {
      status: 'converted',
      conversion: {
        amount,
        convertedAmount,
        base: typeof data?.base === 'string' ? data.base : request.from,
        quote: typeof data?.quote === 'string' ? data.quote : request.to,
        rate,
        date: typeof data?.date === 'string' ? data.date : request.date || today,
      },
    };
  } catch {
    if (signal?.aborted) {
      return { status: 'cancelled' };
    }

    if (timedOut) {
      return failed('The exchange rate service took too long to respond. Try again.');
    }

    // fetch rejects with a browser-specific message ("Load failed") that says
    // nothing useful, and a body that is not JSON lands here as well.
    return failed(
      'Could not get a rate from the exchange rate service. Check your connection and try again.'
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
