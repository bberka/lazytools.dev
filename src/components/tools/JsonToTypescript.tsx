'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Check, Trash2, FileCode, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';

type TargetLanguage =
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

const LANGUAGE_OPTIONS: { value: TargetLanguage; label: string }[] = [
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getArrayItemKeyName = (key: string): string => {
  if (key === 'RootObject') return 'RootObjectItem';
  if (key.endsWith('s') && key.length > 1) return key.slice(0, -1);
  return `${key}Item`;
};

const pascalCase = (s: string): string => {
  const clean = s.replace(/[^a-zA-Z0-9_$]/g, ' ').trim();
  if (!clean) return 'SubObject';
  return clean
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
};

const snakeCase = (s: string): string =>
  s
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();

const camelCase = (s: string): string => {
  const p = pascalCase(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
};

// ---------------------------------------------------------------------------
// TypeScript generator
// ---------------------------------------------------------------------------

interface TsConfig {
  rootName: string;
  useType: boolean;
  exportKeyword: boolean;
  optional: boolean;
  readonly: boolean;
  semicolon: boolean;
}

function generateTypeScript(obj: unknown, config: TsConfig): string {
  const definitions: string[] = [];
  const generatedNames = new Set<string>();

  const isValidId = (key: string) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
  const fmtKey = (key: string) => (isValidId(key) ? key : `'${key}'`);

  const getCleanName = (raw: string): string => {
    let candidate = pascalCase(raw);
    let i = 1;
    while (generatedNames.has(candidate)) {
      candidate = `${pascalCase(raw)}${i}`;
      i++;
    }
    generatedNames.add(candidate);
    return candidate;
  };

  function processValue(val: unknown, key: string): string {
    if (val === null) return 'any';
    const t = typeof val;
    if (t === 'string') return 'string';
    if (t === 'number') return 'number';
    if (t === 'boolean') return 'boolean';
    if (Array.isArray(val)) {
      if (val.length === 0) return 'any[]';
      const itemKey = getArrayItemKeyName(key);
      const types = Array.from(new Set(val.map((item) => processValue(item, itemKey))));
      const inner = types.length === 1 ? types[0] : `(${types.join(' | ')})`;
      return types.length === 1 && !inner.includes('|') && !inner.includes('&')
        ? `${inner}[]`
        : `(${types.join(' | ')})[]`;
    }
    if (t === 'object' && val !== null) {
      const name = getCleanName(key);
      const lines: string[] = [];
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        const opt = config.optional ? '?' : '';
        const ro = config.readonly ? 'readonly ' : '';
        const semi = config.semicolon ? ';' : '';
        lines.push(`  ${ro}${fmtKey(k)}${opt}: ${processValue(v, k)}${semi}`);
      }
      const exp = config.exportKeyword ? 'export ' : '';
      const decl = config.useType
        ? `${exp}type ${name} = {\n${lines.join('\n')}\n};`
        : `${exp}interface ${name} {\n${lines.join('\n')}\n}`;
      definitions.push(decl);
      return name;
    }
    return 'any';
  }

  const rootType = processValue(obj, config.rootName || 'RootObject');
  if (rootType !== (config.rootName || 'RootObject')) {
    const exp = config.exportKeyword ? 'export ' : '';
    const semi = config.semicolon ? ';' : '';
    const rootDecl = config.useType
      ? `${exp}type ${config.rootName || 'RootObject'} = ${rootType}${semi}`
      : `${exp}interface ${config.rootName || 'RootObject'} {\n  data: ${rootType}${semi}\n}`;
    definitions.push(rootDecl);
  }
  return definitions.reverse().join('\n\n');
}

// ---------------------------------------------------------------------------
// Zod schema generator
// ---------------------------------------------------------------------------
function generateZod(obj: unknown, rootName: string): string {
  const definitions: string[] = [];
  const generatedNames = new Set<string>();

  const getCleanName = (raw: string): string => {
    let base = camelCase(raw) + 'Schema';
    let candidate = base;
    let i = 1;
    while (generatedNames.has(candidate)) { candidate = `${base}${i}`; i++; }
    generatedNames.add(candidate);
    return candidate;
  };

  function processValue(val: unknown, key: string): string {
    if (val === null) return 'z.any()';
    const t = typeof val;
    if (t === 'string') return 'z.string()';
    if (t === 'number') return Number.isInteger(val) ? 'z.number().int()' : 'z.number()';
    if (t === 'boolean') return 'z.boolean()';
    if (Array.isArray(val)) {
      if (val.length === 0) return 'z.array(z.any())';
      const itemKey = getArrayItemKeyName(key);
      const types = Array.from(new Set(val.map((item) => processValue(item, itemKey))));
      const inner = types.length === 1 ? types[0] : `z.union([${types.join(', ')}])`;
      return `z.array(${inner})`;
    }
    if (t === 'object' && val !== null) {
      const name = getCleanName(key);
      const entries = Object.entries(val as Record<string, unknown>);
      const lines = entries.map(([k, v]) => `  ${k}: ${processValue(v, k)},`);
      definitions.push(`const ${name} = z.object({\n${lines.join('\n')}\n});`);
      return name;
    }
    return 'z.any()';
  }

  const root = processValue(obj, rootName || 'root');
  if (!definitions.length || root !== definitions[definitions.length - 1]?.split(' ')[1]) {
    definitions.push(`const ${camelCase(rootName || 'root')}Schema = ${root};`);
  }
  return `import { z } from 'zod';\n\n${definitions.reverse().join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// Go struct generator
// ---------------------------------------------------------------------------
function generateGo(obj: unknown, rootName: string): string {
  const definitions: string[] = [];
  const generatedNames = new Set<string>();

  const getCleanName = (raw: string): string => {
    let candidate = pascalCase(raw);
    let i = 1;
    while (generatedNames.has(candidate)) { candidate = `${pascalCase(raw)}${i}`; i++; }
    generatedNames.add(candidate);
    return candidate;
  };

  function goType(val: unknown, key: string): string {
    if (val === null) return 'interface{}';
    const t = typeof val;
    if (t === 'string') return 'string';
    if (t === 'number') return Number.isInteger(val) ? 'int64' : 'float64';
    if (t === 'boolean') return 'bool';
    if (Array.isArray(val)) {
      if (val.length === 0) return '[]interface{}';
      return `[]${goType(val[0], getArrayItemKeyName(key))}`;
    }
    if (t === 'object') {
      const name = getCleanName(key);
      const entries = Object.entries(val as Record<string, unknown>);
      const lines = entries.map(([k, v]) => {
        const goField = pascalCase(k);
        return `\t${goField} ${goType(v, k)} \`json:"${k}"\``;
      });
      definitions.push(`type ${name} struct {\n${lines.join('\n')}\n}`);
      return name;
    }
    return 'interface{}';
  }

  goType(obj, rootName || 'RootObject');
  return definitions.reverse().join('\n\n');
}

// ---------------------------------------------------------------------------
// Python dataclass generator
// ---------------------------------------------------------------------------
function generatePythonDataclass(obj: unknown, rootName: string): string {
  const definitions: string[] = [];
  const generatedNames = new Set<string>();

  const getCleanName = (raw: string): string => {
    let candidate = pascalCase(raw);
    let i = 1;
    while (generatedNames.has(candidate)) { candidate = `${pascalCase(raw)}${i}`; i++; }
    generatedNames.add(candidate);
    return candidate;
  };

  function pyType(val: unknown, key: string): string {
    if (val === null) return 'Any';
    const t = typeof val;
    if (t === 'string') return 'str';
    if (t === 'number') return Number.isInteger(val) ? 'int' : 'float';
    if (t === 'boolean') return 'bool';
    if (Array.isArray(val)) {
      if (val.length === 0) return 'list[Any]';
      return `list[${pyType(val[0], getArrayItemKeyName(key))}]`;
    }
    if (t === 'object') {
      const name = getCleanName(key);
      const entries = Object.entries(val as Record<string, unknown>);
      const lines = entries.map(([k, v]) => `    ${snakeCase(k)}: ${pyType(v, k)}`);
      definitions.push(`@dataclass\nclass ${name}:\n${lines.join('\n')}`);
      return name;
    }
    return 'Any';
  }

  pyType(obj, rootName || 'RootObject');
  return `from __future__ import annotations\nfrom dataclasses import dataclass\nfrom typing import Any\n\n${definitions.reverse().join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// Python TypedDict generator
// ---------------------------------------------------------------------------
function generatePythonTypedDict(obj: unknown, rootName: string): string {
  const definitions: string[] = [];
  const generatedNames = new Set<string>();

  const getCleanName = (raw: string): string => {
    let candidate = pascalCase(raw);
    let i = 1;
    while (generatedNames.has(candidate)) { candidate = `${pascalCase(raw)}${i}`; i++; }
    generatedNames.add(candidate);
    return candidate;
  };

  function pyType(val: unknown, key: string): string {
    if (val === null) return 'Any';
    const t = typeof val;
    if (t === 'string') return 'str';
    if (t === 'number') return Number.isInteger(val) ? 'int' : 'float';
    if (t === 'boolean') return 'bool';
    if (Array.isArray(val)) {
      if (val.length === 0) return 'list[Any]';
      return `list[${pyType(val[0], getArrayItemKeyName(key))}]`;
    }
    if (t === 'object') {
      const name = getCleanName(key);
      const entries = Object.entries(val as Record<string, unknown>);
      const lines = entries.map(([k, v]) => `    "${k}": ${pyType(v, k)},`);
      definitions.push(`class ${name}(TypedDict):\n${lines.join('\n')}`);
      return name;
    }
    return 'Any';
  }

  pyType(obj, rootName || 'RootObject');
  return `from __future__ import annotations\nfrom typing import Any, TypedDict\n\n${definitions.reverse().join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// Java class generator
// ---------------------------------------------------------------------------
function generateJava(obj: unknown, rootName: string): string {
  const definitions: string[] = [];
  const generatedNames = new Set<string>();

  const getCleanName = (raw: string): string => {
    let candidate = pascalCase(raw);
    let i = 1;
    while (generatedNames.has(candidate)) { candidate = `${pascalCase(raw)}${i}`; i++; }
    generatedNames.add(candidate);
    return candidate;
  };

  function javaType(val: unknown, key: string): string {
    if (val === null) return 'Object';
    const t = typeof val;
    if (t === 'string') return 'String';
    if (t === 'number') return Number.isInteger(val) ? 'long' : 'double';
    if (t === 'boolean') return 'boolean';
    if (Array.isArray(val)) {
      if (val.length === 0) return 'List<Object>';
      return `List<${javaType(val[0], getArrayItemKeyName(key))}>`;
    }
    if (t === 'object') {
      const name = getCleanName(key);
      const entries = Object.entries(val as Record<string, unknown>);
      const fields = entries.map(([k, v]) => {
        const jt = javaType(v, k);
        return `    private ${jt} ${camelCase(k)};`;
      });
      const gettersSetters = entries.map(([k, v]) => {
        const jt = javaType(v, k);
        const cc = camelCase(k);
        const pc = pascalCase(k);
        return `    public ${jt} get${pc}() { return ${cc}; }\n    public void set${pc}(${jt} ${cc}) { this.${cc} = ${cc}; }`;
      });
      definitions.push(`public class ${name} {\n${fields.join('\n')}\n\n${gettersSetters.join('\n\n')}\n}`);
      return name;
    }
    return 'Object';
  }

  javaType(obj, rootName || 'RootObject');
  return definitions.reverse().join('\n\n');
}

// ---------------------------------------------------------------------------
// C# class generator
// ---------------------------------------------------------------------------
function generateCsharp(obj: unknown, rootName: string): string {
  const definitions: string[] = [];
  const generatedNames = new Set<string>();

  const getCleanName = (raw: string): string => {
    let candidate = pascalCase(raw);
    let i = 1;
    while (generatedNames.has(candidate)) { candidate = `${pascalCase(raw)}${i}`; i++; }
    generatedNames.add(candidate);
    return candidate;
  };

  function csType(val: unknown, key: string): string {
    if (val === null) return 'object';
    const t = typeof val;
    if (t === 'string') return 'string';
    if (t === 'number') return Number.isInteger(val) ? 'long' : 'double';
    if (t === 'boolean') return 'bool';
    if (Array.isArray(val)) {
      if (val.length === 0) return 'List<object>';
      return `List<${csType(val[0], getArrayItemKeyName(key))}>`;
    }
    if (t === 'object') {
      const name = getCleanName(key);
      const entries = Object.entries(val as Record<string, unknown>);
      const lines = entries.map(([k, v]) => {
        return `    public ${csType(v, k)} ${pascalCase(k)} { get; set; }`;
      });
      definitions.push(`public class ${name}\n{\n${lines.join('\n')}\n}`);
      return name;
    }
    return 'object';
  }

  csType(obj, rootName || 'RootObject');
  return definitions.reverse().join('\n\n');
}

// ---------------------------------------------------------------------------
// Rust struct generator
// ---------------------------------------------------------------------------
function generateRust(obj: unknown, rootName: string): string {
  const definitions: string[] = [];
  const generatedNames = new Set<string>();

  const getCleanName = (raw: string): string => {
    let candidate = pascalCase(raw);
    let i = 1;
    while (generatedNames.has(candidate)) { candidate = `${pascalCase(raw)}${i}`; i++; }
    generatedNames.add(candidate);
    return candidate;
  };

  function rustType(val: unknown, key: string): string {
    if (val === null) return 'serde_json::Value';
    const t = typeof val;
    if (t === 'string') return 'String';
    if (t === 'number') return Number.isInteger(val) ? 'i64' : 'f64';
    if (t === 'boolean') return 'bool';
    if (Array.isArray(val)) {
      if (val.length === 0) return 'Vec<serde_json::Value>';
      return `Vec<${rustType(val[0], getArrayItemKeyName(key))}>`;
    }
    if (t === 'object') {
      const name = getCleanName(key);
      const entries = Object.entries(val as Record<string, unknown>);
      const lines = entries.map(([k, v]) => {
        const sn = snakeCase(k);
        const renameAttr = sn !== k ? `    #[serde(rename = "${k}")]\n` : '';
        return `${renameAttr}    pub ${sn}: ${rustType(v, k)},`;
      });
      definitions.push(`#[derive(Debug, Serialize, Deserialize)]\npub struct ${name} {\n${lines.join('\n')}\n}`);
      return name;
    }
    return 'serde_json::Value';
  }

  rustType(obj, rootName || 'RootObject');
  return `use serde::{Deserialize, Serialize};\n\n${definitions.reverse().join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// Swift struct generator
// ---------------------------------------------------------------------------
function generateSwift(obj: unknown, rootName: string): string {
  const definitions: string[] = [];
  const generatedNames = new Set<string>();

  const getCleanName = (raw: string): string => {
    let candidate = pascalCase(raw);
    let i = 1;
    while (generatedNames.has(candidate)) { candidate = `${pascalCase(raw)}${i}`; i++; }
    generatedNames.add(candidate);
    return candidate;
  };

  function swiftType(val: unknown, key: string): string {
    if (val === null) return 'Any?';
    const t = typeof val;
    if (t === 'string') return 'String';
    if (t === 'number') return Number.isInteger(val) ? 'Int' : 'Double';
    if (t === 'boolean') return 'Bool';
    if (Array.isArray(val)) {
      if (val.length === 0) return '[Any]';
      return `[${swiftType(val[0], getArrayItemKeyName(key))}]`;
    }
    if (t === 'object') {
      const name = getCleanName(key);
      const entries = Object.entries(val as Record<string, unknown>);
      const lines = entries.map(([k, v]) => {
        const cc = camelCase(k);
        const codingKey = cc !== k ? ` // JSON key: "${k}"` : '';
        return `    let ${cc}: ${swiftType(v, k)}${codingKey}`;
      });
      definitions.push(`struct ${name}: Codable {\n${lines.join('\n')}\n}`);
      return name;
    }
    return 'Any';
  }

  swiftType(obj, rootName || 'RootObject');
  return definitions.reverse().join('\n\n');
}

// ---------------------------------------------------------------------------
// Kotlin data class generator
// ---------------------------------------------------------------------------
function generateKotlin(obj: unknown, rootName: string): string {
  const definitions: string[] = [];
  const generatedNames = new Set<string>();

  const getCleanName = (raw: string): string => {
    let candidate = pascalCase(raw);
    let i = 1;
    while (generatedNames.has(candidate)) { candidate = `${pascalCase(raw)}${i}`; i++; }
    generatedNames.add(candidate);
    return candidate;
  };

  function ktType(val: unknown, key: string): string {
    if (val === null) return 'Any?';
    const t = typeof val;
    if (t === 'string') return 'String';
    if (t === 'number') return Number.isInteger(val) ? 'Long' : 'Double';
    if (t === 'boolean') return 'Boolean';
    if (Array.isArray(val)) {
      if (val.length === 0) return 'List<Any>';
      return `List<${ktType(val[0], getArrayItemKeyName(key))}>`;
    }
    if (t === 'object') {
      const name = getCleanName(key);
      const entries = Object.entries(val as Record<string, unknown>);
      const lines = entries.map(([k, v]) => `    val ${camelCase(k)}: ${ktType(v, k)},`);
      definitions.push(`data class ${name}(\n${lines.join('\n')}\n)`);
      return name;
    }
    return 'Any';
  }

  ktType(obj, rootName || 'RootObject');
  return definitions.reverse().join('\n\n');
}

// ---------------------------------------------------------------------------
// Dart class generator
// ---------------------------------------------------------------------------
function generateDart(obj: unknown, rootName: string): string {
  const definitions: string[] = [];
  const generatedNames = new Set<string>();

  const getCleanName = (raw: string): string => {
    let candidate = pascalCase(raw);
    let i = 1;
    while (generatedNames.has(candidate)) { candidate = `${pascalCase(raw)}${i}`; i++; }
    generatedNames.add(candidate);
    return candidate;
  };

  function dartType(val: unknown, key: string): string {
    if (val === null) return 'dynamic';
    const t = typeof val;
    if (t === 'string') return 'String';
    if (t === 'number') return Number.isInteger(val) ? 'int' : 'double';
    if (t === 'boolean') return 'bool';
    if (Array.isArray(val)) {
      if (val.length === 0) return 'List<dynamic>';
      return `List<${dartType(val[0], getArrayItemKeyName(key))}>`;
    }
    if (t === 'object') {
      const name = getCleanName(key);
      const entries = Object.entries(val as Record<string, unknown>);
      const fields = entries.map(([k, v]) => `  final ${dartType(v, k)} ${camelCase(k)};`);
      const ctorParams = entries.map(([k]) => `    required this.${camelCase(k)},`);
      const fromJsonLines = entries.map(([k, v]) => {
        const dt = dartType(v, k);
        const cc = camelCase(k);
        if (dt === 'String' || dt === 'int' || dt === 'double' || dt === 'bool') {
          return `      ${cc}: json['${k}'] as ${dt},`;
        }
        return `      ${cc}: json['${k}'],`;
      });
      const toJsonLines = entries.map(([k]) => `      '${k}': ${camelCase(k)},`);
      definitions.push(
        `class ${name} {\n${fields.join('\n')}\n\n  ${name}({\n${ctorParams.join('\n')}\n  });\n\n  factory ${name}.fromJson(Map<String, dynamic> json) {\n    return ${name}(\n${fromJsonLines.join('\n')}\n    );\n  }\n\n  Map<String, dynamic> toJson() {\n    return {\n${toJsonLines.join('\n')}\n    };\n  }\n}`
      );
      return name;
    }
    return 'dynamic';
  }

  dartType(obj, rootName || 'RootObject');
  return definitions.reverse().join('\n\n');
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function generateCode(
  obj: unknown,
  lang: TargetLanguage,
  rootName: string,
  tsConfig: TsConfig
): string {
  switch (lang) {
    case 'typescript':
      return generateTypeScript(obj, tsConfig);
    case 'zod':
      return generateZod(obj, rootName);
    case 'go':
      return generateGo(obj, rootName);
    case 'python-dataclass':
      return generatePythonDataclass(obj, rootName);
    case 'python-typeddict':
      return generatePythonTypedDict(obj, rootName);
    case 'java':
      return generateJava(obj, rootName);
    case 'csharp':
      return generateCsharp(obj, rootName);
    case 'rust':
      return generateRust(obj, rootName);
    case 'swift':
      return generateSwift(obj, rootName);
    case 'kotlin':
      return generateKotlin(obj, rootName);
    case 'dart':
      return generateDart(obj, rootName);
    default:
      return '';
  }
}

// ===========================================================================
// Component
// ===========================================================================

export function JsonToTypescript() {
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState<TargetLanguage>('typescript');
  const [rootName, setRootName] = useState('RootObject');
  const [useType, setUseType] = useState(false);
  const [exportKeyword, setExportKeyword] = useState(true);
  const [optional, setOptional] = useState(false);
  const [readonly, setReadonly] = useState(false);
  const [semicolon, setSemicolon] = useState(true);

  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const validation = useMemo(() => {
    if (!input.trim()) return null;
    try {
      const parsed = JSON.parse(input);
      let summary = '';
      if (Array.isArray(parsed)) {
        summary = `Array with ${parsed.length.toLocaleString()} item${parsed.length === 1 ? '' : 's'}`;
      } else if (parsed && typeof parsed === 'object') {
        const keys = Object.keys(parsed);
        summary = `Object with ${keys.length.toLocaleString()} key${keys.length === 1 ? '' : 's'}`;
      } else {
        summary = `Primitive (${parsed === null ? 'null' : typeof parsed})`;
      }
      return { valid: true, parsed, summary, error: '' };
    } catch (e) {
      return {
        valid: false,
        parsed: null,
        summary: '',
        error: e instanceof Error ? e.message : 'Invalid JSON format',
      };
    }
  }, [input]);

  const outputCode = useMemo(() => {
    if (!validation || !validation.valid || validation.parsed === null) return '';
    try {
      const cleanRootName = rootName.trim() || 'RootObject';
      return generateCode(validation.parsed, language, cleanRootName, {
        rootName: cleanRootName,
        useType,
        exportKeyword,
        optional,
        readonly,
        semicolon,
      });
    } catch (e) {
      return `/* Error generating code: ${e instanceof Error ? e.message : 'Unknown error'} */`;
    }
  }, [validation, language, rootName, useType, exportKeyword, optional, readonly, semicolon]);

  const handleClear = () => {
    setInput('');
  };

  const isTypescript = language === 'typescript';

  return (
    <div className="space-y-6">
      {/* Settings Panel */}
      <Card className="border-muted/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <FileCode className="h-5 w-5 text-primary" />
            JSON to Code Generator
          </CardTitle>
          <CardDescription>
            Generate typed models and schemas from JSON data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Target Language
              </label>
              <Select value={language} onValueChange={(val) => setLanguage(val as TargetLanguage)}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Root Name
              </label>
              <Input
                value={rootName}
                onChange={(e) => setRootName(e.target.value)}
                placeholder="RootObject"
                className="bg-background"
              />
            </div>

            {isTypescript && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Declaration Style
                </label>
                <Select
                  value={useType ? 'type' : 'interface'}
                  onValueChange={(val) => setUseType(val === 'type')}
                >
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue placeholder="Style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interface">interface</SelectItem>
                    <SelectItem value="type">type alias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {isTypescript && (
              <div className="flex flex-wrap gap-x-6 gap-y-3 sm:col-span-2 lg:col-span-3 pt-2">
                <Checkbox
                  checked={exportKeyword}
                  onChange={setExportKeyword}
                  label="Export interfaces/types"
                />
                <Checkbox
                  checked={optional}
                  onChange={setOptional}
                  label="Make properties optional (?)"
                />
                <Checkbox
                  checked={readonly}
                  onChange={setReadonly}
                  label="Make properties readonly"
                />
                <Checkbox
                  checked={semicolon}
                  onChange={setSemicolon}
                  label="Include trailing semicolons (;)"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Input area */}
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">JSON Payload</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`{\n  "id": 1,\n  "name": "Ada Lovelace",\n  "active": true,\n  "roles": ["Admin", "Editor"],\n  "company": {\n    "name": "Analytical Engine Co",\n    "address": "London"\n  }\n}`}
              rows={14}
              className="flex-1 font-mono text-xs leading-relaxed resize-y bg-background focus-visible:ring-1"
            />
            <div className="flex items-center justify-between">
              <Button
                onClick={handleClear}
                variant="outline"
                size="sm"
                className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive transition-colors duration-200"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>

            {/* Validation Banner */}
            {validation && (
              <div
                className={`flex items-start gap-3 rounded-lg px-4 py-3 text-xs font-medium border transition-all duration-300 ${
                  validation.valid
                    ? 'bg-green-500/5 text-green-700 dark:text-green-400 border-green-500/20'
                    : 'bg-destructive/5 text-destructive border-destructive/20'
                }`}
              >
                {validation.valid ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Valid JSON Format:</strong> {validation.summary}
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Syntax Error:</strong> {validation.error}
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Output area */}
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Generated Code</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={outputCode}
              readOnly
              placeholder="Type definitions will be generated here automatically..."
              rows={14}
              className="flex-1 font-mono text-xs leading-relaxed resize-y bg-muted/20 border-muted focus-visible:ring-0 cursor-text"
            />

            <Button
              onClick={() => copyToClipboard(outputCode)}
              disabled={!outputCode}
              size="sm"
              variant={isCopied ? 'default' : 'outline'}
              className="w-full sm:w-auto font-medium transition-all duration-200"
            >
              {isCopied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Code
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-blue-700 dark:text-blue-400">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold block mb-0.5">Privacy First</strong>
          All parsing and conversions run entirely inside your browser. No JSON data, payload
          content, or schema structure is ever transmitted over the network.
        </div>
      </div>
    </div>
  );
}
