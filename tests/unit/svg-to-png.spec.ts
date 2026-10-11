import { test, expect } from '@playwright/test';
import { MAX_SCALE, MIN_SCALE, clampScale, prepareSvg, rasterSize } from '@/lib/tools/svg-to-png';

const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';

/** Unwraps a successful preparation so a failure reads as its error message. */
function prepared(source: string) {
  const result = prepareSvg(source);
  if (!result.ok) throw new Error(result.error);
  return result;
}

test.describe('clampScale', () => {
  test('reads a whole number in range', () => {
    expect(clampScale('2')).toBe(2);
    expect(clampScale('10')).toBe(10);
    expect(clampScale(4)).toBe(4);
  });

  test('keeps the scale inside the range the field promises', () => {
    // Typing 50 used to ask for a canvas fifty times the image, which most
    // browsers cannot allocate; the result was an empty PNG.
    expect(clampScale('50')).toBe(MAX_SCALE);
    expect(clampScale('-3')).toBe(MIN_SCALE);
    expect(clampScale('0')).toBe(MIN_SCALE);
    expect(clampScale(1000)).toBe(MAX_SCALE);
  });

  test('falls back to 1 for anything unreadable', () => {
    expect(clampScale('')).toBe(1);
    expect(clampScale('abc')).toBe(1);
    expect(clampScale(Number.NaN)).toBe(1);
  });

  test('drops the fraction', () => {
    expect(clampScale('3.9')).toBe(3);
    expect(clampScale(7.8)).toBe(7);
  });
});

test.describe('rasterSize', () => {
  test('multiplies the size by the scale', () => {
    expect(rasterSize({ width: 24, height: 24 }, 2)).toEqual({ width: 48, height: 48 });
    expect(rasterSize({ width: 300, height: 150 }, 10)).toEqual({ width: 3000, height: 1500 });
  });

  test('gives whole pixels, at least one', () => {
    expect(rasterSize({ width: 133.333, height: 0.2 }, 2)).toEqual({ width: 267, height: 1 });
  });
});

test.describe('prepareSvg', () => {
  test('leaves complete SVG exactly as it was written', () => {
    const svg = `<svg ${XMLNS} width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>`;

    expect(prepared(svg)).toEqual({ ok: true, markup: svg, width: 24, height: 24 });
  });

  test('refuses empty input', () => {
    for (const source of ['', '   ', '\n\t\n', '﻿']) {
      expect(prepareSvg(source)).toEqual({
        ok: false,
        error: 'Paste SVG code or upload an SVG file first.',
      });
    }
  });

  test('refuses anything that does not start with an svg element', () => {
    for (const source of ['hello', '<div><svg/></div>', '<svgfoo/>', '{"svg": true}', '<svg width="1"']) {
      const result = prepareSvg(source);
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ error: expect.stringContaining('<svg>') });
    }
  });

  test('adds the SVG namespace when it is missing', () => {
    // Code copied out of an HTML page has no xmlns. A browser will not load
    // that as an image, and the tool used to do nothing at all.
    const result = prepared('<svg width="10" height="20"><rect width="10" height="20"/></svg>');

    expect(result.markup).toBe(`<svg ${XMLNS} width="10" height="20"><rect width="10" height="20"/></svg>`);
    expect(result).toMatchObject({ width: 10, height: 20 });
  });

  test('adds the XLink namespace when xlink attributes are used without it', () => {
    const result = prepared(
      `<svg ${XMLNS} width="10" height="10"><use xlink:href="#a"/></svg>`
    );

    expect(result.markup).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
  });

  test('does not declare XLink twice', () => {
    const svg = `<svg ${XMLNS} xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10"><use xlink:href="#a"/></svg>`;

    expect(prepared(svg).markup).toBe(svg);
  });

  test('gives a viewBox-only SVG a size of its own', () => {
    // By the HTML rules an image like this has no natural size, so the canvas
    // was 0x0 and the "PNG" was an empty data URL in browsers that follow them.
    const square = prepared(`<svg ${XMLNS} viewBox="0 0 24 24"><path/></svg>`);
    expect(square).toMatchObject({ width: 150, height: 150 });
    expect(square.markup).toBe(`<svg width="150" height="150" ${XMLNS} viewBox="0 0 24 24"><path/></svg>`);

    expect(prepared(`<svg ${XMLNS} viewBox="0 0 400 100"/>`)).toMatchObject({ width: 300, height: 75 });
    expect(prepared(`<svg ${XMLNS} viewBox="0,0,100,200"/>`)).toMatchObject({ width: 75, height: 150 });
  });

  test('uses the CSS default of 300x150 when the SVG states nothing', () => {
    const result = prepared('<svg><circle r="5"/></svg>');

    expect(result).toMatchObject({ width: 300, height: 150 });
    expect(result.markup).toBe(`<svg ${XMLNS} width="300" height="150"><circle r="5"/></svg>`);
  });

  test('replaces relative sizes with pixels', () => {
    const result = prepared(`<svg ${XMLNS} width="100%" height="100%" viewBox="0 0 50 50"></svg>`);

    expect(result).toMatchObject({ width: 150, height: 150 });
    expect(result.markup).not.toContain('100%');
    expect(result.markup).toContain('width="150"');
    expect(result.markup).toContain('height="150"');
    expect(result.markup).toContain('viewBox="0 0 50 50"');
  });

  test('works the missing side out from the viewBox', () => {
    expect(prepared(`<svg ${XMLNS} width="48" viewBox="0 0 24 12"/>`)).toMatchObject({
      width: 48,
      height: 24,
    });
    expect(prepared(`<svg ${XMLNS} height="30" viewBox="0 0 24 12"/>`)).toMatchObject({
      width: 60,
      height: 30,
    });
    expect(prepared(`<svg ${XMLNS} width="48"/>`)).toMatchObject({ width: 48, height: 150 });
  });

  test('keeps a stated side and only adds the missing one', () => {
    const result = prepared(`<svg ${XMLNS} width="48" viewBox="0 0 24 12"/>`);

    expect(result.markup).toBe(`<svg height="24" ${XMLNS} width="48" viewBox="0 0 24 12"/>`);
  });

  test('converts absolute units to pixels and leaves them in the markup', () => {
    const svg = `<svg ${XMLNS} width="1in" height="2.54cm"/>`;
    const result = prepared(svg);

    expect(result.markup).toBe(svg);
    expect(result.width).toBeCloseTo(96, 6);
    expect(result.height).toBeCloseTo(96, 6);

    const points = prepared(`<svg ${XMLNS} width="24px" height="18pt"/>`);
    expect(points.width).toBe(24);
    expect(points.height).toBeCloseTo(24, 6);
  });

  test('trims what comes before the document', () => {
    // An XML declaration is only legal at the very start: a pasted blank line
    // in front of it used to make the whole SVG unloadable.
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg ${XMLNS} width="5" height="5"/>`;

    expect(prepared(`﻿\n\n  ${svg}\n`).markup).toBe(svg);
  });

  test('finds the root element after a declaration, comments and a doctype', () => {
    const svg = [
      '<?xml version="1.0"?>',
      '<!-- made by <svg> export -->',
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
      '<!DOCTYPE svg [ <!ENTITY ns "http://example.com/"> ]>',
      `<svg viewBox="0 0 10 10"><g/></svg>`,
    ].join('\n');
    const result = prepared(svg);

    expect(result).toMatchObject({ width: 150, height: 150 });
    expect(result.markup).toContain(`<svg ${XMLNS} width="150" height="150" viewBox="0 0 10 10"><g/></svg>`);
    expect(result.markup.startsWith('<?xml version="1.0"?>\n<!-- made by <svg> export -->')).toBe(true);
  });

  test('is not confused by quotes and angle brackets inside attribute values', () => {
    const result = prepared(
      `<svg ${XMLNS} data-note='width="999" a>b' height='40' width = "20"><text>width="1"</text></svg>`
    );

    expect(result).toMatchObject({ width: 20, height: 40 });
    expect(result.markup).toBe(
      `<svg ${XMLNS} data-note='width="999" a>b' height='40' width = "20"><text>width="1"</text></svg>`
    );
  });

  test('gives up on a prolog that never ends instead of scanning forever', () => {
    expect(prepareSvg('<!-- unfinished <svg/>').ok).toBe(false);
    expect(prepareSvg('<?xml version="1.0" <svg/>').ok).toBe(false);
    expect(prepareSvg('<?xml version="1.0"?><!DOCTYPE svg [ <!ENTITY a "b"> <svg/>').ok).toBe(false);
  });
});
