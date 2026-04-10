'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft, Film, ExternalLink, HardDrive, Shuffle, Upload, AlertTriangle,
  Bug, Check, X, RefreshCw,
} from 'lucide-react';
import { SeedBadge, HardlinkBadge, TypeBadge, CrossSeedBadge } from '@/components/StatusBadge';
import { formatBytes, formatSpeed, formatEta, cn } from '@/lib/utils';
import type { EnrichedMedia, RadarrMovie } from '@/lib/types';

interface MovieDetailData {
  media: EnrichedMedia;
  radarrMovie?: RadarrMovie;
}

const STATE_STYLES: Record<string, string> = {
  uploading: 'text-green-400', stalledUP: 'text-green-500', forcedUP: 'text-green-400',
  checkingUP: 'text-green-600', queuedUP: 'text-green-700',
  downloading: 'text-blue-400', stalledDL: 'text-amber-400',
  error: 'text-red-400', missingFiles: 'text-red-400',
  pausedUP: 'text-zinc-400', pausedDL: 'text-zinc-400',
};
const STATE_LABELS: Record<string, string> = {
  uploading: 'Seeding', stalledUP: 'Seeding (idle)', forcedUP: 'Seeding (forced)',
  checkingUP: 'Checking', queuedUP: 'Queued', downloading: 'Downloading',
  stalledDL: 'Stalled (dl)', error: 'Error', missingFiles: 'Missing files',
  pausedUP: 'Paused', pausedDL: 'Paused',
};

const RADARR_URL = process.env.NEXT_PUBLIC_RADARR_URL ?? '';

export default function MovieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showDiag, setShowDiag] = useState(false);

  const { data, isLoading, isError } = useQuery<MovieDetailData>({
    queryKey: ['media-detail', 'movie', id],
    queryFn: () => fetch(`/api/media/movie/${id}`).then(r => r.json()),
    staleTime: 30_000,
  });

  const { data: diag, isFetching: diagLoading, refetch: runDiag } = useQuery({
    queryKey: ['diag-hardlink', 'movie', id],
    queryFn: () => fetch(`/api/debug/hardlink?id=${id}&type=movie`).then(r => r.json()),
    enabled: false,
    retry: false,
  });

  if (isLoading) return <DetailSkeleton />;
  if (isError || !data?.media) return (
    <div className="text-center py-20 text-zinc-400">
      <Film className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
      <p>Film introuvable</p>
      <Link href="/" className="mt-4 inline-block text-sm text-zinc-500 underline">Retour au dashboard</Link>
    </div>
  );

  const { media } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      {/* Hero */}
      <div className="flex gap-6">
        <div className="shrink-0 w-32 sm:w-44">
          {media.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.posterUrl} alt={media.title} className="w-full rounded-xl border border-zinc-700 object-cover" />
          ) : (
            <div className="flex aspect-[2/3] w-full items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900">
              <Film className="h-10 w-10 text-zinc-600" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 pt-1">
          <div>
            <h1 className="text-2xl font-bold text-white">{media.title}</h1>
            <p className="text-zinc-400">{media.year}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <TypeBadge type="movie" />
            <SeedBadge status={media.seedingStatus} />
            {media.hardlinkStatus !== 'unknown' && <HardlinkBadge status={media.hardlinkStatus} />}
            <CrossSeedBadge count={media.crossSeedCount} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400">
            {media.size > 0 && <span><span className="text-zinc-500">Taille :</span> {formatBytes(media.size)}</span>}
            {media.torrents.length > 0 && (
              <span>
                <span className="text-zinc-500">Ratio global :</span>{' '}
                {media.globalRatio != null ? media.globalRatio.toFixed(2) : '∞'}
              </span>
            )}
            {media.totalUploaded > 0 && (
              <span><span className="text-zinc-500">↑ Total :</span> {formatBytes(media.totalUploaded)}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {RADARR_URL && data.radarrMovie && (
              <a
                href={`${RADARR_URL}/movie/${data.radarrMovie.titleSlug}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Ouvrir dans Radarr
              </a>
            )}
            <button
              onClick={() => { setShowDiag(v => !v); if (!diag) runDiag(); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-700 transition-colors"
            >
              <Bug className="h-3.5 w-3.5" /> Diagnose hardlinks
            </button>
          </div>
        </div>
      </div>

      {/* Hardlink diagnostic panel */}
      {showDiag && (
        <HardlinkDiagPanel diag={diag} loading={diagLoading} onRefresh={runDiag} />
      )}

      {/* Torrents actifs */}
      <Section icon={<Upload className="h-4 w-4" />} title={`Torrents actifs (${media.torrents.length})`}>
        {media.torrents.length === 0 ? (
          <Empty text="Aucun torrent trouvé dans qBittorrent pour ce film" />
        ) : (
          <div className="space-y-3">
            {media.torrents.map(t => (
              <div key={t.hash} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-white break-all">{t.name}</p>
                  <span className={cn('shrink-0 text-xs font-medium', STATE_STYLES[t.state] ?? 'text-zinc-500')}>
                    {STATE_LABELS[t.state] ?? t.state}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-zinc-400">
                  <Kv label="Taille" value={formatBytes(t.size)} />
                  <Kv label="Ratio" value={t.ratio.toFixed(2)} mono />
                  <Kv label="↑ Vitesse" value={formatSpeed(t.upspeed)} />
                  <Kv label="ETA" value={formatEta(t.eta)} />
                </div>
                {t.content_path && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Chemin /data (torrent)</p>
                    <p className="break-all rounded bg-zinc-800 px-2 py-1.5 font-mono text-xs text-zinc-300">{t.content_path}</p>
                  </div>
                )}
                {t.tracker && <p className="text-xs text-zinc-600 truncate">Tracker : {t.tracker}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Fichiers /media */}
      <Section icon={<HardDrive className="h-4 w-4" />} title="Fichiers dans /media (Radarr)">
        {media.filePaths.length === 0 ? (
          <Empty text="Aucun fichier connu dans la médiathèque Radarr" />
        ) : (
          <div className="space-y-1">
            {media.filePaths.map(p => (
              <div key={p} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                <p className="break-all font-mono text-xs text-zinc-300">{p}</p>
                <HardlinkBadge status={media.hardlinkStatus} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Cross Seed */}
      {media.crossSeedCount > 0 && (
        <Section icon={<Shuffle className="h-4 w-4" />} title={`Cross Seed (${media.crossSeedCount} torrent${media.crossSeedCount > 1 ? 's' : ''})`}>
          <div className="space-y-2">
            {media.torrents.filter(t => {
              const tags = (t.tags ?? '').toLowerCase();
              const cat = (t.category ?? '').toLowerCase();
              return tags.includes('cross-seed') || cat.includes('cross-seed');
            }).map(t => (
              <div key={t.hash} className="rounded-lg border border-cyan-900/60 bg-cyan-950/20 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-cyan-300 break-all">{t.name}</p>
                  <span className={cn('shrink-0 font-medium', STATE_STYLES[t.state] ?? 'text-zinc-500')}>
                    {STATE_LABELS[t.state] ?? t.state}
                  </span>
                </div>
                <p className="mt-1 font-mono text-zinc-500 text-[10px]">{t.hash}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {media.hasDuplicates && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {media.torrents.length} torrents correspondent à ce film — possible doublon.
        </div>
      )}
    </div>
  );
}

// ── Diagnostic panel ─────────────────────────────────────────────────────────

interface PathDiag {
  raw: string;
  mapped: string;
  accessible: boolean;
  inode: number | null;
  isFile: boolean | null;
  error?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HardlinkDiagPanel({ diag, loading, onRefresh }: { diag: any; loading: boolean; onRefresh: () => void }) {
  return (
    <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-4 space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 font-semibold text-zinc-300">
          <Bug className="h-3.5 w-3.5 text-zinc-500" /> Hardlink diagnostic
        </p>
        <button onClick={onRefresh} disabled={loading} className="text-zinc-500 hover:text-zinc-300">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && <p className="text-zinc-500">Running inode check…</p>}
      {!loading && !diag && <p className="text-zinc-600">Click refresh to run.</p>}
      {!loading && diag?.error && <p className="text-red-400">{diag.error}</p>}

      {!loading && diag && !diag.error && (
        <>
          {/* Mappings in use */}
          <div>
            <p className="text-zinc-500 mb-1 uppercase tracking-wide">Mappings applied</p>
            {diag.mappingsUsed?.length === 0 ? (
              <p className="text-zinc-600">None — configure one in Settings → Path mappings</p>
            ) : (
              diag.mappingsUsed?.map((m: PathDiag) => (
                <code key={`${m.raw}`} className="block text-zinc-400 font-mono">
                  {(m as unknown as PathMapping).from} → {(m as unknown as PathMapping).to}
                </code>
              ))
            )}
          </div>

          {/* Arr path */}
          <div>
            <p className="text-zinc-500 mb-1 uppercase tracking-wide">Radarr path</p>
            {diag.arrPath ? (
              <DiagRow d={diag.arrPath} />
            ) : (
              <p className="text-zinc-600">No file path from Radarr</p>
            )}
          </div>

          {/* Torrent paths */}
          <div>
            <p className="text-zinc-500 mb-1 uppercase tracking-wide">qBittorrent paths ({diag.torrents?.length ?? 0})</p>
            {diag.torrents?.length === 0 ? (
              <p className="text-zinc-600">No matching torrents found</p>
            ) : (
              <div className="space-y-1.5">
                {diag.torrents?.map((t: PathDiag & { name: string; hash: string }) => (
                  <div key={t.hash}>
                    <DiagRow d={t} label={t.name} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inode match result */}
          <div>
            <p className="text-zinc-500 mb-1 uppercase tracking-wide">Inode match</p>
            {diag.inodeMatches?.length > 0 ? (
              <div className="flex items-center gap-2 rounded-lg bg-green-950/40 border border-green-900/60 px-3 py-2 text-green-400">
                <Check className="h-3.5 w-3.5 shrink-0" />
                Hardlink confirmed — inode {diag.inodeMatches[0].inode}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-red-950/20 border border-red-900/40 px-3 py-2 text-red-400">
                <X className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  No matching inodes found.{' '}
                  {!diag.arrPath?.accessible
                    ? 'Radarr path is not accessible — check path mapping in Settings.'
                    : diag.torrents?.every((t: PathDiag) => !t.accessible)
                    ? 'qBittorrent paths are not accessible — check /data volume mount.'
                    : 'Paths are accessible but inodes differ — files may be copies, not hardlinks.'}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

interface PathMapping { from: string; to: string; }

function DiagRow({ d, label }: { d: PathDiag; label?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 space-y-1">
      {label && <p className="text-zinc-500 truncate">{label}</p>}
      <div className="flex items-center gap-2">
        {d.accessible ? (
          <Check className="h-3 w-3 text-green-500 shrink-0" />
        ) : (
          <X className="h-3 w-3 text-red-500 shrink-0" />
        )}
        <code className="break-all text-zinc-300 font-mono text-[10px]">{d.mapped}</code>
      </div>
      {d.accessible && (
        <p className="text-zinc-500 font-mono text-[10px]">
          inode: <span className="text-zinc-300">{d.inode}</span>
          {' · '}{d.isFile ? 'file' : 'directory'}
        </p>
      )}
      {!d.accessible && d.raw !== d.mapped && (
        <p className="text-zinc-600 font-mono text-[10px]">raw: {d.raw}</p>
      )}
      {d.error && <p className="text-red-400 text-[10px] break-all">{d.error}</p>}
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
        <span className="text-zinc-500">{icon}</span> {title}
      </h2>
      {children}
    </section>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={cn('text-zinc-300', mono && 'font-mono tabular-nums')}>{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500">{text}</p>;
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-4 w-24 rounded bg-zinc-800" />
      <div className="flex gap-6">
        <div className="h-44 w-32 rounded-xl bg-zinc-800" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="h-7 w-48 rounded bg-zinc-800" />
          <div className="h-4 w-16 rounded bg-zinc-800" />
          <div className="flex gap-1">
            <div className="h-5 w-14 rounded-full bg-zinc-800" />
            <div className="h-5 w-16 rounded-full bg-zinc-800" />
          </div>
        </div>
      </div>
      <div className="h-32 rounded-xl bg-zinc-800" />
      <div className="h-20 rounded-xl bg-zinc-800" />
    </div>
  );
}
