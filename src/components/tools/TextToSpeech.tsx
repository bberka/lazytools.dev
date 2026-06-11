'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '../ui/button';
import { TooltipSimple } from '../ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { Slider } from '../ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import {
  Play,
  Pause,
  Square,
  Volume2,
  Trash2,
  Copy,
  Check,
  BookOpen,
  Sparkles,
  ClipboardPaste,
} from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { cn } from '@/lib/utils/cn';

interface WordRange {
  charIndex: number;
  charLength: number;
}

export function TextToSpeech() {
  const [text, setText] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('');
  
  // Speech parameters
  const [rate, setRate] = useState<number>(1.0); // 0.5x to 2.0x
  const [pitch, setPitch] = useState<number>(1.0); // 0.5 to 2.0
  const [volume, setVolume] = useState<number>(1.0); // 0 to 1.0

  // Playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [wordRange, setWordRange] = useState<WordRange>({ charIndex: 0, charLength: 0 });
  const [isReaderMode, setIsReaderMode] = useState(false);

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  // Derived state: split text into sentences
  const sentences = useMemo(() => {
    if (!text.trim()) return [];
    const sentenceList = text.match(/[^.!?\n]+[.!?]+(?:\s+|$)|[^\n.!?]+(?:\n+|$)/g) || [text];
    return sentenceList.map((s) => s.trim()).filter(Boolean);
  }, [text]);

  // Refs for tracking playback sequence
  const currentSentenceIndexRef = useRef(0);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const isPlayingRef = useRef(false);
  const rateRef = useRef(1.0);
  const pitchRef = useRef(1.0);
  const volumeRef = useRef(1.0);
  const selectedVoiceNameRef = useRef('');
  const activeSentenceRef = useRef<HTMLSpanElement | null>(null);
  const readerScrollContainerRef = useRef<HTMLDivElement | null>(null);
  
  // playSentenceRef to handle self-referencing callbacks safely without hoisting issues
  const playSentenceRef = useRef<(index: number) => void>(() => {});

  // Keep refs up-to-date to avoid stale closures in event handlers
  useEffect(() => {
    currentSentenceIndexRef.current = currentSentenceIndex;
  }, [currentSentenceIndex]);

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  useEffect(() => {
    pitchRef.current = pitch;
  }, [pitch]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    selectedVoiceNameRef.current = selectedVoiceName;
  }, [selectedVoiceName]);

  // Load system voices
  const loadVoices = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const sysVoices = window.speechSynthesis.getVoices() || [];
    setVoices(sysVoices);
    voicesRef.current = sysVoices;
    
    // Auto-select a default English voice or first available
    if (sysVoices.length > 0 && !selectedVoiceNameRef.current) {
      const defaultVoice = 
        sysVoices.find((v) => v.default) || 
        sysVoices.find((v) => v.lang.startsWith('en')) || 
        sysVoices[0];
      setSelectedVoiceName(defaultVoice.name);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Defer voice loading to avoid triggering synchronous setState warnings during render/commit
    const timer = setTimeout(() => {
      loadVoices();
    }, 0);

    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      clearTimeout(timer);
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [loadVoices]);

  // Scroll active sentence into view inside the reader box
  useEffect(() => {
    if (isReaderMode && activeSentenceRef.current && readerScrollContainerRef.current) {
      activeSentenceRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentSentenceIndex, isReaderMode]);

  // Play a specific sentence in the sequence
  const playSentence = useCallback((index: number) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel(); // Stop any currently speaking speech
    
    if (index >= sentences.length) {
      // Completed playback
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentSentenceIndex(0);
      setWordRange({ charIndex: 0, charLength: 0 });
      return;
    }

    setCurrentSentenceIndex(index);
    setWordRange({ charIndex: 0, charLength: 0 });

    const utteranceText = sentences[index];
    const utterance = new SpeechSynthesisUtterance(utteranceText);

    // Find and set selected voice
    const activeVoice = voicesRef.current.find((v) => v.name === selectedVoiceNameRef.current);
    if (activeVoice) utterance.voice = activeVoice;

    utterance.rate = rateRef.current;
    utterance.pitch = pitchRef.current;
    utterance.volume = volumeRef.current;

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
      isPlayingRef.current = true;
    };

    utterance.onend = () => {
      // If we are still playing (not stopped manually), advance to next sentence
      if (isPlayingRef.current) {
        playSentenceRef.current(index + 1);
      }
    };

    utterance.onerror = (e) => {
      console.error('SpeechSynthesis error:', e.error || e);
      if (isPlayingRef.current) {
        playSentenceRef.current(index + 1);
      }
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        setWordRange({
          charIndex: event.charIndex,
          charLength: event.charLength,
        });
      }
    };

    window.speechSynthesis.speak(utterance);
  }, [sentences]);

  // Set the ref to the current play function to enable circular/recursive callback
  useEffect(() => {
    playSentenceRef.current = playSentence;
  }, [playSentence]);

  // Actions
  const handlePlay = () => {
    if (!text.trim()) return;

    if (isPaused) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.resume();
        setIsPaused(false);
      }
    } else {
      setIsPlaying(true);
      isPlayingRef.current = true;
      playSentence(currentSentenceIndex);
    }
  };

  const handlePause = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis && isPlaying) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  };

  const handleStop = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      isPlayingRef.current = false;
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentSentenceIndex(0);
      setWordRange({ charIndex: 0, charLength: 0 });
    }
  };

  const handlePlayFromIndex = (index: number) => {
    setIsPlaying(true);
    isPlayingRef.current = true;
    setIsPaused(false);
    playSentence(index);
  };

  const handleClear = () => {
    handleStop();
    setText('');
  };

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setText(clipboardText);
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  // Group voices by language for a cleaner select menu
  const groupedVoices = voices.reduce<Record<string, SpeechSynthesisVoice[]>>((acc, voice) => {
    const lang = voice.lang || 'Unknown';
    if (!acc[lang]) acc[lang] = [];
    acc[lang].push(voice);
    return acc;
  }, {});

  // Clean up speech on component unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Settings Panel (4 cols on lg, full width otherwise) */}
      <div className="space-y-6 lg:col-span-4">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-cyan-500" />
              Voice Controls
            </CardTitle>
            <CardDescription>Configure the voice and parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Voice Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Voice</label>
              {voices.length === 0 ? (
                <div className="text-xs text-muted-foreground bg-muted p-2.5 rounded-md border">
                  {"No system voices loaded. Playing will use your browser's default speech voice."}
                </div>
              ) : (
                <Select value={selectedVoiceName} onValueChange={setSelectedVoiceName}>
                  <SelectTrigger className="w-full bg-background font-medium">
                    <SelectValue placeholder="Select a voice..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {Object.entries(groupedVoices).map(([lang, langVoices]) => (
                      <div key={lang} className="p-1">
                        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30 rounded-sm">
                          {lang}
                        </div>
                        {langVoices.map((voice) => (
                          <SelectItem key={voice.name} value={voice.name} className="text-xs">
                            {voice.name} {voice.localService ? '(Local)' : ''}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Speed (Rate) Slider */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Speed (Rate)</span>
                <span className="font-mono text-xs text-muted-foreground">{rate.toFixed(2)}x</span>
              </div>
              <Slider
                value={rate}
                onChange={setRate}
                min={0.5}
                max={2.0}
                step={0.1}
                className="py-2"
              />
              <p className="text-[10px] text-muted-foreground">Adjust the pace of the narration.</p>
            </div>

            {/* Pitch Slider */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Pitch</span>
                <span className="font-mono text-xs text-muted-foreground">{pitch.toFixed(2)}</span>
              </div>
              <Slider
                value={pitch}
                onChange={setPitch}
                min={0.5}
                max={2.0}
                step={0.1}
                className="py-2"
              />
              <p className="text-[10px] text-muted-foreground">Adjust the voice tone higher or lower.</p>
            </div>

            {/* Volume Slider */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Volume</span>
                <span className="font-mono text-xs text-muted-foreground">{Math.round(volume * 100)}%</span>
              </div>
              <Slider
                value={volume}
                onChange={setVolume}
                min={0.0}
                max={1.0}
                step={0.05}
                className="py-2"
              />
            </div>

            {/* Interactive Equalizer Visualizer */}
            <div className="pt-2">
              <div className="flex h-16 w-full items-center justify-center gap-1.5 rounded-lg border bg-gradient-to-br from-cyan-950/20 to-indigo-950/20 dark:from-cyan-950/40 dark:to-indigo-950/40 p-4 overflow-hidden border-cyan-500/10">
                {isPlaying && !isPaused ? (
                  Array.from({ length: 16 }).map((_, i) => {
                    const delay = (i % 5) * 0.15;
                    const duration = 0.6 + (i % 4) * 0.15;
                    return (
                      <div
                        key={i}
                        style={{
                          animationDelay: `${delay}s`,
                          animationDuration: `${duration}s`,
                        }}
                        className="w-1 bg-gradient-to-t from-cyan-500 to-indigo-500 rounded-full animate-bounce h-full max-h-[100%]"
                      />
                    );
                  })
                ) : (
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Sparkles className="h-4 w-4 text-cyan-400" />
                    <span>Visual equalizer active during play</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Workspace (8 cols on lg) */}
      <div className="space-y-6 lg:col-span-8">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Input Text</CardTitle>
              <CardDescription>Enter any text you would like spoken aloud</CardDescription>
            </div>
            
            {/* Reader Mode Toggle */}
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Reader Mode</span>
              <Switch checked={isReaderMode} onCheckedChange={setIsReaderMode} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isReaderMode ? (
              // Enhanced Highlight Reader View
              <div className="space-y-3">
                <div
                  ref={readerScrollContainerRef}
                  className="w-full h-[320px] p-4 rounded-md bg-muted/40 border overflow-y-auto scrollbar-thin font-sans text-base leading-relaxed select-text flex flex-col gap-1.5"
                >
                  {sentences.length === 0 ? (
                    <span className="text-muted-foreground italic text-sm">
                      Enter text in the editor to use Reader Mode.
                    </span>
                  ) : (
                    sentences.map((sentence, idx) => {
                      const isActive = idx === currentSentenceIndex && isPlaying;
                      if (isActive) {
                        const before = sentence.substring(0, wordRange.charIndex);
                        const word = sentence.substring(
                          wordRange.charIndex,
                          wordRange.charIndex + wordRange.charLength
                        );
                        const after = sentence.substring(
                          wordRange.charIndex + wordRange.charLength
                        );

                        return (
                          <span
                            key={idx}
                            ref={activeSentenceRef}
                            onClick={() => handlePlayFromIndex(idx)}
                            className="inline bg-primary/10 border-l-4 border-cyan-500 pl-3 py-1 my-0.5 rounded-r-md cursor-pointer transition-all duration-300 font-medium"
                          >
                            {before}
                            {word && (
                              <span className="bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-bold px-1 py-0.5 rounded border border-cyan-500/30 transition-all duration-100">
                                {word}
                              </span>
                            )}
                            {after}
                          </span>
                        );
                      }
                      return (
                        <span
                          key={idx}
                          onClick={() => handlePlayFromIndex(idx)}
                          className={cn(
                            'inline pl-4 py-1 my-0.5 border-l-4 border-transparent cursor-pointer hover:bg-muted/60 hover:text-foreground rounded-r-md transition-all duration-200',
                            isPlaying ? 'opacity-40 hover:opacity-100' : 'opacity-100'
                          )}
                        >
                          {sentence}
                        </span>
                      );
                    })
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  💡 Tip: You can click on any sentence above to start playing directly from that line.
                </p>
              </div>
            ) : (
              // Standard Text Area
              <div className="space-y-2">
                <Textarea
                  value={text}
                  onChange={(e) => setText((e.target as HTMLTextAreaElement).value)}
                  placeholder="Paste or type your articles, documents, or notes here..."
                  rows={12}
                  className="font-sans text-base leading-relaxed bg-background"
                />
                <div className="flex justify-between items-center text-xs text-muted-foreground font-mono">
                  <span>
                    Words: {text.trim() ? text.trim().split(/\s+/).length : 0} | Characters:{' '}
                    {text.length}
                  </span>
                  <span>Sentences: {sentences.length}</span>
                </div>
              </div>
            )}

            {/* Global Actions and Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t">
              {/* Playback Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {isPlaying && !isPaused ? (
                  <Button onClick={handlePause} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </Button>
                ) : (
                  <Button
                    onClick={handlePlay}
                    disabled={!text.trim()}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white font-medium shadow-md shadow-cyan-600/10 hover:shadow-cyan-700/20"
                  >
                    <Play className="h-4 w-4 mr-2 fill-current" />
                    {isPaused ? 'Resume' : 'Speak Text'}
                  </Button>
                )}
                <Button
                  onClick={handleStop}
                  variant="outline"
                  disabled={!isPlaying}
                  className="border-input hover:bg-muted font-medium"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              </div>

              {/* Utility Tools */}
              <div className="flex items-center gap-2">
                <TooltipSimple content="Paste from clipboard">
                  <Button
                    onClick={handlePaste}
                    variant="outline"
                    size="sm"
                    className="h-9"
                    aria-label="Paste from clipboard"
                  >
                    <ClipboardPaste className="h-4 w-4 mr-2 text-muted-foreground" />
                    Paste
                  </Button>
                </TooltipSimple>
                <TooltipSimple content="Copy text">
                  <Button
                    onClick={async () => text && (await copyToClipboard(text))}
                    disabled={!text}
                    variant="outline"
                    size="sm"
                    className="h-9"
                    aria-label="Copy text"
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-4 w-4 mr-2 text-green-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2 text-muted-foreground" />
                        Copy
                      </>
                    )}
                  </Button>
                </TooltipSimple>
                <TooltipSimple content="Clear all">
                  <Button
                    onClick={handleClear}
                    disabled={!text}
                    variant="outline"
                    size="sm"
                    className="h-9 border-destructive/20 hover:bg-destructive/5 text-destructive hover:text-destructive"
                    aria-label="Clear all"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                </TooltipSimple>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
