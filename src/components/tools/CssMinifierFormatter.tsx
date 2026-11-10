'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { AlertTriangle, Download, FileCode, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/CopyButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { downloadText } from '@/lib/files';
import {
  beautifyCss,
  byteLength,
  minifyCss,
  sizeChange,
  type IndentChoice,
} from '@/lib/tools/css-formatter';

type Mode = 'minify' | 'beautify';

const MODES: ReadonlyArray<{ value: Mode; label: string }> = [
  { value: 'minify', label: 'Minify' },
  { value: 'beautify', label: 'Beautify' },
];

const INDENT_OPTIONS: ReadonlyArray<{ value: string; label: string; indent: IndentChoice }> = [
  { value: '2', label: '2 spaces', indent: 2 },
  { value: '4', label: '4 spaces', indent: 4 },
  { value: 'tab', label: 'Tab', indent: 'tab' },
];

const EXAMPLE_CSS = `/* Card component */
.card {
  display : flex;
  margin: 0.50rem 0 0px -.5em;
  color: #ffffff;
  background: url( "img/bg  1.png" ) no-repeat , linear-gradient( to right , #aabbcc , transparent );
  width: calc( 100% - ( 2 * var( --gap , 1rem ) ) );

  &:hover { color: #ff0000 !important; }
  .title > span + span { font-weight: bold; }

  @media (min-width: 600px) and (max-width: 900px) {
    padding: 1.0rem;
  }
}

@supports (display: grid) {
  .grid { display: grid; content: "a  /* not a comment */ ; }"; }
}
`;

function formatSize(bytes: number): string {
  return `${bytes.toLocaleString('en-US')} ${bytes === 1 ? 'byte' : 'bytes'}`;
}

export function CssMinifierFormatter() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('minify');
  const [indent, setIndent] = useState('2');
  const [keepImportant, setKeepImportant] = useState(false);

  const deferredInput = useDeferredValue(input);
  const result = useMemo(() => {
    if (deferredInput.trim() === '') return null;
    if (mode === 'minify') return minifyCss(deferredInput, { keepImportantComments: keepImportant });
    const choice = INDENT_OPTIONS.find((option) => option.value === indent)?.indent ?? 2;
    return beautifyCss(deferredInput, { indent: choice });
  }, [deferredInput, mode, indent, keepImportant]);

  const output = result?.output ?? '';
  const sizes = useMemo(
    () => (result ? sizeChange(byteLength(deferredInput), byteLength(result.output)) : null),
    [result, deferredInput]
  );

  const handleDownload = () => {
    if (!output) return;
    try {
      downloadText(output, mode === 'minify' ? 'styles.min.css' : 'styles.css', 'text/css;charset=utf-8');
      toast.success('CSS downloaded');
    } catch {
      toast.error('Could not download the CSS');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-primary" />
            CSS input
          </CardTitle>
          <CardDescription>
            Paste a stylesheet. Strings, urls and calc() spacing are never changed. Everything runs in your
            browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="a { color : red ; }"
            aria-label="CSS input"
            rows={10}
            spellCheck={false}
            className="bg-background font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setInput(EXAMPLE_CSS)}>
              <Wand2 className="mr-2 h-4 w-4" />
              Load example
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setInput('')} disabled={input === ''}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle>Result</CardTitle>
              <CardDescription>
                {mode === 'minify' ? 'Smallest safe output.' : 'One declaration per line, nested blocks indented.'}
              </CardDescription>
            </div>
            <div role="group" aria-label="Mode" className="flex gap-1">
              {MODES.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={mode === item.value ? 'default' : 'outline'}
                  aria-pressed={mode === item.value}
                  onClick={() => setMode(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {mode === 'beautify' ? (
              <div className="flex items-center gap-2">
                <label htmlFor="css-indent" className="text-sm font-medium">
                  Indent
                </label>
                <Select value={indent} onValueChange={setIndent}>
                  <SelectTrigger id="css-indent" className="h-9 w-32">
                    <SelectValue placeholder="Indent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {INDENT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Switch id="css-keep-important" checked={keepImportant} onCheckedChange={setKeepImportant} />
                <label htmlFor="css-keep-important" className="text-sm font-medium">
                  Keep <span className="font-mono">{"/*!"}</span> comments
                </label>
              </div>
            )}
          </div>

          {sizes && (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="min-w-0 rounded-md border bg-card p-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Original</dt>
                <dd data-testid="css-size-before" className="mt-1 font-mono text-sm font-semibold">
                  {formatSize(sizes.before)}
                </dd>
              </div>
              <div className="min-w-0 rounded-md border bg-card p-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Output</dt>
                <dd data-testid="css-size-after" className="mt-1 font-mono text-sm font-semibold">
                  {formatSize(sizes.after)}
                </dd>
              </div>
              <div className="col-span-2 min-w-0 rounded-md border bg-card p-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {sizes.saved >= 0 ? 'Saved' : 'Larger by'}
                </dt>
                <dd data-testid="css-size-saved" className="mt-1 font-mono text-sm font-semibold">
                  {formatSize(Math.abs(sizes.saved))} ({Math.abs(sizes.percent)}%)
                </dd>
              </div>
            </dl>
          )}

          {result && result.warnings.length > 0 && (
            <div role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              {result.warnings.map((warning) => (
                <p key={warning} className="flex items-start gap-1.5 text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{warning}</span>
                </p>
              ))}
            </div>
          )}

          <Textarea
            value={output}
            readOnly
            placeholder="The result appears here."
            aria-label="CSS output"
            rows={10}
            spellCheck={false}
            className="cursor-text bg-muted/30 font-mono text-sm"
          />

          <div className="flex flex-wrap gap-2">
            <CopyButton
              text={output}
              label="Copy"
              errorLabel="Copy failed, try again"
              type="button"
              disabled={!output}
            />
            <Button type="button" variant="outline" disabled={!output} onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download .css
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
