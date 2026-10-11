'use client';

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { IMaskInput } from 'react-imask';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value: string; // YYYY-MM-DD format
  onChange: (value: string) => void;
  disabled?: (date: Date) => boolean;
  placeholder?: string;
  className?: string;
  error?: boolean;
  /** Id of the text field, so an outside <label htmlFor> can name it. */
  id?: string;
  /** Accessible name of the text field. */
  'aria-label'?: string;
  /** Id of the element that names the text field. */
  'aria-labelledby'?: string;
}

export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = 'YYYY-MM-DD',
  className,
  error,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  // The month on show. It is reset each time the calendar opens and is then free to be paged.
  const [month, setMonth] = React.useState<Date>(() => new Date());

  // Parse YYYY-MM-DD to a local Date object for the Calendar component
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined;
    const parts = value.split('-');
    if (parts.length !== 3) return undefined;
    const [y, m, d] = parts.map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return undefined;

    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
      return undefined;
    }
    return date;
  }, [value]);

  const handleOpenChange = (next: boolean) => {
    if (next) setMonth(selectedDate ?? new Date());
    setOpen(next);
  };

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
    setOpen(false);
  };

  return (
    <div className={cn('relative flex items-center w-full', className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open calendar"
            className="absolute left-1.5 h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            month={month}
            onMonthChange={setMonth}
            onSelect={handleSelect}
            disabled={disabled}
            className='w-72'
          />
        </PopoverContent>
      </Popover>
      <IMaskInput
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        mask="0000-00-00"
        value={value}
        onAccept={(val) => onChange(val)}
        placeholder={placeholder}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent py-1 pl-10 pr-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm font-mono',
          error && 'border-destructive focus-visible:ring-destructive'
        )}
      />
    </div>
  );
}
