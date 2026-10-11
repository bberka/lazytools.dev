'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { GitCompare, Trash2 } from 'lucide-react';
import {
  diffText,
  hasChanges,
  segmentsOf,
  toSideBySideRows,
  type DiffCell,
  type DiffMode,
  type DiffSegment,
} from '@/lib/tools/text-diff';

type ViewMode = 'side-by-side' | 'inline';

const CHANGE_CLASSES: Record<DiffCell['kind'], string> = {
  added: 'bg-green-500/20 text-green-700 dark:text-green-400',
  removed: 'bg-red-500/20 text-red-700 dark:text-red-400',
  unchanged: '',
  empty: 'bg-muted/50',
};

function Segments({ segments }: { segments: DiffSegment[] }) {
  return segments.map((segment, index) => (
    <span key={index} className={CHANGE_CLASSES[segment.change]}>
      {segment.text}
    </span>
  ));
}

function Lines({ cells }: { cells: DiffCell[] }) {
  return cells.map((cell, index) => (
    <div
      key={index}
      className={`px-4 py-1 whitespace-pre-wrap break-words ${CHANGE_CLASSES[cell.kind]}`}
    >
      {/* A no-break space keeps a blank line as tall as the line beside it. */}
      {cell.text || ' '}
    </div>
  ));
}

export function TextDiff() {
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [diffMode, setDiffMode] = useState<DiffMode>('lines');
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');

  const segments = useMemo(
    () => diffText(leftText, rightText, diffMode),
    [leftText, rightText, diffMode]
  );
  const rows = useMemo(
    () => (diffMode === 'lines' ? toSideBySideRows(segments) : []),
    [diffMode, segments]
  );

  const handleClear = () => {
    setLeftText('');
    setRightText('');
  };

  const getDescription = () => {
    if (!leftText && !rightText) {
      return 'Enter text in both fields to see the diff';
    }
    if (!hasChanges(segments)) {
      return leftText === rightText
        ? 'No differences found'
        : 'No differences found (the word diff ignores whitespace)';
    }
    return viewMode === 'side-by-side' ? 'Side-by-side comparison' : 'Inline comparison';
  };

  const renderInlineDiff = () => {
    return (
      <div className="min-h-[320px] whitespace-pre-wrap break-words rounded-md border p-3 font-mono text-sm sm:min-h-[400px] sm:p-4">
        <Segments segments={segments} />
      </div>
    );
  };

  const renderSideBySideDiff = () => {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="border rounded-md">
          <div className="bg-muted px-4 py-2 font-medium text-sm border-b">Original</div>
          <div className="font-mono text-sm min-h-[320px] sm:min-h-[400px]">
            {diffMode === 'lines' ? (
              <Lines cells={rows.map((row) => row.left)} />
            ) : (
              <div className="px-4 py-1 whitespace-pre-wrap break-words">
                <Segments segments={segmentsOf(segments, 'original')} />
              </div>
            )}
          </div>
        </div>

        <div className="border rounded-md">
          <div className="bg-muted px-4 py-2 font-medium text-sm border-b">Modified</div>
          <div className="font-mono text-sm min-h-[320px] sm:min-h-[400px]">
            {diffMode === 'lines' ? (
              <Lines cells={rows.map((row) => row.right)} />
            ) : (
              <div className="px-4 py-1 whitespace-pre-wrap break-words">
                <Segments segments={segmentsOf(segments, 'modified')} />
              </div>
            )}
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
            <span id="text-diff-mode-label" className="text-sm font-medium">
              Diff Mode:
            </span>
            <div role="group" aria-labelledby="text-diff-mode-label" className="flex flex-wrap gap-2">
              <Button
                onClick={() => setDiffMode('lines')}
                variant={diffMode === 'lines' ? 'default' : 'outline'}
                aria-pressed={diffMode === 'lines'}
                size="sm"
              >
                Lines
              </Button>
              <Button
                onClick={() => setDiffMode('words')}
                variant={diffMode === 'words' ? 'default' : 'outline'}
                aria-pressed={diffMode === 'words'}
                size="sm"
              >
                Words
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span id="text-diff-view-label" className="text-sm font-medium">
              View:
            </span>
            <div role="group" aria-labelledby="text-diff-view-label" className="flex flex-wrap gap-2">
              <Button
                onClick={() => setViewMode('side-by-side')}
                variant={viewMode === 'side-by-side' ? 'default' : 'outline'}
                aria-pressed={viewMode === 'side-by-side'}
                size="sm"
              >
                Side by Side
              </Button>
              <Button
                onClick={() => setViewMode('inline')}
                variant={viewMode === 'inline' ? 'default' : 'outline'}
                aria-pressed={viewMode === 'inline'}
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
              aria-label="Original text"
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
              aria-label="Modified text"
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
          <CardDescription>{getDescription()}</CardDescription>
        </CardHeader>
        <CardContent>
          {viewMode === 'side-by-side' ? renderSideBySideDiff() : renderInlineDiff()}
        </CardContent>
      </Card>
    </div>
  );
}
