import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Film, Tv2, HardDrive, ExternalLink, AlertTriangle } from 'lucide-react'
import { useMediaDetail } from '../hooks/useMedia'
import { StatusBadge } from '../components/StatusBadge'
import { cn, formatBytes, formatSpeed, formatEta, QBIT_STATE_LABELS } from '../types'

export default function MediaDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: item, isLoading, isError } = useMediaDetail(id!)

  if (isLoading) return <DetailSkeleton />

  if (isError || !item) return (
    <div className="py-20 text-center space-y-3">
      <Film className="mx-auto h-10 w-10 text-zinc-700" />
      <p className="text-zinc-400">Média introuvable</p>
      <Link to="/" className="text-sm text-zinc-500 underline">Retour</Link>
    </div>
  )

  const isMovie  = item.media_type === 'movie'
  const Icon     = isMovie ? Film : Tv2
  const sourceLabel = isMovie ? 'Radarr' : 'Sonarr'

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in">
      {/* Back */}
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white transition-colors">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      {/* Hero */}
      <div className="flex gap-5">
        <div className="shrink-0 w-28 sm:w-36">
          {item.poster_url ? (
            <img
              src={item.poster_url}
              alt={item.title}
              className="w-full rounded-xl border border-zinc-700 shadow-xl"
            />
          ) : (
            <div className="flex aspect-[2/3] w-full items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900">
              <Icon className="h-10 w-10 text-zinc-700" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-1 min-w-0">
          <div>
            <h1 className="text-2xl font-bold text-white">{item.title}</h1>
            <p className="text-sm text-zinc-400">{item.year} · {sourceLabel}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusBadge status={item.seed_status} />
            {item.is_cross_seeded && (
              <span className="inline-flex items-center rounded-full border border-cyan-800 bg-cyan-900/50 px-2.5 py-0.5 text-xs font-medium text-cyan-400">
                Cross-seed actif
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400">
            {item.media_file && item.media_file.size > 0 && (
              <span>
                <span className="text-zinc-500">Taille :</span>{' '}
                <span className="text-zinc-300">{formatBytes(item.media_file.size)}</span>
              </span>
            )}
            {item.media_file && item.media_file.inode > 0 && (
              <span>
                <span className="text-zinc-500">Inode :</span>{' '}
                <code className="font-mono text-zinc-300">{item.media_file.inode}</code>
              </span>
            )}
            {item.media_file && (
              <span>
                <span className="text-zinc-500">nlink :</span>{' '}
                <span className="text-zinc-300">{item.media_file.nlink}</span>
              </span>
            )}
            {item.imdb_id && (
              <a
                href={`https://www.imdb.com/title/${item.imdb_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-400 hover:underline"
              >
                {item.imdb_id} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {item.episode_file_count > 0 && (
            <p className="text-sm text-zinc-400">
              <span className="text-zinc-500">Épisodes :</span>{' '}
              <span className="text-zinc-300">{item.episode_file_count} fichiers</span>
            </p>
          )}
        </div>
      </div>

      {/* Fichier de référence */}
      <Section title="Fichier de référence (/media)">
        {item.media_file?.exists ? (
          <FileRow file={item.media_file} highlight />
        ) : (
          <Empty text="Fichier non trouvé dans /media" />
        )}
      </Section>

      {/* Fichiers dans /torrents — section toujours visible */}
      <Section title={`Fichiers dans /torrents (${item.torrents_files.length})`}>
        {item.torrents_files.length === 0 ? (
          <Empty text="Aucun hardlink trouvé dans /torrents" />
        ) : (
          <div className="space-y-1.5">
            {item.torrents_files.map((f, i) => (
              <FileRow key={i} file={f} />
            ))}
          </div>
        )}
      </Section>

      {/* Cross-seed — uniquement si des fichiers sont présents */}
      {item.crossseed_files.length > 0 && (
        <Section title={`Cross-seed (/cross-seed) (${item.crossseed_files.length})`}>
          <div className="space-y-1.5">
            {item.crossseed_files.map((f, i) => (
              <FileRow key={i} file={f} accent="cyan" />
            ))}
          </div>
        </Section>
      )}

      {/* Doublons — uniquement si des copies physiques distinctes sont détectées */}
      {item.is_duplicate && item.duplicate_files.length > 0 && (
        <Section title={`Doublons détectés (${item.duplicate_files.length})`} warning>
          <p className="mb-2 text-xs text-amber-400/80">
            Ces fichiers ont la même taille que le fichier de référence mais un inode différent —
            ce sont des copies physiques distinctes (pas des hardlinks).
          </p>
          <div className="space-y-1.5">
            {item.duplicate_files.map((f, i) => (
              <FileRow key={i} file={f} accent="amber" />
            ))}
          </div>
        </Section>
      )}

      {/* Torrents qBit */}
      <Section title={`Torrents qBittorrent (${item.matched_torrents.length})`}>
        {item.matched_torrents.length === 0 ? (
          <Empty text="Aucun torrent associé" />
        ) : (
          <div className="space-y-2.5">
            {item.matched_torrents.map(t => (
              <TorrentRow key={t.hash} torrent={t} />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children, warning }: { title: string; children: React.ReactNode; warning?: boolean }) {
  const Icon = warning ? AlertTriangle : HardDrive
  return (
    <section className="space-y-2">
      <h2 className={cn(
        'flex items-center gap-2 text-sm font-semibold',
        warning ? 'text-amber-400' : 'text-zinc-300',
      )}>
        <Icon className={cn('h-3.5 w-3.5', warning ? 'text-amber-500' : 'text-zinc-500')} />
        {title}
      </h2>
      {children}
    </section>
  )
}

function FileRow({ file, highlight = false, accent }: {
  file: { path: string; size: number; inode: number; nlink: number; exists: boolean }
  highlight?: boolean
  accent?: 'cyan' | 'amber'
}) {
  const borderColor = accent === 'cyan'
    ? 'border-cyan-900/60 bg-cyan-950/20'
    : accent === 'amber'
    ? 'border-amber-900/60 bg-amber-950/20'
    : highlight
    ? 'border-blue-900/60 bg-blue-950/20'
    : 'border-zinc-800 bg-zinc-900'

  return (
    <div className={cn('rounded-xl border px-3 py-2.5 space-y-1', borderColor)}>
      <code className="block break-all text-xs text-zinc-300 font-mono">{file.path}</code>
      <div className="flex flex-wrap gap-3 text-[11px] text-zinc-500">
        <span>Taille : <span className="text-zinc-400">{formatBytes(file.size)}</span></span>
        <span>Inode : <code className="font-mono text-zinc-400">{file.inode}</code></span>
        <span>nlink : <span className={cn('font-medium', file.nlink >= 3 ? 'text-green-400' : file.nlink >= 2 ? 'text-yellow-400' : 'text-zinc-400')}>{file.nlink}</span></span>
      </div>
    </div>
  )
}

const TORRENT_STATE_COLORS: Record<string, string> = {
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
}

function TorrentRow({ torrent: t }: { torrent: import('../types').QbitTorrent }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-100 break-all">{t.name}</p>
        <span className={cn('shrink-0 text-xs font-medium', TORRENT_STATE_COLORS[t.state] ?? 'text-zinc-500')}>
          {QBIT_STATE_LABELS[t.state] ?? t.state}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Kv label="Taille"    value={formatBytes(t.size)} />
        <Kv label="Ratio"     value={t.ratio.toFixed(2)} mono />
        <Kv label="↑ Vitesse" value={formatSpeed(t.upspeed)} />
        <Kv label="ETA"       value={formatEta(t.eta)} />
      </div>
      {t.content_path && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Chemin /data</p>
          <code className="block break-all rounded-lg bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 font-mono">
            {t.content_path}
          </code>
        </div>
      )}
      {t.tracker && (
        <p className="text-xs text-zinc-600 truncate">Tracker : {t.tracker}</p>
      )}
    </div>
  )
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={cn('text-zinc-300', mono && 'font-mono tabular-nums')}>{value}</p>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-5 text-center text-sm text-zinc-500">
      {text}
    </p>
  )
}

function DetailSkeleton() {
  return (
    <div className="max-w-4xl space-y-6 animate-pulse">
      <div className="h-4 w-24 rounded bg-zinc-800" />
      <div className="flex gap-5">
        <div className="h-44 w-28 rounded-xl bg-zinc-800" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="h-7 w-60 rounded bg-zinc-800" />
          <div className="h-4 w-20 rounded bg-zinc-800" />
          <div className="h-6 w-28 rounded-full bg-zinc-800" />
        </div>
      </div>
    </div>
  )
}
