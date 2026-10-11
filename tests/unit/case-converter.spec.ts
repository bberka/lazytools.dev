import { test, expect } from '@playwright/test';
import { CASE_CONVERSIONS } from '@/lib/tools/case-converter';

function convert(text: string, label: string): string {
  const conversion = CASE_CONVERSIONS.find((item) => item.label === label);
  if (!conversion) {
    throw new Error(`No conversion called ${label}`);
  }
  return conversion.convert(text);
}

const NAMING_CASES = [
  'camelCase',
  'PascalCase',
  'snake_case',
  'kebab-case',
  'dot.case',
  'CONSTANT_CASE',
];

test.describe('the conversions on offer', () => {
  test('lists the ten cases in display order', () => {
    expect(CASE_CONVERSIONS.map((conversion) => conversion.label)).toEqual([
      'camelCase',
      'PascalCase',
      'snake_case',
      'kebab-case',
      'UPPERCASE',
      'lowercase',
      'Title Case',
      'Sentence case',
      'dot.case',
      'CONSTANT_CASE',
    ]);
  });

  test('every example is what the placeholder text converts to', () => {
    for (const conversion of CASE_CONVERSIONS) {
      expect(conversion.convert('Hello World Example'), conversion.label).toBe(conversion.example);
    }
  });
});

test.describe('naming cases', () => {
  test('give the same result whatever case the input is in', () => {
    const spellings = [
      'Hello World Example',
      'hello world example',
      'HELLO WORLD EXAMPLE',
      'helloWorldExample',
      'HelloWorldExample',
      'hello_world_example',
      'hello-world-example',
      'hello.world.example',
      'HELLO_WORLD_EXAMPLE',
    ];

    for (const conversion of CASE_CONVERSIONS.filter((item) =>
      NAMING_CASES.includes(item.label)
    )) {
      for (const spelling of spellings) {
        expect(conversion.convert(spelling), `${conversion.label} of ${spelling}`).toBe(
          conversion.example
        );
      }
    }
  });

  // Defect: a capital after a space gave a doubled separator.
  test('put one separator between words that start with a capital', () => {
    expect(convert('Hello World Example', 'snake_case')).toBe('hello_world_example');
    expect(convert('Hello World Example', 'kebab-case')).toBe('hello-world-example');
    expect(convert('Hello World Example', 'dot.case')).toBe('hello.world.example');
    expect(convert('Hello World Example', 'CONSTANT_CASE')).toBe('HELLO_WORLD_EXAMPLE');
  });

  // Defect: every capital started a new word, so "HELLO" became "h_e_l_l_o".
  test('keep a run of capitals together as one word', () => {
    expect(convert('HELLO WORLD', 'snake_case')).toBe('hello_world');
    expect(convert('HELLO WORLD', 'camelCase')).toBe('helloWorld');
    expect(convert('HTMLParser', 'kebab-case')).toBe('html-parser');
    expect(convert('parseXMLDocument', 'snake_case')).toBe('parse_xml_document');
  });

  // Defect: "_" was not a word break for camelCase and PascalCase.
  test('split snake_case input into words for camelCase and PascalCase', () => {
    expect(convert('hello_world_example', 'camelCase')).toBe('helloWorldExample');
    expect(convert('hello_world_example', 'PascalCase')).toBe('HelloWorldExample');
  });

  // Defect: leading whitespace made camelCase start with a capital.
  test('ignore whitespace and separators around the text', () => {
    expect(convert('  hello world  ', 'camelCase')).toBe('helloWorld');
    expect(convert('--hello world--', 'snake_case')).toBe('hello_world');
    expect(convert('first line\nsecond line', 'kebab-case')).toBe('first-line-second-line');
  });

  // Defect: accented letters were treated as word breaks.
  test('treat accented and non-Latin letters as letters', () => {
    expect(convert('héllo wörld', 'camelCase')).toBe('hélloWörld');
    expect(convert('École Normale', 'snake_case')).toBe('école_normale');
    expect(convert('привет мир', 'PascalCase')).toBe('ПриветМир');
    expect(convert('café au lait', 'CONSTANT_CASE')).toBe('CAFÉ_AU_LAIT');
  });

  test('keep digits with the letters before them', () => {
    expect(convert('version2Update', 'snake_case')).toBe('version2_update');
    expect(convert('sha256 sum', 'camelCase')).toBe('sha256Sum');
    expect(convert('step 2 of 3', 'kebab-case')).toBe('step-2-of-3');
  });

  test('drop punctuation and keep an apostrophe inside its word', () => {
    expect(convert("don't stop, believing!", 'camelCase')).toBe('dontStopBelieving');
    expect(convert('user.name@example', 'snake_case')).toBe('user_name_example');
    expect(convert('party 🎉 time', 'PascalCase')).toBe('PartyTime');
  });

  test('give an empty result when the text has no letters or digits', () => {
    for (const label of NAMING_CASES) {
      expect(convert('', label), label).toBe('');
      expect(convert('   ', label), label).toBe('');
      expect(convert('--- !!!', label), label).toBe('');
    }
  });
});

test.describe('prose cases', () => {
  test('UPPERCASE and lowercase keep spacing, line breaks and punctuation', () => {
    expect(convert('Hello, World!\n  Second line', 'UPPERCASE')).toBe(
      'HELLO, WORLD!\n  SECOND LINE'
    );
    expect(convert('Hello, World!\n  Second line', 'lowercase')).toBe(
      'hello, world!\n  second line'
    );
  });

  test('Title Case capitalises each word and lowers the rest', () => {
    expect(convert('the QUICK brown fox', 'Title Case')).toBe('The Quick Brown Fox');
    expect(convert('hello-world and o\'neil', 'Title Case')).toBe("Hello-world And O'neil");
    expect(convert('line one\nline two', 'Title Case')).toBe('Line One\nLine Two');
  });

  // Defect: a word starting with an accented letter was capitalised at its
  // first ASCII letter ("éLan").
  test('Title Case capitalises accented first letters', () => {
    expect(convert('élan vital', 'Title Case')).toBe('Élan Vital');
    expect(convert('ÉCOLE normale', 'Title Case')).toBe('École Normale');
  });

  test('Sentence case lowers everything but the first letter', () => {
    expect(convert('hello WORLD example', 'Sentence case')).toBe('Hello world example');
  });

  // Defect: only the very first character was capitalised, so later
  // sentences and text with leading whitespace or a quote got no capital.
  test('Sentence case capitalises every sentence', () => {
    expect(convert('HELLO THERE. HOW ARE YOU? fine! thanks', 'Sentence case')).toBe(
      'Hello there. How are you? Fine! Thanks'
    );
    expect(convert('  hello world', 'Sentence case')).toBe('  Hello world');
    expect(convert('"quoted start" of text', 'Sentence case')).toBe('"Quoted start" of text');
  });

  test('Sentence case leaves numbers and decimals alone', () => {
    expect(convert('3 apples cost 2.50 each. cheap', 'Sentence case')).toBe(
      '3 apples cost 2.50 each. Cheap'
    );
  });

  test('return empty text unchanged', () => {
    for (const label of ['UPPERCASE', 'lowercase', 'Title Case', 'Sentence case']) {
      expect(convert('', label), label).toBe('');
    }
  });
});
