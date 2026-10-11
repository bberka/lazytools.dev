'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Check, Trash2, FileCode, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import {
  JSON_CODE_LANGUAGES,
  generateCodeFromJson,
  inspectJson,
  type JsonCodeLanguage,
} from '@/lib/tools/json-to-code';

export function JsonToTypescript() {
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState<JsonCodeLanguage>('typescript');
  const [rootName, setRootName] = useState('RootObject');
  const [useType, setUseType] = useState(false);
  const [exportKeyword, setExportKeyword] = useState(true);
  const [optional, setOptional] = useState(false);
  const [readonly, setReadonly] = useState(false);
  const [semicolon, setSemicolon] = useState(true);

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const validation = useMemo(() => (input.trim() ? inspectJson(input) : null), [input]);

  const generated = useMemo(() => {
    if (!validation || !validation.valid) return { code: '', error: '' };
    try {
      const code = generateCodeFromJson(validation.value, language, {
        rootName,
        typescript: { useType, exportKeyword, optional, readonly, semicolon },
      });
      return { code, error: '' };
    } catch (e) {
      // Kept out of the output box so it is never copied as if it were code.
      return { code: '', error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }, [validation, language, rootName, useType, exportKeyword, optional, readonly, semicolon]);

  const outputCode = generated.code;

  const handleClear = () => {
    setInput('');
  };

  const isTypescript = language === 'typescript';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Settings Panel */}
      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <FileCode className="h-5 w-5 text-primary" />
            JSON to Code Generator
          </CardTitle>
          <CardDescription>
            Generate typed models and schemas from JSON data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <label
                htmlFor="json-code-language"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Target Language
              </label>
              <Select
                value={language}
                onValueChange={(val) => setLanguage(val as JsonCodeLanguage)}
              >
                <SelectTrigger id="json-code-language" className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JSON_CODE_LANGUAGES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="json-code-root-name"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Root Name
              </label>
              <Input
                id="json-code-root-name"
                value={rootName}
                onChange={(e) => setRootName(e.target.value)}
                placeholder="RootObject"
                className="bg-background"
                spellCheck={false}
              />
            </div>

            {isTypescript && (
              <div className="space-y-1.5">
                <label
                  htmlFor="json-code-declaration-style"
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  Declaration Style
                </label>
                <Select
                  value={useType ? 'type' : 'interface'}
                  onValueChange={(val) => setUseType(val === 'type')}
                >
                  <SelectTrigger id="json-code-declaration-style" className="w-full bg-background">
                    <SelectValue placeholder="Style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interface">interface</SelectItem>
                    <SelectItem value="type">type alias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {isTypescript && (
              <div className="flex flex-wrap gap-x-6 gap-y-3 sm:col-span-2 lg:col-span-3 pt-2">
                <Checkbox
                  checked={exportKeyword}
                  onChange={setExportKeyword}
                  label="Export interfaces/types"
                />
                <Checkbox
                  checked={optional}
                  onChange={setOptional}
                  label="Make properties optional (?)"
                />
                <Checkbox
                  checked={readonly}
                  onChange={setReadonly}
                  label="Make properties readonly"
                />
                <Checkbox
                  checked={semicolon}
                  onChange={setSemicolon}
                  label="Include trailing semicolons (;)"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Input area */}
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">JSON Payload</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`{\n  "id": 1,\n  "name": "Ada Lovelace",\n  "active": true,\n  "roles": ["Admin", "Editor"],\n  "company": {\n    "name": "Analytical Engine Co",\n    "address": "London"\n  }\n}`}
              rows={14}
              aria-label="JSON payload"
              spellCheck={false}
              className="flex-1 font-mono text-xs leading-relaxed resize-y bg-background focus-visible:ring-1"
            />
            <div className="flex items-center justify-between">
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

            {/* Validation Banner */}
            {validation && (
              <div
                role="status"
                className={`flex items-start gap-3 rounded-lg px-4 py-3 text-xs font-medium border transition-all duration-300 ${
                  validation.valid
                    ? 'bg-green-500/5 text-green-700 dark:text-green-400 border-green-500/20'
                    : 'bg-destructive/5 text-destructive border-destructive/20'
                }`}
              >
                {validation.valid ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Valid JSON Format:</strong> {validation.summary}
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="min-w-0 break-words">
                      <strong>Syntax Error:</strong> {validation.error}
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Output area */}
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Generated Code</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={outputCode}
              readOnly
              placeholder="Type definitions will be generated here automatically..."
              rows={14}
              aria-label="Generated code"
              spellCheck={false}
              className="flex-1 font-mono text-xs leading-relaxed resize-y bg-muted/20 border-muted focus-visible:ring-1 cursor-text"
            />

            {generated.error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg px-4 py-3 text-xs font-medium border bg-destructive/5 text-destructive border-destructive/20"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="min-w-0 break-words">
                  <strong>Could not generate code:</strong> {generated.error}
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
                  Copy Code
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
          All parsing and conversions run entirely inside your browser. No JSON data, payload
          content, or schema structure is ever transmitted over the network.
        </div>
      </div>
    </div>
  );
}
