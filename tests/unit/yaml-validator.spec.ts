import { test, expect } from '@playwright/test';
import { loadYamlTools, type YamlTools } from '@/lib/tools/yaml-validator';

// 2^53 + 1: the first integer a double cannot hold.
const UNSAFE = '9007199254740993';

let yaml: YamlTools;

test.beforeAll(async () => {
  yaml = await loadYamlTools();
});

test.describe('loadYamlTools', () => {
  test('loads the parser once and hands back the same tools', async () => {
    expect(await loadYamlTools()).toBe(yaml);
    expect(loadYamlTools()).toBe(loadYamlTools());
  });
});

test.describe('validate', () => {
  test('returns null for empty and whitespace-only text', () => {
    expect(yaml.validate('')).toBeNull();
    expect(yaml.validate(' \n\t\n')).toBeNull();
  });

  test('summarises a mapping, a sequence and scalars', () => {
    expect(yaml.validate('name: Ada\nroles:\n  - Admin\n  - Editor')).toMatchObject({
      valid: true,
      documents: [{ name: 'Ada', roles: ['Admin', 'Editor'] }],
      summary: 'Top-level mapping with 2 keys',
      error: '',
    });
    expect(yaml.validate('only: 1')).toMatchObject({ summary: 'Top-level mapping with 1 key' });
    expect(yaml.validate('- a\n- b\n- c')).toMatchObject({ summary: 'Top-level sequence with 3 items' });
    expect(yaml.validate('- a')).toMatchObject({ summary: 'Top-level sequence with 1 item' });
    expect(yaml.validate('hello')).toMatchObject({ summary: 'Top-level string value' });
    expect(yaml.validate('0')).toMatchObject({ summary: 'Top-level number value', documents: [0] });
    expect(yaml.validate('-3.5')).toMatchObject({ summary: 'Top-level number value' });
    expect(yaml.validate('false')).toMatchObject({ summary: 'Top-level boolean value' });
    expect(yaml.validate('~')).toMatchObject({ summary: 'Top-level null value', documents: [null] });
  });

  test('treats a document of only comments as null', () => {
    expect(yaml.validate('# nothing here')).toMatchObject({
      valid: true,
      documents: [null],
      summary: 'Top-level null value',
    });
  });

  test('names a bare timestamp instead of calling it an empty mapping', () => {
    expect(yaml.validate('2024-01-01')).toMatchObject({ valid: true, summary: 'Top-level timestamp value' });
  });

  // js-yaml's load() rejects a stream with more than one document, so every
  // Kubernetes-style file used to be reported as invalid YAML.
  test('accepts a stream of several documents', () => {
    const result = yaml.validate('a: 1\n---\nb: 2\n---\n- c');

    expect(result).toMatchObject({ valid: true, summary: '3 documents', error: '' });
    expect(result?.documents).toEqual([{ a: 1 }, { b: 2 }, ['c']]);
  });

  test('reads a leading document marker as one document', () => {
    expect(yaml.validate('---\na: 1\n')).toMatchObject({ summary: 'Top-level mapping with 1 key' });
  });

  test('reports the reason and position of a syntax error on one line', () => {
    const result = yaml.validate('a: 1\n  b: 2');

    expect(result).toMatchObject({
      valid: false,
      documents: [],
      summary: '',
      error: 'bad indentation of a mapping entry (line 2, column 4)',
    });
  });

  test('rejects tabs used for indentation and duplicate keys', () => {
    expect(yaml.validate('a:\n\tb: 1')).toMatchObject({ valid: false });
    expect(yaml.validate('a: 1\na: 2')?.error).toContain('duplicated mapping key');
  });

  test('handles Unicode and emoji', () => {
    expect(yaml.validate('greeting: "héllo 😀"\n日本: 語')?.documents).toEqual([
      { greeting: 'héllo 😀', 日本: '語' },
    ]);
  });
});

test.describe('describeError', () => {
  test('falls back for errors that are not from the parser', () => {
    expect(yaml.describeError(new Error('boom'))).toBe('boom');
    expect(yaml.describeError('nope')).toBe('Invalid YAML syntax');
  });
});

test.describe('large integers', () => {
  test('keeps an integer too large for a double', () => {
    const [document] = yaml.parseDocuments(`id: ${UNSAFE}\nneg: -${UNSAFE}\nhex: 0xFFFFFFFFFFFFFFFF`);

    expect(document).toEqual({
      id: BigInt(UNSAFE),
      neg: -BigInt(UNSAFE),
      hex: BigInt('18446744073709551615'),
    });
  });

  test('leaves ordinary numbers as numbers', () => {
    expect(yaml.parseDocuments('a: 42\nb: -7\nc: 1.5\nd: 0x1F\ne: 0o17\nf: 1e3\ng: "12"')).toEqual([
      { a: 42, b: -7, c: 1.5, d: 31, e: 15, f: 1000, g: '12' },
    ]);
  });

  // Formatting used to change the last digits of 64-bit ids.
  test('writes a large integer back digit for digit', () => {
    const documents = yaml.parseDocuments(`id: ${UNSAFE}\nlist:\n  - -${UNSAFE}`);

    expect(yaml.render(documents, { indent: 2 }).text).toBe(`id: ${UNSAFE}\nlist:\n  - -${UNSAFE}\n`);
    expect(yaml.render(documents, { minify: true }).text).toBe(`{"id":${UNSAFE},"list":[-${UNSAFE}]}`);
  });

  test('still quotes a string of digits so it stays a string', () => {
    expect(yaml.dump({ zip: '01234', id: BigInt(UNSAFE), count: 5 })).toBe(
      `zip: '01234'\nid: ${UNSAFE}\ncount: 5\n`
    );
  });
});

test.describe('render', () => {
  const documents = [{ name: 'Ada', roles: ['Admin', 'Editor'], nested: { deep: { value: 1 } } }];

  test('formats with the requested indent', () => {
    expect(yaml.render(documents, { indent: 2 })).toEqual({
      text: 'name: Ada\nroles:\n  - Admin\n  - Editor\nnested:\n  deep:\n    value: 1\n',
      error: '',
    });
    expect(yaml.render(documents, { indent: 4 }).text).toBe(
      'name: Ada\nroles:\n    - Admin\n    - Editor\nnested:\n    deep:\n        value: 1\n'
    );
  });

  test('never indents with tabs', () => {
    for (const indent of [2, 4, 8]) {
      expect(yaml.render(documents, { indent }).text).not.toContain('\t');
    }
  });

  test('does not wrap long lines', () => {
    const long = 'word '.repeat(60).trim();

    expect(yaml.render([{ text: long }]).text).toBe(`text: ${long}\n`);
  });

  test('minifies to one line of JSON', () => {
    expect(yaml.render(documents, { minify: true })).toEqual({
      text: '{"name":"Ada","roles":["Admin","Editor"],"nested":{"deep":{"value":1}}}',
      error: '',
    });
  });

  test('separates several documents with "---", or one JSON line each', () => {
    const several = yaml.parseDocuments('a: 1\n---\n- b\n---\n~');

    expect(yaml.render(several, { indent: 2 }).text).toBe('a: 1\n---\n- b\n---\nnull\n');
    expect(yaml.render(several, { minify: true }).text).toBe('{"a":1}\n["b"]\nnull');
  });

  test('output parses back to the same documents', () => {
    const source = 'a: 1\nb:\n  - x\n  - y: [1, 2]\n---\nc: "text: with colon"\nd: 2024-01-01T00:00:00Z';
    const parsed = yaml.parseDocuments(source);

    expect(yaml.parseDocuments(yaml.render(parsed, { indent: 4 }).text)).toEqual(parsed);
  });

  test('writes timestamps and special floats', () => {
    const parsed = yaml.parseDocuments('at: 2024-01-01\ninf: .inf\nnan: .nan');

    expect(yaml.render(parsed).text).toBe('at: 2024-01-01T00:00:00.000Z\ninf: .inf\nnan: .nan\n');
    expect(yaml.render(parsed, { minify: true }).text).toBe(
      '{"at":"2024-01-01T00:00:00.000Z","inf":null,"nan":null}'
    );
  });

  test('explains why a self-referencing document has no JSON form', () => {
    const parsed = yaml.parseDocuments('&loop [*loop]');

    expect(yaml.render(parsed, { minify: true })).toEqual({
      text: '',
      error: 'This YAML refers to itself through an alias, so it cannot be written as JSON.',
    });
    expect(yaml.render(parsed, { indent: 2 }).error).toBe('');
  });
});
