import { NextResponse } from 'next/server';
import { getCachedDashboard } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await getCachedDashboard();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Dashboard fetch failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
