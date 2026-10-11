import { test, expect } from '@playwright/test';
import { formatSql, minifySql, type SqlFormatSettings } from '@/lib/tools/sql-formatter';

const DEFAULTS: SqlFormatSettings = {
  dialect: 'sql',
  indentation: '2',
  keywordCase: 'upper',
  logicalOperatorNewline: 'before',
};

test.describe('formatSql', () => {
  test('formats a query with upper-case keywords and two-space indent', async () => {
    expect(await formatSql('select a, b from t where x = 1 and y = 2', DEFAULTS)).toEqual({
      output: 'SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1\n  AND y = 2',
      error: '',
    });
  });

  test('applies indentation, keyword case and operator placement', async () => {
    const sql = 'select a from t where x = 1 and y = 2';

    expect((await formatSql(sql, { ...DEFAULTS, indentation: '4' })).output).toContain('\n    a\n');
    expect((await formatSql(sql, { ...DEFAULTS, indentation: 'tab' })).output).toContain('\n\ta\n');
    expect((await formatSql(sql, { ...DEFAULTS, keywordCase: 'lower' })).output).toContain('select\n');
    expect((await formatSql('SeLeCt a', { ...DEFAULTS, keywordCase: 'preserve' })).output).toBe('SeLeCt\n  a');
    expect((await formatSql(sql, { ...DEFAULTS, logicalOperatorNewline: 'after' })).output).toContain('x = 1 AND\n');
  });

  test('uses the dialect', async () => {
    const sql = 'select `a` from t';

    expect((await formatSql(sql, { ...DEFAULTS, dialect: 'mysql' })).error).toBe('');
    expect((await formatSql(sql, { ...DEFAULTS, dialect: 'postgresql' })).error).toContain('Parse error');
  });

  test('gives empty output for empty and whitespace-only text', async () => {
    expect(await formatSql('', DEFAULTS)).toEqual({ output: '', error: '' });
    expect(await formatSql('  \n\t', DEFAULTS)).toEqual({ output: '', error: '' });
  });

  test('keeps Unicode and emoji in identifiers and strings', async () => {
    expect((await formatSql(`select "naïve 😀", '日本' from t`, DEFAULTS)).output).toBe(
      `SELECT\n  "naïve 😀",\n  '日本'\nFROM\n  t`
    );
  });

  // An unbalanced bracket, which every query has while it is being typed,
  // put a parser-state dump of more than 70,000 characters into the banner.
  test('reports a grammar error as one line', async () => {
    for (const sql of ['select (', 'select )', 'select a from t where (x = 1']) {
      const result = await formatSql(sql, DEFAULTS);

      expect(result.output).toBe('');
      expect(result.error).toMatch(/^Parse error at token: .+ at line 1 column \d+$/);
    }
  });

  test('keeps the hint about choosing a dialect on tokenizer errors', async () => {
    const result = await formatSql('select {x} from t', DEFAULTS);

    expect(result.output).toBe('');
    expect(result.error).toContain('Parse error: Unexpected "{x} from t" at line 1 column 8.');
    expect(result.error).toContain('select a more specific dialect');
  });
});

test.describe('minifySql', () => {
  test('collapses whitespace onto one line', () => {
    expect(minifySql('SELECT a,\n       b\nFROM   t\nWHERE  x = 1\n')).toBe('SELECT a, b FROM t WHERE x = 1');
  });

  test('tightens brackets and spaces out statement separators', () => {
    expect(minifySql('select count( * ) from ( select 1 ) x ;select 2;')).toBe(
      'select count(*) from (select 1) x; select 2;'
    );
  });

  test('returns an empty string for empty and whitespace-only text', () => {
    expect(minifySql('')).toBe('');
    expect(minifySql(' \n\t ')).toBe('');
  });

  // Every whitespace run was collapsed, including the ones inside literals.
  test('leaves the contents of string literals alone', () => {
    expect(minifySql("select 'two  spaces', 'tab\there', 'line\nbreak'  from t")).toBe(
      "select 'two  spaces', 'tab\there', 'line\nbreak' from t"
    );
    expect(minifySql("select 'it''s  ( a ; b )'  ,  1")).toBe("select 'it''s  ( a ; b )' , 1");
  });

  test('leaves quoted identifiers alone', () => {
    expect(minifySql('select "my  col" ,  `other  col`\nfrom t')).toBe('select "my  col" , `other  col` from t');
    expect(minifySql('select [my  col]\nfrom [a]]b  c]', 'transactsql')).toBe('select [my  col] from [a]]b  c]');
  });

  // On one line "-- note" commented out the rest of the statement.
  test('turns a line comment into a block comment', () => {
    expect(minifySql('select 1 -- first column\nfrom t')).toBe('select 1 /* first column */ from t');
    expect(minifySql('-- header\nselect 1')).toBe('/* header */ select 1');
    expect(minifySql('select 1 -- trailing')).toBe('select 1 /* trailing */');
    expect(minifySql('select 1--tight\nfrom t')).toBe('select 1 /* tight */ from t');
  });

  test('drops an empty line comment', () => {
    expect(minifySql('select 1 --\nfrom t')).toBe('select 1 from t');
    expect(minifySql('select 1 --   \r\nfrom t')).toBe('select 1 from t');
  });

  test('keeps a converted comment from opening or closing another', () => {
    expect(minifySql('select 1 -- see */ and /* here\nfrom t')).toBe('select 1 /* see * / and / * here */ from t');
  });

  test('keeps an optimizer hint a hint', () => {
    expect(minifySql('select --+ INDEX(t idx)\n* from t', 'plsql')).toBe('select /*+ INDEX(t idx) */ * from t');
  });

  test('copies block comments exactly', () => {
    expect(minifySql('select /*+ USE_HASH( a  b ) */ 1\n/* multi\n   line */ from t')).toBe(
      'select /*+ USE_HASH( a  b ) */ 1 /* multi\n   line */ from t'
    );
  });

  test('does not read comment markers inside strings or strings inside comments', () => {
    expect(minifySql("select '-- not a comment', '/* nor  this */'\nfrom t")).toBe(
      "select '-- not a comment', '/* nor  this */' from t"
    );
    expect(minifySql("select 1 -- don't worry\nfrom t  where  a = 'x  y'")).toBe(
      "select 1 /* don't worry */ from t where a = 'x  y'"
    );
    expect(minifySql("select 1 /* it's  fine */ ,  'a  b'")).toBe("select 1 /* it's  fine */ , 'a  b'");
  });

  test('treats "#" as a comment only where the dialect does', () => {
    expect(minifySql('select 1 # note\nfrom t', 'mysql')).toBe('select 1 /* note */ from t');
    expect(minifySql("select a #> '{b}'\nfrom t", 'postgresql')).toBe("select a #> '{b}' from t");
    expect(minifySql('select * from #temp\nwhere x = 1', 'transactsql')).toBe('select * from #temp where x = 1');
  });

  test('treats "//" as a comment only in Snowflake', () => {
    expect(minifySql('select 1 // note\nfrom t', 'snowflake')).toBe('select 1 /* note */ from t');
    expect(minifySql('select 10 // 3\nfrom t', 'duckdb')).toBe('select 10 // 3 from t');
  });

  test('follows the backslash rules of the dialect', () => {
    // MySQL: \' is an escaped quote, so the string runs on to the last quote.
    expect(minifySql("select 'it\\'s  -- fine'   from t", 'mysql')).toBe("select 'it\\'s  -- fine' from t");
    // PostgreSQL: a backslash is an ordinary character and the string ends at the quote.
    expect(minifySql("select 'C:\\'  ,  'x  y'", 'postgresql')).toBe("select 'C:\\' , 'x  y'");
    // ...unless the string is written E'...'.
    expect(minifySql("select E'it\\'s  -- fine'   from t", 'postgresql')).toBe("select E'it\\'s  -- fine' from t");
    // BigQuery: raw strings switch the backslash off again.
    expect(minifySql("select R'C:\\'  ,  'x  y'", 'bigquery')).toBe("select R'C:\\' , 'x  y'");
  });

  test('copies dollar-quoted bodies exactly where the dialect has them', () => {
    const body = "$fn$\nBEGIN\n  -- keep  me\n  RETURN 'a  b';\nEND;\n$fn$";

    expect(minifySql(`create function f()  returns text as ${body}\nlanguage plpgsql ;`, 'postgresql')).toBe(
      `create function f() returns text as ${body} language plpgsql;`
    );
    expect(minifySql('select $$a  b$$  ,  $1', 'postgresql')).toBe('select $$a  b$$ , $1');
    expect(minifySql('select $1  ,  $2\nfrom t', 'postgresql')).toBe('select $1 , $2 from t');
  });

  test('copies triple-quoted and q-quoted strings exactly', () => {
    expect(minifySql(`select '''it's  two\nlines'''  ,  1`, 'bigquery')).toBe(`select '''it's  two\nlines''' , 1`);
    expect(minifySql("select q'[it's  ; fine]'  ,  1 from dual", 'plsql')).toBe("select q'[it's  ; fine]' , 1 from dual");
  });

  test('respects nested block comments where the dialect nests them', () => {
    const sql = 'select /* a /* b */  c */  1';

    expect(minifySql(sql, 'postgresql')).toBe('select /* a /* b */  c */ 1');
    expect(minifySql(sql, 'mysql')).toBe('select /* a /* b */ c */ 1');
  });

  test('copies an unterminated string or comment to the end instead of looping', () => {
    expect(minifySql("select 'never  closed\nfrom t")).toBe("select 'never  closed\nfrom t");
    expect(minifySql('select 1 /* never  closed\nfrom t')).toBe('select 1 /* never  closed\nfrom t');
  });

  test('keeps Unicode and emoji', () => {
    expect(minifySql("select 'héllo  😀' ,\n  名前\nfrom  表")).toBe("select 'héllo  😀' , 名前 from 表");
  });

  test('minified output formats back to the same query', async () => {
    const source = "select a, -- pick a\n  'x  y' as b\nfrom t -- the table\nwhere a > 1";
    const direct = await formatSql(source.replace(/--[^\n]*/g, ''), DEFAULTS);
    const viaMinified = await formatSql(minifySql(source).replace(/\/\*.*?\*\//g, ''), DEFAULTS);

    expect(viaMinified.error).toBe('');
    expect(viaMinified.output).toBe(direct.output);
  });
});
