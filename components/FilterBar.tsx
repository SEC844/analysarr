'use client';

import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MediaFilter = 'all' | 'movies' | 'series' | 'seeding' | 'not_seeding' | 'issues' | 'crossseed';
export type MediaSort   = 'title' | 'year_desc' | 'year_asc' | 'size_desc';

interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  filter: MediaFilter;
  onFilter: (v: MediaFilter) => void;
  sort: MediaSort;
  onSort: (v: MediaSort) => void;
  counts: Record<MediaFilter, number>;
}

const FILTERS: { key: MediaFilter; label: string }[] = [
  { key: 'all',        label: 'All'         },
  { key: 'movies',     label: 'Movies'      },
  { key: 'series',     label: 'Series'      },
  { key: 'seeding',    label: 'Seeding'     },
  { key: 'not_seeding',label: 'Not seeding' },
  { key: 'crossseed',  label: 'Cross Seed'  },
  { key: 'issues',     label: 'Issues'      },
];

export function FilterBar({ search, onSearch, filter, onFilter, sort, onSort, counts }: FilterBarProps) {
  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onFilter(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === key
                ? 'bg-zinc-100 text-zinc-900'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
            )}
          >
            {label}
            <span className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
              filter === key ? 'bg-zinc-300 text-zinc-900' : 'bg-zinc-700 text-zinc-400',
            )}>
              {counts[key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search + sort row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search title…"
            value={search}
            onChange={e => onSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 pl-8 pr-8 py-2 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => onSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={sort}
          onChange={e => onSort(e.target.value as MediaSort)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 focus:border-zinc-500 focus:outline-none"
        >
          <option value="title">A → Z</option>
          <option value="year_desc">Year ↓</option>
          <option value="year_asc">Year ↑</option>
          <option value="size_desc">Size ↓</option>
        </select>
      </div>
    </div>
  );
}
