import { NextResponse } from 'next/server';
import { getRadarrStatus } from '@/lib/radarr';
import { getSonarrStatus } from '@/lib/sonarr';
import { getQbitStatus } from '@/lib/qbit';
import { getCrossSeedStatus } from '@/lib/crossseed';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [radarr, sonarr, qbit, crossseed] = await Promise.all([
    getRadarrStatus(),
    getSonarrStatus(),
    getQbitStatus(),
    getCrossSeedStatus(),
  ]);

  return NextResponse.json({ radarr, sonarr, qbit, crossseed });
}
