/**
 * Mock data: rows of plausible fake values for a schema of named, typed
 * fields, plus the JSON and CSV text of the result.
 *
 * A dataset carries its own column names, so the output never depends on
 * what the schema looks like later. Column names are made unique when the
 * data is generated; two fields with the same name would otherwise overwrite
 * each other in the JSON objects.
 *
 * Randomness is an argument, so tests inject a fixed sequence.
 */

import { uuidV4 } from './uuid-generator';

export type MockValue = string | number | boolean;

export interface MockField {
  /** Stable identity of the field; also names a column whose name is blank. */
  id: string;
  name: string;
  /** One of the `MOCK_FIELD_TYPES` values. An unknown type gives empty strings. */
  type: string;
}

export interface MockDataset {
  columns: string[];
  /** One array per row, in column order. */
  rows: MockValue[][];
}

export interface MockDataOptions {
  /** Returns a number from 0 (inclusive) to 1 (exclusive). Default `Math.random`. */
  random?: () => number;
}

export const MOCK_FIELD_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'id_seq', label: 'ID (Incremental)' },
  { value: 'id_uuid', label: 'ID (UUID)' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'full_name', label: 'Full Name' },
  { value: 'email', label: 'Email Address' },
  { value: 'phone', label: 'Phone Number' },
  { value: 'street', label: 'Street Address' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'country', label: 'Country' },
  { value: 'zip', label: 'Zip Code' },
  { value: 'company', label: 'Company Name' },
  { value: 'job', label: 'Job Title' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean (True/False)' },
  { value: 'text', label: 'Text / Paragraph' },
];

const FIRST_NAMES = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy', 'Daniel', 'Lisa', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley', 'Steven', 'Dorothy', 'Paul', 'Kimberly', 'Andrew', 'Emily', 'Joshua', 'Donna'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores'];
const STREETS = ['Main St', 'Oak Ave', 'Pine Rd', 'Maple Dr', 'Cedar Ln', 'Elm St', 'View Rd', 'Broadway', 'Washington St', 'Park Ln', 'Lake Dr', 'Sunset Blvd', 'River Rd', 'Forest Ave', 'Highland Dr', 'Meadow Ln', 'Hillside Ave', 'Spring St', 'Valley Rd', 'Ridge Dr'];
/** A city and the state it is in, so the two agree when a row has both. */
const LOCATIONS: ReadonlyArray<readonly [city: string, state: string]> = [
  ['New York', 'NY'],
  ['Los Angeles', 'CA'],
  ['Chicago', 'IL'],
  ['Houston', 'TX'],
  ['Phoenix', 'AZ'],
  ['Philadelphia', 'PA'],
  ['San Antonio', 'TX'],
  ['San Diego', 'CA'],
  ['Dallas', 'TX'],
  ['San Jose', 'CA'],
  ['Austin', 'TX'],
  ['Jacksonville', 'FL'],
  ['San Francisco', 'CA'],
  ['Indianapolis', 'IN'],
  ['Columbus', 'OH'],
  ['Fort Worth', 'TX'],
  ['Charlotte', 'NC'],
  ['Seattle', 'WA'],
  ['Denver', 'CO'],
  ['El Paso', 'TX'],
];
const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Germany', 'France', 'Australia', 'Japan', 'Brazil', 'India', 'South Africa', 'Italy', 'Spain', 'Mexico', 'South Korea', 'Netherlands', 'Sweden', 'Switzerland', 'Singapore', 'New Zealand', 'Ireland'];
const COMPANIES = ['Acme Corp', 'Globex', 'Initech', 'Umbrella Corp', 'Vehement Capital', 'Hooli', 'Soylent Corp', 'Wonka Industries', 'Stark Industries', 'Wayne Enterprises', 'Cyberdyne Systems', 'Oscorp', 'Tyrell Corp', 'Dunder Mifflin', 'Aperture Science', 'Virtucon', 'MomCorp', 'Sterling Cooper', 'Gekko & Co', 'Bluth Company'];
const DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'example.com', 'company.com', 'mail.com', 'protonmail.com'];
const JOBS = ['Software Engineer', 'Product Manager', 'Data Analyst', 'Product Designer', 'Marketing Specialist', 'Sales Representative', 'HR Manager', 'Accountant', 'Operations Coordinator', 'Customer Support Specialist', 'System Administrator', 'Financial Analyst', 'Content Writer', 'Project Manager', 'Data Scientist', 'Research Assistant'];
const PHRASES = ['Lorem ipsum dolor sit amet, consectetur adipiscing elit.', 'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.', 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.', 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.', 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.', 'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.', 'Curabitur pretium tincidunt lacus. Nulla gravida orci a odio.', 'Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris.'];

const DATE_START = Date.UTC(1980, 0, 1);
const DATE_END = Date.UTC(2023, 11, 31);

/**
 * The column name of each field, in order. A blank name becomes
 * `field_<id>`, and a name already taken by an earlier field gets `_2`, `_3`
 * and so on, so no two columns share a name.
 */
export function columnNames(fields: MockField[]): string[] {
  const taken = new Set<string>();

  return fields.map((field) => {
    const base = field.name.trim() ? field.name : `field_${field.id}`;
    let name = base;
    for (let suffix = 2; taken.has(name); suffix++) name = `${base}_${suffix}`;
    taken.add(name);
    return name;
  });
}

/**
 * Generates `rowCount` rows for the schema. Within a row the name fields
 * agree with each other (the email is built from the same first and last
 * name), and so do city and state.
 */
export function generateMockData(
  fields: MockField[],
  rowCount: number,
  options: MockDataOptions = {}
): MockDataset {
  const random = options.random ?? Math.random;
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pick = <T>(items: ReadonlyArray<T>): T => items[Math.min(items.length - 1, integer(0, items.length - 1))];
  // UUIDs follow the injected sequence when there is one, and use the secure source otherwise.
  const uuid = options.random
    ? () => uuidV4({ randomBytes: (length) => Uint8Array.from({ length }, () => integer(0, 255)) })
    : () => uuidV4();

  const total = Number.isInteger(rowCount) && rowCount > 0 ? rowCount : 0;
  const rows: MockValue[][] = [];

  for (let index = 0; index < total; index++) {
    let firstName = '';
    let lastName = '';
    let location: (typeof LOCATIONS)[number] | undefined;

    const getFirstName = () => (firstName ||= pick(FIRST_NAMES));
    const getLastName = () => (lastName ||= pick(LAST_NAMES));
    const getLocation = () => (location ??= pick(LOCATIONS));

    rows.push(
      fields.map((field): MockValue => {
        switch (field.type) {
          case 'id_seq':
            return index + 1;
          case 'id_uuid':
            return uuid();
          case 'first_name':
            return getFirstName();
          case 'last_name':
            return getLastName();
          case 'full_name':
            return `${getFirstName()} ${getLastName()}`;
          case 'email': {
            const local = `${getFirstName().toLowerCase()}.${getLastName().toLowerCase()}`;
            const domain = pick(DOMAINS);
            const number = random() > 0.5 ? integer(0, 99) : '';
            return `${local}${number}@${domain}`;
          }
          case 'phone':
            return `+1 (555) ${integer(100, 999)}-${integer(1000, 9999)}`;
          case 'street':
            return `${integer(100, 8999)} ${pick(STREETS)}`;
          case 'city':
            return getLocation()[0];
          case 'state':
            return getLocation()[1];
          case 'country':
            return pick(COUNTRIES);
          case 'zip':
            return String(integer(10000, 99999));
          case 'company':
            return pick(COMPANIES);
          case 'job':
            return pick(JOBS);
          case 'date':
            return new Date(DATE_START + random() * (DATE_END - DATE_START)).toISOString().split('T')[0];
          case 'boolean':
            return random() > 0.5;
          case 'text':
            return pick(PHRASES);
          default:
            return '';
        }
      })
    );
  }

  return { columns: columnNames(fields), rows };
}

/** The dataset as a pretty-printed JSON array of objects keyed by column name. */
export function mockDataToJson(dataset: MockDataset): string {
  const objects = dataset.rows.map((row) =>
    Object.fromEntries(dataset.columns.map((column, index) => [column, row[index]]))
  );
  return JSON.stringify(objects, null, 2);
}

/** The dataset as CSV with a header row and every field quoted. Empty when there are no rows. */
export function mockDataToCsv(dataset: MockDataset): string {
  if (dataset.rows.length === 0) return '';

  const quote = (value: MockValue) => `"${String(value).replace(/"/g, '""')}"`;
  return [dataset.columns, ...dataset.rows].map((row) => row.map(quote).join(',')).join('\n');
}
