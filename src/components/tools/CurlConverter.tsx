'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Copy, Check, Trash2, Terminal, Code, Info } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import {
  CURL_TARGET_LANGUAGES,
  generateRequestCode,
  parseCurl,
  snippetNotes,
  type CurlTargetLanguage,
} from '@/lib/tools/curl-to-code';

export function CurlConverter() {
  const [input, setInput] = useState('');
  const [activeLanguage, setActiveLanguage] = useState<CurlTargetLanguage>('js-fetch');
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const request = useMemo(() => (input.trim() ? parseCurl(input) : null), [input]);

  const outputCode = useMemo(
    () => (request ? generateRequestCode(request, activeLanguage) : ''),
    [request, activeLanguage]
  );

  const warnings = useMemo(
    () => (request ? snippetNotes(request, activeLanguage) : []),
    [request, activeLanguage]
  );

  const handleClear = () => {
    setInput('');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Left column: input */}
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <Terminal className="h-5 w-5 text-primary" />
              cURL Command
            </CardTitle>
            <CardDescription>Paste your raw shell cURL request command here.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`curl -X POST https://api.example.com/v1/users \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer token123" \\
  -d '{"name": "Ada", "role": "admin"}'`}
              rows={16}
              aria-label="cURL command"
              spellCheck={false}
              className="flex-1 font-mono text-xs leading-relaxed resize-y bg-background focus-visible:ring-1"
            />
            <div className="flex items-center justify-between pt-2">
              <Button
                onClick={handleClear}
                variant="outline"
                size="sm"
                className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive transition-colors duration-200"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right column: output code */}
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                <Code className="h-5 w-5 text-primary" />
                Generated Code Snippet
              </CardTitle>
            </div>
            <CardDescription>Select the target language to convert the command.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Select
              value={activeLanguage}
              onValueChange={(val) => setActiveLanguage(val as CurlTargetLanguage)}
            >
              <SelectTrigger aria-label="Target language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURL_TARGET_LANGUAGES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Textarea
              value={outputCode}
              readOnly
              placeholder="Your generated code snippet will appear here..."
              rows={16}
              aria-label="Generated code snippet"
              spellCheck={false}
              className="flex-1 font-mono text-xs leading-relaxed resize-y bg-muted/20 border-muted focus-visible:ring-1 cursor-text"
            />

            {/* What the command asks for that the snippet does not do */}
            {warnings.length > 0 && (
              <div
                role="status"
                className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <strong className="font-semibold block mb-0.5 text-foreground">
                    Check before you run it
                  </strong>
                  <ul className="space-y-1">
                    {warnings.map((warning) => (
                      <li key={warning} className="break-words">
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <Button
              onClick={() => copyToClipboard(outputCode)}
              disabled={!outputCode}
              size="sm"
              variant={isCopied ? 'default' : 'outline'}
              className="w-full sm:w-auto font-medium transition-all duration-200"
            >
              {isCopied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Snippet
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold block mb-0.5 text-foreground">Privacy First</strong>
          All parsing and conversions run entirely inside your browser. No cURL headers, request
          data, or authorization keys are ever transmitted over the network.
        </div>
      </div>
    </div>
  );
}
