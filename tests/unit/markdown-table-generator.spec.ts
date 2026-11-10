import { test, expect } from '@playwright/test';
import {
  EXAMPLE_CSV,
  MAX_COLUMNS,
  MAX_ROWS,
  SAMPLE_TABLE,
  addColumn,
  addRow,
  clearCells,
  createTable,
  detectDelimiter,
  displayWidth,
  escapeCell,
  isBlank,
  markdownTable,
  parseDelimited,
  removeColumn,
  removeRow,
  setAlignment,
  setCell,
  tableFromRows,
  type Alignment,
  type TableData,
} from '@/lib/tools/markdown-table-generator';

// Expected values are laid out by hand from the rules in the module header.

const table = (cells: string[][], alignments: Alignment[]): TableData => ({ cells, alignments });
const padded = { pad: true, escapePipes: true };
const compact = { pad: false, escapePipes: true };

test.describe('markdownTable', () => {
  const fruit = table(
    [
      ['Name', 'Qty'],
      ['Apple', '3'],
      ['Fig', '12'],
    ],
    ['left', 'right']
  );

  test('pads columns to the widest cell and aligns the text', () => {
    expect(markdownTable(fruit, padded)).toBe(
      ['| Name  | Qty |', '| :---- | --: |', '| Apple |   3 |', '| Fig   |  12 |'].join('\n')
    );
  });

  test('without padding, cells are written as they are and the delimiter row is as short as it can be', () => {
    expect(markdownTable(fruit, compact)).toBe(
      ['| Name | Qty |', '| :-- | --: |', '| Apple | 3 |', '| Fig | 12 |'].join('\n')
    );
  });

  test('every alignment marker, with and without padding', () => {
    const all = table([['a', 'b', 'c', 'd']], ['default', 'left', 'center', 'right']);
    expect(markdownTable(all, compact)).toBe('| a | b | c | d |\n| --- | :-- | :-: | --: |');
    expect(markdownTable(all, padded)).toBe('| a   | b   |  c  |   d |\n| --- | :-- | :-: | --: |');
  });

  test('centred text puts the spare space on the right when it is odd', () => {
    expect(markdownTable(table([['a', 'bbbb']], ['center', 'center']), padded)).toBe(
      '|  a  | bbbb |\n| :-: | :--: |'
    );
    expect(markdownTable(table([['ab'], ['abcde']], ['center']), padded)).toBe(
      ['|  ab   |', '| :---: |', '| abcde |'].join('\n')
    );
  });

  test('a header only table is a table', () => {
    expect(markdownTable(table([['Name', 'Qty']], ['default', 'default']), padded)).toBe(
      '| Name | Qty |\n| ---- | --- |'
    );
  });

  test('empty cells keep their column', () => {
    expect(
      markdownTable(
        table(
          [
            ['a', ''],
            ['', 'b'],
          ],
          ['default', 'default']
        ),
        compact
      )
    ).toBe('| a |  |\n| --- | --- |\n|  | b |');
  });

  test('wide characters count double so the columns line up', () => {
    expect(markdownTable(table([['A'], ['日本語']], ['default']), padded)).toBe(
      ['| A      |', '| ------ |', '| 日本語 |'].join('\n')
    );
    expect(markdownTable(table([['Mood'], ['\u{1F600}']], ['default']), padded)).toBe(
      ['| Mood |', '| ---- |', '| \u{1F600}   |'].join('\n')
    );
    expect(markdownTable(table([['é'], ['abc']], ['default']), padded)).toBe(
      ['| é   |', '| --- |', '| abc |'].join('\n')
    );
  });

  test('the sample table the tool starts with', () => {
    expect(markdownTable(SAMPLE_TABLE, padded)).toBe(
      [
        '| Name  | Role       | Score |',
        '| :---- | ---------- | ----: |',
        '| Ada   | Engineer   |    95 |',
        '| Linus | Maintainer |    88 |',
      ].join('\n')
    );
    expect(markdownTable(SAMPLE_TABLE, compact)).toBe(
      [
        '| Name | Role | Score |',
        '| :-- | --- | --: |',
        '| Ada | Engineer | 95 |',
        '| Linus | Maintainer | 88 |',
      ].join('\n')
    );
  });

  test('a table with no text is empty', () => {
    expect(markdownTable(createTable(3, 2), padded)).toBe('');
    expect(markdownTable(table([['  ', '\n']], ['default', 'default']), padded)).toBe('');
  });
});

test.describe('escapeCell', () => {
  test('escapes pipes that are not escaped yet', () => {
    expect(escapeCell('a|b', true)).toBe('a\\|b');
    expect(escapeCell('a\\|b', true)).toBe('a\\|b');
    // Two backslashes are one escaped backslash, so the pipe after them still needs one.
    expect(escapeCell('a\\\\|b', true)).toBe('a\\\\\\|b');
    expect(escapeCell('|', true)).toBe('\\|');
    expect(escapeCell('a||b', true)).toBe('a\\|\\|b');
  });

  test('leaves pipes alone when escaping is off', () => {
    expect(escapeCell('a|b', false)).toBe('a|b');
  });

  test('trims, and turns line breaks into <br>', () => {
    expect(escapeCell('  x  ', true)).toBe('x');
    expect(escapeCell('x\ny', true)).toBe('x<br>y');
    expect(escapeCell('x\r\ny\rz', true)).toBe('x<br>y<br>z');
  });

  test('works through the table', () => {
    const t = table([['a|b'], ['1\n2']], ['default']);
    expect(markdownTable(t, compact)).toBe('| a\\|b |\n| --- |\n| 1<br>2 |');
    expect(markdownTable(t, { pad: false, escapePipes: false })).toBe(
      '| a|b |\n| --- |\n| 1<br>2 |'
    );
  });
});

test.describe('displayWidth', () => {
  test('counts columns', () => {
    expect(displayWidth('')).toBe(0);
    expect(displayWidth('abc')).toBe(3);
    expect(displayWidth('日本')).toBe(4);
    expect(displayWidth('\u{1F600}')).toBe(2);
    expect(displayWidth('\u{1F468}‍\u{1F469}‍\u{1F467}')).toBe(2);
    expect(displayWidth('é')).toBe(1);
    expect(displayWidth('é')).toBe(1);
  });
});

test.describe('editing the grid', () => {
  test('createTable makes a blank rectangle and never less than 1 by 1', () => {
    const t = createTable(2, 3);
    expect(t.cells).toEqual([
      ['', '', ''],
      ['', '', ''],
    ]);
    expect(t.alignments).toEqual(['default', 'default', 'default']);
    expect(createTable(0, 0).cells).toEqual([['']]);
  });

  test('addRow appends or inserts below the header and never touches the original', () => {
    const original = table(
      [
        ['h1', 'h2'],
        ['a', 'b'],
      ],
      ['left', 'right']
    );
    expect(addRow(original).cells).toEqual([
      ['h1', 'h2'],
      ['a', 'b'],
      ['', ''],
    ]);
    expect(addRow(original, 1).cells).toEqual([
      ['h1', 'h2'],
      ['', ''],
      ['a', 'b'],
    ]);
    expect(addRow(original, 0).cells).toEqual([
      ['h1', 'h2'],
      ['', ''],
      ['a', 'b'],
    ]);
    expect(addRow(original, 99).cells).toEqual([
      ['h1', 'h2'],
      ['a', 'b'],
      ['', ''],
    ]);
    expect(original.cells).toEqual([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
  });

  test('removeRow removes body rows only', () => {
    const t = table([['h'], ['a'], ['b']], ['default']);
    expect(removeRow(t, 1).cells).toEqual([['h'], ['b']]);
    expect(removeRow(t, 0)).toBe(t);
    expect(removeRow(t, 3)).toBe(t);
  });

  test('addColumn appends or inserts and keeps alignments in step', () => {
    const t = table(
      [
        ['a', 'b'],
        ['1', '2'],
      ],
      ['left', 'right']
    );
    const appended = addColumn(t);
    expect(appended.cells).toEqual([
      ['a', 'b', ''],
      ['1', '2', ''],
    ]);
    expect(appended.alignments).toEqual(['left', 'right', 'default']);
    const inserted = addColumn(t, 1);
    expect(inserted.cells).toEqual([
      ['a', '', 'b'],
      ['1', '', '2'],
    ]);
    expect(inserted.alignments).toEqual(['left', 'default', 'right']);
  });

  test('removeColumn keeps at least one column', () => {
    const t = table(
      [
        ['a', 'b'],
        ['1', '2'],
      ],
      ['left', 'right']
    );
    const removed = removeColumn(t, 0);
    expect(removed.cells).toEqual([['b'], ['2']]);
    expect(removed.alignments).toEqual(['right']);
    expect(removeColumn(removed, 0)).toBe(removed);
    expect(removeColumn(t, 5)).toBe(t);
  });

  test('setCell and setAlignment change one thing', () => {
    const t = table(
      [
        ['a', 'b'],
        ['1', '2'],
      ],
      ['left', 'right']
    );
    expect(setCell(t, 1, 0, 'x').cells).toEqual([
      ['a', 'b'],
      ['x', '2'],
    ]);
    expect(setCell(t, 9, 0, 'x')).toBe(t);
    expect(setCell(t, 0, 9, 'x')).toBe(t);
    expect(setAlignment(t, 0, 'center').alignments).toEqual(['center', 'right']);
    expect(setAlignment(t, 5, 'center')).toBe(t);
  });

  test('clearCells empties the text and keeps the shape', () => {
    const cleared = clearCells(SAMPLE_TABLE);
    expect(cleared.cells).toEqual([
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
    ]);
    expect(cleared.alignments).toEqual(SAMPLE_TABLE.alignments);
    expect(isBlank(cleared)).toBe(true);
    expect(isBlank(SAMPLE_TABLE)).toBe(false);
  });
});

test.describe('parseDelimited', () => {
  test('reads CSV, TSV and semicolon files', () => {
    expect(parseDelimited('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseDelimited('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseDelimited('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('an explicit delimiter wins over detection', () => {
    expect(parseDelimited('a,b;c', 'semicolon')).toEqual([['a,b', 'c']]);
    expect(parseDelimited('a,b;c', 'comma')).toEqual([['a', 'b;c']]);
  });

  test('quoted cells hold delimiters, doubled quotes and line breaks', () => {
    expect(parseDelimited('a,"b,c"\r\n"x ""y""",2')).toEqual([
      ['a', 'b,c'],
      ['x "y"', '2'],
    ]);
    expect(parseDelimited('a,"line1\nline2"\nz,y')).toEqual([
      ['a', 'line1\nline2'],
      ['z', 'y'],
    ]);
  });

  test('CRLF, CR, a BOM and blank lines', () => {
    expect(parseDelimited('﻿a,b\r\n\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseDelimited('a,b\r1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseDelimited('a,b\n,\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('short rows are padded so the result is rectangular', () => {
    expect(parseDelimited('a,b,c\n1')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', ''],
    ]);
    expect(parseDelimited('a\n1,2,3')).toEqual([
      ['a', '', ''],
      ['1', '2', '3'],
    ]);
  });

  test('keeps unicode and empty trailing cells', () => {
    expect(parseDelimited('über,\u{1F600}\n1,')).toEqual([
      ['über', '\u{1F600}'],
      ['1', ''],
    ]);
  });

  test('empty input has no rows', () => {
    expect(parseDelimited('')).toEqual([]);
    expect(parseDelimited(' \n\n ')).toEqual([]);
  });

  test('detectDelimiter looks at the first line outside quotes', () => {
    expect(detectDelimiter('a,b,c')).toBe('comma');
    expect(detectDelimiter('a;b;c')).toBe('semicolon');
    expect(detectDelimiter('a\tb')).toBe('tab');
    expect(detectDelimiter('"a;b",c')).toBe('comma');
    expect(detectDelimiter('a;b,c;d')).toBe('semicolon');
    expect(detectDelimiter('plain')).toBe('comma');
    expect(detectDelimiter('a\nb;c;d')).toBe('comma');
  });
});

test.describe('tableFromRows', () => {
  test('uses the first row as the header', () => {
    const result = tableFromRows(
      [
        [' Name ', 'Qty'],
        ['Apple', '3'],
      ],
      true
    );
    expect(result?.table.cells).toEqual([
      ['Name', 'Qty'],
      ['Apple', '3'],
    ]);
    expect(result?.table.alignments).toEqual(['default', 'default']);
    expect(result?.truncated).toBe(false);
  });

  test('without a header row, invents one', () => {
    const result = tableFromRows([['Apple', '3']], false);
    expect(result?.table.cells).toEqual([
      ['Column 1', 'Column 2'],
      ['Apple', '3'],
    ]);
  });

  test('nothing to import', () => {
    expect(tableFromRows([], true)).toBeNull();
  });

  test('limits rows and columns and says so', () => {
    const wide = [Array.from({ length: MAX_COLUMNS + 2 }, (_, i) => `c${i}`)];
    const wideResult = tableFromRows(wide, true);
    expect(wideResult?.table.alignments).toHaveLength(MAX_COLUMNS);
    expect(wideResult?.table.cells[0]).toHaveLength(MAX_COLUMNS);
    expect(wideResult?.truncated).toBe(true);

    const tall = Array.from({ length: MAX_ROWS + 5 }, (_, i) => [`r${i}`]);
    const tallResult = tableFromRows(tall, true);
    expect(tallResult?.table.cells).toHaveLength(MAX_ROWS);
    expect(tallResult?.truncated).toBe(true);
  });

  test('the example CSV becomes a table with an escaped pipe', () => {
    const result = tableFromRows(parseDelimited(EXAMPLE_CSV), true);
    expect(result).not.toBeNull();
    expect(markdownTable(result!.table, padded)).toBe(
      [
        '| Item         | Quantity | Price |',
        '| ------------ | -------- | ----- |',
        '| Apple        | 3        | 1.20  |',
        '| Fig \\| dried | 12       | 0.45  |',
      ].join('\n')
    );
  });
});
