'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowDownAZ, Shuffle, Trash2 } from 'lucide-react';
import { CopyButton } from '@/components/CopyButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_OPTIONS,
  EXAMPLE_TEXT,
  SORT_MODES,
  processLines,
  type LineOptions,
  type SortMode,
} from '@/lib/tools/text-sorter-deduplicator';
import { plural } from '@/lib/text';

export function TextSorterDeduplicator() {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<LineOptions>(DEFAULT_OPTIONS);

  const deferredText = useDeferredValue(text);
  const result = useMemo(() => processLines(deferredText, options), [deferredText, options]);

  const update = <K extends keyof LineOptions>(key: K, value: LineOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  const hasText = text.length > 0;
  const { stats } = result;
  const sortsText = options.sort === 'az' || options.sort === 'za';

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowDownAZ className="h-5 w-5 text-primary" />
            Lines to Sort
          </CardTitle>
          <CardDescription>
            One item per line. The result updates as you type and never leaves your browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste or type lines here..."
            aria-label="Lines to sort"
            rows={8}
            spellCheck={false}
            className="font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setText(EXAMPLE_TEXT)} variant="outline" size="sm">
              Load Example
            </Button>
            <Button onClick={() => setText('')} variant="outline" size="sm" disabled={!hasText}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Options</CardTitle>
          <CardDescription>
            Lines are trimmed, filtered and deduplicated first, then sorted.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          <div className="space-y-2">
            <label htmlFor="sorter-order" className="text-sm font-medium">
              Sort order
            </label>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  value={options.sort}
                  onValueChange={(value) => update('sort', value as SortMode)}
                >
                  <SelectTrigger id="sorter-order">
                    <SelectValue placeholder="Select a sort order" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {options.sort === 'shuffle' && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  aria-label="Shuffle again"
                  onClick={() => update('shuffleSeed', options.shuffleSeed + 1)}
                >
                  <Shuffle className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Checkbox
              label="Compare code points (capitals before small letters)"
              checked={options.codePointOrder}
              onCheckedChange={(checked) => update('codePointOrder', checked)}
              disabled={!sortsText}
            />
          </div>

          <div className="space-y-3">
            <Checkbox
              label="Trim spaces around each line"
              checked={options.trimLines}
              onCheckedChange={(checked) => update('trimLines', checked)}
            />
            <Checkbox
              label="Remove empty lines"
              checked={options.removeEmpty}
              onCheckedChange={(checked) => update('removeEmpty', checked)}
            />
            <Checkbox
              label="Remove duplicate lines"
              checked={options.removeDuplicates}
              onCheckedChange={(checked) => update('removeDuplicates', checked)}
            />
            <div className="pl-7">
              <Checkbox
                label="Ignore case when comparing"
                checked={options.ignoreCase}
                onCheckedChange={(checked) => update('ignoreCase', checked)}
                disabled={!options.removeDuplicates}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Result</CardTitle>
          <CardDescription>
            <span role="status" aria-label="Summary">
              {hasText
                ? `${plural(stats.outputLines, 'line', 'lines')} from ${plural(stats.inputLines, 'line', 'lines')}. ${plural(
                    stats.removedDuplicates,
                    'duplicate',
                    'duplicates'
                  )} and ${plural(stats.removedEmpty, 'empty line', 'empty lines')} removed.`
                : 'Add some lines above to see the result.'}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            readOnly
            value={result.text}
            aria-label="Sorted lines"
            rows={8}
            spellCheck={false}
            className="bg-muted/30 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={result.text} label="Copy Result" disabled={!result.text} size="sm" />
            <Button
              onClick={() => setText(result.text)}
              disabled={!result.text || result.text === text}
              size="sm"
              variant="outline"
            >
              Use as Input
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
