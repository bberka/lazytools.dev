'use client';

import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Check,
  Copy,
  Palette,
  Pipette,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { useCopyToClipboard } from '@/hooks';
import { TooltipSimple } from '@/components/ui/tooltip';

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type Hsl = {
  h: number;
  s: number;
  l: number;
};

type EyeDropperResult = {
  sRGBHex: string;
};

type EyeDropperConstructor = new () => {
  open: () => Promise<EyeDropperResult>;
};

declare global {
  interface Window {
    EyeDropper?: EyeDropperConstructor;
  }
}

const DEFAULT_COLOR: Rgb = { r: 59, g: 130, b: 246 };

const PRESETS = [
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#22C55E',
  '#14B8A6',
  '#3B82F6',
  '#6366F1',
  '#A855F7',
  '#EC4899',
  '#111827',
  '#64748B',
  '#FFFFFF',
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function componentToHex(value: number) {
  return clamp(value, 0, 255).toString(16).padStart(2, '0').toUpperCase();
}

function rgbToHex({ r, g, b }: Rgb) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function hexToRgb(value: string): Rgb | null {
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

function rgbToHsl({ r, g, b }: Rgb): Hsl {
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

function hslToRgb({ h, s, l }: Hsl): Rgb {
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

function mixColor(rgb: Rgb, target: 0 | 255, amount: number): Rgb {
  return {
    r: rgb.r + (target - rgb.r) * amount,
    g: rgb.g + (target - rgb.g) * amount,
    b: rgb.b + (target - rgb.b) * amount,
  };
}

function luminance({ r, g, b }: Rgb) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function getReadableTextColor(rgb: Rgb) {
  return luminance(rgb) > 0.62 ? '#111827' : '#FFFFFF';
}

function getReadableHsl(hsl: Hsl): Hsl {
  return luminance(hslToRgb(hsl)) > 0.62 ? { h: 0, s: 0, l: 5 } : { h: 0, s: 0, l: 98 };
}

type ThemeEntry = {
  variable: string;
  label: string;
  hsl: Hsl;
};

function generateTheme(primary: Hsl): ThemeEntry[] {
  const { h, s } = primary;
  const sBg = Math.round(Math.min(s * 0.08, 8));
  const secondary: Hsl = { h: (h + 180) % 360, s: Math.round(s * 0.5), l: 50 };
  const accent: Hsl = { h: (h + 30) % 360, s: Math.round(s * 0.75), l: 55 };

  return [
    { variable: '--background',           label: 'Background',          hsl: { h, s: sBg, l: 98 } },
    { variable: '--foreground',           label: 'Foreground',          hsl: { h, s: sBg, l: 5 } },
    { variable: '--primary',              label: 'Primary',             hsl: primary },
    { variable: '--primary-foreground',   label: 'Primary Foreground',  hsl: getReadableHsl(primary) },
    { variable: '--secondary',            label: 'Secondary',           hsl: secondary },
    { variable: '--secondary-foreground', label: 'Secondary Foreground', hsl: getReadableHsl(secondary) },
    { variable: '--muted',                label: 'Muted',               hsl: { h, s: Math.round(s * 0.12), l: 93 } },
    { variable: '--muted-foreground',     label: 'Muted Foreground',    hsl: { h, s: sBg, l: 45 } },
    { variable: '--accent',               label: 'Accent',              hsl: accent },
    { variable: '--accent-foreground',    label: 'Accent Foreground',   hsl: getReadableHsl(accent) },
    { variable: '--border',               label: 'Border',              hsl: { h, s: Math.round(s * 0.1), l: 88 } },
    { variable: '--destructive',          label: 'Destructive',         hsl: { h: 0, s: 72, l: 51 } },
  ];
}

function ColorValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const copy = useCopyToClipboard();

  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/30 px-3 py-3 transition-colors hover:border-border hover:bg-muted/50">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-mono text-sm text-foreground">{value}</p>
      </div>
      <TooltipSimple content={`Copy ${label}`}>
        <Button
          size="icon"
          variant={copy.isCopied ? 'default' : 'outline'}
          className="h-9 w-9 rounded-xl"
          onClick={() => copy.copyToClipboard(value)}
          aria-label={`Copy ${label}`}
        >
          {copy.isCopied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </TooltipSimple>
    </div>
  );
}

function useFeedback(duration = 2000) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => setVisible(false), duration);
    return () => window.clearTimeout(id);
  }, [visible, duration]);

  return [visible, () => setVisible(true)] as const;
}

export function ColorPicker() {
  const [rgb, setRgb] = useState<Rgb>(DEFAULT_COLOR);
  const [hexInput, setHexInput] = useState(rgbToHex(DEFAULT_COLOR));
  const [savedColors, setSavedColors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saveFeedbackVisible, triggerSaveFeedback] = useFeedback();
  const [pickFeedbackVisible, triggerPickFeedback] = useFeedback();
  const [resetFeedbackVisible, triggerResetFeedback] = useFeedback();
  const [eyeDropperSupported, setEyeDropperSupported] = useState(false);

  useEffect(() => {
    setEyeDropperSupported('EyeDropper' in window);
  }, []);

  const hex = rgbToHex(rgb);
  const hsl = useMemo(() => rgbToHsl(rgb), [rgb]);
  const textColor = getReadableTextColor(rgb);
  const theme = useMemo(() => generateTheme(hsl), [hsl]);

  const values = [
    { label: 'HEX', value: hex },
    { label: 'RGB', value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
    { label: 'HSL', value: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` },
    { label: 'CSS Var', value: `--color-picked: ${hex};` },
  ];

  const palette = useMemo(() => {
    const variants = [
      { label: 'Shade 40', rgb: mixColor(rgb, 0, 0.4) },
      { label: 'Shade 20', rgb: mixColor(rgb, 0, 0.2) },
      { label: 'Shade 10', rgb: mixColor(rgb, 0, 0.1) },
      { label: 'Base', rgb },
      { label: 'Tint 10', rgb: mixColor(rgb, 255, 0.1) },
      { label: 'Tint 20', rgb: mixColor(rgb, 255, 0.2) },
      { label: 'Tint 40', rgb: mixColor(rgb, 255, 0.4) },
    ];

    return variants.map((variant) => ({
      label: variant.label,
      hex: rgbToHex(variant.rgb),
    }));
  }, [rgb]);

  const setColor = (nextRgb: Rgb) => {
    const normalized = {
      r: clamp(nextRgb.r, 0, 255),
      g: clamp(nextRgb.g, 0, 255),
      b: clamp(nextRgb.b, 0, 255),
    };

    setRgb(normalized);
    setHexInput(rgbToHex(normalized));
    setError('');
  };

  const handleHexChange = (value: string) => {
    setHexInput(value.toUpperCase());
    const nextRgb = hexToRgb(value);

    if (!nextRgb) {
      setError('Enter a valid HEX color, such as #3B82F6 or #0AF.');
      return;
    }

    setRgb(nextRgb);
    setHexInput(rgbToHex(nextRgb));
    setError('');
  };

  const handleHslChange = (key: keyof Hsl, value: number) => {
    setColor(
      hslToRgb({
        ...hsl,
        [key]: key === 'h' ? clamp(value, 0, 360) : clamp(value, 0, 100),
      })
    );
  };

  const handleHslChangePair = (
    saturation: number,
    lightness: number,
    hue: number = hsl.h
  ) => {
    setColor(
      hslToRgb({
        h: clamp(hue, 0, 360),
        s: clamp(saturation, 0, 100),
        l: clamp(lightness, 0, 100),
      })
    );
  };

  const handleEyeDropper = async () => {
    if (!window.EyeDropper) {
      setError('This browser does not support the EyeDropper API.');
      return;
    }

    try {
      const result = await new window.EyeDropper().open();
      const nextRgb = hexToRgb(result.sRGBHex);
      if (nextRgb) {
        setColor(nextRgb);
        triggerPickFeedback();
      }
    } catch {
      setError('Color picking was canceled or blocked by the browser.');
    }
  };

  const saveCurrentColor = () => {
    setSavedColors((current) => {
      const next = [hex, ...current.filter((color) => color !== hex)];
      return next.slice(0, 12);
    });
    triggerSaveFeedback();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Color Picker
          </CardTitle>
          <CardDescription>
            Pick a color, tune channels, and copy production-ready values.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(290px,380px),1fr]">
          <div className="overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-sm">
            <div
              className="flex min-h-48 flex-col justify-end px-6 py-5"
              style={{ backgroundColor: hex, color: textColor }}
            >
              <p className="text-sm font-medium opacity-80">Selected color</p>
              <p className="mt-1 break-all font-mono text-3xl font-semibold tracking-tight sm:text-4xl">
                {hex}
              </p>
            </div>
          </div>

          <div className="space-y-5 lg:row-span-2">
            <div className="space-y-4 rounded-[28px] border border-border/70 bg-muted/[0.18] p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Picker
                  </p>
                  <p className="text-sm font-medium">Drag in the field to choose saturation and lightness.</p>
                </div>

              </div>

              <ColorField
                hue={hsl.h}
                saturation={hsl.s}
                lightness={hsl.l}
                onChange={(saturation, lightness) =>
                  handleHslChangePair(saturation, lightness, hsl.h)
                }
              />

              <HueSlider value={hsl.h} onChange={(value) => handleHslChange('h', value)} />

              <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background px-3">
                <span
                  className="h-10 w-10 shrink-0 rounded-xl border border-black/10 shadow-sm"
                  style={{ backgroundColor: hex }}
                />
                <Input
                  value={hexInput}
                  onChange={(event) => handleHexChange(event.currentTarget.value)}
                  placeholder="#3B82F6"
                  className="h-14 border-0 bg-transparent px-0 font-mono text-base uppercase shadow-none focus-visible:ring-0"
                  maxLength={7}
                />
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Quick Picks
                </p>
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-12">
                  {PRESETS.map((color) => (
                    <TooltipSimple key={`picker-${color}`} content={color}>
                      <button
                        type="button"
                        className="h-9 rounded-xl border border-border/70 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        style={{ backgroundColor: color }}
                        onClick={() => setColor(hexToRgb(color) ?? rgb)}
                        aria-label={`Use preset ${color}`}
                      />
                    </TooltipSimple>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-3">
              <TooltipSimple
                content={
                  eyeDropperSupported
                    ? 'Pick a color from the screen'
                    : 'EyeDropper is not supported in this browser'
                }
              >
                <Button
                  onClick={handleEyeDropper}
                  variant={pickFeedbackVisible ? 'default' : 'outline'}
                  className="h-12 w-full rounded-xl"
                  disabled={!eyeDropperSupported}
                  aria-label={
                    eyeDropperSupported
                      ? 'Pick a color from the screen'
                      : 'EyeDropper is not supported in this browser'
                  }
                >
                  {pickFeedbackVisible ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Pipette className="h-4 w-4" />
                  )}
                  {pickFeedbackVisible ? 'Picked' : 'Pick From Screen'}
                </Button>
              </TooltipSimple>
              <Button
                onClick={saveCurrentColor}
                variant={saveFeedbackVisible ? 'default' : 'outline'}
                className="h-12 w-full rounded-xl"
              >
                {saveFeedbackVisible ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {saveFeedbackVisible ? 'Saved' : 'Save Swatch'}
              </Button>
              <Button
                onClick={() => {
                  setColor(DEFAULT_COLOR);
                  triggerResetFeedback();
                }}
                variant={resetFeedbackVisible ? 'default' : 'outline'}
                className="h-12 w-full rounded-xl"
              >
                {resetFeedbackVisible ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                {resetFeedbackVisible ? 'Reset Done' : 'Reset'}
              </Button>
            </div>

          </div>

          <div className="space-y-3 rounded-[28px] border border-border/70 bg-muted/[0.18] p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">RGB Channels</p>
            <ChannelSlider
              label="Red"
              value={rgb.r}
              max={255}
              onChange={(value) => setColor({ ...rgb, r: value })}
            />
            <ChannelSlider
              label="Green"
              value={rgb.g}
              max={255}
              onChange={(value) => setColor({ ...rgb, g: value })}
            />
            <ChannelSlider
              label="Blue"
              value={rgb.b}
              max={255}
              onChange={(value) => setColor({ ...rgb, b: value })}
            />
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>Copy Values</CardTitle>
          <CardDescription>Use the selected color in code or design tools.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {values.map((item) => (
            <ColorValue key={item.label} label={item.label} value={item.value} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tints & Shades</CardTitle>
          <CardDescription>Click a generated swatch to use it.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {palette.map((item) => (
              <SwatchButton
                key={item.label}
                label={item.label}
                color={item.hex}
                onClick={() => setColor(hexToRgb(item.hex) ?? rgb)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {savedColors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Saved Swatches</CardTitle>
            <CardDescription>Keep a short list of colors you want to reuse.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">Saved colors</h3>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                onClick={() => setSavedColors([])}
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-12">
              {savedColors.map((color) => (
                <TooltipSimple key={color} content={color}>
                  <button
                    type="button"
                    className="group relative h-12 overflow-hidden rounded-2xl border border-border/70 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    style={{ backgroundColor: color }}
                    onClick={() => setColor(hexToRgb(color) ?? rgb)}
                    aria-label={`Use saved swatch ${color}`}
                  >
                    <span className="absolute inset-x-1.5 bottom-1.5 rounded-full bg-black/20 px-2 py-1 text-center font-mono text-[10px] text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                      {color}
                    </span>
                  </button>
                </TooltipSimple>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Theme Palette</CardTitle>
              <CardDescription>CSS variables for a full UI theme based on your primary color.</CardDescription>
            </div>
            <CopyThemeButton theme={theme} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {theme.map((entry) => {
              const entryHex = rgbToHex(hslToRgb(entry.hsl));
              return (
                <ThemeSwatchButton
                  key={entry.variable}
                  entry={entry}
                  hex={entryHex}
                  onClick={() => setColor(hexToRgb(entryHex) ?? rgb)}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CopyThemeButton({ theme }: { theme: ThemeEntry[] }) {
  const copy = useCopyToClipboard();

  const handleCopy = () => {
    const vars = theme
      .map((e) => `  ${e.variable}: ${e.hsl.h} ${e.hsl.s}% ${e.hsl.l}%;`)
      .join('\n');
    copy.copyToClipboard(`:root {\n${vars}\n}`);
  };

  return (
    <Button
      size="sm"
      variant={copy.isCopied ? 'default' : 'outline'}
      className="shrink-0 rounded-xl"
      onClick={handleCopy}
    >
      {copy.isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copy.isCopied ? 'Copied' : 'Copy CSS'}
    </Button>
  );
}

function ThemeSwatchButton({ entry, hex, onClick }: { entry: ThemeEntry; hex: string; onClick: () => void }) {
  const copy = useCopyToClipboard();
  const textColor = getReadableTextColor(hslToRgb(entry.hsl));

  return (
    <div className="overflow-hidden rounded-[22px] border border-border/70 bg-card shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <TooltipSimple content={`Use ${entry.label}`}>
        <button
          type="button"
          className="flex h-16 w-full flex-col justify-end px-3 py-2"
          style={{ backgroundColor: hex, color: textColor }}
          onClick={onClick}
          aria-label={`Use ${entry.label}`}
        >
          <span className="truncate font-mono text-[10px] font-medium opacity-70">{entry.variable}</span>
        </button>
      </TooltipSimple>
      <div className="flex items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {entry.label}
          </p>
          <p className="truncate font-mono text-sm text-foreground">{hex}</p>
        </div>
        <TooltipSimple content={`Copy ${entry.variable}`}>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-xl"
            onClick={() => copy.copyToClipboard(`${entry.variable}: ${entry.hsl.h} ${entry.hsl.s}% ${entry.hsl.l}%;`)}
            aria-label={`Copy ${entry.variable}`}
          >
            {copy.isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </TooltipSimple>
      </div>
    </div>
  );
}

function ChannelSlider({
  label,
  value,
  max,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-[22px] border border-border/60 bg-muted/[0.18] px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm font-medium">{label}</label>
        <span className="font-mono text-sm text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Slider value={value} min={0} max={max} onChange={onChange} />
    </div>
  );
}

function SwatchButton({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  const copy = useCopyToClipboard();

  return (
    <div className="overflow-hidden rounded-[22px] border border-border/70 bg-card shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <TooltipSimple content={`Use ${color}`}>
        <button
          type="button"
          className="h-20 w-full"
          style={{ backgroundColor: color }}
          onClick={onClick}
          aria-label={`Use ${label} ${color}`}
        />
      </TooltipSimple>
      <div className="flex items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="truncate font-mono text-sm text-foreground">
            {color}
          </p>
        </div>
        <TooltipSimple content={`Copy ${color}`}>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-xl"
            onClick={() => copy.copyToClipboard(color)}
            aria-label={`Copy ${color}`}
          >
            {copy.isCopied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipSimple>
      </div>
    </div>
  );
}


function ColorField({
  hue,
  saturation,
  lightness,
  onChange,
}: {
  hue: number;
  saturation: number;
  lightness: number;
  onChange: (saturation: number, lightness: number) => void;
}) {
  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);

    onChange(x, 100 - y);
  };

  return (
    <div
      className="relative h-64 cursor-crosshair overflow-hidden rounded-[24px] border border-border/70 touch-none"
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
        className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,0.45)]"
        style={{
          left: `${saturation}%`,
          top: `${100 - lightness}%`,
          backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
        }}
      />
    </div>
  );
}

function HueSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm font-medium">Hue</label>
        <span className="font-mono text-sm text-muted-foreground">{value}deg</span>
      </div>
      <div className="relative h-4 overflow-hidden rounded-full">
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
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white bg-transparent shadow-[0_0_0_1px_rgba(15,23,42,0.45)]"
          style={{ left: `${(value / 360) * 100}%` }}
        />
      </div>
    </div>
  );
}
