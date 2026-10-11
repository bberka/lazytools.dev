/**
 * The saturation/value square of a colour picker: which colour sits under a
 * point of it, and which point shows a colour.
 *
 * The square is painted as the pure hue washed to white on the left and to
 * black at the bottom, so across it saturation grows to the right and value
 * (brightness) grows upward. That is HSV, not HSL: reading the pointer as HSL
 * saturation and lightness put white where the pure hue is painted. Pure
 * functions only; the colour maths is in `design-color`.
 */

import type { Hsv } from '@/lib/tools/design-color';

/** A position as a percentage of the square, from its left and top edges. */
export interface FieldPosition {
  left: number;
  top: number;
}

/** A fraction held inside 0..1; a pointer position that is not a number counts as 0. */
function unit(fraction: number): number {
  return Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
}

/**
 * The colour under a pointer. `x` and `y` are how far across and down the
 * square the pointer is, as fractions of its width and height; a pointer
 * outside the square counts as the nearest edge.
 */
export function hsvAtFieldPoint(hue: number, x: number, y: number): Hsv {
  return { h: hue, s: Math.round(unit(x) * 100), v: Math.round((1 - unit(y)) * 100) };
}

/** Where the marker for `hsv` sits in the square. */
export function fieldPositionOf({ s, v }: Hsv): FieldPosition {
  return {
    left: Math.min(100, Math.max(0, s)),
    top: 100 - Math.min(100, Math.max(0, v)),
  };
}
