'use client';

import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks';
import { cn } from '@/lib/utils';

interface CopyValueButtonProps {
  text: string;
  /** Accessible name; also the visible text when `showLabel` is set. */
  label: string;
  showLabel?: boolean;
  className?: string;
}

/** A copy button that shows a check mark for a moment after a successful copy. */
export function CopyValueButton({
  text,
  label,
  showLabel = false,
  className,
}: CopyValueButtonProps) {
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  return (
    <Button
      type="button"
      variant={showLabel ? 'outline' : 'ghost'}
      size={showLabel ? 'sm' : 'icon'}
      className={showLabel ? className : cn('h-8 w-8 shrink-0', className)}
      onClick={() => void copyToClipboard(text)}
      aria-label={showLabel ? undefined : label}
      disabled={!text}
    >
      {isCopied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
      {showLabel && (isCopied ? 'Copied' : label)}
    </Button>
  );
}
