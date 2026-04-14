'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertTriangle, Tv2, Film } from 'lucide-react';
import { SeedStatusBadge, HardlinkBadge, CrossSeedBadge } from './StatusBadge';
import { formatBytes, cn } from '@/lib/utils';
import type { EnrichedMedia } from '@/lib/types';

const STATE_COLOR: Record<string, string> = {
  uploading:   'text-green-400',
  stalledUP:   'text-green-500',
  forcedUP:    'text-green-400',
  checkingUP:  'text-green-600',
  queuedUP:    'text-green-700',
  stalledDL:   'text-amber-400',
  downloading: 'text-blue-400',
  error:       'text-red-400',
  missingFiles:'text-red-400',
  pausedUP:    'text-zinc-500',
  pausedDL:    'text-zinc-500',
};
const STATE_LABEL: Record<string, string> = {
  uploading:   'Seeding',
  stalledUP:   'Seeding (idle)',
  forcedUP:    'Seeding (forced)',
  stalledDL:   'Stalled',
  downloading: 'Downloading',
  error:       'Error',
  missingFiles:'Missing files',
  pausedUP:    'Paused',
  pausedDL:    'Paused',
};

export function MediaCard({ media }: { media: EnrichedMedia }) {
  const [imgError, setImgError] = useState(false);

  const mainTorrent = media.torrents[0];
  const stateLabel  = mainTorrent ? (STATE_LABEL[mainTorrent.state] ?? mainTorrent.state) : null;
  const stateColor  = mainTorrent ? (STATE_COLOR[mainTorrent.state] ?? 'text-zinc-400') : '';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18 }}
      className="group relative flex flex-col overflow-hidden rounded-lg border transition-all duration-200
                 bg-surface border-default
                 hover:border-gray-300 dark:hover:border-zinc-600
                 hover:shadow-sm dark:hover:shadow-zinc-900/50"
    >
      {/* Poster */}
      <Link href={`/media/${media.type}/${media.id}`} className="relative block aspect-[2/3] w-full overflow-hidden bg-gray-100 dark:bg-zinc-800">
        {media.posterUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.posterUrl}
            alt={media.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-gray-300 dark:text-zinc-600">
            {media.type === 'movie' ? <Film className="h-7 w-7" /> : <Tv2 className="h-7 w-7" />}
            <p className="px-2 text-center text-[10px] leading-tight">{media.title}</p>
          </div>
        )}

        {/* Hover overlay with quick stats */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {mainTorrent && (
            <div className="space-y-0.5">
              <p className={cn('text-[11px] font-semibold', stateColor)}>{stateLabel}</p>
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span className="text-zinc-400">Ratio</span>
                <span className="font-mono tabular-nums">{mainTorrent.ratio.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span className="text-zinc-400">Size</span>
                <span>{formatBytes(mainTorrent.size)}</span>
              </div>
            </div>
          )}
          {!mainTorrent && media.size > 0 && (
            <p className="text-[11px] text-zinc-300">{formatBytes(media.size)}</p>
          )}
        </div>

        {/* Corner badges */}
        {media.hasDuplicates && (
          <div className="absolute top-1.5 right-1.5 rounded-full bg-amber-500/90 p-0.5 shadow">
            <AlertTriangle className="h-2.5 w-2.5 text-white" />
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-zinc-300 backdrop-blur-sm">
          {media.year}
        </div>
      </Link>

      {/* Card body — compact */}
      <div className="flex flex-col gap-1 p-2">
        <Link href={`/media/${media.type}/${media.id}`}>
          <h3 className="text-[11px] font-semibold leading-tight line-clamp-2 text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            {media.title}
          </h3>
        </Link>

        <div className="flex flex-wrap gap-1">
          <SeedStatusBadge status={media.seedStatus} compact />
          {media.hardlinkStatus === 'not_hardlinked' && media.seedStatus === 'seed_not_hardlink' && (
            <HardlinkBadge status={media.hardlinkStatus} compact />
          )}
          <CrossSeedBadge count={media.crossSeedCount} compact />
          {media.hasDuplicates && (
            <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-400">
              <AlertTriangle className="h-2 w-2" />
              {media.duplicateCount} dup
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function MediaCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-default bg-surface animate-pulse">
      <div className="aspect-[2/3] w-full bg-gray-100 dark:bg-zinc-800" />
      <div className="flex flex-col gap-1.5 p-2">
        <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-zinc-700" />
        <div className="flex gap-1">
          <div className="h-4 w-12 rounded-full bg-gray-200 dark:bg-zinc-700" />
        </div>
      </div>
    </div>
  );
}
