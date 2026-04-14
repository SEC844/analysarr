"""Routes torrents qBittorrent."""
from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, Query

from ..config import load_config
from ..models.schemas import QbitTorrent, UnmatchedTorrent
from ..services.qbittorrent import QBittorrentClient
from ..services.engine import engine
from ..services.identifier import resolve_imdb_from_torrent
from ..services.radarr import RadarrClient
from ..services.sonarr import SonarrClient

router = APIRouter(prefix="/torrents", tags=["torrents"])


@router.get("", response_model=list[QbitTorrent])
async def list_torrents():
    """Liste tous les torrents qBittorrent."""
    cfg = load_config()
    if not cfg.qbittorrent.url:
        return []
    client = QBittorrentClient(cfg.qbittorrent.url, cfg.qbittorrent.username, cfg.qbittorrent.password)
    try:
        return await client.get_torrents()
    except Exception:
        return []


@router.get("/unmatched", response_model=list[UnmatchedTorrent])
async def unmatched_torrents():
    """
    Torrents qBit non associés à aucun média Radarr/Sonarr.
    Tente une résolution IMDB via parse-torrent-name + lookup API.
    """
    cfg = load_config()
    if not cfg.qbittorrent.url:
        return []

    # Récupérer tous les torrents
    qbit = QBittorrentClient(cfg.qbittorrent.url, cfg.qbittorrent.username, cfg.qbittorrent.password)
    try:
        all_torrents = await qbit.get_torrents()
    except Exception:
        return []

    # Hashes déjà matchés (présents dans le cache)
    matched_hashes: set[str] = set()
    for item in engine.get_cache():
        for t in item.matched_torrents:
            matched_hashes.add(t.hash.lower())

    unmatched = [t for t in all_torrents if t.hash.lower() not in matched_hashes]

    # Résoudre IMDB en parallèle (par batch de 10)
    radarr_client = RadarrClient(cfg.radarr.url, cfg.radarr.api_key) if cfg.radarr.url else None
    sonarr_client = SonarrClient(cfg.sonarr.url, cfg.sonarr.api_key) if cfg.sonarr.url else None

    results: list[UnmatchedTorrent] = []

    async def resolve_one(torrent: QbitTorrent) -> UnmatchedTorrent:
        imdb_id, guessed_title, guessed_year = await resolve_imdb_from_torrent(
            torrent.name, radarr_client, sonarr_client
        )
        return UnmatchedTorrent(
            torrent=torrent,
            guessed_title=guessed_title,
            guessed_year=guessed_year,
            imdb_id=imdb_id,
        )

    # Traiter par batches pour éviter de surcharger les APIs
    batch_size = 10
    for i in range(0, len(unmatched), batch_size):
        batch = unmatched[i:i + batch_size]
        batch_results = await asyncio.gather(*[resolve_one(t) for t in batch])
        results.extend(batch_results)

    return results


@router.get("/poster/{source}/{media_id}")
async def get_poster(source: str, media_id: int):
    """Proxy poster depuis Radarr ou Sonarr."""
    from fastapi.responses import Response
    import httpx

    cfg = load_config()

    if source == "radarr" and cfg.radarr.url:
        url = f"{cfg.radarr.url.rstrip('/')}/api/v3/mediacover/{media_id}/poster.jpg"
        headers = {"X-Api-Key": cfg.radarr.api_key}
    elif source == "sonarr" and cfg.sonarr.url:
        url = f"{cfg.sonarr.url.rstrip('/')}/api/v3/mediacover/{media_id}/poster.jpg"
        headers = {"X-Api-Key": cfg.sonarr.api_key}
    else:
        return Response(status_code=404)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return Response(status_code=404)
            return Response(
                content=resp.content,
                media_type=resp.headers.get("content-type", "image/jpeg"),
                headers={"Cache-Control": "public, max-age=86400"},
            )
    except Exception:
        return Response(status_code=502)
