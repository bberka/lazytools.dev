import { test, expect } from '@playwright/test';
import { toolCatalog } from '@/lib/catalog';
import { TAGS, TAGS_IN_ORDER } from '@/lib/tags';
import type { ToolTag } from '@/lib/types';

// Checked by `npm run typecheck`, not at run time: TAGS must stay keyed by
// exactly the ToolTag union. If it is ever loosened to a string-keyed record,
// a missing tag stops being a compile error and this line stops compiling.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const keyedByTheTagUnion: Same<keyof typeof TAGS, ToolTag> = true;

const BADGE_FIELDS = ['bg', 'text', 'border'];
const CHIP_FIELDS = [
  'borderSelected',
  'bgSelected',
  'bgHover',
  'textSelected',
  'textHover',
  'borderHover',
  'bgActiveHover',
];
const TILE_FIELDS = ['border', 'bg', 'hover', 'text', 'glow'];

function expectClasses(styles: Record<string, string>, fields: string[], label: string) {
  expect(Object.keys(styles).sort(), label).toEqual([...fields].sort());
  for (const field of fields) {
    expect(styles[field], `${label}.${field}`).toMatch(/^\S+( \S+)*$/);
    expect(styles[field], `${label}.${field}`).not.toContain('undefined');
  }
}

test.describe('tag taxonomy', () => {
  test('is keyed by the ToolTag union', () => {
    expect(keyedByTheTagUnion).toBe(true);
  });

  test('has a complete entry for every tag', () => {
    const entries = Object.entries(TAGS);
    expect(entries.length).toBeGreaterThan(0);

    for (const [key, tag] of entries) {
      expect(tag.id, key).toBe(key);
      expect(tag.name.trim(), `${key}.name`).not.toBe('');
      expect(tag.description.trim(), `${key}.description`).not.toBe('');
      expect(tag.icon, `${key}.icon`).toBeTruthy();
      expect(tag.color, `${key}.color`).toMatch(/^text-\S+$/);
      expectClasses(tag.badge, BADGE_FIELDS, `${key}.badge`);
      expectClasses(tag.chip, CHIP_FIELDS, `${key}.chip`);
      expectClasses(tag.tile, TILE_FIELDS, `${key}.tile`);
    }
  });

  test('gives every tag its own display name', () => {
    const names = Object.values(TAGS).map((tag) => tag.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('lists each tag exactly once in the canonical order', () => {
    const ordered = TAGS_IN_ORDER.map((tag) => tag.id);

    expect(new Set(ordered).size).toBe(ordered.length);
    expect([...ordered].sort()).toEqual(Object.keys(TAGS).sort());
    for (const tag of TAGS_IN_ORDER) {
      expect(tag, tag.id).toBe(TAGS[tag.id]);
    }
  });

  test('has an entry for every tag a registered tool carries', () => {
    for (const tool of toolCatalog.all()) {
      for (const tagId of tool.tags) {
        expect(TAGS[tagId], `${tool.id}: ${tagId}`).toBeDefined();
      }
    }
  });
});
