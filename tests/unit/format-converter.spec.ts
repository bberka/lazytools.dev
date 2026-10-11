import { test, expect } from '@playwright/test';
import { convertData, parseCsv, type DataFormat } from '@/lib/tools/format-converter';

// 2^53 + 1: the first integer a double cannot hold.
const UNSAFE = '9007199254740993';

// Built from a code point so the source holds no invisible character.
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

const FORMATS: DataFormat[] = ['json', 'yaml', 'xml', 'csv', 'toml'];

async function output(text: string, from: DataFormat, to: DataFormat, options = {}) {
  const result = await convertData(text, from, to, options);
  expect(result.error).toBeNull();
  return result.output;
}

test.describe('parseCsv', () => {
  test('splits rows and cells', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  test('accepts LF, CRLF and CR line endings and a final newline', () => {
    const rows = [
      ['a', 'b'],
      ['1', '2'],
    ];

    expect(parseCsv('a,b\n1,2\n')).toEqual(rows);
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual(rows);
    expect(parseCsv('a,b\r1,2')).toEqual(rows);
  });

  test('reads quoted cells with delimiters, quotes and line breaks inside', () => {
    expect(parseCsv('name,note\n"Doe, Jane","said ""hi""\nand left"')).toEqual([
      ['name', 'note'],
      ['Doe, Jane', 'said "hi"\nand left'],
    ]);
  });

  test('keeps empty cells', () => {
    expect(parseCsv('a,,c\n,,\n1,2,')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
      ['1', '2', ''],
    ]);
  });

  test('skips blank lines but keeps a row written as ""', () => {
    expect(parseCsv('a\n\n\nb\n')).toEqual([['a'], ['b']]);
    expect(parseCsv('a\n""\nb')).toEqual([['a'], [''], ['b']]);
  });

  test('uses the given delimiter', () => {
    expect(parseCsv('a;b\n1,5;2', ';')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
    expect(parseCsv('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a|b', '|')).toEqual([['a', 'b']]);
  });

  // Any quote used to switch quoting on, so a cell such as 24" swallowed the
  // rest of the file and the whole input failed as "unclosed quoted field".
  test('reads a quote in the middle of a cell as an ordinary character', () => {
    expect(parseCsv('item,size\nMonitor 24",1\nHe said "hi",2')).toEqual([
      ['item', 'size'],
      ['Monitor 24"', '1'],
      ['He said "hi"', '2'],
    ]);
  });

  test('still opens a quoted cell after leading spaces', () => {
    expect(parseCsv('a, "b,c"')).toEqual([['a', ' b,c']]);
  });

  test('strips a byte order mark', () => {
    expect(parseCsv(`${BYTE_ORDER_MARK}name,age\nAda,36`)[0]).toEqual(['name', 'age']);
  });

  test('throws when a quoted cell is never closed', () => {
    expect(() => parseCsv('a,b\n"open,2')).toThrow('CSV contains an unclosed quoted field.');
  });

  test('returns no rows for empty text', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\n')).toEqual([]);
  });
});

test.describe('convertData basics', () => {
  test('gives empty output for empty and whitespace-only text', async () => {
    for (const from of FORMATS) {
      for (const to of FORMATS) {
        expect(await convertData('', from, to)).toEqual({ output: '', error: null });
        expect(await convertData(' \n\t', from, to)).toEqual({ output: '', error: null });
      }
    }
  });

  test('passes text through when both formats are the same', async () => {
    expect(await convertData('a:   1 # note', 'yaml', 'yaml')).toEqual({ output: 'a:   1 # note', error: null });
    expect(await convertData('<a>  <b/></a>', 'xml', 'xml')).toEqual({ output: '<a>  <b/></a>', error: null });
    expect(await convertData('a;b', 'csv', 'csv')).toEqual({ output: 'a;b', error: null });
    expect(await convertData('a  =  1', 'toml', 'toml')).toEqual({ output: 'a  =  1', error: null });
  });

  // With JSON on both sides the indentation setting was shown but did nothing.
  test('re-indents JSON to JSON and reports invalid JSON', async () => {
    expect(await output('{"a":[1,2]}', 'json', 'json', { jsonIndent: 4 })).toBe('{\n    "a": [\n        1,\n        2\n    ]\n}');
    expect(await output('{"a":1}', 'json', 'json', { jsonIndent: '\t' })).toBe('{\n\t"a": 1\n}');
    expect((await convertData('{"a":}', 'json', 'json')).error?.stage).toBe('parse');
  });

  test('converts between every pair of formats without failing', async () => {
    const samples: Record<DataFormat, string> = {
      json: '[{"name":"John","age":30,"city":"New York"}]',
      yaml: '- name: John\n  age: 30\n  city: New York',
      xml: '<root>\n  <name>John</name>\n  <age>30</age>\n  <city>New York</city>\n</root>',
      csv: 'name,age,city\nJohn,30,New York',
      toml: 'name = "John"\nage = 30\ncity = "New York"',
    };

    for (const from of FORMATS) {
      for (const to of FORMATS) {
        const result = await convertData(samples[from], from, to);
        expect(result.error, `${from} to ${to}`).toBeNull();
        expect(result.output, `${from} to ${to}`).toContain('John');
      }
    }
  });
});

test.describe('JSON, YAML and TOML', () => {
  test('converts JSON to YAML and back', async () => {
    const json = '{"name":"Ada","roles":["Admin","Editor"],"active":true,"score":4.5,"none":null}';
    const yaml = await output(json, 'json', 'yaml');

    expect(yaml).toBe('name: Ada\nroles:\n  - Admin\n  - Editor\nactive: true\nscore: 4.5\nnone: null\n');
    expect(JSON.parse(await output(yaml, 'yaml', 'json'))).toEqual(JSON.parse(json));
  });

  test('applies the JSON indentation setting', async () => {
    expect(await output('a: 1', 'yaml', 'json')).toBe('{\n  "a": 1\n}');
    expect(await output('a: 1', 'yaml', 'json', { jsonIndent: 8 })).toBe('{\n        "a": 1\n}');
  });

  test('turns a stream of YAML documents into a list', async () => {
    expect(JSON.parse(await output('a: 1\n---\nb: 2', 'yaml', 'json'))).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test('converts an empty YAML document to null', async () => {
    expect(await output('# only a comment', 'yaml', 'json')).toBe('null');
  });

  test('converts TOML tables and arrays of tables', async () => {
    const toml = 'title = "Example"\n\n[owner]\nname = "Ada"\n\n[[servers]]\nhost = "a"\n\n[[servers]]\nhost = "b"\n';

    expect(JSON.parse(await output(toml, 'toml', 'json'))).toEqual({
      title: 'Example',
      owner: { name: 'Ada' },
      servers: [{ host: 'a' }, { host: 'b' }],
    });
    expect(await output(await output(toml, 'toml', 'json'), 'json', 'toml')).toBe(toml);
  });

  test('wraps a list or a bare value so TOML has a table at the top', async () => {
    expect(await output('[1, 2]', 'json', 'toml')).toBe('items = [ 1, 2 ]\n');
    expect(await output('"hi"', 'json', 'toml')).toBe('value = "hi"\n');
  });

  test('writes dates from YAML and TOML as ISO strings in JSON', async () => {
    expect(JSON.parse(await output('at: 2024-01-01T10:00:00Z', 'yaml', 'json'))).toEqual({
      at: '2024-01-01T10:00:00.000Z',
    });
    expect(JSON.parse(await output('at = 1979-05-27T07:32:00Z', 'toml', 'json'))).toEqual({
      at: '1979-05-27T07:32:00.000Z',
    });
  });

  test('keeps Unicode and emoji', async () => {
    const json = '{"greeting":"héllo 😀","日本":"語"}';

    expect(JSON.parse(await output(await output(json, 'json', 'yaml'), 'yaml', 'json'))).toEqual(JSON.parse(json));
    expect(JSON.parse(await output(await output(json, 'json', 'toml'), 'toml', 'json'))).toEqual(JSON.parse(json));
  });
});

test.describe('large integers', () => {
  // TOML parses a 64-bit integer to a bigint, which JSON.stringify and
  // js-yaml both refuse: the conversion failed with "Do not know how to
  // serialize a BigInt", shown as an error in the TOML.
  test('converts a TOML integer too large for a double', async () => {
    const toml = `id = ${UNSAFE}`;

    expect(await output(toml, 'toml', 'json')).toBe(`{\n  "id": ${UNSAFE}\n}`);
    expect(await output(toml, 'toml', 'yaml')).toBe(`id: ${UNSAFE}\n`);
    expect(await output(toml, 'toml', 'xml')).toBe(`<id>${UNSAFE}</id>`);
    expect(await output(toml, 'toml', 'csv')).toBe(`id\n${UNSAFE}`);
  });

  // JSON.parse rounded these, so every conversion out of JSON changed the id.
  test('carries a large JSON integer into every format unchanged', async () => {
    const json = `{"id":${UNSAFE}}`;

    expect(await output(json, 'json', 'yaml')).toBe(`id: ${UNSAFE}\n`);
    expect(await output(json, 'json', 'xml')).toBe(`<id>${UNSAFE}</id>`);
    expect(await output(json, 'json', 'csv')).toBe(`id\n${UNSAFE}`);
    expect(await output(json, 'json', 'toml')).toBe('id = 9_007_199_254_740_993\n');
    expect(await output(json, 'json', 'json', { jsonIndent: 2 })).toBe(`{\n  "id": ${UNSAFE}\n}`);
  });

  test('carries a large YAML integer into JSON unchanged', async () => {
    expect(await output(`id: ${UNSAFE}`, 'yaml', 'json')).toBe(`{\n  "id": ${UNSAFE}\n}`);
  });
});

test.describe('CSV', () => {
  test('converts CSV with a header row to a list of objects', async () => {
    expect(JSON.parse(await output('name,age\nJohn,30\nAda,36', 'csv', 'json'))).toEqual([
      { name: 'John', age: '30' },
      { name: 'Ada', age: '36' },
    ]);
  });

  test('converts CSV without a header row to a list of rows', async () => {
    expect(JSON.parse(await output('name,age\nJohn,30', 'csv', 'json', { useHeaders: false }))).toEqual([
      ['name', 'age'],
      ['John', '30'],
    ]);
  });

  test('gives an empty list for a header row with no data', async () => {
    expect(await output('name,age', 'csv', 'json')).toBe('[]');
  });

  test('names blank columns and fills short rows', async () => {
    expect(JSON.parse(await output('name,,city\nJohn\nAda,x,Paris', 'csv', 'json'))).toEqual([
      { name: 'John', column_2: '', city: '' },
      { name: 'Ada', column_2: 'x', city: 'Paris' },
    ]);
  });

  // Two columns with the same name used to collapse into one key.
  test('keeps both columns when a header name repeats', async () => {
    expect(JSON.parse(await output('id,name,name\n1,first,second', 'csv', 'json'))).toEqual([
      { id: '1', name: 'first', name_2: 'second' },
    ]);
  });

  // Cells beyond the last header used to be dropped without a word.
  test('keeps cells that have no header, ignoring trailing empty ones', async () => {
    expect(JSON.parse(await output('a,b\n1,2,3\n4,5,\n6,7', 'csv', 'json'))).toEqual([
      { a: '1', b: '2', column_3: '3' },
      { a: '4', b: '5', column_3: '' },
      { a: '6', b: '7', column_3: '' },
    ]);
    expect(JSON.parse(await output('a,b\n1,2,\n3,4,,', 'csv', 'json'))).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  test('uses the delimiter setting in both directions', async () => {
    expect(JSON.parse(await output('a;b\n1,5;2', 'csv', 'json', { delimiter: ';' }))).toEqual([{ a: '1,5', b: '2' }]);
    expect(await output('[{"a":"1;5","b":2}]', 'json', 'csv', { delimiter: ';' })).toBe('a;b\n"1;5";2');
    expect(await output('[{"a":1,"b":2}]', 'json', 'csv', { delimiter: '\t' })).toBe('a\tb\n1\t2');
  });

  test('writes objects as rows under the union of their keys', async () => {
    expect(await output('[{"a":1,"b":2},{"b":3,"c":4}]', 'json', 'csv')).toBe('a,b,c\n1,2,\n,3,4');
    expect(await output('[{"a":1,"b":2}]', 'json', 'csv', { useHeaders: false })).toBe('1,2');
  });

  test('writes a single object as one row and a list of lists as rows', async () => {
    expect(await output('{"a":1,"b":"x"}', 'json', 'csv')).toBe('a,b\n1,x');
    expect(await output('[["a","b"],[1,2]]', 'json', 'csv')).toBe('a,b\n1,2');
  });

  test('quotes cells that need it and writes null, false and zero', async () => {
    expect(await output('[{"a":"x,y","b":"say \\"hi\\"","c":"two\\nlines","d":null,"e":false,"f":0}]', 'json', 'csv')).toBe(
      'a,b,c,d,e,f\n"x,y","say ""hi""","two\nlines",,false,0'
    );
  });

  // Nested values used to come out as "[object Object]".
  test('writes a nested object or list as JSON in its cell', async () => {
    expect(await output('[{"name":"A","tags":["x","y"],"address":{"city":"NY"}}]', 'json', 'csv')).toBe(
      'name,tags,address\nA,"[""x"",""y""]","{""city"":""NY""}"'
    );
  });

  test('writes a date from YAML as an ISO string', async () => {
    expect(await output('- at: 2024-01-01T10:00:00Z', 'yaml', 'csv')).toBe('at\n2024-01-01T10:00:00.000Z');
  });

  test('round-trips through JSON', async () => {
    const csv = 'name,note\n"Doe, Jane","said ""hi"""\nAda,plain';

    expect(await output(await output(csv, 'csv', 'json'), 'json', 'csv')).toBe(csv);
  });

  test('gives empty output for an empty list', async () => {
    expect(await convertData('[]', 'json', 'csv')).toEqual({ output: '', error: null });
  });
});

test.describe('XML', () => {
  test('reads XML into the xml-js compact form', async () => {
    expect(JSON.parse(await output('<root a="1"><name>John</name><n>1</n><n>2</n></root>', 'xml', 'json'))).toEqual({
      root: { _attributes: { a: '1' }, name: { _text: 'John' }, n: [{ _text: '1' }, { _text: '2' }] },
    });
  });

  test('writes an object with one key as that root element', async () => {
    expect(await output('{"person":{"name":"John","age":30,"ok":true,"none":null,"empty":""}}', 'json', 'xml')).toBe(
      '<person>\n  <name>John</name>\n  <age>30</age>\n  <ok>true</ok>\n  <none/>\n  <empty/>\n</person>'
    );
  });

  // A list at the top came out as <0>...</0>, which is not XML at all. The
  // converter's own JSON example is such a list.
  test('wraps a list in <root> with <item> entries', async () => {
    expect(await output('[{"name":"John"},{"name":"Ada"}]', 'json', 'xml')).toBe(
      '<root>\n  <item>\n    <name>John</name>\n  </item>\n  <item>\n    <name>Ada</name>\n  </item>\n</root>'
    );
    expect(await output('[1,"two",null]', 'json', 'xml')).toBe('<root>\n  <item>1</item>\n  <item>two</item>\n  <item/>\n</root>');
  });

  // Several keys at the top produced several root elements.
  test('wraps an object with several keys in <root>', async () => {
    expect(await output('{"name":"John","age":30}', 'json', 'xml')).toBe('<root>\n  <name>John</name>\n  <age>30</age>\n</root>');
    expect(await output('{"users":[{"n":1},{"n":2}]}', 'json', 'xml')).toBe(
      '<root>\n  <users>\n    <n>1</n>\n  </users>\n  <users>\n    <n>2</n>\n  </users>\n</root>'
    );
  });

  // A bare value produced no output, or one element per character.
  test('wraps a bare value in <root>', async () => {
    expect(await output('5', 'json', 'xml')).toBe('<root>5</root>');
    expect(await output('"hi"', 'json', 'xml')).toBe('<root>hi</root>');
    expect(await output('null', 'json', 'xml')).toBe('<root/>');
    expect(await output('{}', 'json', 'xml')).toBe('<root/>');
  });

  test('names the entries of a list inside a list <item>', async () => {
    expect(await output('{"m":{"row":[[1,2],[3]]}}', 'json', 'xml')).toBe(
      '<m>\n  <row>\n    <item>1</item>\n    <item>2</item>\n  </row>\n  <row>\n    <item>3</item>\n  </row>\n</m>'
    );
  });

  // Keys were copied in as element names even when XML does not allow them.
  test('turns keys into valid element names', async () => {
    expect(await output('{"data":{"first name":"x","1st":2,"a/b":3,"ünï-cödé.ok":4}}', 'json', 'xml')).toBe(
      '<data>\n  <first_name>x</first_name>\n  <_1st>2</_1st>\n  <a_b>3</a_b>\n  <ünï-cödé.ok>4</ünï-cödé.ok>\n</data>'
    );
  });

  // {"a b":1,"a_b":2} was written as <a_b>2</a_b>: the value of "a b" was lost.
  test('gives keys that become the same name different names, none of them lost', async () => {
    expect(await output('{"a b":1,"a_b":2}', 'json', 'xml')).toBe(
      '<root>\n  <a_b_2>1</a_b_2>\n  <a_b>2</a_b>\n</root>'
    );
    expect(await output('{"a b":1,"a/b":2,"a_b":3,"a_b_2":4}', 'json', 'xml')).toBe(
      '<root>\n  <a_b_3>1</a_b_3>\n  <a_b_4>2</a_b_4>\n  <a_b>3</a_b>\n  <a_b_2>4</a_b_2>\n</root>'
    );
    // A key that is not a name never takes the name that means text content.
    expect(await output('{"?text":"x","_text":"y"}', 'json', 'xml')).toBe(
      '<root>\n  <_text_2>x</_text_2>y\n</root>'
    );
  });

  // {"og:title":"x"} was written as <og:title>, a prefix nothing declares, which
  // XML parsers reject.
  test('does not write a colon that would make an undeclared namespace prefix', async () => {
    expect(await output('{"og:title":"x"}', 'json', 'xml')).toBe('<og_title>x</og_title>');
    expect(await output('{"a":{"x:y:z":1,":q":2,"p:":3}}', 'json', 'xml')).toBe(
      '<a>\n  <x_y_z>1</x_y_z>\n  <_q>2</_q>\n  <p_>3</p_>\n</a>'
    );
  });

  test('keeps a colon after a prefix that an element above declares', async () => {
    const xml = '<feed xmlns:atom="http://www.w3.org/2005/Atom">\n  <atom:link rel="self"/>\n  <xml:note>x</xml:note>\n</feed>';

    expect(await output(await output(xml, 'xml', 'json'), 'json', 'xml')).toBe(xml);
    // The element that declares the prefix may use it itself.
    expect(await output('{"atom:feed":{"_attributes":{"xmlns:atom":"u"},"atom:id":"1"}}', 'json', 'xml')).toBe(
      '<atom:feed xmlns:atom="u">\n  <atom:id>1</atom:id>\n</atom:feed>'
    );
    // Declared further down, it does not cover what is above or beside it.
    expect(
      await output('{"top":{"og:a":1,"child":{"_attributes":{"xmlns:og":"u"},"og:b":2}}}', 'json', 'xml')
    ).toBe('<top>\n  <og_a>1</og_a>\n  <child xmlns:og="u">\n    <og:b>2</og:b>\n  </child>\n</top>');
  });

  test('escapes markup characters in text', async () => {
    expect(await output('{"a":"x < y & z > w"}', 'json', 'xml')).toBe('<a>x &lt; y &amp; z &gt; w</a>');
  });

  test('round-trips XML through JSON, attributes and declaration included', async () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<root id="1">\n  <name>John</name>\n  <tag>a</tag>\n  <tag>b</tag>\n  <empty/>\n</root>';

    expect(await output(await output(xml, 'xml', 'json'), 'json', 'xml')).toBe(xml);
  });

  test('output for every shape of data parses again as XML', async () => {
    const shapes = ['[]', '[[1,2],[3,4]]', '{"a":1,"b":[1,2]}', '"text"', '0', 'false', '{"only":[1,2]}', '{"9":{"x y":1}}'];

    for (const shape of shapes) {
      const xml = await output(shape, 'json', 'xml');
      const back = await convertData(xml, 'xml', 'json');
      expect(back.error, `${shape} gave ${xml}`).toBeNull();
    }
  });
});

test.describe('errors', () => {
  test('marks bad input as a parse error with a one-line message', async () => {
    const json = await convertData('{"a":}', 'json', 'yaml');
    expect(json.output).toBe('');
    expect(json.error?.stage).toBe('parse');
    expect(json.error?.message).not.toContain('\n');

    expect(await convertData('a: 1\n  b: 2', 'yaml', 'json')).toEqual({
      output: '',
      error: { stage: 'parse', message: 'bad indentation of a mapping entry (line 2, column 4)' },
    });

    expect(await convertData('<a><b></a>', 'xml', 'json')).toEqual({
      output: '',
      error: { stage: 'parse', message: 'Unexpected close tag (line 1, column 10)' },
    });

    expect(await convertData('a,b\n"open', 'csv', 'json')).toEqual({
      output: '',
      error: { stage: 'parse', message: 'CSV contains an unclosed quoted field.' },
    });

    const toml = await convertData('a = 1\nb = = 2', 'toml', 'json');
    expect(toml.error?.stage).toBe('parse');
    expect(toml.error?.message).toMatch(/at row 2, col \d+, pos \d+$/);
  });

  test('reports text that is not XML', async () => {
    expect((await convertData('just text', 'xml', 'json')).error).toEqual({
      stage: 'parse',
      message: 'Text data outside of root node. (line 1, column 9)',
    });
  });

  // These failures are about the target format, but were shown as
  // "Error parsing JSON" although the JSON was fine.
  test('marks data the target format cannot hold as a write error', async () => {
    expect(await convertData('[1, 2, 3]', 'json', 'csv')).toEqual({
      output: '',
      error: { stage: 'write', message: 'CSV conversion requires items to all be objects or all be arrays.' },
    });
    expect(await convertData('"text"', 'json', 'csv')).toEqual({
      output: '',
      error: { stage: 'write', message: 'Data must be an array of objects or arrays to convert to CSV.' },
    });
    expect(await convertData('{"a":[1,"x"]}', 'json', 'toml')).toEqual({
      output: '',
      error: { stage: 'write', message: "Array values can't have mixed types" },
    });
  });

  test('never rejects', async () => {
    for (const from of FORMATS) {
      for (const to of FORMATS) {
        await expect(convertData('{[<,"\'=:\n\t- ]>', from, to)).resolves.toBeDefined();
      }
    }
  });
});
