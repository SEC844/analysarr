import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, saveConfig } from '@/lib/config';
import { restartBackgroundRefresh } from '@/lib/cache';
import type { AppConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cfg = loadConfig();
  // Never expose raw credentials — mask apiKey / password in the response
  return NextResponse.json({
    pathMappings: cfg.pathMappings,
    refreshInterval: cfg.refreshInterval,
    services: {
      radarr:    { url: cfg.services?.radarr?.url    ?? '', configured: Boolean(cfg.services?.radarr?.apiKey    || process.env.RADARR_API_KEY) },
      sonarr:    { url: cfg.services?.sonarr?.url    ?? '', configured: Boolean(cfg.services?.sonarr?.apiKey    || process.env.SONARR_API_KEY) },
      qbit:      { url: cfg.services?.qbit?.url      ?? '', username: cfg.services?.qbit?.username ?? '', configured: Boolean(cfg.services?.qbit?.password || process.env.QBIT_PASSWORD) },
      crossseed: { url: cfg.services?.crossseed?.url ?? '', configured: Boolean(cfg.services?.crossseed?.apiKey || process.env.CROSSSEED_API_KEY) },
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Partial<AppConfig>;
  const current = loadConfig();

  const updated: AppConfig = {
    pathMappings:    body.pathMappings    ?? current.pathMappings,
    manualLinks:     body.manualLinks     ?? current.manualLinks,
    refreshInterval: body.refreshInterval ?? current.refreshInterval,
    services: {
      radarr:    { ...current.services?.radarr,    ...body.services?.radarr    },
      sonarr:    { ...current.services?.sonarr,    ...body.services?.sonarr    },
      qbit:      { ...current.services?.qbit,      ...body.services?.qbit      },
      crossseed: { ...current.services?.crossseed, ...body.services?.crossseed },
    },
  };

  saveConfig(updated);
  restartBackgroundRefresh();

  return NextResponse.json({ ok: true });
}
