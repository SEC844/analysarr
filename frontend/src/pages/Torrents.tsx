import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Link2, Search, Film, Tv2, Check } from 'lucide-react'
import { useTorrents, useUnmatchedTorrents, useMediaList, useMapTorrent, useUnmapTorrent } from '../hooks/useMedia'
import { cn, formatBytes, QBIT_STATE_LABELS, type UnmatchedTorrent, type MediaListItem } from '../types'

const SEEDING_STATES = new Set(['uploading', 'stalledUP', 'forcedUP', 'queuedUP', 'checkingUP'])

const STATE_COLOR: Record<string, string> = {
  uploading:    'text-green-400',
  stalledUP:    'text-green-500',
  forcedUP:     'text-green-400',
  checkingUP:   'text-green-600',
  queuedUP:     'text-green-700',
  downloading:  'text-blue-400',
  stalledDL:    'text-amber-400',
  error:        'text-red-400',
  missingFiles: 'text-red-400',
  pausedUP:     'text-zinc-500',
  pausedDL:     'text-zinc-500',
}

type Tab = 'all' | 'unmatched'

export default function Torrents() {
  const [tab, setTab]               = useState<Tab>('all')
  const [stateFilter, setStateFilter] = useState<'seeding' | 'all'>('all')
  const [mappingTarget, setMappingTarget] = useState<UnmatchedTorrent | null>(null)

  const { data: torrents = [], isLoading }            = useTorrents()
  const { data: unmatched = [], isLoading: umLoading } = useUnmatchedTorrents()

  const displayTorrents = tab === 'unmatched'
    ? unmatched.map(u => u.torrent)
    : stateFilter === 'seeding'
    ? torrents.filter(t => SEEDING_STATES.has(t.state))
    : torrents

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Torrents</h1>
        <span className="text-xs text-zinc-500">
          {torrents.length} total · {torrents.filter(t => SEEDING_STATES.has(t.state)).length} en seed
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1 w-fit">
        {(['all', 'unmatched'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white',
            )}>
            {t === 'all'
              ? `Tous (${torrents.length})`
              : `Non identifiés (${unmatched.length})`}
          </button>
        ))}
      </div>

      {/* Filtre état (onglet "all" uniquement) */}
      {tab === 'all' && (
        <div className="flex gap-2">
          {(['all', 'seeding'] as const).map(f => (
            <button key={f} onClick={() => setStateFilter(f)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                stateFilter === f
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white',
              )}>
              {f === 'all' ? 'Tous les états' : 'En seed uniquement'}
            </button>
          ))}
        </div>
      )}

      {/* Tableau */}
      {isLoading || umLoading ? (
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
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Identification</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {displayTorrents.map((t, i) => {
                const um = tab === 'unmatched' ? unmatched[i] : null
                return (
                  <tr key={t.hash} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-200 truncate max-w-xs lg:max-w-sm">{t.name}</p>
                      <p className="text-xs text-zinc-600 font-mono mt-0.5">{t.hash.slice(0, 12)}…</p>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      <span className={cn('text-xs font-medium', STATE_COLOR[t.state] ?? 'text-zinc-500')}>
                        {QBIT_STATE_LABELS[t.state] ?? t.state}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-xs text-zinc-400">
                      {formatBytes(t.size)}
                    </td>
                    {tab === 'unmatched' && um && (
                      <td className="px-4 py-3">
                        <UnmatchedCell
                          um={um}
                          onMap={() => setMappingTarget(um)}
                        />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal mapping manuel */}
      {mappingTarget && createPortal(
        <MappingModal
          um={mappingTarget}
          onClose={() => setMappingTarget(null)}
        />,
        document.body,
      )}
    </div>
  )
}

// ── Cellule identification (onglet Non identifiés) ────────────────────────────

function UnmatchedCell({ um, onMap }: { um: UnmatchedTorrent; onMap: () => void }) {
  const unmap = useUnmapTorrent()

  if (um.manual_media_id) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-blue-400">
          <Link2 className="h-3 w-3" />
          Associé manuellement
        </span>
        <button
          onClick={() => unmap.mutate(um.torrent.hash)}
          className="text-zinc-600 hover:text-red-400 transition-colors"
          title="Supprimer l'association"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  if (um.suggested_media_id) {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-xs text-green-400">
            <Check className="h-3 w-3" />
            Auto-détecté
          </span>
          <button
            onClick={onMap}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 underline"
          >
            Corriger
          </button>
        </div>
        {um.guessed_title && (
          <p className="text-[11px] text-zinc-400">
            {um.guessed_title}{um.guessed_year ? ` (${um.guessed_year})` : ''}
            {um.imdb_id && (
              <a
                href={`https://www.imdb.com/title/${um.imdb_id}`}
                target="_blank" rel="noopener noreferrer"
                className="ml-1 text-blue-500 hover:underline"
              >
                {um.imdb_id}
              </a>
            )}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-600">
        {um.guessed_title
          ? `${um.guessed_title}${um.guessed_year ? ` (${um.guessed_year})` : ''} — non trouvé`
          : 'Non identifié'
        }
      </span>
      <button
        onClick={onMap}
        className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
      >
        <Link2 className="h-3 w-3" />
        Associer
      </button>
    </div>
  )
}

// ── Modal mapping manuel ──────────────────────────────────────────────────────

function MappingModal({ um, onClose }: { um: UnmatchedTorrent; onClose: () => void }) {
  const [search, setSearch]   = useState(um.guessed_title ?? '')
  const [typeFilter, setType] = useState<'all' | 'movie' | 'series'>('all')
  const mapTorrent = useMapTorrent()

  const { data: mediaList = [] } = useMediaList()

  const filtered = mediaList.filter(m => {
    if (typeFilter !== 'all' && m.type !== typeFilter) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return m.title.toLowerCase().includes(q) || String(m.year).includes(q)
  })

  const handleMap = async (media: MediaListItem) => {
    await mapTorrent.mutateAsync({ hash: um.torrent.hash, media_id: media.id })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-semibold text-white text-sm">Associer manuellement</h2>
            <p className="text-xs text-zinc-500 truncate mt-0.5">{um.torrent.name}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-zinc-500 hover:text-white mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filtres */}
        <div className="flex gap-2 px-5 pt-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un titre…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-8 pr-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'movie', 'series'] as const).map(f => (
              <button key={f} onClick={() => setType(f)}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  typeFilter === f
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white',
                )}>
                {f === 'all' ? 'Tout' : f === 'movie' ? 'Films' : 'Séries'}
              </button>
            ))}
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto py-2 px-2 mt-2">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-600">Aucun résultat</p>
          ) : (
            filtered.slice(0, 80).map(m => (
              <button
                key={m.id}
                onClick={() => handleMap(m)}
                disabled={mapTorrent.isPending}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                <span className="shrink-0 text-zinc-500">
                  {m.type === 'movie'
                    ? <Film className="h-4 w-4" />
                    : <Tv2 className="h-4 w-4" />
                  }
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-zinc-200 truncate">{m.title}</span>
                  <span className="block text-xs text-zinc-500">
                    {m.year}{m.imdb_id ? ` · ${m.imdb_id}` : ''}
                  </span>
                </span>
                <Link2 className="shrink-0 h-3.5 w-3.5 text-zinc-600" />
              </button>
            ))
          )}
        </div>

        <div className="border-t border-zinc-800 px-5 py-3">
          <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300">
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
