'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, AlertTriangle, Tv2, Film } from 'lucide-react';
import { SeedBadge, HardlinkBadge, TypeBadge, CrossSeedBadge } from './StatusBadge';
import { formatBytes, cn } from '@/lib/utils';
import type { EnrichedMedia } from '@/lib/types';

const STATE_COLOR: Record<string, string> = {
  uploading:  'text-green-400',
  stalledUP:  'text-green-500',
  forcedUP:   'text-green-400',
  checkingUP: 'text-green-600',
  queuedUP:   'text-green-700',
  stalledDL:  'text-amber-400',
  downloading:'text-blue-400',
  error:      'text-red-400',
  missingFiles:'text-red-400',
  pausedUP:   'text-zinc-500',
  pausedDL:   'text-zinc-500',
};
const STATE_LABEL: Record<string, string> = {
  uploading:  'Seeding',
  stalledUP:  'Seeding (idle)',
  forcedUP:   'Seeding (forced)',
  stalledDL:  'Stalled (dl)',
  downloading:'Downloading',
  error:      'Error',
  missingFiles:'Missing files',
  pausedUP:   'Paused',
  pausedDL:   'Paused',
};

export function MediaCard({ media }: { media: EnrichedMedia }) {
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError]  = useState(false);

  const mainTorrent = media.torrents[0];
  const stateLabel  = mainTorrent ? (STATE_LABEL[mainTorrent.state] ?? mainTorrent.state) : null;
  const stateColor  = mainTorrent ? (STATE_COLOR[mainTorrent.state] ?? 'text-zinc-500') : '';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600"
    >
      {/* Poster (clickable → detail page) */}
      <Link href={`/media/${media.type}/${media.id}`} className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-800 block">
        {media.posterUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.posterUrl}
            alt={media.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-600">
            {media.type === 'movie' ? <Film className="h-8 w-8" /> : <Tv2 className="h-8 w-8" />}
            <p className="px-2 text-center text-xs">{media.title}</p>
          </div>
        )}

        {/* Gradient + hover detail overlay */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-zinc-950/95 via-zinc-950/20 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {mainTorrent && (
            <div className="space-y-1">
              <p className={cn('text-xs font-medium', stateColor)}>{stateLabel}</p>
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span>Ratio</span>
                <span className="font-mono">{mainTorrent.ratio.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span>Size</span>
                <span>{formatBytes(mainTorrent.size)}</span>
              </div>
              {mainTorrent.tracker && (
                <p className="truncate text-[10px] text-zinc-500">{mainTorrent.tracker}</p>
              )}
            </div>
          )}
          {!mainTorrent && media.size > 0 && (
            <p className="text-xs text-zinc-400">{formatBytes(media.size)}</p>
          )}
        </div>

        {/* Duplicate warning */}
        {media.hasDuplicates && (
          <div className="absolute top-2 right-2 rounded-full bg-amber-900/80 p-1">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
          </div>
        )}

        {/* Year chip */}
        <div className="absolute top-2 left-2 rounded-md bg-zinc-950/70 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
          {media.year}
        </div>
      </Link>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="text-sm font-semibold text-white leading-tight line-clamp-2">
          {media.title}
        </h3>

        <div className="flex flex-wrap gap-1">
          <TypeBadge type={media.type} />
          <SeedBadge status={media.seedingStatus} />
          {media.hardlinkStatus !== 'unknown' && (
            <HardlinkBadge status={media.hardlinkStatus} />
          )}
          <CrossSeedBadge count={media.crossSeedCount} />
        </div>

        {media.type === 'series' && media.episodeSeedingCount !== undefined && media.episodeSeedingCount > 0 && (
          <p className="text-xs text-zinc-400">
            {media.episodeSeedingCount} torrent{media.episodeSeedingCount !== 1 ? 's' : ''} seeding
          </p>
        )}

        {/* Duplicates expand */}
        {media.hasDuplicates && (
          <div>
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
              {media.torrents.length} duplicates
            </button>
            <AnimatePresence>
              {expanded && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-1 overflow-hidden space-y-1"
                >
                  {media.torrents.map(t => (
                    <li key={t.hash} className="truncate text-xs text-zinc-400">{t.name}</li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function MediaCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 animate-pulse">
      <div className="aspect-[2/3] w-full bg-zinc-800" />
      <div className="flex flex-col gap-2 p-3">
        <div className="h-4 w-3/4 rounded bg-zinc-800" />
        <div className="flex gap-1">
          <div className="h-5 w-12 rounded-full bg-zinc-800" />
          <div className="h-5 w-16 rounded-full bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}
