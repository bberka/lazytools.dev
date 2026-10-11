'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCopyToClipboard } from '@/hooks';
import {
  convertList,
  type ListCaseConversion,
  type ListDelimiter,
  type ListSortOrder,
} from '@/lib/tools/list-converter';
import { Copy, Check, Trash2, ListCollapse, Settings2 } from 'lucide-react';

export function ListConverter() {
  const [input, setInput] = useState('');
  const [inputDelimiter, setInputDelimiter] = useState<ListDelimiter>('newline');
  const [customInputDelimiter, setCustomInputDelimiter] = useState('');
  const [outputDelimiter, setOutputDelimiter] = useState('|');
  
  // Processing options
  const [trimItems, setTrimItems] = useState(true);
  const [removeEmpty, setRemoveEmpty] = useState(true);
  const [deduplicate, setDeduplicate] = useState(false);
  const [sortOrder, setSortOrder] = useState<ListSortOrder>('none');
  const [caseConversion, setCaseConversion] = useState<ListCaseConversion>('none');

  // Copy status hooks for all outputs
  const copyCsv = useCopyToClipboard();
  const copySingleQuoted = useCopyToClipboard();
  const copyDoubleQuoted = useCopyToClipboard();
  const copyJson = useCopyToClipboard();
  const copySql = useCopyToClipboard();
  const copyCustom = useCopyToClipboard();

  // Split, clean up and format the list
  const { items: processedItems, outputs } = useMemo(
    () =>
      convertList(input, {
        inputDelimiter,
        customInputDelimiter,
        outputDelimiter,
        trimItems,
        removeEmpty,
        deduplicate,
        sortOrder,
        caseConversion,
      }),
    [
      input,
      inputDelimiter,
      customInputDelimiter,
      outputDelimiter,
      trimItems,
      removeEmpty,
      deduplicate,
      sortOrder,
      caseConversion,
    ]
  );

  const handleClear = () => {
    setInput('');
  };

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-5">
      {/* Left panel: Input & Config */}
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListCollapse className="h-5 w-5 text-primary" />
              Input List
            </CardTitle>
            <CardDescription>Enter your list items to convert them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter list items here..."
              aria-label="List items"
              rows={8}
              className="font-mono text-sm"
            />
            
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground font-medium">
                Items count: {processedItems.length}
              </span>
              <Button onClick={handleClear} variant="outline" size="sm" disabled={!input}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {/* Input Delimiter */}
            <div className="space-y-2">
              <label
                htmlFor="list-input-delimiter"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Input Delimiter
              </label>
              <Select
                value={inputDelimiter}
                onValueChange={(val) => setInputDelimiter(val as ListDelimiter)}
              >
                <SelectTrigger id="list-input-delimiter">
                  <SelectValue placeholder="Select delimiter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newline">Newline (Line-break)</SelectItem>
                  <SelectItem value="comma">Comma (,)</SelectItem>
                  <SelectItem value="semicolon">Semicolon (;)</SelectItem>
                  <SelectItem value="tab">Tab</SelectItem>
                  <SelectItem value="custom">Custom Character</SelectItem>
                </SelectContent>
              </Select>
              {inputDelimiter === 'custom' && (
                <Input
                  type="text"
                  placeholder="Custom delimiter character/string"
                  aria-label="Custom input delimiter"
                  value={customInputDelimiter}
                  onChange={(e) => setCustomInputDelimiter(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>

            {/* List cleanup options */}
            <div className="space-y-3 pt-2 border-t">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Cleanup Options
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="trim-whitespace"
                  checked={trimItems}
                  onCheckedChange={(checked) => setTrimItems(!!checked)}
                />
                <label htmlFor="trim-whitespace" className="text-sm font-medium leading-none cursor-pointer">
                  Trim Whitespace
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remove-empty"
                  checked={removeEmpty}
                  onCheckedChange={(checked) => setRemoveEmpty(!!checked)}
                />
                <label htmlFor="remove-empty" className="text-sm font-medium leading-none cursor-pointer">
                  Remove Empty Items
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="deduplicate"
                  checked={deduplicate}
                  onCheckedChange={(checked) => setDeduplicate(!!checked)}
                />
                <label htmlFor="deduplicate" className="text-sm font-medium leading-none cursor-pointer">
                  Remove Duplicates
                </label>
              </div>
            </div>

            {/* Transform options */}
            <div className="space-y-3 pt-2 border-t">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Transformations
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label htmlFor="list-sort-order" className="text-xs font-medium text-muted-foreground">
                    Sorting
                  </label>
                  <Select value={sortOrder} onValueChange={(val) => setSortOrder(val as ListSortOrder)}>
                    <SelectTrigger id="list-sort-order" className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="asc">A - Z</SelectItem>
                      <SelectItem value="desc">Z - A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="list-case-conversion" className="text-xs font-medium text-muted-foreground">
                    Case conversion
                  </label>
                  <Select
                    value={caseConversion}
                    onValueChange={(val) => setCaseConversion(val as ListCaseConversion)}
                  >
                    <SelectTrigger id="list-case-conversion" className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="upper">UPPERCASE</SelectItem>
                      <SelectItem value="lower">lowercase</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right panel: Outputs */}
      <div className="space-y-4 lg:col-span-3">
        {processedItems.length === 0 ? (
          <Card className="h-full flex items-center justify-center py-6 sm:py-12 text-muted-foreground">
            <CardContent className="text-center">
              <p>Enter list items above to see converted formats</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {/* CSV Comma Separated */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Comma-Separated (CSV)</span>
                  <Button
                    onClick={() => copyCsv.copyToClipboard(outputs.csv)}
                    variant={copyCsv.isCopied ? 'default' : 'outline'}
                    size="sm"
                    className="h-8"
                  >
                    {copyCsv.isCopied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copyCsv.isCopied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <Textarea readOnly value={outputs.csv} aria-label="Comma-separated output" className="font-mono text-xs bg-muted/30 h-16 resize-none" />
              </CardContent>
            </Card>

            {/* Single Quoted List */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Single-Quoted List</span>
                  <Button
                    onClick={() => copySingleQuoted.copyToClipboard(outputs.singleQuoted)}
                    variant={copySingleQuoted.isCopied ? 'default' : 'outline'}
                    size="sm"
                    className="h-8"
                  >
                    {copySingleQuoted.isCopied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copySingleQuoted.isCopied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <Textarea readOnly value={outputs.singleQuoted} aria-label="Single-quoted output" className="font-mono text-xs bg-muted/30 h-16 resize-none" />
              </CardContent>
            </Card>

            {/* Double Quoted List */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Double-Quoted List</span>
                  <Button
                    onClick={() => copyDoubleQuoted.copyToClipboard(outputs.doubleQuoted)}
                    variant={copyDoubleQuoted.isCopied ? 'default' : 'outline'}
                    size="sm"
                    className="h-8"
                  >
                    {copyDoubleQuoted.isCopied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copyDoubleQuoted.isCopied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <Textarea readOnly value={outputs.doubleQuoted} aria-label="Double-quoted output" className="font-mono text-xs bg-muted/30 h-16 resize-none" />
              </CardContent>
            </Card>

            {/* JSON Array */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">JSON Array</span>
                  <Button
                    onClick={() => copyJson.copyToClipboard(outputs.json)}
                    variant={copyJson.isCopied ? 'default' : 'outline'}
                    size="sm"
                    className="h-8"
                  >
                    {copyJson.isCopied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copyJson.isCopied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <Textarea readOnly value={outputs.json} aria-label="JSON array output" className="font-mono text-xs bg-muted/30 h-24" />
              </CardContent>
            </Card>

            {/* SQL IN Clause */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">SQL IN Clause</span>
                  <Button
                    onClick={() => copySql.copyToClipboard(outputs.sql)}
                    variant={copySql.isCopied ? 'default' : 'outline'}
                    size="sm"
                    className="h-8"
                  >
                    {copySql.isCopied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copySql.isCopied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <Textarea readOnly value={outputs.sql} aria-label="SQL IN clause output" className="font-mono text-xs bg-muted/30 h-16 resize-none" />
              </CardContent>
            </Card>

            {/* Custom Delimited */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Custom Delimited</span>
                    <Input
                      type="text"
                      value={outputDelimiter}
                      onChange={(e) => setOutputDelimiter(e.target.value)}
                      placeholder="Join string (e.g. | or -)"
                      aria-label="Output delimiter"
                      className="w-24 h-7 text-xs font-mono"
                    />
                  </div>
                  <Button
                    onClick={() => copyCustom.copyToClipboard(outputs.custom)}
                    variant={copyCustom.isCopied ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 shrink-0 self-end sm:self-auto"
                  >
                    {copyCustom.isCopied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copyCustom.isCopied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <Textarea readOnly value={outputs.custom} aria-label="Custom delimited output" className="font-mono text-xs bg-muted/30 h-16" />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
