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
import {
  Copy,
  Check,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Download,
  Database,
  RefreshCw,
  Eye,
  Settings,
} from 'lucide-react';

interface SchemaField {
  id: string;
  name: string;
  type: string;
}

const FIELD_TYPES = [
  { value: 'id_seq', label: 'ID (Incremental)' },
  { value: 'id_uuid', label: 'ID (UUID)' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'full_name', label: 'Full Name' },
  { value: 'email', label: 'Email Address' },
  { value: 'phone', label: 'Phone Number' },
  { value: 'street', label: 'Street Address' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'country', label: 'Country' },
  { value: 'zip', label: 'Zip Code' },
  { value: 'company', label: 'Company Name' },
  { value: 'job', label: 'Job Title' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean (True/False)' },
  { value: 'text', label: 'Text / Paragraph' },
];

const FIRST_NAMES = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa", "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley", "Steven", "Dorothy", "Paul", "Kimberly", "Andrew", "Emily", "Joshua", "Donna"];
const LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores"];
const STREETS = ["Main St", "Oak Ave", "Pine Rd", "Maple Dr", "Cedar Ln", "Elm St", "View Rd", "Broadway", "Washington St", "Park Ln", "Lake Dr", "Sunset Blvd", "River Rd", "Forest Ave", "Highland Dr", "Meadow Ln", "Hillside Ave", "Spring St", "Valley Rd", "Ridge Dr"];
const CITIES = ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Jose", "Austin", "Jacksonville", "San Francisco", "Indianapolis", "Columbus", "Fort Worth", "Charlotte", "Seattle", "Denver", "El Paso"];
const STATES = ["NY", "CA", "IL", "TX", "AZ", "PA", "TX", "CA", "TX", "CA", "TX", "FL", "CA", "IN", "OH", "TX", "NC", "WA", "CO", "TX"];
const COUNTRIES = ["United States", "Canada", "United Kingdom", "Germany", "France", "Australia", "Japan", "Brazil", "India", "South Africa", "Italy", "Spain", "Mexico", "South Korea", "Netherlands", "Sweden", "Switzerland", "Singapore", "New Zealand", "Ireland"];
const COMPANIES = ["Acme Corp", "Globex", "Initech", "Umbrella Corp", "Vehement Capital", "Hooli", "Soylent Corp", "Wonka Industries", "Stark Industries", "Wayne Enterprises", "Cyberdyne Systems", "Oscorp", "Tyrell Corp", "Dunder Mifflin", "Aperture Science", "Virtucon", "MomCorp", "Sterling Cooper", "Gekko & Co", "Bluth Company"];
const DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "example.com", "company.com", "mail.com", "protonmail.com"];
const JOBS = ["Software Engineer", "Product Manager", "Data Analyst", "Product Designer", "Marketing Specialist", "Sales Representative", "HR Manager", "Accountant", "Operations Coordinator", "Customer Support Specialist", "System Administrator", "Financial Analyst", "Content Writer", "Project Manager", "Data Scientist", "Research Assistant"];
const PHRASES = ["Lorem ipsum dolor sit amet, consectetur adipiscing elit.", "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.", "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.", "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.", "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.", "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.", "Curabitur pretium tincidunt lacus. Nulla gravida orci a odio.", "Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris."];

export function MockDataGenerator() {
  const [fields, setFields] = useState<SchemaField[]>([
    { id: '1', name: 'id', type: 'id_seq' },
    { id: '2', name: 'first_name', type: 'first_name' },
    { id: '3', name: 'last_name', type: 'last_name' },
    { id: '4', name: 'email', type: 'email' },
    { id: '5', name: 'country', type: 'country' },
  ]);
  const [rowsCount, setRowsCount] = useState<number>(50);
  const [activeTab, setActiveTab] = useState<'preview' | 'json' | 'csv'>('preview');
  const [generatedData, setGeneratedData] = useState<Array<Record<string, string | number | boolean>>>([]);

  const copyJson = useCopyToClipboard();
  const copyCsv = useCopyToClipboard();

  const getRandomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const generateData = () => {
    const data: Array<Record<string, string | number | boolean>> = [];

    for (let index = 0; index < rowsCount; index++) {
      const row: Record<string, string | number | boolean> = {};
      let rowFirstName = '';
      let rowLastName = '';

      const getFirstName = () => {
        if (!rowFirstName) rowFirstName = getRandomElement(FIRST_NAMES);
        return rowFirstName;
      };
      const getLastName = () => {
        if (!rowLastName) rowLastName = getRandomElement(LAST_NAMES);
        return rowLastName;
      };

      for (const field of fields) {
        let val: string | number | boolean = '';

        switch (field.type) {
          case 'id_seq':
            val = index + 1;
            break;
          case 'id_uuid':
            val = crypto.randomUUID ? crypto.randomUUID() : 'f47ac10b-58cc-4372-a567-0e02b2c3d479'.replace(/[xy]/g, function(c) {
              const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
              return v.toString(16);
            });
            break;
          case 'first_name':
            val = getFirstName();
            break;
          case 'last_name':
            val = getLastName();
            break;
          case 'full_name':
            val = `${getFirstName()} ${getLastName()}`;
            break;
          case 'email':
            const fn = getFirstName().toLowerCase();
            const ln = getLastName().toLowerCase();
            const domain = getRandomElement(DOMAINS);
            const num = Math.random() > 0.5 ? Math.floor(Math.random() * 100) : '';
            val = `${fn}.${ln}${num}@${domain}`;
            break;
          case 'phone':
            val = `+1 (555) ${String(Math.floor(100 + Math.random() * 900))}-${String(Math.floor(1000 + Math.random() * 9000))}`;
            break;
          case 'street':
            val = `${Math.floor(100 + Math.random() * 8900)} ${getRandomElement(STREETS)}`;
            break;
          case 'city':
            val = getRandomElement(CITIES);
            break;
          case 'state':
            val = getRandomElement(STATES);
            break;
          case 'country':
            val = getRandomElement(COUNTRIES);
            break;
          case 'zip':
            val = String(Math.floor(10000 + Math.random() * 90000));
            break;
          case 'company':
            val = getRandomElement(COMPANIES);
            break;
          case 'job':
            val = getRandomElement(JOBS);
            break;
          case 'date':
            const start = new Date(1980, 0, 1).getTime();
            const end = new Date(2023, 11, 31).getTime();
            const date = new Date(start + Math.random() * (end - start));
            val = date.toISOString().split('T')[0];
            break;
          case 'boolean':
            val = Math.random() > 0.5;
            break;
          case 'text':
            val = getRandomElement(PHRASES);
            break;
          default:
            val = '';
        }

        row[field.name || `field_${field.id}`] = val;
      }
      data.push(row);
    }
    setGeneratedData(data);
  };

  // Generate data initially on mount
  useEffect(() => {
    generateData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jsonString = useMemo(() => {
    return JSON.stringify(generatedData, null, 2);
  }, [generatedData]);

  const csvString = useMemo(() => {
    if (generatedData.length === 0) return '';
    const headers = fields.map((f) => f.name || `field_${f.id}`);
    const csvRows = [];

    // Header row
    csvRows.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','));

    // Data rows
    for (const row of generatedData) {
      const values = headers.map((h) => {
        const val = row[h];
        const strVal = val === null || val === undefined ? '' : String(val);
        return `"${strVal.replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }, [generatedData, fields]);

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
          const typeInfo = FIELD_TYPES.find((f) => f.value === type);
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

  const downloadFile = (content: string, filename: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewData = generatedData.slice(0, 10);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
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
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Rows count
              </label>
              <Select
                value={String(rowsCount)}
                onValueChange={(val) => setRowsCount(Number(val))}
              >
                <SelectTrigger>
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
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Fields list
              </label>

              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 scrollbar-thin">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-center bg-muted/30 p-2 rounded-md">
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveField(index, 'up')}
                        disabled={index === 0}
                        className="h-6 w-6"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveField(index, 'down')}
                        disabled={index === fields.length - 1}
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
                        className="h-8 text-xs font-mono"
                      />
                      <Select
                        value={field.type}
                        onValueChange={(val) => updateFieldType(field.id, val)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((type) => (
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
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
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
                  size="sm"
                  className="h-7 text-xs"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Preview
                </Button>
                <Button
                  onClick={() => setActiveTab('json')}
                  variant={activeTab === 'json' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs"
                >
                  JSON Output
                </Button>
                <Button
                  onClick={() => setActiveTab('csv')}
                  variant={activeTab === 'csv' ? 'secondary' : 'ghost'}
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
                        downloadFile(jsonString, 'mock-data.json', 'application/json');
                      } else {
                        downloadFile(csvString, 'mock-data.csv', 'text/csv');
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
                        {fields.map((field) => (
                          <th
                            key={field.id}
                            className="p-2 font-semibold text-muted-foreground uppercase border-r last:border-r-0"
                          >
                            {field.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((row, idx) => (
                        <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/10">
                          {fields.map((field) => (
                            <td
                              key={field.id}
                              className="p-2 font-mono border-r last:border-r-0 max-w-[150px] truncate"
                            >
                              {String(row[field.name || `field_${field.id}`])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-xs text-muted-foreground italic text-right">
                  Showing first {previewData.length} generated rows of {generatedData.length} total.
                </div>
              </div>
            )}

            {activeTab === 'json' && (
              <Textarea
                readOnly
                value={jsonString}
                className="flex-1 font-mono text-xs bg-muted/20 resize-none h-[400px]"
              />
            )}

            {activeTab === 'csv' && (
              <Textarea
                readOnly
                value={csvString}
                className="flex-1 font-mono text-xs bg-muted/20 resize-none h-[400px]"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
