import type { SonarrSeries, SonarrEpisode, ServiceStatus } from './types';
import { buildServiceUrl } from './utils';

// SONARR_PORT is optional — overrides the port in SONARR_URL if set
const BASE_URL = buildServiceUrl(
  process.env.SONARR_URL ?? '',
  process.env.SONARR_PORT
);
const API_KEY = process.env.SONARR_API_KEY ?? '';
const TIMEOUT_MS = 5000;

async function sonarrFetch<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/api/v3${path}`, {
      headers: { 'X-Api-Key': API_KEY },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Sonarr responded with ${res.status}: ${res.statusText}`);
    }

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

export async function getSonarrStatus(): Promise<ServiceStatus> {
  if (!BASE_URL || !API_KEY) {
    return {
      name: 'Sonarr',
      url: BASE_URL,
      connected: false,
      error: 'URL or API key not configured',
    };
  }

  try {
    const data = await sonarrFetch<{ version: string }>('/system/status');
    return { name: 'Sonarr', url: BASE_URL, connected: true, version: data.version };
  } catch (err) {
    return {
      name: 'Sonarr',
      url: BASE_URL,
      connected: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function getSonarrPoster(seriesId: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `${BASE_URL}/api/v3/mediacover/${seriesId}/poster.jpg`,
      { headers: { 'X-Api-Key': API_KEY }, signal: controller.signal }
    );
    clearTimeout(timer);
    return res;
  } catch {
    clearTimeout(timer);
    throw new Error('Failed to fetch Sonarr poster');
  }
}
