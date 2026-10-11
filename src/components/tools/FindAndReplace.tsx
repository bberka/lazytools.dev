'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Eraser, Replace, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCopyToClipboard } from '@/hooks';
import { findAndReplace } from '@/lib/tools/find-and-replace';
import { splitAtMatches } from '@/lib/tools/match-segments';
import { countCharacters } from '@/lib/tools/word-counter';

export function FindAndReplace() {
  const [input, setInput] = useState('');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [replaceAll, setReplaceAll] = useState(true);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const result = useMemo(
    () =>
      findAndReplace(input, {
        find: findText,
        replace: replaceText,
        caseSensitive,
        wholeWord,
        useRegex,
        replaceAll,
      }),
    [caseSensitive, findText, input, replaceAll, replaceText, useRegex, wholeWord]
  );

  const highlightedSegments = useMemo(
    () => splitAtMatches(input, result.matches),
    [input, result.matches]
  );

  // Visible characters, so an emoji in the output counts once.
  const outputCharacters = useMemo(() => countCharacters(result.output), [result.output]);

  const handleCopy = async () => {
    await copyToClipboard(result.output);
  };

  const handleApply = () => {
    setInput(result.output);
  };

  const handleClear = () => {
    setInput('');
    setFindText('');
    setReplaceText('');
    setCaseSensitive(false);
    setWholeWord(false);
    setUseRegex(false);
    setReplaceAll(true);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Setup
          </CardTitle>
          <CardDescription>
            Choose literal or regex matching, then preview replacements before applying them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="find-text" className="text-sm font-medium">
                Find
              </label>
              <Input
                id="find-text"
                value={findText}
                onChange={(event) => setFindText((event.target as HTMLInputElement).value)}
                placeholder={useRegex ? 'Enter regex pattern...' : 'Enter text to find...'}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="replace-text" className="text-sm font-medium">
                Replace With
              </label>
              <Input
                id="replace-text"
                value={replaceText}
                onChange={(event) => setReplaceText((event.target as HTMLInputElement).value)}
                placeholder={useRegex ? 'Replacement text, supports $1...' : 'Replacement text...'}
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Checkbox
              checked={caseSensitive}
              onCheckedChange={setCaseSensitive}
              label="Case sensitive"
            />
            <Checkbox checked={wholeWord} onCheckedChange={setWholeWord} label="Whole word" />
            <Checkbox checked={useRegex} onCheckedChange={setUseRegex} label="Use regex" />
            <Checkbox checked={replaceAll} onCheckedChange={setReplaceAll} label="Replace all" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              Matches: {result.matches.length.toLocaleString()}
            </Badge>
            <Badge variant="outline">
              Replacements: {result.replacements.toLocaleString()}
            </Badge>
            <Badge variant="outline">
              Output chars: {outputCharacters.toLocaleString()}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Input Text</CardTitle>
          <CardDescription>Paste the source text you want to search and replace.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={input}
            onChange={(event) => setInput((event.target as HTMLTextAreaElement).value)}
            placeholder="Paste text here..."
            aria-label="Input text"
            rows={12}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>

      {result.error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <strong>Error:</strong> {result.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Match Preview
          </CardTitle>
          <CardDescription>
            {findText
              ? result.matches.length > 0
                ? 'Matched text is highlighted below.'
                : 'No matches found in the current input.'
              : 'Enter a search value to highlight matches.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="min-h-[180px] whitespace-pre-wrap rounded-md border bg-muted/30 p-4 font-mono text-sm break-words">
            {highlightedSegments.map((segment, index) => (
              <span
                key={index}
                className={segment.isMatch ? 'rounded bg-yellow-300/70 px-0.5 text-black' : ''}
              >
                {segment.text}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Replace className="h-5 w-5" />
            Result
          </CardTitle>
          <CardDescription>Preview the replaced text before copying or applying it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={result.output}
            readOnly
            aria-label="Result"
            rows={12}
            className="font-mono text-sm"
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={handleCopy}
              disabled={!result.output}
              variant={isCopied ? 'default' : 'outline'}
              size="sm"
              className="min-h-11 sm:min-h-9"
            >
              {isCopied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Result
                </>
              )}
            </Button>
            <Button
              onClick={handleApply}
              disabled={!!result.error || !findText || input === result.output}
              size="sm"
              className="min-h-11 sm:min-h-9"
            >
              <Replace className="mr-2 h-4 w-4" />
              Apply to Input
            </Button>
            <Button
              onClick={handleClear}
              variant="outline"
              size="sm"
              className="min-h-11 sm:min-h-9"
            >
              <Eraser className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
