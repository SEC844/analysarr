import { NextResponse } from 'next/server';
import { getRadarrMovies } from '@/lib/radarr';
import { getSonarrSeries } from '@/lib/sonarr';
import { getQbitTorrents } from '@/lib/qbit';
import { enrichMedia } from '@/lib/enrich';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [moviesR, seriesR, torrentsR] = await Promise.allSettled([
    getRadarrMovies(),
    getSonarrSeries(),
    getQbitTorrents(),
  ]);

  const movies   = moviesR.status   === 'fulfilled' ? moviesR.value   : [];
  const series   = seriesR.status   === 'fulfilled' ? seriesR.value   : [];
  const torrents = torrentsR.status === 'fulfilled' ? torrentsR.value : [];

  const { media } = enrichMedia(movies, series, torrents);
  const item = media.find(m => m.id === id && m.type === 'movie');
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Raw Radarr movie for extra fields (titleSlug, etc.)
  const radarrMovie = movies.find(m => m.id === id);

  return NextResponse.json({ media: item, radarrMovie });
}
