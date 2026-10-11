'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks';
import { convertNumberBase, type NumberBase } from '@/lib/tools/number-base-converter';
import { Check, Copy, Trash2 } from 'lucide-react';

type Base = NumberBase;

const baseOptions = [
  { value: 'binary', label: 'Binary (2)' },
  { value: 'octal', label: 'Octal (8)' },
  { value: 'decimal', label: 'Decimal (10)' },
  { value: 'hex', label: 'Hexadecimal (16)' },
];

const resultCards: ReadonlyArray<{ base: Base; title: string }> = [
  { base: 'binary', title: 'Binary (Base 2)' },
  { base: 'octal', title: 'Octal (Base 8)' },
  { base: 'decimal', title: 'Decimal (Base 10)' },
  { base: 'hex', title: 'Hexadecimal (Base 16)' },
];

function ResultCard({ title, value }: { title: string; value: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-lg">{title}</CardTitle>
        {/* The negative margin keeps the header as tall as its title */}
        <Button
          onClick={() => copyToClipboard(value)}
          variant={isCopied ? 'default' : 'ghost'}
          size="icon"
          disabled={!value}
          aria-label={isCopied ? `${title} copied` : `Copy ${title}`}
          className="-my-2 h-8 w-8 shrink-0"
        >
          {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="p-3 rounded-md bg-muted font-mono text-sm break-all">
          {value || '-'}
        </div>
      </CardContent>
    </Card>
  );
}

export function NumberBaseConverter() {
  const [inputBase, setInputBase] = useState<Base>('decimal');
  const [inputValue, setInputValue] = useState('');

  const conversion = useMemo(
    () => convertNumberBase(inputValue, inputBase),
    [inputValue, inputBase]
  );
  const error = conversion.status === 'error' ? conversion.error : '';

  const handleClear = () => {
    setInputValue('');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle>Input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="number-base" className="text-sm font-medium mb-2 block">
              Base
            </label>
            <Select value={inputBase} onValueChange={(value) => setInputBase(value as Base)}>
              <SelectTrigger id="number-base">
                <SelectValue placeholder="Select base" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {baseOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="number-value" className="text-sm font-medium mb-2 block">
              Value
            </label>
            <Input
              id="number-value"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue((e.target as HTMLInputElement).value)}
              placeholder="Enter number..."
              aria-invalid={error ? true : undefined}
              className="font-mono"
            />
          </div>
          {error && (
            <div role="alert" className="text-sm text-destructive">
              {error}
            </div>
          )}
          <Button onClick={handleClear} variant="outline" size="sm">
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </CardContent>
      </Card>

      {/* Results Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {resultCards.map(({ base, title }) => (
          <ResultCard
            key={base}
            title={title}
            value={conversion.status === 'ok' ? conversion.values[base] : ''}
          />
        ))}
      </div>
    </div>
  );
}
