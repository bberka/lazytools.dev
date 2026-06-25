'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils/cn';

export interface SliderProps {
  className?: string;
  value?: number | number[];
  defaultValue?: number | number[];
  onChange?: (value: number) => void;
  onValueChange?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, value, defaultValue, onChange, onValueChange, min = 0, max = 100, step = 1, disabled, ...props }, ref) => {
  const radixValue = React.useMemo(() => {
    if (value === undefined) return undefined;
    return Array.isArray(value) ? value : [value];
  }, [value]);

  const radixDefaultValue = React.useMemo(() => {
    if (defaultValue === undefined) return undefined;
    return Array.isArray(defaultValue) ? defaultValue : [defaultValue];
  }, [defaultValue]);

  const handleValueChange = (val: number[]) => {
    onValueChange?.(val);
    if (onChange && val.length > 0) {
      onChange(val[0]);
    }
  };

  const thumbsCount = Array.isArray(value)
    ? value.length
    : Array.isArray(defaultValue)
    ? defaultValue.length
    : 1;

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        'relative flex w-full touch-none select-none items-center py-2.5',
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
      value={radixValue}
      defaultValue={radixDefaultValue}
      onValueChange={handleValueChange}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbsCount }).map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className="block h-4 w-4 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing hover:scale-105 active:scale-95 transition-transform"
        />
      ))}
    </SliderPrimitive.Root>
  );
});

Slider.displayName = 'Slider';

export { Slider };
