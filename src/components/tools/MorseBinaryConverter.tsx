'use client';

import { useState, useMemo, useRef, useEffect, useId } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Copy, Check, Trash2, ArrowLeftRight, Music, Play, Square, AlertTriangle, Binary, Info } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import {
  convertCode,
  morseTimeline,
  unsupportedMorseCharacters,
  type CodeKind,
  type CodeMode,
} from '@/lib/tools/morse-binary-converter';

type Mode = CodeMode;
type ToolType = CodeKind;
type BinarySeparator = 'space' | 'none' | 'comma';

// How many left-out characters the note under the Morse output names.
const MAX_SKIPPED_SHOWN = 20;

export function MorseBinaryConverter() {
  const [toolType, setToolType] = useState<ToolType>('morse');
  const [mode, setMode] = useState<Mode>('encode');
  const [input, setInput] = useState('');

  // Morse Audio Settings
  const [wpm, setWpm] = useState(20);
  const [frequency, setFrequency] = useState(600);
  const [isPlaying, setIsPlaying] = useState(false);

  // Binary settings
  const [binarySeparator, setBinarySeparator] = useState<BinarySeparator>('space');

  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const separatorId = useId();

  const activeSeparator = useMemo(() => {
    if (binarySeparator === 'none') return '';
    if (binarySeparator === 'comma') return ',';
    return ' ';
  }, [binarySeparator]);

  const { output, error } = useMemo(
    () => convertCode(input, toolType, mode, activeSeparator),
    [input, toolType, mode, activeSeparator]
  );

  // Characters of the plain text that have no Morse code and are missing from the output.
  const skipped = useMemo(
    () => (toolType === 'morse' && mode === 'encode' ? unsupportedMorseCharacters(input) : []),
    [input, toolType, mode]
  );

  const audioRef = useRef<{ audioCtx: AudioContext; osc: OscillatorNode } | null>(null);

  // Cleanup audio oscillator on unmount
  useEffect(() => {
    return () => {
      const playing = audioRef.current;
      if (!playing) return;
      audioRef.current = null;
      playing.osc.onended = null;
      try {
        playing.osc.stop();
      } catch {
        // Ignore
      }
      playing.audioCtx.close().catch(() => {});
    };
  }, []);

  const stopMorseAudio = () => {
    const playing = audioRef.current;
    if (!playing) return;
    audioRef.current = null;
    playing.osc.onended = null;
    try {
      playing.osc.stop();
    } catch {
      // Ignore
    }
    playing.audioCtx.close().catch(() => {});
    setIsPlaying(false);
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    stopMorseAudio();
  };

  const handleToolTypeChange = (nextType: ToolType) => {
    setToolType(nextType);
    stopMorseAudio();
    setInput('');
  };

  const handleModeChange = (nextMode: Mode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    stopMorseAudio();
    // The result becomes the new input. Without a result (nothing typed, or
    // input that failed to convert) the input stays to be read the other way.
    if (output) setInput(output);
  };

  const handleSwap = () => handleModeChange(mode === 'encode' ? 'decode' : 'encode');

  const handleClear = () => {
    setInput('');
    stopMorseAudio();
  };

  // Play Morse Code beeps
  const playMorseAudio = () => {
    if (isPlaying) {
      stopMorseAudio();
      return;
    }

    const morseCode = mode === 'encode' ? output : input;
    const { tones, duration } = morseTimeline(morseCode, wpm);
    if (tones.length === 0) return;

    const win = window as unknown as { webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = window.AudioContext || win.webkitAudioContext;
    if (!AudioContextClass) {
      // The error box below is labelled for conversion mistakes, so this goes to a toast.
      toast.error('Web Audio API is not supported in this browser.');
      return;
    }

    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc.start(0);

      const startAt = audioCtx.currentTime + 0.05;
      for (const tone of tones) {
        gainNode.gain.setValueAtTime(1, startAt + tone.start);
        gainNode.gain.setValueAtTime(0, startAt + tone.start + tone.duration);
      }
      osc.stop(startAt + duration);

      const playing = { audioCtx, osc };
      audioRef.current = playing;
      setIsPlaying(true);

      osc.onended = () => {
        // Stop, or a newer playback, may already have taken over.
        if (audioRef.current !== playing) return;
        audioRef.current = null;
        setIsPlaying(false);
        // Every playback opens its own context; release it once the last tone has ended.
        playing.audioCtx.close().catch(() => {});
      };
    } catch {
      audioCtx?.close().catch(() => {});
      audioRef.current = null;
      setIsPlaying(false);
      toast.error('Could not start audio playback.');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Category selector */}
      <Tabs
        value={toolType}
        onValueChange={(val) => handleToolTypeChange(val as ToolType)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 bg-muted/60 p-1 rounded-lg h-auto">
          <TabsTrigger value="morse" className="flex items-center gap-2">
            <Music className="h-4 w-4" />
            Morse Code
          </TabsTrigger>
          <TabsTrigger value="binary" className="flex items-center gap-2">
            <Binary className="h-4 w-4" />
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
        <TabsList className="grid w-full grid-cols-2 bg-muted/60 p-1 rounded-lg h-auto">
          <TabsTrigger value="encode" className="flex items-center gap-2 whitespace-normal">
            Encode Text (Plain to Code)
          </TabsTrigger>
          <TabsTrigger value="decode" className="flex items-center gap-2 whitespace-normal">
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
            <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Beep Frequency (Pitch): {frequency} Hz
                  </label>
                </div>
                <Slider aria-label="Beep Frequency (Pitch)"
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
                <Slider aria-label="Speed (Words per Minute)"
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
                <label
                  htmlFor={separatorId}
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  Binary Separator
                </label>
                <Select
                  value={binarySeparator}
                  onValueChange={(val) => setBinarySeparator(val as BinarySeparator)}
                >
                  <SelectTrigger id={separatorId} className="bg-background">
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
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
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
              aria-label={
                mode === 'encode' ? 'Plain text input' : toolType === 'morse' ? 'Morse code input' : 'Binary input'
              }
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
              aria-label={
                mode === 'encode' ? (toolType === 'morse' ? 'Morse code output' : 'Binary output') : 'Plain text output'
              }
              rows={10}
              className="flex-1 font-mono text-xs leading-relaxed bg-muted/20 border-muted focus-visible:ring-0 cursor-text"
            />
            {skipped.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Left out, no Morse code for:{' '}
                <span className="font-mono text-foreground break-all">
                  {skipped.slice(0, MAX_SKIPPED_SHOWN).join(' ')}
                </span>
                {skipped.length > MAX_SKIPPED_SHOWN && ` and ${skipped.length - MAX_SKIPPED_SHOWN} more`}
              </p>
            )}
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

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold block mb-0.5 text-foreground">Encoders & Signals</strong>
          This tool generates binary representations or audible Morse Code sequences completely inside your browser using the HTML5 Web Audio API, making it a fast utility for offline coding and text translation.
        </div>
      </div>
    </div>
  );
}
