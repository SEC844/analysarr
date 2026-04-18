"""Routes cross-seed (déclenchement d'une recherche)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..config import load_config
from ..services.crossseed import CrossSeedClient

router = APIRouter(prefix="/crossseed", tags=["crossseed"])


@router.post("/trigger/{torrent_hash}")
async def trigger_crossseed(torrent_hash: str):
    """
    Déclenche une recherche cross-seed pour un torrent spécifique.

    Appelle POST /api/webhook du daemon cross-seed avec infoHash=<torrent_hash>.
    Renvoie { success: bool, status: int, message: str }.
    """
    cfg = load_config()
    if not cfg.crossseed.enabled or not cfg.crossseed.url:
        raise HTTPException(status_code=400, detail="Cross-seed non configuré")

    if not torrent_hash or len(torrent_hash) < 8:
        raise HTTPException(status_code=400, detail="Hash de torrent invalide")

    client = CrossSeedClient(cfg.crossseed.url, cfg.crossseed.api_key)
    return await client.trigger_search(torrent_hash)
