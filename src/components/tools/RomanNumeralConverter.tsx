'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCopyToClipboard } from '@/hooks';
import { Copy, Check, Trash2, Binary, AlertCircle, Info } from 'lucide-react';

const ROMAN_REGEX = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i;

export function RomanNumeralConverter() {
  const [decimal, setDecimal] = useState<string>('');
  const [roman, setRoman] = useState<string>('');
  const [decimalError, setDecimalError] = useState<string | null>(null);
  const [romanError, setRomanError] = useState<string | null>(null);

  const { copyToClipboard: copyDecimal, isCopied: isDecimalCopied } = useCopyToClipboard();
  const { copyToClipboard: copyRoman, isCopied: isRomanCopied } = useCopyToClipboard();

  const decimalToRoman = (num: number): string => {
    if (num < 1 || num > 3999) return '';
    const lookup: Array<[number, string]> = [
      [1000, 'M'],
      [900, 'CM'],
      [500, 'D'],
      [400, 'CD'],
      [100, 'C'],
      [90, 'XC'],
      [50, 'L'],
      [40, 'XL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ];
    let result = '';
    let remaining = num;
    for (const [value, symbol] of lookup) {
      while (remaining >= value) {
        result += symbol;
        remaining -= value;
      }
    }
    return result;
  };

  const romanToDecimal = (val: string): number => {
    const cleanRoman = val.toUpperCase().trim();
    if (!cleanRoman) return 0;

    if (!ROMAN_REGEX.test(cleanRoman)) {
      return -1;
    }

    const lookup: Record<string, number> = {
      I: 1,
      V: 5,
      X: 10,
      L: 50,
      C: 100,
      D: 500,
      M: 1000,
    };

    let total = 0;
    for (let i = 0; i < cleanRoman.length; i++) {
      const currentVal = lookup[cleanRoman[i]] || 0;
      const nextVal = lookup[cleanRoman[i + 1]] || 0;

      if (currentVal < nextVal) {
        total -= currentVal;
      } else {
        total += currentVal;
      }
    }
    return total;
  };

  const handleDecimalChange = (val: string) => {
    setDecimal(val);
    setDecimalError(null);
    setRomanError(null);

    if (!val) {
      setRoman('');
      return;
    }

    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1 || num > 3999 || num.toString() !== val) {
      setDecimalError('Enter an integer between 1 and 3999.');
      setRoman('');
      return;
    }

    const converted = decimalToRoman(num);
    setRoman(converted);
  };

  const handleRomanChange = (val: string) => {
    // Only allow letters that can be part of Roman numerals
    const filteredVal = val.replace(/[^ivxlcdmIVXLCDM]/g, '');
    setRoman(filteredVal.toUpperCase());
    setRomanError(null);
    setDecimalError(null);

    if (!filteredVal) {
      setDecimal('');
      return;
    }

    const num = romanToDecimal(filteredVal);
    if (num === -1 || num === 0) {
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
    <div className="grid gap-6 md:grid-cols-3">
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
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Decimal Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Decimal Number (1 - 3999)</label>
                <div className="relative">
                  <Input
                    type="number"
                    min={1}
                    max={3999}
                    value={decimal}
                    onChange={(e) => handleDecimalChange(e.target.value)}
                    placeholder="e.g. 1994"
                    className={decimalError ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {decimal && !decimalError && (
                    <Button
                      onClick={() => copyDecimal(decimal)}
                      variant="ghost"
                      size="icon"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7"
                    >
                      {isDecimalCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                {decimalError && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive mt-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{decimalError}</span>
                  </div>
                )}
              </div>

              {/* Roman Numeral Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Roman Numeral</label>
                <div className="relative">
                  <Input
                    type="text"
                    value={roman}
                    onChange={(e) => handleRomanChange(e.target.value)}
                    placeholder="e.g. MCMXCIV"
                    className={`font-serif tracking-wider ${
                      romanError ? 'border-destructive focus-visible:ring-destructive' : ''
                    }`}
                  />
                  {roman && !romanError && (
                    <Button
                      onClick={() => copyRoman(roman)}
                      variant="ghost"
                      size="icon"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7"
                    >
                      {isRomanCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                {romanError && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive mt-1">
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
