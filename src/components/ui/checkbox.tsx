'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CheckboxProps = Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  'checked' | 'onCheckedChange' | 'onChange'
> & {
  label?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  onCheckedChange?: (checked: boolean) => void;
};

const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ className, label, checked, onChange, onCheckedChange, id, disabled, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    const handleCheckedChange = (value: boolean | 'indeterminate') => {
      const isChecked = value === true;
      onChange?.(isChecked);
      onCheckedChange?.(isChecked);
    };

    return (
      <label
        htmlFor={inputId}
        className={cn(
          'flex items-start gap-3 text-sm select-none',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        )}
      >
        <CheckboxPrimitive.Root
          ref={ref}
          id={inputId}
          disabled={disabled}
          checked={checked}
          onCheckedChange={handleCheckedChange}
          className={cn(
            'mt-0.5 peer h-4 w-4 shrink-0 rounded border border-input bg-background shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary transition-all duration-200',
            className
          )}
          {...props}
        >
          <CheckboxPrimitive.Indicator
            className={cn('flex items-center justify-center text-current')}
          >
            <Check className="h-3 w-3 stroke-[3.5]" />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
        {label ? (
          <span className="font-normal text-foreground leading-none mt-0.5">{label}</span>
        ) : null}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };
