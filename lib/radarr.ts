import type { RadarrMovie, ServiceStatus } from './types';
import { buildServiceUrl } from './utils';
import { loadConfig } from './config';

const TIMEOUT_MS = 5000;

/** Read Radarr config at call time — prefers UI config, falls back to env vars. */
function getConfig() {
  const saved = loadConfig().services?.radarr ?? {};
  return {
    url: saved.url?.trim() || buildServiceUrl(process.env.RADARR_URL ?? '', process.env.RADARR_PORT),
    apiKey: saved.apiKey?.trim() || (process.env.RADARR_API_KEY ?? '').trim(),
  };
}

async function radarrFetch<T>(path: string): Promise<T> {
  const { url, apiKey } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${url}/api/v3${path}`, {
      headers: { 'X-Api-Key': apiKey },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Radarr responded with ${res.status}: ${res.statusText}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export async function getRadarrMovies(): Promise<RadarrMovie[]> {
  return radarrFetch<RadarrMovie[]>('/movie');
}

export async function getRadarrStatus(): Promise<ServiceStatus> {
  const { url, apiKey } = getConfig();

  if (!url) return { name: 'Radarr', url: '', connected: false, error: 'URL not configured' };
  if (!apiKey) return { name: 'Radarr', url, connected: false, error: 'API key not configured' };

  try {
    const data = await radarrFetch<{ version: string }>('/system/status');
    return { name: 'Radarr', url, connected: true, version: data.version };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const hint = msg.includes('401')
      ? `${msg} — wrong API key (check Radarr → Settings → General)`
      : msg;
    return { name: 'Radarr', url, connected: false, error: hint };
  }
}

export async function getRadarrPoster(movieId: number): Promise<Response> {
  const { url, apiKey } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/api/v3/mediacover/${movieId}/poster.jpg`, {
      headers: { 'X-Api-Key': apiKey }, signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch {
    clearTimeout(timer);
    throw new Error('Failed to fetch Radarr poster');
  }
}
