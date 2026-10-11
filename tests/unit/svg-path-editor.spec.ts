import { test, expect } from '@playwright/test';
import {
  buildPathSvg,
  inspectPath,
  isValidViewBox,
  optimizePath,
  parsePath,
} from '@/lib/tools/svg-path-editor';

const SQUARE = 'M 10 10 H 90 V 90 H 10 L 10 10';

/** The numbers a path draws with, so two spellings can be compared by value. */
const values = (pathData: string) =>
  parsePath(pathData).segments.map(({ command, args }) => [command, ...args.map(Number)]);

test.describe('parsePath', () => {
  test('splits path data into commands and their numbers', () => {
    expect(parsePath(SQUARE)).toEqual({
      error: '',
      segments: [
        { command: 'M', args: ['10', '10'] },
        { command: 'H', args: ['90'] },
        { command: 'V', args: ['90'] },
        { command: 'H', args: ['10'] },
        { command: 'L', args: ['10', '10'] },
      ],
    });
  });

  test('reads numbers that run together', () => {
    expect(parsePath('M10-20.5.5 1e2')).toEqual({
      error: '',
      segments: [{ command: 'M', args: ['10', '-20.5', '.5', '1e2'] }],
    });
    expect(parsePath('M10-20.5l1e2-3E-1z')).toEqual({
      error: '',
      segments: [
        { command: 'M', args: ['10', '-20.5'] },
        { command: 'l', args: ['1e2', '-3E-1'] },
        { command: 'z', args: [] },
      ],
    });
  });

  test('keeps repeated groups under one command', () => {
    expect(parsePath('M0 0 10 10 20 0').segments).toEqual([
      { command: 'M', args: ['0', '0', '10', '10', '20', '0'] },
    ]);
  });

  test('accepts commas, tabs and line breaks between numbers', () => {
    expect(parsePath('M 1,2\n\tL3 , 4\r\nz').error).toBe('');
  });

  test('reads arc flags written without separators', () => {
    expect(parsePath('M0 0a5 5 0 0110 10').segments[1]).toEqual({
      command: 'a',
      args: ['5', '5', '0', '0', '1', '10', '10'],
    });
  });

  test('treats nothing at all as a path with no commands', () => {
    expect(parsePath('')).toEqual({ segments: [], error: '' });
    expect(parsePath(' \n\t ')).toEqual({ segments: [], error: '' });
  });

  test('explains what is wrong with path data it cannot read', () => {
    // Defect: nothing was ever rejected, so plain prose was "analysed" as
    // commands (the h and two l of "hello" counted as three).
    expect(parsePath('hello world').error).toBe('Path data must start with a move command (M or m).');
    expect(parsePath('10 10 L 5 5').error).toBe('Expected a command letter but found "1" at character 1.');
    expect(parsePath('L 10 10').error).toBe('Path data must start with a move command (M or m).');
    expect(parsePath('M 10 10 L 20').error).toBe(
      'Command "L" at character 9 takes 2 numbers at a time, but has 1.'
    );
    expect(parsePath('M 10 10 L').error).toBe('Command "L" at character 9 needs 2 numbers.');
    expect(parsePath('M 10 10 H').error).toBe('Command "H" at character 9 needs 1 number.');
    expect(parsePath('M 10 10 X 5').error).toBe('Expected a number but found "X" at character 9.');
    expect(parsePath('M 10 10 Z 5').error).toBe('Expected a command letter but found "5" at character 11.');
    expect(parsePath('M 10 10,').error).toBe(
      'Expected a number after the comma but found the end of the path.'
    );
    expect(parsePath('M 10. 20').error).toBe('Expected a number but found "." at character 5.');
    expect(parsePath('M0 0A5 5 0 2 1 10 10').error).toBe(
      'Arc flags must be 0 or 1, but found "2" at character 12.'
    );
  });

  test('names an emoji whole in the message', () => {
    expect(parsePath('M 1 1 😀').error).toBe('Expected a number but found "😀" at character 7.');
  });

  test('returns the segments read before the problem', () => {
    expect(parsePath('M 10 10 H 5 L 20').segments).toEqual([
      { command: 'M', args: ['10', '10'] },
      { command: 'H', args: ['5'] },
    ]);
  });
});

test.describe('optimizePath', () => {
  test('drops optional whitespace', () => {
    expect(optimizePath(SQUARE)).toBe('M10 10H90V90H10L10 10');
  });

  test('keeps decimal points', () => {
    // Defect: the old clean-up deleted every decimal point, so this path came
    // out as "M105 2025 L05 75" and drew something else entirely.
    expect(optimizePath('M 10.5 20.25 L 0.5 0.75')).toBe('M10.5 20.25L.5.75');
    expect(values(optimizePath('M 10.5 20.25 L 0.5 0.75'))).toEqual(values('M 10.5 20.25 L 0.5 0.75'));
  });

  test('never leaves a dangling decimal point', () => {
    // Defect: "10.0" became "10.", which is not a number in the SVG 2 path
    // grammar (a decimal point must be followed by a digit).
    expect(optimizePath('M 10.0 20.0 L 30.50 40')).toBe('M10 20L30.5 40');
    expect(optimizePath('M 1.0,2.0 L 100 200')).toBe('M1 2L100 200');
  });

  test('shortens each number to its smallest spelling', () => {
    expect(optimizePath('M 007 +5 L 0.0 -0.50 1.250e+02 1e0')).toBe('M7 5L0-.5 1.25e2 1');
    expect(optimizePath('M 20.05 100 L -0 0.000')).toBe('M20.05 100L0 0');
  });

  test('uses a minus sign or a second decimal point as the separator', () => {
    expect(optimizePath('M 10 -5 L 1.5 0.5 3 0.5')).toBe('M10-5L1.5.5 3 .5');
  });

  test('keeps arc flags apart, as most tools expect', () => {
    expect(optimizePath('M 0 0 A 5 5 0 0 1 10 10')).toBe('M0 0A5 5 0 0 1 10 10');
  });

  test('keeps the letters and their case', () => {
    expect(optimizePath('m 1 1 l 2 2 Z')).toBe('m1 1l2 2Z');
  });

  test('draws the same shape before and after', () => {
    for (const pathData of [
      SQUARE,
      'M 0.5,0.25 C 1.0 2.0, 3.50 4.05, 5 6 S 7 8 9 10 Q 1 2 3 4 T 5 6 Z',
      'm -1.5 -2.5 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0 z',
      'M1e3 2E-2L+3 -4',
    ]) {
      expect(values(optimizePath(pathData)), pathData).toEqual(values(pathData));
    }
  });

  test('is stable when applied twice', () => {
    const once = optimizePath('M 10.50 20.0 L 0.5 0.75 Z');
    expect(optimizePath(once)).toBe(once);
  });

  test('never returns something longer than the input', () => {
    // Compact arc flags cannot be written shorter with separators in place.
    expect(optimizePath('M0 0a5 5 0 0110 10')).toBe('M0 0a5 5 0 0110 10');
    expect(optimizePath('  M0 0L1 1  ')).toBe('M0 0L1 1');
  });

  test('returns nothing for path data it cannot read', () => {
    expect(optimizePath('M 10 10 L 20')).toBe('');
    expect(optimizePath('not a path')).toBe('');
    expect(optimizePath('')).toBe('');
  });
});

test.describe('inspectPath', () => {
  test('summarises a valid path', () => {
    expect(inspectPath(SQUARE)).toEqual({
      empty: false,
      error: '',
      analysis: { commandCount: 5, length: 30, commands: { M: 1, H: 2, V: 1, L: 1 } },
      optimized: 'M10 10H90V90H10L10 10',
      savingsPercent: '30.0',
    });
  });

  test('counts relative and absolute commands together', () => {
    expect(inspectPath('M0 0l1 1L2 2z').analysis?.commands).toEqual({ M: 1, L: 2, Z: 1 });
  });

  test('treats empty and whitespace-only input as nothing to show', () => {
    // Defect: a few spaces counted as a path, with a preview and a download.
    for (const pathData of ['', '   ', '\n\t']) {
      expect(inspectPath(pathData), JSON.stringify(pathData)).toEqual({
        empty: true,
        error: '',
        analysis: null,
        optimized: '',
        savingsPercent: '0',
      });
    }
  });

  test('reports a broken path with no optimised version', () => {
    const inspection = inspectPath('M 10 10 L 20');

    expect(inspection.error).toBe('Command "L" at character 9 takes 2 numbers at a time, but has 1.');
    expect(inspection.optimized).toBe('');
    expect(inspection.savingsPercent).toBe('0.0');
    expect(inspection.analysis).toEqual({ commandCount: 1, length: 12, commands: { M: 1 } });
  });

  test('reports no saving for a path that is already minimal', () => {
    expect(inspectPath('M0 0L1 1').savingsPercent).toBe('0.0');
  });
});

test.describe('isValidViewBox', () => {
  test('accepts four numbers separated by spaces or commas', () => {
    expect(isValidViewBox('0 0 100 100')).toBe(true);
    expect(isValidViewBox(' -10,-10,20.5,1e2 ')).toBe(true);
    expect(isValidViewBox('0 0 0 0')).toBe(true);
  });

  test('rejects anything else', () => {
    for (const viewBox of ['', '0 0 100', '0 0 100 100 5', '0 0 -1 100', '0 0 100 -1', 'a b c d', '0 0 100 100px']) {
      expect(isValidViewBox(viewBox), viewBox).toBe(false);
    }
  });
});

test.describe('buildPathSvg', () => {
  const options = {
    pathData: SQUARE,
    viewBox: '0 0 100 100',
    stroke: '#000000',
    strokeWidth: '2',
    fill: 'none',
  };

  test('wraps the path in a standalone SVG', () => {
    expect(buildPathSvg(options)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n' +
        '  <path d="M 10 10 H 90 V 90 H 10 L 10 10" stroke="#000000" stroke-width="2" fill="none"/>\n' +
        '</svg>'
    );
  });

  test('escapes characters that would break the markup', () => {
    // Defect: values were pasted in raw, so a quote ended the attribute early.
    const svg = buildPathSvg({ ...options, stroke: 'red" onload="x', fill: 'url(#a&b)<>' });

    expect(svg).toContain('stroke="red&quot; onload=&quot;x"');
    expect(svg).toContain('fill="url(#a&amp;b)&lt;&gt;"');
    expect(svg.match(/"/g)).toHaveLength(12);
  });

  test('leaves out blank fields and an unusable viewBox', () => {
    expect(buildPathSvg({ ...options, viewBox: '0 0 100', stroke: ' ', strokeWidth: '' })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg">\n' +
        '  <path d="M 10 10 H 90 V 90 H 10 L 10 10" fill="none"/>\n' +
        '</svg>'
    );
  });
});
