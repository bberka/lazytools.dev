/**
 * Glassmorphism generator logic: the settings of a frosted-glass card, the
 * built-in presets, and the code that reproduces the card as plain CSS, as
 * Tailwind utilities and as a React style object.
 *
 * Opacities are whole percentages (0..100) and lengths are px, exactly as the
 * controls hold them. Colours are hex strings.
 */

import { hexToRgba } from '@/lib/tools/design-color';

export interface GlassSettings {
  bgColor: string;
  bgOpacity: number;
  blur: number;
  saturate: number;
  /** 0 turns the border off. */
  borderWidth: number;
  borderColor: string;
  borderOpacity: number;
  /** Used for all four corners unless `isIndividualCorners` is set. */
  borderRadius: number;
  isIndividualCorners: boolean;
  /** Top left, top right, bottom right, bottom left. */
  corners: [number, number, number, number];
  enableShadow: boolean;
  shadowColor: string;
  shadowOpacity: number;
  shadowBlur: number;
  shadowSpread: number;
  shadowX: number;
  shadowY: number;
}

export interface GlassPreset {
  name: string;
  settings: GlassSettings;
}

/**
 * The inline style of the card, ready for a React `style` prop. A type alias
 * rather than an interface, so it stays assignable to `CSSProperties` when
 * that type carries an index signature for custom properties.
 */
export type GlassStyle = {
  background: string;
  backdropFilter: string;
  WebkitBackdropFilter: string;
  border: string;
  borderRadius: string;
  boxShadow: string;
};

export interface GlassOutput {
  style: GlassStyle;
  css: string;
  tailwind: string;
  react: string;
}

export const DEFAULT_GLASS_PRESET = 'frosted';

export const GLASS_PRESETS: Record<string, GlassPreset> = {
  frosted: {
    name: 'Frosted Light',
    settings: {
      bgColor: '#ffffff',
      bgOpacity: 15,
      blur: 16,
      saturate: 100,
      borderWidth: 1,
      borderColor: '#ffffff',
      borderOpacity: 25,
      borderRadius: 16,
      isIndividualCorners: false,
      corners: [16, 16, 16, 16],
      enableShadow: true,
      shadowColor: '#000000',
      shadowOpacity: 10,
      shadowBlur: 24,
      shadowSpread: 0,
      shadowX: 0,
      shadowY: 8,
    },
  },
  deepBlur: {
    name: 'Deep Ice',
    settings: {
      bgColor: '#ffffff',
      bgOpacity: 8,
      blur: 30,
      saturate: 120,
      borderWidth: 1,
      borderColor: '#ffffff',
      borderOpacity: 20,
      borderRadius: 24,
      isIndividualCorners: false,
      corners: [24, 24, 24, 24],
      enableShadow: true,
      shadowColor: '#000000',
      shadowOpacity: 15,
      shadowBlur: 35,
      shadowSpread: 0,
      shadowX: 0,
      shadowY: 12,
    },
  },
  midnight: {
    name: 'Midnight Dark',
    settings: {
      bgColor: '#111827',
      bgOpacity: 35,
      blur: 16,
      saturate: 100,
      borderWidth: 1,
      borderColor: '#ffffff',
      borderOpacity: 8,
      borderRadius: 16,
      isIndividualCorners: false,
      corners: [16, 16, 16, 16],
      enableShadow: true,
      shadowColor: '#000000',
      shadowOpacity: 40,
      shadowBlur: 30,
      shadowSpread: 0,
      shadowX: 0,
      shadowY: 10,
    },
  },
  neon: {
    name: 'Neon Glow',
    settings: {
      bgColor: '#ec4899',
      bgOpacity: 10,
      blur: 12,
      saturate: 150,
      borderWidth: 1.5,
      borderColor: '#f43f5e',
      borderOpacity: 40,
      borderRadius: 24,
      isIndividualCorners: false,
      corners: [24, 24, 24, 24],
      enableShadow: true,
      shadowColor: '#ec4899',
      shadowOpacity: 15,
      shadowBlur: 25,
      shadowSpread: 2,
      shadowX: 0,
      shadowY: 4,
    },
  },
  hyperClear: {
    name: 'Hyper Clear',
    settings: {
      bgColor: '#ffffff',
      bgOpacity: 3,
      blur: 4,
      saturate: 100,
      borderWidth: 1,
      borderColor: '#ffffff',
      borderOpacity: 35,
      borderRadius: 8,
      isIndividualCorners: false,
      corners: [8, 8, 8, 8],
      enableShadow: false,
      shadowColor: '#000000',
      shadowOpacity: 5,
      shadowBlur: 10,
      shadowSpread: 0,
      shadowX: 0,
      shadowY: 2,
    },
  },
  amethyst: {
    name: 'Royal Amethyst',
    settings: {
      bgColor: '#6366f1',
      bgOpacity: 15,
      blur: 20,
      saturate: 130,
      borderWidth: 1,
      borderColor: '#a5b4fc',
      borderOpacity: 30,
      borderRadius: 20,
      isIndividualCorners: true,
      corners: [30, 8, 30, 8],
      enableShadow: true,
      shadowColor: '#4f46e5',
      shadowOpacity: 20,
      shadowBlur: 30,
      shadowSpread: 0,
      shadowX: 0,
      shadowY: 10,
    },
  },
};

const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The key of the preset the settings currently equal, or an empty string.
 * Only what shows counts: the shared radius is ignored while corners are
 * split, and the shadow values are ignored while the shadow is off.
 */
export function findGlassPreset(settings: GlassSettings): string {
  for (const [key, { settings: preset }] of Object.entries(GLASS_PRESETS)) {
    const fill =
      sameColor(preset.bgColor, settings.bgColor) && preset.bgOpacity === settings.bgOpacity;
    const filter = preset.blur === settings.blur && preset.saturate === settings.saturate;
    const border =
      preset.borderWidth === settings.borderWidth &&
      sameColor(preset.borderColor, settings.borderColor) &&
      preset.borderOpacity === settings.borderOpacity;
    const corners =
      preset.isIndividualCorners === settings.isIndividualCorners &&
      (settings.isIndividualCorners
        ? preset.corners.every((corner, index) => corner === settings.corners[index])
        : preset.borderRadius === settings.borderRadius);
    const shadow =
      preset.enableShadow === settings.enableShadow &&
      (!settings.enableShadow ||
        (sameColor(preset.shadowColor, settings.shadowColor) &&
          preset.shadowOpacity === settings.shadowOpacity &&
          preset.shadowBlur === settings.shadowBlur &&
          preset.shadowSpread === settings.shadowSpread &&
          preset.shadowX === settings.shadowX &&
          preset.shadowY === settings.shadowY));

    if (fill && filter && border && corners && shadow) return key;
  }
  return '';
}

/** Tailwind colour utility: the named white/black shortcuts where they apply. */
function tailwindColor(utility: 'bg' | 'border', color: string, opacity: number): string {
  if (sameColor(color, '#ffffff')) return `${utility}-white/[${opacity}]`;
  if (sameColor(color, '#000000')) return `${utility}-black/[${opacity}]`;
  return `${utility}-[${hexToRgba(color, opacity, ',')}]`;
}

/** Builds the card style and the three code snippets for the settings. */
export function buildGlassOutput(settings: GlassSettings): GlassOutput {
  const {
    blur,
    saturate,
    borderWidth,
    borderRadius,
    isIndividualCorners,
    corners,
    enableShadow,
    shadowBlur,
    shadowSpread,
    shadowX,
    shadowY,
  } = settings;
  const bgOpacity = settings.bgOpacity / 100;
  const borderOpacity = settings.borderOpacity / 100;
  const shadowOpacity = settings.shadowOpacity / 100;

  const background = hexToRgba(settings.bgColor, bgOpacity);
  const backdropFilter = `blur(${blur}px) saturate(${saturate}%)`;
  const border = `${borderWidth}px solid ${hexToRgba(settings.borderColor, borderOpacity)}`;
  const radius = isIndividualCorners
    ? corners.map((corner) => `${corner}px`).join(' ')
    : `${borderRadius}px`;
  const shadow = `${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowSpread}px ${hexToRgba(settings.shadowColor, shadowOpacity)}`;

  const hasBorder = borderWidth > 0;
  const style: GlassStyle = {
    background,
    backdropFilter,
    WebkitBackdropFilter: backdropFilter,
    border: hasBorder ? border : 'none',
    borderRadius: radius,
    boxShadow: enableShadow ? shadow : 'none',
  };

  const css = [
    '.glass-card {',
    `  background: ${background};`,
    `  backdrop-filter: ${backdropFilter};`,
    `  -webkit-backdrop-filter: ${backdropFilter};`,
    ...(hasBorder ? [`  border: ${border};`] : []),
    `  border-radius: ${radius};`,
    ...(enableShadow ? [`  box-shadow: ${shadow};`] : []),
    '}',
  ].join('\n');

  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const classes = [
    tailwindColor('bg', settings.bgColor, bgOpacity),
    `backdrop-blur-[${blur}px]`,
    // 100% is the identity, so the utility is only needed when it changes something.
    saturate !== 100 ? `backdrop-saturate-[${saturate}%]` : '',
    hasBorder
      ? `border-[${borderWidth}px] ${tailwindColor('border', settings.borderColor, borderOpacity)}`
      : '',
    isIndividualCorners
      ? `rounded-tl-[${topLeft}px] rounded-tr-[${topRight}px] rounded-br-[${bottomRight}px] rounded-bl-[${bottomLeft}px]`
      : `rounded-[${borderRadius}px]`,
    enableShadow
      ? `shadow-[${shadowX}px_${shadowY}px_${shadowBlur}px_${shadowSpread}px_${hexToRgba(settings.shadowColor, shadowOpacity, ',')}]`
      : '',
  ].filter(Boolean);
  const tailwind = `<div className="${classes.join(' ')}">\n  {/* Card Content */}\n</div>`;

  const react = `const glassStyle = {
  background: "${style.background}",
  backdropFilter: "${style.backdropFilter}",
  WebkitBackdropFilter: "${style.WebkitBackdropFilter}",
  border: "${style.border}",
  borderRadius: "${style.borderRadius}",
  boxShadow: "${style.boxShadow}"
};

// Usage:
// <div style={glassStyle}>Card</div>`;

  return { style, css, tailwind, react };
}
