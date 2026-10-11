'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCopyToClipboard } from '@/hooks';
import { downloadText } from '@/lib/files';
import {
  MOCK_FIELD_TYPES,
  columnNames,
  generateMockData,
  mockDataToCsv,
  mockDataToJson,
  type MockDataset,
  type MockField,
} from '@/lib/tools/mock-data-generator';
import {
  Copy,
  Check,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Download,
  RefreshCw,
  Eye,
  Settings,
} from 'lucide-react';

const DEFAULT_FIELDS: MockField[] = [
  { id: '1', name: 'id', type: 'id_seq' },
  { id: '2', name: 'first_name', type: 'first_name' },
  { id: '3', name: 'last_name', type: 'last_name' },
  { id: '4', name: 'email', type: 'email' },
  { id: '5', name: 'country', type: 'country' },
];
const DEFAULT_ROWS = 50;

/** Identifies a schema, to tell when the output on show was made from an older one. */
function schemaKeyOf(fields: MockField[], rowsCount: number): string {
  return JSON.stringify([rowsCount, fields.map((field) => [field.id, field.name, field.type])]);
}

interface GeneratedData {
  dataset: MockDataset;
  schemaKey: string;
}

export function MockDataGenerator() {
  const [fields, setFields] = useState<MockField[]>(DEFAULT_FIELDS);
  const [rowsCount, setRowsCount] = useState<number>(DEFAULT_ROWS);
  const [activeTab, setActiveTab] = useState<'preview' | 'json' | 'csv'>('preview');
  // The output keeps the column names it was generated with, so editing the
  // schema cannot leave the table, the JSON and the CSV disagreeing.
  const [generated, setGenerated] = useState<GeneratedData>(() => ({
    dataset: { columns: columnNames(DEFAULT_FIELDS), rows: [] },
    schemaKey: schemaKeyOf(DEFAULT_FIELDS, DEFAULT_ROWS),
  }));

  const copyJson = useCopyToClipboard();
  const copyCsv = useCopyToClipboard();

  const { dataset } = generated;
  const isOutdated = generated.schemaKey !== schemaKeyOf(fields, rowsCount);

  const generateData = () => {
    setGenerated({
      dataset: generateMockData(fields, rowsCount),
      schemaKey: schemaKeyOf(fields, rowsCount),
    });
  };

  // Generate data initially on mount. Random rows must not be part of the
  // prerendered page, so this cannot be the initial state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    generateData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jsonString = useMemo(() => mockDataToJson(dataset), [dataset]);
  const csvString = useMemo(() => mockDataToCsv(dataset), [dataset]);

  const addField = () => {
    const newId = String(Date.now());
    setFields([...fields, { id: newId, name: `field_${newId.slice(-4)}`, type: 'first_name' }]);
  };

  const removeField = (id: string) => {
    setFields(fields.filter((field) => field.id !== id));
  };

  const updateFieldType = (id: string, type: string) => {
    setFields(
      fields.map((field) => {
        if (field.id === id) {
          // If setting type to match default name keys, suggest standard naming
          const typeInfo = MOCK_FIELD_TYPES.find((f) => f.value === type);
          let newName = field.name;
          if (newName.startsWith('field_')) {
            newName = typeInfo ? typeInfo.value : field.name;
          }
          return { ...field, type, name: newName };
        }
        return field;
      })
    );
  };

  const updateFieldName = (id: string, name: string) => {
    setFields(fields.map((field) => (field.id === id ? { ...field, name } : field)));
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex >= 0 && targetIndex < newFields.length) {
      const temp = newFields[index];
      newFields[index] = newFields[targetIndex];
      newFields[targetIndex] = temp;
      setFields(newFields);
    }
  };

  const previewRows = dataset.rows.slice(0, 10);

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-5">
      {/* Left Panel: Configuration */}
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Configure Schema
            </CardTitle>
            <CardDescription>Configure fields, column names, and row count.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Rows Count Settings */}
            <div className="space-y-2">
              <label
                htmlFor="mock-rows-count"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Rows count
              </label>
              <Select
                value={String(rowsCount)}
                onValueChange={(val) => setRowsCount(Number(val))}
              >
                <SelectTrigger id="mock-rows-count">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 Rows</SelectItem>
                  <SelectItem value="50">50 Rows</SelectItem>
                  <SelectItem value="100">100 Rows</SelectItem>
                  <SelectItem value="500">500 Rows</SelectItem>
                  <SelectItem value="1000">1000 Rows</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Schema builder */}
            <div className="space-y-3 pt-2 border-t">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Fields list
              </span>

              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 scrollbar-thin">
                {fields.map((field, index) => {
                  const fieldLabel = field.name.trim() || `field ${index + 1}`;
                  return (
                    <div key={field.id} className="flex gap-2 items-center bg-muted/30 p-2 rounded-md">
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveField(index, 'up')}
                          disabled={index === 0}
                          aria-label={`Move ${fieldLabel} up`}
                          className="h-6 w-6"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveField(index, 'down')}
                          disabled={index === fields.length - 1}
                          aria-label={`Move ${fieldLabel} down`}
                          className="h-6 w-6"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="flex-1 space-y-1.5 min-w-0">
                        <Input
                          type="text"
                          value={field.name}
                          onChange={(e) => updateFieldName(field.id, e.target.value)}
                          placeholder="Column Name"
                          aria-label={`Column name of field ${index + 1}`}
                          className="h-8 text-xs font-mono"
                        />
                        <Select
                          value={field.type}
                          onValueChange={(val) => updateFieldType(field.id, val)}
                        >
                          <SelectTrigger aria-label={`Type of ${fieldLabel}`} className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MOCK_FIELD_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value} className="text-xs">
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeField(field.id)}
                        disabled={fields.length <= 1}
                        aria-label={`Remove ${fieldLabel}`}
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <Button onClick={addField} variant="outline" size="sm" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add New Field
              </Button>
            </div>

            <Button onClick={generateData} className="w-full font-semibold mt-2">
              <RefreshCw className="h-4 w-4 mr-2" />
              Generate Data
            </Button>

            {isOutdated && (
              <p role="status" className="text-xs text-muted-foreground">
                The schema changed. Generate again to update the output.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Panel: Output & Previews */}
      <div className="space-y-4 lg:col-span-3">
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex border rounded-md p-1 bg-muted/40 text-sm">
                <Button
                  onClick={() => setActiveTab('preview')}
                  variant={activeTab === 'preview' ? 'secondary' : 'ghost'}
                  aria-pressed={activeTab === 'preview'}
                  size="sm"
                  className="h-7 text-xs"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Preview
                </Button>
                <Button
                  onClick={() => setActiveTab('json')}
                  variant={activeTab === 'json' ? 'secondary' : 'ghost'}
                  aria-pressed={activeTab === 'json'}
                  size="sm"
                  className="h-7 text-xs"
                >
                  JSON Output
                </Button>
                <Button
                  onClick={() => setActiveTab('csv')}
                  variant={activeTab === 'csv' ? 'secondary' : 'ghost'}
                  aria-pressed={activeTab === 'csv'}
                  size="sm"
                  className="h-7 text-xs"
                >
                  CSV Output
                </Button>
              </div>

              {activeTab !== 'preview' && (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      if (activeTab === 'json') {
                        copyJson.copyToClipboard(jsonString);
                      } else {
                        copyCsv.copyToClipboard(csvString);
                      }
                    }}
                    variant={
                      (activeTab === 'json' ? copyJson.isCopied : copyCsv.isCopied)
                        ? 'default'
                        : 'outline'
                    }
                    size="sm"
                    className="h-8"
                  >
                    {activeTab === 'json' ? (
                      copyJson.isCopied ? (
                        <Check className="h-3.5 w-3.5 mr-1" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1" />
                      )
                    ) : copyCsv.isCopied ? (
                      <Check className="h-3.5 w-3.5 mr-1" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 mr-1" />
                    )}
                    {activeTab === 'json'
                      ? copyJson.isCopied
                        ? 'Copied'
                        : 'Copy'
                      : copyCsv.isCopied
                      ? 'Copied'
                      : 'Copy'}
                  </Button>

                  <Button
                    onClick={() => {
                      if (activeTab === 'json') {
                        downloadText(jsonString, 'mock-data.json', 'application/json');
                      } else {
                        downloadText(csvString, 'mock-data.csv', 'text/csv');
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="h-8"
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Download
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0">
            {activeTab === 'preview' && (
              <div className="flex-1 flex flex-col min-h-[300px]">
                <div className="overflow-x-auto border rounded-md">
                  <table className="w-full border-collapse text-xs text-left">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {dataset.columns.map((column, columnIndex) => (
                          <th
                            key={columnIndex}
                            className="p-2 font-semibold text-muted-foreground uppercase border-r last:border-r-0"
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, idx) => (
                        <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/10">
                          {row.map((value, columnIndex) => (
                            <td
                              key={columnIndex}
                              className="p-2 font-mono border-r last:border-r-0 max-w-[150px] truncate"
                            >
                              {String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-xs text-muted-foreground italic text-right">
                  Showing first {previewRows.length} generated rows of {dataset.rows.length} total.
                </div>
              </div>
            )}

            {activeTab === 'json' && (
              <Textarea
                readOnly
                value={jsonString}
                aria-label="JSON output"
                className="flex-1 font-mono text-xs bg-muted/20 resize-none h-[400px]"
              />
            )}

            {activeTab === 'csv' && (
              <Textarea
                readOnly
                value={csvString}
                aria-label="CSV output"
                className="flex-1 font-mono text-xs bg-muted/20 resize-none h-[400px]"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
