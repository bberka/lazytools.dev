'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Scale, Trash2 } from 'lucide-react';
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
  calculateBmi,
  type BmiCategoryId,
  type BmiUnitSystem,
} from '@/lib/tools/bmi-calculator';
import { cn } from '@/lib/utils';

type UnitSystem = BmiUnitSystem;

const unitOptions = [
  { value: 'metric', label: 'Metric (kg, cm)' },
  { value: 'us', label: 'US Customary (lb, ft, in)' },
] as const;

// Severity colours of the screening categories; the dark variants keep them
// readable on the dark card.
const categoryAccent: Record<BmiCategoryId, string> = {
  underweight: 'text-sky-600 dark:text-sky-400',
  healthy: 'text-emerald-600 dark:text-emerald-400',
  overweight: 'text-amber-600 dark:text-amber-400',
  'obesity-1': 'text-orange-600 dark:text-orange-400',
  'obesity-2': 'text-red-600 dark:text-red-400',
  'obesity-3': 'text-rose-700 dark:text-rose-400',
};

export function BmiCalculator() {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [weightMetric, setWeightMetric] = useState('72');
  const [heightCm, setHeightCm] = useState('175');
  const [weightUs, setWeightUs] = useState('159');
  const [heightFeet, setHeightFeet] = useState('5');
  const [heightInches, setHeightInches] = useState('9');
  const copyResult = useCopyToClipboard();

  const result = useMemo(
    () =>
      calculateBmi({
        unitSystem,
        weightKg: weightMetric,
        heightCm,
        weightLb: weightUs,
        heightFeet,
        heightInches,
      }),
    [heightCm, heightFeet, heightInches, unitSystem, weightMetric, weightUs]
  );

  const handleUnitChange = (value: UnitSystem) => {
    setUnitSystem(value);
  };

  const handleClear = () => {
    setWeightMetric('');
    setHeightCm('');
    setWeightUs('');
    setHeightFeet('');
    setHeightInches('');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>BMI Calculator</CardTitle>
          <CardDescription>
            Calculate adult BMI and screening category using metric or US customary units.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="bmi-units" className="mb-2 block text-sm font-medium">
              Units
            </label>
            <Select value={unitSystem} onValueChange={(value) => handleUnitChange(value as UnitSystem)}>
              <SelectTrigger id="bmi-units">
                <SelectValue placeholder="Select units" />
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

          {unitSystem === 'metric' ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="metric-weight" className="mb-2 block text-sm font-medium">
                  Weight (kg)
                </label>
                <Input
                  id="metric-weight"
                  type="text"
                  inputMode="decimal"
                  value={weightMetric}
                  onChange={(event) => setWeightMetric((event.target as HTMLInputElement).value)}
                  placeholder="72"
                  className="font-mono"
                />
              </div>
              <div>
                <label htmlFor="metric-height" className="mb-2 block text-sm font-medium">
                  Height (cm)
                </label>
                <Input
                  id="metric-height"
                  type="text"
                  inputMode="decimal"
                  value={heightCm}
                  onChange={(event) => setHeightCm((event.target as HTMLInputElement).value)}
                  placeholder="175"
                  className="font-mono"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label htmlFor="us-weight" className="mb-2 block text-sm font-medium">
                  Weight (lb)
                </label>
                <Input
                  id="us-weight"
                  type="text"
                  inputMode="decimal"
                  value={weightUs}
                  onChange={(event) => setWeightUs((event.target as HTMLInputElement).value)}
                  placeholder="159"
                  className="font-mono"
                />
              </div>
              <div>
                <label htmlFor="us-height-feet" className="mb-2 block text-sm font-medium">
                  Height (ft)
                </label>
                <Input
                  id="us-height-feet"
                  type="text"
                  inputMode="numeric"
                  value={heightFeet}
                  onChange={(event) => setHeightFeet((event.target as HTMLInputElement).value)}
                  placeholder="5"
                  className="font-mono"
                />
              </div>
              <div>
                <label htmlFor="us-height-inches" className="mb-2 block text-sm font-medium">
                  Height (in)
                </label>
                <Input
                  id="us-height-inches"
                  type="text"
                  inputMode="decimal"
                  value={heightInches}
                  onChange={(event) => setHeightInches((event.target as HTMLInputElement).value)}
                  placeholder="9"
                  className="font-mono"
                />
              </div>
            </div>
          )}

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
              onClick={() => copyResult.copyToClipboard(result.bmi)}
              variant={copyResult.isCopied ? 'default' : 'outline'}
              disabled={!result.bmi}
            >
              {copyResult.isCopied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy BMI
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
            {result.error ? 'Adjust the input values to continue.' : result.detail}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="break-words rounded-md bg-muted p-4 font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
            {result.bmi ? `${result.bmi} kg/m²` : '-'}
          </div>

          {result.category && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border bg-card p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Scale className="h-3.5 w-3.5" />
                  Category
                </div>
                <div className={cn('mt-1 text-lg font-semibold', categoryAccent[result.category.id])}>
                  {result.category.label}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Range: {result.category.detail}
                </div>
              </div>
              <div className="rounded-md border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Screening note
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  BMI is a screening measure for adults 20 and older and should be considered with other health factors.
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 text-sm text-muted-foreground sm:pt-6">
          Adult BMI categories in this tool follow CDC thresholds: underweight below 18.5, healthy weight 18.5 to less than 25, overweight 25 to less than 30, and obesity 30 or greater.
        </CardContent>
      </Card>
    </div>
  );
}
