'use client';

import { formatBytes, formatSpeed, formatEta, cn } from '@/lib/utils';
import type { QbitTorrent } from '@/lib/types';

interface TorrentRowProps {
  torrent: QbitTorrent;
  mediaTitle?: string;
  isCrossSeed?: boolean;
}

const STATE_STYLES: Record<string, string> = {
  uploading: 'text-green-400',
  stalledUP: 'text-green-600',
  forcedUP: 'text-green-400',
  checkingUP: 'text-green-500',
  queuedUP: 'text-green-700',
  downloading: 'text-blue-400',
  stalledDL: 'text-amber-400',
  checkingDL: 'text-blue-500',
  pausedUP: 'text-zinc-400',
  pausedDL: 'text-zinc-400',
  queuedDL: 'text-zinc-500',
  error: 'text-red-400',
  missingFiles: 'text-red-400',
  unknown: 'text-zinc-500',
};

const STATE_LABELS: Record<string, string> = {
  uploading: 'Seeding',
  stalledUP: 'Stalled (up)',
  forcedUP: 'Seeding (forced)',
  checkingUP: 'Checking',
  queuedUP: 'Queued',
  downloading: 'Downloading',
  stalledDL: 'Stalled (dl)',
  checkingDL: 'Checking',
  pausedUP: 'Paused',
  pausedDL: 'Paused',
  queuedDL: 'Queued',
  error: 'Error',
  missingFiles: 'Missing files',
  unknown: 'Unknown',
};

export function TorrentRow({ torrent, mediaTitle, isCrossSeed }: TorrentRowProps) {
  const stateClass = STATE_STYLES[torrent.state] ?? 'text-zinc-500';
  const stateLabel = STATE_LABELS[torrent.state] ?? torrent.state;

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="text-sm text-white font-medium truncate max-w-xs" title={torrent.name}>
            {torrent.name}
          </p>
          {isCrossSeed && (
            <span className="shrink-0 rounded-full bg-cyan-900/60 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300 ring-1 ring-cyan-700">
              XS
            </span>
          )}
        </div>
        {mediaTitle && (
          <p className="text-xs text-zinc-500 truncate" title={mediaTitle}>
            → {mediaTitle}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-zinc-300 whitespace-nowrap">
        {formatBytes(torrent.size)}
      </td>
      <td className={cn('px-4 py-3 text-sm font-medium whitespace-nowrap', stateClass)}>
        {stateLabel}
      </td>
      <td className="px-4 py-3 text-sm text-zinc-300 whitespace-nowrap tabular-nums">
        {torrent.ratio.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-sm text-blue-400 whitespace-nowrap tabular-nums">
        {formatSpeed(torrent.dlspeed)}
      </td>
      <td className="px-4 py-3 text-sm text-green-400 whitespace-nowrap tabular-nums">
        {formatSpeed(torrent.upspeed)}
      </td>
      <td className="px-4 py-3 text-sm text-zinc-400 whitespace-nowrap">
        {formatEta(torrent.eta)}
      </td>
      <td className="px-4 py-3 text-xs text-zinc-500 max-w-[140px] truncate" title={torrent.tracker}>
        {torrent.tracker || '—'}
      </td>
    </tr>
  );
}

export function TorrentRowSkeleton() {
  return (
    <tr className="border-b border-zinc-800 animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-zinc-800" style={{ width: `${60 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  );
}
