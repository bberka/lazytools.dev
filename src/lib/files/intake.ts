/**
 * File intake: decide whether a file the user picked or dropped is acceptable,
 * and read it.
 *
 * Validation is pure (it only looks at a file's name, type and size) and runs
 * in Node. The readers need a browser. Picking and drag-and-drop live in the
 * `useFileIntake` hook, which is built on this module.
 */

import { formatBytes } from './download';

// ── Validation ────────────────────────────────────────────────────────────────

/** The parts of a `File` that validation looks at. */
export interface FileLike {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export interface FileRules {
  /**
   * Accepted types, in the syntax of the HTML `accept` attribute: a
   * comma-separated list of extensions (`.pdf`), MIME types
   * (`application/pdf`) and MIME wildcards (`image/*`). A file passes when it
   * matches any entry. Omit to accept everything.
   */
  accept?: string;
  /** Largest accepted file, in bytes. Omit for no limit. */
  maxSize?: number;
}

export type FileRejectionReason = 'type' | 'size';

export interface FileRejection<T extends FileLike = FileLike> {
  file: T;
  reason: FileRejectionReason;
  /** A sentence that can be shown to the user as it is. */
  message: string;
}

export interface FileValidationResult<T extends FileLike = FileLike> {
  accepted: T[];
  rejected: FileRejection<T>[];
  /** One message covering every rejected file, or null when none was rejected. */
  error: string | null;
}

function parseAccept(accept: string | undefined): string[] {
  return (accept ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function matchesEntry(file: Pick<FileLike, 'name' | 'type'>, entry: string): boolean {
  if (entry === '*' || entry === '*/*') return true;
  if (entry.startsWith('.')) return file.name.toLowerCase().endsWith(entry);

  const type = file.type.split(';')[0].trim().toLowerCase();
  if (entry.endsWith('/*')) return type.startsWith(entry.slice(0, -1));
  return type === entry;
}

/** Whether a file matches an `accept` list. An empty list matches every file. */
export function matchesAccept(file: Pick<FileLike, 'name' | 'type'>, accept?: string): boolean {
  const entries = parseAccept(accept);
  return entries.length === 0 || entries.some((entry) => matchesEntry(file, entry));
}

function describeAccept(accept: string | undefined): string {
  const entries = parseAccept(accept);
  const wildcards = entries.filter((entry) => entry.endsWith('/*'));
  const extensions = entries.filter((entry) => entry.startsWith('.'));
  // Exact MIME types usually repeat what an extension already says, so they
  // are only spelled out when there is nothing friendlier to show.
  const shown =
    wildcards.length + extensions.length > 0
      ? [...wildcards.map((entry) => `${entry.slice(0, -2)} files`), ...extensions]
      : entries;
  return shown.join(', ');
}

/** Checks one file against the rules. Returns null when it passes. */
export function validateFile<T extends FileLike>(file: T, rules: FileRules = {}): FileRejection<T> | null {
  if (!matchesAccept(file, rules.accept)) {
    return {
      file,
      reason: 'type',
      message: `"${file.name}" is not a supported file type. Accepted: ${describeAccept(rules.accept)}.`,
    };
  }

  if (rules.maxSize !== undefined && file.size > rules.maxSize) {
    return {
      file,
      reason: 'size',
      message: `"${file.name}" is too large (${formatBytes(file.size)}). The limit is ${formatBytes(rules.maxSize)}.`,
    };
  }

  return null;
}

/** Sorts files into accepted and rejected, keeping their order. */
export function validateFiles<T extends FileLike>(
  files: readonly T[],
  rules: FileRules = {}
): FileValidationResult<T> {
  const accepted: T[] = [];
  const rejected: FileRejection<T>[] = [];

  for (const file of files) {
    const rejection = validateFile(file, rules);
    if (rejection) rejected.push(rejection);
    else accepted.push(file);
  }

  let error: string | null = null;
  if (rejected.length > 0) {
    const others = rejected.length - 1;
    error =
      others === 0
        ? rejected[0].message
        : `${rejected[0].message} ${others} more ${others === 1 ? 'file was' : 'files were'} skipped.`;
  }

  return { accepted, rejected, error };
}

// ── Reading ───────────────────────────────────────────────────────────────────

const READ_ERROR = 'Failed to read file';

// Keeps the browser's own explanation (file moved, permission lost) when it gives one.
function readError(cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : '';
  return new Error(detail ? `${READ_ERROR}: ${detail}` : READ_ERROR, { cause });
}

function readWithFileReader(file: Blob, method: 'readAsText' | 'readAsDataURL'): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error(READ_ERROR));
    };
    reader.onerror = () => reject(readError(reader.error));
    reader[method](file);
  });
}

/**
 * The file's contents as text. Decoded as UTF-8 unless the file starts with a
 * byte-order mark that says otherwise, which `Blob.text()` would not honour.
 */
export function readFileAsText(file: Blob): Promise<string> {
  return readWithFileReader(file, 'readAsText');
}

/** The file as a `data:<type>;base64,...` URL. Needs no cleanup, unlike an object URL. */
export function readFileAsDataUrl(file: Blob): Promise<string> {
  return readWithFileReader(file, 'readAsDataURL');
}

/** The file's raw bytes. */
export async function readFileAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer();
  } catch (cause) {
    throw readError(cause);
  }
}

/**
 * Decodes an image from a Blob/File or from a URL (a `data:` URL included)
 * and resolves once it can be drawn. For a Blob the temporary object URL is
 * revoked as soon as the image has loaded or failed.
 */
export function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load the selected image.'));
    image.src = url;
  }).finally(() => {
    if (typeof source !== 'string') URL.revokeObjectURL(url);
  });
}

/** The pixel size of an image file, without keeping the decoded image. */
export async function readImageDimensions(source: Blob | string): Promise<{ width: number; height: number }> {
  const image = await loadImage(source);
  return { width: image.naturalWidth, height: image.naturalHeight };
}
