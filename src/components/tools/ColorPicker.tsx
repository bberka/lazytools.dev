'use client';

import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
import {
  colorValues,
  generateTheme,
  pickerPosition,
  readableTextColor,
  themeCss,
  themeDeclaration,
  tintsAndShades,
  type ThemeEntry,
} from '@/lib/tools/color-picker';
import { hsvToRgb, parseHexColor, rgbToHex, type Hsv, type Rgb } from '@/lib/tools/design-color';

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

// The EyeDropper API never appears or disappears while the page is open.
const subscribeToNothing = () => () => {};
const hasEyeDropper = () => 'EyeDropper' in window;
const noEyeDropper = () => false;

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
  // Counts triggers, so a second one while the feedback is still showing
  // restarts the timer instead of being cut short by the first.
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    if (trigger === 0) return;
    const id = window.setTimeout(() => setTrigger(0), duration);
    return () => window.clearTimeout(id);
  }, [trigger, duration]);

  return [trigger !== 0, () => setTrigger((count) => count + 1)] as const;
}

export function ColorPicker() {
  const [rgb, setRgb] = useState<Rgb>(DEFAULT_COLOR);
  const [hexInput, setHexInput] = useState(rgbToHex(DEFAULT_COLOR));
  // Where the picker handle was last put by hand; see pickerPosition.
  const [dragged, setDragged] = useState<Hsv | null>(null);
  const [savedColors, setSavedColors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saveFeedbackVisible, triggerSaveFeedback] = useFeedback();
  const [pickFeedbackVisible, triggerPickFeedback] = useFeedback();
  const [resetFeedbackVisible, triggerResetFeedback] = useFeedback();
  const eyeDropperSupported = useSyncExternalStore(subscribeToNothing, hasEyeDropper, noEyeDropper);

  const hex = rgbToHex(rgb);
  const picker = useMemo(() => pickerPosition(rgb, dragged), [rgb, dragged]);
  const textColor = readableTextColor(rgb);
  const theme = useMemo(() => generateTheme(rgb), [rgb]);
  const values = useMemo(() => colorValues(rgb), [rgb]);
  const palette = useMemo(() => tintsAndShades(rgb), [rgb]);

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

  const movePicker = (next: Hsv) => {
    setDragged(next);
    setColor(hsvToRgb(next));
  };

  const handleHexChange = (value: string) => {
    setHexInput(value.toUpperCase());
    const nextRgb = parseHexColor(value);

    if (!nextRgb) {
      setError('Enter a valid HEX color, such as #3B82F6 or #0AF.');
      return;
    }

    // The text stays as typed. Expanding "#3B8" to "#33BB88" on the spot
    // filled the field, so a six-digit colour could not be typed past it.
    setRgb(nextRgb);
    setError('');
  };

  const handleHexBlur = () => {
    if (parseHexColor(hexInput)) setHexInput(hex);
  };

  const handleEyeDropper = async () => {
    if (!window.EyeDropper) {
      setError('This browser does not support the EyeDropper API.');
      return;
    }

    try {
      const result = await new window.EyeDropper().open();
      const nextRgb = parseHexColor(result.sRGBHex);
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
                  <p className="text-sm font-medium">Drag in the field to choose saturation and brightness.</p>
                </div>

              </div>

              <ColorField
                hue={picker.h}
                saturation={picker.s}
                brightness={picker.v}
                color={hex}
                onChange={(saturation, brightness) =>
                  movePicker({ h: picker.h, s: saturation, v: brightness })
                }
              />

              <HueSlider value={picker.h} onChange={(hue) => movePicker({ ...picker, h: hue })} />

              <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background px-3">
                <span
                  className="h-10 w-10 shrink-0 rounded-xl border border-black/10 shadow-sm"
                  style={{ backgroundColor: hex }}
                />
                <Input
                  value={hexInput}
                  onChange={(event) => handleHexChange(event.currentTarget.value)}
                  onBlur={handleHexBlur}
                  placeholder="#3B82F6"
                  className="h-14 border-0 bg-transparent px-0 font-mono text-base uppercase shadow-none focus-visible:ring-0"
                  maxLength={7}
                  aria-label="HEX color"
                  aria-invalid={parseHexColor(hexInput) === null}
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
                        onClick={() => setColor(parseHexColor(color) ?? rgb)}
                        aria-label={`Use preset ${color}`}
                      />
                    </TooltipSimple>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div
                role="status"
                className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
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
                onClick={() => setColor(parseHexColor(item.hex) ?? rgb)}
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
                    onClick={() => setColor(parseHexColor(color) ?? rgb)}
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
            {theme.map((entry) => (
              <ThemeSwatchButton
                key={entry.variable}
                entry={entry}
                onClick={() => setColor(parseHexColor(entry.hex) ?? rgb)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CopyThemeButton({ theme }: { theme: ThemeEntry[] }) {
  const copy = useCopyToClipboard();

  return (
    <Button
      size="sm"
      variant={copy.isCopied ? 'default' : 'outline'}
      className="shrink-0 rounded-xl"
      onClick={() => copy.copyToClipboard(themeCss(theme))}
    >
      {copy.isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copy.isCopied ? 'Copied' : 'Copy CSS'}
    </Button>
  );
}

function ThemeSwatchButton({ entry, onClick }: { entry: ThemeEntry; onClick: () => void }) {
  const copy = useCopyToClipboard();
  const { hex, textColor } = entry;

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
            onClick={() => copy.copyToClipboard(themeDeclaration(entry))}
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

// The field is the classic saturation/brightness square: the hue washed out to
// white on the left and darkened to black at the bottom. Positions are HSV, so
// the colour under the pointer is the colour that gets picked.
function ColorField({
  hue,
  saturation,
  brightness,
  color,
  onChange,
}: {
  hue: number;
  saturation: number;
  brightness: number;
  color: string;
  onChange: (saturation: number, brightness: number) => void;
}) {
  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);

    onChange(x, 100 - y);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    let nextSaturation = saturation;
    let nextBrightness = brightness;

    switch (event.key) {
      case 'ArrowLeft':
        nextSaturation -= step;
        break;
      case 'ArrowRight':
        nextSaturation += step;
        break;
      case 'ArrowUp':
        nextBrightness += step;
        break;
      case 'ArrowDown':
        nextBrightness -= step;
        break;
      default:
        return;
    }

    event.preventDefault();
    onChange(clamp(nextSaturation, 0, 100), clamp(nextBrightness, 0, 100));
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Saturation and brightness"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={saturation}
      aria-valuetext={`Saturation ${saturation}%, brightness ${brightness}%`}
      className="relative h-64 cursor-crosshair overflow-hidden rounded-[24px] border border-border/70 touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,0.45)]"
        style={{
          left: `${saturation}%`,
          top: `${100 - brightness}%`,
          backgroundColor: color,
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
  const labelId = useId();

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onChange(clamp(((event.clientX - rect.left) / rect.width) * 360, 0, 360));
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    let next: number;

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + step;
        break;
      case 'PageDown':
        next = value - 30;
        break;
      case 'PageUp':
        next = value + 30;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = 360;
        break;
      default:
        return;
    }

    event.preventDefault();
    onChange(clamp(next, 0, 360));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <span id={labelId} className="text-sm font-medium">Hue</span>
        <span className="font-mono text-sm text-muted-foreground">{value}deg</span>
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={value}
        aria-valuetext={`${value} degrees`}
        className="relative h-4 cursor-pointer touch-none overflow-hidden rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          updateFromPointer(event);
        }}
        onKeyDown={handleKeyDown}
      >
        <div className="absolute inset-0 rounded-full bg-[linear-gradient(90deg,#ff0000_0%,#ffff00_17%,#00ff00_33%,#00ffff_50%,#0000ff_67%,#ff00ff_83%,#ff0000_100%)]" />
        <div
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white bg-transparent shadow-[0_0_0_1px_rgba(15,23,42,0.45)]"
          style={{ left: `${(value / 360) * 100}%` }}
        />
      </div>
    </div>
  );
}
