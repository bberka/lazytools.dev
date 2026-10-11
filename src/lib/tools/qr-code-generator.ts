/**
 * The input side of the QR Code Generator: turns what the form holds into a
 * checked request for the `qrcode` library, or says what is wrong with it.
 * Drawing the code needs a canvas and stays in the component.
 */

export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrForm {
  content: string;
  /** Edge length in pixels, as typed. */
  size: string;
  /** Quiet zone in modules, as typed. */
  margin: string;
  /** `#RRGGBB`, as the colour picker gives it. */
  foregroundColor: string;
  /** `#RRGGBB`, or `none` for a transparent background. */
  backgroundColor: string;
  errorCorrectionLevel: QrErrorCorrectionLevel;
}

export interface QrRequest {
  /** The content to encode, trimmed. */
  text: string;
  /** Options in the shape `qrcode` takes. */
  options: {
    errorCorrectionLevel: QrErrorCorrectionLevel;
    margin: number;
    width: number;
    color: { dark: string; light: string };
  };
  /** Download name without extension, derived from the content. */
  fileBaseName: string;
}

export type QrRequestResult = { ok: true; request: QrRequest } | { ok: false; error: string };

export const QR_SIZE_MIN = 128;
export const QR_SIZE_MAX = 2048;
export const QR_MARGIN_MAX = 10;

const FILE_NAME_MAX = 60;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const TRANSPARENT = '#00000000';

/** A hex colour as eight lower-case digits (`#rrggbbaa`), or null when it is not one. */
function normalizeHexColor(value: string): string | null {
  if (!HEX_COLOR.test(value)) return null;

  let digits = value.slice(1).toLowerCase();
  if (digits.length <= 4) digits = Array.from(digits, (digit) => digit + digit).join('');
  return `#${digits.padEnd(8, 'f')}`;
}

/** A blank field is not a number, although `Number('')` is 0. */
function parseNumber(text: string): number {
  return text.trim() ? Number(text) : Number.NaN;
}

/**
 * A download name made from the content: lower-case letters and digits joined
 * by hyphens, cut to a length every file system takes. Content with nothing
 * usable (for example only non-Latin text) gives `qr-code`.
 */
export function qrFileBaseName(content: string): string {
  const normalized = content
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, FILE_NAME_MAX)
    .replace(/-+$/, '');

  return normalized || 'qr-code';
}

/** Checks the form and builds the request for `qrcode`. */
export function prepareQrRequest(form: QrForm): QrRequestResult {
  const text = form.content.trim();
  if (!text) return { ok: false, error: 'Enter text or a URL to generate a QR code.' };

  const size = parseNumber(form.size);
  if (!Number.isFinite(size) || size < QR_SIZE_MIN || size > QR_SIZE_MAX) {
    return { ok: false, error: `Size must be between ${QR_SIZE_MIN} and ${QR_SIZE_MAX} pixels.` };
  }

  const margin = parseNumber(form.margin);
  if (!Number.isFinite(margin) || margin < 0 || margin > QR_MARGIN_MAX) {
    return { ok: false, error: `Margin must be between 0 and ${QR_MARGIN_MAX}.` };
  }

  // Colours go to the library as typed; the normal form is only for comparing them.
  const dark = form.foregroundColor.trim();
  const light = form.backgroundColor.trim().toLowerCase() === 'none' ? TRANSPARENT : form.backgroundColor.trim();
  const darkValue = normalizeHexColor(dark);
  const lightValue = normalizeHexColor(light);

  if (!darkValue) return { ok: false, error: 'Choose a foreground color.' };
  if (!lightValue) return { ok: false, error: 'Choose a background color.' };
  if (darkValue === lightValue) {
    return { ok: false, error: 'Foreground and background colors must be different.' };
  }

  return {
    ok: true,
    request: {
      text,
      options: {
        errorCorrectionLevel: form.errorCorrectionLevel,
        margin,
        width: Math.round(size),
        color: { dark, light },
      },
      fileBaseName: qrFileBaseName(text),
    },
  };
}
