'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useCopyToClipboard } from '@/hooks';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Copy,
  FileDiff,
  Info,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  KIND_MARKERS,
  SAMPLE_LEFT,
  SAMPLE_RIGHT,
  compareJsonText,
  displayPath,
  formatPatch,
  formatReport,
  formatValue,
  jsonTypeOf,
  type DiffEntry,
  type DiffKind,
  type JsonValue,
  type SideState,
} from '@/lib/tools/json-diff';

/** Rows drawn at once; the copied report always has them all. */
const MAX_ROWS = 500;
/** Longest value shown in a row, in characters. */
const MAX_VALUE_LENGTH = 300;

const SUMMARY_KINDS: DiffKind[] = ['added', 'removed', 'changed', 'type-changed'];

const KIND_TITLES: Record<DiffKind, string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  'type-changed': 'Type changed',
  unchanged: 'Unchanged',
};

// The marker character and the title carry the meaning; the classes only
// reinforce it. Type changes also get a dashed border.
const KIND_STYLES: Record<DiffKind, string> = {
  added: 'border-primary/30 bg-primary/10 text-primary',
  removed: 'border-destructive/30 bg-destructive/10 text-destructive',
  changed: 'border-border bg-accent text-accent-foreground',
  'type-changed': 'border-dashed border-foreground/40 bg-secondary text-secondary-foreground',
  unchanged: 'border-transparent bg-muted/50 text-muted-foreground',
};

function KindBadge({ kind, className }: { kind: DiffKind; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold',
        KIND_STYLES[kind],
        className
      )}
    >
      <span aria-hidden="true" className="font-mono">
        {KIND_MARKERS[kind]}
      </span>
      {KIND_TITLES[kind]}
    </span>
  );
}

function ValueLine({ label, value, showType = false }: { label: string; value: JsonValue; showType?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="w-10 shrink-0 text-muted-foreground">{label}</span>
      <code className="min-w-0 break-all font-mono">{formatValue(value, MAX_VALUE_LENGTH)}</code>
      {showType && <span className="shrink-0 text-muted-foreground">({jsonTypeOf(value)})</span>}
    </div>
  );
}

function EntryValues({ entry }: { entry: DiffEntry }) {
  switch (entry.kind) {
    case 'added':
      return <ValueLine label="New" value={entry.newValue} />;
    case 'removed':
      return <ValueLine label="Old" value={entry.oldValue} />;
    case 'changed':
      return (
        <>
          <ValueLine label="Old" value={entry.oldValue} />
          <ValueLine label="New" value={entry.newValue} />
        </>
      );
    case 'type-changed':
      return (
        <>
          <ValueLine label="Old" value={entry.oldValue} showType />
          <ValueLine label="New" value={entry.newValue} showType />
        </>
      );
    case 'unchanged':
      return <ValueLine label="Value" value={entry.value} />;
  }
}

function JsonSide({
  id,
  label,
  placeholder,
  value,
  onChange,
  state,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  state: SideState;
}) {
  const invalid = state.status === 'invalid';
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={12}
        spellCheck={false}
        aria-invalid={invalid}
        aria-describedby={`${id}-status`}
        className={cn('font-mono text-sm', invalid && 'border-destructive focus-visible:ring-destructive')}
      />
      <div id={`${id}-status`} aria-live="polite" className="min-h-5 text-xs">
        {state.status === 'invalid' && (
          <p className="flex items-start gap-1.5 text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>
                Line {state.error.line}, column {state.error.column}:
              </strong>{' '}
              {state.error.message}
            </span>
          </p>
        )}
        {state.status === 'valid' && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span>Valid JSON: {state.description}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function OptionSwitch({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <label htmlFor={id} className="cursor-pointer text-sm font-medium">
        {label}
      </label>
    </div>
  );
}

export function JsonDiff() {
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [ignoreArrayOrder, setIgnoreArrayOrder] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const copyReport = useCopyToClipboard();
  const copyPatch = useCopyToClipboard();

  const comparison = useMemo(
    () => compareJsonText(leftText, rightText, { ignoreArrayOrder, showUnchanged }),
    [leftText, rightText, ignoreArrayOrder, showUnchanged]
  );
  const { left, right, result } = comparison;

  const handleSwap = () => {
    setLeftText(rightText);
    setRightText(leftText);
  };

  const handleSample = () => {
    setLeftText(SAMPLE_LEFT);
    setRightText(SAMPLE_RIGHT);
  };

  const handleClear = () => {
    setLeftText('');
    setRightText('');
  };

  const lossyNumbers =
    (left.status === 'valid' ? left.lossyNumbers : 0) + (right.status === 'valid' ? right.lossyNumbers : 0);
  const hasInvalidSide = left.status === 'invalid' || right.status === 'invalid';
  const bothEmpty = left.status === 'empty' && right.status === 'empty';
  const shownEntries = result ? result.entries.slice(0, MAX_ROWS) : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDiff className="h-5 w-5 text-primary" />
            JSON Inputs & Options
          </CardTitle>
          <CardDescription>
            Paste two JSON documents. They are compared by structure, so key order never counts as a difference.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <JsonSide
              id="json-diff-left"
              label="Original (left)"
              placeholder='{"name": "Ada", "tags": ["a", "b"]}'
              value={leftText}
              onChange={setLeftText}
              state={left}
            />
            <JsonSide
              id="json-diff-right"
              label="Modified (right)"
              placeholder='{"name": "Ada", "tags": ["b", "c"]}'
              value={rightText}
              onChange={setRightText}
              state={right}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
              <OptionSwitch
                id="json-diff-ignore-order"
                label="Ignore array order"
                checked={ignoreArrayOrder}
                onCheckedChange={setIgnoreArrayOrder}
              />
              <OptionSwitch
                id="json-diff-show-unchanged"
                label="Show unchanged values"
                checked={showUnchanged}
                onCheckedChange={setShowUnchanged}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSwap}
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-9"
                disabled={!leftText && !rightText}
              >
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Swap sides
              </Button>
              <Button onClick={handleSample} variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                <Sparkles className="mr-2 h-4 w-4" />
                Load sample
              </Button>
              <Button
                onClick={handleClear}
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-9"
                disabled={!leftText && !rightText}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Differences</CardTitle>
          <CardDescription>
            {result
              ? 'Paths are JSON Pointers (RFC 6901). The root document is shown as (root).'
              : 'The result appears here once both sides are valid JSON.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!result && (
            <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground sm:py-12">
              {hasInvalidSide
                ? 'Fix the JSON marked above to compare the two documents.'
                : bothEmpty
                  ? 'Paste JSON on both sides, or load the sample, to see the differences.'
                  : 'Add JSON on the empty side to see the differences.'}
            </div>
          )}

          {result && (
            <>
              {lossyNumbers > 0 && (
                <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {lossyNumbers} number{lossyNumbers === 1 ? ' has' : 's have'} more than 15 significant digits.
                    Numbers are compared as 64-bit floats, so values that differ in the later digits can look equal.
                  </span>
                </div>
              )}

              <div
                role="status"
                aria-label="Difference summary"
                className="flex flex-wrap gap-2"
              >
                {SUMMARY_KINDS.map((kind) => {
                  const count = result.summary[kind === 'type-changed' ? 'typeChanged' : kind];
                  return (
                    <span
                      key={kind}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold',
                        count > 0 ? KIND_STYLES[kind] : KIND_STYLES.unchanged
                      )}
                    >
                      <span aria-hidden="true" className="font-mono">
                        {KIND_MARKERS[kind]}
                      </span>
                      {count} {KIND_TITLES[kind].toLowerCase()}
                    </span>
                  );
                })}
                <span className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-muted/50 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  <span aria-hidden="true" className="font-mono">
                    {KIND_MARKERS.unchanged}
                  </span>
                  {result.summary.unchanged} unchanged
                </span>
              </div>

              {result.summary.differences === 0 && (
                <div className="flex items-start gap-3 rounded-md border bg-muted/40 px-4 py-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <strong>No differences.</strong> The two documents are structurally equal
                    {result.ignoreArrayOrder ? ', ignoring key order and array order.' : ', ignoring key order.'}
                  </div>
                </div>
              )}

              {result.entries.length > 0 && (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button
                      onClick={() => copyReport.copyToClipboard(formatReport(result))}
                      variant={copyReport.isCopied ? 'default' : 'outline'}
                      size="sm"
                      className="min-h-11 sm:min-h-9"
                    >
                      {copyReport.isCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                      {copyReport.isCopied ? 'Copied!' : 'Copy report'}
                    </Button>
                    <Button
                      onClick={() => copyPatch.copyToClipboard(formatPatch(result.patch))}
                      variant={copyPatch.isCopied ? 'default' : 'outline'}
                      size="sm"
                      className="min-h-11 sm:min-h-9"
                      disabled={result.patch.length === 0}
                    >
                      {copyPatch.isCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                      {copyPatch.isCopied ? 'Copied!' : 'Copy JSON Patch'}
                    </Button>
                  </div>

                  <div
                    role="region"
                    aria-label="List of differences"
                    tabIndex={0}
                    className="max-h-[32rem] overflow-auto rounded-md border"
                  >
                    <ul className="divide-y">
                      {shownEntries.map((entry, index) => (
                        <li
                          key={`${entry.kind}:${entry.path}:${index}`}
                          className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-start sm:gap-3"
                        >
                          <KindBadge kind={entry.kind} className="sm:w-32" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <code className="block break-all font-mono text-sm font-medium">
                              {displayPath(entry.path)}
                            </code>
                            <EntryValues entry={entry} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {result.entries.length > shownEntries.length && (
                    <p className="text-xs text-muted-foreground">
                      Showing the first {shownEntries.length.toLocaleString()} of{' '}
                      {result.entries.length.toLocaleString()} entries. The copied report and patch include all of
                      them.
                    </p>
                  )}

                  {result.ignoreArrayOrder && (
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Array order is ignored. Paths of added items point into the right document and all other paths
                        into the left one. The JSON Patch makes the left document equal to the right one apart from
                        the order of array elements.
                      </span>
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
