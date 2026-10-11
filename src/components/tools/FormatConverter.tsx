'use client';

import { useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Copy, Check, Code, Trash2, ArrowRightLeft } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import {
  convertData,
  type ConvertError,
  type CsvDelimiter as Delimiter,
  type DataFormat as Format,
} from '@/lib/tools/format-converter';
import { describeLineCount } from '@/lib/tools/formatter-output';

const DELIMITER_OPTIONS: Array<{ value: Delimiter; label: string }> = [
  { value: ',', label: 'Comma (,)' },
  { value: ';', label: 'Semicolon (;)' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe (|)' },
];

const getPlaceholder = (format: Format) => {
  switch (format) {
    case 'json':
      return '[\n  {\n    "name": "John",\n    "age": 30,\n    "city": "New York"\n  }\n]';
    case 'yaml':
      return '- name: John\n  age: 30\n  city: New York';
    case 'xml':
      return '<root>\n  <name>John</name>\n  <age>30</age>\n  <city>New York</city>\n</root>';
    case 'csv':
      return 'name,age,city\nJohn,30,New York';
    case 'toml':
      return 'name = "John"\nage = 30\ncity = "New York"';
  }
};

export function FormatConverter() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<ConvertError | null>(null);
  const [inputFormat, setInputFormat] = useState<Format>('json');
  const [outputFormat, setOutputFormat] = useState<Format>('yaml');

  // Format-specific settings
  const [delimiter, setDelimiter] = useState<Delimiter>(',');
  const [useHeaders, setUseHeaders] = useState(true);
  const [jsonIndentation, setJsonIndentation] = useState('2');

  const { copyToClipboard, isCopied, isError: copyFailed } = useCopyToClipboard();

  // Conversions are async because the parsers load on demand. Each one takes
  // a number, and only the newest may write its result.
  const latestRequest = useRef(0);

  const outputSummary = output ? describeLineCount(output) : 'Output will appear here';

  const convert = async (
    text: string,
    fromFormat: Format,
    toFormat: Format,
    delim: Delimiter = delimiter,
    headersVal: boolean = useHeaders,
    indentVal: string = jsonIndentation
  ) => {
    latestRequest.current += 1;
    const request = latestRequest.current;

    if (!text.trim()) {
      setOutput('');
      setError(null);
      return;
    }

    const result = await convertData(text, fromFormat, toFormat, {
      delimiter: delim,
      useHeaders: headersVal,
      jsonIndent: indentVal === 'tab' ? '\t' : Number(indentVal),
    });

    // A newer conversion, or Clear, has started since: drop this result.
    if (request !== latestRequest.current) return;

    setOutput(result.output);
    setError(result.error);
  };

  const handleInputChange = (text: string) => {
    setInput(text);
    void convert(text, inputFormat, outputFormat);
  };

  const handleInputFormatChange = (format: Format) => {
    setInputFormat(format);
    void convert(input, format, outputFormat);
  };

  const handleOutputFormatChange = (format: Format) => {
    setOutputFormat(format);
    void convert(input, inputFormat, format);
  };

  const handleClear = () => {
    latestRequest.current += 1;
    setInput('');
    setOutput('');
    setError(null);
  };

  const swapFormats = () => {
    const tempInput = inputFormat;
    const tempOutput = outputFormat;
    setInputFormat(tempOutput);
    setOutputFormat(tempInput);

    // The converted output becomes the new input. When nothing was converted,
    // keep what was typed (it may have been pasted the wrong way round); with
    // nothing typed either, start from an example.
    const nextInput = output || input || getPlaceholder(tempOutput);
    setInput(nextInput);
    void convert(nextInput, tempOutput, tempInput);
  };

  const showOptions = inputFormat === 'csv' || outputFormat === 'csv' || outputFormat === 'json';

  const errorHeading =
    error?.stage === 'parse'
      ? `Error parsing ${inputFormat.toUpperCase()}:`
      : error?.stage === 'write'
        ? `Cannot convert to ${outputFormat.toUpperCase()}:`
        : 'Converter unavailable:';

  return (
    <div className="space-y-4">
      {/* Format selector toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="convert-from" className="text-sm font-medium text-muted-foreground">From:</label>
          <Select value={inputFormat} onValueChange={(value) => handleInputFormatChange(value as Format)}>
            <SelectTrigger id="convert-from" className="w-full sm:w-[140px]">
              <SelectValue placeholder="From format" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="yaml">YAML</SelectItem>
                <SelectItem value="xml">XML</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="toml">TOML</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={swapFormats}
          variant="outline"
          size="sm"
          aria-label="Swap input and output formats"
          title="Swap input and output formats"
          className="min-h-11 self-stretch sm:min-h-9 sm:self-auto hover:bg-accent/50 hover:text-accent-foreground transition-all duration-200"
        >
          <ArrowRightLeft className="h-4 w-4" />
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="convert-to" className="text-sm font-medium text-muted-foreground">To:</label>
          <Select value={outputFormat} onValueChange={(value) => handleOutputFormatChange(value as Format)}>
            <SelectTrigger id="convert-to" className="w-full sm:w-[140px]">
              <SelectValue placeholder="To format" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="yaml">YAML</SelectItem>
                <SelectItem value="xml">XML</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="toml">TOML</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Conditional Configuration Panel */}
      {showOptions && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 p-4 bg-muted/40 rounded-lg border transition-all duration-300">
          {(inputFormat === 'csv' || outputFormat === 'csv') && (
            <div className="space-y-1.5">
              <label htmlFor="convert-csv-delimiter" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">CSV Delimiter</label>
              <Select
                value={delimiter}
                onValueChange={(val) => {
                  const nextDelimiter = val as Delimiter;
                  setDelimiter(nextDelimiter);
                  void convert(input, inputFormat, outputFormat, nextDelimiter, useHeaders, jsonIndentation);
                }}
              >
                <SelectTrigger id="convert-csv-delimiter" className="w-full bg-background">
                  <SelectValue placeholder="Select delimiter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {DELIMITER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}

          {outputFormat === 'json' && (
            <div className="space-y-1.5">
              <label htmlFor="convert-json-indentation" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">JSON Indentation</label>
              <Select
                value={jsonIndentation}
                onValueChange={(val) => {
                  setJsonIndentation(val);
                  void convert(input, inputFormat, outputFormat, delimiter, useHeaders, val);
                }}
              >
                <SelectTrigger id="convert-json-indentation" className="w-full bg-background">
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
          )}

          {(inputFormat === 'csv' || outputFormat === 'csv') && (
            <div className="flex items-end pb-1.5">
              <Checkbox
                checked={useHeaders}
                onCheckedChange={(checked) => {
                  const nextUseHeaders = Boolean(checked);
                  setUseHeaders(nextUseHeaders);
                  void convert(input, inputFormat, outputFormat, delimiter, nextUseHeaders, jsonIndentation);
                }}
                label="Use header row / object keys"
              />
            </div>
          )}
        </div>
      )}

      {/* Main Panels */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Code className="h-5 w-5 text-primary" />
              Input {inputFormat.toUpperCase()}
            </CardTitle>
            <CardDescription>Paste your raw {inputFormat.toUpperCase()} data</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={input}
              onChange={(e) => handleInputChange((e.target as HTMLTextAreaElement).value)}
              placeholder={getPlaceholder(inputFormat)}
              aria-label={`${inputFormat.toUpperCase()} input`}
              rows={14}
              className="flex-1 font-mono text-xs leading-relaxed resize-y focus-visible:ring-1 bg-background"
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button onClick={handleClear} variant="outline" size="sm" className="min-h-11 sm:min-h-9 w-full sm:w-auto hover:bg-destructive/10 hover:text-destructive hover:border-destructive transition-colors duration-200">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive border border-destructive/20 px-4 py-3 rounded-md text-xs leading-normal font-medium mt-2 break-words">
                <strong>{errorHeading}</strong> {error.message}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Output {outputFormat.toUpperCase()}</CardTitle>
            <CardDescription>{outputSummary}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={output}
              readOnly
              placeholder={`Converted ${outputFormat.toUpperCase()} will appear here...`}
              aria-label={`${outputFormat.toUpperCase()} output`}
              rows={14}
              className="flex-1 font-mono text-xs leading-relaxed resize-y bg-muted/30 focus-visible:ring-0 cursor-text"
            />

            <Button
              onClick={() => copyToClipboard(output)}
              disabled={!output}
              size="sm"
              variant={isCopied ? "default" : "outline"}
              className="min-h-11 w-full sm:min-h-9 sm:w-auto transition-all duration-200 font-medium"
            >
              {isCopied ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-primary-foreground" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  {copyFailed ? 'Copy failed' : 'Copy to Clipboard'}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
