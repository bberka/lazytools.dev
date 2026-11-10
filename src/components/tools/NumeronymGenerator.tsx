'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Check, Copy, Hash, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCopyToClipboard } from '@/hooks';
import {
  DEFAULT_OPTIONS,
  EXAMPLE_TEXT,
  MIN_ALLOWED_LENGTH,
  generateNumeronyms,
  type NumeronymMode,
} from '@/lib/tools/numeronym-generator';

export function NumeronymGenerator() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<NumeronymMode>(DEFAULT_OPTIONS.mode);
  const [minLengthInput, setMinLengthInput] = useState(String(DEFAULT_OPTIONS.minLength));
  const [lowercase, setLowercase] = useState(DEFAULT_OPTIONS.lowercase);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const parsed = Number.parseInt(minLengthInput, 10);
  const minLength = Number.isFinite(parsed) ? Math.max(MIN_ALLOWED_LENGTH, parsed) : DEFAULT_OPTIONS.minLength;

  const deferredText = useDeferredValue(text);
  const output = useMemo(
    () => generateNumeronyms(deferredText, { mode, minLength, lowercase }),
    [deferredText, mode, minLength, lowercase]
  );

  const hasText = text.length > 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5 text-primary" />
            Text to Abbreviate
          </CardTitle>
          <CardDescription>
            Keep the first and last character and count the ones in between: internationalization becomes i18n.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or paste words here, one or more per line..."
            aria-label="Text to abbreviate"
            rows={6}
            spellCheck={false}
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
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 sm:gap-6">
          <div className="space-y-2">
            <label htmlFor="numeronym-mode" className="text-sm font-medium">
              Shorten
            </label>
            <Select value={mode} onValueChange={(value) => setMode(value as NumeronymMode)}>
              <SelectTrigger id="numeronym-mode">
                <SelectValue placeholder="Select what to shorten" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="word">Each word in place</SelectItem>
                <SelectItem value="phrase">Each line as one word</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {mode === 'word'
                ? 'Punctuation, numbers and spacing stay as typed.'
                : 'Letters and digits of a line are joined, so "Hello, World!" is H8d.'}
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="numeronym-min" className="text-sm font-medium">
              Minimum length
            </label>
            <Input
              id="numeronym-min"
              type="number"
              min={MIN_ALLOWED_LENGTH}
              inputMode="numeric"
              value={minLengthInput}
              onChange={(e) => setMinLengthInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Shorter words stay as they are. The lowest useful value is {MIN_ALLOWED_LENGTH} (cat becomes c1t).
            </p>
          </div>

          <Checkbox label="Lower case result" checked={lowercase} onCheckedChange={setLowercase} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Result</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            readOnly
            value={output}
            aria-label="Numeronyms"
            rows={6}
            spellCheck={false}
            placeholder={hasText ? '' : 'The result appears here.'}
            className="bg-muted/30 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => copyToClipboard(output)}
              disabled={!output}
              size="sm"
              variant={isCopied ? 'default' : 'outline'}
            >
              {isCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {isCopied ? 'Copied' : 'Copy Result'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
