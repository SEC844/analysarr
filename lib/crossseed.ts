import type { ServiceStatus } from './types';
import { buildServiceUrl } from './utils';
import { loadConfig } from './config';

const TIMEOUT_MS = 5000;

function getConfig() {
  const saved = loadConfig().services?.crossseed ?? {};
  return {
    url: saved.url?.trim() || buildServiceUrl(process.env.CROSSSEED_URL ?? '', process.env.CROSSSEED_PORT),
    apiKey: saved.apiKey?.trim() || (process.env.CROSSSEED_API_KEY ?? '').trim(),
  };
}

export function isCrossSeedEnabled(): boolean {
  return Boolean(getConfig().url);
}

function authHeaders(apiKey: string): Record<string, string> {
  if (!apiKey) return {};
  return { 'X-Api-Key': apiKey };
}

async function crossSeedFetch(url: string, path: string, apiKey: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const fullUrl = new URL(`${url}${path}`);
  if (apiKey) fullUrl.searchParams.set('apikey', apiKey);

  try {
    return await fetch(fullUrl.toString(), {
      ...options,
      headers: { ...authHeaders(apiKey), ...(options.headers as Record<string, string> ?? {}) },
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function getCrossSeedStatus(): Promise<ServiceStatus> {
  const { url, apiKey } = getConfig();

  if (!url) {
    return { name: 'Cross Seed', url: '', connected: false, error: 'Non configuré (CROSSSEED_URL absent)' };
  }

  try {
    const ping = await crossSeedFetch(url, '/api/ping', apiKey);
    if (!ping.ok && ping.status !== 200) {
      return { name: 'Cross Seed', url, connected: false, error: `Serveur injoignable (HTTP ${ping.status})` };
    }

    const status = await crossSeedFetch(url, '/api/status', apiKey);

    if (status.ok) {
      try {
        const indexer = await crossSeedFetch(url, '/api/indexer/v1/status', apiKey);
        if (indexer.ok) {
          const data = await indexer.json() as { version?: string };
          return { name: 'Cross Seed', url, connected: true, version: data.version };
        }
      } catch { /* version is optional */ }
      return { name: 'Cross Seed', url, connected: true };
    }

    if (status.status === 401 || status.status === 403) {
      return { name: 'Cross Seed', url, connected: false, error: `Clé API invalide (HTTP ${status.status})` };
    }

    return { name: 'Cross Seed', url, connected: false, error: `HTTP ${status.status} sur /api/status` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    const hint = msg.includes('abort') ? 'Timeout — serveur injoignable' : msg;
    return { name: 'Cross Seed', url, connected: false, error: hint };
  }
}
