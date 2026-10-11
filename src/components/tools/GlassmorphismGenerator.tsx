'use client';

import { useMemo, useState, type ComponentProps } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  CreditCard,
  Lock,
  LayoutDashboard,
  Palette,
  Sliders,
  Maximize2,
  Code,
  Info,
  RefreshCw,
  Cpu,
  Wind,
  Atom,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipSimple } from '@/components/ui/tooltip';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ColorPicker } from '@/components/ui/color-picker';
import { useCopyToClipboard } from '@/hooks';
import { normalizeHexColor } from '@/lib/tools/design-color';
import {
  DEFAULT_GLASS_PRESET,
  GLASS_PRESETS,
  buildGlassOutput,
  findGlassPreset,
  type GlassSettings,
} from '@/lib/tools/glassmorphism-generator';

// Type definitions
type PreviewBgType = 'drifting-blobs' | 'sunset-gradient' | 'mesh-gradient' | 'space-grid' | 'solid-dark';
type MockupType = 'credit-card' | 'login-form' | 'dashboard';
type ExportTabType = 'css' | 'tailwind' | 'react';

type GlassColor = 'bgColor' | 'borderColor' | 'shadowColor';

const CORNER_LABELS = ['Top Left', 'Top Right', 'Bottom Right', 'Bottom Left'];

/**
 * Text field for a hex colour. What is being typed stays in the field until it
 * is a whole colour, so a half-typed value never reaches the preview or the
 * generated code.
 */
function HexColorInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Input
      type="text"
      maxLength={7}
      {...props}
      value={draft ?? value}
      aria-invalid={draft !== null && normalizeHexColor(draft) === null}
      onChange={(event) => {
        const text = event.target.value;
        const hex = normalizeHexColor(text);
        setDraft(text);
        if (hex) onChange(hex);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function GlassmorphismGenerator() {
  // Sliders and controls start on "Frosted Light"
  const [settings, setSettings] = useState<GlassSettings>(
    GLASS_PRESETS[DEFAULT_GLASS_PRESET].settings
  );
  const {
    bgColor,
    bgOpacity,
    blur,
    saturate,
    borderWidth,
    borderColor,
    borderOpacity,
    borderRadius,
    isIndividualCorners,
    corners,
    enableShadow,
    shadowColor,
    shadowOpacity,
    shadowBlur,
    shadowSpread,
    shadowX,
    shadowY,
  } = settings;

  // Preview options
  const [previewBg, setPreviewBg] = useState<PreviewBgType>('drifting-blobs');
  const [mockup, setMockup] = useState<MockupType>('credit-card');
  const [exportTab, setExportTab] = useState<ExportTabType>('css');

  const copy = useCopyToClipboard();

  const update = <K extends keyof GlassSettings>(key: K, value: GlassSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  // A setter for one setting, in the shape the sliders and switches call.
  const set =
    <K extends keyof GlassSettings>(key: K) =>
    (value: GlassSettings[K]) =>
      update(key, value);

  // The colour picker can also report "none"; the glass needs a real colour.
  const setColor = (key: GlassColor) => (value: string) => {
    const hex = normalizeHexColor(value);
    if (hex) update(key, hex);
  };

  const setCorner = (index: number, value: number) => {
    setSettings((current) => {
      const next: GlassSettings['corners'] = [...current.corners];
      next[index] = Math.max(0, Math.min(100, value));
      return { ...current, corners: next };
    });
  };

  // Handle Preset Selection
  const applyPreset = (key: string) => {
    const preset = GLASS_PRESETS[key];
    if (preset) setSettings(preset.settings);
  };

  // The preset the current values match, if any
  const activePreset = useMemo(() => findGlassPreset(settings), [settings]);

  // Card style and the CSS, Tailwind and React snippets
  const output = useMemo(() => buildGlassOutput(settings), [settings]);

  // Copy helper
  const handleCopyCode = () => {
    copy.copyToClipboard(
      exportTab === 'css' ? output.css : exportTab === 'tailwind' ? output.tailwind : output.react
    );
  };

  return (
    <div className="space-y-6">
      {/* Global CSS Stylesheet inject for keyframe blobs */}
      <style jsx global>{`
        @keyframes float-blob-1 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(60px, -80px) scale(1.15); }
          66% { transform: translate(-40px, 40px) scale(0.85); }
        }
        @keyframes float-blob-2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-80px, 60px) scale(1.1); }
        }
        @keyframes float-blob-3 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          40% { transform: translate(80px, 40px) scale(0.9); }
        }
        .animate-blob-1 { animation: float-blob-1 16s infinite ease-in-out; }
        .animate-blob-2 { animation: float-blob-2 20s infinite ease-in-out; }
        .animate-blob-3 { animation: float-blob-3 14s infinite ease-in-out; }
      `}</style>

      {/* Hero Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Glassmorphism Generator
          </CardTitle>
          <CardDescription>
            Design premium CSS and Tailwind frosted glass filters with fluid drift background previews and responsive code generation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quick Presets</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(GLASS_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  aria-pressed={activePreset === key}
                  className={`group relative flex flex-col items-center justify-center rounded-2xl border px-3 py-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    activePreset === key
                      ? 'border-primary bg-primary/5 shadow-[0_0_12px_hsl(var(--primary)/0.15)] ring-2 ring-primary/20'
                      : 'border-border/70 bg-card hover:border-border hover:bg-muted/30'
                  }`}
                >
                  <span className="text-sm font-medium text-foreground">{preset.name}</span>
                  <div
                    className="mt-2.5 h-6 w-12 rounded-lg border border-white/20 shadow-sm"
                    style={{
                      background: preset.settings.bgColor,
                      opacity: preset.settings.bgOpacity / 100 + 0.1,
                      backdropFilter: `blur(${preset.settings.blur}px)`,
                      boxShadow: preset.settings.enableShadow ? '0 4px 8px rgba(0,0,0,0.1)' : 'none',
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Interactive Grid */}
      {/* grid-cols-1 keeps the column as wide as the page: without it a long line of generated code widens the column instead of scrolling inside its box */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]">
        
        {/* Left Side: Interactive Live Preview Playground */}
        <div className="flex flex-col gap-4 sm:gap-6">
          <Card className="flex flex-1 flex-col overflow-hidden">
            <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Maximize2 className="h-4 w-4" />
                  Live Playground
                </CardTitle>
                <CardDescription>Drag sliders on the right and watch the glass refract shapes in real-time.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground mr-1">Preview Card Content:</span>
                <div className="flex rounded-lg border border-border/70 bg-muted/30 p-0.5">
                  <TooltipSimple content="Credit Card mockup">
                    <Button
                      size="sm"
                      variant={mockup === 'credit-card' ? 'default' : 'ghost'}
                      className="h-7 px-2.5 text-xs rounded-md"
                      onClick={() => setMockup('credit-card')}
                      aria-label="Credit Card mockup"
                      aria-pressed={mockup === 'credit-card'}
                    >
                      <CreditCard className="h-3.5 w-3.5 mr-1" />
                      Card
                    </Button>
                  </TooltipSimple>
                  <TooltipSimple content="Login form mockup">
                    <Button
                      size="sm"
                      variant={mockup === 'login-form' ? 'default' : 'ghost'}
                      className="h-7 px-2.5 text-xs rounded-md"
                      onClick={() => setMockup('login-form')}
                      aria-label="Login form mockup"
                      aria-pressed={mockup === 'login-form'}
                    >
                      <Lock className="h-3.5 w-3.5 mr-1" />
                      Login
                    </Button>
                  </TooltipSimple>
                  <TooltipSimple content="Dashboard widget mockup">
                    <Button
                      size="sm"
                      variant={mockup === 'dashboard' ? 'default' : 'ghost'}
                      className="h-7 px-2.5 text-xs rounded-md"
                      onClick={() => setMockup('dashboard')}
                      aria-label="Dashboard widget mockup"
                      aria-pressed={mockup === 'dashboard'}
                    >
                      <LayoutDashboard className="h-3.5 w-3.5 mr-1" />
                      Stats
                    </Button>
                  </TooltipSimple>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 items-center justify-center p-4 sm:p-6 bg-muted/10 relative min-h-[420px] rounded-b-xl overflow-hidden">
              
              {/* --- BACKGROUND PATTERNS --- */}

              {/* Pattern 1: Animated Drifting Blobs */}
              {previewBg === 'drifting-blobs' && (
                <div className="absolute inset-0 bg-[#0f172a] overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(30,41,59,0.7),transparent)]" />
                  {/* Floating Blobs */}
                  <div className="absolute -top-12 -left-12 h-64 w-64 rounded-full bg-gradient-to-tr from-purple-500/40 to-pink-500/40 blur-3xl animate-blob-1" />
                  <div className="absolute -bottom-16 -right-16 h-72 w-72 rounded-full bg-gradient-to-tr from-blue-500/40 to-teal-500/40 blur-3xl animate-blob-2" />
                  <div className="absolute top-1/3 left-1/3 h-52 w-52 rounded-full bg-gradient-to-tr from-amber-500/35 to-rose-500/35 blur-3xl animate-blob-3" />
                  
                  {/* Background grid overlay */}
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:32px_32px] opacity-20" />
                </div>
              )}

              {/* Pattern 2: Sunset Gradient */}
              {previewBg === 'sunset-gradient' && (
                <div className="absolute inset-0 bg-gradient-to-tr from-orange-600 via-rose-600 to-indigo-800">
                  <div className="absolute top-10 left-10 w-24 h-24 rounded-full bg-yellow-400 blur-md opacity-80" />
                  <div className="absolute inset-0 bg-black/10 backdrop-brightness-95" />
                </div>
              )}

              {/* Pattern 3: Mesh Gradient */}
              {previewBg === 'mesh-gradient' && (
                <div className="absolute inset-0 bg-indigo-900 overflow-hidden">
                  <div className="absolute -top-1/4 -left-1/4 w-full h-full rounded-full bg-cyan-500/50 blur-3xl" />
                  <div className="absolute -bottom-1/4 -right-1/4 w-full h-full rounded-full bg-pink-500/50 blur-3xl" />
                  <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full bg-purple-600/50 blur-3xl" />
                </div>
              )}

              {/* Pattern 4: Space Grid */}
              {previewBg === 'space-grid' && (
                <div className="absolute inset-0 bg-black overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#334155_1px,transparent_1px),linear-gradient(to_bottom,#334155_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-40" />
                  <div className="w-80 h-80 rounded-full bg-violet-600/30 blur-[120px] absolute" />
                </div>
              )}

              {/* Pattern 5: Solid Dark */}
              {previewBg === 'solid-dark' && (
                <div className="absolute inset-0 bg-[#0b0f19] flex items-center justify-center">
                  <div className="w-48 h-48 rounded-full bg-primary/20 blur-[80px]" />
                </div>
              )}

              {/* --- PREVIEW GLASS CARD --- */}
              <div 
                style={output.style}
                className="w-full max-w-sm relative z-10 transition-all duration-300 p-6 flex flex-col justify-between"
              >
                
                {/* Mockup 1: CREDIT CARD */}
                {mockup === 'credit-card' && (
                  <div className="space-y-8 select-none text-white font-sans">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-[0.2em] opacity-65">Glass Card</span>
                        <span className="text-xs font-semibold mt-0.5">Premium Platinum</span>
                      </div>
                      <Cpu className="h-8 w-8 text-amber-300/80 stroke-[1.5]" />
                    </div>

                    <div className="space-y-1">
                      <div className="font-mono text-lg tracking-[0.18em] text-white/90">
                        4582 •••• •••• 9210
                      </div>
                      <div className="flex gap-4 text-[9px] uppercase tracking-wider text-white/60">
                        <span>Valid Thru: 08/29</span>
                        <span>CVV: ***</span>
                      </div>
                    </div>

                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-[9px] uppercase tracking-wider opacity-60">Cardholder Name</p>
                        <p className="text-sm font-semibold tracking-wide mt-0.5">BERKAY BAYAR</p>
                      </div>
                      {/* Mastercard logo mockup */}
                      <div className="flex -space-x-3">
                        <div className="h-7 w-7 rounded-full bg-rose-500/80 backdrop-blur-xs" />
                        <div className="h-7 w-7 rounded-full bg-amber-500/85 backdrop-blur-xs" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Mockup 2: LOGIN DIALOG */}
                {mockup === 'login-form' && (
                  <div className="space-y-5 text-white">
                    <div className="text-center space-y-1">
                      <h3 className="text-base font-semibold tracking-wide">Welcome Back</h3>
                      <p className="text-xs text-white/60">Sign in to your glass-portal</p>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-white/60">Email</label>
                        <div className="h-9 w-full rounded-lg bg-white/10 border border-white/20 px-3 flex items-center text-xs text-white/70">
                          user@lazytools.dev
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-white/60">Password</label>
                        <div className="h-9 w-full rounded-lg bg-white/10 border border-white/20 px-3 flex items-center justify-between text-xs text-white/70">
                          ••••••••••••
                          <Lock className="h-3.5 w-3.5 opacity-50" />
                        </div>
                      </div>
                    </div>

                    <button 
                      type="button"
                      className="w-full h-9 rounded-lg bg-white text-black font-semibold text-xs tracking-wide hover:bg-white/90 transition shadow-md flex items-center justify-center"
                    >
                      Authenticate
                    </button>
                  </div>
                )}

                {/* Mockup 3: DASHBOARD STATS */}
                {mockup === 'dashboard' && (
                  <div className="space-y-4 text-white">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-xs font-semibold">Real-Time Metrics</span>
                      </div>
                      <span className="text-[9px] uppercase tracking-widest bg-white/10 px-1.5 py-0.5 rounded">Live</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-white/5 border border-white/10 p-2.5 space-y-0.5">
                        <span className="text-[9px] uppercase text-white/50 tracking-wider">Conversion</span>
                        <p className="text-base font-bold">14.82%</p>
                        <p className="text-[9px] text-green-400 font-medium">+2.4% today</p>
                      </div>
                      <div className="rounded-lg bg-white/5 border border-white/10 p-2.5 space-y-0.5">
                        <span className="text-[9px] uppercase text-white/50 tracking-wider">Pageviews</span>
                        <p className="text-base font-bold">8.4K</p>
                        <p className="text-[9px] text-indigo-300 font-medium">94 active now</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] text-white/60">
                        <span>Memory Load</span>
                        <span>64%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full" style={{ width: '64%' }} />
                      </div>
                    </div>
                  </div>
                )}

              </div>

            </CardContent>
            
            {/* Preview Background Switcher */}
            <div className="border-t border-border/70 p-3 bg-muted/20 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5 text-primary" />
                Change background under glass:
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {(['drifting-blobs', 'sunset-gradient', 'mesh-gradient', 'space-grid', 'solid-dark'] as PreviewBgType[]).map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    onClick={() => setPreviewBg(bg)}
                    aria-pressed={previewBg === bg}
                    className={`h-7 px-2.5 text-[11px] rounded-lg border font-medium capitalize transition-all ${
                      previewBg === bg
                        ? 'bg-foreground text-background border-foreground'
                        : 'border-border/80 bg-background text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                    }`}
                  >
                    {bg.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Export Code Box */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Code className="h-4 w-4" />
                  Generated Code
                </CardTitle>
                <CardDescription>Copy standard CSS rules or Tailwind utilities for your components.</CardDescription>
              </div>
              <Tabs value={exportTab} onValueChange={(val) => setExportTab(val as ExportTabType)} className="w-full sm:w-auto">
                <TabsList className="grid grid-cols-3 w-full sm:w-64 h-auto p-0.5 bg-muted/30 border border-border/70 rounded-lg">
                  <TabsTrigger value="css" className="flex items-center gap-1.5 text-xs py-1.5 h-auto">
                    <Code className="h-3.5 w-3.5" />
                    CSS
                  </TabsTrigger>
                  <TabsTrigger value="tailwind" className="flex items-center gap-1.5 text-xs py-1.5 h-auto">
                    <Wind className="h-3.5 w-3.5" />
                    Tailwind
                  </TabsTrigger>
                  <TabsTrigger value="react" className="flex items-center gap-1.5 text-xs py-1.5 h-auto">
                    <Atom className="h-3.5 w-3.5" />
                    React
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative group">
                <pre className="overflow-x-auto scrollbar-thin rounded-xl border border-border bg-muted/40 p-4 font-mono text-xs text-foreground leading-relaxed min-h-36">
                  {exportTab === 'css' && output.css}
                  {exportTab === 'tailwind' && output.tailwind}
                  {exportTab === 'react' && output.react}
                </pre>
                <TooltipSimple content="Copy code">
                  <Button
                    size="icon"
                    variant={copy.isCopied ? 'default' : 'outline'}
                    onClick={handleCopyCode}
                    className="absolute right-3 top-3 h-8 w-8 rounded-lg shadow-sm transition hover:scale-105"
                    aria-label="Copy code"
                  >
                    {copy.isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </TooltipSimple>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="leading-normal">
                  {exportTab === 'css' && "Backdrop-filter is fully supported by all modern browsers. Make sure your parent container has a colorful background for the blur effect to be visible."}
                  {exportTab === 'tailwind' && "The inline arbitrary values syntax (e.g. backdrop-blur-[16px]) allows you to copy-paste exact CSS values directly without editing your tailwind.config.js."}
                  {exportTab === 'react' && "React style objects are clean inline replacements. Note that WebkitBackdropFilter is included specifically for Safari browser compliance."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Style Control Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b border-border/70">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Sliders className="h-4 w-4 text-primary" />
                Customize Effect
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 space-y-6">
              
              {/* SECTION: Color & Transparency */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
                  Background Overlay
                </h3>
                
                <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/20 px-3.5 py-3">
                  <ColorPicker
                    label="Background overlay color"
                    value={bgColor}
                    onChange={setColor('bgColor')}
                    showText={false}
                    className="relative h-10 w-10 shrink-0 rounded-lg border border-border/80"
                  />
                  <div className="min-w-0 flex-1">
                    <label className="text-xs font-semibold text-muted-foreground block uppercase tracking-wider">HEX Code</label>
                    <HexColorInput
                      value={bgColor}
                      onChange={setColor('bgColor')}
                      placeholder="#ffffff"
                      className="h-8 border-none bg-transparent px-0 font-mono text-sm uppercase shadow-none focus-visible:ring-0"
                      aria-label="Background overlay color HEX"
                    />
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/10 p-3.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span>OPACITY</span>
                    <span className="font-mono text-foreground">{bgOpacity}%</span>
                  </div>
                  <Slider aria-label="Overlay opacity"
                    value={bgOpacity}
                    min={0}
                    max={100}
                    step={1}
                    onChange={set('bgOpacity')}
                  />
                </div>
              </div>

              {/* SECTION: Blur & Filters */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Backdrop Filters
                </h3>

                <div className="space-y-4 rounded-xl border border-border bg-muted/10 p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                      <span>BACKDROP BLUR</span>
                      <span className="font-mono text-foreground">{blur}px</span>
                    </div>
                    <Slider aria-label="Backdrop blur"
                      value={blur}
                      min={0}
                      max={40}
                      step={1}
                      onChange={set('blur')}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                      <span>SATURATION</span>
                      <span className="font-mono text-foreground">{saturate}%</span>
                    </div>
                    <Slider aria-label="Saturation"
                      value={saturate}
                      min={50}
                      max={200}
                      step={5}
                      onChange={set('saturate')}
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: Borders */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Glass Border
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Enable</span>
                    <Switch
                      checked={borderWidth > 0}
                      onCheckedChange={(checked) => update('borderWidth', checked ? 1 : 0)}
                      aria-label="Enable glass border"
                    />
                  </div>
                </div>

                {borderWidth > 0 && (
                  <div className="space-y-4 rounded-xl border border-border bg-muted/10 p-4">
                    <div className="flex items-center gap-3">
                      <ColorPicker
                        label="Border color"
                        value={borderColor}
                        onChange={setColor('borderColor')}
                        showText={false}
                        className="h-8 w-8 rounded-md border border-border"
                      />
                      <div className="flex-1">
                        <HexColorInput
                          value={borderColor}
                          onChange={setColor('borderColor')}
                          placeholder="#ffffff"
                          className="h-8 border-none bg-transparent px-0 font-mono text-xs uppercase shadow-none focus-visible:ring-0"
                          aria-label="Border color HEX"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                        <span>BORDER WIDTH</span>
                        <span className="font-mono text-foreground">{borderWidth}px</span>
                      </div>
                      <Slider aria-label="Border width"
                        value={borderWidth}
                        min={1}
                        max={5}
                        step={0.5}
                        onChange={set('borderWidth')}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                        <span>BORDER OPACITY</span>
                        <span className="font-mono text-foreground">{borderOpacity}%</span>
                      </div>
                      <Slider aria-label="Border opacity"
                        value={borderOpacity}
                        min={0}
                        max={100}
                        step={1}
                        onChange={set('borderOpacity')}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: Corners */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Corner Rounding
                  </h3>
                  <Checkbox
                    checked={isIndividualCorners}
                    onChange={set('isIndividualCorners')}
                    label="Split Corners"
                  />
                </div>

                {!isIndividualCorners ? (
                  <div className="space-y-2 rounded-xl border border-border/60 bg-muted/10 p-3.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                      <span>BORDER RADIUS</span>
                      <span className="font-mono text-foreground">{borderRadius}px</span>
                    </div>
                    <Slider aria-label="Border radius"
                      value={borderRadius}
                      min={0}
                      max={60}
                      step={1}
                      onChange={set('borderRadius')}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3.5 rounded-xl border border-border bg-muted/10 p-4">
                    {CORNER_LABELS.map((label, index) => (
                      <div key={label} className="space-y-1.5">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase">{label}</span>
                        <Input
                          type="number"
                          value={corners[index]}
                          onChange={(e) => setCorner(index, Number(e.target.value))}
                          className="h-8 font-mono text-xs"
                          aria-label={`${label} radius`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION: Box Shadow */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Drop Shadow
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Enable</span>
                    <Switch
                      checked={enableShadow}
                      onCheckedChange={set('enableShadow')}
                      aria-label="Enable drop shadow"
                    />
                  </div>
                </div>

                {enableShadow && (
                  <div className="space-y-4 rounded-xl border border-border bg-muted/10 p-4">
                    <div className="flex items-center gap-3">
                      <ColorPicker
                        label="Shadow color"
                        value={shadowColor}
                        onChange={setColor('shadowColor')}
                        showText={false}
                        className="h-8 w-8 rounded-md border border-border"
                      />
                      <div className="flex-1">
                        <HexColorInput
                          value={shadowColor}
                          onChange={setColor('shadowColor')}
                          placeholder="#000000"
                          className="h-8 border-none bg-transparent px-0 font-mono text-xs uppercase shadow-none focus-visible:ring-0"
                          aria-label="Shadow color HEX"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                        <span>BLUR RADIUS</span>
                        <span className="font-mono text-foreground">{shadowBlur}px</span>
                      </div>
                      <Slider aria-label="Shadow blur radius"
                        value={shadowBlur}
                        min={0}
                        max={100}
                        step={1}
                        onChange={set('shadowBlur')}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                        <span>SPREAD RADIUS</span>
                        <span className="font-mono text-foreground">{shadowSpread}px</span>
                      </div>
                      <Slider aria-label="Shadow spread radius"
                        value={shadowSpread}
                        min={0}
                        max={20}
                        step={1}
                        onChange={set('shadowSpread')}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                        <span>OPACITY</span>
                        <span className="font-mono text-foreground">{shadowOpacity}%</span>
                      </div>
                      <Slider aria-label="Shadow opacity"
                        value={shadowOpacity}
                        min={0}
                        max={100}
                        step={1}
                        onChange={set('shadowOpacity')}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase">Offset X</span>
                        <Input
                          type="number"
                          value={shadowX}
                          onChange={(e) => update('shadowX', Number(e.target.value))}
                          className="h-8 font-mono text-xs"
                          aria-label="Shadow offset X"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase">Offset Y</span>
                        <Input
                          type="number"
                          value={shadowY}
                          onChange={(e) => update('shadowY', Number(e.target.value))}
                          className="h-8 font-mono text-xs"
                          aria-label="Shadow offset Y"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Reset Controls Button */}
              <Button
                variant="outline"
                onClick={() => applyPreset(DEFAULT_GLASS_PRESET)}
                className="w-full rounded-xl gap-2 mt-2 h-11 border-dashed"
              >
                <RefreshCw className="h-4 w-4" />
                Reset Styles to Frosted Light
              </Button>

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
