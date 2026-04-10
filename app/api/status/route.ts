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

  return NextResponse.json({
    radarr,
    sonarr,
    qbit,
    crossseed,
    // Expose server-side path mapping config so the Settings page can display it
    config: {
      pathMapFrom: process.env.PATH_MAP_FROM ?? '',
      pathMapTo:   process.env.PATH_MAP_TO   ?? '',
      refreshInterval: process.env.REFRESH_INTERVAL ?? '60',
    },
  });
}
