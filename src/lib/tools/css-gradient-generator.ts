// Logic for the CSS Gradient Generator: a typed gradient model, the CSS and
// Tailwind builders, and the pure edits the editor applies to the stop list.
// No React and no DOM, so it runs in Node under the unit tests.

export type GradientType = 'linear' | 'radial' | 'conic';
export type RadialShape = 'circle' | 'ellipse';

export interface ColorStop {
  /** Stable key for the editor row. It never appears in the output. */
  id: string;
  /** Hex colour: #rgb, #rgba, #rrggbb or #rrggbbaa. */
  color: string;
  /** Percentage along the gradient line, 0 to 100. */
  position: number;
}

export interface GradientModel {
  type: GradientType;
  repeating: boolean;
  /** Degrees, 0 to 360. The direction of a linear gradient or where a conic one starts. */
  angle: number;
  /** Radial gradients only. */
  shape: RadialShape;
  /** Centre of a radial or conic gradient, as a percentage of the box. */
  positionX: number;
  positionY: number;
  stops: ColorStop[];
}

export interface GradientPreset {
  id: string;
  name: string;
  model: GradientModel;
}

export const MIN_STOPS = 2;
export const MAX_STOPS = 10;

const FALLBACK_COLOR = '#000000';
const HEX_COLOR = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  // Adding zero turns -0 into 0.
  return Math.round(value * factor) / factor + 0;
}

function clampRange(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return roundTo(Math.min(max, Math.max(min, value)));
}

/** A position or stop offset: 0 to 100, two decimals, NaN becomes 0. */
export function clampPercent(value: number): number {
  return clampRange(value, 0, 100);
}

/** An angle in degrees: 0 to 360, two decimals, NaN becomes 0. */
export function clampAngle(value: number): number {
  return clampRange(value, 0, 360);
}

/** Prints at most two decimals and no trailing zeros: 12.5, 10, 0.3. */
export function formatNumber(value: number): string {
  return String(roundTo(value));
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/**
 * Returns a lower-case #rrggbb (or #rrggbbaa) colour. Short forms are
 * expanded, a missing # is added, and anything that is not a hex colour
 * becomes black so the output is never invalid CSS.
 */
export function normaliseColor(input: string): string {
  const match = HEX_COLOR.exec(typeof input === 'string' ? input.trim() : '');
  if (!match) return FALLBACK_COLOR;
  let hex = match[1].toLowerCase();
  if (hex.length <= 4) hex = hex.replace(/./g, (digit) => digit + digit);
  return `#${hex}`;
}

type Rgba = [number, number, number, number];

function parseColor(input: string): Rgba {
  const hex = normaliseColor(input).slice(1);
  const channel = (index: number) => parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return [channel(0), channel(1), channel(2), hex.length === 8 ? channel(3) : 255];
}

function toColor([r, g, b, a]: Rgba): string {
  const part = (value: number) => value.toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}${a === 255 ? '' : part(a)}`;
}

/** Blends two colours. `amount` 0 is `from`, 1 is `to`. */
export function mixColors(from: string, to: string, amount: number): string {
  const a = parseColor(from);
  const b = parseColor(to);
  const t = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
  const mixed = a.map((value, index) => Math.round(value + (b[index] - value) * t)) as Rgba;
  return toColor(mixed);
}

function hslToColor(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = s * Math.min(l, 1 - l);
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    return Math.round(255 * (l - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return toColor([channel(0), channel(8), channel(4), 255]);
}

// ---------------------------------------------------------------------------
// Stops
// ---------------------------------------------------------------------------

function sanitiseStop(stop: ColorStop): ColorStop {
  return { id: stop.id, color: normaliseColor(stop.color), position: clampPercent(stop.position) };
}

/** A copy of the list ordered by position. Stops at the same position keep their listed order. */
export function sortStopsByPosition(stops: ColorStop[]): ColorStop[] {
  return [...stops].sort((a, b) => clampPercent(a.position) - clampPercent(b.position));
}

// Clean, ordered stops with at least two entries, which is what CSS needs.
function resolveStops(stops: ColorStop[]): ColorStop[] {
  const clean = stops.map(sanitiseStop);
  if (clean.length === 0) return createDefaultModel().stops;
  if (clean.length === 1) {
    clean.push({ ...clean[0], id: `${clean[0].id}-end`, position: 100 });
  }
  return sortStopsByPosition(clean);
}

function nextStopId(stops: ColorStop[]): string {
  let highest = 0;
  for (const stop of stops) {
    const match = /^stop-(\d+)$/.exec(stop.id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `stop-${highest + 1}`;
}

/**
 * Adds a stop in the widest gap between two existing stops, halfway along,
 * coloured as a blend of its neighbours. The result is ordered by position.
 * At the maximum the list comes back unchanged.
 */
export function addStop(stops: ColorStop[]): ColorStop[] {
  if (stops.length >= MAX_STOPS) return stops;
  const sorted = resolveStops(stops);
  let widest = 0;
  let widestGap = -1;
  for (let index = 0; index < sorted.length - 1; index++) {
    const gap = sorted[index + 1].position - sorted[index].position;
    if (gap > widestGap) {
      widestGap = gap;
      widest = index;
    }
  }
  const before = sorted[widest];
  const after = sorted[widest + 1];
  const added: ColorStop = {
    id: nextStopId(sorted),
    color: mixColors(before.color, after.color, 0.5),
    position: clampPercent((before.position + after.position) / 2),
  };
  return [...sorted.slice(0, widest + 1), added, ...sorted.slice(widest + 1)];
}

/** Removes a stop, but never drops below the minimum of two. */
export function removeStop(stops: ColorStop[], id: string): ColorStop[] {
  if (stops.length <= MIN_STOPS || !stops.some((stop) => stop.id === id)) return stops;
  return stops.filter((stop) => stop.id !== id);
}

/**
 * Moves a stop one row up or down. The two rows trade positions as well as
 * places, so the colour really moves along the gradient: the stop that moves
 * up takes the earlier slot. For stops sharing a position this flips which
 * colour sits on each side of a hard edge.
 */
export function moveStop(stops: ColorStop[], id: string, direction: 'up' | 'down'): ColorStop[] {
  const index = stops.findIndex((stop) => stop.id === id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= stops.length) return stops;
  const next = [...stops];
  next[target] = { ...stops[index], position: stops[target].position };
  next[index] = { ...stops[target], position: stops[index].position };
  return next;
}

/** Changes the colour and/or position of one stop. Values are cleaned on the way in. */
export function updateStop(
  stops: ColorStop[],
  id: string,
  patch: Partial<Pick<ColorStop, 'color' | 'position'>>,
): ColorStop[] {
  return stops.map((stop) => {
    if (stop.id !== id) return stop;
    return sanitiseStop({ ...stop, ...patch });
  });
}

/**
 * True when a repeating gradient will visibly tile. Stops that already run
 * from 0% to 100% fill the box once, so "repeating" changes nothing.
 */
export function repeatsVisibly(model: GradientModel): boolean {
  if (!model.repeating) return false;
  const stops = resolveStops(model.stops);
  return stops[0].position > 0 || stops[stops.length - 1].position < 100;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** The gradient function on its own, e.g. `linear-gradient(90deg, #f00 0%, #00f 100%)`. */
export function buildGradientValue(model: GradientModel): string {
  const type: GradientType =
    model.type === 'radial' || model.type === 'conic' ? model.type : 'linear';
  const x = formatNumber(clampPercent(model.positionX));
  const y = formatNumber(clampPercent(model.positionY));
  const angle = formatNumber(clampAngle(model.angle));

  let head: string;
  if (type === 'radial') {
    head = `${model.shape === 'ellipse' ? 'ellipse' : 'circle'} at ${x}% ${y}%`;
  } else if (type === 'conic') {
    head = `from ${angle}deg at ${x}% ${y}%`;
  } else {
    head = `${angle}deg`;
  }

  const stops = resolveStops(model.stops).map(
    (stop) => `${stop.color} ${formatNumber(stop.position)}%`,
  );
  return `${model.repeating ? 'repeating-' : ''}${type}-gradient(${[head, ...stops].join(', ')})`;
}

export function buildCssDeclaration(model: GradientModel): string {
  return `background: ${buildGradientValue(model)};`;
}

/**
 * Encodes a CSS value for a Tailwind arbitrary-value class. Whitespace becomes
 * an underscore, the spaces around commas are dropped, and a literal
 * underscore is escaped so Tailwind does not read it back as a space.
 */
export function escapeTailwindValue(value: string): string {
  return value
    .trim()
    .replace(/_/g, '\\_')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, '_');
}

/** A Tailwind class such as `bg-[linear-gradient(90deg,#ff0000_0%,#0000ff_100%)]`. */
export function buildTailwindClass(model: GradientModel): string {
  return `bg-[${escapeTailwindValue(buildGradientValue(model))}]`;
}

// ---------------------------------------------------------------------------
// Starting points
// ---------------------------------------------------------------------------

function stopsFrom(pairs: Array<[string, number]>): ColorStop[] {
  return pairs.map(([color, position], index) => ({
    id: `stop-${index + 1}`,
    color,
    position,
  }));
}

export function createDefaultModel(): GradientModel {
  return {
    type: 'linear',
    repeating: false,
    angle: 135,
    shape: 'circle',
    positionX: 50,
    positionY: 50,
    stops: stopsFrom([
      ['#4f46e5', 0],
      ['#ec4899', 100],
    ]),
  };
}

function preset(
  id: string,
  name: string,
  overrides: Partial<Omit<GradientModel, 'stops'>>,
  stops: Array<[string, number]>,
): GradientPreset {
  return { id, name, model: { ...createDefaultModel(), ...overrides, stops: stopsFrom(stops) } };
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  preset('sunset', 'Sunset', { angle: 135 }, [
    ['#ff512f', 0],
    ['#dd2476', 100],
  ]),
  preset('ocean', 'Ocean', { angle: 90 }, [
    ['#2193b0', 0],
    ['#6dd5ed', 100],
  ]),
  preset('aurora', 'Aurora', { angle: 120 }, [
    ['#12c2e9', 0],
    ['#c471ed', 50],
    ['#f64f59', 100],
  ]),
  preset('sun', 'Sun', { type: 'radial', shape: 'circle' }, [
    ['#fde68a', 0],
    ['#f97316', 55],
    ['#7f1d1d', 100],
  ]),
  preset('colour-wheel', 'Colour wheel', { type: 'conic', angle: 0 }, [
    ['#ff0000', 0],
    ['#ffff00', 17],
    ['#00ff00', 33],
    ['#00ffff', 50],
    ['#0000ff', 67],
    ['#ff00ff', 83],
    ['#ff0000', 100],
  ]),
  preset('candy-stripes', 'Candy stripes', { repeating: true, angle: 45 }, [
    ['#ff6b6b', 0],
    ['#ff6b6b', 10],
    ['#ffffff', 10],
    ['#ffffff', 20],
  ]),
  preset('sunburst', 'Sunburst', { type: 'conic', repeating: true, angle: 0 }, [
    ['#facc15', 0],
    ['#facc15', 5],
    ['#f97316', 5],
    ['#f97316', 10],
  ]),
];

/**
 * A fresh random look that keeps the current type and repeating setting:
 * new colours (a pleasant hue run, not noise), stop count, positions, angle,
 * shape and centre. Pass a seeded generator in tests.
 */
export function randomGradient(
  current: GradientModel,
  random: () => number = Math.random,
): GradientModel {
  const next = () => {
    const value = random();
    return Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
  };

  const count = 2 + Math.floor(next() * 3);
  const baseHue = next() * 360;
  const hueStep = (25 + next() * 70) * (next() < 0.5 ? 1 : -1);
  const saturation = 65 + next() * 25;
  // A repeating gradient only tiles if its stops stop short of 100%.
  const span = current.repeating ? Math.round(10 + next() * 30) : 100;

  const pairs: Array<[string, number]> = [];
  for (let index = 0; index < count; index++) {
    const hue = (((baseHue + hueStep * index) % 360) + 360) % 360;
    const lightness = 45 + next() * 20;
    pairs.push([hslToColor(hue, saturation, lightness), Math.round((index / (count - 1)) * span)]);
  }

  return {
    ...current,
    angle: Math.round(next() * 360),
    shape: next() < 0.5 ? 'circle' : 'ellipse',
    positionX: Math.round(25 + next() * 50),
    positionY: Math.round(25 + next() * 50),
    stops: stopsFrom(pairs),
  };
}
