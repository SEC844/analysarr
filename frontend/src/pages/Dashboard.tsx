import { useState } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import { useMedia, useStats, useTriggerScan } from '../hooks/useMedia'
import { MediaCard, MediaCardSkeleton } from '../components/MediaCard'
import { StatCard, TotalCard } from '../components/StatCard'
import { cn, type SeedStatus } from '../types'

const STATUS_FILTERS: SeedStatus[] = [
  'seed_ok', 'seed_no_cs', 'seed_not_hardlink', 'seed_duplicate', 'not_seeding',
]

export default function Dashboard() {
  const [statusFilter, setStatusFilter] = useState<SeedStatus | ''>('')
  const [sourceFilter, setSourceFilter] = useState<'radarr' | 'sonarr' | ''>('')
  const [typeFilter,   setTypeFilter]   = useState<'movie' | 'series' | ''>('')
  const [search,       setSearch]       = useState('')

  const { data: stats } = useStats()
  const { data: items, isLoading, isFetching } = useMedia({
    status:     statusFilter || undefined,
    source:     sourceFilter || undefined,
    media_type: typeFilter   || undefined,
    search:     search       || undefined,
  })

  const triggerScan = useTriggerScan()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <button
          onClick={() => triggerScan.mutate()}
          disabled={triggerScan.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', triggerScan.isPending && 'animate-spin')} />
          Scan
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <TotalCard count={stats.total} />
          {STATUS_FILTERS.map(s => (
            <StatCard
              key={s}
              status={s}
              count={stats[s] ?? 0}
              total={stats.total}
              active={statusFilter === s}
              onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
            />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Source filter */}
        <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
          {(['', 'radarr', 'sonarr'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={cn(
                'px-3 py-2 font-medium transition-colors',
                sourceFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white',
              )}
            >
              {s === '' ? 'Tous' : s === 'radarr' ? 'Films' : 'Séries'}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
          {(['', 'movie', 'series'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'px-3 py-2 font-medium transition-colors',
                typeFilter === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white',
              )}
            >
              {t === '' ? 'Tous' : t === 'movie' ? 'Film' : 'Série'}
            </button>
          ))}
        </div>

        {isFetching && !isLoading && (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-zinc-500" />
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 18 }).map((_, i) => <MediaCardSkeleton key={i} />)}
        </div>
      ) : !items?.length ? (
        <div className="rounded-xl border border-zinc-800 py-16 text-center text-zinc-500">
          {search || statusFilter || sourceFilter || typeFilter
            ? 'Aucun résultat pour ces filtres'
            : 'Aucun média — lancez un scan ou configurez vos services'}
        </div>
      ) : (
        <>
          <p className="text-xs text-zinc-500">{items.length} média{items.length > 1 ? 's' : ''}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map(item => <MediaCard key={item.id} item={item} />)}
          </div>
        </>
      )}
    </div>
  )
}
