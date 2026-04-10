import type { ServiceStatus } from './types';
import { buildServiceUrl } from './utils';

// CROSSSEED_PORT is optional — overrides the port in CROSSSEED_URL if set
const BASE_URL = buildServiceUrl(
  process.env.CROSSSEED_URL ?? '',
  process.env.CROSSSEED_PORT
);
const API_KEY = (process.env.CROSSSEED_API_KEY ?? '').trim();
const TIMEOUT_MS = 5000;

export const CROSSSEED_ENABLED = Boolean(BASE_URL);

/**
 * Cross Seed API auth:
 * - Header: X-Api-Key  (NOT Authorization: Bearer)
 * - Query param: ?apikey=KEY  (for older versions)
 */
function authHeaders(): Record<string, string> {
  if (!API_KEY) return {};
  return { 'X-Api-Key': API_KEY };
}

async function crossSeedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const url = new URL(`${BASE_URL}${path}`);
  if (API_KEY) url.searchParams.set('apikey', API_KEY);

  try {
    return await fetch(url.toString(), {
      ...options,
      headers: { ...authHeaders(), ...(options.headers as Record<string, string> ?? {}) },
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function getCrossSeedStatus(): Promise<ServiceStatus> {
  if (!CROSSSEED_ENABLED) {
    return {
      name: 'Cross Seed',
      url: '',
      connected: false,
      error: 'Non configuré (CROSSSEED_URL absent)',
    };
  }

  try {
    // Step 1 — connectivity: GET /api/ping (no auth required)
    const ping = await crossSeedFetch('/api/ping');
    if (!ping.ok && ping.status !== 200) {
      return {
        name: 'Cross Seed',
        url: BASE_URL,
        connected: false,
        error: `Serveur injoignable (HTTP ${ping.status})`,
      };
    }

    // Step 2 — auth check: GET /api/status (requires X-Api-Key)
    const status = await crossSeedFetch('/api/status');

    if (status.ok) {
      // Try to read version from /api/indexer/v1/status
      try {
        const indexer = await crossSeedFetch('/api/indexer/v1/status');
        if (indexer.ok) {
          const data = await indexer.json() as { version?: string; appName?: string };
          return {
            name: 'Cross Seed',
            url: BASE_URL,
            connected: true,
            version: data.version ?? undefined,
          };
        }
      } catch { /* ignore — version is optional */ }
      return { name: 'Cross Seed', url: BASE_URL, connected: true };
    }

    if (status.status === 401 || status.status === 403) {
      return {
        name: 'Cross Seed',
        url: BASE_URL,
        connected: false,
        error: `Clé API invalide (HTTP ${status.status}) — vérifiez CROSSSEED_API_KEY (cross-seed api-key)`,
      };
    }

    return {
      name: 'Cross Seed',
      url: BASE_URL,
      connected: false,
      error: `Réponse inattendue HTTP ${status.status} sur /api/status`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    const hint = msg.includes('abort') ? 'Timeout — serveur injoignable ou trop lent' : msg;
    return { name: 'Cross Seed', url: BASE_URL, connected: false, error: hint };
  }
}
