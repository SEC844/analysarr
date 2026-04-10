'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Search, Film, Tv2, Check, Link2 } from 'lucide-react';
import type { EnrichedMedia } from '@/lib/types';

interface Props {
  torrentHash: string;
  torrentName: string;
  onClose: () => void;
}

export function LinkTorrentModal({ torrentHash, torrentName, onClose }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: dashboard } = useQuery<{ media: EnrichedMedia[] }>({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/dashboard').then(r => r.json()),
    staleTime: 30_000,
  });

  const linkMutation = useMutation({
    mutationFn: (link: { torrentHash: string; mediaType: 'movie' | 'series'; mediaId: number }) =>
      fetch('/api/config/manual-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(link),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['torrents'] });
      onClose();
    },
  });

  const filtered = useMemo(() => {
    const all = dashboard?.media ?? [];
    if (!search.trim()) return all.slice(0, 20);
    const q = search.toLowerCase();
    return all.filter(m => m.title.toLowerCase().includes(q)).slice(0, 20);
  }, [dashboard?.media, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              <Link2 className="h-4 w-4 text-zinc-500 shrink-0" />
              Link torrent to media
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 truncate">{torrentName}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              autoFocus
              type="text"
              placeholder="Search movie or series…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 outline-none"
            />
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">No results</p>
          ) : (
            filtered.map(m => (
              <button
                key={`${m.type}-${m.id}`}
                onClick={() => linkMutation.mutate({ torrentHash, mediaType: m.type, mediaId: m.id })}
                disabled={linkMutation.isPending}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition-colors border-b border-zinc-800/50 last:border-0"
              >
                {m.type === 'movie'
                  ? <Film className="h-4 w-4 shrink-0 text-zinc-500" />
                  : <Tv2 className="h-4 w-4 shrink-0 text-zinc-500" />
                }
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200 truncate">{m.title}</p>
                  <p className="text-xs text-zinc-500">{m.year} · {m.type}</p>
                </div>
                {linkMutation.isPending && <Check className="h-4 w-4 text-zinc-500 animate-pulse" />}
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-600">
            Manual links override automatic detection and are saved to <code className="bg-zinc-800 px-1 rounded">/config/mappings.json</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
