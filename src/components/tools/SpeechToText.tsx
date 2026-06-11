'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { TooltipSimple } from '../ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import {
  Mic,
  MicOff,
  Copy,
  Check,
  Trash2,
  Download,
  AlertCircle,
  FileDown,
} from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { cn } from '@/lib/utils/cn';

// Language definition type
interface LanguageOption {
  code: string;
  name: string;
}

const LANGUAGES: LanguageOption[] = [
  { code: 'en-US', name: 'English (United States)' },
  { code: 'en-GB', name: 'English (United Kingdom)' },
  { code: 'es-ES', name: 'Spanish (Spain)' },
  { code: 'es-MX', name: 'Spanish (Mexico)' },
  { code: 'fr-FR', name: 'French (France)' },
  { code: 'de-DE', name: 'German (Germany)' },
  { code: 'it-IT', name: 'Italian (Italy)' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'tr-TR', name: 'Turkish (Turkey)' },
  { code: 'ja-JP', name: 'Japanese (Japan)' },
  { code: 'zh-CN', name: 'Chinese (Mandarin - China)' },
  { code: 'zh-HK', name: 'Chinese (Cantonese - Hong Kong)' },
  { code: 'ko-KR', name: 'Korean (South Korea)' },
  { code: 'ru-RU', name: 'Russian (Russia)' },
  { code: 'ar-SA', name: 'Arabic (Saudi Arabia)' },
];

// TypeScript interfaces to avoid using 'any'
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export function SpeechToText() {
  // Check SpeechRecognition support synchronously during state initialization to avoid set-state-in-effect
  const [isSupported] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const win = window as unknown as Record<string, unknown>;
    return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  });

  const [isListening, setIsListening] = useState(false);
  const [selectedLang, setSelectedLang] = useState('en-US');
  const [isContinuous, setIsContinuous] = useState(true);

  // Transcript states
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  // Web Speech & Web Audio Refs
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // UI HTML element refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Web Audio Visualizer methods defined first to resolve hoisting issues
  const stopAudioVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
      audioCtxRef.current = null;
    }
    
    // Draw horizontal rest line on canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(156, 163, 175, 0.15)';
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }
    }
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    if (!ctx || !analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!canvasRef.current) return;
      animationFrameRef.current = requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(dataArray);

      // Clear Canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 3;
      // Vibrant linear gradient matching modern layout
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, '#06b6d4'); // Cyan 500
      gradient.addColorStop(0.5, '#6366f1'); // Indigo 500
      gradient.addColorStop(1, '#a855f7'); // Purple 500
      ctx.strokeStyle = gradient;
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        // Normalize 0-255 time-domain value to -1 to 1 range
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
  };

  const startAudioVisualization = async () => {
    try {
      if (typeof window === 'undefined') return;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const win = window as unknown as { webkitAudioContext?: typeof AudioContext };
      const AudioContextClass = window.AudioContext || win.webkitAudioContext;
      if (!AudioContextClass) throw new Error('AudioContext is not supported by your browser');

      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      drawWaveform();
    } catch (err) {
      console.warn('Microphone visualization setup failed:', err);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
    setInterim('');
    stopAudioVisualization();
  };

  const startListening = async () => {
    setError('');
    const win = window as unknown as Record<string, unknown>;
    const SpeechRecognitionClass = win
      ? (win.SpeechRecognition || win.webkitSpeechRecognition) as SpeechRecognitionConstructor
      : null;

    if (!SpeechRecognitionClass) return;

    try {
      const recognition = new SpeechRecognitionClass();
      recognitionRef.current = recognition;

      recognition.continuous = isContinuous;
      recognition.interimResults = true;
      recognition.lang = selectedLang;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        if (finalTranscript) {
          setTranscript((prev) => {
            const separator = prev.endsWith(' ') || !prev ? '' : ' ';
            return prev + separator + finalTranscript;
          });
        }
        setInterim(interimTranscript);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setError('Microphone access blocked. Please enable mic permissions in your browser.');
        } else {
          setError(`Recognition error: ${event.error || 'Unknown error'}`);
        }
        stopListening();
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterim('');
        stopAudioVisualization();
      };

      // Start audio waveform render and speech recognition concurrently
      await startAudioVisualization();
      recognition.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start microphone');
      setIsListening(false);
    }
  };

  // Toggle Transcription Playback
  const handleToggleListening = async () => {
    if (isListening) {
      stopListening();
    } else {
      await startListening();
    }
  };

  const handleClear = () => {
    stopListening();
    setTranscript('');
    setInterim('');
    setError('');
  };

  // Export File Options
  const handleDownloadFile = (format: 'txt' | 'md') => {
    if (!transcript) return;
    const element = document.createElement('a');
    const file = new Blob([transcript], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `transcript-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Handle auto-scrolling transcript when text changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [transcript, interim]);

  // Clean up audio streams and SpeechRecognition on unmount
  useEffect(() => {
    return () => {
      stopAudioVisualization();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Draw flat line on initial canvas render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(156, 163, 175, 0.15)';
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }
    }
  }, [isSupported]);

  if (!isSupported) {
    return (
      <Card className="border-destructive/20 bg-destructive/5 shadow-md max-w-3xl mx-auto">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <AlertCircle className="h-6 w-6 text-destructive shrink-0" />
          <div>
            <CardTitle>Browser Not Supported</CardTitle>
            <CardDescription>Speech Recognition is unavailable in this browser</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            The Speech Recognition API is not natively supported or enabled by default in your current browser.
          </p>
          <p className="font-semibold text-foreground">
            Recommended Browsers for transcription:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>Google Chrome (Desktop & Mobile)</li>
            <li>Microsoft Edge (Desktop)</li>
            <li>Safari (Mac, iPhone, iPad)</li>
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Settings Panel (4 cols on lg, full width otherwise) */}
      <div className="space-y-6 lg:col-span-4">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-indigo-500" />
              Settings
            </CardTitle>
            <CardDescription>Configure the dictation preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Language Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Spoken Language</label>
              <Select value={selectedLang} onValueChange={setSelectedLang} disabled={isListening}>
                <SelectTrigger className="w-full bg-background font-medium">
                  <SelectValue placeholder="Select Language..." />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code} className="text-xs">
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Continuous Mode Toggle */}
            <div className="flex items-center justify-between py-2 border-y border-muted/50">
              <div className="space-y-0.5 pr-2">
                <label className="text-sm font-medium">Continuous Listening</label>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  Keep recording until manually stopped. If off, stops automatically after silence.
                </p>
              </div>
              <Switch
                checked={isContinuous}
                onCheckedChange={setIsContinuous}
                disabled={isListening}
              />
            </div>

            {/* Audio Waveform Canvas */}
            <div className="space-y-2.5">
              <label className="text-sm font-medium">Voice Input Waveform</label>
              <div className="relative h-20 w-full rounded-lg border bg-gradient-to-br from-indigo-950/20 to-purple-950/20 dark:from-indigo-950/40 dark:to-purple-950/40 p-1 border-indigo-500/10 overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={80}
                  className="w-full h-full"
                />
              </div>
              <p className="text-[10px] text-muted-foreground italic text-center">
                Waveform responds directly to mic volume input when listening.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Workspace (8 cols on lg) */}
      <div className="space-y-6 lg:col-span-8">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Speech Transcription</CardTitle>
            <CardDescription>Click the microphone button to start transcribing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm border border-destructive/20 flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="font-medium">{error}</div>
              </div>
            )}

            {/* Transcription Output Container */}
            <div
              ref={scrollContainerRef}
              className="w-full h-[320px] p-4 rounded-md bg-muted/40 border overflow-y-auto scrollbar-thin font-sans text-base leading-relaxed select-text whitespace-pre-wrap flex flex-col justify-start"
            >
              {transcript || interim ? (
                <div>
                  <span className="text-foreground font-normal">{transcript}</span>
                  {interim && (
                    <span className="text-muted-foreground/60 italic font-medium ml-1 animate-pulse">
                      {interim}...
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground italic text-sm">
                  {isListening
                    ? 'Listening... Start speaking into your microphone.'
                    : 'Click "Start Recording" and speak to see the live transcript here.'}
                </span>
              )}
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t">
              {/* Recording Controls */}
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleToggleListening}
                  className={cn(
                    'font-semibold shadow-sm transition-all duration-300',
                    isListening
                      ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  )}
                >
                  {isListening ? (
                    <>
                      <MicOff className="h-4 w-4 mr-2" />
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4 mr-2 fill-current" />
                      Start Recording
                    </>
                  )}
                </Button>
                
                {isListening && (
                  <span className="flex items-center gap-2.5 text-xs text-red-500 font-semibold uppercase tracking-wider animate-pulse ml-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-600 shadow-[0_0_8px_#dc2626]" />
                    Live
                  </span>
                )}
              </div>

              {/* Action Utilities */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Download Options */}
                <TooltipSimple content="Download as TXT">
                  <Button
                    onClick={() => handleDownloadFile('txt')}
                    disabled={!transcript}
                    variant="outline"
                    size="sm"
                    className="h-9"
                    aria-label="Download as TXT"
                  >
                    <Download className="h-4 w-4 mr-2 text-muted-foreground" />
                    TXT
                  </Button>
                </TooltipSimple>
                <TooltipSimple content="Download as Markdown">
                  <Button
                    onClick={() => handleDownloadFile('md')}
                    disabled={!transcript}
                    variant="outline"
                    size="sm"
                    className="h-9"
                    aria-label="Download as Markdown"
                  >
                    <FileDown className="h-4 w-4 mr-2 text-muted-foreground" />
                    MD
                  </Button>
                </TooltipSimple>

                {/* Copy */}
                <TooltipSimple content="Copy transcript">
                  <Button
                    onClick={async () => transcript && (await copyToClipboard(transcript))}
                    disabled={!transcript}
                    variant="outline"
                    size="sm"
                    className="h-9"
                    aria-label="Copy transcript"
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

                {/* Clear */}
                <TooltipSimple content="Clear transcript">
                  <Button
                    onClick={handleClear}
                    disabled={!transcript && !interim}
                    variant="outline"
                    size="sm"
                    className="h-9 border-destructive/20 hover:bg-destructive/5 text-destructive hover:text-destructive"
                    aria-label="Clear transcript"
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
