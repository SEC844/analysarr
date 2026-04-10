import { NextResponse } from 'next/server';
import { refreshCache, getCacheStatus } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function POST() {
  await refreshCache();
  return NextResponse.json({ ok: true, ...getCacheStatus() });
}

export async function GET() {
  return NextResponse.json(getCacheStatus());
}
