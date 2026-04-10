import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, saveConfig } from '@/lib/config';
import type { AppConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(loadConfig());
}

export async function POST(req: NextRequest) {
  const body = await req.json() as AppConfig;
  saveConfig(body);
  return NextResponse.json({ ok: true });
}
