import { test, expect } from '@playwright/test';
import {
  calculateClamp,
  clampChart,
  parseDecimal,
  roundTo,
  sizeAtViewport,
  type ClampInput,
} from '@/lib/tools/clamp-calculator';

/** The tool's defaults: 16px at a 320px viewport growing to 32px at 1200px. */
const DEFAULTS: ClampInput = {
  minSize: '16',
  minSizeUnit: 'px',
  maxSize: '32',
  maxSizeUnit: 'px',
  minViewport: '320',
  minViewportUnit: 'px',
  maxViewport: '1200',
  maxViewportUnit: 'px',
  baseFontSize: '16',
  property: 'font-size',
  outputUnit: 'rem',
};

const calculate = (overrides: Partial<ClampInput> = {}) => calculateClamp({ ...DEFAULTS, ...overrides });

test.describe('parseDecimal', () => {
  test('reads plain decimals', () => {
    expect(parseDecimal('16')).toBe(16);
    expect(parseDecimal(' 1.5 ')).toBe(1.5);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('16.')).toBe(16);
    expect(parseDecimal('-2')).toBe(-2);
    expect(parseDecimal('+3')).toBe(3);
  });

  test('takes a comma as the decimal separator', () => {
    // Defect: "1,5" was read as 1, quietly dropping the fraction.
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('0,875')).toBe(0.875);
  });

  test('rejects text that is not just a number', () => {
    // Defect: "16px" and "12abc" were read as 16 and 12.
    for (const text of ['', '   ', 'abc', '16px', '12abc', '1e3', '1.2.3', '1,2,3', '1.234,5', '-', '.', ',', 'NaN', 'Infinity']) {
      expect(Number.isNaN(parseDecimal(text)), JSON.stringify(text)).toBe(true);
    }
  });
});

test.describe('roundTo', () => {
  test('rounds half up without binary-fraction misses', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(0.45454545)).toBe(0.4545);
    expect(roundTo(1.81818181)).toBe(1.8182);
  });

  test('prints a rounded-away negative as plain zero', () => {
    expect(`${roundTo(-0.00001)}rem`).toBe('0rem');
  });
});

test.describe('calculateClamp', () => {
  test('builds the default fluid font size in rem', () => {
    // Slope: (32 - 16) / (1200 - 320) = 0.0181818 px per px, so 1.8182vw.
    // Intercept: 16 - 0.0181818 * 320 = 10.1818px = 0.6364rem.
    expect(calculate()).toEqual({
      error: '',
      property: 'font-size',
      clamp: 'clamp(1rem, 0.6364rem + 1.8182vw, 2rem)',
      css: 'font-size: clamp(1rem, 0.6364rem + 1.8182vw, 2rem);',
      tailwind: 'text-[clamp(1rem,0.6364rem+1.8182vw,2rem)]',
      scss: '$font-size-fluid: clamp(1rem, 0.6364rem + 1.8182vw, 2rem);',
      basePx: 16,
      minSizePx: 16,
      maxSizePx: 32,
      minViewportPx: 320,
      maxViewportPx: 1200,
    });
  });

  test('writes px when asked', () => {
    expect(calculate({ outputUnit: 'px' }).clamp).toBe('clamp(16px, 10.1818px + 1.8182vw, 32px)');
  });

  test('converts rem inputs with the base font size', () => {
    const calculation = calculate({
      minSize: '1',
      minSizeUnit: 'rem',
      maxSize: '2',
      maxSizeUnit: 'rem',
      minViewport: '20',
      minViewportUnit: 'rem',
      maxViewport: '75',
      maxViewportUnit: 'rem',
    });

    expect(calculation.minSizePx).toBe(16);
    expect(calculation.maxViewportPx).toBe(1200);
    expect(calculation.clamp).toBe('clamp(1rem, 0.6364rem + 1.8182vw, 2rem)');
  });

  test('uses a different base font size for rem values', () => {
    expect(calculate({ baseFontSize: '10' }).clamp).toBe('clamp(1.6rem, 1.0182rem + 1.8182vw, 3.2rem)');
  });

  test('falls back to 16px when the base font size is left blank', () => {
    expect(calculate({ baseFontSize: '  ' }).basePx).toBe(16);
    expect(calculate({ baseFontSize: '' }).clamp).toBe(calculate().clamp);
  });

  test('refuses a base font size that is zero, negative or not a number', () => {
    // Defect: "0" and "abc" were silently replaced by 16.
    for (const baseFontSize of ['0', '-16', 'abc', '16px']) {
      expect(calculate({ baseFontSize }).error, baseFontSize).toBe(
        'Base font size must be a number above zero.'
      );
    }
  });

  test('simplifies the preferred value when a term vanishes', () => {
    // The line through (0, 0) has no intercept; equal sizes have no slope.
    expect(calculate({ minSize: '10', maxSize: '20', minViewport: '500', maxViewport: '1000', outputUnit: 'px' }).clamp).toBe(
      'clamp(10px, 2vw, 20px)'
    );
    expect(calculate({ minSize: '16', maxSize: '16' }).clamp).toBe('clamp(1rem, 1rem, 1rem)');
    expect(calculate({ minSize: '0', maxSize: '0' }).clamp).toBe('clamp(0rem, 0rem, 0rem)');
  });

  test('subtracts a negative intercept', () => {
    // 16px at 800 to 48px at 1200: slope 8vw, intercept -48px.
    expect(calculate({ maxSize: '48', minViewport: '800', outputUnit: 'px' }).clamp).toBe(
      'clamp(16px, 8vw - 48px, 48px)'
    );
  });

  test('handles a size that shrinks as the viewport grows', () => {
    // 32px at 320 down to 16px at 1200: the bounds stay ordered small to large.
    expect(calculate({ minSize: '32', maxSize: '16', outputUnit: 'px' }).clamp).toBe(
      'clamp(16px, 37.8182px - 1.8182vw, 32px)'
    );
  });

  test('gives the same value when the viewports are entered the other way round', () => {
    const swapped = calculate({ minSize: '32', maxSize: '16', minViewport: '1200', maxViewport: '320' });
    expect(swapped.clamp).toBe(calculate().clamp);
  });

  test('accepts comma decimals in every field', () => {
    expect(calculate({ minSize: '1,5', minSizeUnit: 'rem', maxSize: '2,5', maxSizeUnit: 'rem' }).clamp).toBe(
      calculate({ minSize: '1.5', minSizeUnit: 'rem', maxSize: '2.5', maxSizeUnit: 'rem' }).clamp
    );
    expect(calculate({ minSize: '1,5', minSizeUnit: 'rem' }).minSizePx).toBe(24);
  });

  test('maps known properties to their Tailwind utility', () => {
    expect(calculate({ property: 'padding' }).tailwind).toMatch(/^p-\[clamp\(/);
    expect(calculate({ property: 'margin' }).tailwind).toMatch(/^m-\[clamp\(/);
    expect(calculate({ property: 'width' }).tailwind).toMatch(/^w-\[clamp\(/);
    expect(calculate({ property: 'height' }).tailwind).toMatch(/^h-\[clamp\(/);
    expect(calculate({ property: 'gap' }).tailwind).toMatch(/^gap-\[clamp\(/);
  });

  test('writes other properties as a Tailwind arbitrary property', () => {
    // Defect: this came out as "[border-radius]-[clamp(...)]", which Tailwind ignores.
    expect(calculate({ property: 'border-radius' }).tailwind).toBe(
      '[border-radius:clamp(1rem,0.6364rem+1.8182vw,2rem)]'
    );
    expect(calculate({ property: ' --my-size ' })).toMatchObject({
      property: '--my-size',
      css: '--my-size: clamp(1rem, 0.6364rem + 1.8182vw, 2rem);',
      tailwind: '[--my-size:clamp(1rem,0.6364rem+1.8182vw,2rem)]',
      scss: '$--my-size-fluid: clamp(1rem, 0.6364rem + 1.8182vw, 2rem);',
    });
  });

  test('is not fooled by property names that exist on every object', () => {
    expect(calculate({ property: 'constructor' }).tailwind).toMatch(/^\[constructor:clamp\(/);
  });

  test('uses a placeholder property when none is given', () => {
    expect(calculate({ property: '   ' })).toMatchObject({
      property: '--fluid-prop',
      css: '--fluid-prop: clamp(1rem, 0.6364rem + 1.8182vw, 2rem);',
    });
  });

  test('asks for numbers when a field is empty or not a number', () => {
    const message = 'Please enter valid numbers in all fields to compute.';

    expect(calculate({ minSize: '' })).toMatchObject({ error: message, clamp: '', css: '', tailwind: '', scss: '' });
    expect(calculate({ maxSize: 'abc' }).error).toBe(message);
    expect(calculate({ minViewport: '  ' }).error).toBe(message);
    expect(calculate({ maxViewport: '1200px' }).error).toBe(message);
    expect(calculate({ minSize: '', maxSize: '', minViewport: '', maxViewport: '' }).error).toBe(message);
  });

  test('refuses equal or negative viewports', () => {
    expect(calculate({ minViewport: '800', maxViewport: '800' }).error).toBe('Min and Max viewports cannot be equal.');
    expect(calculate({ minViewport: '20', minViewportUnit: 'rem', maxViewport: '320' }).error).toBe(
      'Min and Max viewports cannot be equal.'
    );
    expect(calculate({ minViewport: '-320' }).error).toBe('Viewport widths cannot be negative.');
  });

  test('keeps the property name on a failed calculation', () => {
    expect(calculate({ minSize: '', property: 'gap' }).property).toBe('gap');
  });

  test('allows negative sizes, for margins that pull', () => {
    expect(calculate({ minSize: '-8', maxSize: '-32', property: 'margin', outputUnit: 'px' }).clamp).toBe(
      'clamp(-32px, 0.7273px - 2.7273vw, -8px)'
    );
  });
});

test.describe('sizeAtViewport', () => {
  const calculation = calculate();

  test('holds the limits outside the fluid range', () => {
    expect(sizeAtViewport(calculation, 200)).toEqual({ px: 16, rem: 1 });
    expect(sizeAtViewport(calculation, 320)).toEqual({ px: 16, rem: 1 });
    expect(sizeAtViewport(calculation, 1200)).toEqual({ px: 32, rem: 2 });
    expect(sizeAtViewport(calculation, 2000)).toEqual({ px: 32, rem: 2 });
  });

  test('interpolates inside it', () => {
    // Half-way between 320 and 1200 is 760, so half-way between 16 and 32.
    expect(sizeAtViewport(calculation, 760)).toEqual({ px: 24, rem: 1.5 });
    expect(sizeAtViewport(calculation, 800)).toEqual({ px: 24.73, rem: 1.545 });
  });

  test('agrees with the generated clamp() value', () => {
    // clamp(16px, 10.1818px + 1.8182vw, 32px) at an 800px viewport.
    expect(sizeAtViewport(calculation, 800)?.px).toBeCloseTo(10.1818 + 1.8182 * 8, 2);
  });

  test('works when the size shrinks or the viewports are swapped', () => {
    const shrinking = calculate({ minSize: '32', maxSize: '16' });
    const swapped = calculate({ minViewport: '1200', maxViewport: '320' });

    expect(sizeAtViewport(shrinking, 200)?.px).toBe(32);
    expect(sizeAtViewport(shrinking, 2000)?.px).toBe(16);
    expect(sizeAtViewport(swapped, 200)?.px).toBe(32);
    expect(sizeAtViewport(swapped, 2000)?.px).toBe(16);
  });

  test('uses the base font size for the rem figure', () => {
    expect(sizeAtViewport(calculate({ baseFontSize: '10' }), 760)).toEqual({ px: 24, rem: 2.4 });
  });

  test('has no answer without a calculation', () => {
    expect(sizeAtViewport(calculate({ minSize: '' }), 800)).toBeNull();
  });
});

test.describe('clampChart', () => {
  test('pads the fluid range by a quarter on each side', () => {
    expect(clampChart(calculate())).toEqual({
      xMin: 100,
      xMax: 1420,
      yMin: 12,
      yMax: 36,
      from: { viewport: 320, size: 16 },
      to: { viewport: 1200, size: 32 },
    });
  });

  test('orders the ends by viewport', () => {
    // Defect: with the larger viewport in the "min" field the line doubled
    // back on itself, running right to the 1200px mark and then left to 320px.
    const chart = clampChart(calculate({ minViewport: '1200', maxViewport: '320' }));

    expect(chart?.from).toEqual({ viewport: 320, size: 32 });
    expect(chart?.to).toEqual({ viewport: 1200, size: 16 });
    expect(chart?.xMin).toBeLessThan(chart?.from.viewport ?? 0);
    expect(chart?.xMax).toBeGreaterThan(chart?.to.viewport ?? 0);
  });

  test('does not start the axes below zero for ordinary values', () => {
    const chart = clampChart(calculate({ minSize: '1', maxSize: '40', minViewport: '100' }));

    expect(chart?.xMin).toBe(0);
    expect(chart?.yMin).toBe(0);
  });

  test('gives a flat line some height', () => {
    expect(clampChart(calculate({ minSize: '16', maxSize: '16' }))).toMatchObject({ yMin: 13.5, yMax: 18.5 });
  });

  test('makes room below zero for negative sizes', () => {
    // Defect: the size axis stopped at zero, so a negative size was drawn
    // underneath the chart.
    const chart = clampChart(calculate({ minSize: '-8', maxSize: '-32' }));

    expect(chart?.yMin).toBe(-38);
    expect(chart?.yMax).toBe(-2);
  });

  test('has nothing to draw without a calculation', () => {
    expect(clampChart(calculate({ minViewport: '800', maxViewport: '800' }))).toBeNull();
  });
});
