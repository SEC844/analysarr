import { NextResponse } from 'next/server';
import { getSonarrSeries } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const series = await getSonarrSeries();
    return NextResponse.json(series);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Sonarr data';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
