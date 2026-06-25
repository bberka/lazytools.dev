'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, HelpCircle, Info, Maximize, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { useCopyToClipboard } from '@/hooks';
import { TooltipSimple } from '@/components/ui/tooltip';

type Unit = 'px' | 'rem';
type Property = 'font-size' | 'padding' | 'margin' | 'width' | 'height' | 'gap' | 'custom';

interface ViewportPreset {
  name: string;
  minV: string;
  maxV: string;
  minUnit: Unit;
  maxUnit: Unit;
}

interface SizePreset {
  name: string;
  minS: string;
  maxS: string;
  minUnit: Unit;
  maxUnit: Unit;
}

const VIEWPORT_PRESETS: ViewportPreset[] = [
  { name: 'Mobile to Desktop', minV: '320', maxV: '1200', minUnit: 'px', maxUnit: 'px' },
  { name: 'Mobile to Wide Screen', minV: '375', maxV: '1440', minUnit: 'px', maxUnit: 'px' },
  { name: 'Tablet to FHD Desktop', minV: '768', maxV: '1920', minUnit: 'px', maxUnit: 'px' },
  { name: 'Mobile (rem) to Desktop (rem)', minV: '20', maxV: '75', minUnit: 'rem', maxUnit: 'rem' },
];

const SIZE_PRESETS: SizePreset[] = [
  { name: 'Body Text', minS: '14', maxS: '18', minUnit: 'px', maxUnit: 'px' },
  { name: 'Fluid H3', minS: '18', maxS: '28', minUnit: 'px', maxUnit: 'px' },
  { name: 'Fluid H2', minS: '20', maxS: '36', minUnit: 'px', maxUnit: 'px' },
  { name: 'Fluid H1', minS: '24', maxS: '48', minUnit: 'px', maxUnit: 'px' },
  { name: 'Hero Title', minS: '32', maxS: '80', minUnit: 'px', maxUnit: 'px' },
];

const PROPERTY_OPTIONS = [
  { value: 'font-size', label: 'font-size' },
  { value: 'padding', label: 'padding' },
  { value: 'margin', label: 'margin' },
  { value: 'width', label: 'width' },
  { value: 'height', label: 'height' },
  { value: 'gap', label: 'gap' },
  { value: 'custom', label: 'Custom Property...' },
];

export function ClampCalculator() {
  const [minSize, setMinSize] = useState('16');
  const [minSizeUnit, setMinSizeUnit] = useState<Unit>('px');
  const [maxSize, setMaxSize] = useState('32');
  const [maxSizeUnit, setMaxSizeUnit] = useState<Unit>('px');

  const [minViewport, setMinViewport] = useState('320');
  const [minViewportUnit, setMinViewportUnit] = useState<Unit>('px');
  const [maxViewport, setMaxViewport] = useState('1200');
  const [maxViewportUnit, setMaxViewportUnit] = useState<Unit>('px');

  const [baseFontSize, setBaseFontSize] = useState('16');
  const [cssProperty, setCssProperty] = useState<Property>('font-size');
  const [customProperty, setCustomProperty] = useState('');
  const [outputUnit, setOutputUnit] = useState<Unit>('rem');

  // Simulated viewport state (for the live interactive preview box)
  const [simulatedViewportWidth, setSimulatedViewportWidth] = useState(800);

  // Clipboard copy hooks
  const copyRaw = useCopyToClipboard();
  const copyCss = useCopyToClipboard();
  const copyTailwind = useCopyToClipboard();
  const copyScss = useCopyToClipboard();

  // Helper conversions
  const toPx = (val: number, unit: Unit, base: number) => {
    return unit === 'rem' ? val * base : val;
  };

  const round = (num: number, decimals: number = 4) => {
    const factor = Math.pow(10, decimals);
    return Math.round((num + Number.EPSILON) * factor) / factor;
  };

  // Main CSS clamp calculations
  const calculations = useMemo(() => {
    const base = parseFloat(baseFontSize) || 16;
    const minSVal = parseFloat(minSize);
    const maxSVal = parseFloat(maxSize);
    const minVVal = parseFloat(minViewport);
    const maxVVal = parseFloat(maxViewport);

    const activeProperty = cssProperty === 'custom' ? customProperty.trim() || '--fluid-prop' : cssProperty;

    if (
      isNaN(minSVal) ||
      isNaN(maxSVal) ||
      isNaN(minVVal) ||
      isNaN(maxVVal) ||
      base <= 0
    ) {
      return {
        error: 'Please enter valid numbers in all fields to compute.',
        clampRaw: '',
        clampCss: '',
        tailwindClass: '',
        scssVariable: '',
        minSizePx: 0,
        maxSizePx: 0,
        minViewportPx: 0,
        maxViewportPx: 0,
        activeProperty,
      };
    }

    const minSPx = toPx(minSVal, minSizeUnit, base);
    const maxSPx = toPx(maxSVal, maxSizeUnit, base);
    const minVPx = toPx(minVVal, minViewportUnit, base);
    const maxVPx = toPx(maxVVal, maxViewportUnit, base);

    if (minVPx === maxVPx) {
      return {
        error: 'Min and Max viewports cannot be equal.',
        clampRaw: '',
        clampCss: '',
        tailwindClass: '',
        scssVariable: '',
        minSizePx: minSPx,
        maxSizePx: maxSPx,
        minViewportPx: minVPx,
        maxViewportPx: maxVPx,
        activeProperty,
      };
    }

    // Slope m
    const m = (maxSPx - minSPx) / (maxVPx - minVPx);
    // Viewport portion (vw)
    const vSlope = m * 100;
    // Intercept c (px)
    const cPx = minSPx - m * minVPx;

    // Format preferred part: constant + slope
    const formatPreferredPart = (constantVal: number, slopeVal: number, constantUnit: string) => {
      const roundedConstant = round(constantVal);
      const roundedSlope = round(slopeVal);

      if (roundedSlope === 0) {
        return roundedConstant === 0 ? `0${constantUnit}` : `${roundedConstant}${constantUnit}`;
      }

      if (roundedConstant === 0) {
        return `${roundedSlope}vw`;
      }

      if (roundedSlope < 0) {
        return `${roundedConstant}${constantUnit} - ${Math.abs(roundedSlope)}vw`;
      }

      if (roundedConstant < 0) {
        return `${roundedSlope}vw - ${Math.abs(roundedConstant)}${constantUnit}`;
      }

      return `${roundedConstant}${constantUnit} + ${roundedSlope}vw`;
    };

    let clampRaw = '';

    if (outputUnit === 'rem') {
      const minSRem = minSPx / base;
      const maxSRem = maxSPx / base;
      const cRem = cPx / base;

      const preferred = formatPreferredPart(cRem, vSlope, 'rem');
      const minVal = round(Math.min(minSRem, maxSRem));
      const maxVal = round(Math.max(minSRem, maxSRem));

      clampRaw = `clamp(${minVal}rem, ${preferred}, ${maxVal}rem)`;
    } else {
      const preferred = formatPreferredPart(cPx, vSlope, 'px');
      const minVal = round(Math.min(minSPx, maxSPx));
      const maxVal = round(Math.max(minSPx, maxSPx));

      clampRaw = `clamp(${minVal}px, ${preferred}, ${maxVal}px)`;
    }

    const clampCss = `${activeProperty}: ${clampRaw};`;

    // Tailwind utilities prefix matching
    let tailwindPrefix = '';
    switch (activeProperty) {
      case 'font-size':
        tailwindPrefix = 'text';
        break;
      case 'padding':
        tailwindPrefix = 'p';
        break;
      case 'margin':
        tailwindPrefix = 'm';
        break;
      case 'width':
        tailwindPrefix = 'w';
        break;
      case 'height':
        tailwindPrefix = 'h';
        break;
      case 'gap':
        tailwindPrefix = 'gap';
        break;
      default:
        tailwindPrefix = `[${activeProperty}]`;
    }

    const tailwindClampVal = clampRaw.replace(/\s+/g, '');
    const tailwindClass = `${tailwindPrefix}-${tailwindClampVal.startsWith('[') ? tailwindClampVal : `[${tailwindClampVal}]`}`;

    // SCSS format
    const variableName = `$${activeProperty.replace(/[^a-zA-Z0-9-]/g, '')}-fluid`;
    const scssVariable = `${variableName}: ${clampRaw};`;

    return {
      error: '',
      clampRaw,
      clampCss,
      tailwindClass,
      scssVariable,
      minSizePx: minSPx,
      maxSizePx: maxSPx,
      minViewportPx: minVPx,
      maxViewportPx: maxVPx,
      activeProperty,
    };
  }, [
    minSize,
    minSizeUnit,
    maxSize,
    maxSizeUnit,
    minViewport,
    minViewportUnit,
    maxViewport,
    maxViewportUnit,
    baseFontSize,
    cssProperty,
    customProperty,
    outputUnit,
  ]);

  // Live simulated size computation
  const simulatedSize = useMemo(() => {
    const { minSizePx, maxSizePx, minViewportPx, maxViewportPx, error } = calculations;
    if (error) return null;

    const v = simulatedViewportWidth;
    let computedPx = 0;

    if (minViewportPx === maxViewportPx) {
      computedPx = minSizePx;
    } else {
      const linearPx =
        minSizePx +
        ((v - minViewportPx) / (maxViewportPx - minViewportPx)) * (maxSizePx - minSizePx);
      const lower = Math.min(minSizePx, maxSizePx);
      const upper = Math.max(minSizePx, maxSizePx);
      computedPx = Math.max(lower, Math.min(upper, linearPx));
    }

    const base = parseFloat(baseFontSize) || 16;
    return {
      px: round(computedPx, 2),
      rem: round(computedPx / base, 3),
    };
  }, [calculations, simulatedViewportWidth, baseFontSize]);

  // SVG Chart Dimensions & Scale calculations
  const graphData = useMemo(() => {
    const { minViewportPx, maxViewportPx, minSizePx, maxSizePx, error } = calculations;
    if (error) return null;

    const vMin = minViewportPx;
    const vMax = maxViewportPx;
    const sMin = minSizePx;
    const sMax = maxSizePx;

    const vDiff = Math.abs(vMax - vMin);
    const xMin = Math.max(0, Math.min(vMin, vMax) - vDiff * 0.25);
    const xMax = Math.max(vMin, vMax) + vDiff * 0.25;

    const sDiff = Math.abs(sMax - sMin) || 10;
    const yMin = Math.max(0, Math.min(sMin, sMax) - sDiff * 0.25);
    const yMax = Math.max(sMin, sMax) + sDiff * 0.25;

    return { xMin, xMax, yMin, yMax, vMin, vMax, sMin, sMax };
  }, [calculations]);

  const svgCoords = useMemo(() => {
    if (!graphData) return null;
    const { xMin, xMax, yMin, yMax } = graphData;

    const paddingLeft = 60;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 40;
    const width = 500;
    const height = 240;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const mapCoords = (v: number, s: number) => {
      const x = paddingLeft + ((v - xMin) / (xMax - xMin)) * chartWidth;
      const y = paddingTop + (1 - (s - yMin) / (yMax - yMin)) * chartHeight;
      return { x: round(x, 1), y: round(y, 1) };
    };

    return {
      mapCoords,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      width,
      height,
      chartWidth,
      chartHeight,
    };
  }, [graphData]);

  // Get SVG Path points
  const chartPath = useMemo(() => {
    if (!graphData || !svgCoords) return '';
    const { xMin, xMax, vMin, vMax, sMin, sMax } = graphData;
    const { mapCoords } = svgCoords;

    const p1 = mapCoords(xMin, sMin);
    const p2 = mapCoords(vMin, sMin);
    const p3 = mapCoords(vMax, sMax);
    const p4 = mapCoords(xMax, sMax);

    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y}`;
  }, [graphData, svgCoords]);

  const activeDotCoords = useMemo(() => {
    if (!graphData || !svgCoords || !simulatedSize) return null;
    const clampedV = Math.max(graphData.xMin, Math.min(graphData.xMax, simulatedViewportWidth));
    return svgCoords.mapCoords(clampedV, simulatedSize.px);
  }, [graphData, svgCoords, simulatedViewportWidth, simulatedSize]);

  // Click on chart updates simulated viewport width
  const handleChartClick = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!svgCoords || !graphData) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const svgWidth = rect.width;

    // Scale clickX back to SVG viewBox coordinates
    const scaleFactor = svgCoords.width / svgWidth;
    const svgClickX = clickX * scaleFactor;

    // Convert SVG X coord back to Viewport Px value
    const chartX = svgClickX - svgCoords.paddingLeft;
    if (chartX >= 0 && chartX <= svgCoords.chartWidth) {
      const percent = chartX / svgCoords.chartWidth;
      const calculatedV = graphData.xMin + percent * (graphData.xMax - graphData.xMin);
      setSimulatedViewportWidth(Math.round(calculatedV));
    }
  };

  const handleApplyViewportPreset = (preset: ViewportPreset) => {
    setMinViewport(preset.minV);
    setMaxViewport(preset.maxV);
    setMinViewportUnit(preset.minUnit);
    setMaxViewportUnit(preset.maxUnit);
  };

  const handleApplySizePreset = (preset: SizePreset) => {
    setMinSize(preset.minS);
    setMaxSize(preset.maxS);
    setMinSizeUnit(preset.minUnit);
    setMaxSizeUnit(preset.maxUnit);
  };

  const handleClear = () => {
    setMinSize('');
    setMaxSize('');
    setMinViewport('');
    setMaxViewport('');
  };

  const handleResetDefaults = () => {
    setMinSize('16');
    setMinSizeUnit('px');
    setMaxSize('32');
    setMaxSizeUnit('px');
    setMinViewport('320');
    setMinViewportUnit('px');
    setMaxViewport('1200');
    setMaxViewportUnit('px');
    setBaseFontSize('16');
    setCssProperty('font-size');
    setOutputUnit('rem');
    setSimulatedViewportWidth(800);
  };

  // Helper renderer for copy buttons
  const renderCopySection = (label: string, text: string, copyHook: typeof copyRaw) => {
    return (
      <div className="flex flex-col space-y-1.5 rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <TooltipSimple content={`Copy ${label}`}>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => copyHook.copyToClipboard(text)}
              disabled={!text}
              aria-label={`Copy ${label}`}
            >
              {copyHook.isCopied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500 animate-in fade-in" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipSimple>
        </div>
        <div className="overflow-x-auto scrollbar-thin whitespace-nowrap rounded bg-muted/50 p-2 font-mono text-sm font-medium text-foreground">
          {text || '-'}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12">
        {/* Left Column: Form Controls */}
        <div className="space-y-6 lg:col-span-7">
          <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Parameters</CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  onClick={handleResetDefaults}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Reset Defaults
                </Button>
              </div>
              <CardDescription>
                Define target sizes, viewport boundaries, and base settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Presets Row */}
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                  Quick Presets
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <div className="flex flex-wrap gap-1 rounded-md bg-muted/40 p-1 border">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground px-1.5 self-center">
                      Viewports:
                    </span>
                    {VIEWPORT_PRESETS.slice(0, 3).map((preset) => (
                      <Button
                        key={preset.name}
                        size="sm"
                        variant="secondary"
                        className="text-[10px] h-6 px-2 hover:bg-emerald-500 hover:text-white"
                        onClick={() => handleApplyViewportPreset(preset)}
                      >
                        {preset.minV}-{preset.maxV}
                      </Button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1 rounded-md bg-muted/40 p-1 border">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground px-1.5 self-center">
                      Sizes:
                    </span>
                    {SIZE_PRESETS.map((preset) => (
                      <Button
                        key={preset.name}
                        size="sm"
                        variant="secondary"
                        className="text-[10px] h-6 px-2 hover:bg-emerald-500 hover:text-white"
                        onClick={() => handleApplySizePreset(preset)}
                      >
                        {preset.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sizes Inputs */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground flex items-center justify-between">
                    <span>Min Size</span>
                    <span className="text-xs font-normal text-muted-foreground">At min viewport</span>
                  </label>
                  <div className="flex">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={minSize}
                      onChange={(e) => setMinSize(e.target.value)}
                      placeholder="e.g. 16"
                      className="rounded-r-none font-mono"
                    />
                    <Select
                      value={minSizeUnit}
                      onValueChange={(val) => setMinSizeUnit(val as Unit)}
                    >
                      <SelectTrigger className="w-[85px] rounded-l-none border-l-0 font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="px" className="font-mono">px</SelectItem>
                        <SelectItem value="rem" className="font-mono">rem</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground flex items-center justify-between">
                    <span>Max Size</span>
                    <span className="text-xs font-normal text-muted-foreground">At max viewport</span>
                  </label>
                  <div className="flex">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={maxSize}
                      onChange={(e) => setMaxSize(e.target.value)}
                      placeholder="e.g. 32"
                      className="rounded-r-none font-mono"
                    />
                    <Select
                      value={maxSizeUnit}
                      onValueChange={(val) => setMaxSizeUnit(val as Unit)}
                    >
                      <SelectTrigger className="w-[85px] rounded-l-none border-l-0 font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="px" className="font-mono">px</SelectItem>
                        <SelectItem value="rem" className="font-mono">rem</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Viewports Inputs */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground flex items-center justify-between">
                    <span>Min Viewport Width</span>
                    <span className="text-xs font-normal text-muted-foreground">Lower boundary</span>
                  </label>
                  <div className="flex">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={minViewport}
                      onChange={(e) => setMinViewport(e.target.value)}
                      placeholder="e.g. 320"
                      className="rounded-r-none font-mono"
                    />
                    <Select
                      value={minViewportUnit}
                      onValueChange={(val) => setMinViewportUnit(val as Unit)}
                    >
                      <SelectTrigger className="w-[85px] rounded-l-none border-l-0 font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="px" className="font-mono">px</SelectItem>
                        <SelectItem value="rem" className="font-mono">rem</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground flex items-center justify-between">
                    <span>Max Viewport Width</span>
                    <span className="text-xs font-normal text-muted-foreground">Upper boundary</span>
                  </label>
                  <div className="flex">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={maxViewport}
                      onChange={(e) => setMaxViewport(e.target.value)}
                      placeholder="e.g. 1200"
                      className="rounded-r-none font-mono"
                    />
                    <Select
                      value={maxViewportUnit}
                      onValueChange={(val) => setMaxViewportUnit(val as Unit)}
                    >
                      <SelectTrigger className="w-[85px] rounded-l-none border-l-0 font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="px" className="font-mono">px</SelectItem>
                        <SelectItem value="rem" className="font-mono">rem</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Base and Property Configuration */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <span>Base Font Size</span>
                    <TooltipSimple content="Used for conversions between px and rem">
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" aria-label="Base font size conversions info" />
                    </TooltipSimple>
                  </label>
                  <div className="relative">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={baseFontSize}
                      onChange={(e) => setBaseFontSize(e.target.value)}
                      placeholder="16"
                      className="font-mono pr-8"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-mono">px</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">Output Unit</label>
                  <Select
                    value={outputUnit}
                    onValueChange={(val) => setOutputUnit(val as Unit)}
                  >
                    <SelectTrigger className="font-mono">
                      <SelectValue placeholder="Select output unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rem" className="font-mono">rem (Recommended)</SelectItem>
                      <SelectItem value="px" className="font-mono">px</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">CSS Property</label>
                  <Select
                    value={cssProperty}
                    onValueChange={(val) => setCssProperty(val as Property)}
                  >
                    <SelectTrigger className="font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {PROPERTY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="font-mono">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Custom property text input */}
              {cssProperty === 'custom' && (
                <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-250">
                  <label className="text-sm font-semibold text-foreground">Custom Property Name</label>
                  <Input
                    type="text"
                    value={customProperty}
                    onChange={(e) => setCustomProperty(e.target.value)}
                    placeholder="e.g. border-radius, line-height, --my-fluid-size"
                    className="font-mono"
                  />
                </div>
              )}

              {calculations.error && (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{calculations.error}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleClear} variant="outline" className="w-full sm:w-auto">
                  Clear All
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Code Outputs & Graph */}
        <div className="space-y-6 lg:col-span-5">
          {/* Outputs display */}
          <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">Generated Outputs</CardTitle>
              <CardDescription>Copy the generated responsive values into your styles.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {renderCopySection('Clamp Function', calculations.clampRaw, copyRaw)}
              {renderCopySection('Full CSS Rule', calculations.clampCss, copyCss)}
              {renderCopySection('Tailwind Class', calculations.tailwindClass, copyTailwind)}
              {renderCopySection('SCSS / Sass', calculations.scssVariable, copyScss)}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Row 2: Graph & Live Viewport Simulator */}
      {!calculations.error && graphData && svgCoords && simulatedSize && (
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-12">
          {/* SVG Visualizer Chart */}
          <Card className="border-border/50 bg-card/60 backdrop-blur-sm md:col-span-7 flex flex-col justify-between">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Maximize className="h-5 w-5 text-emerald-500" />
                Visualizer Graph
              </CardTitle>
              <CardDescription>
                Linear sizing graph. Click on the graph to slide the simulated viewport width.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex items-center justify-center p-3 sm:p-6">
              <div className="w-full max-w-[500px]">
                <svg
                  viewBox={`0 0 ${svgCoords.width} ${svgCoords.height}`}
                  width="100%"
                  height="100%"
                  className="overflow-visible select-none cursor-pointer"
                  onClick={handleChartClick}
                >
                  <defs>
                    <linearGradient id="clampGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#14b8a6" />
                    </linearGradient>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Grid Lines */}
                  <line
                    x1={svgCoords.paddingLeft}
                    y1={svgCoords.height - svgCoords.paddingBottom}
                    x2={svgCoords.width - svgCoords.paddingRight}
                    y2={svgCoords.height - svgCoords.paddingBottom}
                    className="stroke-muted border-border"
                    strokeWidth="1.5"
                  />
                  <line
                    x1={svgCoords.paddingLeft}
                    y1={svgCoords.paddingTop}
                    x2={svgCoords.paddingLeft}
                    y2={svgCoords.height - svgCoords.paddingBottom}
                    className="stroke-muted border-border"
                    strokeWidth="1.5"
                  />

                  {/* Min/Max Viewport Boundary Dashed Lines */}
                  {(() => {
                    const coordMinV = svgCoords.mapCoords(graphData.vMin, graphData.yMin);
                    const coordMaxV = svgCoords.mapCoords(graphData.vMax, graphData.yMin);
                    const topY = svgCoords.paddingTop;
                    const botY = svgCoords.height - svgCoords.paddingBottom;

                    return (
                      <>
                        {/* Min Viewport Limit */}
                        <line
                          x1={coordMinV.x}
                          y1={topY}
                          x2={coordMinV.x}
                          y2={botY}
                          strokeDasharray="4 4"
                          className="stroke-muted-foreground/30"
                          strokeWidth="1"
                        />
                        <text
                          x={coordMinV.x}
                          y={botY + 16}
                          textAnchor="middle"
                          className="text-[10px] font-mono fill-muted-foreground font-semibold"
                        >
                          {Math.round(graphData.vMin)}px
                        </text>

                        {/* Max Viewport Limit */}
                        <line
                          x1={coordMaxV.x}
                          y1={topY}
                          x2={coordMaxV.x}
                          y2={botY}
                          strokeDasharray="4 4"
                          className="stroke-muted-foreground/30"
                          strokeWidth="1"
                        />
                        <text
                          x={coordMaxV.x}
                          y={botY + 16}
                          textAnchor="middle"
                          className="text-[10px] font-mono fill-muted-foreground font-semibold"
                        >
                          {Math.round(graphData.vMax)}px
                        </text>
                      </>
                    );
                  })()}

                  {/* Y Axis Labels (Min Size / Max Size) */}
                  {(() => {
                    const coordMinS = svgCoords.mapCoords(graphData.xMin, graphData.sMin);
                    const coordMaxS = svgCoords.mapCoords(graphData.xMin, graphData.sMax);
                    const labelX = svgCoords.paddingLeft - 8;

                    return (
                      <>
                        <text
                          x={labelX}
                          y={coordMinS.y + 4}
                          textAnchor="end"
                          className="text-[10px] font-mono fill-muted-foreground font-semibold"
                        >
                          {Math.round(graphData.sMin)}px
                        </text>
                        <text
                          x={labelX}
                          y={coordMaxS.y + 4}
                          textAnchor="end"
                          className="text-[10px] font-mono fill-muted-foreground font-semibold"
                        >
                          {Math.round(graphData.sMax)}px
                        </text>
                      </>
                    );
                  })()}

                  {/* Core Clamping Function Line Path */}
                  <path
                    d={chartPath}
                    fill="none"
                    stroke="url(#clampGradient)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Active Simulated Viewport Marker Line & Dot */}
                  {activeDotCoords && (
                    <>
                      {/* Active Viewport Vertical Indicator */}
                      <line
                        x1={activeDotCoords.x}
                        y1={svgCoords.paddingTop}
                        x2={activeDotCoords.x}
                        y2={svgCoords.height - svgCoords.paddingBottom}
                        strokeDasharray="3 3"
                        className="stroke-primary/50"
                        strokeWidth="1.5"
                      />

                      {/* Glowing dot on the line */}
                      <circle
                        cx={activeDotCoords.x}
                        cy={activeDotCoords.y}
                        r="8"
                        className="fill-emerald-500/20 stroke-emerald-500/30"
                        strokeWidth="2"
                      />
                      <circle
                        cx={activeDotCoords.x}
                        cy={activeDotCoords.y}
                        r="4.5"
                        className="fill-emerald-500 stroke-background shadow-lg"
                        strokeWidth="1.5"
                        filter="url(#glow)"
                      />

                      {/* Floating Tooltip displaying current values */}
                      <g
                        transform={`translate(${
                          activeDotCoords.x > svgCoords.width - 90
                            ? activeDotCoords.x - 90
                            : activeDotCoords.x + 8
                        }, ${
                          activeDotCoords.y < svgCoords.paddingTop + 40
                            ? activeDotCoords.y + 15
                            : activeDotCoords.y - 30
                        })`}
                      >
                        <rect
                          width="82"
                          height="24"
                          rx="4"
                          className="fill-popover stroke-border shadow-md"
                          strokeWidth="1"
                        />
                        <text
                          x="41"
                          y="15"
                          textAnchor="middle"
                          className="text-[9px] font-bold font-mono fill-popover-foreground"
                        >
                          {simulatedViewportWidth}px → {simulatedSize.px}px
                        </text>
                      </g>
                    </>
                  )}
                </svg>
              </div>
            </CardContent>
          </Card>

          {/* Interactive Live Viewport Simulator */}
          <Card className="border-border/50 bg-card/60 backdrop-blur-sm md:col-span-5 flex flex-col justify-between">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Interactive Simulator</CardTitle>
              <CardDescription>
                Drag the slider to test the fluid properties at different screen widths.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 flex-1 flex flex-col justify-between">
              {/* Width Slider Control */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Simulated Screen Width</span>
                  <Badge variant="secondary" className="font-mono text-xs font-semibold px-2 py-0.5">
                    {simulatedViewportWidth}px
                  </Badge>
                </div>
                <Slider
                  value={simulatedViewportWidth}
                  min={200}
                  max={2000}
                  step={1}
                  onChange={(val) => setSimulatedViewportWidth(val)}
                  className="py-2"
                />
                <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground uppercase">
                  <span>Mobile (200px)</span>
                  <span>Tablet (768px)</span>
                  <span>Desktop (1200px)</span>
                  <span>Wide (2000px)</span>
                </div>
              </div>

              {/* Dynamic Scaling Element Preview Block */}
              <div className="flex-1 rounded-xl border border-dashed bg-muted/40 p-4 flex flex-col justify-center min-h-[160px]">
                <div className="mb-3 flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  <span>Computed preview size:</span>
                  <span className="font-mono text-emerald-500 normal-case">
                    {simulatedSize.px}px / {simulatedSize.rem}rem
                  </span>
                </div>

                <div className="rounded-lg bg-card border shadow-sm p-4 overflow-hidden">
                  {/* Handle font-size typography scale */}
                  {calculations.activeProperty === 'font-size' ? (
                    <div
                      style={{ fontSize: `${simulatedSize.px}px` }}
                      className="font-bold leading-tight text-foreground text-center break-words"
                    >
                      Fluid Typography
                    </div>
                  ) : calculations.activeProperty === 'padding' ? (
                    /* Handle padding block scale */
                    <div
                      style={{ padding: `${simulatedSize.px}px` }}
                      className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded text-center font-semibold text-xs"
                    >
                      <div className="bg-card py-2 border rounded font-mono text-[10px] text-muted-foreground">
                        Padding Box
                      </div>
                    </div>
                  ) : calculations.activeProperty === 'margin' ? (
                    /* Handle margin block scale */
                    <div className="bg-muted border rounded p-1">
                      <div
                        style={{ margin: `${simulatedSize.px}px` }}
                        className="bg-emerald-500/20 text-emerald-600 rounded p-2 text-center text-xs font-semibold"
                      >
                        Margin Box
                      </div>
                    </div>
                  ) : calculations.activeProperty === 'gap' ? (
                    /* Handle gap layout scale */
                    <div
                      style={{ gap: `${simulatedSize.px}px` }}
                      className="grid grid-cols-2 bg-muted/50 p-2 border rounded"
                    >
                      <div className="bg-card p-3 border rounded text-center text-xs font-semibold text-muted-foreground">
                        Box A
                      </div>
                      <div className="bg-card p-3 border rounded text-center text-xs font-semibold text-muted-foreground">
                        Box B
                      </div>
                    </div>
                  ) : (
                    /* Handle width / height or general property */
                    <div className="flex items-center justify-center min-h-[80px]">
                      <div
                        style={{
                          width:
                            calculations.activeProperty === 'width'
                              ? `${simulatedSize.px}px`
                              : '100px',
                          height:
                            calculations.activeProperty === 'height'
                              ? `${simulatedSize.px}px`
                              : '40px',
                        }}
                        className="bg-emerald-500 border border-emerald-600 text-white rounded shadow-sm text-center flex items-center justify-center font-mono text-xs font-bold"
                      >
                        {calculations.activeProperty === 'width' ? 'Width' : 'Height'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
