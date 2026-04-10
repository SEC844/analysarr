import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, saveConfig } from '@/lib/config';
import type { PathMapping } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cfg = loadConfig();
  return NextResponse.json({ pathMappings: cfg.pathMappings });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { pathMappings: PathMapping[] };
  const current = loadConfig();
  saveConfig({ ...current, pathMappings: body.pathMappings });
  return NextResponse.json({ ok: true });
}
