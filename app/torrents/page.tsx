'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDownUp, Search } from 'lucide-react';
import { useState, useMemo } from 'react';
import { TorrentRow, TorrentRowSkeleton } from '@/components/TorrentRow';
import { LinkTorrentModal } from '@/components/LinkTorrentModal';
import { isCrossSeed } from '@/lib/utils';
import type { QbitTorrent, EnrichedMedia, DashboardStats } from '@/lib/types';

const REFRESH_MS = parseInt(process.env.NEXT_PUBLIC_REFRESH_INTERVAL ?? '60', 10) * 1000;

export default function TorrentsPage() {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [linking, setLinking] = useState<{ hash: string; name: string } | null>(null);

  const { data: torrents = [], isLoading: loadingTorrents } = useQuery<QbitTorrent[]>({
    queryKey: ['torrents'],
    queryFn: () => fetch('/api/qbit').then(r => r.json()),
    refetchInterval: REFRESH_MS,
  });

  const { data: dashboard } = useQuery<{ media: EnrichedMedia[]; stats: DashboardStats }>({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/dashboard').then(r => r.json()),
    refetchInterval: REFRESH_MS,
  });

  // Build hash → media title map and matched hash set
  const { hashToTitle, matchedHashes, crossSeedHashes } = useMemo(() => {
    const hashToTitle = new Map<string, string>();
    const matchedHashes = new Set<string>();
    const crossSeedHashes = new Set<string>();

    for (const m of dashboard?.media ?? []) {
      for (const t of m.torrents) {
        hashToTitle.set(t.hash, m.title);
        matchedHashes.add(t.hash);
      }
    }
    for (const t of torrents) {
      if (isCrossSeed(t.tags ?? '', t.category ?? '')) {
        crossSeedHashes.add(t.hash);
      }
    }
    return { hashToTitle, matchedHashes, crossSeedHashes };
  }, [dashboard, torrents]);

  const states = useMemo(() => {
    const s = new Set(torrents.map(t => t.state));
    return ['all', ...Array.from(s)];
  }, [torrents]);

  const filtered = useMemo(() => {
    return torrents.filter(t => {
      const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
      const matchState  = stateFilter === 'all' || t.state === stateFilter;
      return matchSearch && matchState;
    });
  }, [torrents, search, stateFilter]);

  const unmatchedCount = useMemo(
    () => filtered.filter(t => !matchedHashes.has(t.hash) && !crossSeedHashes.has(t.hash)).length,
    [filtered, matchedHashes, crossSeedHashes]
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Torrents</h1>
        <p className="mt-1 text-sm text-zinc-400">
          All active torrents from qBittorrent
          {unmatchedCount > 0 && (
            <span className="ml-2 rounded-full bg-amber-900/60 px-2 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-amber-700">
              {unmatchedCount} unmatched
            </span>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search torrents…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
          />
        </div>
        <select
          value={stateFilter}
          onChange={e => setStateFilter(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-zinc-500 focus:outline-none"
        >
          {states.map(s => <option key={s} value={s}>{s === 'all' ? 'All states' : s}</option>)}
        </select>
        <span className="text-sm text-zinc-500">
          {filtered.length} torrent{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
        {filtered.length === 0 && !loadingTorrents ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ArrowDownUp className="mb-3 h-10 w-10 text-zinc-600" />
            <p className="text-zinc-400">No torrents found</p>
            {search && <p className="mt-1 text-sm text-zinc-600">Try adjusting your search</p>}
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Ratio</th>
                <th className="px-4 py-3">↓</th>
                <th className="px-4 py-3">↑</th>
                <th className="px-4 py-3">ETA</th>
                <th className="px-4 py-3">Tracker</th>
              </tr>
            </thead>
            <tbody>
              {loadingTorrents
                ? Array.from({ length: 8 }).map((_, i) => <TorrentRowSkeleton key={i} />)
                : filtered.map(t => {
                    const isUnmatched = !matchedHashes.has(t.hash) && !crossSeedHashes.has(t.hash);
                    return (
                      <TorrentRow
                        key={t.hash}
                        torrent={t}
                        mediaTitle={hashToTitle.get(t.hash)}
                        isCrossSeed={crossSeedHashes.has(t.hash)}
                        isUnmatched={isUnmatched}
                        onLinkClick={() => setLinking({ hash: t.hash, name: t.name })}
                      />
                    );
                  })}
            </tbody>
          </table>
        )}
      </div>

      {/* Manual link modal */}
      {linking && (
        <LinkTorrentModal
          torrentHash={linking.hash}
          torrentName={linking.name}
          onClose={() => setLinking(null)}
        />
      )}
    </div>
  );
}
