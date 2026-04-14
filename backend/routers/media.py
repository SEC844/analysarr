"""Routes médias."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from ..models.schemas import MediaItem, GlobalStats
from ..services.engine import engine

router = APIRouter(prefix="/media", tags=["media"])


@router.get("", response_model=list[MediaItem])
async def list_media(
    status: Optional[str] = Query(None, description="Filtrer par seed_status"),
    source: Optional[str] = Query(None, description="radarr ou sonarr"),
    media_type: Optional[str] = Query(None, description="movie ou series"),
    search: Optional[str] = Query(None, description="Recherche par titre"),
):
    """
    Liste complète des médias avec leur statut de seed.
    Utilise le cache en mémoire — toujours rapide.
    """
    items = engine.get_cache()

    if status:
        items = [i for i in items if i.seed_status.value == status]
    if source:
        items = [i for i in items if i.source.value == source]
    if media_type:
        items = [i for i in items if i.media_type.value == media_type]
    if search:
        q = search.lower()
        items = [i for i in items if q in i.title.lower()]

    return items


@router.get("/stats", response_model=GlobalStats)
async def get_stats():
    """Statistiques globales par statut."""
    return engine.get_stats()


@router.get("/{item_id}", response_model=MediaItem)
async def get_media_detail(item_id: str):
    """Détail d'un média par son ID (ex: 'radarr_123')."""
    for item in engine.get_cache():
        if item.id == item_id:
            return item
    raise HTTPException(status_code=404, detail=f"Media '{item_id}' not found")
