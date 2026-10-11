import { test, expect } from '@playwright/test';
import { htmlToMarkdown, htmlToPlainText, type MarkupNode } from '@/lib/tools/html-converter';

// ---------------------------------------------------------------------------
// Helpers. The converters read a parsed tree, so the tests build one by hand:
// `h('p', 'Hello ', h('b', 'world'))` stands for `<p>Hello <b>world</b></p>`.
// A plain object as the second argument holds the element's attributes.
// ---------------------------------------------------------------------------

type Child = MarkupNode | string;
type Attributes = Record<string, string>;

const text = (value: string): MarkupNode => ({
  nodeType: 3,
  nodeName: '#text',
  nodeValue: value,
  childNodes: [],
});

const comment = (value: string): MarkupNode => ({
  nodeType: 8,
  nodeName: '#comment',
  nodeValue: value,
  childNodes: [],
});

const isAttributes = (value: Attributes | Child | undefined): value is Attributes =>
  typeof value === 'object' && value !== null && !('nodeType' in value);

function h(tag: string, ...rest: (Attributes | Child)[]): MarkupNode {
  const [first, ...others] = rest;
  const attributes = isAttributes(first) ? first : {};
  const children = (isAttributes(first) ? others : rest) as Child[];

  return {
    nodeType: 1,
    nodeName: tag.toUpperCase(),
    nodeValue: null,
    childNodes: children.map((child) => (typeof child === 'string' ? text(child) : child)),
    getAttribute: (name) => attributes[name] ?? null,
  };
}

const markdown = (...children: Child[]) => htmlToMarkdown(h('body', ...children));
const plain = (...children: Child[]) => htmlToPlainText(h('body', ...children));

// The tool's sample document, with the line breaks and indentation its source has.
const sample = h(
  'body',
  h(
    'article',
    '\n  ',
    h('h1', 'Release Notes'),
    '\n  ',
    h(
      'p',
      'This example document can be exported as ',
      h('strong', 'PDF'),
      ', Markdown, HTML, or plain text.'
    ),
    '\n\n  ',
    h('h2', 'Highlights'),
    '\n  ',
    h(
      'ul',
      '\n    ',
      h('li', 'Client-side conversion'),
      '\n    ',
      h('li', 'Custom PDF page setup'),
      '\n    ',
      h('li', 'Optional print CSS support'),
      '\n  '
    ),
    '\n\n  ',
    h('blockquote', '\n    ', h('p', 'Use the print CSS box to tune spacing.'), '\n  '),
    '\n\n  ',
    h('h2', 'Table'),
    '\n  ',
    h(
      'table',
      '\n    ',
      h('thead', '\n      ', h('tr', h('th', 'Area'), h('th', 'Status')), '\n    '),
      '\n    ',
      h(
        'tbody',
        '\n      ',
        h('tr', h('td', 'Preview'), h('td', 'Ready')),
        '\n      ',
        h('tr', h('td', 'Export'), h('td', 'Ready')),
        '\n    '
      ),
      '\n  '
    ),
    '\n'
  )
);

// ---------------------------------------------------------------------------

test.describe('HTML to Markdown', () => {
  test('converts the sample document', () => {
    expect(htmlToMarkdown(sample)).toBe(
      [
        '# Release Notes',
        '',
        'This example document can be exported as **PDF**, Markdown, HTML, or plain text.',
        '',
        '## Highlights',
        '',
        '- Client-side conversion',
        '- Custom PDF page setup',
        '- Optional print CSS support',
        '',
        '> Use the print CSS box to tune spacing.',
        '',
        '## Table',
        '',
        '| Area | Status |',
        '| --- | --- |',
        '| Preview | Ready |',
        '| Export | Ready |',
      ].join('\n')
    );
  });

  test('is empty for a tree without text', () => {
    expect(markdown()).toBe('');
    expect(markdown('  \n ', h('div', h('p', ' '), h('br')), comment('note'))).toBe('');
  });

  test('writes every heading level and collapses its whitespace', () => {
    expect(
      markdown(
        h('h1', 'One'),
        h('h2', '  Two\n  words '),
        h('h3', 'Three'),
        h('h4', 'Four'),
        h('h5', 'Five'),
        h('h6', 'Six'),
        h('h2', ' ')
      )
    ).toBe('# One\n\n## Two words\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six');
  });

  test('keeps links, code and line breaks inside a heading', () => {
    // Headings used to be reduced to their bare text, which dropped the
    // address of a link and ran the two sides of a <br> together.
    expect(
      markdown(
        h('h2', h('a', { href: '/guide' }, 'Guide'), ' to ', h('code', 'fetch')),
        h('h1', 'Title', h('br'), 'Subtitle')
      )
    ).toBe('## [Guide](/guide) to `fetch`\n\n# Title Subtitle');
  });

  test('keeps text and inline elements in a container together as one paragraph', () => {
    // Every inline element in a <div> used to become a paragraph of its own
    // and lose its formatting and its link address.
    expect(
      markdown(
        h(
          'div',
          'Hello ',
          h('strong', 'world'),
          ', see ',
          h('a', { href: 'https://example.com' }, 'the docs'),
          '.'
        ),
        h('section', h('em', 'one'), ' two', h('p', 'three'), 'four ', h('span', 'five'))
      )
    ).toBe(
      'Hello **world**, see [the docs](https://example.com).\n\n*one* two\n\nthree\n\nfour five'
    );
  });

  test('moves the spaces at the ends of emphasis outside the marks', () => {
    // `<b>bold </b>text` used to lose its space and read "**bold**text".
    expect(markdown(h('p', h('b', 'bold '), 'text', h('i', ' italic'), ' end'))).toBe(
      '**bold** text *italic* end'
    );
    expect(markdown(h('p', 'a', h('strong', ' '), 'b', h('em'), 'c'))).toBe('a bc');
    expect(markdown(h('p', h('strong', h('em', 'both'))))).toBe('***both***');
    expect(markdown(h('p', h('del', 'old'), ' ', h('s', 'gone'), ' new'))).toBe(
      '~~old~~ ~~gone~~ new'
    );
  });

  test('writes links, with or without text', () => {
    expect(
      markdown(
        h('p', h('a', { href: 'https://example.com' }, ' spaced '), 'after'),
        h('p', h('a', { href: 'https://example.com/empty' })),
        h('p', h('a', 'no address')),
        h('p', h('a', { href: 'my file (1).pdf' }, 'file'))
      )
    ).toBe(
      [
        '[spaced](https://example.com) after',
        '[https://example.com/empty](https://example.com/empty)',
        'no address',
        '[file](<my file (1).pdf>)',
      ].join('\n\n')
    );
  });

  test('keeps images', () => {
    // Images used to vanish from the Markdown.
    expect(
      markdown(
        h('p', h('img', { src: 'logo.png', alt: 'Logo' })),
        h('p', 'Inline ', h('img', { src: 'a b.png', alt: '' }), ' picture'),
        h('a', { href: '/home' }, h('img', { src: 'home.png', alt: 'Home' })),
        h('p', h('img', { alt: 'no source' }))
      )
    ).toBe(
      [
        '![Logo](logo.png)',
        'Inline ![](<a b.png>) picture',
        '[![Home](home.png)](/home)',
        'no source',
      ].join('\n\n')
    );
  });

  test('turns <br> into a hard line break', () => {
    expect(markdown(h('p', 'line one', h('br'), '\n  line two'))).toBe('line one  \nline two');
    expect(markdown(h('p', 'one', h('br'), h('br'), 'two'))).toBe('one\n\ntwo');
    expect(markdown(h('p', h('br'), 'only', h('br')))).toBe('only');
  });

  test('writes inline code, whatever it contains', () => {
    expect(markdown(h('p', 'Use ', h('code', 'npm  run\n build'), ' now'))).toBe(
      'Use `npm run build` now'
    );
    expect(markdown(h('p', h('code', 'a `tick` b')))).toBe('``a `tick` b``');
    expect(markdown(h('p', h('code', '`edge`')))).toBe('`` `edge` ``');
    expect(markdown(h('p', 'x', h('code', ' '), 'y'))).toBe('xy');
  });

  test('nests lists', () => {
    // A list inside an item used to be flattened into the item's own line.
    expect(
      markdown(
        h(
          'ul',
          h(
            'li',
            'Fruit',
            h('ul', h('li', 'Apple'), h('li', 'Pear', h('ol', h('li', 'Conference'))))
          ),
          h('li', 'Veg')
        )
      )
    ).toBe('- Fruit\n  - Apple\n  - Pear\n    1. Conference\n- Veg');
  });

  test('numbers ordered lists from their start value', () => {
    expect(markdown(h('ol', h('li', 'one'), h('li', 'two')))).toBe('1. one\n2. two');
    expect(
      markdown(h('ol', { start: '9' }, h('li', 'nine'), h('li', 'ten', h('ul', h('li', 'sub')))))
    ).toBe('9. nine\n10. ten\n    - sub');
  });

  test('keeps formatting, paragraphs and code inside a list item', () => {
    expect(
      markdown(
        h(
          'ul',
          h('li', h('strong', 'Bold'), ' and ', h('a', { href: '/x' }, 'link')),
          h('li', h('p', 'First paragraph'), h('p', 'Second paragraph')),
          h('li', 'Run:', h('pre', h('code', 'npm i'))),
          h('li')
        )
      )
    ).toBe(
      [
        '- **Bold** and [link](/x)',
        '- First paragraph',
        '',
        '  Second paragraph',
        '- Run:',
        '',
        '  ```',
        '  npm i',
        '  ```',
        '-',
      ].join('\n')
    );
  });

  test('indents a list that sits straight inside another list', () => {
    expect(markdown(h('ul', h('li', 'a'), h('ul', h('li', 'b')), h('li', 'c')))).toBe(
      '- a\n  - b\n- c'
    );
  });

  test('fences code blocks and keeps their text as written', () => {
    // The first line used to lose its indent, and three blank lines in a row
    // used to be cut down to one.
    expect(markdown(h('pre', '\n    indented first\nsecond\n\n\n\nafter gap\n'))).toBe(
      '```\n    indented first\nsecond\n\n\n\nafter gap\n```'
    );
    expect(markdown(h('pre', h('code', { class: 'hljs language-ts' }, 'const a = 1;')))).toBe(
      '```ts\nconst a = 1;\n```'
    );
    expect(markdown(h('pre', { class: 'lang-bash' }, 'echo hi', h('br'), 'echo bye'))).toBe(
      '```bash\necho hi\necho bye\n```'
    );
    expect(markdown(h('pre', 'a\n```\nb'))).toBe('````\na\n```\nb\n````');
    expect(markdown(h('pre', '  \n'))).toBe('');
  });

  test('quotes every line of a blockquote', () => {
    expect(
      markdown(
        h('blockquote', h('p', 'first', h('br'), 'second'), h('ul', h('li', 'item')), 'loose text')
      )
    ).toBe('> first  \n> second\n>\n> - item\n>\n> loose text');
    expect(markdown(h('blockquote', ' '))).toBe('');
  });

  test('writes tables with the first row as the header', () => {
    expect(
      markdown(
        h(
          'table',
          h('caption', 'Prices'),
          h('tr', h('td', 'Item'), h('td', 'Price'), h('td', 'Note')),
          h('tr', h('td', 'Tea'), h('td', '2')),
          h('tr')
        )
      )
    ).toBe(
      [
        'Prices',
        '',
        '| Item | Price | Note |',
        '| --- | --- | --- |',
        '| Tea | 2 |  |',
        '|  |  |  |',
      ].join('\n')
    );
    expect(markdown(h('table'))).toBe('');
  });

  test('keeps formatting inside table cells and escapes what would break them', () => {
    // Cells used to be reduced to their bare text: links lost their address
    // and the two sides of a <br> ran together.
    expect(
      markdown(
        h(
          'table',
          h('tr', h('th', 'Name'), h('th', 'Value')),
          h(
            'tr',
            h('td', h('a', { href: '/docs' }, 'Docs')),
            h('td', h('strong', 'bold'), ' and ', h('code', 'a|b'))
          ),
          h('tr', h('td', 'Line one', h('br'), 'Line two'), h('td', 'a|b *star* snake_case')),
          h('tr', h('td', h('p', 'one'), h('p', 'two')), h('td', 'v1.0-beta (new)'))
        )
      )
    ).toBe(
      [
        '| Name | Value |',
        '| --- | --- |',
        '| [Docs](/docs) | **bold** and `a\\|b` |',
        '| Line one<br>Line two | a\\|b \\*star\\* snake\\_case |',
        '| one two | v1.0-beta (new) |',
      ].join('\n')
    );
  });

  test('keeps a table inside a cell out of the outer table', () => {
    const inner = h('table', h('tr', h('td', 'inner')));

    expect(markdown(h('table', h('tr', h('td', 'outer'), h('td', inner))))).toBe(
      '| outer | inner |\n| --- | --- |'
    );
  });

  test('leaves out scripts, styles and comments', () => {
    expect(
      markdown(
        h('style', 'p { color: red; }'),
        h('p', 'Shown', h('script', 'alert(1)'), comment('hidden')),
        h('div', h('script', 'track()'), 'Also shown'),
        h('template', h('p', 'not rendered'))
      )
    ).toBe('Shown\n\nAlso shown');
  });

  test('escapes text that reads like a tag or an entity', () => {
    expect(markdown(h('p', 'Use the <br> tag, not </p> or &nbsp; when 1 < 2 & x<y'))).toBe(
      'Use the \\<br> tag, not \\</p> or \\&nbsp; when 1 < 2 & x\\<y'
    );
  });

  test('writes a rule and keeps unknown elements', () => {
    expect(
      markdown(h('p', 'above'), h('hr'), h('my-card', h('h2', 'Card'), h('span', 'body')))
    ).toBe('above\n\n---\n\n## Card\n\nbody');
  });

  test('reads lower-case tag names', () => {
    const lower: MarkupNode = { ...h('p', 'x'), nodeName: 'p' };
    const heading: MarkupNode = { ...h('h2', 'Title'), nodeName: 'h2' };

    expect(htmlToMarkdown(h('body', heading, lower))).toBe('## Title\n\nx');
  });
});

test.describe('HTML to plain text', () => {
  test('converts the sample document', () => {
    // The old output ran table cells together ("AreaStatus") and kept the
    // indentation of the HTML source.
    expect(htmlToPlainText(sample)).toBe(
      [
        'Release Notes',
        '',
        'This example document can be exported as PDF, Markdown, HTML, or plain text.',
        '',
        'Highlights',
        '',
        '- Client-side conversion',
        '- Custom PDF page setup',
        '- Optional print CSS support',
        '',
        'Use the print CSS box to tune spacing.',
        '',
        'Table',
        '',
        'Area\tStatus',
        'Preview\tReady',
        'Export\tReady',
      ].join('\n')
    );
  });

  test('is empty for a tree without text', () => {
    expect(plain()).toBe('');
    expect(plain(' ', h('div', h('p')), h('hr'))).toBe('');
  });

  test('keeps neighbouring blocks apart', () => {
    // Without white space between the tags this used to read "TitleFirstSecond".
    expect(plain(h('h1', 'Title'), h('p', 'First'), h('div', 'Second'))).toBe(
      'Title\n\nFirst\n\nSecond'
    );
  });

  test('leaves out scripts and styles', () => {
    // Their source used to be part of the text.
    expect(
      plain(
        h('style', 'body { margin: 0; }'),
        h('p', 'Visible'),
        h('script', 'window.dataLayer = [];'),
        h('div', 'Also visible', h('script', { type: 'application/ld+json' }, '{"a":1}'))
      )
    ).toBe('Visible\n\nAlso visible');
  });

  test('drops the markup and keeps the words', () => {
    expect(
      plain(
        h(
          'p',
          h('strong', 'Bold'),
          ', ',
          h('em', 'italic'),
          ', ',
          h('code', 'code'),
          ', ',
          h('a', { href: 'https://example.com' }, 'link'),
          ', ',
          h('a', { href: 'https://example.com/bare' }),
          ' and ',
          h('img', { src: 'p.png', alt: 'a picture' }),
          ' <not a tag> *'
        )
      )
    ).toBe('Bold, italic, code, link, https://example.com/bare and a picture <not a tag> *');
  });

  test('breaks lines at <br> and keeps code as written', () => {
    expect(plain(h('p', 'one', h('br'), 'two'), h('pre', '  indented\n\n\nlast\n'))).toBe(
      'one\ntwo\n\n  indented\n\n\nlast'
    );
  });

  test('marks and nests list items', () => {
    expect(
      plain(
        h('ol', { start: '3' }, h('li', 'three', h('ul', h('li', 'sub'))), h('li', 'four')),
        h('blockquote', 'quoted')
      )
    ).toBe('3. three\n   - sub\n4. four\n\nquoted');
  });

  test('separates table cells with tabs', () => {
    expect(
      plain(
        h(
          'table',
          h('tr', h('th', 'A'), h('th', 'B|C')),
          h('tr', h('td', 'one', h('br'), 'two'), h('td'))
        )
      )
    ).toBe('A\tB|C\none two\t');
  });
});
