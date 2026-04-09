import { NextResponse } from 'next/server';
import { getQbitTorrents } from '@/lib/qbit';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const torrents = await getQbitTorrents();
    return NextResponse.json(torrents);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch qBittorrent data';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
