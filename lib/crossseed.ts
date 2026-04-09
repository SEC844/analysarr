import type { CrossSeedTorrent, ServiceStatus } from './types';
import { buildServiceUrl } from './utils';

// CROSSSEED_PORT is optional — overrides the port in CROSSSEED_URL if set
const BASE_URL = buildServiceUrl(
  process.env.CROSSSEED_URL ?? '',
  process.env.CROSSSEED_PORT
);
const API_KEY = process.env.CROSSSEED_API_KEY ?? '';
const TIMEOUT_MS = 5000;

export const CROSSSEED_ENABLED = Boolean(BASE_URL);

async function crossSeedFetch<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const url = new URL(`${BASE_URL}${path}`);
  if (API_KEY) url.searchParams.set('apikey', API_KEY);

  try {
    const res = await fetch(url.toString(), {
      headers: API_KEY ? { Authorization: `ApiKey ${API_KEY}` } : {},
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Cross Seed responded with ${res.status}: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export async function getCrossSeedTorrents(): Promise<CrossSeedTorrent[]> {
  if (!CROSSSEED_ENABLED) return [];

  try {
    const data = await crossSeedFetch<CrossSeedTorrent[] | { torrents: CrossSeedTorrent[] }>(
      '/api/torrents'
    );
    return Array.isArray(data) ? data : (data as { torrents: CrossSeedTorrent[] }).torrents ?? [];
  } catch {
    return [];
  }
}

export async function getCrossSeedStatus(): Promise<ServiceStatus> {
  if (!CROSSSEED_ENABLED) {
    return {
      name: 'Cross Seed',
      url: '',
      connected: false,
      error: 'Not configured (CROSSSEED_URL not set)',
    };
  }

  try {
    await crossSeedFetch<unknown>('/api/torrents');
    return { name: 'Cross Seed', url: BASE_URL, connected: true };
  } catch (err) {
    return {
      name: 'Cross Seed',
      url: BASE_URL,
      connected: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
