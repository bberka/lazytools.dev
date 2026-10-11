/**
 * SQL formatter logic: formatting through the sql-formatter package (loaded
 * on first use) and a one-line minifier.
 *
 * The minifier reads the text token by token. String literals, quoted
 * identifiers and block comments are copied untouched, and a line comment is
 * rewritten as a block comment: on one line `-- note` would comment out the
 * rest of the statement. How strings and comments are written differs per
 * dialect; the tables below follow sql-formatter's own tokenizer settings.
 */

export type SqlDialect =
  | 'sql'
  | 'bigquery'
  | 'clickhouse'
  | 'db2'
  | 'db2i'
  | 'duckdb'
  | 'hive'
  | 'mariadb'
  | 'mysql'
  | 'n1ql'
  | 'plsql'
  | 'postgresql'
  | 'redshift'
  | 'singlestoredb'
  | 'snowflake'
  | 'spark'
  | 'sqlite'
  | 'tidb'
  | 'transactsql'
  | 'trino';

export type SqlKeywordCase = 'preserve' | 'upper' | 'lower';
export type SqlLogicalOperatorNewline = 'before' | 'after';

export interface SqlFormatSettings {
  dialect: SqlDialect;
  /** "2", "4" or "8" spaces, or "tab". */
  indentation: string;
  keywordCase: SqlKeywordCase;
  logicalOperatorNewline: SqlLogicalOperatorNewline;
}

export interface SqlFormatResult {
  output: string;
  error: string;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

type SqlFormatterModule = typeof import('sql-formatter');

let formatterModule: Promise<SqlFormatterModule> | null = null;

function loadFormatter(): Promise<SqlFormatterModule> {
  formatterModule ??= import('sql-formatter').catch((error: unknown) => {
    // Do not cache a failed download; the next call tries again.
    formatterModule = null;
    throw error;
  });
  return formatterModule;
}

/**
 * A grammar error from sql-formatter carries a dump of every parser state it
 * was in, well over a thousand lines. Its first line names the token and the
 * position, which is all a reader can use.
 */
function describeFormatError(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';
  if (!message) return 'Error formatting SQL.';
  return message.startsWith('Parse error at token') ? message.split('\n')[0] : message;
}

/** Formats SQL. Blank text gives empty output; a failure is reported in `error`. */
export async function formatSql(sql: string, settings: SqlFormatSettings): Promise<SqlFormatResult> {
  if (!sql.trim()) {
    return { output: '', error: '' };
  }

  let formatter: SqlFormatterModule;
  try {
    formatter = await loadFormatter();
  } catch {
    return {
      output: '',
      error: 'The SQL formatter could not be loaded. Check your connection and try again.',
    };
  }

  try {
    const useTabs = settings.indentation === 'tab';
    const output = formatter.format(sql, {
      language: settings.dialect,
      tabWidth: useTabs ? 2 : Number(settings.indentation),
      useTabs,
      keywordCase: settings.keywordCase,
      logicalOperatorNewline: settings.logicalOperatorNewline,
    });
    return { output, error: '' };
  } catch (error) {
    return { output: '', error: describeFormatError(error) };
  }
}

// ---------------------------------------------------------------------------
// Minifying
// ---------------------------------------------------------------------------

/** Dialects where a backslash escapes the next character inside '...'. */
const BACKSLASH_IN_SINGLE_QUOTES: ReadonlySet<SqlDialect> = new Set<SqlDialect>([
  'sql',
  'bigquery',
  'clickhouse',
  'hive',
  'mariadb',
  'mysql',
  'n1ql',
  'singlestoredb',
  'snowflake',
  'spark',
  'tidb',
]);

/** Dialects where a backslash escapes the next character inside "...". */
const BACKSLASH_IN_DOUBLE_QUOTES: ReadonlySet<SqlDialect> = new Set<SqlDialect>([
  'bigquery',
  'clickhouse',
  'hive',
  'mariadb',
  'mysql',
  'n1ql',
  'singlestoredb',
  'spark',
  'tidb',
]);

/** E'...' strings take backslash escapes although plain strings do not. */
const ESCAPE_STRING_PREFIX: ReadonlySet<SqlDialect> = new Set<SqlDialect>(['duckdb', 'postgresql']);
/** R'...' strings take no backslash escapes although plain strings do. */
const RAW_STRING_PREFIX: ReadonlySet<SqlDialect> = new Set<SqlDialect>(['bigquery', 'spark']);
/** '''...''' and """...""" strings that may span lines. */
const TRIPLE_QUOTES: ReadonlySet<SqlDialect> = new Set<SqlDialect>(['bigquery']);
/** q'[...]' strings with a chosen delimiter. */
const Q_QUOTES: ReadonlySet<SqlDialect> = new Set<SqlDialect>(['plsql']);
/** $$...$$ and $tag$...$tag$ strings. */
const DOLLAR_QUOTES: ReadonlySet<SqlDialect> = new Set<SqlDialect>([
  'clickhouse',
  'duckdb',
  'postgresql',
  'snowflake',
]);
/** [identifier] quoting. Elsewhere "[" opens an array. */
const BRACKET_IDENTIFIERS: ReadonlySet<SqlDialect> = new Set<SqlDialect>(['sqlite', 'transactsql']);
/** "#" starts a line comment. Elsewhere it is an operator or part of a name. */
const HASH_COMMENTS: ReadonlySet<SqlDialect> = new Set<SqlDialect>([
  'bigquery',
  'clickhouse',
  'mariadb',
  'mysql',
  'n1ql',
  'singlestoredb',
  'tidb',
]);
/** "//" starts a line comment. */
const SLASH_COMMENTS: ReadonlySet<SqlDialect> = new Set<SqlDialect>(['snowflake']);
/** Block comments nest. */
const NESTED_COMMENTS: ReadonlySet<SqlDialect> = new Set<SqlDialect>([
  'db2i',
  'duckdb',
  'postgresql',
  'transactsql',
]);

const DOLLAR_TAG = /\$(?:[A-Za-z_]\w*)?\$/y;
const LINE_BREAK = /[\r\n]/g;
const WORD_CHARACTER = /[\w$]/;
/** One or two letters directly before a quote, as in E'..', R"..", nq'[..]'. */
const STRING_PREFIX = /(?:^|[^A-Za-z0-9_$])([A-Za-z]{1,2})$/;
const Q_QUOTE_CLOSERS: Record<string, string> = { '[': ']', '{': '}', '(': ')', '<': '>' };

/** Index just past a quoted run that opened at `from`. */
function endOfQuoted(sql: string, from: number, quote: string, backslashEscapes: boolean): number {
  let index = from + 1;
  while (index < sql.length) {
    const character = sql[index];
    if (character === '\\' && backslashEscapes) {
      index += 2;
    } else if (character !== quote) {
      index += 1;
    } else if (sql[index + 1] === quote) {
      // A doubled quote stands for one quote character.
      index += 2;
    } else {
      return index + 1;
    }
  }
  return sql.length;
}

function endOfTripleQuoted(sql: string, from: number, backslashEscapes: boolean): number {
  const delimiter = sql.slice(from, from + 3);
  let index = from + 3;
  while (index < sql.length) {
    if (sql[index] === '\\' && backslashEscapes) {
      index += 2;
    } else if (sql.startsWith(delimiter, index)) {
      return index + 3;
    } else {
      index += 1;
    }
  }
  return sql.length;
}

function endOfBlockComment(sql: string, from: number, nested: boolean): number {
  let depth = 1;
  let index = from + 2;
  while (index < sql.length) {
    if (sql.startsWith('*/', index)) {
      depth -= 1;
      index += 2;
      if (depth === 0) return index;
    } else if (nested && sql.startsWith('/*', index)) {
      depth += 1;
      index += 2;
    } else {
      index += 1;
    }
  }
  return sql.length;
}

function endAfter(sql: string, marker: string, from: number): number {
  const index = sql.indexOf(marker, from);
  return index === -1 ? sql.length : index + marker.length;
}

/** Length of the line-comment opener at `index`, or 0 when there is none. */
function lineCommentOpener(sql: string, index: number, dialect: SqlDialect): number {
  if (sql.startsWith('--', index)) return 2;
  if (sql[index] === '#' && HASH_COMMENTS.has(dialect)) return 1;
  if (SLASH_COMMENTS.has(dialect) && sql.startsWith('//', index)) return 2;
  return 0;
}

function toBlockComment(body: string): string {
  // Keep what the note says without letting it open or close a comment.
  const safe = body.replace(/\*\//g, '* /').replace(/\/\*/g, '/ *');
  // "--+ hint" is an optimizer hint and only stays one as "/*+ hint */".
  return safe.startsWith('+') ? `/*${safe} */` : `/* ${safe} */`;
}

function squeeze(code: string): string {
  return code
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .replace(/ ?; ?/g, '; ');
}

/**
 * Collapses SQL onto one line. Whitespace inside string literals, quoted
 * identifiers and block comments is left alone, and line comments become
 * block comments so they cannot swallow the code that follows them.
 */
export function minifySql(sql: string, dialect: SqlDialect = 'sql'): string {
  const parts: string[] = [];
  let code = '';
  let index = 0;

  const keep = (end: number) => {
    parts.push(squeeze(code), sql.slice(index, end));
    code = '';
    index = end;
  };

  while (index < sql.length) {
    const character = sql[index];

    const opener = lineCommentOpener(sql, index, dialect);
    if (opener > 0) {
      LINE_BREAK.lastIndex = index;
      const end = LINE_BREAK.exec(sql)?.index ?? sql.length;
      const body = sql.slice(index + opener, end).trim();
      if (body) {
        parts.push(squeeze(`${code} `), toBlockComment(body));
        code = ' ';
      } else {
        code += ' ';
      }
      index = end;
      continue;
    }

    if (sql.startsWith('/*', index)) {
      keep(endOfBlockComment(sql, index, NESTED_COMMENTS.has(dialect)));
      continue;
    }

    if (character === "'" || character === '"') {
      const prefix = STRING_PREFIX.exec(code.slice(-3))?.[1].toUpperCase() ?? '';

      if (character === "'" && Q_QUOTES.has(dialect) && (prefix === 'Q' || prefix === 'NQ')) {
        const delimiter = sql[index + 1] ?? '';
        const closer = `${Q_QUOTE_CLOSERS[delimiter] ?? delimiter}'`;
        keep(endAfter(sql, closer, index + 2));
        continue;
      }

      let backslashEscapes =
        character === "'"
          ? BACKSLASH_IN_SINGLE_QUOTES.has(dialect)
          : BACKSLASH_IN_DOUBLE_QUOTES.has(dialect);
      if (character === "'" && prefix === 'E' && ESCAPE_STRING_PREFIX.has(dialect)) {
        backslashEscapes = true;
      }
      if (RAW_STRING_PREFIX.has(dialect) && (prefix === 'R' || prefix === 'RB' || prefix === 'BR')) {
        backslashEscapes = false;
      }

      if (TRIPLE_QUOTES.has(dialect) && sql.startsWith(character.repeat(3), index)) {
        keep(endOfTripleQuoted(sql, index, backslashEscapes));
      } else {
        keep(endOfQuoted(sql, index, character, backslashEscapes));
      }
      continue;
    }

    if (character === '`') {
      keep(endOfQuoted(sql, index, '`', false));
      continue;
    }

    if (character === '[' && BRACKET_IDENTIFIERS.has(dialect)) {
      keep(endOfQuoted(sql, index, ']', false));
      continue;
    }

    if (
      character === '$' &&
      DOLLAR_QUOTES.has(dialect) &&
      !WORD_CHARACTER.test(code.slice(-1))
    ) {
      DOLLAR_TAG.lastIndex = index;
      const tag = DOLLAR_TAG.exec(sql)?.[0];
      if (tag) {
        keep(endAfter(sql, tag, index + tag.length));
        continue;
      }
    }

    code += character;
    index += 1;
  }

  parts.push(squeeze(code));
  return parts.join('').trim();
}
