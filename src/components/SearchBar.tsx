'use client';

import { Search } from 'lucide-react';
import { Input } from './ui/input';

interface SearchBarProps {
  value: string;
  onSearch: (query: string) => void;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function SearchBar({
  value,
  onSearch,
  placeholder = 'Search tools...',
  onKeyDown,
}: SearchBarProps) {
  return (
    <div className="relative w-full max-w-2xl">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onSearch(e.target.value)}
        onKeyDown={onKeyDown}
        className="h-11 pl-10 text-base sm:h-10 sm:text-sm"
      />
    </div>
  );
}
