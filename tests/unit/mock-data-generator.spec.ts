import { test, expect } from '@playwright/test';
import {
  MOCK_FIELD_TYPES,
  columnNames,
  generateMockData,
  mockDataToCsv,
  mockDataToJson,
  type MockField,
} from '@/lib/tools/mock-data-generator';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A small repeatable generator, so every run sees the same "random" data. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const field = (name: string, type: string, id = name): MockField => ({ id, name, type });

/** The values of one column, by position. */
function column(dataset: { rows: unknown[][] }, index: number): unknown[] {
  return dataset.rows.map((row) => row[index]);
}

test.describe('columnNames', () => {
  test('keeps distinct names as typed', () => {
    expect(columnNames([field('id', 'id_seq'), field('Full Name', 'full_name')])).toEqual(['id', 'Full Name']);
  });

  test('names a blank column after its field id', () => {
    expect(columnNames([field('', 'city', '7'), field('   ', 'state', '8')])).toEqual(['field_7', 'field_8']);
  });

  test('numbers a name that is already taken', () => {
    expect(columnNames([field('email', 'email', '1'), field('email', 'email', '2'), field('email', 'city', '3')])).toEqual([
      'email',
      'email_2',
      'email_3',
    ]);
  });

  test('does not number a name into one that is taken too', () => {
    expect(
      columnNames([field('email', 'email', '1'), field('email_2', 'city', '2'), field('email', 'email', '3')])
    ).toEqual(['email', 'email_2', 'email_3']);
  });
});

test.describe('generateMockData', () => {
  test('makes the requested rows with one value per field', () => {
    const fields = [field('id', 'id_seq'), field('name', 'full_name'), field('active', 'boolean')];
    const dataset = generateMockData(fields, 25, { random: seeded(1) });

    expect(dataset.columns).toEqual(['id', 'name', 'active']);
    expect(dataset.rows).toHaveLength(25);
    for (const row of dataset.rows) expect(row).toHaveLength(3);
    expect(column(dataset, 0)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  test('is repeatable for the same random sequence', () => {
    const fields = MOCK_FIELD_TYPES.map((type) => field(type.value, type.value));
    expect(generateMockData(fields, 10, { random: seeded(42) })).toEqual(
      generateMockData(fields, 10, { random: seeded(42) })
    );
  });

  test('gives no rows for a count that is not a positive whole number', () => {
    const fields = [field('id', 'id_seq')];
    expect(generateMockData(fields, 0).rows).toEqual([]);
    expect(generateMockData(fields, -5).rows).toEqual([]);
    expect(generateMockData(fields, 2.5).rows).toEqual([]);
    expect(generateMockData(fields, 0).columns).toEqual(['id']);
  });

  test('every field type produces a value of the right shape', () => {
    const fields = MOCK_FIELD_TYPES.map((type) => field(type.value, type.value));
    const dataset = generateMockData(fields, 200, { random: seeded(7) });
    const values = (type: string) => column(dataset, dataset.columns.indexOf(type));

    for (const value of values('id_uuid')) expect(value).toMatch(UUID_V4);
    for (const value of values('phone')) expect(value).toMatch(/^\+1 \(555\) \d{3}-\d{4}$/);
    for (const value of values('zip')) expect(value).toMatch(/^\d{5}$/);
    for (const value of values('street')) expect(value).toMatch(/^\d{3,4} \S.*$/);
    for (const value of values('email')) expect(value).toMatch(/^[a-z]+\.[a-z]+\d{0,2}@[a-z.]+$/);
    for (const value of values('boolean')) expect(typeof value).toBe('boolean');
    for (const value of values('date')) {
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect((value as string) >= '1980-01-01' && (value as string) <= '2023-12-31').toBe(true);
    }
    for (const type of ['first_name', 'last_name', 'full_name', 'city', 'state', 'country', 'company', 'job', 'text']) {
      for (const value of values(type)) {
        expect(typeof value, type).toBe('string');
        expect(value, type).not.toBe('');
      }
    }
  });

  test('UUID ids differ from row to row, with the secure source too', () => {
    const fields = [field('uuid', 'id_uuid')];
    for (const options of [{ random: seeded(3) }, {}]) {
      const ids = column(generateMockData(fields, 100, options), 0);
      for (const id of ids) expect(id).toMatch(UUID_V4);
      expect(new Set(ids).size).toBe(100);
    }
  });

  test('name fields in a row agree with each other', () => {
    const fields = [
      field('email', 'email'),
      field('first', 'first_name'),
      field('last', 'last_name'),
      field('full', 'full_name'),
    ];
    const dataset = generateMockData(fields, 100, { random: seeded(11) });

    for (const [email, first, last, full] of dataset.rows as string[][]) {
      expect(full).toBe(`${first} ${last}`);
      expect(email.startsWith(`${first.toLowerCase()}.${last.toLowerCase()}`)).toBe(true);
    }
  });

  test('city and state in a row belong together', () => {
    const stateOf: Record<string, string> = {
      'New York': 'NY',
      'Los Angeles': 'CA',
      Chicago: 'IL',
      Houston: 'TX',
      Phoenix: 'AZ',
      Philadelphia: 'PA',
      'San Antonio': 'TX',
      'San Diego': 'CA',
      Dallas: 'TX',
      'San Jose': 'CA',
      Austin: 'TX',
      Jacksonville: 'FL',
      'San Francisco': 'CA',
      Indianapolis: 'IN',
      Columbus: 'OH',
      'Fort Worth': 'TX',
      Charlotte: 'NC',
      Seattle: 'WA',
      Denver: 'CO',
      'El Paso': 'TX',
    };
    const dataset = generateMockData([field('state', 'state'), field('city', 'city')], 300, { random: seeded(5) });

    const cities = new Set<string>();
    for (const [state, city] of dataset.rows as string[][]) {
      expect(state, city).toBe(stateOf[city]);
      cities.add(city);
    }
    expect(cities.size).toBeGreaterThan(10);
  });

  test('an unknown field type gives empty strings', () => {
    const dataset = generateMockData([field('x', 'no_such_type')], 3, { random: seeded(1) });
    expect(dataset.rows).toEqual([[''], [''], ['']]);
  });

  test('two fields with the same name both keep their own values', () => {
    const fields = [field('value', 'id_seq', '1'), field('value', 'country', '2')];
    const dataset = generateMockData(fields, 3, { random: seeded(9) });

    expect(dataset.columns).toEqual(['value', 'value_2']);
    const objects = JSON.parse(mockDataToJson(dataset)) as Array<Record<string, unknown>>;
    expect(objects.map((object) => object.value)).toEqual([1, 2, 3]);
    for (const object of objects) expect(typeof object.value_2).toBe('string');

    const [header, firstRow] = mockDataToCsv(dataset).split('\n');
    expect(header).toBe('"value","value_2"');
    expect(firstRow).toBe(`"1","${objects[0].value_2}"`);
  });
});

test.describe('mockDataToJson', () => {
  test('writes one object per row, keyed by column name in order', () => {
    const json = mockDataToJson({ columns: ['id', 'name', 'ok'], rows: [[1, 'Ann', true], [2, 'Bob', false]] });
    expect(json).toBe(JSON.stringify([{ id: 1, name: 'Ann', ok: true }, { id: 2, name: 'Bob', ok: false }], null, 2));
  });

  test('keeps a column called __proto__', () => {
    const json = mockDataToJson({ columns: ['__proto__', 'id'], rows: [['x', 1]] });
    expect(json).toContain('"__proto__": "x"');
  });

  test('is an empty array for no rows', () => {
    expect(mockDataToJson({ columns: ['id'], rows: [] })).toBe('[]');
  });
});

test.describe('mockDataToCsv', () => {
  test('quotes every field and doubles quotes inside them', () => {
    const csv = mockDataToCsv({
      columns: ['id', 'say "hi"', 'note'],
      rows: [[1, 'a "b" c', 'x,y'], [2, true, 'line']],
    });
    expect(csv).toBe(['"id","say ""hi""","note"', '"1","a ""b"" c","x,y"', '"2","true","line"'].join('\n'));
  });

  test('is empty when there are no rows', () => {
    expect(mockDataToCsv({ columns: ['id'], rows: [] })).toBe('');
  });
});
