import { NextResponse } from 'next/server';
import { statSync } from 'fs';
import { getRadarrMovies } from '@/lib/radarr';
import { getSonarrSeries } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

const ROOTS = ['/data', '/media'];

function accessible(p: string): boolean {
  try { statSync(p); return true; } catch { return false; }
}

/**
 * Try to find where an arr-reported path actually lives in the container.
 * Returns { from, to } mapping if the path is inaccessible as-is but can be
 * found by replacing a leading prefix with /data or /media.
 */
function detectMapping(arrPath: string): { from: string; to: string } | null {
  if (!arrPath) return null;

  // Already accessible — no mapping needed
  if (accessible(arrPath)) return null;

  const parts = arrPath.replace(/\\/g, '/').split('/').filter(Boolean);

  // Try replacing the first 1..4 path segments with /data or /media
  for (let len = 1; len <= Math.min(parts.length - 1, 4); len++) {
    const from = '/' + parts.slice(0, len).join('/');
    const tail = parts.slice(len).join('/');

    for (const root of ROOTS) {
      const candidate = tail ? `${root}/${tail}` : root;
      if (accessible(candidate)) {
        return { from, to: root };
      }
    }
  }

  return null;
}

export async function GET() {
  const [moviesR, seriesR] = await Promise.allSettled([
    getRadarrMovies(),
    getSonarrSeries(),
  ]);

  const movies = moviesR.status === 'fulfilled' ? moviesR.value.filter(m => m.hasFile) : [];
  const series = seriesR.status === 'fulfilled' ? seriesR.value : [];

  // Count how often each mapping appears across sample paths
  const tally = new Map<string, { from: string; to: string; count: number }>();

  const addPath = (path: string | undefined) => {
    if (!path) return;
    const m = detectMapping(path);
    if (!m) return;
    const key = `${m.from}→${m.to}`;
    const prev = tally.get(key);
    tally.set(key, { ...m, count: (prev?.count ?? 0) + 1 });
  };

  // Sample up to 20 of each
  for (const mv of movies.slice(0, 20)) addPath(mv.movieFile?.path);
  for (const sv of series.slice(0, 20)) addPath(sv.path);

  // Also check for paths that are ALREADY accessible (no mapping needed)
  let alreadyOk = 0;
  for (const mv of movies.slice(0, 10)) {
    if (mv.movieFile?.path && accessible(mv.movieFile.path)) alreadyOk++;
  }

  const suggestions = Array.from(tally.values()).sort((a, b) => b.count - a.count);

  return NextResponse.json({
    suggestions,
    alreadyAccessible: alreadyOk,
    sampledMovies: movies.slice(0, 20).map(m => m.movieFile?.path ?? null).filter(Boolean),
    sampledSeries: series.slice(0, 20).map(s => s.path ?? null).filter(Boolean),
  });
}
