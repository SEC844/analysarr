// ── Radarr ──────────────────────────────────────────────────────────────────

export interface RadarrMovie {
  id: number;
  title: string;
  year: number;
  hasFile: boolean;
  movieFile?: {
    id: number;
    relativePath: string;
    path: string;
    size: number;
  };
  images: Array<{ coverType: string; remoteUrl: string; url: string }>;
  monitored: boolean;
  status: string;
  titleSlug: string;
}

// ── Sonarr ───────────────────────────────────────────────────────────────────

export interface SonarrSeries {
  id: number;
  title: string;
  year: number;
  titleSlug: string;
  episodeFileCount: number;
  episodeCount: number;
  images: Array<{ coverType: string; remoteUrl: string; url: string }>;
  monitored: boolean;
  status: string;
  path: string;
  statistics: {
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
  };
}

export interface SonarrEpisode {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  hasFile: boolean;
  episodeFile?: {
    id: number;
    relativePath: string;
    path: string;
    size: number;
  };
}

// ── qBittorrent ──────────────────────────────────────────────────────────────

export type TorrentState =
  | 'uploading'
  | 'stalledUP'
  | 'downloading'
  | 'stalledDL'
  | 'checkingUP'
  | 'checkingDL'
  | 'pausedUP'
  | 'pausedDL'
  | 'queuedUP'
  | 'queuedDL'
  | 'error'
  | 'missingFiles'
  | 'unknown';

export interface QbitTorrent {
  hash: string;
  name: string;
  size: number;
  progress: number;
  dlspeed: number;
  upspeed: number;
  /** Total bytes uploaded for this torrent (all time) */
  uploaded: number;
  /** Total bytes actually downloaded from peers */
  downloaded: number;
  ratio: number;
  state: TorrentState;
  tracker: string;
  save_path: string;
  content_path: string;
  eta: number;
  category: string;
  tags: string;
  added_on: number;
  completion_on: number;
  num_seeds: number;
  num_leechs: number;
}

// ── Cross Seed ───────────────────────────────────────────────────────────────

export type CrossSeedStatus =
  | 'SAVED'
  | 'INJECTED'
  | 'FOUND'
  | 'DUPLICATE'
  | 'SEARCHING'
  | 'UNKNOWN';

export interface CrossSeedTorrent {
  infoHash: string;
  name: string;
  status: CrossSeedStatus;
  decision?: string;
}

// ── Enriched / computed ───────────────────────────────────────────────────────

export type MediaType = 'movie' | 'series';
export type SeedingStatus = 'seeding' | 'not_seeding' | 'unknown';
export type HardlinkStatus = 'hardlinked' | 'not_hardlinked' | 'unknown';

export interface EnrichedMedia {
  id: number;
  type: MediaType;
  title: string;
  year: number;
  posterUrl: string | null;
  seedingStatus: SeedingStatus;
  hardlinkStatus: HardlinkStatus;
  torrents: QbitTorrent[];
  filePaths: string[];
  episodeSeedingCount?: number; // series only
  hasDuplicates: boolean;
  /** Cross-seeds = legitimate re-seeds of the same version via Cross Seed */
  crossSeedCount: number;
  /** Different-version torrents that don't match the *arr file (not cross-seeds) */
  duplicateCount: number;
  size: number; // bytes (arr file size)
  /** Sum of uploaded bytes across all matched torrents */
  totalUploaded: number;
  /** Sum of downloaded bytes across all matched torrents */
  totalDownloaded: number;
  /** Aggregate ratio: totalUploaded / totalDownloaded. null = nothing downloaded (pure seed). */
  globalRatio: number | null;
}

export interface IssueItem {
  id: string;
  type:
    | 'no_torrent'
    | 'orphan_torrent'
    | 'duplicate'
    | 'copy_not_hardlink';
  title: string;
  description: string;
  mediaType?: MediaType;
  torrentHash?: string;
}

export interface DashboardStats {
  totalMovies: number;
  totalSeries: number;
  totalEpisodes: number;
  seedingCount: number;
  hardlinkedCount: number;
  missingHardlinks: number;
  totalSeedingSize: number; // bytes
  issueCount: number;
  crossSeedCount: number;
}

export interface ServiceStatus {
  name: string;
  url: string;
  connected: boolean;
  error?: string;
  version?: string;
}
