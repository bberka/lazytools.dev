import { test, expect } from '@playwright/test';
import { convertEscape, escapeText, unescapeText, type EscapeMode } from '@/lib/tools/text-escape';

const MODES: EscapeMode[] = ['javascript', 'json', 'html', 'xml', 'csv', 'sql', 'regex'];

test.describe('JavaScript', () => {
  // Defect: the backspace rule was written /\b/, a word boundary, so "\b" was
  // inserted around every word.
  test('escapes plain words without adding anything', () => {
    expect(escapeText('hello world', 'javascript')).toBe('hello world');
    expect(escapeText('a1 b2, c3!', 'javascript')).toBe('a1 b2, c3!');
  });

  test('escapes quotes, backslashes and control characters', () => {
    expect(escapeText('He said "hi" and \'bye\'', 'javascript')).toBe('He said \\"hi\\" and \\\'bye\\\'');
    expect(escapeText('C:\\temp', 'javascript')).toBe('C:\\\\temp');
    expect(escapeText('a\nb\rc\td\be\ff', 'javascript')).toBe('a\\nb\\rc\\td\\be\\ff');
  });

  test('unescapes the sequences it writes', () => {
    expect(unescapeText('a\\nb\\rc\\td\\be\\ff', 'javascript')).toBe('a\nb\rc\td\be\ff');
    expect(unescapeText('\\"x\\" \\\'y\\\'', 'javascript')).toBe('"x" \'y\'');
  });

  // Defect: unescaping ran one replace per sequence, so the second backslash of
  // an escaped backslash was read as the start of "\n".
  test('reads an escaped backslash before a letter as a backslash', () => {
    expect(unescapeText('C:\\\\new\\\\table', 'javascript')).toBe('C:\\new\\table');
    expect(unescapeText('\\\\n', 'javascript')).toBe('\\n');
    expect(unescapeText(escapeText('C:\\new\\table', 'javascript'), 'javascript')).toBe('C:\\new\\table');
  });

  test('unescapes unicode, hex and other standard sequences', () => {
    expect(unescapeText('\\u00e9\\u{1F600}\\x41', 'javascript')).toBe('é😀A');
    expect(unescapeText('\\ud83d\\ude00', 'javascript')).toBe('😀');
    expect(unescapeText('a\\vb\\0c\\`d', 'javascript')).toBe('a\vb\0c`d');
    // A backslash at the end of a line joins the lines.
    expect(unescapeText('one \\\ntwo', 'javascript')).toBe('one two');
  });

  test('leaves unknown and incomplete escapes as they are', () => {
    expect(unescapeText('\\d+\\.\\w', 'javascript')).toBe('\\d+\\.\\w');
    expect(unescapeText('\\u12', 'javascript')).toBe('\\u12');
    expect(unescapeText('\\u{110000}', 'javascript')).toBe('\\u{110000}');
    expect(unescapeText('trailing\\', 'javascript')).toBe('trailing\\');
  });
});

test.describe('JSON', () => {
  test('escapes like JSON.stringify without the surrounding quotes', () => {
    expect(escapeText('say "hi"\n\tC:\\x', 'json')).toBe('say \\"hi\\"\\n\\tC:\\\\x');
    expect(escapeText('\u0001', 'json')).toBe('\\u0001');
    expect(escapeText('é😀', 'json')).toBe('é😀');
  });

  test('unescapes every JSON escape', () => {
    expect(unescapeText('\\"\\\\\\/\\b\\f\\n\\r\\t', 'json')).toBe('"\\/\b\f\n\r\t');
    expect(unescapeText('\\u00e9\\ud83d\\ude00', 'json')).toBe('é😀');
    expect(unescapeText('C:\\\\new', 'json')).toBe('C:\\new');
  });

  // Defect: the text was handed to JSON.parse, which rejects real line breaks
  // and unescaped quotes, so multi-line input could not be unescaped at all.
  test('accepts real line breaks and unescaped quotes in the input', () => {
    expect(unescapeText('first\\tline\nsecond "line"', 'json')).toBe('first\tline\nsecond "line"');
  });

  test('reports a backslash that does not start a JSON escape', () => {
    expect(() => unescapeText('ab\\x41', 'json')).toThrow('Invalid JSON escape sequence "\\x" at position 3.');
    expect(() => unescapeText('\\u12', 'json')).toThrow('Invalid JSON escape sequence "\\u" at position 1.');
    expect(() => unescapeText('end\\', 'json')).toThrow('Invalid JSON escape sequence "\\" at position 4.');
  });
});

test.describe('HTML and XML', () => {
  test('escape the markup characters', () => {
    expect(escapeText('<a href="x">T&C\'s</a>', 'html')).toBe(
      '&lt;a href=&quot;x&quot;&gt;T&amp;C&#39;s&lt;/a&gt;'
    );
    expect(escapeText('<a href="x">T&C\'s</a>', 'xml')).toBe(
      '&lt;a href=&quot;x&quot;&gt;T&amp;C&apos;s&lt;/a&gt;'
    );
  });

  // Defect: only the five entities the tool itself writes were unescaped.
  test('unescape numeric references and, for HTML, named ones', () => {
    expect(unescapeText('&#x27;&#39;&apos;&#60;&nbsp;&copy;&eacute;', 'html')).toBe("'''<\u00a0©é");
    expect(unescapeText('&#x27;&#39;&apos;&#60;&#x1F600;', 'xml')).toBe("'''<😀");
  });

  test('XML keeps what is not one of its five entities', () => {
    expect(unescapeText('&nbsp; &copy; &amp;lt; &#0; &lt', 'xml')).toBe('&nbsp; &copy; &lt; &#0; &lt');
  });
});

test.describe('CSV, SQL and regular expressions', () => {
  test('CSV quotes a field only when it needs it', () => {
    expect(escapeText('plain', 'csv')).toBe('plain');
    expect(escapeText('a,b', 'csv')).toBe('"a,b"');
    expect(escapeText('say "hi"', 'csv')).toBe('"say ""hi"""');
    expect(escapeText('two\nlines', 'csv')).toBe('"two\nlines"');
    expect(escapeText('old\rmac', 'csv')).toBe('"old\rmac"');
  });

  test('CSV unquotes a quoted field', () => {
    expect(unescapeText('"say ""hi"""', 'csv')).toBe('say "hi"');
    expect(unescapeText('plain', 'csv')).toBe('plain');
    // A single quote character is not a quoted field.
    expect(unescapeText('"', 'csv')).toBe('"');
    expect(unescapeText('""', 'csv')).toBe('');
  });

  test('SQL doubles single quotes', () => {
    expect(escapeText("O'Brien's", 'sql')).toBe("O''Brien''s");
    expect(unescapeText("O''Brien''s", 'sql')).toBe("O'Brien's");
  });

  test('regex escapes every metacharacter', () => {
    expect(escapeText('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o', 'regex')).toBe(
      'a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o'
    );
    expect(new RegExp(`^${escapeText('1+1=2? (yes) [ok] $5.00', 'regex')}$`).test('1+1=2? (yes) [ok] $5.00')).toBe(true);
    expect(unescapeText('a\\.b\\\\c\\d', 'regex')).toBe('a.b\\c\\d');
  });
});

test.describe('every mode', () => {
  const SAMPLES = [
    'plain words',
    'He said "hi", she said \'bye\'',
    'C:\\new\\table\\file.txt',
    'line1\nline2\ttabbed\r\n',
    '<p class="x">a & b</p>',
    '100% (sure) [really] {yes} a|b ^$ .*+?',
    'ünïcödé 日本語 😀',
    ' ',
    '\t',
    '\n',
  ];

  test('unescapes exactly what it escaped', () => {
    for (const mode of MODES) {
      for (const sample of SAMPLES) {
        expect(unescapeText(escapeText(sample, mode), mode), `${mode}: ${JSON.stringify(sample)}`).toBe(sample);
      }
    }
  });

  test('keeps empty text empty', () => {
    for (const mode of MODES) {
      expect(escapeText('', mode)).toBe('');
      expect(unescapeText('', mode)).toBe('');
    }
  });
});

test.describe('convertEscape', () => {
  // Defect: input made only of whitespace was treated as empty.
  test('escapes input that is only whitespace', () => {
    expect(convertEscape('\t', 'javascript', 'escape')).toEqual({ output: '\\t', error: '' });
    expect(convertEscape('\n', 'json', 'escape')).toEqual({ output: '\\n', error: '' });
    expect(convertEscape('', 'json', 'escape')).toEqual({ output: '', error: '' });
  });

  test('turns a failure into an error without output', () => {
    expect(convertEscape('bad \\q', 'json', 'unescape')).toEqual({
      output: '',
      error: 'Invalid JSON escape sequence "\\q" at position 5.',
    });
  });

  // The Swap button feeds the output back in with the direction flipped.
  test('unescaping the escaped output gives the input back', () => {
    const input = 'a "quoted" \\ path\n';
    const escaped = convertEscape(input, 'javascript', 'escape').output;
    expect(convertEscape(escaped, 'javascript', 'unescape')).toEqual({ output: input, error: '' });
  });
});
