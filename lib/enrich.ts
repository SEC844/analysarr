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
const PATH_MAP_TO = process.env.PATH_MAP_TO ?? '';

const SEEDING_STATES = new Set(['uploading', 'stalledUP', 'checkingUP', 'queuedUP', 'forcedUP']);

/** Cross Seed statuses that mean the torrent is actively seeding as a cross-seed */
const CROSSSEED_ACTIVE_STATUSES = new Set<CrossSeedTorrent['status']>([
  'SAVED',
  'INJECTED',
]);

function mapPath(p: string): string {
  if (PATH_MAP_FROM && PATH_MAP_TO && p.startsWith(PATH_MAP_FROM)) {
    return PATH_MAP_TO + p.slice(PATH_MAP_FROM.length);
  }
  return p;
}

function seedingStatus(torrents: QbitTorrent[]): SeedingStatus {
  if (torrents.length === 0) return 'not_seeding';
  return torrents.some((t) => SEEDING_STATES.has(t.state)) ? 'seeding' : 'not_seeding';
}

function hardlinkStatus(filePaths: string[], torrents: QbitTorrent[]): HardlinkStatus {
  if (filePaths.length === 0 || torrents.length === 0) return 'unknown';
  const torrentPaths = torrents.map((t) => mapPath(t.content_path ?? t.save_path));
  const matched = filePaths.some((fp) =>
    torrentPaths.some((tp) => fp.startsWith(tp) || tp.startsWith(fp))
  );
  return matched ? 'hardlinked' : 'not_hardlinked';
}

function normalizePath(p: string | undefined): string {
  return (p ?? '').replace(/\\/g, '/');
}

export function enrichMedia(
  movies: RadarrMovie[],
  series: SonarrSeries[],
  torrents: QbitTorrent[],
  crossSeedTorrents: CrossSeedTorrent[] = []
): { media: EnrichedMedia[]; issues: IssueItem[]; stats: DashboardStats } {
  const issues: IssueItem[] = [];
  const enriched: EnrichedMedia[] = [];
  const matchedHashes = new Set<string>();

  // Build a set of hashes that are cross-seeds so we can exclude them from orphan detection
  const crossSeedHashes = new Set(
    crossSeedTorrents
      .filter((cs) => CROSSSEED_ACTIVE_STATUSES.has(cs.status))
      .map((cs) => cs.infoHash.toLowerCase())
  );

  // ── Movies ────────────────────────────────────────────────────────────────
  for (const movie of movies) {
    const filePath = movie.movieFile?.path ? normalizePath(movie.movieFile.path) : null;
    const filePaths = filePath ? [filePath] : [];

    const matchedTorrents = torrents.filter((t) => {
      const tp = normalizePath(mapPath(t.content_path ?? t.save_path));
      return filePaths.some((fp) => fp.startsWith(tp) || tp.startsWith(fp));
    });

    matchedTorrents.forEach((t) => matchedHashes.add(t.hash));

    const seeding = seedingStatus(matchedTorrents);
    const hardlink = hardlinkStatus(filePaths, matchedTorrents);

    const posterImage = movie.images.find((i) => i.coverType === 'poster');

    // Count cross-seeds linked to this movie's torrents
    const crossSeedCount = matchedTorrents.filter((t) =>
      crossSeedHashes.has(t.hash.toLowerCase())
    ).length;

    // Issues
    if (filePath && matchedTorrents.length === 0) {
      issues.push({
        id: `no-torrent-movie-${movie.id}`,
        type: 'no_torrent',
        title: movie.title,
        description: 'Movie file found but no matching torrent in qBittorrent.',
        mediaType: 'movie',
      });
    }

    if (matchedTorrents.length > 1) {
      issues.push({
        id: `dup-movie-${movie.id}`,
        type: 'duplicate',
        title: movie.title,
        description: `${matchedTorrents.length} torrents matched to the same movie.`,
        mediaType: 'movie',
      });
    }

    if (hardlink === 'not_hardlinked' && filePaths.length > 0) {
      issues.push({
        id: `copy-movie-${movie.id}`,
        type: 'copy_not_hardlink',
        title: movie.title,
        description: 'File present but path does not match any torrent — likely a copy, not a hardlink.',
        mediaType: 'movie',
      });
    }

    enriched.push({
      id: movie.id,
      type: 'movie',
      title: movie.title,
      year: movie.year,
      posterUrl: posterImage ? `/api/poster/radarr/${movie.id}` : null,
      seedingStatus: seeding,
      hardlinkStatus: hardlink,
      torrents: matchedTorrents,
      filePaths,
      hasDuplicates: matchedTorrents.length > 1,
      crossSeedCount,
      size: movie.movieFile?.size ?? 0,
    });
  }

  // ── Series ────────────────────────────────────────────────────────────────
  for (const show of series) {
    const showPath = normalizePath(show.path);

    const matchedTorrents = torrents.filter((t) => {
      const tp = normalizePath(mapPath(t.content_path ?? t.save_path));
      return tp.startsWith(showPath) || showPath.startsWith(tp);
    });

    matchedTorrents.forEach((t) => matchedHashes.add(t.hash));

    const seeding = seedingStatus(matchedTorrents);
    const filePaths = showPath ? [showPath] : [];
    const hardlink = hardlinkStatus(filePaths, matchedTorrents);

    const episodeSeedingCount = matchedTorrents.filter((t) =>
      SEEDING_STATES.has(t.state)
    ).length;

    const posterImage = show.images.find((i) => i.coverType === 'poster');

    const crossSeedCount = matchedTorrents.filter((t) =>
      crossSeedHashes.has(t.hash.toLowerCase())
    ).length;

    if (show.statistics.episodeFileCount > 0 && matchedTorrents.length === 0) {
      issues.push({
        id: `no-torrent-series-${show.id}`,
        type: 'no_torrent',
        title: show.title,
        description: `Series has ${show.statistics.episodeFileCount} episode files but no matching torrent.`,
        mediaType: 'series',
      });
    }

    if (matchedTorrents.length > 1) {
      issues.push({
        id: `dup-series-${show.id}`,
        type: 'duplicate',
        title: show.title,
        description: `${matchedTorrents.length} torrents matched to the same series.`,
        mediaType: 'series',
      });
    }

    enriched.push({
      id: show.id,
      type: 'series',
      title: show.title,
      year: show.year,
      posterUrl: posterImage ? `/api/poster/sonarr/${show.id}` : null,
      seedingStatus: seeding,
      hardlinkStatus: hardlink,
      torrents: matchedTorrents,
      filePaths,
      episodeSeedingCount,
      hasDuplicates: matchedTorrents.length > 1,
      crossSeedCount,
      size: show.statistics.sizeOnDisk ?? 0,
    });
  }

  // ── Orphan torrents ───────────────────────────────────────────────────────
  // Exclude cross-seeds from orphan detection — they legitimately exist
  // outside of *arr but are not real orphans.
  for (const t of torrents) {
    if (!matchedHashes.has(t.hash) && !crossSeedHashes.has(t.hash.toLowerCase())) {
      issues.push({
        id: `orphan-${t.hash}`,
        type: 'orphan_torrent',
        title: t.name,
        description: 'Torrent exists in qBittorrent but is not linked to any Radarr/Sonarr entry.',
        torrentHash: t.hash,
      });
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const seedingMedia = enriched.filter((m) => m.seedingStatus === 'seeding');
  const hardlinkedMedia = enriched.filter((m) => m.hardlinkStatus === 'hardlinked');
  const missingHardlinks = enriched.filter(
    (m) => m.filePaths.length > 0 && m.hardlinkStatus === 'not_hardlinked'
  );

  const seedingTorrents = torrents.filter((t) => SEEDING_STATES.has(t.state));
  const totalSeedingSize = seedingTorrents.reduce((acc, t) => acc + t.size, 0);

  const totalEpisodes = series.reduce(
    (acc, s) => acc + (s.statistics?.episodeCount ?? 0),
    0
  );

  const totalCrossSeedCount = crossSeedTorrents.filter((cs) =>
    CROSSSEED_ACTIVE_STATUSES.has(cs.status)
  ).length;

  const stats: DashboardStats = {
    totalMovies: movies.length,
    totalSeries: series.length,
    totalEpisodes,
    seedingCount: seedingMedia.length,
    hardlinkedCount: hardlinkedMedia.length,
    missingHardlinks: missingHardlinks.length,
    totalSeedingSize,
    issueCount: issues.length,
    crossSeedCount: totalCrossSeedCount,
  };

  return { media: enriched, issues, stats };
}
