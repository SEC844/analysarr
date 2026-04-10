import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, saveConfig } from '@/lib/config';
import type { ManualLink } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(loadConfig().manualLinks ?? []);
}

export async function POST(req: NextRequest) {
  const link = await req.json() as ManualLink;
  const cfg = loadConfig();
  const links = cfg.manualLinks ?? [];
  // Replace existing link for same hash, or add new
  const filtered = links.filter(l => l.torrentHash.toLowerCase() !== link.torrentHash.toLowerCase());
  saveConfig({ ...cfg, manualLinks: [...filtered, link] });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { hash } = await req.json() as { hash: string };
  const cfg = loadConfig();
  saveConfig({ ...cfg, manualLinks: (cfg.manualLinks ?? []).filter(l => l.torrentHash.toLowerCase() !== hash.toLowerCase()) });
  return NextResponse.json({ ok: true });
}
