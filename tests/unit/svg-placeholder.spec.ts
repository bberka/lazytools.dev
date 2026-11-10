import { describe, expect, test } from 'vite-plus/test';
import {
  autoFontSize,
  buildPlaceholderOutputs,
  buildPlaceholderSvg,
  escapeXml,
  evaluatePlaceholder,
  maxRadius,
  placeholderFileName,
  resolveLabel,
  singleLine,
  svgToDataUri,
  type PlaceholderConfig,
  type PlaceholderFields,
} from '@/lib/tools/svg-placeholder';

const config: PlaceholderConfig = {
  width: 600,
  height: 400,
  background: '#CCCCCC',
  textColor: '#666666',
  text: '',
  showText: true,
  fontSize: 'auto',
  radius: 0,
};

const fields: PlaceholderFields = {
  width: '600',
  height: '400',
  background: '#CCCCCC',
  textColor: '#666666',
  text: '',
  showText: true,
  autoFont: true,
  fontSize: '48',
  radius: '0',
};

function invalid(overrides: Partial<PlaceholderFields>) {
  const outcome = evaluatePlaceholder({ ...fields, ...overrides });
  if (outcome.status !== 'invalid') throw new Error('expected validation errors');
  return outcome.errors;
}

describe('escapeXml', () => {
  test('escapes the five XML special characters', () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;'
    );
  });

  test('escapes the ampersand first so entities are not double-escaped by mistake', () => {
    expect(escapeXml('&lt;')).toBe('&amp;lt;');
  });

  test('drops characters XML cannot carry and repairs lone surrogates', () => {
    expect(escapeXml('a\u0000b\u0007c\u001fd')).toBe('abcd');
    expect(escapeXml('a\uD800b')).toBe('a�b');
    expect(escapeXml('\uDC00')).toBe('�');
    expect(escapeXml('tab\tkept')).toBe('tab\tkept');
    expect(escapeXml('emoji 😀')).toBe('emoji 😀');
  });
});

describe('labels and font size', () => {
  test('a blank label is the size', () => {
    expect(resolveLabel({ text: '', width: 600, height: 400 })).toBe('600 x 400');
    expect(resolveLabel({ text: '   \n ', width: 5, height: 7 })).toBe('5 x 7');
    expect(resolveLabel({ text: '  Hero\n image ', width: 5, height: 7 })).toBe('Hero image');
  });

  test('singleLine collapses whitespace', () => {
    expect(singleLine(' a \t\n b  c ')).toBe('a b c');
  });

  test('auto font size is limited by width or by height, with a floor of 8', () => {
    // 9 characters: 600 * 0.8 / (9 * 0.6) = 88.88; a quarter of 400 is 100
    expect(autoFontSize(600, 400, '600 x 400')).toBe(88);
    // short label in a short image: height wins, 100 * 0.25 = 25
    expect(autoFontSize(1000, 100, 'Hi')).toBe(25);
    // long label in a small image: 100 * 0.8 / (20 * 0.6) = 6.67, raised to 8
    expect(autoFontSize(100, 400, 'twenty chars of text')).toBe(8);
    // counts code points, not UTF-16 units
    expect(autoFontSize(60, 400, '😀')).toBe(autoFontSize(60, 400, 'x'));
  });

  test('max radius is half the shorter side', () => {
    expect(maxRadius(600, 400)).toBe(200);
    expect(maxRadius(11, 50)).toBe(5);
  });
});

describe('buildPlaceholderSvg', () => {
  test('default 600 x 400 placeholder', () => {
    expect(buildPlaceholderSvg(config)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" role="img" aria-label="600 x 400">' +
        '<rect width="600" height="400" fill="#cccccc"/>' +
        '<text x="50%" y="50%" fill="#666666" font-family="Arial, Helvetica, sans-serif" font-size="88" text-anchor="middle" dominant-baseline="central">600 x 400</text>' +
        '</svg>'
    );
  });

  test('custom colours, text, fixed size and rounded corners', () => {
    const svg = buildPlaceholderSvg({
      ...config,
      width: 200,
      height: 100,
      background: '#1a2b3c',
      textColor: '#fff',
      text: 'Logo',
      fontSize: 30,
      radius: 12,
    });
    expect(svg).toContain('<rect width="200" height="100" rx="12" fill="#1a2b3c"/>');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('font-size="30"');
    expect(svg).toContain('>Logo</text>');
    expect(svg).toContain('aria-label="Logo"');
  });

  test('the radius is clamped to half the shorter side', () => {
    expect(buildPlaceholderSvg({ ...config, width: 100, height: 40, radius: 999 })).toContain(
      'rx="20"'
    );
  });

  test('hidden text leaves only the rectangle', () => {
    const svg = buildPlaceholderSvg({ ...config, showText: false });
    expect(svg).not.toContain('<text');
    expect(svg).toContain('<rect');
  });

  test('markup in the text cannot break out of the SVG', () => {
    const svg = buildPlaceholderSvg({ ...config, text: '</text><script>alert("x")</script>&"' });
    expect(svg).not.toContain('<script');
    expect(svg).toContain(
      '&lt;/text&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&quot;</text>'
    );
    expect(svg).toContain(
      'aria-label="&lt;/text&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&quot;"'
    );
    // exactly one text element and one svg element
    expect(svg.match(/<text /g)).toHaveLength(1);
    expect(svg.match(/<svg /g)).toHaveLength(1);
  });

  test('an unreadable colour falls back to the default', () => {
    const svg = buildPlaceholderSvg({ ...config, background: 'red', textColor: '"onload="x' });
    expect(svg).toContain('fill="#cccccc"');
    expect(svg).toContain('fill="#666666"');
  });
});

describe('data URI and snippets', () => {
  const svg = buildPlaceholderSvg({ ...config, text: `It's (50%) "ok" & <fine>! *` });
  const uri = svgToDataUri(svg);

  test('is fully percent-encoded', () => {
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    const payload = uri.slice('data:image/svg+xml,'.length);
    expect(payload).toMatch(/^[A-Za-z0-9%\-_.~]+$/);
    expect(payload).not.toMatch(/%(?![0-9A-F]{2})/);
  });

  test('decodes back to the same SVG', () => {
    expect(decodeURIComponent(uri.slice('data:image/svg+xml,'.length))).toBe(svg);
  });

  test('encodes the characters encodeURIComponent leaves alone', () => {
    expect(svgToDataUri(`!'()*`)).toBe('data:image/svg+xml,%21%27%28%29%2A');
    expect(svgToDataUri('<svg/>')).toBe('data:image/svg+xml,%3Csvg%2F%3E');
  });

  test('handles non-ASCII text and lone surrogates without throwing', () => {
    expect(svgToDataUri('é中')).toBe('data:image/svg+xml,%C3%A9%E4%B8%AD');
    expect(svgToDataUri('a\uD800b')).toBe('data:image/svg+xml,a%EF%BF%BDb');
  });

  test('CSS and HTML snippets wrap the same URI', () => {
    const outputs = buildPlaceholderOutputs(config);
    expect(outputs.css).toBe(
      `.placeholder {\n  width: 600px;\n  height: 400px;\n  background: url("${outputs.dataUri}") center / cover no-repeat;\n}`
    );
    expect(outputs.html).toBe(
      `<img src="${outputs.dataUri}" width="600" height="400" alt="600 x 400">`
    );
    expect(outputs.dataUri).toBe(svgToDataUri(outputs.svg));
  });

  test('the HTML alt text is escaped', () => {
    const outputs = buildPlaceholderOutputs({ ...config, text: 'a "b"' });
    expect(outputs.html.endsWith('alt="a &quot;b&quot;">')).toBe(true);
  });

  test('file name', () => {
    expect(placeholderFileName(600, 400)).toBe('placeholder-600x400.svg');
  });
});

describe('evaluatePlaceholder', () => {
  test('builds from the form as typed', () => {
    const outcome = evaluatePlaceholder({ ...fields, width: ' 300 ', height: '200', radius: '' });
    expect(outcome.status).toBe('ready');
    if (outcome.status === 'ready') {
      expect(outcome.config.width).toBe(300);
      expect(outcome.config.radius).toBe(0);
      expect(outcome.outputs.svg).toContain('300 x 200</text>');
    }
  });

  test('size limits', () => {
    expect(invalid({ width: '0' }).width).toBe('Width must be a whole number from 1 to 5000.');
    expect(invalid({ height: '5001' }).height).toBe(
      'Height must be a whole number from 1 to 5000.'
    );
    expect(invalid({ width: '12.5' }).width).toBeDefined();
    expect(invalid({ width: '-3' }).width).toBeDefined();
    expect(invalid({ width: '' }).width).toBeDefined();
    expect(invalid({ height: 'abc' }).height).toBeDefined();
    const ok = evaluatePlaceholder({ ...fields, width: '5000', height: '1' });
    expect(ok.status).toBe('ready');
  });

  test('a fixed font size is only checked when auto is off', () => {
    expect(evaluatePlaceholder({ ...fields, autoFont: true, fontSize: 'zzz' }).status).toBe(
      'ready'
    );
    expect(invalid({ autoFont: false, fontSize: '0' }).fontSize).toBe(
      'Font size must be a whole number from 1 to 1000.'
    );
    expect(invalid({ autoFont: false, fontSize: '1001' }).fontSize).toBeDefined();
    const outcome = evaluatePlaceholder({ ...fields, autoFont: false, fontSize: '40' });
    if (outcome.status === 'ready') expect(outcome.outputs.svg).toContain('font-size="40"');
  });

  test('radius and text limits', () => {
    expect(invalid({ radius: '-1' }).radius).toBeDefined();
    expect(invalid({ radius: '2.5' }).radius).toBeDefined();
    expect(invalid({ text: 'x'.repeat(101) }).text).toBe('Text can be at most 100 characters.');
    const clamped = evaluatePlaceholder({ ...fields, width: '100', height: '40', radius: '500' });
    if (clamped.status === 'ready') expect(clamped.config.radius).toBe(20);
  });
});
