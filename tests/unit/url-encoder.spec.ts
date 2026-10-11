import { test, expect } from '@playwright/test';
import { convertUrlComponent, decodeUrlComponent, encodeUrlComponent } from '@/lib/tools/url-encoder';

test.describe('encodeUrlComponent', () => {
  test('percent-encodes reserved characters and spaces', () => {
    expect(encodeUrlComponent('https://example.com/search?q=hello world')).toBe(
      'https%3A%2F%2Fexample.com%2Fsearch%3Fq%3Dhello%20world'
    );
    expect(encodeUrlComponent('a&b=c+d#e')).toBe('a%26b%3Dc%2Bd%23e');
  });

  test('leaves unreserved characters alone', () => {
    expect(encodeUrlComponent("AZaz09-_.!~*'()")).toBe("AZaz09-_.!~*'()");
  });

  test('encodes non-ASCII text as UTF-8', () => {
    expect(encodeUrlComponent('é')).toBe('%C3%A9');
    expect(encodeUrlComponent('日本')).toBe('%E6%97%A5%E6%9C%AC');
    expect(encodeUrlComponent('😀')).toBe('%F0%9F%98%80');
  });

  test('explains why half a surrogate pair cannot be encoded', () => {
    expect(() => encodeUrlComponent('broken \ud83d')).toThrow(/half of a surrogate pair/);
  });
});

test.describe('decodeUrlComponent', () => {
  test('reverses encodeUrlComponent', () => {
    for (const text of ['hello world', 'a&b=c+d#e', 'é 日本 😀', '100%', 'line1\nline2', '']) {
      expect(decodeUrlComponent(encodeUrlComponent(text))).toBe(text);
    }
  });

  test('accepts lower-case hex and leaves "+" as a plus sign', () => {
    expect(decodeUrlComponent('%c3%a9+%2b')).toBe('é++');
  });

  test('points at a "%" that is not followed by two hex digits', () => {
    expect(() => decodeUrlComponent('100% sure')).toThrow(/Invalid percent-encoding "% s" at position 4\./);
    expect(() => decodeUrlComponent('ok%2')).toThrow(/Invalid percent-encoding "%2" at position 3\./);
    expect(() => decodeUrlComponent('%zz')).toThrow(/Invalid percent-encoding "%zz" at position 1\./);
  });

  test('points at escapes that are not valid UTF-8', () => {
    expect(() => decodeUrlComponent('caf%E9')).toThrow('"%E9" at position 4 is not valid UTF-8.');
    expect(() => decodeUrlComponent('%C3%A9 then %E6%97')).toThrow('"%E6%97" at position 13 is not valid UTF-8.');
  });
});

test.describe('convertUrlComponent', () => {
  test('returns nothing for empty input', () => {
    expect(convertUrlComponent('', 'encode')).toEqual({ output: '', error: '' });
    expect(convertUrlComponent('', 'decode')).toEqual({ output: '', error: '' });
  });

  // Defect: input made only of whitespace was treated as empty.
  test('encodes input that is only whitespace', () => {
    expect(convertUrlComponent(' ', 'encode')).toEqual({ output: '%20', error: '' });
    expect(convertUrlComponent('\n\t', 'encode')).toEqual({ output: '%0A%09', error: '' });
    expect(convertUrlComponent(' ', 'decode')).toEqual({ output: ' ', error: '' });
  });

  test('turns a failure into an error without output', () => {
    const result = convertUrlComponent('%E0%A4%A', 'decode');
    expect(result.output).toBe('');
    expect(result.error).toContain('Invalid percent-encoding "%A" at position 7.');
  });
});
