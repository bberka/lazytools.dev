'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Copy, Quote, Trash2, ArrowLeftRight, Check } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { convertEscape, type EscapeDirection, type EscapeMode } from '@/lib/tools/text-escape';

export function TextEscape() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<EscapeMode>('javascript');
  const [direction, setDirection] = useState<EscapeDirection>('escape');
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const { output, error } = useMemo(() => convertEscape(input, mode, direction), [input, mode, direction]);

  const handleSwap = () => {
    setInput(output);
    setDirection(direction === 'escape' ? 'unescape' : 'escape');
  };

  const handleCopy = async () => {
    if (output) {
      await copyToClipboard(output);
    }
  };

  const handleClear = () => {
    setInput('');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={direction === 'escape' ? 'default' : 'outline'}
          onClick={() => setDirection('escape')}
          aria-pressed={direction === 'escape'}
        >
          Escape
        </Button>
        <Button
          variant={direction === 'unescape' ? 'default' : 'outline'}
          onClick={() => setDirection('unescape')}
          aria-pressed={direction === 'unescape'}
        >
          Unescape
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Quote className="h-5 w-5" />
            Input
          </CardTitle>
          <CardDescription>
            {direction === 'escape' ? 'Enter text to escape' : 'Enter escaped text to unescape'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="mode" className="text-sm font-medium">
              Escape Mode
            </label>
            <Select value={mode} onValueChange={(value) => setMode(value as EscapeMode)}>
              <SelectTrigger id="mode">
                <SelectValue placeholder="Select escape mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="javascript">JavaScript/TypeScript</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                  <SelectItem value="xml">XML</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="sql">SQL</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={direction === 'escape' ? 'Enter text here...' : 'Enter escaped text here...'}
            aria-label={direction === 'escape' ? 'Text to escape' : 'Escaped text to unescape'}
            rows={8}
            className="font-mono"
          />
        </CardContent>
      </Card>

      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Output</CardTitle>
          <CardDescription>
            {output ? `${output.length} ${output.length === 1 ? 'character' : 'characters'}` :'Result will appear here automatically'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <pre className="w-full min-h-[200px] p-3 rounded-md bg-muted font-mono text-sm overflow-x-auto scrollbar-thin whitespace-pre-wrap break-all border border-input">
              {output || 'Output will appear here...'}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleCopy}
                disabled={!output}
                size="sm"
                variant={isCopied ? "default" : "outline"}
              >
                {isCopied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
              <Button onClick={handleSwap} disabled={!output} variant="outline" size="sm">
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Swap
              </Button>
              <Button onClick={handleClear} variant="outline" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
