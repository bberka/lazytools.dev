'use client';

import { useId, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Copy,
  Info,
  Plus,
  Rainbow,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ColorPicker } from '@/components/ui/color-picker';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipSimple } from '@/components/ui/tooltip';
import { useCopyToClipboard, type UseCopyToClipboardReturn } from '@/hooks';
import {
  GRADIENT_PRESETS,
  MAX_STOPS,
  MIN_STOPS,
  addStop,
  buildCssDeclaration,
  buildGradientValue,
  buildTailwindClass,
  clampAngle,
  clampPercent,
  createDefaultModel,
  formatNumber,
  moveStop,
  randomGradient,
  removeStop,
  repeatsVisibly,
  sortStopsByPosition,
  updateStop,
  type ColorStop,
  type GradientModel,
  type GradientPreset,
  type GradientType,
  type RadialShape,
} from '@/lib/tools/css-gradient-generator';

const PRESET_SWATCHES = GRADIENT_PRESETS.map((preset) => ({
  preset,
  value: buildGradientValue(preset.model),
}));

const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground';

interface SliderFieldProps {
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function SliderField({ label, valueLabel, value, min, max, onChange }: SliderFieldProps) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className={SECTION_LABEL}>
          {label}
        </span>
        <span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs text-foreground">
          {valueLabel}
        </span>
      </div>
      <Slider value={value} min={min} max={max} onChange={onChange} />
    </div>
  );
}

interface PercentInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

// A number box that lets the user clear it and retype. It keeps what they are
// typing until they leave the field, and applies every valid number as they go.
function PercentInput({ label, value, onChange }: PercentInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const showDraft = draft !== null && (draft === '' || clampPercent(Number(draft)) === value);

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step={1}
        aria-label={label}
        className="h-9 w-20"
        value={showDraft ? draft : formatNumber(value)}
        onChange={(event) => {
          setDraft(event.target.value);
          if (Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber);
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="text-sm text-muted-foreground" aria-hidden="true">
        %
      </span>
    </div>
  );
}

interface StopRowProps {
  stop: ColorStop;
  index: number;
  count: number;
  onColor: (color: string) => void;
  onPosition: (position: number) => void;
  onMove: (direction: 'up' | 'down') => void;
  onRemove: () => void;
}

function StopRow({ stop, index, count, onColor, onPosition, onMove, onRemove }: StopRowProps) {
  const name = `Stop ${index + 1}`;
  return (
    <li className="space-y-1 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 text-xs font-semibold text-muted-foreground">{name}</span>
        <div
          role="group"
          aria-label={`${name} colour`}
          className="min-w-0 flex-1 basis-32 sm:w-36 sm:flex-none"
        >
          <ColorPicker value={stop.color} onChange={onColor} className="h-9" />
        </div>
        <PercentInput label={`${name} position in percent`} value={stop.position} onChange={onPosition} />
        <div className="ml-auto flex items-center gap-0.5">
          <TooltipSimple content="Move up">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={index === 0}
              onClick={() => onMove('up')}
              aria-label={`Move ${name} up`}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </TooltipSimple>
          <TooltipSimple content="Move down">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={index === count - 1}
              onClick={() => onMove('down')}
              aria-label={`Move ${name} down`}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </TooltipSimple>
          <TooltipSimple content="Remove stop">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              disabled={count <= MIN_STOPS}
              onClick={onRemove}
              aria-label={`Remove ${name}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipSimple>
        </div>
      </div>
      <Slider value={stop.position} min={0} max={100} step={1} onChange={onPosition} />
    </li>
  );
}

interface OutputBlockProps {
  label: string;
  text: string;
  copy: UseCopyToClipboardReturn;
}

function OutputBlock({ label, text, copy }: OutputBlockProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={SECTION_LABEL}>{label}</span>
        <Button
          size="sm"
          variant={copy.isCopied ? 'default' : 'outline'}
          onClick={() => copy.copyToClipboard(text)}
          aria-label={`Copy ${label}`}
        >
          {copy.isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copy.isCopied ? 'Copied' : copy.isError ? 'Copy failed' : 'Copy'}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap break-all rounded-lg border border-border bg-muted p-3 font-mono text-xs text-foreground">
        {text}
      </pre>
    </div>
  );
}

export function CssGradientGenerator() {
  const [model, setModel] = useState<GradientModel>(createDefaultModel);
  const cssCopy = useCopyToClipboard();
  const tailwindCopy = useCopyToClipboard();
  const repeatId = useId();
  const shapeId = useId();

  const patch = (changes: Partial<GradientModel>) => setModel((current) => ({ ...current, ...changes }));
  const patchStops = (edit: (stops: ColorStop[]) => ColorStop[]) =>
    setModel((current) => ({ ...current, stops: edit(current.stops) }));

  const value = buildGradientValue(model);
  const cssText = buildCssDeclaration(model);
  const tailwindText = buildTailwindClass(model);

  const usesAngle = model.type !== 'radial';
  const usesPosition = model.type !== 'linear';
  const stopsInOrder = model.stops.every(
    (stop, index) => index === 0 || model.stops[index - 1].position <= stop.position,
  );
  const repeatNotice = model.repeating && !repeatsVisibly(model);

  const applyPreset = (preset: GradientPreset) => setModel(preset.model);

  const copyStatus = cssCopy.isError || tailwindCopy.isError
    ? 'Copy failed. Select the text and copy it by hand.'
    : cssCopy.isCopied
      ? 'CSS copied to the clipboard.'
      : tailwindCopy.isCopied
        ? 'Tailwind class copied to the clipboard.'
        : '';

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-start">
      {/* Preview */}
      <Card className="lg:col-start-2 lg:row-start-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rainbow className="h-5 w-5 text-primary" />
            Preview
          </CardTitle>
          <CardDescription>The gradient updates as you change any control.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="img"
            aria-label="Gradient preview"
            className="h-48 w-full rounded-lg border border-border sm:h-64 lg:h-72"
            style={{ backgroundImage: value }}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setModel(randomGradient(model))}>
              <Shuffle className="h-4 w-4" />
              Randomise
            </Button>
            <Button variant="outline" onClick={() => setModel(createDefaultModel())}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>
          <div className="space-y-2">
            <span className={`${SECTION_LABEL} flex items-center gap-1.5`}>
              <Sparkles className="h-3.5 w-3.5" />
              Presets
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {PRESET_SWATCHES.map(({ preset, value: swatch }) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="outline"
                  className="h-auto flex-col items-stretch gap-1.5 p-2 font-normal"
                  onClick={() => applyPreset(preset)}
                  aria-label={`Apply the ${preset.name} preset`}
                >
                  <span
                    className="block h-10 w-full rounded-md border border-border"
                    style={{ backgroundImage: swatch }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-left text-xs font-medium">{preset.name}</span>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Controls and stops */}
      <div className="space-y-4 sm:space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              Gradient
            </CardTitle>
            <CardDescription>Pick a type, then set its direction and shape.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={model.type} onValueChange={(next) => patch({ type: next as GradientType })}>
              <TabsList aria-label="Gradient type" className="grid h-auto w-full grid-cols-3">
                <TabsTrigger value="linear">Linear</TabsTrigger>
                <TabsTrigger value="radial">Radial</TabsTrigger>
                <TabsTrigger value="conic">Conic</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <label htmlFor={repeatId} className="text-sm font-medium">
                  Repeating
                </label>
                <p className="text-xs text-muted-foreground">Tile the stops across the box.</p>
              </div>
              <Switch
                id={repeatId}
                checked={model.repeating}
                onCheckedChange={(checked) => patch({ repeating: checked })}
              />
            </div>

            {repeatNotice && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
              >
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  The stops already run from 0% to 100%, so nothing repeats yet. Move the last stop
                  to a smaller value, such as 20%, to see the pattern tile.
                </span>
              </div>
            )}

            {usesAngle && (
              <SliderField
                label={model.type === 'conic' ? 'Start angle' : 'Angle'}
                valueLabel={`${formatNumber(clampAngle(model.angle))}°`}
                value={model.angle}
                min={0}
                max={360}
                onChange={(angle) => patch({ angle })}
              />
            )}

            {model.type === 'radial' && (
              <div className="space-y-1.5">
                <label htmlFor={shapeId} className={SECTION_LABEL}>
                  Shape
                </label>
                <Select value={model.shape} onValueChange={(next) => patch({ shape: next as RadialShape })}>
                  <SelectTrigger id={shapeId} className="h-9">
                    <SelectValue placeholder="Select a shape" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="circle">Circle</SelectItem>
                      <SelectItem value="ellipse">Ellipse</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}

            {usesPosition && (
              <div className="grid gap-4 sm:grid-cols-2">
                <SliderField
                  label="Position X"
                  valueLabel={`${formatNumber(clampPercent(model.positionX))}%`}
                  value={model.positionX}
                  min={0}
                  max={100}
                  onChange={(positionX) => patch({ positionX })}
                />
                <SliderField
                  label="Position Y"
                  valueLabel={`${formatNumber(clampPercent(model.positionY))}%`}
                  value={model.positionY}
                  min={0}
                  max={100}
                  onChange={(positionY) => patch({ positionY })}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rainbow className="h-5 w-5 text-primary" />
              Colour stops
              <span className="ml-auto font-mono text-xs font-normal text-muted-foreground">
                {model.stops.length} / {MAX_STOPS}
              </span>
            </CardTitle>
            <CardDescription>
              Moving a stop up or down swaps its place on the gradient with its neighbour.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {model.stops.map((stop, index) => (
                <StopRow
                  key={stop.id}
                  stop={stop}
                  index={index}
                  count={model.stops.length}
                  onColor={(color) => patchStops((stops) => updateStop(stops, stop.id, { color }))}
                  onPosition={(position) =>
                    patchStops((stops) => updateStop(stops, stop.id, { position }))
                  }
                  onMove={(direction) => patchStops((stops) => moveStop(stops, stop.id, direction))}
                  onRemove={() => patchStops((stops) => removeStop(stops, stop.id))}
                />
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={model.stops.length >= MAX_STOPS}
                onClick={() => patchStops(addStop)}
              >
                <Plus className="h-4 w-4" />
                Add stop
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={stopsInOrder}
                onClick={() => patchStops(sortStopsByPosition)}
              >
                <ArrowUpDown className="h-4 w-4" />
                Sort by position
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Output */}
      <Card className="lg:col-start-2 lg:row-start-2">
        <CardHeader>
          <CardTitle>Code</CardTitle>
          <CardDescription>Copy the CSS, or the same gradient as a Tailwind class.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OutputBlock label="CSS" text={cssText} copy={cssCopy} />
          <OutputBlock label="Tailwind class" text={tailwindText} copy={tailwindCopy} />
          <p className="text-xs text-muted-foreground">
            The Tailwind class is an arbitrary value for Tailwind v4, with spaces written as
            underscores.
          </p>
          <span role="status" className="sr-only">
            {copyStatus}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
