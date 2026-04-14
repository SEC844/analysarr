from __future__ import annotations
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────────────────────

class SeedStatus(str, Enum):
    SEED_OK           = "seed_ok"            # En seed + hardlink + cross-seed actif
    SEED_NO_CS        = "seed_no_cs"         # En seed + hardlink + pas de cross-seed
    SEED_NOT_HARDLINK = "seed_not_hardlink"  # En seed mais copie physique
    SEED_DUPLICATE    = "seed_duplicate"     # Doublon détecté dans /torrents
    NOT_SEEDING       = "not_seeding"        # Absent de qBittorrent actif


class MediaSource(str, Enum):
    RADARR = "radarr"
    SONARR = "sonarr"


class MediaType(str, Enum):
    MOVIE  = "movie"
    SERIES = "series"


# ── Filesystem ────────────────────────────────────────────────────────────────

class FileMetadata(BaseModel):
    path:   str
    size:   int   = 0
    inode:  int   = 0
    nlink:  int   = 0
    exists: bool  = False


# ── Config ────────────────────────────────────────────────────────────────────

class ServiceConfig(BaseModel):
    url:      str = ""
    api_key:  str = ""
    username: str = ""
    password: str = ""
    enabled:  bool = True


class PathsConfig(BaseModel):
    media:     str = "/media"
    torrents:  str = "/data/torrents"
    crossseed: str = "/data/cross-seed"


class AppConfig(BaseModel):
    radarr:       ServiceConfig = Field(default_factory=ServiceConfig)
    sonarr:       ServiceConfig = Field(default_factory=ServiceConfig)
    qbittorrent:  ServiceConfig = Field(default_factory=ServiceConfig)
    crossseed:    ServiceConfig = Field(default_factory=lambda: ServiceConfig(enabled=False))
    paths:        PathsConfig   = Field(default_factory=PathsConfig)


class AppConfigPublic(BaseModel):
    """Config safe à renvoyer au frontend (credentials masqués)."""
    radarr:       ServiceConfigPublic
    sonarr:       ServiceConfigPublic
    qbittorrent:  ServiceConfigPublic
    crossseed:    ServiceConfigPublic
    paths:        PathsConfig


class ServiceConfigPublic(BaseModel):
    url:     str
    enabled: bool
    # api_key, username, password intentionnellement exclus


# ── qBittorrent ───────────────────────────────────────────────────────────────

class QbitTorrent(BaseModel):
    hash:         str
    name:         str
    save_path:    str = ""
    content_path: str = ""
    size:         int = 0
    state:        str = ""
    tags:         str = ""
    category:     str = ""
    ratio:        float = 0.0
    uploaded:     int = 0
    downloaded:   int = 0
    upspeed:      int = 0
    dlspeed:      int = 0
    eta:          int = 0
    num_seeds:    int = 0
    num_leechs:   int = 0
    tracker:      str = ""
    added_on:     int = 0


# ── Radarr ────────────────────────────────────────────────────────────────────

class RadarrMovie(BaseModel):
    id:        int
    title:     str
    year:      int = 0
    imdb_id:   Optional[str] = None
    tmdb_id:   Optional[int] = None
    has_file:  bool = False
    file_path: Optional[str] = None
    file_size: int = 0
    title_slug: str = ""
    images:    list[dict] = Field(default_factory=list)


# ── Sonarr ────────────────────────────────────────────────────────────────────

class SonarrSeries(BaseModel):
    id:                 int
    title:              str
    year:               int = 0
    imdb_id:            Optional[str] = None
    tvdb_id:            Optional[int] = None
    path:               str = ""
    episode_file_count: int = 0
    size_on_disk:       int = 0
    title_slug:         str = ""
    images:             list[dict] = Field(default_factory=list)


class SonarrEpisodeFile(BaseModel):
    id:         int
    series_id:  int
    path:       str
    size:       int = 0
    season:     int = 0
    episode:    int = 0


# ── Scan result ───────────────────────────────────────────────────────────────

class MediaItem(BaseModel):
    """Résultat enrichi pour un média (film ou série)."""
    id:           str                       # "radarr_123" ou "sonarr_456"
    source:       MediaSource
    media_type:   MediaType
    title:        str
    year:         int = 0
    imdb_id:      Optional[str] = None
    tmdb_id:      Optional[int] = None
    tvdb_id:      Optional[int] = None
    poster_url:   Optional[str] = None

    # Fichier de référence (/media)
    media_file:   Optional[FileMetadata] = None

    # Classification
    seed_status:      SeedStatus = SeedStatus.NOT_SEEDING
    is_hardlinked:    bool = False
    is_cross_seeded:  bool = False
    is_duplicate:     bool = False

    # Fichiers trouvés dans /torrents et /crossseed
    torrents_files:   list[FileMetadata] = Field(default_factory=list)
    crossseed_files:  list[FileMetadata] = Field(default_factory=list)

    # Torrents qBit associés
    matched_torrents: list[QbitTorrent] = Field(default_factory=list)

    # Pour les séries : nombre de fichiers épisodes
    episode_file_count: int = 0


class ScanStatus(BaseModel):
    running:      bool = False
    last_scan:    Optional[int] = None   # Unix timestamp ms
    progress:     float = 0.0            # 0.0 → 1.0
    total_items:  int = 0
    scanned:      int = 0
    error:        Optional[str] = None


class GlobalStats(BaseModel):
    total:             int = 0
    seed_ok:           int = 0
    seed_no_cs:        int = 0
    seed_not_hardlink: int = 0
    seed_duplicate:    int = 0
    not_seeding:       int = 0


class ConnectionTestResult(BaseModel):
    service:   str
    success:   bool
    message:   str
    version:   Optional[str] = None


class UnmatchedTorrent(BaseModel):
    torrent:     QbitTorrent
    guessed_title: Optional[str] = None
    guessed_year:  Optional[int] = None
    imdb_id:       Optional[str] = None
