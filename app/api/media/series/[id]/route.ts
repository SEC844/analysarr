import { NextResponse } from 'next/server';
import { getRadarrMovies, getRadarrHistoryHashes } from '@/lib/radarr';
import { getSonarrSeries, getSonarrHistoryHashes, getSonarrEpisodeFiles } from '@/lib/sonarr';
import { getQbitTorrents } from '@/lib/qbit';
import { enrichMedia } from '@/lib/enrich';
import { loadConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [moviesR, seriesR, torrentsR, episodeFilesR, radarrHistR, sonarrHistR] = await Promise.allSettled([
    getRadarrMovies(),
    getSonarrSeries(),
    getQbitTorrents(),
    getSonarrEpisodeFiles(id),
    getRadarrHistoryHashes(),
    getSonarrHistoryHashes(),
  ]);

  const movies       = moviesR.status       === 'fulfilled' ? moviesR.value       : [];
  const series       = seriesR.status       === 'fulfilled' ? seriesR.value       : [];
  const torrents     = torrentsR.status     === 'fulfilled' ? torrentsR.value     : [];
  const episodeFiles = episodeFilesR.status === 'fulfilled' ? episodeFilesR.value : [];

  const { manualLinks = [] } = loadConfig();
  const manualMap = new Map(
    manualLinks.map(l => [l.torrentHash.toLowerCase(), { type: l.mediaType as 'movie' | 'series', id: l.mediaId }])
  );

  const history = {
    movies: radarrHistR.status === 'fulfilled' ? radarrHistR.value : new Map<string, number>(),
    series: sonarrHistR.status === 'fulfilled' ? sonarrHistR.value : new Map<string, number>(),
    manual: manualMap,
  };

  const { media } = enrichMedia(movies, series, torrents, history);
  const item = media.find(m => m.id === id && m.type === 'series');
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sonarrSeries = series.find(s => s.id === id);
  return NextResponse.json({ media: item, sonarrSeries, episodeFiles });
}
