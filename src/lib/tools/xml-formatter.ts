/**
 * XML formatter logic: validation, pretty-printing and minifying.
 *
 * Formatting works on tokens, not on a regular expression over the whole
 * text, so a ">" inside an attribute value, a comment or a CDATA section does
 * not break a tag in two. Character data is not rewritten: an element that
 * directly contains text or CDATA is written exactly as it came in, because
 * adding line breaks and indentation there changes the document's content.
 * The one exception is text that already sits on lines of its own between its
 * tags; that indentation is layout, and it moves with the rest.
 *
 * Everything here is pure. Checking well-formedness needs a real XML parser,
 * so `validateXml` takes one as an argument: `DOMParser` in the browser.
 */

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type XmlTokenType = 'open' | 'close' | 'empty' | 'text' | 'cdata' | 'other';

interface XmlToken {
  type: XmlTokenType;
  text: string;
}

const ASCII_NAME_START = /[A-Za-z_:]/;

/** Whether a character can begin an element name; every non-ASCII one counts. */
function isNameStart(character: string | undefined): boolean {
  if (character === undefined) return false;
  return ASCII_NAME_START.test(character) || character.charCodeAt(0) >= 0x80;
}

/** Index just past the ">" that ends a tag, skipping quoted attribute values. */
function endOfTag(xml: string, from: number): number {
  let quote = '';
  for (let index = from + 1; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index + 1;
    }
  }
  return xml.length;
}

/** Index just past a `<!DOCTYPE ...>`, including an internal subset in [ ]. */
function endOfDeclaration(xml: string, from: number): number {
  let quote = '';
  let depth = 0;
  for (let index = from + 2; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (depth > 0 && xml.startsWith('<!--', index)) {
      const end = xml.indexOf('-->', index + 4);
      if (end === -1) return xml.length;
      index = end + 2;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[') {
      depth += 1;
    } else if (character === ']') {
      depth = Math.max(0, depth - 1);
    } else if (character === '>' && depth === 0) {
      return index + 1;
    }
  }
  return xml.length;
}

function tokenize(xml: string): XmlToken[] {
  const tokens: XmlToken[] = [];
  let position = 0;

  const take = (type: XmlTokenType, end: number) => {
    tokens.push({ type, text: xml.slice(position, end) });
    position = end;
  };

  const endAfter = (marker: string, from: number) => {
    const index = xml.indexOf(marker, from);
    return index === -1 ? xml.length : index + marker.length;
  };

  const endOfText = (from: number) => {
    const index = xml.indexOf('<', from);
    return index === -1 ? xml.length : index;
  };

  while (position < xml.length) {
    if (xml[position] !== '<') {
      take('text', endOfText(position));
    } else if (xml.startsWith('<!--', position)) {
      take('other', endAfter('-->', position + 4));
    } else if (xml.startsWith('<![CDATA[', position)) {
      take('cdata', endAfter(']]>', position + 9));
    } else if (xml.startsWith('<?', position)) {
      take('other', endAfter('?>', position + 2));
    } else if (xml.startsWith('<!', position)) {
      take('other', endOfDeclaration(xml, position));
    } else if (xml.startsWith('</', position)) {
      take('close', endAfter('>', position + 2));
    } else if (isNameStart(xml[position + 1])) {
      const end = endOfTag(xml, position);
      take(xml.slice(position, end).endsWith('/>') ? 'empty' : 'open', end);
    } else {
      // A stray "<" that starts no tag (not well-formed): carry it as text.
      take('text', endOfText(position + 1));
    }
  }

  return tokens;
}

function isBlankText(token: XmlToken): boolean {
  return token.type === 'text' && token.text.trim() === '';
}

interface ElementMap {
  /** Index of the closing tag for each opening tag that has one. */
  closeOf: Map<number, number>;
  /** Opening tags of elements that directly contain text or CDATA. */
  holdsData: Set<number>;
}

function mapElements(tokens: XmlToken[]): ElementMap {
  const closeOf = new Map<number, number>();
  const holdsData = new Set<number>();
  const open: number[] = [];

  tokens.forEach((token, index) => {
    if (token.type === 'open') {
      open.push(index);
    } else if (token.type === 'close') {
      const start = open.pop();
      if (start !== undefined) closeOf.set(start, index);
    } else if (token.type === 'cdata' || (token.type === 'text' && !isBlankText(token))) {
      const parent = open[open.length - 1];
      if (parent !== undefined) holdsData.add(parent);
    }
  });

  return { closeOf, holdsData };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * The lines of text that is laid out on lines of its own between its tags,
 *
 *   <note>
 *     first line
 *   </note>
 *
 * with the indentation they share removed. Null for text that starts or ends
 * on a tag's line: there every space is content.
 */
function blockTextLines(text: string): string[] | null {
  const lines = text.split(/\r?\n/);
  if (lines.length < 3 || lines[0].trim() !== '' || lines[lines.length - 1].trim() !== '') {
    return null;
  }

  const body = lines.slice(1, -1);
  let shared = Infinity;
  for (const line of body) {
    if (line.trim() !== '') {
      shared = Math.min(shared, line.length - line.trimStart().length);
    }
  }

  return body.map((line) => (line.trim() === '' ? '' : line.slice(shared)));
}

/**
 * Pretty-prints XML with one tag per line and `indent` per nesting level.
 * An element that holds text is kept in one piece, `<name>Ada</name>`, with
 * its content untouched. Never throws; text that is not well-formed comes
 * out as tidy as its tags allow.
 */
export function formatXml(xml: string, indent = '  '): string {
  const tokens = tokenize(xml);
  const { closeOf, holdsData } = mapElements(tokens);
  const lines: string[] = [];
  let level = 0;

  const emit = (text: string) => {
    lines.push(indent.repeat(level) + text);
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'text') {
      const text = token.text.trim();
      if (text) emit(text);
      continue;
    }

    if (token.type === 'close') {
      level = Math.max(0, level - 1);
      emit(token.text);
      continue;
    }

    if (token.type !== 'open') {
      emit(token.text);
      continue;
    }

    const close = closeOf.get(index);
    if (close !== undefined && holdsData.has(index)) {
      const only = close === index + 2 ? tokens[index + 1] : undefined;
      const block = only?.type === 'text' ? blockTextLines(only.text) : null;

      if (block) {
        // Text on lines of its own: re-indent it one level in.
        emit(token.text);
        level += 1;
        for (const line of block) {
          if (line) emit(line);
          else lines.push('');
        }
        level -= 1;
        emit(tokens[close].text);
      } else {
        // Text content: write the element exactly as it is.
        emit(
          tokens
            .slice(index, close + 1)
            .map((part) => part.text)
            .join('')
        );
      }
      index = close;
    } else if (
      close !== undefined &&
      (close === index + 1 || (close === index + 2 && isBlankText(tokens[index + 1])))
    ) {
      // Nothing inside but whitespace: <a></a>.
      emit(token.text + tokens[close].text);
      index = close;
    } else {
      emit(token.text);
      level += 1;
    }
  }

  return lines.join('\n');
}

/**
 * Removes the whitespace between tags. Whitespace inside an element that
 * holds text is part of that text and stays.
 */
export function minifyXml(xml: string): string {
  const tokens = tokenize(xml);
  const { holdsData } = mapElements(tokens);
  const open: number[] = [];
  let output = '';

  tokens.forEach((token, index) => {
    if (token.type === 'close') open.pop();

    const parent = open[open.length - 1];
    if (!isBlankText(token) || (parent !== undefined && holdsData.has(parent))) {
      output += token.text;
    }

    if (token.type === 'open') open.push(index);
  });

  return output.trim();
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** The part of a parsed XML document that validation reads. */
export interface XmlDocumentLike {
  querySelector(selectors: string): { textContent: string | null } | null;
  getElementsByTagName(name: string): { length: number };
}

export interface XmlValidation {
  valid: boolean;
  /** "XML Document with 4 elements". */
  summary: string;
  error: string;
}

const FIREFOX_ERROR = /^XML Parsing Error:\s*([^\n]+?)\s*\nLocation:[^\n]*\nLine Number (\d+), Column (\d+)/;

/**
 * Turns the text of a browser's `<parsererror>` element into one sentence.
 * Chrome and Safari wrap the reason in two fixed lines about "this page";
 * Firefox adds the page address and a copy of the source.
 */
export function describeXmlParserError(raw: string): string {
  const text = raw
    .replace(/^\s*This page contains the following errors:\s*/i, '')
    .replace(/\s*Below is a rendering of the page up to the first error\.?\s*$/i, '')
    .trim();

  const firefox = FIREFOX_ERROR.exec(text);
  if (firefox) {
    return `${firefox[1]} (line ${firefox[2]}, column ${firefox[3]})`;
  }

  return text || 'Invalid XML structure';
}

/**
 * Checks that XML is well-formed. `parse` must behave like
 * `new DOMParser().parseFromString(text, 'application/xml')`, which reports
 * a syntax error as a `<parsererror>` element instead of throwing. Blank
 * text is neither valid nor invalid: null.
 */
export function validateXml(
  text: string,
  parse: (text: string) => XmlDocumentLike
): XmlValidation | null {
  if (!text.trim()) return null;

  try {
    const document = parse(text);
    const parserError = document.querySelector('parsererror');
    if (parserError) {
      return {
        valid: false,
        summary: '',
        error: describeXmlParserError(parserError.textContent ?? ''),
      };
    }

    const elements = document.getElementsByTagName('*').length;
    return {
      valid: true,
      summary: `XML Document with ${elements.toLocaleString()} element${elements === 1 ? '' : 's'}`,
      error: '',
    };
  } catch (error) {
    return {
      valid: false,
      summary: '',
      error: error instanceof Error ? error.message : 'Unknown XML parsing error',
    };
  }
}
