'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Check, Trash2, FileCode, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';

interface GenerateConfig {
  rootName: string;
  useType: boolean;
  exportKeyword: boolean;
  optional: boolean;
  readonly: boolean;
  semicolon: boolean;
}

const getArrayItemKeyName = (key: string): string => {
  if (key === 'RootObject') return 'RootObjectItem';
  if (key.endsWith('s') && key.length > 1) return key.slice(0, -1);
  return `${key}Item`;
};

// Generate TypeScript types/interfaces from parsed JSON object
function generateTypeScript(obj: unknown, config: GenerateConfig): string {
  const definitions: string[] = [];
  const generatedNames = new Set<string>();

  const isValidIdentifier = (key: string) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
  const formatKey = (key: string) => (isValidIdentifier(key) ? key : `'${key}'`);

  const getCleanName = (raw: string): string => {
    const normalized = raw.replace(/[^a-zA-Z0-9_$]/g, ' ').trim();
    if (!normalized) return 'SubObject';
    const parts = normalized.split(/\s+/);
    const camelCased = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');

    let candidate = camelCased;
    let index = 1;
    while (generatedNames.has(candidate)) {
      candidate = `${camelCased}${index}`;
      index++;
    }
    generatedNames.add(candidate);
    return candidate;
  };

  function processValue(val: unknown, key: string): string {
    if (val === null) return 'any';

    const typeOfVal = typeof val;
    if (typeOfVal === 'string') return 'string';
    if (typeOfVal === 'number') return 'number';
    if (typeOfVal === 'boolean') return 'boolean';

    if (Array.isArray(val)) {
      if (val.length === 0) return 'any[]';

      const arrayItemKey = getArrayItemKeyName(key);
      const itemTypes = Array.from(new Set(val.map((item) => processValue(item, arrayItemKey))));
      
      if (itemTypes.length === 1) {
        const singleType = itemTypes[0];
        if (singleType.includes('|') || singleType.includes('&')) {
          return `(${singleType})[]`;
        }
        return `${singleType}[]`;
      }

      return `(${itemTypes.join(' | ')})[]`;
    }

    if (typeOfVal === 'object' && val !== null) {
      const subInterfaceName = getCleanName(key);
      const lines: string[] = [];
      const record = val as Record<string, unknown>;

      for (const [k, v] of Object.entries(record)) {
        const isOpt = config.optional ? '?' : '';
        const isRead = config.readonly ? 'readonly ' : '';
        const typeStr = processValue(v, k);
        const semi = config.semicolon ? ';' : '';
        lines.push(`  ${isRead}${formatKey(k)}${isOpt}: ${typeStr}${semi}`);
      }

      const exportPrefix = config.exportKeyword ? 'export ' : '';
      const decl = config.useType
        ? `${exportPrefix}type ${subInterfaceName} = {\n${lines.join('\n')}\n};`
        : `${exportPrefix}interface ${subInterfaceName} {\n${lines.join('\n')}\n}`;

      definitions.push(decl);
      return subInterfaceName;
    }

    return 'any';
  }

  const rootType = processValue(obj, config.rootName || 'RootObject');

  if (rootType !== (config.rootName || 'RootObject')) {
    const exportPrefix = config.exportKeyword ? 'export ' : '';
    const semi = config.semicolon ? ';' : '';
    const rootDecl = config.useType
      ? `${exportPrefix}type ${config.rootName || 'RootObject'} = ${rootType}${semi}`
      : `${exportPrefix}interface ${config.rootName || 'RootObject'} {\n  data: ${rootType}${semi}\n}`;
    definitions.push(rootDecl);
  }

  return definitions.reverse().join('\n\n');
}

export function JsonToTypescript() {
  const [input, setInput] = useState('');
  const [rootName, setRootName] = useState('RootObject');
  const [useType, setUseType] = useState(false);
  const [exportKeyword, setExportKeyword] = useState(true);
  const [optional, setOptional] = useState(false);
  const [readonly, setReadonly] = useState(false);
  const [semicolon, setSemicolon] = useState(true);

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  // Validate and parse raw JSON input
  const validation = useMemo(() => {
    if (!input.trim()) return null;
    try {
      const parsed = JSON.parse(input);
      let summary = '';
      if (Array.isArray(parsed)) {
        summary = `Array with ${parsed.length.toLocaleString()} item${parsed.length === 1 ? '' : 's'}`;
      } else if (parsed && typeof parsed === 'object') {
        const keys = Object.keys(parsed);
        summary = `Object with ${keys.length.toLocaleString()} key${keys.length === 1 ? '' : 's'}`;
      } else {
        summary = `Primitive (${parsed === null ? 'null' : typeof parsed})`;
      }
      return { valid: true, parsed, summary, error: '' };
    } catch (e) {
      return {
        valid: false,
        parsed: null,
        summary: '',
        error: e instanceof Error ? e.message : 'Invalid JSON format',
      };
    }
  }, [input]);

  // Compute TypeScript output code
  const outputCode = useMemo(() => {
    if (!validation || !validation.valid || validation.parsed === null) return '';
    try {
      const cleanRootName = rootName.trim() || 'RootObject';
      return generateTypeScript(validation.parsed, {
        rootName: cleanRootName,
        useType,
        exportKeyword,
        optional,
        readonly,
        semicolon,
      });
    } catch (e) {
      return `/* Error generating TypeScript interfaces: ${e instanceof Error ? e.message : 'Unknown error'} */`;
    }
  }, [validation, rootName, useType, exportKeyword, optional, readonly, semicolon]);

  const handleClear = () => {
    setInput('');
  };

  return (
    <div className="space-y-6">
      {/* Settings Panel */}
      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <FileCode className="h-5 w-5 text-primary" />
            JSON to TypeScript Generator
          </CardTitle>
          <CardDescription>
            Configure how your TypeScript code interface declarations are formatted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Root Element Name
              </label>
              <Input
                value={rootName}
                onChange={(e) => setRootName(e.target.value)}
                placeholder="RootObject"
                className="bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Declaration Style
              </label>
              <Select
                value={useType ? 'type' : 'interface'}
                onValueChange={(val) => setUseType(val === 'type')}
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder="Style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="interface">interface</SelectItem>
                    <SelectItem value="type">type alias</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

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
                    <div>
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
            <CardTitle className="text-sm font-semibold">TypeScript Declarations</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={outputCode}
              readOnly
              placeholder="TypeScript interfaces will be generated here automatically..."
              rows={14}
              className="flex-1 font-mono text-xs leading-relaxed resize-y bg-muted/20 border-muted focus-visible:ring-0 cursor-text"
            />

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
                  Copy Declarations
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-blue-700 dark:text-blue-400">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold block mb-0.5">Privacy First</strong>
          All parsing and conversions run entirely inside your browser. No JSON data, payload
          content, or schema structure is ever transmitted over the network.
        </div>
      </div>
    </div>
  );
}
