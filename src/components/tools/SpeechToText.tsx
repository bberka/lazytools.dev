'use client';

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
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
import { downloadText } from '@/lib/files';
import {
  appendTranscript,
  describeRecognitionError,
  readRecognitionResults,
  transcriptFileName,
  type TranscriptFormat,
} from '@/lib/tools/speech-to-text';

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

// One press of Start Recording: the recognizer and whether its results still count.
interface ListeningSession {
  recognition: SpeechRecognitionInstance;
  /** Set by Clear and on unmount: whatever the recognizer still reports is dropped. */
  discarded: boolean;
}

function getSpeechRecognitionClass(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as Record<string, unknown>;
  return ((win.SpeechRecognition || win.webkitSpeechRecognition) as SpeechRecognitionConstructor) || null;
}

// Whether the browser can recognize speech never changes while the page is open, so there is nothing to subscribe to.
const subscribeToNothing = () => () => {};
const canRecognizeSpeech = () => getSpeechRecognitionClass() !== null;

export function SpeechToText() {
  // The prerendered page cannot know the browser, so it counts as supported
  // there and the real answer follows once the page is live. A useState
  // initializer gave a first client render that differed from the prerendered
  // HTML in every browser without speech recognition.
  const isSupported = useSyncExternalStore(subscribeToNothing, canRecognizeSpeech, () => true);

  const [isListening, setIsListening] = useState(false);
  // From the press of Start Recording until the recognizer reports that it is running.
  const [isStarting, setIsStarting] = useState(false);
  const [selectedLang, setSelectedLang] = useState('en-US');
  const [isContinuous, setIsContinuous] = useState(true);

  // Transcript states
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  // Web Speech & Web Audio Refs
  const sessionRef = useRef<ListeningSession | null>(null);
  const startingRef = useRef(false);
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
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    
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

  const startAudioVisualization = async (session: ListeningSession) => {
    try {
      if (typeof window === 'undefined') return;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Cleared or left while the permission prompt was open: give the
      // microphone back instead of keeping it open for a session that is gone.
      if (sessionRef.current !== session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
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

  // Puts the controls back to idle and releases the microphone.
  const resetListeningUi = () => {
    startingRef.current = false;
    setIsStarting(false);
    setIsListening(false);
    setInterim('');
    stopAudioVisualization();
  };

  const stopListening = () => {
    // stop() lets the recognizer deliver what it has heard so far before it ends.
    sessionRef.current?.recognition.stop();
    resetListeningUi();
  };

  // Ends the session and drops whatever it has not delivered yet.
  const discardSession = () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      session.discarded = true;
      session.recognition.abort();
    }
    resetListeningUi();
  };

  const startListening = async () => {
    // A second press while the microphone prompt is still open must not start a second session.
    if (startingRef.current) return;

    const SpeechRecognitionClass = getSpeechRecognitionClass();
    if (!SpeechRecognitionClass) return;

    setError('');
    startingRef.current = true;
    setIsStarting(true);

    let session: ListeningSession | null = null;

    try {
      const recognition = new SpeechRecognitionClass();
      const startedSession: ListeningSession = { recognition, discarded: false };
      session = startedSession;
      sessionRef.current = startedSession;

      // A recognizer keeps reporting after it has been stopped or replaced.
      // Only the session in sessionRef may change the controls.
      const isCurrent = () => sessionRef.current === startedSession;
      const lang = selectedLang;

      recognition.continuous = isContinuous;
      recognition.interimResults = true;
      recognition.lang = lang;

      recognition.onstart = () => {
        if (!isCurrent()) return;
        startingRef.current = false;
        setIsStarting(false);
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        // The last words of a stopped session are still wanted; those of a cleared one are not.
        if (startedSession.discarded) return;

        const { finalText, interimText } = readRecognitionResults(event, lang);

        if (finalText) {
          setTranscript((prev) => appendTranscript(prev, finalText, lang));
        }
        if (isCurrent()) setInterim(interimText);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (!isCurrent()) return;

        const message = describeRecognitionError(event.error);
        if (message) {
          console.error('Speech recognition error:', event.error);
          setError(message);
        }
        stopListening();
      };

      recognition.onend = () => {
        if (!isCurrent()) return;
        sessionRef.current = null;
        resetListeningUi();
      };

      // Start audio waveform render and speech recognition concurrently
      await startAudioVisualization(startedSession);

      // Cleared or left while the microphone prompt was open.
      if (!isCurrent()) return;
      recognition.start();
    } catch (err) {
      // Nothing to report for a session that was cleared in the meantime.
      if (session && sessionRef.current !== session) return;

      sessionRef.current = null;
      // Also closes the microphone that the waveform had already opened.
      resetListeningUi();
      setError(err instanceof Error ? err.message : 'Failed to start microphone');
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
    // Not stopListening(): a stopped recognizer still delivers its last words,
    // and they would show up again in the transcript that was just cleared.
    discardSession();
    setTranscript('');
    setInterim('');
    setError('');
  };

  // Export File Options
  const handleDownloadFile = (format: TranscriptFormat) => {
    if (!transcript) return;
    downloadText(transcript, transcriptFileName(format, new Date()));
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
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) {
        session.discarded = true;
        session.recognition.abort();
      }
      stopAudioVisualization();
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
    <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12">
      {/* Settings Panel (4 cols on lg, full width otherwise) */}
      <div className="space-y-6 lg:col-span-4">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              Settings
            </CardTitle>
            <CardDescription>Configure the dictation preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Language Selection */}
            <div className="space-y-2">
              <label htmlFor="stt-language" className="text-sm font-medium">
                Spoken Language
              </label>
              <Select
                value={selectedLang}
                onValueChange={setSelectedLang}
                disabled={isListening || isStarting}
              >
                <SelectTrigger id="stt-language" className="w-full bg-background font-medium">
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
                <label htmlFor="stt-continuous" className="text-sm font-medium">
                  Continuous Listening
                </label>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  Keep recording until manually stopped. If off, stops automatically after silence.
                </p>
              </div>
              <Switch
                id="stt-continuous"
                checked={isContinuous}
                onCheckedChange={setIsContinuous}
                disabled={isListening || isStarting}
              />
            </div>

            {/* Audio Waveform Canvas */}
            <div className="space-y-2.5">
              <label id="stt-waveform-label" className="text-sm font-medium">
                Voice Input Waveform
              </label>
              <div className="relative h-20 w-full rounded-lg border bg-gradient-to-br from-indigo-950/20 to-purple-950/20 dark:from-indigo-950/40 dark:to-purple-950/40 p-1 border-indigo-500/10 overflow-hidden">
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-labelledby="stt-waveform-label"
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
              <div
                role="alert"
                className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm border border-destructive/20 flex items-start gap-2.5"
              >
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
                    : isStarting
                      ? 'Waiting for access to your microphone...'
                      : 'Click "Start Recording" and speak to see the live transcript here.'}
                </span>
              )}
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t">
              {/* Recording Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={handleToggleListening}
                  disabled={isStarting}
                  aria-busy={isStarting}
                  variant={isListening ? 'destructive' : 'default'}
                  className={cn(
                    'font-semibold shadow-sm transition-all duration-300',
                    isListening && 'animate-pulse'
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
