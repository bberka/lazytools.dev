import { test, expect } from '@playwright/test';
import { buildBoxShadow, type ShadowLayer } from '@/lib/tools/box-shadow-visualizer';

const layer = (overrides: Partial<ShadowLayer> = {}): ShadowLayer => ({
  id: 'layer-1',
  name: 'Main Shadow',
  visible: true,
  inset: false,
  offsetX: 0,
  offsetY: 8,
  blur: 16,
  spread: -4,
  color: '#000000',
  opacity: 0.15,
  ...overrides,
});

test.describe('buildBoxShadow', () => {
  test('writes one layer', () => {
    expect(buildBoxShadow([layer()])).toEqual({
      value: '0px 8px 16px -4px rgba(0, 0, 0, 0.15)',
      css: 'box-shadow: 0px 8px 16px -4px rgba(0, 0, 0, 0.15);',
      tailwind: 'shadow-[0px_8px_16px_-4px_rgba(0,0,0,0.15)]',
    });
  });

  test('stacks layers in order, one per line in CSS and comma-joined in Tailwind', () => {
    const output = buildBoxShadow([
      layer(),
      layer({ id: 'layer-2', offsetY: 2, blur: 4, spread: -2, opacity: 0.1 }),
    ]);

    expect(output.css).toBe(
      'box-shadow: 0px 8px 16px -4px rgba(0, 0, 0, 0.15),\n  0px 2px 4px -2px rgba(0, 0, 0, 0.1);'
    );
    expect(output.tailwind).toBe(
      'shadow-[0px_8px_16px_-4px_rgba(0,0,0,0.15),0px_2px_4px_-2px_rgba(0,0,0,0.1)]'
    );
  });

  test('marks inset layers', () => {
    const output = buildBoxShadow([layer({ inset: true, offsetX: 3, offsetY: 3, blur: 6, spread: 0 })]);

    expect(output.value).toBe('inset 3px 3px 6px 0px rgba(0, 0, 0, 0.15)');
    expect(output.tailwind).toBe('shadow-[inset_3px_3px_6px_0px_rgba(0,0,0,0.15)]');
  });

  test('leaves hidden layers out', () => {
    const output = buildBoxShadow([
      layer({ visible: false }),
      layer({ id: 'layer-2', color: '#06B6D4', opacity: 0.8, offsetY: 0, blur: 8, spread: 2 }),
    ]);

    expect(output.value).toBe('0px 0px 8px 2px rgba(6, 182, 212, 0.8)');
  });

  test('says none when no layer is visible', () => {
    const none = { value: 'none', css: 'box-shadow: none;', tailwind: 'shadow-none' };

    expect(buildBoxShadow([])).toEqual(none);
    expect(buildBoxShadow([layer({ visible: false })])).toEqual(none);
  });

  test('prints every slider opacity as a short decimal', () => {
    for (let percent = 0; percent <= 100; percent += 1) {
      const { value, tailwind } = buildBoxShadow([layer({ opacity: percent / 100 })]);

      expect(value).toBe(`0px 8px 16px -4px rgba(0, 0, 0, ${percent / 100})`);
      expect(tailwind).toBe(`shadow-[0px_8px_16px_-4px_rgba(0,0,0,${percent / 100})]`);
      expect(String(percent / 100).length <= 4).toBe(true);
    }
  });

  test('accepts three-digit and lower-case colours', () => {
    expect(buildBoxShadow([layer({ color: '#0af' })]).value).toBe('0px 8px 16px -4px rgba(0, 170, 255, 0.15)');
    expect(buildBoxShadow([layer({ color: 'ec4899' })]).value).toBe('0px 8px 16px -4px rgba(236, 72, 153, 0.15)');
  });

  test('does not invent a colour from text that is not a hex colour', () => {
    // Defect: "red" was read as the hex digits "rr", "ee", "dd" and came out
    // cyan (0, 238, 221), and "#f00a" came out orange-red (240, 10, 0), in the
    // preview and the copied code.
    expect(buildBoxShadow([layer({ color: 'red' })]).value).toBe('0px 8px 16px -4px rgba(0, 0, 0, 0.15)');
    expect(buildBoxShadow([layer({ color: '#f00a' })]).value).toBe('0px 8px 16px -4px rgba(0, 0, 0, 0.15)');
    expect(buildBoxShadow([layer({ color: '' })]).value).toBe('0px 8px 16px -4px rgba(0, 0, 0, 0.15)');
  });

  test('keeps negative offsets and spread', () => {
    expect(buildBoxShadow([layer({ offsetX: -9, offsetY: -9, spread: -50 })]).tailwind).toBe(
      'shadow-[-9px_-9px_16px_-50px_rgba(0,0,0,0.15)]'
    );
  });
});
