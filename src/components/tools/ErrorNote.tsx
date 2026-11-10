import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

/** An alert box for an error that belongs to the whole tool rather than one field. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
