'use client';

import * as React from 'react';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Input } from './input';
import { cn } from '@/lib/utils';

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function componentToHex(value: number) {
  return clamp(value, 0, 255).toString(16).padStart(2, '0').toUpperCase();
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function hexToRgb(value: string): { r: number; g: number; b: number } | null {
  const trimmed = value.trim();
  const shorthand = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(trimmed);
  if (shorthand) {
    return {
      r: parseInt(`${shorthand[1]}${shorthand[1]}`, 16),
      g: parseInt(`${shorthand[2]}${shorthand[2]}`, 16),
      b: parseInt(`${shorthand[3]}${shorthand[3]}`, 16),
    };
  }

  const full = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(trimmed);
  if (!full) return null;

  return {
    r: parseInt(full[1], 16),
    g: parseInt(full[2], 16),
    b: parseInt(full[3], 16),
  };
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(lightness * 100) };
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;

  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return {
    h: Math.round(hue * 60),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }) {
  const hue = h / 360;
  const saturation = s / 100;
  const lightness = l / 100;

  if (saturation === 0) {
    const value = lightness * 255;
    return { r: value, g: value, b: value };
  }

  const hueToRgb = (p: number, q: number, t: number) => {
    let normalized = t;
    if (normalized < 0) normalized += 1;
    if (normalized > 1) normalized -= 1;
    if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
    if (normalized < 1 / 2) return q;
    if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
    return p;
  };

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return {
    r: hueToRgb(p, q, hue + 1 / 3) * 255,
    g: hueToRgb(p, q, hue) * 255,
    b: hueToRgb(p, q, hue - 1 / 3) * 255,
  };
}

interface ColorFieldProps {
  hue: number;
  saturation: number;
  lightness: number;
  onChange: (saturation: number, lightness: number) => void;
}

function ColorField({
  hue,
  saturation,
  lightness,
  onChange,
}: ColorFieldProps) {
  const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);

    onChange(x, 100 - y);
  };

  return (
    <div
      className="relative h-32 cursor-crosshair overflow-hidden rounded-xl border border-border/70 touch-none"
      style={{
        backgroundColor: `hsl(${hue} 100% 50%)`,
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
          left: `${saturation}%`,
          top: `${100 - lightness}%`,
          backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
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

const DEFAULT_HSL = { h: 217, s: 91, l: 60 };

export function ColorPicker({
  value,
  onChange,
  className,
  showText = true,
  disabled = false,
}: ColorPickerProps) {
  const [inputValue, setInputValue] = React.useState(value);
  const [rgbInputValue, setRgbInputValue] = React.useState('');

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInputValue(value);

    const rgb = hexToRgb(value);
    if (rgb) {
      setRgbInputValue(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
    } else if (value === 'none') {
      setRgbInputValue('none');
    }
  }, [value]);

  const parsed = React.useMemo(() => {
    if (value === 'none' || !value) return null;
    const rgb = hexToRgb(value);
    if (!rgb) return null;
    return rgbToHsl(rgb);
  }, [value]);

  const [hsl, setHsl] = React.useState(DEFAULT_HSL);

  React.useEffect(() => {
    if (parsed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHsl((currentHsl) => {
        const currentHex = rgbToHex(hslToRgb(currentHsl));
        const incomingHex = rgbToHex(hslToRgb(parsed));
        if (currentHex.toLowerCase() !== incomingHex.toLowerCase()) {
          return parsed;
        }
        return currentHsl;
      });
    }
  }, [parsed]);

  const updateHsl = (newHsl: { h: number; s: number; l: number }) => {
    setHsl(newHsl);
    const hexValue = rgbToHex(hslToRgb(newHsl));
    onChange(hexValue);
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
        {/* Custom SAT/VAL picker field (smaller version) */}
        <ColorField
          hue={hsl.h}
          saturation={hsl.s}
          lightness={hsl.l}
          onChange={(s, l) => updateHsl({ h: hsl.h, s, l })}
        />

        {/* Hue Slider */}
        <HueSlider
          value={hsl.h}
          onChange={(h) => updateHsl({ h, s: hsl.s, l: hsl.l })}
        />

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
