'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Link as LinkIcon, Trash2 } from 'lucide-react';
import { CopyButton } from '@/components/CopyButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_OPTIONS,
  EXAMPLE_TEXT,
  generateSlugs,
  type SlugOptions,
  type SlugSeparator,
  type Transliteration,
} from '@/lib/tools/slugify';

const SEPARATORS: ReadonlyArray<{ value: string; label: string; separator: SlugSeparator }> = [
  { value: 'hyphen', label: 'Hyphen ( - )', separator: '-' },
  { value: 'underscore', label: 'Underscore ( _ )', separator: '_' },
  { value: 'dot', label: 'Dot ( . )', separator: '.' },
  { value: 'none', label: 'None', separator: '' },
];

const TRANSLITERATIONS: ReadonlyArray<{ value: Transliteration; label: string; hint: string }> = [
  {
    value: 'basic',
    label: 'Plain letters',
    hint: 'é becomes e, and the Turkish ı ş ğ ü ö ç İ become i s g u o c I. ß becomes ss.',
  },
  {
    value: 'german',
    label: 'German spelling',
    hint: 'Like plain letters, but ä ö ü become ae oe ue, as in German URLs.',
  },
  { value: 'off', label: 'Keep letters as typed', hint: 'Accents and other letters stay in the slug.' },
];

export function SlugGenerator() {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<SlugOptions>(DEFAULT_OPTIONS);
  const [maxLengthInput, setMaxLengthInput] = useState('');

  const deferredText = useDeferredValue(text);
  const slug = useMemo(() => generateSlugs(deferredText, options), [deferredText, options]);

  const update = <K extends keyof SlugOptions>(key: K, value: SlugOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  const separatorValue = SEPARATORS.find((entry) => entry.separator === options.separator)?.value ?? 'hyphen';
  const transliterationHint = TRANSLITERATIONS.find((entry) => entry.value === options.transliteration)?.hint ?? '';
  const slugCount = slug.split(/\r\n|\n/).filter(Boolean).length;
  const hasText = text.length > 0;

  const handleMaxLength = (raw: string) => {
    setMaxLengthInput(raw);
    const value = Number.parseInt(raw, 10);
    update('maxLength', Number.isFinite(value) && value > 0 ? value : 0);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-primary" />
            Text to Slugify
          </CardTitle>
          <CardDescription>Turn a title into a clean URL slug. It never leaves your browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or paste a title..."
            aria-label="Text to slugify"
            rows={options.perLine ? 6 : 3}
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
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="slug-separator" className="text-sm font-medium">
                Separator
              </label>
              <Select
                value={separatorValue}
                onValueChange={(value) =>
                  update('separator', SEPARATORS.find((entry) => entry.value === value)?.separator ?? '-')
                }
              >
                <SelectTrigger id="slug-separator">
                  <SelectValue placeholder="Select a separator" />
                </SelectTrigger>
                <SelectContent>
                  {SEPARATORS.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="slug-letters" className="text-sm font-medium">
                Accented letters
              </label>
              <Select
                value={options.transliteration}
                onValueChange={(value) => update('transliteration', value as Transliteration)}
              >
                <SelectTrigger id="slug-letters">
                  <SelectValue placeholder="Select how to treat accents" />
                </SelectTrigger>
                <SelectContent>
                  {TRANSLITERATIONS.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{transliterationHint}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="slug-max-length" className="text-sm font-medium">
                Maximum length
              </label>
              <Input
                id="slug-max-length"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="No limit"
                value={maxLengthInput}
                onChange={(e) => handleMaxLength(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Cuts between words, so no word is left half written.</p>
            </div>
            <div className="space-y-3">
              <Checkbox
                label="Lower case"
                checked={options.lowercase}
                onCheckedChange={(checked) => update('lowercase', checked)}
              />
              <Checkbox
                label="Remove stopwords (a, the, of, and...)"
                checked={options.removeStopwords}
                onCheckedChange={(checked) => update('removeStopwords', checked)}
              />
              <Checkbox
                label="One slug per line"
                checked={options.perLine}
                onCheckedChange={(checked) => update('perLine', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Slug</CardTitle>
          <CardDescription>
            <span role="status" aria-label="Slug summary">
              {!hasText
                ? 'Type a title above to see its slug.'
                : slugCount === 0
                  ? 'No letters or digits to make a slug from.'
                  : options.perLine
                    ? `${slugCount.toLocaleString()} ${slugCount === 1 ? 'slug' : 'slugs'}`
                    : `${slug.length.toLocaleString()} ${slug.length === 1 ? 'character' : 'characters'}`}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            readOnly
            value={slug}
            aria-label="Slug"
            rows={options.perLine ? 6 : 2}
            spellCheck={false}
            className="bg-muted/30 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={slug} label="Copy Slug" disabled={!slug} size="sm" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
