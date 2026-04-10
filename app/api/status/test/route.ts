import { NextRequest, NextResponse } from 'next/server';
import { normalizeUrl } from '@/lib/utils';
import type { ServiceStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 5000;

async function testFetch(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ServiceStatus>> {
  const body = await req.json() as {
    service: 'radarr' | 'sonarr' | 'qbit' | 'crossseed';
    url?: string;
    apiKey?: string;
    username?: string;
    password?: string;
  };

  const base = normalizeUrl(body.url ?? '');
  if (!base) {
    return NextResponse.json({ name: body.service, url: '', connected: false, error: 'URL is required' });
  }

  try {
    if (body.service === 'radarr' || body.service === 'sonarr') {
      const prefix = body.service === 'radarr' ? 'Radarr' : 'Sonarr';
      if (!body.apiKey?.trim()) {
        return NextResponse.json({ name: prefix, url: base, connected: false, error: 'API key is required' });
      }
      const res = await testFetch(`${base}/api/v3/system/status`, {
        headers: { 'X-Api-Key': body.apiKey.trim() },
      });
      if (res.status === 401) return NextResponse.json({ name: prefix, url: base, connected: false, error: 'Invalid API key (HTTP 401)' });
      if (!res.ok) return NextResponse.json({ name: prefix, url: base, connected: false, error: `HTTP ${res.status}` });
      const data = await res.json() as { version?: string };
      return NextResponse.json({ name: prefix, url: base, connected: true, version: data.version });
    }

    if (body.service === 'qbit') {
      const formBody = new URLSearchParams({ username: body.username ?? 'admin', password: body.password ?? '' });
      const res = await testFetch(`${base}/api/v2/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
      });
      const text = await res.text();
      if (text !== 'Ok.') return NextResponse.json({ name: 'qBittorrent', url: base, connected: false, error: 'Login failed — check credentials' });
      return NextResponse.json({ name: 'qBittorrent', url: base, connected: true });
    }

    if (body.service === 'crossseed') {
      const ping = await testFetch(`${base}/api/ping`, {});
      if (!ping.ok) return NextResponse.json({ name: 'Cross Seed', url: base, connected: false, error: `Cannot reach server (HTTP ${ping.status})` });
      if (!body.apiKey?.trim()) {
        return NextResponse.json({ name: 'Cross Seed', url: base, connected: true });
      }
      const status = await testFetch(`${base}/api/status?apikey=${body.apiKey.trim()}`, {
        headers: { 'X-Api-Key': body.apiKey.trim() },
      });
      if (status.status === 401 || status.status === 403) {
        return NextResponse.json({ name: 'Cross Seed', url: base, connected: false, error: `Invalid API key (HTTP ${status.status})` });
      }
      return NextResponse.json({ name: 'Cross Seed', url: base, connected: true });
    }

    return NextResponse.json({ name: body.service, url: base, connected: false, error: 'Unknown service' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const hint = msg.includes('abort') ? 'Timeout — server unreachable' : msg;
    return NextResponse.json({ name: body.service, url: base, connected: false, error: hint });
  }
}
