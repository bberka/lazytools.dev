'use client';

import type { Ref } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks';

interface CopyButtonProps extends Omit<ButtonProps, 'children' | 'asChild'> {
  /** Lets a tooltip or popover trigger wrap the button with `asChild`. */
  ref?: Ref<HTMLButtonElement>;
  /** What lands on the clipboard. Nothing is copied when it is empty. */
  text: string;
  /** Visible text while idle. Leave it out for an icon-only button and pass `aria-label`. */
  label?: string;
  /** Visible text for a moment after a successful copy. Ignored for an icon-only button. */
  copiedLabel?: string;
  /** Visible text after a refused write. Falls back to `label` when not set. */
  errorLabel?: string;
  /** Classes for the Check and Copy icons. */
  iconClassName?: string;
}

/**
 * A copy button that owns its clipboard state: it swaps to a filled variant, a check mark and
 * `copiedLabel` for a moment after a successful copy. `variant` is the idle variant.
 */
export function CopyButton({
  text,
  label,
  copiedLabel = 'Copied',
  errorLabel,
  iconClassName = 'mr-2 h-4 w-4',
  variant = 'outline',
  onClick,
  ...buttonProps
}: CopyButtonProps) {
  const { copyToClipboard, isCopied, isError } = useCopyToClipboard();
  const Icon = isCopied ? Check : Copy;
  const shown = isCopied ? copiedLabel : isError && errorLabel ? errorLabel : label;

  return (
    <Button
      {...buttonProps}
      variant={isCopied ? 'default' : variant}
      onClick={(event) => {
        onClick?.(event);
        void copyToClipboard(text);
      }}
    >
      <Icon className={iconClassName} />
      {label === undefined ? null : shown}
    </Button>
  );
}
