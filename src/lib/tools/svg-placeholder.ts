/**
 * Builds a placeholder image as SVG: a coloured rectangle with a centred
 * label, usually its own size ("600 x 400"). The SVG is also offered as a
 * percent-encoded data URI and as CSS and HTML snippets. All text that goes
 * into the markup is XML-escaped. Nothing here touches the DOM, so it runs in
 * Node.
 */

import { normalizeHexColor } from '@/lib/tools/design-color';

// ── Types and limits ──────────────────────────────────────────────────────────

export interface PlaceholderConfig {
  width: number;
  height: number;
  /** `#RRGGBB`. */
  background: string;
  /** `#RRGGBB`. */
  textColor: string;
  /** The label. Blank means the size, "600 x 400". */
  text: string;
  showText: boolean;
  /** Pixels, or `'auto'` to fit the label inside the image. */
  fontSize: number | 'auto';
  /** Corner radius in pixels; larger than half the shorter side is clamped. */
  radius: number;
}

const PLACEHOLDER_LIMITS = {
  minSize: 1,
  maxSize: 5000,
  maxFontSize: 1000,
  maxTextLength: 100,
} as const;

export const DEFAULT_PLACEHOLDER = {
  width: 600,
  height: 400,
  background: '#CCCCCC',
  textColor: '#666666',
} as const;

export const SIZE_PRESETS: ReadonlyArray<{ width: number; height: number; label: string }> = [
  { width: 150, height: 150, label: 'Avatar' },
  { width: 300, height: 200, label: 'Thumbnail' },
  { width: 600, height: 400, label: 'Card' },
  { width: 1200, height: 630, label: 'Social card' },
  { width: 1280, height: 720, label: 'HD' },
  { width: 1920, height: 1080, label: 'Full HD' },
];

const FONT_FAMILY = 'Arial, Helvetica, sans-serif';

// ── Escaping and encoding ─────────────────────────────────────────────────────

// Characters XML 1.0 forbids: most control characters and the two non-characters.
const XML_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Escapes text for use in XML element content or a quoted attribute. */
export function escapeXml(text: string): string {
  return text
    .replace(XML_FORBIDDEN, '')
    .replace(LONE_SURROGATE, '�')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** One line of plain text: runs of whitespace (including newlines) become a single space. */
export function singleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Turns SVG markup into a `data:image/svg+xml,` URI. Everything outside the
 * unreserved characters is percent-encoded, including the `! ' ( ) *` that
 * `encodeURIComponent` leaves alone, so the URI is safe inside an HTML
 * attribute, a CSS `url("...")` and a plain URL alike.
 */
export function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg.replace(LONE_SURROGATE, '�')).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `data:image/svg+xml,${encoded}`;
}

// ── Building ──────────────────────────────────────────────────────────────────

/** The label shown when the text field is blank. */
export function defaultLabel(width: number, height: number): string {
  return `${width} x ${height}`;
}

/** The label that ends up in the image. */
export function resolveLabel(config: Pick<PlaceholderConfig, 'text' | 'width' | 'height'>): string {
  return singleLine(config.text) || defaultLabel(config.width, config.height);
}

/**
 * The font size that makes the label fill about 80% of the width without
 * growing past a quarter of the height, assuming a glyph is about 0.6 em wide.
 * Never below 8px.
 */
export function autoFontSize(width: number, height: number, label: string): number {
  const length = Math.max(1, Array.from(label).length);
  const byWidth = (width * 0.8) / (length * 0.6);
  const byHeight = height * 0.25;
  return Math.max(8, Math.floor(Math.min(byWidth, byHeight)));
}

/** Largest useful corner radius: half of the shorter side. */
export function maxRadius(width: number, height: number): number {
  return Math.floor(Math.min(width, height) / 2);
}

export function effectiveFontSize(config: PlaceholderConfig): number {
  return config.fontSize === 'auto'
    ? autoFontSize(config.width, config.height, resolveLabel(config))
    : config.fontSize;
}

/** The SVG markup for a placeholder. */
export function buildPlaceholderSvg(config: PlaceholderConfig): string {
  const { width, height } = config;
  const background = (
    normalizeHexColor(config.background) ?? DEFAULT_PLACEHOLDER.background
  ).toLowerCase();
  const textColor = (
    normalizeHexColor(config.textColor) ?? DEFAULT_PLACEHOLDER.textColor
  ).toLowerCase();
  const radius = Math.min(Math.max(0, config.radius), maxRadius(width, height));
  const label = escapeXml(resolveLabel(config));

  const rect = `<rect width="${width}" height="${height}"${radius > 0 ? ` rx="${radius}"` : ''} fill="${background}"/>`;
  const text = config.showText
    ? `<text x="50%" y="50%" fill="${textColor}" font-family="${FONT_FAMILY}" font-size="${effectiveFontSize(config)}" text-anchor="middle" dominant-baseline="central">${label}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">${rect}${text}</svg>`;
}

export interface PlaceholderOutputs {
  svg: string;
  dataUri: string;
  css: string;
  html: string;
}

/** The SVG plus its data URI, a CSS rule and an HTML image tag. */
export function buildPlaceholderOutputs(config: PlaceholderConfig): PlaceholderOutputs {
  const svg = buildPlaceholderSvg(config);
  const dataUri = svgToDataUri(svg);
  const { width, height } = config;
  return {
    svg,
    dataUri,
    css: [
      '.placeholder {',
      `  width: ${width}px;`,
      `  height: ${height}px;`,
      `  background: url("${dataUri}") center / cover no-repeat;`,
      '}',
    ].join('\n'),
    html: `<img src="${dataUri}" width="${width}" height="${height}" alt="${escapeXml(resolveLabel(config))}">`,
  };
}

/** File name for the download, such as `placeholder-600x400.svg`. */
export function placeholderFileName(width: number, height: number): string {
  return `placeholder-${width}x${height}.svg`;
}

// ── Reading the form ──────────────────────────────────────────────────────────

export type PlaceholderField = 'width' | 'height' | 'fontSize' | 'radius' | 'text';
export type PlaceholderFieldErrors = Partial<Record<PlaceholderField, string>>;

/** The form as typed. */
export interface PlaceholderFields {
  width: string;
  height: string;
  background: string;
  textColor: string;
  text: string;
  showText: boolean;
  autoFont: boolean;
  fontSize: string;
  radius: string;
}

export type PlaceholderOutcome =
  | { status: 'invalid'; errors: PlaceholderFieldErrors }
  | { status: 'ready'; config: PlaceholderConfig; outputs: PlaceholderOutputs };

function readWhole(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** Validates the form and builds the placeholder. */
export function evaluatePlaceholder(fields: PlaceholderFields): PlaceholderOutcome {
  const errors: PlaceholderFieldErrors = {};
  const { minSize, maxSize, maxFontSize, maxTextLength } = PLACEHOLDER_LIMITS;

  const sizeError = (name: string) =>
    `${name} must be a whole number from ${minSize} to ${maxSize}.`;
  const width = readWhole(fields.width);
  const height = readWhole(fields.height);
  if (width === null || width < minSize || width > maxSize) errors.width = sizeError('Width');
  if (height === null || height < minSize || height > maxSize) errors.height = sizeError('Height');

  let fontSize: number | 'auto' = 'auto';
  if (!fields.autoFont) {
    const parsed = readWhole(fields.fontSize);
    if (parsed === null || parsed < 1 || parsed > maxFontSize) {
      errors.fontSize = `Font size must be a whole number from 1 to ${maxFontSize}.`;
    } else {
      fontSize = parsed;
    }
  }

  const radius = fields.radius.trim() === '' ? 0 : readWhole(fields.radius);
  if (radius === null) errors.radius = 'Corner radius must be a whole number of pixels, 0 or more.';

  if (Array.from(fields.text).length > maxTextLength) {
    errors.text = `Text can be at most ${maxTextLength} characters.`;
  }

  if (Object.keys(errors).length > 0 || width === null || height === null || radius === null) {
    return { status: 'invalid', errors };
  }

  const config: PlaceholderConfig = {
    width,
    height,
    background: normalizeHexColor(fields.background) ?? DEFAULT_PLACEHOLDER.background,
    textColor: normalizeHexColor(fields.textColor) ?? DEFAULT_PLACEHOLDER.textColor,
    text: fields.text,
    showText: fields.showText,
    fontSize,
    radius: Math.min(radius, maxRadius(width, height)),
  };
  return { status: 'ready', config, outputs: buildPlaceholderOutputs(config) };
}
