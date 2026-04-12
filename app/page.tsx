'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Film, Tv2, Upload, Link2, Link2Off, HardDrive, AlertTriangle, Shuffle } from 'lucide-react';
import { StatCard, StatCardSkeleton } from '@/components/StatCard';
import { MediaCard, MediaCardSkeleton } from '@/components/MediaCard';
import { FilterBar, type MediaSort } from '@/components/FilterBar';
import { formatBytes } from '@/lib/utils';
import { usePosterSize } from '@/lib/hooks';
import type { EnrichedMedia, DashboardStats } from '@/lib/types';

const REFRESH_MS = parseInt(process.env.NEXT_PUBLIC_REFRESH_INTERVAL ?? '60', 10) * 1000;

type FilterKey = 'movies' | 'series' | 'seeding' | 'not_seeding' | 'hardlinked' | 'not_hardlinked' | 'crossseed' | 'issues';

const GRID_COLS = {
  sm: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9 2xl:grid-cols-11',
  md: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-9',
  lg: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
};

interface DashboardData {
  media: EnrichedMedia[];
  stats: DashboardStats;
  errors: { radarr: string | null; sonarr: string | null; qbit: string | null };
}

export default function DashboardPage() {
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const [sort, setSort] = useState<MediaSort>('title');
  const [posterSize, setPosterSize] = usePosterSize();

  const { data, isLoading, isError, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/dashboard').then(r => r.json()),
    refetchInterval: REFRESH_MS,
  });

  const stats    = data?.stats;
  const allMedia = useMemo(() => data?.media ?? [], [data]);

  function toggleFilter(key: FilterKey) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const media = useMemo(() => {
    let list = allMedia;

    // Type filters (OR within group)
    const typeFilters = (['movies', 'series'] as FilterKey[]).filter(f => activeFilters.has(f));
    if (typeFilters.length > 0) {
      list = list.filter(m =>
        (activeFilters.has('movies') && m.type === 'movie') ||
        (activeFilters.has('series') && m.type === 'series'),
      );
    }

    // Status filters (AND — each active filter narrows further)
    if (activeFilters.has('seeding'))        list = list.filter(m => m.seedingStatus === 'seeding');
    if (activeFilters.has('not_seeding'))    list = list.filter(m => m.seedingStatus === 'not_seeding');
    if (activeFilters.has('hardlinked'))     list = list.filter(m => m.hardlinkStatus === 'hardlinked');
    if (activeFilters.has('not_hardlinked')) list = list.filter(m => m.hardlinkStatus === 'not_hardlinked');
    if (activeFilters.has('crossseed'))      list = list.filter(m => m.crossSeedCount > 0);
    if (activeFilters.has('issues'))         list = list.filter(m => m.hasDuplicates || m.hardlinkStatus === 'not_hardlinked');

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(m => m.title.toLowerCase().includes(q) || String(m.year).includes(q));
    }
    if (sort === 'title')     list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'year_desc') list = [...list].sort((a, b) => b.year - a.year);
    if (sort === 'year_asc')  list = [...list].sort((a, b) => a.year - b.year);
    if (sort === 'size_desc') list = [...list].sort((a, b) => b.size - a.size);
    return list;
  }, [allMedia, activeFilters, search, sort]);

  const hasActiveFilters = activeFilters.size > 0 || search.trim().length > 0;

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Service errors */}
      {data?.errors && Object.values(data.errors).some(Boolean) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-700 dark:text-amber-300">
          <p className="font-medium mb-1">Some services are unavailable:</p>
          <ul className="list-disc list-inside space-y-0.5 text-amber-600 dark:text-amber-400/80">
            {data.errors.radarr && <li>Radarr: {data.errors.radarr}</li>}
            {data.errors.sonarr && <li>Sonarr: {data.errors.sonarr}</li>}
            {data.errors.qbit   && <li>qBittorrent: {data.errors.qbit}</li>}
          </ul>
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load: {(error as Error)?.message ?? 'Unknown error'}.{' '}
          <a href="/settings" className="underline">Check Settings.</a>
        </div>
      )}

      {/* Stat cards — clickable filters */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)
          : <>
              <StatCard label="Movies"       value={stats?.totalMovies    ?? 0} icon={Film}     color="blue"   onClick={() => toggleFilter('movies')}       active={activeFilters.has('movies')} />
              <StatCard label="Series"       value={stats?.totalSeries    ?? 0} icon={Tv2}      color="purple" onClick={() => toggleFilter('series')}       active={activeFilters.has('series')} />
              <StatCard label="Episodes"     value={stats?.totalEpisodes  ?? 0} icon={Tv2}      color="purple" />
              <StatCard label="Seeding"      value={stats?.seedingCount   ?? 0} icon={Upload}   color="green"  onClick={() => toggleFilter('seeding')}      active={activeFilters.has('seeding')} />
              <StatCard label="Hardlinked"   value={stats?.hardlinkedCount ?? 0} icon={Link2}   color="green"  onClick={() => toggleFilter('hardlinked')}   active={activeFilters.has('hardlinked')} />
              <StatCard label="No hardlink"  value={stats?.missingHardlinks ?? 0} icon={Link2Off} color={stats?.missingHardlinks ? 'red' : 'zinc'} onClick={() => toggleFilter('not_hardlinked')} active={activeFilters.has('not_hardlinked')} />
              <StatCard label="Cross Seeds"  value={stats?.crossSeedCount ?? 0} icon={Shuffle}  color={(stats?.crossSeedCount ?? 0) > 0 ? 'blue' : 'zinc'} onClick={() => toggleFilter('crossseed')} active={activeFilters.has('crossseed')} />
              <StatCard label="Seeding size" value={formatBytes(stats?.totalSeedingSize ?? 0)} icon={HardDrive} color="zinc" />
            </>
        }
      </div>

      {/* Issues banner */}
      {stats && stats.issueCount > 0 && (
        <a
          href="/issues"
          className="flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-100 dark:hover:bg-amber-950/50"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {stats.issueCount} issue{stats.issueCount !== 1 ? 's' : ''} detected — click to view
        </a>
      )}

      {/* Library */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Library</h2>
            {!isLoading && (
              <span className="text-xs text-gray-400 dark:text-zinc-500">
                {media.length}{media.length !== allMedia.length ? ` / ${allMedia.length}` : ''} items
              </span>
            )}
            {hasActiveFilters && !isLoading && (
              <button
                onClick={() => { setActiveFilters(new Set()); setSearch(''); }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Poster size toggle */}
          {!isLoading && (
            <div className="flex items-center gap-1 rounded-lg border border-default bg-surface p-0.5">
              {(['sm', 'md', 'lg'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setPosterSize(s)}
                  title={s === 'sm' ? 'Small' : s === 'md' ? 'Medium' : 'Large'}
                  className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                    posterSize === s
                      ? 'bg-gray-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
                  }`}
                >
                  {s === 'sm' ? (
                    <span className="flex items-center gap-0.5">
                      <span className="inline-block w-2 h-2 rounded-[2px] border border-current" />
                      <span className="inline-block w-2 h-2 rounded-[2px] border border-current" />
                      <span className="inline-block w-2 h-2 rounded-[2px] border border-current" />
                    </span>
                  ) : s === 'md' ? (
                    <span className="flex items-center gap-0.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-[2px] border border-current" />
                      <span className="inline-block w-2.5 h-2.5 rounded-[2px] border border-current" />
                    </span>
                  ) : (
                    <span className="inline-block w-3.5 h-3.5 rounded-[2px] border border-current" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {!isLoading && (
          <div className="mb-3">
            <FilterBar search={search} onSearch={setSearch} sort={sort} onSort={setSort} />
          </div>
        )}

        {isLoading ? (
          <div className={`grid gap-2.5 ${GRID_COLS.md}`}>
            {Array.from({ length: 22 }).map((_, i) => <MediaCardSkeleton key={i} />)}
          </div>
        ) : media.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-default bg-surface py-16 text-center">
            <Film className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-zinc-600" />
            <p className="text-gray-500 dark:text-zinc-400">
              {allMedia.length === 0 ? 'No media found' : 'No results for this filter'}
            </p>
            {allMedia.length === 0 ? (
              <a href="/settings" className="mt-4 rounded-lg bg-gray-100 dark:bg-zinc-800 px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors">
                Go to Settings
              </a>
            ) : (
              <button
                onClick={() => { setActiveFilters(new Set()); setSearch(''); }}
                className="mt-4 rounded-lg bg-gray-100 dark:bg-zinc-800 px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className={`grid gap-2.5 ${GRID_COLS[posterSize]}`}>
            {media.map(m => <MediaCard key={`${m.type}-${m.id}`} media={m} />)}
          </div>
        )}
      </section>
    </div>
  );
}
