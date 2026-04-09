import { type NextRequest, NextResponse } from 'next/server';
import { getRadarrPoster } from '@/lib/radarr';
import { getSonarrPoster } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

// GET /api/poster/radarr/[id]
// GET /api/poster/sonarr/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const [service, idStr] = params.slug;
  const id = parseInt(idStr, 10);

  if (!service || isNaN(id)) {
    return new NextResponse('Bad request', { status: 400 });
  }

  try {
    let upstream: Response;

    if (service === 'radarr') {
      upstream = await getRadarrPoster(id);
    } else if (service === 'sonarr') {
      upstream = await getSonarrPoster(id);
    } else {
      return new NextResponse('Unknown service', { status: 400 });
    }

    if (!upstream.ok) {
      return new NextResponse('Poster not found', { status: 404 });
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new NextResponse('Failed to proxy poster', { status: 502 });
  }
}
