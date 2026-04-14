"""Routes torrents qBittorrent."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..config import load_config
from ..models.schemas import QbitTorrent, UnmatchedTorrent, MapRequest
from ..services.qbittorrent import QBittorrentClient
from ..services.engine import engine

router = APIRouter(prefix="/torrents", tags=["torrents"])


@router.get("", response_model=list[QbitTorrent])
async def list_torrents():
    """
    Liste tous les torrents qBittorrent.
    Retourne depuis le cache de l'engine (rafraîchi toutes les 30 s).
    Si le cache est vide, fait un appel live et met à jour le cache.
    """
    cached = engine.get_torrents()
    if cached:
        return cached

    # Cache vide (premier appel avant le scan) → fetch live
    cfg = load_config()
    if not cfg.qbittorrent.url:
        return []
    client = QBittorrentClient(cfg.qbittorrent.url, cfg.qbittorrent.username, cfg.qbittorrent.password)
    try:
        torrents = await client.get_torrents()
        engine._qbit_torrents = torrents
        engine._qbit_cache_ts = __import__('time').time()
        return torrents
    except Exception:
        return []


@router.get("/unmatched", response_model=list[UnmatchedTorrent])
async def unmatched_torrents():
    """
    Torrents qBit non associés à aucun média Radarr/Sonarr.
    Retourne depuis le cache (résolution faite lors du scan).
    """
    return engine.get_unmatched()


@router.get("/media-list")
async def media_list():
    """Liste simplifiée de tous les médias (pour le mapping manuel)."""
    return engine.get_media_list()


@router.post("/{torrent_hash}/map")
async def map_torrent(torrent_hash: str, body: MapRequest):
    """Associe manuellement un torrent à un média Radarr/Sonarr."""
    engine.set_manual_mapping(torrent_hash, body.media_id)
    return {"message": "Associé", "hash": torrent_hash, "media_id": body.media_id}


@router.delete("/{torrent_hash}/map")
async def unmap_torrent(torrent_hash: str):
    """Supprime l'association manuelle d'un torrent."""
    engine.remove_manual_mapping(torrent_hash)
    return {"message": "Association supprimée", "hash": torrent_hash}


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
