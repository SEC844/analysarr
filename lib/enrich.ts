import { statSync, readdirSync } from 'fs';
import { join as joinPath } from 'path';
import { loadConfig } from './config';
import type { PathMapping } from './config';
import type {
  RadarrMovie,
  SonarrSeries,
  QbitTorrent,
  EnrichedMedia,
  IssueItem,
  DashboardStats,
  SeedingStatus,
  HardlinkStatus,
} from './types';

export const SEEDING_STATES = new Set([
  'uploading', 'stalledUP', 'checkingUP', 'queuedUP', 'forcedUP',
]);

// Cross Seed injects torrents into qBittorrent tagged with "cross-seed".
// We detect them via qBit tags/category instead of the Cross Seed API.
const CROSSSEED_TAG_RE = /cross-seed/i;

// Tolerance for size comparison: two torrents/files within 2% = same version
const SIZE_TOLERANCE = 0.02;

// ── Path helpers ──────────────────────────────────────────────────────────────

function makeMapFn(mappings: PathMapping[]): (p: string) => string {
  const ENV_FROM = process.env.PATH_MAP_FROM ?? '';
  const ENV_TO   = process.env.PATH_MAP_TO   ?? '';

  return (p: string): string => {
    for (const { from, to } of mappings) {
      if (from && to && p.startsWith(from)) return to + p.slice(from.length);
    }
    if (ENV_FROM && ENV_TO && p.startsWith(ENV_FROM)) return ENV_TO + p.slice(ENV_FROM.length);
    return p;
  };
}

function norm(p: string | undefined): string {
  return (p ?? '').replace(/\\/g, '/');
}

function pathsOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.startsWith(b) || b.startsWith(a);
}

// ── Inode helpers (server-side only) ─────────────────────────────────────────

function safeIno(p: string): number | null {
  if (!p) return null;
  try {
    const s = statSync(p);
    return s.ino > 0 ? s.ino : null;
  } catch {
    return null;
  }
}

function collectInodes(dir: string, maxFiles = 20): Set<number> {
  const result = new Set<number>();
  function walk(d: string, depth: number) {
    if (depth > 2 || result.size >= maxFiles) return;
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (result.size >= maxFiles) break;
        const full = joinPath(d, entry.name);
        if (entry.isFile()) {
          const ino = safeIno(full);
          if (ino !== null) result.add(ino);
        } else if (entry.isDirectory()) {
          walk(full, depth + 1);
        }
      }
    } catch { /* directory not accessible */ }
  }
  walk(dir, 0);
  return result;
}

function checkInodes(
  rawArrPaths: string[],
  torrents: QbitTorrent[],
  mapFn: (p: string) => string,
): boolean | null {
  let anyAccessible = false;

  for (const arrPath of rawArrPaths) {
    if (!arrPath) continue;
    const arrResolved = norm(mapFn(arrPath));
    let arrStat = null;
    try { arrStat = statSync(arrResolved); anyAccessible = true; } catch { continue; }

    if (arrStat.isFile()) {
      const arrIno = arrStat.ino;
      for (const t of torrents) {
        const qp = norm(t.content_path ?? t.save_path ?? '');
        if (!qp) continue;
        let qStat = null;
        try { qStat = statSync(qp); anyAccessible = true; } catch { continue; }
        if (qStat.isFile() && qStat.ino === arrIno) return true;
        if (qStat.isDirectory() && collectInodes(qp, 50).has(arrIno)) return true;
      }
    } else if (arrStat.isDirectory()) {
      const arrInodes = collectInodes(arrResolved, 20);
      if (arrInodes.size === 0) continue;
      for (const t of torrents) {
        const qp = norm(t.content_path ?? t.save_path ?? '');
        if (!qp) continue;
        let qStat = null;
        try { qStat = statSync(qp); anyAccessible = true; } catch { continue; }
        if (qStat.isFile() && arrInodes.has(qStat.ino)) return true;
        if (qStat.isDirectory()) {
          const qInodes = collectInodes(qp, 20);
          if (Array.from(qInodes).some(ino => arrInodes.has(ino))) return true;
        }
      }
    }
  }

  return anyAccessible ? false : null;
}

// ── Name-based fuzzy matching (year-aware) ───────────────────────────────────

const QUALITY_RE = new RegExp(
  [
    'multi', 'vff', 'vf', 'vo', 'vostfr', 'truefrench', 'french', 'english', 'dubbed', 'subbed',
    'bluray', 'blu-ray', 'webrip', 'web-dl', 'web', 'hdtv', 'hdrip', 'bdrip', 'dvdrip',
    '4klight', '4k', 'uhd', 'remux',
    'hdr10plus', 'hdr10', 'hdr', 'sdr', 'dolby\\.vision', 'dolby', 'vision', 'atmos', 'dv',
    '2160p', '1080p', '720p', '480p', '576p',
    'x264', 'x265', 'h\\.264', 'h\\.265', 'h264', 'h265', 'avc', 'hevc', 'av1',
    '10bit', '8bit', 'hi10p',
    'truehd', 'eac3', 'ddp', 'dd5', 'dts', 'flac', 'opus', 'aac', 'ac3',
    '5\\.1', '7\\.1', '2\\.0',
    'proper', 'repack', 'extended', 'theatrical', 'unrated', 'directors', 'edition', 'cut',
    'saison', 'partie',
  ].map(t => `\\b${t}\\b`).join('|'),
  'gi'
);

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, '')      // strip years ONLY for title comparison
    .replace(/\bs\d{1,2}(e\d{1,3}(-e?\d{1,3})?)?\b/gi, '')
    .replace(/\bseason\s*\d+\b/gi, '')
    .replace(/\bepisode\s*\d+\b/gi, '')
    .replace(/\b(saison|partie)\s*\d+\b/gi, '')
    .replace(QUALITY_RE, '')
    .replace(/-[a-z0-9]{2,10}$/i, '')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[._\-\[\](){}+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns a match score (0 = no match) between a torrent and a media entry.
 *
 * Key fix: year must appear in the torrent name to avoid matching
 * "Avengers (2012)" against "Avengers: Endgame (2019)" etc.
 */
function matchScore(torrentName: string, mediaTitle: string, year: number): number {
  // Year gate: torrent name must contain the release year (exact)
  if (year > 0 && !torrentName.includes(String(year))) return 0;

  const nt = normalizeName(torrentName);
  const nm = normalizeName(mediaTitle);
  if (!nt || !nm || nm.length < 2) return 0;
  if (nt === nm) return 100;
  if (nm.length >= 3 && nt.includes(nm)) return 85;
  if (nt.length >= 3 && nm.includes(nt)) return 70;
  return 0;
}

// ── Seeding / hardlink status helpers ────────────────────────────────────────

function seedingStatus(torrents: QbitTorrent[]): SeedingStatus {
  if (torrents.length === 0) return 'not_seeding';
  return torrents.some(t => SEEDING_STATES.has(t.state)) ? 'seeding' : 'not_seeding';
}

function hardlinkStatus(
  rawArrPaths: string[],
  mappedArrPaths: string[],
  /** Only the canonical torrents (same version as arr file) are checked */
  canonicalTorrents: QbitTorrent[],
  mapFn: (p: string) => string,
): HardlinkStatus {
  if ((rawArrPaths.length === 0 && mappedArrPaths.length === 0) || canonicalTorrents.length === 0) {
    return 'unknown';
  }

  const inodeResult = checkInodes(rawArrPaths, canonicalTorrents, mapFn);
  if (inodeResult === true)  return 'hardlinked';
  if (inodeResult === false) return 'not_hardlinked';

  // Fallback: path-overlap when filesystem not accessible
  const torrentPaths = canonicalTorrents.map(t => norm(mapFn(t.content_path ?? t.save_path ?? '')));
  const matched = mappedArrPaths.some(fp => torrentPaths.some(tp => pathsOverlap(fp, tp)));
  return matched ? 'hardlinked' : 'not_hardlinked';
}

// ── Ratio helpers ─────────────────────────────────────────────────────────────

function computeRatio(torrents: QbitTorrent[]): { totalUploaded: number; totalDownloaded: number; globalRatio: number | null } {
  const totalUploaded   = torrents.reduce((a, t) => a + (t.uploaded   ?? 0), 0);
  const totalDownloaded = torrents.reduce((a, t) => a + (t.downloaded ?? 0), 0);
  return {
    totalUploaded,
    totalDownloaded,
    globalRatio: totalDownloaded > 0 ? totalUploaded / totalDownloaded : null,
  };
}

// ── Duplicate detection ───────────────────────────────────────────────────────

/**
 * Classify matched torrents into canonical (same version as arr file) and
 * duplicate (different version — not a cross-seed).
 *
 * A torrent is "canonical" if:
 *   - It is a cross-seed (any version), OR
 *   - Its size is within SIZE_TOLERANCE of the arr file size, OR
 *   - arrSize is unknown (0) — treat first non-cs torrent as canonical
 *
 * A torrent is a "duplicate" if it is NOT a cross-seed AND its size differs
 * from the arr file size by more than SIZE_TOLERANCE.
 */
function classifyTorrents(
  matched: QbitTorrent[],
  arrSize: number,
  crossSeedHashes: Set<string>,
): { canonical: QbitTorrent[]; duplicates: QbitTorrent[] } {
  const canonical: QbitTorrent[] = [];
  const duplicates: QbitTorrent[] = [];

  for (const t of matched) {
    const isCS = crossSeedHashes.has(t.hash.toLowerCase());
    if (isCS) {
      // Cross-seeds always go into canonical regardless of version
      canonical.push(t);
      continue;
    }
    if (arrSize <= 0) {
      // No arr file size known — treat all non-cs as canonical
      canonical.push(t);
      continue;
    }
    const sizeDiff = Math.abs(t.size - arrSize) / arrSize;
    if (sizeDiff <= SIZE_TOLERANCE) {
      canonical.push(t);
    } else {
      duplicates.push(t);
    }
  }

  return { canonical, duplicates };
}

// ── Main enrichment ───────────────────────────────────────────────────────────

export function enrichMedia(
  movies: RadarrMovie[],
  series: SonarrSeries[],
  torrents: QbitTorrent[],
): { media: EnrichedMedia[]; issues: IssueItem[]; stats: DashboardStats } {
  const { pathMappings } = loadConfig();
  const mapFn = makeMapFn(pathMappings);

  const issues: IssueItem[] = [];
  const enriched: EnrichedMedia[] = [];
  const matchedHashes = new Set<string>();

  const crossSeedHashes = new Set(
    torrents
      .filter(t => CROSSSEED_TAG_RE.test(t.tags ?? '') || CROSSSEED_TAG_RE.test(t.category ?? ''))
      .map(t => t.hash.toLowerCase()),
  );

  const downloadedMovies = movies.filter(m => m.hasFile);
  const downloadedSeries = series.filter(s => (s.statistics?.episodeFileCount ?? 0) > 0);

  // ── Movies ─────────────────────────────────────────────────────────────────
  for (const movie of downloadedMovies) {
    const rawFilePath    = movie.movieFile?.path ? norm(movie.movieFile.path) : null;
    const rawFilePaths   = rawFilePath ? [rawFilePath] : [];
    const mappedFilePath = rawFilePath ? norm(mapFn(rawFilePath)) : null;
    const filePaths      = mappedFilePath ? [mappedFilePath] : [];
    const arrSize        = movie.movieFile?.size ?? 0;

    const matchedTorrents = torrents.filter(t => {
      const tp = norm(mapFn(t.content_path ?? t.save_path ?? ''));
      if (filePaths.some(fp => pathsOverlap(fp, tp))) return true;
      // Year-aware name matching: won't confuse Avengers (2012) with Avengers: Endgame (2019)
      return matchScore(t.name, movie.title, movie.year) > 0;
    });

    matchedTorrents.forEach(t => matchedHashes.add(t.hash));

    const { canonical, duplicates } = classifyTorrents(matchedTorrents, arrSize, crossSeedHashes);
    const { totalUploaded, totalDownloaded, globalRatio } = computeRatio(matchedTorrents);

    const seeding  = seedingStatus(matchedTorrents);
    // Hardlink only checked against canonical torrents (same version as arr file)
    const hardlink = hardlinkStatus(rawFilePaths, filePaths, canonical, mapFn);
    const csCount  = matchedTorrents.filter(t => crossSeedHashes.has(t.hash.toLowerCase())).length;
    const posterImg = movie.images.find(i => i.coverType === 'poster');

    if (rawFilePath && matchedTorrents.length === 0) {
      issues.push({
        id: `no-torrent-movie-${movie.id}`, type: 'no_torrent',
        title: movie.title,
        description: 'Movie file found but no matching torrent in qBittorrent.',
        mediaType: 'movie',
      });
    }
    if (duplicates.length > 0) {
      issues.push({
        id: `dup-movie-${movie.id}`, type: 'duplicate',
        title: movie.title,
        description: `${duplicates.length} torrent(s) with a different version found in /data (not cross-seeds): ${duplicates.map(t => t.name).join(', ')}`,
        mediaType: 'movie',
      });
    }
    if (hardlink === 'not_hardlinked' && filePaths.length > 0 && canonical.filter(t => !crossSeedHashes.has(t.hash.toLowerCase())).length > 0) {
      issues.push({
        id: `copy-movie-${movie.id}`, type: 'copy_not_hardlink',
        title: movie.title,
        description: 'Torrent matched but no shared inode — may be a copy instead of a hardlink.',
        mediaType: 'movie',
      });
    }

    enriched.push({
      id: movie.id, type: 'movie',
      title: movie.title, year: movie.year,
      posterUrl: posterImg ? `/api/poster/radarr/${movie.id}` : null,
      seedingStatus: seeding, hardlinkStatus: hardlink,
      torrents: matchedTorrents, filePaths,
      hasDuplicates: duplicates.length > 0,
      crossSeedCount: csCount,
      duplicateCount: duplicates.length,
      size: arrSize,
      totalUploaded, totalDownloaded, globalRatio,
    });
  }

  // ── Series ─────────────────────────────────────────────────────────────────
  for (const show of downloadedSeries) {
    const rawShowPath    = norm(show.path ?? '');
    const rawFilePaths   = rawShowPath ? [rawShowPath] : [];
    const mappedShowPath = rawShowPath ? norm(mapFn(rawShowPath)) : '';
    const filePaths      = mappedShowPath ? [mappedShowPath] : [];
    const arrSize        = show.statistics?.sizeOnDisk ?? 0;

    const matchedTorrents = torrents.filter(t => {
      const tp = norm(mapFn(t.content_path ?? t.save_path ?? ''));
      if (mappedShowPath && pathsOverlap(mappedShowPath, tp)) return true;
      // Year-aware name matching for series too
      return matchScore(t.name, show.title, show.year) > 0;
    });

    matchedTorrents.forEach(t => matchedHashes.add(t.hash));

    // For series, sizeOnDisk is the total of all episode files — use for classification
    const { canonical, duplicates } = classifyTorrents(matchedTorrents, arrSize, crossSeedHashes);
    const { totalUploaded, totalDownloaded, globalRatio } = computeRatio(matchedTorrents);

    const seeding   = seedingStatus(matchedTorrents);
    const hardlink  = hardlinkStatus(rawFilePaths, filePaths, canonical, mapFn);
    const csCount   = matchedTorrents.filter(t => crossSeedHashes.has(t.hash.toLowerCase())).length;
    const epSeeding = matchedTorrents.filter(t => SEEDING_STATES.has(t.state)).length;
    const posterImg = show.images.find(i => i.coverType === 'poster');

    if (show.statistics.episodeFileCount > 0 && matchedTorrents.length === 0) {
      issues.push({
        id: `no-torrent-series-${show.id}`, type: 'no_torrent',
        title: show.title,
        description: `Series has ${show.statistics.episodeFileCount} episode files but no matching torrent.`,
        mediaType: 'series',
      });
    }
    if (duplicates.length > 0) {
      issues.push({
        id: `dup-series-${show.id}`, type: 'duplicate',
        title: show.title,
        description: `${duplicates.length} torrent(s) with a different version found (not cross-seeds).`,
        mediaType: 'series',
      });
    }

    enriched.push({
      id: show.id, type: 'series',
      title: show.title, year: show.year,
      posterUrl: posterImg ? `/api/poster/sonarr/${show.id}` : null,
      seedingStatus: seeding, hardlinkStatus: hardlink,
      torrents: matchedTorrents, filePaths,
      episodeSeedingCount: epSeeding,
      hasDuplicates: duplicates.length > 0,
      crossSeedCount: csCount,
      duplicateCount: duplicates.length,
      size: arrSize,
      totalUploaded, totalDownloaded, globalRatio,
    });
  }

  // ── Orphan torrents (not cross-seeds, not matched) ─────────────────────────
  for (const t of torrents) {
    if (!matchedHashes.has(t.hash) && !crossSeedHashes.has(t.hash.toLowerCase())) {
      issues.push({
        id: `orphan-${t.hash}`, type: 'orphan_torrent',
        title: t.name,
        description: 'Torrent not linked to any Radarr/Sonarr entry.',
        torrentHash: t.hash,
      });
    }
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const seedingTorrents  = torrents.filter(t => SEEDING_STATES.has(t.state));
  const totalSeedingSize = seedingTorrents.reduce((a, t) => a + t.size, 0);
  const hardlinkedCount  = enriched.filter(m => m.hardlinkStatus === 'hardlinked').length;
  const missingHardlinks = enriched.filter(m => m.filePaths.length > 0 && m.hardlinkStatus === 'not_hardlinked').length;
  const totalEpisodes    = downloadedSeries.reduce((a, s) => a + (s.statistics?.episodeFileCount ?? 0), 0);
  const totalCrossSeeds  = crossSeedHashes.size;

  return {
    media: enriched,
    issues,
    stats: {
      totalMovies:    downloadedMovies.length,
      totalSeries:    downloadedSeries.length,
      totalEpisodes,
      seedingCount:   seedingTorrents.length,
      hardlinkedCount,
      missingHardlinks,
      totalSeedingSize,
      issueCount:     issues.length,
      crossSeedCount: totalCrossSeeds,
    },
  };
}
