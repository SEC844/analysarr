import type {
  RadarrMovie,
  SonarrSeries,
  QbitTorrent,
  CrossSeedTorrent,
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

const CROSSSEED_ACTIVE = new Set<CrossSeedTorrent['status']>(['SAVED', 'INJECTED']);

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

// ── Name-based fuzzy matching ─────────────────────────────────────────────────
// Strips quality tags, groups, season info, etc. to get a bare title for comparison.

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
    // Remove year
    .replace(/\b(19|20)\d{2}\b/g, '')
    // Remove SxxExx or season/episode numbers
    .replace(/\bs\d{1,2}(e\d{1,3}(-e?\d{1,3})?)?\b/gi, '')
    .replace(/\bseason\s*\d+\b/gi, '')
    .replace(/\bepisode\s*\d+\b/gi, '')
    .replace(/\b(saison|partie)\s*\d+\b/gi, '')
    // Remove quality/group tags
    .replace(QUALITY_RE, '')
    // Remove release group suffix (e.g. "-QTZ", "-Elo")
    .replace(/-[a-z0-9]{2,10}$/i, '')
    // Remove file extension
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    // Normalize separators
    .replace(/[._\-\[\](){}+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns a [0-100] match score between a torrent name and a media title. */
function matchScore(torrentName: string, mediaTitle: string): number {
  const nt = normalizeName(torrentName);
  const nm = normalizeName(mediaTitle);
  if (!nt || !nm || nm.length < 2) return 0;
  if (nt === nm) return 100;
  // Title must be at least 3 chars and fully contained in the normalized torrent name
  if (nm.length >= 3 && nt.includes(nm)) return 85;
  // Torrent name fully contained in title (short torrents)
  if (nt.length >= 3 && nm.includes(nt)) return 70;
  return 0;
}

function seedingStatus(torrents: QbitTorrent[]): SeedingStatus {
  if (torrents.length === 0) return 'not_seeding';
  return torrents.some(t => SEEDING_STATES.has(t.state)) ? 'seeding' : 'not_seeding';
}

function hardlinkStatus(filePaths: string[], torrents: QbitTorrent[]): HardlinkStatus {
  if (filePaths.length === 0 || torrents.length === 0) return 'unknown';
  const torrentPaths = torrents.map(t => norm(mapPath(t.content_path ?? t.save_path)));
  const matched = filePaths.some(fp => torrentPaths.some(tp => pathsOverlap(fp, tp)));
  return matched ? 'hardlinked' : 'not_hardlinked';
}

// ── Main enrichment ───────────────────────────────────────────────────────────

export function enrichMedia(
  movies: RadarrMovie[],
  series: SonarrSeries[],
  torrents: QbitTorrent[],
  crossSeedTorrents: CrossSeedTorrent[] = [],
): { media: EnrichedMedia[]; issues: IssueItem[]; stats: DashboardStats } {
  const issues: IssueItem[] = [];
  const enriched: EnrichedMedia[] = [];
  const matchedHashes = new Set<string>();

  const crossSeedHashes = new Set(
    crossSeedTorrents
      .filter(cs => CROSSSEED_ACTIVE.has(cs.status))
      .map(cs => cs.infoHash.toLowerCase()),
  );

  // ── Movies ─────────────────────────────────────────────────────────────────
  for (const movie of movies) {
    const filePath = movie.movieFile?.path ? norm(movie.movieFile.path) : null;
    const mappedFilePath = filePath ? norm(mapPath(filePath)) : null;
    const filePaths = mappedFilePath ? [mappedFilePath] : [];

    // Match by path first, then by name
    const matchedTorrents = torrents.filter(t => {
      const tp = norm(mapPath(t.content_path ?? t.save_path ?? ''));
      if (filePaths.some(fp => pathsOverlap(fp, tp))) return true;
      return matchScore(t.name, movie.title) > 0;
    });

    matchedTorrents.forEach(t => matchedHashes.add(t.hash));

    const seeding   = seedingStatus(matchedTorrents);
    const hardlink  = hardlinkStatus(filePaths, matchedTorrents);
    const csCount   = matchedTorrents.filter(t => crossSeedHashes.has(t.hash.toLowerCase())).length;
    const posterImg = movie.images.find(i => i.coverType === 'poster');

    if (filePath && matchedTorrents.length === 0) {
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
  for (const show of series) {
    const showPath = norm(mapPath(show.path ?? ''));
    const filePaths = showPath ? [showPath] : [];

    const matchedTorrents = torrents.filter(t => {
      const tp = norm(mapPath(t.content_path ?? t.save_path ?? ''));
      if (showPath && pathsOverlap(showPath, tp)) return true;
      return matchScore(t.name, show.title) > 0;
    });

    matchedTorrents.forEach(t => matchedHashes.add(t.hash));

    const seeding  = seedingStatus(matchedTorrents);
    const hardlink = hardlinkStatus(filePaths, matchedTorrents);
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
  // Seeding count = all qBit torrents in seeding state (not just matched ones)
  const seedingTorrents     = torrents.filter(t => SEEDING_STATES.has(t.state));
  const totalSeedingSize    = seedingTorrents.reduce((a, t) => a + t.size, 0);

  const hardlinkedCount  = enriched.filter(m => m.hardlinkStatus === 'hardlinked').length;
  const missingHardlinks = enriched.filter(m => m.filePaths.length > 0 && m.hardlinkStatus === 'not_hardlinked').length;
  const totalEpisodes    = series.reduce((a, s) => a + (s.statistics?.episodeCount ?? 0), 0);
  const totalCrossSeeds  = crossSeedTorrents.filter(cs => CROSSSEED_ACTIVE.has(cs.status)).length;

  return {
    media: enriched,
    issues,
    stats: {
      totalMovies: movies.length,
      totalSeries: series.length,
      totalEpisodes,
      seedingCount: seedingTorrents.length,   // ← direct from qBit
      hardlinkedCount,
      missingHardlinks,
      totalSeedingSize,
      issueCount: issues.length,
      crossSeedCount: totalCrossSeeds,
    },
  };
}
