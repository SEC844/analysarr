"""Routes de configuration."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException

from ..config import load_config, save_config, merge_credentials, _autodiscover_paths
from ..models.schemas import (
    AppConfig, AppConfigPublic, ServiceConfigPublic,
    ConnectionTestResult, PathsConfig,
)
from ..services.radarr import RadarrClient
from ..services.sonarr import SonarrClient
from ..services.qbittorrent import QBittorrentClient
from ..services.crossseed import CrossSeedClient

router = APIRouter(prefix="/config", tags=["config"])


def _to_public(cfg: AppConfig) -> AppConfigPublic:
    """Retourne la config SANS aucun credential (api_key, password, username)."""
    return AppConfigPublic(
        radarr=ServiceConfigPublic(
            url=cfg.radarr.url,
            enabled=cfg.radarr.enabled,
            has_credentials=bool(cfg.radarr.api_key),
        ),
        sonarr=ServiceConfigPublic(
            url=cfg.sonarr.url,
            enabled=cfg.sonarr.enabled,
            has_credentials=bool(cfg.sonarr.api_key),
        ),
        qbittorrent=ServiceConfigPublic(
            url=cfg.qbittorrent.url,
            enabled=cfg.qbittorrent.enabled,
            has_credentials=bool(cfg.qbittorrent.username or cfg.qbittorrent.password),
        ),
        crossseed=ServiceConfigPublic(
            url=cfg.crossseed.url,
            enabled=cfg.crossseed.enabled,
            has_credentials=bool(cfg.crossseed.api_key),
        ),
        paths=cfg.paths,
    )


# ── GET /api/config ─────────────────────────────────────────────────────────

@router.get("", response_model=AppConfigPublic)
async def get_config():
    """
    Retourne la config publique.
    Les credentials (api_key, password…) ne sont JAMAIS renvoyés.
    Le frontend affiche `has_credentials=true` comme indicateur qu'ils sont configurés.
    """
    return _to_public(load_config())


# ── PUT /api/config ─────────────────────────────────────────────────────────

@router.put("", response_model=AppConfigPublic)
async def update_config(body: AppConfig):
    """
    Sauvegarde la config.
    Règle : si un champ credential est vide dans le body, on conserve la valeur stockée.
    Cela permet au frontend d'envoyer uniquement les champs modifiés.
    """
    stored = load_config()
    merged = merge_credentials(stored, body)
    save_config(merged)
    return _to_public(merged)


# ── POST /api/config/test/{service} ────────────────────────────────────────

@router.post("/test/{service}", response_model=ConnectionTestResult)
async def test_connection(service: str, body: Optional[AppConfig] = None):
    """
    Teste la connexion à un service avec les valeurs live du formulaire.
    Si `body` est fourni, fusionne avec la config stockée (credentials vides → stockés).
    """
    stored = load_config()
    cfg = merge_credentials(stored, body) if body is not None else stored

    match service:
        case "radarr":
            if not cfg.radarr.url:
                return ConnectionTestResult(service="radarr", success=False, message="URL non configurée")
            return await RadarrClient(cfg.radarr.url, cfg.radarr.api_key).test_connection()

        case "sonarr":
            if not cfg.sonarr.url:
                return ConnectionTestResult(service="sonarr", success=False, message="URL non configurée")
            return await SonarrClient(cfg.sonarr.url, cfg.sonarr.api_key).test_connection()

        case "qbittorrent":
            if not cfg.qbittorrent.url:
                return ConnectionTestResult(service="qbittorrent", success=False, message="URL non configurée")
            return await QBittorrentClient(
                cfg.qbittorrent.url, cfg.qbittorrent.username, cfg.qbittorrent.password
            ).test_connection()

        case "crossseed":
            if not cfg.crossseed.url:
                return ConnectionTestResult(service="crossseed", success=False, message="URL non configurée")
            return await CrossSeedClient(cfg.crossseed.url, cfg.crossseed.api_key).test_connection()

        case _:
            raise HTTPException(status_code=400, detail=f"Service inconnu : {service}")


# ── GET /api/config/detect-paths ───────────────────────────────────────────

@router.get("/detect-paths", response_model=PathsConfig)
async def detect_paths():
    """
    Détecte automatiquement les chemins media/torrents/cross-seed dans le conteneur.
    Retourne les chemins suggérés sans modifier la config.
    """
    return _autodiscover_paths()


# ── GET /api/config/browse ─────────────────────────────────────────────────

@router.get("/browse")
async def browse_directory(path: str = "/"):
    """Liste les répertoires disponibles — utilisé par l'explorateur de chemins."""
    try:
        entries = []
        with os.scandir(path) as it:
            for entry in it:
                if entry.is_dir(follow_symlinks=False):
                    entries.append({"name": entry.name, "path": entry.path})
        entries.sort(key=lambda e: e["name"])
        return {"path": path, "dirs": entries}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission refusée")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
