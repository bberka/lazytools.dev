'use client';

import { useId, type ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileIntake } from '@/hooks/useFileIntake';

export interface FileDropzoneProps {
  /** The intake from `useFileIntake`; it supplies the picker, the drop handling and the error. */
  intake: FileIntake;
  /** Main line of text. Also the accessible name of the drop area. */
  label: string;
  /** Smaller line under the label. */
  hint?: string;
  /** Shown as a chip inside the drop area, usually the chosen file's name and size. */
  selected?: ReactNode;
  className?: string;
}

/**
 * The standard drop area: click, press Enter or Space, or drop files on it.
 * A file the intake refuses is reported inside the area.
 */
export function FileDropzone({ intake, label, hint, selected, className }: FileDropzoneProps) {
  const labelId = useId();
  const detailsId = useId();

  return (
    <div
      {...intake.dropzoneProps}
      aria-labelledby={labelId}
      aria-describedby={detailsId}
      className={cn(
        'cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-8',
        intake.isDragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
        className
      )}
    >
      <input {...intake.inputProps} aria-label={label} />
      <Upload aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
      <p id={labelId} className="text-sm font-semibold">
        {label}
      </p>
      <div id={detailsId}>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        {intake.error && (
          <p role="alert" className="mt-2 text-xs font-medium text-destructive">
            {intake.error}
          </p>
        )}
        {selected && (
          <div
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            onClick={(event) => event.stopPropagation()}
          >
            {selected}
          </div>
        )}
      </div>
    </div>
  );
}
