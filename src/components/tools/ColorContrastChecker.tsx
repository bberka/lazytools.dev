'use client';

import { useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { ColorPicker } from '../ui/color-picker';
import { Eye, Check, X, ArrowLeftRight } from 'lucide-react';
import { checkContrast, type ContrastLevel } from '@/lib/tools/color-contrast-checker';

const LEVEL_COLORS: Record<ContrastLevel, string> = {
  AAA: 'text-green-600 dark:text-green-500',
  AA: 'text-green-600 dark:text-green-500',
  'AA Large': 'text-yellow-600 dark:text-yellow-500',
  Fail: 'text-red-600 dark:text-red-500',
};

function PassFailIcon({ pass }: { pass: boolean }) {
  return pass ? (
    <>
      <Check className="h-5 w-5 text-green-600 dark:text-green-500" aria-hidden="true" />
      <span className="sr-only">Pass</span>
    </>
  ) : (
    <>
      <X className="h-5 w-5 text-red-600 dark:text-red-500" aria-hidden="true" />
      <span className="sr-only">Fail</span>
    </>
  );
}

export function ColorContrastChecker() {
  const [foreground, setForeground] = useState('#000000');
  const [background, setBackground] = useState('#FFFFFF');

  const contrast = useMemo(() => checkContrast(foreground, background), [foreground, background]);
  const contrastResult = contrast.result;

  const handleSwap = () => {
    const temp = foreground;
    setForeground(background);
    setBackground(temp);
  };

  const handleClear = () => {
    setForeground('#000000');
    setBackground('#FFFFFF');
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
                  label="Foreground color"
                  value={contrast.foreground ?? foreground}
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
                  aria-label="Foreground color HEX"
                  aria-invalid={contrast.foreground === null}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Background Color</label>
              <div className="flex gap-2">
                <ColorPicker
                  label="Background color"
                  value={contrast.background ?? background}
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
                  aria-label="Background color HEX"
                  aria-invalid={contrast.background === null}
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
            className="p-4 sm:p-8 rounded-md border border-input"
            style={{
              backgroundColor: contrast.background ?? undefined,
              color: contrast.foreground ?? undefined,
            }}
          >
            <p className="text-base mb-2">Normal text (16px)</p>
            <p className="text-lg font-bold">Large text (18px bold / 24px normal)</p>
          </div>
        </CardContent>
      </Card>

      {/* Contrast Result */}
      <Card>
        <CardHeader>
          <CardTitle>Contrast Ratio</CardTitle>
          <CardDescription>WCAG 2.1 compliance assessment</CardDescription>
        </CardHeader>
        {contrastResult ? (
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className={`text-4xl font-bold sm:text-5xl ${LEVEL_COLORS[contrastResult.level]}`}>
                {contrastResult.ratioLabel}
              </div>
              <div className={`mt-2 text-base font-medium sm:text-lg ${LEVEL_COLORS[contrastResult.level]}`}>
                {contrastResult.level}
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
                    <PassFailIcon pass={contrastResult.passAANormal} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border border-input">
                    <span className="text-sm">AAA (7:1)</span>
                    <PassFailIcon pass={contrastResult.passAAANormal} />
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
                    <PassFailIcon pass={contrastResult.passAALarge} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border border-input">
                    <span className="text-sm">AAA (4.5:1)</span>
                    <PassFailIcon pass={contrastResult.passAAALarge} />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        ) : (
          <CardContent>
            <div role="status" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
              {contrast.error}
            </div>
          </CardContent>
        )}
      </Card>

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
