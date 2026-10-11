import { useState, useCallback, useEffect, useRef } from 'react';

export type ActionStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseActionButtonReturn {
  executeAction: (action: () => Promise<void> | void) => Promise<void>;
  status: ActionStatus;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  reset: () => void;
}

/**
 * Hook for managing button action states with loading and feedback
 * @param resetDelay - Time in ms before resetting to idle state (default: 2000)
 */
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

      // Reset status after delay
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
