'use client';

import { Search, X } from 'lucide-react';

export type MediaSort = 'title' | 'year_desc' | 'year_asc' | 'size_desc';

interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  sort: MediaSort;
  onSort: (v: MediaSort) => void;
}

export function FilterBar({ search, onSearch, sort, onSort }: FilterBarProps) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-zinc-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Search title…"
          value={search}
          onChange={e => onSearch(e.target.value)}
          className="w-full rounded-lg border px-8 py-2 text-sm outline-none transition-colors
                     bg-surface border-default text-gray-900 dark:text-white
                     placeholder-gray-400 dark:placeholder-zinc-500
                     focus:border-gray-400 dark:focus:border-zinc-500"
        />
        {search && (
          <button
            onClick={() => onSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <select
        value={sort}
        onChange={e => onSort(e.target.value as MediaSort)}
        className="rounded-lg border px-3 py-2 text-sm outline-none transition-colors
                   bg-surface border-default text-gray-700 dark:text-zinc-300
                   focus:border-gray-400 dark:focus:border-zinc-500"
      >
        <option value="title">A → Z</option>
        <option value="year_desc">Year ↓</option>
        <option value="year_asc">Year ↑</option>
        <option value="size_desc">Size ↓</option>
      </select>
    </div>
  );
}
