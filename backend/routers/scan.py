"""Routes de scan."""
from __future__ import annotations

from fastapi import APIRouter

from ..models.schemas import ScanStatus
from ..services.engine import engine

router = APIRouter(prefix="/scan", tags=["scan"])


@router.get("/status", response_model=ScanStatus)
async def scan_status():
    """Statut du dernier scan (en cours, progression, timestamp)."""
    return engine.get_status()


@router.post("/trigger")
async def trigger_scan():
    """Déclenche un scan manuel (non-bloquant)."""
    await engine.trigger_scan()
    return {"message": "Scan triggered"}


@router.post("/run")
async def run_scan_and_wait():
    """Déclenche un scan et attend sa fin. Retourne les résultats."""
    items = await engine.scan_and_wait()
    return {"message": f"Scan complete — {len(items)} items"}
