'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Check, Trash2, ArrowLeftRight, Music, Play, Square, AlertTriangle, Binary, FileText, Info } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';

type Mode = 'encode' | 'decode';
type ToolType = 'morse' | 'binary';
type BinarySeparator = 'space' | 'none' | 'comma';

const MORSE_MAP: Record<string, string> = {
  'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....',
  'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.',
  'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
  'Y': '-.--', 'Z': '--..',
  '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...',
  '8': '---..', '9': '----.', '0': '-----',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.',
  '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
  '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
  ' ': '/'
};

const REVERSE_MORSE_MAP = Object.fromEntries(
  Object.entries(MORSE_MAP).map(([k, v]) => [v, k])
);

function textToMorse(text: string): string {
  return text
    .toUpperCase()
    .split('')
    .map((char) => MORSE_MAP[char] || '')
    .filter(Boolean)
    .join(' ');
}

function morseToText(morse: string): string {
  return morse
    .trim()
    .split(/\s+/)
    .map((symbol) => {
      if (symbol === '/') return ' ';
      return REVERSE_MORSE_MAP[symbol] || '';
    })
    .join('');
}

function textToBinary(text: string, separator: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const binaryArray: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    binaryArray.push(bytes[i].toString(2).padStart(8, '0'));
  }
  return binaryArray.join(separator);
}

function binaryToText(binary: string, separator: string): string {
  let clean = binary.trim();
  if (separator) {
    clean = clean.split(separator).join('');
  }
  clean = clean.replace(/[^01]/g, '');
  if (clean.length === 0) return '';
  if (clean.length % 8 !== 0) {
    throw new Error('Binary data length must be a multiple of 8 bits.');
  }

  const bytes = new Uint8Array(clean.length / 8);
  for (let i = 0; i < clean.length; i += 8) {
    const byteStr = clean.substring(i, i + 8);
    bytes[i / 8] = parseInt(byteStr, 2);
  }
  return new TextDecoder().decode(bytes);
}

export function MorseBinaryConverter() {
  const [toolType, setToolType] = useState<ToolType>('morse');
  const [mode, setMode] = useState<Mode>('encode');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  // Morse Audio Settings
  const [wpm, setWpm] = useState(20);
  const [frequency, setFrequency] = useState(600);
  const [isPlaying, setIsPlaying] = useState(false);

  // Binary settings
  const [binarySeparator, setBinarySeparator] = useState<BinarySeparator>('space');

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const activeSeparator = useMemo(() => {
    if (binarySeparator === 'none') return '';
    if (binarySeparator === 'comma') return ',';
    return ' ';
  }, [binarySeparator]);

  const audioRef = useRef<{ audioCtx: AudioContext; osc: OscillatorNode } | null>(null);

  // Cleanup audio oscillator on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.osc.stop();
          audioRef.current.audioCtx.close();
        } catch {
          // Ignore
        }
      }
    };
  }, []);

  const convert = (
    text: string,
    currentTool: ToolType,
    currentMode: Mode,
    sep: string = activeSeparator
  ) => {
    if (!text.trim()) {
      setOutput('');
      setError('');
      return;
    }

    try {
      if (currentTool === 'morse') {
        if (currentMode === 'encode') {
          setOutput(textToMorse(text));
          setError('');
        } else {
          // Basic syntax checking for Morse code input
          const cleanMorse = text.trim();
          if (/[a-zA-Z0-9]/.test(cleanMorse.replace(/\//g, ''))) {
            throw new Error('Morse code inputs should contain only dots (.), dashes (-), spaces, or word breaks (/).');
          }
          setOutput(morseToText(cleanMorse));
          setError('');
        }
      } else {
        if (currentMode === 'encode') {
          setOutput(textToBinary(text, sep));
          setError('');
        } else {
          setOutput(binaryToText(text, sep));
          setError('');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed.');
      setOutput('');
    }
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    stopMorseAudio();
    convert(val, toolType, mode);
  };

  const handleToolTypeChange = (nextType: ToolType) => {
    setToolType(nextType);
    stopMorseAudio();
    setInput('');
    setOutput('');
    setError('');
  };

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode);
    stopMorseAudio();
    setInput(output);
    setOutput(input);
    convert(output, toolType, nextMode);
  };

  const handleSwap = () => {
    const nextMode = mode === 'encode' ? 'decode' : 'encode';
    setMode(nextMode);
    stopMorseAudio();
    setInput(output);
    setOutput(input);
    convert(output, toolType, nextMode);
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setError('');
    stopMorseAudio();
  };

  // Play Morse Code beeps
  const playMorseAudio = () => {
    if (isPlaying) {
      stopMorseAudio();
      return;
    }

    const morseCode = mode === 'encode' ? output : input;
    if (!morseCode.trim()) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      alert('Web Audio API is not supported in this browser.');
      return;
    }

    try {
      const audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc.start(0);

      const dotDuration = 1.2 / wpm; // dot duration in seconds
      const dashDuration = dotDuration * 3;
      const intraCharSpace = dotDuration;
      const charSpace = dotDuration * 3;
      const wordSpace = dotDuration * 7;

      let time = audioCtx.currentTime + 0.05;

      const symbols = morseCode.split('');
      for (let idx = 0; idx < symbols.length; idx++) {
        const symbol = symbols[idx];
        if (symbol === '.') {
          gainNode.gain.setValueAtTime(1, time);
          time += dotDuration;
          gainNode.gain.setValueAtTime(0, time);
          time += intraCharSpace;
        } else if (symbol === '-') {
          gainNode.gain.setValueAtTime(1, time);
          time += dashDuration;
          gainNode.gain.setValueAtTime(0, time);
          time += intraCharSpace;
        } else if (symbol === ' ') {
          time += charSpace - intraCharSpace;
        } else if (symbol === '/') {
          time += wordSpace - intraCharSpace;
        }
      }

      osc.stop(time);
      setIsPlaying(true);

      audioRef.current = { audioCtx, osc };

      osc.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };
    } catch {
      setIsPlaying(false);
      audioRef.current = null;
    }
  };

  const stopMorseAudio = () => {
    if (audioRef.current) {
      try {
        audioRef.current.osc.stop();
        audioRef.current.audioCtx.close();
      } catch {
        // Ignore
      }
      audioRef.current = null;
      setIsPlaying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Category selector */}
      <Tabs
        value={toolType}
        onValueChange={(val) => handleToolTypeChange(val as ToolType)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 bg-muted/60 p-1 rounded-lg">
          <TabsTrigger value="morse" className="flex items-center gap-2 font-semibold">
            <Music className="h-4 w-4 text-primary" />
            Morse Code
          </TabsTrigger>
          <TabsTrigger value="binary" className="flex items-center gap-2 font-semibold">
            <Binary className="h-4 w-4 text-primary" />
            Binary String
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Mode selection */}
      <Tabs
        value={mode}
        onValueChange={(val) => handleModeChange(val as Mode)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 bg-muted/60 p-1 rounded-lg">
          <TabsTrigger value="encode" className="flex items-center gap-2 font-semibold">
            Encode Text (Plain to Code)
          </TabsTrigger>
          <TabsTrigger value="decode" className="flex items-center gap-2 font-semibold">
            Decode Text (Code to Plain)
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Settings Grid */}
      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-bold">
            {toolType === 'morse' ? 'Morse Audio & Speed Settings' : 'Binary Configuration'}
          </CardTitle>
          <CardDescription>
            {toolType === 'morse'
              ? 'Adjust oscillator beep frequencies and playing speeds.'
              : 'Choose the separation character between binary octets.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {toolType === 'morse' ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Beep Frequency (Pitch): {frequency} Hz
                  </label>
                </div>
                <Slider
                  value={frequency}
                  min={300}
                  max={900}
                  step={10}
                  onChange={(val) => setFrequency(val)}
                  className="py-2"
                />
              </div>
 
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Speed (Words per Minute): {wpm} WPM
                  </label>
                </div>
                <Slider
                  value={wpm}
                  min={10}
                  max={35}
                  step={1}
                  onChange={(val) => setWpm(val)}
                  className="py-2"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 max-w-xs">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Binary Separator
                </label>
                <Select
                  value={binarySeparator}
                  onValueChange={(val) => {
                    const nextSep = val as BinarySeparator;
                    setBinarySeparator(nextSep);
                    let tempSep = ' ';
                    if (nextSep === 'none') tempSep = '';
                    else if (nextSep === 'comma') tempSep = ',';
                    convert(input, toolType, mode, tempSep);
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Separator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="space">Space</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="comma">Comma (,)</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inputs / Outputs */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {mode === 'encode' ? 'Plain Text Input' : toolType === 'morse' ? 'Morse Code Input' : 'Binary Input'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={
                mode === 'encode'
                  ? 'Type plain text here...'
                  : toolType === 'morse'
                  ? '.... . .-.. .-.. --- / .-- --- .-. .-.. -..'
                  : '01001000 01100101 01101100 01101100 01101111'
              }
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
                  <strong>Syntax/Formatting Error:</strong> {error}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {mode === 'encode' ? (toolType === 'morse' ? 'Morse Code Output' : 'Binary Output') : 'Plain Text Output'}
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
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => copyToClipboard(output)}
                disabled={!output}
                size="sm"
                variant={isCopied ? 'default' : 'outline'}
                className="font-medium transition-all duration-200"
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

              {toolType === 'morse' && (output || input) && (
                <Button
                  onClick={playMorseAudio}
                  size="sm"
                  variant={isPlaying ? 'destructive' : 'default'}
                  className="font-medium transition-all duration-200"
                >
                  {isPlaying ? (
                    <>
                      <Square className="h-4 w-4 mr-2 fill-current" />
                      Stop Audio
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2 fill-current" />
                      Play Morse Code
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-blue-700 dark:text-blue-400">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold block mb-0.5">Encoders & Signals</strong>
          This tool generates binary representations or audible Morse Code sequences completely inside your browser using the HTML5 Web Audio API, making it a fast utility for offline coding and text translation.
        </div>
      </div>
    </div>
  );
}
