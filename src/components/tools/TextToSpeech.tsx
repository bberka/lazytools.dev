'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
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
  AlertCircle,
} from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { cn } from '@/lib/utils/cn';
import {
  describeSpeechError,
  locateSpokenWord,
  splitIntoSentences,
  type WordBoundary,
} from '@/lib/tools/text-to-speech';

function getSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  return window.speechSynthesis;
}

// Whether the browser can speak never changes while the page is open, so there is nothing to subscribe to.
const subscribeToNothing = () => () => {};
const canSpeak = () => getSynthesis() !== null && typeof SpeechSynthesisUtterance !== 'undefined';

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
  // Null until the engine reports a word of the current sentence.
  const [wordBoundary, setWordBoundary] = useState<WordBoundary | null>(null);
  const [isReaderMode, setIsReaderMode] = useState(false);
  const [error, setError] = useState('');

  // The prerendered page cannot know the browser, so it counts as supported
  // there and the real answer follows once the page is live.
  const isSupported = useSyncExternalStore(subscribeToNothing, canSpeak, () => true);

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  // Derived state: split text into sentences
  const sentences = useMemo(() => splitIntoSentences(text), [text]);

  // Refs for tracking playback sequence
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const rateRef = useRef(1.0);
  const pitchRef = useRef(1.0);
  const volumeRef = useRef(1.0);
  const selectedVoiceNameRef = useRef('');
  const activeSentenceRef = useRef<HTMLSpanElement | null>(null);
  const readerScrollContainerRef = useRef<HTMLDivElement | null>(null);

  // The utterance whose events still count. Stopping, or jumping to another
  // sentence, replaces it before cancelling, so that the `end` or `error` the
  // browser then reports for the cancelled utterance is ignored.
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // playSentenceRef to handle self-referencing callbacks safely without hoisting issues
  const playSentenceRef = useRef<(index: number) => void>(() => {});

  // Keep refs up-to-date to avoid stale closures in event handlers
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

  // Scroll active sentence into view inside the reader box. Only the box is
  // scrolled: scrollIntoView would also move the page, away from whatever the
  // user is doing elsewhere on it.
  useEffect(() => {
    const container = readerScrollContainerRef.current;
    const active = activeSentenceRef.current;
    if (!isReaderMode || !container || !active) return;

    const box = container.getBoundingClientRect();
    const sentence = active.getBoundingClientRect();
    const margin = 8;

    // A sentence taller than the box is shown from its first line.
    if (sentence.top < box.top + margin || sentence.height > box.height - 2 * margin) {
      container.scrollBy({ top: sentence.top - box.top - margin, behavior: 'smooth' });
    } else if (sentence.bottom > box.bottom - margin) {
      container.scrollBy({ top: sentence.bottom - box.bottom + margin, behavior: 'smooth' });
    }
  }, [currentSentenceIndex, isReaderMode]);

  const resetPlayback = useCallback(() => {
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentSentenceIndex(0);
    setWordBoundary(null);
  }, []);

  // Play a specific sentence in the sequence
  const playSentence = useCallback((index: number) => {
    const synth = getSynthesis();
    if (!synth) return;

    currentUtteranceRef.current = null;
    synth.cancel(); // Stop any currently speaking speech

    if (index >= sentences.length) {
      // Completed playback
      resetPlayback();
      return;
    }

    setCurrentSentenceIndex(index);
    setWordBoundary(null);

    const utteranceText = sentences[index];
    const utterance = new SpeechSynthesisUtterance(utteranceText);

    // Holding on to the utterance also keeps it from being garbage-collected
    // while it is spoken, which in Chrome loses its `end` event.
    currentUtteranceRef.current = utterance;
    const isCurrent = () => currentUtteranceRef.current === utterance;

    // Find and set selected voice
    const activeVoice = voicesRef.current.find((v) => v.name === selectedVoiceNameRef.current);
    if (activeVoice) utterance.voice = activeVoice;

    utterance.rate = rateRef.current;
    utterance.pitch = pitchRef.current;
    utterance.volume = volumeRef.current;

    utterance.onstart = () => {
      if (!isCurrent()) return;
      setIsPlaying(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      // Only a sentence that was not cancelled leads on to the next one
      if (isCurrent()) {
        playSentenceRef.current(index + 1);
      }
    };

    utterance.onerror = (e) => {
      if (!isCurrent()) return;

      const message = describeSpeechError(e.error);
      if (message) {
        console.error('SpeechSynthesis error:', e.error || e);
        setError(message);
      }
      // One sentence that fails does not end the reading
      playSentenceRef.current(index + 1);
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word' && isCurrent()) {
        setWordBoundary({
          charIndex: event.charIndex,
          charLength: event.charLength,
        });
      }
    };

    synth.speak(utterance);

    // cancel() does not end a pause: after Pause and then Stop, or a jump to
    // another sentence, the new utterance would wait in silence.
    if (synth.paused) synth.resume();
  }, [sentences, resetPlayback]);

  // Set the ref to the current play function to enable circular/recursive callback
  useEffect(() => {
    playSentenceRef.current = playSentence;
  }, [playSentence]);

  // Actions
  const handlePlay = () => {
    const synth = getSynthesis();
    if (!text.trim() || !synth) return;

    setError('');

    if (isPaused) {
      synth.resume();
      setIsPaused(false);
    } else {
      setIsPlaying(true);
      playSentence(currentSentenceIndex);
    }
  };

  const handlePause = () => {
    const synth = getSynthesis();
    if (synth && isPlaying) {
      synth.pause();
      setIsPaused(true);
    }
  };

  const handleStop = () => {
    currentUtteranceRef.current = null;
    getSynthesis()?.cancel();
    resetPlayback();
  };

  const handlePlayFromIndex = (index: number) => {
    if (!getSynthesis()) return;

    setError('');
    setIsPlaying(true);
    setIsPaused(false);
    playSentence(index);
  };

  // Reader sentences form one tab stop; the arrow keys move between them.
  const handleSentenceKeyDown = (event: KeyboardEvent<HTMLSpanElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlePlayFromIndex(index);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const neighbour =
        event.key === 'ArrowDown'
          ? event.currentTarget.nextElementSibling
          : event.currentTarget.previousElementSibling;
      if (neighbour instanceof HTMLElement) neighbour.focus();
    }
  };

  const handleClear = () => {
    handleStop();
    setText('');
    setError('');
  };

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setText(clipboardText);
      setError('');
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      setError(
        'The clipboard could not be read. Allow clipboard access for this site, or paste into the text box with your keyboard.'
      );
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
      currentUtteranceRef.current = null;
      getSynthesis()?.cancel();
    };
  }, []);

  // The sentence that Tab lands on in the reader box.
  const tabStopIndex = Math.min(currentSentenceIndex, sentences.length - 1);

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12">
      {/* Settings Panel (4 cols on lg, full width otherwise) */}
      <div className="space-y-6 lg:col-span-4">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-primary" />
              Voice Controls
            </CardTitle>
            <CardDescription>Configure the voice and parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Voice Select */}
            <div className="space-y-2">
              <label htmlFor="tts-voice" className="text-sm font-medium">
                Select Voice
              </label>
              {!isSupported ? (
                <div
                  role="alert"
                  className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-md border border-destructive/20"
                >
                  Speech synthesis is not available in this browser, so text cannot be read aloud here.
                </div>
              ) : voices.length === 0 ? (
                <div className="text-xs text-muted-foreground bg-muted p-2.5 rounded-md border">
                  {"No system voices loaded. Playing will use your browser's default speech voice."}
                </div>
              ) : (
                <Select value={selectedVoiceName} onValueChange={setSelectedVoiceName}>
                  <SelectTrigger id="tts-voice" className="w-full bg-background font-medium">
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
            <div className="space-y-2" role="group" aria-labelledby="tts-rate-label">
              <div className="flex justify-between text-sm">
                <span id="tts-rate-label" className="font-medium">Speed (Rate)</span>
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
            <div className="space-y-2" role="group" aria-labelledby="tts-pitch-label">
              <div className="flex justify-between text-sm">
                <span id="tts-pitch-label" className="font-medium">Pitch</span>
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
            <div className="space-y-2" role="group" aria-labelledby="tts-volume-label">
              <div className="flex justify-between text-sm">
                <span id="tts-volume-label" className="font-medium">Volume</span>
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
            <div className="pt-2" aria-hidden="true">
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
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Input Text</CardTitle>
              <CardDescription>Enter any text you would like spoken aloud</CardDescription>
            </div>

            {/* Reader Mode Toggle */}
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <label htmlFor="tts-reader-mode" className="text-xs font-semibold text-muted-foreground">
                Reader Mode
              </label>
              <Switch id="tts-reader-mode" checked={isReaderMode} onCheckedChange={setIsReaderMode} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div
                role="alert"
                className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm border border-destructive/20 flex items-start gap-2.5"
              >
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="font-medium">{error}</div>
              </div>
            )}

            {isReaderMode ? (
              // Enhanced Highlight Reader View
              <div className="space-y-3">
                <div
                  ref={readerScrollContainerRef}
                  role="group"
                  aria-label="Sentences"
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
                        const { before, word, after } = locateSpokenWord(sentence, wordBoundary);

                        return (
                          <span
                            key={idx}
                            ref={activeSentenceRef}
                            role="button"
                            tabIndex={idx === tabStopIndex ? 0 : -1}
                            aria-current="true"
                            onClick={() => handlePlayFromIndex(idx)}
                            onKeyDown={(event) => handleSentenceKeyDown(event, idx)}
                            className="inline bg-primary/10 border-l-4 border-primary pl-3 py-1 my-0.5 rounded-r-md cursor-pointer transition-all duration-300 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {before}
                            {word && (
                              <span className="bg-primary/20 text-primary font-bold px-1 py-0.5 rounded border border-primary/30 transition-all duration-100">
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
                          role="button"
                          tabIndex={idx === tabStopIndex ? 0 : -1}
                          onClick={() => handlePlayFromIndex(idx)}
                          onKeyDown={(event) => handleSentenceKeyDown(event, idx)}
                          className={cn(
                            'inline pl-4 py-1 my-0.5 border-l-4 border-transparent cursor-pointer hover:bg-muted/60 hover:text-foreground rounded-r-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            isPlaying ? 'opacity-40 hover:opacity-100 focus-visible:opacity-100' : 'opacity-100'
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
                  onChange={(e) => {
                    setText((e.target as HTMLTextAreaElement).value);
                    setError('');
                  }}
                  placeholder="Paste or type your articles, documents, or notes here..."
                  rows={12}
                  aria-label="Text to speak"
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
                  <Button onClick={handlePause}>
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </Button>
                ) : (
                  <Button onClick={handlePlay} disabled={!text.trim() || !isSupported}>
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
              <div className="flex flex-wrap items-center gap-2">
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
