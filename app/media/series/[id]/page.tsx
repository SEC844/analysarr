'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Tv2, ExternalLink, HardDrive, Shuffle, Upload, AlertTriangle } from 'lucide-react';
import { SeedBadge, HardlinkBadge, TypeBadge, CrossSeedBadge } from '@/components/StatusBadge';
import { formatBytes, formatSpeed, formatEta, cn, isCrossSeed } from '@/lib/utils';
import type { EnrichedMedia, SonarrSeries } from '@/lib/types';
import type { SonarrEpisodeFile } from '@/lib/sonarr';

interface SeriesDetailData {
  media: EnrichedMedia;
  sonarrSeries?: SonarrSeries;
  episodeFiles: SonarrEpisodeFile[];
}

const STATE_STYLES: Record<string, string> = {
  uploading: 'text-green-600 dark:text-green-400', stalledUP: 'text-green-600 dark:text-green-500',
  forcedUP: 'text-green-600 dark:text-green-400', checkingUP: 'text-green-700 dark:text-green-600',
  queuedUP: 'text-green-700', downloading: 'text-blue-600 dark:text-blue-400',
  stalledDL: 'text-amber-600 dark:text-amber-400', error: 'text-red-600 dark:text-red-400',
  missingFiles: 'text-red-600 dark:text-red-400', pausedUP: 'text-gray-500 dark:text-zinc-400',
  pausedDL: 'text-gray-500 dark:text-zinc-400',
};
const STATE_LABELS: Record<string, string> = {
  uploading: 'Seeding', stalledUP: 'Seeding (idle)', forcedUP: 'Seeding (forced)',
  checkingUP: 'Checking', queuedUP: 'Queued', downloading: 'Downloading',
  stalledDL: 'Stalled (dl)', error: 'Error', missingFiles: 'Missing files',
  pausedUP: 'Paused', pausedDL: 'Paused',
};

const SONARR_URL = process.env.NEXT_PUBLIC_SONARR_URL ?? '';

export default function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery<SeriesDetailData>({
    queryKey: ['media-detail', 'series', id],
    queryFn: () => fetch(`/api/media/series/${id}`).then(r => r.json()),
    staleTime: 30_000,
  });

  if (isLoading) return <DetailSkeleton />;
  if (isError || !data?.media) return (
    <div className="text-center py-20">
      <Tv2 className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-zinc-600" />
      <p className="text-gray-500 dark:text-zinc-400">Série introuvable</p>
      <Link href="/" className="mt-4 inline-block text-sm text-gray-400 dark:text-zinc-500 underline">Retour</Link>
    </div>
  );

  const { media, episodeFiles } = data;
  const bySeason = episodeFiles.reduce<Record<number, SonarrEpisodeFile[]>>((acc, f) => {
    (acc[f.seasonNumber] ??= []).push(f);
    return acc;
  }, {});
  const seasons = Object.keys(bySeason).map(Number).sort((a, b) => a - b);

  // Identify duplicate torrents client-side: matched, not cross-seed, size differs > 2% from arr file
  const duplicateTorrents = media.hasDuplicates
    ? media.torrents.filter(t => {
        if (isCrossSeed(t.tags ?? '', t.category ?? '')) return false;
        if (media.size <= 0) return false;
        return Math.abs(t.size - media.size) / media.size > 0.02;
      })
    : [];

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      {media.hasDuplicates && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-700 dark:text-amber-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Version différente détectée</p>
              <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-0.5">
                {media.duplicateCount} torrent(s) dans /data ne correspondent pas à la version Sonarr (taille différente, hors cross-seeds).
              </p>
            </div>
          </div>
          {duplicateTorrents.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {duplicateTorrents.map(t => (
                <div key={t.hash} className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-white/60 dark:bg-zinc-900/40 px-3 py-2">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200 break-all">{t.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-amber-600 dark:text-amber-400/70">
                    <span>{formatBytes(t.size)}</span>
                    {media.size > 0 && (
                      <span>Δ {((Math.abs(t.size - media.size) / media.size) * 100).toFixed(1)}% vs Sonarr</span>
                    )}
                  </div>
                  {t.content_path && (
                    <p className="mt-1 break-all font-mono text-[10px] text-amber-500 dark:text-amber-500/70">
                      {t.content_path}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hero */}
      <div className="flex gap-5">
        <div className="shrink-0 w-24 sm:w-32">
          {media.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.posterUrl} alt={media.title} className="w-full rounded-xl border border-default object-cover shadow-sm" />
          ) : (
            <div className="flex aspect-[2/3] w-full items-center justify-center rounded-xl border border-default bg-surface">
              <Tv2 className="h-8 w-8 text-gray-300 dark:text-zinc-600" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2.5 pt-1 min-w-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{media.title}</h1>
            <p className="text-sm text-gray-400 dark:text-zinc-400">{media.year}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <TypeBadge type="series" />
            <SeedBadge status={media.seedingStatus} />
            {media.hardlinkStatus !== 'unknown' && <HardlinkBadge status={media.hardlinkStatus} />}
            <CrossSeedBadge count={media.crossSeedCount} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-zinc-400">
            {media.size > 0 && <span><span className="text-gray-400 dark:text-zinc-500">Taille :</span> {formatBytes(media.size)}</span>}
            {episodeFiles.length > 0 && <span><span className="text-gray-400 dark:text-zinc-500">Épisodes :</span> {episodeFiles.length}</span>}
            {(media.episodeSeedingCount ?? 0) > 0 && (
              <span><span className="text-gray-400 dark:text-zinc-500">Torrents seeding :</span> {media.episodeSeedingCount}</span>
            )}
            {media.torrents.length > 0 && (
              <span>
                <span className="text-gray-400 dark:text-zinc-500">Ratio :</span>{' '}
                {media.globalRatio != null ? media.globalRatio.toFixed(2) : '∞'}
              </span>
            )}
            {media.totalUploaded > 0 && (
              <span><span className="text-gray-400 dark:text-zinc-500">↑ Total :</span> {formatBytes(media.totalUploaded)}</span>
            )}
          </div>
          {SONARR_URL && data.sonarrSeries && (
            <a
              href={`${SONARR_URL}/series/${data.sonarrSeries.titleSlug}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-default bg-surface px-3 py-1.5 text-sm text-gray-600 dark:text-zinc-300 hover:bg-elevated transition-colors w-fit"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ouvrir dans Sonarr
            </a>
          )}
        </div>
      </div>

      {/* Torrents */}
      <Section icon={<Upload className="h-4 w-4" />} title={`Torrents actifs (${media.torrents.length})`}>
        {media.torrents.length === 0 ? (
          <Empty text="Aucun torrent trouvé dans qBittorrent pour cette série" />
        ) : (
          <div className="space-y-2.5">
            {media.torrents.map(t => (
              <div key={t.hash} className="rounded-xl border border-default bg-surface p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white break-all">{t.name}</p>
                  <span className={cn('shrink-0 text-xs font-medium', STATE_STYLES[t.state] ?? 'text-gray-400 dark:text-zinc-500')}>
                    {STATE_LABELS[t.state] ?? t.state}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <Kv label="Taille"    value={formatBytes(t.size)} />
                  <Kv label="Ratio"     value={t.ratio.toFixed(2)} mono />
                  <Kv label="↑ Vitesse" value={formatSpeed(t.upspeed)} />
                  <Kv label="ETA"       value={formatEta(t.eta)} />
                </div>
                {t.content_path && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-zinc-500 mb-1">Chemin /data</p>
                    <p className="break-all rounded-lg bg-gray-100 dark:bg-zinc-800 px-2 py-1.5 font-mono text-xs text-gray-700 dark:text-zinc-300">{t.content_path}</p>
                  </div>
                )}
                {t.tracker && <p className="text-xs text-gray-400 dark:text-zinc-600 truncate">Tracker : {t.tracker}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Episode files */}
      <Section icon={<HardDrive className="h-4 w-4" />} title={`Fichiers dans /media (${episodeFiles.length} épisodes)`}>
        {episodeFiles.length === 0 ? (
          <Empty text="Aucun fichier d'épisode dans la médiathèque Sonarr" />
        ) : (
          <div className="space-y-4">
            {seasons.map(season => (
              <div key={season}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-500">
                  Saison {season}
                </p>
                <div className="space-y-1">
                  {bySeason[season]
                    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
                    .map(f => (
                      <div key={f.id} className="flex items-center gap-2.5 rounded-lg border border-default bg-surface px-3 py-2">
                        {f.size > 0 && (
                          <span className="shrink-0 rounded bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:text-zinc-400">
                            {formatBytes(f.size)}
                          </span>
                        )}
                        <p className="break-all font-mono text-xs text-gray-700 dark:text-zinc-300 flex-1">{f.path}</p>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Cross Seed */}
      {media.crossSeedCount > 0 && (
        <Section icon={<Shuffle className="h-4 w-4" />} title={`Cross Seed (${media.crossSeedCount})`}>
          <div className="space-y-2">
            {media.torrents.filter(t => {
              const tags = (t.tags ?? '').toLowerCase();
              const cat  = (t.category ?? '').toLowerCase();
              return isCrossSeed(tags, cat);
            }).map(t => (
              <div key={t.hash} className="rounded-lg border border-cyan-200 dark:border-cyan-900/60 bg-cyan-50 dark:bg-cyan-950/20 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-cyan-700 dark:text-cyan-300 break-all">{t.name}</p>
                  <span className={cn('shrink-0 font-medium', STATE_STYLES[t.state] ?? 'text-gray-400 dark:text-zinc-500')}>
                    {STATE_LABELS[t.state] ?? t.state}
                  </span>
                </div>
                <p className="mt-1 font-mono text-gray-400 dark:text-zinc-500 text-[10px]">{t.hash}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        <span className="text-gray-400 dark:text-zinc-500">{icon}</span> {title}
      </h2>
      {children}
    </section>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 dark:text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={cn('text-gray-700 dark:text-zinc-300', mono && 'font-mono tabular-nums')}>{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-default bg-surface px-4 py-6 text-center text-sm text-gray-400 dark:text-zinc-500">{text}</p>;
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6 max-w-4xl">
      <div className="h-4 w-24 rounded bg-gray-200 dark:bg-zinc-800" />
      <div className="flex gap-5">
        <div className="h-44 w-24 rounded-xl bg-gray-200 dark:bg-zinc-800" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="h-6 w-48 rounded bg-gray-200 dark:bg-zinc-800" />
          <div className="h-4 w-16 rounded bg-gray-200 dark:bg-zinc-800" />
          <div className="flex gap-1">
            <div className="h-5 w-14 rounded-full bg-gray-200 dark:bg-zinc-800" />
            <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-zinc-800" />
          </div>
        </div>
      </div>
      <div className="h-32 rounded-xl bg-gray-200 dark:bg-zinc-800" />
    </div>
  );
}
