'use client';

import { useMemo, useState } from 'react';
import { ArrowRightLeft, Check, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCopyToClipboard } from '@/hooks';
import {
  UNIT_CATEGORIES,
  convertUnits,
  getUnitCategory,
  type UnitCategoryId,
} from '@/lib/tools/unit-converter';

type CategoryId = UnitCategoryId;

const categoryOptions = UNIT_CATEGORIES.map((category) => ({
  value: category.id,
  label: category.label,
}));

export function UnitConverter() {
  const [categoryId, setCategoryId] = useState<CategoryId>('length');
  const [inputValue, setInputValue] = useState('1');
  const [fromUnitId, setFromUnitId] = useState('meter');
  const [toUnitId, setToUnitId] = useState('foot');
  const copyResult = useCopyToClipboard();

  const category = useMemo(() => getUnitCategory(categoryId), [categoryId]);

  const unitOptions = useMemo(
    () =>
      category.units.map((unit) => ({
        value: unit.id,
        label: `${unit.label} (${unit.symbol})`,
      })),
    [category]
  );

  const result = useMemo(
    () => convertUnits({ categoryId, value: inputValue, fromUnitId, toUnitId }),
    [categoryId, fromUnitId, inputValue, toUnitId]
  );

  const handleSwap = () => {
    setFromUnitId(toUnitId);
    setToUnitId(fromUnitId);
  };

  const handleClear = () => {
    setInputValue('');
  };

  const handleCategoryChange = (value: CategoryId) => {
    const nextCategory = getUnitCategory(value);
    const [firstUnit, secondUnit] = nextCategory.units;

    setCategoryId(nextCategory.id);
    setFromUnitId(firstUnit.id);
    setToUnitId((secondUnit ?? firstUnit).id);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Unit Converter</CardTitle>
          <CardDescription>
            Convert between common units for length, weight, temperature, area, volume, speed, time, and data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="unit-category" className="mb-2 block text-sm font-medium">
              Category
            </label>
            <Select value={categoryId} onValueChange={(value) => handleCategoryChange(value as CategoryId)}>
              <SelectTrigger id="unit-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="unit-value" className="mb-2 block text-sm font-medium">
              Value
            </label>
            <Input
              id="unit-value"
              type="text"
              inputMode="decimal"
              value={inputValue}
              onChange={(event) => setInputValue((event.target as HTMLInputElement).value)}
              placeholder="Enter value..."
              className="font-mono"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
            <div>
              <label htmlFor="unit-from" className="mb-2 block text-sm font-medium">
                From
              </label>
              <Select value={fromUnitId} onValueChange={setFromUnitId}>
                <SelectTrigger id="unit-from">
                  <SelectValue placeholder="Select source unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {unitOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
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
                aria-label="Swap units"
                className="h-11 w-full sm:w-11 lg:h-10 lg:w-10"
              >
                <ArrowRightLeft className="h-4 w-4" />
              </Button>
            </div>
            <div>
              <label htmlFor="unit-to" className="mb-2 block text-sm font-medium">
                To
              </label>
              <Select value={toUnitId} onValueChange={setToUnitId}>
                <SelectTrigger id="unit-to">
                  <SelectValue placeholder="Select target unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {unitOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          {result.error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {result.error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleClear} variant="outline">
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
            <Button
              onClick={() => copyResult.copyToClipboard(result.value)}
              variant={copyResult.isCopied ? 'default' : 'outline'}
              disabled={!result.value}
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
            Base unit for {category.label.toLowerCase()}: {category.baseLabel}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="break-words rounded-md bg-muted p-4 font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
            {result.value || '-'}
          </div>
          <p className="text-sm text-muted-foreground">
            {result.error ? 'Adjust the input values to continue.' : result.detail}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
