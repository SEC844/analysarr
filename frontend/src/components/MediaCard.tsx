import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Film, Tv2, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { StatusBadge } from './StatusBadge'
import { formatBytes, type MediaItem } from '../types'

export function MediaCard({ item }: { item: MediaItem }) {
  const [imgError, setImgError] = useState(false)
  const isMovie = item.media_type === 'movie'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:shadow-lg transition-all duration-200"
    >
      {/* Poster */}
      <Link to={`/media/${item.id}`} className="relative block aspect-[2/3] overflow-hidden bg-zinc-800">
        {item.poster_url && !imgError ? (
          <img
            src={item.poster_url}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-600">
            {isMovie
              ? <Film className="h-8 w-8" />
              : <Tv2 className="h-8 w-8" />
            }
            <p className="px-2 text-center text-[10px] leading-tight text-zinc-500">{item.title}</p>
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2.5 opacity-0 transition-opacity group-hover:opacity-100">
          {item.media_file && (
            <p className="text-[10px] text-zinc-300">{formatBytes(item.media_file.size)}</p>
          )}
          {item.matched_torrents[0] && (
            <p className="text-[10px] text-zinc-400">
              ↑ {formatBytes(item.matched_torrents[0].upspeed)}/s
            </p>
          )}
        </div>

        {/* Year badge */}
        <div className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-zinc-300">
          {item.year}
        </div>

        {/* Duplicate warning */}
        {item.is_duplicate && (
          <div className="absolute top-1.5 right-1.5 rounded-full bg-red-500/90 p-0.5">
            <AlertTriangle className="h-2.5 w-2.5 text-white" />
          </div>
        )}

        {/* Cross-seed indicator */}
        {item.is_cross_seeded && (
          <div className="absolute bottom-1.5 right-1.5 rounded bg-cyan-500/80 px-1 py-0.5 text-[8px] font-bold text-white">
            CS
          </div>
        )}
      </Link>

      {/* Card body */}
      <div className="flex flex-col gap-1 p-2">
        <Link to={`/media/${item.id}`}>
          <h3 className="text-[11px] font-semibold leading-tight line-clamp-2 text-zinc-100 hover:text-blue-400 transition-colors">
            {item.title}
          </h3>
        </Link>
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={item.seed_status} compact />
        </div>
      </div>
    </motion.div>
  )
}

export function MediaCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 animate-pulse">
      <div className="aspect-[2/3] bg-zinc-800" />
      <div className="flex flex-col gap-1.5 p-2">
        <div className="h-3 w-3/4 rounded bg-zinc-800" />
        <div className="h-4 w-16 rounded-full bg-zinc-800" />
      </div>
    </div>
  )
}
