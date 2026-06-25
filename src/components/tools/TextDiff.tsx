'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { GitCompare, Trash2 } from 'lucide-react';
import { diffLines, diffWords } from 'diff';

type DiffMode = 'lines' | 'words';
type ViewMode = 'side-by-side' | 'inline';

export function TextDiff() {
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [diffMode, setDiffMode] = useState<DiffMode>('lines');
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');

  const getDiff = () => {
    if (!leftText && !rightText) return [];

    if (diffMode === 'lines') {
      return diffLines(leftText, rightText);
    } else {
      return diffWords(leftText, rightText);
    }
  };

  const handleClear = () => {
    setLeftText('');
    setRightText('');
  };

  const renderInlineDiff = () => {
    const diff = getDiff();

    return (
      <div className="min-h-[320px] whitespace-pre-wrap rounded-md border p-3 font-mono text-sm sm:min-h-[400px] sm:p-4">
        {diff.map((part, index) => {
          const bgColor = part.added
            ? 'bg-green-500/20'
            : part.removed
            ? 'bg-red-500/20'
            : '';
          const textColor = part.added
            ? 'text-green-700 dark:text-green-400'
            : part.removed
            ? 'text-red-700 dark:text-red-400'
            : '';

          return (
            <span key={index} className={`${bgColor} ${textColor}`}>
              {part.value}
            </span>
          );
        })}
      </div>
    );
  };

  const renderSideBySideDiff = () => {
    const diff = getDiff();
    const leftLines: { text: string; type: 'removed' | 'unchanged' | 'added' | 'empty' }[] = [];
    const rightLines: { text: string; type: 'removed' | 'unchanged' | 'added' | 'empty' }[] = [];

    diff.forEach((part) => {
      const lines = part.value.split('\n');

      if (part.added) {
        lines.forEach((line: string) => {
          if (line || lines.length > 1) {
            leftLines.push({ text: '', type: 'empty' });
            rightLines.push({ text: line, type: 'added' });
          }
        });
      } else if (part.removed) {
        lines.forEach((line: string) => {
          if (line || lines.length > 1) {
            leftLines.push({ text: line, type: 'removed' });
            rightLines.push({ text: '', type: 'empty' });
          }
        });
      } else {
        lines.forEach((line: string) => {
          if (line || lines.length > 1) {
            leftLines.push({ text: line, type: 'unchanged' });
            rightLines.push({ text: line, type: 'unchanged' });
          }
        });
      }
    });

    // Remove last empty line if it exists
    if (leftLines.length > 0 && !leftLines[leftLines.length - 1].text) {
      leftLines.pop();
      rightLines.pop();
    }

    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="border rounded-md">
          <div className="bg-muted px-4 py-2 font-medium text-sm border-b">Original</div>
          <div className="font-mono text-sm min-h-[400px]">
            {leftLines.map((line, index) => (
              <div
                key={index}
                className={`px-4 py-1 ${
                  line.type === 'removed'
                    ? 'bg-red-500/20 text-red-700 dark:text-red-400'
                    : line.type === 'empty'
                    ? 'bg-gray-500/10'
                    : ''
                }`}
              >
                {line.text || ' '}
              </div>
            ))}
          </div>
        </div>

        <div className="border rounded-md">
          <div className="bg-muted px-4 py-2 font-medium text-sm border-b">Modified</div>
          <div className="font-mono text-sm min-h-[400px]">
            {rightLines.map((line, index) => (
              <div
                key={index}
                className={`px-4 py-1 ${
                  line.type === 'added'
                    ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                    : line.type === 'empty'
                    ? 'bg-gray-500/10'
                    : ''
                }`}
              >
                {line.text || ' '}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm font-medium">Diff Mode:</label>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setDiffMode('lines')}
                variant={diffMode === 'lines' ? 'default' : 'outline'}
                size="sm"
              >
                Lines
              </Button>
              <Button
                onClick={() => setDiffMode('words')}
                variant={diffMode === 'words' ? 'default' : 'outline'}
                size="sm"
              >
                Words
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm font-medium">View:</label>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setViewMode('side-by-side')}
                variant={viewMode === 'side-by-side' ? 'default' : 'outline'}
                size="sm"
              >
                Side by Side
              </Button>
              <Button
                onClick={() => setViewMode('inline')}
                variant={viewMode === 'inline' ? 'default' : 'outline'}
                size="sm"
              >
                Inline
              </Button>
            </div>
          </div>
        </div>

        <Button onClick={handleClear} variant="outline" size="sm" className="min-h-11 sm:min-h-9 lg:self-start">
          <Trash2 className="h-4 w-4 mr-2" />
          Clear
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Original Text</CardTitle>
            <CardDescription>Paste the original text here</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={leftText}
              onChange={(e) => setLeftText(e.target.value)}
              placeholder="Enter original text..."
              rows={12}
              className="font-mono"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Modified Text</CardTitle>
            <CardDescription>Paste the modified text here</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={rightText}
              onChange={(e) => setRightText(e.target.value)}
              placeholder="Enter modified text..."
              rows={12}
              className="font-mono"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Difference Visualization
          </CardTitle>
          <CardDescription>
            {leftText || rightText
              ? viewMode === 'side-by-side'
                ? 'Side-by-side comparison'
                : 'Inline comparison'
              : 'Enter text in both fields to see the diff'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {viewMode === 'side-by-side' ? renderSideBySideDiff() : renderInlineDiff()}
        </CardContent>
      </Card>
    </div>
  );
}
