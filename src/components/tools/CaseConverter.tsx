'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Check, Type, Trash2 } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { CASE_CONVERSIONS } from '@/lib/tools/case-converter';

export function CaseConverter() {
  const [input, setInput] = useState('');
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const { copyToClipboard, isCopied, isError } = useCopyToClipboard();

  const handleCopy = (value: string, label: string) => {
    setCopiedLabel(label);
    void copyToClipboard(value);
  };

  const handleClear = () => {
    setInput('');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            Input Text
          </CardTitle>
          <CardDescription>Enter text to convert to different cases</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={input}
            onChange={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            placeholder="Hello World Example"
            aria-label="Text to convert"
            rows={4}
            className="font-mono text-sm"
          />

          <Button onClick={handleClear} variant="outline" size="sm">
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </CardContent>
      </Card>

      {input && (
        <div className="grid gap-4">
          {CASE_CONVERSIONS.map((conversion) => {
            const converted = conversion.convert(input);
            const showCopied = isCopied && copiedLabel === conversion.label;
            const showFailed = isError && copiedLabel === conversion.label;
            return (
              <Card key={conversion.label}>
                <CardHeader>
                  <CardTitle className="text-base">{conversion.label}</CardTitle>
                  <CardDescription className="font-mono text-xs">
                    Example: {conversion.example}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted p-4 rounded-md font-mono text-sm break-all whitespace-pre-wrap">
                    {converted || <span className="text-muted-foreground italic">Empty result</span>}
                  </div>
                  <Button
                    onClick={() => handleCopy(converted, conversion.label)}
                    disabled={!converted}
                    size="sm"
                    variant={showCopied ? "default" : "outline"}
                    aria-label={
                      showCopied
                        ? `Copied! ${conversion.label}`
                        : showFailed
                          ? `Copy failed: ${conversion.label}`
                          : `Copy ${conversion.label}`
                    }
                  >
                    {showCopied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : showFailed ? (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy failed
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!input && (
        <Card>
          <CardContent className="py-4 sm:py-8">
            <div className="text-center text-muted-foreground">
              Enter some text above to see conversions
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
