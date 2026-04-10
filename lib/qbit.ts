import type { QbitTorrent, ServiceStatus } from './types';
import { buildServiceUrl } from './utils';
import { loadConfig } from './config';

const TIMEOUT_MS = 5000;

/** Read qBit config at call time — prefers UI config, falls back to env vars. */
function getConfig() {
  const saved = loadConfig().services?.qbit ?? {};
  return {
    url: saved.url?.trim() || buildServiceUrl(process.env.QBIT_URL ?? '', process.env.QBIT_PORT),
    username: saved.username?.trim() || (process.env.QBIT_USERNAME ?? 'admin').trim(),
    password: saved.password?.trim() || (process.env.QBIT_PASSWORD ?? '').trim(),
  };
}

// Session keyed by url+username so config changes auto-invalidate
interface Session { cookie: string; url: string; username: string }
let _session: Session | null = null;

async function qbitLogin(cfg: ReturnType<typeof getConfig>): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const body = new URLSearchParams({ username: cfg.username, password: cfg.password });
    const res = await fetch(`${cfg.url}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body, signal: controller.signal,
    });
    const text = await res.text();
    if (text !== 'Ok.') throw new Error('qBittorrent login failed — check credentials');
    const cookie = res.headers.get('set-cookie');
    if (!cookie) throw new Error('qBittorrent login: no session cookie returned');
    return cookie.split(';')[0];
  } finally {
    clearTimeout(timer);
  }
}

async function qbitFetch<T>(path: string): Promise<T> {
  const cfg = getConfig();

  // Invalidate session if URL or username changed
  if (_session && (_session.url !== cfg.url || _session.username !== cfg.username)) {
    _session = null;
  }

  if (!_session) {
    const cookie = await qbitLogin(cfg);
    _session = { cookie, url: cfg.url, username: cfg.username };
  }

  const doFetch = async (cookie: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(`${cfg.url}/api/v2${path}`, {
        headers: { Cookie: cookie }, signal: controller.signal, cache: 'no-store',
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await doFetch(_session.cookie);

  // Session expired — re-login once
  if (res.status === 403) {
    _session = null;
    const newCookie = await qbitLogin(cfg);
    _session = { cookie: newCookie, url: cfg.url, username: cfg.username };
    res = await doFetch(newCookie);
  }

  if (!res.ok) throw new Error(`qBittorrent responded with ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getQbitTorrents(): Promise<QbitTorrent[]> {
  return qbitFetch<QbitTorrent[]>('/torrents/info');
}

export async function getQbitStatus(): Promise<ServiceStatus> {
  const { url } = getConfig();
  if (!url) return { name: 'qBittorrent', url: '', connected: false, error: 'URL not configured' };
  try {
    const data = await qbitFetch<{ version: string }>('/app/buildInfo');
    return { name: 'qBittorrent', url, connected: true, version: data.version };
  } catch (err) {
    _session = null;
    return { name: 'qBittorrent', url, connected: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
