import { statSync, readdirSync } from 'fs';
import { join as joinPath, normalize as normalizePath, basename } from 'path';
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
  SeedStatus,
  SeedStatusDetails,
} from './types';
import { scanFile, scanDirectory, collectDirectoryInodes } from './fileScanner';
import {
  classifySeedStatus,
  aggregateSeedStatus,
  QBIT_SEEDING_STATES,
} from './seedClassifier';

// Re-export for legacy callers
export const SEEDING_STATES = QBIT_SEEDING_STATES;

// Cross Seed injects torrents into qBittorrent tagged with "cross-seed" (default)
// but users may configure "crossseed" or "cross_seed" — match all variants.
const CROSSSEED_TAG_RE = /cross[-_]?seed/i;

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

/**
 * Robust path overlap using path.normalize + explicit boundary check.
 * Prevents false matches like /media/foo vs /media/foobar.
 * Checks if one path IS a subpath of the other (or they are equal).
 */
function pathsOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalizePath(a).replace(/\\/g, '/').replace(/\/+$/, '');
  const nb = normalizePath(b).replace(/\\/g, '/').replace(/\/+$/, '');
  if (na === nb) return true;
  return na.startsWith(nb + '/') || nb.startsWith(na + '/');
}

// ── Inode helpers (legacy — kept for hardlinkStatus backward compat) ──────────

function safeIno(p: string): bigint | null {
  if (!p) return null;
  try {
    const s = statSync(p, { bigint: true });
    return s.ino > 0n ? s.ino : null;
  } catch {
    return null;
  }
}

function collectInodes(dir: string, maxFiles = 20): Set<bigint> {
  const result = new Set<bigint>();
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
    try { arrStat = statSync(arrResolved, { bigint: true }); anyAccessible = true; } catch { continue; }

    if (arrStat.isFile()) {
      const arrIno = arrStat.ino;
      for (const t of torrents) {
        const qp = norm(t.content_path ?? t.save_path ?? '');
        if (!qp) continue;
        let qStat = null;
        try { qStat = statSync(qp, { bigint: true }); anyAccessible = true; } catch { continue; }
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
        try { qStat = statSync(qp, { bigint: true }); anyAccessible = true; } catch { continue; }
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
    .replace(/\b(19|20)\d{2}\b/g, '')      // strip years for title comparison
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
 * Strategy:
 * 1. Year gate — torrent must contain the release year (avoids cross-title matches)
 * 2. Token match — every word of the media title must appear in the normalized torrent name
 *    Robust to dots/underscores/dashes as separators and word reordering.
 * 3. Short title fallback — single-word or 2-token titles use substring matching.
 */
function matchScore(torrentName: string, mediaTitle: string, year: number): number {
  // Year gate: torrent name must contain the release year (exact 4-digit match)
  if (year > 0 && !torrentName.includes(String(year))) return 0;

  const nt = normalizeName(torrentName);
  const nm = normalizeName(mediaTitle);
  if (!nt || !nm || nm.length < 2) return 0;

  // Exact normalized match
  if (nt === nm) return 100;

  // Token-based match: all title words must appear in the torrent name
  const titleTokens = nm.split(' ').filter(w => w.length >= 2);
  if (titleTokens.length >= 2) {
    const matched = titleTokens.filter(tok => nt.includes(tok));
    const ratio   = matched.length / titleTokens.length;
    if (ratio === 1.0) return 90; // All tokens matched — high confidence
    if (ratio >= 0.8) return 65;  // 80%+ — acceptable
    return 0;                     // Below 80% — too risky
  }

  // Single-word titles: substring is sufficient
  if (nm.length >= 3 && nt.includes(nm)) return 80;
  return 0;
}

// ── Seeding / hardlink status helpers ────────────────────────────────────────

function seedingStatus(torrents: QbitTorrent[]): SeedingStatus {
  if (torrents.length === 0) return 'not_seeding';
  return torrents.some(t => QBIT_SEEDING_STATES.has(t.state)) ? 'seeding' : 'not_seeding';
}

function hardlinkStatus(
  rawArrPaths: string[],
  mappedArrPaths: string[],
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
 *   - Its size matches the arr file size EXACTLY (0% tolerance), OR
 *   - arrSize is unknown (0) — treat all non-cs torrents as canonical
 *
 * A torrent is a "duplicate" if it is NOT a cross-seed AND its size differs
 * from the arr file size by even 1 byte.
 *
 * NOTE: 0% tolerance (was 2%) prevents false negatives on cross-seeds with
 * slightly different encodes being incorrectly treated as canonical.
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
      // Cross-seeds are never duplicates
      canonical.push(t);
      continue;
    }
    if (arrSize <= 0) {
      // No arr file size known — treat all non-cs as canonical
      canonical.push(t);
      continue;
    }
    // Exact size match (0 bytes tolerance)
    if (t.size === arrSize) {
      canonical.push(t);
    } else {
      duplicates.push(t);
    }
  }

  return { canonical, duplicates };
}

// ── SeedStatus computation ────────────────────────────────────────────────────

/**
 * Compute the SeedStatus for a single media file (movie use case).
 *
 * Steps:
 * 1. Scan the /media file for its FileInfo (inode, nlink, size)
 * 2. For each canonical torrent, scan /data for files with matching filename
 * 3. Run classifySeedStatus() with the collected data
 */
function computeMovieSeedStatus(
  mappedFilePath: string,
  canonicalTorrents: QbitTorrent[],
  mapFn: (p: string) => string,
): { status: SeedStatus; details: SeedStatusDetails } {
  const noResult: { status: SeedStatus; details: SeedStatusDetails } = {
    status: 'not_seeding',
    details: { mediaInode: null, dataInode: null, nlink: 0, qbitState: null, duplicateCount: 0 },
  };

  const mediaFile = scanFile(mappedFilePath);
  if (!mediaFile) return noResult;

  const filename = basename(mappedFilePath);

  // Collect all candidate data files from canonical torrent paths
  const dataFiles: ReturnType<typeof scanFile>[] = [];
  for (const t of canonicalTorrents) {
    const tp = norm(mapFn(t.content_path ?? t.save_path ?? ''));
    if (!tp) continue;

    // Try it as a file first
    const fileInfo = scanFile(tp);
    if (fileInfo) {
      if (basename(tp) === filename) {
        dataFiles.push(fileInfo);
      }
    } else {
      // It's a directory — scan for the matching filename
      const found = scanDirectory(tp, filename);
      dataFiles.push(...found);
    }
  }

  const validDataFiles = dataFiles.filter((f): f is NonNullable<typeof f> => f !== null);

  // Find the active seeding torrent's state
  const activeTorrent = canonicalTorrents.find(t => QBIT_SEEDING_STATES.has(t.state));
  const isInQbit = canonicalTorrents.length > 0 && activeTorrent !== undefined;

  const status = classifySeedStatus({
    mediaFile,
    dataFiles: validDataFiles,
    isInQbit,
    qbitState: activeTorrent?.state,
  });

  const matchedDataFile = validDataFiles.find(df => df.inode === mediaFile.inode);
  const duplicateDataFiles = validDataFiles.filter(
    df => df.inode !== mediaFile.inode && df.size === mediaFile.size,
  );

  return {
    status,
    details: {
      mediaInode: mediaFile.inode,
      dataInode: matchedDataFile?.inode ?? null,
      nlink: matchedDataFile?.nlink ?? mediaFile.nlink,
      qbitState: activeTorrent?.state ?? null,
      duplicateCount: duplicateDataFiles.length,
    },
  };
}

/**
 * Compute the SeedStatus for a series (directory-based).
 *
 * Samples up to 10 episode files from the show directory and aggregates
 * their individual statuses into a single representative value.
 *
 * Worst-wins aggregation: seed_duplicate > seed_not_hardlink > seed_no_cs > seed_ok > not_seeding
 */
function computeSeriesSeedStatus(
  mappedShowPath: string,
  canonicalTorrents: QbitTorrent[],
  mapFn: (p: string) => string,
): { status: SeedStatus; details: SeedStatusDetails } {
  const noResult: { status: SeedStatus; details: SeedStatusDetails } = {
    status: 'not_seeding',
    details: { mediaInode: null, dataInode: null, nlink: 0, qbitState: null, duplicateCount: 0 },
  };

  if (!mappedShowPath || canonicalTorrents.length === 0) return noResult;

  const activeTorrent = canonicalTorrents.find(t => QBIT_SEEDING_STATES.has(t.state));
  const isInQbit = activeTorrent !== undefined;

  if (!isInQbit) return noResult;

  // Collect all media inodes from the show directory (sample up to 50)
  const mediaInodes = collectDirectoryInodes(mappedShowPath, 50);
  if (mediaInodes.size === 0) return noResult;

  // Collect all data inodes from all canonical torrent paths (sample up to 50)
  const dataInodes = new Map<bigint, import('./fileScanner').FileInfo>();
  for (const t of canonicalTorrents) {
    const tp = norm(mapFn(t.content_path ?? t.save_path ?? ''));
    if (!tp) continue;
    const torrentInodes = collectDirectoryInodes(tp, 50);
    for (const [ino, info] of torrentInodes) {
      dataInodes.set(ino, info);
    }
  }

  if (dataInodes.size === 0) return noResult;

  // For each sampled media file, compute its seed status using collected data
  const perFileStatuses: SeedStatus[] = [];
  let totalDuplicates = 0;

  for (const [, mediaFile] of mediaInodes) {
    // Find data files with matching filename for accurate per-file comparison
    const candidateDataFiles = Array.from(dataInodes.values()).filter(
      df => basename(df.path) === basename(mediaFile.path),
    );

    const fileStatus = classifySeedStatus({
      mediaFile,
      dataFiles: candidateDataFiles.length > 0 ? candidateDataFiles : Array.from(dataInodes.values()),
      isInQbit,
      qbitState: activeTorrent?.state,
    });

    perFileStatuses.push(fileStatus);
    if (fileStatus === 'seed_duplicate') totalDuplicates++;
  }

  const aggregated = aggregateSeedStatus(perFileStatuses);

  // Pick representative details from the first inode-matched pair
  const firstMediaFile = Array.from(mediaInodes.values())[0];
  const matchedDataFile = firstMediaFile
    ? dataInodes.get(firstMediaFile.inode)
    : undefined;

  return {
    status: aggregated,
    details: {
      mediaInode: firstMediaFile?.inode ?? null,
      dataInode: matchedDataFile?.inode ?? null,
      nlink: matchedDataFile?.nlink ?? firstMediaFile?.nlink ?? 0,
      qbitState: activeTorrent?.state ?? null,
      duplicateCount: totalDuplicates,
    },
  };
}

// ── Main enrichment ───────────────────────────────────────────────────────────

export interface HistoryMaps {
  /** torrentHash (lowercase) → Radarr movieId */
  movies: Map<string, number>;
  /** torrentHash (lowercase) → Sonarr seriesId */
  series: Map<string, number>;
  /** torrentHash (lowercase) → { mediaType, mediaId } from user-configured manual links */
  manual: Map<string, { type: 'movie' | 'series'; id: number }>;
}

export function enrichMedia(
  movies: RadarrMovie[],
  series: SonarrSeries[],
  torrents: QbitTorrent[],
  history?: HistoryMaps,
): { media: EnrichedMedia[]; issues: IssueItem[]; stats: DashboardStats } {
  const { pathMappings, manualLinks = [] } = loadConfig();
  const mapFn = makeMapFn(pathMappings);

  // Build manual link map (from UI-configured overrides)
  const manualMap = new Map<string, { type: 'movie' | 'series'; id: number }>();
  for (const link of manualLinks) {
    manualMap.set(link.torrentHash.toLowerCase(), { type: link.mediaType, id: link.mediaId });
  }

  const hist: HistoryMaps = history ?? {
    movies: new Map(),
    series: new Map(),
    manual: manualMap,
  };
  if (!history) hist.manual = manualMap;

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
      const hash = t.hash.toLowerCase();
      // 1. Manual link (user-configured, highest priority)
      const manual = hist.manual.get(hash);
      if (manual?.type === 'movie' && manual.id === movie.id) return true;
      // 2. History-based match (direct hash from Radarr download history)
      if (hist.movies.get(hash) === movie.id) return true;
      // 3. Path overlap — content_path must be a subpath of the mapped arr path (or vice versa)
      //    Uses normalize() + startsWith() with directory boundary check
      const tp = norm(mapFn(t.content_path ?? t.save_path ?? ''));
      if (tp && filePaths.some(fp => pathsOverlap(fp, tp))) return true;
      // 4. Year-aware token-based name match (fallback)
      return matchScore(t.name, movie.title, movie.year) > 0;
    });

    matchedTorrents.forEach(t => matchedHashes.add(t.hash));

    const { canonical, duplicates } = classifyTorrents(matchedTorrents, arrSize, crossSeedHashes);
    const { totalUploaded, totalDownloaded, globalRatio } = computeRatio(matchedTorrents);

    const seeding  = seedingStatus(matchedTorrents);
    const hardlink = hardlinkStatus(rawFilePaths, filePaths, canonical, mapFn);
    const csCount  = matchedTorrents.filter(t => crossSeedHashes.has(t.hash.toLowerCase())).length;
    const posterImg = movie.images.find(i => i.coverType === 'poster');

    // Fine-grained seed status (inode-based classification)
    const { status: seedStatus, details: seedStatusDetails } = mappedFilePath
      ? computeMovieSeedStatus(mappedFilePath, canonical, mapFn)
      : { status: 'not_seeding' as SeedStatus, details: { mediaInode: null, dataInode: null, nlink: 0, qbitState: null, duplicateCount: 0 } as SeedStatusDetails };

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
    if (seedStatus === 'seed_not_hardlink' && filePaths.length > 0 && canonical.filter(t => !crossSeedHashes.has(t.hash.toLowerCase())).length > 0) {
      issues.push({
        id: `copy-movie-${movie.id}`, type: 'copy_not_hardlink',
        title: movie.title,
        description: 'Torrent matched but no shared inode — file is a copy instead of a hardlink.',
        mediaType: 'movie',
      });
    }

    enriched.push({
      id: movie.id, type: 'movie',
      title: movie.title, year: movie.year,
      posterUrl: posterImg ? `/api/poster/radarr/${movie.id}` : null,
      seedingStatus: seeding, hardlinkStatus: hardlink,
      seedStatus, seedStatusDetails,
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
      const hash = t.hash.toLowerCase();
      // 1. Manual link
      const manual = hist.manual.get(hash);
      if (manual?.type === 'series' && manual.id === show.id) return true;
      // 2. History-based match
      if (hist.series.get(hash) === show.id) return true;
      // 3. Path overlap — torrent content_path must be a subpath of the show path (or vice versa)
      const tp = norm(mapFn(t.content_path ?? t.save_path ?? ''));
      if (tp && mappedShowPath && pathsOverlap(mappedShowPath, tp)) return true;
      // 4. Name-based fallback
      return matchScore(t.name, show.title, show.year) > 0;
    });

    matchedTorrents.forEach(t => matchedHashes.add(t.hash));

    const { canonical, duplicates } = classifyTorrents(matchedTorrents, arrSize, crossSeedHashes);
    const { totalUploaded, totalDownloaded, globalRatio } = computeRatio(matchedTorrents);

    const seeding   = seedingStatus(matchedTorrents);
    const hardlink  = hardlinkStatus(rawFilePaths, filePaths, canonical, mapFn);
    const csCount   = matchedTorrents.filter(t => crossSeedHashes.has(t.hash.toLowerCase())).length;
    const epSeeding = matchedTorrents.filter(t => QBIT_SEEDING_STATES.has(t.state)).length;
    const posterImg = show.images.find(i => i.coverType === 'poster');

    // Fine-grained seed status (directory inode sampling)
    const { status: seedStatus, details: seedStatusDetails } = mappedShowPath
      ? computeSeriesSeedStatus(mappedShowPath, canonical, mapFn)
      : { status: 'not_seeding' as SeedStatus, details: { mediaInode: null, dataInode: null, nlink: 0, qbitState: null, duplicateCount: 0 } as SeedStatusDetails };

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
      seedStatus, seedStatusDetails,
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
  const seedingTorrents  = torrents.filter(t => QBIT_SEEDING_STATES.has(t.state));
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
