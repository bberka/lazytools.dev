'use client';

import { useMemo, useState } from 'react';
import { AlignLeft, Check, Copy, Eraser, Timer, Type } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useCopyToClipboard } from '@/hooks';
import { analyzeText, formatDuration } from '@/lib/tools/word-counter';

export function WordCounter() {
  const [text, setText] = useState('');
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const stats = useMemo(() => analyzeText(text, { includeNumbers }), [includeNumbers, text]);

  const statCards = [
    { label: 'Words', value: stats.words, icon: Type },
    { label: 'Characters', value: stats.characters, icon: AlignLeft },
    { label: 'No Spaces', value: stats.charactersNoSpaces, icon: AlignLeft },
    { label: 'Sentences', value: stats.sentences, icon: AlignLeft },
    { label: 'Paragraphs', value: stats.paragraphs, icon: AlignLeft },
    { label: 'Lines', value: stats.lines, icon: AlignLeft },
  ];

  const insights = [
    { label: 'Read Time', value: formatDuration(stats.readingMinutes) },
    { label: 'Speak Time', value: formatDuration(stats.speakingMinutes) },
    {
      label: 'Avg Word Length',
      value: stats.words > 0 ? `${stats.averageWordLength.toFixed(1)} chars` : '0.0 chars',
    },
    { label: 'Longest Word', value: stats.longestWord || '—' },
  ];

  const handleClear = () => {
    setText('');
  };

  const handleCopy = async () => {
    await copyToClipboard(text);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            Input Text
          </CardTitle>
          <CardDescription>
            Paste or type text to count words, characters, sentences, and estimated reading time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(event) => setText((event.target as HTMLTextAreaElement).value)}
            placeholder="Paste text here..."
            aria-label="Text to count"
            rows={12}
            className="font-mono text-sm"
          />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Checkbox
              checked={includeNumbers}
              onCheckedChange={setIncludeNumbers}
              label="Count numbers as words"
            />

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={handleCopy}
                disabled={!text}
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
                    Copy Text
                  </>
                )}
              </Button>
              <Button
                onClick={handleClear}
                disabled={!text}
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-9"
              >
                <Eraser className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {statCards.map((stat) => {
          const Icon = stat.icon;

          return (
            <Card key={stat.label}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4" />
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tracking-tight">{stat.value.toLocaleString()}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Quick Insights
          </CardTitle>
          <CardDescription>
            Lightweight estimates for reading, speaking, and text complexity.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {insights.map((insight) => (
            <div
              key={insight.label}
              className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3"
            >
              <span className="text-sm text-muted-foreground">{insight.label}</span>
              <Badge variant="outline" className="max-w-[60%] truncate">
                {insight.value}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
