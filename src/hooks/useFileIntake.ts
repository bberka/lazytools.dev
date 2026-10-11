import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from 'react';
import { validateFiles, type FileRejection, type FileRules } from '@/lib/files';

export interface FileIntakeOptions extends FileRules {
  /** Called with the files that passed validation. Never called with an empty list. */
  onFiles: (files: File[]) => void;
  /** Take every picked or dropped file. Without it only the first one is used. */
  multiple?: boolean;
  /** Called with the files that failed validation, for tools that report them their own way. */
  onReject?: (rejections: FileRejection<File>[]) => void;
}

export interface FileIntake {
  /** Spread onto the hidden `<input>` that backs the picker. */
  inputProps: {
    ref: RefObject<HTMLInputElement | null>;
    type: 'file';
    accept: string | undefined;
    multiple: boolean;
    className: string;
    tabIndex: number;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onClick: (event: MouseEvent<HTMLInputElement>) => void;
  };
  /**
   * Spread onto the element files are dropped on. It becomes a keyboard
   * operable button: click, Enter or Space opens the picker.
   */
  dropzoneProps: {
    role: 'button';
    tabIndex: number;
    onClick: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
  };
  /** True while something is being dragged over the drop target. */
  isDragging: boolean;
  /** Why the last pick or drop was (partly) refused, or null. Cleared by the next one. */
  error: string | null;
  /** Opens the file picker. */
  open: () => void;
  /** Clears the error and the drag state. */
  reset: () => void;
}

/**
 * Everything a tool needs to take files from the user: a picker behind a
 * hidden input, drag-and-drop with drag state, and type and size validation.
 *
 * `accept` and `maxSize` are enforced for picked and dropped files alike, with
 * one exception: a picked file for which the browser reports no MIME type
 * (no extension, or a format the system does not know) is let through, since
 * the user chose it on purpose and the tool's own decoding reports a bad file.
 *
 * Render `<FileDropzone intake={intake} />` for the standard drop area, or
 * spread `dropzoneProps` and `inputProps` onto your own markup. A plain upload
 * button only needs `inputProps` and `open`.
 */
export function useFileIntake(options: FileIntakeOptions): FileIntake {
  const { onFiles, onReject, accept, maxSize, multiple = false } = options;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = (files: File[], source: 'picker' | 'drop') => {
    const candidates = multiple ? files : files.slice(0, 1);
    if (candidates.length === 0) return;

    const result = validateFiles(candidates, { accept, maxSize });
    const rejected =
      source === 'picker'
        ? result.rejected.filter((rejection) => rejection.reason !== 'type' || rejection.file.type !== '')
        : result.rejected;
    const accepted = candidates.filter((file) => !rejected.some((rejection) => rejection.file === file));

    setError(rejected.length === result.rejected.length ? result.error : (rejected[0]?.message ?? null));
    if (rejected.length > 0) onReject?.(rejected);
    if (accepted.length > 0) onFiles(accepted);
  };

  const open = () => inputRef.current?.click();

  return {
    inputProps: {
      ref: inputRef,
      type: 'file',
      accept,
      multiple,
      className: 'hidden',
      tabIndex: -1,
      onChange: (event) => {
        const files = Array.from(event.target.files ?? []);
        // Empty the input so choosing the same file again still fires a change.
        event.target.value = '';
        take(files, 'picker');
      },
      // The input usually sits inside the drop target; its click must not
      // bubble up and open the picker a second time.
      onClick: (event) => event.stopPropagation(),
    },
    dropzoneProps: {
      role: 'button',
      tabIndex: 0,
      onClick: open,
      onKeyDown: (event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      },
      onDragOver: (event) => {
        event.preventDefault();
        setIsDragging(true);
      },
      onDragLeave: (event) => {
        // Moving onto a child of the drop target is not leaving it.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsDragging(false);
      },
      onDrop: (event) => {
        event.preventDefault();
        setIsDragging(false);
        take(Array.from(event.dataTransfer.files), 'drop');
      },
    },
    isDragging,
    error,
    open,
    reset: () => {
      if (inputRef.current) inputRef.current.value = '';
      setIsDragging(false);
      setError(null);
    },
  };
}
