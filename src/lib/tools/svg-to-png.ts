/**
 * SVG to PNG logic that needs no browser: getting pasted or uploaded SVG code
 * into a state every browser will load as an image, and working out how many
 * pixels the PNG gets.
 *
 * Browsers are strict about SVG used as an image. It must be well-formed XML
 * in the SVG namespace, and to be drawn on a canvas it needs a size of its
 * own. Code copied out of an HTML page often has neither: no `xmlns`, and
 * only a `viewBox` or percentages for its size. `prepareSvg` adds what is
 * missing to the root element and leaves everything else as it was written.
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 10;

/** A whole-number scale inside the allowed range. Anything unreadable is 1. */
export function clampScale(value: string | number): number {
  const scale = typeof value === 'number' ? Math.trunc(value) : parseInt(value, 10);
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
}

export interface Size {
  width: number;
  height: number;
}

/** The pixel size of the PNG for an image of `size` rendered at `scale`: whole pixels, at least 1x1. */
export function rasterSize(size: Size, scale: number): Size {
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

export type SvgPreparation =
  | {
      ok: true;
      /** The SVG to load as an `image/svg+xml` document. */
      markup: string;
      /** Size of the image at scale 1, in CSS pixels. */
      width: number;
      height: number;
    }
  | { ok: false; error: string };

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

// What CSS gives an image that states no size of its own.
const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 150;

// CSS pixels per unit, for the absolute units an SVG length can use.
const UNIT_PIXELS: Record<string, number> = {
  '': 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
};

/** An absolute length in pixels, or null for a relative one (`100%`, `2em`), zero or junk. */
function parseLength(value: string | undefined): number | null {
  if (value === undefined) return null;
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(value);
  if (!match) return null;
  const factor = UNIT_PIXELS[match[2].toLowerCase()];
  if (factor === undefined) return null;
  const pixels = Number(match[1]) * factor;
  return Number.isFinite(pixels) && pixels > 0 ? pixels : null;
}

/** Width divided by height of a `viewBox`, or null when it is missing or empty. */
function viewBoxRatio(value: string | undefined): number | null {
  if (value === undefined) return null;
  const numbers = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (numbers.length !== 4 || numbers.some((number) => !Number.isFinite(number))) return null;
  const [, , width, height] = numbers;
  return width > 0 && height > 0 ? width / height : null;
}

/**
 * The size an image gets from what its root element states, by the CSS rules
 * for replaced elements: a missing side follows the `viewBox` shape, and with
 * no size at all the shape is fitted inside 300x150.
 */
function intrinsicSize(width: number | null, height: number | null, ratio: number | null): Size {
  if (width !== null && height !== null) return { width, height };
  if (width !== null) return { width, height: ratio ? width / ratio : DEFAULT_HEIGHT };
  if (height !== null) return { width: ratio ? height * ratio : DEFAULT_WIDTH, height };
  if (ratio === null) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  return ratio >= DEFAULT_WIDTH / DEFAULT_HEIGHT
    ? { width: DEFAULT_WIDTH, height: DEFAULT_WIDTH / ratio }
    : { width: DEFAULT_HEIGHT * ratio, height: DEFAULT_HEIGHT };
}

interface RootTag {
  /** Index of the `<` of `<svg`. */
  start: number;
  /** Index of the `>` that ends the start tag. */
  end: number;
}

/** Finds the `<svg ...>` start tag, allowing an XML declaration, comments and a doctype before it. */
function findRootTag(source: string): RootTag | null {
  let index = 0;

  for (;;) {
    while (index < source.length && /\s/.test(source[index])) index += 1;

    if (source.startsWith('<?', index)) {
      const close = source.indexOf('?>', index);
      if (close < 0) return null;
      index = close + 2;
    } else if (source.startsWith('<!--', index)) {
      const close = source.indexOf('-->', index);
      if (close < 0) return null;
      index = close + 3;
    } else if (/^<!doctype/i.test(source.slice(index, index + 9))) {
      let close = source.indexOf('>', index);
      const subset = source.indexOf('[', index);
      // A doctype with an internal subset ends after its closing bracket.
      if (close >= 0 && subset >= 0 && subset < close) {
        const subsetEnd = source.indexOf(']', subset);
        close = subsetEnd < 0 ? -1 : source.indexOf('>', subsetEnd);
      }
      if (close < 0) return null;
      index = close + 1;
    } else {
      break;
    }
  }

  if (!/^<svg[\s>/]/.test(source.slice(index, index + 5))) return null;

  let quote = '';
  for (let cursor = index + 4; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return { start: index, end: cursor };
    }
  }

  return null;
}

interface Attribute {
  name: string;
  value: string;
  /** Range of the whole `name="value"` text inside the attribute text. */
  start: number;
  end: number;
}

function parseAttributes(text: string): Attribute[] {
  const attributes: Attribute[] = [];
  const pattern = /([^\s"'=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    attributes.push({
      name: match[1],
      value: match[2] ?? match[3] ?? '',
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return attributes;
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

/**
 * Checks that `source` is SVG code and returns it ready to be loaded as an
 * image, together with its size at scale 1.
 *
 * Three things are added to the root element when they are missing: the SVG
 * namespace, the XLink namespace when `xlink:` attributes are used, and
 * `width` and `height` in pixels when the SVG only has a `viewBox`,
 * percentages or nothing. Whether the rest is valid is left to the browser.
 */
export function prepareSvg(source: string): SvgPreparation {
  // An XML declaration is only allowed at the very start, so stray whitespace has to go.
  const code = source.replace(/^﻿/, '').trim();
  if (!code) return { ok: false, error: 'Paste SVG code or upload an SVG file first.' };

  const root = findRootTag(code);
  if (!root) {
    return { ok: false, error: 'This is not SVG: the code has to start with an <svg> element.' };
  }

  const tagBody = code.slice(root.start + 4, root.end);
  const attributes = parseAttributes(tagBody);
  const find = (name: string) => attributes.find((attribute) => attribute.name === name);

  const width = parseLength(find('width')?.value);
  const height = parseLength(find('height')?.value);
  const size = intrinsicSize(width, height, viewBoxRatio(find('viewBox')?.value));

  const added: string[] = [];
  const removed: Attribute[] = [];

  if (!find('xmlns')) added.push(`xmlns="${SVG_NAMESPACE}"`);
  if (!find('xmlns:xlink') && /[\s"']xlink:[\w.-]+\s*=/.test(code)) {
    added.push(`xmlns:xlink="${XLINK_NAMESPACE}"`);
  }
  if (width === null) {
    const stated = find('width');
    if (stated) removed.push(stated);
    added.push(`width="${formatNumber(size.width)}"`);
  }
  if (height === null) {
    const stated = find('height');
    if (stated) removed.push(stated);
    added.push(`height="${formatNumber(size.height)}"`);
  }

  if (added.length === 0) return { ok: true, markup: code, ...size };

  let kept = tagBody;
  for (const attribute of removed.sort((a, b) => b.start - a.start)) {
    kept = kept.slice(0, attribute.start) + kept.slice(attribute.end);
  }

  const markup = `${code.slice(0, root.start)}<svg ${added.join(' ')}${kept}${code.slice(root.end)}`;
  return { ok: true, markup, ...size };
}
