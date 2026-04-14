import { useState } from 'react'
import { useTorrents, useUnmatchedTorrents } from '../hooks/useMedia'
import { cn, formatBytes, QBIT_STATE_LABELS } from '../types'

const SEEDING_STATES = new Set(['uploading', 'stalledUP', 'forcedUP', 'queuedUP', 'checkingUP'])

const STATE_COLOR: Record<string, string> = {
  uploading:   'text-green-400',
  stalledUP:   'text-green-500',
  forcedUP:    'text-green-400',
  checkingUP:  'text-green-600',
  queuedUP:    'text-green-700',
  downloading: 'text-blue-400',
  stalledDL:   'text-amber-400',
  error:       'text-red-400',
  missingFiles:'text-red-400',
  pausedUP:    'text-zinc-500',
  pausedDL:    'text-zinc-500',
}

type Tab = 'all' | 'unmatched'

export default function Torrents() {
  const [tab, setTab] = useState<Tab>('all')
  const [stateFilter, setStateFilter] = useState<'seeding' | 'all'>('all')

  const { data: torrents = [], isLoading } = useTorrents()
  const { data: unmatched = [], isLoading: unmatchedLoading } = useUnmatchedTorrents()

  const displayTorrents = tab === 'unmatched'
    ? unmatched.map(u => u.torrent)
    : stateFilter === 'seeding'
    ? torrents.filter(t => SEEDING_STATES.has(t.state))
    : torrents

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Torrents</h1>
        <div className="flex gap-2 text-xs">
          <span className="text-zinc-500">
            {torrents.length} total · {torrents.filter(t => SEEDING_STATES.has(t.state)).length} en seed
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1 w-fit">
        {(['all', 'unmatched'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white',
            )}
          >
            {t === 'all'
              ? `Tous (${torrents.length})`
              : `Non identifiés (${unmatched.length})`
            }
          </button>
        ))}
      </div>

      {/* State filter (only on "all" tab) */}
      {tab === 'all' && (
        <div className="flex gap-2">
          {(['all', 'seeding'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStateFilter(f)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                stateFilter === f
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white',
              )}
            >
              {f === 'all' ? 'Tous les états' : 'En seed uniquement'}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      {isLoading || unmatchedLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-zinc-900 animate-pulse" />
          ))}
        </div>
      ) : displayTorrents.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 py-16 text-center text-zinc-500">
          Aucun torrent
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Nom</th>
                <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">État</th>
                <th className="hidden md:table-cell px-4 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Taille</th>
                {tab === 'unmatched' && (
                  <th className="hidden lg:table-cell px-4 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">IMDB détecté</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {displayTorrents.map((t, i) => {
                const um = tab === 'unmatched' ? unmatched[i] : null
                return (
                  <tr key={t.hash} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-200 truncate max-w-xs lg:max-w-md">{t.name}</p>
                      <p className="text-xs text-zinc-600 font-mono mt-0.5 truncate">{t.hash.slice(0, 12)}…</p>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      <span className={cn('text-xs font-medium', STATE_COLOR[t.state] ?? 'text-zinc-500')}>
                        {QBIT_STATE_LABELS[t.state] ?? t.state}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-xs text-zinc-400">
                      {formatBytes(t.size)}
                    </td>
                    {tab === 'unmatched' && (
                      <td className="hidden lg:table-cell px-4 py-3 text-xs">
                        {um?.imdb_id ? (
                          <a
                            href={`https://www.imdb.com/title/${um.imdb_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline"
                          >
                            {um.imdb_id}
                            {um.guessed_title && (
                              <span className="ml-1 text-zinc-500">({um.guessed_title})</span>
                            )}
                          </a>
                        ) : (
                          <span className="text-zinc-600">
                            {um?.guessed_title ?? '—'}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
