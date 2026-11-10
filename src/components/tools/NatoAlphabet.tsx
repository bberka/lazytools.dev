'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowLeftRight, Radio, Trash2 } from 'lucide-react';
import { CopyButton } from '@/components/CopyButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_DECODE_OPTIONS,
  DEFAULT_ENCODE_OPTIONS,
  EXAMPLE_TEXT,
  NATO_DIGITS,
  NATO_LETTERS,
  decodeNato,
  encodeNato,
  type DigitStyle,
  type NatoEntry,
  type WordCase,
} from '@/lib/tools/nato-alphabet';

type Mode = 'encode' | 'decode';

const ENCODED_EXAMPLE = encodeNato(EXAMPLE_TEXT, DEFAULT_ENCODE_OPTIONS);

function ReferenceTable({ caption, entries }: { caption: string; entries: readonly NatoEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Character
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Code word
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Say it
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.symbol} className="border-t">
              <td className="px-3 py-1.5 font-mono font-semibold">{entry.symbol}</td>
              <td className="px-3 py-1.5">{entry.word}</td>
              <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{entry.pronunciation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NatoAlphabet() {
  const [mode, setMode] = useState<Mode>('encode');
  const [text, setText] = useState('');
  const [digitStyle, setDigitStyle] = useState<DigitStyle>(DEFAULT_ENCODE_OPTIONS.digitStyle);
  const [wordCase, setWordCase] = useState<WordCase>(DEFAULT_ENCODE_OPTIONS.wordCase);
  const [keepUnknown, setKeepUnknown] = useState(true);
  const [lowercase, setLowercase] = useState(DEFAULT_DECODE_OPTIONS.lowercase);

  const deferredText = useDeferredValue(text);
  const output = useMemo(
    () =>
      mode === 'encode'
        ? encodeNato(deferredText, { digitStyle, wordCase, keepUnknown })
        : decodeNato(deferredText, { keepUnknown, lowercase }),
    [mode, deferredText, digitStyle, wordCase, keepUnknown, lowercase]
  );

  const encoding = mode === 'encode';
  const hasText = text.length > 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            {encoding ? 'Text to Spell' : 'Code Words to Read'}
          </CardTitle>
          <CardDescription>
            {encoding
              ? 'Spell any text with the NATO alphabet. Word breaks are written as a slash.'
              : 'Paste code words such as "Hotel India". Use a slash between words.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
            <TabsList>
              <TabsTrigger value="encode">Text to NATO</TabsTrigger>
              <TabsTrigger value="decode">NATO to Text</TabsTrigger>
            </TabsList>
          </Tabs>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={encoding ? 'Type or paste text here...' : 'Hotel India / Alfa Wun'}
            aria-label={encoding ? 'Text to spell' : 'Code words to read'}
            rows={5}
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setText(encoding ? EXAMPLE_TEXT : ENCODED_EXAMPLE)} variant="outline" size="sm">
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
          {encoding ? (
            <>
              <div className="space-y-2">
                <label htmlFor="nato-digits" className="text-sm font-medium">
                  Digits
                </label>
                <Select value={digitStyle} onValueChange={(value) => setDigitStyle(value as DigitStyle)}>
                  <SelectTrigger id="nato-digits">
                    <SelectValue placeholder="Select a digit style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="icao">ICAO (Wun, Too, Tree, Fower, Fife, Niner)</SelectItem>
                    <SelectItem value="plain">Plain (One, Two, Three, Four, Five, Nine)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="nato-case" className="text-sm font-medium">
                  Letter case
                </label>
                <Select value={wordCase} onValueChange={(value) => setWordCase(value as WordCase)}>
                  <SelectTrigger id="nato-case">
                    <SelectValue placeholder="Select a letter case" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="title">Capitalised (Alfa)</SelectItem>
                    <SelectItem value="upper">Upper case (ALFA)</SelectItem>
                    <SelectItem value="lower">Lower case (alfa)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <Checkbox label="Lower-case result" checked={lowercase} onCheckedChange={setLowercase} />
          )}
          <Checkbox
            label={encoding ? 'Keep characters without a code word' : 'Keep words that are not code words'}
            checked={keepUnknown}
            onCheckedChange={setKeepUnknown}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{encoding ? 'NATO Spelling' : 'Decoded Text'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            readOnly
            value={output}
            aria-label={encoding ? 'NATO spelling' : 'Decoded text'}
            rows={5}
            spellCheck={false}
            placeholder={hasText ? '' : 'The result appears here.'}
            className="bg-muted/30"
          />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={output} label="Copy Result" disabled={!output} size="sm" />
            <Button
              onClick={() => {
                setText(output);
                setMode(encoding ? 'decode' : 'encode');
              }}
              disabled={!output}
              size="sm"
              variant="outline"
            >
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Use as Input and Swap
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reference</CardTitle>
          <CardDescription>
            The ICAO code words. Digits have their own pronunciations so they cannot be mistaken on a bad line.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-6">
          <ReferenceTable caption="NATO phonetic alphabet letters" entries={NATO_LETTERS} />
          <ReferenceTable caption="ICAO digit pronunciations" entries={NATO_DIGITS} />
        </CardContent>
      </Card>
    </div>
  );
}
