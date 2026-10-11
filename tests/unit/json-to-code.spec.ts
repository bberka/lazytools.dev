import { test, expect } from '@playwright/test';
import {
  JSON_CODE_LANGUAGES,
  generateCodeFromJson,
  inspectJson,
  type JsonCodeLanguage,
  type TypeScriptOptions,
} from '@/lib/tools/json-to-code';

const generate = (value: unknown, language: JsonCodeLanguage, rootName?: string) =>
  generateCodeFromJson(value, language, { rootName });

const typescript = (value: unknown, options: Partial<TypeScriptOptions> = {}, rootName?: string) =>
  generateCodeFromJson(value, 'typescript', { rootName, typescript: options });

const lines = (...text: string[]) => text.join('\n');

/** The sample shown as the input placeholder. */
const PROFILE = {
  id: 1,
  name: 'Ada Lovelace',
  active: true,
  roles: ['Admin', 'Editor'],
  company: { name: 'Analytical Engine Co', address: 'London' },
};

/** Two records that differ: a missing key, a null, a whole number next to a fraction. */
const USERS = [
  { id: 1, name: 'Ada', score: 9, nickname: null },
  { id: 2, name: 'Grace', score: 9.5, nickname: 'Amazing Grace', email: 'grace@example.com' },
];

const ALL_LANGUAGES = JSON_CODE_LANGUAGES.map((language) => language.value);

test.describe('inspectJson', () => {
  test('summarises what the text holds', () => {
    expect(inspectJson('{"a": 1, "b": 2}')).toEqual({
      valid: true,
      value: { a: 1, b: 2 },
      summary: 'Object with 2 keys',
    });
    expect(inspectJson('{"a": 1}')).toMatchObject({ summary: 'Object with 1 key' });
    expect(inspectJson('[1, 2, 3]')).toMatchObject({ summary: 'Array with 3 items' });
    expect(inspectJson('[1]')).toMatchObject({ summary: 'Array with 1 item' });
    expect(inspectJson('[]')).toMatchObject({ summary: 'Array with 0 items' });
    expect(inspectJson('"text"')).toMatchObject({ summary: 'Primitive (string)' });
    expect(inspectJson('42')).toMatchObject({ summary: 'Primitive (number)' });
    expect(inspectJson('null')).toEqual({ valid: true, value: null, summary: 'Primitive (null)' });
  });

  test('reports invalid JSON with the parser message', () => {
    const result = inspectJson('{"a": }');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.length).toBeGreaterThan(0);
    expect(inspectJson('').valid).toBe(false);
    expect(inspectJson("{'a': 1}").valid).toBe(false);
  });
});

test.describe('TypeScript', () => {
  test('writes an interface per object, root first', () => {
    expect(typescript(PROFILE)).toBe(
      lines(
        'export interface RootObject {',
        '  id: number;',
        '  name: string;',
        '  active: boolean;',
        '  roles: string[];',
        '  company: Company;',
        '}',
        '',
        'export interface Company {',
        '  name: string;',
        '  address: string;',
        '}'
      )
    );
  });

  test('applies the declaration options', () => {
    expect(
      typescript(
        { id: 1, tag: { name: 'x' } },
        { useType: true, exportKeyword: false, optional: true, readonly: true }
      )
    ).toBe(
      lines(
        'type RootObject = {',
        '  readonly id?: number;',
        '  readonly tag?: Tag;',
        '};',
        '',
        'type Tag = {',
        '  readonly name?: string;',
        '};'
      )
    );
  });

  // "type X = {...};" kept its semicolon when the option was off.
  test('leaves every semicolon out when asked to', () => {
    expect(typescript({ id: 1 }, { semicolon: false })).toBe(
      lines('export interface RootObject {', '  id: number', '}')
    );
    expect(typescript({ id: 1 }, { semicolon: false, useType: true })).toBe(
      lines('export type RootObject = {', '  id: number', '}')
    );
    expect(typescript([1], { semicolon: false })).toBe('export type RootObject = number[]');
  });

  // Each array item used to get its own interface: User, User1, User2...
  test('merges the objects of an array into one type', () => {
    expect(typescript(USERS, {}, 'Users')).toBe(
      lines(
        'export type Users = User[];',
        '',
        'export interface User {',
        '  id: number;',
        '  name: string;',
        '  score: number;',
        '  nickname: string | null;',
        '  email?: string;',
        '}'
      )
    );

    const many = Array.from({ length: 500 }, (_, index) => ({ id: index, name: `n${index}` }));
    const code = typescript({ items: many });
    expect(code.match(/interface /g)).toHaveLength(2);
    expect(code).toContain('items: Item[];');
  });

  test('merges nested objects and arrays inside array items', () => {
    const code = typescript([
      { owner: { name: 'a' }, tags: ['x'] },
      { owner: { name: 'b', age: 3 }, tags: [1] },
    ]);
    expect(code).toContain('export type RootObject = RootObjectItem[];');
    expect(code).toContain('  owner: Owner;');
    expect(code).toContain('  tags: (string | number)[];');
    expect(code).toContain(lines('export interface Owner {', '  name: string;', '  age?: number;', '}'));
    expect(code.match(/interface /g)).toHaveLength(2);
  });

  test('types mixed, empty and null values', () => {
    expect(typescript({ mixed: [1, 'a', null], empty: [], nothing: null, grid: [[1], [2, 3]] })).toBe(
      lines(
        'export interface RootObject {',
        '  mixed: (number | string | null)[];',
        '  empty: any[];',
        '  nothing: any;',
        '  grid: number[][];',
        '}'
      )
    );
  });

  // A root name that was not already PascalCase added a bogus "interface user { data: User }".
  test('cleans the root name instead of wrapping the root', () => {
    expect(typescript({ id: 1 }, {}, 'user')).toBe(
      lines('export interface User {', '  id: number;', '}')
    );
    expect(typescript({ id: 1 }, {}, 'api response')).toBe(
      lines('export interface ApiResponse {', '  id: number;', '}')
    );
    expect(typescript({ id: 1 }, {}, '   ')).toContain('export interface RootObject {');
  });

  // An array root in interface mode used to become "interface RootObject { data: ...[] }".
  test('aliases a root that is not an object', () => {
    expect(typescript([{ id: 1 }])).toBe(
      lines(
        'export type RootObject = RootObjectItem[];',
        '',
        'export interface RootObjectItem {',
        '  id: number;',
        '}'
      )
    );
    expect(typescript([1, 2])).toBe('export type RootObject = number[];');
    expect(typescript('text')).toBe('export type RootObject = string;');
    expect(typescript(null)).toBe('export type RootObject = any;');
    expect(typescript([])).toBe('export type RootObject = any[];');
  });

  test('quotes keys that are not identifiers', () => {
    expect(typescript({ 'first-name': 'a', '2fa': true, $ref: 'r', "it's": 1, 'a\\b': 2 })).toBe(
      lines(
        'export interface RootObject {',
        "  'first-name': string;",
        "  '2fa': boolean;",
        '  $ref: string;',
        '  "it\'s": number;',
        '  "a\\\\b": number;',
        '}'
      )
    );
  });

  test('gives every type a valid, unused name', () => {
    const code = typescript({
      a: { item: { x: 1 } },
      b: { item: { y: 'z' } },
      '2024': { total: 1 },
      '???': { n: 1 },
      RootObject: { nested: true },
    });
    expect(code).toContain('export interface Item {');
    expect(code).toContain('export interface Item1 {');
    expect(code).toContain("  '2024': _2024;");
    expect(code).toContain('export interface _2024 {');
    expect(code).toContain("  '???': SubObject;");
    expect(code).toContain('  RootObject: RootObject1;');
  });
});

test.describe('Zod', () => {
  // The schemas were listed root first, so the root read a const before its declaration.
  test('declares a nested schema before the schema that uses it', () => {
    const code = generate(PROFILE, 'zod');
    expect(code).toBe(
      lines(
        "import { z } from 'zod';",
        '',
        'const companySchema = z.object({',
        '  name: z.string(),',
        '  address: z.string(),',
        '});',
        '',
        'const rootObjectSchema = z.object({',
        '  id: z.number().int(),',
        '  name: z.string(),',
        '  active: z.boolean(),',
        '  roles: z.array(z.string()),',
        '  company: companySchema,',
        '});'
      )
    );
    expect(code.indexOf('const companySchema')).toBeLessThan(code.indexOf('company: companySchema'));
  });

  test('marks optional and nullable properties and merges array items', () => {
    expect(generate(USERS, 'zod', 'Users')).toBe(
      lines(
        "import { z } from 'zod';",
        '',
        'const userSchema = z.object({',
        '  id: z.number().int(),',
        '  name: z.string(),',
        '  score: z.number(),',
        '  nickname: z.string().nullable(),',
        '  email: z.string().optional(),',
        '});',
        '',
        'const usersSchema = z.array(userSchema);'
      )
    );
  });

  // An unquoted key such as first-name is a syntax error.
  test('quotes keys that are not identifiers', () => {
    const code = generate({ 'first-name': 'a', '2fa': true, ok: 1 }, 'zod');
    expect(code).toContain('  "first-name": z.string(),');
    expect(code).toContain('  "2fa": z.boolean(),');
    expect(code).toContain('  ok: z.number().int(),');
  });

  test('writes unions and unknown values', () => {
    const code = generate({ mixed: [1, 'a'], empty: [], nothing: null }, 'zod');
    expect(code).toContain('  mixed: z.array(z.union([z.number().int(), z.string()])),');
    expect(code).toContain('  empty: z.array(z.any()),');
    expect(code).toContain('  nothing: z.any(),');
  });
});

test.describe('Python', () => {
  test('writes dataclasses, root first', () => {
    expect(generate(PROFILE, 'python-dataclass')).toBe(
      lines(
        'from __future__ import annotations',
        'from dataclasses import dataclass',
        'from typing import Any',
        '',
        '@dataclass',
        'class RootObject:',
        '    id: int',
        '    name: str',
        '    active: bool',
        '    roles: list[str]',
        '    company: Company',
        '',
        '@dataclass',
        'class Company:',
        '    name: str',
        '    address: str'
      )
    );
  });

  // "from: str" and "class: str" are syntax errors, and an empty class body is too.
  test('makes dataclass field names valid', () => {
    const code = generate(
      { from: 'a', class: 'b', firstName: 'c', '2fa': true, 'user id': 1, 'user-id': 2, empty: {} },
      'python-dataclass'
    );
    expect(code).toContain('    from_: str');
    expect(code).toContain('    class_: str');
    expect(code).toContain('    first_name: str');
    expect(code).toContain('    _2fa: bool');
    expect(code).toContain('    user_id: int');
    expect(code).toContain('    user_id2: int');
    expect(code).toContain(lines('@dataclass', 'class Empty:', '    pass'));
  });

  test('marks values that can be missing or null', () => {
    const code = generate(USERS, 'python-dataclass', 'Users');
    expect(code).toContain('    score: float');
    expect(code).toContain('    nickname: str | None');
    expect(code).toContain('    email: str | None');
    // The alias runs when the module loads, so it has to follow the class.
    expect(code.endsWith(lines('', 'Users = list[User]'))).toBe(true);
  });

  // Every TypedDict used to be written as `"id": int,` lines, which is not Python.
  test('writes TypedDict classes with real annotations', () => {
    expect(generate(PROFILE, 'python-typeddict')).toBe(
      lines(
        'from __future__ import annotations',
        'from typing import Any, TypedDict',
        '',
        'class Company(TypedDict):',
        '    name: str',
        '    address: str',
        '',
        'class RootObject(TypedDict):',
        '    id: int',
        '    name: str',
        '    active: bool',
        '    roles: list[str]',
        '    company: Company'
      )
    );
  });

  test('uses the call form of TypedDict for keys a class body cannot hold', () => {
    const code = generate({ 'first-name': 'a', class: 'b', __v: 0, inner: { ok: true } }, 'python-typeddict');
    expect(code).toBe(
      lines(
        'from __future__ import annotations',
        'from typing import Any, TypedDict',
        '',
        'class Inner(TypedDict):',
        '    ok: bool',
        '',
        'RootObject = TypedDict("RootObject", {',
        '    "first-name": str,',
        '    "class": str,',
        '    "__v": int,',
        '    "inner": Inner,',
        '})'
      )
    );
  });

  test('marks TypedDict keys that can be missing', () => {
    const code = generate(USERS, 'python-typeddict', 'Users');
    expect(code).toContain('from typing import Any, NotRequired, TypedDict');
    expect(code).toContain('    nickname: str | None');
    expect(code).toContain('    email: NotRequired[str]');
    expect(generate({}, 'python-typeddict')).toContain(lines('class RootObject(TypedDict):', '    pass'));
  });
});

test.describe('Go', () => {
  test('writes structs with json tags', () => {
    expect(generate(PROFILE, 'go')).toBe(
      lines(
        'type RootObject struct {',
        '\tId int64 `json:"id"`',
        '\tName string `json:"name"`',
        '\tActive bool `json:"active"`',
        '\tRoles []string `json:"roles"`',
        '\tCompany Company `json:"company"`',
        '}',
        '',
        'type Company struct {',
        '\tName string `json:"name"`',
        '\tAddress string `json:"address"`',
        '}'
      )
    );
  });

  // Only the first array item was read: "score" came out int64 and "email" was lost.
  test('reads every item of an array', () => {
    expect(generate(USERS, 'go', 'Users')).toBe(
      lines(
        'type Users []User',
        '',
        'type User struct {',
        '\tId int64 `json:"id"`',
        '\tName string `json:"name"`',
        '\tScore float64 `json:"score"`',
        '\tNickname *string `json:"nickname"`',
        '\tEmail *string `json:"email,omitempty"`',
        '}'
      )
    );
    expect(generate({ values: [1, 2.5] }, 'go')).toContain('\tValues []float64 `json:"values"`');
    expect(generate({ values: [null, { a: 1 }] }, 'go')).toContain('\tValues []*Value `json:"values"`');
  });

  // "_id" and "2fa" used to give fields encoding/json cannot see or Go cannot compile.
  test('exports every field under a valid, unique name', () => {
    const code = generate({ _id: 'a', '2fa': true, $ref: 'r', 'a b': 1, 'a-b': 2 }, 'go');
    expect(code).toContain('\tId string `json:"_id"`');
    expect(code).toContain('\tField2fa bool `json:"2fa"`');
    expect(code).toContain('\tRef string `json:"$ref"`');
    expect(code).toContain('\tAB int64 `json:"a b"`');
    expect(code).toContain('\tAB2 int64 `json:"a-b"`');
  });
});

test.describe('Java', () => {
  // The nested class was named twice: field "Company", getter "Company1".
  test('uses one class per nested object', () => {
    const code = generate(PROFILE, 'java');
    expect(code).toContain('    private Company company;');
    expect(code).toContain('    public Company getCompany() { return company; }');
    expect(code).toContain('    public void setCompany(Company company) { this.company = company; }');
    expect(code.match(/public class /g)).toHaveLength(2);
    expect(code).not.toContain('Company1');
  });

  // List<long> does not compile.
  test('boxes primitives inside a List and imports List', () => {
    const code = generate({ ids: [1, 2], ratios: [0.5], flags: [true], count: 3 }, 'java');
    expect(code.startsWith(lines('import java.util.List;', '', 'public class RootObject {'))).toBe(true);
    expect(code).toContain('    private List<Long> ids;');
    expect(code).toContain('    private List<Double> ratios;');
    expect(code).toContain('    private List<Boolean> flags;');
    expect(code).toContain('    private long count;');
    expect(generate({ count: 3 }, 'java')).not.toContain('import');
  });

  test('boxes a primitive that can be null or missing', () => {
    const code = generate([{ n: 1, on: true }, { n: null }], 'java');
    expect(code).toContain('// Root value: List<RootObjectItem>');
    expect(code).toContain('    private Long n;');
    expect(code).toContain('    private Boolean on;');
  });

  test('avoids reserved words and leading digits', () => {
    const code = generate({ class: 'a', default: 1, '2fa': true }, 'java');
    expect(code).toContain('    private String class_;');
    expect(code).toContain('    public String getClass_() { return class_; }');
    expect(code).toContain('    private long default_;');
    expect(code).toContain('    private boolean _2fa;');
  });
});

test.describe('C#', () => {
  test('writes classes with properties', () => {
    expect(generate({ id: 1, name: 'a', tags: ['x'] }, 'csharp')).toBe(
      lines(
        'using System.Collections.Generic;',
        '',
        'public class RootObject',
        '{',
        '    public long Id { get; set; }',
        '    public string Name { get; set; }',
        '    public List<string> Tags { get; set; }',
        '}'
      )
    );
  });

  test('makes value types nullable where the value can be null or missing', () => {
    const code = generate([{ n: 1, on: true, s: 'a' }, { n: null, s: null }], 'csharp');
    expect(code).toContain('    public long? N { get; set; }');
    expect(code).toContain('    public bool? On { get; set; }');
    expect(code).toContain('    public string S { get; set; }');
  });

  // A property named like its class is error CS0542.
  test('does not name a property after its class', () => {
    const code = generate({ data: { data: [1] } }, 'csharp');
    expect(code).toContain(lines('public class Data', '{', '    public List<long> Data2 { get; set; }'));
  });
});

test.describe('Rust', () => {
  // "pub type: String" does not compile.
  test('escapes keywords and renames what serde cannot derive', () => {
    expect(
      generate({ type: 'a', self: 1, firstName: 'b', '2fa': true, plain: 1.5, nothing: null }, 'rust')
    ).toBe(
      lines(
        'use serde::{Deserialize, Serialize};',
        '',
        '#[derive(Debug, Serialize, Deserialize)]',
        'pub struct RootObject {',
        '    pub r#type: String,',
        '    #[serde(rename = "self")]',
        '    pub self_: i64,',
        '    #[serde(rename = "firstName")]',
        '    pub first_name: String,',
        '    #[serde(rename = "2fa")]',
        '    pub _2fa: bool,',
        '    pub plain: f64,',
        '    pub nothing: serde_json::Value,',
        '}'
      )
    );
  });

  test('wraps values that can be null or missing in Option', () => {
    const code = generate(USERS, 'rust', 'Users');
    expect(code).toContain('pub type Users = Vec<User>;');
    expect(code).toContain('    pub score: f64,');
    expect(code).toContain('    pub nickname: Option<String>,');
    expect(code).toContain('    pub email: Option<String>,');
    expect(generate({ mixed: [1, 'a', null] }, 'rust')).toContain(
      '    pub mixed: Vec<serde_json::Value>,'
    );
  });
});

test.describe('Swift', () => {
  test('writes Codable structs', () => {
    expect(generate(PROFILE, 'swift')).toBe(
      lines(
        'struct RootObject: Codable {',
        '    let id: Int',
        '    let name: String',
        '    let active: Bool',
        '    let roles: [String]',
        '    let company: Company',
        '}',
        '',
        'struct Company: Codable {',
        '    let name: String',
        '    let address: String',
        '}'
      )
    );
  });

  // A renamed property only had a comment, so decoding looked for the wrong key.
  test('maps renamed properties with CodingKeys', () => {
    expect(generate({ id: 1, 'first-name': 'a', class: 'b', self: 2 }, 'swift')).toBe(
      lines(
        'struct RootObject: Codable {',
        '    let id: Int',
        '    let firstName: String',
        '    let `class`: String',
        '    let self_: Int',
        '',
        '    enum CodingKeys: String, CodingKey {',
        '        case id',
        '        case firstName = "first-name"',
        '        case `class`',
        '        case self_ = "self"',
        '    }',
        '}'
      )
    );
  });

  test('marks optionals', () => {
    const code = generate(USERS, 'swift', 'Users');
    expect(code).toContain('typealias Users = [User]');
    expect(code).toContain('    let nickname: String?');
    expect(code).toContain('    let email: String?');
    expect(generate({ nothing: null, empty: [] }, 'swift')).toContain(
      lines('    let nothing: Any?', '    let empty: [Any]')
    );
  });
});

test.describe('Kotlin', () => {
  test('writes data classes', () => {
    expect(generate(PROFILE, 'kotlin')).toBe(
      lines(
        'data class RootObject(',
        '    val id: Long,',
        '    val name: String,',
        '    val active: Boolean,',
        '    val roles: List<String>,',
        '    val company: Company,',
        ')',
        '',
        'data class Company(',
        '    val name: String,',
        '    val address: String,',
        ')'
      )
    );
  });

  // "val class: String" does not compile, and neither does a data class without properties.
  test('escapes keywords and handles an empty object', () => {
    const code = generate({ class: 'a', object: 1, when: true, empty: {} }, 'kotlin');
    expect(code).toContain('    val `class`: String,');
    expect(code).toContain('    val `object`: Long,');
    expect(code).toContain('    val `when`: Boolean,');
    expect(code).toContain('    val empty: Empty,');
    expect(code.endsWith('class Empty')).toBe(true);
    expect(code).not.toContain('data class Empty');
  });

  test('marks nullable types', () => {
    const code = generate(USERS, 'kotlin', 'Users');
    expect(code).toContain('typealias Users = List<User>');
    expect(code).toContain('    val score: Double,');
    expect(code).toContain('    val nickname: String?,');
    expect(code).toContain('    val email: String?,');
  });
});

test.describe('Dart', () => {
  // fromJson used to assign the decoded Map and List<dynamic> straight to typed fields.
  test('converts nested objects, lists and doubles in fromJson', () => {
    expect(generate({ id: 1, price: 9.5, tags: ['a'], owner: { name: 'x' }, items: [{ n: 1 }] }, 'dart')).toBe(
      lines(
        'class RootObject {',
        '  final int id;',
        '  final double price;',
        '  final List<String> tags;',
        '  final Owner owner;',
        '  final List<Item> items;',
        '',
        '  RootObject({',
        '    required this.id,',
        '    required this.price,',
        '    required this.tags,',
        '    required this.owner,',
        '    required this.items,',
        '  });',
        '',
        '  factory RootObject.fromJson(Map<String, dynamic> json) {',
        '    return RootObject(',
        "      id: json['id'] as int,",
        "      price: (json['price'] as num).toDouble(),",
        "      tags: (json['tags'] as List<dynamic>).map((e) => e as String).toList(),",
        "      owner: Owner.fromJson(json['owner'] as Map<String, dynamic>),",
        "      items: (json['items'] as List<dynamic>).map((e) => Item.fromJson(e as Map<String, dynamic>)).toList(),",
        '    );',
        '  }',
        '',
        '  Map<String, dynamic> toJson() {',
        '    return {',
        "      'id': id,",
        "      'price': price,",
        "      'tags': tags,",
        "      'owner': owner,",
        "      'items': items,",
        '    };',
        '  }',
        '}',
        '',
        'class Item {',
        '  final int n;',
        '',
        '  Item({',
        '    required this.n,',
        '  });',
        '',
        '  factory Item.fromJson(Map<String, dynamic> json) {',
        '    return Item(',
        "      n: json['n'] as int,",
        '    );',
        '  }',
        '',
        '  Map<String, dynamic> toJson() {',
        '    return {',
        "      'n': n,",
        '    };',
        '  }',
        '}',
        '',
        'class Owner {',
        '  final String name;',
        '',
        '  Owner({',
        '    required this.name,',
        '  });',
        '',
        '  factory Owner.fromJson(Map<String, dynamic> json) {',
        '    return Owner(',
        "      name: json['name'] as String,",
        '    );',
        '  }',
        '',
        '  Map<String, dynamic> toJson() {',
        '    return {',
        "      'name': name,",
        '    };',
        '  }',
        '}'
      )
    );
  });

  // The nested class used to be emitted twice, as Company and Company1.
  test('writes each nested class once', () => {
    const code = generate(PROFILE, 'dart');
    expect(code.match(/^class /gm)).toHaveLength(2);
    expect(code).not.toContain('Company1');
  });

  test('handles values that can be null or missing', () => {
    const code = generate(
      [
        { n: 1, ratio: 0.5, owner: { name: 'a' }, tags: ['x'], any: null },
        { n: null, ratio: null, owner: null, tags: null, any: null },
      ],
      'dart',
      'Rows'
    );
    expect(code).toContain('typedef Rows = List<Row>;');
    expect(code).toContain('  final int? n;');
    expect(code).toContain("      n: json['n'] as int?,");
    expect(code).toContain("      ratio: (json['ratio'] as num?)?.toDouble(),");
    expect(code).toContain(
      "      owner: json['owner'] == null ? null : Owner.fromJson(json['owner'] as Map<String, dynamic>),"
    );
    expect(code).toContain(
      "      tags: json['tags'] == null ? null : (json['tags'] as List<dynamic>).map((e) => e as String).toList(),"
    );
    expect(code).toContain('  final dynamic any;');
    expect(code).toContain("      any: json['any'],");
  });

  // "required this._id" is an error, and '$ref' in a string is interpolation.
  test('makes field names and key strings valid', () => {
    const code = generate({ _id: 'a', $ref: 'b', class: 'c', '2fa': true, "it's": 1 }, 'dart');
    expect(code).toContain('    required this.id,');
    expect(code).toContain("      id: json['_id'] as String,");
    expect(code).toContain("      $ref: json['\\$ref'] as String,");
    expect(code).toContain("      '\\$ref': $ref,");
    expect(code).toContain('  final String class_;');
    expect(code).toContain('  final bool n2fa;');
    expect(code).toContain("      itS: json['it\\'s'] as int,");
  });

  test('writes a class without fields that still compiles', () => {
    expect(generate({}, 'dart')).toBe(
      lines(
        'class RootObject {',
        '  RootObject();',
        '',
        '  factory RootObject.fromJson(Map<String, dynamic> json) {',
        '    return RootObject();',
        '  }',
        '',
        '  Map<String, dynamic> toJson() {',
        '    return {};',
        '  }',
        '}'
      )
    );
  });
});

test.describe('every language', () => {
  // A root that is not an object used to give an empty box in most languages,
  // and a null root gave nothing in all of them.
  test('names a root that is not an object', () => {
    const expected: Record<JsonCodeLanguage, string> = {
      typescript: 'export type RootObject = number[];',
      zod: 'const rootObjectSchema = z.array(z.number().int());',
      'python-dataclass': 'RootObject = list[int]',
      'python-typeddict': 'RootObject = list[int]',
      go: 'type RootObject []int64',
      java: '// Root value: List<Long>',
      csharp: '// Root value: List<long>',
      rust: 'pub type RootObject = Vec<i64>;',
      swift: 'typealias RootObject = [Int]',
      kotlin: 'typealias RootObject = List<Long>',
      dart: 'typedef RootObject = List<int>;',
    };
    for (const language of ALL_LANGUAGES) {
      expect(generate([1, 2, 3], language), language).toContain(expected[language]);
    }
  });

  test('writes something for every kind of root', () => {
    for (const language of ALL_LANGUAGES) {
      for (const value of [null, true, 1.5, 'text', [], {}, [[]], [null], [{}]]) {
        const code = generate(value, language);
        expect(code, `${language} ${JSON.stringify(value)}`).toMatch(/RootObject|Root value/i);
      }
    }
  });

  test('keeps non-ASCII keys instead of dropping their letters', () => {
    const sample = { şehir: 'İzmir', 名前: 'n', ülke: { ad: 'TR' } };
    expect(generate(sample, 'go')).toContain('\tŞehir string `json:"şehir"`');
    expect(generate(sample, 'csharp')).toContain('    public string Şehir { get; set; }');
    expect(generate(sample, 'csharp')).toContain('public class Ülke');
    expect(generate(sample, 'kotlin')).toContain('    val 名前: String,');
    expect(generate(sample, 'python-dataclass')).toContain('    şehir: str');
    // Dart identifiers are ASCII only, so the letters that remain are used.
    expect(generate(sample, 'dart')).toContain('  final String ehir;');
  });

  test('gives two keys that clean up to the same name different fields', () => {
    const sample = { 'user id': 1, 'user-id': 2, 名前: 'a', 住所: 'b' };
    expect(generate(sample, 'java')).toContain('    private long userId2;');
    expect(generate(sample, 'swift')).toContain('        case userId2 = "user-id"');
    expect(generate(sample, 'rust')).toContain('    pub user_id2: i64,');
    const dart = generate(sample, 'dart');
    expect(dart).toContain('  final String subObject;');
    expect(dart).toContain('  final String subObject2;');
  });

  test('does not shadow a built-in type with a generated one', () => {
    const sample = { string: { a: 1 }, list: { b: 2 }, label: 'x', tags: ['y'] };
    const java = generate(sample, 'java');
    expect(java).toContain('    private String1 string;');
    expect(java).toContain('    private List1 list;');
    expect(java).toContain('    private String label;');
    expect(java).toContain('    private List<String> tags;');
  });

  test('copes with a large array without one type per item', () => {
    const rows = Array.from({ length: 5000 }, (_, index) => ({
      id: index,
      name: `row ${index}`,
      extra: index % 2 ? { note: 'n' } : null,
    }));
    for (const language of ALL_LANGUAGES) {
      const code = generate(rows, language, 'Rows');
      expect(code.length, language).toBeLessThan(2000);
    }
  });
});
