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
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState<MediaFilter>('all');
  const [sort,    setSort]    = useState<MediaSort>('title');

  const { data, isLoading, isError, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/dashboard').then(r => r.json()),
    refetchInterval: REFRESH_MS,
  });

  const stats = data?.stats;
  const allMedia = data?.media ?? [];

  // ── Counts per filter tab ──────────────────────────────────────────────────
  const counts = useMemo(() => ({
    all:         allMedia.length,
    movies:      allMedia.filter(m => m.type === 'movie').length,
    series:      allMedia.filter(m => m.type === 'series').length,
    seeding:     allMedia.filter(m => m.seedingStatus === 'seeding').length,
    not_seeding: allMedia.filter(m => m.seedingStatus === 'not_seeding').length,
    crossseed:   allMedia.filter(m => m.crossSeedCount > 0).length,
    issues:      allMedia.filter(m => m.hasDuplicates || m.hardlinkStatus === 'not_hardlinked').length,
  }), [allMedia]);

  // ── Filter + search + sort ─────────────────────────────────────────────────
  const media = useMemo(() => {
    let list = allMedia;

    // Filter
    if (filter === 'movies')      list = list.filter(m => m.type === 'movie');
    if (filter === 'series')      list = list.filter(m => m.type === 'series');
    if (filter === 'seeding')     list = list.filter(m => m.seedingStatus === 'seeding');
    if (filter === 'not_seeding') list = list.filter(m => m.seedingStatus === 'not_seeding');
    if (filter === 'crossseed')   list = list.filter(m => m.crossSeedCount > 0);
    if (filter === 'issues')      list = list.filter(m => m.hasDuplicates || m.hardlinkStatus === 'not_hardlinked');

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(m => m.title.toLowerCase().includes(q) || String(m.year).includes(q));
    }

    // Sort
    if (sort === 'title')      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'year_desc')  list = [...list].sort((a, b) => b.year - a.year);
    if (sort === 'year_asc')   list = [...list].sort((a, b) => a.year - b.year);
    if (sort === 'size_desc')  list = [...list].sort((a, b) => b.size - a.size);

    return list;
  }, [allMedia, filter, search, sort]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">Real-time overview of your media stack</p>
      </div>

      {/* Service errors */}
      {data?.errors && Object.values(data.errors).some(Boolean) && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-300">
          <p className="font-medium mb-1">Some services are unavailable:</p>
          <ul className="list-disc list-inside space-y-0.5 text-amber-400/80">
            {data.errors.radarr  && <li>Radarr: {data.errors.radarr}</li>}
            {data.errors.sonarr  && <li>Sonarr: {data.errors.sonarr}</li>}
            {data.errors.qbit    && <li>qBittorrent: {data.errors.qbit}</li>}
          </ul>
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
          Failed to load dashboard: {(error as Error)?.message ?? 'Unknown error'}.{' '}
          <a href="/settings" className="underline">Check your settings.</a>
        </div>
      )}

      {/* Stat cards */}
      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)
            : (
              <>
                <StatCard label="Movies"       value={stats?.totalMovies ?? 0}                     icon={Film}     color="blue"   />
                <StatCard label="Series"       value={stats?.totalSeries ?? 0}                     icon={Tv2}      color="purple" />
                <StatCard label="Episodes"     value={stats?.totalEpisodes ?? 0}                   icon={Tv2}      color="purple" />
                <StatCard label="Seeding"      value={stats?.seedingCount ?? 0}                    icon={Upload}   color="green"  />
                <StatCard label="Hardlinked"   value={stats?.hardlinkedCount ?? 0}                 icon={Link2}    color="green"  />
                <StatCard label="Missing links" value={stats?.missingHardlinks ?? 0}              icon={Link2Off} color={stats?.missingHardlinks ? 'red' : 'zinc'} />
                <StatCard label="Cross Seeds"  value={stats?.crossSeedCount ?? 0}                  icon={Shuffle}  color={(stats?.crossSeedCount ?? 0) > 0 ? 'blue' : 'zinc'} />
                <StatCard label="Seeding size" value={formatBytes(stats?.totalSeedingSize ?? 0)}  icon={HardDrive} color="zinc"  />
              </>
            )}
        </div>
      </section>

      {/* Issues banner */}
      {stats && stats.issueCount > 0 && (
        <a
          href="/issues"
          className="flex items-center gap-2 rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-300 transition-colors hover:bg-amber-950/50"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {stats.issueCount} issue{stats.issueCount !== 1 ? 's' : ''} detected — click to view
        </a>
      )}

      {/* Library */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Library</h2>
          {!isLoading && (
            <span className="text-sm text-zinc-500">
              {media.length} / {allMedia.length}
            </span>
          )}
        </div>

        {!isLoading && (
          <div className="mb-4">
            <FilterBar
              search={search} onSearch={setSearch}
              filter={filter} onFilter={setFilter}
              sort={sort}     onSort={setSort}
              counts={counts}
            />
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 18 }).map((_, i) => <MediaCardSkeleton key={i} />)}
          </div>
        ) : media.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 py-16 text-center">
            <Film className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
            <p className="text-zinc-400">
              {allMedia.length === 0 ? 'No media found' : 'No results for this filter'}
            </p>
            {allMedia.length === 0 ? (
              <a href="/settings" className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">
                Go to Settings
              </a>
            ) : (
              <button
                onClick={() => { setSearch(''); setFilter('all'); }}
                className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {media.map(m => <MediaCard key={`${m.type}-${m.id}`} media={m} />)}
          </div>
        )}
      </section>
    </div>
  );
}
