'use client';

import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCopyToClipboard } from '@/hooks';
import {
  HTTP_STATUS_CODES,
  STATUS_CLASSES,
  countByClass,
  formatStatusLine,
  searchStatusCodes,
  type StatusClassFilter,
} from '@/lib/tools/http-status-codes';
import { Check, Copy, Search, SearchX, ServerCrash, X } from 'lucide-react';

const CLASS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_CLASSES.map((info) => [info.id, info.label]),
);

export function HttpStatusCodes() {
  const [query, setQuery] = useState('');
  const [statusClass, setStatusClass] = useState<StatusClassFilter>('all');
  const [lastCopied, setLastCopied] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { copyToClipboard, isCopied, isError } = useCopyToClipboard();

  // Chip counts follow the search text but not the class filter, so they show
  // where the matches are.
  const queryMatches = useMemo(() => searchStatusCodes(query), [query]);
  const classCounts = useMemo(() => countByClass(queryMatches), [queryMatches]);
  const results = useMemo(() => searchStatusCodes(query, statusClass), [query, statusClass]);

  const isFiltered = query.trim() !== '' || statusClass !== 'all';

  const handleClear = () => {
    setQuery('');
    setStatusClass('all');
    searchRef.current?.focus();
  };

  const handleCopy = (line: string) => {
    setLastCopied(line);
    void copyToClipboard(line);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && query) {
      setQuery('');
    } else if (event.key === 'ArrowDown') {
      const first = listRef.current?.querySelector('button');
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  // ArrowUp and ArrowDown move between the copy buttons of the rows.
  const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = Array.from(listRef.current?.querySelectorAll('button') ?? []);
    const index = buttons.findIndex((button) => button === event.target);
    if (index === -1) return;
    event.preventDefault();
    if (event.key === 'ArrowDown') {
      buttons[index + 1]?.focus();
    } else if (index === 0) {
      searchRef.current?.focus();
    } else {
      buttons[index - 1]?.focus();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ServerCrash className="h-5 w-5 text-primary" />
          HTTP Status Codes
        </CardTitle>
        <CardDescription>
          Look up what a status code means and what usually causes it. Click a code to copy it with
          its phrase.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search by code or words, e.g. 40, 404 or redirect"
              aria-label="Search HTTP status codes"
              autoComplete="off"
              spellCheck={false}
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={!isFiltered}
            className="h-9 shrink-0"
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>

        <div role="group" aria-label="Filter by class" className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={statusClass === 'all' ? 'default' : 'outline'}
            aria-pressed={statusClass === 'all'}
            aria-label={`All classes, ${queryMatches.length} matching`}
            onClick={() => setStatusClass('all')}
          >
            All
            <span className="text-xs opacity-70">{queryMatches.length}</span>
          </Button>
          {STATUS_CLASSES.map((info) => (
            <Button
              key={info.id}
              type="button"
              size="sm"
              variant={statusClass === info.id ? 'default' : 'outline'}
              aria-pressed={statusClass === info.id}
              aria-label={`${info.id} ${info.label}, ${classCounts[info.id]} matching`}
              title={info.summary}
              onClick={() => setStatusClass(info.id)}
            >
              {info.id}
              <span className="hidden sm:inline">{info.label}</span>
              <span className="text-xs opacity-70">{classCounts[info.id]}</span>
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <p role="status">
            Showing {results.length} of {HTTP_STATUS_CODES.length} status codes
          </p>
          <p role="status" className="flex items-center gap-1.5">
            {isCopied && lastCopied && (
              <>
                <Check className="h-3.5 w-3.5 text-primary" />
                Copied {lastCopied}
              </>
            )}
            {isError && <span className="text-destructive">Could not copy to the clipboard</span>}
          </p>
        </div>

        {results.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground sm:py-12">
            <SearchX className="h-8 w-8" />
            <p className="font-medium text-foreground">
              {query.trim() ? `No status codes match "${query.trim()}"` : 'No status codes match'}
            </p>
            <p className="text-sm">
              Try a code such as 404, a prefix such as 40, or a word such as redirect.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={handleClear}>
              Clear search and filter
            </Button>
          </div>
        ) : (
          <ul
            ref={listRef}
            onKeyDown={handleListKeyDown}
            aria-label="HTTP status codes"
            className="space-y-3"
          >
            {results.map((entry) => {
              const line = formatStatusLine(entry);
              const copied = isCopied && lastCopied === line;
              return (
                <li
                  key={entry.code}
                  className="grid grid-cols-[auto_1fr] gap-3 rounded-lg border p-3 sm:p-4"
                >
                  <Button
                    type="button"
                    variant={copied ? 'default' : 'outline'}
                    onClick={() => handleCopy(line)}
                    aria-label={`Copy ${line}`}
                    title={`Copy "${line}"`}
                    className="font-mono text-base font-semibold"
                  >
                    {copied ? <Check /> : <Copy />}
                    {entry.code}
                  </Button>
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="font-semibold">{entry.phrase}</h3>
                      <Badge variant="secondary">{CLASS_LABELS[entry.statusClass]}</Badge>
                    </div>
                    <p className="text-sm">{entry.description}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">When you see it: </span>
                      {entry.usage}
                    </p>
                    <p className="text-xs text-muted-foreground">Defined in {entry.spec}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
