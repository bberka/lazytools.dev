'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Database, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCopyToClipboard } from '@/hooks';
import { describeLineCount } from '@/lib/tools/formatter-output';
import {
  formatSql,
  minifySql,
  type SqlDialect,
  type SqlFormatResult,
  type SqlFormatSettings,
  type SqlKeywordCase,
  type SqlLogicalOperatorNewline,
} from '@/lib/tools/sql-formatter';

const DIALECT_OPTIONS: Array<{ value: SqlDialect; label: string }> = [
  { value: 'sql', label: 'Standard SQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'transactsql', label: 'SQL Server (T-SQL)' },
  { value: 'plsql', label: 'Oracle PL/SQL' },
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'bigquery', label: 'BigQuery' },
  { value: 'redshift', label: 'Amazon Redshift' },
  { value: 'spark', label: 'Apache Spark SQL' },
  { value: 'trino', label: 'Trino / Presto' },
  { value: 'clickhouse', label: 'ClickHouse' },
  { value: 'duckdb', label: 'DuckDB' },
  { value: 'db2', label: 'IBM DB2' },
  { value: 'db2i', label: 'IBM DB2 i' },
  { value: 'hive', label: 'Apache Hive' },
  { value: 'n1ql', label: 'Couchbase N1QL' },
  { value: 'singlestoredb', label: 'SingleStoreDB' },
  { value: 'tidb', label: 'TiDB' },
];

const CASE_OPTIONS: Array<{ value: SqlKeywordCase; label: string }> = [
  { value: 'preserve', label: 'Preserve' },
  { value: 'upper', label: 'UPPERCASE' },
  { value: 'lower', label: 'lowercase' },
];

const LOGICAL_OPERATOR_OPTIONS: Array<{
  value: SqlLogicalOperatorNewline;
  label: string;
}> = [
  { value: 'before', label: 'Before operator' },
  { value: 'after', label: 'After operator' },
];

const NO_RESULT: SqlFormatResult = { output: '', error: '' };

export function SqlFormatter() {
  const [input, setInput] = useState('');
  const [dialect, setDialect] = useState<SqlDialect>('sql');
  const [indentation, setIndentation] = useState('2');
  const [keywordCase, setKeywordCase] = useState<SqlKeywordCase>('upper');
  const [logicalOperatorNewline, setLogicalOperatorNewline] =
    useState<SqlLogicalOperatorNewline>('before');
  // Minify replaces the formatted output until the SQL or a setting changes.
  const [isMinified, setIsMinified] = useState(false);
  const [formatted, setFormatted] = useState<SqlFormatResult>(NO_RESULT);
  // False until the formatter has answered once, i.e. while its chunk loads.
  const [hasVerdict, setHasVerdict] = useState(false);
  const copy = useCopyToClipboard();

  const settings = useMemo<SqlFormatSettings>(
    () => ({ dialect, indentation, keywordCase, logicalOperatorNewline }),
    [dialect, indentation, keywordCase, logicalOperatorNewline]
  );

  // Format whenever the SQL or a setting changes. Only the latest request may
  // land: an answer for text that has since been edited or cleared is dropped.
  useEffect(() => {
    let isCurrent = true;

    void formatSql(input, settings).then((result) => {
      if (!isCurrent) return;
      setFormatted(result);
      if (input.trim()) setHasVerdict(true);
    });

    return () => {
      isCurrent = false;
    };
  }, [input, settings]);

  const hasInput = Boolean(input.trim());
  const error = hasInput ? formatted.error : '';

  const output = useMemo(() => {
    if (!input.trim()) return '';
    return isMinified ? minifySql(input, dialect) : formatted.output;
  }, [input, isMinified, dialect, formatted]);

  const handleClear = () => {
    setInput('');
    setIsMinified(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Input SQL
          </CardTitle>
          <CardDescription>
            Format SQL with a selectable database dialect and keyword style.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={input}
            onChange={(event) => {
              setInput((event.target as HTMLTextAreaElement).value);
              setIsMinified(false);
            }}
            placeholder="SELECT * FROM users WHERE id = 1"
            aria-label="SQL input"
            rows={10}
            className="font-mono text-sm"
          />

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <label htmlFor="sql-dialect" className="text-sm font-medium">SQL dialect</label>
              <Select
                value={dialect}
                onValueChange={(value) => {
                  setDialect(value as SqlDialect);
                  setIsMinified(false);
                }}
              >
                <SelectTrigger id="sql-dialect">
                  <SelectValue placeholder="Choose dialect" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {DIALECT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="sql-indentation" className="text-sm font-medium">Indentation</label>
              <Select
                value={indentation}
                onValueChange={(value) => {
                  setIndentation(value);
                  setIsMinified(false);
                }}
              >
                <SelectTrigger id="sql-indentation">
                  <SelectValue placeholder="Indentation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="2">2 spaces</SelectItem>
                    <SelectItem value="4">4 spaces</SelectItem>
                    <SelectItem value="8">8 spaces</SelectItem>
                    <SelectItem value="tab">Tab</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="sql-keyword-case" className="text-sm font-medium">Keyword case</label>
              <Select
                value={keywordCase}
                onValueChange={(value) => {
                  setKeywordCase(value as SqlKeywordCase);
                  setIsMinified(false);
                }}
              >
                <SelectTrigger id="sql-keyword-case">
                  <SelectValue placeholder="Keyword case" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {CASE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="sql-operator-wrapping" className="text-sm font-medium">AND / OR wrapping</label>
              <Select
                value={logicalOperatorNewline}
                onValueChange={(value) => {
                  setLogicalOperatorNewline(value as SqlLogicalOperatorNewline);
                  setIsMinified(false);
                }}
              >
                <SelectTrigger id="sql-operator-wrapping">
                  <SelectValue placeholder="Operator wrapping" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {LOGICAL_OPERATOR_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button onClick={() => setIsMinified(true)} variant="outline" size="sm" className="min-h-11 sm:min-h-9">
              Minify
            </Button>

            <Button onClick={handleClear} variant="outline" size="sm" className="min-h-11 sm:min-h-9">
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>

          {/* Validation status diagnostics */}
          {hasInput && hasVerdict && (
            <div
              className={`flex items-start gap-3 rounded-md px-4 py-3 text-sm ${
                !error
                  ? 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}
            >
              {!error ? (
                <>
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <strong>Valid SQL:</strong> Formatted successfully under {DIALECT_OPTIONS.find(d => d.value === dialect)?.label ?? dialect} dialect.
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div className="min-w-0 break-words">
                    <strong>Formatting Exception:</strong> {error}
                  </div>
                </>
              )}
            </div>
          )}

          {hasInput && !hasVerdict && (
            <div className="text-xs text-muted-foreground italic">Loading SQL formatter...</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Formatted Output</CardTitle>
          <CardDescription>
            {output ? describeLineCount(output) : 'Output will appear here'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={output}
            readOnly
            placeholder="Formatted SQL will appear here..."
            aria-label="Formatted SQL output"
            rows={10}
            className="font-mono text-sm"
          />

          <Button
            onClick={() => copy.copyToClipboard(output)}
            disabled={!output}
            size="sm"
            variant={copy.isCopied ? 'default' : 'outline'}
            className="min-h-11 w-full sm:min-h-9 sm:w-auto"
          >
            {copy.isCopied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                {copy.isError ? 'Copy failed' : 'Copy to Clipboard'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
