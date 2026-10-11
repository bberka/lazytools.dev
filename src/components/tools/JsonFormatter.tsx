'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Copy, Check, FileJson, Trash2, CheckCircle2, AlertTriangle, Search, Info, ChevronRight, ChevronDown } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import {
  describeLineCount,
  describeTreeNode,
  type TreeLeafType,
  type TreeVocabulary,
} from '@/lib/tools/formatter-output';
import { renderJson, validateJson } from '@/lib/tools/json-formatter';

const TREE_WORDS: TreeVocabulary = { list: 'Array', map: 'Object', member: 'key', empty: 'null' };

const LEAF_CLASSES: Record<TreeLeafType, string> = {
  empty: 'text-muted-foreground italic',
  boolean: 'text-blue-600 dark:text-blue-400 font-semibold',
  number: 'text-green-600 dark:text-green-400',
  string: 'text-orange-600 dark:text-orange-400 break-all',
};

// Collapsible JSON Tree Node viewer component
function TreeNode({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const [isExpanded, setIsExpanded] = useState(depth <= 1);
  const node = describeTreeNode(value, TREE_WORDS);
  const label =
    name === undefined ? null : (
      <span className="text-purple-600 dark:text-purple-400 font-semibold">{name === '' ? '""' : name}:</span>
    );

  if (node.kind === 'leaf') {
    return (
      <div className="flex items-start gap-1 font-mono text-sm py-0.5">
        {label}
        <span className={LEAF_CLASSES[node.type]}>{node.text}</span>
      </div>
    );
  }

  return (
    <div className="font-mono text-sm py-0.5">
      <button
        type="button"
        aria-expanded={isExpanded}
        className="flex items-center gap-1 cursor-pointer select-none py-0.5 hover:bg-accent/40 rounded px-1 w-max max-w-full text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-muted-foreground shrink-0">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        {label}
        <span className="text-muted-foreground text-xs font-semibold">{node.label}</span>
      </button>

      {isExpanded && (
        <div className="pl-4 ml-2 border-l border-muted-foreground/20 space-y-0.5">
          {node.children.map((child) => (
            <TreeNode key={child.name} name={child.name} value={child.value} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonFormatter() {
  const [input, setInput] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [indentation, setIndentation] = useState('2');
  const [isMinified, setIsMinified] = useState(false);
  const [viewMode, setViewMode] = useState<'text' | 'tree'>('text');
  const { copyToClipboard, isCopied, isError: copyFailed } = useCopyToClipboard();

  // Reactive validation state computed from the input text
  const validation = useMemo(() => validateJson(input), [input]);

  // Reactive output computation incorporating formatting and filter selectors
  const outputResult = useMemo(() => {
    if (!validation || !validation.valid) return { text: '', error: '', value: null };

    return renderJson(validation.value, {
      path: filterQuery,
      indent: indentation === 'tab' ? '\t' : parseInt(indentation, 10),
      minify: isMinified,
    });
  }, [validation, filterQuery, indentation, isMinified]);

  const handleMinify = () => {
    setIsMinified(true);
  };

  const handleIndentationChange = (value: string) => {
    setIndentation(value);
    setIsMinified(false);
  };

  const handleClear = () => {
    setInput('');
    setFilterQuery('');
    setIsMinified(false);
  };

  const hasOutput = Boolean(outputResult.text);

  return (
    <div className="space-y-4">
      {/* Input panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-primary" />
            JSON Inputs & Settings
          </CardTitle>
          <CardDescription>Paste your raw JSON text and configure formatting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={input}
            onChange={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            placeholder='{"name": "Ada", "roles": ["Admin", "Editor"]}'
            aria-label="JSON input"
            rows={10}
            className="font-mono text-sm"
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* Indentation configuration */}
              <div className="flex items-center gap-2">
                <label htmlFor="indentation" className="text-sm font-medium">Indentation:</label>
                <Select value={indentation} onValueChange={handleIndentationChange}>
                  <SelectTrigger id="indentation" className="w-28 sm:w-32">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="2">2 spaces</SelectItem>
                      <SelectItem value="4">4 spaces</SelectItem>
                      <SelectItem value="8">8 spaces</SelectItem>
                      <SelectItem value="tab">Tab</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleMinify} variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={!validation?.valid}>
                Minify JSON
              </Button>
            </div>

            <Button onClick={handleClear} variant="outline" size="sm" className="min-h-11 sm:min-h-9">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>

          {/* Validation diagnostic status */}
          {validation && (
            <div
              className={`flex items-start gap-3 rounded-md px-4 py-3 text-sm ${
                validation.valid
                  ? 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}
            >
              {validation.valid ? (
                <>
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <strong>Valid JSON:</strong> {validation.summary}
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div className="min-w-0 break-words">
                    <strong>Invalid JSON Syntax:</strong> {validation.error}
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Query/Filter Selector Panel */}
      {validation?.valid && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              Filter / Query Output
            </CardTitle>
            <CardDescription className="text-xs">
              Inspect nested fields using dot/bracket paths (e.g., <code>$.roles[0]</code> or <code>roles</code>). Leave empty for full JSON.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              value={filterQuery}
              onChange={(e) => setFilterQuery((e.target as HTMLInputElement).value)}
              placeholder="e.g., roles or $.name"
              aria-label="Filter path"
              className="font-mono text-sm bg-background"
            />
          </CardContent>
        </Card>
      )}

      {/* Formatted Output Panel */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b sm:pb-3">
          <div>
            <CardTitle>Formatted Output</CardTitle>
            <CardDescription>
              {outputResult.text ? describeLineCount(outputResult.text) : 'Output will appear here'}
            </CardDescription>
          </div>
          {validation?.valid && !outputResult.error && (
            <div className="flex gap-1 bg-muted p-0.5 rounded-md border text-xs" role="group" aria-label="Output view">
              <Button
                variant={viewMode === 'text' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('text')}
                aria-pressed={viewMode === 'text'}
                className="h-7 px-2.5 text-xs font-semibold"
              >
                Text
              </Button>
              <Button
                variant={viewMode === 'tree' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('tree')}
                aria-pressed={viewMode === 'tree'}
                className="h-7 px-2.5 text-xs font-semibold"
              >
                Tree View
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {outputResult.error ? (
            <div className="flex items-start gap-3 rounded-md bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/20 px-4 py-3 text-sm">
              <Info className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="min-w-0 break-words">{outputResult.error}</div>
            </div>
          ) : viewMode === 'tree' && outputResult.value !== null ? (
            <div className="rounded-md border bg-muted/40 p-4 max-h-[500px] overflow-auto select-text scrollbar-thin">
              <TreeNode value={outputResult.value} depth={0} />
            </div>
          ) : (
            <Textarea
              value={outputResult.text}
              readOnly
              placeholder="Formatted output will appear here..."
              aria-label="Formatted JSON output"
              rows={12}
              className="font-mono text-sm"
            />
          )}

          <Button
            onClick={() => copyToClipboard(outputResult.text)}
            disabled={!hasOutput || Boolean(outputResult.error)}
            size="sm"
            variant={isCopied ? "default" : "outline"}
            className="min-h-11 w-full sm:min-h-9 sm:w-auto"
          >
            {isCopied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                {copyFailed ? 'Copy failed' : 'Copy Output'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
