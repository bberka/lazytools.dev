'use client';

import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AlertCircle, Calculator, Check, CornerDownLeft, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useCopyToClipboard } from '@/hooks';
import {
  EXAMPLE_EXPRESSIONS,
  FUNCTION_NAMES,
  evaluateExpression,
  formatResult,
  type AngleMode,
} from '@/lib/tools/math-evaluator';

interface HistoryEntry {
  id: number;
  expression: string;
  result: string;
  value: number;
  angle: AngleMode;
}

const ANGLE_OPTIONS: ReadonlyArray<{ value: AngleMode; label: string }> = [
  { value: 'deg', label: 'Degrees' },
  { value: 'rad', label: 'Radians' },
];

export function MathEvaluator() {
  const [input, setInput] = useState('');
  const [angle, setAngle] = useState<AngleMode>('deg');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [variables, setVariables] = useState<Record<string, number>>({});
  const [recall, setRecall] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const { copyToClipboard, isCopied, isError } = useCopyToClipboard();

  const scope = useMemo(
    () => (history.length > 0 ? { ...variables, ans: history[0].value } : variables),
    [variables, history]
  );
  const live = useMemo(
    () => (input.trim() === '' ? null : evaluateExpression(input, { angle, variables: scope })),
    [input, angle, scope]
  );
  const liveText = live?.ok ? formatResult(live.value) : null;

  const handleInputChange = (text: string) => {
    setInput(text);
    setRecall(null);
  };

  const commit = () => {
    if (!live?.ok) return;
    const entry: HistoryEntry = {
      id: nextId.current++,
      expression: input.trim(),
      result: formatResult(live.value),
      value: live.value,
      angle,
    };
    setHistory((current) => [entry, ...current].slice(0, 50));
    if (live.assignment) {
      const { name, value } = live.assignment;
      setVariables((current) => ({ ...current, [name]: value }));
    }
    setInput('');
    setRecall(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'ArrowUp' && history.length > 0) {
      event.preventDefault();
      const index = recall === null ? 0 : Math.min(recall + 1, history.length - 1);
      setRecall(index);
      setInput(history[index].expression);
    } else if (event.key === 'ArrowDown' && recall !== null) {
      event.preventDefault();
      if (recall === 0) {
        setRecall(null);
        setInput('');
      } else {
        setRecall(recall - 1);
        setInput(history[recall - 1].expression);
      }
    }
  };

  const handleCopy = (key: string, text: string) => {
    setCopiedKey(key);
    void copyToClipboard(text);
  };

  const reuse = (text: string) => {
    setInput(text);
    setRecall(null);
    inputRef.current?.focus();
  };

  const handleClear = () => {
    setInput('');
    setRecall(null);
    inputRef.current?.focus();
  };

  const handleClearHistory = () => {
    setHistory([]);
    setVariables({});
    setRecall(null);
  };

  const variableNames = Object.keys(variables).sort();
  const copiedNow = (key: string) => isCopied && copiedKey === key;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Math expression
          </CardTitle>
          <CardDescription>
            Type an expression and the result updates as you type. Press Enter to keep it in the
            history. Nothing is run as code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="math-expression" className="text-sm font-medium">
              Expression
            </label>
            <div className="flex gap-2">
              <Input
                id="math-expression"
                ref={inputRef}
                type="text"
                value={input}
                onChange={(event) => handleInputChange(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. (2 + 3) * 4 ^ 2, sqrt(16), x = 5"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="min-w-0 flex-1 font-mono"
                aria-invalid={live ? !live.ok : false}
                aria-describedby="math-result"
              />
              <Button type="button" onClick={commit} disabled={!live?.ok} className="shrink-0">
                <CornerDownLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Add to history</span>
                <span className="sr-only sm:hidden">Add to history</span>
              </Button>
            </div>
          </div>

          <div id="math-result" className="min-h-14 rounded-md bg-muted p-3 sm:p-4">
            {!live && (
              <p className="text-sm text-muted-foreground">
                The result appears here. Try 2 + 3 * 4, sin(30) or pi * 2 ^ 2.
              </p>
            )}
            {live?.ok && (
              <div role="status" className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {live.assignment ? `${live.assignment.name} =` : 'Result'}
                  </div>
                  <div
                    data-testid="math-live-result"
                    className="break-all font-mono text-2xl font-semibold tracking-tight sm:text-3xl"
                  >
                    {liveText}
                  </div>
                </div>
                <Button
                  type="button"
                  variant={copiedNow('live') ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleCopy('live', liveText ?? '')}
                >
                  {copiedNow('live') ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  {copiedNow('live')
                    ? 'Copied'
                    : isError && copiedKey === 'live'
                      ? 'Copy failed'
                      : 'Copy result'}
                </Button>
              </div>
            )}
            {live && !live.ok && (
              <div role="alert" className="space-y-2">
                <div className="flex items-start gap-1.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">{live.error.message}</span>
                </div>
                <div aria-hidden="true" className="overflow-x-auto">
                  <pre className="w-fit font-mono text-xs">
                    {input}
                    {'\n'}
                    <span className="text-destructive">
                      {' '.repeat(live.error.index)}
                      {'^'.repeat(
                        Math.min(live.error.length, Math.max(1, input.length - live.error.index))
                      )}
                    </span>
                  </pre>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Angle unit" className="flex gap-1">
              {ANGLE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={angle === option.value ? 'default' : 'outline'}
                  aria-pressed={angle === option.value}
                  onClick={() => setAngle(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={input === ''}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Examples
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_EXPRESSIONS.map((example) => (
                <Button
                  key={example}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="font-mono"
                  onClick={() => reuse(example)}
                >
                  {example}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1.5">
                <CardTitle>History</CardTitle>
                <CardDescription>
                  The last result is available as <span className="font-mono">ans</span>. Press the
                  up arrow in the field to bring back an earlier line.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearHistory}
                disabled={history.length === 0 && variableNames.length === 0}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear history
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="rounded-md border border-dashed px-4 py-4 text-sm text-muted-foreground sm:py-8">
                No results yet. Press Enter after an expression to keep it here.
              </p>
            ) : (
              <ul aria-label="Calculation history" className="space-y-2">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 sm:p-3"
                  >
                    <button
                      type="button"
                      onClick={() => reuse(entry.expression)}
                      title="Use this expression again"
                      aria-label={`Reuse ${entry.expression}`}
                      className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block break-all font-mono text-sm text-muted-foreground">
                        {entry.expression}
                      </span>
                      <span className="block break-all font-mono text-base font-semibold">
                        = {entry.result}
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant={copiedNow(`h${entry.id}`) ? 'default' : 'outline'}
                      size="sm"
                      aria-label={`Copy result ${entry.result}`}
                      onClick={() => handleCopy(`h${entry.id}`, entry.result)}
                    >
                      {copiedNow(`h${entry.id}`) ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Variables</CardTitle>
            </CardHeader>
            <CardContent>
              {variableNames.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Assign with <span className="font-mono">x = 3</span> and press Enter.
                </p>
              ) : (
                <ul aria-label="Variables" className="space-y-1.5">
                  {variableNames.map((name) => (
                    <li
                      key={name}
                      className="flex items-center justify-between gap-2 font-mono text-sm"
                    >
                      <span>{name}</span>
                      <span className="break-all text-right">{formatResult(variables[name])}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reference</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <span className="font-medium">Operators: </span>
                <span className="font-mono">+ - * / ^ %</span> and parentheses.{' '}
                <span className="font-mono">%</span> is the remainder.
              </p>
              <p>
                <span className="font-medium">Constants: </span>
                <span className="font-mono">pi e</span>
              </p>
              <p>
                <span className="font-medium">Functions: </span>
                <span className="font-mono break-words">{FUNCTION_NAMES.join(' ')}</span>
              </p>
              <p className="text-muted-foreground">
                <span className="font-mono">log</span> is base 10 and{' '}
                <span className="font-mono">ln</span> is the natural logarithm. The angle unit
                applies to sin, cos, tan and their inverses.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
