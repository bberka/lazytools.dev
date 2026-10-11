'use client';

import { useState, useMemo, useId } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Check, Trash2, ArrowLeftRight, Binary, FileText, AlertTriangle } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { convertHex, type HexMode } from '@/lib/tools/hex-converter';

type Mode = HexMode;
type DelimiterType = 'none' | 'space' | 'comma' | 'newline' | 'custom';
type PrefixType = 'none' | '\\x' | '0x' | 'custom';

export function HexConverter() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('encode');
  const [delimiterType, setDelimiterType] = useState<DelimiterType>('space');
  const [customDelimiter, setCustomDelimiter] = useState('');
  const [prefixType, setPrefixType] = useState<PrefixType>('none');
  const [customPrefix, setCustomPrefix] = useState('');
  const [uppercase, setUppercase] = useState(false);

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const delimiterId = useId();
  const customDelimiterId = useId();
  const prefixId = useId();
  const customPrefixId = useId();

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

  const { output, error } = useMemo(
    () => convertHex(input, mode, { delimiter: activeDelimiter, prefix: activePrefix, uppercase }),
    [input, mode, activeDelimiter, activePrefix, uppercase]
  );

  const handleModeChange = (nextMode: Mode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    // The result becomes the new input. Without a result (nothing typed, or
    // input that failed to convert) the input stays to be read the other way.
    if (output) setInput(output);
  };

  const handleSwap = () => handleModeChange(mode === 'encode' ? 'decode' : 'encode');

  const handleClear = () => setInput('');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Mode Toggle */}
      <Tabs
        value={mode}
        onValueChange={(val) => handleModeChange(val as Mode)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 bg-muted/60 p-1 rounded-lg h-auto">
          <TabsTrigger value="encode" className="flex items-center gap-2 whitespace-normal">
            <Binary className="h-4 w-4 shrink-0" />
            String to Hex (Encode)
          </TabsTrigger>
          <TabsTrigger value="decode" className="flex items-center gap-2 whitespace-normal">
            <FileText className="h-4 w-4 shrink-0" />
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
              <label
                htmlFor={delimiterId}
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Hex Delimiter
              </label>
              <Select value={delimiterType} onValueChange={(val) => setDelimiterType(val as DelimiterType)}>
                <SelectTrigger id={delimiterId} className="bg-background">
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
                <label
                  htmlFor={customDelimiterId}
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  Custom Delimiter
                </label>
                <Input
                  id={customDelimiterId}
                  value={customDelimiter}
                  onChange={(e) => setCustomDelimiter(e.target.value)}
                  placeholder="e.g. - or :"
                  className="bg-background"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor={prefixId}
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Hex Prefix
              </label>
              <Select value={prefixType} onValueChange={(val) => setPrefixType(val as PrefixType)}>
                <SelectTrigger id={prefixId} className="bg-background">
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
                <label
                  htmlFor={customPrefixId}
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  Custom Prefix
                </label>
                <Input
                  id={customPrefixId}
                  value={customPrefix}
                  onChange={(e) => setCustomPrefix(e.target.value)}
                  placeholder="e.g. %"
                  className="bg-background"
                />
              </div>
            )}

            {mode === 'encode' && (
              <div className="flex items-end pb-2">
                <Checkbox
                  checked={uppercase}
                  onChange={(val) => setUppercase(val)}
                  label="Uppercase Hex output"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Panels */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {mode === 'encode' ? 'Plain Text Input' : 'Hexadecimal Input'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === 'encode' ? 'Type string here...' : '48 65 6c 6c 6f'}
              aria-label={mode === 'encode' ? 'Plain text input' : 'Hexadecimal input'}
              rows={10}
              className="flex-1 font-mono text-xs leading-relaxed bg-background"
            />
            <div className="flex flex-wrap gap-2">
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
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg bg-destructive/5 text-destructive border-destructive/20 border px-4 py-3 text-xs font-medium"
              >
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
              aria-label={mode === 'encode' ? 'Hexadecimal output' : 'Plain text output'}
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
