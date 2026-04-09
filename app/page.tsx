'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Film,
  Tv2,
  Upload,
  Link2,
  Link2Off,
  HardDrive,
  AlertTriangle,
  Shuffle,
} from 'lucide-react';
import { StatCard, StatCardSkeleton } from '@/components/StatCard';
import { MediaCard, MediaCardSkeleton } from '@/components/MediaCard';
import { formatBytes } from '@/lib/utils';
import type { EnrichedMedia, DashboardStats } from '@/lib/types';

const REFRESH_MS = parseInt(process.env.NEXT_PUBLIC_REFRESH_INTERVAL ?? '60', 10) * 1000;

interface DashboardData {
  media: EnrichedMedia[];
  stats: DashboardStats;
  errors: { radarr: string | null; sonarr: string | null; qbit: string | null };
}

export default function DashboardPage() {
  const { data, isLoading, isError, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/dashboard').then((r) => r.json()),
    refetchInterval: REFRESH_MS,
  });

  const stats = data?.stats;
  const media = data?.media ?? [];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Real-time overview of your media stack
        </p>
      </div>

      {/* Service errors */}
      {data?.errors && Object.entries(data.errors).some(([, v]) => v) && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-300">
          <p className="font-medium mb-1">Some services are unavailable:</p>
          <ul className="list-disc list-inside space-y-0.5 text-amber-400/80">
            {data.errors.radarr && <li>Radarr: {data.errors.radarr}</li>}
            {data.errors.sonarr && <li>Sonarr: {data.errors.sonarr}</li>}
            {data.errors.qbit && <li>qBittorrent: {data.errors.qbit}</li>}
          </ul>
        </div>
      )}

      {/* Global fetch error */}
      {isError && (
        <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
          Failed to load dashboard: {(error as Error)?.message ?? 'Unknown error'}.{' '}
          <a href="/settings" className="underline">Check your settings.</a>
        </div>
      )}

      {/* Stat cards */}
      <section>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard label="Movies" value={stats?.totalMovies ?? 0} icon={Film} color="blue" />
              <StatCard label="Series" value={stats?.totalSeries ?? 0} icon={Tv2} color="purple" />
              <StatCard label="Episodes" value={stats?.totalEpisodes ?? 0} icon={Tv2} color="purple" />
              <StatCard label="Seeding" value={stats?.seedingCount ?? 0} icon={Upload} color="green" />
              <StatCard label="Hardlinked" value={stats?.hardlinkedCount ?? 0} icon={Link2} color="green" />
              <StatCard
                label="Missing links"
                value={stats?.missingHardlinks ?? 0}
                icon={Link2Off}
                color={stats?.missingHardlinks ? 'red' : 'zinc'}
              />
              <StatCard
                label="Cross Seeds"
                value={stats?.crossSeedCount ?? 0}
                icon={Shuffle}
                color={(stats?.crossSeedCount ?? 0) > 0 ? 'blue' : 'zinc'}
              />
              <StatCard
                label="Seeding size"
                value={formatBytes(stats?.totalSeedingSize ?? 0)}
                icon={HardDrive}
                color="zinc"
              />
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
          <span>
            {stats.issueCount} issue{stats.issueCount !== 1 ? 's' : ''} detected — click to view
          </span>
        </a>
      )}

      {/* Media grid */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Library</h2>
          {media.length > 0 && (
            <span className="text-sm text-zinc-500">{media.length} items</span>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 18 }).map((_, i) => (
              <MediaCardSkeleton key={i} />
            ))}
          </div>
        ) : media.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 py-16 text-center">
            <Film className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
            <p className="text-zinc-400">No media found</p>
            <p className="mt-1 text-sm text-zinc-600">Check your Radarr/Sonarr settings</p>
            <a
              href="/settings"
              className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Go to Settings
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {media.map((m) => (
              <MediaCard key={`${m.type}-${m.id}`} media={m} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
