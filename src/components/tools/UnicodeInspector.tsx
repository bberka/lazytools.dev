'use client';

import { Fragment, useDeferredValue, useMemo, useState } from 'react';
import {
  ArrowUp,
  Check,
  CircleCheck,
  Copy,
  Highlighter,
  ScanSearch,
  Table2,
  Trash2,
  TriangleAlert,
  WandSparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCopyToClipboard } from '@/hooks';
import { cn } from '@/lib/utils/cn';
import {
  CHAR_CLASSES,
  CLASS_INFO,
  EXAMPLE_TEXT,
  cleanText,
  inspectText,
  type CharClass,
  type CleanResult,
  type NormalizationForm,
} from '@/lib/tools/unicode-inspector';

type NormalizationChoice = NormalizationForm | 'none';

const NORMALIZATION_OPTIONS: ReadonlyArray<{ value: NormalizationChoice; label: string; hint: string }> = [
  { value: 'none', label: 'None', hint: 'Leave the characters as they are.' },
  {
    value: 'NFC',
    label: 'NFC (canonical composition)',
    hint: 'Joins a letter and its accent into one character. Safe for most text.',
  },
  {
    value: 'NFD',
    label: 'NFD (canonical decomposition)',
    hint: 'Splits accented letters into a base letter plus combining marks.',
  },
  {
    value: 'NFKC',
    label: 'NFKC (compatibility composition)',
    hint: 'Like NFC, and also folds look-alikes: ligatures, full-width letters, no-break spaces.',
  },
  {
    value: 'NFKD',
    label: 'NFKD (compatibility decomposition)',
    hint: 'Like NFD, and also folds look-alikes such as ligatures and full-width letters.',
  },
];

const MARK_BASE =
  'mx-0.5 inline-flex items-center whitespace-nowrap rounded border px-1 align-baseline font-mono text-[0.7rem] font-semibold leading-5';

const TONE_CLASSES = {
  muted: 'border-input bg-muted text-muted-foreground',
  warn: 'border-primary/40 bg-primary/10 text-primary',
  danger: 'border-destructive/40 bg-destructive/10 text-destructive',
} as const;

// Bidirectional controls and tag characters can hide meaning or text, so they
// get the strongest colour. Emoji sequence parts and plain whitespace are expected.
function toneFor(className: CharClass | null, emojiPart: boolean): keyof typeof TONE_CLASSES {
  if (emojiPart || className === 'whitespace') return 'muted';
  if (className === 'bidi' || className === 'tag') return 'danger';
  return 'warn';
}

function CharBadge({
  short,
  title,
  className,
  emojiPart,
}: {
  short: string;
  title: string;
  className: CharClass | null;
  emojiPart: boolean;
}) {
  return (
    <span title={title} className={cn(MARK_BASE, TONE_CLASSES[toneFor(className, emojiPart)])}>
      {short}
    </span>
  );
}

function count(value: number, one: string, many: string): string {
  return `${value.toLocaleString()} ${value === 1 ? one : many}`;
}

function describeCleaning(
  result: CleanResult,
  steps: { removeInvisible: boolean; replaceSpaces: boolean; normalization: NormalizationChoice }
): string {
  const parts: string[] = [];
  if (steps.removeInvisible) parts.push(`${count(result.removed, 'invisible character', 'invisible characters')} removed`);
  if (steps.replaceSpaces) parts.push(`${count(result.replaced, 'space', 'spaces')} replaced`);
  if (steps.normalization !== 'none') {
    parts.push(result.normalizationChanged ? `normalised to ${steps.normalization}` : `already ${steps.normalization}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'No cleanup step selected';
}

export function UnicodeInspector() {
  const [text, setText] = useState('');
  const [markWhitespace, setMarkWhitespace] = useState(false);
  const [onlySpecial, setOnlySpecial] = useState(false);
  const [removeInvisible, setRemoveInvisible] = useState(true);
  const [keepScriptJoiners, setKeepScriptJoiners] = useState(false);
  const [replaceSpaces, setReplaceSpaces] = useState(true);
  const [normalization, setNormalization] = useState<NormalizationChoice>('none');
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  // Large pastes should not make typing feel slow.
  const deferredText = useDeferredValue(text);

  const inspection = useMemo(
    () => inspectText(deferredText, { onlyFlagged: onlySpecial, markWhitespace }),
    [deferredText, onlySpecial, markWhitespace]
  );
  const cleaned = useMemo(
    () => cleanText(deferredText, { removeInvisible, replaceSpaces, normalization, keepScriptJoiners }),
    [deferredText, removeInvisible, replaceSpaces, normalization, keepScriptJoiners]
  );

  const { stats } = inspection;
  const hasText = text.length > 0;
  const normalizationHint =
    NORMALIZATION_OPTIONS.find((option) => option.value === normalization)?.hint ?? '';

  const statTiles = [
    { label: 'UTF-16 length', value: stats.utf16Length, hint: 'code units, as String.length' },
    { label: 'Code points', value: stats.codePoints, hint: 'Unicode characters' },
    {
      label: 'Grapheme clusters',
      value: stats.graphemes,
      hint: stats.graphemeMethod === 'intl-segmenter' ? 'user-perceived characters' : 'estimated',
    },
    { label: 'UTF-8 bytes', value: stats.utf8Bytes, hint: 'encoded size' },
    {
      label: 'Invisible or suspicious',
      value: stats.flagged,
      hint: stats.emojiParts > 0 ? `plus ${stats.emojiParts} in emoji sequences` : 'hidden or look-alike characters',
      alert: stats.flagged > 0,
    },
  ];

  const handleClear = () => setText('');
  const handleExample = () => setText(EXAMPLE_TEXT);
  const handleUseResult = () => setText(cleaned.text);

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5 text-primary" />
            Text to Inspect
          </CardTitle>
          <CardDescription>
            Paste text to find zero-width, look-alike and control characters. It never leaves your browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste or type text here..."
            aria-label="Text to inspect"
            rows={6}
            spellCheck={false}
            className="font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleExample} variant="outline" size="sm">
              <ScanSearch className="mr-2 h-4 w-4" />
              Load Example
            </Button>
            <Button onClick={handleClear} variant="outline" size="sm" disabled={!hasText}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {!hasText ? (
        <Card className="flex items-center justify-center py-6 text-muted-foreground sm:py-12">
          <CardContent className="text-center text-sm">
            Paste some text above, or load the example, to see every character and the hidden ones.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Statistics</CardTitle>
              <CardDescription>
                Lengths measured four ways, and how many characters are invisible or suspicious.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
                {statTiles.map((tile) => (
                  <div key={tile.label} className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">{tile.label}</div>
                    <div
                      className={cn(
                        'text-xl font-semibold tabular-nums sm:text-2xl',
                        tile.alert && 'text-destructive'
                      )}
                    >
                      {tile.value.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">{tile.hint}</div>
                  </div>
                ))}
              </div>

              {stats.graphemeMethod === 'approximate' && (
                <p className="text-xs text-muted-foreground">
                  Intl.Segmenter is not available in this browser, so the grapheme cluster count is an estimate.
                </p>
              )}

              {stats.flagged === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <CircleCheck className="h-4 w-4 shrink-0 text-primary" />
                  No invisible or suspicious characters found.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Invisible characters by class">
                  {CHAR_CLASSES.filter((name) => (stats.byClass[name] ?? 0) > 0).map((name) => (
                    <Badge key={name} variant="outline" title={CLASS_INFO[name].description} className="gap-1.5 font-normal">
                      {CLASS_INFO[name].label}
                      <span className="font-semibold">{stats.byClass[name]}</span>
                    </Badge>
                  ))}
                </div>
              )}

              {inspection.hiddenTagText && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="min-w-0">
                    Tag characters in this text spell out hidden ASCII:{' '}
                    <code className="break-all font-mono font-semibold">{inspection.hiddenTagText}</code>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Highlighter className="h-4 w-4 text-muted-foreground" />
                Highlighted View
              </CardTitle>
              <CardDescription>
                Invisible characters appear as labelled badges. Hover a badge for the code point and name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Checkbox
                label="Also mark tabs and line breaks"
                checked={markWhitespace}
                onCheckedChange={setMarkWhitespace}
              />
              <div
                role="region"
                tabIndex={0}
                aria-label="Text with invisible characters marked"
                className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-input bg-muted/30 p-3 font-mono text-sm leading-7 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {inspection.highlight.map((segment, index) =>
                  segment.kind === 'text' ? (
                    <Fragment key={index}>{segment.text}</Fragment>
                  ) : (
                    <Fragment key={index}>
                      <CharBadge
                        short={segment.short}
                        title={segment.title}
                        className={segment.className}
                        emojiPart={segment.emojiPart}
                      />
                      {segment.after}
                    </Fragment>
                  )
                )}
              </div>
              {inspection.highlightTruncated && (
                <p className="text-xs text-muted-foreground" role="status">
                  The view stops after the first {inspection.highlight.filter((s) => s.kind === 'mark').length.toLocaleString()}{' '}
                  marked characters. The statistics still cover the whole text.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <WandSparkles className="h-4 w-4 text-muted-foreground" />
                Clean Up
              </CardTitle>
              <CardDescription>Choose what to fix. The result updates as you type.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
                <div className="space-y-3">
                  <Checkbox
                    label="Remove invisible characters"
                    checked={removeInvisible}
                    onCheckedChange={setRemoveInvisible}
                  />
                  <p className="pl-7 text-xs text-muted-foreground">
                    Zero-width, bidirectional and control characters, soft hyphens, stray variation selectors and
                    tags. Joiners and selectors inside emoji are kept.
                  </p>
                  <div className="pl-7">
                    <Checkbox
                      label="Keep ZWNJ and ZWJ inside non-Latin words"
                      checked={keepScriptJoiners}
                      onCheckedChange={setKeepScriptJoiners}
                      disabled={!removeInvisible}
                    />
                  </div>
                  <Checkbox
                    label="Replace non-standard spaces with a normal space"
                    checked={replaceSpaces}
                    onCheckedChange={setReplaceSpaces}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="unicode-normalization" className="text-sm font-medium">
                    Normalise
                  </label>
                  <Select value={normalization} onValueChange={(value) => setNormalization(value as NormalizationChoice)}>
                    <SelectTrigger id="unicode-normalization">
                      <SelectValue placeholder="Select a normalisation form" />
                    </SelectTrigger>
                    <SelectContent>
                      {NORMALIZATION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{normalizationHint}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <label htmlFor="unicode-cleaned-text" className="text-sm font-medium">
                    Cleaned text
                  </label>
                  <span className="text-xs text-muted-foreground" role="status">
                    {describeCleaning(cleaned, { removeInvisible, replaceSpaces, normalization })}
                  </span>
                </div>
                <Textarea
                  id="unicode-cleaned-text"
                  readOnly
                  value={cleaned.text}
                  rows={5}
                  spellCheck={false}
                  className="bg-muted/30 font-mono text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => copyToClipboard(cleaned.text)}
                    disabled={!cleaned.text}
                    size="sm"
                    variant={isCopied ? 'default' : 'outline'}
                  >
                    {isCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                    {isCopied ? 'Copied' : 'Copy Result'}
                  </Button>
                  <Button onClick={handleUseResult} disabled={!cleaned.changed} size="sm" variant="outline">
                    <ArrowUp className="mr-2 h-4 w-4" />
                    Use as Input
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Table2 className="h-4 w-4 text-muted-foreground" />
                Characters
              </CardTitle>
              <CardDescription>
                Every code point with its UTF-8 bytes, UTF-16 code units, HTML entity and JavaScript escape.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Checkbox
                label="Only invisible, special and suspicious characters"
                checked={onlySpecial}
                onCheckedChange={setOnlySpecial}
              />

              {inspection.rows.length === 0 ? (
                <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
                  <CircleCheck className="h-4 w-4 shrink-0 text-primary" />
                  No invisible or special characters found.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[44rem] border-collapse text-left text-xs">
                    <caption className="sr-only">Code points of the text with their encodings</caption>
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        {['#', 'Char', 'Code point', 'Name', 'UTF-8', 'UTF-16', 'HTML', 'JavaScript'].map((heading) => (
                          <th key={heading} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {inspection.rows.map((row) => (
                        <tr
                          key={row.position}
                          className={cn('border-t', row.flagged && !row.emojiPart && 'bg-primary/5')}
                        >
                          <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{row.position}</td>
                          <td className="px-3 py-1.5">
                            {row.badge ? (
                              <CharBadge
                                short={row.glyph}
                                title={`${row.hex} ${row.label}`}
                                className={row.className}
                                emojiPart={row.emojiPart}
                              />
                            ) : (
                              <span className="font-mono text-sm">{row.glyph}</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 font-mono">{row.hex}</td>
                          <td className="px-3 py-1.5">
                            {row.label}
                            {row.emojiPart && <span className="text-muted-foreground"> (in emoji sequence)</span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 font-mono">{row.utf8}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 font-mono">{row.utf16}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 font-mono">{row.html}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 font-mono">{row.js}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {inspection.rowsTruncated && (
                <p className="text-xs text-muted-foreground" role="status">
                  Showing the first {inspection.rows.length.toLocaleString()} of{' '}
                  {inspection.totalRows.toLocaleString()} rows. Use the filter above to list only the special
                  characters, or paste a shorter excerpt.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
