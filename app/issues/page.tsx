'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Film, Tv2, Link2, Copy, Ghost } from 'lucide-react';
import type { IssueItem, EnrichedMedia, DashboardStats } from '@/lib/types';

const REFRESH_MS = parseInt(process.env.NEXT_PUBLIC_REFRESH_INTERVAL ?? '60', 10) * 1000;

const ISSUE_META: Record<
  IssueItem['type'],
  { label: string; description: string; variant: 'amber' | 'red'; icon: React.ElementType }
> = {
  no_torrent:       { label: 'No torrent',       description: 'File present in library but no matching torrent in qBittorrent', variant: 'amber', icon: AlertTriangle },
  orphan_torrent:   { label: 'Orphan torrent',   description: 'Torrent exists in qBittorrent but not linked to any *arr entry', variant: 'red',   icon: Ghost        },
  duplicate:        { label: 'Duplicate',         description: 'Multiple torrents matched to the same media entry',              variant: 'amber', icon: Copy         },
  copy_not_hardlink:{ label: 'Not hardlinked',    description: 'File appears to be a copy rather than a hardlink',               variant: 'red',   icon: Link2        },
};

const variantCard = {
  amber: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300',
  red:   'border-red-200   dark:border-red-800   bg-red-50   dark:bg-red-950/30   text-red-700   dark:text-red-300',
};
const variantIcon = {
  amber: 'text-amber-500 dark:text-amber-400',
  red:   'text-red-500   dark:text-red-400',
};

export default function IssuesPage() {
  const { data, isLoading } = useQuery<{
    issues: IssueItem[];
    media: EnrichedMedia[];
    stats: DashboardStats;
  }>({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/dashboard').then(r => r.json()),
    refetchInterval: REFRESH_MS,
  });

  const issues  = data?.issues ?? [];
  const grouped = issues.reduce<Record<string, IssueItem[]>>((acc, issue) => {
    acc[issue.type] = [...(acc[issue.type] ?? []), issue];
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Issues</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
          Automatically detected problems in your media library
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl border border-default bg-surface animate-pulse" />
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
        <div className="space-y-8">
          {(Object.keys(ISSUE_META) as IssueItem['type'][])
            .filter(type => grouped[type]?.length)
            .map(type => {
              const meta  = ISSUE_META[type];
              const Icon  = meta.icon;
              const items = grouped[type];

              return (
                <section key={type} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${variantIcon[meta.variant]}`} />
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                      {meta.label}
                      <span className="ml-2 text-sm font-normal text-gray-400 dark:text-zinc-500">({items.length})</span>
                    </h2>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">{meta.description}</p>
                  <ul className="space-y-2">
                    {items.map(issue => (
                      <li key={issue.id} className={`flex items-start gap-3 rounded-xl border p-4 ${variantCard[meta.variant]}`}>
                        <div className="mt-0.5 shrink-0">
                          {issue.mediaType === 'movie' ? <Film className="h-4 w-4" />
                            : issue.mediaType === 'series' ? <Tv2 className="h-4 w-4" />
                            : <Icon className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{issue.title}</p>
                          <p className="text-xs opacity-70 mt-0.5">{issue.description}</p>
                          {issue.torrentHash && (
                            <p className="text-xs opacity-50 mt-0.5 font-mono truncate">{issue.torrentHash}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
        </div>
      )}
    </div>
  );
}
