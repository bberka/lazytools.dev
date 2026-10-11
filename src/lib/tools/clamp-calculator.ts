/**
 * CSS clamp() calculator: turns a size at a small viewport and a size at a
 * large viewport into a fluid `clamp(min, preferred, max)` value, in the forms
 * people paste (bare function, CSS rule, Tailwind class, Sass variable), and
 * answers what that value computes to at any viewport width.
 *
 * The preferred value is the straight line through the two (viewport, size)
 * points, written as `intercept + slope * 1vw`. All inputs are the text the
 * user typed; nothing here touches the DOM.
 */

export type ClampUnit = 'px' | 'rem';

export interface ClampInput {
  minSize: string;
  minSizeUnit: ClampUnit;
  maxSize: string;
  maxSizeUnit: ClampUnit;
  minViewport: string;
  minViewportUnit: ClampUnit;
  maxViewport: string;
  maxViewportUnit: ClampUnit;
  /** Root font size in px used for rem conversions; blank means 16. */
  baseFontSize: string;
  /** CSS property the value is for; blank means `--fluid-prop`. */
  property: string;
  outputUnit: ClampUnit;
}

export interface ClampCalculation {
  /** Why nothing could be calculated, or an empty string. */
  error: string;
  property: string;
  /** `clamp(1rem, 0.6364rem + 1.8182vw, 2rem)` */
  clamp: string;
  /** `font-size: clamp(...);` */
  css: string;
  /** `text-[clamp(...)]`, or `[property:clamp(...)]` for other properties. */
  tailwind: string;
  /** `$font-size-fluid: clamp(...);` */
  scss: string;
  basePx: number;
  minSizePx: number;
  maxSizePx: number;
  minViewportPx: number;
  maxViewportPx: number;
}

export interface ClampChart {
  /** Viewport range the chart covers, in px. */
  xMin: number;
  xMax: number;
  /** Size range the chart covers, in px. */
  yMin: number;
  yMax: number;
  /** The two ends of the fluid range, narrower viewport first. */
  from: { viewport: number; size: number };
  to: { viewport: number; size: number };
}

const DEFAULT_BASE_PX = 16;
const DEFAULT_PROPERTY = '--fluid-prop';

/** Properties that have a Tailwind utility taking an arbitrary value. */
const TAILWIND_UTILITIES = new Map([
  ['font-size', 'text'],
  ['padding', 'p'],
  ['margin', 'm'],
  ['width', 'w'],
  ['height', 'h'],
  ['gap', 'gap'],
]);

/**
 * Reads a plain decimal number. A comma is taken as the decimal separator,
 * which is what many phone keyboards offer; text with anything left over
 * ("16px", "1e3", "1.2.3") is `NaN` rather than a silently shortened number.
 */
export function parseDecimal(text: string): number {
  const normalized = text.trim().replace(',', '.');
  return /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized) ? Number(normalized) : NaN;
}

/** Rounds to `decimals` places without the usual binary-fraction misses. */
export function roundTo(value: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function toPx(value: number, unit: ClampUnit, basePx: number): number {
  return unit === 'rem' ? value * basePx : value;
}

/** The middle argument of clamp(): `intercept + slope`, simplified where a term is zero. */
function preferredValue(intercept: number, slopeVw: number, unit: ClampUnit): string {
  const constant = roundTo(intercept);
  const slope = roundTo(slopeVw);

  if (slope === 0) return constant === 0 ? `0${unit}` : `${constant}${unit}`;
  if (constant === 0) return `${slope}vw`;
  if (slope < 0) return `${constant}${unit} - ${Math.abs(slope)}vw`;
  if (constant < 0) return `${slope}vw - ${Math.abs(constant)}${unit}`;
  return `${constant}${unit} + ${slope}vw`;
}

function failure(error: string, property: string): ClampCalculation {
  return {
    error,
    property,
    clamp: '',
    css: '',
    tailwind: '',
    scss: '',
    basePx: DEFAULT_BASE_PX,
    minSizePx: 0,
    maxSizePx: 0,
    minViewportPx: 0,
    maxViewportPx: 0,
  };
}

/** Builds the clamp() value and its ready-to-paste forms, or says what is missing. */
export function calculateClamp(input: ClampInput): ClampCalculation {
  const property = input.property.trim() || DEFAULT_PROPERTY;

  const minSize = parseDecimal(input.minSize);
  const maxSize = parseDecimal(input.maxSize);
  const minViewport = parseDecimal(input.minViewport);
  const maxViewport = parseDecimal(input.maxViewport);

  if ([minSize, maxSize, minViewport, maxViewport].some(Number.isNaN)) {
    return failure('Please enter valid numbers in all fields to compute.', property);
  }

  const basePx = input.baseFontSize.trim() ? parseDecimal(input.baseFontSize) : DEFAULT_BASE_PX;
  if (!(basePx > 0)) {
    return failure('Base font size must be a number above zero.', property);
  }

  const minSizePx = toPx(minSize, input.minSizeUnit, basePx);
  const maxSizePx = toPx(maxSize, input.maxSizeUnit, basePx);
  const minViewportPx = toPx(minViewport, input.minViewportUnit, basePx);
  const maxViewportPx = toPx(maxViewport, input.maxViewportUnit, basePx);

  if (minViewportPx < 0 || maxViewportPx < 0) {
    return failure('Viewport widths cannot be negative.', property);
  }
  if (minViewportPx === maxViewportPx) {
    return failure('Min and Max viewports cannot be equal.', property);
  }

  // Size per px of viewport, then the size the line would have at a 0px viewport.
  const slope = (maxSizePx - minSizePx) / (maxViewportPx - minViewportPx);
  const interceptPx = minSizePx - slope * minViewportPx;

  const scale = input.outputUnit === 'rem' ? basePx : 1;
  const lower = roundTo(Math.min(minSizePx, maxSizePx) / scale);
  const upper = roundTo(Math.max(minSizePx, maxSizePx) / scale);
  const preferred = preferredValue(interceptPx / scale, slope * 100, input.outputUnit);
  const clamp = `clamp(${lower}${input.outputUnit}, ${preferred}, ${upper}${input.outputUnit})`;

  // Tailwind arbitrary values cannot contain spaces.
  const compact = clamp.replace(/\s+/g, '');
  const utility = TAILWIND_UTILITIES.get(property);

  return {
    error: '',
    property,
    clamp,
    css: `${property}: ${clamp};`,
    tailwind: utility ? `${utility}-[${compact}]` : `[${property}:${compact}]`,
    scss: `$${property.replace(/[^a-zA-Z0-9-]/g, '')}-fluid: ${clamp};`,
    basePx,
    minSizePx,
    maxSizePx,
    minViewportPx,
    maxViewportPx,
  };
}

/** What the clamp() value computes to at a viewport width, or `null` without a calculation. */
export function sizeAtViewport(
  calculation: ClampCalculation,
  viewportPx: number
): { px: number; rem: number } | null {
  if (calculation.error) return null;

  const { minSizePx, maxSizePx, minViewportPx, maxViewportPx, basePx } = calculation;
  const linear =
    minSizePx +
    ((viewportPx - minViewportPx) / (maxViewportPx - minViewportPx)) * (maxSizePx - minSizePx);
  const px = Math.max(Math.min(minSizePx, maxSizePx), Math.min(Math.max(minSizePx, maxSizePx), linear));

  return { px: roundTo(px, 2), rem: roundTo(px / basePx, 3) };
}

/**
 * The area a chart of the calculation should cover: the fluid range plus a
 * quarter of its width and height on each side. The two ends are ordered by
 * viewport, so the line runs left to right even when the fields were filled
 * in the other way round.
 */
export function clampChart(calculation: ClampCalculation): ClampChart | null {
  if (calculation.error) return null;

  const ends = [
    { viewport: calculation.minViewportPx, size: calculation.minSizePx },
    { viewport: calculation.maxViewportPx, size: calculation.maxSizePx },
  ].sort((a, b) => a.viewport - b.viewport);
  const [from, to] = ends;

  const xPadding = (to.viewport - from.viewport) * 0.25;
  const smallest = Math.min(from.size, to.size);
  const largest = Math.max(from.size, to.size);
  const yPadding = (largest - smallest || 10) * 0.25;

  return {
    xMin: Math.max(0, from.viewport - xPadding),
    xMax: to.viewport + xPadding,
    // Sizes are normally positive and the axis stops at zero; negative ones get room below.
    yMin: smallest < 0 ? smallest - yPadding : Math.max(0, smallest - yPadding),
    yMax: largest + yPadding,
    from,
    to,
  };
}
