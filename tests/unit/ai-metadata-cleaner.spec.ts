import { describe, expect, test } from 'vite-plus/test';
import {
  DEFAULT_TEXT_OPTIONS,
  cleanAiText,
  stripTrackingParams,
  stripTrackingParamsInText,
  type TextCategory,
} from '@/lib/tools/ai-metadata-cleaner';

const only = (category: TextCategory) => ({
  invisible: false,
  softHyphen: false,
  bidi: false,
  tags: false,
  variationSelectors: false,
  spaces: false,
  trackingParams: false,
  [category]: true,
});

describe('cleanAiText characters', () => {
  test('plain text passes through with all counts at zero', () => {
    const result = cleanAiText('Hello, world!\n\tTabs and\r\nlines stay. Café 世界 😀');
    expect(result.text).toBe('Hello, world!\n\tTabs and\r\nlines stay. Café 世界 😀');
    expect(result.total).toBe(0);
    expect(result.changed).toBe(false);
    expect(Object.values(result.found).every((count) => count === 0)).toBe(true);
  });

  test('removes zero-width characters, word joiner, BOM and fillers, and counts them', () => {
    const result = cleanAiText('a​b‌c‍d⁠e﻿fㅤg');
    expect(result.text).toBe('abcdefg');
    expect(result.found.invisible).toBe(6);
    expect(result.applied.invisible).toBe(6);
    expect(result.total).toBe(6);
    expect(result.changed).toBe(true);
  });

  test('removes soft hyphens', () => {
    const result = cleanAiText('co­operate');
    expect(result.text).toBe('cooperate');
    expect(result.found.softHyphen).toBe(1);
  });

  test('removes bidirectional controls', () => {
    const result = cleanAiText('a‮b‏c⁦d⁩');
    expect(result.text).toBe('abcd');
    expect(result.found.bidi).toBe(4);
  });

  test('removes Unicode tag characters, including a hidden ASCII message', () => {
    const hidden = Array.from('hi', (char) =>
      String.fromCodePoint(0xe0000 + char.charCodeAt(0))
    ).join('');
    const result = cleanAiText(`Hello${hidden}\u{E0001}\u{E007F} there`);
    expect(result.text).toBe('Hello there');
    expect(result.found.tags).toBe(4);
  });

  test('removes variation selectors that follow plain text but keeps emoji presentation', () => {
    const result = cleanAiText('a︁b\u{E0100}c ❤️ ok');
    expect(result.text).toBe('abc ❤️ ok');
    expect(result.found.variationSelectors).toBe(2);
  });

  test('keeps the joiners and flag tags of emoji sequences, and the joiners of Persian words', () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
    const scotland = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}';
    const persian = 'می‌خواهم';
    const result = cleanAiText(`${family} ${scotland} ${persian}`);
    expect(result.text).toBe(`${family} ${scotland} ${persian}`);
    expect(result.total).toBe(0);
  });

  test('turns narrow no-break and other exotic spaces into one normal space each', () => {
    const result = cleanAiText('a b c d　e');
    expect(result.text).toBe('a b c d e');
    expect(result.found.spaces).toBe(4);
  });

  test('counts every category even when its switch is off, and leaves that category alone', () => {
    const input = 'a​b c­d';
    const result = cleanAiText(input, only('spaces'));
    expect(result.text).toBe('a​b c­d');
    expect(result.found).toMatchObject({ invisible: 1, spaces: 1, softHyphen: 1 });
    expect(result.applied).toMatchObject({ invisible: 0, spaces: 1, softHyphen: 0 });
    expect(result.total).toBe(1);
  });

  test('keeps tab, line feed and carriage return', () => {
    expect(cleanAiText('a\tb\nc\r\nd').text).toBe('a\tb\nc\r\nd');
  });
});

describe('tracking parameters', () => {
  test('strips utm_source=chatgpt.com and keeps the other parameters and the fragment', () => {
    expect(stripTrackingParams('https://example.com/a?x=1&utm_source=chatgpt.com&y=2#top')).toEqual(
      {
        url: 'https://example.com/a?x=1&y=2#top',
        removed: 1,
      }
    );
  });

  test('drops the question mark when no parameter is left', () => {
    expect(stripTrackingParams('https://example.com/?utm_source=openai&utm_medium=chat')).toEqual({
      url: 'https://example.com/',
      removed: 2,
    });
  });

  test('removes ref and source parameters only when they name an AI assistant', () => {
    expect(
      stripTrackingParams('https://e.com/?ref=chatgpt.com&source=newsletter&from=Claude').url
    ).toBe('https://e.com/?source=newsletter');
  });

  test('leaves URLs without tracking parameters byte for byte', () => {
    const url = 'https://e.com/p?q=a%20b&flag&x=1+2#frag';
    expect(stripTrackingParams(url)).toEqual({ url, removed: 0 });
  });

  test('rewrites URLs inside text and keeps trailing punctuation and Markdown links', () => {
    const input =
      'See https://a.com/x?utm_source=chatgpt.com. Also [b](https://b.com/?id=7&utm_source=chatgpt.com) and (https://c.com/?utm_source=openai).';
    const result = stripTrackingParamsInText(input);
    expect(result.text).toBe(
      'See https://a.com/x. Also [b](https://b.com/?id=7) and (https://c.com/).'
    );
    expect(result.removed).toBe(3);
  });

  test('counts under trackingParams and honours the switch', () => {
    const input = 'Read https://a.com/?utm_source=chatgpt.com now';
    expect(cleanAiText(input).text).toBe('Read https://a.com/ now');
    expect(cleanAiText(input).found.trackingParams).toBe(1);
    const off = cleanAiText(input, only('invisible'));
    expect(off.text).toBe(input);
    expect(off.found.trackingParams).toBe(1);
    expect(off.applied.trackingParams).toBe(0);
  });

  test('a zero-width character inside a URL is removed before the URL is read', () => {
    const result = cleanAiText('https://a.com/?utm_sou​rce=chatgpt.com');
    expect(result.text).toBe('https://a.com/');
    expect(result.total).toBe(2);
  });
});

test('default options switch every category on', () => {
  expect(Object.values(DEFAULT_TEXT_OPTIONS).every(Boolean)).toBe(true);
});
