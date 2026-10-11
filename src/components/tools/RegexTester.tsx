'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, SearchCode, Trash2, Wand2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TooltipSimple } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCopyToClipboard } from '@/hooks';
import { splitAtMatches } from '@/lib/tools/match-segments';
import { explainRegex, testRegex, toFlagString, type RegexFlags } from '@/lib/tools/regex-tester';

type BuilderToken = {
  label: string;
  snippet: string;
  hint: string;
};

type PatternRecipe = {
  value: string;
  label: string;
  sample: string;
};

const TOKEN_GROUPS: Array<{ title: string; tokens: BuilderToken[] }> = [
  {
    title: 'Character Classes',
    tokens: [
      { label: 'Digit', snippet: '\\d', hint: 'Any numeric digit' },
      { label: 'Word', snippet: '\\w', hint: 'Letter, digit, or underscore' },
      { label: 'Whitespace', snippet: '\\s', hint: 'Space, tab, or newline' },
      { label: 'Any char', snippet: '.', hint: 'Any character except newline' },
      { label: 'Lowercase letters', snippet: '[a-z]', hint: 'ASCII lowercase range' },
      { label: 'Uppercase letters', snippet: '[A-Z]', hint: 'ASCII uppercase range' },
      { label: 'Letters only', snippet: '[A-Za-z]', hint: 'Upper and lowercase letters' },
      { label: 'Not digit', snippet: '\\D', hint: 'Any non-digit character' },
    ],
  },
  {
    title: 'Quantifiers',
    tokens: [
      { label: 'Zero or more', snippet: '*', hint: 'Repeat previous token 0+' },
      { label: 'One or more', snippet: '+', hint: 'Repeat previous token 1+' },
      { label: 'Optional', snippet: '?', hint: 'Repeat previous token 0 or 1' },
      { label: 'Exactly 3', snippet: '{3}', hint: 'Repeat exactly 3 times' },
      { label: 'Between 2 and 5', snippet: '{2,5}', hint: 'Repeat 2 to 5 times' },
      { label: 'At least 1', snippet: '{1,}', hint: 'Repeat 1 or more times' },
    ],
  },
  {
    title: 'Anchors & Groups',
    tokens: [
      { label: 'Start of line', snippet: '^', hint: 'Match from the start' },
      { label: 'End of line', snippet: '$', hint: 'Match at the end' },
      { label: 'Capture group', snippet: '()', hint: 'Capture a submatch' },
      { label: 'Non-capture group', snippet: '(?:)', hint: 'Group without capturing' },
      { label: 'Alternation', snippet: '|', hint: 'Match left or right side' },
      { label: 'Word boundary', snippet: '\\b', hint: 'Whole-word edge' },
    ],
  },
];

const RECIPES: PatternRecipe[] = [
  {
    value: '^[\\w.%+-]+@[\\w.-]+\\.[A-Za-z]{2,}$',
    label: 'Email address',
    sample: 'ada@example.com',
  },
  {
    value: '^https?:\\/\\/[\\w.-]+(?:\\/[\\w./?%&=-]*)?$',
    label: 'HTTP / HTTPS URL',
    sample: 'https://example.com/docs?id=1',
  },
  {
    value: '^\\+?[1-9]\\d{7,14}$',
    label: 'International phone',
    sample: '+14155550123',
  },
  {
    value: '^\\d{4}-\\d{2}-\\d{2}$',
    label: 'ISO date',
    sample: '2026-05-03',
  },
  {
    value: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$',
    label: 'Strong password check',
    sample: 'Stronger123',
  },
  {
    value: '\\b[A-Fa-f0-9]{8}\\b',
    label: '8-char hex token',
    sample: 'DEADBEEF',
  },
];

export function RegexTester() {
  const [pattern, setPattern] = useState('');
  const [testString, setTestString] = useState('');
  const [flags, setFlags] = useState<RegexFlags>({
    global: true,
    multiline: false,
    caseInsensitive: false,
    dotAll: false,
    unicode: false,
  });
  const copy = useCopyToClipboard();

  const flagString = toFlagString(flags);
  const { isValid, error, matches } = useMemo(
    () => testRegex(pattern, flags, testString),
    [pattern, flags, testString]
  );
  const explanations = useMemo(
    () => (isValid ? explainRegex(pattern, flags) : []),
    [isValid, pattern, flags]
  );
  const highlightedParts = useMemo(
    () => splitAtMatches(testString, matches),
    [matches, testString]
  );
  // The recipe list only names a recipe while the pattern still is that recipe.
  const selectedRecipe = RECIPES.some((recipe) => recipe.value === pattern) ? pattern : '';

  const appendSnippet = (snippet: string) => {
    setPattern((current) => current + snippet);
  };

  const handleRecipeChange = (value: string) => {
    const recipe = RECIPES.find((item) => item.value === value);
    setPattern(value);
    if (recipe) {
      setTestString(recipe.sample);
    }
  };

  const handleClear = () => {
    setPattern('');
    setTestString('');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SearchCode className="h-5 w-5" />
            Regular Expression
          </CardTitle>
          <CardDescription>Enter a regex pattern or assemble one with guided snippets.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-mono text-muted-foreground">/</span>
              <Input
                value={pattern}
                onChange={(event) => setPattern((event.target as HTMLInputElement).value)}
                placeholder="Enter regex pattern..."
                aria-label="Regex pattern"
                aria-invalid={pattern !== '' && !isValid}
                className={`min-w-0 flex-1 font-mono ${
                  pattern && !isValid
                    ? 'border-destructive'
                    : pattern && isValid
                      ? 'border-green-500'
                      : ''
                }`}
              />
              <span className="text-2xl font-mono text-muted-foreground">/</span>
              <span className="w-full min-w-[60px] font-mono text-sm text-muted-foreground sm:w-auto">
                {flagString}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex-1 space-y-2">
              <label htmlFor="regex-recipe" className="text-sm font-medium">
                Guided recipe
              </label>
              <Select value={selectedRecipe} onValueChange={handleRecipeChange}>
                <SelectTrigger id="regex-recipe">
                  <SelectValue placeholder="Start from a common pattern..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {RECIPES.map((recipe) => (
                      <SelectItem key={recipe.value} value={recipe.value}>
                        {recipe.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => copy.copyToClipboard(pattern)}
              variant={copy.isCopied ? 'default' : 'outline'}
              disabled={!pattern}
              className="min-h-11 sm:min-h-10"
            >
              {copy.isCopied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy pattern
                </>
              )}
            </Button>

            <Button onClick={handleClear} variant="outline" className="min-h-11 sm:min-h-10">
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <strong>Error:</strong> {error}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-sm font-medium">Flags</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="regex-flag-g"
                  checked={flags.global}
                  onCheckedChange={(checked) => setFlags({ ...flags, global: checked })}
                />
                <label htmlFor="regex-flag-g" className="cursor-pointer text-sm">
                  Global (<code className="font-mono">g</code>)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="regex-flag-i"
                  checked={flags.caseInsensitive}
                  onCheckedChange={(checked) => setFlags({ ...flags, caseInsensitive: checked })}
                />
                <label htmlFor="regex-flag-i" className="cursor-pointer text-sm">
                  Case Insensitive (<code className="font-mono">i</code>)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="regex-flag-m"
                  checked={flags.multiline}
                  onCheckedChange={(checked) => setFlags({ ...flags, multiline: checked })}
                />
                <label htmlFor="regex-flag-m" className="cursor-pointer text-sm">
                  Multiline (<code className="font-mono">m</code>)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="regex-flag-s"
                  checked={flags.dotAll}
                  onCheckedChange={(checked) => setFlags({ ...flags, dotAll: checked })}
                />
                <label htmlFor="regex-flag-s" className="cursor-pointer text-sm">
                  Dot All (<code className="font-mono">s</code>)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="regex-flag-u"
                  checked={flags.unicode}
                  onCheckedChange={(checked) => setFlags({ ...flags, unicode: checked })}
                />
                <label htmlFor="regex-flag-u" className="cursor-pointer text-sm">
                  Unicode (<code className="font-mono">u</code>)
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {pattern && isValid && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <SearchCode className="h-4.5 w-4.5" />
              Pattern Explanation
            </CardTitle>
            <CardDescription className="text-xs">
              Breakdown of what each symbol in the expression matches.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border rounded-md divide-y max-h-[300px] overflow-y-auto scrollbar-thin bg-background">
              {explanations.map((exp, idx) => (
                <div key={idx} className="grid grid-cols-[100px_1fr] items-start p-3 gap-4 text-sm hover:bg-muted/40 transition-colors">
                  <div className="font-mono bg-muted px-1.5 py-0.5 rounded text-center break-all select-all font-semibold shrink-0 text-primary">
                    {exp.token}
                  </div>
                  <div>
                    <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-muted-foreground mr-2 border rounded px-1.5 py-0.5 bg-muted/25">
                      {exp.category}
                    </span>
                    <span>{exp.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Regex Builder
          </CardTitle>
          <CardDescription>
            Click common tokens to assemble a pattern faster, then refine it manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {TOKEN_GROUPS.map((group) => (
            <div key={group.title} className="space-y-2">
              <div className="text-sm font-medium">{group.title}</div>
              <div className="flex flex-wrap gap-2">
                {group.tokens.map((token) => (
                  <TooltipSimple key={`${group.title}-${token.label}`} content={token.hint}>
                    <Button
                      onClick={() => appendSnippet(token.snippet)}
                      variant="outline"
                      size="sm"
                      className="min-h-10 gap-2"
                      aria-label={`${token.label} (${token.snippet})`}
                    >
                      <code className="font-mono text-xs">{token.snippet}</code>
                      <span className="text-xs text-muted-foreground">{token.label}</span>
                    </Button>
                  </TooltipSimple>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test String</CardTitle>
          <CardDescription>Enter text to test against the regex.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={testString}
            onChange={(event) => setTestString((event.target as HTMLTextAreaElement).value)}
            placeholder="Enter test string..."
            aria-label="Test string"
            rows={8}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>

      {testString && pattern && isValid && (
        <Card>
          <CardHeader>
            <CardTitle>Matches ({matches.length})</CardTitle>
            <CardDescription>
              {matches.length === 0
                ? 'No matches found'
                : `Found ${matches.length} match${matches.length === 1 ? '' : 'es'}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="break-words rounded-md bg-muted p-4 font-mono text-sm whitespace-pre-wrap">
              {highlightedParts.map((part, index) => (
                <span
                  key={index}
                  className={part.isMatch ? 'bg-yellow-300 dark:bg-yellow-600' : ''}
                >
                  {part.text}
                </span>
              ))}
            </div>

            {matches.length > 0 && (
              <div className="space-y-3">
                {matches.map((match, index) => (
                  <div key={`${match.index}-${index}`} className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm font-medium">Match {index + 1}</span>
                      <span className="text-xs text-muted-foreground">Index: {match.index}</span>
                    </div>
                    <div className="break-all rounded bg-muted p-2 font-mono text-sm">
                      {match.text}
                    </div>
                    {match.groups.length > 0 && match.groups.some((group) => group !== undefined) && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">
                          Capture Groups
                        </div>
                        {match.groups.map((group, groupIndex) =>
                          group !== undefined ? (
                            <div key={groupIndex} className="pl-4 text-xs">
                              <span className="text-muted-foreground">Group {groupIndex + 1}:</span>{' '}
                              <code className="rounded bg-muted px-1 py-0.5">{group}</code>
                            </div>
                          ) : null
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
