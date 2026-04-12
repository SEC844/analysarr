'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Film, Tv2, Link2, Copy, Ghost, ChevronDown, ChevronRight } from 'lucide-react';
import type { IssueItem, EnrichedMedia, DashboardStats } from '@/lib/types';

const REFRESH_MS = parseInt(process.env.NEXT_PUBLIC_REFRESH_INTERVAL ?? '60', 10) * 1000;

const ISSUE_META: Record<
  IssueItem['type'],
  { label: string; description: string; variant: 'amber' | 'red'; icon: React.ElementType }
> = {
  no_torrent:       { label: 'No torrent',    description: 'File present in library but no matching torrent in qBittorrent', variant: 'amber', icon: AlertTriangle },
  orphan_torrent:   { label: 'Orphan torrent', description: 'Torrent exists in qBittorrent but not linked to any *arr entry', variant: 'red',   icon: Ghost        },
  duplicate:        { label: 'Duplicate',      description: 'Multiple torrents matched to the same media entry',              variant: 'amber', icon: Copy         },
  copy_not_hardlink:{ label: 'Not hardlinked', description: 'File appears to be a copy rather than a hardlink',               variant: 'red',   icon: Link2        },
};

const variantHeader = {
  amber: 'text-amber-700 dark:text-amber-300',
  red:   'text-red-700   dark:text-red-300',
};
const variantIcon = {
  amber: 'text-amber-500 dark:text-amber-400',
  red:   'text-red-500   dark:text-red-400',
};
const variantBadge = {
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  red:   'bg-red-100   text-red-700   dark:bg-red-900/50   dark:text-red-300',
};

export default function IssuesPage() {
  const [expanded, setExpanded] = useState<Set<IssueItem['type']>>(new Set());

  const { data, isLoading } = useQuery<{
    issues: IssueItem[];
    media: EnrichedMedia[];
    stats: DashboardStats;
  }>({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/dashboard').then(r => r.json()),
    refetchInterval: REFRESH_MS,
  });

  const issues = data?.issues ?? [];
  const grouped = issues.reduce<Record<string, IssueItem[]>>((acc, issue) => {
    acc[issue.type] = [...(acc[issue.type] ?? []), issue];
    return acc;
  }, {});

  function toggle(type: IssueItem['type']) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Issues</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
          Automatically detected problems in your media library
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-default bg-surface animate-pulse" />
          ))}
        </div>
      ) : issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-default bg-surface py-20 text-center">
          <div className="mb-3 rounded-full bg-green-100 dark:bg-green-900/30 p-4">
            <AlertTriangle className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <p className="font-medium text-gray-900 dark:text-white">No issues detected</p>
          <p className="mt-1 text-sm text-gray-400 dark:text-zinc-500">Your library looks healthy!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(Object.keys(ISSUE_META) as IssueItem['type'][])
            .filter(type => grouped[type]?.length)
            .map(type => {
              const meta  = ISSUE_META[type];
              const Icon  = meta.icon;
              const items = grouped[type];
              const open  = expanded.has(type);

              return (
                <div key={type} className="overflow-hidden rounded-xl border border-default bg-surface">
                  {/* Accordion header */}
                  <button
                    onClick={() => toggle(type)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevated transition-colors"
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${variantIcon[meta.variant]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${variantHeader[meta.variant]}`}>
                          {meta.label}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${variantBadge[meta.variant]}`}>
                          {items.length}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-zinc-500 truncate mt-0.5">
                        {meta.description}
                      </p>
                    </div>
                    {open
                      ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 dark:text-zinc-500" />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 dark:text-zinc-500" />
                    }
                  </button>

                  {/* Expanded items */}
                  {open && (
                    <div className="border-t border-default divide-y divide-default">
                      {items.map(issue => (
                        <div key={issue.id} className="flex items-start gap-3 px-4 py-3">
                          <div className="mt-0.5 shrink-0 text-gray-400 dark:text-zinc-500">
                            {issue.mediaType === 'movie' ? <Film className="h-4 w-4" />
                              : issue.mediaType === 'series' ? <Tv2 className="h-4 w-4" />
                              : <Icon className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-medium truncate ${variantHeader[meta.variant]}`}>
                              {issue.title}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5 leading-relaxed">
                              {issue.description}
                            </p>
                            {issue.torrentHash && (
                              <p className="text-[11px] text-gray-300 dark:text-zinc-600 mt-0.5 font-mono truncate">
                                {issue.torrentHash}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
