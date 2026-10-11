'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCopyToClipboard } from '@/hooks';
import {
  cleanRomanInput,
  fromRoman,
  parseDecimal,
  toRoman,
} from '@/lib/tools/roman-numeral-converter';
import { cn } from '@/lib/utils';
import { Copy, Check, Trash2, Binary, AlertCircle, Info } from 'lucide-react';

export function RomanNumeralConverter() {
  const [decimal, setDecimal] = useState<string>('');
  const [roman, setRoman] = useState<string>('');
  const [decimalError, setDecimalError] = useState<string | null>(null);
  const [romanError, setRomanError] = useState<string | null>(null);

  const { copyToClipboard: copyDecimal, isCopied: isDecimalCopied } = useCopyToClipboard();
  const { copyToClipboard: copyRoman, isCopied: isRomanCopied } = useCopyToClipboard();

  // `unreadable` is a number field holding text the browser cannot read as a
  // number ("12-"): it reports its value as empty although it is not.
  const handleDecimalChange = (val: string, unreadable: boolean) => {
    setDecimal(val);
    setDecimalError(null);
    setRomanError(null);

    if (!val && !unreadable) {
      setRoman('');
      return;
    }

    const num = parseDecimal(val);
    const converted = num === null ? null : toRoman(num);

    if (converted === null) {
      setDecimalError('Enter an integer between 1 and 3999.');
      setRoman('');
      return;
    }

    setRoman(converted);
  };

  const handleRomanChange = (val: string) => {
    // Only letters that can be part of Roman numerals are kept
    const cleaned = cleanRomanInput(val);
    setRoman(cleaned);
    setRomanError(null);
    setDecimalError(null);

    if (!cleaned) {
      setDecimal('');
      return;
    }

    const num = fromRoman(cleaned);
    if (num === null) {
      setRomanError('Invalid Roman numeral syntax.');
      setDecimal('');
      return;
    }

    setDecimal(num.toString());
  };

  const handleClear = () => {
    setDecimal('');
    setRoman('');
    setDecimalError(null);
    setRomanError(null);
  };

  return (
    <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
      <div className="space-y-4 md:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Binary className="h-5 w-5 text-primary" />
              Bidirectional Conversion
            </CardTitle>
            <CardDescription>
              Convert decimal values to Roman numerals or vice versa in real-time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Decimal Input */}
              <div className="space-y-2">
                <label htmlFor="roman-decimal" className="text-sm font-medium">
                  Decimal Number (1 - 3999)
                </label>
                <div className="relative">
                  <Input
                    id="roman-decimal"
                    type="number"
                    min={1}
                    max={3999}
                    value={decimal}
                    onChange={(e) =>
                      handleDecimalChange(e.target.value, e.target.validity.badInput)
                    }
                    placeholder="e.g. 1994"
                    aria-invalid={decimalError ? true : undefined}
                    className={cn(
                      'pr-10',
                      decimalError && 'border-destructive focus-visible:ring-destructive'
                    )}
                  />
                  {decimal && !decimalError && (
                    <Button
                      onClick={() => copyDecimal(decimal)}
                      variant={isDecimalCopied ? 'default' : 'ghost'}
                      size="icon"
                      aria-label={isDecimalCopied ? 'Decimal number copied' : 'Copy decimal number'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7"
                    >
                      {isDecimalCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                {decimalError && (
                  <div role="alert" className="flex items-center gap-1.5 text-xs text-destructive mt-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{decimalError}</span>
                  </div>
                )}
              </div>

              {/* Roman Numeral Input */}
              <div className="space-y-2">
                <label htmlFor="roman-numeral" className="text-sm font-medium">
                  Roman Numeral
                </label>
                <div className="relative">
                  <Input
                    id="roman-numeral"
                    type="text"
                    value={roman}
                    onChange={(e) => handleRomanChange(e.target.value)}
                    placeholder="e.g. MCMXCIV"
                    aria-invalid={romanError ? true : undefined}
                    className={cn(
                      'pr-10 font-serif tracking-wider',
                      romanError && 'border-destructive focus-visible:ring-destructive'
                    )}
                  />
                  {roman && !romanError && (
                    <Button
                      onClick={() => copyRoman(roman)}
                      variant={isRomanCopied ? 'default' : 'ghost'}
                      size="icon"
                      aria-label={isRomanCopied ? 'Roman numeral copied' : 'Copy Roman numeral'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7"
                    >
                      {isRomanCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                {romanError && (
                  <div role="alert" className="flex items-center gap-1.5 text-xs text-destructive mt-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{romanError}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button onClick={handleClear} variant="outline" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Inputs
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reference Cheat Sheet */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4 text-muted-foreground" />
              Roman Numerals Cheat Sheet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Basic Symbols
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-primary">I</span>
                  <span>1</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-primary">V</span>
                  <span>5</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-primary">X</span>
                  <span>10</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-primary">L</span>
                  <span>50</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-primary">C</span>
                  <span>100</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-primary">D</span>
                  <span>500</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-primary">M</span>
                  <span>1000</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Subtractive Pairs
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-primary">IV</span>
                  <span>4</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-primary">IX</span>
                  <span>9</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-primary">XL</span>
                  <span>40</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-primary">XC</span>
                  <span>90</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-primary">CD</span>
                  <span>400</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-primary">CM</span>
                  <span>900</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
