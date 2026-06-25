'use client';

import { useState, useRef, useEffect, type PointerEvent } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Sparkles,
  Sliders,
  Move,
  Info,
  Maximize,
  Compass,
  LayoutGrid
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useCopyToClipboard } from '@/hooks';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipSimple } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColorPicker } from '@/components/ui/color-picker';

interface ShadowLayer {
  id: string;
  name: string;
  visible: boolean;
  inset: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string; // HEX format
  opacity: number; // 0 to 1
}

interface Preset {
  name: string;
  description: string;
  shadows: Omit<ShadowLayer, 'id'>[];
  boxBgColor: string;
  canvasBgType: 'light' | 'dark' | 'checkered' | 'custom';
  canvasCustomBg?: string;
  borderRadius: number;
}

const COLOR_PRESETS = [
  '#000000',
  '#475569',
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#FFFFFF',
];

const PRESETS: Preset[] = [
  {
    name: 'Soft Ambient (Multi-layer)',
    description: 'A smooth, organic 5-layer shadow mimicking natural light occlusion.',
    boxBgColor: '#FFFFFF',
    canvasBgType: 'custom',
    canvasCustomBg: '#F8FAFC',
    borderRadius: 16,
    shadows: [
      { name: 'Layer 1 (Sharp)', visible: true, inset: false, offsetX: 0, offsetY: 1, blur: 2, spread: 0, color: '#000000', opacity: 0.05 },
      { name: 'Layer 2 (Ambient)', visible: true, inset: false, offsetX: 0, offsetY: 2, blur: 4, spread: 0, color: '#000000', opacity: 0.05 },
      { name: 'Layer 3 (Soft)', visible: true, inset: false, offsetX: 0, offsetY: 4, blur: 8, spread: 0, color: '#000000', opacity: 0.05 },
      { name: 'Layer 4 (Deep)', visible: true, inset: false, offsetX: 0, offsetY: 8, blur: 16, spread: 0, color: '#000000', opacity: 0.05 },
      { name: 'Layer 5 (Ambient glow)', visible: true, inset: false, offsetX: 0, offsetY: 16, blur: 32, spread: 0, color: '#000000', opacity: 0.05 },
    ],
  },
  {
    name: 'Standard Elevate (Material)',
    description: 'Classic Material Design elevation level 3.',
    boxBgColor: '#FFFFFF',
    canvasBgType: 'light',
    borderRadius: 8,
    shadows: [
      { name: 'Umbra', visible: true, inset: false, offsetX: 0, offsetY: 3, blur: 3, spread: -2, color: '#000000', opacity: 0.2 },
      { name: 'Penumbra', visible: true, inset: false, offsetX: 0, offsetY: 3, blur: 4, spread: 0, color: '#000000', opacity: 0.14 },
      { name: 'Ambient', visible: true, inset: false, offsetX: 0, offsetY: 1, blur: 8, spread: 0, color: '#000000', opacity: 0.12 },
    ],
  },
  {
    name: 'Neumorphism Outset',
    description: 'Duel soft light/dark shadows matching the background.',
    boxBgColor: '#E2E8F0',
    canvasBgType: 'custom',
    canvasCustomBg: '#E2E8F0',
    borderRadius: 24,
    shadows: [
      { name: 'Dark Shadow', visible: true, inset: false, offsetX: 9, offsetY: 9, blur: 16, spread: 0, color: '#94A3B8', opacity: 0.6 },
      { name: 'Light Glow', visible: true, inset: false, offsetX: -9, offsetY: -9, blur: 16, spread: 0, color: '#FFFFFF', opacity: 1 },
    ],
  },
  {
    name: 'Cyberpunk Neon Glow',
    description: 'Vibrant multilayer neon glow effect.',
    boxBgColor: '#0F172A',
    canvasBgType: 'dark',
    borderRadius: 12,
    shadows: [
      { name: 'Core Cyan Glow', visible: true, inset: false, offsetX: 0, offsetY: 0, blur: 8, spread: 2, color: '#06B6D4', opacity: 0.8 },
      { name: 'Ambient Purple Glow', visible: true, inset: false, offsetX: 0, offsetY: 0, blur: 25, spread: 4, color: '#A855F7', opacity: 0.6 },
      { name: 'Deep Pink Backdrop', visible: true, inset: false, offsetX: 0, offsetY: 0, blur: 60, spread: 10, color: '#EC4899', opacity: 0.4 },
    ],
  },
  {
    name: 'Retro Outline (3D)',
    description: 'Flat offset retro outline style popular in Neo-brutalism.',
    boxBgColor: '#FDF2F8',
    canvasBgType: 'custom',
    canvasCustomBg: '#F1F5F9',
    borderRadius: 8,
    shadows: [
      { name: 'Retro Layer 1', visible: true, inset: false, offsetX: 4, offsetY: 4, blur: 0, spread: 0, color: '#EC4899', opacity: 1 },
      { name: 'Retro Layer 2', visible: true, inset: false, offsetX: 8, offsetY: 8, blur: 0, spread: 0, color: '#0F172A', opacity: 1 },
    ],
  },
  {
    name: 'Inner Bevel & Inset',
    description: 'Pressed-in look, ideal for modern form inputs or buttons.',
    boxBgColor: '#F8FAFC',
    canvasBgType: 'custom',
    canvasCustomBg: '#F1F5F9',
    borderRadius: 16,
    shadows: [
      { name: 'Inset Top-Left Dark', visible: true, inset: true, offsetX: 3, offsetY: 3, blur: 6, spread: 0, color: '#000000', opacity: 0.15 },
      { name: 'Inset Bottom-Right Light', visible: true, inset: true, offsetX: -3, offsetY: -3, blur: 6, spread: 0, color: '#FFFFFF', opacity: 1 },
    ],
  },
];

const DEFAULT_SHADOWS: ShadowLayer[] = [
  {
    id: 'layer-1',
    name: 'Main Shadow',
    visible: true,
    inset: false,
    offsetX: 0,
    offsetY: 8,
    blur: 16,
    spread: -4,
    color: '#000000',
    opacity: 0.15,
  },
  {
    id: 'layer-2',
    name: 'Ambient Occlusion',
    visible: true,
    inset: false,
    offsetX: 0,
    offsetY: 2,
    blur: 4,
    spread: -2,
    color: '#000000',
    opacity: 0.1,
  },
];

export function BoxShadowVisualizer() {
  const [shadows, setShadows] = useState<ShadowLayer[]>(DEFAULT_SHADOWS);
  const [selectedId, setSelectedId] = useState<string>('layer-1');

  // Target Box state
  const [boxWidth, setBoxWidth] = useState(180);
  const [boxHeight, setBoxHeight] = useState(180);
  const [boxBgColor, setBoxBgColor] = useState('#FFFFFF');
  const [borderRadius, setBorderRadius] = useState(16);
  const [borderWidth, setBorderWidth] = useState(0);
  const [borderColor, setBorderColor] = useState('#CBD5E1');
  const [borderStyle, setBorderStyle] = useState<'solid' | 'dashed' | 'dotted' | 'double' | 'none'>('solid');

  // Canvas state
  const [canvasBgType, setCanvasBgType] = useState<'light' | 'dark' | 'checkered' | 'custom'>('light');
  const [canvasCustomBg, setCanvasCustomBg] = useState('#E2E8F0');
  const [showGrid, setShowGrid] = useState(false);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; initialOffsetX: number; initialOffsetY: number } | null>(null);

  const cssCopy = useCopyToClipboard();
  const tailwindCopy = useCopyToClipboard();

  // Color parsing helpers
  const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const cleanHex = hex.replace('#', '');
    const shorthand = cleanHex.length === 3;
    const r = parseInt(shorthand ? cleanHex[0] + cleanHex[0] : cleanHex.substring(0, 2), 16);
    const g = parseInt(shorthand ? cleanHex[1] + cleanHex[1] : cleanHex.substring(2, 4), 16);
    const b = parseInt(shorthand ? cleanHex[2] + cleanHex[2] : cleanHex.substring(4, 6), 16);
    return {
      r: isNaN(r) ? 0 : r,
      g: isNaN(g) ? 0 : g,
      b: isNaN(b) ? 0 : b,
    };
  };

  const getShadowColorString = (layer: ShadowLayer) => {
    const { r, g, b } = hexToRgb(layer.color);
    return `rgba(${r}, ${g}, ${b}, ${layer.opacity})`;
  };

  // Shadow list operations
  const addLayer = () => {
    const newId = `layer-${Date.now()}`;
    const newLayer: ShadowLayer = {
      id: newId,
      name: `Shadow Layer ${shadows.length + 1}`,
      visible: true,
      inset: false,
      offsetX: 0,
      offsetY: 4,
      blur: 8,
      spread: 0,
      color: '#000000',
      opacity: 0.15,
    };
    setShadows([...shadows, newLayer]);
    setSelectedId(newId);
  };

  const deleteLayer = (id: string) => {
    if (shadows.length <= 1) return; // Keep at least one layer
    const nextShadows = shadows.filter((s) => s.id !== id);
    setShadows(nextShadows);
    if (selectedId === id) {
      setSelectedId(nextShadows[0].id);
    }
  };

  const duplicateLayer = (layer: ShadowLayer) => {
    const newId = `layer-${Date.now()}`;
    const nextShadows = [...shadows];
    const index = nextShadows.findIndex((s) => s.id === layer.id);
    const duplicated: ShadowLayer = {
      ...layer,
      id: newId,
      name: `${layer.name} (Copy)`,
    };
    nextShadows.splice(index + 1, 0, duplicated);
    setShadows(nextShadows);
    setSelectedId(newId);
  };

  const updateSelectedLayer = <K extends keyof ShadowLayer>(key: K, value: ShadowLayer[K]) => {
    setShadows((prev) =>
      prev.map((s) => (s.id === selectedId ? { ...s, [key]: value } : s))
    );
  };

  const moveLayer = (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= shadows.length) return;
    const nextShadows = [...shadows];
    const [moved] = nextShadows.splice(index, 1);
    nextShadows.splice(nextIndex, 0, moved);
    setShadows(nextShadows);
  };

  // Compile full css shadow string
  const activeShadows = shadows.filter((s) => s.visible);
  const getBoxShadowValue = () => {
    if (activeShadows.length === 0) return 'none';
    return activeShadows
      .map((s) => {
        return `${s.inset ? 'inset ' : ''}${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread}px ${getShadowColorString(s)}`;
      })
      .join(',\n  ');
  };

  // Compile tailwind shadow class
  const getTailwindValue = () => {
    if (activeShadows.length === 0) return 'shadow-none';
    const layersStr = activeShadows
      .map((s) => {
        const { r, g, b } = hexToRgb(s.color);
        // Tailwind arbitrary shadow format: shadow-[offsetX_offsetY_blur_spread_rgba(r,g,b,alpha)]
        const insetPrefix = s.inset ? 'inset_' : '';
        const alphaClean = parseFloat(s.opacity.toFixed(3));
        return `${insetPrefix}${s.offsetX}px_${s.offsetY}px_${s.blur}px_${s.spread}px_rgba(${r},${g},${b},${alphaClean})`;
      })
      .join(',');
    return `shadow-[${layersStr}]`;
  };

  // Load Preset
  const applyPreset = (preset: Preset) => {
    setBoxBgColor(preset.boxBgColor);
    setCanvasBgType(preset.canvasBgType);
    if (preset.canvasCustomBg) setCanvasCustomBg(preset.canvasCustomBg);
    setBorderRadius(preset.borderRadius);
    
    const formatted: ShadowLayer[] = preset.shadows.map((s, idx) => ({
      ...s,
      id: `preset-layer-${idx}-${Date.now()}`,
    }));
    setShadows(formatted);
    setSelectedId(formatted[0].id);
  };

  // Drag offset logic
  const activeLayer = shadows.find((s) => s.id === selectedId) || shadows[0];

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!activeLayer) return;
    // Prevent dragging if clicking custom background selectors or code buttons
    if ((e.target as HTMLElement).closest('.no-drag')) return;

    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffsetX: activeLayer.offsetX,
      initialOffsetY: activeLayer.offsetY,
    };
    
    // Set pointer capture to handle movement outside the element safely
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current || !activeLayer) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // Relative multiplier to make dragging feel proportional
    const scale = 1; 
    const nextX = Math.min(100, Math.max(-100, Math.round(dragStartRef.current.initialOffsetX + dx * scale)));
    const nextY = Math.min(100, Math.max(-100, Math.round(dragStartRef.current.initialOffsetY + dy * scale)));

    updateSelectedLayer('offsetX', nextX);
    updateSelectedLayer('offsetY', nextY);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    dragStartRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const resetAll = () => {
    setShadows(DEFAULT_SHADOWS);
    setSelectedId(DEFAULT_SHADOWS[0].id);
    setBoxWidth(180);
    setBoxHeight(180);
    setBoxBgColor('#FFFFFF');
    setBorderRadius(16);
    setBorderWidth(0);
    setBorderColor('#CBD5E1');
    setBorderStyle('solid');
    setCanvasBgType('light');
    setShowGrid(false);
  };

  // Determine Canvas Background inline styles
  const getCanvasBackground = () => {
    switch (canvasBgType) {
      case 'light':
        return { backgroundColor: '#F8FAFC' };
      case 'dark':
        return { backgroundColor: '#0F172A' };
      case 'custom':
        return { backgroundColor: canvasCustomBg };
      case 'checkered':
      default:
        return {
          backgroundImage:
            'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          backgroundColor: '#FFFFFF',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Dynamic layout: left controls side, right preview side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,minmax(320px,460px)] gap-4 sm:gap-6">
        
        {/* Left Side: Controls & Editor */}
        <div className="space-y-6 order-2 lg:order-1">
          
          {/* Shadow Layers Manager */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-violet-500" />
                  <CardTitle className="text-lg">Shadow Layers</CardTitle>
                </div>
                <Button onClick={addLayer} size="sm" className="h-9 gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white">
                  <Plus className="h-4 w-4" />
                  Add Layer
                </Button>
              </div>
              <CardDescription>
                Layer multiple shadows to construct realistic lighting depth.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <ScrollArea className="h-[260px] pr-3">
                <div className="space-y-2">
                  {shadows.map((layer, index) => {
                    const isSelected = layer.id === selectedId;
                    return (
                      <div
                        key={layer.id}
                        onClick={() => setSelectedId(layer.id)}
                        className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-violet-500 bg-violet-500/5 shadow-sm'
                            : 'border-border/60 hover:bg-muted/50 bg-card'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Layer Color Dot Swatch */}
                          <div
                            className="h-5 w-5 rounded-md border border-black/10 shrink-0"
                            style={{
                              backgroundColor: layer.color,
                              opacity: layer.opacity,
                            }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {layer.name}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {layer.inset ? 'inset ' : ''}
                              {layer.offsetX}px {layer.offsetY}px {layer.blur}px {layer.spread}px
                            </p>
                          </div>
                        </div>

                        {/* Operations */}
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <TooltipSimple content={layer.visible ? 'Hide Layer' : 'Show Layer'}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                              onClick={() => updateSelectedLayer('visible', !layer.visible)}
                              aria-label={layer.visible ? 'Hide Layer' : 'Show Layer'}
                            >
                              {layer.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-60" />}
                            </Button>
                          </TooltipSimple>
                          <TooltipSimple content="Move Layer Up">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                              disabled={index === 0}
                              onClick={() => moveLayer(index, 'up')}
                              aria-label="Move Layer Up"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                          </TooltipSimple>
                          <TooltipSimple content="Move Layer Down">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                              disabled={index === shadows.length - 1}
                              onClick={() => moveLayer(index, 'down')}
                              aria-label="Move Layer Down"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </TooltipSimple>
                          <TooltipSimple content="Duplicate Layer">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                              onClick={() => duplicateLayer(layer)}
                              aria-label="Duplicate Layer"
                            >
                              <Compass className="h-4 w-4" />
                            </Button>
                          </TooltipSimple>
                          <TooltipSimple content="Delete Layer">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                              disabled={shadows.length <= 1}
                              onClick={() => deleteLayer(layer.id)}
                              aria-label="Delete Layer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipSimple>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Active Layer Properties Editor */}
          {activeLayer && (
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="h-5 w-5 text-violet-500" />
                    <CardTitle className="text-lg">
                      Properties: <span className="text-violet-600 font-semibold">{activeLayer.name}</span>
                    </CardTitle>
                  </div>
                  
                  {/* Layer Name Rename */}
                  <div className="flex items-center gap-2">
                    <Input
                      value={activeLayer.name}
                      onChange={(e) => updateSelectedLayer('name', e.target.value)}
                      className="h-8 w-36 text-xs"
                      placeholder="Rename layer"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                
                {/* Inset Switch */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/10">
                  <div className="space-y-0.5">
                    <label className="text-sm font-semibold">Inset Shadow</label>
                    <p className="text-xs text-muted-foreground">Place the shadow inside the boundary box.</p>
                  </div>
                  <Switch
                    checked={activeLayer.inset}
                    onCheckedChange={(checked) => updateSelectedLayer('inset', checked)}
                  />
                </div>

                {/* Slider Slates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Offset X */}
                  <div className="space-y-2 p-3 rounded-xl border border-border/50 bg-muted/5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Offset X</label>
                      <span className="font-mono text-xs text-foreground bg-secondary px-2 py-0.5 rounded">
                        {activeLayer.offsetX}px
                      </span>
                    </div>
                    <Slider
                      value={activeLayer.offsetX}
                      min={-100}
                      max={100}
                      onChange={(val) => updateSelectedLayer('offsetX', val)}
                    />
                  </div>

                  {/* Offset Y */}
                  <div className="space-y-2 p-3 rounded-xl border border-border/50 bg-muted/5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Offset Y</label>
                      <span className="font-mono text-xs text-foreground bg-secondary px-2 py-0.5 rounded">
                        {activeLayer.offsetY}px
                      </span>
                    </div>
                    <Slider
                      value={activeLayer.offsetY}
                      min={-100}
                      max={100}
                      onChange={(val) => updateSelectedLayer('offsetY', val)}
                    />
                  </div>

                  {/* Blur Radius */}
                  <div className="space-y-2 p-3 rounded-xl border border-border/50 bg-muted/5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Blur Radius</label>
                      <span className="font-mono text-xs text-foreground bg-secondary px-2 py-0.5 rounded">
                        {activeLayer.blur}px
                      </span>
                    </div>
                    <Slider
                      value={activeLayer.blur}
                      min={0}
                      max={100}
                      onChange={(val) => updateSelectedLayer('blur', val)}
                    />
                  </div>

                  {/* Spread Radius */}
                  <div className="space-y-2 p-3 rounded-xl border border-border/50 bg-muted/5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spread Radius</label>
                      <span className="font-mono text-xs text-foreground bg-secondary px-2 py-0.5 rounded">
                        {activeLayer.spread}px
                      </span>
                    </div>
                    <Slider
                      value={activeLayer.spread}
                      min={-50}
                      max={100}
                      onChange={(val) => updateSelectedLayer('spread', val)}
                    />
                  </div>

                </div>

                {/* Color and Opacity Row */}
                <div className="grid grid-cols-1 md:grid-cols-[160px,1fr] gap-4 p-4 rounded-xl border border-border/50 bg-muted/5">
                  
                  {/* HEX Color Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shadow Color</label>
                    <div className="flex gap-2">
                      <ColorPicker
                        value={activeLayer.color}
                        onChange={(val) => updateSelectedLayer('color', val)}
                        showText={false}
                        className="w-10 h-10 p-0 rounded-lg"
                      />
                      <Input
                        type="text"
                        value={activeLayer.color}
                        onChange={(e) => updateSelectedLayer('color', e.target.value)}
                        className="font-mono text-sm uppercase flex-1 h-10"
                        maxLength={7}
                      />
                    </div>
                  </div>

                  {/* Opacity Slider */}
                  <div className="space-y-2 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opacity</label>
                      <span className="font-mono text-xs text-foreground bg-secondary px-2 py-0.5 rounded">
                        {Math.round(activeLayer.opacity * 100)}%
                      </span>
                    </div>
                    <div className="pb-2">
                      <Slider
                        value={Math.round(activeLayer.opacity * 100)}
                        min={0}
                        max={100}
                        onChange={(val) => updateSelectedLayer('opacity', val / 100)}
                      />
                    </div>
                  </div>

                </div>

                {/* Quick Color Presets */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quick Colors</span>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PRESETS.map((c) => (
                      <TooltipSimple key={c} content={c}>
                        <button
                          onClick={() => updateSelectedLayer('color', c)}
                          className={`w-6 h-6 rounded-md border border-black/10 transition-transform ${
                            activeLayer.color.toUpperCase() === c.toUpperCase() ? 'scale-125 ring-2 ring-violet-500' : 'hover:scale-110'
                          }`}
                          style={{ backgroundColor: c }}
                          aria-label={`Select color ${c}`}
                        />
                      </TooltipSimple>
                    ))}
                  </div>
                </div>

              </CardContent>
            </Card>
          )}

          {/* Target Box Customizer */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Maximize className="h-5 w-5 text-violet-500" />
                <CardTitle className="text-lg">Target Box Styling</CardTitle>
              </div>
              <CardDescription>
                Format the dimensions and details of the preview container.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* Width & Height Slider Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 p-3 rounded-xl border border-border/50 bg-muted/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Width</span>
                    <span className="font-mono text-xs">{boxWidth}px</span>
                  </div>
                  <Slider value={boxWidth} min={50} max={400} onChange={setBoxWidth} />
                </div>

                <div className="space-y-2 p-3 rounded-xl border border-border/50 bg-muted/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Height</span>
                    <span className="font-mono text-xs">{boxHeight}px</span>
                  </div>
                  <Slider value={boxHeight} min={50} max={400} onChange={setBoxHeight} />
                </div>
              </div>

              {/* Box Color and Corner Radius */}
              <div className="grid grid-cols-1 md:grid-cols-[160px,1fr] gap-4">
                {/* Box Background */}
                <div className="space-y-2 p-3 rounded-xl border border-border/50 bg-muted/5">
                  <label className="text-xs font-semibold text-muted-foreground">Box BG Color</label>
                  <div className="flex gap-2">
                    <ColorPicker
                      value={boxBgColor}
                      onChange={setBoxBgColor}
                      showText={false}
                      className="w-10 h-10 p-0 rounded-lg"
                    />
                    <Input
                      type="text"
                      value={boxBgColor}
                      onChange={(e) => setBoxBgColor(e.target.value)}
                      className="font-mono text-xs uppercase flex-1 h-10"
                      maxLength={7}
                    />
                  </div>
                </div>

                {/* Border Radius */}
                <div className="space-y-2 p-3 rounded-xl border border-border/50 bg-muted/5 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Border Radius</span>
                    <span className="font-mono text-xs">{borderRadius}px</span>
                  </div>
                  <div className="pb-1">
                    <Slider value={borderRadius} min={0} max={150} onChange={setBorderRadius} />
                  </div>
                </div>
              </div>

              {/* Target Box Border Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 rounded-xl border border-border/50 bg-muted/5">
                {/* Border Width */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-muted-foreground">Border Width</span>
                    <span className="text-xs font-mono">{borderWidth}px</span>
                  </div>
                  <Slider value={borderWidth} min={0} max={20} onChange={setBorderWidth} />
                </div>

                {/* Border Style */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground mb-1 block">Border Style</span>
                  <Select
                    value={borderStyle}
                    onValueChange={(val) => setBorderStyle(val as 'solid' | 'dashed' | 'dotted' | 'double' | 'none')}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select style" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="solid">Solid</SelectItem>
                        <SelectItem value="dashed">Dashed</SelectItem>
                        <SelectItem value="dotted">Dotted</SelectItem>
                        <SelectItem value="double">Double</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {/* Border Color */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">Border Color</span>
                  <div className="flex gap-2">
                    <ColorPicker
                      value={borderColor}
                      onChange={setBorderColor}
                      showText={false}
                      className="w-8 h-8 p-0"
                    />
                    <Input
                      type="text"
                      value={borderColor}
                      onChange={(e) => setBorderColor(e.target.value)}
                      className="font-mono text-xs uppercase flex-1 h-8 px-2"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>

          {/* Preset Swatches Gallery */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-500" />
                <CardTitle className="text-lg">Predefined Presets</CardTitle>
              </div>
              <CardDescription>
                One-click applications of popular layered shadows, borders, and styles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="flex flex-col text-left p-3 rounded-xl border border-border/50 bg-card hover:bg-muted/40 hover:border-violet-400 transition-all shadow-sm"
                  >
                    <span className="text-xs font-bold text-violet-600 dark:text-violet-400">
                      {preset.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {preset.description}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Right Side: Interactive Preview Canvas & Exports */}
        <div className="space-y-6 order-1 lg:order-2">
          
          {/* Visual Shadow Canvas */}
          <Card className="border-border/60 shadow-md overflow-hidden flex flex-col h-[480px]">
            <CardHeader className="pb-2 shrink-0 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Move className="h-5 w-5 text-violet-500" />
                  <CardTitle className="text-base font-semibold">Interactive Canvas</CardTitle>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/65 px-2.5 py-1 rounded-full">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  <span>Drag box to adjust selected layer offset</span>
                </div>
              </div>
            </CardHeader>
            
            {/* Real Canvas Area with Drag Capture */}
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              style={getCanvasBackground()}
              className={`flex-1 relative flex items-center justify-center overflow-hidden transition-all ${
                isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
              }`}
            >
              {/* Grid overlay */}
              {showGrid && (
                <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
              )}

              {/* Target Box containing shadows */}
              <div
                style={{
                  width: `${boxWidth}px`,
                  height: `${boxHeight}px`,
                  backgroundColor: boxBgColor,
                  borderRadius: `${borderRadius}px`,
                  borderStyle: borderWidth > 0 ? borderStyle : 'none',
                  borderWidth: `${borderWidth}px`,
                  borderColor: borderColor,
                  boxShadow: getBoxShadowValue(),
                }}
                className="relative flex items-center justify-center p-4 text-center transition-[width,height,border-radius] duration-200"
              >
                {/* Pointer indicator showing interactive drag focus */}
                {isDragging && activeLayer && (
                  <div className="absolute -top-12 px-3 py-1 bg-violet-600 text-white rounded text-[10px] font-mono pointer-events-none shadow-md z-10 whitespace-nowrap animate-pulse">
                    d: {activeLayer.offsetX}px, {activeLayer.offsetY}px
                  </div>
                )}
                
                {/* Text interior preview */}
                <div className="pointer-events-none max-w-full truncate px-2 select-none">
                  <p className="text-xs font-semibold text-muted-foreground/80 tracking-wide uppercase">Target Box</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">{boxWidth}x{boxHeight}</p>
                </div>
              </div>

              {/* Canvas controls bottom-left (floating) */}
              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 p-1 rounded-xl bg-card/90 backdrop-blur-sm border shadow-sm no-drag">
                <TooltipSimple content="Canvas: Light">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 rounded-lg ${canvasBgType === 'light' ? 'bg-muted' : ''}`}
                    onClick={() => setCanvasBgType('light')}
                    aria-label="Canvas: Light"
                  >
                    <div className="h-4.5 w-4.5 rounded bg-slate-100 border border-slate-300" />
                  </Button>
                </TooltipSimple>
                <TooltipSimple content="Canvas: Dark">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 rounded-lg ${canvasBgType === 'dark' ? 'bg-muted' : ''}`}
                    onClick={() => setCanvasBgType('dark')}
                    aria-label="Canvas: Dark"
                  >
                    <div className="h-4.5 w-4.5 rounded bg-slate-900 border border-slate-700" />
                  </Button>
                </TooltipSimple>
                <TooltipSimple content="Canvas: Checkered">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 rounded-lg ${canvasBgType === 'checkered' ? 'bg-muted' : ''}`}
                    onClick={() => setCanvasBgType('checkered')}
                    aria-label="Canvas: Checkered"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </TooltipSimple>
                <div className="h-5 w-px bg-border/80" />
                {/* Custom bg input */}
                <div className="flex items-center gap-1">
                  <TooltipSimple content="Custom Canvas Color">
                    <ColorPicker
                      value={canvasCustomBg}
                      onChange={(val) => {
                        setCanvasCustomBg(val);
                        setCanvasBgType('custom');
                      }}
                      showText={false}
                      className="w-5 h-5 p-0 border border-black/10 rounded"
                    />
                  </TooltipSimple>
                </div>
                <div className="h-5 w-px bg-border/80" />
                <TooltipSimple content="Grid Overlay">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 rounded-lg ${showGrid ? 'bg-muted text-violet-600' : 'text-muted-foreground'}`}
                    onClick={() => setShowGrid(!showGrid)}
                    aria-label="Grid Overlay"
                  >
                    <LayoutGrid className="h-4 w-4 rotate-45" />
                  </Button>
                </TooltipSimple>
                <div className="h-5 w-px bg-border/80" />
                <TooltipSimple content="Reset Workspace">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={resetAll}
                    aria-label="Reset Workspace"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </TooltipSimple>
              </div>

            </div>
          </Card>

          {/* Generated Code Exporters */}
          <Card className="border-border/60 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Generate Styles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* CSS Box Shadow Property */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">CSS Code</span>
                  <Button
                    size="sm"
                    variant={cssCopy.isCopied ? 'default' : 'outline'}
                    className="h-7 px-2.5 rounded-lg text-xs gap-1.5"
                    onClick={() => cssCopy.copyToClipboard(`box-shadow: ${getBoxShadowValue()};`)}
                  >
                    {cssCopy.isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {cssCopy.isCopied ? 'Copied' : 'Copy CSS'}
                  </Button>
                </div>
                <pre className="p-3 bg-muted dark:bg-muted/40 rounded-xl font-mono text-xs text-foreground border border-border/40 overflow-x-auto scrollbar-thin whitespace-pre">
                  {`box-shadow: ${getBoxShadowValue()};`}
                </pre>
              </div>

              {/* Tailwind CSS Class */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tailwind CSS Utility</span>
                  <Button
                    size="sm"
                    variant={tailwindCopy.isCopied ? 'default' : 'outline'}
                    className="h-7 px-2.5 rounded-lg text-xs gap-1.5"
                    onClick={() => tailwindCopy.copyToClipboard(getTailwindValue())}
                  >
                    {tailwindCopy.isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {tailwindCopy.isCopied ? 'Copied' : 'Copy Class'}
                  </Button>
                </div>
                <div className="p-3 bg-muted dark:bg-muted/40 rounded-xl font-mono text-xs text-foreground border border-border/40 overflow-x-auto scrollbar-thin break-all">
                  {getTailwindValue()}
                </div>
              </div>

            </CardContent>
          </Card>

        </div>

      </div>
    </div>
  );
}
