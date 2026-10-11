import { test, expect } from '@playwright/test';
import {
  DEFAULT_GLASS_PRESET,
  GLASS_PRESETS,
  buildGlassOutput,
  findGlassPreset,
  type GlassSettings,
} from '@/lib/tools/glassmorphism-generator';

const FROSTED = GLASS_PRESETS[DEFAULT_GLASS_PRESET].settings;

const build = (overrides: Partial<GlassSettings> = {}) => buildGlassOutput({ ...FROSTED, ...overrides });

test.describe('presets', () => {
  test('offers the six presets with Frosted Light as the default', () => {
    expect(Object.values(GLASS_PRESETS).map((preset) => preset.name)).toEqual([
      'Frosted Light',
      'Deep Ice',
      'Midnight Dark',
      'Neon Glow',
      'Hyper Clear',
      'Royal Amethyst',
    ]);
    expect(GLASS_PRESETS[DEFAULT_GLASS_PRESET].name).toBe('Frosted Light');
  });

  test('keeps every preset inside the range of its control', () => {
    for (const [key, { settings }] of Object.entries(GLASS_PRESETS)) {
      for (const opacity of [settings.bgOpacity, settings.borderOpacity, settings.shadowOpacity]) {
        expect(Number.isInteger(opacity) && opacity >= 0 && opacity <= 100, key).toBe(true);
      }
      expect(settings.blur >= 0 && settings.blur <= 40, key).toBe(true);
      expect(settings.saturate >= 50 && settings.saturate <= 200, key).toBe(true);
      expect(settings.corners, key).toHaveLength(4);
    }
  });

  test('recognises each preset from its own settings', () => {
    for (const [key, { settings }] of Object.entries(GLASS_PRESETS)) {
      expect(findGlassPreset(settings), key).toBe(key);
    }
  });

  test('ignores letter case in colours', () => {
    expect(findGlassPreset({ ...FROSTED, bgColor: '#FFFFFF', shadowColor: '#000000' })).toBe('frosted');
  });

  test('matches nothing once a visible setting changes', () => {
    expect(findGlassPreset({ ...FROSTED, blur: 17 })).toBe('');
    expect(findGlassPreset({ ...FROSTED, borderRadius: 18 })).toBe('');
    expect(findGlassPreset({ ...FROSTED, shadowY: 9 })).toBe('');
    expect(findGlassPreset({ ...FROSTED, borderWidth: 0 })).toBe('');
  });

  test('ignores settings that are not in effect', () => {
    const hyperClear = GLASS_PRESETS.hyperClear.settings;
    const amethyst = GLASS_PRESETS.amethyst.settings;

    // The shadow is off in Hyper Clear, and Royal Amethyst splits its corners.
    expect(findGlassPreset({ ...hyperClear, shadowBlur: 99, shadowColor: '#ff0000' })).toBe('hyperClear');
    expect(findGlassPreset({ ...amethyst, borderRadius: 3 })).toBe('amethyst');
    expect(findGlassPreset({ ...FROSTED, corners: [1, 2, 3, 4] })).toBe('frosted');
  });
});

test.describe('buildGlassOutput', () => {
  test('builds the inline style', () => {
    expect(build().style).toEqual({
      background: 'rgba(255, 255, 255, 0.15)',
      backdropFilter: 'blur(16px) saturate(100%)',
      WebkitBackdropFilter: 'blur(16px) saturate(100%)',
      border: '1px solid rgba(255, 255, 255, 0.25)',
      borderRadius: '16px',
      boxShadow: '0px 8px 24px 0px rgba(0, 0, 0, 0.1)',
    });
  });

  test('writes the CSS rule', () => {
    expect(build().css).toBe(
      [
        '.glass-card {',
        '  background: rgba(255, 255, 255, 0.15);',
        '  backdrop-filter: blur(16px) saturate(100%);',
        '  -webkit-backdrop-filter: blur(16px) saturate(100%);',
        '  border: 1px solid rgba(255, 255, 255, 0.25);',
        '  border-radius: 16px;',
        '  box-shadow: 0px 8px 24px 0px rgba(0, 0, 0, 0.1);',
        '}',
      ].join('\n')
    );
  });

  test('leaves the border and shadow out when they are off', () => {
    const output = build({ borderWidth: 0, enableShadow: false });

    expect(output.style.border).toBe('none');
    expect(output.style.boxShadow).toBe('none');
    expect(output.css).toBe(
      [
        '.glass-card {',
        '  background: rgba(255, 255, 255, 0.15);',
        '  backdrop-filter: blur(16px) saturate(100%);',
        '  -webkit-backdrop-filter: blur(16px) saturate(100%);',
        '  border-radius: 16px;',
        '}',
      ].join('\n')
    );
    expect(output.tailwind).toBe(
      '<div className="bg-white/[0.15] backdrop-blur-[16px] rounded-[16px]">\n  {/* Card Content */}\n</div>'
    );
  });

  test('writes four radii when the corners are split', () => {
    const output = build({ isIndividualCorners: true, corners: [30, 8, 30, 8] });

    expect(output.style.borderRadius).toBe('30px 8px 30px 8px');
    expect(output.css).toContain('  border-radius: 30px 8px 30px 8px;');
    expect(output.tailwind).toContain(
      'rounded-tl-[30px] rounded-tr-[8px] rounded-br-[30px] rounded-bl-[8px]'
    );
  });

  test('writes the Tailwind classes', () => {
    expect(build().tailwind).toBe(
      '<div className="bg-white/[0.15] backdrop-blur-[16px] border-[1px] border-white/[0.25] rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]">\n' +
        '  {/* Card Content */}\n' +
        '</div>'
    );
  });

  test('saturates the backdrop, not the card', () => {
    // Defect: this was `saturate-[150%]`, a filter on the card's own content,
    // while the CSS tab saturates what is behind the card.
    const { tailwind } = build({ saturate: 150 });

    expect(tailwind).toContain(' backdrop-saturate-[150%] ');
    expect(tailwind).not.toMatch(/[" ]saturate-\[/);
  });

  test('gives a snippet that is valid JSX', () => {
    // Defect: the snippet paired a JSX `className` with an HTML comment.
    expect(build().tailwind).not.toContain('<!--');
    expect(build().tailwind).toContain('{/* Card Content */}');
  });

  test('uses named Tailwind colours for black and white only', () => {
    expect(build({ bgColor: '#000000', borderColor: '#000000' }).tailwind).toContain(
      'bg-black/[0.15] backdrop-blur-[16px] border-[1px] border-black/[0.25]'
    );
    expect(build({ bgColor: '#EC4899', borderColor: '#f43f5e' }).tailwind).toContain(
      'bg-[rgba(236,72,153,0.15)] backdrop-blur-[16px] border-[1px] border-[rgba(244,63,94,0.25)]'
    );
  });

  test('writes the React style object', () => {
    expect(build().react).toBe(
      [
        'const glassStyle = {',
        '  background: "rgba(255, 255, 255, 0.15)",',
        '  backdropFilter: "blur(16px) saturate(100%)",',
        '  WebkitBackdropFilter: "blur(16px) saturate(100%)",',
        '  border: "1px solid rgba(255, 255, 255, 0.25)",',
        '  borderRadius: "16px",',
        '  boxShadow: "0px 8px 24px 0px rgba(0, 0, 0, 0.1)"',
        '};',
        '',
        '// Usage:',
        '// <div style={glassStyle}>Card</div>',
      ].join('\n')
    );
  });

  test('prints every whole percentage as a short decimal', () => {
    for (let percent = 0; percent <= 100; percent += 1) {
      const { style } = build({ bgOpacity: percent });
      const alpha = style.background.slice('rgba(255, 255, 255, '.length, -1);

      expect(alpha.length <= 4, `${percent}% printed as ${alpha}`).toBe(true);
      expect(Number(alpha)).toBe(percent / 100);
    }
  });

  test('handles the extremes of the controls', () => {
    const output = build({ bgOpacity: 0, blur: 0, borderWidth: 1.5, shadowX: -20, shadowY: -5, shadowSpread: 20 });

    expect(output.style.background).toBe('rgba(255, 255, 255, 0)');
    expect(output.style.backdropFilter).toBe('blur(0px) saturate(100%)');
    expect(output.style.border).toBe('1.5px solid rgba(255, 255, 255, 0.25)');
    expect(output.style.boxShadow).toBe('-20px -5px 24px 20px rgba(0, 0, 0, 0.1)');
    expect(output.tailwind).toContain('border-[1.5px]');
    expect(output.tailwind).toContain('shadow-[-20px_-5px_24px_20px_rgba(0,0,0,0.1)]');
  });

  test('accepts three-digit colours', () => {
    expect(build({ bgColor: '#0af' }).style.background).toBe('rgba(0, 170, 255, 0.15)');
  });

  test('does not invent a colour from half-typed text', () => {
    // Defect: "#ff00" became green and "#ff" became blue in the preview and in
    // the copied code while a colour was being typed.
    expect(build({ bgColor: '#ff00' }).style.background).toBe('rgba(0, 0, 0, 0.15)');
    expect(build({ borderColor: '#ff' }).style.border).toBe('1px solid rgba(0, 0, 0, 0.25)');
  });
});
