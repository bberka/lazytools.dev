'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, Trash2, ArrowLeftRight, Globe, Info, FileText } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { convertPunycode, type PunycodeMode } from '@/lib/tools/punycode-converter';

export function PunycodeConverter() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<PunycodeMode>('encode');

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const output = useMemo(() => convertPunycode(input, mode), [input, mode]);

  const handleModeChange = (nextMode: PunycodeMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    // The result becomes the new input, to be converted back the other way.
    if (output) setInput(output);
  };

  const handleSwap = () => handleModeChange(mode === 'encode' ? 'decode' : 'encode');

  const handleClear = () => setInput('');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Mode tabs */}
      <Tabs
        value={mode}
        onValueChange={(val) => handleModeChange(val as PunycodeMode)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 bg-muted/60 p-1 rounded-lg h-auto">
          <TabsTrigger value="encode" className="flex items-center gap-2 whitespace-normal">
            <Globe className="h-4 w-4 shrink-0" />
            Unicode to Punycode (Encode)
          </TabsTrigger>
          <TabsTrigger value="decode" className="flex items-center gap-2 whitespace-normal">
            <FileText className="h-4 w-4 shrink-0" />
            Punycode to Unicode (Decode)
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Main Panels */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {mode === 'encode' ? 'Unicode Domain / URL Input' : 'Punycode Domain / URL Input'}
            </CardTitle>
            <CardDescription>
              Supports full URLs, domains, or hostnames (one per line).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === 'encode'
                  ? 'e.g. münchen.de\nhttps://домены.рф/index.html'
                  : 'e.g. xn--mnchen-3ya.de\nhttps://xn--d1acufc5f.xn--p1ai/index.html'
              }
              aria-label={mode === 'encode' ? 'Unicode domains or URLs' : 'Punycode domains or URLs'}
              rows={12}
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
          </CardContent>
        </Card>

        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {mode === 'encode' ? 'Punycode Output' : 'Unicode Output'}
            </CardTitle>
            <CardDescription>Converted result in ACE format or international format.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={output}
              readOnly
              placeholder="Conversion result appears here..."
              aria-label={mode === 'encode' ? 'Punycode output' : 'Unicode output'}
              rows={12}
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

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold block mb-0.5 text-foreground">International Domain Names (IDN)</strong>
          Punycode is used to translate Unicode strings into an ASCII-Compatible Encoding (ACE) format, allowing international domains to resolve correctly within standard DNS architectures.
        </div>
      </div>
    </div>
  );
}
