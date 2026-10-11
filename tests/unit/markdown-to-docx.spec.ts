import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import {
  DOCX_THEME_PRESETS,
  adjustBlockSpacing,
  blockSpacing,
  carryBlockSettings,
  documentTitle,
  listLines,
  parseMarkdownBlocks,
  renderDocx,
  renderPreviewHtml,
  type DocxSettings,
  type MarkdownBlock,
} from '@/lib/tools/markdown-to-docx';

// ---------------------------------------------------------------------------
// Helpers. The exported file is unzipped and its XML read back, so the tests
// see what Word will be given rather than what the module meant to write.
// ---------------------------------------------------------------------------

const SETTINGS: DocxSettings = {
  style: DOCX_THEME_PRESETS.modern.options,
  pageSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  keepHeadingsWithNext: true,
  preventTableRowSplit: true,
  pageBreakBeforeH1: true,
  pageBreakBeforeH2: false,
  headerText: '',
  footerText: '',
  pageNumbers: null,
};

interface DocxParts {
  files: string[];
  document: string;
  relationships: string;
  header: string | null;
  footer: string | null;
}

async function exportDocx(
  markdown: string,
  overrides: Partial<DocxSettings> = {},
  adjust?: (blocks: MarkdownBlock[]) => void
): Promise<DocxParts> {
  const blocks = parseMarkdownBlocks(markdown);
  adjust?.(blocks);
  const blob = await renderDocx(blocks, { ...SETTINGS, ...overrides });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const read = async (name: string) => (await zip.file(name)?.async('string')) ?? null;

  return {
    files: Object.keys(zip.files),
    document: (await read('word/document.xml')) ?? '',
    relationships: (await read('word/_rels/document.xml.rels')) ?? '',
    header: await read('word/header1.xml'),
    footer: await read('word/footer1.xml'),
  };
}

interface XmlParagraph {
  /** The paragraph's text runs joined together. */
  text: string;
  xml: string;
}

/** Every paragraph of a document part, table cells included, in order. */
function paragraphs(xml: string): XmlParagraph[] {
  return [...xml.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)].map(([paragraph]) => ({
    xml: paragraph,
    text: [...paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join(''),
  }));
}

const paragraphWith = (xml: string, text: string): XmlParagraph => {
  const found = paragraphs(xml).find((paragraph) => paragraph.text === text);
  if (!found) throw new Error(`No paragraph reads ${JSON.stringify(text)}`);
  return found;
};

const types = (blocks: MarkdownBlock[]) => blocks.map((block) => block.type);
const lines = (markdown: string) => listLines(parseMarkdownBlocks(markdown)[0].tokens);
const summary = (markdown: string) =>
  lines(markdown).map((line) => [
    line.kind,
    line.depth,
    line.marker,
    line.inline?.content ?? line.code,
  ]);

// ---------------------------------------------------------------------------

test.describe('splitting Markdown into blocks', () => {
  test('finds headings, paragraphs, lists, code, tables and rules in order', () => {
    const blocks = parseMarkdownBlocks(
      [
        '# Title',
        '',
        'Intro **text**',
        '',
        '### Deep',
        '',
        '- a',
        '- b',
        '',
        '```js',
        'let a = 1;',
        '```',
        '',
        '| A | B |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        '---',
        '',
        '    indented code',
      ].join('\n')
    );

    expect(types(blocks)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'list',
      'code',
      'table',
      'hr',
      'code',
    ]);
    expect(blocks.map((block) => block.level)).toEqual([
      1,
      undefined,
      3,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(blocks.map((block) => block.text)).toEqual([
      'Title',
      'Intro **text**',
      'Deep',
      'a',
      'let a = 1;\n',
      'A',
      '--- (Horizontal Rule / Manual Page Break)',
      'indented code\n',
    ]);
    expect(blocks.every((block) => block.pageBreakBefore === false)).toBe(true);
  });

  test('returns nothing for empty and whitespace-only text', () => {
    expect(parseMarkdownBlocks('')).toEqual([]);
    expect(parseMarkdownBlocks('  \n\n\t\n')).toEqual([]);
  });

  test('gives every block its own id', () => {
    const blocks = parseMarkdownBlocks('---\n\n---\n\nsame\n\nsame\n');
    const again = parseMarkdownBlocks('---\n\n---\n');

    expect(new Set([...blocks, ...again].map((block) => block.id)).size).toBe(6);
  });

  test('keeps a list with a nested list as one block', () => {
    // The nested list used to end the outer one, so "third" left the list
    // and was exported as a plain paragraph.
    const blocks = parseMarkdownBlocks('- first\n- second\n  - nested\n- third\n\nafter\n');

    expect(types(blocks)).toEqual(['list', 'paragraph']);
    expect(
      blocks[0].tokens.filter((token) => token.type === 'inline').map((token) => token.content)
    ).toEqual(['first', 'second', 'nested', 'third']);
    expect(blocks[1].text).toBe('after');
  });

  test('keeps a list whose item holds a heading', () => {
    // The heading used to start a new block and throw away the list so far.
    const blocks = parseMarkdownBlocks('- one\n- ## two\n- three\n');

    expect(types(blocks)).toEqual(['list']);
    expect(lines('- one\n- ## two\n- three\n').map((line) => line.inline?.content)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  test('turns the contents of a blockquote into blocks of their own', () => {
    const blocks = parseMarkdownBlocks('> quoted\n>\n> - item\n>\n> ## Heading\n');

    expect(types(blocks)).toEqual(['paragraph', 'list', 'heading']);
    expect(blocks[2].level).toBe(2);
  });

  test('keeps the text of a raw HTML block and drops markup that has none', () => {
    const blocks = parseMarkdownBlocks(
      [
        '<h1 align="center">Raw &amp; <b>html</b> &#169;</h1>',
        '',
        '<!-- a comment -->',
        '',
        '<style>\np { color: red; }\n</style>',
        '',
        '<br>',
        '',
        'after',
      ].join('\n')
    );

    expect(blocks.map((block) => [block.type, block.text])).toEqual([
      ['paragraph', 'Raw & html ©'],
      ['paragraph', 'after'],
    ]);
  });

  test('renders the preview in the same dialect', () => {
    expect(renderPreviewHtml('# Hi\n\nline one\nline two')).toBe(
      '<h1>Hi</h1>\n<p>line one<br>\nline two</p>\n'
    );
    expect(renderPreviewHtml('')).toBe('');
  });
});

test.describe('carrying block settings across an edit', () => {
  const tune = (block: MarkdownBlock, spacingAfter: number): MarkdownBlock => ({
    ...block,
    pageBreakBefore: true,
    spacingAfter,
  });

  test('keeps id, page break and spacing of a block whose text did not change', () => {
    const before = parseMarkdownBlocks('# Title\n\nfirst\n\nsecond\n').map((block, index) =>
      index === 2 ? tune(block, 14) : block
    );
    const after = carryBlockSettings(
      before,
      parseMarkdownBlocks('# Title\n\nfirst\n\nsecond\n\nthird\n')
    );

    expect(after.map((block) => block.id).slice(0, 3)).toEqual(before.map((block) => block.id));
    expect(after[2]).toMatchObject({ text: 'second', pageBreakBefore: true, spacingAfter: 14 });
    expect(after[3]).toMatchObject({ text: 'third', pageBreakBefore: false });
    expect(after[3].spacingAfter).toBeUndefined();
  });

  test('keeps the settings of a block while its text is being typed', () => {
    const before = parseMarkdownBlocks('# Title\n\nfirst\n').map((block, index) =>
      index === 1 ? tune(block, 6) : block
    );
    const after = carryBlockSettings(before, parseMarkdownBlocks('# Title\n\nfirst and more\n'));

    expect(after[1]).toMatchObject({ id: before[1].id, text: 'first and more', spacingAfter: 6 });
  });

  test('gives a paragraph typed in front of another its own id and no borrowed settings', () => {
    // The new paragraph used to take over the id and settings of the one it
    // pushed down, which then matched by content too: two blocks, one id.
    const before = parseMarkdownBlocks('# Title\n\nalpha\n\nbeta\n').map((block, index) =>
      index === 1 ? tune(block, 20) : block
    );
    const after = carryBlockSettings(
      before,
      parseMarkdownBlocks('# Title\n\nnew\n\nalpha\n\nbeta\n')
    );

    expect(new Set(after.map((block) => block.id)).size).toBe(4);
    expect(after[1]).toMatchObject({ text: 'new', pageBreakBefore: false });
    expect(after[1].spacingAfter).toBeUndefined();
    expect(after[2]).toMatchObject({
      id: before[1].id,
      text: 'alpha',
      pageBreakBefore: true,
      spacingAfter: 20,
    });
    expect(after[3].id).toBe(before[2].id);
  });

  test('keeps blocks with the same text apart', () => {
    // Every rule has the same summary text, so both used to match the first.
    const before = parseMarkdownBlocks('---\n\ntext\n\n---\n').map((block, index) =>
      index === 2 ? tune(block, 8) : block
    );
    const after = carryBlockSettings(before, parseMarkdownBlocks('---\n\ntext!\n\n---\n'));

    expect(after.map((block) => block.id)).toEqual(before.map((block) => block.id));
    expect(after.map((block) => block.pageBreakBefore)).toEqual([false, false, true]);
  });

  test('starts afresh when nothing matches', () => {
    const before = parseMarkdownBlocks('first\n').map((block) => tune(block, 4));
    const after = carryBlockSettings(before, parseMarkdownBlocks('# Now a heading\n'));

    expect(after[0].id).not.toBe(before[0].id);
    expect(after[0].pageBreakBefore).toBe(false);
    expect(carryBlockSettings(before, [])).toEqual([]);
  });
});

test.describe('block spacing', () => {
  const style = DOCX_THEME_PRESETS.modern.options;
  const [heading, paragraph, list, code, table, rule] = parseMarkdownBlocks(
    '# Title\n\ntext\n\n- item\n\n```\ncode\n```\n\n| A |\n|---|\n| 1 |\n\n---\n'
  );

  test('falls back to the style for blocks without a setting', () => {
    expect(blockSpacing(heading, style)).toEqual({ before: 16, after: 6 });
    expect(blockSpacing(paragraph, style)).toEqual({ before: 0, after: 8 });
    expect(blockSpacing(list, style)).toEqual({ before: 0, after: 4 });
    expect(blockSpacing({ ...paragraph, spacingBefore: 12, spacingAfter: 0 }, style)).toEqual({
      before: 12,
      after: 0,
    });
  });

  test('has nothing to offer for code, tables and rules', () => {
    // Their spacing buttons used to change a number the export never read.
    expect([code, table, rule].map((block) => block.type)).toEqual(['code', 'table', 'hr']);
    expect([code, table, rule].map((block) => blockSpacing(block, style))).toEqual([
      null,
      null,
      null,
    ]);
    expect(adjustBlockSpacing(table, style, 'after', 2)).toBe(table);
  });

  test('steps on from the spacing shown, not from zero', () => {
    // The first click on a heading showing 16pt used to jump to 2pt.
    expect(adjustBlockSpacing(heading, style, 'before', 2).spacingBefore).toBe(18);
    expect(adjustBlockSpacing(heading, style, 'before', -2).spacingBefore).toBe(14);
    expect(adjustBlockSpacing(paragraph, style, 'after', 2).spacingAfter).toBe(10);
    expect(adjustBlockSpacing(list, style, 'after', -2).spacingAfter).toBe(2);
    expect(
      adjustBlockSpacing({ ...heading, spacingBefore: 30 }, style, 'before', 2).spacingBefore
    ).toBe(32);
  });

  test('changes one side only and leaves the block it was given alone', () => {
    const adjusted = adjustBlockSpacing(heading, style, 'after', 2);

    expect(adjusted).toMatchObject({ id: heading.id, spacingAfter: 8 });
    expect(adjusted.spacingBefore).toBeUndefined();
    expect(heading.spacingAfter).toBeUndefined();
  });

  test('stays between 0 and 100 points', () => {
    expect(adjustBlockSpacing(paragraph, style, 'before', -2).spacingBefore).toBe(0);
    expect(
      adjustBlockSpacing({ ...paragraph, spacingAfter: 99 }, style, 'after', 2).spacingAfter
    ).toBe(100);
  });

  test('is what the exported paragraphs are spaced by', async () => {
    const { document } = await exportDocx('# Title\n\ntext\n\n- item\n', {}, (blocks) => {
      blocks[1] = adjustBlockSpacing(blocks[1], style, 'after', 2);
    });

    expect(paragraphWith(document, 'Title').xml).toContain(
      '<w:spacing w:after="120" w:before="320"/>'
    );
    expect(paragraphWith(document, 'text').xml).toContain('w:after="200" w:before="0"');
    expect(paragraphWith(document, '•  item').xml).toContain('w:after="80" w:before="0"');
  });
});

test.describe('naming the document', () => {
  test('uses the first heading without its markup', () => {
    const blocks = parseMarkdownBlocks(
      'intro\n\n## The **bold** `code` [guide](https://example.com/a)\n\n# Later\n'
    );

    expect(documentTitle(blocks)).toBe('The bold code guide');
  });

  test('is empty without a heading', () => {
    expect(documentTitle(parseMarkdownBlocks('just text\n'))).toBe('');
    expect(documentTitle([])).toBe('');
  });
});

test.describe('flattening a list into lines', () => {
  test('marks bullet and numbered items', () => {
    expect(summary('- a\n- b\n')).toEqual([
      ['item', 0, '•', 'a'],
      ['item', 0, '•', 'b'],
    ]);
    expect(summary('1. a\n2. b\n')).toEqual([
      ['item', 0, '1.', 'a'],
      ['item', 0, '2.', 'b'],
    ]);
  });

  test('nests lists one level deeper, each with its own marker and numbering', () => {
    // Nested items used to sit on the outer level, with the outer list's
    // marker and one running number for all of them.
    expect(
      summary('1. one\n   - bullet\n     1. deep\n     2. deeper\n   - bullet two\n2. two\n')
    ).toEqual([
      ['item', 0, '1.', 'one'],
      ['item', 1, '◦', 'bullet'],
      ['item', 2, '1.', 'deep'],
      ['item', 2, '2.', 'deeper'],
      ['item', 1, '◦', 'bullet two'],
      ['item', 0, '2.', 'two'],
    ]);
  });

  test('starts numbering where the list starts', () => {
    expect(summary('5. five\n6. six\n').map((line) => line[2])).toEqual(['5.', '6.']);
  });

  test('numbers items, not paragraphs', () => {
    // A second paragraph in an item used to get the next number.
    expect(summary('1. first\n\n   more about first\n\n2. second\n')).toEqual([
      ['item', 0, '1.', 'first'],
      ['text', 0, '', 'more about first'],
      ['item', 0, '2.', 'second'],
    ]);
  });

  test('keeps a code block that sits inside an item', () => {
    // Code inside a list used to be left out of the document.
    expect(summary('1. install\n\n   ```bash\n   npm i\n   ```\n2. run\n')).toEqual([
      ['item', 0, '1.', 'install'],
      ['code', 0, '', 'npm i\n'],
      ['item', 0, '2.', 'run'],
    ]);
  });

  test('keeps the marker of an item without text', () => {
    expect(summary('1. a\n2.\n3. c\n').map((line) => [line[2], line[3]])).toEqual([
      ['1.', 'a'],
      ['2.', ''],
      ['3.', 'c'],
    ]);
  });
});

test.describe('the exported document', () => {
  test('is a .docx with the body text in order', async () => {
    const { files, document } = await exportDocx(
      '# Title\n\nHello **bold** and *soft*\nbreak.\n\n- one\n- two\n\n1. first\n'
    );

    expect(files).toContain('[Content_Types].xml');
    expect(files).toContain('word/document.xml');
    expect(paragraphs(document).map((paragraph) => paragraph.text)).toEqual([
      'Title',
      'Hello bold and softbreak.',
      '•  one',
      '•  two',
      '1.  first',
    ]);
    expect(paragraphWith(document, 'Title').xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(paragraphWith(document, 'Title').xml).toContain('<w:sz w:val="44"/>');
    expect(paragraphWith(document, 'Hello bold and softbreak.').xml).toContain('<w:br/>');
    expect(paragraphWith(document, '•  one').xml).toContain(
      '<w:ind w:left="720" w:hanging="360"/>'
    );
  });

  test('writes the header, the footer text and the page numbers', async () => {
    // They were handed to the library in the wrong place and never written.
    const { document, header, footer } = await exportDocx('# Title\n', {
      headerText: 'Project Proposal',
      footerText: 'Confidential',
      pageNumbers: 'center',
    });

    expect(document).toContain('<w:headerReference w:type="default"');
    expect(document).toContain('<w:footerReference w:type="default"');
    expect(paragraphs(header ?? '').map((paragraph) => paragraph.text)).toEqual([
      'Project Proposal',
    ]);
    expect(header).toContain('<w:jc w:val="right"/>');
    expect(paragraphs(footer ?? '').map((paragraph) => paragraph.text)).toEqual([
      'ConfidentialPage  of ',
    ]);
    expect(footer).toContain('>PAGE</w:instrText>');
    expect(footer).toContain('>NUMPAGES</w:instrText>');
  });

  test('keeps the footer text on the left and puts the page numbers where asked', async () => {
    const footerOf = async (footerText: string, pageNumbers: DocxSettings['pageNumbers']) =>
      (await exportDocx('text\n', { footerText, pageNumbers })).footer ?? '';

    // A4 with normal margins leaves 11906 - 2 * 1440 = 9026 for the text.
    const centred = await footerOf('Confidential', 'center');
    expect(centred).toContain('<w:jc w:val="left"/>');
    expect(centred).toContain('<w:tab w:val="center" w:pos="4513"/>');
    expect(centred).toContain('<w:tab/>');

    const right = await footerOf('Confidential', 'right');
    expect(right).toContain('<w:tab w:val="right" w:pos="9026"/>');

    const left = await footerOf('Confidential', 'left');
    expect(left).not.toContain('<w:tabs>');
    expect(paragraphs(left)[0].text).toBe('Confidential      Page  of ');

    const textOnly = await footerOf('Confidential', null);
    expect(textOnly).toContain('<w:jc w:val="left"/>');
    expect(textOnly).not.toContain('PAGE');

    const numbersOnly = await footerOf('', 'right');
    expect(numbersOnly).toContain('<w:jc w:val="right"/>');
    expect(paragraphs(numbersOnly)[0].text).toBe('Page  of ');
  });

  test('leaves header and footer out when there is nothing to put in them', async () => {
    const { files, document } = await exportDocx('text\n', { headerText: '  ', footerText: '' });

    expect(files.filter((file) => /header|footer/.test(file))).toEqual([]);
    expect(document).not.toContain('Reference');
  });

  test('turns the page for landscape', async () => {
    // Width and height were swapped twice, so landscape came out portrait.
    const portrait = await exportDocx('text\n', { pageSize: 'Letter' });
    const landscape = await exportDocx('text\n', { pageSize: 'Letter', orientation: 'landscape' });
    const a4 = await exportDocx('text\n', { orientation: 'landscape', margins: 'wide' });

    expect(portrait.document).toContain('<w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>');
    expect(landscape.document).toContain('<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>');
    expect(a4.document).toContain('<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>');
    expect(a4.document).toContain('w:left="2160"');
  });

  test('breaks the page before level 1 headings, but not at the top', async () => {
    const { document } = await exportDocx('# One\n\ntext\n\n# Two\n\n## Sub\n\n# Three\n');
    const breaks = paragraphs(document).map((paragraph) => [
      paragraph.text,
      paragraph.xml.includes('<w:pageBreakBefore/>'),
    ]);

    expect(breaks).toEqual([
      ['One', false],
      ['text', false],
      ['Two', true],
      ['Sub', false],
      ['Three', true],
    ]);
  });

  test('breaks the page at a rule and before a block that asks for it', async () => {
    const { document } = await exportDocx(
      'first\n\n---\n\n# After rule\n\nmanual\n',
      {},
      (blocks) => {
        blocks[3].pageBreakBefore = true;
        blocks[3].spacingBefore = 10;
      }
    );
    const all = paragraphs(document);

    expect(all[1].xml).toContain('<w:br w:type="page"/>');
    // The rule already started a page, so the heading does not start another.
    expect(all[2].xml).not.toContain('<w:pageBreakBefore/>');
    expect(all[3].text).toBe('manual');
    expect(all[3].xml).toContain('<w:pageBreakBefore/>');
    expect(all[3].xml).toContain('w:before="200"');
  });

  test('indents nested list items under their parents', async () => {
    const { document } = await exportDocx('- a\n  1. b\n     - c\n- d\n\n  more d\n');

    expect(paragraphWith(document, '•  a').xml).toContain('<w:ind w:left="720" w:hanging="360"/>');
    expect(paragraphWith(document, '1.  b').xml).toContain(
      '<w:ind w:left="1080" w:hanging="360"/>'
    );
    expect(paragraphWith(document, '▪  c').xml).toContain('<w:ind w:left="1440" w:hanging="360"/>');
    expect(paragraphWith(document, '•  d').xml).toContain('<w:ind w:left="720" w:hanging="360"/>');
    expect(paragraphWith(document, 'more d').xml).toContain('<w:ind w:left="720"/>');
  });

  test('writes code from inside a list in the code font', async () => {
    const { document } = await exportDocx('1. install\n\n   ```\n   npm i\n   ```\n');
    const code = paragraphWith(document, 'npm i');

    expect(code.xml).toContain('w:ascii="Consolas"');
    expect(code.xml).toContain('<w:ind w:left="720"/>');
  });

  test('makes links clickable', async () => {
    // Links were coloured and underlined but led nowhere.
    const { document, relationships } = await exportDocx(
      'See [the docs](https://example.com/a?b=1&c=2), https://auto.link and [here](./local.md).\n'
    );

    expect(document.match(/<w:hyperlink /g)).toHaveLength(2);
    expect(relationships).toContain(
      'Target="https://example.com/a?b=1&amp;c=2" TargetMode="External"'
    );
    expect(relationships).toContain('Target="https://auto.link" TargetMode="External"');
    // A relative link cannot be opened from Word; it keeps the look only.
    expect(relationships).not.toContain('local.md');
    expect(paragraphs(document)[0].text).toBe('See the docs, https://auto.link and here.');
    expect(document.match(/<w:color w:val="0563C1"\/>/g)).toHaveLength(3);
  });

  test('shades inline code with its fill colour', async () => {
    const { document } = await exportDocx('Run `npm test` now.\n');

    expect(document).toContain('<w:shd w:fill="F3F4F6" w:color="auto" w:val="clear"/>');
    expect(document).not.toContain('w:val="solid"');
  });

  test('keeps strikethrough, image descriptions and raw HTML text', async () => {
    const { document } = await exportDocx(
      '~~old~~ new ![Diagram](d.png)\n\n<div align="center">Raw &amp; <b>html</b></div>\n'
    );

    expect(paragraphs(document).map((paragraph) => paragraph.text)).toEqual([
      'old new Diagram',
      'Raw &amp; html',
    ]);
    expect(document.match(/<w:strike\/>/g)).toHaveLength(1);
  });

  test('lays out tables with header, alignment and line breaks', async () => {
    const { document } = await exportDocx(
      '| Left | Mid | Right |\n|:-----|:---:|------:|\n| a<br>b | c | d |\n'
    );
    const cells = paragraphs(document);

    expect(cells.map((cell) => cell.text)).toEqual(['Left', 'Mid', 'Right', 'ab', 'c', 'd']);
    expect(cells.map((cell) => /<w:jc w:val="(\w+)"\/>/.exec(cell.xml)?.[1])).toEqual([
      'left',
      'center',
      'right',
      'left',
      'center',
      'right',
    ]);
    expect(cells[3].xml).toContain('<w:br/>');
    expect(document.match(/<w:tblHeader\/>/g)).toHaveLength(1);
    expect(document.match(/<w:cantSplit\/>/g)).toHaveLength(2);
  });

  test('wraps a code block in a one-cell table, one paragraph per line', async () => {
    const { document } = await exportDocx('```js\nconst a = 1;\n\n  indented();\n```\n');

    expect(paragraphs(document).map((paragraph) => paragraph.text)).toEqual([
      'const a = 1;',
      '',
      '  indented();',
    ]);
    expect(document).toContain('<w:shd w:fill="F3F4F6"/>');
    expect(document.match(/<w:tbl>/g)).toHaveLength(1);
  });

  test('leaves out characters that would make the file unreadable', async () => {
    // Word refuses a document with a control character in it.
    const { document, header, footer } = await exportDocx(
      'A\u0001B\u000bC\u000cD 😀 tab\there\n\n```\ncode\u0002line\n```\n',
      { headerText: 'Head\u0003er', footerText: 'Foot\u0004er' }
    );

    expect(paragraphs(document).map((paragraph) => paragraph.text)).toEqual([
      'ABCD 😀 tab\there',
      'codeline',
    ]);
    for (const part of [document, header ?? '', footer ?? '']) {
      expect(part).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
    }
    expect(paragraphs(header ?? '')[0].text).toBe('Header');
    expect(paragraphs(footer ?? '')[0].text).toBe('Footer');
  });

  test('uses the chosen style', async () => {
    const { document } = await exportDocx('# Title\n\ntext\n', {
      style: DOCX_THEME_PRESETS.academic.options,
    });

    expect(paragraphWith(document, 'Title').xml).toContain('<w:sz w:val="36"/>');
    expect(paragraphWith(document, 'text').xml).toContain('w:ascii="Times New Roman"');
    expect(paragraphWith(document, 'text').xml).toContain('w:line="480"');
  });

  test('writes every measure as a whole number', async () => {
    // The file format has no fractions for these, whatever the style holds:
    // 1.333 lines are 319.92 units and 7.33 points are 146.6.
    const { document } = await exportDocx('# Title\n\ntext\n\n- item\n\n`code`\n', {
      style: {
        ...DOCX_THEME_PRESETS.elegant.options,
        bodyLineSpacing: 1.333,
        paragraphSpacingAfter: 7.33,
        headingSpacingBefore: 4.17,
      },
    });
    const measures = [
      ...document.matchAll(/w:(?:line|before|after|sz|szCs)(?:="| w:val=")([^"]+)"/g),
    ].map((match) => match[1]);

    expect(measures.length).toBeGreaterThan(10);
    expect(measures.filter((value) => !/^\d+$/.test(value))).toEqual([]);
    expect(paragraphWith(document, 'text').xml).toContain('w:line="320"');
    expect(paragraphWith(document, 'text').xml).toContain('w:after="147"');
    expect(paragraphWith(document, 'Title').xml).toContain('w:before="83"');
  });

  test('builds an empty document from no blocks', async () => {
    const { document } = await exportDocx('');

    expect(paragraphs(document)).toEqual([]);
    expect(document).toContain('<w:sectPr>');
  });
});
