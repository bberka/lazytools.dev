'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Check, Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useActionButton, useCopyToClipboard } from '@/hooks';
import {
  CURRENCIES,
  convertCurrency,
  formatAmount,
  formatRate,
  formatRateDate,
  getCurrencySymbol,
  isIsoDate,
  localIsoDate,
  type CurrencyConversion,
  type CurrencyOption,
} from '@/lib/tools/currency-converter';

function getCurrencyLabel(currency: CurrencyOption): string {
  return `${currency.code} · ${currency.name}`;
}

// Read when it is needed, never while rendering: the page is prerendered at
// build time, and a date rendered into that HTML would be the build date.
const getToday = () => localIsoDate(new Date());

export function CurrencyConverter() {
  const [amount, setAmount] = useState('100');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('EUR');
  const [date, setDate] = useState('');
  const [result, setResult] = useState<CurrencyConversion | null>(null);
  const [error, setError] = useState('');
  // The conversion in flight, so that Clear, a newer conversion or leaving the
  // page can abandon it.
  const activeRequest = useRef<AbortController | null>(null);

  const { executeAction, isLoading } = useActionButton();
  const copyResult = useCopyToClipboard();

  useEffect(() => {
    return () => {
      activeRequest.current?.abort();
    };
  }, []);

  const runConversion = async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;

    setError('');
    setResult(null);

    const outcome = await convertCurrency(
      { amount, from: fromCurrency, to: toCurrency, date },
      {
        fetch: (url, init) => fetch(url, init),
        today: getToday(),
        signal: controller.signal,
      }
    );

    if (controller.signal.aborted || outcome.status === 'cancelled') {
      return;
    }

    if (outcome.status === 'failed') {
      setError(outcome.error);
      return;
    }

    setResult(outcome.conversion);
  };

  const handleConvert = async () => {
    await executeAction(runConversion);
  };

  const handleSwap = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const handleClear = () => {
    activeRequest.current?.abort();
    setAmount('');
    setFromCurrency('USD');
    setToCurrency('EUR');
    setDate('');
    setResult(null);
    setError('');
  };

  const copyValue = result ? `${formatAmount(result.convertedAmount)} ${result.quote}` : '';

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Currency Converter</CardTitle>
          <CardDescription>
            Convert currencies using live reference rates fetched in the browser on demand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="currency-amount" className="mb-2 block text-sm font-medium">
              Amount
            </label>
            <Input
              id="currency-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount((event.target as HTMLInputElement).value)}
              placeholder="100"
              className="font-mono"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
            <div>
              <label htmlFor="currency-from" className="mb-2 block text-sm font-medium">
                From
              </label>
              <Select value={fromCurrency} onValueChange={setFromCurrency}>
                <SelectTrigger id="currency-from">
                  <SelectValue placeholder="Select source currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency.code} value={currency.code}>
                        {getCurrencyLabel(currency)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-center lg:pb-0.5">
              <Button
                onClick={handleSwap}
                variant="outline"
                size="icon"
                aria-label="Swap currencies"
                className="h-11 w-full sm:w-11 lg:h-10 lg:w-10"
              >
                <ArrowRightLeft className="h-4 w-4" />
              </Button>
            </div>

            <div>
              <label htmlFor="currency-to" className="mb-2 block text-sm font-medium">
                To
              </label>
              <Select value={toCurrency} onValueChange={setToCurrency}>
                <SelectTrigger id="currency-to">
                  <SelectValue placeholder="Select target currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency.code} value={currency.code}>
                        {getCurrencyLabel(currency)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div role="group" aria-labelledby="currency-date-label">
            <span id="currency-date-label" className="mb-2 block text-sm font-medium">
              Reference date
            </span>
            <DatePicker
              aria-labelledby="currency-date-label"
              value={date}
              onChange={setDate}
              disabled={(day) => localIsoDate(day) > getToday()}
              error={date !== '' && !isIsoDate(date)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Leave blank to use the latest available rate.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleConvert} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Converting...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Convert
                </>
              )}
            </Button>
            <Button onClick={handleClear} variant="outline">
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
            <Button
              onClick={() => copyResult.copyToClipboard(copyValue)}
              variant={copyResult.isCopied ? 'default' : 'outline'}
              disabled={!copyValue}
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
          <CardTitle>Result</CardTitle>
          <CardDescription>
            {result
              ? `Reference date: ${formatRateDate(result.date)}`
              : 'Run a conversion to see the latest result.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="break-words rounded-md bg-muted p-4 font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
            {copyValue || '-'}
          </div>

          {result && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-md border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Conversion
                </div>
                <div className="mt-1 break-words font-semibold">
                  {formatAmount(result.amount)} {result.base} ={' '}
                  {formatAmount(result.convertedAmount)} {result.quote}
                </div>
              </div>
              <div className="rounded-md border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Exchange rate
                </div>
                <div className="mt-1 break-words font-semibold">
                  1 {result.base} = {formatRate(result.rate)} {result.quote}
                </div>
              </div>
              <div className="rounded-md border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Symbols
                </div>
                <div className="mt-1 font-semibold">
                  {getCurrencySymbol(result.base)} to {getCurrencySymbol(result.quote)}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 text-sm text-muted-foreground sm:pt-6">
          Rates are fetched from Frankfurter when you click convert. These are reference rates and can change as newer published data becomes available.
        </CardContent>
      </Card>
    </div>
  );
}
