import { test, expect } from '@playwright/test';
import { createToolCatalog, toolCatalog } from '@/lib/catalog';
import { TAGS_IN_ORDER } from '@/lib/tags';
import type { Tool, ToolComponentLoader, ToolRegistry } from '@/lib/types';
import { TOOL_REGISTRY } from '@/lib/utils/tool-registry';

function loader(): ToolComponentLoader {
  const Component = () => null;
  return async () => Component;
}

// A small registry in the shape of the real one: two hidden aliases, a tool
// with several tags and a tool without keywords.
const registry: ToolRegistry = {
  'json-formatter': {
    name: 'JSON Formatter & Validator',
    description: 'Format, validate, and query JSON with an interactive tree.',
    tags: ['formatters-validators'],
    featured: true,
    keywords: ['json', 'format', 'validate', 'pretty', 'validator', 'tree'],
    component: loader(),
  },
  'data-formatter': {
    name: 'JSON Formatter & Validator',
    description: 'Format, validate, and query JSON with an interactive tree.',
    tags: ['formatters-validators'],
    keywords: ['json', 'format', 'validate', 'pretty'],
    hidden: true,
    component: loader(),
  },
  'json-to-code': {
    name: 'JSON to Code',
    description: 'Generate typed models from JSON in many languages.',
    tags: ['converters'],
    keywords: ['json', 'typescript', 'convert', 'generate', 'schema'],
    component: loader(),
  },
  'yaml-validator': {
    name: 'YAML Formatter & Validator',
    description: 'Format and validate YAML data with an interactive tree.',
    tags: ['formatters-validators'],
    keywords: ['yaml', 'format', 'validate', 'pretty'],
    component: loader(),
  },
  'base64-converter': {
    name: 'Base64 Encoder/Decoder',
    description: 'Encode text or files into Base64 and decode them.',
    tags: ['encoders-decoders'],
    keywords: ['base64', 'encode', 'decode'],
    component: loader(),
  },
  'markdown-editor': {
    name: 'Markdown Editor & Exporter',
    description: 'Write, preview, and export Markdown to PDF, HTML, and PNG.',
    tags: ['text-tools', 'pdf-tools', 'converters'],
    keywords: ['markdown', 'preview', 'editor', 'export', 'pdf'],
    component: loader(),
  },
  'pdf-tools': {
    name: 'PDF Converter',
    description: 'Convert PDFs to images, Word, or create from files.',
    tags: ['pdf-tools'],
    featured: true,
    keywords: ['pdf', 'image', 'convert', 'word'],
    component: loader(),
  },
  'pdf-merge': {
    name: 'Merge PDF',
    description: 'Combine multiple PDF files into a single document.',
    tags: ['pdf-tools'],
    keywords: ['pdf', 'merge', 'combine'],
    hidden: true,
    component: loader(),
  },
  'uuid-generator': {
    name: 'UUID Generator',
    description: 'Generate random UUID v4, time-based v7, or custom IDs.',
    tags: ['generators'],
    keywords: ['uuid', 'guid', 'generate', 'unique'],
    component: loader(),
  },
  'password-generator': {
    name: 'Password Generator',
    description: 'Generate secure, customizable random passwords.',
    tags: ['generators'],
    keywords: ['password', 'generate', 'random', 'secure'],
    component: loader(),
  },
  'hash-generator': {
    name: 'Hash Generator',
    description: 'Generate secure MD5, SHA-1, SHA-256, and SHA-512 hashes.',
    tags: ['security'],
    keywords: ['hash', 'md5', 'sha', 'checksum'],
    component: loader(),
  },
  'timestamp-converter': {
    name: 'Unix Timestamp Converter',
    description: 'Convert Unix timestamps to readable date and time.',
    tags: ['converters'],
    component: loader(),
  },
};

const VISIBLE_IDS = [
  'json-formatter',
  'json-to-code',
  'yaml-validator',
  'base64-converter',
  'markdown-editor',
  'pdf-tools',
  'uuid-generator',
  'password-generator',
  'hash-generator',
  'timestamp-converter',
];
const HIDDEN_IDS = ['data-formatter', 'pdf-merge'];

const catalog = createToolCatalog(registry);
const ids = (tools: readonly Tool[]) => tools.map((tool) => tool.id);

test.describe('tool catalog: hidden policy', () => {
  test('keeps hidden tools out of discovery', () => {
    expect(ids(catalog.discoverable())).toEqual(VISIBLE_IDS);
    expect(ids(catalog.search(''))).toEqual(VISIBLE_IDS);
    expect(ids(catalog.filter())).toEqual(VISIBLE_IDS);

    // Both hidden tools match these queries and tags, and still stay out
    expect(ids(catalog.search('pdf'))).not.toContain('pdf-merge');
    expect(ids(catalog.search('merge'))).toEqual([]);
    expect(ids(catalog.search('data-formatter'))).not.toContain('data-formatter');
    expect(ids(catalog.filter({ tag: 'pdf-tools' }))).not.toContain('pdf-merge');

    const grouped = catalog.groupByTag().flatMap((group) => ids(group.tools));
    for (const id of HIDDEN_IDS) expect(grouped).not.toContain(id);
  });

  test('always finds hidden tools by id', () => {
    expect(ids(catalog.all())).toEqual(Object.keys(registry));
    for (const id of HIDDEN_IDS) {
      expect(ids(catalog.all())).toContain(id);
      expect(catalog.get(id)?.tool.hidden).toBe(true);
    }
    expect(ids(catalog.byIds(HIDDEN_IDS))).toEqual(HIDDEN_IDS);
  });

  test('drops hidden tools from tag groups even when a caller passes them in', () => {
    // The command palette used to list hidden slugs in its browse groups
    expect(catalog.groupByTag(catalog.all())).toEqual(catalog.groupByTag());
  });
});

test.describe('tool catalog: lookup', () => {
  test('returns the tool together with its component loader', async () => {
    const entry = catalog.get('json-formatter');

    expect(entry?.tool).toEqual({
      id: 'json-formatter',
      name: 'JSON Formatter & Validator',
      description: 'Format, validate, and query JSON with an interactive tree.',
      tags: ['formatters-validators'],
      icon: undefined,
      keywords: ['json', 'format', 'validate', 'pretty', 'validator', 'tree'],
      featured: true,
      hidden: undefined,
    });
    expect(entry?.load).toBe(registry['json-formatter'].component);
    expect(typeof (await entry?.load())).toBe('function');
  });

  test('gives a tool without keywords an empty keyword list', () => {
    expect(catalog.get('timestamp-converter')?.tool.keywords).toEqual([]);
  });

  test('returns undefined for ids that are not in the registry', () => {
    for (const id of ['nope', '', 'constructor', 'toString', '__proto__']) {
      expect(catalog.get(id), id).toBeUndefined();
    }
  });

  test('resolves a list of ids in the order given, skipping unknown ids', () => {
    const recents = ['uuid-generator', 'pdf-merge', 'nope', 'json-formatter'];

    expect(ids(catalog.byIds(recents))).toEqual(['uuid-generator', 'pdf-merge', 'json-formatter']);
    expect(ids(catalog.byIds([]))).toEqual([]);
  });

  test('returns each tool once for a list with repeated ids', () => {
    expect(ids(catalog.byIds(['pdf-tools', 'hash-generator', 'pdf-tools']))).toEqual([
      'pdf-tools',
      'hash-generator',
    ]);
  });

  test('resolves a list of ids in catalog order on request', () => {
    const favorites = ['uuid-generator', 'pdf-merge', 'nope', 'json-formatter'];

    expect(ids(catalog.byIds(favorites, { order: 'catalog' }))).toEqual([
      'json-formatter',
      'pdf-merge',
      'uuid-generator',
    ]);
  });
});

// Expected orders were recorded from the search helper this catalog replaced,
// run against the same tools, so they pin the ranking it had.
test.describe('tool catalog: search ranking', () => {
  const rankings: Array<[query: string, expected: string[]]> = [
    // Equal scores keep catalog order
    ['json', ['json-formatter', 'json-to-code']],
    ['pdf tools', ['markdown-editor', 'pdf-tools']],
    // Case and surrounding whitespace do not matter
    [' Json ', ['json-formatter', 'json-to-code']],
    // An exact name or id outranks partial matches
    ['UUID Generator', ['uuid-generator', 'password-generator', 'hash-generator']],
    [
      'timestamp-converter',
      ['timestamp-converter', 'pdf-tools', 'json-to-code', 'markdown-editor'],
    ],
    // An exact keyword outranks a name prefix, which outranks a description match
    ['generate', ['json-to-code', 'uuid-generator', 'password-generator', 'hash-generator']],
    ['generator', ['uuid-generator', 'password-generator', 'hash-generator']],
    ['gen', ['uuid-generator', 'password-generator', 'hash-generator', 'json-to-code']],
    [
      'convert',
      ['pdf-tools', 'json-to-code', 'timestamp-converter', 'base64-converter', 'markdown-editor'],
    ],
    ['pdf', ['pdf-tools', 'markdown-editor']],
    ['tree', ['json-formatter', 'yaml-validator']],
    // Words of a query are matched one by one, split on spaces, dashes and underscores
    ['validate yaml', ['yaml-validator', 'json-formatter']],
    ['pdf markdown export', ['markdown-editor', 'pdf-tools']],
    [
      'json_to_code',
      ['json-to-code', 'json-formatter', 'markdown-editor', 'pdf-tools', 'timestamp-converter'],
    ],
    // A tag alone is enough to match
    ['security', ['hash-generator']],
    // Letters and digits are separate tokens: "SHA-256", "Base64"
    ['256', ['hash-generator']],
    ['64', ['base64-converter']],
    // Only a hidden tool matches
    ['merge', []],
    ['zzz', []],
  ];

  for (const [query, expected] of rankings) {
    test(`ranks "${query}"`, () => {
      expect(ids(catalog.search(query))).toEqual(expected);
    });
  }

  test('returns every discoverable tool in catalog order for a blank query', () => {
    expect(ids(catalog.search(''))).toEqual(VISIBLE_IDS);
    expect(ids(catalog.search('   '))).toEqual(VISIBLE_IDS);
  });
});

test.describe('tool catalog: filter', () => {
  test('narrows by tag in catalog order', () => {
    expect(ids(catalog.filter({ tag: 'pdf-tools' }))).toEqual(['markdown-editor', 'pdf-tools']);
    expect(ids(catalog.filter({ tag: 'converters' }))).toEqual([
      'json-to-code',
      'markdown-editor',
      'timestamp-converter',
    ]);
    expect(ids(catalog.filter({ tag: 'networking' }))).toEqual([]);
  });

  test('combines a query with a tag, keeping the search order', () => {
    expect(ids(catalog.filter({ query: 'json' }))).toEqual(ids(catalog.search('json')));
    expect(ids(catalog.filter({ query: 'json', tag: 'converters' }))).toEqual(['json-to-code']);
    expect(ids(catalog.filter({ query: 'convert', tag: 'converters' }))).toEqual([
      'json-to-code',
      'timestamp-converter',
      'markdown-editor',
    ]);
  });

  test('treats a blank query and no criteria as the whole browse list', () => {
    expect(ids(catalog.filter({ query: '  ', tag: null, onlyFavorites: null }))).toEqual(VISIBLE_IDS);
  });

  test('keeps only favorites, in catalog order', () => {
    const favorites = ['uuid-generator', 'nope', 'json-formatter'];

    expect(ids(catalog.filter({ onlyFavorites: favorites }))).toEqual([
      'json-formatter',
      'uuid-generator',
    ]);
    expect(ids(catalog.filter({ onlyFavorites: [] }))).toEqual([]);
  });

  test('includes a favorited hidden tool, after the visible favorites', () => {
    const favorites = ['pdf-merge', 'uuid-generator'];

    expect(ids(catalog.filter({ onlyFavorites: favorites }))).toEqual(['uuid-generator', 'pdf-merge']);
    // A hidden tool that is not a favorite stays out
    expect(ids(catalog.filter({ onlyFavorites: ['json-formatter'] }))).toEqual(['json-formatter']);
  });

  test('does not narrow hidden favorites by query or tag', () => {
    const favorites = ['json-to-code', 'pdf-merge', 'hash-generator'];

    expect(ids(catalog.filter({ query: 'json', onlyFavorites: favorites }))).toEqual([
      'json-to-code',
      'pdf-merge',
    ]);
    expect(ids(catalog.filter({ tag: 'security', onlyFavorites: favorites }))).toEqual([
      'hash-generator',
      'pdf-merge',
    ]);
  });
});

test.describe('tool catalog: grouping', () => {
  test('groups tools under each of their tags and leaves empty groups out', () => {
    const groups = Object.fromEntries(
      catalog.groupByTag().map((group) => [group.tag, ids(group.tools)])
    );

    expect(groups).toEqual({
      converters: ['json-to-code', 'markdown-editor', 'timestamp-converter'],
      'encoders-decoders': ['base64-converter'],
      generators: ['uuid-generator', 'password-generator'],
      'formatters-validators': ['json-formatter', 'yaml-validator'],
      'text-tools': ['markdown-editor'],
      security: ['hash-generator'],
      'pdf-tools': ['markdown-editor', 'pdf-tools'],
    });
  });

  test('orders the groups by the canonical tag order', () => {
    const groupTags = catalog.groupByTag().map((group) => group.tag);
    const canonical = TAGS_IN_ORDER.map((tag) => tag.id);

    expect(groupTags.length).toBeGreaterThan(1);
    expect(groupTags).toEqual(canonical.filter((tag) => groupTags.includes(tag)));
  });

  test('groups the list it is given, keeping that list order inside a group', () => {
    const results = catalog.search('convert');
    const groups = Object.fromEntries(
      catalog.groupByTag(results).map((group) => [group.tag, ids(group.tools)])
    );

    expect(groups).toEqual({
      converters: ['json-to-code', 'timestamp-converter', 'markdown-editor'],
      'encoders-decoders': ['base64-converter'],
      'text-tools': ['markdown-editor'],
      'pdf-tools': ['pdf-tools', 'markdown-editor'],
    });
    expect(catalog.groupByTag([])).toEqual([]);
  });
});

test.describe('tool catalog: construction', () => {
  const withDescription = (description: string): ToolRegistry => ({
    'sample-tool': {
      name: 'Sample Tool',
      description,
      tags: ['utilities'],
      component: loader(),
    },
  });

  test('rejects a description shorter than 40 characters', () => {
    expect(() => createToolCatalog(withDescription('x'.repeat(39)))).toThrow(
      'Tool Description Limit Error: Description for tool "sample-tool" is 39 characters. ' +
        'It must be between 40 and 65 characters (inclusive).'
    );
  });

  test('rejects a description longer than 65 characters', () => {
    expect(() => createToolCatalog(withDescription('x'.repeat(66)))).toThrow(
      'Description for tool "sample-tool" is 66 characters'
    );
  });

  test('rejects a hidden tool with a bad description too', () => {
    const bad = withDescription('Too short');
    expect(() =>
      createToolCatalog({ 'sample-tool': { ...bad['sample-tool'], hidden: true } })
    ).toThrow('Tool Description Limit Error');
  });

  test('accepts descriptions at both limits', () => {
    expect(ids(createToolCatalog(withDescription('x'.repeat(40))).all())).toEqual(['sample-tool']);
    expect(ids(createToolCatalog(withDescription('x'.repeat(65))).all())).toEqual(['sample-tool']);
  });
});

test.describe('tool catalog: the app registry', () => {
  test('covers every registry entry, hidden ones included', () => {
    expect(ids(toolCatalog.all())).toEqual(Object.keys(TOOL_REGISTRY));
  });

  test('resolves every entry by id with its own loader', () => {
    for (const [id, entry] of Object.entries(TOOL_REGISTRY)) {
      expect(toolCatalog.get(id)?.tool.id, id).toBe(id);
      expect(toolCatalog.get(id)?.load, id).toBe(entry.component);
    }
  });

  test('offers exactly the non-hidden entries for discovery', () => {
    const hidden = toolCatalog.all().filter((tool) => tool.hidden);
    const grouped = new Set(toolCatalog.groupByTag().flatMap((group) => ids(group.tools)));

    expect(hidden.length).toBeGreaterThan(0);
    expect(toolCatalog.discoverable().length).toBe(toolCatalog.all().length - hidden.length);
    for (const tool of hidden) {
      expect(ids(toolCatalog.discoverable()), tool.id).not.toContain(tool.id);
      expect(grouped.has(tool.id), tool.id).toBe(false);
      expect(ids(toolCatalog.search(tool.id)), tool.id).not.toContain(tool.id);
    }
    // Every discoverable tool can be browsed to through at least one tag group
    expect([...grouped].sort()).toEqual(ids(toolCatalog.discoverable()).sort());
  });
});
