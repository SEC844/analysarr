import { statSync, readdirSync } from 'fs';
import { join as joinPath } from 'path';
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

const PATH_MAP_FROM = process.env.PATH_MAP_FROM ?? '';
const PATH_MAP_TO   = process.env.PATH_MAP_TO   ?? '';

export const SEEDING_STATES = new Set([
  'uploading', 'stalledUP', 'checkingUP', 'queuedUP', 'forcedUP',
]);

// Cross Seed injects torrents into qBittorrent tagged with "cross-seed".
// We detect them via qBit tags/category instead of the Cross Seed API.
const CROSSSEED_TAG_RE = /cross-seed/i;

// ── Path helpers ──────────────────────────────────────────────────────────────

function mapPath(p: string): string {
  if (PATH_MAP_FROM && PATH_MAP_TO && p.startsWith(PATH_MAP_FROM)) {
    return PATH_MAP_TO + p.slice(PATH_MAP_FROM.length);
  }
  return p;
}

function norm(p: string | undefined): string {
  return (p ?? '').replace(/\\/g, '/');
}

function pathsOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.startsWith(b) || b.startsWith(a);
}

// ── Inode helpers (server-side only) ─────────────────────────────────────────

/** Safely stat a path and return its inode, or null if inaccessible. */
function safeIno(p: string): number | null {
  if (!p) return null;
  try {
    const s = statSync(p);
    return s.ino > 0 ? s.ino : null;
  } catch {
    return null;
  }
}

/**
 * Collect inodes of files inside a directory (up to 2 levels deep, max maxFiles).
 * Used to compare multi-file torrents (season packs, movie folders).
 */
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
    } catch { /* directory not mounted / accessible */ }
  }
  walk(dir, 0);
  return result;
}

/**
 * Compare inodes between arr file/directory paths and qBit torrent paths.
 *
 * Uses statSync to distinguish files from directories — safeIno() alone
 * is not enough because it returns non-null for both.
 *
 * Returns:
 *   true  — hardlink confirmed (identical inode found)
 *   false — paths accessible but no matching inode (not hardlinked)
 *   null  — filesystem not mounted; caller should fall back to path comparison
 */
function checkInodes(rawArrPaths: string[], torrents: QbitTorrent[]): boolean | null {
  let anyAccessible = false;

  for (const arrPath of rawArrPaths) {
    if (!arrPath) continue;

    let arrStat = null;
    try { arrStat = statSync(arrPath); anyAccessible = true; } catch { continue; }

    if (arrStat.isFile()) {
      // ── Movie / single-file case: *arr reported a specific file ───────────
      const arrIno = arrStat.ino;
      for (const t of torrents) {
        const qp = norm(t.content_path ?? t.save_path ?? '');
        if (!qp) continue;
        let qStat = null;
        try { qStat = statSync(qp); anyAccessible = true; } catch { continue; }

        // qBit single-file torrent → direct inode comparison
        if (qStat.isFile() && qStat.ino === arrIno) return true;
        // qBit multi-file torrent (folder) → scan folder for matching inode
        if (qStat.isDirectory() && collectInodes(qp, 50).has(arrIno)) return true;
      }

    } else if (arrStat.isDirectory()) {
      // ── Series case: *arr reported the series root directory ──────────────
      // Collect a sample of file inodes from the *arr directory
      const arrInodes = collectInodes(arrPath, 20);
      if (arrInodes.size === 0) continue;

      for (const t of torrents) {
        const qp = norm(t.content_path ?? t.save_path ?? '');
        if (!qp) continue;
        let qStat = null;
        try { qStat = statSync(qp); anyAccessible = true; } catch { continue; }

        // qBit single-file torrent → check if its inode is in the *arr dir
        if (qStat.isFile() && arrInodes.has(qStat.ino)) return true;
        // qBit multi-file torrent (season pack / series folder) → find common inodes
        if (qStat.isDirectory()) {
          const qInodes = collectInodes(qp, 20);
          if (Array.from(qInodes).some(ino => arrInodes.has(ino))) return true;
        }
      }
    }
  }

  return anyAccessible ? false : null;
}

// ── Name-based fuzzy matching ─────────────────────────────────────────────────

const QUALITY_RE = new RegExp(
  [
    // Languages
    'multi', 'vff', 'vf', 'vo', 'vostfr', 'truefrench', 'french', 'english', 'dubbed', 'subbed',
    // Source
    'bluray', 'blu-ray', 'webrip', 'web-dl', 'web', 'hdtv', 'hdrip', 'bdrip', 'dvdrip',
    '4klight', '4k', 'uhd', 'remux',
    // HDR / Color
    'hdr10plus', 'hdr10', 'hdr', 'sdr', 'dolby\\.vision', 'dolby', 'vision', 'atmos', 'dv',
    // Resolution
    '2160p', '1080p', '720p', '480p', '576p',
    // Codec
    'x264', 'x265', 'h\\.264', 'h\\.265', 'h264', 'h265', 'avc', 'hevc', 'av1',
    '10bit', '8bit', 'hi10p',
    // Audio
    'truehd', 'eac3', 'ddp', 'dd5', 'dts', 'flac', 'opus', 'aac', 'ac3',
    '5\\.1', '7\\.1', '2\\.0',
    // Edition
    'proper', 'repack', 'extended', 'theatrical', 'unrated', 'directors', 'edition', 'cut',
    // French season words
    'saison', 'partie',
  ].map(t => `\\b${t}\\b`).join('|'),
  'gi'
);

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, '')
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

function matchScore(torrentName: string, mediaTitle: string): number {
  const nt = normalizeName(torrentName);
  const nm = normalizeName(mediaTitle);
  if (!nt || !nm || nm.length < 2) return 0;
  if (nt === nm) return 100;
  if (nm.length >= 3 && nt.includes(nm)) return 85;
  if (nt.length >= 3 && nm.includes(nt)) return 70;
  return 0;
}

function seedingStatus(torrents: QbitTorrent[]): SeedingStatus {
  if (torrents.length === 0) return 'not_seeding';
  return torrents.some(t => SEEDING_STATES.has(t.state)) ? 'seeding' : 'not_seeding';
}

/**
 * Determine hardlink status for a media entry.
 *
 * 1. Tries inode comparison using rawArrPaths (requires filesystem to be mounted).
 * 2. Falls back to path-overlap comparison using mappedArrPaths.
 */
function hardlinkStatus(
  rawArrPaths: string[],    // unmapped paths as reported by Radarr/Sonarr — for inode check
  mappedArrPaths: string[], // path-mapped paths — for fallback overlap check
  torrents: QbitTorrent[],
): HardlinkStatus {
  if ((rawArrPaths.length === 0 && mappedArrPaths.length === 0) || torrents.length === 0) {
    return 'unknown';
  }

  // 1. Inode-based comparison (preferred — reliable on any path layout)
  const inodeResult = checkInodes(rawArrPaths, torrents);
  if (inodeResult === true)  return 'hardlinked';
  if (inodeResult === false) return 'not_hardlinked';

  // 2. Path-overlap fallback (when filesystem is not mounted inside the container)
  const torrentPaths = torrents.map(t => norm(mapPath(t.content_path ?? t.save_path ?? '')));
  const matched = mappedArrPaths.some(fp => torrentPaths.some(tp => pathsOverlap(fp, tp)));
  return matched ? 'hardlinked' : 'not_hardlinked';
}

// ── Main enrichment ───────────────────────────────────────────────────────────

export function enrichMedia(
  movies: RadarrMovie[],
  series: SonarrSeries[],
  torrents: QbitTorrent[],
): { media: EnrichedMedia[]; issues: IssueItem[]; stats: DashboardStats } {
  const issues: IssueItem[] = [];
  const enriched: EnrichedMedia[] = [];
  const matchedHashes = new Set<string>();

  // Detect cross-seeded torrents from qBit tags/category (set by Cross Seed on inject)
  const crossSeedHashes = new Set(
    torrents
      .filter(t => CROSSSEED_TAG_RE.test(t.tags ?? '') || CROSSSEED_TAG_RE.test(t.category ?? ''))
      .map(t => t.hash.toLowerCase()),
  );

  // Only process media that has at least one file — skip "wanted but not downloaded" entries
  const downloadedMovies = movies.filter(m => m.hasFile);
  const downloadedSeries = series.filter(s => (s.statistics?.episodeFileCount ?? 0) > 0);

  // ── Movies ─────────────────────────────────────────────────────────────────
  for (const movie of downloadedMovies) {
    // Raw path (as Radarr reports it) — used for inode comparison
    const rawFilePath = movie.movieFile?.path ? norm(movie.movieFile.path) : null;
    const rawFilePaths = rawFilePath ? [rawFilePath] : [];

    // Mapped path — used for path-overlap fallback and display
    const mappedFilePath = rawFilePath ? norm(mapPath(rawFilePath)) : null;
    const filePaths = mappedFilePath ? [mappedFilePath] : [];

    // Match by path first, then by name
    const matchedTorrents = torrents.filter(t => {
      const tp = norm(mapPath(t.content_path ?? t.save_path ?? ''));
      if (filePaths.some(fp => pathsOverlap(fp, tp))) return true;
      return matchScore(t.name, movie.title) > 0;
    });

    matchedTorrents.forEach(t => matchedHashes.add(t.hash));

    const seeding  = seedingStatus(matchedTorrents);
    const hardlink = hardlinkStatus(rawFilePaths, filePaths, matchedTorrents);
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
    if (matchedTorrents.length > 1) {
      issues.push({
        id: `dup-movie-${movie.id}`, type: 'duplicate',
        title: movie.title,
        description: `${matchedTorrents.length} torrents matched to the same movie.`,
        mediaType: 'movie',
      });
    }
    if (hardlink === 'not_hardlinked' && filePaths.length > 0 && matchedTorrents.length > 0) {
      issues.push({
        id: `copy-movie-${movie.id}`, type: 'copy_not_hardlink',
        title: movie.title,
        description: 'Torrent matched but file paths differ — may be a copy instead of a hardlink.',
        mediaType: 'movie',
      });
    }

    enriched.push({
      id: movie.id, type: 'movie',
      title: movie.title, year: movie.year,
      posterUrl: posterImg ? `/api/poster/radarr/${movie.id}` : null,
      seedingStatus: seeding, hardlinkStatus: hardlink,
      torrents: matchedTorrents, filePaths,
      hasDuplicates: matchedTorrents.length > 1,
      crossSeedCount: csCount,
      size: movie.movieFile?.size ?? 0,
    });
  }

  // ── Series ─────────────────────────────────────────────────────────────────
  for (const show of downloadedSeries) {
    // Raw path (as Sonarr reports it) — used for inode comparison
    const rawShowPath = norm(show.path ?? '');
    const rawFilePaths = rawShowPath ? [rawShowPath] : [];

    // Mapped path — used for path-overlap fallback and display
    const mappedShowPath = rawShowPath ? norm(mapPath(rawShowPath)) : '';
    const filePaths = mappedShowPath ? [mappedShowPath] : [];

    const matchedTorrents = torrents.filter(t => {
      const tp = norm(mapPath(t.content_path ?? t.save_path ?? ''));
      if (mappedShowPath && pathsOverlap(mappedShowPath, tp)) return true;
      return matchScore(t.name, show.title) > 0;
    });

    matchedTorrents.forEach(t => matchedHashes.add(t.hash));

    const seeding  = seedingStatus(matchedTorrents);
    const hardlink = hardlinkStatus(rawFilePaths, filePaths, matchedTorrents);
    const csCount  = matchedTorrents.filter(t => crossSeedHashes.has(t.hash.toLowerCase())).length;
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
    if (matchedTorrents.length > 1) {
      issues.push({
        id: `dup-series-${show.id}`, type: 'duplicate',
        title: show.title,
        description: `${matchedTorrents.length} torrents matched to the same series.`,
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
      hasDuplicates: matchedTorrents.length > 1,
      crossSeedCount: csCount,
      size: show.statistics.sizeOnDisk ?? 0,
    });
  }

  // ── Orphan torrents ─────────────────────────────────────────────────────────
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
