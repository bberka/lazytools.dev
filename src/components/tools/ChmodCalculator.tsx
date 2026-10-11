'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useCopyToClipboard } from '@/hooks';
import { AlertCircle, Binary, Check, Copy, FolderLock, Info, Terminal, Trash2 } from 'lucide-react';
import {
  PRESETS,
  chmodCommands,
  explainMode,
  findPreset,
  formatOctal,
  formatSymbolic,
  hasPermission,
  hasSpecial,
  parseOctal,
  parseSymbolic,
  withPermission,
  withSpecial,
  type PermissionBit,
  type PermissionClass,
  type SpecialBit,
} from '@/lib/tools/chmod-calculator';

type Field = 'octal' | 'symbolic';

/** What the user is typing into one of the two text fields, kept apart from the mode. */
interface Draft {
  field: Field;
  text: string;
  error: string | null;
}

const CLASS_ROWS: Array<{ who: PermissionClass; label: string; hint: string }> = [
  { who: 'owner', label: 'Owner', hint: 'user' },
  { who: 'group', label: 'Group', hint: 'members' },
  { who: 'others', label: 'Others', hint: 'everyone else' },
];

const BIT_COLUMNS: Array<{ bit: PermissionBit; label: string }> = [
  { bit: 'read', label: 'Read' },
  { bit: 'write', label: 'Write' },
  { bit: 'execute', label: 'Execute' },
];

const SPECIAL_ROWS: Array<{ bit: SpecialBit; label: string; octal: string; hint: string }> = [
  { bit: 'setuid', label: 'Setuid', octal: '4000', hint: 'Runs as the file owner' },
  { bit: 'setgid', label: 'Setgid', octal: '2000', hint: 'Runs as the file group' },
  { bit: 'sticky', label: 'Sticky', octal: '1000', hint: 'Restricts deleting in a directory' },
];

const INITIAL_MODE = 0o644;

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <div id={id} role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message} The other fields keep their last valid value.</span>
    </div>
  );
}

export function ChmodCalculator() {
  const [mode, setMode] = useState(INITIAL_MODE);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [target, setTarget] = useState('');

  const copyNumeric = useCopyToClipboard();
  const copySymbolic = useCopyToClipboard();

  const commands = chmodCommands(mode, target);
  const explanation = explainMode(mode);
  const matchedPreset = findPreset(mode);
  const digits = formatOctal(mode).slice(-3);

  // The field being edited shows what was typed; the others follow the mode.
  const octalValue = draft?.field === 'octal' ? draft.text : formatOctal(mode);
  const symbolicValue = draft?.field === 'symbolic' ? draft.text : formatSymbolic(mode);
  const octalError = draft?.field === 'octal' ? draft.error : null;
  const symbolicError = draft?.field === 'symbolic' ? draft.error : null;

  const applyMode = (next: number) => {
    setMode(next);
    setDraft(null);
  };

  const handleFieldChange = (field: Field, text: string) => {
    const parsed = field === 'octal' ? parseOctal(text) : parseSymbolic(text);
    if (parsed.ok) {
      setMode(parsed.mode);
      setDraft({ field, text, error: null });
      return;
    }
    // An empty field is just waiting for input, so it gets no error.
    setDraft({ field, text, error: text.trim() === '' ? null : parsed.error });
  };

  // Leaving a field tidies a valid entry (0755 becomes 755); an invalid one stays put.
  const handleFieldBlur = () => {
    if (draft && draft.error === null) setDraft(null);
  };

  const handleClear = () => {
    applyMode(0);
    setTarget('');
  };

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-5">
      {/* Left: permissions and the editable values */}
      <div className="space-y-4 lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderLock className="h-5 w-5 text-primary" />
              Permissions
            </CardTitle>
            <CardDescription>
              Tick the boxes or type an octal or symbolic value. All three stay in sync.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            <div role="group" aria-label="Permission checkboxes" className="grid grid-cols-4 gap-y-3">
              <div />
              {BIT_COLUMNS.map(({ bit, label }) => (
                <div
                  key={bit}
                  className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {label}
                </div>
              ))}
              {CLASS_ROWS.map(({ who, label, hint }, index) => (
                <div key={who} className="contents">
                  <div className="flex min-w-0 flex-col justify-center">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {hint} <span className="font-mono">({digits[index]})</span>
                    </span>
                  </div>
                  {BIT_COLUMNS.map(({ bit, label: bitLabel }) => (
                    <div key={bit} className="flex items-center justify-center">
                      <Checkbox
                        checked={hasPermission(mode, who, bit)}
                        onCheckedChange={(checked) => applyMode(withPermission(mode, who, bit, checked))}
                        aria-label={`${label} ${bitLabel.toLowerCase()}`}
                        className="h-5 w-5"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="space-y-3 border-t pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Special bits
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {SPECIAL_ROWS.map(({ bit, label, octal, hint }) => (
                  <div key={bit} className="space-y-0.5">
                    <Checkbox
                      checked={hasSpecial(mode, bit)}
                      onCheckedChange={(checked) => applyMode(withSpecial(mode, bit, checked))}
                      label={`${label} (${octal})`}
                    />
                    <p className="pl-7 text-xs text-muted-foreground">{hint}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Presets
              </h3>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.octal}
                    type="button"
                    variant={mode === preset.mode ? 'default' : 'outline'}
                    size="sm"
                    className="font-mono"
                    aria-pressed={mode === preset.mode}
                    title={`${preset.label}: ${preset.note}`}
                    onClick={() => applyMode(preset.mode)}
                  >
                    {preset.octal}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {matchedPreset ? (
                  <>
                    <span className="font-medium text-foreground">{matchedPreset.label}.</span>{' '}
                    {matchedPreset.note}
                  </>
                ) : (
                  'Custom mode. Pick a preset or adjust the boxes.'
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Binary className="h-4 w-4 text-muted-foreground" />
              Octal and symbolic
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="chmod-octal" className="text-sm font-medium">
                  Octal (3 or 4 digits)
                </label>
                <Input
                  id="chmod-octal"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={octalValue}
                  onChange={(e) => handleFieldChange('octal', e.target.value)}
                  onBlur={handleFieldBlur}
                  placeholder="e.g. 755 or 4755"
                  aria-invalid={octalError ? true : undefined}
                  aria-describedby={octalError ? 'chmod-octal-error' : undefined}
                  className={`font-mono ${octalError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                />
                {octalError && <FieldError id="chmod-octal-error" message={octalError} />}
              </div>

              <div className="space-y-2">
                <label htmlFor="chmod-symbolic" className="text-sm font-medium">
                  Symbolic (e.g. rwxr-xr-x)
                </label>
                <Input
                  id="chmod-symbolic"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={symbolicValue}
                  onChange={(e) => handleFieldChange('symbolic', e.target.value)}
                  onBlur={handleFieldBlur}
                  placeholder="e.g. rwxr-xr-x or rwsr-xr-x"
                  aria-invalid={symbolicError ? true : undefined}
                  aria-describedby={symbolicError ? 'chmod-symbolic-error' : undefined}
                  className={`font-mono ${symbolicError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                />
                {symbolicError && <FieldError id="chmod-symbolic-error" message={symbolicError} />}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              A fourth leading digit sets the special bits: 4 setuid, 2 setgid, 1 sticky. In the
              symbolic form, s and t mean the bit and execute are both set; capital S and T mean
              the bit is set without execute. You can also paste the 10 characters from ls -l.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleClear} variant="outline" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: commands and the plain-language reading */}
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              Commands
            </CardTitle>
            <CardDescription>Copy the one you prefer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="chmod-target" className="text-sm font-medium">
                File or directory name
              </label>
              <Input
                id="chmod-target"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="file"
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Numeric</span>
                <Button
                  type="button"
                  onClick={() => copyNumeric.copyToClipboard(commands.numeric)}
                  variant={copyNumeric.isCopied ? 'default' : 'outline'}
                  size="sm"
                  className="h-8"
                  aria-label="Copy numeric command"
                >
                  {copyNumeric.isCopied ? (
                    <Check className="mr-1 h-3.5 w-3.5" />
                  ) : (
                    <Copy className="mr-1 h-3.5 w-3.5" />
                  )}
                  {copyNumeric.isCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <div className="break-all rounded-md border bg-muted/30 p-3 font-mono text-sm">
                {commands.numeric}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Symbolic</span>
                <Button
                  type="button"
                  onClick={() => copySymbolic.copyToClipboard(commands.symbolic)}
                  variant={copySymbolic.isCopied ? 'default' : 'outline'}
                  size="sm"
                  className="h-8"
                  aria-label="Copy symbolic command"
                >
                  {copySymbolic.isCopied ? (
                    <Check className="mr-1 h-3.5 w-3.5" />
                  ) : (
                    <Copy className="mr-1 h-3.5 w-3.5" />
                  )}
                  {copySymbolic.isCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <div className="break-all rounded-md border bg-muted/30 p-3 font-mono text-sm">
                {commands.symbolic}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4 text-muted-foreground" />
              Who can do what
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ul className="space-y-2">
              {explanation.classes.map(({ who, label, summary }) => (
                <li key={who}>
                  <span className="font-medium">{label}</span> {summary}.
                </li>
              ))}
            </ul>

            {explanation.special.length > 0 && (
              <ul className="space-y-2 border-t pt-4 text-muted-foreground">
                {explanation.special.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}

            {explanation.warnings.length > 0 && (
              <ul className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
                {explanation.warnings.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}

            <p className="border-t pt-4 text-xs text-muted-foreground">
              On a directory, read lists its entries, write adds, renames and removes entries, and
              execute lets you enter it and reach what is inside.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
