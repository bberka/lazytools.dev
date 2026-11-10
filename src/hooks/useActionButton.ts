import { useState, useCallback, useEffect, useRef } from 'react';

type ActionStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseActionButtonReturn {
  executeAction: (action: () => Promise<void> | void) => Promise<void>;
  status: ActionStatus;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  reset: () => void;
}

/** Runs an action while tracking loading, success and error, going back to idle after `resetDelay` ms. */
export function useActionButton(resetDelay = 2000): UseActionButtonReturn {
  const [status, setStatus] = useState<ActionStatus>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const executeAction = useCallback(
    async (action: () => Promise<void> | void) => {
      // A reset still pending from an earlier run must not cut this one short.
      clearTimeout(resetTimer.current);
      setStatus('loading');

      try {
        await action();
        setStatus('success');
      } catch (error) {
        console.error('Action failed:', error);
        setStatus('error');
      }

      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => {
        setStatus('idle');
      }, resetDelay);
    },
    [resetDelay]
  );

  const reset = useCallback(() => {
    clearTimeout(resetTimer.current);
    setStatus('idle');
  }, []);

  return {
    executeAction,
    status,
    isLoading: status === 'loading',
    isSuccess: status === 'success',
    isError: status === 'error',
    reset,
  };
}
