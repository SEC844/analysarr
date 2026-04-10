/**
 * Server-side in-memory dashboard cache.
 *
 * Keeps the last enriched result in memory so UI requests are instant.
 * A background interval pre-fetches fresh data so users never wait.
 */

import { getRadarrMovies, getRadarrHistoryHashes } from './radarr';
import { getSonarrSeries, getSonarrHistoryHashes } from './sonarr';
import { getQbitTorrents } from './qbit';
import { enrichMedia } from './enrich';
import { loadConfig } from './config';
import type { EnrichedMedia, IssueItem, DashboardStats } from './types';

export interface CachedDashboard {
  media: EnrichedMedia[];
  issues: IssueItem[];
  stats: DashboardStats;
  errors: { radarr: string | null; sonarr: string | null; qbit: string | null };
  fetchedAt: number;  // Unix ms
  ageSeconds: number; // Populated on read
}

let _cache: Omit<CachedDashboard, 'ageSeconds'> | null = null;
let _refreshing = false;
let _bgTimer: ReturnType<typeof setInterval> | null = null;

async function fetchFresh(): Promise<Omit<CachedDashboard, 'ageSeconds'>> {
  const [moviesR, seriesR, torrentsR, radarrHistR, sonarrHistR] = await Promise.allSettled([
    getRadarrMovies(),
    getSonarrSeries(),
    getQbitTorrents(),
    getRadarrHistoryHashes(),
    getSonarrHistoryHashes(),
  ]);

  const movies   = moviesR.status   === 'fulfilled' ? moviesR.value   : [];
  const series   = seriesR.status   === 'fulfilled' ? seriesR.value   : [];
  const torrents = torrentsR.status === 'fulfilled' ? torrentsR.value : [];

  // Build manual link map from config
  const { manualLinks = [] } = loadConfig();
  const manualMap = new Map(
    manualLinks.map(l => [l.torrentHash.toLowerCase(), { type: l.mediaType as 'movie' | 'series', id: l.mediaId }])
  );

  const history = {
    movies: radarrHistR.status === 'fulfilled' ? radarrHistR.value : new Map<string, number>(),
    series: sonarrHistR.status === 'fulfilled' ? sonarrHistR.value : new Map<string, number>(),
    manual: manualMap,
  };

  const { media, issues, stats } = enrichMedia(movies, series, torrents, history);

  return {
    media, issues, stats,
    errors: {
      radarr:  moviesR.status   === 'rejected' ? String((moviesR.reason as Error)?.message   ?? moviesR.reason)   : null,
      sonarr:  seriesR.status   === 'rejected' ? String((seriesR.reason as Error)?.message   ?? seriesR.reason)   : null,
      qbit:    torrentsR.status === 'rejected' ? String((torrentsR.reason as Error)?.message ?? torrentsR.reason) : null,
    },
    fetchedAt: Date.now(),
  };
}

function withAge(c: Omit<CachedDashboard, 'ageSeconds'>): CachedDashboard {
  return Object.assign({}, c, { ageSeconds: Math.floor((Date.now() - c.fetchedAt) / 1000) });
}

export async function refreshCache(): Promise<CachedDashboard> {
  // If already refreshing, return stale cache rather than queuing a second fetch
  if (_refreshing) {
    if (_cache != null) return withAge(_cache);
    await new Promise(r => setTimeout(r, 500));
    if (_cache != null) return withAge(_cache);
  }

  _refreshing = true;
  try {
    _cache = await fetchFresh();
    return withAge(_cache);
  } finally {
    _refreshing = false;
  }
}

function getRefreshIntervalMs(): number {
  return (loadConfig().refreshInterval ?? 60) * 1000;
}

function startBackgroundRefresh() {
  if (_bgTimer) return;
  // Check every 10 s whether the cache has gone stale; refresh if so
  _bgTimer = setInterval(() => {
    if (_refreshing) return;
    const ttl = getRefreshIntervalMs();
    if (!_cache || Date.now() - _cache.fetchedAt >= ttl) {
      refreshCache().catch(() => { /* silently ignore — stale cache served */ });
    }
  }, 10_000);
}

export function restartBackgroundRefresh() {
  if (_bgTimer) { clearInterval(_bgTimer); _bgTimer = null; }
  startBackgroundRefresh();
}

export async function getCachedDashboard(): Promise<CachedDashboard> {
  startBackgroundRefresh();

  const ttl = getRefreshIntervalMs();

  if (!_cache || Date.now() - _cache.fetchedAt >= ttl) {
    return refreshCache();
  }

  return withAge(_cache);
}

export function getCacheStatus(): { fetchedAt: number | null; ageSeconds: number | null; refreshing: boolean } {
  return {
    fetchedAt: _cache?.fetchedAt ?? null,
    ageSeconds: _cache ? Math.floor((Date.now() - _cache.fetchedAt) / 1000) : null,
    refreshing: _refreshing,
  };
}
