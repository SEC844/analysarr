import type { CrossSeedTorrent, ServiceStatus } from './types';
import { buildServiceUrl } from './utils';

// CROSSSEED_PORT is optional — overrides the port in CROSSSEED_URL if set
const BASE_URL = buildServiceUrl(
  process.env.CROSSSEED_URL ?? '',
  process.env.CROSSSEED_PORT
);
// Cross Seed API key — generated with: cross-seed api-key
const API_KEY = (process.env.CROSSSEED_API_KEY ?? '').trim();
const TIMEOUT_MS = 5000;

export const CROSSSEED_ENABLED = Boolean(BASE_URL);

function authHeaders(): Record<string, string> {
  if (!API_KEY) return {};
  // Cross Seed v5+ accepts both Bearer token and apikey query param
  return { Authorization: `Bearer ${API_KEY}` };
}

async function crossSeedFetch<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const url = new URL(`${BASE_URL}${path}`);
  // Also pass as query param for compatibility with older versions
  if (API_KEY) url.searchParams.set('apikey', API_KEY);

  try {
    const res = await fetch(url.toString(), {
      headers: authHeaders(),
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
    // Cross Seed is optional — fail silently
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Try /api/torrents with auth first; fall back to root connectivity check.
    // Cross Seed v5 uses Bearer token auth, older versions use apikey query param.
    const url = new URL(`${BASE_URL}/api/torrents`);
    if (API_KEY) url.searchParams.set('apikey', API_KEY);

    const res = await fetch(url.toString(), {
      headers: authHeaders(),
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);

    if (res.ok) {
      return { name: 'Cross Seed', url: BASE_URL, connected: true };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        name: 'Cross Seed',
        url: BASE_URL,
        connected: false,
        error: `Auth failed (${res.status}) — check CROSSSEED_API_KEY (run: cross-seed api-key)`,
      };
    }

    // 404 or other — server is reachable but endpoint unknown; still "connected"
    return {
      name: 'Cross Seed',
      url: BASE_URL,
      connected: true,
      version: `reachable (HTTP ${res.status})`,
    };
  } catch (err) {
    return {
      name: 'Cross Seed',
      url: BASE_URL,
      connected: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
