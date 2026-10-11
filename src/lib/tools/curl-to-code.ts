/**
 * Turns a cURL command line into request code for other languages.
 *
 * `parseCurl` reads the command the way a POSIX shell and then curl would:
 * quoting and escapes first, then curl's options. The result is the request
 * curl would send (method, URL, headers, body), plus a note for everything
 * the command asks for that the generated code cannot do. `generateRequestCode`
 * writes that request out in one of the target languages.
 *
 * Nothing here touches the network or the DOM, so it runs in Node.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type CurlTargetLanguage =
  | 'js-fetch'
  | 'js-axios'
  | 'python-requests'
  | 'go-http'
  | 'rust-reqwest'
  | 'php-curl'
  | 'java-httpurlconnection'
  | 'java-okhttp'
  | 'csharp-httpclient'
  | 'ruby-net-http'
  | 'swift-urlsession'
  | 'kotlin-okhttp'
  | 'dart-http';

export const CURL_TARGET_LANGUAGES: ReadonlyArray<{ value: CurlTargetLanguage; label: string }> = [
  { value: 'js-fetch', label: 'JavaScript — Fetch' },
  { value: 'js-axios', label: 'JavaScript — Axios' },
  { value: 'python-requests', label: 'Python — Requests' },
  { value: 'go-http', label: 'Go — net/http' },
  { value: 'rust-reqwest', label: 'Rust — Reqwest' },
  { value: 'php-curl', label: 'PHP — cURL' },
  { value: 'java-httpurlconnection', label: 'Java — HttpURLConnection' },
  { value: 'java-okhttp', label: 'Java — OkHttp' },
  { value: 'csharp-httpclient', label: 'C# — HttpClient' },
  { value: 'ruby-net-http', label: 'Ruby — Net::HTTP' },
  { value: 'swift-urlsession', label: 'Swift — URLSession' },
  { value: 'kotlin-okhttp', label: 'Kotlin — OkHttp' },
  { value: 'dart-http', label: 'Dart — http' },
];

/** The request a cURL command sends. */
export interface CurlRequest {
  url: string;
  /** Upper case, e.g. `POST`. */
  method: string;
  /** In the order given; everything curl would add on its own is included. */
  headers: Record<string, string>;
  /** The request body, or '' for none. */
  data: string;
  /** What the command asks for that the generated code leaves out, in plain words. */
  warnings: string[];
}

export const PLACEHOLDER_URL = 'https://api.example.com/endpoint';

// ── Shell words ───────────────────────────────────────────────────────────────

interface Word {
  text: string;
  /** True when any part of the word was quoted or escaped. */
  quoted: boolean;
}

const isHex = (char: string | undefined) => char !== undefined && /^[0-9a-fA-F]$/.test(char);

/**
 * Decodes one escape inside `$'...'`. `index` points just past the backslash.
 * Returns the decoded text and how many characters the escape used.
 */
function decodeAnsiEscape(source: string, index: number): [string, number] {
  const char = source[index];
  const simple: Record<string, string | undefined> = {
    n: '\n',
    t: '\t',
    r: '\r',
    a: '\x07',
    b: '\b',
    e: '\x1b',
    E: '\x1b',
    f: '\f',
    v: '\v',
    '\\': '\\',
    "'": "'",
    '"': '"',
    '?': '?',
  };
  const plain = simple[char];
  if (plain !== undefined) return [plain, 1];

  const hexDigitLimits: Record<string, number | undefined> = { x: 2, u: 4, U: 8 };
  const maxHexDigits = hexDigitLimits[char];
  if (maxHexDigits) {
    let digits = '';
    while (digits.length < maxHexDigits && isHex(source[index + 1 + digits.length])) {
      digits += source[index + 1 + digits.length];
    }
    if (digits) {
      const codePoint = parseInt(digits, 16);
      return [codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '', 1 + digits.length];
    }
  }

  if (char >= '0' && char <= '7') {
    let digits = '';
    while (digits.length < 3 && /^[0-7]$/.test(source[index + digits.length] ?? '')) {
      digits += source[index + digits.length];
    }
    return [String.fromCharCode(parseInt(digits, 8) & 0xff), digits.length];
  }

  // Not an escape the shell knows: the backslash stays.
  return [`\\${char}`, 1];
}

/**
 * Splits a command into words as a POSIX shell does: single quotes keep
 * everything, double quotes keep a backslash unless it escapes one of
 * `"`, `\`, `$` or a backtick, and `$'...'` decodes C-style escapes.
 */
function splitWords(command: string): Word[] {
  const words: Word[] = [];
  let text = '';
  let started = false;
  let quoted = false;
  let index = 0;
  const length = command.length;

  const endWord = () => {
    // `started` rather than `text`, so that '' and "" still count as a word.
    if (started) words.push({ text, quoted });
    text = '';
    started = false;
    quoted = false;
  };

  const newlineLength = (at: number) => {
    if (command[at] === '\n') return 1;
    if (command[at] === '\r' && command[at + 1] === '\n') return 2;
    return 0;
  };

  while (index < length) {
    const char = command[index];

    // A line continuation: backslash, or cmd's caret, or PowerShell's backtick.
    if ((char === '\\' || char === '^' || char === '`') && newlineLength(index + 1) > 0) {
      endWord();
      index += 1 + newlineLength(index + 1);
      continue;
    }

    if (char === '\\') {
      if (index + 1 < length) {
        text += command[index + 1];
        started = true;
        quoted = true;
      }
      index += 2;
      continue;
    }

    if (char === "'") {
      const close = command.indexOf("'", index + 1);
      const end = close === -1 ? length : close;
      text += command.slice(index + 1, end);
      started = true;
      quoted = true;
      index = end + 1;
      continue;
    }

    if (char === '$' && command[index + 1] === "'") {
      index += 2;
      started = true;
      quoted = true;
      while (index < length && command[index] !== "'") {
        if (command[index] === '\\' && index + 1 < length) {
          const [decoded, used] = decodeAnsiEscape(command, index + 1);
          text += decoded;
          index += 1 + used;
        } else {
          text += command[index];
          index += 1;
        }
      }
      index += 1;
      continue;
    }

    if (char === '"') {
      index += 1;
      started = true;
      quoted = true;
      while (index < length && command[index] !== '"') {
        if (command[index] === '\\' && index + 1 < length) {
          const next = command[index + 1];
          const continuation = newlineLength(index + 1);
          if (continuation > 0) {
            index += 1 + continuation;
          } else if (next === '"' || next === '\\' || next === '$' || next === '`') {
            text += next;
            index += 2;
          } else {
            text += '\\';
            index += 1;
          }
        } else {
          text += command[index];
          index += 1;
        }
      }
      index += 1;
      continue;
    }

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      endWord();
      index += 1;
      continue;
    }

    text += char;
    started = true;
    index += 1;
  }

  endWord();
  return words;
}

// ── curl options ──────────────────────────────────────────────────────────────

/** Short options that take a value; the value may be attached (`-XPOST`). */
const SHORT_VALUE_OPTIONS = new Set('AbcCdDeEFHKmoPQrtTuUwxXyYz'.split(''));

/**
 * Long options that take a value. They are listed so that the value is
 * skipped rather than mistaken for the URL.
 */
const LONG_VALUE_OPTIONS = new Set([
  '--abstract-unix-socket',
  '--aws-sigv4',
  '--cacert',
  '--capath',
  '--cert',
  '--cert-type',
  '--ciphers',
  '--config',
  '--connect-timeout',
  '--connect-to',
  '--continue-at',
  '--cookie',
  '--cookie-jar',
  '--data',
  '--data-ascii',
  '--data-binary',
  '--data-raw',
  '--data-urlencode',
  '--dns-servers',
  '--doh-url',
  '--dump-header',
  '--expect100-timeout',
  '--form',
  '--form-string',
  '--header',
  '--interface',
  '--json',
  '--keepalive-time',
  '--key',
  '--key-type',
  '--limit-rate',
  '--local-port',
  '--max-filesize',
  '--max-redirs',
  '--max-time',
  '--noproxy',
  '--oauth2-bearer',
  '--output',
  '--output-dir',
  '--pass',
  '--pinnedpubkey',
  '--proto',
  '--proto-default',
  '--proto-redir',
  '--proxy',
  '--proxy-header',
  '--proxy-user',
  '--range',
  '--rate',
  '--referer',
  '--request',
  '--request-target',
  '--resolve',
  '--retry',
  '--retry-delay',
  '--retry-max-time',
  '--socks4',
  '--socks4a',
  '--socks5',
  '--socks5-hostname',
  '--speed-limit',
  '--speed-time',
  '--stderr',
  '--time-cond',
  '--tls-max',
  '--trace',
  '--trace-ascii',
  '--unix-socket',
  '--upload-file',
  '--url',
  '--user',
  '--user-agent',
  '--write-out',
]);

const SHORT_TO_LONG: Record<string, string> = {
  A: '--user-agent',
  b: '--cookie',
  d: '--data',
  e: '--referer',
  F: '--form',
  G: '--get',
  H: '--header',
  I: '--head',
  k: '--insecure',
  T: '--upload-file',
  u: '--user',
  X: '--request',
};

/** Standard Base64 of the text's UTF-8 bytes; `btoa` alone fails beyond Latin-1. */
function base64Utf8(text: string): string {
  let binary = '';
  new TextEncoder().encode(text).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/** Percent-encodes the way `--data-urlencode` does: unreserved characters stay, a space becomes `+`. */
function formEncode(text: string): string {
  try {
    return encodeURIComponent(text)
      .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
      .replace(/%20/g, '+');
  } catch {
    // A lone surrogate cannot be encoded; leave the text alone.
    return text;
  }
}

function findHeader(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === wanted);
  return key === undefined ? undefined : headers[key];
}

const hasScheme = (text: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(text);

const looksLikeUrl = (text: string) =>
  hasScheme(text) || text.includes('.') || text.includes('/') || text.startsWith('localhost');

/** Reads a cURL command into the request it sends. Never throws. */
export function parseCurl(command: string): CurlRequest {
  const words = splitWords(command.trim());

  // What the options said, before curl's own defaults are applied.
  const seen = {
    method: '',
    url: '',
    user: null as string | null,
    userAgent: null as string | null,
    referer: null as string | null,
    cookie: null as string | null,
    bearer: null as string | null,
    jsonBody: false,
    asQuery: false,
    headOnly: false,
    upload: false,
  };
  const positional: string[] = [];
  const headers: Record<string, string> = {};
  const dataParts: string[] = [];
  const warnings: string[] = [];
  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  /** A body that names a file ("@body.json") is kept as written, with a note. */
  const addFileBody = (reference: string, fileName: string) => {
    dataParts.push(reference);
    warn(
      `The body is read from a file (${fileName}), which cannot be opened here. Replace "${reference}" with the file's contents.`
    );
  };

  const applyFlag = (name: string) => {
    if (name === '--get') seen.asQuery = true;
    else if (name === '--head') seen.headOnly = true;
    else if (name === '--insecure') {
      warn('-k/--insecure (skip TLS certificate checks) is not carried over to the code.');
    }
  };

  const applyOption = (name: string, value: string) => {
    switch (name) {
      case '--request':
        seen.method = value.toUpperCase();
        break;
      case '--header': {
        const colon = value.indexOf(':');
        if (colon > -1) {
          const headerName = value.slice(0, colon).trim();
          const headerValue = value.slice(colon + 1).trim();
          // "Name:" with nothing after it tells curl to leave that header out.
          if (headerName && headerValue) headers[headerName] = headerValue;
        } else if (value.endsWith(';') && value.length > 1) {
          // "Name;" is curl's way to send a header with an empty value.
          headers[value.slice(0, -1).trim()] = '';
        }
        break;
      }
      case '--data':
      case '--data-ascii':
      case '--data-binary':
        if (value.startsWith('@')) addFileBody(value, value.slice(1));
        else dataParts.push(value);
        break;
      case '--data-raw':
        dataParts.push(value);
        break;
      case '--json':
        seen.jsonBody = true;
        if (value.startsWith('@')) addFileBody(value, value.slice(1));
        else dataParts.push(value);
        break;
      case '--data-urlencode': {
        const equals = value.indexOf('=');
        const at = value.indexOf('@');
        if (equals > -1 && (at === -1 || equals < at)) {
          const fieldName = value.slice(0, equals);
          const encoded = formEncode(value.slice(equals + 1));
          dataParts.push(fieldName ? `${fieldName}=${encoded}` : encoded);
        } else if (at > -1) {
          // "@file" or "name@file": the content comes from a file.
          addFileBody(value, value.slice(at + 1));
        } else {
          dataParts.push(formEncode(value));
        }
        break;
      }
      case '--user':
        seen.user = value;
        break;
      case '--user-agent':
        seen.userAgent = value;
        break;
      case '--referer':
        seen.referer = value.replace(/;auto$/, '');
        break;
      case '--cookie':
        if (value.includes('=')) seen.cookie = value;
        else warn(`-b names a cookie file (${value}), which is not read.`);
        break;
      case '--oauth2-bearer':
        seen.bearer = value;
        break;
      case '--url':
        if (!seen.url) seen.url = value;
        break;
      case '--form':
      case '--form-string':
        warn('Multipart form fields (-F) are not converted. Add them to the request body by hand.');
        if (!seen.method) seen.method = 'POST';
        break;
      case '--upload-file':
        seen.upload = true;
        warn(`The file to upload (${value}) is not read. Add its contents as the request body.`);
        break;
      default:
        // An option whose value does not change the request.
        break;
    }
  };

  for (let index = 0; index < words.length; index++) {
    const { text, quoted } = words[index];

    if (index === 0 && /^curl(\.exe)?$/i.test(text)) continue;
    // Anything after a pipe, redirect or command separator belongs to the shell.
    if (!quoted && /^(\||&|;|\d?>|<)/.test(text)) break;

    if (text.startsWith('--') && text.length > 2) {
      if (LONG_VALUE_OPTIONS.has(text)) {
        index += 1;
        applyOption(text, words[index]?.text ?? '');
      } else {
        applyFlag(text);
      }
      continue;
    }

    if (text.startsWith('-') && text.length > 1 && text !== '--') {
      // A cluster such as -sSL, where the first option that takes a value
      // uses the rest of the word (-XPOST) or else the next word.
      for (let position = 1; position < text.length; position++) {
        const letter = text[position];
        const longName = SHORT_TO_LONG[letter] ?? `-${letter}`;
        if (SHORT_VALUE_OPTIONS.has(letter)) {
          const attached = text.slice(position + 1);
          if (attached) {
            applyOption(longName, attached);
          } else {
            index += 1;
            applyOption(longName, words[index]?.text ?? '');
          }
          break;
        }
        applyFlag(longName);
      }
      continue;
    }

    positional.push(text);
  }

  let url = seen.url || positional.find(hasScheme) || positional.find(looksLikeUrl) || '';
  if (!url) {
    url = PLACEHOLDER_URL;
    warn('No URL found in the command, so a placeholder URL is used.');
  } else if (!hasScheme(url)) {
    // curl assumes HTTP when the URL names no scheme.
    url = `http://${url}`;
  }

  let data = dataParts.join('&');
  // Even an empty -d '' makes curl post a (zero-length) form body.
  let hasBody = dataParts.length > 0;
  if (seen.asQuery) {
    // -G sends the data as the query string of a GET instead of as a body.
    if (data) url += (url.includes('?') ? '&' : '?') + data;
    data = '';
    hasBody = false;
  }

  let method = seen.method;
  if (!method) {
    if (seen.headOnly) method = 'HEAD';
    else if (hasBody) method = 'POST';
    else if (seen.upload) method = 'PUT';
    else method = 'GET';
  }

  // Headers curl adds on its own, unless a -H already set them.
  const addDefault = (name: string, value: string | null) => {
    if (value !== null && findHeader(headers, name) === undefined) headers[name] = value;
  };
  addDefault('User-Agent', seen.userAgent);
  addDefault('Referer', seen.referer);
  addDefault('Cookie', seen.cookie);
  addDefault('Authorization', seen.bearer === null ? null : `Bearer ${seen.bearer}`);
  if (seen.user !== null) {
    // Without a colon curl would prompt for the password; assume an empty one.
    const credentials = seen.user.includes(':') ? seen.user : `${seen.user}:`;
    addDefault('Authorization', `Basic ${base64Utf8(credentials)}`);
  }
  if (hasBody) {
    addDefault(
      'Content-Type',
      seen.jsonBody ? 'application/json' : 'application/x-www-form-urlencoded'
    );
    if (seen.jsonBody) addDefault('Accept', 'application/json');
  }

  return { url, method, headers, data, warnings };
}

// ── String literals ───────────────────────────────────────────────────────────

type StringDialect = 'common' | 'php' | 'kotlin' | 'dart' | 'swift' | 'rust' | 'ruby';

/**
 * A double-quoted string literal. `common` suits JavaScript, Python, Go, Java
 * and C#. The other dialects differ in how they write a control character and
 * in which characters start interpolation and so need a backslash.
 */
function quote(value: string, dialect: StringDialect = 'common'): string {
  const bracedUnicode = dialect === 'php' || dialect === 'swift' || dialect === 'rust';
  const dollarInterpolates = dialect === 'php' || dialect === 'kotlin' || dialect === 'dart';
  let literal = '"';

  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    const code = value.charCodeAt(index);

    if (char === '"') literal += '\\"';
    else if (char === '\\') literal += '\\\\';
    else if (char === '\n') literal += '\\n';
    else if (char === '\r') literal += '\\r';
    else if (char === '\t') literal += '\\t';
    else if (code < 0x20 || code === 0x7f) {
      const hex = code.toString(16);
      literal += bracedUnicode ? `\\u{${hex}}` : `\\u${hex.padStart(4, '0')}`;
    } else if (char === '$' && dollarInterpolates) literal += '\\$';
    else if (char === '#' && dialect === 'ruby' && /[{$@]/.test(value[index + 1] ?? '')) {
      literal += '\\#';
    } else literal += char;
  }

  return `${literal}"`;
}

// ── JSON bodies ───────────────────────────────────────────────────────────────

/**
 * True when every number in the JSON text survives a trip through a
 * JavaScript number. A 19-digit ID does not, and re-printing it would send a
 * different ID.
 */
function numbersAreExact(json: string): boolean {
  const withoutStrings = json.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const numbers = withoutStrings.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) ?? [];

  return numbers.every((literal) => {
    const value = Number(literal);
    if (!Number.isFinite(value)) return false;
    if (/^-?\d+$/.test(literal)) return Number.isSafeInteger(value);
    const significant = literal.replace(/[eE].*$/, '').replace(/[-.]/g, '').replace(/^0+/, '');
    return significant.length <= 15;
  });
}

/**
 * The body as a JSON object or array, when it is one and can be written back
 * out as a literal without changing what is sent. Otherwise null, and the
 * body is sent as the exact string given.
 */
function readJsonBody(data: string): object | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return typeof parsed === 'object' && parsed !== null && numbersAreExact(data) ? parsed : null;
  } catch {
    return null;
  }
}

/** A JSON value as a Python literal, laid out like `JSON.stringify(value, null, 2)`. */
function pythonLiteral(value: unknown, depth = 0): string {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return quote(value);
  if (typeof value !== 'object') return String(value);

  const inner = '  '.repeat(depth + 1);
  const outer = '  '.repeat(depth);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => `${inner}${pythonLiteral(item, depth + 1)}`);
    return `[\n${items.join(',\n')}\n${outer}]`;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  const members = entries.map(
    ([key, item]) => `${inner}${quote(key)}: ${pythonLiteral(item, depth + 1)}`
  );
  return `{\n${members.join(',\n')}\n${outer}}`;
}

// ── Code generators ───────────────────────────────────────────────────────────

const capitalize = (method: string) =>
  method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();

/** The body's content type as the headers give it. */
function contentTypeOf(headers: Record<string, string>): string {
  return findHeader(headers, 'Content-Type') ?? 'application/json';
}

function generateJsFetch(request: CurlRequest): string {
  const { url, method, headers, data } = request;
  const headerKeys = Object.keys(headers);
  let code = '';

  if (headerKeys.length > 0) {
    code += `const myHeaders = new Headers();\n`;
    headerKeys.forEach((k) => {
      code += `myHeaders.append(${quote(k)}, ${quote(headers[k])});\n`;
    });
    code += `\n`;
  }

  if (data) {
    const json = readJsonBody(data);
    if (json) {
      code += `const raw = JSON.stringify(${JSON.stringify(json, null, 2)});\n\n`;
    } else {
      code += `const raw = ${quote(data)};\n\n`;
    }
  }

  code += `const requestOptions = {\n`;
  code += `  method: ${quote(method)},\n`;
  if (headerKeys.length > 0) {
    code += `  headers: myHeaders,\n`;
  }
  if (data) {
    code += `  body: raw,\n`;
  }
  code += `  redirect: "follow"\n`;
  code += `};\n\n`;

  code += `fetch(${quote(url)}, requestOptions)\n`;
  code += `  .then((response) => response.text())\n`;
  code += `  .then((result) => console.log(result))\n`;
  code += `  .catch((error) => console.error(error));`;

  return code;
}

function generateJsAxios(request: CurlRequest): string {
  const { url, method, headers, data } = request;
  const headerKeys = Object.keys(headers);
  let code = `import axios from 'axios';\n\n`;

  if (data) {
    const json = readJsonBody(data);
    if (json) {
      code += `const data = JSON.stringify(${JSON.stringify(json, null, 2)});\n\n`;
    } else {
      code += `const data = ${quote(data)};\n\n`;
    }
  }

  code += `const config = {\n`;
  code += `  method: ${quote(method.toLowerCase())},\n`;
  code += `  maxBodyLength: Infinity,\n`;
  code += `  url: ${quote(url)},\n`;

  if (headerKeys.length > 0) {
    code += `  headers: {\n`;
    headerKeys.forEach((k, idx) => {
      const comma = idx === headerKeys.length - 1 ? '' : ',';
      code += `    ${quote(k)}: ${quote(headers[k])}${comma}\n`;
    });
    code += `  },\n`;
  }

  if (data) {
    code += `  data: data\n`;
  }

  code += `};\n\n`;
  code += `axios.request(config)\n`;
  code += `  .then((response) => {\n`;
  code += `    console.log(JSON.stringify(response.data));\n`;
  code += `  })\n`;
  code += `  .catch((error) => {\n`;
  code += `    console.error(error);\n`;
  code += `  });`;

  return code;
}

function generatePythonRequests(request: CurlRequest): string {
  const { url, method, headers, data } = request;
  const headerKeys = Object.keys(headers);
  const json = data ? readJsonBody(data) : null;
  let code = `import requests\n`;
  if (json) {
    code += `import json\n`;
  }
  code += `\nurl = ${quote(url)}\n\n`;

  if (json) {
    // JSON's true, false and null are not Python names.
    code += `payload = json.dumps(${pythonLiteral(json)})\n`;
  } else if (data) {
    code += `payload = ${quote(data)}\n`;
  } else {
    code += `payload = {}\n`;
  }

  if (headerKeys.length > 0) {
    code += `headers = {\n`;
    headerKeys.forEach((k, idx) => {
      const comma = idx === headerKeys.length - 1 ? '' : ',';
      code += `  ${quote(k)}: ${quote(headers[k])}${comma}\n`;
    });
    code += `}\n\n`;
  } else {
    code += `headers = {}\n\n`;
  }

  code += `response = requests.request(${quote(method)}, url, headers=headers, data=payload)\n\n`;
  code += `print(response.text)\n`;

  return code;
}

function generateGoHttp(request: CurlRequest): string {
  const { url, method, headers, data } = request;
  const headerKeys = Object.keys(headers);
  let code = `package main\n\n`;
  code += `import (\n`;
  code += `  "fmt"\n`;
  if (data) {
    code += `  "strings"\n`;
  }
  code += `  "net/http"\n`;
  code += `  "io"\n`;
  code += `)\n\n`;

  code += `func main() {\n`;
  code += `  url := ${quote(url)}\n`;
  code += `  method := ${quote(method)}\n\n`;

  if (data) {
    // A raw string literal drops carriage returns, so those need the quoted form.
    const literal = data.includes('\r')
      ? quote(data)
      : `\`${data.replace(/`/g, '` + "`" + `')}\``;
    code += `  payload := strings.NewReader(${literal})\n\n`;
  } else {
    code += `  var payload io.Reader = nil\n\n`;
  }

  code += `  client := &http.Client{}\n`;
  code += `  req, err := http.NewRequest(method, url, payload)\n\n`;
  code += `  if err != nil {\n`;
  code += `    fmt.Println(err)\n`;
  code += `    return\n`;
  code += `  }\n`;

  if (headerKeys.length > 0) {
    headerKeys.forEach((k) => {
      code += `  req.Header.Add(${quote(k)}, ${quote(headers[k])})\n`;
    });
    code += `\n`;
  }

  code += `  res, err := client.Do(req)\n`;
  code += `  if err != nil {\n`;
  code += `    fmt.Println(err)\n`;
  code += `    return\n`;
  code += `  }\n`;
  code += `  defer res.Body.Close()\n\n`;

  code += `  body, err := io.ReadAll(res.Body)\n`;
  code += `  if err != nil {\n`;
  code += `    fmt.Println(err)\n`;
  code += `    return\n`;
  code += `  }\n`;
  code += `  fmt.Println(string(body))\n`;
  code += `}`;

  return code;
}

/** The methods `reqwest::Client` has a shortcut for. */
const REQWEST_SHORTCUTS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head']);

function generateRustReqwest(request: CurlRequest): string {
  const { url, method, headers, data } = request;
  const headerKeys = Object.keys(headers);
  let code = `use reqwest::header::{HeaderMap, HeaderValue, HeaderName};\n`;
  code += `use std::str::FromStr;\n\n`;

  code += `#[tokio::main]\n`;
  code += `async fn main() -> Result<(), Box<dyn std::error::Error>> {\n`;
  code += `    let client = reqwest::Client::new();\n`;

  if (headerKeys.length > 0) {
    code += `    let mut headers = HeaderMap::new();\n`;
    headerKeys.forEach((k) => {
      code += `    headers.insert(\n`;
      code += `        HeaderName::from_str(${quote(k, 'rust')})?,\n`;
      code += `        HeaderValue::from_str(${quote(headers[k], 'rust')})?,\n`;
      code += `    );\n`;
    });
    code += `\n`;
  }

  const shortcut = method.toLowerCase();
  let reqBuilder = REQWEST_SHORTCUTS.has(shortcut)
    ? `client.${shortcut}(${quote(url, 'rust')})`
    : `client.request(reqwest::Method::from_bytes(b${quote(method, 'rust')})?, ${quote(url, 'rust')})`;
  if (headerKeys.length > 0) {
    reqBuilder += `\n        .headers(headers)`;
  }
  if (data) {
    reqBuilder += `\n        .body(${quote(data, 'rust')})`;
  }

  code += `    let response = ${reqBuilder}\n        .send()\n        .await?;\n\n`;
  code += `    println!("{}", response.text().await?);\n`;
  code += `    Ok(())\n`;
  code += `}`;

  return code;
}

function generatePhpCurl(request: CurlRequest): string {
  const { url, method, headers, data } = request;
  const headerKeys = Object.keys(headers);
  let code = `<?php\n\n`;
  code += `$curl = curl_init();\n\n`;
  code += `curl_setopt_array($curl, [\n`;
  code += `  CURLOPT_URL => ${quote(url, 'php')},\n`;
  code += `  CURLOPT_RETURNTRANSFER => true,\n`;
  code += `  CURLOPT_CUSTOMREQUEST => ${quote(method, 'php')},\n`;
  if (data) {
    code += `  CURLOPT_POSTFIELDS => ${quote(data, 'php')},\n`;
  }
  if (headerKeys.length > 0) {
    code += `  CURLOPT_HTTPHEADER => [\n`;
    headerKeys.forEach((k) => {
      code += `    ${quote(`${k}: ${headers[k]}`, 'php')},\n`;
    });
    code += `  ],\n`;
  }
  code += `]);\n\n`;
  code += `$response = curl_exec($curl);\n`;
  code += `$err = curl_error($curl);\n\n`;
  code += `curl_close($curl);\n\n`;
  code += `if ($err) {\n`;
  code += `  echo "cURL Error: " . $err;\n`;
  code += `} else {\n`;
  code += `  echo $response;\n`;
  code += `}\n`;
  return code;
}

function generateJavaHttpUrlConnection(request: CurlRequest): string {
  const { url, method, headers, data } = request;
  const headerKeys = Object.keys(headers);
  let code = `import java.io.*;\n`;
  code += `import java.net.*;\n\n`;
  code += `public class Main {\n`;
  code += `  public static void main(String[] args) throws Exception {\n`;
  code += `    URL url = new URL(${quote(url)});\n`;
  code += `    HttpURLConnection conn = (HttpURLConnection) url.openConnection();\n`;
  code += `    conn.setRequestMethod(${quote(method)});\n`;
  headerKeys.forEach((k) => {
    code += `    conn.setRequestProperty(${quote(k)}, ${quote(headers[k])});\n`;
  });
  if (data) {
    code += `    conn.setDoOutput(true);\n`;
    code += `    try (OutputStream os = conn.getOutputStream()) {\n`;
    code += `      byte[] input = ${quote(data)}.getBytes("utf-8");\n`;
    code += `      os.write(input, 0, input.length);\n`;
    code += `    }\n`;
  }
  code += `\n    int responseCode = conn.getResponseCode();\n`;
  code += `    BufferedReader in = new BufferedReader(new InputStreamReader(\n`;
  code += `      responseCode >= 200 && responseCode < 300 ? conn.getInputStream() : conn.getErrorStream()));\n`;
  code += `    String line;\n`;
  code += `    StringBuilder response = new StringBuilder();\n`;
  code += `    while ((line = in.readLine()) != null) {\n`;
  code += `      response.append(line);\n`;
  code += `    }\n`;
  code += `    in.close();\n`;
  code += `    System.out.println(response.toString());\n`;
  code += `  }\n`;
  code += `}`;
  return code;
}

/** Methods OkHttp refuses to send without a body. */
const OKHTTP_NEEDS_BODY = new Set(['POST', 'PUT', 'PATCH', 'PROPPATCH', 'REPORT']);

function generateJavaOkHttp(request: CurlRequest): string {
  const { url, method, headers, data } = request;
  const headerKeys = Object.keys(headers);
  const emptyBody = !data && OKHTTP_NEEDS_BODY.has(method);
  let code = `import okhttp3.*;\n\n`;
  code += `public class Main {\n`;
  code += `  public static void main(String[] args) throws Exception {\n`;
  code += `    OkHttpClient client = new OkHttpClient();\n\n`;
  if (data) {
    code += `    MediaType mediaType = MediaType.parse(${quote(contentTypeOf(headers))});\n`;
    code += `    RequestBody body = RequestBody.create(mediaType, ${quote(data)});\n\n`;
  } else if (emptyBody) {
    code += `    RequestBody body = RequestBody.create(null, new byte[0]);\n\n`;
  }
  code += `    Request request = new Request.Builder()\n`;
  code += `      .url(${quote(url)})\n`;
  code += `      .method(${quote(method)}, ${data || emptyBody ? 'body' : 'null'})\n`;
  headerKeys.forEach((k) => {
    code += `      .addHeader(${quote(k)}, ${quote(headers[k])})\n`;
  });
  code += `      .build();\n\n`;
  code += `    Response response = client.newCall(request).execute();\n`;
  code += `    System.out.println(response.body().string());\n`;
  code += `  }\n`;
  code += `}`;
  return code;
}

/** The static properties `System.Net.Http.HttpMethod` has. */
const CSHARP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'PATCH']);

function generateCsharpHttpClient(request: CurlRequest): string {
  const { url, method, headers, data } = request;
  const headerKeys = Object.keys(headers);
  // StringContent takes the media type alone and throws on "; charset=...".
  const mediaType = contentTypeOf(headers).split(';')[0].trim();
  const httpMethod = CSHARP_METHODS.has(method)
    ? `HttpMethod.${capitalize(method)}`
    : `new HttpMethod(${quote(method)})`;
  let code = `using System;\n`;
  code += `using System.Net.Http;\n`;
  code += `using System.Text;\n`;
  code += `using System.Threading.Tasks;\n\n`;
  code += `class Program\n{\n`;
  code += `  static async Task Main(string[] args)\n  {\n`;
  code += `    var client = new HttpClient();\n\n`;
  code += `    var request = new HttpRequestMessage(${httpMethod}, ${quote(url)});\n`;
  headerKeys
    .filter((k) => k.toLowerCase() !== 'content-type')
    .forEach((k) => {
      code += `    request.Headers.Add(${quote(k)}, ${quote(headers[k])});\n`;
    });
  if (data) {
    code += `    request.Content = new StringContent(${quote(data)}, Encoding.UTF8, ${quote(mediaType)});\n`;
  }
  code += `\n    var response = await client.SendAsync(request);\n`;
  code += `    var body = await response.Content.ReadAsStringAsync();\n`;
  code += `    Console.WriteLine(body);\n`;
  code += `  }\n`;
  code += `}`;
  return code;
}

function generateRubyNetHttp(request: CurlRequest): string {
  const { url, method, headers, data } = request;
  const headerKeys = Object.keys(headers);
  let code = `require 'net/http'\n`;
  code += `require 'uri'\n`;
  code += `require 'json'\n\n`;
  code += `uri = URI.parse(${quote(url, 'ruby')})\n`;
  code += `http = Net::HTTP.new(uri.host, uri.port)\n`;
  code += `http.use_ssl = uri.scheme == 'https'\n\n`;
  code += `request = Net::HTTP::${capitalize(method)}.new(uri.request_uri)\n`;
  headerKeys.forEach((k) => {
    code += `request[${quote(k, 'ruby')}] = ${quote(headers[k], 'ruby')}\n`;
  });
  if (data) {
    code += `request.body = ${quote(data, 'ruby')}\n`;
  }
  code += `\nresponse = http.request(request)\n`;
  code += `puts response.body\n`;
  return code;
}

function generateSwiftUrlSession(request: CurlRequest): string {
  const { url, method, headers, data } = request;
  const headerKeys = Object.keys(headers);
  let code = `import Foundation\n\n`;
  code += `let url = URL(string: ${quote(url, 'swift')})!\n`;
  code += `var request = URLRequest(url: url)\n`;
  code += `request.httpMethod = ${quote(method, 'swift')}\n`;
  headerKeys.forEach((k) => {
    code += `request.setValue(${quote(headers[k], 'swift')}, forHTTPHeaderField: ${quote(k, 'swift')})\n`;
  });
  if (data) {
    code += `request.httpBody = ${quote(data, 'swift')}.data(using: .utf8)\n`;
  }
  code += `\nlet task = URLSession.shared.dataTask(with: request) { data, response, error in\n`;
  code += `  if let error = error {\n`;
  code += `    print("Error: \\(error)")\n`;
  code += `    return\n`;
  code += `  }\n`;
  code += `  if let data = data, let body = String(data: data, encoding: .utf8) {\n`;
  code += `    print(body)\n`;
  code += `  }\n`;
  code += `}\n`;
  code += `task.resume()\n`;
  code += `RunLoop.main.run()\n`;
  return code;
}

function generateKotlinOkHttp(request: CurlRequest): string {
  const { url, method, headers, data } = request;
  const headerKeys = Object.keys(headers);
  const emptyBody = !data && OKHTTP_NEEDS_BODY.has(method);
  let code = `import okhttp3.*\n`;
  code += `import okhttp3.MediaType.Companion.toMediaType\n`;
  code += `import okhttp3.RequestBody.Companion.toRequestBody\n\n`;
  code += `fun main() {\n`;
  code += `  val client = OkHttpClient()\n\n`;
  if (data) {
    code += `  val mediaType = ${quote(contentTypeOf(headers), 'kotlin')}.toMediaType()\n`;
    code += `  val body = ${quote(data, 'kotlin')}.toRequestBody(mediaType)\n\n`;
  } else if (emptyBody) {
    code += `  val body = ByteArray(0).toRequestBody()\n\n`;
  }
  code += `  val request = Request.Builder()\n`;
  code += `    .url(${quote(url, 'kotlin')})\n`;
  code += `    .method(${quote(method, 'kotlin')}, ${data || emptyBody ? 'body' : 'null'})\n`;
  headerKeys.forEach((k) => {
    code += `    .addHeader(${quote(k, 'kotlin')}, ${quote(headers[k], 'kotlin')})\n`;
  });
  code += `    .build()\n\n`;
  code += `  val response = client.newCall(request).execute()\n`;
  code += `  println(response.body?.string())\n`;
  code += `}\n`;
  return code;
}

/** The top-level helpers of `package:http`, and those that take no body. */
const DART_HELPERS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head']);
const DART_BODILESS_HELPERS = new Set(['get', 'head']);

function generateDartHttp(request: CurlRequest): string {
  const { url, method, headers, data } = request;
  const headerKeys = Object.keys(headers);
  let code = `import 'package:http/http.dart' as http;\n\n`;
  code += `void main() async {\n`;
  code += `  final url = Uri.parse(${quote(url, 'dart')});\n`;
  if (headerKeys.length > 0) {
    code += `  final headers = {\n`;
    headerKeys.forEach((k, idx) => {
      const comma = idx === headerKeys.length - 1 ? '' : ',';
      code += `    ${quote(k, 'dart')}: ${quote(headers[k], 'dart')}${comma}\n`;
    });
    code += `  };\n\n`;
  }
  if (data) {
    code += `  final body = ${quote(data, 'dart')};\n\n`;
  }

  const dartMethod = method.toLowerCase();
  const hasHelper =
    DART_HELPERS.has(dartMethod) && !(data && DART_BODILESS_HELPERS.has(dartMethod));
  if (hasHelper) {
    const headersArg = headerKeys.length > 0 ? ', headers: headers' : '';
    const bodyArg = data ? ', body: body' : '';
    code += `  final response = await http.${dartMethod}(url${headersArg}${bodyArg});\n`;
  } else {
    // No helper for this method (or none that takes a body): build the request.
    code += `  final request = http.Request(${quote(method, 'dart')}, url);\n`;
    if (headerKeys.length > 0) {
      code += `  request.headers.addAll(headers);\n`;
    }
    if (data) {
      code += `  request.body = body;\n`;
    }
    code += `  final response = await http.Response.fromStream(await request.send());\n`;
  }
  code += `  print(response.body);\n`;
  code += `}\n`;
  return code;
}

const GENERATORS: Record<CurlTargetLanguage, (request: CurlRequest) => string> = {
  'js-fetch': generateJsFetch,
  'js-axios': generateJsAxios,
  'python-requests': generatePythonRequests,
  'go-http': generateGoHttp,
  'rust-reqwest': generateRustReqwest,
  'php-curl': generatePhpCurl,
  'java-httpurlconnection': generateJavaHttpUrlConnection,
  'java-okhttp': generateJavaOkHttp,
  'csharp-httpclient': generateCsharpHttpClient,
  'ruby-net-http': generateRubyNetHttp,
  'swift-urlsession': generateSwiftUrlSession,
  'kotlin-okhttp': generateKotlinOkHttp,
  'dart-http': generateDartHttp,
};

/** Writes the request as a runnable snippet in the given language. */
export function generateRequestCode(request: CurlRequest, language: CurlTargetLanguage): string {
  return GENERATORS[language](request);
}
