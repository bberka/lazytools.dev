'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { TooltipSimple } from '../ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { ColorPicker } from '../ui/color-picker';
import { Copy, Check, Pen, Download, Maximize2 } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';

interface PathInfo {
  commandCount: number;
  length: number;
  commands: { [key: string]: number };
}

export function SvgPathEditor() {
  const [pathData, setPathData] = useState('M 10 10 H 90 V 90 H 10 L 10 10');
  const [viewBox, setViewBox] = useState('0 0 100 100');
  const [strokeWidth, setStrokeWidth] = useState('2');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [fillColor, setFillColor] = useState('none');
  const [optimizedPath, setOptimizedPath] = useState('');
  const [pathInfo, setPathInfo] = useState<PathInfo | null>(null);
  const [error, setError] = useState('');

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const analyzePath = (path: string): PathInfo => {
    const commands: { [key: string]: number } = {};
    let commandCount = 0;

    // Count SVG commands
    const commandPattern = /[MmLlHhVvCcSsQqTtAaZz]/g;
    const matches = path.match(commandPattern) || [];

    matches.forEach((cmd) => {
      const upperCmd = cmd.toUpperCase();
      commands[upperCmd] = (commands[upperCmd] || 0) + 1;
      commandCount++;
    });

    return {
      commandCount,
      length: path.length,
      commands,
    };
  };

  const optimizePath = (path: string): string => {
    const optimized = path
      // Remove unnecessary whitespace
      .replace(/\s+/g, ' ')
      .trim()
      // Remove spaces around commas
      .replace(/\s*,\s*/g, ',')
      // Remove spaces after commands
      .replace(/([MmLlHhVvCcSsQqTtAaZz])\s+/g, '$1')
      // Remove leading zeros from decimals
      .replace(/\b0+(\.\d+)/g, '$1')
      // Remove trailing zeros from decimals
      .replace(/(\.\d*?)0+\b/g, '$1')
      .replace(/\.\b/g, '');

    return optimized;
  };

  useEffect(() => {
    if (pathData) {
      try {
        const info = analyzePath(pathData);
        setPathInfo(info);
        const opt = optimizePath(pathData);
        setOptimizedPath(opt);
        setError('');
      } catch (err) {
        setError('Invalid SVG path data');
        setPathInfo(null);
        setOptimizedPath('');
      }
    } else {
      setPathInfo(null);
      setOptimizedPath('');
    }
  }, [pathData]);

  const handleCopy = async (text: string) => {
    await copyToClipboard(text);
  };

  const handleDownloadSVG = () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
  <path d="${pathData}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="${fillColor}"/>
</svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'path.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setPathData('');
    setOptimizedPath('');
    setPathInfo(null);
    setError('');
  };

  const handleUseOptimized = () => {
    if (optimizedPath) {
      setPathData(optimizedPath);
    }
  };

  const getSavingsPercentage = (): string => {
    if (!optimizedPath || !pathData) return '0';
    const savings = ((pathData.length - optimizedPath.length) / pathData.length) * 100;
    return savings.toFixed(1);
  };

  return (
    <div className="space-y-6">
      {/* Path Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pen className="h-5 w-5" />
            SVG Path Data
          </CardTitle>
          <CardDescription>Enter SVG path data to edit and visualize</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={pathData}
            onChange={(e) => setPathData((e.target as HTMLTextAreaElement).value)}
            placeholder="M 10 10 H 90 V 90 H 10 L 10 10"
            rows={4}
            className="font-mono text-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">ViewBox</label>
              <Input
                type="text"
                value={viewBox}
                onChange={(e) => setViewBox((e.target as HTMLInputElement).value)}
                placeholder="0 0 100 100"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Stroke Width</label>
              <Input
                type="number"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth((e.target as HTMLInputElement).value)}
                placeholder="2"
                min="0"
                step="0.5"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Stroke Color</label>
              <div className="flex gap-2">
                <ColorPicker
                  value={strokeColor}
                  onChange={setStrokeColor}
                  showText={false}
                  className="w-16 h-10 rounded border"
                />
                <Input
                  type="text"
                  value={strokeColor}
                  onChange={(e) => setStrokeColor((e.target as HTMLInputElement).value)}
                  placeholder="#000000"
                  className="flex-1 font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Fill Color</label>
              <div className="flex gap-2">
                <ColorPicker
                  value={fillColor === 'none' ? '#ffffff' : fillColor}
                  onChange={setFillColor}
                  disabled={fillColor === 'none'}
                  showText={false}
                  className="w-16 h-10 rounded border"
                />
                <Input
                  type="text"
                  value={fillColor}
                  onChange={(e) => setFillColor((e.target as HTMLInputElement).value)}
                  placeholder="none"
                  className="flex-1 font-mono"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleDownloadSVG} disabled={!pathData}>
          <Download className="h-4 w-4 mr-2" />
          Download SVG
        </Button>
        <Button variant="outline" onClick={handleClear}>
          Clear
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Preview */}
      {pathData && !error && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Visual representation of the SVG path</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center items-center p-8 bg-muted rounded-md">
              <svg
                viewBox={viewBox}
                className="max-w-full h-auto border border-input"
                style={{ maxHeight: '400px' }}
              >
                <path
                  d={pathData}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  fill={fillColor}
                />
              </svg>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Path Analysis */}
      {pathInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Path Analysis</CardTitle>
            <CardDescription>Information about the SVG path</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">
                  Total Commands
                </label>
                <div className="p-2 rounded-md bg-muted text-sm font-mono">
                  {pathInfo.commandCount}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">
                  Path Length
                </label>
                <div className="p-2 rounded-md bg-muted text-sm font-mono">
                  {pathInfo.length} characters
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">
                  Command Types
                </label>
                <div className="p-2 rounded-md bg-muted text-sm font-mono">
                  {Object.keys(pathInfo.commands).length}
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Command Breakdown
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(pathInfo.commands).map(([cmd, count]) => (
                  <div key={cmd} className="p-2 rounded-md bg-muted text-sm">
                    <span className="font-mono font-bold">{cmd}</span>: {count}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Optimized Path */}
      {optimizedPath && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Optimized Path</CardTitle>
              <CardDescription>
                {optimizedPath.length} characters ({getSavingsPercentage()}% smaller)
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <TooltipSimple content="Use optimized path">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUseOptimized}
                  aria-label="Use optimized path"
                >
                  <Maximize2 className="h-4 w-4 mr-2" />
                  Use
                </Button>
              </TooltipSimple>
              <TooltipSimple content={isCopied ? 'Copied!' : 'Copy to clipboard'}>
                <Button
                  variant={isCopied ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => handleCopy(optimizedPath)}
                  aria-label="Copy optimized path"
                >
                  {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </TooltipSimple>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="w-full min-h-[60px] p-3 rounded-md bg-muted font-mono text-sm overflow-x-auto scrollbar-thin whitespace-pre-wrap break-all border border-input">
              {optimizedPath}
            </pre>
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
              <p className="font-medium">SVG Path Commands</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li><strong>M/m</strong> - Move to (absolute/relative)</li>
                <li><strong>L/l</strong> - Line to (absolute/relative)</li>
                <li><strong>H/h</strong> - Horizontal line (absolute/relative)</li>
                <li><strong>V/v</strong> - Vertical line (absolute/relative)</li>
                <li><strong>C/c</strong> - Cubic Bézier curve (absolute/relative)</li>
                <li><strong>Q/q</strong> - Quadratic Bézier curve (absolute/relative)</li>
                <li><strong>A/a</strong> - Elliptical arc (absolute/relative)</li>
                <li><strong>Z/z</strong> - Close path</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
