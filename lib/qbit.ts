import type { QbitTorrent, ServiceStatus } from './types';
import { buildServiceUrl } from './utils';

// QBIT_PORT is optional — overrides the port in QBIT_URL if set
const BASE_URL = buildServiceUrl(
  process.env.QBIT_URL ?? '',
  process.env.QBIT_PORT
);
const USERNAME = (process.env.QBIT_USERNAME ?? 'admin').trim();
const PASSWORD = (process.env.QBIT_PASSWORD ?? '').trim();
const TIMEOUT_MS = 5000;

let _cookie: string | null = null;

async function qbitLogin(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = new URLSearchParams({ username: USERNAME, password: PASSWORD });
    const res = await fetch(`${BASE_URL}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });

    const text = await res.text();
    if (text !== 'Ok.') {
      throw new Error('qBittorrent login failed — check credentials');
    }

    const cookie = res.headers.get('set-cookie');
    if (!cookie) throw new Error('qBittorrent login: no session cookie returned');
    return cookie.split(';')[0];
  } finally {
    clearTimeout(timer);
  }
}

async function qbitFetch<T>(path: string): Promise<T> {
  if (!_cookie) {
    _cookie = await qbitLogin();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/api/v2${path}`, {
      headers: { Cookie: _cookie },
      signal: controller.signal,
      cache: 'no-store',
    });

    // Session expired — retry once
    if (res.status === 403) {
      _cookie = await qbitLogin();
      const retry = await fetch(`${BASE_URL}/api/v2${path}`, {
        headers: { Cookie: _cookie },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!retry.ok) throw new Error(`qBittorrent: ${retry.status}`);
      return retry.json() as Promise<T>;
    }

    if (!res.ok) {
      throw new Error(`qBittorrent responded with ${res.status}`);
    }

    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export async function getQbitTorrents(): Promise<QbitTorrent[]> {
  return qbitFetch<QbitTorrent[]>('/torrents/info');
}

export async function getQbitStatus(): Promise<ServiceStatus> {
  if (!BASE_URL) {
    return { name: 'qBittorrent', url: BASE_URL, connected: false, error: 'URL not configured' };
  }

  try {
    // /app/buildInfo returns proper JSON (unlike /app/version which returns plain text)
    const data = await qbitFetch<{ version: string }>('/app/buildInfo');
    return {
      name: 'qBittorrent',
      url: BASE_URL,
      connected: true,
      version: data.version,
    };
  } catch (err) {
    _cookie = null;
    return {
      name: 'qBittorrent',
      url: BASE_URL,
      connected: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
