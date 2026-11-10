'use client';

import { useMemo, useState } from 'react';
import { FileDown, Plus, Table, Trash2, X } from 'lucide-react';
import { CopyButton } from '@/components/CopyButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ALIGNMENTS,
  DEFAULT_TABLE_OPTIONS,
  EXAMPLE_CSV,
  MAX_COLUMNS,
  MAX_ROWS,
  SAMPLE_TABLE,
  addColumn,
  addRow,
  clearCells,
  markdownTable,
  parseDelimited,
  removeColumn,
  removeRow,
  setAlignment,
  setCell,
  tableFromRows,
  type Alignment,
  type Delimiter,
  type TableData,
  type TableOptions,
} from '@/lib/tools/markdown-table-generator';

const DELIMITERS: ReadonlyArray<{ value: Delimiter; label: string }> = [
  { value: 'auto', label: 'Detect automatically' },
  { value: 'comma', label: 'Comma (CSV)' },
  { value: 'tab', label: 'Tab (TSV)' },
  { value: 'semicolon', label: 'Semicolon' },
];

export function MarkdownTableGenerator() {
  const [table, setTable] = useState<TableData>(SAMPLE_TABLE);
  const [options, setOptions] = useState<TableOptions>(DEFAULT_TABLE_OPTIONS);
  const [importText, setImportText] = useState('');
  const [delimiter, setDelimiter] = useState<Delimiter>('auto');
  const [firstRowHeader, setFirstRowHeader] = useState(true);
  const [importMessage, setImportMessage] = useState<{ text: string; error: boolean } | null>(null);

  const markdown = useMemo(() => markdownTable(table, options), [table, options]);

  const columnCount = table.alignments.length;
  const bodyRowCount = table.cells.length - 1;
  const canAddRow = table.cells.length < MAX_ROWS;
  const canAddColumn = columnCount < MAX_COLUMNS;

  const handleImport = () => {
    const result = tableFromRows(parseDelimited(importText, delimiter), firstRowHeader);
    if (!result) {
      setImportMessage({ text: 'There is no data to import. Paste CSV or TSV text first.', error: true });
      return;
    }
    setTable(result.table);
    const { cells, alignments } = result.table;
    setImportMessage({
      text: `Imported ${cells.length - 1} ${cells.length - 1 === 1 ? 'row' : 'rows'} and ${alignments.length} ${alignments.length === 1 ? 'column' : 'columns'}.${result.truncated ? ` Only the first ${MAX_ROWS} rows and ${MAX_COLUMNS} columns are kept.` : ''}`,
      error: false,
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Table className="h-5 w-5 text-primary" />
            Table
          </CardTitle>
          <CardDescription>
            Edit the cells, choose how each column is aligned, and add or remove rows and columns. The first row is the
            header.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Table cells</caption>
              <thead>
                <tr className="bg-muted/40 align-top">
                  {table.alignments.map((alignment, column) => (
                    <th key={column} scope="col" className="min-w-[9rem] space-y-1 p-2 text-left font-normal">
                      <Input
                        value={table.cells[0][column]}
                        onChange={(e) => setTable(setCell(table, 0, column, e.target.value))}
                        aria-label={`Header ${column + 1}`}
                        placeholder={`Header ${column + 1}`}
                        className="h-8 font-semibold"
                      />
                      <div className="flex gap-1">
                        <div className="min-w-0 flex-1">
                          <Select
                            value={alignment}
                            onValueChange={(value) => setTable(setAlignment(table, column, value as Alignment))}
                          >
                            <SelectTrigger aria-label={`Column ${column + 1} alignment`} className="h-8 text-xs">
                              <SelectValue placeholder="Alignment" />
                            </SelectTrigger>
                            <SelectContent>
                              {ALIGNMENTS.map((entry) => (
                                <SelectItem key={entry.value} value={entry.value}>
                                  {entry.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label={`Remove column ${column + 1}`}
                          disabled={columnCount <= 1}
                          onClick={() => setTable(removeColumn(table, column))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </th>
                  ))}
                  <th scope="col" className="w-10">
                    <span className="sr-only">Row actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.cells.slice(1).map((row, index) => {
                  const rowNumber = index + 1;
                  return (
                    <tr key={rowNumber} className="border-t">
                      {row.map((cell, column) => (
                        <td key={column} className="p-2">
                          <Input
                            value={cell}
                            onChange={(e) => setTable(setCell(table, rowNumber, column, e.target.value))}
                            aria-label={`Row ${rowNumber} column ${column + 1}`}
                            className="h-8"
                          />
                        </td>
                      ))}
                      <td className="p-1 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Remove row ${rowNumber}`}
                          onClick={() => setTable(removeRow(table, rowNumber))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTable(addRow(table))} disabled={!canAddRow}>
              <Plus className="mr-2 h-4 w-4" />
              Add row
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTable(addColumn(table))} disabled={!canAddColumn}>
              <Plus className="mr-2 h-4 w-4" />
              Add column
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTable(clearCells(table))}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear table
            </Button>
          </div>
          <p className="text-xs text-muted-foreground" role="status">
            {columnCount} {columnCount === 1 ? 'column' : 'columns'}, {bodyRowCount} {bodyRowCount === 1 ? 'row' : 'rows'}{' '}
            below the header.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileDown className="h-4 w-4 text-muted-foreground" />
            Import CSV or TSV
          </CardTitle>
          <CardDescription>
            Paste rows from a spreadsheet or a CSV file. This replaces the table above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste CSV or TSV here..."
            aria-label="CSV or TSV to import"
            rows={5}
            spellCheck={false}
            className="font-mono text-sm"
          />
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            <div className="space-y-2">
              <label htmlFor="table-delimiter" className="text-sm font-medium">
                Separator
              </label>
              <Select value={delimiter} onValueChange={(value) => setDelimiter(value as Delimiter)}>
                <SelectTrigger id="table-delimiter">
                  <SelectValue placeholder="Select a separator" />
                </SelectTrigger>
                <SelectContent>
                  {DELIMITERS.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:pt-7">
              <Checkbox label="First row is the header" checked={firstRowHeader} onCheckedChange={setFirstRowHeader} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleImport} size="sm" disabled={importText.trim() === ''}>
              Import into table
            </Button>
            <Button onClick={() => setImportText(EXAMPLE_CSV)} variant="outline" size="sm">
              Load Example
            </Button>
            <Button
              onClick={() => {
                setImportText('');
                setImportMessage(null);
              }}
              variant="outline"
              size="sm"
              disabled={importText === ''}
            >
              Clear input
            </Button>
          </div>
          {importMessage && (
            <p
              role="status"
              className={importMessage.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
            >
              {importMessage.text}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Markdown</CardTitle>
          <CardDescription>Updates as you edit. Works on GitHub, GitLab and most Markdown editors.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <Checkbox
              label="Pad columns so the raw text lines up"
              checked={options.pad}
              onCheckedChange={(checked) => setOptions((current) => ({ ...current, pad: checked }))}
            />
            <Checkbox
              label="Escape pipes inside cells"
              checked={options.escapePipes}
              onCheckedChange={(checked) => setOptions((current) => ({ ...current, escapePipes: checked }))}
            />
          </div>
          <Textarea
            readOnly
            value={markdown}
            aria-label="Markdown table"
            rows={Math.min(14, Math.max(4, table.cells.length + 2))}
            spellCheck={false}
            wrap="off"
            placeholder="Type in a cell to see the Markdown."
            className="bg-muted/30 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={markdown} label="Copy Markdown" disabled={!markdown} size="sm" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
