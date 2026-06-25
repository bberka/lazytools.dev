'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { ColorPicker } from '../ui/color-picker';
import { Eye, Check, X, ArrowLeftRight } from 'lucide-react';

interface ContrastResult {
  ratio: number;
  passAANormal: boolean;
  passAALarge: boolean;
  passAAANormal: boolean;
  passAAALarge: boolean;
}

export function ColorContrastChecker() {
  const [foreground, setForeground] = useState('#000000');
  const [background, setBackground] = useState('#FFFFFF');
  const [contrastResult, setContrastResult] = useState<ContrastResult | null>(null);

  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };

  const getLuminance = (r: number, g: number, b: number): number => {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const getContrastRatio = (fg: string, bg: string): number => {
    const fgRgb = hexToRgb(fg);
    const bgRgb = hexToRgb(bg);

    if (!fgRgb || !bgRgb) return 0;

    const fgLum = getLuminance(fgRgb.r, fgRgb.g, fgRgb.b);
    const bgLum = getLuminance(bgRgb.r, bgRgb.g, bgRgb.b);

    const lighter = Math.max(fgLum, bgLum);
    const darker = Math.min(fgLum, bgLum);

    return (lighter + 0.05) / (darker + 0.05);
  };

  const calculateContrast = () => {
    const ratio = getContrastRatio(foreground, background);

    setContrastResult({
      ratio,
      passAANormal: ratio >= 4.5,
      passAALarge: ratio >= 3,
      passAAANormal: ratio >= 7,
      passAAALarge: ratio >= 4.5,
    });
  };

  useEffect(() => {
    calculateContrast();
  }, [foreground, background]);

  const handleSwap = () => {
    const temp = foreground;
    setForeground(background);
    setBackground(temp);
  };

  const handleClear = () => {
    setForeground('#000000');
    setBackground('#FFFFFF');
  };

  const getContrastLevel = (ratio: number): string => {
    if (ratio >= 7) return 'AAA';
    if (ratio >= 4.5) return 'AA';
    if (ratio >= 3) return 'AA Large';
    return 'Fail';
  };

  const getContrastLevelColor = (ratio: number): string => {
    if (ratio >= 7) return 'text-green-600 dark:text-green-500';
    if (ratio >= 4.5) return 'text-green-600 dark:text-green-500';
    if (ratio >= 3) return 'text-yellow-600 dark:text-yellow-500';
    return 'text-red-600 dark:text-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Color Inputs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Color Contrast Checker
          </CardTitle>
          <CardDescription>
            Check color contrast ratios for WCAG 2.1 compliance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Foreground Color (Text)</label>
              <div className="flex gap-2">
                <ColorPicker
                  value={foreground}
                  onChange={setForeground}
                  showText={false}
                  className="w-16 h-10 rounded border"
                />
                <Input
                  type="text"
                  value={foreground}
                  onChange={(e) => setForeground((e.target as HTMLInputElement).value)}
                  placeholder="#000000"
                  className="flex-1 font-mono uppercase"
                  maxLength={7}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Background Color</label>
              <div className="flex gap-2">
                <ColorPicker
                  value={background}
                  onChange={setBackground}
                  showText={false}
                  className="w-16 h-10 rounded border"
                />
                <Input
                  type="text"
                  value={background}
                  onChange={(e) => setBackground((e.target as HTMLInputElement).value)}
                  placeholder="#FFFFFF"
                  className="flex-1 font-mono uppercase"
                  maxLength={7}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSwap} variant="outline">
          <ArrowLeftRight className="h-4 w-4 mr-2" />
          Swap Colors
        </Button>
        <Button variant="outline" onClick={handleClear}>
          Reset to Default
        </Button>
      </div>

      {/* Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>See how the colors look together</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="p-8 rounded-md border border-input"
            style={{ backgroundColor: background, color: foreground }}
          >
            <p className="text-base mb-2">Normal text (16px)</p>
            <p className="text-lg font-bold">Large text (18px bold / 24px normal)</p>
          </div>
        </CardContent>
      </Card>

      {/* Contrast Result */}
      {contrastResult && (
        <Card>
          <CardHeader>
            <CardTitle>Contrast Ratio</CardTitle>
            <CardDescription>WCAG 2.1 compliance assessment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className={`text-4xl font-bold sm:text-5xl ${getContrastLevelColor(contrastResult.ratio)}`}>
                {contrastResult.ratio.toFixed(2)}:1
              </div>
              <div className={`mt-2 text-base font-medium sm:text-lg ${getContrastLevelColor(contrastResult.ratio)}`}>
                {getContrastLevel(contrastResult.ratio)}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Normal Text */}
              <div className="space-y-3">
                <h3 className="font-medium text-sm text-muted-foreground">
                  Normal Text (&lt; 18px)
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-md border border-input">
                    <span className="text-sm">AA (4.5:1)</span>
                    {contrastResult.passAANormal ? (
                      <Check className="h-5 w-5 text-green-600 dark:text-green-500" />
                    ) : (
                      <X className="h-5 w-5 text-red-600 dark:text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border border-input">
                    <span className="text-sm">AAA (7:1)</span>
                    {contrastResult.passAAANormal ? (
                      <Check className="h-5 w-5 text-green-600 dark:text-green-500" />
                    ) : (
                      <X className="h-5 w-5 text-red-600 dark:text-red-500" />
                    )}
                  </div>
                </div>
              </div>

              {/* Large Text */}
              <div className="space-y-3">
                <h3 className="font-medium text-sm text-muted-foreground">
                  Large Text (≥ 18px / 14px bold)
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-md border border-input">
                    <span className="text-sm">AA (3:1)</span>
                    {contrastResult.passAALarge ? (
                      <Check className="h-5 w-5 text-green-600 dark:text-green-500" />
                    ) : (
                      <X className="h-5 w-5 text-red-600 dark:text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border border-input">
                    <span className="text-sm">AAA (4.5:1)</span>
                    {contrastResult.passAAALarge ? (
                      <Check className="h-5 w-5 text-green-600 dark:text-green-500" />
                    ) : (
                      <X className="h-5 w-5 text-red-600 dark:text-red-500" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Information Card */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="text-blue-600 dark:text-blue-500">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="text-sm space-y-2">
              <p className="font-medium">WCAG 2.1 Contrast Requirements</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li><strong>AA (Minimum)</strong> - 4.5:1 for normal text, 3:1 for large text</li>
                <li><strong>AAA (Enhanced)</strong> - 7:1 for normal text, 4.5:1 for large text</li>
                <li><strong>Large Text</strong> - 18px or larger, or 14px bold or larger</li>
                <li>Higher ratios provide better accessibility for users with vision impairments</li>
                <li>Colors update in real-time as you type or use color pickers</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Access Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Common Color Combinations</CardTitle>
          <CardDescription>Click to test popular color pairs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setForeground('#000000');
                setBackground('#FFFFFF');
              }}
              className="h-auto flex-col gap-1 p-3"
            >
              <div className="flex gap-1">
                <div className="w-6 h-6 rounded border" style={{ background: '#000000' }} />
                <div className="w-6 h-6 rounded border" style={{ background: '#FFFFFF' }} />
              </div>
              <span className="text-xs">Black/White</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setForeground('#FFFFFF');
                setBackground('#000000');
              }}
              className="h-auto flex-col gap-1 p-3"
            >
              <div className="flex gap-1">
                <div className="w-6 h-6 rounded border" style={{ background: '#FFFFFF' }} />
                <div className="w-6 h-6 rounded border" style={{ background: '#000000' }} />
              </div>
              <span className="text-xs">White/Black</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setForeground('#0066CC');
                setBackground('#FFFFFF');
              }}
              className="h-auto flex-col gap-1 p-3"
            >
              <div className="flex gap-1">
                <div className="w-6 h-6 rounded border" style={{ background: '#0066CC' }} />
                <div className="w-6 h-6 rounded border" style={{ background: '#FFFFFF' }} />
              </div>
              <span className="text-xs">Blue/White</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setForeground('#FFFFFF');
                setBackground('#1E293B');
              }}
              className="h-auto flex-col gap-1 p-3"
            >
              <div className="flex gap-1">
                <div className="w-6 h-6 rounded border" style={{ background: '#FFFFFF' }} />
                <div className="w-6 h-6 rounded border" style={{ background: '#1E293B' }} />
              </div>
              <span className="text-xs">White/Slate</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
