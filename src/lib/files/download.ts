/**
 * File download: hand the user something a tool produced, under a file name.
 *
 * Saving always goes through one hidden link, and every object URL created
 * here is revoked again, so tools never touch `URL.createObjectURL` or build
 * anchors themselves. The size label and the file-name helpers are pure and
 * run in Node; only the `download*` functions need a browser.
 */

// ── Size label ────────────────────────────────────────────────────────────────

const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB'] as const;

export type ByteUnit = (typeof BYTE_UNITS)[number];

export interface FormatBytesOptions {
  /**
   * Digits after the decimal point for KB and above (whole bytes never get
   * any). One number for every unit, or a per-unit map whose missing units
   * fall back to 2. Default 2.
   */
  decimals?: number | Partial<Record<ByteUnit, number>>;
  /** Keep trailing zeros ("1.50 KB") instead of trimming them ("1.5 KB"). Default false. */
  fixed?: boolean;
  /** How whole bytes are labelled: "512 Bytes" (default) or "512 B". */
  byteUnit?: 'Bytes' | 'B';
}

/**
 * Human-readable size: `0 Bytes`, `1023 Bytes`, `1 KB`, `1.5 KB`, `2.25 MB`.
 *
 * The default is the format most tools already showed. The options exist so a
 * tool whose sizes read differently ("1.50 KB", "512 B") keeps its text.
 * Anything that is not a positive finite number is shown as zero.
 */
export function formatBytes(bytes: number, options: FormatBytesOptions = {}): string {
  const { decimals = 2, fixed = false, byteUnit = 'Bytes' } = options;
  let value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;

  if (value < 1024) {
    const whole = Math.round(value);
    return `${whole} ${byteUnit === 'Bytes' && whole === 1 ? 'Byte' : byteUnit}`;
  }

  let unitIndex = -1;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const unit = BYTE_UNITS[unitIndex];
  const digits = typeof decimals === 'number' ? decimals : (decimals[unit] ?? 2);
  const text = value.toFixed(digits);
  return `${fixed ? text : String(parseFloat(text))} ${unit}`;
}

// ── File names ────────────────────────────────────────────────────────────────

/**
 * Splits a file name at its last dot: `photo.final.JPG` gives
 * `{ base: 'photo.final', extension: 'JPG' }`. A name with no dot, or only a
 * leading one (`.gitignore`), has no extension.
 */
export function splitFileName(fileName: string): { base: string; extension: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return { base: fileName, extension: '' };
  return { base: fileName.slice(0, dot), extension: fileName.slice(dot + 1) };
}

export interface OutputFileNameOptions {
  /** Extension of the result, with or without the dot. Omit to keep the input's; pass '' to drop it. */
  extension?: string;
  /** Put in front of the base name, for example `edited-`. */
  prefix?: string;
  /** Put after the base name, before the extension, for example `-clean`. */
  suffix?: string;
}

/**
 * Names an output file after the file it was made from:
 * `outputFileName('scan.pdf', { extension: 'docx' })` gives `scan.docx`, and
 * `outputFileName('photo.jpg', { suffix: '-clean', extension: 'png' })` gives
 * `photo-clean.png`.
 *
 * The input has to be a real file name. Free text such as a document title
 * may contain dots that are not an extension; run that through
 * `sanitizeFileName` and append the extension yourself.
 */
export function outputFileName(inputName: string, options: OutputFileNameOptions = {}): string {
  const { base, extension: inputExtension } = splitFileName(inputName);
  const extension = (options.extension ?? inputExtension).replace(/^\.+/, '');
  const stem = `${options.prefix ?? ''}${base || 'file'}${options.suffix ?? ''}`;
  return extension ? `${stem}.${extension}` : stem;
}

/**
 * Makes free text safe to use as a file name: characters no file system
 * accepts (`\ / : * ? " < > |` and control characters) become spaces, runs of
 * whitespace collapse, and the result is trimmed. Returns `fallback` when
 * nothing is left.
 */
export function sanitizeFileName(name: string, fallback = 'download'): string {
  const cleaned = Array.from(name, (char) =>
    char.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(char) ? ' ' : char
  )
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

// ── Saving ────────────────────────────────────────────────────────────────────

/**
 * How long a download's object URL stays alive after the click. Revoking it
 * straight away can cancel a large download that the browser has not started
 * reading yet, so the URL is released a little later instead.
 */
const REVOKE_DELAY_MS = 40_000;

function clickDownloadLink(href: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  link.style.display = 'none';
  // Some browsers ignore a click on a link that is not in the document.
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Saves a Blob (or File) under `fileName`. The object URL is revoked afterwards. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    clickDownloadLink(url, fileName);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}

/** Saves a string as a file. `mimeType` defaults to `text/plain`. */
export function downloadText(text: string, fileName: string, mimeType = 'text/plain'): void {
  downloadBlob(new Blob([text], { type: mimeType }), fileName);
}

/** Saves raw bytes (a typed array or an ArrayBuffer) as a file. */
export function downloadBytes(
  bytes: ArrayBuffer | ArrayBufferView,
  fileName: string,
  mimeType = 'application/octet-stream'
): void {
  downloadBlob(new Blob([bytes as BlobPart], { type: mimeType }), fileName);
}

/** Saves a `data:` URL, for example the result of `canvas.toDataURL()`. */
export function downloadDataUrl(dataUrl: string, fileName: string): void {
  clickDownloadLink(dataUrl, fileName);
}
