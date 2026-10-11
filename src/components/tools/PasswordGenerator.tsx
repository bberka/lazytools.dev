'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { TooltipSimple } from '../ui/tooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Slider } from '../ui/slider';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Copy, Check, RefreshCw, Shield, KeyRound } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import {
  clampInteger,
  countCharacterTypes,
  generatePassword,
  separatorCharacter,
  type Generated,
  type GenerationMode,
  type GeneratorSettings,
  type PassphraseSeparator,
} from '@/lib/tools/password-generator';

interface ZxcvbnResult {
  score: number;
  feedback: {
    warning?: string;
    suggestions: string[];
  };
  crackTimesDisplay: {
    offlineFastHashing1e10PerSecond: string;
    offlineSlowHashing1e4PerSecond: string;
    onlineNoThrottling10PerSecond: string;
  };
  entropyBits: number;
}

let isZxcvbnInitialized = false;

// Estimating the strength of a long password takes long enough to stall the
// page (about a second at 256 characters). Above this length the estimate
// waits until the password has stopped changing, so dragging the length slider
// does not run it on every step.
const SLOW_ESTIMATE_LENGTH = 32;
const SLOW_ESTIMATE_DELAY_MS = 250;

/** What is on screen: a result together with the settings that produced it. */
interface Output {
  settings: GeneratorSettings;
  result: Generated;
  /** Which press of "Generate now" this came from. */
  refresh: number;
}

export function PasswordGenerator() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<GenerationMode>('random');
  const [length, setLength] = useState(16);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [special, setSpecial] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [ensureEveryEnabledSet, setEnsureEveryEnabledSet] = useState(true);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [limitUppercase, setLimitUppercase] = useState(false);
  const [limitLowercase, setLimitLowercase] = useState(false);
  const [limitNumbers, setLimitNumbers] = useState(false);
  const [limitSpecial, setLimitSpecial] = useState(false);
  const [maxUppercase, setMaxUppercase] = useState(6);
  const [maxLowercase, setMaxLowercase] = useState(16);
  const [maxNumbers, setMaxNumbers] = useState(4);
  const [maxSpecial, setMaxSpecial] = useState(4);
  const [pinLength, setPinLength] = useState(6);
  const [pinGrouping, setPinGrouping] = useState(3);
  const [wordCount, setWordCount] = useState(4);
  const [separator, setSeparator] = useState<PassphraseSeparator>('hyphen');
  const [capitalizeWords, setCapitalizeWords] = useState(true);
  const [includePassphraseNumber, setIncludePassphraseNumber] = useState(true);
  const [includePassphraseSymbol, setIncludePassphraseSymbol] = useState(false);
  const [manualOutput, setManualOutput] = useState<Output | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  useEffect(() => {
    setMounted(true);
  }, []);

  const settings = useMemo<GeneratorSettings>(() => {
    if (mode === 'pin') {
      return { mode, length: pinLength, groupSize: pinGrouping };
    }

    if (mode === 'passphrase') {
      return {
        mode,
        wordCount,
        separator,
        capitalize: capitalizeWords,
        appendNumber: includePassphraseNumber,
        appendSymbol: includePassphraseSymbol,
      };
    }

    return {
      mode,
      length,
      uppercase,
      lowercase,
      numbers,
      special,
      excludeAmbiguous,
      requireEachSet: ensureEveryEnabledSet,
      maxUppercase: limitUppercase ? maxUppercase : undefined,
      maxLowercase: limitLowercase ? maxLowercase : undefined,
      maxNumbers: limitNumbers ? maxNumbers : undefined,
      maxSpecial: limitSpecial ? maxSpecial : undefined,
    };
  }, [
    capitalizeWords,
    ensureEveryEnabledSet,
    excludeAmbiguous,
    includePassphraseNumber,
    includePassphraseSymbol,
    length,
    limitLowercase,
    limitNumbers,
    limitSpecial,
    limitUppercase,
    lowercase,
    maxLowercase,
    maxNumbers,
    maxSpecial,
    maxUppercase,
    mode,
    numbers,
    pinGrouping,
    pinLength,
    separator,
    special,
    uppercase,
    wordCount,
  ]);

  const liveOutput = useMemo<Output | null>(() => {
    if (!mounted) return null;
    return { settings, result: generatePassword(settings), refresh: refreshNonce };
  }, [mounted, refreshNonce, settings]);

  // With auto-generate off the output stays as it is until "Generate now", so
  // it is described by the settings it was made with, not the current ones.
  const output = autoGenerate ? liveOutput : (manualOutput ?? liveOutput);
  const password = output?.result.ok ? output.result.value : '';
  const errorMessage = output && !output.result.ok ? output.result.error : '';
  const hasError = errorMessage !== '';

  const handleGenerateNow = () => {
    if (autoGenerate) {
      setRefreshNonce((current) => current + 1);
      return;
    }

    setManualOutput({ settings, result: generatePassword(settings), refresh: refreshNonce });
  };

  const handleCopy = async () => {
    await copyToClipboard(password);
  };

  const counts = useMemo(() => countCharacterTypes(password), [password]);

  const [strengthAnalysis, setStrengthAnalysis] = useState<ZxcvbnResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [strengthFailed, setStrengthFailed] = useState(false);

  useEffect(() => {
    if (!password || hasError) {
      setStrengthAnalysis(null);
      return;
    }

    let isCurrent = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setIsEvaluating(true);
    setStrengthFailed(false);

    const evaluate = async () => {
      try {
        const [core, langCommon, langEn] = await Promise.all([
          import('@zxcvbn-ts/core'),
          import('@zxcvbn-ts/language-common'),
          import('@zxcvbn-ts/language-en'),
        ]);

        if (!isCurrent) return;

        if (!isZxcvbnInitialized) {
          core.zxcvbnOptions.setOptions({
            dictionary: {
              ...langCommon.dictionary,
              ...langEn.dictionary,
            },
            graphs: langCommon.adjacencyGraphs,
            translations: langEn.translations,
          });
          isZxcvbnInitialized = true;
        }

        const result = core.zxcvbn(password);

        if (!isCurrent) return;

        setStrengthAnalysis({
          score: result.score,
          feedback: {
            warning: result.feedback.warning || undefined,
            suggestions: result.feedback.suggestions || [],
          },
          crackTimesDisplay: {
            offlineFastHashing1e10PerSecond: result.crackTimesDisplay.offlineFastHashing1e10PerSecond,
            offlineSlowHashing1e4PerSecond: result.crackTimesDisplay.offlineSlowHashing1e4PerSecond,
            onlineNoThrottling10PerSecond: result.crackTimesDisplay.onlineNoThrottling10PerSecond,
          },
          entropyBits: Math.round(Math.log2(result.guesses)),
        });
      } catch (e) {
        console.error('zxcvbn evaluation failed', e);
        // The estimate still on screen belongs to an earlier password.
        if (isCurrent) {
          setStrengthAnalysis(null);
          setStrengthFailed(true);
        }
      } finally {
        if (isCurrent) {
          setIsEvaluating(false);
        }
      }
    };

    if (password.length > SLOW_ESTIMATE_LENGTH) {
      timer = setTimeout(() => void evaluate(), SLOW_ESTIMATE_DELAY_MS);
    } else {
      void evaluate();
    }

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [password, hasError]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Password Generator
          </CardTitle>
          <CardDescription>
            Instant regeneration, stricter character controls, and wallet-style recovery phrases in one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Generation mode</label>
              <Select value={mode} onValueChange={(value) => setMode(value as GenerationMode)}>
                <SelectTrigger aria-label="Generation mode">
                  <SelectValue placeholder="Select a mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">Random password</SelectItem>
                  <SelectItem value="pin">PIN code</SelectItem>
                  <SelectItem value="passphrase">Recovery-style passphrase</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Auto-generate</p>
                <p className="text-xs text-muted-foreground">Refresh the output whenever settings change.</p>
              </div>
              <Switch
                checked={autoGenerate}
                aria-label="Auto-generate"
                onCheckedChange={(checked) => {
                  setAutoGenerate(checked);
                  if (!checked) {
                    setManualOutput(output);
                  }
                }}
              />
            </div>
          </div>

          {mode === 'random' && (
            <div className="space-y-6">
              <div>
                <label className="mb-3 block text-sm font-medium">Length: {length}</label>
                <Slider value={length} onChange={setLength} min={4} max={256} step={1} />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Character sets</p>
                <Checkbox checked={uppercase} onChange={setUppercase} label="Uppercase (A-Z)" />
                <Checkbox checked={lowercase} onChange={setLowercase} label="Lowercase (a-z)" />
                <Checkbox checked={numbers} onChange={setNumbers} label="Numbers (0-9)" />
                <Checkbox checked={special} onChange={setSpecial} label="Special (!@#$...)" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Checkbox
                  checked={excludeAmbiguous}
                  onChange={setExcludeAmbiguous}
                  label="Exclude ambiguous characters (0, O, l, 1, i, I)"
                />
                <Checkbox
                  checked={ensureEveryEnabledSet}
                  onChange={setEnsureEveryEnabledSet}
                  label="Force at least one char from each enabled set"
                />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Maximum characters by type</p>
                <div className="rounded-xl border border-border/70 p-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <LimitInput
                      label="Max uppercase"
                      checked={limitUppercase}
                      onCheckedChange={setLimitUppercase}
                      value={maxUppercase}
                      disabled={!uppercase}
                      inputDisabled={!uppercase || !limitUppercase}
                      max={length}
                      onChange={setMaxUppercase}
                    />
                    <LimitInput
                      label="Max lowercase"
                      checked={limitLowercase}
                      onCheckedChange={setLimitLowercase}
                      value={maxLowercase}
                      disabled={!lowercase}
                      inputDisabled={!lowercase || !limitLowercase}
                      max={length}
                      onChange={setMaxLowercase}
                    />
                    <LimitInput
                      label="Max numbers"
                      checked={limitNumbers}
                      onCheckedChange={setLimitNumbers}
                      value={maxNumbers}
                      disabled={!numbers}
                      inputDisabled={!numbers || !limitNumbers}
                      max={length}
                      onChange={setMaxNumbers}
                    />
                    <LimitInput
                      label="Max special"
                      checked={limitSpecial}
                      onCheckedChange={setLimitSpecial}
                      value={maxSpecial}
                      disabled={!special}
                      inputDisabled={!special || !limitSpecial}
                      max={length}
                      onChange={setMaxSpecial}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === 'pin' && (
            <div className="space-y-6">
              <div>
                <label className="mb-3 block text-sm font-medium">PIN length: {pinLength}</label>
                <Slider value={pinLength} onChange={setPinLength} min={4} max={24} step={1} />
              </div>
              <div>
                <label className="mb-3 block text-sm font-medium">Digits per group: {pinGrouping}</label>
                <Slider
                  value={pinGrouping}
                  onChange={(value) => setPinGrouping(clampInteger(value, 2, 6))}
                  min={2}
                  max={6}
                  step={1}
                />
              </div>
            </div>
          )}

          {mode === 'passphrase' && (
            <div className="space-y-6">
              <div>
                <label className="mb-3 block text-sm font-medium">Word count: {wordCount}</label>
                <Slider value={wordCount} onChange={setWordCount} min={3} max={12} step={1} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Separator</label>
                  <Select value={separator} onValueChange={(value) => setSeparator(value as PassphraseSeparator)}>
                    <SelectTrigger aria-label="Separator">
                      <SelectValue placeholder="Choose a separator" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hyphen">Hyphen</SelectItem>
                      <SelectItem value="space">Space</SelectItem>
                      <SelectItem value="dot">Dot</SelectItem>
                      <SelectItem value="underscore">Underscore</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3 rounded-xl border border-border/70 p-4">
                  <Checkbox
                    checked={capitalizeWords}
                    onChange={setCapitalizeWords}
                    label="Capitalize each word"
                  />
                  <Checkbox
                    checked={includePassphraseNumber}
                    onChange={setIncludePassphraseNumber}
                    label="Append a 3-digit suffix"
                  />
                  <Checkbox
                    checked={includePassphraseSymbol}
                    onChange={setIncludePassphraseSymbol}
                    label="Append a symbol suffix"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleGenerateNow}>
              <RefreshCw className="h-4 w-4" />
              Generate now
            </Button>
            <p className="text-sm text-muted-foreground">
              {mode === 'passphrase'
                ? 'Best for memorable phrases that feel closer to recovery keys.'
                : mode === 'pin'
                  ? 'Useful for quick numeric access codes.'
                  : 'Use limits to keep the password readable without weakening all character sets.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {output && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Output
              </CardTitle>
              <CardDescription>
                {hasError
                  ? 'Adjust the settings below to make this combination possible.'
                  : strengthFailed
                    ? 'Strength estimate unavailable'
                    : isEvaluating || !strengthAnalysis
                      ? 'Evaluating strength...'
                      : `Estimated entropy: ${strengthAnalysis.entropyBits} bits`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {!hasError && strengthAnalysis && !isEvaluating && (
                <span
                  className={`text-sm font-semibold ${
                    strengthAnalysis.score === 4
                      ? 'text-green-500'
                      : strengthAnalysis.score === 3
                        ? 'text-blue-500'
                        : strengthAnalysis.score === 2
                          ? 'text-yellow-500'
                          : strengthAnalysis.score === 1
                            ? 'text-orange-500'
                            : 'text-red-500'
                  }`}
                >
                  {strengthAnalysis.score === 4
                    ? 'Strong'
                    : strengthAnalysis.score === 3
                      ? 'Good'
                      : strengthAnalysis.score === 2
                        ? 'Fair'
                        : strengthAnalysis.score === 1
                          ? 'Weak'
                          : 'Very Weak'}
                </span>
              )}
              <TooltipSimple content={isCopied ? 'Copied!' : 'Copy output'}>
                <Button
                  variant={isCopied ? 'default' : 'ghost'}
                  size="icon"
                  onClick={handleCopy}
                  disabled={hasError}
                  aria-label="Copy password"
                >
                  {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </TooltipSimple>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`rounded-md p-4 font-mono text-lg break-all ${hasError ? 'bg-destructive/10 text-destructive' : 'bg-muted'}`}
            >
              {hasError ? errorMessage : password}
            </div>

            {/* Strength Progress Bar */}
            {!hasError && !isEvaluating && strengthAnalysis && (
              <div className="space-y-1.5">
                <div className="flex gap-1.5 h-2 w-full bg-muted rounded-full overflow-hidden">
                  {[0, 1, 2, 3].map((index) => {
                    const score = strengthAnalysis.score;
                    const isFilled = index < score;
                    let fillClass = 'bg-muted';
                    if (isFilled) {
                      if (score <= 1) fillClass = 'bg-red-500';
                      else if (score === 2) fillClass = 'bg-orange-500';
                      else if (score === 3) fillClass = 'bg-yellow-500';
                      else fillClass = 'bg-green-500';
                    }
                    return (
                      <div
                        key={index}
                        className={`h-full flex-1 transition-all duration-300 ${fillClass}`}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Warnings and Suggestions */}
            {!hasError && !isEvaluating && strengthAnalysis && (strengthAnalysis.feedback.warning || strengthAnalysis.feedback.suggestions.length > 0) && (
              <div className="p-3.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 space-y-1.5">
                {strengthAnalysis.feedback.warning && (
                  <p className="text-xs font-semibold text-yellow-600 dark:text-yellow-500 flex items-center gap-1.5">
                    ⚠️ {strengthAnalysis.feedback.warning}
                  </p>
                )}
                {strengthAnalysis.feedback.suggestions.length > 0 && (
                  <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1 pl-1">
                    {strengthAnalysis.feedback.suggestions.map((suggestion, idx) => (
                      <li key={idx}>{suggestion}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Estimated time-to-crack metrics */}
            {!hasError && !isEvaluating && strengthAnalysis && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Fast Crack (Offline)</p>
                  <p className="mt-1 font-mono text-sm leading-normal text-foreground">{strengthAnalysis.crackTimesDisplay.offlineFastHashing1e10PerSecond}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Slow Crack (Offline)</p>
                  <p className="mt-1 font-mono text-sm leading-normal text-foreground">{strengthAnalysis.crackTimesDisplay.offlineSlowHashing1e4PerSecond}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Online Crack</p>
                  <p className="mt-1 font-mono text-sm leading-normal text-foreground">{strengthAnalysis.crackTimesDisplay.onlineNoThrottling10PerSecond}</p>
                </div>
              </div>
            )}

            {!hasError && output.settings.mode === 'random' && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Uppercase" value={counts.uppercase} />
                <StatCard label="Lowercase" value={counts.lowercase} />
                <StatCard label="Numbers" value={counts.numbers} />
                <StatCard label="Special" value={counts.special} />
              </div>
            )}

            {!hasError && output.settings.mode === 'passphrase' && (
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Words" value={output.settings.wordCount} />
                <StatCard
                  label="Separator"
                  value={
                    separatorCharacter(output.settings.separator) === ' '
                      ? 'space'
                      : separatorCharacter(output.settings.separator)
                  }
                />
                <StatCard
                  label="Suffixes"
                  value={`${output.settings.appendNumber ? '123' : '-'} ${output.settings.appendSymbol ? '+ !' : ''}`.trim()}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LimitInput({
  label,
  checked,
  onCheckedChange,
  value,
  max,
  disabled,
  inputDisabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  value: number;
  max: number;
  disabled?: boolean;
  inputDisabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-3">
      <Checkbox
        checked={checked}
        onChange={onCheckedChange}
        disabled={disabled}
        label={label}
      />
      <Input
        type="number"
        min={0}
        max={max}
        value={value}
        disabled={inputDisabled}
        aria-label={`${label} count`}
        onChange={(event) => onChange(clampInteger(Number(event.currentTarget.value), 0, max))}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg">{value}</p>
    </div>
  );
}
