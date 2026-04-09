import { NextResponse } from 'next/server';
import { getRadarrMovies } from '@/lib/radarr';
import { getSonarrSeries } from '@/lib/sonarr';
import { getQbitTorrents } from '@/lib/qbit';
import { getCrossSeedTorrents } from '@/lib/crossseed';
import { enrichMedia } from '@/lib/enrich';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [movies, series, torrents, crossSeeds] = await Promise.allSettled([
      getRadarrMovies(),
      getSonarrSeries(),
      getQbitTorrents(),
      getCrossSeedTorrents(),
    ]);

    const resolvedMovies = movies.status === 'fulfilled' ? movies.value : [];
    const resolvedSeries = series.status === 'fulfilled' ? series.value : [];
    const resolvedTorrents = torrents.status === 'fulfilled' ? torrents.value : [];
    const resolvedCrossSeeds = crossSeeds.status === 'fulfilled' ? crossSeeds.value : [];

    const { media, issues, stats } = enrichMedia(
      resolvedMovies,
      resolvedSeries,
      resolvedTorrents,
      resolvedCrossSeeds
    );

    return NextResponse.json({
      media,
      issues,
      stats,
      errors: {
        radarr: movies.status === 'rejected' ? movies.reason?.message : null,
        sonarr: series.status === 'rejected' ? series.reason?.message : null,
        qbit: torrents.status === 'rejected' ? torrents.reason?.message : null,
        crossseed: crossSeeds.status === 'rejected' ? crossSeeds.reason?.message : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Dashboard fetch failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
