import type { RadarrMovie, ServiceStatus } from './types';
import { buildServiceUrl } from './utils';

// RADARR_PORT is optional — overrides the port in RADARR_URL if set
const BASE_URL = buildServiceUrl(
  process.env.RADARR_URL ?? '',
  process.env.RADARR_PORT
);
const API_KEY = (process.env.RADARR_API_KEY ?? '').trim();
const TIMEOUT_MS = 5000;

async function radarrFetch<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/api/v3${path}`, {
      headers: { 'X-Api-Key': API_KEY },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Radarr responded with ${res.status}: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export async function getRadarrMovies(): Promise<RadarrMovie[]> {
  return radarrFetch<RadarrMovie[]>('/movie');
}

export async function getRadarrStatus(): Promise<ServiceStatus> {
  if (!BASE_URL || !API_KEY) {
    return {
      name: 'Radarr',
      url: BASE_URL,
      connected: false,
      error: 'URL or API key not configured',
    };
  }

  try {
    const data = await radarrFetch<{ version: string }>('/system/status');
    return { name: 'Radarr', url: BASE_URL, connected: true, version: data.version };
  } catch (err) {
    return {
      name: 'Radarr',
      url: BASE_URL,
      connected: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function getRadarrPoster(movieId: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `${BASE_URL}/api/v3/mediacover/${movieId}/poster.jpg`,
      { headers: { 'X-Api-Key': API_KEY }, signal: controller.signal }
    );
    clearTimeout(timer);
    return res;
  } catch {
    clearTimeout(timer);
    throw new Error('Failed to fetch Radarr poster');
  }
}
