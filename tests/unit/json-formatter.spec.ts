import { test, expect } from '@playwright/test';
import {
  parseJson,
  queryJson,
  renderJson,
  stringifyJson,
  validateJson,
} from '@/lib/tools/json-formatter';

// 2^53 + 1: the first integer a double cannot hold. JSON.parse reads it as
// 9007199254740992.
const UNSAFE = '9007199254740993';

// Built from code points so the source holds no invisible characters.
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const LINE_SEPARATOR = String.fromCharCode(0x2028);

/** Small deterministic generator, so the comparison runs are repeatable. */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function randomValue(random: () => number, depth: number): unknown {
  const pick = Math.floor(random() * (depth > 3 ? 6 : 8));
  switch (pick) {
    case 0:
      return null;
    case 1:
      return random() > 0.5;
    case 2:
      return Math.floor(random() * 2000) - 1000;
    case 3:
      return (random() - 0.5) * 1e6;
    case 4:
      return ['', 'plain', 'quote " and \\ slash', 'line\nbreak\ttab', `ünï 😀 ${LINE_SEPARATOR}`, '1234567890123456'][
        Math.floor(random() * 6)
      ];
    case 5:
      return [1e21, -0, 1.5e-7, 123456789012345][Math.floor(random() * 4)];
    case 6:
      return Array.from({ length: Math.floor(random() * 4) }, () => randomValue(random, depth + 1));
    default: {
      const object: Record<string, unknown> = {};
      const count = Math.floor(random() * 4);
      for (let index = 0; index < count; index += 1) {
        object[['a', 'b c', '', 'ключ', '"q"', 'x.y'][Math.floor(random() * 6)]] = randomValue(
          random,
          depth + 1
        );
      }
      return object;
    }
  }
}

test.describe('parseJson', () => {
  test('parses ordinary JSON like JSON.parse', () => {
    const text = '{"name":"Ada","roles":["Admin","Editor"],"age":36,"ok":true,"none":null}';

    expect(parseJson(text)).toEqual(JSON.parse(text));
  });

  test('keeps an integer too large for a double as a bigint', () => {
    expect(JSON.parse(`{"id":${UNSAFE}}`).id).toBe(9007199254740992);

    expect(parseJson(`{"id":${UNSAFE}}`)).toEqual({ id: BigInt(UNSAFE) });
    expect(parseJson(`[-${UNSAFE}, 1]`)).toEqual([-BigInt(UNSAFE), 1]);
    expect(parseJson('123456789012345678901234567890')).toBe(BigInt('123456789012345678901234567890'));
  });

  test('leaves integers a double holds exactly as numbers', () => {
    expect(parseJson('9007199254740991')).toBe(9007199254740991);
    expect(parseJson('[1234567890123456, 0, -5]')).toEqual([1234567890123456, 0, -5]);
  });

  test('does not mistake long digits in a string or a decimal for an integer', () => {
    expect(parseJson(`{"card":"${UNSAFE}","pi":3.14159265358979323846,"big":1e30}`)).toEqual({
      card: UNSAFE,
      pi: 3.141592653589793,
      big: 1e30,
    });
    // The same with a real large integer next to them.
    expect(parseJson(`{"card":"${UNSAFE}","pi":3.14159265358979323846,"id":${UNSAFE}}`)).toEqual({
      card: UNSAFE,
      pi: 3.141592653589793,
      id: BigInt(UNSAFE),
    });
  });

  test('finds a large integer wherever JSON allows a value', () => {
    const big = BigInt(UNSAFE);

    expect(parseJson(UNSAFE)).toBe(big);
    expect(parseJson(` ${UNSAFE}\n`)).toBe(big);
    expect(parseJson(`[${UNSAFE}]`)).toEqual([big]);
    expect(parseJson(`[1,${UNSAFE},-${UNSAFE}]`)).toEqual([1, big, -big]);
    expect(parseJson(`{"a":${UNSAFE}}`)).toEqual({ a: big });
    expect(parseJson(`{"a":\t${UNSAFE}\r\n}`)).toEqual({ a: big });
    expect(parseJson(`{"a":{"b":[{"c":-${UNSAFE}}]}}`)).toEqual({ a: { b: [{ c: -big }] } });
  });

  test('matches JSON.parse on the slow path for every kind of value', () => {
    const random = createRandom(20260110);

    for (let run = 0; run < 200; run += 1) {
      const data = randomValue(random, 0);
      for (const indent of [undefined, 2, '\t']) {
        // The large integer in front sends the whole text through the lossless reader.
        const text = `{"force":${UNSAFE},"data":${JSON.stringify(data, null, indent)}}`;
        const parsed = parseJson(text) as { force: unknown; data: unknown };

        expect(parsed.force).toBe(BigInt(UNSAFE));
        expect(parsed.data).toEqual(JSON.parse(text).data);
      }
    }
  });

  test('reads escapes, surrogate pairs and awkward whitespace on the slow path', () => {
    const text = ` \n\t{ "k\\u00e9y" : "a\\"b\\\\c\\n\\ud83d\\ude00" ,\r\n "n" : [ ${UNSAFE} , -0.5e+2 , [ ] , { } ] } `;

    expect(parseJson(text)).toEqual({ 'kéy': 'a"b\\c\n😀', n: [BigInt(UNSAFE), -50, [], {}] });
  });

  test('stores a "__proto__" key as data instead of changing the prototype', () => {
    const parsed = parseJson(`{"__proto__":{"polluted":true},"id":${UNSAFE}}`) as Record<string, unknown>;

    expect(Object.keys(parsed)).toEqual(['__proto__', 'id']);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test('accepts text that starts with a byte order mark', () => {
    expect(parseJson(`${BYTE_ORDER_MARK}{"a":1}`)).toEqual({ a: 1 });
  });

  test('throws a SyntaxError on invalid JSON', () => {
    expect(() => parseJson('{"a":}')).toThrow(SyntaxError);
    expect(() => parseJson(`{"id":${UNSAFE},}`)).toThrow(SyntaxError);
    expect(() => parseJson("{'a':1}")).toThrow(SyntaxError);
  });

  test('survives nesting deeper than the call stack by falling back', () => {
    const depth = 200000;
    const text = `${'['.repeat(depth)}${UNSAFE}${']'.repeat(depth)}`;
    try {
      JSON.parse(text);
    } catch {
      test.skip(true, 'this runtime cannot parse the text natively either');
    }

    // Walk down by hand: a recursive comparison would overflow as well.
    let value = parseJson(text);
    let levels = 0;
    while (Array.isArray(value)) {
      value = value[0];
      levels += 1;
    }

    // Either reader may have produced the leaf; what matters is an answer.
    expect(levels).toBe(depth);
    expect(['number', 'bigint']).toContain(typeof value);
  });
});

test.describe('stringifyJson', () => {
  test('matches JSON.stringify when there is no bigint', () => {
    const random = createRandom(7);

    for (let run = 0; run < 100; run += 1) {
      const value = randomValue(random, 0);
      for (const indent of [undefined, 2, 4, '\t']) {
        expect(stringifyJson(value, indent)).toBe(JSON.stringify(value, null, indent) ?? 'null');
      }
    }
  });

  test('writes a bigint as a bare integer', () => {
    expect(stringifyJson({ id: BigInt(UNSAFE), list: [-BigInt(UNSAFE)] })).toBe(
      `{"id":${UNSAFE},"list":[-${UNSAFE}]}`
    );
    expect(stringifyJson({ id: BigInt(UNSAFE) }, 2)).toBe(`{\n  "id": ${UNSAFE}\n}`);
    expect(stringifyJson(BigInt(5))).toBe('5');
  });

  test('round-trips a large integer exactly', () => {
    const text = `{"id":${UNSAFE},"name":"x"}`;

    expect(stringifyJson(parseJson(text))).toBe(text);
  });

  test('leaves strings alone that look like the marker it uses', () => {
    const value = { note: '@bigint@7@bigint@', '@bigint@': '@bigint@@', id: BigInt(UNSAFE) };

    expect(stringifyJson(value)).toBe(
      `{"note":"@bigint@7@bigint@","@bigint@":"@bigint@@","id":${UNSAFE}}`
    );
  });

  test('keeps a string of digits quoted next to a bigint', () => {
    expect(stringifyJson({ text: UNSAFE, id: BigInt(UNSAFE) })).toBe(
      `{"text":"${UNSAFE}","id":${UNSAFE}}`
    );
  });

  test('gives "null" for a value with no JSON form', () => {
    expect(stringifyJson(undefined)).toBe('null');
  });

  test('still writes dates through toJSON', () => {
    expect(stringifyJson({ at: new Date('2024-01-01T00:00:00Z'), id: BigInt(1) })).toBe(
      '{"at":"2024-01-01T00:00:00.000Z","id":1}'
    );
  });
});

test.describe('validateJson', () => {
  test('returns null for empty and whitespace-only text', () => {
    expect(validateJson('')).toBeNull();
    expect(validateJson('  \n\t ')).toBeNull();
  });

  test('summarises arrays, objects and primitives', () => {
    expect(validateJson('[1,2,3]')).toMatchObject({ valid: true, summary: 'Array with 3 items', error: '' });
    expect(validateJson('[1]')).toMatchObject({ summary: 'Array with 1 item' });
    expect(validateJson('[]')).toMatchObject({ summary: 'Array with 0 items' });
    expect(validateJson('{"a":1}')).toMatchObject({ summary: 'Object with 1 key' });
    expect(validateJson('{"a":1,"b":2}')).toMatchObject({ summary: 'Object with 2 keys' });
    expect(validateJson('"hi"')).toMatchObject({ summary: 'Primitive (string)' });
    expect(validateJson('0')).toMatchObject({ summary: 'Primitive (number)', value: 0 });
    expect(validateJson('-12.5')).toMatchObject({ summary: 'Primitive (number)', value: -12.5 });
    expect(validateJson('false')).toMatchObject({ summary: 'Primitive (boolean)', value: false });
    expect(validateJson('null')).toMatchObject({ valid: true, summary: 'Primitive (null)', value: null });
  });

  test('calls a large integer a number', () => {
    expect(validateJson(UNSAFE)).toMatchObject({ valid: true, summary: 'Primitive (number)' });
  });

  test('reports the parser message for invalid JSON', () => {
    const result = validateJson('{"a": 1,}');

    expect(result).toMatchObject({ valid: false, value: null, summary: '' });
    expect(result?.error).toBeTruthy();
  });

  test('handles Unicode and emoji', () => {
    expect(validateJson('{"emoji":"😀","text":"naïve — 日本語"}')).toMatchObject({
      valid: true,
      value: { emoji: '😀', text: 'naïve — 日本語' },
    });
  });
});

test.describe('queryJson', () => {
  const data = {
    name: 'Ada',
    roles: ['Admin', 'Editor'],
    users: [
      { name: 'A', roles: ['r1', 'r2'], address: { city: 'X' } },
      { name: 'B', roles: ['r3'] },
    ],
    matrix: [
      [1, 2],
      [3, 4],
    ],
    'odd key': 1,
    'a.b': 2,
    'x]y': 3,
    '': 'empty key',
    $ref: '#/defs/a',
    '0': 'zero',
    zero: 0,
    off: false,
    nothing: null,
  };

  test('returns the whole document for an empty path or a bare "$"', () => {
    expect(queryJson(data, '')).toBe(data);
    expect(queryJson(data, '   ')).toBe(data);
    expect(queryJson(data, '$')).toBe(data);
  });

  test('follows dot paths with and without the "$" root', () => {
    expect(queryJson(data, 'name')).toBe('Ada');
    expect(queryJson(data, '$.name')).toBe('Ada');
    expect(queryJson(data, 'users.0.address.city')).toBe('X');
  });

  test('follows a single bracket index', () => {
    expect(queryJson(data, '$.roles[0]')).toBe('Admin');
    expect(queryJson(data, 'roles[1]')).toBe('Editor');
    expect(queryJson([10, 20], '$[1]')).toBe(20);
  });

  // The old tokenizer swallowed everything between the first "[" and the
  // last "]" as one token, so any path with two brackets stopped at the first.
  test('follows several brackets in one path', () => {
    expect(queryJson(data, 'matrix[1][0]')).toBe(3);
    expect(queryJson(data, 'users[0].roles[1]')).toBe('r2');
    expect(queryJson(data, '$.users[1].roles[0]')).toBe('r3');
    expect(queryJson(data, 'users[0]["address"]["city"]')).toBe('X');
  });

  test('reads quoted keys, including ones with dots, brackets and spaces', () => {
    expect(queryJson(data, '["odd key"]')).toBe(1);
    expect(queryJson(data, "$['a.b']")).toBe(2);
    expect(queryJson(data, '["x]y"]')).toBe(3);
    expect(queryJson(data, '[""]')).toBe('empty key');
    expect(queryJson(data, 'odd key')).toBe(1);
  });

  test('treats "$" as part of the key when no step follows it', () => {
    expect(queryJson(data, '$ref')).toBe('#/defs/a');
    expect(queryJson(data, '$.$ref')).toBe('#/defs/a');
  });

  test('reads a numeric key from an object', () => {
    expect(queryJson(data, '[0]')).toBe('zero');
    expect(queryJson(data, '0')).toBe('zero');
  });

  test('returns falsy values that exist', () => {
    expect(queryJson(data, 'zero')).toBe(0);
    expect(queryJson(data, 'off')).toBe(false);
    expect(queryJson(data, 'nothing')).toBeNull();
  });

  test('maps a key across the items of an array', () => {
    expect(queryJson(data, 'users.name')).toEqual(['A', 'B']);
    expect(queryJson(data, 'users.address')).toEqual([{ city: 'X' }, undefined]);
  });

  test('finds nothing when no item of the array has the key', () => {
    expect(queryJson(data, 'users.nmae')).toBeUndefined();
    expect(queryJson(data, 'roles.length')).toBeUndefined();
    expect(queryJson(data, 'matrix.length')).toBeUndefined();
  });

  test('finds nothing past the end, below a scalar or under null', () => {
    expect(queryJson(data, 'roles[5]')).toBeUndefined();
    expect(queryJson(data, 'roles[-1]')).toBeUndefined();
    expect(queryJson(data, 'name.first')).toBeUndefined();
    expect(queryJson(data, 'nothing.more')).toBeUndefined();
    expect(queryJson(data, 'missing')).toBeUndefined();
  });

  test('does not index an array with a key that only starts with digits', () => {
    expect(queryJson(data, 'roles.1abc')).toBeUndefined();
    expect(queryJson(data, 'roles["0"]')).toBeUndefined();
  });

  // Reading inherited members returned functions, which have no JSON form:
  // the output went blank and no "not found" message appeared.
  test('ignores inherited members such as "constructor" and "toString"', () => {
    expect(queryJson(data, 'constructor')).toBeUndefined();
    expect(queryJson(data, 'toString')).toBeUndefined();
    expect(queryJson(data, '__proto__')).toBeUndefined();
    expect(queryJson(data, 'users.constructor')).toBeUndefined();
    expect(queryJson({ constructor: 'own' }, 'constructor')).toBe('own');
  });

  test('tolerates a path that is still being typed', () => {
    expect(queryJson(data, 'roles[')).toEqual(['Admin', 'Editor']);
    expect(queryJson(data, 'roles[0')).toBe('Admin');
    expect(queryJson(data, 'users.')).toBe(data.users);
  });
});

test.describe('renderJson', () => {
  const value = { name: 'Ada', roles: ['Admin', 'Editor'] };

  test('formats with spaces, tabs or on one line', () => {
    expect(renderJson(value, { indent: 2 }).text).toBe(JSON.stringify(value, null, 2));
    expect(renderJson(value, { indent: 4 }).text).toBe(JSON.stringify(value, null, 4));
    expect(renderJson(value, { indent: '\t' }).text).toBe(JSON.stringify(value, null, '\t'));
    expect(renderJson(value, { indent: 2, minify: true }).text).toBe('{"name":"Ada","roles":["Admin","Editor"]}');
  });

  test('returns the selected value alongside its text', () => {
    expect(renderJson(value, { path: 'roles[1]', indent: 2 })).toEqual({
      text: '"Editor"',
      error: '',
      value: 'Editor',
    });
  });

  test('reports a path that matches nothing', () => {
    expect(renderJson(value, { path: 'rolez', indent: 2 })).toEqual({
      text: '',
      error: 'No matching properties found for path: "rolez"',
      value: null,
    });
    expect(renderJson(value, { path: 'constructor' }).error).toContain('No matching properties');
  });

  test('ignores a blank path', () => {
    expect(renderJson(value, { path: '  ', minify: true }).text).toBe(JSON.stringify(value));
  });

  test('writes falsy documents', () => {
    expect(renderJson(0, { indent: 2 })).toEqual({ text: '0', error: '', value: 0 });
    expect(renderJson(null, { indent: 2 })).toEqual({ text: 'null', error: '', value: null });
    expect(renderJson('', { indent: 2 })).toEqual({ text: '""', error: '', value: '' });
    expect(renderJson([], { indent: 2 }).text).toBe('[]');
  });

  // Formatting used to change the last digits of 64-bit ids.
  test('formats and minifies a large integer without rounding it', () => {
    const parsed = validateJson(`{"id": ${UNSAFE}, "ids": [${UNSAFE}]}`);

    expect(renderJson(parsed?.value, { indent: 2 }).text).toBe(
      `{\n  "id": ${UNSAFE},\n  "ids": [\n    ${UNSAFE}\n  ]\n}`
    );
    expect(renderJson(parsed?.value, { minify: true }).text).toBe(`{"id":${UNSAFE},"ids":[${UNSAFE}]}`);
    expect(renderJson(parsed?.value, { path: 'ids[0]' }).text).toBe(UNSAFE);
  });

  test('writes null for array items a mapped key did not find', () => {
    const users = [{ name: 'A', age: 1 }, { name: 'B' }];

    expect(renderJson(users, { path: 'age', minify: true }).text).toBe('[1,null]');
  });
});
