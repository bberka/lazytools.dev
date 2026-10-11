import { test, expect } from '@playwright/test';
import {
  GRADIENT_PRESETS,
  MAX_STOPS,
  MIN_STOPS,
  addStop,
  buildCssDeclaration,
  buildGradientValue,
  buildTailwindClass,
  clampAngle,
  clampPercent,
  createDefaultModel,
  escapeTailwindValue,
  formatNumber,
  mixColors,
  moveStop,
  normaliseColor,
  randomGradient,
  removeStop,
  repeatsVisibly,
  sortStopsByPosition,
  updateStop,
  type ColorStop,
  type GradientModel,
} from '@/lib/tools/css-gradient-generator';

function stopsFrom(...pairs: Array<[string, number]>): ColorStop[] {
  return pairs.map(([color, position], index) => ({ id: `stop-${index + 1}`, color, position }));
}

function model(overrides: Partial<GradientModel> = {}): GradientModel {
  return {
    type: 'linear',
    repeating: false,
    angle: 90,
    shape: 'circle',
    positionX: 50,
    positionY: 50,
    stops: stopsFrom(['#ff0000', 0], ['#0000ff', 100]),
    ...overrides,
  };
}

// Same decoding Tailwind applies to an arbitrary value: an unescaped
// underscore is a space, an escaped one is a literal underscore.
function decodeTailwind(className: string): string {
  const match = /^bg-\[(.*)\]$/.exec(className);
  if (!match) throw new Error(`not a bg-[...] class: ${className}`);
  return match[1].replace(/\\_|_/g, (token) => (token === '_' ? ' ' : '_'));
}

// A seedable generator so the random tests are repeatable.
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test.describe('gradient types', () => {
  test('linear', () => {
    expect(buildGradientValue(model())).toBe('linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
  });

  test('repeating linear', () => {
    const value = buildGradientValue(
      model({ repeating: true, angle: 45, stops: stopsFrom(['#ff0000', 0], ['#0000ff', 10]) }),
    );
    expect(value).toBe('repeating-linear-gradient(45deg, #ff0000 0%, #0000ff 10%)');
  });

  test('radial circle at the centre', () => {
    expect(buildGradientValue(model({ type: 'radial' }))).toBe(
      'radial-gradient(circle at 50% 50%, #ff0000 0%, #0000ff 100%)',
    );
  });

  test('radial ellipse with a custom position', () => {
    const value = buildGradientValue(
      model({ type: 'radial', shape: 'ellipse', positionX: 25, positionY: 75 }),
    );
    expect(value).toBe('radial-gradient(ellipse at 25% 75%, #ff0000 0%, #0000ff 100%)');
  });

  test('repeating radial', () => {
    const value = buildGradientValue(
      model({
        type: 'radial',
        repeating: true,
        stops: stopsFrom(['#ff0000', 0], ['#0000ff', 20]),
      }),
    );
    expect(value).toBe('repeating-radial-gradient(circle at 50% 50%, #ff0000 0%, #0000ff 20%)');
  });

  test('conic starts at the angle and sits at the position', () => {
    const value = buildGradientValue(model({ type: 'conic', angle: 90, positionX: 30, positionY: 60 }));
    expect(value).toBe('conic-gradient(from 90deg at 30% 60%, #ff0000 0%, #0000ff 100%)');
  });

  test('repeating conic', () => {
    const value = buildGradientValue(
      model({
        type: 'conic',
        repeating: true,
        angle: 0,
        stops: stopsFrom(['#facc15', 0], ['#facc15', 5], ['#f97316', 5], ['#f97316', 10]),
      }),
    );
    expect(value).toBe(
      'repeating-conic-gradient(from 0deg at 50% 50%, #facc15 0%, #facc15 5%, #f97316 5%, #f97316 10%)',
    );
  });

  test('linear ignores radial settings and radial ignores the angle', () => {
    const linear = buildGradientValue(model({ shape: 'ellipse', positionX: 10, positionY: 10 }));
    expect(linear).toBe('linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
    const radial = buildGradientValue(model({ type: 'radial', angle: 200 }));
    expect(radial).not.toContain('deg');
  });

  test('the declaration is a background property ending in a semicolon', () => {
    expect(buildCssDeclaration(model())).toBe(
      'background: linear-gradient(90deg, #ff0000 0%, #0000ff 100%);',
    );
  });

  test('every gradient value is balanced CSS with one function call', () => {
    for (const type of ['linear', 'radial', 'conic'] as const) {
      for (const repeating of [false, true]) {
        const value = buildGradientValue(model({ type, repeating }));
        expect(value).toMatch(
          new RegExp(`^${repeating ? 'repeating-' : ''}${type}-gradient\\([^()]*\\)$`),
        );
      }
    }
  });
});

test.describe('stop ordering', () => {
  test('stops are emitted in position order whatever order they were listed in', () => {
    const value = buildGradientValue(
      model({ stops: stopsFrom(['#0000ff', 100], ['#00ff00', 50], ['#ff0000', 0]) }),
    );
    expect(value).toBe('linear-gradient(90deg, #ff0000 0%, #00ff00 50%, #0000ff 100%)');
  });

  test('stops at the same position keep the order they were listed in (hard stops)', () => {
    const value = buildGradientValue(
      model({
        stops: stopsFrom(['#ff0000', 0], ['#ff0000', 50], ['#0000ff', 50], ['#0000ff', 100]),
      }),
    );
    expect(value).toBe(
      'linear-gradient(90deg, #ff0000 0%, #ff0000 50%, #0000ff 50%, #0000ff 100%)',
    );
  });

  test('building does not reorder or modify the model it was given', () => {
    const input = model({ stops: stopsFrom(['#0000ff', 100], ['#ff0000', 0]) });
    const snapshot = JSON.parse(JSON.stringify(input));
    buildGradientValue(input);
    expect(input).toEqual(snapshot);
  });

  test('sortStopsByPosition sorts stably and returns a new list', () => {
    const input = stopsFrom(['#111111', 80], ['#222222', 20], ['#333333', 20], ['#444444', 0]);
    const sorted = sortStopsByPosition(input);
    expect(sorted.map((s) => s.color)).toEqual(['#444444', '#222222', '#333333', '#111111']);
    expect(sorted).not.toBe(input);
    expect(input[0].color).toBe('#111111');
  });
});

test.describe('clamping', () => {
  test('stop positions are clamped to 0 to 100', () => {
    const value = buildGradientValue(
      model({ stops: stopsFrom(['#ff0000', -25], ['#0000ff', 140]) }),
    );
    expect(value).toBe('linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
  });

  test('clampPercent handles the awkward numbers', () => {
    expect(clampPercent(50)).toBe(50);
    expect(clampPercent(-0.5)).toBe(0);
    expect(clampPercent(100.01)).toBe(100);
    expect(clampPercent(Infinity)).toBe(100);
    expect(clampPercent(-Infinity)).toBe(0);
    expect(clampPercent(NaN)).toBe(0);
    expect(clampPercent(33.33333)).toBe(33.33);
  });

  test('fractional positions print without trailing zeros', () => {
    const value = buildGradientValue(
      model({ stops: stopsFrom(['#ff0000', 12.5], ['#0000ff', 99.999]) }),
    );
    expect(value).toBe('linear-gradient(90deg, #ff0000 12.5%, #0000ff 100%)');
    expect(formatNumber(10)).toBe('10');
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(-0)).toBe('0');
  });

  test('the angle is clamped to 0 to 360 and the position to 0 to 100', () => {
    expect(clampAngle(-20)).toBe(0);
    expect(clampAngle(400)).toBe(360);
    expect(clampAngle(NaN)).toBe(0);
    const value = buildGradientValue(
      model({ type: 'conic', angle: 999, positionX: -5, positionY: 130 }),
    );
    expect(value).toContain('from 360deg at 0% 100%');
  });

  test('a stop colour that is not a hex colour falls back to black', () => {
    const value = buildGradientValue(
      model({ stops: stopsFrom(['none', 0], ['not a colour', 100]) }),
    );
    expect(value).toBe('linear-gradient(90deg, #000000 0%, #000000 100%)');
  });

  test('a model with fewer than two stops still yields a valid gradient', () => {
    const one = buildGradientValue(model({ stops: stopsFrom(['#ff0000', 30]) }));
    expect(one).toBe('linear-gradient(90deg, #ff0000 30%, #ff0000 100%)');
    const none = buildGradientValue(model({ stops: [] }));
    expect(none.match(/#[0-9a-f]{6} \d+%/g)).toHaveLength(2);
  });
});

test.describe('colours', () => {
  test('hex colours are lower-cased and short forms are expanded', () => {
    expect(normaliseColor('#FF0000')).toBe('#ff0000');
    expect(normaliseColor('#F0a')).toBe('#ff00aa');
    expect(normaliseColor('  #ABCDEF ')).toBe('#abcdef');
    expect(normaliseColor('ff8800')).toBe('#ff8800');
  });

  test('alpha hex is kept', () => {
    expect(normaliseColor('#FF000080')).toBe('#ff000080');
    expect(normaliseColor('#f008')).toBe('#ff000088');
  });

  test('anything else becomes black', () => {
    for (const bad of ['', 'banana', '#12', '#12345', '#gggggg', 'rgb(0,0,0)']) {
      expect(normaliseColor(bad), bad).toBe('#000000');
    }
  });

  test('mixing colours', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    expect(mixColors('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    expect(mixColors('#ff0000', '#00ff00', 0.5)).toBe('#808000');
    expect(mixColors('#ff000000', '#ff0000ff', 0.5)).toBe('#ff000080');
  });
});

test.describe('Tailwind class', () => {
  test('spaces become underscores and the spaces after commas disappear', () => {
    expect(buildTailwindClass(model())).toBe(
      'bg-[linear-gradient(90deg,#ff0000_0%,#0000ff_100%)]',
    );
  });

  test('radial and conic keep the keywords apart with underscores', () => {
    expect(buildTailwindClass(model({ type: 'radial', shape: 'ellipse', positionX: 20, positionY: 80 }))).toBe(
      'bg-[radial-gradient(ellipse_at_20%_80%,#ff0000_0%,#0000ff_100%)]',
    );
    expect(buildTailwindClass(model({ type: 'conic', repeating: true, angle: 15 }))).toBe(
      'bg-[repeating-conic-gradient(from_15deg_at_50%_50%,#ff0000_0%,#0000ff_100%)]',
    );
  });

  test('the class never contains whitespace and decodes back to the CSS value', () => {
    for (const type of ['linear', 'radial', 'conic'] as const) {
      for (const repeating of [false, true]) {
        const m = model({ type, repeating });
        const className = buildTailwindClass(m);
        expect(className, `${type} ${repeating}`).not.toMatch(/\s/);
        expect(decodeTailwind(className)).toBe(buildGradientValue(m).replace(/, /g, ','));
      }
    }
  });

  test('escapeTailwindValue handles spaces, commas and literal underscores', () => {
    expect(escapeTailwindValue('a b')).toBe('a_b');
    expect(escapeTailwindValue('a   b')).toBe('a_b');
    expect(escapeTailwindValue('a\tb\nc')).toBe('a_b_c');
    expect(escapeTailwindValue('a , b')).toBe('a,b');
    expect(escapeTailwindValue('a,b')).toBe('a,b');
    expect(escapeTailwindValue('  a b  ')).toBe('a_b');
    // A literal underscore must be escaped or Tailwind turns it into a space.
    expect(escapeTailwindValue('a_b c')).toBe('a\\_b_c');
  });

  test('a long stop list stays one class', () => {
    const stops = stopsFrom(
      ['#ff0000', 0],
      ['#ffff00', 20],
      ['#00ff00', 40],
      ['#00ffff', 60],
      ['#0000ff', 80],
      ['#ff00ff', 100],
    );
    const className = buildTailwindClass(model({ stops }));
    expect(className).toBe(
      'bg-[linear-gradient(90deg,#ff0000_0%,#ffff00_20%,#00ff00_40%,#00ffff_60%,#0000ff_80%,#ff00ff_100%)]',
    );
  });
});

test.describe('editing the stop list', () => {
  test('addStop puts a new stop in the widest gap with a blended colour', () => {
    const stops = stopsFrom(['#000000', 0], ['#ffffff', 20], ['#ff0000', 100]);
    const next = addStop(stops);
    expect(next).toHaveLength(4);
    const added = next.find((s) => !stops.some((o) => o.id === s.id));
    expect(added).toBeDefined();
    expect(added?.position).toBe(60);
    expect(added?.color).toBe(mixColors('#ffffff', '#ff0000', 0.5));
    expect(next.map((s) => s.position)).toEqual([0, 20, 60, 100]);
  });

  test('addStop gives every stop a distinct id', () => {
    let stops = stopsFrom(['#000000', 0], ['#ffffff', 100]);
    for (let i = 0; i < 5; i++) stops = addStop(stops);
    expect(new Set(stops.map((s) => s.id)).size).toBe(stops.length);
  });

  test('addStop stops at the maximum', () => {
    let stops = stopsFrom(['#000000', 0], ['#ffffff', 100]);
    for (let i = 0; i < MAX_STOPS + 5; i++) stops = addStop(stops);
    expect(stops).toHaveLength(MAX_STOPS);
  });

  test('removeStop never goes below two stops', () => {
    const three = stopsFrom(['#000000', 0], ['#888888', 50], ['#ffffff', 100]);
    const two = removeStop(three, 'stop-2');
    expect(two.map((s) => s.id)).toEqual(['stop-1', 'stop-3']);
    expect(removeStop(two, 'stop-1')).toBe(two);
    expect(two).toHaveLength(MIN_STOPS);
  });

  test('removeStop ignores an unknown id', () => {
    const three = stopsFrom(['#000000', 0], ['#888888', 50], ['#ffffff', 100]);
    expect(removeStop(three, 'nope')).toEqual(three);
  });

  test('moveStop swaps colours between slots so the gradient order changes', () => {
    const stops = stopsFrom(['#ff0000', 0], ['#00ff00', 40], ['#0000ff', 100]);
    const moved = moveStop(stops, 'stop-2', 'up');
    // Rows swap places and trade positions, so the green stop now comes first.
    expect(moved.map((s) => s.id)).toEqual(['stop-2', 'stop-1', 'stop-3']);
    expect(moved.map((s) => s.position)).toEqual([0, 40, 100]);
    expect(buildGradientValue(model({ stops: moved }))).toBe(
      'linear-gradient(90deg, #00ff00 0%, #ff0000 40%, #0000ff 100%)',
    );
  });

  test('moveStop down mirrors moveStop up', () => {
    const stops = stopsFrom(['#ff0000', 0], ['#00ff00', 40], ['#0000ff', 100]);
    const moved = moveStop(stops, 'stop-1', 'down');
    expect(moved.map((s) => s.id)).toEqual(['stop-2', 'stop-1', 'stop-3']);
    expect(moveStop(moved, 'stop-1', 'up')).toEqual(stops);
  });

  test('moveStop on the first row up or the last row down changes nothing', () => {
    const stops = stopsFrom(['#ff0000', 0], ['#0000ff', 100]);
    expect(moveStop(stops, 'stop-1', 'up')).toBe(stops);
    expect(moveStop(stops, 'stop-2', 'down')).toBe(stops);
    expect(moveStop(stops, 'missing', 'down')).toBe(stops);
  });

  test('moveStop flips the colours on either side of a hard stop', () => {
    const stops = stopsFrom(['#ff0000', 50], ['#0000ff', 50]);
    const moved = moveStop(stops, 'stop-2', 'up');
    expect(buildGradientValue(model({ stops: moved }))).toBe(
      'linear-gradient(90deg, #0000ff 50%, #ff0000 50%)',
    );
  });

  test('updateStop changes only the named stop and sanitises the values', () => {
    const stops = stopsFrom(['#ff0000', 0], ['#0000ff', 100]);
    const next = updateStop(stops, 'stop-2', { position: 250, color: '#ABC' });
    expect(next[0]).toEqual(stops[0]);
    expect(next[1]).toEqual({ id: 'stop-2', color: '#aabbcc', position: 100 });
    expect(stops[1].position).toBe(100);
  });
});

test.describe('repeatsVisibly', () => {
  test('a repeating gradient that spans 0 to 100 shows no repeat', () => {
    expect(repeatsVisibly(model({ repeating: true }))).toBe(false);
  });

  test('a repeating gradient that ends before 100 does repeat', () => {
    expect(
      repeatsVisibly(model({ repeating: true, stops: stopsFrom(['#ff0000', 0], ['#0000ff', 25]) })),
    ).toBe(true);
  });

  test('a repeating gradient that starts after 0 does repeat', () => {
    expect(
      repeatsVisibly(model({ repeating: true, stops: stopsFrom(['#ff0000', 10], ['#0000ff', 100]) })),
    ).toBe(true);
  });

  test('a plain gradient never reports a repeat', () => {
    expect(repeatsVisibly(model({ stops: stopsFrom(['#ff0000', 0], ['#0000ff', 25]) }))).toBe(false);
  });
});

test.describe('presets and randomise', () => {
  test('there are a few presets covering every type, repeating included', () => {
    expect(GRADIENT_PRESETS.length).toBeGreaterThanOrEqual(5);
    const types = new Set(GRADIENT_PRESETS.map((p) => p.model.type));
    expect(types).toEqual(new Set(['linear', 'radial', 'conic']));
    expect(GRADIENT_PRESETS.some((p) => p.model.repeating)).toBe(true);
  });

  test('every preset is valid, with unique ids and at least two stops', () => {
    const names = new Set<string>();
    for (const preset of GRADIENT_PRESETS) {
      expect(names.has(preset.name), preset.name).toBe(false);
      names.add(preset.name);
      expect(preset.model.stops.length, preset.name).toBeGreaterThanOrEqual(MIN_STOPS);
      expect(new Set(preset.model.stops.map((s) => s.id)).size, preset.name).toBe(
        preset.model.stops.length,
      );
      expect(buildGradientValue(preset.model), preset.name).toMatch(
        /^(repeating-)?(linear|radial|conic)-gradient\(.+\)$/,
      );
    }
  });

  test('repeating presets really repeat', () => {
    for (const preset of GRADIENT_PRESETS.filter((p) => p.model.repeating)) {
      expect(repeatsVisibly(preset.model), preset.name).toBe(true);
    }
  });

  test('the default model is a plain two-stop linear gradient', () => {
    const fresh = createDefaultModel();
    expect(fresh.type).toBe('linear');
    expect(fresh.repeating).toBe(false);
    expect(fresh.stops).toHaveLength(2);
    expect(createDefaultModel()).toEqual(fresh);
    expect(createDefaultModel().stops).not.toBe(fresh.stops);
  });

  test('randomGradient is repeatable for the same generator', () => {
    const a = randomGradient(createDefaultModel(), seeded(42));
    const b = randomGradient(createDefaultModel(), seeded(42));
    expect(a).toEqual(b);
    expect(randomGradient(createDefaultModel(), seeded(43))).not.toEqual(a);
  });

  test('randomGradient always returns a valid model and keeps type and repeating', () => {
    const rng = seeded(7);
    for (const type of ['linear', 'radial', 'conic'] as const) {
      for (const repeating of [false, true]) {
        for (let i = 0; i < 40; i++) {
          const start = model({ type, repeating });
          const next = randomGradient(start, rng);
          expect(next.type).toBe(type);
          expect(next.repeating).toBe(repeating);
          expect(next.stops.length).toBeGreaterThanOrEqual(MIN_STOPS);
          expect(next.stops.length).toBeLessThanOrEqual(MAX_STOPS);
          expect(new Set(next.stops.map((s) => s.id)).size).toBe(next.stops.length);
          for (const stop of next.stops) {
            expect(stop.color).toMatch(/^#[0-9a-f]{6}$/);
            expect(stop.position).toBeGreaterThanOrEqual(0);
            expect(stop.position).toBeLessThanOrEqual(100);
          }
          const positions = next.stops.map((s) => s.position);
          expect(positions).toEqual([...positions].sort((x, y) => x - y));
          expect(next.angle).toBeGreaterThanOrEqual(0);
          expect(next.angle).toBeLessThanOrEqual(360);
          if (repeating) expect(repeatsVisibly(next)).toBe(true);
        }
      }
    }
  });

  test('randomGradient survives a generator that returns exactly 1', () => {
    const next = randomGradient(createDefaultModel(), () => 1);
    expect(buildGradientValue(next)).toMatch(/^linear-gradient\(/);
    expect(next.stops.length).toBeLessThanOrEqual(MAX_STOPS);
  });

  test('randomGradient does not modify the model it was given', () => {
    const start = createDefaultModel();
    const snapshot = JSON.parse(JSON.stringify(start));
    randomGradient(start, seeded(1));
    expect(start).toEqual(snapshot);
  });
});
