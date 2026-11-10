import { test, expect } from '@playwright/test';
import { describeKey, keyInfoText, pushHistory, type KeyEventLike } from '@/lib/tools/keycode-info';

const event = (overrides: Partial<KeyEventLike>): KeyEventLike => ({
  key: 'a',
  code: 'KeyA',
  keyCode: 65,
  which: 65,
  location: 0,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  repeat: false,
  ...overrides,
});

test.describe('describeKey', () => {
  test('describes a letter key', () => {
    expect(describeKey(event({}))).toEqual({
      key: 'a',
      code: 'KeyA',
      keyCode: 65,
      which: 65,
      location: 0,
      locationName: 'Standard',
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
      repeat: false,
      character: 'a',
      label: 'a',
      modifiers: [],
    });
  });

  test('keeps the shifted character in key and the physical key in code', () => {
    const info = describeKey(event({ key: 'A', shiftKey: true }));
    expect(info).toMatchObject({ key: 'A', code: 'KeyA', character: 'A', shift: true, modifiers: ['Shift'] });
  });

  test('names the space bar', () => {
    expect(describeKey(event({ key: ' ', code: 'Space', keyCode: 32, which: 32 }))).toMatchObject({
      character: ' ',
      label: 'Space',
      code: 'Space',
      keyCode: 32,
    });
  });

  test('gives no character to keys that type nothing', () => {
    for (const key of ['Enter', 'Shift', 'F5', 'ArrowLeft', 'Dead', 'Unidentified', 'Escape']) {
      expect(describeKey(event({ key })).character, key).toBeNull();
    }
    expect(describeKey(event({ key: 'Enter' })).label).toBe('Enter');
  });

  test('counts an emoji or other astral character as one character', () => {
    expect(describeKey(event({ key: '😀' })).character).toBe('😀');
    expect(describeKey(event({ key: 'é' })).character).toBe('é');
  });

  test('labels an empty key', () => {
    expect(describeKey(event({ key: '' }))).toMatchObject({ character: null, label: '(empty)' });
  });

  test('reads the location', () => {
    expect(describeKey(event({ key: 'Shift', code: 'ShiftLeft', keyCode: 16, location: 1 })).locationName).toBe('Left');
    expect(describeKey(event({ key: 'Shift', code: 'ShiftRight', keyCode: 16, location: 2 })).locationName).toBe('Right');
    expect(describeKey(event({ key: '5', code: 'Numpad5', keyCode: 101, location: 3 })).locationName).toBe('Numpad');
    expect(describeKey(event({ location: 9 })).locationName).toBe('Unknown (9)');
  });

  test('lists the modifiers in a fixed order', () => {
    const info = describeKey(event({ metaKey: true, shiftKey: true, altKey: true, ctrlKey: true }));
    expect(info.modifiers).toEqual(['Ctrl', 'Alt', 'Shift', 'Meta']);
    expect(describeKey(event({ metaKey: true })).modifiers).toEqual(['Meta']);
  });

  test('passes the repeat flag and the virtual-keyboard keyCode 229 through', () => {
    expect(describeKey(event({ key: 'Unidentified', code: '', keyCode: 229, which: 229, repeat: true }))).toMatchObject({
      keyCode: 229,
      which: 229,
      repeat: true,
      code: '',
    });
  });
});

test.describe('pushHistory', () => {
  test('puts the newest first', () => {
    expect(pushHistory([2, 1], 3)).toEqual([3, 2, 1]);
  });

  test('keeps at most the limit', () => {
    expect(pushHistory([3, 2, 1], 4, 3)).toEqual([4, 3, 2]);
    expect(pushHistory([], 'a', 1)).toEqual(['a']);
  });

  test('defaults to ten entries and does not change its input', () => {
    const full = Array.from({ length: 10 }, (_, index) => index);
    const next = pushHistory(full, 99);
    expect(next).toHaveLength(10);
    expect(next[0]).toBe(99);
    expect(next[9]).toBe(8);
    expect(full[0]).toBe(0);
  });
});

test.describe('keyInfoText', () => {
  test('writes one value per line', () => {
    expect(keyInfoText(describeKey(event({ key: ' ', code: 'Space', keyCode: 32, which: 32, ctrlKey: true })))).toBe(
      [
        'event.key: " "',
        'event.code: "Space"',
        'event.keyCode: 32',
        'event.which: 32',
        'event.location: 0 (Standard)',
        'ctrlKey: true',
        'shiftKey: false',
        'altKey: false',
        'metaKey: false',
        'repeat: false',
      ].join('\n')
    );
  });
});
