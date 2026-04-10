'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Tv2, ExternalLink, HardDrive, Shuffle, Upload, AlertTriangle } from 'lucide-react';
import { SeedBadge, HardlinkBadge, TypeBadge, CrossSeedBadge } from '@/components/StatusBadge';
import { formatBytes, formatSpeed, formatEta, cn } from '@/lib/utils';
import type { EnrichedMedia, SonarrSeries } from '@/lib/types';
import type { SonarrEpisodeFile } from '@/lib/sonarr';

interface SeriesDetailData {
  media: EnrichedMedia;
  sonarrSeries?: SonarrSeries;
  episodeFiles: SonarrEpisodeFile[];
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
    <div className="text-center py-20 text-zinc-400">
      <Tv2 className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
      <p>Série introuvable</p>
      <Link href="/" className="mt-4 inline-block text-sm text-zinc-500 underline">Retour au dashboard</Link>
    </div>
  );

  const { media, episodeFiles } = data;

  // Group episode files by season
  const bySeason = episodeFiles.reduce<Record<number, SonarrEpisodeFile[]>>((acc, f) => {
    (acc[f.seasonNumber] ??= []).push(f);
    return acc;
  }, {});
  const seasons = Object.keys(bySeason).map(Number).sort((a, b) => a - b);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back */}
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
              <Tv2 className="h-10 w-10 text-zinc-600" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 pt-1">
          <div>
            <h1 className="text-2xl font-bold text-white">{media.title}</h1>
            <p className="text-zinc-400">{media.year}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <TypeBadge type="series" />
            <SeedBadge status={media.seedingStatus} />
            {media.hardlinkStatus !== 'unknown' && <HardlinkBadge status={media.hardlinkStatus} />}
            <CrossSeedBadge count={media.crossSeedCount} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400">
            {media.size > 0 && <span><span className="text-zinc-500">Taille totale :</span> {formatBytes(media.size)}</span>}
            {episodeFiles.length > 0 && <span><span className="text-zinc-500">Épisodes :</span> {episodeFiles.length}</span>}
            {(media.episodeSeedingCount ?? 0) > 0 && (
              <span><span className="text-zinc-500">Torrents seeding :</span> {media.episodeSeedingCount}</span>
            )}
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
          {SONARR_URL && data.sonarrSeries && (
            <a
              href={`${SONARR_URL}/series/${data.sonarrSeries.titleSlug}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors w-fit"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ouvrir dans Sonarr
            </a>
          )}
        </div>
      </div>

      {/* Torrents actifs */}
      <Section icon={<Upload className="h-4 w-4" />} title={`Torrents actifs (${media.torrents.length})`}>
        {media.torrents.length === 0 ? (
          <Empty text="Aucun torrent trouvé dans qBittorrent pour cette série" />
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

      {/* Épisodes dans /media */}
      <Section icon={<HardDrive className="h-4 w-4" />} title={`Fichiers dans /media (${episodeFiles.length} épisodes)`}>
        {episodeFiles.length === 0 ? (
          <Empty text="Aucun fichier d'épisode dans la médiathèque Sonarr" />
        ) : (
          <div className="space-y-4">
            {seasons.map(season => (
              <div key={season}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Saison {season}
                </p>
                <div className="space-y-1">
                  {bySeason[season]
                    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
                    .map(f => (
                      <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                        <p className="break-all font-mono text-xs text-zinc-300">{f.path}</p>
                        <p className="shrink-0 text-xs text-zinc-500">{formatBytes(f.size)}</p>
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
        <Section icon={<Shuffle className="h-4 w-4" />} title={`Cross Seed (${media.crossSeedCount} torrent${media.crossSeedCount > 1 ? 's' : ''})`}>
          <div className="space-y-2">
            {media.torrents.filter(t => {
              const tags = (t.tags ?? '').toLowerCase();
              const cat  = (t.category ?? '').toLowerCase();
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

      {/* Issues */}
      {media.hasDuplicates && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {media.torrents.length} torrents correspondent à cette série — possible doublon.
        </div>
      )}
    </div>
  );
}

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
