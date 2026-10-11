/**
 * Case converter logic: turns text into the naming and prose cases the tool
 * offers.
 *
 * The naming cases (camel, Pascal, snake, kebab, dot, constant) first split
 * the text into words, so they give the same answer whatever the input was
 * written in: "Hello World", "hello_world", "helloWorld" and "HELLO-WORLD" all
 * split into `hello` + `world`. The prose cases (upper, lower, title,
 * sentence) keep spacing and punctuation and only change letter case.
 *
 * Everything is Unicode-aware and pure, so it runs in Node and in the browser.
 */

export interface CaseConversion {
  /** Name of the case, written in that case: "camelCase", "snake_case". */
  label: string;
  /** What "Hello World Example" looks like in this case. */
  example: string;
  convert: (text: string) => string;
}

// An apostrophe inside a word belongs to it: "don't" is one word, `dont`.
const INNER_APOSTROPHE = /(\p{L})['’](?=\p{L})/gu;
// Letters, digits and the combining marks that follow them.
const WORD_RUN = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu;
// fooBar -> foo Bar, version2Update -> version2 Update
const LOWER_THEN_UPPER = /([\p{Ll}\p{N}]\p{M}*)(\p{Lu})/gu;
// XMLHttp -> XML Http
const ACRONYM_THEN_WORD = /(\p{Lu})(\p{Lu}\p{M}*\p{Ll})/gu;

/**
 * The words of a text, in their original letter case. Anything that is not a
 * letter or digit separates words, and so does a lower-to-upper step.
 */
function splitWords(text: string): string[] {
  const runs = text.replace(INNER_APOSTROPHE, '$1').match(WORD_RUN) ?? [];

  return runs.flatMap((run) =>
    run.replace(LOWER_THEN_UPPER, '$1 $2').replace(ACRONYM_THEN_WORD, '$1 $2').split(' ')
  );
}

/** Upper-cases the first character (not the first UTF-16 unit) of a word. */
function capitalize(word: string): string {
  const [first = '', ...rest] = Array.from(word);
  return first.toUpperCase() + rest.join('').toLowerCase();
}

function toCamelCase(text: string): string {
  return splitWords(text)
    .map((word, index) => (index === 0 ? word.toLowerCase() : capitalize(word)))
    .join('');
}

function toPascalCase(text: string): string {
  return splitWords(text).map(capitalize).join('');
}

function joinLowerCase(text: string, separator: string): string {
  return splitWords(text)
    .map((word) => word.toLowerCase())
    .join(separator);
}

function toConstantCase(text: string): string {
  return splitWords(text)
    .map((word) => word.toUpperCase())
    .join('_');
}

// A word in running text: from its first letter or digit to the next space.
const PROSE_WORD = /[\p{L}\p{N}_]\S*/gu;

function toTitleCase(text: string): string {
  return text.replace(PROSE_WORD, capitalize);
}

// The first letter of the text and of everything after ". ", "! " or "? ".
// Quotes and brackets in front of it are skipped; a leading digit is left as
// the start of the sentence.
const SENTENCE_START = /(^|[.!?]\s+)([^\p{L}\p{N}]*)(\p{L})/gu;

function toSentenceCase(text: string): string {
  return text
    .toLowerCase()
    .replace(
      SENTENCE_START,
      (_match, before: string, skipped: string, letter: string) =>
        before + skipped + letter.toUpperCase()
    );
}

/** Every case the tool offers, in display order. */
export const CASE_CONVERSIONS: readonly CaseConversion[] = [
  { label: 'camelCase', example: 'helloWorldExample', convert: toCamelCase },
  { label: 'PascalCase', example: 'HelloWorldExample', convert: toPascalCase },
  {
    label: 'snake_case',
    example: 'hello_world_example',
    convert: (text) => joinLowerCase(text, '_'),
  },
  {
    label: 'kebab-case',
    example: 'hello-world-example',
    convert: (text) => joinLowerCase(text, '-'),
  },
  { label: 'UPPERCASE', example: 'HELLO WORLD EXAMPLE', convert: (text) => text.toUpperCase() },
  { label: 'lowercase', example: 'hello world example', convert: (text) => text.toLowerCase() },
  { label: 'Title Case', example: 'Hello World Example', convert: toTitleCase },
  { label: 'Sentence case', example: 'Hello world example', convert: toSentenceCase },
  {
    label: 'dot.case',
    example: 'hello.world.example',
    convert: (text) => joinLowerCase(text, '.'),
  },
  { label: 'CONSTANT_CASE', example: 'HELLO_WORLD_EXAMPLE', convert: toConstantCase },
];
