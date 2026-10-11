import { test, expect } from '@playwright/test';
import {
  SAMPLE_LEFT,
  SAMPLE_RIGHT,
  compareJsonText,
  describeJson,
  diffJson,
  displayPath,
  escapePointerToken,
  formatPatch,
  formatReport,
  formatValue,
  parseJson,
  type DiffOptions,
  type DiffResult,
  type JsonPatchOperation,
  type JsonValue,
} from '@/lib/tools/json-diff';

// ---------------------------------------------------------------------------
// Helpers. The patch applier and the pointer resolver are written here, apart
// from the module, so the module's patches are checked by code that did not
// produce them.
// ---------------------------------------------------------------------------

const parse = (text: string): JsonValue => JSON.parse(text) as JsonValue;

function diff(left: string, right: string, options?: DiffOptions): DiffResult {
  return diffJson(parse(left), parse(right), options);
}

/** "kind path" for every non-unchanged entry, in report order. */
function summarise(result: DiffResult): string[] {
  return result.entries
    .filter((entry) => entry.kind !== 'unchanged')
    .map((entry) => `${entry.kind} ${entry.path}`);
}

function pointerTokens(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`Bad pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function arrayIndex(token: string, length: number, allowEnd: boolean): number {
  if (allowEnd && token === '-') return length;
  if (!/^(0|[1-9]\d*)$/.test(token)) throw new Error(`Bad array index: ${token}`);
  return Number(token);
}

function setMember(target: Record<string, JsonValue>, key: string, value: JsonValue): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/** RFC 6902 add, remove and replace against a deep copy of `document`. */
function applyPatch(document: JsonValue, patch: JsonPatchOperation[]): JsonValue {
  let result = structuredClone(document);
  for (const operation of patch) {
    const tokens = pointerTokens(operation.path);
    if (tokens.length === 0) {
      if (operation.op === 'remove') throw new Error('Cannot remove the root');
      result = structuredClone(operation.value);
      continue;
    }
    let parent: JsonValue = result;
    for (const token of tokens.slice(0, -1)) {
      if (Array.isArray(parent)) {
        parent = parent[arrayIndex(token, parent.length, false)];
      } else if (parent !== null && typeof parent === 'object') {
        if (!Object.prototype.hasOwnProperty.call(parent, token)) {
          throw new Error(`Missing path segment ${token} in ${operation.path}`);
        }
        parent = parent[token];
      } else {
        throw new Error(`Cannot descend into a scalar at ${operation.path}`);
      }
    }
    const last = tokens[tokens.length - 1];
    const value = operation.op === 'remove' ? null : structuredClone(operation.value);
    if (Array.isArray(parent)) {
      const index = arrayIndex(last, parent.length, operation.op === 'add');
      if (operation.op === 'add') {
        if (index > parent.length) throw new Error(`Index ${index} is past the end`);
        parent.splice(index, 0, value);
      } else {
        if (index >= parent.length) throw new Error(`Index ${index} does not exist`);
        if (operation.op === 'remove') parent.splice(index, 1);
        else parent[index] = value;
      }
    } else if (parent !== null && typeof parent === 'object') {
      const exists = Object.prototype.hasOwnProperty.call(parent, last);
      if (operation.op === 'add') {
        setMember(parent, last, value);
      } else {
        if (!exists) throw new Error(`Member ${last} does not exist`);
        if (operation.op === 'remove') delete parent[last];
        else setMember(parent, last, value);
      }
    } else {
      throw new Error(`Cannot modify a scalar at ${operation.path}`);
    }
  }
  return result;
}

/** Look a pointer up in a document (RFC 6901 section 4). */
function resolvePointer(document: JsonValue, pointer: string): JsonValue {
  let current = document;
  for (const token of pointerTokens(pointer)) {
    if (Array.isArray(current)) current = current[arrayIndex(token, current.length, false)];
    else if (current !== null && typeof current === 'object') current = current[token];
    else throw new Error(`Cannot resolve ${pointer}`);
  }
  return current;
}

/** Arrays sorted by their text, keys sorted: equal when the documents match up to array order. */
function normalise(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value
      .map(normalise)
      .sort((a, b) => {
        const x = JSON.stringify(a);
        const y = JSON.stringify(b);
        return x < y ? -1 : x > y ? 1 : 0;
      });
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) setMember(sorted, key, normalise(value[key]));
    return sorted;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test.describe('parseJson', () => {
  test('parses every JSON value type', () => {
    const cases: Array<[string, JsonValue]> = [
      ['null', null],
      ['true', true],
      ['false', false],
      ['0', 0],
      ['-12.5e2', -1250],
      ['"hi"', 'hi'],
      ['"a\\n\\u00e9\\/"', 'a\né/'],
      ['[]', []],
      ['{}', {}],
      [' \n\t[1, {"a": [null]}] \r\n', [1, { a: [null] }]],
    ];
    for (const [text, expected] of cases) {
      const result = parseJson(text);
      expect(result.ok, text).toBe(true);
      if (result.ok) expect(result.value, text).toEqual(expected);
    }
  });

  test('agrees with JSON.parse on what is valid and on the values', () => {
    const corpus = [
      '', ' ', '{', '}', '[', ']', '[]', '{}', '{"a":1}', '{"a":1,}', '[1,]', '[,1]', '[1,,2]',
      '{"a" 1}', '{"a":}', '{:1}', '{"a":1 "b":2}', "{'a':1}", "['a']", '"abc', '"a\\x"', '"\\u12"',
      '"\\u12G4"', '"\\ud800"', '"tab\there"', '"line\nbreak"', '"\u007f"', '" "',
      '01', '-01', '+1', '.5', '5.', '1.e3', '1e', '1e+', '-', '--1', '0x10', '1e5', '1E-5', '-0',
      '0.0', '123456789012345678901234567890', 'true', 'tru', 'truee', 'True', 'nul', 'null null',
      'NaN', 'Infinity', 'undefined', '[1 2]', '{"a":1}}', '[[[]]]', '{"a":{"b":{"c":[1,2,3]}}}',
      '{"a":1,"a":2}', '"\\"quoted\\""', '[true,false,null,0,"x"]', '/* c */ 1', '// c\n1',
      '{"__proto__":1}', ' 1', '1 ',
    ];
    for (const text of corpus) {
      let expected: { ok: true; value: JsonValue } | { ok: false };
      try {
        expected = { ok: true, value: parse(text) };
      } catch {
        expected = { ok: false };
      }
      const actual = parseJson(text);
      expect(actual.ok, JSON.stringify(text)).toBe(expected.ok);
      if (actual.ok && expected.ok) expect(actual.value, JSON.stringify(text)).toEqual(expected.value);
    }
  });

  test('reports line, column and position for a missing comma on a later line', () => {
    const result = parseJson('{\n  "a": 1\n  "b": 2\n}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.position).toBe(13);
      expect(result.error.line).toBe(3);
      expect(result.error.column).toBe(3);
      expect(result.error.message).toContain("','");
    }
  });

  test('names a trailing comma', () => {
    for (const [text, position] of [['{"a":1,}', 7], ['[1,2,]', 5]] as const) {
      const result = parseJson(text);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/trailing comma/i);
        expect(result.error.position).toBe(position);
        expect(result.error.line).toBe(1);
        expect(result.error.column).toBe(position + 1);
      }
    }
  });

  test('puts the error where the input stops, where it is cut short', () => {
    const result = parseJson('[1, 2');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/end of JSON input/i);
      expect(result.error.position).toBe(5);
      expect(result.error.column).toBe(6);
    }
  });

  test('explains common mistakes', () => {
    const cases: Array<[string, RegExp, number]> = [
      ["{'a': 1}", /double quotes/i, 1],
      ['{"a": \'x\'}', /double quotes/i, 6],
      ['{"a": 01}', /leading zero/i, 7],
      ['[1.]', /digit after the decimal point/i, 3],
      ['[1e]', /digit in the exponent/i, 3],
      ['-', /digit/i, 1],
      ['"abc', /unterminated/i, 0],
      ['"a\\x"', /invalid escape/i, 2],
      ['"\\u12G4"', /\\u/i, 5],
      ['"a\nb"', /control character/i, 2],
      ['{"a" 1}', /':'/, 5],
      ['{"a":1} x', /after the JSON value/i, 8],
      ['[tru]', /unexpected character/i, 4],
      ['NaN', /unexpected character/i, 0],
      ['{1:2}', /property name/i, 1],
    ];
    for (const [text, pattern, position] of cases) {
      const result = parseJson(text);
      expect(result.ok, text).toBe(false);
      if (!result.ok) {
        expect(result.error.message, text).toMatch(pattern);
        expect(result.error.position, text).toBe(position);
      }
    }
  });

  test('rejects empty input and numbers that overflow', () => {
    const empty = parseJson('   ');
    expect(empty.ok).toBe(false);
    const huge = parseJson('[1e999]');
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.error.message).toMatch(/too large/i);
  });

  test('accepts a byte order mark and counts positions from the original text', () => {
    const result = parseJson('﻿[1]');
    expect(result.ok).toBe(true);
    const broken = parseJson('﻿[1,]');
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error.position).toBe(4);
  });

  test('stops at a nesting depth instead of overflowing the stack', () => {
    const result = parseJson('['.repeat(100000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/deep/i);
  });

  test('keeps a __proto__ member as plain data', () => {
    const result = parseJson('{"__proto__": {"x": 1}, "y": 2}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = result.value as Record<string, JsonValue>;
      expect(Object.keys(value)).toEqual(['__proto__', 'y']);
      expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
      expect(value.x).toBeUndefined();
    }
  });

  test('counts numbers a 64-bit float cannot hold exactly', () => {
    const lossy = parseJson('[9007199254740993, 12345678901234567890, 0.1, 1e21, 100000000000000]');
    expect(lossy.ok && lossy.lossyNumbers).toBe(2);
    const safe = parseJson('[1, 2.5, 123456789012345, 1e300]');
    expect(safe.ok && safe.lossyNumbers).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// JSON Pointer
// ---------------------------------------------------------------------------

test.describe('JSON Pointer escaping', () => {
  test('escapes ~ as ~0 and / as ~1', () => {
    expect(escapePointerToken('plain')).toBe('plain');
    expect(escapePointerToken('a/b')).toBe('a~1b');
    expect(escapePointerToken('m~n')).toBe('m~0n');
    expect(escapePointerToken('/')).toBe('~1');
    expect(escapePointerToken('~')).toBe('~0');
  });

  test('escapes ~ before / so a literal "~1" does not become "/"', () => {
    expect(escapePointerToken('~1')).toBe('~01');
    expect(escapePointerToken('~/')).toBe('~0~1');
    expect(escapePointerToken('/~')).toBe('~1~0');
    expect(escapePointerToken('a~/b~0')).toBe('a~0~1b~00');
  });

  test('uses escaped keys in diff paths', () => {
    expect(summarise(diff('{"a/b":1,"m~n":1,"~1":1}', '{"a/b":2,"m~n":2,"~1":2}'))).toEqual([
      'changed /a~1b',
      'changed /m~0n',
      'changed /~01',
    ]);
    const nested = diff('{"a/b":{"c~d":[1]}}', '{"a/b":{"c~d":[2]}}');
    expect(summarise(nested)).toEqual(['changed /a~1b/c~0d/0']);
  });

  test('matches the RFC 6901 section 5 example document', () => {
    const document: JsonValue = {
      foo: ['bar', 'baz'],
      '': 0,
      'a/b': 1,
      'c%d': 2,
      'e^f': 3,
      'g|h': 4,
      'i\\j': 5,
      'k"l': 6,
      ' ': 7,
      'm~n': 8,
    };
    const changed: JsonValue = {
      foo: ['BAR', 'BAZ'],
      '': 100,
      'a/b': 101,
      'c%d': 102,
      'e^f': 103,
      'g|h': 104,
      'i\\j': 105,
      'k"l': 106,
      ' ': 107,
      'm~n': 108,
    };
    const result = diffJson(document, changed);
    const published = ['/foo/0', '/foo/1', '/', '/a~1b', '/c%d', '/e^f', '/g|h', '/i\\j', '/k"l', '/ ', '/m~0n'];
    expect(result.entries.map((entry) => entry.path).sort()).toEqual([...published].sort());
    // Each path points at the member the RFC says it does.
    expect(resolvePointer(document, '/foo/0')).toBe('bar');
    expect(resolvePointer(document, '/')).toBe(0);
    expect(resolvePointer(document, '/a~1b')).toBe(1);
    expect(resolvePointer(document, '/m~0n')).toBe(8);
    for (const entry of result.entries) {
      if (entry.kind !== 'changed') throw new Error('expected only changes');
      expect(resolvePointer(document, entry.path)).toEqual(entry.oldValue);
      expect(resolvePointer(changed, entry.path)).toEqual(entry.newValue);
    }
    expect(applyPatch(document, result.patch)).toEqual(changed);
  });

  test('shows the root as (root) and every other path unchanged', () => {
    expect(displayPath('')).toBe('(root)');
    expect(displayPath('/')).toBe('/');
    expect(displayPath('/a/0')).toBe('/a/0');
  });
});

// ---------------------------------------------------------------------------
// Structural comparison
// ---------------------------------------------------------------------------

test.describe('diffJson: objects', () => {
  test('identical documents have no differences', () => {
    const result = diff('{"a":1,"b":[1,2,{"c":null}]}', '{"a":1,"b":[1,2,{"c":null}]}');
    expect(result.summary.differences).toBe(0);
    expect(result.entries).toEqual([]);
    expect(result.patch).toEqual([]);
  });

  test('key order is never a difference', () => {
    const result = diff('{"a":1,"b":{"x":1,"y":2},"c":[1]}', '{"c":[1],"b":{"y":2,"x":1},"a":1}');
    expect(result.summary.differences).toBe(0);
    expect(result.patch).toEqual([]);
    // Nor does it change the order of the report.
    const one = diff('{"a":1,"b":2}', '{"b":3,"a":2}');
    const two = diff('{"b":2,"a":1}', '{"a":3,"b":2}');
    expect(summarise(one)).toEqual(['changed /a', 'changed /b']);
    expect(summarise(two)).toEqual(['changed /a']);
  });

  test('finds added, removed and changed members at every depth', () => {
    const result = diff(
      '{"user":{"name":"Ada","age":36,"address":{"city":"London"}},"old":true}',
      '{"user":{"name":"Ada","age":37,"address":{"city":"Cambridge","zip":"CB1"}},"new":false}'
    );
    expect(summarise(result)).toEqual([
      'added /new',
      'removed /old',
      'changed /user/address/city',
      'added /user/address/zip',
      'changed /user/age',
    ]);
    expect(result.summary).toMatchObject({ added: 2, removed: 1, changed: 2, typeChanged: 0, differences: 5 });
  });

  test('carries the old and new values on each entry', () => {
    const result = diff('{"a":1,"b":"x","c":[1]}', '{"a":2,"d":{"e":1},"c":[1]}');
    expect(result.entries).toContainEqual({ kind: 'changed', path: '/a', oldValue: 1, newValue: 2 });
    expect(result.entries).toContainEqual({ kind: 'removed', path: '/b', oldValue: 'x' });
    expect(result.entries).toContainEqual({ kind: 'added', path: '/d', newValue: { e: 1 } });
  });

  test('an empty key is /, not the root', () => {
    const result = diff('{"":1}', '{"":2}');
    expect(summarise(result)).toEqual(['changed /']);
  });

  test('a __proto__ member is compared like any other', () => {
    const left = parseJson('{"__proto__": 1}');
    const right = parseJson('{"__proto__": 2}');
    expect(left.ok && right.ok).toBe(true);
    if (left.ok && right.ok) {
      const result = diffJson(left.value, right.value);
      expect(summarise(result)).toEqual(['changed /__proto__']);
    }
  });
});

test.describe('diffJson: arrays by index', () => {
  test('compares element by element', () => {
    const result = diff('[1,2,3]', '[1,9,3]');
    expect(summarise(result)).toEqual(['changed /1']);
  });

  test('the same elements in another order are different', () => {
    const result = diff('["a","b","c"]', '["c","b","a"]');
    expect(summarise(result)).toEqual(['changed /0', 'changed /2']);
  });

  test('extra elements on the right are added, on the left are removed', () => {
    expect(summarise(diff('[1]', '[1,2,3]'))).toEqual(['added /1', 'added /2']);
    expect(summarise(diff('[1,2,3]', '[1]'))).toEqual(['removed /1', 'removed /2']);
    expect(summarise(diff('[]', '[0]'))).toEqual(['added /0']);
  });

  test('recurses into elements', () => {
    const result = diff('{"rows":[{"id":1,"v":"a"},{"id":2,"v":"b"}]}', '{"rows":[{"id":1,"v":"a"},{"id":2,"v":"c"}]}');
    expect(summarise(result)).toEqual(['changed /rows/1/v']);
  });

  test('removes trailing elements highest index first so the patch stays valid', () => {
    const result = diff('[1,2,3,4]', '[1]');
    expect(result.patch).toEqual([
      { op: 'remove', path: '/3' },
      { op: 'remove', path: '/2' },
      { op: 'remove', path: '/1' },
    ]);
    expect(applyPatch([1, 2, 3, 4], result.patch)).toEqual([1]);
  });

  test('adds trailing elements lowest index first', () => {
    const result = diff('[1]', '[1,"a","b"]');
    expect(result.patch).toEqual([
      { op: 'add', path: '/1', value: 'a' },
      { op: 'add', path: '/2', value: 'b' },
    ]);
  });
});

test.describe('diffJson: arrays with order ignored', () => {
  const ignore: DiffOptions = { ignoreArrayOrder: true };

  test('the same elements in another order are equal', () => {
    expect(diff('["a","b","c"]', '["c","b","a"]', ignore).summary.differences).toBe(0);
    expect(diff('{"x":[3,1,2]}', '{"x":[1,2,3]}', ignore).summary.differences).toBe(0);
  });

  test('is a multiset comparison: duplicates count', () => {
    const result = diff('[1,1,2]', '[1,2,2]', ignore);
    expect(result.summary).toMatchObject({ removed: 1, added: 1, differences: 2 });
    expect(diff('[1,1]', '[1]', ignore).summary).toMatchObject({ removed: 1, added: 0 });
  });

  test('reports elements present on one side only', () => {
    const result = diff('["a","b"]', '["c","b","a"]', ignore);
    expect(result.entries).toEqual([{ kind: 'added', path: '/0', newValue: 'c' }]);
  });

  test('removed paths point into the left document, added paths into the right one', () => {
    const result = diff('["x","keep"]', '["keep","y"]', ignore);
    expect(result.entries).toEqual([
      { kind: 'removed', path: '/0', oldValue: 'x' },
      { kind: 'added', path: '/1', newValue: 'y' },
    ]);
  });

  test('matches objects whatever their key order and nested array order', () => {
    const result = diff(
      '[{"id":1,"tags":["a","b"]},{"id":2,"tags":[]}]',
      '[{"tags":[],"id":2},{"tags":["b","a"],"id":1}]',
      ignore
    );
    expect(result.summary.differences).toBe(0);
  });

  test('pairs similar records so a changed field is reported, not a whole record', () => {
    const result = diff(
      '[{"id":1,"name":"Ada"},{"id":2,"name":"Grace"}]',
      '[{"id":2,"name":"Grace"},{"id":1,"name":"Ada L."}]',
      ignore
    );
    expect(result.entries).toEqual([{ kind: 'changed', path: '/0/name', oldValue: 'Ada', newValue: 'Ada L.' }]);
    // Without the option the same documents differ at every field.
    expect(diff(
      '[{"id":1,"name":"Ada"},{"id":2,"name":"Grace"}]',
      '[{"id":2,"name":"Grace"},{"id":1,"name":"Ada L."}]'
    ).summary.differences).toBe(4);
  });

  test('does not pair records with nothing in common', () => {
    const result = diff('[{"id":1,"name":"Ada"}]', '[{"id":2,"name":"Bob"}]', ignore);
    expect(result.summary).toMatchObject({ removed: 1, added: 1, changed: 0 });
  });

  test('leaves scalars as removed and added rather than changed', () => {
    const result = diff('[1,2,3]', '[3,2,4]', ignore);
    expect(result.entries).toEqual([
      { kind: 'removed', path: '/0', oldValue: 1 },
      { kind: 'added', path: '/2', newValue: 4 },
    ]);
  });

  test('still reports a type change between an array and something else', () => {
    expect(summarise(diff('{"a":[1]}', '{"a":"1"}', ignore))).toEqual(['type-changed /a']);
  });

  test('is off by default', () => {
    expect(diff('[1,2]', '[2,1]').summary.differences).toBe(2);
    expect(diff('[1,2]', '[2,1]').ignoreArrayOrder).toBe(false);
    expect(diff('[1,2]', '[2,1]', ignore).ignoreArrayOrder).toBe(true);
  });
});

test.describe('diffJson: types, null and numbers', () => {
  test('a changed type is a type change, not a change', () => {
    const cases: Array<[string, string]> = [
      ['{"a":1}', '{"a":"1"}'],
      ['{"a":true}', '{"a":"true"}'],
      ['{"a":true}', '{"a":1}'],
      ['{"a":[]}', '{"a":{}}'],
      ['{"a":[1]}', '{"a":{"0":1}}'],
      ['{"a":{"b":1}}', '{"a":null}'],
      ['{"a":"x"}', '{"a":["x"]}'],
    ];
    for (const [left, right] of cases) {
      const result = diff(left, right);
      expect(summarise(result), `${left} -> ${right}`).toEqual(['type-changed /a']);
      expect(result.summary).toMatchObject({ typeChanged: 1, changed: 0, differences: 1 });
    }
  });

  test('a type change carries both whole values and is not descended into', () => {
    const result = diff('{"a":{"b":[1,2]}}', '{"a":[{"b":1}]}');
    expect(result.entries).toEqual([
      { kind: 'type-changed', path: '/a', oldValue: { b: [1, 2] }, newValue: [{ b: 1 }] },
    ]);
  });

  test('a type change at the root replaces the whole document', () => {
    const result = diff('[1]', '{"a":1}');
    expect(result.entries).toEqual([{ kind: 'type-changed', path: '', oldValue: [1], newValue: { a: 1 } }]);
    expect(result.patch).toEqual([{ op: 'replace', path: '', value: { a: 1 } }]);
    expect(applyPatch([1], result.patch)).toEqual({ a: 1 });
  });

  test('null is a value: null to a value is a type change, null to missing is a removal', () => {
    expect(summarise(diff('{"a":null}', '{"a":0}'))).toEqual(['type-changed /a']);
    expect(summarise(diff('{"a":null}', '{"a":""}'))).toEqual(['type-changed /a']);
    expect(summarise(diff('{"a":null}', '{}'))).toEqual(['removed /a']);
    expect(summarise(diff('{}', '{"a":null}'))).toEqual(['added /a']);
    expect(diff('{"a":null}', '{"a":null}').summary.differences).toBe(0);
    expect(diff('{"a":null}', '{}').entries).toEqual([{ kind: 'removed', path: '/a', oldValue: null }]);
    expect(diff('{}', '{"a":null}').entries).toEqual([{ kind: 'added', path: '/a', newValue: null }]);
  });

  test('null versus missing inside arrays', () => {
    expect(summarise(diff('[null]', '[]'))).toEqual(['removed /0']);
    expect(summarise(diff('[]', '[null]'))).toEqual(['added /0']);
  });

  test('numbers are equal when their values are, however they are written', () => {
    for (const [left, right] of [['1', '1.0'], ['1', '1e0'], ['100', '1E2'], ['1', '10e-1'], ['0.5', '5e-1'], ['0', '-0'], ['-0', '0'], ['0', '0.000']]) {
      const result = diff(`{"n":${left}}`, `{"n":${right}}`);
      expect(result.summary.differences, `${left} vs ${right}`).toBe(0);
    }
  });

  test('numbers with different values differ, and a number is not its text', () => {
    expect(summarise(diff('{"n":1}', '{"n":1.0000001}'))).toEqual(['changed /n']);
    expect(summarise(diff('{"n":0.3}', '{"n":0.30000000000000004}'))).toEqual(['changed /n']);
    expect(summarise(diff('{"n":1}', '{"n":"1"}'))).toEqual(['type-changed /n']);
  });

  test('strings are compared exactly', () => {
    expect(summarise(diff('{"s":"a"}', '{"s":"A"}'))).toEqual(['changed /s']);
    expect(summarise(diff('{"s":"a"}', '{"s":"a "}'))).toEqual(['changed /s']);
    expect(summarise(diff('{"s":"\\u00e9"}', '{"s":"é"}'))).toEqual([]);
  });
});

test.describe('diffJson: summary and unchanged values', () => {
  const left = '{"a":1,"b":2,"c":{"d":[1,2]},"e":{},"f":[]}';
  const right = '{"a":1,"b":3,"c":{"d":[1,2]},"e":{},"f":[]}';

  test('counts each kind', () => {
    const result = diff(
      '{"keep":1,"gone":1,"edit":1,"kind":1}',
      '{"keep":1,"new1":1,"new2":1,"edit":2,"kind":"1"}'
    );
    expect(result.summary).toEqual({
      added: 2,
      removed: 1,
      changed: 1,
      typeChanged: 1,
      unchanged: 1,
      differences: 5,
    });
  });

  test('lists unchanged leaves only when asked, and counts them either way', () => {
    const quiet = diff(left, right);
    expect(summarise(quiet)).toEqual(['changed /b']);
    expect(quiet.entries).toHaveLength(1);
    expect(quiet.summary.unchanged).toBe(5);

    const verbose = diff(left, right, { showUnchanged: true });
    expect(verbose.summary).toEqual(quiet.summary);
    expect(verbose.entries.filter((entry) => entry.kind === 'unchanged').map((entry) => entry.path)).toEqual([
      '/a',
      '/c/d/0',
      '/c/d/1',
      '/e',
      '/f',
    ]);
    expect(verbose.entries).toContainEqual({ kind: 'unchanged', path: '/e', value: {} });
    expect(verbose.patch).toEqual(quiet.patch);
  });

  test('two equal scalars at the root are one unchanged value', () => {
    const result = diff('5', '5', { showUnchanged: true });
    expect(result.entries).toEqual([{ kind: 'unchanged', path: '', value: 5 }]);
    expect(result.summary.differences).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// JSON Patch
// ---------------------------------------------------------------------------

test.describe('JSON Patch (RFC 6902)', () => {
  test('the reference applier follows the RFC 6902 Appendix A examples', () => {
    expect(applyPatch({ foo: 'bar' }, [{ op: 'add', path: '/baz', value: 'qux' }])).toEqual({ foo: 'bar', baz: 'qux' });
    expect(applyPatch({ foo: ['bar', 'baz'] }, [{ op: 'add', path: '/foo/1', value: 'qux' }])).toEqual({
      foo: ['bar', 'qux', 'baz'],
    });
    expect(applyPatch({ baz: 'qux', foo: 'bar' }, [{ op: 'remove', path: '/baz' }])).toEqual({ foo: 'bar' });
    expect(applyPatch({ foo: ['bar', 'qux', 'baz'] }, [{ op: 'remove', path: '/foo/1' }])).toEqual({
      foo: ['bar', 'baz'],
    });
    expect(applyPatch({ baz: 'qux', foo: 'bar' }, [{ op: 'replace', path: '/baz', value: 'boo' }])).toEqual({
      baz: 'boo',
      foo: 'bar',
    });
  });

  test('uses add, remove and replace with the right values', () => {
    const result = diff('{"a":1,"b":2,"c":3,"d":1}', '{"a":1,"b":9,"d":"1","e":{"x":[1]}}');
    expect(result.patch).toEqual([
      { op: 'replace', path: '/b', value: 9 },
      { op: 'remove', path: '/c' },
      { op: 'replace', path: '/d', value: '1' },
      { op: 'add', path: '/e', value: { x: [1] } },
    ]);
  });

  test('has one operation per difference', () => {
    const result = diff('{"a":[1,2,3],"b":{"c":1}}', '{"a":[1],"b":{"c":2,"d":3},"e":4}');
    expect(result.patch).toHaveLength(result.summary.differences);
  });

  test('escapes pointers in the patch', () => {
    const result = diff('{"a/b":{"c~d":1}}', '{"a/b":{"c~d":2,"e/f":3}}');
    expect(result.patch).toEqual([
      { op: 'replace', path: '/a~1b/c~0d', value: 2 },
      { op: 'add', path: '/a~1b/e~1f', value: 3 },
    ]);
  });

  test('applying the patch to the left document gives the right one', () => {
    const cases: Array<[string, string]> = [
      ['{}', '{}'],
      ['{}', '{"a":1}'],
      ['{"a":1}', '{}'],
      ['1', '2'],
      ['null', '{"a":[1,2]}'],
      ['{"a":{"b":{"c":1}}}', '{"a":{"b":{"c":2,"d":[1,{"e":null}]}}}'],
      ['[1,2,3,4,5]', '[1,9]'],
      ['[1]', '[1,2,3,4,5]'],
      ['[[1,2],[3]]', '[[1],[3,4],[5]]'],
      ['{"a/b":1,"c~d":[1,2],"e":{"~":1}}', '{"a/b":2,"c~d":[1],"e":{"/":1}}'],
      ['{"a":[{"x":1},{"x":2},{"x":3}]}', '{"a":[{"x":1},{"y":2}]}'],
      ['{"a":null}', '{}'],
      ['{"":1}', '{"":2,"x":3}'],
      ['{"a":[]}', '{"a":{}}'],
    ];
    for (const [left, right] of cases) {
      const result = diff(left, right);
      expect(applyPatch(parse(left), result.patch), `${left} -> ${right}`).toEqual(parse(right));
    }
  });

  test('with array order ignored the patch gives the right document up to array order', () => {
    const cases: Array<[string, string]> = [
      ['[1,2,3]', '[3,2,1]'],
      ['[1,2,3]', '[3,2,4]'],
      ['[1,1,2]', '[1,2,2,5]'],
      ['{"a":[{"id":1,"n":"x"},{"id":2,"n":"y"}]}', '{"a":[{"id":2,"n":"z"},{"id":1,"n":"x"},{"id":3}]}'],
      ['[[1,2],[3,4]]', '[[4,3],[2,9]]'],
      ['["a","b","c","d"]', '["d"]'],
    ];
    for (const [left, right] of cases) {
      const result = diff(left, right, { ignoreArrayOrder: true });
      const applied = applyPatch(parse(left), result.patch);
      expect(normalise(applied), `${left} -> ${right}`).toEqual(normalise(parse(right)));
      expect(result.patch).toHaveLength(result.summary.differences);
    }
  });

  test('turns into text with two-space indentation', () => {
    const result = diff('{"a":1}', '{"a":2}');
    expect(formatPatch(result.patch)).toBe('[\n  {\n    "op": "replace",\n    "path": "/a",\n    "value": 2\n  }\n]');
    expect(formatPatch([])).toBe('[]');
  });
});

// ---------------------------------------------------------------------------
// Property checks over generated documents
// ---------------------------------------------------------------------------

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const SCALARS: JsonValue[] = [null, true, false, 0, 1, 2, 2.5, -3, '', 'a', 'b', '1', '~', '/'];
const KEYS = ['a', 'b', 'c', 'a/b', 'm~n', '', 'x'];

function randomValue(random: () => number, depth: number): JsonValue {
  const roll = random();
  if (depth <= 0 || roll < 0.45) return SCALARS[Math.floor(random() * SCALARS.length)];
  if (roll < 0.72) {
    return Array.from({ length: Math.floor(random() * 5) }, () => randomValue(random, depth - 1));
  }
  const object: Record<string, JsonValue> = {};
  const count = Math.floor(random() * 5);
  for (let i = 0; i < count; i++) {
    setMember(object, KEYS[Math.floor(random() * KEYS.length)], randomValue(random, depth - 1));
  }
  return object;
}

/** A copy of `value` with a few random edits. */
function mutate(random: () => number, value: JsonValue): JsonValue {
  const roll = random();
  if (roll < 0.12) return randomValue(random, 2);
  if (Array.isArray(value)) {
    const copy = value.map((item) => mutate(random, item));
    if (random() < 0.3) copy.push(randomValue(random, 1));
    if (random() < 0.3) copy.pop();
    return copy;
  }
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, JsonValue> = {};
    for (const key of Object.keys(value)) {
      if (random() < 0.1) continue;
      setMember(copy, key, mutate(random, value[key]));
    }
    if (random() < 0.3) setMember(copy, KEYS[Math.floor(random() * KEYS.length)], randomValue(random, 1));
    return copy;
  }
  return value;
}

/** Same document with every array shuffled and every object's keys reversed. */
function reorder(random: () => number, value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    const copy = value.map((item) => reorder(random, item));
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).reverse()) setMember(copy, key, reorder(random, value[key]));
    return copy;
  }
  return value;
}

test.describe('generated documents', () => {
  const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);

  test('the patch always turns the left document into the right one', () => {
    for (const seed of SEEDS) {
      const random = makeRandom(seed);
      const left = randomValue(random, 4);
      const right = random() < 0.6 ? mutate(random, left) : randomValue(random, 4);
      const result = diffJson(left, right);
      expect(result.patch, `seed ${seed}`).toHaveLength(result.summary.differences);
      expect(applyPatch(left, result.patch), `seed ${seed}: ${JSON.stringify(left)} -> ${JSON.stringify(right)}`).toEqual(right);
    }
  });

  test('with array order ignored the patch gets there up to array order', () => {
    for (const seed of SEEDS) {
      const random = makeRandom(seed * 7919);
      const left = randomValue(random, 4);
      const right = random() < 0.6 ? reorder(random, mutate(random, left)) : randomValue(random, 4);
      const result = diffJson(left, right, { ignoreArrayOrder: true });
      expect(result.patch, `seed ${seed}`).toHaveLength(result.summary.differences);
      expect(
        normalise(applyPatch(left, result.patch)),
        `seed ${seed}: ${JSON.stringify(left)} -> ${JSON.stringify(right)}`
      ).toEqual(normalise(right));
    }
  });

  test('a document never differs from itself, shuffled or not', () => {
    for (const seed of SEEDS) {
      const random = makeRandom(seed * 104729);
      const value = randomValue(random, 4);
      expect(diffJson(value, structuredClone(value)).summary.differences, `seed ${seed}`).toBe(0);
      expect(diffJson(value, reorder(random, value), { ignoreArrayOrder: true }).summary.differences, `seed ${seed}`).toBe(0);
    }
  });

  test('swapping the sides swaps added with removed and keeps the rest', () => {
    for (const seed of SEEDS) {
      const random = makeRandom(seed * 31);
      const left = randomValue(random, 4);
      const right = random() < 0.6 ? mutate(random, left) : randomValue(random, 4);
      const forward = diffJson(left, right).summary;
      const backward = diffJson(right, left).summary;
      expect(backward.added, `seed ${seed}`).toBe(forward.removed);
      expect(backward.removed, `seed ${seed}`).toBe(forward.added);
      expect(backward.changed, `seed ${seed}`).toBe(forward.changed);
      expect(backward.typeChanged, `seed ${seed}`).toBe(forward.typeChanged);
      expect(backward.unchanged, `seed ${seed}`).toBe(forward.unchanged);
    }
  });

  test('showing unchanged values never changes the differences or the patch', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const random = makeRandom(seed * 17);
      const left = randomValue(random, 4);
      const right = mutate(random, left);
      for (const ignoreArrayOrder of [false, true]) {
        const quiet = diffJson(left, right, { ignoreArrayOrder });
        const verbose = diffJson(left, right, { ignoreArrayOrder, showUnchanged: true });
        expect(verbose.summary, `seed ${seed}`).toEqual(quiet.summary);
        expect(verbose.patch, `seed ${seed}`).toEqual(quiet.patch);
        expect(verbose.entries.filter((entry) => entry.kind !== 'unchanged'), `seed ${seed}`).toEqual(quiet.entries);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Text in, report out
// ---------------------------------------------------------------------------

test.describe('compareJsonText', () => {
  test('reports each side on its own', () => {
    const empty = compareJsonText('', '  ');
    expect(empty.left.status).toBe('empty');
    expect(empty.right.status).toBe('empty');
    expect(empty.result).toBeNull();

    const oneBad = compareJsonText('{"a":1}', '{"a":');
    expect(oneBad.left.status).toBe('valid');
    expect(oneBad.right.status).toBe('invalid');
    if (oneBad.right.status === 'invalid') {
      expect(oneBad.right.error.line).toBe(1);
      expect(oneBad.right.error.column).toBe(6);
    }
    expect(oneBad.result).toBeNull();

    const bothBad = compareJsonText('[1,]', '{"a" 1}');
    expect(bothBad.left.status).toBe('invalid');
    expect(bothBad.right.status).toBe('invalid');
  });

  test('one empty side is not an error and gives no result', () => {
    const half = compareJsonText('{"a":1}', '');
    expect(half.left.status).toBe('valid');
    expect(half.right.status).toBe('empty');
    expect(half.result).toBeNull();
  });

  test('compares two valid documents and passes the options on', () => {
    const plain = compareJsonText('{"a":[1,2]}', '{"a":[2,1]}');
    expect(plain.result?.summary.differences).toBe(2);
    const loose = compareJsonText('{"a":[1,2]}', '{"a":[2,1]}', { ignoreArrayOrder: true });
    expect(loose.result?.summary.differences).toBe(0);
  });

  test('describes valid sides', () => {
    const comparison = compareJsonText('{"a":1,"b":2}', '[1,2,3]');
    expect(comparison.left.status === 'valid' && comparison.left.description).toBe('object with 2 keys');
    expect(comparison.right.status === 'valid' && comparison.right.description).toBe('array with 3 items');
    expect(describeJson({ a: 1 })).toBe('object with 1 key');
    expect(describeJson([1])).toBe('array with 1 item');
    expect(describeJson('x')).toBe('string');
    expect(describeJson(null)).toBe('null');
  });

  test('carries the lossy number count of each side', () => {
    const comparison = compareJsonText('[12345678901234567890]', '[1]');
    expect(comparison.left.status === 'valid' && comparison.left.lossyNumbers).toBe(1);
    expect(comparison.right.status === 'valid' && comparison.right.lossyNumbers).toBe(0);
  });
});

test.describe('formatReport', () => {
  test('lists each difference with a marker that is not a colour', () => {
    const result = diff(
      '{"a":1,"b":"x","c":true,"d":[1]}',
      '{"a":2,"c":"yes","d":[1],"e":null}'
    );
    expect(formatReport(result)).toBe(
      [
        '4 differences: 1 added, 1 removed, 1 changed, 1 type changed',
        '',
        '~ /a (changed): 1 -> 2',
        '- /b (removed): "x"',
        '! /c (type changed): true (boolean) -> "yes" (string)',
        '+ /e (added): null',
      ].join('\n')
    );
  });

  test('says so when there is nothing to report', () => {
    const result = diff('{"a":1,"b":2}', '{"b":2,"a":1}');
    expect(formatReport(result)).toBe('No differences found.');
  });

  test('names the root and notes ignored array order', () => {
    const result = diff('1', '"1"', { ignoreArrayOrder: true });
    expect(formatReport(result)).toBe(
      ['1 difference: 1 type changed', 'Array order ignored.', '', '! (root) (type changed): 1 (number) -> "1" (string)'].join('\n')
    );
  });

  test('includes unchanged values when they were asked for', () => {
    const result = diff('{"a":1,"b":2}', '{"a":1,"b":3}', { showUnchanged: true });
    expect(formatReport(result)).toBe(
      ['1 difference: 1 changed', '', '= /a (unchanged): 1', '~ /b (changed): 2 -> 3'].join('\n')
    );
  });

  test('uses the singular for one difference', () => {
    expect(formatReport(diff('{}', '{"a":1}')).split('\n')[0]).toBe('1 difference: 1 added');
  });
});

test.describe('formatValue', () => {
  test('writes compact JSON and shortens long values', () => {
    expect(formatValue({ a: [1, 'x'] })).toBe('{"a":[1,"x"]}');
    expect(formatValue('x'.repeat(10), 5)).toBe('"xxx...');
    expect(formatValue(12, 5)).toBe('12');
  });
});

test.describe('sample data', () => {
  test('parses and shows every kind of difference', () => {
    const comparison = compareJsonText(SAMPLE_LEFT, SAMPLE_RIGHT);
    expect(comparison.left.status).toBe('valid');
    expect(comparison.right.status).toBe('valid');
    const summary = comparison.result?.summary;
    expect(summary?.added).toBeGreaterThan(0);
    expect(summary?.removed).toBeGreaterThan(0);
    expect(summary?.changed).toBeGreaterThan(0);
    expect(summary?.typeChanged).toBeGreaterThan(0);
    expect(summary?.unchanged).toBeGreaterThan(0);
  });

  test('a patch from the sample reproduces the right document', () => {
    const left = parseJson(SAMPLE_LEFT);
    const right = parseJson(SAMPLE_RIGHT);
    if (!left.ok || !right.ok) throw new Error('sample does not parse');
    expect(applyPatch(left.value, diffJson(left.value, right.value).patch)).toEqual(right.value);
    const loose = diffJson(left.value, right.value, { ignoreArrayOrder: true });
    expect(normalise(applyPatch(left.value, loose.patch))).toEqual(normalise(right.value));
    expect(loose.summary.differences).toBeLessThan(diffJson(left.value, right.value).summary.differences);
  });
});
