'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Film, Tv2, Upload, Link2, Link2Off, HardDrive, AlertTriangle, Shuffle } from 'lucide-react';
import { StatCard, StatCardSkeleton } from '@/components/StatCard';
import { MediaCard, MediaCardSkeleton } from '@/components/MediaCard';
import { FilterBar, type MediaFilter, type MediaSort } from '@/components/FilterBar';
import { formatBytes } from '@/lib/utils';
import type { EnrichedMedia, DashboardStats } from '@/lib/types';

const REFRESH_MS = parseInt(process.env.NEXT_PUBLIC_REFRESH_INTERVAL ?? '60', 10) * 1000;

interface DashboardData {
  media: EnrichedMedia[];
  stats: DashboardStats;
  errors: { radarr: string | null; sonarr: string | null; qbit: string | null };
}

export default function DashboardPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [sort,   setSort]   = useState<MediaSort>('title');

  const { data, isLoading, isError, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/dashboard').then(r => r.json()),
    refetchInterval: REFRESH_MS,
  });

  const stats    = data?.stats;
  const allMedia = useMemo(() => data?.media ?? [], [data]);

  const counts = useMemo(() => ({
    all:         allMedia.length,
    movies:      allMedia.filter(m => m.type === 'movie').length,
    series:      allMedia.filter(m => m.type === 'series').length,
    seeding:     allMedia.filter(m => m.seedingStatus === 'seeding').length,
    not_seeding: allMedia.filter(m => m.seedingStatus === 'not_seeding').length,
    crossseed:   allMedia.filter(m => m.crossSeedCount > 0).length,
    issues:      allMedia.filter(m => m.hasDuplicates || m.hardlinkStatus === 'not_hardlinked').length,
  }), [allMedia]);

  const media = useMemo(() => {
    let list = allMedia;
    if (filter === 'movies')      list = list.filter(m => m.type === 'movie');
    if (filter === 'series')      list = list.filter(m => m.type === 'series');
    if (filter === 'seeding')     list = list.filter(m => m.seedingStatus === 'seeding');
    if (filter === 'not_seeding') list = list.filter(m => m.seedingStatus === 'not_seeding');
    if (filter === 'crossseed')   list = list.filter(m => m.crossSeedCount > 0);
    if (filter === 'issues')      list = list.filter(m => m.hasDuplicates || m.hardlinkStatus === 'not_hardlinked');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(m => m.title.toLowerCase().includes(q) || String(m.year).includes(q));
    }
    if (sort === 'title')     list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'year_desc') list = [...list].sort((a, b) => b.year - a.year);
    if (sort === 'year_asc')  list = [...list].sort((a, b) => a.year - b.year);
    if (sort === 'size_desc') list = [...list].sort((a, b) => b.size - a.size);
    return list;
  }, [allMedia, filter, search, sort]);

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

      {/* Stat cards — 4 + 4 grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)
          : <>
              <StatCard label="Movies"        value={stats?.totalMovies    ?? 0}                    icon={Film}     color="blue"   />
              <StatCard label="Series"        value={stats?.totalSeries    ?? 0}                    icon={Tv2}      color="purple" />
              <StatCard label="Episodes"      value={stats?.totalEpisodes  ?? 0}                    icon={Tv2}      color="purple" />
              <StatCard label="Seeding"       value={stats?.seedingCount   ?? 0}                    icon={Upload}   color="green"  />
              <StatCard label="Hardlinked"    value={stats?.hardlinkedCount ?? 0}                   icon={Link2}    color="green"  />
              <StatCard label="No hardlink"   value={stats?.missingHardlinks ?? 0}                  icon={Link2Off} color={stats?.missingHardlinks ? 'red' : 'zinc'} />
              <StatCard label="Cross Seeds"   value={stats?.crossSeedCount ?? 0}                    icon={Shuffle}  color={(stats?.crossSeedCount ?? 0) > 0 ? 'blue' : 'zinc'} />
              <StatCard label="Seeding size"  value={formatBytes(stats?.totalSeedingSize ?? 0)}     icon={HardDrive} color="zinc"  />
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Library</h2>
          {!isLoading && (
            <span className="text-xs text-gray-400 dark:text-zinc-500">
              {media.length}{media.length !== allMedia.length ? ` / ${allMedia.length}` : ''} items
            </span>
          )}
        </div>

        {!isLoading && (
          <div className="mb-3">
            <FilterBar
              search={search} onSearch={setSearch}
              filter={filter} onFilter={setFilter}
              sort={sort}     onSort={setSort}
              counts={counts}
            />
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9 2xl:grid-cols-11">
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
                onClick={() => { setSearch(''); setFilter('all'); }}
                className="mt-4 rounded-lg bg-gray-100 dark:bg-zinc-800 px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9 2xl:grid-cols-11">
            {media.map(m => <MediaCard key={`${m.type}-${m.id}`} media={m} />)}
          </div>
        )}
      </section>
    </div>
  );
}
