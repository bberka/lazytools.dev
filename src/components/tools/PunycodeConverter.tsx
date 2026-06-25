'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, Trash2, ArrowLeftRight, Globe, AlertTriangle, Info, FileText } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';

type Mode = 'encode' | 'decode';

// Punycode parameters (RFC 3492)
const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const DELIMITER = '-';

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  delta = firstTime ? Math.floor(delta / DAMP) : Math.floor(delta / 2);
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > Math.floor(((BASE - TMIN) * TMAX) / 2)) {
    delta = Math.floor(delta / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
}

function ucs2encode(array: number[]): string {
  return String.fromCodePoint(...array);
}

function ucs2decode(str: string): number[] {
  const output: number[] = [];
  let counter = 0;
  const length = str.length;
  while (counter < length) {
    const value = str.charCodeAt(counter++);
    if (value >= 0xd800 && value <= 0xdbff && counter < length) {
      const extra = str.charCodeAt(counter++);
      if ((extra & 0xfc00) === 0xdc00) {
        output.push(((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000);
      } else {
        output.push(value);
        counter--;
      }
    } else {
      output.push(value);
    }
  }
  return output;
}

function digitToBasic(digit: number, flag: boolean): number {
  return digit + 22 + 75 * (digit < 26 ? 1 : 0) - ((flag ? 1 : 0) << 5);
}

function basicToDigit(codePoint: number): number {
  if (codePoint - 48 < 10) return codePoint - 22; // 0-9
  if (codePoint - 65 < 26) return codePoint - 65; // A-Z
  if (codePoint - 97 < 26) return codePoint - 97; // a-z
  return BASE;
}

// Encode clean unicode label to punycode
export function encodePunycode(input: string): string {
  const inputCodePoints = ucs2decode(input);
  const outputCodePoints: string[] = [];

  const basicCodePoints = inputCodePoints.filter((cp) => cp < 0x80);
  const basicCount = basicCodePoints.length;
  let handledCount = basicCount;

  basicCodePoints.forEach((cp) => {
    outputCodePoints.push(String.fromCharCode(cp));
  });

  if (basicCount > 0 && handledCount < inputCodePoints.length) {
    outputCodePoints.push(DELIMITER);
  }

  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;

  while (handledCount < inputCodePoints.length) {
    let m = Infinity;
    inputCodePoints.forEach((cp) => {
      if (cp >= n && cp < m) m = cp;
    });

    delta += (m - n) * (handledCount + 1);
    n = m;

    for (let i = 0; i < inputCodePoints.length; i++) {
      const c = inputCodePoints[i];
      if (c < n) {
        delta++;
      } else if (c === n) {
        let q = delta;
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
          if (q < t) break;
          const code = digitToBasic(t + ((q - t) % (BASE - t)), false);
          outputCodePoints.push(String.fromCharCode(code));
          q = Math.floor((q - t) / (BASE - t));
        }
        outputCodePoints.push(String.fromCharCode(digitToBasic(q, false)));
        bias = adapt(delta, handledCount + 1, handledCount === basicCount);
        delta = 0;
        handledCount++;
      }
    }
    delta++;
    n++;
  }

  return outputCodePoints.join('');
}

// Decode punycode label back to unicode
export function decodePunycode(input: string): string {
  const inputCodePoints = ucs2decode(input);
  const outputCodePoints: number[] = [];

  const delimiterIndex = input.lastIndexOf(DELIMITER);
  let basicLength = 0;

  if (delimiterIndex > -1) {
    basicLength = delimiterIndex;
    for (let i = 0; i < basicLength; i++) {
      const cp = inputCodePoints[i];
      if (cp >= 0x80) {
        throw new Error('Invalid input: non-ASCII in basic part.');
      }
      outputCodePoints.push(cp);
    }
  }

  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  let index = delimiterIndex > -1 ? delimiterIndex + 1 : 0;

  while (index < inputCodePoints.length) {
    const oldI = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= inputCodePoints.length) {
        throw new Error('Invalid input: unexpected end of stream.');
      }
      const digit = basicToDigit(inputCodePoints[index++]);
      if (digit >= BASE) {
        throw new Error('Invalid input: non-alphanumeric code point.');
      }
      i += digit * w;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
    }

    const outLength = outputCodePoints.length + 1;
    bias = adapt(i - oldI, outLength, oldI === 0);
    n += Math.floor(i / outLength);
    i %= outLength;

    outputCodePoints.splice(i, 0, n);
    i++;
  }

  return ucs2encode(outputCodePoints);
}

// Full domain encoding
export function encodeDomain(domain: string): string {
  return domain
    .split('.')
    .map((label) => {
      if (/[^\x00-\x7F]/.test(label)) {
        return 'xn--' + encodePunycode(label.toLowerCase());
      }
      return label;
    })
    .join('.');
}

// Full domain decoding
export function decodeDomain(domain: string): string {
  return domain
    .split('.')
    .map((label) => {
      if (label.toLowerCase().startsWith('xn--')) {
        try {
          return decodePunycode(label.substring(4));
        } catch {
          return label;
        }
      }
      return label;
    })
    .join('.');
}

// Encode/decode full URL or raw domains
function convertString(input: string, currentMode: Mode): string {
  if (!input.trim()) return '';

  return input
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';

      // Check if it is a full URL
      try {
        const url = new URL(trimmed);
        if (currentMode === 'encode') {
          url.hostname = encodeDomain(url.hostname);
        } else {
          url.hostname = decodeDomain(url.hostname);
        }
        return url.toString();
      } catch {
        // Otherwise, process as plain domain name
        return currentMode === 'encode' ? encodeDomain(trimmed) : decodeDomain(trimmed);
      }
    })
    .join('\n');
}

export function PunycodeConverter() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [mode, setMode] = useState<Mode>('encode');
  const [error, setError] = useState('');

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const handleInputChange = (val: string) => {
    setInput(val);
    try {
      setOutput(convertString(val, mode));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Punycode conversion failed.');
      setOutput('');
    }
  };

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode);
    setInput(output);
    setOutput(input);
    try {
      setOutput(convertString(output, nextMode));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Punycode conversion failed.');
      setOutput('');
    }
  };

  const handleSwap = () => {
    const nextMode = mode === 'encode' ? 'decode' : 'encode';
    setMode(nextMode);
    setInput(output);
    setOutput(input);
    try {
      setOutput(convertString(input, nextMode));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Punycode conversion failed.');
      setOutput('');
    }
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setError('');
  };

  return (
    <div className="space-y-6">
      {/* Mode tabs */}
      <Tabs
        value={mode}
        onValueChange={(val) => handleModeChange(val as Mode)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 bg-muted/60 p-1 rounded-lg h-auto">
          <TabsTrigger value="encode" className="flex items-center gap-2 font-semibold">
            <Globe className="h-4 w-4 text-primary" />
            Unicode to Punycode (Encode)
          </TabsTrigger>
          <TabsTrigger value="decode" className="flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4 text-primary" />
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
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={
                mode === 'encode'
                  ? 'e.g. münchen.de\nhttps://домены.рф/index.html'
                  : 'e.g. xn--mnchen-3ya.de\nhttps://xn--d1acufc.xn--p1ai/index.html'
              }
              rows={12}
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
                  <strong>Punycode Conversion Error:</strong> {error}
                </div>
              </div>
            )}
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

      <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-blue-700 dark:text-blue-400">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold block mb-0.5">International Domain Names (IDN)</strong>
          Punycode is used to translate Unicode strings into an ASCII-Compatible Encoding (ACE) format, allowing international domains to resolve correctly within standard DNS architectures.
        </div>
      </div>
    </div>
  );
}
