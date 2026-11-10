'use client';

import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, Copy, FileType, Search, SearchX, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useCopyToClipboard } from '@/hooks';
import {
  MIME_CATEGORIES,
  MIME_ENTRIES,
  countByCategory,
  searchMimeTypes,
  type MimeCategoryFilter,
} from '@/lib/tools/mime-types';

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  MIME_CATEGORIES.map((category) => [category.id, category.label])
);

export function MimeTypesReference() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<MimeCategoryFilter>('all');
  const [lastCopied, setLastCopied] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const { copyToClipboard, isCopied, isError } = useCopyToClipboard();

  // The chip counts follow the search text but not the category, so they show where the matches are.
  const queryMatches = useMemo(() => searchMimeTypes(query), [query]);
  const counts = useMemo(() => countByCategory(queryMatches), [queryMatches]);
  const results = useMemo(() => searchMimeTypes(query, category), [query, category]);

  const isFiltered = query.trim() !== '' || category !== 'all';

  const handleClear = () => {
    setQuery('');
    setCategory('all');
    searchRef.current?.focus();
  };

  const handleCopy = (key: string, text: string) => {
    setLastCopied(key);
    void copyToClipboard(text);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && query) {
      setQuery('');
    } else if (event.key === 'ArrowDown') {
      const first = bodyRef.current?.querySelector('button');
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  // ArrowUp and ArrowDown move to the same button in the next or previous row.
  const handleBodyKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const target = event.target as HTMLElement;
    const row = target.closest('tr');
    if (!row) return;
    const column = Array.from(row.querySelectorAll('button')).indexOf(target as HTMLButtonElement);
    if (column === -1) return;
    event.preventDefault();
    const sibling = event.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling;
    if (sibling) {
      sibling.querySelectorAll('button')[column]?.focus();
    } else if (event.key === 'ArrowUp') {
      searchRef.current?.focus();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileType className="h-5 w-5 text-primary" />
          MIME Types Reference
        </CardTitle>
        <CardDescription>
          Find the Content-Type for a file extension, or the extensions for a type. Click an
          extension or a type to copy it.
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
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search by extension or type, e.g. webp, .json or image/"
              aria-label="Search MIME types"
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

        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={category === 'all' ? 'default' : 'outline'}
            aria-pressed={category === 'all'}
            aria-label={`All categories, ${queryMatches.length} matching`}
            onClick={() => setCategory('all')}
          >
            All
            <span className="text-xs opacity-70">{queryMatches.length}</span>
          </Button>
          {MIME_CATEGORIES.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={category === item.id ? 'default' : 'outline'}
              aria-pressed={category === item.id}
              aria-label={`${item.label}, ${counts[item.id]} matching`}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
              <span className="text-xs opacity-70">{counts[item.id]}</span>
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <p role="status">
            Showing {results.length} of {MIME_ENTRIES.length} file types
          </p>
          <p role="status" className="flex items-center gap-1.5">
            {isCopied && lastCopied && (
              <>
                <Check className="h-3.5 w-3.5 text-primary" />
                Copied {lastCopied.slice(lastCopied.indexOf(':') + 1)}
              </>
            )}
            {isError && <span className="text-destructive">Could not copy to the clipboard</span>}
          </p>
        </div>

        {results.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground sm:py-12">
            <SearchX className="h-8 w-8" />
            <p className="max-w-full break-words font-medium text-foreground">
              {query.trim() ? `No file types match "${query.trim()}"` : 'No file types match'}
            </p>
            <p className="text-sm">Try an extension such as png, or a type such as video/.</p>
            <Button type="button" variant="outline" size="sm" onClick={handleClear}>
              Clear search and filter
            </Button>
          </div>
        ) : (
          <div
            className="max-h-[32rem] overflow-auto rounded-md border"
            role="region"
            aria-label="MIME types table"
            tabIndex={0}
          >
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">File extensions and their MIME types</caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky top-0 bg-muted px-3 py-2 text-left font-medium text-muted-foreground"
                  >
                    Extension
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 bg-muted px-3 py-2 text-left font-medium text-muted-foreground"
                  >
                    MIME type
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 hidden bg-muted px-3 py-2 text-left font-medium text-muted-foreground sm:table-cell"
                  >
                    Category
                  </th>
                </tr>
              </thead>
              <tbody ref={bodyRef} onKeyDown={handleBodyKeyDown}>
                {results.map((entry) => {
                  const extKey = `ext:.${entry.ext}`;
                  const typeKey = `type:${entry.type}`;
                  return (
                    <tr key={entry.ext} className="border-t align-top">
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        <Button
                          type="button"
                          variant={isCopied && lastCopied === extKey ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleCopy(extKey, `.${entry.ext}`)}
                          aria-label={`Copy extension .${entry.ext}`}
                          className="font-mono"
                        >
                          {isCopied && lastCopied === extKey ? <Check /> : <Copy />}.{entry.ext}
                        </Button>
                      </th>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant={isCopied && lastCopied === typeKey ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => handleCopy(typeKey, entry.type)}
                            aria-label={`Copy ${entry.type}`}
                            title={`Copy ${entry.type}`}
                            className="h-auto min-h-8 max-w-full whitespace-normal break-all py-1 text-left font-mono"
                          >
                            {isCopied && lastCopied === typeKey ? <Check /> : <Copy />}
                            {entry.type}
                          </Button>
                          <Badge variant="secondary" className="sm:hidden">
                            {CATEGORY_LABELS[entry.category]}
                          </Badge>
                        </div>
                        {entry.note && (
                          <p className="mt-1 px-3 text-xs text-muted-foreground">{entry.note}</p>
                        )}
                      </td>
                      <td className="hidden px-3 py-2 sm:table-cell">
                        <Badge variant="secondary">{CATEGORY_LABELS[entry.category]}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
