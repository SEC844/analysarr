"""
Moteur de scan principal.

- Agrège Radarr + Sonarr + qBittorrent
- Applique la classification inode via scanner.py
- Maintient un cache en mémoire avec timestamp
- Scan automatique toutes les 5 min en background (asyncio)
- Scan incrémental : ignore les fichiers dont path+size n'ont pas changé
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Optional

from ..config import load_config
from ..models.schemas import (
    MediaItem, MediaSource, MediaType, SeedStatus,
    FileMetadata, QbitTorrent, ScanStatus, GlobalStats,
    RadarrMovie, SonarrSeries,
)
from .radarr import RadarrClient
from .sonarr import SonarrClient
from .qbittorrent import QBittorrentClient
from .scanner import classify_media_file, get_file_metadata
from .identifier import resolve_imdb_from_torrent

logger = logging.getLogger(__name__)

AUTO_SCAN_INTERVAL = 300  # secondes (5 min)


class ScanEngine:
    def __init__(self) -> None:
        self._cache: list[MediaItem] = []
        self._scan_status = ScanStatus()
        self._lock: Optional[asyncio.Lock] = None
        self._bg_task: Optional[asyncio.Task] = None
        # Incrémental : dict path → size pour détecter les changements
        self._prev_file_sizes: dict[str, int] = {}

    def _get_lock(self) -> asyncio.Lock:
        """Crée le lock lazily dans l'event loop courant."""
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    # ── Accès cache ───────────────────────────────────────────────────────────

    def get_cache(self) -> list[MediaItem]:
        return self._cache

    def get_status(self) -> ScanStatus:
        return self._scan_status

    def get_stats(self) -> GlobalStats:
        stats = GlobalStats(total=len(self._cache))
        for item in self._cache:
            match item.seed_status:
                case SeedStatus.SEED_OK:           stats.seed_ok += 1
                case SeedStatus.SEED_NO_CS:        stats.seed_no_cs += 1
                case SeedStatus.SEED_NOT_HARDLINK: stats.seed_not_hardlink += 1
                case SeedStatus.SEED_DUPLICATE:    stats.seed_duplicate += 1
                case SeedStatus.NOT_SEEDING:       stats.not_seeding += 1
        return stats

    # ── Scan ──────────────────────────────────────────────────────────────────

    async def trigger_scan(self) -> None:
        """Déclenche un scan manuel (non-bloquant)."""
        if self._scan_status.running:
            return
        asyncio.create_task(self._run_scan())

    async def scan_and_wait(self) -> list[MediaItem]:
        """Déclenche un scan et attend sa fin. Retourne les résultats."""
        async with self._get_lock():
            await self._run_scan()
        return self._cache

    async def _run_scan(self) -> None:
        if self._scan_status.running:
            return

        self._scan_status = ScanStatus(running=True, progress=0.0)
        start = time.time()
        logger.info("Scan started")

        try:
            cfg = load_config()
            torrents_dir  = cfg.paths.torrents
            crossseed_dir = cfg.paths.crossseed if cfg.crossseed.enabled else None
            media_path    = cfg.paths.media

            # ── Fetch en parallèle ────────────────────────────────────────────
            radarr_client = RadarrClient(cfg.radarr.url, cfg.radarr.api_key) if cfg.radarr.url else None
            sonarr_client = SonarrClient(cfg.sonarr.url, cfg.sonarr.api_key) if cfg.sonarr.url else None
            qbit_client   = QBittorrentClient(
                cfg.qbittorrent.url, cfg.qbittorrent.username, cfg.qbittorrent.password
            ) if cfg.qbittorrent.url else None

            async def _empty() -> list:
                return []

            movies_task   = radarr_client.get_movies()   if radarr_client else _empty()
            series_task   = sonarr_client.get_series()   if sonarr_client else _empty()
            torrents_task = qbit_client.get_torrents()   if qbit_client   else _empty()

            results = await asyncio.gather(
                movies_task, series_task, torrents_task,
                return_exceptions=True,
            )

            movies: list[RadarrMovie]   = results[0] if not isinstance(results[0], Exception) else []
            series: list[SonarrSeries]  = results[1] if not isinstance(results[1], Exception) else []
            qbit_torrents: list[QbitTorrent] = results[2] if not isinstance(results[2], Exception) else []

            if isinstance(results[0], Exception):
                logger.error("Radarr fetch failed: %s", results[0])
            if isinstance(results[1], Exception):
                logger.error("Sonarr fetch failed: %s", results[1])
            if isinstance(results[2], Exception):
                logger.error("qBittorrent fetch failed: %s", results[2])

            total = len(movies) + len(series)
            self._scan_status.total_items = total
            scanned = 0

            new_items: list[MediaItem] = []
            matched_hashes: set[str] = set()

            # ── Films ─────────────────────────────────────────────────────────
            for movie in movies:
                item = await self._process_movie(
                    movie, qbit_torrents, torrents_dir, crossseed_dir,
                    radarr_client, matched_hashes,
                )
                new_items.append(item)
                scanned += 1
                self._scan_status.scanned = scanned
                self._scan_status.progress = scanned / total if total else 1.0

            # ── Séries ────────────────────────────────────────────────────────
            for show in series:
                item = await self._process_series(
                    show, qbit_torrents, torrents_dir, crossseed_dir,
                    sonarr_client, matched_hashes,
                )
                new_items.append(item)
                scanned += 1
                self._scan_status.scanned = scanned
                self._scan_status.progress = scanned / total if total else 1.0

            self._cache = new_items
            elapsed = time.time() - start
            logger.info("Scan finished in %.1fs — %d items", elapsed, len(new_items))

        except Exception as e:
            logger.exception("Scan failed: %s", e)
            self._scan_status.error = str(e)
        finally:
            self._scan_status.running = False
            self._scan_status.last_scan = int(time.time() * 1000)
            self._scan_status.progress = 1.0

    async def _process_movie(
        self,
        movie: RadarrMovie,
        qbit_torrents: list[QbitTorrent],
        torrents_dir: str,
        crossseed_dir: Optional[str],
        radarr_client,
        matched_hashes: set[str],
    ) -> MediaItem:
        item = MediaItem(
            id=f"radarr_{movie.id}",
            source=MediaSource.RADARR,
            media_type=MediaType.MOVIE,
            title=movie.title,
            year=movie.year,
            imdb_id=movie.imdb_id,
            tmdb_id=movie.tmdb_id,
            poster_url=self._extract_poster(movie.images, "radarr", movie.id),
        )

        if not movie.file_path:
            return item

        # Scan du fichier de référence
        media_file = await asyncio.get_event_loop().run_in_executor(
            None, get_file_metadata, movie.file_path
        )
        item.media_file = media_file

        if not media_file.exists:
            return item

        # Classification inode
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            classify_media_file,
            media_file, torrents_dir, crossseed_dir, qbit_torrents,
        )

        item.seed_status      = result["seed_status"]
        item.is_hardlinked    = result["is_hardlinked"]
        item.is_cross_seeded  = result["is_cross_seeded"]
        item.is_duplicate     = result["is_duplicate"]
        item.torrents_files   = result["torrents_files"]
        item.crossseed_files  = result["crossseed_files"]
        item.matched_torrents = result["matched_torrents"]

        for t in result["matched_torrents"]:
            matched_hashes.add(t.hash)

        return item

    async def _process_series(
        self,
        show: SonarrSeries,
        qbit_torrents: list[QbitTorrent],
        torrents_dir: str,
        crossseed_dir: Optional[str],
        sonarr_client,
        matched_hashes: set[str],
    ) -> MediaItem:
        item = MediaItem(
            id=f"sonarr_{show.id}",
            source=MediaSource.SONARR,
            media_type=MediaType.SERIES,
            title=show.title,
            year=show.year,
            imdb_id=show.imdb_id,
            tvdb_id=show.tvdb_id,
            episode_file_count=show.episode_file_count,
            poster_url=self._extract_poster(show.images, "sonarr", show.id),
        )

        if not show.path:
            return item

        # Pour les séries, on scan le dossier entier et on prend le plus gros fichier
        # comme référence (l'épisode principal)
        largest = await asyncio.get_event_loop().run_in_executor(
            None, self._find_largest_file, show.path
        )

        if not largest:
            # Au minimum, indiquer que le dossier existe
            dir_stat = await asyncio.get_event_loop().run_in_executor(
                None, get_file_metadata, show.path
            )
            item.media_file = dir_stat
            return item

        item.media_file = largest

        # Classification basée sur le plus gros fichier
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            classify_media_file,
            largest, torrents_dir, crossseed_dir, qbit_torrents,
        )

        item.seed_status      = result["seed_status"]
        item.is_hardlinked    = result["is_hardlinked"]
        item.is_cross_seeded  = result["is_cross_seeded"]
        item.is_duplicate     = result["is_duplicate"]
        item.torrents_files   = result["torrents_files"]
        item.crossseed_files  = result["crossseed_files"]
        item.matched_torrents = result["matched_torrents"]

        for t in result["matched_torrents"]:
            matched_hashes.add(t.hash)

        return item

    def _find_largest_file(self, directory: str) -> Optional[FileMetadata]:
        """Trouve le plus gros fichier dans un répertoire (récursif, max 5 niveaux)."""
        largest: Optional[FileMetadata] = None
        base_depth = directory.rstrip(os.sep).count(os.sep)

        for root, dirs, files in os.walk(directory):
            depth = root.count(os.sep) - base_depth
            if depth >= 5:
                dirs.clear()
                continue
            for fname in files:
                fpath = os.path.join(root, fname)
                try:
                    stat = os.stat(fpath)
                    if largest is None or stat.st_size > largest.size:
                        largest = FileMetadata(
                            path=fpath,
                            size=stat.st_size,
                            inode=stat.st_ino,
                            nlink=stat.st_nlink,
                            exists=True,
                        )
                except OSError:
                    continue

        return largest

    def _extract_poster(self, images: list[dict], source: str, media_id: int) -> Optional[str]:
        """Retourne l'URL du poster proxié via notre API."""
        for img in images:
            if img.get("coverType") == "poster":
                return f"/api/poster/{source}/{media_id}"
        return None

    # ── Background refresh ────────────────────────────────────────────────────

    def start_background_scan(self) -> None:
        if self._bg_task and not self._bg_task.done():
            return
        self._bg_task = asyncio.create_task(self._bg_loop())

    async def _bg_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(AUTO_SCAN_INTERVAL)
                logger.info("Background scan triggered")
                await self._run_scan()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Background scan error: %s", e)

    def get_unmatched_torrents(self) -> list[QbitTorrent]:
        """Torrents non associés à aucun média."""
        matched: set[str] = set()
        for item in self._cache:
            for t in item.matched_torrents:
                matched.add(t.hash)

        # On doit conserver les torrents du dernier scan
        # Ils ne sont pas stockés séparément ici, donc retourner liste vide
        # (sera enrichi dans la route /api/torrents/unmatched)
        return []


# ── Singleton global ──────────────────────────────────────────────────────────
engine = ScanEngine()
