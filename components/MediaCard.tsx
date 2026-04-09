'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { SeedBadge, HardlinkBadge, TypeBadge, CrossSeedBadge } from './StatusBadge';
import { formatBytes } from '@/lib/utils';
import type { EnrichedMedia } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MediaCardProps {
  media: EnrichedMedia;
}

export function MediaCard({ media }: MediaCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const mainTorrent = media.torrents[0];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600"
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-800">
        {media.posterUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.posterUrl}
            alt={media.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600 text-sm text-center px-2">
            {media.title}
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/90 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 flex flex-col justify-end p-3 gap-1">
          {mainTorrent && (
            <>
              <p className="text-xs text-zinc-300">
                Ratio: <span className="font-medium text-white">{mainTorrent.ratio.toFixed(2)}</span>
              </p>
              <p className="text-xs text-zinc-300">
                Size: <span className="font-medium text-white">{formatBytes(mainTorrent.size)}</span>
              </p>
              {mainTorrent.tracker && (
                <p className="text-xs text-zinc-400 truncate">{mainTorrent.tracker}</p>
              )}
            </>
          )}
        </div>

        {/* Duplicate warning */}
        {media.hasDuplicates && (
          <div className="absolute top-2 right-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 drop-shadow" />
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-white leading-tight line-clamp-2">
            {media.title}
          </h3>
          <span className="shrink-0 text-xs text-zinc-500">{media.year}</span>
        </div>

        <div className="flex flex-wrap gap-1">
          <TypeBadge type={media.type} />
          <SeedBadge status={media.seedingStatus} />
          <HardlinkBadge status={media.hardlinkStatus} />
          <CrossSeedBadge count={media.crossSeedCount} />
        </div>

        {media.type === 'series' && media.episodeSeedingCount !== undefined && (
          <p className="text-xs text-zinc-400">
            {media.episodeSeedingCount} torrent{media.episodeSeedingCount !== 1 ? 's' : ''} seeding
          </p>
        )}

        {/* Duplicates expandable */}
        {media.hasDuplicates && (
          <div>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
              />
              {media.torrents.length} duplicates
            </button>
            <AnimatePresence>
              {expanded && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-1 space-y-1 overflow-hidden"
                >
                  {media.torrents.map((t) => (
                    <li key={t.hash} className="truncate text-xs text-zinc-400">
                      {t.name}
                    </li>
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
