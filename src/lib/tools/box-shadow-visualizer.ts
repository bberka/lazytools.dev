/**
 * Box-shadow visualizer logic: turns a stack of shadow layers into the CSS
 * `box-shadow` value and the matching Tailwind arbitrary-value class.
 *
 * Layers are listed top-most first, the order CSS paints them. Hidden layers
 * are left out of the output. Offsets, blur and spread are px.
 */

import { hexToRgba } from '@/lib/tools/design-color';

export interface ShadowLayer {
  id: string;
  name: string;
  visible: boolean;
  inset: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  /** Hex colour. */
  color: string;
  /** 0 to 1. */
  opacity: number;
}

export interface BoxShadowOutput {
  /** The property value, one layer per line, or `none`. */
  value: string;
  /** `box-shadow: <value>;` */
  css: string;
  /** `shadow-[...]`, or `shadow-none`. */
  tailwind: string;
}

function lengths({ offsetX, offsetY, blur, spread }: ShadowLayer): string[] {
  return [offsetX, offsetY, blur, spread].map((length) => `${length}px`);
}

/** Builds the CSS and Tailwind forms of the visible layers. */
export function buildBoxShadow(layers: ShadowLayer[]): BoxShadowOutput {
  const visible = layers.filter((layer) => layer.visible);

  if (visible.length === 0) {
    return { value: 'none', css: 'box-shadow: none;', tailwind: 'shadow-none' };
  }

  const value = visible
    .map((layer) =>
      [
        ...(layer.inset ? ['inset'] : []),
        ...lengths(layer),
        hexToRgba(layer.color, layer.opacity),
      ].join(' ')
    )
    .join(',\n  ');

  // Tailwind arbitrary values use underscores for spaces and take no line breaks.
  const tailwind = visible
    .map((layer) =>
      [
        ...(layer.inset ? ['inset'] : []),
        ...lengths(layer),
        hexToRgba(layer.color, parseFloat(layer.opacity.toFixed(3)), ','),
      ].join('_')
    )
    .join(',');

  return { value, css: `box-shadow: ${value};`, tailwind: `shadow-[${tailwind}]` };
}
