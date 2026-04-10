import { NextRequest, NextResponse } from 'next/server';
import { statSync, readdirSync } from 'fs';
import { join } from 'path';
import { getRadarrMovies } from '@/lib/radarr';
import { getSonarrSeries } from '@/lib/sonarr';
import { getQbitTorrents } from '@/lib/qbit';
import { loadConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

interface PathDiag {
  raw: string;
  mapped: string;
  accessible: boolean;
  inode: number | null;
  isFile: boolean | null;
  error?: string;
}

function makeMapFn(mappings: { from: string; to: string }[]): (p: string) => string {
  const ENV_FROM = process.env.PATH_MAP_FROM ?? '';
  const ENV_TO   = process.env.PATH_MAP_TO   ?? '';
  return (p: string) => {
    for (const { from, to } of mappings) {
      if (from && to && p.startsWith(from)) return to + p.slice(from.length);
    }
    if (ENV_FROM && ENV_TO && p.startsWith(ENV_FROM)) return ENV_TO + p.slice(ENV_FROM.length);
    return p;
  };
}

function diagPath(raw: string, mapFn: (p: string) => string): PathDiag {
  const mapped = mapFn(raw).replace(/\\/g, '/');
  try {
    const s = statSync(mapped);
    return { raw, mapped, accessible: true, inode: s.ino, isFile: s.isFile() };
  } catch (e) {
    return { raw, mapped, accessible: false, inode: null, isFile: null, error: String(e) };
  }
}

function collectFileInodes(dir: string, max = 5): Array<{ path: string; inode: number }> {
  const results: Array<{ path: string; inode: number }> = [];
  function walk(d: string, depth: number) {
    if (depth > 2 || results.length >= max) return;
    try {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (results.length >= max) break;
        const full = join(d, e.name).replace(/\\/g, '/');
        if (e.isFile()) {
          try { results.push({ path: full, inode: statSync(full).ino }); } catch { /* skip */ }
        } else if (e.isDirectory()) walk(full, depth + 1);
      }
    } catch { /* skip */ }
  }
  walk(dir, 0);
  return results;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = parseInt(url.searchParams.get('id') ?? '', 10);
  const type = url.searchParams.get('type') as 'movie' | 'series' | null;

  if (!id || !type) {
    return NextResponse.json({ error: 'id and type are required' }, { status: 400 });
  }

  const [moviesR, seriesR, torrentsR] = await Promise.allSettled([
    getRadarrMovies(),
    getSonarrSeries(),
    getQbitTorrents(),
  ]);

  const movies   = moviesR.status   === 'fulfilled' ? moviesR.value   : [];
  const series   = seriesR.status   === 'fulfilled' ? seriesR.value   : [];
  const torrents = torrentsR.status === 'fulfilled' ? torrentsR.value : [];

  const { pathMappings } = loadConfig();
  const mapFn = makeMapFn(pathMappings);

  if (type === 'movie') {
    const movie = movies.find(m => m.id === id);
    if (!movie) return NextResponse.json({ error: 'Movie not found' }, { status: 404 });

    const rawPath = movie.movieFile?.path?.replace(/\\/g, '/') ?? null;
    const arrDiag = rawPath ? diagPath(rawPath, mapFn) : null;

    // Find candidate torrents by name similarity
    const norm = (s: string) => s.toLowerCase().replace(/[._\-\[\](){}+\s]+/g, ' ').trim();
    const matchedTorrents = torrents.filter(t => {
      const tp = norm(t.name);
      const tm = norm(movie.title);
      return tp.includes(tm) || tm.includes(tp);
    });

    const torrentDiags = matchedTorrents.map(t => {
      const qp = (t.content_path ?? t.save_path ?? '').replace(/\\/g, '/');
      const d = diagPath(qp, p => p); // qBit paths don't need mapping
      let sampleInodes: Array<{ path: string; inode: number }> = [];
      if (d.accessible && !d.isFile) sampleInodes = collectFileInodes(qp, 5);
      return { name: t.name, hash: t.hash, ...d, sampleInodes };
    });

    // Check inode matches
    const matches: Array<{ arrPath: string; torrentPath: string; inode: number }> = [];
    if (arrDiag?.accessible && arrDiag.inode) {
      if (arrDiag.isFile) {
        for (const td of torrentDiags) {
          if (td.isFile && td.inode === arrDiag.inode) {
            matches.push({ arrPath: arrDiag.mapped, torrentPath: td.mapped, inode: arrDiag.inode });
          }
          for (const si of td.sampleInodes) {
            if (si.inode === arrDiag.inode) {
              matches.push({ arrPath: arrDiag.mapped, torrentPath: si.path, inode: arrDiag.inode });
            }
          }
        }
      }
    }

    return NextResponse.json({
      title: movie.title,
      type: 'movie',
      mappingsUsed: pathMappings,
      arrPath: arrDiag,
      torrents: torrentDiags,
      inodeMatches: matches,
    });
  }

  if (type === 'series') {
    const show = series.find(s => s.id === id);
    if (!show) return NextResponse.json({ error: 'Series not found' }, { status: 404 });

    const rawPath = show.path?.replace(/\\/g, '/') ?? null;
    const arrDiag = rawPath ? diagPath(rawPath, mapFn) : null;

    let arrSampleInodes: Array<{ path: string; inode: number }> = [];
    if (arrDiag?.accessible && !arrDiag.isFile && arrDiag.mapped) {
      arrSampleInodes = collectFileInodes(arrDiag.mapped, 5);
    }

    const norm = (s: string) => s.toLowerCase().replace(/[._\-\[\](){}+\s]+/g, ' ').trim();
    const matchedTorrents = torrents.filter(t => {
      const tp = norm(t.name);
      const tm = norm(show.title);
      return tp.includes(tm) || tm.includes(tp);
    });

    const torrentDiags = matchedTorrents.map(t => {
      const qp = (t.content_path ?? t.save_path ?? '').replace(/\\/g, '/');
      const d = diagPath(qp, p => p);
      let sampleInodes: Array<{ path: string; inode: number }> = [];
      if (d.accessible && !d.isFile) sampleInodes = collectFileInodes(qp, 5);
      return { name: t.name, hash: t.hash, ...d, sampleInodes };
    });

    const arrInodeSet = new Set(arrSampleInodes.map(s => s.inode));
    const matches: Array<{ arrPath: string; torrentPath: string; inode: number }> = [];
    for (const td of torrentDiags) {
      if (td.isFile && arrInodeSet.has(td.inode!)) {
        matches.push({ arrPath: arrDiag!.mapped, torrentPath: td.mapped, inode: td.inode! });
      }
      for (const si of td.sampleInodes) {
        if (arrInodeSet.has(si.inode)) {
          matches.push({ arrPath: arrDiag!.mapped, torrentPath: si.path, inode: si.inode });
        }
      }
    }

    return NextResponse.json({
      title: show.title,
      type: 'series',
      mappingsUsed: pathMappings,
      arrPath: arrDiag,
      arrSampleInodes,
      torrents: torrentDiags,
      inodeMatches: matches,
    });
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
}
