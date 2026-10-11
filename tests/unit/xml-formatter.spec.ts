import { test, expect } from '@playwright/test';
import {
  describeXmlParserError,
  formatXml,
  minifyXml,
  validateXml,
  type XmlDocumentLike,
} from '@/lib/tools/xml-formatter';

const XHTML = 'http://www.w3.org/1999/xhtml';
const FIREFOX = 'http://www.mozilla.org/newlayout/xml/parsererror.xml';

/** The elements named parsererror in a document, by namespace ("" for none). */
type ParserErrors = Record<string, Array<{ textContent: string | null }>>;

function document(elements: number, parserErrors: ParserErrors = {}): XmlDocumentLike {
  return {
    getElementsByTagNameNS: (namespace, localName) =>
      localName === 'parsererror' ? (parserErrors[namespace] ?? []) : [],
    getElementsByTagName: () => ({ length: elements }),
  };
}

/** Stands in for DOMParser: a well-formed document with `elements` elements. */
function wellFormed(elements: number): () => XmlDocumentLike {
  return () => document(elements);
}

/** Stands in for DOMParser reporting a syntax error the way browsers do. */
function malformed(errorText: string | null, namespace = XHTML): () => XmlDocumentLike {
  return () => document(0, { [namespace]: [{ textContent: errorText }] });
}

test.describe('formatXml', () => {
  test('indents nested elements', () => {
    expect(formatXml('<root><group><a>1</a><b>2</b></group><empty/></root>')).toBe(
      ['<root>', '  <group>', '    <a>1</a>', '    <b>2</b>', '  </group>', '  <empty/>', '</root>'].join('\n')
    );
  });

  test('uses the given indent unit', () => {
    expect(formatXml('<a><b><c/></b></a>', '    ')).toBe('<a>\n    <b>\n        <c/>\n    </b>\n</a>');
    expect(formatXml('<a><b><c/></b></a>', '\t')).toBe('<a>\n\t<b>\n\t\t<c/>\n\t</b>\n</a>');
  });

  // Text used to be moved onto its own indented line, which adds line breaks
  // and spaces to the element's content: <name>Ada</name> came out holding
  // "\n    Ada\n  ".
  test('keeps an element and its text on one line, text untouched', () => {
    expect(formatXml('<root><name>Ada</name><note>  two  spaces  </note></root>')).toBe(
      '<root>\n  <name>Ada</name>\n  <note>  two  spaces  </note>\n</root>'
    );
  });

  test('re-indents text that already sits on lines of its own', () => {
    const xml = '<a>\n        <note>\n            first line\n              second, deeper\n\n            third\n        </note>\n</a>';

    expect(formatXml(xml)).toBe(
      ['<a>', '  <note>', '    first line', '      second, deeper', '', '    third', '  </note>', '</a>'].join('\n')
    );
    expect(formatXml(xml, '\t')).toBe(
      ['<a>', '\t<note>', '\t\tfirst line', '\t\t  second, deeper', '', '\t\tthird', '\t</note>', '</a>'].join('\n')
    );
    expect(formatXml('<a>\r\n   <b>\r\n      x\r\n   </b>\r\n</a>')).toBe('<a>\n  <b>\n    x\n  </b>\n</a>');
  });

  test('does not re-indent text that starts or ends on a tag line', () => {
    expect(formatXml('<a><b>first\n     second</b><c>\n  x</c></a>')).toBe(
      '<a>\n  <b>first\n     second</b>\n  <c>\n  x</c>\n</a>'
    );
  });

  test('writes the XML declaration and a doctype on their own lines', () => {
    expect(formatXml('<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE note SYSTEM "note.dtd"><note><to>x</to></note>')).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE note SYSTEM "note.dtd">\n<note>\n  <to>x</to>\n</note>'
    );
  });

  test('keeps a doctype with an internal subset in one piece', () => {
    const doctype = '<!DOCTYPE note [<!ELEMENT note (to)><!ENTITY gt2 ">>">]>';

    expect(formatXml(`${doctype}<note><to>x</to></note>`)).toBe(`${doctype}\n<note>\n  <to>x</to>\n</note>`);
  });

  // The tag splitter stopped at the first ">", so these broke a tag in two.
  test('does not split a tag at ">" inside an attribute value', () => {
    expect(formatXml('<a><b title="x > y" alt=\'1 > 0\'/><c when="a>b">t</c></a>')).toBe(
      '<a>\n  <b title="x > y" alt=\'1 > 0\'/>\n  <c when="a>b">t</c>\n</a>'
    );
  });

  // A closing tag inside a comment used to lower the indent of everything after it.
  test('treats a comment as one unit, whatever it contains', () => {
    expect(formatXml('<a><!-- <b>old</b> a > b --><c><d/></c></a>')).toBe(
      '<a>\n  <!-- <b>old</b> a > b -->\n  <c>\n    <d/>\n  </c>\n</a>'
    );
  });

  // CDATA content was split at ">" and re-indented, which changes the data.
  test('copies CDATA exactly', () => {
    const cdata = '<![CDATA[ if (a < b && c > d) {\n    run("</x>");\n} ]]>';

    expect(formatXml(`<a><script>${cdata}</script><b/></a>`)).toBe(`<a>\n  <script>${cdata}</script>\n  <b/>\n</a>`);
  });

  test('copies mixed content as written', () => {
    expect(formatXml('<doc><p>Hello <b>big</b> <i>world</i>!</p><p>x</p></doc>')).toBe(
      '<doc>\n  <p>Hello <b>big</b> <i>world</i>!</p>\n  <p>x</p>\n</doc>'
    );
  });

  test('drops whitespace between tags and re-indents', () => {
    const messy = '<root>\n\n      <a>\n<b>1</b>\n   </a>\n</root>\n';

    expect(formatXml(messy)).toBe('<root>\n  <a>\n    <b>1</b>\n  </a>\n</root>');
  });

  test('closes an element that holds only whitespace on the same line', () => {
    expect(formatXml('<a><b>   </b><c>\n</c><d></d></a>')).toBe('<a>\n  <b></b>\n  <c></c>\n  <d></d>\n</a>');
  });

  test('is stable when its own output is formatted again', () => {
    const once = formatXml('<r><a x="1">t</a><b><c/><!-- n --></b><d><![CDATA[x]]></d></r>');

    expect(formatXml(once)).toBe(once);
    expect(formatXml(once, '    ')).toBe(formatXml(formatXml(once, '    '), '    '));
  });

  test('keeps processing instructions, namespaces and Unicode names', () => {
    expect(formatXml('<?xml-stylesheet href="a.xsl"?><s:Envelope xmlns:s="urn:s"><s:Body><名前>日本語 😀</名前></s:Body></s:Envelope>')).toBe(
      '<?xml-stylesheet href="a.xsl"?>\n<s:Envelope xmlns:s="urn:s">\n  <s:Body>\n    <名前>日本語 😀</名前>\n  </s:Body>\n</s:Envelope>'
    );
  });

  test('returns an empty string for empty and whitespace-only text', () => {
    expect(formatXml('')).toBe('');
    expect(formatXml('  \n ')).toBe('');
  });

  test('does not throw or hang on text that is not well-formed', () => {
    expect(formatXml('</a></b><c>')).toBe('</a>\n</b>\n<c>');
    expect(formatXml('a < b')).toBe('a\n< b');
    expect(formatXml('<a attr="unclosed')).toBe('<a attr="unclosed');
    expect(formatXml('<!-- never closed')).toBe('<!-- never closed');
    expect(formatXml('<a><![CDATA[ open')).toBe('<a>\n  <![CDATA[ open');
  });
});

test.describe('minifyXml', () => {
  test('removes whitespace between tags', () => {
    expect(minifyXml('<root>\n  <a>1</a>\n  <b>\n    <c/>\n  </b>\n</root>\n')).toBe('<root><a>1</a><b><c/></b></root>');
  });

  test('leaves text, comments and CDATA as they are', () => {
    const xml = '<a>\n  <t>  keep   this  </t>\n  <!-- a >   < b -->\n  <d><![CDATA[ x >   < y ]]></d>\n</a>';

    expect(minifyXml(xml)).toBe('<a><t>  keep   this  </t><!-- a >   < b --><d><![CDATA[ x >   < y ]]></d></a>');
  });

  test('keeps the spaces between inline elements of mixed content', () => {
    expect(minifyXml('<doc>\n  <p>Hello <b>big</b> <i>world</i></p>\n</doc>')).toBe(
      '<doc><p>Hello <b>big</b> <i>world</i></p></doc>'
    );
  });

  test('undoes formatting', () => {
    const compact = '<r><a x="1 > 0">t</a><b><c/><!-- n --></b><d><![CDATA[x]]></d><e></e></r>';

    expect(minifyXml(formatXml(compact))).toBe(compact);
    expect(minifyXml(formatXml(compact, '\t'))).toBe(compact);
  });

  test('returns an empty string for empty and whitespace-only text', () => {
    expect(minifyXml('')).toBe('');
    expect(minifyXml(' \n\t')).toBe('');
  });
});

test.describe('validateXml', () => {
  test('returns null for blank text without calling the parser', () => {
    let calls = 0;
    const parse = () => {
      calls += 1;
      return wellFormed(1)();
    };

    expect(validateXml('', parse)).toBeNull();
    expect(validateXml('  \n', parse)).toBeNull();
    expect(calls).toBe(0);
  });

  test('summarises a well-formed document', () => {
    expect(validateXml('<a><b/><c/></a>', wellFormed(3))).toEqual({
      valid: true,
      summary: 'XML Document with 3 elements',
      error: '',
    });
    expect(validateXml('<a/>', wellFormed(1))?.summary).toBe('XML Document with 1 element');
  });

  test('passes the text to the parser unchanged', () => {
    let seen = '';
    validateXml(' <a/> ', (text) => {
      seen = text;
      return wellFormed(1)();
    });

    expect(seen).toBe(' <a/> ');
  });

  test('reports the parser error', () => {
    const chrome =
      'This page contains the following errors:error on line 1 at column 11: Opening and ending tag mismatch: b line 1 and a\nBelow is a rendering of the page up to the first error.';

    expect(validateXml('<a><b></a>', malformed(chrome))).toEqual({
      valid: false,
      summary: '',
      error: 'error on line 1 at column 11: Opening and ending tag mismatch: b line 1 and a',
    });
  });

  test('finds the error element in the namespace Firefox uses', () => {
    expect(validateXml('<a', malformed('XML Parsing Error: junk', FIREFOX))?.valid).toBe(false);
  });

  // The browser's own error element is in a namespace; one the document holds is not.
  test('accepts a document that has an element named parsererror of its own', () => {
    const parse = () => document(2, { '': [{ textContent: 'disk full' }] });

    expect(validateXml('<log><parsererror>disk full</parsererror></log>', parse)).toEqual({
      valid: true,
      summary: 'XML Document with 2 elements',
      error: '',
    });
  });

  test('falls back when the parser gives no error text', () => {
    expect(validateXml('<a', malformed(null))?.error).toBe('Invalid XML structure');
    expect(validateXml('<a', malformed('  '))?.error).toBe('Invalid XML structure');
  });

  test('reports a parser that throws', () => {
    const result = validateXml('<a/>', () => {
      throw new Error('parser unavailable');
    });

    expect(result).toEqual({ valid: false, summary: '', error: 'parser unavailable' });
  });
});

test.describe('describeXmlParserError', () => {
  test('strips the fixed sentences Chrome and Safari add', () => {
    expect(
      describeXmlParserError(
        'This page contains the following errors:error on line 3 at column 7: Extra content at the end of the document\nBelow is a rendering of the page up to the first error.'
      )
    ).toBe('error on line 3 at column 7: Extra content at the end of the document');
  });

  test('shortens the Firefox form to the reason and position', () => {
    expect(
      describeXmlParserError(
        'XML Parsing Error: mismatched tag. Expected: </b>.\nLocation: http://localhost:3000/tools/xml-formatter/\nLine Number 1, Column 9:<a><b></a>\n--------^'
      )
    ).toBe('mismatched tag. Expected: </b>. (line 1, column 9)');
  });

  test('keeps text it does not recognise', () => {
    expect(describeXmlParserError('  some other message ')).toBe('some other message');
  });
});
