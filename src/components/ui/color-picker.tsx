'use client';

import * as React from 'react';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Input } from './input';
import { cn } from '@/lib/utils';
import { fieldPositionOf, hsvAtFieldPoint } from '@/lib/tools/color-field';
import { pickerPosition } from '@/lib/tools/color-picker';
import { hsvToRgb, parseHexColor, rgbToHex, rgbToHsv, type Hsv } from '@/lib/tools/design-color';

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  showText?: boolean;
  disabled?: boolean;
  /** What the colour is for ("Foreground"). The trigger is named "<label>: <colour>". */
  label?: string;
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

interface ColorFieldProps {
  hsv: Hsv;
  onChange: (saturation: number, value: number) => void;
}

/**
 * The saturation/brightness square: the pure hue washed to white on the left
 * and to black at the bottom. Positions are HSV, which is what is painted.
 */
function ColorField({ hsv, onChange }: ColorFieldProps) {
  const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const { s, v } = hsvAtFieldPoint(
      hsv.h,
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height
    );

    onChange(s, v);
  };

  const marker = fieldPositionOf(hsv);
  const { r, g, b } = hsvToRgb(hsv);

  return (
    <div
      className="relative h-32 cursor-crosshair overflow-hidden rounded-xl border border-border/70 touch-none"
      style={{
        backgroundColor: `hsl(${hsv.h} 100% 50%)`,
        backgroundImage:
          'linear-gradient(to top, hsl(0 0% 0% / 1), hsl(0 0% 0% / 0)), linear-gradient(to right, hsl(0 0% 100% / 1), hsl(0 0% 100% / 0))',
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons !== 1) return;
        updateFromPointer(event);
      }}
    >
      <div
        className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,0.45)]"
        style={{
          left: `${marker.left}%`,
          top: `${marker.top}%`,
          backgroundColor: `rgb(${r} ${g} ${b})`,
        }}
      />
    </div>
  );
}

interface HueSliderProps {
  value: number;
  onChange: (value: number) => void;
}

function HueSlider({ value, onChange }: HueSliderProps) {
  return (
    <div className="relative h-3 overflow-hidden rounded-full">
      <div className="absolute inset-0 rounded-full bg-[linear-gradient(90deg,#ff0000_0%,#ffff00_17%,#00ff00_33%,#00ffff_50%,#0000ff_67%,#ff00ff_83%,#ff0000_100%)]" />
      <input
        type="range"
        min={0}
        max={360}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
        aria-label="Hue"
      />
      <div
        className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white bg-transparent shadow-[0_0_0_1px_rgba(15,23,42,0.45)]"
        style={{ left: `${(value / 360) * 100}%` }}
      />
    </div>
  );
}

// Where the handle starts when the value is not a colour ("none"): the blue the picker used to open on.
const DEFAULT_HSV: Hsv = rgbToHsv({ r: 59, g: 130, b: 246 });

export function ColorPicker({
  value,
  onChange,
  className,
  showText = true,
  disabled = false,
  label,
}: ColorPickerProps) {
  const [inputValue, setInputValue] = React.useState(value);
  const [rgbInputValue, setRgbInputValue] = React.useState('');

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInputValue(value);

    const rgb = parseHexColor(value);
    if (rgb) {
      setRgbInputValue(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
    } else if (value === 'none') {
      setRgbInputValue('none');
    }
  }, [value]);

  // Where the handle was last put by hand. Black, white and the greys have no hue
  // of their own, so while it still describes the value it keeps the hue steady.
  const [dragged, setDragged] = React.useState<Hsv | null>(null);

  const hsv = React.useMemo(() => {
    const rgb = value === 'none' || !value ? null : parseHexColor(value);
    return rgb ? pickerPosition(rgb, dragged) : (dragged ?? DEFAULT_HSV);
  }, [value, dragged]);

  const updateHsv = (next: Hsv) => {
    setDragged(next);
    onChange(rgbToHex(hsvToRgb(next)));
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (/^#?[0-9A-Fa-f]{6}$/.test(val)) {
      onChange(val.startsWith('#') ? val : `#${val}`);
    } else if (val.toLowerCase() === 'none') {
      onChange('none');
    }
  };

  const handleRgbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRgbInputValue(val);

    const clean = val.replace(/rgb\(/i, '').replace(/\)/, '');
    const parts = clean.split(/[\s,]+/);
    if (parts.length >= 3) {
      const r = parseInt(parts[0], 10);
      const g = parseInt(parts[1], 10);
      const b = parseInt(parts[2], 10);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b) && r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
        onChange(rgbToHex({ r, g, b }));
      }
    } else if (val.toLowerCase() === 'none') {
      onChange('none');
    }
  };

  const handlePresetClick = (color: string) => {
    onChange(color);
  };

  const triggerName = label ? `${label}: ${value || 'none'}` : undefined;

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
            aria-label={triggerName}
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
            aria-label={triggerName}
          />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-3" align="start">
        {/* Custom SAT/VAL picker field (smaller version) */}
        <ColorField hsv={hsv} onChange={(s, v) => updateHsv({ h: hsv.h, s, v })} />

        {/* Hue Slider */}
        <HueSlider value={hsv.h} onChange={(h) => updateHsv({ h, s: hsv.s, v: hsv.v })} />

        <div className="border-t border-border/60 my-2" />

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

        <div className="grid grid-cols-[2fr_3fr] gap-2">
          <div className="space-y-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">HEX</span>
            <Input
              type="text"
              value={inputValue}
              onChange={handleHexChange}
              className="h-8 text-xs font-mono px-2 uppercase"
              placeholder="#FFFFFF"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">RGB</span>
            <Input
              type="text"
              value={rgbInputValue}
              onChange={handleRgbChange}
              className="h-8 text-xs font-mono px-2"
              placeholder="255, 255, 255"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
