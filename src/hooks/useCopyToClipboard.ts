import { useState, useCallback, useEffect, useRef } from 'react';

export type CopyStatus = 'idle' | 'copying' | 'copied' | 'error';

export interface UseCopyToClipboardReturn {
  copyToClipboard: (text: string) => Promise<void>;
  status: CopyStatus;
  isCopied: boolean;
  isError: boolean;
}

/**
 * Hook for copying text to clipboard with visual feedback
 * @param resetDelay - Time in ms before resetting to idle state (default: 2000)
 */
export function useCopyToClipboard(resetDelay = 2000): UseCopyToClipboardReturn {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copyToClipboard = useCallback(
    async (text: string) => {
      if (!text) return;

      // A reset still pending from an earlier copy must not cut this one short.
      clearTimeout(resetTimer.current);
      setStatus('copying');

      try {
        await navigator.clipboard.writeText(text);
        setStatus('copied');
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
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

  return {
    copyToClipboard,
    status,
    isCopied: status === 'copied',
    isError: status === 'error',
  };
}
