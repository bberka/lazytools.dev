'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Check, Trash2, ArrowLeftRight, Binary, FileText, AlertTriangle } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';

type Mode = 'encode' | 'decode';
type DelimiterType = 'none' | 'space' | 'comma' | 'newline' | 'custom';
type PrefixType = 'none' | '\\x' | '0x' | 'custom';

export function HexConverter() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [mode, setMode] = useState<Mode>('encode');
  const [delimiterType, setDelimiterType] = useState<DelimiterType>('space');
  const [customDelimiter, setCustomDelimiter] = useState('');
  const [prefixType, setPrefixType] = useState<PrefixType>('none');
  const [customPrefix, setCustomPrefix] = useState('');
  const [uppercase, setUppercase] = useState(false);
  const [error, setError] = useState('');

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const activeDelimiter = useMemo(() => {
    if (delimiterType === 'none') return '';
    if (delimiterType === 'space') return ' ';
    if (delimiterType === 'comma') return ',';
    if (delimiterType === 'newline') return '\n';
    return customDelimiter;
  }, [delimiterType, customDelimiter]);

  const activePrefix = useMemo(() => {
    if (prefixType === 'none') return '';
    if (prefixType === '\\x') return '\\x';
    if (prefixType === '0x') return '0x';
    return customPrefix;
  }, [prefixType, customPrefix]);

  const convert = (
    text: string,
    currentMode: Mode,
    delim: string = activeDelimiter,
    pref: string = activePrefix,
    upper: boolean = uppercase
  ) => {
    if (!text.trim()) {
      setOutput('');
      setError('');
      return;
    }

    try {
      if (currentMode === 'encode') {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(text);
        const hexParts: string[] = [];
        for (let i = 0; i < bytes.length; i++) {
          let hex = bytes[i].toString(16);
          if (upper) hex = hex.toUpperCase();
          hex = hex.padStart(2, '0');
          hexParts.push(pref + hex);
        }
        setOutput(hexParts.join(delim));
        setError('');
      } else {
        let clean = text.trim();
        // Remove prefixes and delimiters
        if (pref) {
          clean = clean.split(pref).join('');
        }
        if (delim) {
          clean = clean.split(delim).join('');
        }
        // Remove standard whitespaces and non-hex symbols
        clean = clean.replace(/[^a-fA-F0-9]/g, '');

        if (clean.length === 0) {
          throw new Error('No valid hexadecimal characters found.');
        }
        if (clean.length % 2 !== 0) {
          throw new Error('Hexadecimal string must have an even number of characters.');
        }

        const bytes = new Uint8Array(clean.length / 2);
        for (let i = 0; i < clean.length; i += 2) {
          const val = parseInt(clean.substring(i, i + 2), 16);
          if (isNaN(val)) {
            throw new Error(`Invalid hex byte pair at position ${i}: "${clean.substring(i, i + 2)}"`);
          }
          bytes[i / 2] = val;
        }

        setOutput(new TextDecoder().decode(bytes));
        setError('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert hexadecimal input.');
      setOutput('');
    }
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    convert(val, mode);
  };

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode);
    setInput(output);
    setOutput(input);
    convert(output, nextMode);
  };

  const handleSwap = () => {
    const nextMode = mode === 'encode' ? 'decode' : 'encode';
    setMode(nextMode);
    setInput(output);
    setOutput(input);
    convert(output, nextMode);
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setError('');
  };

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <Tabs
        value={mode}
        onValueChange={(val) => handleModeChange(val as Mode)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 bg-muted/60 p-1 rounded-lg h-auto">
          <TabsTrigger value="encode" className="flex items-center gap-2 font-semibold">
            <Binary className="h-4 w-4 text-primary" />
            String to Hex (Encode)
          </TabsTrigger>
          <TabsTrigger value="decode" className="flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4 text-primary" />
            Hex to String (Decode)
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Settings Panel */}
      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-bold">Hex Formatter Options</CardTitle>
          <CardDescription>Configure prefixes, delimiters, and text cases.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Hex Delimiter
              </label>
              <Select
                value={delimiterType}
                onValueChange={(val) => {
                  const nextDel = val as DelimiterType;
                  setDelimiterType(nextDel);
                  let tempDel = '';
                  if (nextDel === 'space') tempDel = ' ';
                  else if (nextDel === 'comma') tempDel = ',';
                  else if (nextDel === 'newline') tempDel = '\n';
                  else if (nextDel === 'custom') tempDel = customDelimiter;
                  convert(input, mode, tempDel, activePrefix, uppercase);
                }}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Delimiter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="space">Space</SelectItem>
                    <SelectItem value="comma">Comma (,)</SelectItem>
                    <SelectItem value="newline">Newline (\n)</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {delimiterType === 'custom' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Custom Delimiter
                </label>
                <Input
                  value={customDelimiter}
                  onChange={(e) => {
                    setCustomDelimiter(e.target.value);
                    convert(input, mode, e.target.value, activePrefix, uppercase);
                  }}
                  placeholder="e.g. - or :"
                  className="bg-background"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Hex Prefix
              </label>
              <Select
                value={prefixType}
                onValueChange={(val) => {
                  const nextPref = val as PrefixType;
                  setPrefixType(nextPref);
                  let tempPref = '';
                  if (nextPref === '\\x') tempPref = '\\x';
                  else if (nextPref === '0x') tempPref = '0x';
                  else if (nextPref === 'custom') tempPref = customPrefix;
                  convert(input, mode, activeDelimiter, tempPref, uppercase);
                }}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Prefix" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="0x">0x</SelectItem>
                    <SelectItem value="\x">\x</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {prefixType === 'custom' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Custom Prefix
                </label>
                <Input
                  value={customPrefix}
                  onChange={(e) => {
                    setCustomPrefix(e.target.value);
                    convert(input, mode, activeDelimiter, e.target.value, uppercase);
                  }}
                  placeholder="e.g. %"
                  className="bg-background"
                />
              </div>
            )}

            {mode === 'encode' && (
              <div className="flex items-end pb-2">
                <Checkbox
                  checked={uppercase}
                  onChange={(val) => {
                    setUppercase(val);
                    convert(input, mode, activeDelimiter, activePrefix, val);
                  }}
                  label="Uppercase Hex output"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Panels */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {mode === 'encode' ? 'Plain Text Input' : 'Hexadecimal Input'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={mode === 'encode' ? 'Type string here...' : '48 65 6c 6c 6f'}
              rows={10}
              className="flex-1 font-mono text-xs leading-relaxed bg-background"
            />
            <div className="flex gap-2">
              <Button onClick={handleSwap} variant="outline" size="sm">
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Swap Directions
              </Button>
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
            {error && (
              <div className="flex items-start gap-3 rounded-lg bg-destructive/5 text-destructive border-destructive/20 border px-4 py-3 text-xs font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Invalid Hexadecimal Syntax:</strong> {error}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {mode === 'encode' ? 'Hexadecimal Output' : 'Plain Text Output'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={output}
              readOnly
              placeholder="Conversion result appears here..."
              rows={10}
              className="flex-1 font-mono text-xs leading-relaxed bg-muted/20 border-muted focus-visible:ring-0 cursor-text"
            />
            <Button
              onClick={() => copyToClipboard(output)}
              disabled={!output}
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
                  Copy Output
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
