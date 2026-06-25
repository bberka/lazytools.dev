'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Check, Type, Trash2 } from 'lucide-react';

export function CaseConverter() {
  const [input, setInput] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const toCamelCase = (text: string): string => {
    return text
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
      })
      .replace(/\s+|_|-/g, '');
  };

  const toPascalCase = (text: string): string => {
    return text
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => {
        return word.toUpperCase();
      })
      .replace(/\s+|_|-/g, '');
  };

  const toSnakeCase = (text: string): string => {
    return text
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_')
      .replace(/^_/, '');
  };

  const toKebabCase = (text: string): string => {
    return text
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/_/g, '-')
      .replace(/^-/, '');
  };

  const toUpperCase = (text: string): string => {
    return text.toUpperCase();
  };

  const toLowerCase = (text: string): string => {
    return text.toLowerCase();
  };

  const toTitleCase = (text: string): string => {
    return text.replace(/\w\S*/g, (word) => {
      return word.charAt(0).toUpperCase() + word.substr(1).toLowerCase();
    });
  };

  const toSentenceCase = (text: string): string => {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  };

  const toDotCase = (text: string): string => {
    return text
      .replace(/([A-Z])/g, '.$1')
      .toLowerCase()
      .replace(/\s+/g, '.')
      .replace(/_/g, '.')
      .replace(/-/g, '.')
      .replace(/^\./, '');
  };

  const toConstantCase = (text: string): string => {
    return text
      .replace(/([A-Z])/g, '_$1')
      .toUpperCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_')
      .replace(/^_/, '');
  };

  const handleCopy = async (value: string, index: number) => {
    await navigator.clipboard.writeText(value);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleClear = () => {
    setInput('');
  };

  const conversions = [
    { label: 'camelCase', fn: toCamelCase, example: 'helloWorldExample' },
    { label: 'PascalCase', fn: toPascalCase, example: 'HelloWorldExample' },
    { label: 'snake_case', fn: toSnakeCase, example: 'hello_world_example' },
    { label: 'kebab-case', fn: toKebabCase, example: 'hello-world-example' },
    { label: 'UPPERCASE', fn: toUpperCase, example: 'HELLO WORLD EXAMPLE' },
    { label: 'lowercase', fn: toLowerCase, example: 'hello world example' },
    { label: 'Title Case', fn: toTitleCase, example: 'Hello World Example' },
    { label: 'Sentence case', fn: toSentenceCase, example: 'Hello world example' },
    { label: 'dot.case', fn: toDotCase, example: 'hello.world.example' },
    { label: 'CONSTANT_CASE', fn: toConstantCase, example: 'HELLO_WORLD_EXAMPLE' },
  ];

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
          {conversions.map((conversion, index) => {
            const converted = conversion.fn(input);
            const isCopied = copiedIndex === index;
            return (
              <Card key={conversion.label}>
                <CardHeader>
                  <CardTitle className="text-base">{conversion.label}</CardTitle>
                  <CardDescription className="font-mono text-xs">
                    Example: {conversion.example}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted p-4 rounded-md font-mono text-sm break-all">
                    {converted || <span className="text-muted-foreground italic">Empty result</span>}
                  </div>
                  <Button
                    onClick={() => handleCopy(converted, index)}
                    disabled={!converted}
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
