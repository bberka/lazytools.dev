'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, Download, ImageIcon, RotateCcw } from 'lucide-react';
import { FieldError } from './FieldError';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ColorPicker } from '@/components/ui/color-picker';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCopyToClipboard } from '@/hooks';
import { cn } from '@/lib/utils';
import { downloadText } from '@/lib/files';
import {
  DEFAULT_PLACEHOLDER,
  SIZE_PRESETS,
  defaultLabel,
  effectiveFontSize,
  evaluatePlaceholder,
  maxRadius,
  placeholderFileName,
  type PlaceholderFieldErrors,
  type PlaceholderFields,
} from '@/lib/tools/svg-placeholder';

const INVALID_INPUT = 'border-destructive focus-visible:ring-destructive';

const INITIAL_FIELDS: PlaceholderFields = {
  width: String(DEFAULT_PLACEHOLDER.width),
  height: String(DEFAULT_PLACEHOLDER.height),
  background: DEFAULT_PLACEHOLDER.background,
  textColor: DEFAULT_PLACEHOLDER.textColor,
  text: '',
  showText: true,
  autoFont: true,
  fontSize: '48',
  radius: '0',
};

type OutputKind = 'svg' | 'dataUri' | 'css' | 'html';

const OUTPUT_TABS: ReadonlyArray<{ kind: OutputKind; label: string }> = [
  { kind: 'svg', label: 'SVG' },
  { kind: 'dataUri', label: 'Data URI' },
  { kind: 'css', label: 'CSS' },
  { kind: 'html', label: 'HTML' },
];

export function SvgPlaceholderGenerator() {
  const [fields, setFields] = useState<PlaceholderFields>(INITIAL_FIELDS);
  const [tab, setTab] = useState<OutputKind>('svg');
  const copy = useCopyToClipboard();

  const set = <K extends keyof PlaceholderFields>(key: K, value: PlaceholderFields[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  const outcome = useMemo(() => evaluatePlaceholder(fields), [fields]);
  const errors: PlaceholderFieldErrors = outcome.status === 'invalid' ? outcome.errors : {};
  const ready = outcome.status === 'ready' ? outcome : null;

  const widthNumber = Number(fields.width);
  const heightNumber = Number(fields.height);
  const radiusLimit =
    Number.isInteger(widthNumber) && Number.isInteger(heightNumber) && widthNumber > 0 && heightNumber > 0
      ? maxRadius(widthNumber, heightNumber)
      : null;
  const labelPlaceholder =
    Number.isInteger(widthNumber) && Number.isInteger(heightNumber)
      ? defaultLabel(widthNumber, heightNumber)
      : 'W x H';

  const handleDownload = () => {
    if (!ready) return;
    try {
      downloadText(
        ready.outputs.svg,
        placeholderFileName(ready.config.width, ready.config.height),
        'image/svg+xml;charset=utf-8'
      );
      toast.success('SVG downloaded');
    } catch {
      toast.error('Could not download the SVG');
    }
  };

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            Placeholder
          </CardTitle>
          <CardDescription>Size, colours and label. The preview updates as you type.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <label htmlFor="svgp-width" className="text-sm font-medium">
                Width (px)
              </label>
              <Input
                id="svgp-width"
                type="text"
                inputMode="numeric"
                value={fields.width}
                onChange={(event) => set('width', event.target.value)}
                className={cn('font-mono', errors.width && INVALID_INPUT)}
                aria-invalid={Boolean(errors.width)}
                aria-describedby={errors.width ? 'svgp-width-error' : undefined}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="svgp-height" className="text-sm font-medium">
                Height (px)
              </label>
              <Input
                id="svgp-height"
                type="text"
                inputMode="numeric"
                value={fields.height}
                onChange={(event) => set('height', event.target.value)}
                className={cn('font-mono', errors.height && INVALID_INPUT)}
                aria-invalid={Boolean(errors.height)}
                aria-describedby={errors.height ? 'svgp-height-error' : undefined}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <FieldError id="svgp-width-error" message={errors.width} />
              <FieldError id="svgp-height-error" message={errors.height} />
            </div>
          </div>

          <div role="group" aria-label="Size presets" className="flex flex-wrap gap-2">
            {SIZE_PRESETS.map((preset) => (
              <Button
                key={`${preset.width}x${preset.height}`}
                type="button"
                variant="outline"
                size="sm"
                title={preset.label}
                onClick={() =>
                  setFields((current) => ({
                    ...current,
                    width: String(preset.width),
                    height: String(preset.height),
                  }))
                }
              >
                {preset.width}x{preset.height}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <span className="block text-sm font-medium">Background</span>
              <ColorPicker
                label="Background color"
                value={fields.background}
                onChange={(value) => set('background', value)}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <span className="block text-sm font-medium">Text color</span>
              <ColorPicker
                label="Text color"
                value={fields.textColor}
                onChange={(value) => set('textColor', value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="svgp-text" className="text-sm font-medium">
              Text
            </label>
            <Input
              id="svgp-text"
              type="text"
              value={fields.text}
              onChange={(event) => set('text', event.target.value)}
              placeholder={labelPlaceholder}
              disabled={!fields.showText}
              className={cn(errors.text && INVALID_INPUT)}
              aria-invalid={Boolean(errors.text)}
              aria-describedby={errors.text ? 'svgp-text-error' : undefined}
            />
            <FieldError id="svgp-text-error" message={errors.text} />
            <p className="text-xs text-muted-foreground">Leave empty to show the size.</p>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="svgp-show-text"
              checked={fields.showText}
              onCheckedChange={(checked) => set('showText', checked)}
            />
            <label htmlFor="svgp-show-text" className="text-sm font-medium">
              Show text
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch
                id="svgp-auto-font"
                checked={fields.autoFont}
                onCheckedChange={(checked) => set('autoFont', checked)}
                disabled={!fields.showText}
              />
              <label htmlFor="svgp-auto-font" className="text-sm font-medium">
                Automatic font size
                {ready && fields.autoFont && fields.showText && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({effectiveFontSize(ready.config)}px)
                  </span>
                )}
              </label>
            </div>
            {!fields.autoFont && fields.showText && (
              <div className="space-y-2">
                <label htmlFor="svgp-font-size" className="text-sm font-medium">
                  Font size (px)
                </label>
                <Input
                  id="svgp-font-size"
                  type="text"
                  inputMode="numeric"
                  value={fields.fontSize}
                  onChange={(event) => set('fontSize', event.target.value)}
                  className={cn('font-mono', errors.fontSize && INVALID_INPUT)}
                  aria-invalid={Boolean(errors.fontSize)}
                  aria-describedby={errors.fontSize ? 'svgp-font-error' : undefined}
                />
                <FieldError id="svgp-font-error" message={errors.fontSize} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="svgp-radius" className="text-sm font-medium">
              Corner radius (px)
              {radiusLimit !== null && (
                <span className="ml-1 font-normal text-muted-foreground">max {radiusLimit}</span>
              )}
            </label>
            <Input
              id="svgp-radius"
              type="text"
              inputMode="numeric"
              value={fields.radius}
              onChange={(event) => set('radius', event.target.value)}
              className={cn('font-mono', errors.radius && INVALID_INPUT)}
              aria-invalid={Boolean(errors.radius)}
              aria-describedby={errors.radius ? 'svgp-radius-error' : undefined}
            />
            <FieldError id="svgp-radius-error" message={errors.radius} />
          </div>

          <Button type="button" variant="outline" size="sm" onClick={() => setFields(INITIAL_FIELDS)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4 sm:space-y-6 lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              {ready
                ? `${ready.config.width} x ${ready.config.height} px, ${ready.outputs.svg.length.toLocaleString('en-US')} bytes of SVG`
                : 'Fix the highlighted fields to see the preview.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-32 items-center justify-center overflow-auto rounded-md border bg-muted/40 p-3 sm:p-4">
              {ready ? (
                <img
                  src={ready.outputs.dataUri}
                  alt={`Placeholder preview, ${ready.config.width} by ${ready.config.height} pixels`}
                  width={ready.config.width}
                  height={ready.config.height}
                  className="h-auto max-w-full"
                />
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  No preview
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Output</CardTitle>
            <CardDescription>Copy the markup, or use it inline as a data URI.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Tabs value={tab} onValueChange={(value) => setTab(value as OutputKind)}>
              <TabsList className="h-auto flex-wrap justify-start">
                {OUTPUT_TABS.map((item) => (
                  <TabsTrigger key={item.kind} value={item.kind} className="py-1.5">
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {OUTPUT_TABS.map((item) => (
                <TabsContent key={item.kind} value={item.kind}>
                  <Textarea
                    readOnly
                    value={ready ? ready.outputs[item.kind] : ''}
                    aria-label={`${item.label} output`}
                    placeholder="Fix the highlighted fields to see the output."
                    spellCheck={false}
                    className="h-40 font-mono text-xs"
                  />
                </TabsContent>
              ))}
            </Tabs>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!ready}
                variant={copy.isCopied ? 'default' : 'outline'}
                onClick={() => ready && copy.copyToClipboard(ready.outputs[tab])}
              >
                {copy.isCopied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    {copy.isError ? 'Copy failed, try again' : 'Copy'}
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" disabled={!ready} onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download .svg
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
