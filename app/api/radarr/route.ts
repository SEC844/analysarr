import { NextResponse } from 'next/server';
import { getRadarrMovies } from '@/lib/radarr';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const movies = await getRadarrMovies();
    return NextResponse.json(movies);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Radarr data';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
