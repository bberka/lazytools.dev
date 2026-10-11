/**
 * Generates typed models from a JSON sample: TypeScript, Zod, Python, Go,
 * Java, C#, Rust, Swift, Kotlin and Dart.
 *
 * The sample is first reduced to a shape. Every object in an array is merged
 * into one shape, so a key that only some of them have becomes optional and a
 * value that is null in some of them becomes nullable. Each language then
 * prints that shape in its own syntax, with field names made valid for it:
 * no reserved words, no leading digits, no two fields sharing a name.
 *
 * Nothing here touches the DOM, so it runs in Node.
 */

// ── Public types ──────────────────────────────────────────────────────────────

export type JsonCodeLanguage =
  | 'typescript'
  | 'go'
  | 'python-dataclass'
  | 'python-typeddict'
  | 'java'
  | 'csharp'
  | 'rust'
  | 'swift'
  | 'kotlin'
  | 'dart'
  | 'zod';

export const JSON_CODE_LANGUAGES: ReadonlyArray<{ value: JsonCodeLanguage; label: string }> = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'zod', label: 'TypeScript — Zod Schema' },
  { value: 'python-dataclass', label: 'Python — dataclass' },
  { value: 'python-typeddict', label: 'Python — TypedDict' },
  { value: 'go', label: 'Go — struct' },
  { value: 'java', label: 'Java — class' },
  { value: 'csharp', label: 'C# — class' },
  { value: 'rust', label: 'Rust — struct' },
  { value: 'swift', label: 'Swift — struct' },
  { value: 'kotlin', label: 'Kotlin — data class' },
  { value: 'dart', label: 'Dart — class' },
];

export interface TypeScriptOptions {
  /** `type X = {...}` instead of `interface X {...}`. */
  useType: boolean;
  exportKeyword: boolean;
  /** Mark every property optional, not only the ones missing from some samples. */
  optional: boolean;
  readonly: boolean;
  semicolon: boolean;
}

export const DEFAULT_TYPESCRIPT_OPTIONS: TypeScriptOptions = {
  useType: false,
  exportKeyword: true,
  optional: false,
  readonly: false,
  semicolon: true,
};

export interface JsonCodeOptions {
  /** Name of the outermost type. Blank means `RootObject`. */
  rootName?: string;
  /** Only read for the `typescript` language. */
  typescript?: Partial<TypeScriptOptions>;
}

export type JsonInspection =
  | { valid: true; value: unknown; summary: string }
  | { valid: false; error: string };

// ── Reading the JSON text ─────────────────────────────────────────────────────

/** Parses JSON text and says in a few words what it holds, or why it is invalid. */
export function inspectJson(text: string): JsonInspection {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Invalid JSON format' };
  }

  const count = (amount: number, noun: string) =>
    `${amount.toLocaleString()} ${noun}${amount === 1 ? '' : 's'}`;

  if (Array.isArray(value)) {
    return { valid: true, value, summary: `Array with ${count(value.length, 'item')}` };
  }
  if (value && typeof value === 'object') {
    return { valid: true, value, summary: `Object with ${count(Object.keys(value).length, 'key')}` };
  }
  return { valid: true, value, summary: `Primitive (${value === null ? 'null' : typeof value})` };
}

// ── The shape of a sample ─────────────────────────────────────────────────────

type Shape = (
  // Only null was seen, or nothing at all (the items of an empty array).
  | { kind: 'unknown' }
  | { kind: 'string' }
  | { kind: 'boolean' }
  | { kind: 'number'; integer: boolean }
  | { kind: 'array'; items: Shape }
  | { kind: 'object'; fields: Map<string, Field> }
  // Values of different kinds in one place; at most one member per kind.
  | { kind: 'union'; members: Shape[] }
) & {
  /** Null was seen here, alongside the value or instead of it. */
  nullable: boolean;
};

type ObjectShape = Extract<Shape, { kind: 'object' }>;

interface Field {
  shape: Shape;
  /** The key is missing from some of the objects merged into this one. */
  optional: boolean;
}

function shapeOf(value: unknown): Shape {
  if (value === null) return { kind: 'unknown', nullable: true };
  if (typeof value === 'string') return { kind: 'string', nullable: false };
  if (typeof value === 'boolean') return { kind: 'boolean', nullable: false };
  if (typeof value === 'number') {
    return { kind: 'number', integer: Number.isInteger(value), nullable: false };
  }

  if (Array.isArray(value)) {
    let items: Shape = { kind: 'unknown', nullable: false };
    for (const item of value) {
      items = mergeShapes(items, shapeOf(item));
    }
    return { kind: 'array', items, nullable: false };
  }

  if (typeof value === 'object') {
    const fields = new Map<string, Field>();
    for (const [key, item] of Object.entries(value)) {
      fields.set(key, { shape: shapeOf(item), optional: false });
    }
    return { kind: 'object', fields, nullable: false };
  }

  return { kind: 'unknown', nullable: false };
}

function mergeSameKind(a: Shape, b: Shape): Shape {
  if (a.kind === 'number' && b.kind === 'number') {
    return { kind: 'number', integer: a.integer && b.integer, nullable: false };
  }
  if (a.kind === 'array' && b.kind === 'array') {
    return { kind: 'array', items: mergeShapes(a.items, b.items), nullable: false };
  }
  if (a.kind === 'object' && b.kind === 'object') {
    const fields = new Map<string, Field>();
    for (const [key, field] of a.fields) {
      const other = b.fields.get(key);
      fields.set(
        key,
        other
          ? {
              shape: mergeShapes(field.shape, other.shape),
              optional: field.optional || other.optional,
            }
          : { shape: field.shape, optional: true }
      );
    }
    for (const [key, field] of b.fields) {
      if (!a.fields.has(key)) fields.set(key, { shape: field.shape, optional: true });
    }
    return { kind: 'object', fields, nullable: false };
  }
  return a;
}

/** The one shape that fits both samples. */
function mergeShapes(a: Shape, b: Shape): Shape {
  const nullable = a.nullable || b.nullable;
  if (a.kind === 'unknown') return { ...b, nullable };
  if (b.kind === 'unknown') return { ...a, nullable };

  const membersOf = (shape: Shape): Shape[] =>
    shape.kind === 'union' ? shape.members : [{ ...shape, nullable: false }];

  const members = [...membersOf(a)];
  for (const candidate of membersOf(b)) {
    const index = members.findIndex((member) => member.kind === candidate.kind);
    if (index === -1) members.push(candidate);
    else members[index] = mergeSameKind(members[index], candidate);
  }

  return members.length === 1 ? { ...members[0], nullable } : { kind: 'union', members, nullable };
}

// ── Names ─────────────────────────────────────────────────────────────────────

const DEFAULT_ROOT_NAME = 'RootObject';

/** Which characters a language allows in an identifier besides letters, digits and `_`. */
interface NameStyle {
  dollar: boolean;
  /** Letters outside A-Z are not allowed (Dart). */
  ascii: boolean;
}

const JS_STYLE: NameStyle = { dollar: true, ascii: false };
const PLAIN_STYLE: NameStyle = { dollar: false, ascii: false };
const DART_STYLE: NameStyle = { dollar: true, ascii: true };

const JS_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const STARTS_WITH_DIGIT = /^\p{Nd}/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{Nd}]/u;

const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** The key under which the items of the array at `key` are named: "users" gives "user". */
function itemKeyOf(key: string): string {
  if (key === DEFAULT_ROOT_NAME) return `${DEFAULT_ROOT_NAME}Item`;
  if (key.endsWith('s') && key.length > 1) return key.slice(0, -1);
  return `${key}Item`;
}

/**
 * "first-name" gives "FirstName". Underscores and existing capitals are kept,
 * so "user_name" gives "User_name". Empty when the key has nothing usable.
 */
function pascalOf(key: string, style: NameStyle): string {
  const letters = style.ascii ? 'a-zA-Z0-9' : '\\p{L}\\p{Nd}';
  const unusable = new RegExp(`[^${letters}_${style.dollar ? '$' : ''}]+`, 'gu');
  return key
    .replace(unusable, ' ')
    .trim()
    .split(' ')
    .map(upperFirst)
    .join('');
}

function typeNameOf(key: string, style: NameStyle): string {
  const name = pascalOf(key, style) || 'SubObject';
  return STARTS_WITH_DIGIT.test(name) ? `_${name}` : name;
}

/** "firstName" and "first-name" both give "first_name". */
function snakeOf(key: string): string {
  const name = key
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^\p{L}\p{Nd}]/gu, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
  if (!HAS_LETTER_OR_DIGIT.test(name)) return 'field';
  return STARTS_WITH_DIGIT.test(name) ? `_${name}` : name;
}

/** "first-name" gives "firstName"; "user_name" stays as it is. */
function camelOf(key: string, style: NameStyle): string {
  const name = lowerFirst(pascalOf(key, style) || 'SubObject');
  return STARTS_WITH_DIGIT.test(name) ? `_${name}` : name;
}

/**
 * Hands out names that are unique within one scope: a second "Item" becomes
 * "Item1" for types (`firstSuffix` 1) and a second "id" becomes "id2" for fields.
 */
function createNamer(
  toName: (key: string) => string,
  firstSuffix: number,
  reserved: Iterable<string> = []
): (key: string) => string {
  const taken = new Set(reserved);
  return (key) => {
    const base = toName(key);
    let name = base;
    for (let suffix = firstSuffix; taken.has(name); suffix++) {
      name = `${base}${suffix}`;
    }
    taken.add(name);
    return name;
  };
}

const typeNamer = (style: NameStyle, reserved: string[] = []) =>
  createNamer((key) => typeNameOf(key, style), 1, reserved);

const fieldNamer = (toName: (key: string) => string, reserved: string[] = []) =>
  createNamer(toName, 2, reserved);

const words = (list: string) => new Set(list.split(' '));

const PYTHON_KEYWORDS = words(
  'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'
);

const JAVA_KEYWORDS = words(
  '_ abstract assert boolean break byte case catch char class const continue default do double else enum extends false final finally float for goto if implements import instanceof int interface long native new null package private protected public return short static strictfp super switch synchronized this throw throws transient true try void volatile while'
);

const KOTLIN_KEYWORDS = words(
  'as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while'
);

const SWIFT_KEYWORDS = words(
  'Any Self as associatedtype await break case catch class continue default defer deinit do else enum extension fallthrough false fileprivate for func guard if import in init inout internal is let nil open operator precedencegroup private protocol public repeat rethrows return self static struct subscript super switch throw throws true try typealias var where while'
);

const DART_KEYWORDS = words(
  'assert break case catch class const continue default do else enum extends false final finally for if in is new null rethrow return super switch this throw true try var void while with'
);

const RUST_KEYWORDS = words(
  'abstract as async await become box break const continue do dyn else enum extern false final fn for gen if impl in let loop macro match mod move mut override priv pub ref return static struct trait true try type typeof unsafe unsized use virtual where while yield'
);

/** Keywords Rust does not accept even as a raw identifier (`r#self`). */
const RUST_NEVER_RAW = words('crate self super');

// ── Shared output helpers ─────────────────────────────────────────────────────

/** Children are finished before their parent; this puts the parent first. */
const rootFirst = (definitions: string[]) => [...definitions].reverse();

const blocks = (...parts: string[]) => parts.filter(Boolean).join('\n\n');

/** A double-quoted string with `\` and `"` escaped. */
const doubleQuoted = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const isPlainObject = (shape: Shape): shape is ObjectShape =>
  shape.kind === 'object' && !shape.nullable;

// ── TypeScript ────────────────────────────────────────────────────────────────

function tsKey(key: string): string {
  if (JS_IDENTIFIER.test(key)) return key;
  // Single quotes as long as nothing in the key needs escaping.
  return /['\\\u0000-\u001f]/.test(key) ? JSON.stringify(key) : `'${key}'`;
}

function generateTypeScript(root: Shape, rootName: string, options: TypeScriptOptions): string {
  const claim = typeNamer(JS_STYLE);
  const definitions: string[] = [];
  const exp = options.exportKeyword ? 'export ' : '';
  const semi = options.semicolon ? ';' : '';
  const ro = options.readonly ? 'readonly ' : '';

  const baseOf = (shape: Shape, key: string): string => {
    switch (shape.kind) {
      case 'unknown':
        return 'any';
      case 'string':
      case 'number':
      case 'boolean':
        return shape.kind;
      case 'array': {
        const inner = typeOf(shape.items, itemKeyOf(key));
        return inner.includes('|') ? `(${inner})[]` : `${inner}[]`;
      }
      case 'union':
        return shape.members.map((member) => baseOf(member, key)).join(' | ');
      case 'object': {
        const name = claim(key);
        const lines = Array.from(shape.fields, ([fieldKey, field]) => {
          const opt = options.optional || field.optional ? '?' : '';
          return `  ${ro}${tsKey(fieldKey)}${opt}: ${typeOf(field.shape, fieldKey)}${semi}`;
        });
        definitions.push(
          options.useType
            ? `${exp}type ${name} = {\n${lines.join('\n')}\n}${semi}`
            : `${exp}interface ${name} {\n${lines.join('\n')}\n}`
        );
        return name;
      }
    }
  };

  const typeOf = (shape: Shape, key: string): string => {
    const base = baseOf(shape, key);
    return shape.nullable && shape.kind !== 'unknown' ? `${base} | null` : base;
  };

  if (isPlainObject(root)) {
    typeOf(root, rootName);
  } else {
    // An interface cannot name an array or a primitive, so the root is an alias.
    const alias = claim(rootName);
    definitions.push(`${exp}type ${alias} = ${typeOf(root, rootName)}${semi}`);
  }

  return rootFirst(definitions).join('\n\n');
}

// ── Zod ───────────────────────────────────────────────────────────────────────

function generateZod(root: Shape, rootName: string): string {
  const claim = createNamer((key) => `${lowerFirst(typeNameOf(key, JS_STYLE))}Schema`, 1);
  const definitions: string[] = [];

  const baseOf = (shape: Shape, key: string): string => {
    switch (shape.kind) {
      case 'unknown':
        return 'z.any()';
      case 'string':
        return 'z.string()';
      case 'number':
        return shape.integer ? 'z.number().int()' : 'z.number()';
      case 'boolean':
        return 'z.boolean()';
      case 'array':
        return `z.array(${typeOf(shape.items, itemKeyOf(key))})`;
      case 'union':
        return `z.union([${shape.members.map((member) => baseOf(member, key)).join(', ')}])`;
      case 'object': {
        const name = claim(key);
        const lines = Array.from(shape.fields, ([fieldKey, field]) => {
          const property = JS_IDENTIFIER.test(fieldKey) ? fieldKey : JSON.stringify(fieldKey);
          const optional = field.optional ? '.optional()' : '';
          return `  ${property}: ${typeOf(field.shape, fieldKey)}${optional},`;
        });
        definitions.push(`const ${name} = z.object({\n${lines.join('\n')}\n});`);
        return name;
      }
    }
  };

  const typeOf = (shape: Shape, key: string): string => {
    const base = baseOf(shape, key);
    return shape.nullable && shape.kind !== 'unknown' ? `${base}.nullable()` : base;
  };

  if (isPlainObject(root)) {
    typeOf(root, rootName);
  } else {
    const alias = claim(rootName);
    definitions.push(`const ${alias} = ${typeOf(root, rootName)};`);
  }

  // A const cannot be read before its declaration, so nested schemas come first.
  return `import { z } from 'zod';\n\n${definitions.join('\n\n')}`;
}

// ── Go ────────────────────────────────────────────────────────────────────────

/** A field name encoding/json can see: it has to start with a capital letter. */
function goFieldName(key: string): string {
  const name = upperFirst((pascalOf(key, PLAIN_STYLE) || 'SubObject').replace(/^_+/, ''));
  return /^\p{Lu}/u.test(name) ? name : `Field${name}`;
}

function generateGo(root: Shape, rootName: string): string {
  const claim = typeNamer(PLAIN_STYLE);
  const definitions: string[] = [];

  const typeOf = (shape: Shape, key: string, optional = false): string => {
    switch (shape.kind) {
      case 'unknown':
      case 'union':
        return 'interface{}';
      case 'array':
        return `[]${typeOf(shape.items, itemKeyOf(key))}`;
      default: {
        const base = baseOf(shape, key);
        // A pointer is how Go tells "absent or null" from the zero value.
        return shape.nullable || optional ? `*${base}` : base;
      }
    }
  };

  const baseOf = (shape: Shape, key: string): string => {
    switch (shape.kind) {
      case 'string':
        return 'string';
      case 'number':
        return shape.integer ? 'int64' : 'float64';
      case 'boolean':
        return 'bool';
      case 'object': {
        const name = claim(key);
        const nameField = fieldNamer(goFieldName);
        const lines = Array.from(shape.fields, ([fieldKey, field]) => {
          const tag = field.optional ? `${fieldKey},omitempty` : fieldKey;
          return `\t${nameField(fieldKey)} ${typeOf(field.shape, fieldKey, field.optional)} \`json:"${tag}"\``;
        });
        definitions.push(`type ${name} struct {\n${lines.join('\n')}\n}`);
        return name;
      }
      default:
        return 'interface{}';
    }
  };

  let alias = '';
  if (isPlainObject(root)) {
    typeOf(root, rootName);
  } else {
    const name = claim(rootName);
    alias = `type ${name} ${typeOf(root, rootName)}`;
  }

  return blocks(alias, ...rootFirst(definitions));
}

// ── Python ────────────────────────────────────────────────────────────────────

function pythonFieldName(key: string): string {
  const name = snakeOf(key);
  return PYTHON_KEYWORDS.has(name) ? `${name}_` : name;
}

/** A key that can be written as `key: type` in a class body and stay that key. */
function isPythonClassKey(key: string): boolean {
  return (
    /^[\p{L}_][\p{L}\p{Nd}_]*$/u.test(key) &&
    !PYTHON_KEYWORDS.has(key) &&
    !['None', 'True', 'False'].includes(key) &&
    // Python rewrites a leading double underscore inside a class body.
    !key.startsWith('__')
  );
}

function generatePython(root: Shape, rootName: string, flavour: 'dataclass' | 'typeddict'): string {
  const claim = typeNamer(PLAIN_STYLE, ['Any', 'TypedDict', 'NotRequired']);
  const definitions: string[] = [];
  let usesNotRequired = false;

  const typeOf = (shape: Shape, key: string, orNone = false): string => {
    const base = baseOf(shape, key);
    return (shape.nullable || orNone) && shape.kind !== 'unknown' ? `${base} | None` : base;
  };

  const baseOf = (shape: Shape, key: string): string => {
    switch (shape.kind) {
      case 'unknown':
        return 'Any';
      case 'string':
        return 'str';
      case 'number':
        return shape.integer ? 'int' : 'float';
      case 'boolean':
        return 'bool';
      case 'array':
        return `list[${typeOf(shape.items, itemKeyOf(key))}]`;
      case 'union':
        return shape.members.map((member) => baseOf(member, key)).join(' | ');
      case 'object': {
        const name = claim(key);
        definitions.push(
          flavour === 'dataclass' ? dataclassOf(name, shape) : typedDictOf(name, shape)
        );
        return name;
      }
    }
  };

  const dataclassOf = (name: string, shape: ObjectShape): string => {
    const nameField = fieldNamer(pythonFieldName);
    const lines = Array.from(
      shape.fields,
      ([key, field]) => `    ${nameField(key)}: ${typeOf(field.shape, key, field.optional)}`
    );
    return `@dataclass\nclass ${name}:\n${lines.length ? lines.join('\n') : '    pass'}`;
  };

  const typedDictOf = (name: string, shape: ObjectShape): string => {
    const entries = Array.from(shape.fields, ([key, field]) => {
      const type = typeOf(field.shape, key);
      if (field.optional) usesNotRequired = true;
      return { key, type: field.optional ? `NotRequired[${type}]` : type };
    });

    if (entries.length === 0) {
      return `class ${name}(TypedDict):\n    pass`;
    }
    if (entries.every((entry) => isPythonClassKey(entry.key))) {
      const lines = entries.map((entry) => `    ${entry.key}: ${entry.type}`);
      return `class ${name}(TypedDict):\n${lines.join('\n')}`;
    }
    // Keys such as "first-name" or "class" only fit the call form.
    const lines = entries.map((entry) => `    ${JSON.stringify(entry.key)}: ${entry.type},`);
    return `${name} = TypedDict(${JSON.stringify(name)}, {\n${lines.join('\n')}\n})`;
  };

  let alias = '';
  if (isPlainObject(root)) {
    typeOf(root, rootName);
  } else {
    const name = claim(rootName);
    alias = `${name} = ${typeOf(root, rootName)}`;
  }

  // The alias is an expression that runs, so it follows the classes it names.
  if (flavour === 'dataclass') {
    return `from __future__ import annotations\nfrom dataclasses import dataclass\nfrom typing import Any\n\n${blocks(...rootFirst(definitions), alias)}`;
  }
  // The call form of TypedDict runs too, so here every class follows the ones it uses.
  const imports = usesNotRequired ? 'Any, NotRequired, TypedDict' : 'Any, TypedDict';
  return `from __future__ import annotations\nfrom typing import ${imports}\n\n${blocks(...definitions, alias)}`;
}

// ── Java ──────────────────────────────────────────────────────────────────────

function javaFieldName(key: string): string {
  const name = camelOf(key, JS_STYLE);
  return JAVA_KEYWORDS.has(name) ? `${name}_` : name;
}

function generateJava(root: Shape, rootName: string): string {
  const claim = typeNamer(JS_STYLE, ['String', 'Object', 'List', 'Long', 'Double', 'Boolean']);
  const definitions: string[] = [];
  let usesList = false;

  // `boxed` asks for Long instead of long: inside a List, or where null is possible.
  const typeOf = (shape: Shape, key: string, boxed: boolean): string => {
    switch (shape.kind) {
      case 'unknown':
      case 'union':
        return 'Object';
      case 'string':
        return 'String';
      case 'number':
        if (shape.integer) return boxed ? 'Long' : 'long';
        return boxed ? 'Double' : 'double';
      case 'boolean':
        return boxed ? 'Boolean' : 'boolean';
      case 'array':
        usesList = true;
        return `List<${typeOf(shape.items, itemKeyOf(key), true)}>`;
      case 'object': {
        const name = claim(key);
        const nameField = fieldNamer(javaFieldName);
        const members = Array.from(shape.fields, ([fieldKey, field]) => ({
          name: nameField(fieldKey),
          type: typeOf(field.shape, fieldKey, field.shape.nullable || field.optional),
        }));
        const fields = members.map((member) => `    private ${member.type} ${member.name};`);
        const accessors = members.map((member) => {
          const suffix = upperFirst(member.name);
          return `    public ${member.type} get${suffix}() { return ${member.name}; }\n    public void set${suffix}(${member.type} ${member.name}) { this.${member.name} = ${member.name}; }`;
        });
        definitions.push(
          members.length
            ? `public class ${name} {\n${fields.join('\n')}\n\n${accessors.join('\n\n')}\n}`
            : `public class ${name} {\n}`
        );
        return name;
      }
    }
  };

  let rootNote = '';
  if (isPlainObject(root)) {
    typeOf(root, rootName, false);
  } else {
    claim(rootName);
    rootNote = `// Root value: ${typeOf(root, rootName, true)}`;
  }

  return blocks(usesList ? 'import java.util.List;' : '', rootNote, ...rootFirst(definitions));
}

// ── C# ────────────────────────────────────────────────────────────────────────

function csharpPropertyName(key: string): string {
  return typeNameOf(key, PLAIN_STYLE);
}

function generateCsharp(root: Shape, rootName: string): string {
  const claim = typeNamer(PLAIN_STYLE, ['List']);
  const definitions: string[] = [];
  let usesList = false;

  const typeOf = (shape: Shape, key: string, optional = false): string => {
    const maybe = shape.nullable || optional ? '?' : '';
    switch (shape.kind) {
      case 'unknown':
      case 'union':
        return 'object';
      case 'string':
        return 'string';
      case 'number':
        return `${shape.integer ? 'long' : 'double'}${maybe}`;
      case 'boolean':
        return `bool${maybe}`;
      case 'array':
        usesList = true;
        return `List<${typeOf(shape.items, itemKeyOf(key))}>`;
      case 'object': {
        const name = claim(key);
        // A member cannot have the name of the class it is in.
        const nameProperty = fieldNamer(csharpPropertyName, [name]);
        const lines = Array.from(
          shape.fields,
          ([fieldKey, field]) =>
            `    public ${typeOf(field.shape, fieldKey, field.optional)} ${nameProperty(fieldKey)} { get; set; }`
        );
        definitions.push(`public class ${name}\n{\n${lines.join('\n')}\n}`);
        return name;
      }
    }
  };

  let rootNote = '';
  if (isPlainObject(root)) {
    typeOf(root, rootName);
  } else {
    claim(rootName);
    rootNote = `// Root value: ${typeOf(root, rootName)}`;
  }

  return blocks(
    usesList ? 'using System.Collections.Generic;' : '',
    rootNote,
    ...rootFirst(definitions)
  );
}

// ── Rust ──────────────────────────────────────────────────────────────────────

function rustFieldName(key: string): string {
  const name = snakeOf(key);
  if (RUST_NEVER_RAW.has(name)) return `${name}_`;
  return RUST_KEYWORDS.has(name) ? `r#${name}` : name;
}

function generateRust(root: Shape, rootName: string): string {
  const claim = typeNamer(PLAIN_STYLE, ['String', 'Vec', 'Option']);
  const definitions: string[] = [];

  const typeOf = (shape: Shape, key: string, optional = false): string => {
    const base = baseOf(shape, key);
    // serde_json::Value already holds null; only a missing key needs the Option.
    const isValue = shape.kind === 'unknown' || shape.kind === 'union';
    const wrap = isValue ? optional : shape.nullable || optional;
    return wrap ? `Option<${base}>` : base;
  };

  const baseOf = (shape: Shape, key: string): string => {
    switch (shape.kind) {
      case 'unknown':
      case 'union':
        return 'serde_json::Value';
      case 'string':
        return 'String';
      case 'number':
        return shape.integer ? 'i64' : 'f64';
      case 'boolean':
        return 'bool';
      case 'array':
        return `Vec<${typeOf(shape.items, itemKeyOf(key))}>`;
      case 'object': {
        const name = claim(key);
        const nameField = fieldNamer(rustFieldName);
        const lines = Array.from(shape.fields, ([fieldKey, field]) => {
          const fieldName = nameField(fieldKey);
          // serde reads r#type as "type" on its own.
          const serialized = fieldName.startsWith('r#') ? fieldName.slice(2) : fieldName;
          const rename =
            serialized !== fieldKey ? `    #[serde(rename = ${doubleQuoted(fieldKey)})]\n` : '';
          return `${rename}    pub ${fieldName}: ${typeOf(field.shape, fieldKey, field.optional)},`;
        });
        definitions.push(
          `#[derive(Debug, Serialize, Deserialize)]\npub struct ${name} {\n${lines.join('\n')}\n}`
        );
        return name;
      }
    }
  };

  let alias = '';
  if (isPlainObject(root)) {
    typeOf(root, rootName);
  } else {
    const name = claim(rootName);
    alias = `pub type ${name} = ${typeOf(root, rootName)};`;
  }

  return `use serde::{Deserialize, Serialize};\n\n${blocks(alias, ...rootFirst(definitions))}`;
}

// ── Swift ─────────────────────────────────────────────────────────────────────

/** Names that stay special in Swift even between backticks (`x.self`, `T.init`). */
const SWIFT_NEVER_ESCAPED = words('self init');

function swiftFieldName(key: string): string {
  const name = camelOf(key, PLAIN_STYLE);
  return SWIFT_NEVER_ESCAPED.has(name) ? `${name}_` : name;
}

function generateSwift(root: Shape, rootName: string): string {
  const claim = typeNamer(PLAIN_STYLE, [
    'String',
    'Int',
    'Double',
    'Bool',
    'Any',
    'Codable',
    'CodingKeys',
  ]);
  const definitions: string[] = [];
  const escape = (name: string) => (SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name);

  const typeOf = (shape: Shape, key: string, optional = false): string => {
    const base = baseOf(shape, key);
    return shape.nullable || optional ? `${base}?` : base;
  };

  const baseOf = (shape: Shape, key: string): string => {
    switch (shape.kind) {
      case 'unknown':
      case 'union':
        return 'Any';
      case 'string':
        return 'String';
      case 'number':
        return shape.integer ? 'Int' : 'Double';
      case 'boolean':
        return 'Bool';
      case 'array':
        return `[${typeOf(shape.items, itemKeyOf(key))}]`;
      case 'object': {
        const name = claim(key);
        const nameField = fieldNamer(swiftFieldName);
        const members = Array.from(shape.fields, ([fieldKey, field]) => ({
          key: fieldKey,
          name: nameField(fieldKey),
          type: typeOf(field.shape, fieldKey, field.optional),
        }));
        const lines = members.map((member) => `    let ${escape(member.name)}: ${member.type}`);

        // Codable matches properties to keys by name, so a renamed one has to be mapped.
        let codingKeys = '';
        if (members.some((member) => member.name !== member.key)) {
          const cases = members.map((member) =>
            member.name === member.key
              ? `        case ${escape(member.name)}`
              : `        case ${escape(member.name)} = ${doubleQuoted(member.key)}`
          );
          codingKeys = `\n\n    enum CodingKeys: String, CodingKey {\n${cases.join('\n')}\n    }`;
        }

        definitions.push(`struct ${name}: Codable {\n${lines.join('\n')}${codingKeys}\n}`);
        return name;
      }
    }
  };

  let alias = '';
  if (isPlainObject(root)) {
    typeOf(root, rootName);
  } else {
    const name = claim(rootName);
    alias = `typealias ${name} = ${typeOf(root, rootName)}`;
  }

  return blocks(alias, ...rootFirst(definitions));
}

// ── Kotlin ────────────────────────────────────────────────────────────────────

function generateKotlin(root: Shape, rootName: string): string {
  const claim = typeNamer(PLAIN_STYLE, ['String', 'Long', 'Double', 'Boolean', 'List', 'Any']);
  const definitions: string[] = [];
  const escape = (name: string) => (KOTLIN_KEYWORDS.has(name) ? `\`${name}\`` : name);

  const typeOf = (shape: Shape, key: string, optional = false): string => {
    const base = baseOf(shape, key);
    return shape.nullable || optional ? `${base}?` : base;
  };

  const baseOf = (shape: Shape, key: string): string => {
    switch (shape.kind) {
      case 'unknown':
      case 'union':
        return 'Any';
      case 'string':
        return 'String';
      case 'number':
        return shape.integer ? 'Long' : 'Double';
      case 'boolean':
        return 'Boolean';
      case 'array':
        return `List<${typeOf(shape.items, itemKeyOf(key))}>`;
      case 'object': {
        const name = claim(key);
        const nameField = fieldNamer((fieldKey) => camelOf(fieldKey, PLAIN_STYLE));
        const lines = Array.from(
          shape.fields,
          ([fieldKey, field]) =>
            `    val ${escape(nameField(fieldKey))}: ${typeOf(field.shape, fieldKey, field.optional)},`
        );
        // A data class needs at least one property.
        definitions.push(
          lines.length ? `data class ${name}(\n${lines.join('\n')}\n)` : `class ${name}`
        );
        return name;
      }
    }
  };

  let alias = '';
  if (isPlainObject(root)) {
    typeOf(root, rootName);
  } else {
    const name = claim(rootName);
    alias = `typealias ${name} = ${typeOf(root, rootName)}`;
  }

  return blocks(alias, ...rootFirst(definitions));
}

// ── Dart ──────────────────────────────────────────────────────────────────────

function dartFieldName(key: string): string {
  // A named constructor parameter cannot start with an underscore.
  const stripped = (pascalOf(key, DART_STYLE) || 'SubObject').replace(/^_+/, '') || 'SubObject';
  const name = lowerFirst(stripped);
  if (STARTS_WITH_DIGIT.test(name)) return `n${name}`;
  return DART_KEYWORDS.has(name) ? `${name}_` : name;
}

/** A single-quoted Dart string; `$` would start interpolation. */
const dartString = (text: string) => `'${text.replace(/[\\'$]/g, (char) => `\\${char}`)}'`;

interface DartType {
  text: string;
  /** The expression that turns decoded JSON at `access` into this type. */
  decode: (access: string) => string;
}

function generateDart(root: Shape, rootName: string): string {
  const claim = typeNamer(DART_STYLE, ['String', 'List', 'Map', 'Object']);
  const definitions: string[] = [];

  const resolve = (shape: Shape, key: string, optional = false): DartType => {
    const maybe = shape.nullable || optional;
    const mark = maybe ? '?' : '';
    // jsonDecode yields maps and lists of dynamic, so each level is converted by hand.
    const guarded = (access: string, convert: string) =>
      maybe ? `${access} == null ? null : ${convert}` : convert;

    switch (shape.kind) {
      case 'unknown':
      case 'union':
        return { text: 'dynamic', decode: (access) => access };
      case 'string':
        return { text: `String${mark}`, decode: (access) => `${access} as String${mark}` };
      case 'boolean':
        return { text: `bool${mark}`, decode: (access) => `${access} as bool${mark}` };
      case 'number':
        if (shape.integer) {
          return { text: `int${mark}`, decode: (access) => `${access} as int${mark}` };
        }
        // A whole number arrives as an int even where the model says double.
        return {
          text: `double${mark}`,
          decode: (access) =>
            maybe ? `(${access} as num?)?.toDouble()` : `(${access} as num).toDouble()`,
        };
      case 'array': {
        const item = resolve(shape.items, itemKeyOf(key));
        return {
          text: `List<${item.text}>${mark}`,
          decode: (access) =>
            item.text === 'dynamic'
              ? `${access} as List<dynamic>${mark}`
              : guarded(
                  access,
                  `(${access} as List<dynamic>).map((e) => ${item.decode('e')}).toList()`
                ),
        };
      }
      case 'object': {
        const name = claim(key);
        definitions.push(classOf(name, shape));
        return {
          text: `${name}${mark}`,
          decode: (access) =>
            guarded(access, `${name}.fromJson(${access} as Map<String, dynamic>)`),
        };
      }
    }
  };

  const classOf = (name: string, shape: ObjectShape): string => {
    const nameField = fieldNamer(dartFieldName);
    const members = Array.from(shape.fields, ([key, field]) => ({
      key,
      name: nameField(key),
      type: resolve(field.shape, key, field.optional),
    }));

    if (members.length === 0) {
      return `class ${name} {\n  ${name}();\n\n  factory ${name}.fromJson(Map<String, dynamic> json) {\n    return ${name}();\n  }\n\n  Map<String, dynamic> toJson() {\n    return {};\n  }\n}`;
    }

    const fields = members.map((member) => `  final ${member.type.text} ${member.name};`);
    const ctorParams = members.map((member) => `    required this.${member.name},`);
    const fromJsonLines = members.map(
      (member) => `      ${member.name}: ${member.type.decode(`json[${dartString(member.key)}]`)},`
    );
    const toJsonLines = members.map(
      (member) => `      ${dartString(member.key)}: ${member.name},`
    );

    return `class ${name} {\n${fields.join('\n')}\n\n  ${name}({\n${ctorParams.join('\n')}\n  });\n\n  factory ${name}.fromJson(Map<String, dynamic> json) {\n    return ${name}(\n${fromJsonLines.join('\n')}\n    );\n  }\n\n  Map<String, dynamic> toJson() {\n    return {\n${toJsonLines.join('\n')}\n    };\n  }\n}`;
  };

  let alias = '';
  if (isPlainObject(root)) {
    resolve(root, rootName);
  } else {
    const name = claim(rootName);
    alias = `typedef ${name} = ${resolve(root, rootName).text};`;
  }

  return blocks(alias, ...rootFirst(definitions));
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Writes type definitions for a parsed JSON value. Any JSON value is accepted;
 * when the root is not an object, the root name becomes an alias for its type
 * (or a comment, in the languages that have no aliases).
 */
export function generateCodeFromJson(
  value: unknown,
  language: JsonCodeLanguage,
  options: JsonCodeOptions = {}
): string {
  const root = shapeOf(value);
  const rootName = options.rootName?.trim() || DEFAULT_ROOT_NAME;

  switch (language) {
    case 'typescript':
      return generateTypeScript(root, rootName, {
        ...DEFAULT_TYPESCRIPT_OPTIONS,
        ...options.typescript,
      });
    case 'zod':
      return generateZod(root, rootName);
    case 'go':
      return generateGo(root, rootName);
    case 'python-dataclass':
      return generatePython(root, rootName, 'dataclass');
    case 'python-typeddict':
      return generatePython(root, rootName, 'typeddict');
    case 'java':
      return generateJava(root, rootName);
    case 'csharp':
      return generateCsharp(root, rootName);
    case 'rust':
      return generateRust(root, rootName);
    case 'swift':
      return generateSwift(root, rootName);
    case 'kotlin':
      return generateKotlin(root, rootName);
    case 'dart':
      return generateDart(root, rootName);
  }
}
