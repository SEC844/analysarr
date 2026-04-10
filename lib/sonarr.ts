import type { SonarrSeries, SonarrEpisode, ServiceStatus } from './types';
import { buildServiceUrl } from './utils';
import { loadConfig } from './config';

const TIMEOUT_MS = 5000;

/** Read Sonarr config at call time — prefers UI config, falls back to env vars. */
function getConfig() {
  const saved = loadConfig().services?.sonarr ?? {};
  return {
    url: saved.url?.trim() || buildServiceUrl(process.env.SONARR_URL ?? '', process.env.SONARR_PORT),
    apiKey: saved.apiKey?.trim() || (process.env.SONARR_API_KEY ?? '').trim(),
  };
}

async function sonarrFetch<T>(path: string): Promise<T> {
  const { url, apiKey } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${url}/api/v3${path}`, {
      headers: { 'X-Api-Key': apiKey },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Sonarr responded with ${res.status}: ${res.statusText}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export async function getSonarrSeries(): Promise<SonarrSeries[]> {
  return sonarrFetch<SonarrSeries[]>('/series');
}

export async function getSonarrEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
  return sonarrFetch<SonarrEpisode[]>(`/episode?seriesId=${seriesId}`);
}

export interface SonarrEpisodeFile {
  id: number;
  seriesId: number;
  seasonNumber: number;
  relativePath: string;
  path: string;
  size: number;
  dateAdded: string;
}

export async function getSonarrEpisodeFiles(seriesId: number): Promise<SonarrEpisodeFile[]> {
  return sonarrFetch<SonarrEpisodeFile[]>(`/episodeFile?seriesId=${seriesId}`);
}

export async function getSonarrStatus(): Promise<ServiceStatus> {
  const { url, apiKey } = getConfig();

  if (!url) return { name: 'Sonarr', url: '', connected: false, error: 'URL not configured' };
  if (!apiKey) return { name: 'Sonarr', url, connected: false, error: 'API key not configured' };

  try {
    const data = await sonarrFetch<{ version: string }>('/system/status');
    return { name: 'Sonarr', url, connected: true, version: data.version };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const hint = msg.includes('401')
      ? `${msg} — wrong API key (check Sonarr → Settings → General)`
      : msg;
    return { name: 'Sonarr', url, connected: false, error: hint };
  }
}

export async function getSonarrPoster(seriesId: number): Promise<Response> {
  const { url, apiKey } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/api/v3/mediacover/${seriesId}/poster.jpg`, {
      headers: { 'X-Api-Key': apiKey }, signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch {
    clearTimeout(timer);
    throw new Error('Failed to fetch Sonarr poster');
  }
}
