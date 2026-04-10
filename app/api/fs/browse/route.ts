import { NextRequest, NextResponse } from 'next/server';
import { readdirSync } from 'fs';
import { normalize, join } from 'path';

export const dynamic = 'force-dynamic';

// Only allow browsing under /data and /media for security
const ALLOWED_ROOTS = ['/data', '/media'];

function isAllowed(p: string): boolean {
  const n = normalize(p).replace(/\\/g, '/');
  return ALLOWED_ROOTS.some(r => n === r || n.startsWith(r + '/'));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rawPath = url.searchParams.get('path') ?? '/data';
  const safePath = normalize(rawPath).replace(/\\/g, '/');

  if (!isAllowed(safePath)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const entries = readdirSync(safePath, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => join(safePath, e.name).replace(/\\/g, '/'))
      .sort();

    const parts = safePath.split('/').filter(Boolean);
    const parent = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : null;

    return NextResponse.json({ path: safePath, dirs, parent });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
