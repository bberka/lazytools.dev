'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Copy, Check, Trash2 } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { generateIds, type IdType } from '@/lib/tools/uuid-generator';

const typeOptions = [
  { value: 'v4', label: 'UUID v4 (Random)' },
  { value: 'v7', label: 'UUID v7 (Timestamp)' },
  { value: 'snowflake', label: 'Snowflake ID' },
];

const countOptions = [
  { value: '1', label: '1' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
  { value: '20', label: '20' },
];

export function UuidGenerator() {
  const [type, setType] = useState<IdType>('v4');
  const [count, setCount] = useState('1');
  const [uuids, setUuids] = useState<string[]>([]);
  const [error, setError] = useState('');
  // What the last copy was aimed at: a row index or the whole list.
  const [copyTarget, setCopyTarget] = useState<number | 'all' | null>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const copiedAll = isCopied && copyTarget === 'all';

  const handleGenerate = () => {
    // The check mark of an earlier copy must not carry over to the new list.
    setCopyTarget(null);
    try {
      setUuids(generateIds(type, Number(count)));
      setError('');
    } catch (err) {
      setUuids([]);
      setError(err instanceof Error ? err.message : 'Failed to generate IDs.');
    }
  };

  const handleCopy = (index: number) => {
    setCopyTarget(index);
    void copyToClipboard(uuids[index]);
  };

  const handleCopyAll = () => {
    setCopyTarget('all');
    void copyToClipboard(uuids.join('\n'));
  };

  const handleClear = () => {
    setUuids([]);
    setCopyTarget(null);
    setError('');
  };

  return (
    <div className="space-y-6">
      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="uuid-type" className="text-sm font-medium mb-2 block">Type</label>
            <Select value={type} onValueChange={(value) => setType(value as IdType)}>
              <SelectTrigger id="uuid-type">
                <SelectValue placeholder="Select UUID type" />
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
            <label htmlFor="uuid-count" className="text-sm font-medium mb-2 block">Count</label>
            <Select value={count} onValueChange={setCount}>
              <SelectTrigger id="uuid-count">
                <SelectValue placeholder="Select count" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {countOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Generate Button */}
      <Button onClick={handleGenerate} className="w-full">
        Generate
      </Button>

      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {uuids.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle>Generated IDs</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant={copiedAll ? "default" : "ghost"}
                size="sm"
                onClick={handleCopyAll}
              >
                {copiedAll ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy All
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uuids.map((uuid, index) => {
                const copied = isCopied && copyTarget === index;
                return (
                  <div key={index} className="flex items-center gap-2 group">
                    <div className="flex-1 p-2 rounded-md bg-muted font-mono text-sm break-all">
                      {uuid}
                    </div>
                    {/* Hidden until hover only where a pointer can hover; touch screens always show it. */}
                    <Button
                      variant={copied ? "default" : "ghost"}
                      size="icon"
                      onClick={() => handleCopy(index)}
                      aria-label={copied ? `Copied ${uuid}` : `Copy ${uuid}`}
                      className="shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
