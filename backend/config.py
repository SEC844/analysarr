"""
Lecture / écriture de /config/settings.json.
Le fichier est chargé une fois et mis en cache ; il est rechargé à chaque écriture.

Auto-détection des chemins :
  Si /data/torrents existe       → torrents = /data/torrents
  Si /data/complete existe       → torrents = /data/complete
  Si /data/downloads/complete    → torrents = /data/downloads/complete
  Si /data/cross-seed existe     → crossseed = /data/cross-seed
  Si /data/crossseed existe      → crossseed = /data/crossseed
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from .models.schemas import AppConfig, ServiceConfig, PathsConfig

# Chemin de la config — /config/settings.json par défaut (idem dans le conteneur Docker)
# Peut être surchargé via CONFIG_PATH si besoin, mais les utilisateurs n'ont pas à le faire.
CONFIG_PATH = Path(os.environ.get("CONFIG_PATH", "/config/settings.json"))

_config_cache: Optional[AppConfig] = None


def _ensure_dir() -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)


def _autodiscover_paths() -> PathsConfig:
    """
    Détecte automatiquement les chemins torrents / crossseed
    à partir du montage /data, en testant les sous-dossiers courants.
    """
    # Torrents : ordre de priorité
    torrents = "/data/torrents"
    for candidate in [
        "/data/torrents",
        "/data/complete",
        "/data/downloads/complete",
        "/data/downloads",
    ]:
        if Path(candidate).is_dir():
            torrents = candidate
            break

    # Cross-seed (optionnel)
    crossseed = "/data/cross-seed"
    for candidate in ["/data/cross-seed", "/data/crossseed"]:
        if Path(candidate).is_dir():
            crossseed = candidate
            break

    return PathsConfig(media="/media", torrents=torrents, crossseed=crossseed)


def load_config() -> AppConfig:
    global _config_cache
    if _config_cache is not None:
        return _config_cache

    if CONFIG_PATH.exists():
        try:
            raw = json.loads(CONFIG_PATH.read_text("utf-8"))
            _config_cache = AppConfig.model_validate(raw)
            return _config_cache
        except Exception:
            pass  # fall through to default

    # Pas de config sauvegardée → auto-détection
    _config_cache = AppConfig(paths=_autodiscover_paths())
    return _config_cache


def save_config(cfg: AppConfig) -> None:
    global _config_cache
    _ensure_dir()
    CONFIG_PATH.write_text(cfg.model_dump_json(indent=2), encoding="utf-8")
    _config_cache = cfg


def invalidate_cache() -> None:
    global _config_cache
    _config_cache = None


def merge_credentials(stored: AppConfig, incoming: AppConfig) -> AppConfig:
    """
    Fusionne la config stockée avec la config entrante.
    Règle : si un champ credential (api_key / username / password) est vide
    dans `incoming`, on conserve la valeur stockée.
    Utilisé pour le PUT /api/config et le test de connexion live.
    """
    def _merge_svc(s: ServiceConfig, i: ServiceConfig) -> ServiceConfig:
        return ServiceConfig(
            url=i.url,
            api_key=i.api_key  if i.api_key  else s.api_key,
            username=i.username if i.username else s.username,
            password=i.password if i.password else s.password,
            enabled=i.enabled,
        )

    return AppConfig(
        radarr=_merge_svc(stored.radarr, incoming.radarr),
        sonarr=_merge_svc(stored.sonarr, incoming.sonarr),
        qbittorrent=_merge_svc(stored.qbittorrent, incoming.qbittorrent),
        crossseed=_merge_svc(stored.crossseed, incoming.crossseed),
        paths=incoming.paths,
    )
