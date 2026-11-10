'use client';

import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Keyboard, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { describeKey, keyInfoText, pushHistory, type KeyInfo } from '@/lib/tools/keycode-info';
import { CopyValueButton } from './CopyValueButton';

/** True on devices whose main pointer is a finger, which usually means no hardware keyboard. */
function subscribeToPointer(onChange: () => void) {
  const query = window.matchMedia('(pointer: coarse)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const readCoarsePointer = () => window.matchMedia('(pointer: coarse)').matches;
const readCoarsePointerOnServer = () => false;

function Value({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('break-all text-lg font-semibold', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}

export function KeycodeInfo() {
  const [current, setCurrent] = useState<KeyInfo | null>(null);
  const [history, setHistory] = useState<{ id: number; info: KeyInfo }[]>([]);
  const nextId = useRef(0);
  const [focused, setFocused] = useState(false);

  const coarsePointer = useSyncExternalStore(
    subscribeToPointer,
    readCoarsePointer,
    readCoarsePointerOnServer
  );

  const record = useCallback((event: ReactKeyboardEvent<HTMLElement>, typing: boolean) => {
    // The app listens for shortcuts (Ctrl/Cmd+K, Alt+C, Alt+W) on window.
    // Stopping the event here keeps those keys from firing while the page is
    // being asked what they are.
    event.stopPropagation();
    // Tab still has to move focus out, or a keyboard user would be trapped.
    // Typing keeps its default so the on-screen keyboard works as usual.
    if (event.key !== 'Tab' && !typing) event.preventDefault();

    const info = describeKey(event);
    setCurrent(info);
    const entry = { id: nextId.current++, info };
    setHistory((existing) => pushHistory(existing, entry));
  }, []);

  const clear = () => {
    setCurrent(null);
    setHistory([]);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            Press a key
          </CardTitle>
          <CardDescription>
            Click the box below (or Tab to it), then press any key or combination.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- this area exists to capture the key presses made while it has focus */}
          <div
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the capture area has to take focus to receive key presses
            tabIndex={0}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a focusable key capture area, not a group of form controls
            role="group"
            aria-label="Key capture area"
            data-testid="keycode-capture"
            onKeyDown={(event) => record(event, false)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={cn(
              'flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center outline-none transition-colors sm:p-8',
              'focus-visible:ring-2 focus-visible:ring-ring',
              focused ? 'border-primary bg-primary/5' : 'border-input bg-muted/30'
            )}
          >
            {current ? (
              <>
                <div
                  className="font-mono text-4xl font-bold sm:text-6xl"
                  data-testid="keycode-label"
                >
                  {current.label}
                </div>
                <div className="text-sm text-muted-foreground">
                  keyCode{' '}
                  <span className="font-mono font-semibold text-foreground">{current.keyCode}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {focused ? 'Listening. Press any key.' : 'Click here, then press any key.'}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {focused
                ? 'Shortcuts such as Ctrl+K and Alt+C are paused while this box has focus. Press Tab to leave.'
                : 'This box needs focus to hear the keys.'}
            </p>
          </div>

          {coarsePointer && (
            <div className="space-y-1.5">
              <label htmlFor="keycode-touch-input" className="text-sm font-medium">
                On a touch screen? Tap here to open the on-screen keyboard
              </label>
              <Input
                id="keycode-touch-input"
                value=""
                onChange={() => undefined}
                onKeyDown={(event) => record(event, true)}
                placeholder="Tap and type"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Many on-screen keyboards report every key as keyCode 229 and key
                &quot;Unidentified&quot;.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {current && (
        <Card>
          <CardHeader>
            <CardTitle>Event details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl
              className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="keycode-details"
            >
              <Value label="event.key" value={JSON.stringify(current.key)} />
              <Value label="event.code" value={JSON.stringify(current.code)} />
              <Value label="event.keyCode (deprecated)" value={String(current.keyCode)} />
              <Value label="event.which (deprecated)" value={String(current.which)} />
              <Value
                label="event.location"
                value={`${current.location} (${current.locationName})`}
              />
              <Value
                label="Character"
                value={
                  current.character === null
                    ? 'none'
                    : current.character === ' '
                      ? '(space)'
                      : current.character
                }
                mono={current.character !== null}
              />
            </dl>

            <div className="flex flex-wrap items-center gap-2" aria-label="Modifier keys">
              {(
                [
                  ['Ctrl', current.ctrl],
                  ['Alt', current.alt],
                  ['Shift', current.shift],
                  ['Meta', current.meta],
                  ['Repeat', current.repeat],
                ] as const
              ).map(([name, on]) => (
                <Badge
                  key={name}
                  variant={on ? 'default' : 'outline'}
                  className={on ? undefined : 'text-muted-foreground'}
                >
                  {name}: {on ? 'true' : 'false'}
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <CopyValueButton text={keyInfoText(current)} label="Copy details" showLabel />
              <CopyValueButton text={current.code} label="Copy code" showLabel />
              <Button type="button" variant="outline" size="sm" onClick={clear}>
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent keys</CardTitle>
          <CardDescription>The last 10 key presses, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground sm:py-6">
              No keys yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm" aria-label="Recent keys">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      key
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      code
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      keyCode
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Modifiers
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map(({ id, info: entry }) => (
                    <tr key={id}>
                      <td className="px-3 py-1.5 font-mono">{entry.label}</td>
                      <td className="px-3 py-1.5 font-mono">{entry.code || '-'}</td>
                      <td className="px-3 py-1.5 font-mono">{entry.keyCode}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {entry.modifiers.join('+') || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
