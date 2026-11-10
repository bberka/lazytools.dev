import { AlertCircle } from 'lucide-react';

/** The message under a field whose value cannot be used; renders nothing without one. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <div id={id} role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
