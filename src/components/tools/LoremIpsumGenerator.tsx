'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Check, Trash2 } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { TooltipSimple } from '@/components/ui/tooltip';
import {
  LOREM_MAX_COUNT,
  LOREM_MIN_COUNT,
  generateLoremIpsum,
  parseLoremCount,
  type LoremUnit,
} from '@/lib/tools/lorem-ipsum';

const typeOptions: Array<{ value: LoremUnit; label: string }> = [
  { value: 'paragraphs', label: 'Paragraphs' },
  { value: 'sentences', label: 'Sentences' },
  { value: 'words', label: 'Words' },
];

export function LoremIpsumGenerator() {
  const [type, setType] = useState<LoremUnit>('paragraphs');
  const [count, setCount] = useState('3');
  const [startWithLorem, setStartWithLorem] = useState(true);
  const [htmlTags, setHtmlTags] = useState(false);
  const [output, setOutput] = useState('');
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const handleGenerate = () => {
    const numCount = parseLoremCount(count);

    // Show the count that was actually used when the typed one was out of range.
    setCount(String(numCount));
    setOutput(generateLoremIpsum({ type, count: numCount, startWithLorem, htmlTags }));
  };

  const handleCopy = async () => {
    await copyToClipboard(output);
  };

  const handleClear = () => {
    setOutput('');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="lorem-type" className="text-sm font-medium mb-2 block">
              Type
            </label>
            <Select value={type} onValueChange={(value) => setType(value as LoremUnit)}>
              <SelectTrigger id="lorem-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {typeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="lorem-count" className="text-sm font-medium mb-2 block">
              Count
            </label>
            <Input
              id="lorem-count"
              type="number"
              value={count}
              onChange={(e) => setCount((e.target as HTMLInputElement).value)}
              min={LOREM_MIN_COUNT}
              max={LOREM_MAX_COUNT}
            />
          </div>

          <Checkbox
            checked={startWithLorem}
            onChange={setStartWithLorem}
            label='Start with "Lorem ipsum..."'
          />

          {type === 'paragraphs' && (
            <Checkbox
              checked={htmlTags}
              onChange={setHtmlTags}
              label="Wrap in HTML <p> tags"
            />
          )}
        </CardContent>
      </Card>

      {/* Generate Button */}
      <Button onClick={handleGenerate} className="w-full">
        Generate
      </Button>

      {/* Output */}
      {output && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Output</CardTitle>
            <div className="flex items-center gap-1">
              <TooltipSimple content={isCopied ? "Copied!" : "Copy output"}>
                <Button
                  variant={isCopied ? "default" : "ghost"}
                  size="icon"
                  onClick={handleCopy}
                  aria-label={isCopied ? "Copied!" : "Copy output"}
                >
                  {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </TooltipSimple>
              <TooltipSimple content="Clear output">
                <Button variant="ghost" size="icon" onClick={handleClear} aria-label="Clear output">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipSimple>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="w-full min-h-[200px] p-3 rounded-md bg-muted text-sm overflow-x-auto whitespace-pre-wrap">
              {output}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
