'use client';

import { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Textarea } from '../ui/textarea';
import { Copy, Check, Trash2, ArrowLeftRight, Code, Braces } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { decodeHtmlEntities, encodeHtmlEntities } from '@/lib/tools/html-encoder';

type Mode = 'encode' | 'decode';

export function HtmlEncoder() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('encode');
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const output = useMemo(
    () => (mode === 'encode' ? encodeHtmlEntities(input) : decodeHtmlEntities(input)),
    [input, mode]
  );

  const handleCopy = async () => {
    if (output) {
      await copyToClipboard(output);
    }
  };

  const handleSwap = () => {
    setInput(output);
    setMode(mode === 'encode' ? 'decode' : 'encode');
  };

  const handleClear = () => {
    setInput('');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Tabs value={mode} onValueChange={(val) => setMode(val as Mode)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="encode" className="flex items-center gap-2">
            <Code className="h-4 w-4" />
            Encode
          </TabsTrigger>
          <TabsTrigger value="decode" className="flex items-center gap-2">
            <Braces className="h-4 w-4" />
            Decode
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Input</CardTitle>
          <CardDescription>
            {mode === 'encode' ? 'Enter HTML to encode' : 'Enter HTML entities to decode'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === 'encode' ? '<div>Hello & "World"</div>' : '&lt;div&gt;Hello &amp; &quot;World&quot;&lt;/div&gt;'}
            aria-label={mode === 'encode' ? 'HTML to encode' : 'HTML entities to decode'}
            rows={8}
            className="font-mono"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Output</CardTitle>
          <CardDescription>
            {output ? `${output.length} characters` : 'Result will appear here automatically'}
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
