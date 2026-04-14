"""Routes de configuration."""
from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import load_config, save_config, invalidate_cache
from ..models.schemas import (
    AppConfig, AppConfigPublic, ServiceConfigPublic,
    ConnectionTestResult, PathsConfig,
)
from ..services.radarr import RadarrClient
from ..services.sonarr import SonarrClient
from ..services.qbittorrent import QBittorrentClient
from ..services.crossseed import CrossSeedClient

router = APIRouter(prefix="/config", tags=["config"])


def _public(cfg: AppConfig) -> AppConfigPublic:
    """Retourne la config sans credentials."""
    return AppConfigPublic(
        radarr=ServiceConfigPublic(url=cfg.radarr.url, enabled=cfg.radarr.enabled),
        sonarr=ServiceConfigPublic(url=cfg.sonarr.url, enabled=cfg.sonarr.enabled),
        qbittorrent=ServiceConfigPublic(url=cfg.qbittorrent.url, enabled=cfg.qbittorrent.enabled),
        crossseed=ServiceConfigPublic(url=cfg.crossseed.url, enabled=cfg.crossseed.enabled),
        paths=cfg.paths,
    )


@router.get("", response_model=AppConfigPublic)
async def get_config():
    """Retourne la config publique (sans credentials)."""
    return _public(load_config())


@router.get("/full")
async def get_config_full():
    """
    Retourne la config complète AVEC credentials.
    À n'utiliser que depuis la page Settings du frontend.
    """
    cfg = load_config()
    return cfg.model_dump()


@router.put("", response_model=AppConfigPublic)
async def update_config(body: AppConfig):
    """Sauvegarde la config complète."""
    save_config(body)
    return _public(body)


@router.post("/test/{service}", response_model=ConnectionTestResult)
async def test_connection(service: str, body: Optional[AppConfig] = None):
    """
    Teste la connexion à un service.
    Si `body` est fourni, utilise les credentials live (non sauvegardés).
    Sinon, utilise la config sauvegardée.
    """
    cfg = body if body is not None else load_config()

    match service:
        case "radarr":
            if not cfg.radarr.url:
                return ConnectionTestResult(service="radarr", success=False, message="URL non configurée")
            client = RadarrClient(cfg.radarr.url, cfg.radarr.api_key)
            return await client.test_connection()

        case "sonarr":
            if not cfg.sonarr.url:
                return ConnectionTestResult(service="sonarr", success=False, message="URL non configurée")
            client = SonarrClient(cfg.sonarr.url, cfg.sonarr.api_key)
            return await client.test_connection()

        case "qbittorrent":
            if not cfg.qbittorrent.url:
                return ConnectionTestResult(service="qbittorrent", success=False, message="URL non configurée")
            client = QBittorrentClient(cfg.qbittorrent.url, cfg.qbittorrent.username, cfg.qbittorrent.password)
            return await client.test_connection()

        case "crossseed":
            if not cfg.crossseed.url:
                return ConnectionTestResult(service="crossseed", success=False, message="URL non configurée")
            client = CrossSeedClient(cfg.crossseed.url, cfg.crossseed.api_key)
            return await client.test_connection()

        case _:
            raise HTTPException(status_code=400, detail=f"Service inconnu : {service}")


@router.get("/browse")
async def browse_directory(path: str = "/"):
    """
    Liste les répertoires disponibles dans le conteneur.
    Utilisé par le frontend pour l'explorateur de chemins.
    """
    try:
        entries = []
        with os.scandir(path) as it:
            for entry in it:
                if entry.is_dir(follow_symlinks=False):
                    entries.append({"name": entry.name, "path": entry.path})
        entries.sort(key=lambda e: e["name"])
        return {"path": path, "dirs": entries}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Directory not found")
