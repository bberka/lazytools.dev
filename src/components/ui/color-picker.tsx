'use client';

import * as React from 'react';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Input } from './input';
import { cn } from '@/lib/utils';
import { Paintbrush } from 'lucide-react';

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  showText?: boolean;
  disabled?: boolean;
}

const PRESET_COLORS = [
  '#000000', // Black
  '#ffffff', // White
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#eab308', // Yellow
  '#22c55e', // Green
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#6b7280', // Gray
  '#4b5563', // Dark Gray
];

export function ColorPicker({
  value,
  onChange,
  className,
  showText = true,
  disabled = false,
}: ColorPickerProps) {
  const [inputValue, setInputValue] = React.useState(value);

  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (/^#?[0-9A-Fa-f]{6}$/.test(val)) {
      onChange(val.startsWith('#') ? val : `#${val}`);
    } else if (val.toLowerCase() === 'none') {
      onChange('none');
    }
  };

  const handlePresetClick = (color: string) => {
    onChange(color);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        {showText ? (
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal h-10 px-3',
              disabled && 'opacity-50 pointer-events-none',
              className
            )}
            disabled={disabled}
          >
            <div className="flex w-full items-center gap-2">
              <div
                className="h-5 w-5 rounded border border-border shadow-sm shrink-0"
                style={{ backgroundColor: value === 'none' ? 'transparent' : value }}
              />
              <span className="truncate font-mono text-sm">{value || 'Select color'}</span>
            </div>
          </Button>
        ) : (
          <button
            className={cn(
              'h-10 w-10 rounded-md border border-border shadow-sm shrink-0 cursor-pointer hover:opacity-90 transition-opacity',
              disabled && 'opacity-50 pointer-events-none',
              className
            )}
            style={{ backgroundColor: value === 'none' ? 'transparent' : value }}
            disabled={disabled}
            title={value}
          />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-3" align="start">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Preset Swatches</label>
          <div className="grid grid-cols-8 gap-1.5">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                className={cn(
                  'h-6 w-6 rounded border border-border hover:scale-110 transition-transform cursor-pointer',
                  value.toLowerCase() === color.toLowerCase() && 'ring-2 ring-ring ring-offset-1'
                )}
                style={{ backgroundColor: color }}
                onClick={() => handlePresetClick(color)}
                title={color}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-border/60 my-2" />

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              type="text"
              value={inputValue}
              onChange={handleHexChange}
              className="h-8 text-xs font-mono pl-2 uppercase"
              placeholder="#FFFFFF"
            />
          </div>
          <div className="relative h-8 w-8 shrink-0 rounded border border-border overflow-hidden cursor-pointer hover:opacity-90 active:scale-95 transition-all">
            <input
              type="color"
              value={value === 'none' ? '#ffffff' : value}
              onChange={(e) => onChange(e.target.value)}
              className="absolute -inset-1 h-10 w-10 cursor-pointer border-none bg-transparent"
              title="Custom Color Picker"
            />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/5 dark:bg-white/5">
              <Paintbrush className="h-3.5 w-3.5 opacity-60" />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
